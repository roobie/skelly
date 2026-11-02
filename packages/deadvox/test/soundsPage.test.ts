import { setImmediate } from 'node:timers/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { soundVariantKey } from '../src/core/soundSynth.ts';
import { GameAudio } from '../src/game/audio.ts';
import { buildSoundsPageContent } from '../src/soundsPageContent.ts';
import { fixtureIds as CORE_CONTENT_IDS } from './fixtures/capabilityIds.ts';
import { BASE_SENSE_TUNING } from './senseFixture.ts';

let context: SuspendedAudioContext | undefined;

// Stays suspended, so a preview stops after decoding and never needs a source graph.
class SuspendedAudioContext {
  constructor() {
    context = this;
  }
  state = 'suspended';
  destination = {};
  listener = { setPosition: () => undefined, setOrientation: () => undefined };
  decodeAudioData = vi.fn(() => Promise.resolve({} as AudioBuffer));
  createGain() {
    return { gain: { value: 0 }, connect: () => undefined };
  }
  resume() {
    return Promise.resolve();
  }
}

afterEach(() => vi.unstubAllGlobals());

describe('listening sheet', () => {
  it('loads the player sense tuning that its audio previews with', () => {
    const { registry } = buildSoundsPageContent();

    expect(registry.senses.get(CORE_CONTENT_IDS.player)).toBeDefined();
  });

  it('previews a recorded variant from the bundled pack files', async () => {
    vi.stubGlobal('AudioContext', SuspendedAudioContext);
    const fetchBuffer = vi.fn(() =>
      Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) } as Response),
    );
    vi.stubGlobal('fetch', fetchBuffer);
    const { registry, issues } = buildSoundsPageContent();
    expect(issues).toEqual([]);
    const [recorded] = [...registry.sounds.values()].flatMap((sound) =>
      sound.variants.filter((variant) => typeof variant === 'string').map((variant) => ({ sound, variant })),
    );
    expect(recorded).toBeDefined();
    const report = vi.fn();
    const audio = new GameAudio({ registry, blockSize: 1, isSolid: () => false, tuning: BASE_SENSE_TUNING, report });
    audio.unlock();

    expect(audio.preview(recorded!.sound.id, soundVariantKey(recorded!.sound.id, recorded!.variant))).toBe(true);
    await setImmediate();

    expect(report).not.toHaveBeenCalled();
    expect(fetchBuffer).toHaveBeenCalledOnce();
    expect(context?.decodeAudioData).toHaveBeenCalledOnce();
    audio.dispose();
  });
});
