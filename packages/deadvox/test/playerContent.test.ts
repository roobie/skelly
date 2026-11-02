import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { validate } from '../src/cli/validate.ts';
import { buildRegistry } from '../src/core/content.ts';
import { PLAYER } from './playerFixture.ts';

const numericPaths = (value: object, prefix: string[] = []): string[][] =>
  Object.entries(value).flatMap(([key, entry]) => {
    if (typeof entry === 'number') {
      return [[...prefix, key]];
    }
    if (typeof entry === 'object' && entry !== null) {
      return numericPaths(entry, [...prefix, key]);
    }
    return [];
  });

it('validate rejects every missing or negative player tuning field and a missing player row', () => {
  const valid = buildRegistry([{ source: 'fixture', data: { player: [PLAYER] } }]);
  expect(valid.issues).toEqual([]);
  expect(valid.registry.player.get('player')).toEqual(PLAYER);
  const root = mkdtempSync(join(tmpdir(), 'deadvox-player-content-'));
  const base = join(root, 'src/content/base');
  mkdirSync(join(base, 'pack'), { recursive: true });
  const run = () => {
    writeFileSync(
      join(base, 'pack/manifest.json'),
      JSON.stringify({
        id: 'fixture.player',
        version: '1',
        tier: 'core',
        product: false,
        dependencies: [],
        overrides: [],
        files: existsSync(join(base, 'player.json')) ? [{ path: 'player.json', kind: 'content' }] : [],
      }),
    );
    const output: string[] = [];
    const status = validate([], (line) => output.push(line), root);
    return { status, output: output.join('\n') };
  };
  try {
    expect(run().output).toContain('core content player: missing required capability "player"');
    const paths = numericPaths(PLAYER);
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      for (const invalid of ['missing', 'negative']) {
        const row = structuredClone(PLAYER);
        let owner = row as unknown as Record<string, unknown>;
        for (const key of path.slice(0, -1)) {
          owner = owner[key] as Record<string, unknown>;
        }
        const key = path.at(-1)!;
        if (invalid === 'missing') {
          delete owner[key];
        } else {
          owner[key] = -1;
        }
        writeFileSync(join(base, 'player.json'), JSON.stringify({ player: [row] }));
        const result = run();
        expect(result.status, `${invalid} ${path.join('.')}`).toBe(1);
        expect(result.output).toContain(`player[0].${path.join('.')}:`);
      }
    }
    writeFileSync(
      join(base, 'player.json'),
      JSON.stringify({ player: [{ ...PLAYER, load: { ...PLAYER.load, heavy: PLAYER.load.light } }] }),
    );
    expect(run().output).toContain('heavy load must exceed light load');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
