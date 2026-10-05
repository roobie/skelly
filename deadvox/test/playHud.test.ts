// @vitest-environment happy-dom
import { BufferAttribute, BufferGeometry, Mesh, Object3D } from 'three';
import { expect, it } from 'vitest';
import { DEFAULT_HUD_OPTIONS, hudVisibility } from '../src/ui/hudOptions.ts';
import { playInteractionText, playPromptText, renderPlayHud, renderPlayInventoryStats } from '../src/ui/playHud.ts';
import { playReadout } from '../src/ui/playReadout.ts';

it('projects debug positions in metres and counts only existing chunk/geometry attribute bytes', () => {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(6), 3));
  geometry.setAttribute('color', new BufferAttribute(new Uint8Array(3), 3));
  const positionBlocks = Object.freeze([1, 2, 3] as const);
  const chunks = [{ bytes: 10 }, { bytes: 20 }];
  const revealedPositions = [[-4, 2, 6]] as const;
  const measurements = {
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
  };
  const drawn = [new Mesh(geometry), new Object3D()];
  const blockSize = 0.5;
  const view = playReadout({
    measurements,
    walking: true,
    positionBlocks,
    blockSize,
    calendar: 0,
    chunks,
    drawn,
    revealedPositions,
  });
  const geometryBytes = Object.values(geometry.attributes).reduce(
    (sum, attribute) => sum + attribute.array.byteLength,
    0,
  );
  expect(view.position).toEqual(positionBlocks.map((coordinate) => coordinate * blockSize));
  expect(view.memoryBytes).toBe(chunks.reduce((sum, chunk) => sum + chunk.bytes, geometryBytes));
  expect(view.revealedZombies).toEqual(
    revealedPositions.map((position) => position.map((coordinate) => (coordinate * blockSize).toFixed(1)).join(',')),
  );
  expect(view.movement).toBe('walking');
  expect(view.fps).toBe(measurements.fps);
  expect(positionBlocks).toEqual([1, 2, 3]);
  geometry.dispose();
});

const root = (): HTMLElement => document.createElement('div');

it('uses the supplied binding label for restable furniture interactions', () => {
  const keyLabel = 'binding-label-fixture';
  const hint = playInteractionText({
    door: false,
    open: false,
    doorReason: undefined,
    lock: undefined,
    container: false,
    readable: false,
    restAction: 'rest',
    interactLabel: keyLabel,
    searched: false,
    name: 'fixture',
    fullName: 'Fixture',
  });
  expect(hint).toContain(keyLabel);
  expect(hint.startsWith('F:')).toBe(false);
});

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
  const restingPrompt = playPromptText(state, visible);
  expect(restingPrompt).toContain(state.interactionHint);
  expect(restingPrompt).not.toContain(state.interruption);
  const interruptedPrompt = playPromptText({ ...state, resting: false }, visible);
  expect(interruptedPrompt).toContain(state.interactionHint);
  expect(interruptedPrompt).toContain(state.interruption);
});

it('shows a refusal reason only when the messages option is on', () => {
  const reason = 'fixture refusal reason';
  const state = Object.freeze({
    now: 1,
    notice: `Can't sleep: ${reason}`,
    noticeUntil: 2,
    interactionHint: undefined,
    interruption: undefined,
    resting: false,
  });
  expect(playPromptText(state, DEFAULT_HUD_OPTIONS)).toBe('');
  expect(playPromptText(state, hudVisibility({ ...DEFAULT_HUD_OPTIONS, messages: true }))).toContain(reason);
});
