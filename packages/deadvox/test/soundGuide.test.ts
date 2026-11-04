// @vitest-environment happy-dom
import { render } from 'lit-html';
import { describe, expect, it, vi } from 'vitest';
import { bundledCredits } from '../src/bundledCredits.ts';
import { mergeManifests, type PackedManifest } from '../src/core/assets.ts';
import type { SoundDef } from '../src/core/content.ts';
import type { SoundId } from '../src/core/soundEvents.ts';
import { soundVariantKey } from '../src/core/soundSynth.ts';
import { buildSoundsPageContent } from '../src/soundsPageContent.ts';
import { buildHeartbeatSoundGuide, buildSoundGuide, renderHeartbeatSoundGuide } from '../src/ui/soundGuide.ts';
import { BODY_TUNING_FIXTURE } from './simulationFixture.ts';

const heartbeatTuning = BODY_TUNING_FIXTURE.heartbeat;
const HEARTBEAT_FILES = { slow: 'fixture-heartbeat-slow.ogg', fast: 'fixture-heartbeat-fast.ogg' };
const heartbeatSounds = new Map<SoundId, SoundDef>(
  (['slow', 'fast'] as const).map((pace) => [
    heartbeatTuning.sounds[pace],
    { id: heartbeatTuning.sounds[pace], category: 'body', variants: [HEARTBEAT_FILES[pace]] } as unknown as SoundDef,
  ]),
);

const FIXTURE_PACK = 'fixture-pack';
const originsIn = (pack: string, ids: Iterable<string>) =>
  new Map([...ids].map((id) => [id, { source: `${pack}/sounds.json` }]));

const heartbeatFixtureManifest = {
  sources: [
    {
      pack: FIXTURE_PACK,
      title: 'Heartbeat fixture',
      author: 'Fixture author',
      licence: 'CC0-1.0',
      url: 'https://example.test/heartbeat',
      download: null,
      files: Object.values(HEARTBEAT_FILES),
      changes: 'Fixture provenance',
    },
  ],
} as PackedManifest;

const recordingId = 'fixture_recording';
const recipeId = 'fixture_recipe';

const fixtureRecipe = { recipe: 'fixture-recipe', jfxr: {} };
const fixtureSounds = [
  {
    id: recordingId,
    description: 'fixture recording trigger',
    debugHint: 'fixture shortcut',
    category: 'world',
    variants: ['fixture.ogg'],
    noise: { enabled: false, radiusMetres: 0 },
  },
  {
    id: recipeId,
    description: 'fixture recipe trigger',
    category: 'ui',
    variants: [fixtureRecipe],
    noise: { enabled: false, radiusMetres: 0 },
  },
] as unknown as SoundDef[];
const fixtureOrigins = originsIn(FIXTURE_PACK, [recordingId, recipeId]);
const fixtureManifest = {
  sources: [
    {
      pack: FIXTURE_PACK,
      title: 'Fixture source',
      author: 'Fixture author',
      licence: 'CC0-1.0',
      url: 'https://example.test/source',
      download: null,
      files: ['fixture.ogg'],
      changes: 'Fixture provenance',
    },
  ],
} as PackedManifest;

describe('audio listening guide', () => {
  it('finds a credit for every recording in the listening page content', () => {
    const { registry } = buildSoundsPageContent();
    const guide = buildSoundGuide([...registry.sounds.values()], bundledCredits().manifest, registry.soundOrigins);
    const recordings = guide.flatMap(({ variants }) => variants).filter(({ synthesised }) => !synthesised);
    expect(recordings.length).toBeGreaterThan(0);
    expect(recordings.filter(({ author }) => author === 'Uncredited').map(({ file }) => file)).toEqual([]);
  });

  it('credits a same-path recording from the pack that owns each sound, in both guides', () => {
    const file = 'assets/audio/fixture-shared.ogg';
    const source = (author: string) => ({
      title: `Fixture ${author}`,
      url: null,
      author,
      licence: 'CC0-1.0',
      download: null,
      files: [file],
      changes: null,
    });
    const { manifest, issues } = mergeManifests(
      ['first', 'second'].map((author) => ({
        source: `fixture/${author}/assets/manifest.json`,
        data: { sources: [source(author)] },
      })),
    );
    expect(issues).toEqual([]);
    expect(manifest.sources).toHaveLength(2);

    const sound = (id: string) => ({ ...fixtureSounds[0]!, id, variants: [file] }) as unknown as SoundDef;
    const guide = buildSoundGuide(
      [sound('fixture_first'), sound('fixture_second')],
      manifest,
      new Map([
        ['fixture_first', { source: 'fixture/first/sounds.json' }],
        ['fixture_second', { source: 'fixture/second/sounds.json' }],
      ]),
    );
    expect(guide.map(({ variants }) => variants[0]!.author)).toEqual(['first', 'second']);

    const { slow, fast } = heartbeatTuning.sounds;
    const heartbeat = buildHeartbeatSoundGuide(
      heartbeatTuning,
      new Map([
        [slow, { ...sound(slow), id: slow }],
        [fast, { ...sound(fast), id: fast }],
      ]),
      manifest,
      new Map([
        [slow, { source: 'fixture/first/sounds.json' }],
        [fast, { source: 'fixture/second/sounds.json' }],
      ]),
    );
    expect(heartbeat.variants.map(({ event, author }) => [event, author])).toEqual([
      [slow, 'first'],
      [fast, 'second'],
    ]);
  });

  it('maps fixture events, their content triggers and shortcuts, and variants to guide entries', () => {
    const guide = buildSoundGuide(fixtureSounds, fixtureManifest, fixtureOrigins);
    expect(guide.map(({ id }) => id)).toEqual(fixtureSounds.map(({ id }) => id));
    expect(guide.map(({ trigger, debugHint }) => [trigger, debugHint])).toEqual([
      ['fixture recording trigger', 'fixture shortcut'],
      ['fixture recipe trigger', null],
    ]);
    expect(guide.flatMap((entry) => entry.variants.map(({ file }) => `${entry.id}\0${file}`))).toEqual([
      `${recordingId}\0${soundVariantKey(recordingId, 'fixture.ogg')}`,
      `${recipeId}\0${soundVariantKey(recipeId, fixtureRecipe)}`,
    ]);
  });

  it('resolves fixture recording provenance while leaving recipes uncredited', () => {
    const variants = buildSoundGuide(fixtureSounds, fixtureManifest, fixtureOrigins).flatMap((entry) => entry.variants);
    const recording = variants.find(({ file }) => file.endsWith('fixture.ogg'))!;
    const recipe = variants.find(({ synthesised }) => synthesised)!;
    expect(recording).toMatchObject({ author: 'Fixture author', licence: 'CC0-1.0', sourcePack: 'Fixture source' });
    expect(recipe.synthesised).toBe(true);
    expect(recipe.sourceUrl).toBeNull();
  });

  it('marks a recorded fixture variant missing from manifest provenance', () => {
    const [variant] = buildSoundGuide(fixtureSounds.slice(0, 1), { sources: [] }, fixtureOrigins)[0]!.variants;
    expect(variant).toMatchObject({
      author: 'Uncredited',
      licence: 'Unknown licence',
      sourcePack: 'Missing source in assets/manifest.json',
      sourceUrl: null,
    });
  });

  it('renders a preview control per heartbeat recording and level and sends its event and tuned gain', () => {
    const heartbeat = buildHeartbeatSoundGuide(
      heartbeatTuning,
      heartbeatSounds,
      heartbeatFixtureManifest,
      originsIn(FIXTURE_PACK, heartbeatSounds.keys()),
    );
    expect(heartbeat.variants.map(({ event }) => event)).toEqual(Object.values(heartbeatTuning.sounds));
    const preview = vi.fn();
    const root = document.createElement('div');
    render(renderHeartbeatSoundGuide(heartbeat, preview), root);

    const rows = [...root.querySelectorAll('.sound-variants li')];
    expect(rows).toHaveLength(heartbeat.variants.length);
    expect(root.querySelectorAll('button')).toHaveLength(heartbeat.variants.length * heartbeat.levels.length);
    for (const [variantIndex, variant] of heartbeat.variants.entries()) {
      const buttons = [...rows[variantIndex]!.querySelectorAll('button')];
      for (const [levelIndex, { gain }] of heartbeat.levels.entries()) {
        buttons[levelIndex]!.click();
        expect(preview).toHaveBeenNthCalledWith(
          variantIndex * heartbeat.levels.length + levelIndex + 1,
          variant.event,
          gain,
        );
      }
    }
  });
});
