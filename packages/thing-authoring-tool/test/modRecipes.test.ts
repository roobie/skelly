import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { readThingRecipes } from '../../../tools/thing-recipes.ts';
import { catalogue } from '../src/catalogue.ts';
import { exportThingRecipes } from '../src/cli/export.ts';
import { loadThingRecipe } from '../src/exports.ts';

it('exports each discovered recipe into its owning mod across both roots', () => {
  const root = mkdtempSync(join(tmpdir(), 'thing-mod-recipes-'));
  try {
    const item = catalogue.items.find((entry) => entry.exportMass === 'inventory-atom')!;
    const bases = ['packages/mods/fixture.shared', 'packages/deadvox/mods/fixture.product'].map((path) =>
      join(root, path),
    );
    const rows = bases.map((base, index) => {
      const value = [
        {
          id: `fixture_model_${index}`,
          kind: 'item',
          source: item.id,
          voxel: { grain: 0.01 },
          options: { mass: item.exportMass },
        },
      ];
      mkdirSync(join(base, 'exports'), { recursive: true });
      const text = JSON.stringify(value);
      writeFileSync(join(base, 'exports/things.jsonnet'), text);
      writeFileSync(join(base, 'exports/things.json'), text);
      return loadThingRecipe(value)[0]!;
    });
    expect(
      readThingRecipes(root)
        .map(({ base }) => base)
        .sort(),
    ).toEqual([...bases].sort());
    exportThingRecipes(root);
    bases.forEach((base, index) => {
      const { modelEntry, glb } = rows[index]!.generate();
      expect(JSON.parse(readFileSync(join(base, 'things/index.json'), 'utf8'))).toEqual([modelEntry]);
      expect(JSON.parse(readFileSync(join(base, 'things', `${modelEntry.id}.model.json`), 'utf8'))).toEqual(modelEntry);
      expect(readFileSync(join(base, modelEntry.file))).toEqual(Buffer.from(glb));
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
