import type { Mesh } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolve } from '../src/core/resolve.ts';
import { validate } from '../src/core/validate.ts';
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

afterEach(() => vi.unstubAllGlobals());

describe('action cycle viewer', () => {
  it('restores the canonical AR carrier pose when rebinding the same meshes after a mode switch', () => {
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
      expect(carrier).toBeDefined();
      if (!carrier) {
        throw new Error('AR carrier mesh was not built.');
      }
      const restPose = carrier.matrix.toArray();
      const view = createCycleView();
      view.bind(layers.solids, resolved);

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
