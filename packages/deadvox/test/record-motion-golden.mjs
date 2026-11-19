// @ts-nocheck -- written against the reader this fixture was recorded from, not the one in this tree.
// Records test/fixtures/motionReaderGolden.json from the reader the shared motion reader replaced: per-part axis, stroke
// and turn on the guns, thing-core's mirrorMotion and posePoint on the vehicles. It cannot run on this tree.
//
// To record again, check out skelly at 46d8bcf94 (the last commit before the reader changed) and copy this file and
// record-motion-golden.config.mjs into packages/deadvox/test/ there (they sit there already, as vitest includes only
// that directory). The two halves need different skelly-assets,
// as the guns' and the vehicles' old shapes were never exported together. From packages/deadvox:
//  - guns: with skelly-assets at 897c2e04, build every gun row with an action (the assets' build tool, given
//    `--out DIR` and the rows rifle_assault, rifle_ak, shotgun_pump, rifle_hunting and pistol_service), then
//    GOLDEN_PART=guns GOLDEN_BUILT=DIR/skelly.firearms GOLDEN_OUT=FILE vitest run --config test/record-motion-golden.config.mjs
//  - vehicles: with skelly-assets at v0.13.0 (85b57cca), generate its sources with the assets' sources tool, then
//    GOLDEN_PART=vehicles GOLDEN_OUT=FILE vitest run --config test/record-motion-golden.config.mjs
// Both write the same FILE, each keeping what the other recorded; format it over test/fixtures/motionReaderGolden.json.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { buildRegistry, loadVehicleBlueprint, ModelSchema } from '@skelly/engine/content';
import { actionCycleSeconds, actionOpenSeconds, actionPhaseSeconds, ejectSeconds } from '@skelly/engine/inventory';
import { posePoint } from '@skelly/motion/motion';
import {
  actionPartPaths,
  cloneHeldModel,
  poseActionParts,
  posePartShares,
  rackGrip,
  sampleActionPose,
} from '@skelly/presentation/internal/render/firearmModel.ts';
import { prepareModel } from '@skelly/presentation/internal/render/models.ts';
import { Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { parse } from 'valibot';
import { it } from 'vitest';
import pistolContent from '../../mods/skelly.firearms/items-pistol.json' with { type: 'json' };
import firearmContent from '../../mods/skelly.firearms/models-firearms.json' with { type: 'json' };
import { baseSources } from '../src/product/content.ts';

const OUT = process.env.GOLDEN_OUT;
const BUILT = process.env.GOLDEN_BUILT;
const PART = process.env.GOLDEN_PART;
const SAMPLES = 20;
const SHARES = [0, 0.1, 0.3, 0.5, 1];

const SOURCE = {
  note: "Recorded with the pre-motion-reader code (guns: ActionSchema parts with axis/strokeMetres/turn and the cycle phases; vehicles: thing-core mirrorMotion + posePoint). Matrices are the held model's action-part node matrices (column-major, model units in metres). Hand grips are the grip points of the parts that carry one, in the model frame as posed.",
  guns: 'skelly-assets 897c2e04 (last commit before the gun-action motion shape), built locally',
  vehicles:
    'skelly-assets v0.13.0 (85b57cca): 897c2e04 already exports the vehicle {stages, stops} shape the old reader cannot read',
  recorder: 'packages/deadvox/test/record-motion-golden.mjs',
};

const recordGuns = async () => {
  const guns = {};
  for (const raw of [...firearmContent.models, ...pistolContent.models]) {
    const model = parse(ModelSchema, raw);
    const action = model.gun?.action;
    if (!action) {
      continue;
    }
    const bytes = readFileSync(resolve(BUILT, model.file));
    const gltf = await new GLTFLoader().parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      '',
    );
    const clone = cloneHeldModel(
      prepareModel(model, gltf.scene).held,
      actionPartPaths(gltf.scene, action, gltf.parser),
    );
    const matrices = () =>
      Object.fromEntries(
        clone.parts.map((part) => {
          part.node.updateMatrix();
          return [part.id, [...part.node.matrix.elements]];
        }),
      );
    const handGrips = () =>
      Object.fromEntries(
        clone.parts
          .filter((part) => part.handGrip)
          .map((part) => [part.id, part.handGrip.clone().applyMatrix4(part.node.matrix).toArray()]),
      );
    const modes = ['hand', 'fire'].filter((mode) => mode === 'hand' || action.roundsPerSimMinute !== undefined);
    const timings = Object.fromEntries(
      modes.flatMap((mode) => [
        [`cycle.${mode}`, actionCycleSeconds(action, mode)],
        [`eject.${mode}`, ejectSeconds(action, mode)],
        [`phase.${mode}`, actionPhaseSeconds(action, mode)],
        ...(mode === 'hand'
          ? [
              ['phase.hand.open', actionPhaseSeconds(action, mode, 'open')],
              ['phase.hand.close', actionPhaseSeconds(action, mode, 'close')],
            ]
          : []),
      ]),
    );
    // The forward sound sounded where the part returned: after the pump's rearward stroke and dwell, else when the action opened.
    const pump = [...firearmContent.items, ...pistolContent.items].some(
      (item) => item.model === model.id && item.firearm?.pump,
    );
    Object.assign(timings, {
      open: actionOpenSeconds(action),
      forwardSound: pump ? action.hand.rearwardSimSeconds + action.hand.dwellSimSeconds : actionOpenSeconds(action),
    });
    const poses = {};
    for (const mode of modes) {
      for (const scale of mode === 'hand' ? [1, 1.3] : [1]) {
        const duration = actionCycleSeconds(action, mode) * scale;
        poses[`${mode}x${scale}`] = Array.from({ length: SAMPLES }, (_, i) => {
          const elapsed = (duration * i) / (SAMPLES - 1);
          const pose = sampleActionPose(action, { mode, elapsed, duration, actionOpen: false });
          poseActionParts(clone.parts, pose.mode, pose.stroke, pose.turn);
          return {
            elapsed,
            stroke: pose.stroke,
            ...(mode === 'hand' ? { rack: rackGrip(action, elapsed, duration) } : {}),
            parts: matrices(),
            handGrips: handGrips(),
          };
        });
      }
    }
    const open = sampleActionPose(action, { mode: 'hand', elapsed: 0, duration: 1, actionOpen: true });
    poseActionParts(clone.parts, open.mode, open.stroke, open.turn);
    const heldOpen = matrices();
    const shares = SHARES.map((share) => {
      posePartShares(clone.parts, Object.fromEntries(clone.parts.map((part) => [part.id, share])));
      return { share, parts: matrices() };
    });
    const grips = Object.fromEntries(
      clone.parts.map((part) => [
        part.id,
        {
          travel: part.travel.toArray(),
          ...(part.handGrip ? { handGrip: part.handGrip.toArray() } : {}),
          hinged: part.turn !== undefined,
        },
      ]),
    );
    guns[model.id] = { timings, poses, open: heldOpen, shares, grips };
  }
  return guns;
};

const recordVehicles = (registry) => {
  const vehicles = {};
  for (const id of registry.vehicleBlueprints.keys()) {
    const moving = loadVehicleBlueprint(registry, id).fittings.filter((fitting) => fitting.motion);
    if (moving.length === 0) {
      continue;
    }
    vehicles[id] = Object.fromEntries(
      moving.map((fitting) => {
        const box = fitting.collision[0];
        const points = [fitting.centreOfMass, box.min, box.max].map((point) => new Vector3(...point).toArray());
        return [
          fitting.id,
          {
            points,
            samples: Array.from({ length: SAMPLES }, (_, i) => {
              const clock = i / (SAMPLES - 1);
              return { clock, points: points.map((point) => posePoint(fitting.motion, point, clock)) };
            }),
          },
        ];
      }),
    );
  }
  return vehicles;
};

const recordVehiclesFromContent = () => {
  const { registry, issues } = buildRegistry(baseSources);
  if (issues.length > 0) {
    throw new Error(JSON.stringify(issues.slice(0, 3)));
  }
  return recordVehicles(registry);
};

it('records the previous reader', async () => {
  const kept = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
  const recorded = PART === 'guns' ? { guns: await recordGuns() } : { vehicles: recordVehiclesFromContent() };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({ source: SOURCE, ...kept, ...recorded }));
}, 600_000);
