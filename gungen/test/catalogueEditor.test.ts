import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCartridgeJson } from '../src/ammo/parseCartridge.ts';
import { PART_CATALOGUE } from '../src/gun/catalogue.ts';
import { loadGunDesign } from '../src/gun/designLoader.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { TEMPLATES } from '../src/gun/templates.ts';
import {
  availablePartItems,
  choosePartItem,
  clearPartItem,
  editorStateFromDesign,
  editParam,
  saveDesign,
  saveDesignForDownload,
} from '../src/viewer/designEditor.ts';
import { exportEditorDesign } from '../src/viewer/designExport.ts';

const open = () => {
  const loaded = loadGunDesign(readFileSync(new URL('../designs/archetype-ar.json', import.meta.url), 'utf8'));
  if (!loaded.ok) {
    throw new Error(loaded.error.message);
  }
  if (loaded.issues.length > 0 || Object.keys(loaded.design.items ?? {}).length === 0) {
    throw new Error('expected a valid catalogue-backed fixture');
  }
  return editorStateFromDesign(
    loaded.design,
    TEMPLATES.find(({ name }) => name === loaded.design.template),
  );
};

describe('catalogue editor adapter', () => {
  it('saves selected item identity rather than copied construction, then reloads it', () => {
    const state = open();
    const [id, itemId] = Object.entries(state.items!)[0]!;
    const choices = availablePartItems(state, id);
    expect(choices.some((item) => item.id === itemId)).toBe(true);
    const picked = choosePartItem(clearPartItem(state, id), id, itemId);
    if (!picked.ok) {
      throw new Error(picked.reason);
    }
    const saved = saveDesignForDownload({ ...picked.state, status: 'published' }, gunDomain);
    expect(saved.downgraded).not.toBe(true);
    if (!saved.ok) {
      throw new Error(saved.reason);
    }
    expect(JSON.parse(saved.text).assembly.parts[id]).toEqual({ item: itemId, params: {} });
    const reloaded = loadGunDesign(saved.text);
    if (!reloaded.ok) {
      throw new Error(reloaded.error.message);
    }
    expect(reloaded.issues).toEqual([]);
    expect(reloaded.design.items).toEqual(picked.state.items);
    expect(reloaded.design.assembly.parts[id]!.params).toEqual(PART_CATALOGUE.items.get(itemId)!.params);
  });

  it('detaches construction edits from item identity without preventing draft saves', () => {
    const state = open();
    const candidate = Object.entries(state.items!).flatMap(([id, itemId]) => {
      const item = PART_CATALOGUE.items.get(itemId)!;
      return Object.entries(item.params).flatMap(([name, value]) => {
        const other = gunDomain.families[item.family]!.params[name]!.values.find((entry) => entry !== value);
        return other ? [{ id, name, other }] : [];
      });
    })[0]!;
    expect(candidate).toBeDefined();
    const edited = editParam(state, gunDomain, {
      partId: candidate.id,
      name: candidate.name,
      value: candidate.other,
    }).state;
    expect(edited.items?.[candidate.id]).toBeUndefined();
    const saved = saveDesign(edited, gunDomain);
    expect(saved.ok).toBe(true);
    if (saved.ok) {
      expect(JSON.parse(saved.text).assembly.parts[candidate.id].item).toBeUndefined();
    }
  });

  it('exports curated bodies but refuses the same geometry without authored item selections', () => {
    const state = open();
    const cartridge = parseCartridgeJson(
      readFileSync(new URL(`../cartridges/${state.calibre}.json`, import.meta.url), 'utf8'),
    );
    if (!cartridge.ok) {
      throw new Error(cartridge.error.message);
    }
    const asset = { id: 'editor_fixture', file: 'assets/models/editor_fixture.glb' } as const;
    const result = exportEditorDesign(state, asset, cartridge.cartridge);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.message);
    }
    const parts = Object.values(result.modelEntry.parts ?? {});
    expect(parts.length).toBeGreaterThan(0);
    expect(parts.every((part) => part.item && PART_CATALOGUE.items.has(part.item))).toBe(true);
    const refused = exportEditorDesign({ ...state, items: {} }, asset, cartridge.cartridge);
    expect(refused.ok).toBe(false);
  });
});
