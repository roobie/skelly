import { buildRegistry } from '@skelly/engine/content';
import { admitPacks, selectFolderClosure } from '@skelly/engine/packs';
import { expect, it } from 'vitest';
import { readAvailablePacks } from '../tools/readBundledPacks.ts';

it('validates every shared pack with only its own declared dependency closure', () => {
  const available = readAvailablePacks('.');
  const shared = available.filter(({ manifest }) => manifest.tier === 'theme');
  expect(shared.length).toBeGreaterThan(0);
  const checked = new Map<string, string[]>();
  const issues = shared.flatMap(({ manifest }) => {
    const closure = selectFolderClosure([manifest.id], available, []);
    const key = JSON.stringify(closure.map(({ manifest }) => manifest.id).sort());
    let problems = checked.get(key);
    if (!problems) {
      const admitted = admitPacks(closure);
      const built = buildRegistry(admitted.sources);
      problems = [...admitted.issues, ...built.issues].map(({ path, message }) => `${path}: ${message}`);
      checked.set(key, problems);
    }
    return problems.map((problem) => `${manifest.id}: ${problem}`);
  });
  expect(issues).toEqual([]);
});
