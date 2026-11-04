import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import bodyContent from '../mods/skelly.deadvox.residual/body.json' with { type: 'json' };
import sensesContent from '../mods/skelly.deadvox.residual/senses.json' with { type: 'json' };
import soundContent from '../mods/skelly.deadvox.residual/sounds.json' with { type: 'json' };
import blockSoundContent from '../mods/skelly.deadvox.residual/sounds-block.json' with { type: 'json' };
import synthContent from '../mods/skelly.deadvox.residual/sounds-synth.json' with { type: 'json' };
import uiContent from '../mods/skelly.deadvox.residual/ui.json' with { type: 'json' };
import { buildRegistry, requiredContentIssues } from '../src/core/content.ts';
import { bodySoundIds } from './fixtures/bodySounds.ts';
import { CORE_ONLY_KNOWN_ISSUES } from './fixtures/coreOnlyKnownIssues.ts';

const CORE_TOPICS = [
  'body',
  'damage-kinds',
  'compression',
  'figures-player',
  'inventory',
  'item-wear',
  'saves',
  'dayCycle',
  'controls',
  'ui',
  'graphics',
  'look',
  'senses',
  'player',
];

it('validates selected core topics without booting or hiding unowned or stale issues', () => {
  const sources = CORE_TOPICS.map((topic) => ({
    source: `core-only/${topic}.json`,
    data: JSON.parse(readFileSync(`mods/skelly.deadvox.residual/${topic}.json`, 'utf8')) as unknown,
  }));
  const weathering = JSON.parse(readFileSync('mods/skelly.deadvox.residual/weathering.json', 'utf8')) as {
    weathering: { capability?: string }[];
  };
  sources.push({
    source: 'core-only/weathering.json',
    data: { weathering: weathering.weathering.filter((profile) => profile.capability === 'defaultWeathering') },
  });
  const selectedSounds = new Set([
    ...bodyContent.body.flatMap(bodySoundIds),
    ...uiContent.ui.map(({ refusalSound }) => refusalSound),
  ]);
  sources.push({
    source: 'core-only/selected-sounds.json',
    data: {
      soundFamilies: soundContent.soundFamilies.filter(({ id }) =>
        sensesContent.senses.some((senses) => senses.footsteps.family === id),
      ),
      sounds: [...soundContent.sounds, ...synthContent.sounds, ...blockSoundContent.sounds].filter(({ id }) =>
        selectedSounds.has(id),
      ),
    },
  });
  const { registry, issues } = buildRegistry(sources);
  const actual = [...issues, ...requiredContentIssues(registry)];
  expect(registry.compression.size).toBeGreaterThan(0);
  expect(registry.inventory.size).toBeGreaterThan(0);
  expect(registry.saves.size).toBeGreaterThan(0);
  expect(registry.weathering.size).toBeGreaterThan(0);
  expect(actual).toEqual(CORE_ONLY_KNOWN_ISSUES.map(({ issue }) => issue));
});
