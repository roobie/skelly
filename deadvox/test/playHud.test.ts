// @vitest-environment happy-dom
import { BufferAttribute, BufferGeometry, Mesh, Object3D, PerspectiveCamera, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { inputBindings, labelForAction } from '../src/game/inputBindings.ts';
import { DEFAULT_HUD_OPTIONS, hudVisibility } from '../src/ui/hudOptions.ts';
import {
  playCrosshairFrame,
  playInteractionText,
  playPromptText,
  projectCrosshairScreenPosition,
  renderPlayHud,
} from '../src/ui/playHud.ts';
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

it('uses a rebound registry label for restable furniture interactions', () => {
  expect(inputBindings.rebind('world.interact', [{ code: 'KeyJ' }])).toBeUndefined();
  try {
    const hint = playInteractionText({
      door: false,
      open: false,
      doorReason: undefined,
      lock: undefined,
      container: false,
      readable: false,
      restAction: 'rest',
      searched: false,
      name: 'fixture',
      fullName: 'Fixture',
    });
    expect(hint).toContain(labelForAction('world.interact'));
    expect(hint).not.toContain('F:');
  } finally {
    inputBindings.reset();
  }
});

it('renders immutable HUD projections and resets text/visibility on the next frame', () => {
  const roots = { hud: root(), prompt: root(), crosshair: root() };
  renderPlayHud(roots, { hud: 'stale', prompt: 'stale', crosshairVisible: true });
  const empty = Object.freeze({ hud: '', prompt: '', crosshairVisible: false });
  renderPlayHud(roots, empty);
  expect([roots.hud.textContent, roots.prompt.textContent]).toEqual(['', '']);
  expect([roots.hud.hidden, roots.prompt.hidden, roots.crosshair.hidden]).toEqual([true, true, true]);
  renderPlayHud(
    roots,
    Object.freeze({
      hud: 'health 100%',
      prompt: 'F: open the door',
      crosshairVisible: true,
      crosshairScreenPosition: { left: 12, top: 34 },
    }),
  );
  expect([roots.hud.textContent, roots.prompt.textContent]).toEqual(['health 100%', 'F: open the door']);
  expect([roots.hud.hidden, roots.prompt.hidden, roots.crosshair.hidden]).toEqual([false, false, false]);
  expect([roots.crosshair.style.left, roots.crosshair.style.top]).toEqual(['12px', '34px']);
  renderPlayHud(roots, { hud: '', prompt: '', crosshairVisible: true });
  expect([roots.crosshair.style.left, roots.crosshair.style.top]).toEqual(['', '']);
});

it('projects a bore hit into the crosshair screen position', () => {
  const camera = new PerspectiveCamera(60, 2, 0.1, 100);
  const viewport = { left: 30, top: 20, width: 800, height: 400 };
  const point = [2, 1, -20] as [number, number, number];
  const blockSize = 0.5;
  const ndc = new Vector3(point[0] * blockSize, point[1] * blockSize, point[2] * blockSize).project(camera);
  const projected = projectCrosshairScreenPosition(camera, viewport, point, blockSize);
  if (!projected) {
    throw new Error('Visible bore point did not project');
  }
  expect(projected.left).toBeCloseTo(viewport.left + ((ndc.x + 1) / 2) * viewport.width);
  expect(projected.top).toBeCloseTo(viewport.top + ((1 - ndc.y) / 2) * viewport.height);
  const roots = { hud: root(), prompt: root(), crosshair: root() };
  renderPlayHud(roots, {
    hud: '',
    prompt: '',
    crosshairVisible: true,
    crosshairScreenPosition: projected,
  });
  expect(Number.parseFloat(roots.crosshair.style.left)).toBeCloseTo(projected.left, 5);
  expect(Number.parseFloat(roots.crosshair.style.top)).toBeCloseTo(projected.top, 5);
  expect(playCrosshairFrame(true, true, projected)).toEqual({ visible: true, screenPosition: projected });
});

it('hides off-screen and behind-camera firearm crosshairs but keeps the no-firearm crosshair centered', () => {
  const camera = new PerspectiveCamera(60, 2, 0.1, 100);
  const viewport = { left: 30, top: 20, width: 800, height: 400 };
  const blockSize = 1;
  const offScreen = projectCrosshairScreenPosition(camera, viewport, [0, 50, -10], blockSize);
  const behindCamera = projectCrosshairScreenPosition(camera, viewport, [0, 0, 1], blockSize);

  expect(offScreen).toBeUndefined();
  expect(behindCamera).toBeUndefined();
  expect(playCrosshairFrame(true, true, offScreen)).toEqual({ visible: false });
  expect(playCrosshairFrame(true, true, behindCamera)).toEqual({ visible: false });

  const defaultCrosshair = playCrosshairFrame(true, false, undefined);
  expect(defaultCrosshair).toEqual({ visible: true });
  const roots = { hud: root(), prompt: root(), crosshair: root() };
  renderPlayHud(roots, {
    hud: '',
    prompt: '',
    crosshairVisible: defaultCrosshair.visible,
    crosshairScreenPosition: defaultCrosshair.screenPosition,
  });
  expect([roots.crosshair.hidden, roots.crosshair.style.left, roots.crosshair.style.top]).toEqual([false, '', '']);
});

it('keeps an in-view firearm crosshair beyond the camera far plane', () => {
  const camera = new PerspectiveCamera(60, 2, 0.1, 100);
  const viewport = { left: 30, top: 20, width: 800, height: 400 };
  const beyondFarPlane = projectCrosshairScreenPosition(camera, viewport, [0, 0, -101], 1);

  expect(beyondFarPlane).toBeDefined();
  expect(playCrosshairFrame(true, true, beyondFarPlane)).toMatchObject({ visible: true });
});

it('omits expired notices and the duplicated rest interruption but retains the selected hint', () => {
  const visible = hudVisibility({ ...DEFAULT_HUD_OPTIONS, messages: true, interaction: true });
  const state = Object.freeze({
    now: 20,
    notice: 'old',
    noticeUntil: 10,
    interactionHint: 'F: search the cupboard',
    itemActionHint: 'Rag:\n› left arm · bleeding',
    interruption: 'Hurt',
    resting: true,
  });
  const restingPrompt = playPromptText(state, visible);
  expect(restingPrompt).toContain(state.interactionHint);
  expect(restingPrompt).toContain(state.itemActionHint);
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
    itemActionHint: undefined,
    interruption: undefined,
    resting: false,
  });
  expect(playPromptText(state, DEFAULT_HUD_OPTIONS)).toBe('');
  expect(playPromptText(state, hudVisibility({ ...DEFAULT_HUD_OPTIONS, messages: true }))).toContain(reason);
});
