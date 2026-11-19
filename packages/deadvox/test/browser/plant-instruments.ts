import { ContentFileSchema } from '@skelly/engine/internal/core/schema.ts';
import { createPlantInstrument } from '@skelly/presentation/internal/render/plantInstruments.ts';
import { housingFaults } from '@skelly/presentation/internal/ui/housingFaults.ts';
import {
  AmbientLight,
  Box3,
  Color,
  Mesh,
  MeshLambertMaterial,
  PerspectiveCamera,
  Scene,
  Sphere,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { parse } from 'valibot';
import inventoryContent from '../../../mods/skelly.inventory/inventory.json' with { type: 'json' };
import fixture from '../../mods/skelly.deadvox.scenario.test-house.plant-instruments-look/instruments.json' with {
  type: 'json',
};
import type { PlayTestHandle } from './playTestHandle.ts';

/** Isolated instrument pixels extend the cellar smoke flow without competing with the game's render loop. */
export function plantInstrumentsProof() {
  const look = parse(ContentFileSchema, fixture).furniture!.find((definition) => definition.power?.instruments)!.power!
    .instruments!;
  const bands = parse(ContentFileSchema, inventoryContent).inventory![0]!.conditionBands;
  const instrument = createPlantInstrument(look, bands);
  const renderer = new WebGLRenderer();
  const target = new WebGLRenderTarget(256, 256);
  target.texture.colorSpace = SRGBColorSpace;
  const scene = new Scene();
  scene.background = new Color('black');
  scene.add(instrument.group);
  const bounds = new Box3().setFromObject(instrument.group).getBoundingSphere(new Sphere());
  const camera = new PerspectiveCamera(45, 1, 0.01, bounds.radius * 20);
  camera.position.copy(bounds.center).add(new Vector3(0, 0, -bounds.radius * 3));
  camera.lookAt(bounds.center);
  const pixels = new Uint8Array(target.width * target.height * 4);
  const sample = () => {
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(target, 0, 0, target.width, target.height, pixels);
    let brightness = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      brightness += pixels[index]! + pixels[index + 1]! + pixels[index + 2]!;
    }
    return brightness;
  };
  const band = bands.find((entry) => look.dial.bands[entry.word] !== undefined)!;
  const reading = { producing: true, band, failures: [] };
  try {
    instrument.update(reading, 0);
    const runningDark = sample();
    const angle = instrument.pin.rotation.z;
    instrument.update(reading, look.dial.swayPeriodSimSeconds / 4);
    const swayed = instrument.pin.rotation.z;
    const step = look.dial.bands[band.word]!;
    const clearance =
      Math.min(
        ...look.dial.steps
          .filter((_, index) => index !== step)
          .map((degrees) => Math.abs(degrees - look.dial.steps[step]!)),
      ) / 2;
    const withinDetent = (Math.abs(swayed - angle) * 180) / Math.PI < clearance;
    instrument.run.visible = false;
    const nonEmittingDark = sample();
    instrument.run.visible = true;
    instrument.update(
      { producing: false, band: undefined, failures: [{ slot: look.flags[0]!.slot, cause: 'insufficient' }] },
      0,
    );
    const stoppedAngle = instrument.pin.rotation.z;
    instrument.update(
      { producing: false, band: undefined, failures: [{ slot: look.flags[0]!.slot, cause: 'insufficient' }] },
      look.dial.swayPeriodSimSeconds / 4,
    );
    const stoppedStill = stoppedAngle === instrument.pin.rotation.z;
    const slotBound = instrument.flags.every(
      (flag) =>
        flag.dropped.visible === (flag.slot === look.flags[0]!.slot) && flag.raised.visible !== flag.dropped.visible,
    );
    const stoppedDark = sample();
    scene.add(new AmbientLight('white', 1));
    const incidentLit = sample();
    return { runningDark, nonEmittingDark, stoppedDark, incidentLit, withinDetent, stoppedStill, slotBound };
  } finally {
    instrument.dispose();
    target.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}

export function plantInstrumentFixtureProof({ session, engine }: PlayTestHandle) {
  const { inventory, power } = session;
  const rows = [...inventory.entities.all].filter((entity) => inventory.entities.defOf(entity).power?.instruments);
  if (rows.length === 0) {
    throw new Error('The instrument fixture did not furnish any instrument housings');
  }
  return rows.map((entity) => {
    const look = inventory.entities.defOf(entity).power!.instruments!;
    const reading = power?.instruments(entity);
    const group = engine.scene.getObjectByName(`plant-instrument:${entity.uid}`);
    const run = group?.getObjectByName('run');
    const pin = group?.getObjectByName('pin');
    if (!(reading && group && pin && run instanceof Mesh && run.material instanceof MeshLambertMaterial)) {
      throw new Error('An instrument projection or scene object is missing');
    }
    const step = reading.producing ? look.dial.bands[reading.band!.word]! : look.dial.stoppedStep;
    const angleError = Math.abs((pin.rotation.z * 180) / Math.PI - look.dial.steps[step]!);
    return {
      visible: group.visible,
      faults: housingFaults(inventory.registry, entity, power),
      lampMatches: run.material.emissiveIntensity > 0 === reading.producing,
      dialMatches: angleError <= (reading.producing ? look.dial.swayAmplitudeDegrees : 0) + 1e-9,
      flagsMatch: look.flags.every(({ slot }) => {
        const dropped = group.getObjectByName(`slot:${slot}:dropped`);
        const raised = group.getObjectByName(`slot:${slot}:raised`);
        return (
          dropped?.visible === reading.failures.some((failure) => failure.slot === slot) &&
          raised?.visible !== dropped?.visible
        );
      }),
    };
  });
}
