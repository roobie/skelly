import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Manifest } from '../src/core/assets.ts';
import type { SoundDef } from '../src/core/content.ts';
import { buildSoundGuide, SOUND_TRIGGER_GUIDE } from '../src/ui/soundGuide.ts';

const sounds = JSON.parse(readFileSync('src/content/base/sounds.json', 'utf8')).sounds as SoundDef[];
const manifest = JSON.parse(readFileSync('src/content/base/assets/manifest.json', 'utf8')) as Manifest;

const eventFilePairs = (entries: ReturnType<typeof buildSoundGuide>) =>
  entries.flatMap((entry) => entry.variants.map(({ file }) => `${entry.id}\0${file}`)).sort();

describe('audio listening guide', () => {
  it('lists every sound event and every event variant from sounds.json', () => {
    const guide = buildSoundGuide(sounds, manifest);
    expect(guide.map(({ id }) => id)).toEqual(Object.keys(SOUND_TRIGGER_GUIDE));
    expect(eventFilePairs(guide)).toEqual(
      sounds.flatMap((sound) => sound.variants.map((file) => `${sound.id}\0${file}`)).sort(),
    );
  });

  it('credits every listed variant from its manifest source', () => {
    const guide = buildSoundGuide(sounds, manifest);
    expect(
      guide
        .flatMap((entry) => entry.variants)
        .every((variant) =>
          manifest.sources.some(
            (source) =>
              source.files.includes(variant.file) &&
              variant.sourcePack === source.title &&
              variant.author === (source.author ?? 'Uncredited') &&
              variant.licence === source.licence,
          ),
        ),
    ).toBe(true);
  });
});
