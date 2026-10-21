// @vitest-environment happy-dom
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from 'lit-html';
import { describe, expect, it, vi } from 'vitest';
import type { Manifest } from '../src/core/assets.ts';
import type { SoundDef } from '../src/core/content.ts';
import { soundVariantKey } from '../src/core/soundSynth.ts';
import { HEARTBEAT_FILES } from '../src/game/audioPresentation.ts';
import {
  buildHeartbeatSoundGuide,
  buildSoundGuide,
  HEARTBEAT_PREVIEW_LEVELS,
  renderHeartbeatSoundGuide,
  SOUND_TRIGGER_GUIDE,
} from '../src/ui/soundGuide.ts';

const sounds = readdirSync('src/content/base')
  .filter((file) => file.startsWith('sounds') && file.endsWith('.json'))
  .flatMap((file) => JSON.parse(readFileSync(join('src/content/base', file), 'utf8')).sounds as SoundDef[]);
const manifest = JSON.parse(readFileSync('src/content/base/assets/manifest.json', 'utf8')) as Manifest;

const heartbeatFixtureManifest = {
  sources: [
    {
      title: 'Heartbeat fixture',
      author: 'Fixture author',
      licence: 'CC0-1.0',
      url: 'https://example.test/heartbeat',
      download: null,
      files: Object.values(HEARTBEAT_FILES),
      changes: 'Fixture provenance',
    },
  ],
} as Manifest;

const [recordingId, recipeId] = Object.keys(SOUND_TRIGGER_GUIDE);
if (!(recordingId && recipeId)) {
  throw new Error('Sound trigger guide fixture needs two entries');
}

const fixtureRecipe = { recipe: 'fixture-recipe', jfxr: {} };
const fixtureSounds = [
  {
    id: recordingId,
    category: 'world',
    variants: ['fixture.ogg'],
    noise: { enabled: false, radiusMetres: 0 },
  },
  {
    id: recipeId,
    category: 'ui',
    variants: [fixtureRecipe],
    noise: { enabled: false, radiusMetres: 0 },
  },
] as unknown as SoundDef[];
const fixtureManifest = {
  sources: [
    {
      title: 'Fixture source',
      author: 'Fixture author',
      licence: 'CC0-1.0',
      url: 'https://example.test/source',
      download: null,
      files: ['fixture.ogg'],
      changes: 'Fixture provenance',
    },
  ],
} as Manifest;

describe('audio listening guide', () => {
  it('maps fixture events and variants to guide entries', () => {
    const guide = buildSoundGuide(fixtureSounds, fixtureManifest);
    expect(guide.map(({ id }) => id)).toEqual(fixtureSounds.map(({ id }) => id));
    expect(guide.flatMap((entry) => entry.variants.map(({ file }) => `${entry.id}\0${file}`))).toEqual([
      `${recordingId}\0${soundVariantKey(recordingId, 'fixture.ogg')}`,
      `${recipeId}\0${soundVariantKey(recipeId, fixtureRecipe)}`,
    ]);
  });

  it('resolves fixture recording provenance while leaving recipes uncredited', () => {
    const variants = buildSoundGuide(fixtureSounds, fixtureManifest).flatMap((entry) => entry.variants);
    const recording = variants.find(({ file }) => file.endsWith('fixture.ogg'))!;
    const recipe = variants.find(({ synthesised }) => synthesised)!;
    expect(recording).toMatchObject({ author: 'Fixture author', licence: 'CC0-1.0', sourcePack: 'Fixture source' });
    expect(recipe.synthesised).toBe(true);
    expect(recipe.sourceUrl).toBeNull();
  });

  it('keeps every production sound event in the guide with a nonempty note', () => {
    const guide = buildSoundGuide(sounds, manifest);
    expect(guide.map(({ id }) => id).sort()).toEqual(sounds.map(({ id }) => id).sort());
    expect(guide.every(({ note }) => note !== null && note.trim() !== '')).toBe(true);
  });

  it('marks a recorded fixture variant missing from manifest provenance', () => {
    const [variant] = buildSoundGuide(fixtureSounds.slice(0, 1), { sources: [] })[0]!.variants;
    expect(variant).toMatchObject({
      author: 'Uncredited',
      licence: 'Unknown licence',
      sourcePack: 'Missing source in assets/manifest.json',
      sourceUrl: null,
    });
  });

  it('renders two preview controls per heartbeat recording and sends its file and tuned gain', () => {
    const heartbeat = buildHeartbeatSoundGuide(heartbeatFixtureManifest);
    const preview = vi.fn();
    const root = document.createElement('div');
    render(renderHeartbeatSoundGuide(heartbeat, preview), root);

    const rows = [...root.querySelectorAll('.sound-variants li')];
    expect(rows).toHaveLength(heartbeat.variants.length);
    expect(root.querySelectorAll('button')).toHaveLength(heartbeat.variants.length * HEARTBEAT_PREVIEW_LEVELS.length);
    for (const [variantIndex, variant] of heartbeat.variants.entries()) {
      const buttons = [...rows[variantIndex]!.querySelectorAll('button')];
      for (const [levelIndex, { gain }] of HEARTBEAT_PREVIEW_LEVELS.entries()) {
        buttons[levelIndex]!.click();
        expect(preview).toHaveBeenNthCalledWith(
          variantIndex * HEARTBEAT_PREVIEW_LEVELS.length + levelIndex + 1,
          variant.file,
          gain,
        );
      }
    }
  });
});
