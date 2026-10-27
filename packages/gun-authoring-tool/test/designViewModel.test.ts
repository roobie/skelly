import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DesignLoadResult } from '@skelly/engine/assembly/design.ts';
import { loadDesign } from '@skelly/engine/assembly/designLoader.ts';
import { describe, expect, it } from 'vitest';
import { loadGunDesign } from '../src/gun/designLoader.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { GUN_PREFABS, type PrefabCatalogue } from '../src/gun/prefabs.ts';
import { ar } from '../src/gun/templates.ts';
import { buildDesignViewModel } from '../src/viewer/designViewModel.ts';
import { loadDesignAssembly } from './helpers.ts';

const arText = readFileSync(join(import.meta.dirname, '..', 'designs', 'archetype-ar.json'), 'utf8');
// Edits change construction params, which a catalogue item reference fixes, so they start from the built parts.
const arValues = () => ({ ...JSON.parse(arText), assembly: loadDesignAssembly('archetype-ar') });

describe('buildDesignViewModel', () => {
  it('shows a published design magazine prefab from its catalogue reference', () => {
    const loaded = loadGunDesign(arText);
    const result = buildDesignViewModel(loaded, 'archetype-ar');
    if (!(loaded.ok && result.kind === 'loaded')) {
      throw new Error('expected a loaded design');
    }
    const reference = loaded.design.assembly.parts.magazine?.prefab;
    if (!reference) {
      throw new Error('design has no magazine prefab');
    }
    const prefab = GUN_PREFABS.find(({ id, version }) => id === reference.id && version === reference.version);
    if (!prefab) {
      throw new Error(`unknown prefab ${reference.id} v${reference.version}`);
    }
    expect(result.prefabsByPart.magazine).toEqual({
      label: `${prefab.id} v${prefab.version}`,
      fixedParams: prefab.fixedParams,
      stale: false,
    });
  });

  it('shows a prefab mismatch as one draft issue and a stale part label', () => {
    const mismatchCatalog: PrefabCatalogue = [
      ...GUN_PREFABS,
      { id: 'test-barrel', version: 1, family: 'barrel', fixedParams: { profile: 'pistol' } },
    ];
    const mismatchValues = arValues();
    mismatchValues.assembly.parts.barrel.params.profile = 'standard';
    mismatchValues.assembly.parts.barrel.prefab = { id: 'test-barrel', version: 1 };
    const mismatchLoad = loadDesign(JSON.stringify(mismatchValues), {
      domain: gunDomain,
      template: ar,
      prefabs: mismatchCatalog,
    });
    if (!mismatchLoad.ok) {
      throw new Error(JSON.stringify(mismatchLoad));
    }
    const result = buildDesignViewModel(mismatchLoad, 'archetype-ar-mismatch', mismatchCatalog);
    expect(result.kind).toBe('loaded');
    if (result.kind !== 'loaded') {
      throw new Error('expected a loaded draft');
    }
    expect(result.loadedStatus).toBe('draft');
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.code).toBe('prefab-values-mismatch');
    expect(result.prefabsByPart.barrel).toMatchObject({ label: 'test-barrel v1', stale: true });
  });

  it('maps live rule issues to the part cards they name', () => {
    const values = arValues();
    values.status = 'draft';
    values.assembly.parts.receiver.params.feed = 'tube';
    values.assembly.connections = values.assembly.connections.filter(
      (connection: { from: string }) => connection.from !== 'receiver.barrel',
    );
    values.assembly.parts.barrel = undefined;
    const loaded = loadGunDesign(JSON.stringify(values));
    const result = buildDesignViewModel(loaded, 'archetype-ar-broken');
    expect(result.kind).toBe('loaded');
    if (result.kind !== 'loaded') {
      throw new Error('expected a loaded draft');
    }
    expect(result.issuesByPart.lower?.some((issue) => issue.message.startsWith('[feed-match]'))).toBe(true);
    expect(result.issuesByPart.receiver?.some((issue) => issue.message.startsWith('[feed-match]'))).toBe(true);
    expect(
      result.infoIssues.some((issue) => issue.code === 'template-choice' && issue.message.includes('barrel')),
    ).toBe(true);
    if (!loaded.ok) {
      throw new Error('expected a loaded draft');
    }
    const withPartlessWarning: DesignLoadResult = {
      ...loaded,
      design: { ...loaded.design, status: 'draft' },
      issues: [...loaded.issues, { code: 'infeasible', message: '[firing-grip] missing', parts: [] }],
    };
    const infoModel = buildDesignViewModel(withPartlessWarning, 'archetype-ar-broken');
    expect(
      infoModel.kind === 'loaded' && infoModel.infoIssues.some((issue) => issue.message.includes('firing-grip')),
    ).toBe(true);
  });

  it('turns a malformed design into a fatal error view', () => {
    const result = buildDesignViewModel(loadGunDesign('{ nope'), 'broken-design');
    expect(result).toMatchObject({
      kind: 'fatal',
      name: 'broken-design',
      errorCode: 'invalid-json',
    });
    if (result.kind !== 'fatal') {
      throw new Error('expected a fatal view');
    }
    expect(result.errorMessage).toContain('invalid JSON');
  });
});
