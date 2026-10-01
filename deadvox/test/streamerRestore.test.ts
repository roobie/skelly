import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeScale } from '../src/core/scale.ts';
import { World } from '../src/core/world.ts';
import { generateColumn } from '../src/core/worldgen.ts';
import { Streamer } from '../src/game/streamer.ts';

class QuietWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  postMessage(): void {
    // The test deliberately prevents worker execution.
  }
  terminate(): void {
    // The test worker owns no external resources.
  }
}

afterEach(() => vi.unstubAllGlobals());

describe('lazy restored world diffs', () => {
  it('turns a generated-base mismatch into a refusal callback instead of throwing from Streamer.update', () => {
    vi.stubGlobal('Worker', QuietWorker);
    const scale = makeScale(0.5);
    const terrain = { grass: 1, dirt: 2, stone: 3, sand: 4 };
    const generated = generateColumn({ seed: 17, blocks: terrain, scale }, 0, 0, [])[0]!;
    const actualBase = generated.at(0);
    const wrongBase = actualBase === 0xff_ff ? 0xff_fe : 0xff_ff;
    const world = new World();
    world.restoreDiffs(
      {
        chunks: [{ cx: 0, cy: scale.minCy, cz: 0, cells: [{ index: 0, base: 'base', id: 'changed' }] }],
      },
      (id) => (id === 'base' ? wrongBase : 0),
    );
    const meshes = { keys: () => [], set: vi.fn(), remove: vi.fn() };
    const streamer = new Streamer({
      world,
      meshes: meshes as never,
      seed: 17,
      terrain,
      colors: new Uint8Array(256 * 4),
      patterns: new Uint8Array(256),
      scale,
      structures: [],
      radius: 0,
    });
    const failures: unknown[] = [];
    const title = { continueEnabled: true, status: '' };
    streamer.onGenerationError = (error) => {
      failures.push(error);
      title.continueEnabled = false;
      title.status = `Saved world unreadable: ${error instanceof Error ? error.message : String(error)}`;
    };

    expect(() => streamer.update(0, 0)).not.toThrow();
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ message: expect.stringContaining('Generated base mismatch') });
    expect(title).toEqual({
      continueEnabled: false,
      status: expect.stringContaining('Saved world unreadable: Generated base mismatch'),
    });
    expect(world.snapshotDiffs((id) => String(id)).chunks).toHaveLength(1);
    expect(() => streamer.update(0, 0)).not.toThrow();
    expect(failures).toHaveLength(1);
  });
});
