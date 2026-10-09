// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { render } from 'lit-html';
import { describe, expect, it, vi } from 'vitest';
import type { Manifest } from '../src/core/assets.ts';
import type { SoundDef } from '../src/core/content.ts';
import { FIREARM_SHOT_SOUND_EVENTS, HEARTBEAT_FILES } from '../src/game/audioPresentation.ts';
import {
  buildHeartbeatSoundGuide,
  buildSoundGuide,
  HEARTBEAT_PREVIEW_LEVELS,
  renderHeartbeatSoundGuide,
  SOUND_TRIGGER_GUIDE,
} from '../src/ui/soundGuide.ts';

const sounds = JSON.parse(readFileSync('src/content/base/sounds.json', 'utf8')).sounds as SoundDef[];
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

  it('renders two preview controls per heartbeat recording and sends its file and tuned gain', () => {
    const heartbeat = buildHeartbeatSoundGuide(heartbeatFixtureManifest);
    const preview = vi.fn();
    const root = document.createElement('div');
    render(renderHeartbeatSoundGuide(heartbeat, preview), root);

    const rows = [...root.querySelectorAll('.sound-variants li')];
    expect(rows.length).toBeGreaterThan(0);
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

  it('lists the player heartbeat recordings with manifest provenance', () => {
    const heartbeat = buildHeartbeatSoundGuide(manifest);
    expect(heartbeat.trigger.trim()).not.toBe('');
    expect(heartbeat.status.trim()).not.toBe('');
    expect(heartbeat.variants.map(({ file }) => file).sort()).toEqual(Object.values(HEARTBEAT_FILES).sort());
    expect(
      heartbeat.variants.every(
        ({ author, licence, sourceUrl }) =>
          author.trim() !== '' &&
          author !== 'Uncredited' &&
          licence.trim() !== '' &&
          licence !== 'Unknown licence' &&
          sourceUrl !== null,
      ),
    ).toBe(true);
  });

  it('shows a nonempty status note for every listed event', () => {
    const guide = buildSoundGuide(sounds, manifest);
    expect(guide.length).toBeGreaterThan(0);
    expect(guide).toHaveLength(sounds.length);
    expect(guide.every(({ note }) => note !== null && note.length > 0)).toBe(true);
    // Specific approval dates, wording and selections are reviewed on /sounds.html;
    // see docs/deferred-assertions.md instead of pinning mutable listening verdicts.
  });

  it('keeps every shambler surface step in the generated sheet without noise emission', () => {
    const ids = sounds.filter(({ id }) => id.startsWith('shambler_step_')).map(({ id }) => id);
    const guide = buildSoundGuide(sounds, manifest);
    const steps = guide.filter(({ id }) => id.startsWith('shambler_step_'));
    expect(steps.map(({ id }) => id)).toEqual(ids);
    expect(steps.every(({ category, noiseRadiusMetres }) => category === 'world' && noiseRadiusMetres === null)).toBe(
      true,
    );
  });

  it('keeps door close/open source variants connected to their guide entries', () => {
    const definitions = new Map(sounds.map((sound) => [sound.id, sound]));
    const guide = buildSoundGuide(sounds, manifest);
    for (const id of ['door_close', 'door_open'] as const) {
      expect(guide.find(({ id: guideId }) => guideId === id)?.variants.map(({ file }) => file)).toEqual(
        definitions.get(id)?.variants,
      );
    }
    expect(guide.find(({ id }) => id === 'door_close')?.note).toBeTruthy();
    expect(guide.find(({ id }) => id === 'door_blocked_close')?.note).toBeTruthy();
  });

  it('keeps player and shambler leaves source sets aligned', () => {
    const definitions = new Map(sounds.map((sound) => [sound.id, sound]));
    expect(definitions.get('shambler_step_leaves')?.variants).toEqual(definitions.get('footstep_leaves')?.variants);
  });

  it('uses only the selected generic swing and exposes the new drop and pouch cues without noise emission', () => {
    const definitions = new Map(sounds.map((sound) => [sound.id, sound]));
    for (const id of ['melee_hit_fist', 'item_drop_wood', 'pouch_take']) {
      expect(definitions.get(id)?.noise.enabled).toBe(false);
      expect(SOUND_TRIGGER_GUIDE[id as keyof typeof SOUND_TRIGGER_GUIDE]).toBeDefined();
    }
    const guide = buildSoundGuide(sounds, manifest);
    expect(guide.map(({ id }) => id)).toContain('item_drop_wood');
    expect(guide.map(({ id }) => id)).toContain('pouch_take');
    expect(guide.find(({ id }) => id === 'melee_hit_fist')?.note).toBeTruthy();
    expect(manifest.sources.flatMap(({ files }) => files)).toContain('assets/audio/melee_hit_fist-01.ogg');
  });

  it('credits the AR M4 shots as CC0 synthesised audio and keeps the PBS-1 event preview-only', () => {
    const definitions = new Map(sounds.map((sound) => [sound.id, sound]));
    const guide = buildSoundGuide(sounds, manifest);
    for (const id of ['gunshot_m4', 'gunshot_m4_suppressed'] as const) {
      const entry = guide.find((candidate) => candidate.id === id);
      expect(entry?.trigger).toBeTruthy();
      expect(entry?.noiseRadiusMetres).toBe(definitions.get(id)?.noise.radiusMetres);
      expect(entry?.variants.some(({ author, licence }) => author === 'BR' && licence === 'CC0-1.0')).toBe(true);
      expect(entry?.variants.every(({ author, licence }) => author === 'BR' && licence === 'CC0-1.0')).toBe(true);
    }
    expect(guide.some(({ id }) => id === 'gunshot_pbs1_reference')).toBe(true);
    expect(FIREARM_SHOT_SOUND_EVENTS.has('gunshot_pbs1_reference')).toBe(false);
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
