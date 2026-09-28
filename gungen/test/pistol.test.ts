import { describe, expect, it } from 'vitest';
import { distanceWorld, penetrationWorld, worldSolid } from '../src/core/geometry.ts';
import type { Solid } from '../src/core/schema.ts';
import { validate } from '../src/core/validate.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { loadFixture } from './helpers.ts';

const assembly = loadFixture('archetype-pistol');
const report = validate(assembly, gunDomain);
const maxLocalX = (solids: readonly Solid[]): number =>
  Math.max(
    ...solids.map((solid) =>
      solid.kind === 'box' ? solid.box.center[0] + solid.box.half[0] : Math.max(...solid.profile.map(([x]) => x)),
    ),
  );

describe('pistol model', () => {
  it('seats the barrel inside the hollow slide without overlap and limits the crown to 1u', () => {
    expect(report.ok).toBe(true);
    const { resolved } = report;
    const slide = resolved.defs.get('slide')!;
    const barrel = resolved.defs.get('barrel')!;
    const slideTransform = resolved.placed.get('slide')!;
    const barrelTransform = resolved.placed.get('barrel')!;
    const slideBarrelGaps = barrel.solids.flatMap((barrelSolid) =>
      slide.solids.map((slideSolid) =>
        distanceWorld(worldSolid(barrelTransform, barrelSolid), worldSolid(slideTransform, slideSolid)),
      ),
    );
    const overlaps = barrel.solids.flatMap((barrelSolid) =>
      slide.solids.map((slideSolid) =>
        penetrationWorld(worldSolid(barrelTransform, barrelSolid), worldSolid(slideTransform, slideSolid)),
      ),
    );

    expect(slideTransform.t[1]).toBeCloseTo(-1.5);
    expect(barrelTransform.t[1]).toBeCloseTo(0);
    expect(Math.min(...slideBarrelGaps)).toBeCloseTo(0);
    expect(overlaps.every((depth) => depth <= 1e-8)).toBe(true);
    expect(resolved.connections.find(({ conn }) => conn.from === 'frame.barrel')?.role).toBe('loop');
    expect(maxLocalX(barrel.solids) - maxLocalX(slide.solids)).toBeCloseTo(1);
    expect(barrel.ports.find((port) => port.id === 'muzzle')).toMatchObject({ mount: 'muzzle', gender: 'female' });
  });

  it('puts the integrated grip behind the trigger and beneath the slide rear third', () => {
    const frame = report.resolved.defs.get('frame')!;
    const magazinePort = frame.ports.find((port) => port.id === 'magazine')!;
    const trigger = frame.keepOuts.find((keepOut) => keepOut.id === 'trigger-finger')!;
    const slideEnd = maxLocalX(report.resolved.defs.get('slide')!.solids);
    const slideRear = -8;
    const rearThirdEnd = slideRear + (slideEnd - slideRear) / 3;
    const triggerRearEdge = trigger.box.center[0] - trigger.box.half[0];

    expect(magazinePort.pos[0]).toBeLessThan(rearThirdEnd);
    expect(magazinePort.pos[0]).toBeLessThan(triggerRearEdge);
  });
});
