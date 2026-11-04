import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import bodyContent from '../mods/skelly.deadvox.residual/body.json' with { type: 'json' };
import sensesContent from '../mods/skelly.deadvox.residual/senses.json' with { type: 'json' };
import soundContent from '../mods/skelly.deadvox.residual/sounds.json' with { type: 'json' };
import blockSoundContent from '../mods/skelly.deadvox.residual/sounds-block.json' with { type: 'json' };
import synthContent from '../mods/skelly.deadvox.residual/sounds-synth.json' with { type: 'json' };
import { buildRegistry, requiredContentIssues } from '../src/core/content.ts';
import { bodySoundIds } from './fixtures/bodySounds.ts';
import { CORE_ONLY_KNOWN_ISSUES } from './fixtures/coreOnlyKnownIssues.ts';

const CORE_MODS = [
  'skelly.saves',
  'skelly.day-cycle',
  'skelly.controls',
  'skelly.graphics',
  'skelly.ui',
  'skelly.weathering',
  'skelly.melee-classes',
];
const CORE_TOPICS = ['body', 'compression', 'figures-player', 'inventory', 'item-wear', 'senses', 'player'];

/** A core mod's content files, as its manifest lists them. */
const coreModSources = (mod: string) => {
  const manifest = JSON.parse(readFileSync(`../mods/${mod}/pack/manifest.json`, 'utf8')) as {
    files: { path: string; kind: string }[];
  };
  return manifest.files
    .filter(({ kind }) => kind === 'content')
    .map(({ path }) => ({
      source: `core-only/${mod}/${path}`,
      data: JSON.parse(readFileSync(`../mods/${mod}/${path}`, 'utf8')) as unknown,
    }));
};

it('validates selected core mods and topics without booting or hiding unowned or stale issues', () => {
  const sources = [
    ...CORE_MODS.flatMap(coreModSources),
    ...CORE_TOPICS.map((topic) => ({
      source: `core-only/${topic}.json`,
      data: JSON.parse(readFileSync(`mods/skelly.deadvox.residual/${topic}.json`, 'utf8')) as unknown,
    })),
  ];
  const selectedSounds = new Set(bodyContent.body.flatMap(bodySoundIds));
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
