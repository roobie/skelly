// Turns an assembly file into placed parts (PROJECT.md §2, milestone 1).
//
// There is no solver yet. Parts are placed by walking connections outward
// from the root; a connection whose parts are both already placed closes a
// loop, and is only checked (by the loop-closure rule), never solved.

import type { Issue } from './issue.ts';
import {
  IDENTITY,
  type Transform,
  add,
  compose,
  cross,
  fromColumns,
  invert,
  rotX,
  rotY,
  rotation,
  rotationAngle,
  length,
  scale,
  sub,
} from './math.ts';
import type { Assembly, Connection, Domain, PartDef, PortDef } from './schema.ts';

export interface PortRef {
  readonly part: string;
  readonly port: PortDef;
}

export interface ResolvedConnection {
  readonly index: number;
  readonly conn: Connection;
  readonly from: PortRef;
  readonly to: PortRef;
  /** tree: placed a part. loop: both parts were already placed. */
  readonly role: 'tree' | 'loop' | 'unplaced';
}

export interface Resolved {
  readonly assembly: Assembly;
  readonly domain: Domain;
  /** Built definitions of every valid part instance. */
  readonly defs: ReadonlyMap<string, PartDef>;
  /** Transforms of the parts that could be placed. */
  readonly placed: ReadonlyMap<string, Transform>;
  /** Connections that are structurally valid. */
  readonly connections: readonly ResolvedConnection[];
  /** Structure issues. */
  readonly issues: readonly Issue[];
}

/** 180° about the port's up axis: turns a port frame to face its mate. */
const FLIP = rotation(rotY(180));

/** A port's frame in its part's local frame, at the given slot. */
export const portFrame = (port: PortDef, slot = 0): Transform => ({
  r: fromColumns(port.normal, port.up, cross(port.normal, port.up)),
  t: add(port.pos, scale(port.up, slot * (port.slots?.pitch ?? 0))),
});

/** The `from` port's frame in the assembly, including slot and roll. */
const fromSideFrame = (rc: ResolvedConnection, fromPart: Transform): Transform =>
  compose(
    compose(fromPart, portFrame(rc.from.port, rc.conn.slot)),
    rotation(rotX(rc.conn.roll ?? 0)),
  );

const placeTo = (rc: ResolvedConnection, fromPart: Transform): Transform =>
  compose(compose(fromSideFrame(rc, fromPart), FLIP), invert(portFrame(rc.to.port)));

const placeFrom = (rc: ResolvedConnection, toPart: Transform): Transform => {
  const fromSide = compose(compose(toPart, portFrame(rc.to.port)), FLIP);
  return compose(
    compose(fromSide, rotation(rotX(-(rc.conn.roll ?? 0)))),
    invert(portFrame(rc.from.port, rc.conn.slot)),
  );
};

/** How far a connection is from being mated, given where both parts are. */
export const connectionMismatch = (
  rc: ResolvedConnection,
  placed: ReadonlyMap<string, Transform>,
): { distance: number; angle: number } | undefined => {
  const a = placed.get(rc.from.part);
  const b = placed.get(rc.to.part);
  if (!a || !b) return undefined;
  const expected = compose(fromSideFrame(rc, a), FLIP);
  const actual = compose(b, portFrame(rc.to.port));
  return {
    distance: length(sub(expected.t, actual.t)),
    angle: rotationAngle(expected.r, actual.r),
  };
};

const splitRef = (ref: string): [string, string] | undefined => {
  const dot = ref.indexOf('.');
  if (dot <= 0 || dot === ref.length - 1) return undefined;
  return [ref.slice(0, dot), ref.slice(dot + 1)];
};

export const resolve = (assembly: Assembly, domain: Domain): Resolved => {
  const issues: Issue[] = [];
  const structure = (message: string, parts: string[] = []): void => {
    issues.push({ rule: 'structure', message, parts });
  };

  // Build every part instance from its family.
  const defs = new Map<string, PartDef>();
  for (const [id, inst] of Object.entries(assembly.parts)) {
    const family = domain.families[inst.family];
    if (!family) {
      structure(`Part "${id}" uses unknown family "${inst.family}".`, [id]);
      continue;
    }
    const params: Record<string, string> = {};
    let ok = true;
    for (const [name, spec] of Object.entries(family.params)) params[name] = spec.default;
    for (const [name, value] of Object.entries(inst.params ?? {})) {
      const spec = family.params[name];
      if (!spec) {
        structure(`Part "${id}" (${family.name}) has no parameter "${name}".`, [id]);
        ok = false;
      } else if (!spec.values.includes(value)) {
        structure(
          `Part "${id}": ${name}="${value}" is not one of ${spec.values.join(', ')}.`,
          [id],
        );
        ok = false;
      } else {
        params[name] = value;
      }
    }
    if (ok) defs.set(id, family.build(params));
  }

  // Check each connection refers to real parts and ports.
  const lookup = (ref: string, index: number): PortRef | undefined => {
    const split = splitRef(ref);
    if (!split) {
      structure(`Connection #${index}: "${ref}" is not of the form "part.port".`);
      return undefined;
    }
    const [part, portId] = split;
    if (!(part in assembly.parts)) {
      structure(`Connection #${index}: no part "${part}".`);
      return undefined;
    }
    const def = defs.get(part);
    if (!def) return undefined; // already reported above
    const port = def.ports.find((p) => p.id === portId);
    if (!port) {
      structure(
        `Connection #${index}: part "${part}" (${def.family}) has no port "${portId}".`,
        [part],
      );
      return undefined;
    }
    return { part, port };
  };

  const pending: Omit<ResolvedConnection, 'role'>[] = [];
  assembly.connections.forEach((conn, index) => {
    const from = lookup(conn.from, index);
    const to = lookup(conn.to, index);
    if (!from || !to) return;
    if (from.part === to.part) {
      structure(`Connection #${index} connects "${from.part}" to itself.`, [from.part]);
      return;
    }
    if (conn.slot !== undefined) {
      const slots = from.port.slots;
      if (!slots) {
        structure(`Connection #${index}: ${conn.from} has no slots.`, [from.part]);
        return;
      }
      if (!Number.isInteger(conn.slot) || conn.slot < 0 || conn.slot >= slots.count) {
        structure(
          `Connection #${index}: slot ${conn.slot} is outside ${conn.from} (0–${slots.count - 1}).`,
          [from.part],
        );
        return;
      }
    }
    if (conn.roll !== undefined && conn.roll % 90 !== 0) {
      structure(`Connection #${index}: roll ${conn.roll} is not a multiple of 90.`, [from.part]);
      return;
    }
    pending.push({ index, conn, from, to });
  });

  // Place parts by walking out from the root.
  const placed = new Map<string, Transform>();
  const roles = new Map<number, ResolvedConnection['role']>();
  if (!(assembly.root in assembly.parts)) {
    structure(`Root "${assembly.root}" is not one of the parts.`);
  } else if (defs.has(assembly.root)) {
    placed.set(assembly.root, IDENTITY);
    let progress = true;
    while (progress) {
      progress = false;
      for (const c of pending) {
        if (roles.has(c.index)) continue;
        const a = placed.get(c.from.part);
        const b = placed.get(c.to.part);
        const rc = { ...c, role: 'tree' as const };
        if (a && b) {
          roles.set(c.index, 'loop');
        } else if (a) {
          placed.set(c.to.part, placeTo(rc, a));
          roles.set(c.index, 'tree');
          progress = true;
        } else if (b) {
          placed.set(c.from.part, placeFrom(rc, b));
          roles.set(c.index, 'tree');
          progress = true;
        }
      }
    }
  }

  const connections = pending.map((c) => ({ ...c, role: roles.get(c.index) ?? 'unplaced' }));
  return { assembly, domain, defs, placed, connections, issues };
};
