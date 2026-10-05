// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { render } from 'lit-html';
import { describe, expect, it, vi } from 'vitest';
import type { Manifest } from '../src/core/assets.ts';
import type { SoundDef } from '../src/core/content.ts';
import { HEARTBEAT_FILES } from '../src/game/audioPresentation.ts';
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
    expect(rows).toHaveLength(heartbeat.variants.length);
    expect(root.querySelectorAll('button')).toHaveLength(heartbeat.variants.length * HEARTBEAT_PREVIEW_LEVELS.length);
    heartbeat.variants.forEach((variant, variantIndex) => {
      const buttons = [...rows[variantIndex]!.querySelectorAll('button')];
      expect(buttons.map((button) => button.textContent?.trim())).toEqual(
        HEARTBEAT_PREVIEW_LEVELS.map(({ label }) => `Play ${label}`),
      );
      buttons.forEach((button) => button.click());
      HEARTBEAT_PREVIEW_LEVELS.forEach(({ gain }, levelIndex) => {
        expect(preview).toHaveBeenNthCalledWith(
          variantIndex * HEARTBEAT_PREVIEW_LEVELS.length + levelIndex + 1,
          variant.file,
          gain,
        );
      });
    });
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

  it('includes each surface-specific shambler step in the generated sheet', () => {
    const ids = ['grass', 'mud', 'sand', 'stone', 'wood', 'leaves'].map((surface) => `shambler_step_${surface}`);
    const guide = buildSoundGuide(sounds, manifest);
    expect(sounds.filter(({ id }) => id.startsWith('shambler_step_')).map(({ id }) => id)).toEqual(ids);
    const steps = guide.filter(({ id }) => id.startsWith('shambler_step_'));
    expect(steps.map(({ id }) => id)).toEqual(ids);
    expect(steps.every(({ category, noiseRadiusMetres }) => category === 'world' && noiseRadiusMetres === null)).toBe(
      true,
    );
  });

  it('lists only BR-approved door close/open variants on the generated listening sheet', () => {
    const definitions = new Map(sounds.map((sound) => [sound.id, sound]));
    const close = ['assets/audio/door_blocked_close-01.ogg'];
    const open = ['assets/audio/door-open-03.ogg'];
    expect(definitions.get('door_close')?.variants).toEqual(close);
    expect(definitions.get('door_open')?.variants).toEqual(open);
    const guide = buildSoundGuide(sounds, manifest);
    expect(guide.find(({ id }) => id === 'door_close')?.variants.map(({ file }) => file)).toEqual(close);
    expect(guide.find(({ id }) => id === 'door_open')?.variants.map(({ file }) => file)).toEqual(open);
    expect(guide.find(({ id }) => id === 'door_close')?.note).toContain('door_blocked_close');
    expect(guide.find(({ id }) => id === 'door_blocked_close')?.note).toContain('distinct stuck-door sound');
  });

  it('uses only the BR-approved leaves clip for player and shambler steps', () => {
    const definitions = new Map(sounds.map((sound) => [sound.id, sound]));
    const leaves = ['assets/audio/footstep-leaves-01.ogg'];
    expect(definitions.get('footstep_leaves')?.variants).toEqual(leaves);
    expect(definitions.get('shambler_step_leaves')?.variants).toEqual(leaves);
    const guide = buildSoundGuide(sounds, manifest);
    expect(guide.find(({ id }) => id === 'footstep_leaves')?.variants.map(({ file }) => file)).toEqual(leaves);
    expect(guide.find(({ id }) => id === 'shambler_step_leaves')?.variants.map(({ file }) => file)).toEqual(leaves);
  });

  it('uses only the selected generic swing and exposes the new drop and pouch cues without noise emission', () => {
    const definitions = new Map(sounds.map((sound) => [sound.id, sound]));
    expect(definitions.get('melee_swing')?.variants).toEqual(['assets/audio/melee_swing-01.ogg']);
    expect(definitions.get('door_blocked_close')?.variants).toEqual(['assets/audio/door_blocked_close-01.ogg']);
    for (const id of ['melee_hit_fist', 'item_drop_wood', 'pouch_take']) {
      expect(definitions.get(id)?.noise.enabled).toBe(false);
      expect(SOUND_TRIGGER_GUIDE[id as keyof typeof SOUND_TRIGGER_GUIDE]).toBeDefined();
    }
    const guide = buildSoundGuide(sounds, manifest);
    expect(guide.map(({ id }) => id)).toContain('item_drop_wood');
    expect(guide.map(({ id }) => id)).toContain('pouch_take');
    expect(guide.find(({ id }) => id === 'melee_hit_fist')?.note).toContain('Stand-in');
    expect(manifest.sources.flatMap(({ files }) => files)).toContain('assets/audio/melee_hit_fist-01.ogg');
  });

  it('keeps approved random AKM variants active and PBS-1 alternatives preview-only', () => {
    const definitions = new Map(sounds.map((sound) => [sound.id, sound]));
    expect(definitions.get('gunshot')?.variants).toEqual([
      'assets/audio/gunshot-akm-01.ogg',
      'assets/audio/gunshot-akm-02.ogg',
    ]);
    expect(definitions.get('gunshot_pbs1_reference')?.variants).toEqual([
      'assets/audio/gunshot-akm-pbs1-01.ogg',
      'assets/audio/gunshot-akm-pbs1-02.ogg',
    ]);
    expect(SOUND_TRIGGER_GUIDE.gunshot_pbs1_reference.trigger).toContain('not used by gameplay');
    expect(buildSoundGuide(sounds, manifest).find(({ id }) => id === 'gunshot_pbs1_reference')?.note).toContain(
      'future suppressor',
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
