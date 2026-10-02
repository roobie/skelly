// Feasibility rules (PROJECT.md §1). Each rule checks a resolved assembly and
// returns readable issues; none of them simulates anything.

import { INTERFACE_TOLERANCE_BY_MOUNT, MAIN_AXIS, TOLERANCE } from './conventions.ts';
import {
  distanceWorld,
  lowerBoundDistanceWorld,
  penetrationWorld,
  type WorldSolid,
  worldBox,
  worldSolid,
} from './geometry.ts';
import type { Issue } from './issue.ts';
import { angleBetween, applyDir, applyPoint, cross, length, sub } from './math.ts';
import { connectionMismatch, type Resolved } from './resolve.ts';
import type { Rule } from './schema.ts';

const TRAILING_ZEROS = /\.?0+$/;
const fmt = (n: number): string => n.toFixed(2).replace(TRAILING_ZEROS, '');
const qualified = (part: string, port: string): string => `${part}.${port}`;
const label = (r: Resolved, part: string): string => {
  const family = r.defs.get(part)?.family;
  return family === part ? part : `${part} (${family})`;
};

/** Mount type, gender and size agree; each port (or slot) is used at most once. */
export const portCompat: Rule = {
  id: 'port-compat',
  title: 'Ports are compatible',
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: predates the complexity limit; split it up when next changed
  check(r) {
    const issues: Issue[] = [];
    const used = new Map<string, number>();
    for (const rc of r.connections) {
      const { from, to } = rc;
      const a = from.port;
      const b = to.port;
      const ports = [rc.conn.from, rc.conn.to];
      const parts = [from.part, to.part];
      if (a.mount !== b.mount) {
        issues.push({
          rule: 'port-compat',
          message: `${rc.conn.from} is a ${a.mount} mount but ${rc.conn.to} is a ${b.mount} mount.`,
          parts,
          ports,
        });
      } else if (a.gender === b.gender) {
        issues.push({
          rule: 'port-compat',
          message: `${rc.conn.from} and ${rc.conn.to} are both ${a.gender} ${a.mount} mounts.`,
          parts,
          ports,
        });
      }
      if (a.size !== undefined && b.size !== undefined && a.size !== b.size) {
        issues.push({
          rule: 'port-compat',
          message: `Size mismatch: ${rc.conn.from} is size ${a.size} but ${rc.conn.to} is size ${b.size}.`,
          parts,
          ports,
        });
      }
      const keys = [rc.conn.slot === undefined ? rc.conn.from : `${rc.conn.from}[${rc.conn.slot}]`, rc.conn.to];
      for (const key of keys) {
        const prev = used.get(key);
        if (prev === undefined) {
          used.set(key, rc.index);
        } else {
          issues.push({
            rule: 'port-compat',
            message: `${key} is used by both connection #${prev} and #${rc.index}.`,
            parts,
            ports,
          });
        }
      }
    }
    return issues;
  },
};

/** Axes the domain cares about line up with the main axis. */
export const axisAlignment: Rule = {
  id: 'axis-alignment',
  title: 'Axes line up with the main axis',
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: predates the complexity limit; split it up when next changed
  check(r) {
    const issues: Issue[] = [];
    for (const [part, t] of r.placed) {
      for (const axis of r.defs.get(part)!.axes) {
        const rule = r.domain.axisRules.find((a) => a.kind === axis.kind);
        if (!rule) {
          continue;
        }
        const dir = applyDir(t, axis.dir);
        const angle = angleBetween(dir, MAIN_AXIS.dir);
        if (angle > TOLERANCE.angle) {
          issues.push({
            rule: 'axis-alignment',
            message: `The ${axis.kind} axis of ${label(r, part)} is ${fmt(angle)}° off the main axis.`,
            parts: [part],
          });
          continue;
        }
        if (rule.mode === 'collinear') {
          const offset = length(cross(sub(applyPoint(t, axis.origin), MAIN_AXIS.origin), MAIN_AXIS.dir));
          if (offset > TOLERANCE.position) {
            issues.push({
              rule: 'axis-alignment',
              message: `The ${axis.kind} axis of ${label(r, part)} is ${fmt(offset)}u off the main axis.`,
              parts: [part],
            });
          }
        }
      }
    }
    return issues;
  },
};

const connectionAllowances = (r: Resolved): Map<string, number> => {
  const allowances = new Map<string, number>();
  for (const rc of r.connections) {
    const pair = [rc.from.part, rc.to.part].sort().join('|');
    const allowance = INTERFACE_TOLERANCE_BY_MOUNT[rc.from.port.mount] ?? TOLERANCE.interface;
    allowances.set(pair, Math.max(allowances.get(pair) ?? 0, allowance));
  }
  return allowances;
};

/** Transform every placed solid once per rule check. */
const placedSolids = (r: Resolved): Map<string, WorldSolid[]> => {
  const placed = new Map<string, WorldSolid[]>();
  for (const [part, transform] of r.placed) {
    placed.set(
      part,
      r.defs.get(part)!.solids.map((solid) => worldSolid(transform, solid)),
    );
  }
  return placed;
};

/** Worst penetration between any solid of two parts. */
const worstPenetration = (a: readonly WorldSolid[], b: readonly WorldSolid[], cutoff: number): number => {
  let worst = Number.NEGATIVE_INFINITY;
  for (const sa of a) {
    for (const sb of b) {
      if (lowerBoundDistanceWorld(sa, sb) > cutoff) {
        continue;
      }
      worst = Math.max(worst, penetrationWorld(sa, sb));
    }
  }
  return worst;
};

/** No two parts interpenetrate. Directly connected parts may nest a little. */
export const solidOverlap: Rule = {
  id: 'solid-overlap',
  title: 'Solids do not overlap',
  check(r) {
    const issues: Issue[] = [];
    const allowances = connectionAllowances(r);
    const solids = placedSolids(r);
    const ids = [...r.placed.keys()];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i]!;
        const b = ids[j]!;
        const allowed = allowances.get([a, b].sort().join('|')) ?? TOLERANCE.contact;
        const depth = worstPenetration(solids.get(a)!, solids.get(b)!, allowed + TOLERANCE.contact);
        if (depth > allowed + TOLERANCE.contact) {
          issues.push({
            rule: 'solid-overlap',
            message: `${label(r, a)} and ${label(r, b)} overlap by ${fmt(depth)}u (allowed: ${fmt(allowed)}u).`,
            parts: [a, b],
          });
        }
      }
    }
    return issues;
  },
};

/** Solids on the two parts of every connection touch or lie within tolerance. */
export const connectionContact: Rule = {
  id: 'connection-contact',
  title: 'Connected parts touch',
  check(r) {
    const issues: Issue[] = [];
    const solids = placedSolids(r);
    // One grid step is the most two connected solids may be apart.
    const maxGap = r.domain.units.grid;
    for (const rc of r.connections) {
      const a = solids.get(rc.from.part);
      const b = solids.get(rc.to.part);
      if (!(a && b)) {
        continue;
      }
      const candidates = a
        .flatMap((sa) => b.map((sb) => ({ a: sa, b: sb, lowerBound: lowerBoundDistanceWorld(sa, sb) })))
        .sort((left, right) => left.lowerBound - right.lowerBound);
      let gap = Number.POSITIVE_INFINITY;
      for (const pair of candidates) {
        if (pair.lowerBound > gap) {
          break;
        }
        gap = Math.min(gap, distanceWorld(pair.a, pair.b));
        if (gap <= maxGap) {
          break;
        }
      }
      if (gap > maxGap) {
        issues.push({
          rule: 'connection-contact',
          message: `${rc.conn.from} and ${rc.conn.to} have a ${fmt(gap)}u gap between their solids (maximum: ${fmt(maxGap)}u).`,
          parts: [rc.from.part, rc.to.part],
          ports: [rc.conn.from, rc.conn.to],
        });
      }
    }
    return issues;
  },
};

/** No part occupies another part's keep-out volume. */
export const keepOut: Rule = {
  id: 'keep-out',
  title: 'Keep-out volumes are empty',
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: predates the complexity limit; split it up when next changed
  check(r) {
    const issues: Issue[] = [];
    const solids = placedSolids(r);
    for (const [owner, ownerT] of r.placed) {
      for (const ko of r.defs.get(owner)!.keepOuts) {
        const koShape =
          ko.profile && ko.z
            ? worldSolid(ownerT, {
                id: ko.id,
                kind: 'extruded-polygon',
                profile: ko.profile,
                z: ko.z,
                ...(ko.axis ? { axis: ko.axis } : {}),
              })
            : worldBox(ownerT, ko.box);
        const allowed = new Set([owner]);
        const allowedFamilies = new Set(ko.allowFamilies ?? []);
        if (ko.allowPort) {
          for (const rc of r.connections) {
            if (rc.from.part === owner && rc.from.port.id === ko.allowPort) {
              allowed.add(rc.to.part);
            }
            if (rc.to.part === owner && rc.to.port.id === ko.allowPort) {
              allowed.add(rc.from.part);
            }
          }
        }
        for (const other of r.placed.keys()) {
          if (allowed.has(other) || allowedFamilies.has(r.defs.get(other)!.family)) {
            continue;
          }
          let worst = Number.NEGATIVE_INFINITY;
          for (const s of solids.get(other)!) {
            if (lowerBoundDistanceWorld(koShape, s) > TOLERANCE.contact) {
              continue;
            }
            worst = Math.max(worst, penetrationWorld(koShape, s));
          }
          if (worst > TOLERANCE.contact) {
            issues.push({
              rule: 'keep-out',
              message: `${label(r, other)} intrudes ${fmt(worst)}u into the ${ko.kind} volume of ${label(r, owner)}.`,
              parts: [other, owner],
              keepOut: { part: owner, id: ko.id },
            });
          }
        }
      }
    }
    return issues;
  },
};

/** Every required port has something attached. */
export const requiredPorts: Rule = {
  id: 'required-ports',
  title: 'Required ports are filled',
  check(r) {
    const issues: Issue[] = [];
    const filled = new Set<string>();
    for (const rc of r.connections) {
      filled.add(qualified(rc.from.part, rc.from.port.id));
      filled.add(qualified(rc.to.part, rc.to.port.id));
    }
    for (const [part, def] of r.defs) {
      for (const port of def.ports) {
        const q = qualified(part, port.id);
        if (port.required && !filled.has(q)) {
          issues.push({
            rule: 'required-ports',
            message: `${q} (${port.mount} mount on ${def.family}) is required but empty.`,
            parts: [part],
            ports: [q],
          });
        }
      }
    }
    return issues;
  },
};

/** Connections that close a loop actually meet. */
export const loopClosure: Rule = {
  id: 'loop-closure',
  title: 'Loops close',
  check(r) {
    const issues: Issue[] = [];
    for (const rc of r.connections) {
      if (rc.role !== 'loop') {
        continue;
      }
      const m = connectionMismatch(rc, r.placed)!;
      if (m.distance > TOLERANCE.position || m.angle > TOLERANCE.angle) {
        issues.push({
          rule: 'loop-closure',
          message: `Loop doesn't close: ${rc.conn.from} and ${rc.conn.to} are ${fmt(m.distance)}u and ${fmt(m.angle)}° apart.`,
          parts: [rc.from.part, rc.to.part],
          ports: [rc.conn.from, rc.conn.to],
        });
      }
    }
    return issues;
  },
};

export const CORE_RULES: readonly Rule[] = [
  portCompat,
  axisAlignment,
  solidOverlap,
  connectionContact,
  keepOut,
  requiredPorts,
  loopClosure,
];
