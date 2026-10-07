import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { buildRegistry } from '../deadvox/src/core/content.ts';
import { loadGunDesign } from '../gungen/src/gun/designLoader.ts';
import { exportGunGlb } from '../gungen/src/gun/exportGlb.ts';

const ROOT = new URL('../', import.meta.url).pathname;
const DESIGNS = join(ROOT, 'gungen/designs');
const loadExports = () =>
  readdirSync(DESIGNS)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => {
      const loaded = loadGunDesign(readFileSync(join(DESIGNS, file), 'utf8'));
      if (!loaded.ok) {
        throw new Error(`${file}: ${loaded.error.message}`);
      }
      const id = file.slice(0, -'.json'.length).replaceAll('-', '_');
      const result = exportGunGlb(
        loaded.design.assembly,
        { id, file: `assets/models/${id}.glb` },
        { variant: loaded.design.template },
      );
      if (!result.ok) {
        throw new Error(`${file}: ${JSON.stringify(result.error)}`);
      }
      return { file, model: result.modelEntry };
    });

describe('gungen exports satisfy deadvox model validation', () => {
  it('validates each exported gun model entry, including action metadata', () => {
    const exportedGuns = loadExports();
    assert.ok(exportedGuns.length > 0);
    for (const { file, model } of exportedGuns) {
      const { issues } = buildRegistry([{ source: `gungen/designs/${file}`, data: { models: [model] } }]);
      assert.deepEqual(issues, [], `${file}: ${JSON.stringify(issues)}`);
    }
  });

  it('rejects unknown action fields', () => {
    const { file, model } = loadExports().find(({ model: entry }) => entry.action?.fire) ?? {};
    assert.ok(file && model?.action?.fire);
    const oldCycleNames = ({ durationSimSeconds, rearwardSimSeconds, dwellSimSeconds, forwardSimSeconds }) => ({
      durationSeconds: durationSimSeconds,
      rearwardSeconds: rearwardSimSeconds,
      dwellSeconds: dwellSimSeconds,
      forwardSeconds: forwardSimSeconds,
    });
    const { action } = model;
    const { roundsPerSimMinute, ...actionWithoutRate } = action;
    const oldModel = {
      ...model,
      action: {
        ...actionWithoutRate,
        fire: oldCycleNames(action.fire),
        hand: oldCycleNames(action.hand),
        rpm: roundsPerSimMinute,
      },
    };
    const { issues } = buildRegistry([{ source: `gungen/designs/${file}`, data: { models: [oldModel] } }]);
    assert.notDeepEqual(issues, [], `${file} should fail with the pre-r44-3 exporter fields`);
  });
});
