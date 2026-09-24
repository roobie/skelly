// Feasibility rules (PROJECT.md §1). Each rule checks a resolved assembly and
// returns readable issues; none of them simulates anything.

import { MAIN_AXIS, TOLERANCE } from './conventions.ts';
import { penetration, worldBox } from './geometry.ts';
import type { Issue } from './issue.ts';
import { angleBetween, applyDir, applyPoint, cross, length, sub } from './math.ts';
import { type Resolved, connectionMismatch } from './resolve.ts';
import type { Rule } from './schema.ts';

const fmt = (n: number): string => n.toFixed(2).replace(/\.?0+$/, '');
const qualified = (part: string, port: string): string => `${part}.${port}`;
const label = (r: Resolved, part: string): string => {
  const family = r.defs.get(part)?.family;
  return family === part ? part : `${part} (${family})`;
};

/** Mount type, gender and size agree; each port (or slot) is used at most once. */
export const portCompat: Rule = {
  id: 'port-compat',
  title: 'Ports are compatible',
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
      const keys = [
        rc.conn.slot === undefined ? rc.conn.from : `${rc.conn.from}[${rc.conn.slot}]`,
        rc.conn.to,
      ];
      for (const key of keys) {
        const prev = used.get(key);
        if (prev !== undefined) {
          issues.push({
            rule: 'port-compat',
            message: `${key} is used by both connection #${prev} and #${rc.index}.`,
            parts,
            ports,
          });
        } else {
          used.set(key, rc.index);
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
  check(r) {
    const issues: Issue[] = [];
    for (const [part, t] of r.placed) {
      for (const axis of r.defs.get(part)!.axes) {
        const rule = r.domain.axisRules.find((a) => a.kind === axis.kind);
        if (!rule) continue;
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

const connectedPairs = (r: Resolved): Set<string> => {
  const pairs = new Set<string>();
  for (const rc of r.connections) {
    pairs.add(`${rc.from.part}|${rc.to.part}`);
    pairs.add(`${rc.to.part}|${rc.from.part}`);
  }
  return pairs;
};

/** Worst penetration between any solid of part a and any solid of part b. */
const worstPenetration = (r: Resolved, a: string, b: string): number => {
  const ta = r.placed.get(a)!;
  const tb = r.placed.get(b)!;
  let worst = -Infinity;
  for (const sa of r.defs.get(a)!.solids) {
    for (const sb of r.defs.get(b)!.solids) {
      worst = Math.max(worst, penetration(worldBox(ta, sa.box), worldBox(tb, sb.box)));
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
    const connected = connectedPairs(r);
    const ids = [...r.placed.keys()];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i]!;
        const b = ids[j]!;
        const allowed = connected.has(`${a}|${b}`) ? TOLERANCE.interface : TOLERANCE.contact;
        const depth = worstPenetration(r, a, b);
        if (depth > allowed) {
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

/** No part occupies another part's keep-out volume. */
export const keepOut: Rule = {
  id: 'keep-out',
  title: 'Keep-out volumes are empty',
  check(r) {
    const issues: Issue[] = [];
    for (const [owner, ownerT] of r.placed) {
      for (const ko of r.defs.get(owner)!.keepOuts) {
        const koBox = worldBox(ownerT, ko.box);
        const allowed = new Set([owner]);
        if (ko.allowPort) {
          for (const rc of r.connections) {
            if (rc.from.part === owner && rc.from.port.id === ko.allowPort) allowed.add(rc.to.part);
            if (rc.to.part === owner && rc.to.port.id === ko.allowPort) allowed.add(rc.from.part);
          }
        }
        for (const [other, otherT] of r.placed) {
          if (allowed.has(other)) continue;
          let worst = -Infinity;
          for (const s of r.defs.get(other)!.solids) {
            worst = Math.max(worst, penetration(koBox, worldBox(otherT, s.box)));
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
      if (rc.role !== 'loop') continue;
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
  keepOut,
  requiredPorts,
  loopClosure,
];
