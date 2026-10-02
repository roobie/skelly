import { type ConvexPolyhedron, obbPolyhedron, penetrationWorld, worldSolid } from '../core/geometry.ts';
import type { Issue } from '../core/issue.ts';
import { add, compose, IDENTITY, invert, mulMV, rotX } from '../core/math.ts';
import { rotationSweepClear, translationSweepClear } from '../core/motionSweep.ts';
import type { Resolved } from '../core/resolve.ts';
import type { Rule, Solid } from '../core/schema.ts';
import { BOLT_RECEIVER, cartridgeLoadingPath } from './boltReceiver.ts';

const connectedPart = (r: Resolved, part: string, port: string): string | undefined => {
  for (const c of r.connections) {
    if (c.from.part === part && c.from.port.id === port) {
      return c.to.part;
    }
    if (c.to.part === part && c.to.port.id === port) {
      return c.from.part;
    }
  }
  return undefined;
};
const movingParts = (r: Resolved, owner: string): string[] => {
  const carrier = connectedPart(r, owner, 'bolt-carrier');
  const arm = carrier && connectedPart(r, carrier, 'handle');
  const knob = arm && connectedPart(r, arm, 'tip');
  return [carrier, arm, knob].filter((part): part is string => typeof part === 'string' && r.placed.has(part));
};
const localPoly = (r: Resolved, owner: string, part: string, solid: Solid): ConvexPolyhedron => {
  const shape = worldSolid(compose(invert(r.placed.get(owner)!), r.placed.get(part)!), solid);
  return 'vertices' in shape ? shape : obbPolyhedron(shape);
};

export const boltReceiverMotionClearance: Rule = {
  id: 'bolt-receiver-motion',
  title: 'Tubular receiver clears the entire bolt lift followed by pull',
  check(r) {
    const issues: Issue[] = [];
    for (const [owner] of r.defs) {
      if (r.assembly.parts[owner]?.family !== 'bolt-receiver' || !r.placed.has(owner)) {
        continue;
      }
      const moving = movingParts(r, owner);
      const fixed = [...r.defs]
        .filter(([part]) => r.placed.has(part) && !moving.includes(part))
        .flatMap(([part, d]) => d.solids.map((solid) => ({ part, solid, poly: localPoly(r, owner, part, solid) })));
      for (const part of moving) {
        const collision = r.defs.get(part)!.solids.some((solid) => {
          const start = localPoly(r, owner, part, solid);
          const lifted = { ...start, vertices: start.vertices.map((v) => mulMV(rotX(-BOLT_RECEIVER.liftDegrees), v)) };
          return fixed.some(
            (target) =>
              !(
                rotationSweepClear(start, target.poly, [-BOLT_RECEIVER.liftDegrees, 0]) &&
                translationSweepClear(lifted, target.poly, [-BOLT_RECEIVER.travel, 0, 0])
              ),
          );
        });
        if (collision) {
          issues.push({
            rule: this.id,
            parts: [owner, part],
            message: `${part} does not clear the complete ${BOLT_RECEIVER.liftDegrees}° unlock arc and ${BOLT_RECEIVER.travel}u rearward pull of ${owner}.`,
          });
        }
      }
    }
    return issues;
  },
};

const openActionLoadingIssues = (
  r: Resolved,
  owner: string,
  moving: readonly string[],
  path: Extract<Solid, { kind: 'box' }>,
): Issue[] => {
  const volume = worldSolid(IDENTITY, path);
  return moving.flatMap((part) => {
    const obstructs = r.defs.get(part)!.solids.some((solid) => {
      const start = localPoly(r, owner, part, solid);
      const opened = {
        ...start,
        vertices: start.vertices.map((v) =>
          add(mulMV(rotX(-BOLT_RECEIVER.liftDegrees), v), [-BOLT_RECEIVER.travel, 0, 0]),
        ),
      };
      return penetrationWorld(volume, opened) > 1e-6;
    });
    return obstructs
      ? [
          {
            rule: 'cartridge-loading-clearance',
            parts: [owner, part],
            message: `${part} still occupies ${owner}'s round path after full unlock and retraction.`,
            keepOut: { part: owner, id: path.id },
          },
        ]
      : [];
  });
};

export const boltReceiverLoadingClearance: Rule = {
  id: 'cartridge-loading-clearance',
  title: 'The reference round has a clear right-side path through the actual tube and optic solids',
  check(r) {
    const issues: Issue[] = [];
    for (const [owner] of r.defs) {
      if (r.assembly.parts[owner]?.family !== 'bolt-receiver' || !r.placed.has(owner)) {
        continue;
      }
      const path = cartridgeLoadingPath();
      const volume = worldSolid(r.placed.get(owner)!, path);
      const moving = movingParts(r, owner);
      issues.push(...openActionLoadingIssues(r, owner, moving, path));
      for (const [part, def] of r.defs) {
        if (!r.placed.has(part) || moving.includes(part)) {
          continue;
        }
        if (def.solids.some((solid) => penetrationWorld(volume, worldSolid(r.placed.get(part)!, solid)) > 1e-6)) {
          issues.push({
            rule: this.id,
            parts: [owner, part],
            message: `${part} blocks ${owner}'s cartridge-derived right-side loading path; the bolt must first be fully retracted.`,
            keepOut: { part: owner, id: path.id },
          });
        }
      }
    }
    return issues;
  },
};
