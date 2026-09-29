import { describe, expect, it } from 'vitest';
import { generate } from '../src/core/generate.ts';
import type { Assembly } from '../src/core/schema.ts';
import { loadGunDesign } from '../src/gun/designLoader.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { GUN_PREFABS } from '../src/gun/prefabs.ts';
import { ar } from '../src/gun/templates.ts';
import {
  availablePrefabs,
  choosePrefab,
  createEditorState,
  editorStateFromDesign,
  editParam,
  saveDesign,
  saveDesignForDownload,
  setOptionalPart,
  setPartFamily,
  toggleOptionalPartLock,
  toggleParamLock,
} from '../src/viewer/designEditor.ts';

const seedAssembly: Assembly = generate(ar, gunDomain, 7);
const stanag20 = GUN_PREFABS.find((prefab) => prefab.id === 'stanag-20')!;

describe('design editor: save and reopen', () => {
  it('round-trips a template pick, prefab reference, and lock on an unchanged seed value', () => {
    let state = createEditorState(ar, seedAssembly, { status: 'published' });
    const seedGripLength = seedAssembly.parts.grip?.params?.length;
    expect(seedGripLength).toBeDefined();
    state = toggleParamLock(state, gunDomain, 'grip', 'length');
    const picked = choosePrefab(state, 'magazine', stanag20);
    expect(picked.ok).toBe(true);
    if (!picked.ok) {
      throw new Error(picked.reason);
    }

    const saved = saveDesign(picked.state, gunDomain);
    expect(saved.ok).toBe(true);
    if (!saved.ok) {
      throw new Error(saved.reason);
    }
    const reopened = loadGunDesign(saved.text);
    if (!reopened.ok) {
      throw new Error(`${reopened.error.code} at ${reopened.error.path}: ${reopened.error.message}`);
    }
    expect(reopened.ok).toBe(true);
    expect(reopened.issues).toEqual([]);
    expect(reopened.design).toEqual(saved.design);
    expect(reopened.design.assembly.parts.grip?.params?.length).toBe(seedGripLength);
    expect(reopened.design.locks.params.grip).toEqual(['length']);
    expect(reopened.design.assembly.parts.magazine?.prefab).toEqual({ id: 'stanag-20', version: 1 });
    // The handguard inherits its length; saving must not materialize it.
    expect(reopened.design.assembly.parts.handguard?.params?.length).toBeUndefined();
    const restoredState = editorStateFromDesign(reopened.design, ar);
    const savedAgain = saveDesign(restoredState, gunDomain);
    expect(savedAgain.ok && savedAgain.design).toEqual(reopened.design);
  });

  it('round-trips adding and removing an optional part', () => {
    const initial = setOptionalPart(createEditorState(ar, seedAssembly), 'sight', false);
    const added = saveDesign(setOptionalPart(initial, 'sight', true), gunDomain);
    expect(added.ok).toBe(true);
    if (!added.ok) {
      throw new Error(added.reason);
    }
    const afterAdd = loadGunDesign(added.text);
    expect(afterAdd.ok && 'sight' in afterAdd.design.assembly.parts).toBe(true);
    if (!afterAdd.ok) {
      throw new Error(afterAdd.error.message);
    }
    const reopenedState = editorStateFromDesign(afterAdd.design, ar);
    const removed = saveDesign(setOptionalPart(reopenedState, 'sight', false), gunDomain);
    expect(removed.ok).toBe(true);
    if (!removed.ok) {
      throw new Error(removed.reason);
    }
    const afterRemove = loadGunDesign(removed.text);
    expect(afterRemove.ok && 'sight' in afterRemove.design.assembly.parts).toBe(false);
  });

  it('round-trips a lock on an optional part presence choice', () => {
    const state = toggleOptionalPartLock(createEditorState(ar, seedAssembly), 'sight');
    const saved = saveDesign(state, gunDomain);
    expect(saved.ok).toBe(true);
    if (!saved.ok) {
      throw new Error(saved.reason);
    }
    const reopened = loadGunDesign(saved.text);
    expect(reopened.ok && reopened.design.locks.optionalParts).toEqual(['sight']);
  });

  it('downgrades an invalid publish request to a draft', () => {
    const assembly: Assembly = {
      ...seedAssembly,
      parts: {
        ...seedAssembly.parts,
        receiver: {
          ...seedAssembly.parts.receiver!,
          params: { ...seedAssembly.parts.receiver?.params, feed: 'tube' },
        },
      },
      connections: seedAssembly.connections.filter((connection) => connection.from !== 'receiver.barrel'),
    };
    const saved = saveDesignForDownload(createEditorState(ar, assembly, { status: 'published' }), gunDomain);
    expect(saved).toMatchObject({ ok: true, downgraded: true, design: { status: 'draft' } });
  });

  it('saves a draft even when live validation reports issues', () => {
    const assembly: Assembly = {
      ...seedAssembly,
      parts: {
        ...seedAssembly.parts,
        receiver: {
          ...seedAssembly.parts.receiver!,
          params: { ...seedAssembly.parts.receiver?.params, feed: 'tube' },
        },
      },
      connections: seedAssembly.connections.filter((connection) => connection.from !== 'receiver.barrel'),
    };
    const saved = saveDesign(createEditorState(ar, assembly, { status: 'draft' }), gunDomain);
    expect(saved.ok).toBe(true);
    if (!saved.ok) {
      throw new Error(saved.reason);
    }
    const reopened = loadGunDesign(saved.text);
    expect(reopened.ok).toBe(true);
    if (reopened.ok) {
      expect(reopened.declaredStatus).toBe('draft');
      expect(reopened.design.status).toBe('draft');
      expect(reopened.issues.some((issue) => issue.message.startsWith('[feed-match]'))).toBe(true);
    }
  });

  it('refuses to save a build without a template', () => {
    const state = createEditorState(undefined, seedAssembly);
    expect(saveDesign(state, gunDomain)).toMatchObject({ ok: false, reason: 'missing-template' });
  });
});

describe('design editor: prefab and template choices', () => {
  it('offers only prefabs for the part registry family and refuses a different family', () => {
    const state = createEditorState(ar, seedAssembly);
    expect(availablePrefabs(state, 'magazine', GUN_PREFABS).map((prefab) => prefab.id)).toEqual([
      'stanag-20',
      'stanag-30',
      'ak74-30',
      'akm-30',
    ]);
    expect(availablePrefabs(state, 'grip', GUN_PREFABS)).toEqual([]);
    expect(setPartFamily(state, 'barrel', 'grip')).toMatchObject({ ok: false, reason: 'family-not-allowed' });
  });

  it('detaches a prefab when one of its fixed params is edited', () => {
    const picked = choosePrefab(createEditorState(ar, seedAssembly), 'magazine', stanag20);
    expect(picked.ok).toBe(true);
    if (!picked.ok) {
      throw new Error(picked.reason);
    }
    const currentLength = picked.state.assembly.parts.magazine?.params?.length;
    const replacement = currentLength === 'S' ? 'M' : 'S';
    const edited = editParam(picked.state, gunDomain, { partId: 'magazine', name: 'length', value: replacement });
    expect(edited.state.assembly.parts.magazine?.params?.length).toBe(replacement);
    expect(edited.state.assembly.parts.magazine?.prefab).toBeUndefined();
  });
});
