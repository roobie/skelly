import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { buildRegistry } from '../deadvox/src/core/content.ts';
import { exportFileText } from '../gungen/src/cli/exportFile.ts';
import { loadGunDesign } from '../gungen/src/gun/designLoader.ts';
import { exportGunGlb } from '../gungen/src/gun/exportGlb.ts';

const ROOT = new URL('../', import.meta.url).pathname;
const DESIGNS = join(ROOT, 'gungen/designs');
const FIREARM_CONTENT = JSON.parse(readFileSync(join(ROOT, 'deadvox/src/content/base/models-firearms.json'), 'utf8'));
const SYNCED_FIREARM_DESIGNS = [
  ['archetype-ar.json', 'rifle_assault'],
  ['archetype-ak-akm.json', 'rifle_ak'],
];
const omitDeadvoxOwnedFields = ({ chargingHandleDegrees: _chargingHandleDegrees, ...model }) => model;
const loadExports = () =>
  readdirSync(DESIGNS)
    .filter((file) => file.endsWith('.json') && !file.startsWith('look-'))
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

  it('keeps Deadvox firearm entries in sync with gungen-owned export fields', () => {
    for (const [design, modelId] of SYNCED_FIREARM_DESIGNS) {
      const result = exportFileText(readFileSync(join(DESIGNS, design), 'utf8'), {
        id: modelId,
        file: `assets/models/${modelId}.glb`,
      });
      assert.ok(result.ok, `${design}: ${result.ok ? '' : result.message}`);
      const firearm = FIREARM_CONTENT.models.find(({ id }) => id === modelId);
      assert.ok(firearm, `missing Deadvox firearm model ${modelId}`);
      assert.deepEqual(
        omitDeadvoxOwnedFields(firearm),
        result.modelEntry,
        `${modelId} differs from gungen's export outside Deadvox-owned fields`,
      );
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
