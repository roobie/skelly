import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { packContentHash } from '../src/core/packAdmission.ts';
import { bundledPackDefines, readBundledPacks } from '../tools/readBundledPacks.ts';

it('injects exporter JSON digests without model payloads while preserving runtime pack identity', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pack-digests-'));
  const directory = join(root, 'src/content/base');
  try {
    mkdirSync(join(directory, 'pack'), { recursive: true });
    writeFileSync(
      join(directory, 'pack/manifest.json'),
      JSON.stringify({
        id: 'fixture.digests',
        version: '1',
        tier: 'theme',
        product: false,
        dependencies: [],
        overrides: [],
        files: [
          { path: 'rows.json', kind: 'content' },
          { path: 'export.model.json', kind: 'json' },
          { path: 'model.glb', kind: 'asset' },
        ],
      }),
    );
    writeFileSync(join(directory, 'rows.json'), JSON.stringify({ items: [] }));
    const modelPath = join(directory, 'export.model.json');
    writeFileSync(modelPath, JSON.stringify({ fixtureGeometry: 1, fixtureMaterial: 'plain' }));
    writeFileSync(join(directory, 'model.glb'), new Uint8Array([1, 2, 3]));
    const [input] = readBundledPacks(root);
    const defines = await bundledPackDefines([input!]);
    const hashesDefine = '__DEADVOX_FILE_HASHES__';
    const identitiesDefine = '__DEADVOX_CONTENT_PACKS__';
    const hashes: Record<string, string> = JSON.parse(defines[hashesDefine]!);
    const identities = JSON.parse(defines[identitiesDefine]!);
    expect(JSON.stringify(hashes)).not.toContain('fixtureGeometry');
    expect(typeof hashes[`${input!.source}/export.model.json`]).toBe('string');
    const runtime = {
      ...input!,
      files: input!.manifest.files.map(({ path, kind }) => ({
        source: path,
        data:
          kind === 'content'
            ? input!.files.find(({ source }) => source === path)!.data
            : hashes[`${input!.source}/${path}`],
      })),
    };
    const original = await packContentHash(runtime);
    expect(original).toBe(identities[0].canonicalHash);
    writeFileSync(modelPath, JSON.stringify({ fixtureMaterial: 'plain', fixtureGeometry: 1 }));
    expect(await packContentHash(readBundledPacks(root)[0]!)).toBe(original);
    writeFileSync(modelPath, JSON.stringify({ fixtureGeometry: 2, fixtureMaterial: 'plain' }));
    expect(await packContentHash(readBundledPacks(root)[0]!)).not.toBe(original);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
