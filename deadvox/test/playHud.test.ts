// @vitest-environment happy-dom
import { BufferAttribute, BufferGeometry, Mesh, Object3D } from 'three';
import { expect, it } from 'vitest';
import { DEFAULT_HUD_OPTIONS, hudVisibility } from '../src/ui/hudOptions.ts';
import { playPromptText, renderPlayHud, renderPlayInventoryStats } from '../src/ui/playHud.ts';
import { playReadout } from '../src/ui/playReadout.ts';

it('projects debug positions in metres and counts only existing chunk/geometry attribute bytes', () => {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(6), 3));
  geometry.setAttribute('color', new BufferAttribute(new Uint8Array(3), 3));
  const positionBlocks = Object.freeze([1, 2, 3] as const);
  const view = playReadout({
    measurements: {
      fps: 61,
      frame: { p50: 1, p95: 2 },
      work: { p50: 1, p95: 2 },
      seed: 73,
      radius: 64,
      chunks: 2,
      pending: 0,
      holes: 0,
      zombies: 1,
      sounds: [],
      simulationMs: 1,
      renderMs: 2,
      meshingQueueMs: 3,
      entities: 1,
      compression: 1,
      snapshotLastMs: 0,
      snapshotP95Ms: 0,
      snapshotCount: 0,
    },
    walking: true,
    positionBlocks,
    blockSize: 0.5,
    calendar: 0,
    chunks: [{ bytes: 10 }, { bytes: 20 }],
    drawn: [new Mesh(geometry), new Object3D()],
    revealedPositions: [[-4, 2, 6]],
  });
  expect(view.position).toEqual([0.5, 1, 1.5]);
  expect(view.memoryBytes).toBe(57);
  expect(view.revealedZombies).toEqual(['-2.0,1.0,3.0']);
  expect(view.movement).toBe('walking');
  expect(view.fps).toBe(61);
  expect(positionBlocks).toEqual([1, 2, 3]);
  geometry.dispose();
});

const root = (): HTMLElement => document.createElement('div');

it('renders immutable HUD projections and resets text/visibility on the next frame', () => {
  const roots = { hud: root(), prompt: root(), crosshair: root() };
  renderPlayHud(roots, { hud: 'stale', prompt: 'stale', crosshairVisible: true });
  const empty = Object.freeze({ hud: '', prompt: '', crosshairVisible: false });
  renderPlayHud(roots, empty);
  expect([roots.hud.textContent, roots.prompt.textContent]).toEqual(['', '']);
  expect([roots.hud.hidden, roots.prompt.hidden, roots.crosshair.hidden]).toEqual([true, true, true]);
  renderPlayHud(roots, Object.freeze({ hud: 'health 100%', prompt: 'F: open the door', crosshairVisible: true }));
  expect([roots.hud.textContent, roots.prompt.textContent]).toEqual(['health 100%', 'F: open the door']);
  expect([roots.hud.hidden, roots.prompt.hidden, roots.crosshair.hidden]).toEqual([false, false, false]);
  const stats = root();
  renderPlayInventoryStats(stats, true, 'stamina 100%');
  expect([stats.hidden, stats.textContent]).toEqual([false, 'stamina 100%']);
  renderPlayInventoryStats(stats, false, 'stamina 99%');
  expect([stats.hidden, stats.textContent]).toEqual([true, 'stamina 99%']);
});

it('omits expired notices and the duplicated rest interruption but retains the selected hint', () => {
  const visible = hudVisibility({ ...DEFAULT_HUD_OPTIONS, messages: true, interaction: true });
  const state = Object.freeze({
    now: 20,
    notice: 'old',
    noticeUntil: 10,
    interactionHint: 'F: search the cupboard',
    interruption: 'Hurt',
    resting: true,
  });
  expect(playPromptText(state, visible)).toBe('F: search the cupboard');
  expect(playPromptText({ ...state, resting: false }, visible)).toBe(
    'F: search the cupboard\nHurt.   C: continue   X: stop',
  );
});
