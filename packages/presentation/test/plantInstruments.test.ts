import { simSeconds } from '@skelly/engine/sim';
import { OrthographicCamera, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { createPlantInstrument } from '../src/render/plantInstruments.ts';

type Look = Parameters<typeof createPlantInstrument>[0];
type Anchors = NonNullable<Parameters<typeof createPlantInstrument>[2]>;

const band = { from: 0, word: 'fixture', color: '#ffffff' };
const fixtureLook = (): Look => ({
  kind: 'plant',
  offset: [0, 0, 0],
  panel: [{ position: [0, 0, 0], size: [2, 2, 0.1], color: '#ffffff' }],
  labels: [],
  run: { position: [0, 1, 0], size: [0.1, 0.1, 0.1], color: '#ffffff', emissive: 1, intensity: 1, radius: 1 },
  dial: {
    pivot: [0, 0, 0],
    steps: [-45, 45],
    stoppedStep: 0,
    stoppedColor: '#ffffff',
    bands: { fixture: 1 },
    tickBands: { '1': 'fixture' },
    tickRadius: 1,
    tickSize: [0.1, 0.1, 0.1],
    tickDepth: 0,
    pin: [{ position: [0, 0.5, 0], size: [0.1, 1, 0.1], color: '#ffffff' }],
    swayAmplitudeDegrees: 0,
    swayPeriodSimSeconds: simSeconds(1),
  },
  flags: [],
});

it('stands each slot flag on its anchor mount, so flags of anchored slots do not stack on the panel', () => {
  const box = [{ position: [0, 0, 0], size: [0.1, 0.1, 0.1], color: '#ffffff' }] satisfies Look['panel'];
  const look = {
    ...fixtureLook(),
    offset: [0.5, 1, 0],
    flags: ['a', 'b'].map((slot) => ({ slot, name: slot, raised: box, dropped: box })),
  } satisfies Look;
  const anchors: Anchors = [
    { slot: 'a', position: [1, 0, 0], pickSize: [1, 1, 1], flagMount: { position: [0, 0.5, 0] } },
    {
      slot: 'b',
      position: [2, 0, 1],
      orientationDegrees: [0, 90, 0],
      pickSize: [1, 1, 1],
      flagMount: { position: [0.5, 0, 0], orientationDegrees: [0, 0, 30] },
    },
  ];
  const instrument = createPlantInstrument(look, [band], anchors);
  try {
    instrument.group.updateMatrixWorld(true);
    const stands = instrument.flags.map((flag) => flag.raised.getWorldPosition(new Vector3()));
    expect(stands[0]!.distanceTo(stands[1]!)).toBeGreaterThan(0);
    for (const [index, { position, flagMount }] of anchors.entries()) {
      const anchor = new Vector3(...position).sub(new Vector3(...look.offset));
      expect(stands[index]!.distanceTo(anchor)).toBeCloseTo(new Vector3(...flagMount!.position).length());
      expect(instrument.flags[index]!.dropped.getWorldPosition(new Vector3())).toEqual(stands[index]);
    }
  } finally {
    instrument.dispose();
  }
});

it('reads dial angles clockwise from vertical when viewed from the panel front', () => {
  const instrument = createPlantInstrument(fixtureLook(), [band]);
  const camera = new OrthographicCamera(-2, 2, 2, -2, 0.1, 10);
  camera.position.set(0, 0, -5);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const pinX = () => {
    instrument.group.updateMatrixWorld(true);
    return instrument.pin.localToWorld(new Vector3(0, 1, 0)).project(camera).x;
  };
  const tickX = (index: number) =>
    instrument.group.getObjectByName(`tick:${index}`)!.getWorldPosition(new Vector3()).project(camera).x;
  try {
    instrument.update({ producing: false, band: undefined, failures: [] }, 0);
    expect(pinX()).toBeLessThan(0);
    expect(tickX(0)).toBeCloseTo(pinX());
    instrument.update({ producing: true, band, failures: [] }, 0);
    expect(pinX()).toBeGreaterThan(0);
    expect(tickX(1)).toBeCloseTo(pinX());
  } finally {
    instrument.dispose();
  }
});
