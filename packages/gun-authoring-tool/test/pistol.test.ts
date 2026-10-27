import { validate } from '@skelly/engine/assembly/validate.ts';
import { distanceWorld, localSolidBounds, penetrationWorld, worldSolid } from '@skelly/engine/shapes/geometry.ts';
import type { Solid } from '@skelly/engine/shapes/solid.ts';
import { describe, expect, it } from 'vitest';
import { gunDomain } from '../src/gun/domain.ts';
import { PISTOL_CROWN_LENGTH_U } from '../src/gun/parts.ts';
import { loadFixture, variant } from './helpers.ts';

const assembly = loadFixture('archetype-pistol');
const report = validate(assembly, gunDomain);
const maxLocalX = (solids: readonly Solid[]): number =>
  Math.max(...solids.map((solid) => localSolidBounds(solid)[1][0]));

describe('pistol model', () => {
  it('seats the barrel inside the hollow slide without overlap and limits the crown', () => {
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

    expect(barrelTransform.t[1]).toBeCloseTo(0);
    expect(Math.min(...slideBarrelGaps)).toBeCloseTo(0);
    expect(overlaps.every((depth) => depth <= 1e-8)).toBe(true);
    expect(resolved.connections.find(({ conn }) => conn.from === 'frame.barrel')?.role).toBe('loop');
    const crown = maxLocalX(barrel.solids) - maxLocalX(slide.solids);
    expect(crown).toBeGreaterThan(0);
    expect(crown).toBeLessThanOrEqual(PISTOL_CROWN_LENGTH_U);
    expect(barrel.ports.find((port) => port.id === 'muzzle')).toMatchObject({ mount: 'muzzle', gender: 'female' });
  });

  it('keeps the integrated frame magazine path clear for every frame grip length', () => {
    const gripLengths = gunDomain.families.frame?.params.gripLength?.values;
    if (!gripLengths) {
      throw new Error('frame grip lengths are missing');
    }
    for (const gripLength of gripLengths) {
      const variantReport = validate(
        variant('archetype-pistol', (draft) => {
          draft.parts.frame!.params!.gripLength = gripLength;
        }),
        gunDomain,
      );
      expect(variantReport.ok, `${gripLength} grip`).toBe(true);
    }
  });

  it('puts the integrated grip behind the trigger and beneath the slide rear third', () => {
    const frame = report.resolved.defs.get('frame')!;
    const magazinePort = frame.ports.find((port) => port.id === 'magazine')!;
    const trigger = frame.keepOuts.find((keepOut) => keepOut.id === 'trigger-finger')!;
    const slideSolids = report.resolved.defs.get('slide')!.solids;
    const slideRear = Math.min(...slideSolids.map((solid) => localSolidBounds(solid)[0][0]));
    const slideEnd = maxLocalX(slideSolids);
    const rearThirdEnd = slideRear + (slideEnd - slideRear) / 3;
    const triggerRearEdge = trigger.box.center[0] - trigger.box.half[0];

    expect(magazinePort.pos[0]).toBeLessThan(rearThirdEnd);
    expect(magazinePort.pos[0]).toBeLessThan(triggerRearEdge);
  });
});
