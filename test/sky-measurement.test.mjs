import assert from 'node:assert/strict';
import { it } from 'node:test';
import { runInNewContext } from 'node:vm';
import { frameObservation } from '../deadvox/test/browser/sky-measurement.mjs';

it('camp observation preserves frame continuation and halt whether a frame draws or not', () => {
  let observed;
  let drawing = false;
  let continuing = true;
  const engine = {
    renderer: { info: { render: { frame: 0 } } },
    camera: { position: { toArray: () => [0, 0, 0] } },
    skylight: { inspect: () => [], stats: {} },
  };
  const evidence = {
    frames: [],
    phase: 'cold',
    previousRealMs: null,
    sample: () => 1,
    serviceRealMs: 0,
    textureRealMs: 0,
    uniformRealMs: 0,
    programRealMs: 0,
  };
  const scope = {
    engine,
    session: {},
    debugTools: {},
    scale: { blockSize: 1 },
    skyRouteEvidence: evidence,
    performance: { now: () => 0, timeOrigin: 0 },
    startRealFrames: (callback) => {
      observed = callback;
    },
    frame: () => {
      if (drawing) {
        engine.renderer.info.render.frame += 1;
      }
      return continuing;
    },
  };
  runInNewContext(frameObservation, scope);
  assert.equal(observed(), true);
  assert.equal(evidence.frames.length, 0);
  drawing = true;
  assert.equal(observed(), true);
  assert.equal(evidence.frames.length, 1);
  continuing = false;
  assert.equal(observed(), false);
  drawing = false;
  assert.equal(observed(), false);
});
