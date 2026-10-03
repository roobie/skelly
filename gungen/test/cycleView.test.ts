import type { Mesh } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolve } from '../src/core/resolve.ts';
import { validate } from '../src/core/validate.ts';
import { resolveGunAction } from '../src/gun/actionDescription.ts';
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
      expect(handle.matrix.elements[12]! - home[12]!).toBeCloseTo(-6.5, 9);
      expect(carrier.matrix.elements[12]! - carrierHome[12]!).toBeCloseTo(-6.5, 9);
      const { hand } = action.cycle!;
      controls['cycle-scrub']!.value = String((hand.rearwardSeconds + hand.dwellSeconds + hand.forwardSeconds) * 1000);
      controls['cycle-scrub']!.dispatchEvent(new Event('input'));
      expect(handle.matrix.toArray()).toEqual(home);
      controls['cycle-mode']!.value = 'fire';
      controls['cycle-mode']!.dispatchEvent(new Event('change'));
      controls['cycle-scrub']!.value = '20';
      controls['cycle-scrub']!.dispatchEvent(new Event('input'));
      expect(handle.matrix.toArray()).toEqual(home);
      expect(carrier.matrix.toArray()).not.toEqual(carrierHome);
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
      controls['cycle-scrub']!.value = '20';
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
