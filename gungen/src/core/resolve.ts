// Turns an assembly file into placed parts (PROJECT.md §2, milestone 1).
//
// There is no solver yet. Parts are placed by walking connections outward
// from the root; a connection whose parts are both already placed closes a
// loop, and is only checked (by the loop-closure rule), never solved.

import type { Issue } from './issue.ts';
import {
  add,
  compose,
  cross,
  fromColumns,
  IDENTITY,
  invert,
  length,
  rotation,
  rotationAngle,
  rotX,
  rotY,
  scale,
  sub,
  type Transform,
} from './math.ts';
import type { Assembly, Connection, Domain, PartDef, PortDef } from './schema.ts';

/** A param's final value and where it came from. */
export interface ResolvedParam {
  readonly value: string;
  readonly source: 'set' | 'inherited' | 'default';
  /** For inherited values: the neighbour's param, as "part.param". */
  readonly from?: string;
}

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
  /** The params each valid part was built with. */
  readonly params: ReadonlyMap<string, Readonly<Record<string, ResolvedParam>>>;
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
/** The port ref at the other end of a connection, if ref is one of its ends. */
const otherEnd = (c: { readonly from: string; readonly to: string }, ref: string): string | undefined => {
  if (c.from === ref) {
    return c.to;
  }
  return c.to === ref ? c.from : undefined;
};

export const portFrame = (port: PortDef, slot = 0): Transform => ({
  r: fromColumns(port.normal, port.up, cross(port.normal, port.up)),
  t: add(port.pos, scale(port.up, slot * (port.slots?.pitch ?? 0))),
});

/** The `from` port's frame in the assembly, including slot and roll. */
const fromSideFrame = (rc: ResolvedConnection, fromPart: Transform): Transform =>
  compose(compose(fromPart, portFrame(rc.from.port, rc.conn.slot)), rotation(rotX(rc.conn.roll ?? 0)));

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
  if (!(a && b)) {
    return undefined;
  }
  const expected = compose(fromSideFrame(rc, a), FLIP);
  const actual = compose(b, portFrame(rc.to.port));
  return {
    distance: length(sub(expected.t, actual.t)),
    angle: rotationAngle(expected.r, actual.r),
  };
};

const splitRef = (ref: string): [string, string] | undefined => {
  const dot = ref.indexOf('.');
  if (dot <= 0 || dot === ref.length - 1) {
    return undefined;
  }
  return [ref.slice(0, dot), ref.slice(dot + 1)];
};

/**
 * Works out every part's params: set in the assembly, else read from a
 * neighbour (ParamSpec.from), else the default. Reading from neighbours only
 * needs the connection list, not placement, so it runs before parts are built.
 * Parts with an unknown family or a bad param are reported and left out.
 */
type ParamTable = Map<string, Record<string, ResolvedParam>>;
type ReportStructure = (message: string, parts?: string[]) => void;

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: predates the complexity limit; split it up when next changed
const resolveParams = (assembly: Assembly, domain: Domain, structure: ReportStructure): ParamTable => {
  const result: ParamTable = new Map();
  const pending: { part: string; name: string }[] = [];

  for (const [id, inst] of Object.entries(assembly.parts)) {
    const family = domain.families[inst.family];
    if (!family) {
      structure(`Part "${id}" uses unknown family "${inst.family}".`, [id]);
      continue;
    }
    let ok = true;
    for (const [name, value] of Object.entries(inst.params ?? {})) {
      const spec = family.params[name];
      if (!spec) {
        structure(`Part "${id}" (${family.name}) has no parameter "${name}".`, [id]);
        ok = false;
      } else if (!spec.values.includes(value)) {
        structure(`Part "${id}": ${name}="${value}" is not one of ${spec.values.join(', ')}.`, [id]);
        ok = false;
      }
    }
    if (!ok) {
      continue;
    }
    const values: Record<string, ResolvedParam> = {};
    for (const [name, spec] of Object.entries(family.params)) {
      const set = inst.params?.[name];
      if (set !== undefined) {
        values[name] = { value: set, source: 'set' };
      } else if (spec.from?.length) {
        pending.push({ part: id, name });
      } else {
        values[name] = { value: spec.default, source: 'default' };
      }
    }
    result.set(id, values);
  }

  // The parts connected at a given port, from the raw connection list.
  const neighbours = (part: string, port: string): string[] => {
    const ref = `${part}.${port}`;
    return assembly.connections.flatMap((c) => {
      const other = otherEnd(c, ref);
      const split = other === undefined ? undefined : splitRef(other);
      return split ? [split[0]] : [];
    });
  };

  const setDefault = (part: string, name: string): void => {
    const spec = domain.families[assembly.parts[part]!.family]!.params[name]!;
    result.get(part)![name] = { value: spec.default, source: 'default' };
  };

  // Resolve inherited params until nothing changes; chains resolve in any order.
  while (pending.length > 0) {
    let progress = false;
    for (let i = pending.length - 1; i >= 0; i--) {
      const { part, name } = pending[i]!;
      const spec = domain.families[assembly.parts[part]!.family]!.params[name]!;
      const values = result.get(part)!;
      for (const src of spec.from ?? []) {
        const hit = neighbours(part, src.port)
          .map((n) => ({ n, v: result.get(n)?.[src.param] }))
          .find((x) => x.v !== undefined);
        if (!hit) {
          continue;
        }
        const from = `${hit.n}.${src.param}`;
        if (spec.values.includes(hit.v!.value)) {
          values[name] = { value: hit.v!.value, source: 'inherited', from };
        } else {
          structure(
            `Part "${part}": ${name} would come from ${from}="${hit.v!.value}", which is not one of ${spec.values.join(', ')}.`,
            [part],
          );
          values[name] = { value: spec.default, source: 'default' };
        }
        pending.splice(i, 1);
        progress = true;
        break;
      }
    }
    if (progress) {
      continue;
    }
    // Stuck. Params with no connected source take their default, which may
    // unblock params reading from them. If every source is connected, the
    // rest wait on each other in a cycle: default them all.
    const unconnected = pending.filter(({ part, name }) => {
      const spec = domain.families[assembly.parts[part]!.family]!.params[name]!;
      return !(spec.from ?? []).some((src) => neighbours(part, src.port).some((n) => result.has(n)));
    });
    for (const p of unconnected.length > 0 ? unconnected : [...pending]) {
      setDefault(p.part, p.name);
      pending.splice(pending.indexOf(p), 1);
    }
  }
  return result;
};

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: predates the complexity limit; split it up when next changed
export const resolve = (assembly: Assembly, domain: Domain): Resolved => {
  const issues: Issue[] = [];
  const structure = (message: string, parts: string[] = []): void => {
    issues.push({ rule: 'structure', message, parts });
  };

  const params = resolveParams(assembly, domain, structure);

  // Build every part instance from its family.
  const defs = new Map<string, PartDef>();
  for (const [id, resolved] of params) {
    const family = domain.families[assembly.parts[id]!.family]!;
    const values = Object.fromEntries(Object.entries(resolved).map(([k, v]) => [k, v.value]));
    defs.set(id, family.build(values));
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
    if (!def) {
      return undefined; // already reported above
    }
    const port = def.ports.find((p) => p.id === portId);
    if (!port) {
      structure(`Connection #${index}: part "${part}" (${def.family}) has no port "${portId}".`, [part]);
      return undefined;
    }
    return { part, port };
  };

  const pending: Omit<ResolvedConnection, 'role'>[] = [];
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: predates the complexity limit; split it up when next changed
  assembly.connections.forEach((conn, index) => {
    const from = lookup(conn.from, index);
    const to = lookup(conn.to, index);
    if (!(from && to)) {
      return;
    }
    if (from.part === to.part) {
      structure(`Connection #${index} connects "${from.part}" to itself.`, [from.part]);
      return;
    }
    if (conn.slot !== undefined) {
      const { slots } = from.port;
      if (!slots) {
        structure(`Connection #${index}: ${conn.from} has no slots.`, [from.part]);
        return;
      }
      if (!Number.isInteger(conn.slot) || conn.slot < 0 || conn.slot >= slots.count) {
        structure(`Connection #${index}: slot ${conn.slot} is outside ${conn.from} (0–${slots.count - 1}).`, [
          from.part,
        ]);
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
        if (roles.has(c.index)) {
          continue;
        }
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
  return { assembly, domain, defs, params, placed, connections, issues };
};
