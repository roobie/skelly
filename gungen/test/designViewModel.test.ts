import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DesignLoadResult } from '@skelly/engine/core/design.ts';
import { loadDesign } from '@skelly/engine/core/designLoader.ts';
import { describe, expect, it } from 'vitest';
import { loadGunDesign } from '../src/gun/designLoader.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { GUN_PREFABS, type PrefabCatalogue } from '../src/gun/prefabs.ts';
import { ar } from '../src/gun/templates.ts';
import { buildDesignViewModel } from '../src/viewer/designViewModel.ts';

const arText = readFileSync(join(import.meta.dirname, '..', 'designs', 'archetype-ar.json'), 'utf8');

describe('buildDesignViewModel', () => {
  it('shows archetype-ar as published with the STANAG prefab on its magazine', () => {
    const result = buildDesignViewModel(loadGunDesign(arText), 'archetype-ar');
    expect(result.kind).toBe('loaded');
    if (result.kind !== 'loaded') {
      throw new Error('expected a loaded design');
    }
    expect(result).toMatchObject({
      name: 'archetype-ar',
      template: 'ar',
      declaredStatus: 'published',
      loadedStatus: 'published',
      issues: [],
      prefabsByPart: {
        magazine: {
          label: 'stanag-20 v1',
          fixedParams: { length: 'M', profile: 'stanag-straight' },
          stale: false,
        },
      },
    });
  });

  it('shows a prefab mismatch as one draft issue and a stale part label', () => {
    const mismatchCatalog: PrefabCatalogue = [
      ...GUN_PREFABS,
      { id: 'test-barrel', version: 1, family: 'barrel', fixedParams: { profile: 'pistol' } },
    ];
    const mismatchValues = JSON.parse(arText);
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
    const values = JSON.parse(arText);
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
