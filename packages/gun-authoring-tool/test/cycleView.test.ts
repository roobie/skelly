import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { motionTransform } from '@skelly/engine/assembly/motion.ts';
import { resolve } from '@skelly/engine/assembly/resolve.ts';
import { validate } from '@skelly/engine/assembly/validate.ts';
import { applyPoint } from '@skelly/engine/foundation/math.ts';
import { type Mesh, Vector3 } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveGunAction } from '../src/gun/actionDescription.ts';
import { loadGunDesign } from '../src/gun/designLoader.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { createCycleView } from '../src/viewer/cycleView.ts';
import { buildLayers, disposeGroup } from '../src/viewer/scene.ts';
import { loadFixture } from './helpers.ts';

class Control extends EventTarget {
  hidden = false;
  value = '';
  textContent = '';
  checked = false;
  max = '';
  readonly options: unknown[] = [];
  blurred = false;
  add(option: unknown): void {
    this.options.push(option);
  }
  blur(): void {
    this.blurred = true;
  }
}
function fakeOption(label: string, value: string) {
  return { label, value };
}
const stubControls = (): Record<string, Control> => {
  const controls = Object.fromEntries(
    [
      'cycle-controls',
      'cycle-mode',
      'cycle-play',
      'cycle-scrub',
      'cycle-speed',
      'cycle-empty-label',
      'cycle-empty',
      'cycle-hold-label',
      'cycle-hold',
      'cycle-xray',
      'cycle-readout',
      'cycle-notes',
    ].map((id) => [id, new Control()]),
  ) as Record<string, Control>;
  controls['cycle-mode']!.value = 'fire';
  vi.stubGlobal('document', { getElementById: (id: string) => controls[id] });
  vi.stubGlobal('Option', fakeOption);
  vi.stubGlobal('location', { search: '?cycle=fire&cycleSpeed=0.02', pathname: '/' });
  vi.stubGlobal('history', { replaceState: vi.fn() });
  vi.stubGlobal('addEventListener', vi.fn());
  return controls;
};
afterEach(() => vi.unstubAllGlobals());

describe('action cycle viewer', () => {
  it('turns the bolt before drawing it and returns both phases to the canonical pose', () => {
    const controls = stubControls();
    // The authored design names catalogue items, so only the loader expands it into an assembly.
    const loaded = loadGunDesign(
      readFileSync(join(import.meta.dirname, '..', 'designs', 'hunting-rifle.json'), 'utf8'),
    );
    if (!loaded.ok) {
      throw new Error(loaded.error.message);
    }
    const { assembly } = loaded.design;
    const resolved = resolve(assembly, gunDomain);
    const action = resolveGunAction(resolved)!;
    const knob = action.parts.knob!;
    const layers = buildLayers(validate(assembly, gunDomain), []);
    try {
      let mesh: Mesh | undefined;
      layers.solids.traverse((object) => {
        if (object.userData.part === knob.id && (object as Mesh).isMesh) {
          mesh ??= object as Mesh;
        }
      });
      if (!mesh) {
        throw new Error('Bolt knob mesh is missing');
      }
      const view = createCycleView();
      view.bind(layers.solids, resolved, action);
      expect(controls['cycle-mode']!.value).toBe('hand');
      const { hand } = action.cycle;
      const drawEnd = hand.unlockSeconds! + hand.rearwardSeconds;
      const lockEnd = drawEnd + hand.dwellSeconds + hand.forwardSeconds + hand.lockSeconds!;
      for (const [seconds, draw, turn] of [
        [hand.unlockSeconds!, 0, 1],
        [drawEnd, 1, 1],
        [lockEnd, 0, 0],
      ]) {
        controls['cycle-scrub']!.value = String(seconds! * 1000);
        controls['cycle-scrub']!.dispatchEvent(new Event('input'));
        const expected = motionTransform(knob.placed, knob.def.motion!, draw!, turn!);
        for (const point of [
          [0, 0, 0],
          [1, 0, 0],
        ] as const) {
          const actual = new Vector3(...point).applyMatrix4(mesh.matrix).toArray();
          applyPoint(expected, point).forEach((coordinate, axis) => {
            expect(actual[axis]).toBeCloseTo(coordinate, 8);
          });
        }
      }
    } finally {
      for (const group of Object.values(layers)) {
        disposeGroup(group);
      }
    }
  });
  it('moves the real AR handle with the hand stroke but keeps it home during firing', () => {
    const controls = stubControls();
    const assembly = loadFixture('archetype-ar');
    const resolved = resolve(assembly, gunDomain);
    const action = resolveGunAction(resolved)!;
    const layers = buildLayers(validate(assembly, gunDomain), []);
    try {
      let handle: Mesh | undefined;
      let carrier: Mesh | undefined;
      layers.solids.traverse((object) => {
        if (!(object as Mesh).isMesh) {
          return;
        }
        if (String(object.userData.label).includes('solid charging-handle')) {
          handle ??= object as Mesh;
        }
        if (object.userData.part === action.carrier.id) {
          carrier ??= object as Mesh;
        }
      });
      if (!(handle && carrier)) {
        throw new Error('AR action meshes are missing');
      }
      const home = handle.matrix.toArray();
      const carrierHome = carrier.matrix.toArray();
      const view = createCycleView();
      view.bind(layers.solids, resolved, action);
      controls['cycle-mode']!.value = 'hand';
      controls['cycle-mode']!.dispatchEvent(new Event('change'));
      controls['cycle-scrub']!.value = String(action.cycle!.hand.rearwardSeconds * 1000);
      controls['cycle-scrub']!.dispatchEvent(new Event('input'));
      const motion = action.carrier.def.motion!;
      const expectedDisplacement = -(motion.end[0] - motion.start[0]);
      const handleDisplacement = handle.matrix.elements[12]! - home[12]!;
      const carrierDisplacement = carrier.matrix.elements[12]! - carrierHome[12]!;
      expect(handleDisplacement).toBeCloseTo(expectedDisplacement, 9);
      expect(carrierDisplacement).toBeCloseTo(expectedDisplacement, 9);
      expect(handleDisplacement).toBeCloseTo(carrierDisplacement, 9);
      const { hand } = action.cycle!;
      controls['cycle-scrub']!.value = String((hand.rearwardSeconds + hand.dwellSeconds + hand.forwardSeconds) * 1000);
      controls['cycle-scrub']!.dispatchEvent(new Event('input'));
      expect(handle.matrix.toArray()).toEqual(home);
      controls['cycle-mode']!.value = 'fire';
      controls['cycle-mode']!.dispatchEvent(new Event('change'));
      const fire = action.cycle?.fire;
      if (!fire) {
        throw new Error('AR action has no fire cycle');
      }
      controls['cycle-scrub']!.value = String(fire.durationSeconds * 500);
      controls['cycle-scrub']!.dispatchEvent(new Event('input'));
      expect(handle.matrix.toArray()).toEqual(home);
      expect(carrier.matrix.toArray()).not.toEqual(carrierHome);
    } finally {
      for (const group of Object.values(layers)) {
        disposeGroup(group);
      }
    }
  });

  it('shows the SMG handle held in its notch while held and home after release', () => {
    const controls = stubControls();
    const loaded = loadGunDesign(readFileSync(join(import.meta.dirname, '..', 'designs', 'compact-smg.json'), 'utf8'));
    if (!loaded.ok) {
      throw new Error(loaded.error.message);
    }
    const { assembly } = loaded.design;
    const resolved = resolve(assembly, gunDomain);
    const action = resolveGunAction(resolved)!;
    const handle = action.parts.handle!;
    const layers = buildLayers(validate(assembly, gunDomain), []);
    try {
      let mesh: Mesh | undefined;
      layers.solids.traverse((object) => {
        if (object.userData.part === handle.id && (object as Mesh).isMesh) {
          mesh ??= object as Mesh;
        }
      });
      if (!mesh) {
        throw new Error('SMG handle mesh is missing');
      }
      const expectPose = (draw: number, turn: number, label: string) => {
        const expected = motionTransform(handle.placed, handle.def.motion!, draw, turn);
        for (const point of [
          [0, 0, 0],
          [0, 0, 1],
        ] as const) {
          const actual = new Vector3(...point).applyMatrix4(mesh!.matrix).toArray();
          applyPoint(expected, point).forEach((coordinate, axis) => {
            expect(actual[axis], label).toBeCloseTo(coordinate, 6);
          });
        }
      };
      const view = createCycleView();
      view.bind(layers.solids, resolved, action);
      controls['cycle-mode']!.value = 'hand';
      controls['cycle-mode']!.dispatchEvent(new Event('change'));
      expect(controls['cycle-hold-label']!.hidden).toBe(false);
      controls['cycle-hold']!.checked = true;
      controls['cycle-play']!.dispatchEvent(new Event('click'));
      const { hand } = action.cycle;
      // The query asks for 2% speed; each frame advances a tenth of a cycle.
      const frameSeconds = hand.durationSeconds / 10 / 0.02;
      for (let index = 0; index < 30; index++) {
        view.frame(frameSeconds);
      }
      expectPose(1, 1, 'held');
      controls['cycle-hold']!.checked = false;
      view.frame((hand.durationSeconds - hand.holdSeconds!) / 0.02);
      expectPose(0, 0, 'released');
    } finally {
      for (const group of Object.values(layers)) {
        disposeGroup(group);
      }
    }
  });

  it('restores the canonical AR carrier pose when rebinding the same meshes after a mode switch', () => {
    const controls = stubControls();
    const assembly = loadFixture('archetype-ar');
    const resolved = resolve(assembly, gunDomain);
    const layers = buildLayers(validate(assembly, gunDomain), []);
    try {
      let carrier: Mesh | undefined;
      layers.solids.traverse((object) => {
        if (object.userData.part === 'bolt-carrier' && (object as Mesh).isMesh) {
          carrier ??= object as Mesh;
        }
      });
      if (!carrier) {
        throw new Error('AR carrier mesh was not built.');
      }
      const restPose = carrier.matrix.toArray();
      const view = createCycleView();
      view.bind(layers.solids, resolved, resolveGunAction(resolved));
      const action = resolveGunAction(resolved)!;
      const fire = action.cycle?.fire;
      if (!fire) {
        throw new Error('AR action has no fire cycle');
      }
      controls['cycle-scrub']!.value = String(fire.durationSeconds * 500);
      controls['cycle-scrub']!.dispatchEvent(new Event('input'));
      expect(carrier.matrix.toArray()).not.toEqual(restPose);
      for (const mode of ['hand', 'fire', 'hand', 'fire']) {
        controls['cycle-mode']!.value = mode;
        controls['cycle-mode']!.dispatchEvent(new Event('change'));
        expect(carrier.matrix.toArray(), `rest pose after switching to ${mode}`).toEqual(restPose);
      }
    } finally {
      for (const group of Object.values(layers)) {
        disposeGroup(group);
      }
    }
  });
});
