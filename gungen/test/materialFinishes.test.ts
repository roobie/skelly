import { describe, expect, it } from 'vitest';
import { GUN_PALETTE, resolveAppearance, srgbToHex } from '../src/gun/palette.ts';
import { FAMILIES } from '../src/gun/parts.ts';
import { TEMPLATES } from '../src/gun/templates.ts';

describe('materials, slots, and finishes', () => {
  it('resolves special, part-owned, archetype, then role-default appearances', () => {
    const p = GUN_PALETTE;
    expect(resolveAppearance(p, 'stock', 'butt-pad', { archetype: 'ar' }).material).toBe('rubber-black');
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
    const slots = [...new Set(Object.values(GUN_PALETTE.roleSlots ?? {}))];
    for (const template of TEMPLATES) {
      const finish = GUN_PALETTE.archetypeFinishes?.[template.name];
      expect(finish, template.name).toBeDefined();
      for (const slot of slots) {
        expect(GUN_PALETTE.materials?.[finish?.[slot] ?? ''], `${template.name}.${slot}`).toBeDefined();
      }
    }
  });

  it('keeps requested service-rifle and wood defaults', () => {
    expect(srgbToHex(resolveAppearance(GUN_PALETTE, 'stock', 'body', { archetype: 'awm' }).color)).not.toBe(0);
    expect(resolveAppearance(GUN_PALETTE, 'stock', 'body', { archetype: 'awm' }).material).toBe('polymer-od-green');
    expect(resolveAppearance(GUN_PALETTE, 'stock', 'body', { archetype: 'ar' }).material).toBe('polymer-black');
    expect(resolveAppearance(GUN_PALETTE, 'stock', 'body', { archetype: 'ak' }).material).toBe('wood-walnut');
  });
});
