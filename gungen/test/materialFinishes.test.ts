import { describe, expect, it } from 'vitest';
import { GUN_PALETTE, resolveAppearance, srgbToHex } from '../src/gun/palette.ts';
import { FAMILIES } from '../src/gun/parts.ts';
import { TEMPLATES } from '../src/gun/templates.ts';

const REQUIRED_SLOTS = ['metal', 'furniture', 'accent'] as const;

describe('materials, slots, and finishes', () => {
  it('resolves special, part-owned, archetype, then role-default appearances', () => {
    const p = GUN_PALETTE;
    expect(
      resolveAppearance(p, 'stock', 'butt-pad', { archetype: 'ar', material: 'rubber-black', slot: 'accent' }),
    ).toMatchObject({
      material: 'rubber-black',
      slot: 'accent',
    });
    expect(resolveAppearance(p, 'stock', 'plain', { archetype: 'ar', material: 'polymer-fde' }).material).toBe(
      'polymer-fde',
    );
    expect(resolveAppearance(p, 'stock', 'plain', { archetype: 'ak' }).material).toBe('wood-walnut');
    expect(
      resolveAppearance(p, 'stock', 'plain', { archetype: 'ak', finish: { furniture: 'wood-birch' } }).material,
    ).toBe('wood-birch');
    expect(resolveAppearance(p, 'barrel', 'plain', { archetype: 'unknown' }).material).toBe('steel-parkerized');
  });

  it('assigns every gun part family a slot and bounded shade', () => {
    for (const role of Object.keys(FAMILIES)) {
      expect(GUN_PALETTE.roleSlots?.[role], role).toBeTruthy();
      expect(GUN_PALETTE.materials?.[GUN_PALETTE.roleMaterials?.[role] ?? ''], role).toBeDefined();
      expect(GUN_PALETTE.roleShades?.[role], role).toHaveLength(3);
      for (const channel of GUN_PALETTE.roleShades?.[role] ?? []) {
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(1);
      }
    }
  });

  it('gives every archetype a material for every slot', () => {
    for (const template of TEMPLATES) {
      const finish = GUN_PALETTE.archetypeFinishes?.[template.name];
      expect(finish, template.name).toBeDefined();
      for (const slot of REQUIRED_SLOTS) {
        expect(GUN_PALETTE.materials?.[finish?.[slot] ?? ''], `${template.name}.${slot}`).toBeDefined();
      }
    }
  });

  it('finishes magazines as metal per archetype, while aftermarket polymer may override', () => {
    expect(GUN_PALETTE.roleSlots?.magazine).toBe('metal');
    const ak = resolveAppearance(GUN_PALETTE, 'magazine', 'body', { archetype: 'ak' });
    const ar = resolveAppearance(GUN_PALETTE, 'magazine', 'body', { archetype: 'ar' });
    const smg = resolveAppearance(GUN_PALETTE, 'magazine', 'body', { archetype: 'smg' });
    const awm = resolveAppearance(GUN_PALETTE, 'magazine', 'body', { archetype: 'awm' });
    expect(ak).toMatchObject({ material: 'steel-blued', slot: 'metal' });
    expect(ak.color[0]).toBeLessThan(0.13); // darkened blued steel reads black, not wood or blue
    for (const template of TEMPLATES) {
      expect(resolveAppearance(GUN_PALETTE, 'magazine', 'body', { archetype: template.name }).slot).toBe('metal');
    }
    expect(
      TEMPLATES.find((template) => template.name === 'pump-shotgun')?.slots.some((slot) => slot.family === 'magazine'),
    ).toBe(false);
    expect(ar).toMatchObject({ material: 'alu-anodized-black', slot: 'metal' });
    expect(smg).toMatchObject({ material: 'steel-blued', slot: 'metal' });
    expect(awm).toMatchObject({ material: 'steel-parkerized', slot: 'metal' });
    expect(
      resolveAppearance(GUN_PALETTE, 'magazine', 'body', { archetype: 'ak', material: 'polymer-fde' }).material,
    ).toBe('polymer-fde');
    expect(resolveAppearance(GUN_PALETTE, 'tube-magazine', 'tube', { archetype: 'pump-shotgun' }).slot).toBe('metal');
  });

  it('keeps requested service-rifle and wood defaults', () => {
    expect(srgbToHex(resolveAppearance(GUN_PALETTE, 'stock', 'body', { archetype: 'awm' }).color)).not.toBe(0);
    expect(resolveAppearance(GUN_PALETTE, 'stock', 'body', { archetype: 'awm' }).material).toBe('polymer-od-green');
    expect(resolveAppearance(GUN_PALETTE, 'stock', 'body', { archetype: 'ar' }).material).toBe('polymer-black');
    expect(resolveAppearance(GUN_PALETTE, 'stock', 'body', { archetype: 'ak' }).material).toBe('wood-walnut');
  });
});
