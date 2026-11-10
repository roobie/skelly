import { setImmediate } from 'node:timers/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { soundVariantKey } from '../../engine/src/sound.ts';
import { GameAudio } from '../src/presentation/audio.ts';
import { productAssets } from '../src/product/assets.ts';
import { buildSoundsPageContent } from '../src/soundsPageContent.ts';
import { baseRegistry } from './baseRegistry.ts';
import { fixtureIds } from './fixtures/capabilityIds.ts';
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

    expect(registry.senses.get(fixtureIds.player)).toBeDefined();
  });

  it('lists every sound a base door selects, whichever mod holds it', () => {
    const { registry: page } = buildSoundsPageContent();
    const selected = [...baseRegistry().furniture.values()]
      .flatMap(({ door }) => (door ? [door.openSound, door.closeSound, door.blockedCloseSound] : []))
      .filter((id) => id !== undefined);

    expect(selected.length).toBeGreaterThan(0);
    expect(selected.filter((id) => !page.sounds.has(id))).toEqual([]);
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
    const audio = new GameAudio({
      registry,
      blockSize: 1,
      isSolid: () => false,
      tuning: BASE_SENSE_TUNING,
      report,
      files: productAssets.audio,
    });
    audio.unlock();

    expect(audio.preview(recorded!.sound.id, soundVariantKey(recorded!.sound.id, recorded!.variant))).toBe(true);
    await setImmediate();

    expect(report).not.toHaveBeenCalled();
    expect(fetchBuffer).toHaveBeenCalledOnce();
    expect(context?.decodeAudioData).toHaveBeenCalledOnce();
    audio.dispose();
  });
});
