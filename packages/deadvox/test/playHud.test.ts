// @vitest-environment happy-dom
import { BufferAttribute, BufferGeometry, Mesh, Object3D, PerspectiveCamera, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { BlockEntities } from '../src/core/blockEntities.ts';
import { bodyRegionLabel } from '../src/core/body.ts';
import { CORE_CONTENT_IDS } from '../src/core/contentIds.ts';
import { damageWord } from '../src/core/items.ts';
import { fillText } from '../src/core/textTemplate.ts';
import { inputBindings, labelForAction } from '../src/game/inputBindings.ts';
import { DEFAULT_HUD_OPTIONS, hudVisibility } from '../src/ui/hudOptions.ts';
import {
  playCarryText,
  playCrosshairFrame,
  playInteractionText,
  playNeedsText,
  playPromptText,
  projectCrosshairScreenPosition,
  renderPlayHud,
} from '../src/ui/playHud.ts';
import { playReadout } from '../src/ui/playReadout.ts';
import { baseRegistry, baseScreenText } from './baseRegistry.ts';

const text = baseScreenText();

it('projects debug positions in metres and counts only existing chunk/geometry attribute bytes', () => {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(6), 3));
  geometry.setAttribute('color', new BufferAttribute(new Uint8Array(3), 3));
  const positionBlocks = Object.freeze([1, 2, 3] as const);
  const chunks = [{ bytes: 10 }, { bytes: 20 }];
  const revealedPositions = [[-4, 2, 6]] as const;
  const measurements = {
    drawSubmission: null,
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

/** The prompt as the player's page draws it. */
const drawn = (prompt: Parameters<typeof renderPlayHud>[1]['prompt']): HTMLElement => {
  const roots = { hud: root(), prompt: root(), crosshair: root() };
  renderPlayHud(roots, { hud: '', prompt, crosshairVisible: false });
  return roots.prompt;
};

it('shows every pain component on two adjacent lines after needs', () => {
  const status = {
    calendar: 0,
    speed: 1,
    paused: false,
    needs: { calories: 611, hydration: 782, fatigue: 93, stamina: 100, staminaRegenDelayRemainingSimSeconds: 0 },
    pain: {
      felt: 137.2,
      acute: 241.3,
      injuries: 359.7,
      relief: 43.8,
      ratio: 0.416,
      tier: 1,
      effects: { aimSway: 1, handlingSlowdown: 1 },
    },
    painTier: 'fixture-tier-947',
    health: 91,
    blood: 67,
    bleeding: [],
    sprinting: false,
    lightCharge: undefined,
  } as const;

  const lines = playNeedsText(status, text.stats).split('\n');
  const values = {
    felt: status.pain.felt.toFixed(0),
    acute: status.pain.acute.toFixed(0),
    injuries: status.pain.injuries.toFixed(0),
    relief: status.pain.relief.toFixed(0),
  };
  const needsLineIndex = lines.findIndex(
    (line) =>
      line.includes(status.needs.calories.toFixed(0)) &&
      line.includes(status.needs.hydration.toFixed(0)) &&
      line.includes(status.needs.fatigue.toFixed(0)),
  );
  const feltLineIndex = lines.findIndex((line) => line.includes(values.felt) && line.includes(status.painTier));
  const breakdownLineIndex = lines.findIndex(
    (line) => line.includes(values.acute) && line.includes(values.injuries) && line.includes(values.relief),
  );

  expect(needsLineIndex).toBeGreaterThanOrEqual(0);
  expect(feltLineIndex).toBeGreaterThanOrEqual(0);
  expect(breakdownLineIndex).toBeGreaterThanOrEqual(0);
  expect(lines[feltLineIndex]).toContain(values.felt);
  expect(lines[feltLineIndex]).toContain(status.painTier);
  expect(lines[breakdownLineIndex]).toContain(values.acute);
  expect(lines[breakdownLineIndex]).toContain(values.injuries);
  expect(lines[breakdownLineIndex]).toContain(values.relief);
  expect(feltLineIndex).toBe(needsLineIndex + 1);
  expect(breakdownLineIndex).toBe(feltLineIndex + 1);
});

it("projects blood level and affected regions, with their tier's label, only while a wound bleeds", () => {
  const regionLabel = bodyRegionLabel('leftArm');
  const tierLabel = 'Fixture tier';
  const base = {
    calendar: 0,
    speed: 1,
    paused: false,
    needs: { calories: 100, hydration: 100, fatigue: 0, stamina: 100, staminaRegenDelayRemainingSimSeconds: 0 },
    pain: {
      felt: 0,
      acute: 0,
      injuries: 0,
      relief: 0,
      ratio: 0,
      tier: undefined,
      effects: { aimSway: 1, handlingSlowdown: 1 },
    },
    painTier: undefined,
    health: 91,
    blood: 67,
    bleeding: [{ region: regionLabel, label: tierLabel, warn: true }],
    sprinting: false,
    lightCharge: undefined,
  } as const;
  const bleeding = playNeedsText(base, text.stats);
  expect(bleeding).toContain('67%');
  expect(bleeding).toContain(regionLabel);
  expect(bleeding).toContain(tierLabel);
  const treated = playNeedsText({ ...base, bleeding: [] }, text.stats);
  expect(treated).toContain('67%');
  expect(treated).not.toContain(regionLabel);
  const bleedingLines = bleeding.split('\n');
  const treatedLines = treated.split('\n');
  expect(bleedingLines).toHaveLength(treatedLines.length + 1);
  expect(treatedLines.every((line) => bleedingLines.includes(line))).toBe(true);
});

it('gives only a tier content marks to warn the warning sign, while naming every region', () => {
  const region = bodyRegionLabel('leftArm');
  const status = {
    calendar: 0,
    speed: 1,
    paused: false,
    needs: { calories: 100, hydration: 100, fatigue: 0, stamina: 100, staminaRegenDelayRemainingSimSeconds: 0 },
    pain: {
      felt: 0,
      acute: 0,
      injuries: 0,
      relief: 0,
      ratio: 0,
      tier: undefined,
      effects: { aimSway: 1, handlingSlowdown: 1 },
    },
    painTier: undefined,
    health: 91,
    blood: 67,
    sprinting: false,
    lightCharge: undefined,
  };
  const warned = playNeedsText({ ...status, bleeding: [{ region, label: 'Warned', warn: true }] }, text.stats);
  const quiet = playNeedsText({ ...status, bleeding: [{ region, label: 'Quiet', warn: false }] }, text.stats);
  const warningLine = warned.split('\n').find((line) => line.includes(region));
  if (!warningLine) {
    throw new Error('Warned bleeding status did not include its region');
  }
  const warningToken = warningLine.split(' ')[0]!;

  expect(quiet).toContain(region);
  expect(quiet.split('\n').some((line) => line.startsWith(warningToken))).toBe(false);
});

it('uses a rebound registry label for restable furniture interactions', () => {
  expect(inputBindings.rebind('world.interact', [{ code: 'KeyJ' }])).toBeUndefined();
  try {
    const hint = playInteractionText(
      {
        door: false,
        open: false,
        doorReason: undefined,
        lock: undefined,
        container: false,
        readable: false,
        climbable: false,
        restAction: 'rest',
        searched: false,
        name: 'fixture',
        fullName: 'Fixture',
      },
      text.interaction,
    );
    const prompt = drawn(hint);
    expect(prompt.querySelector('.keycap')?.textContent).toBe(labelForAction('world.interact'));
    expect(prompt.textContent).not.toContain('F:');
  } finally {
    inputBindings.reset();
  }
});

it("names a damaged piece's band from the shared band table below the top band, and only its name in the top band", () => {
  const registry = baseRegistry();
  const bands = registry.inventory.get(CORE_CONTENT_IDS.player)!.conditionBands;
  const entities = new BlockEntities(registry);
  const { uid } = entities.add({ type: 'kitchen_cupboard', pos: [0, 0, 0], size: [2, 2, 1], facing: 'n' })!;
  const def = entities.defOf(entities.byUid(uid)!);
  const name = def.name.toLowerCase();
  /** The cupboard's search hint once its saved damage leaves it this condition, and the word the hint used. */
  const hintAt = (condition: number) => {
    const state = entities.snapshotState();
    const damage = (1 - condition) * def.breach.durability;
    entities.restoreState({
      ...state,
      entities: state.entities.map(({ damage: _saved, ...saved }) =>
        saved.uid === uid && damage > 0 ? { ...saved, damage } : saved,
      ),
    });
    const piece = entities.byUid(uid)!;
    const damageText = damageWord(registry, entities.conditionOf(piece));
    const hint = playInteractionText(
      {
        door: false,
        open: false,
        container: true,
        readable: false,
        climbable: false,
        restAction: undefined,
        searched: false,
        name,
        fullName: def.name,
        damage: damageText,
      },
      text.interaction,
    );
    return { word: damageText, shown: drawn(hint).textContent };
  };
  const [top, ...below] = [...bands].reverse();
  for (const [index, band] of below.entries()) {
    const ceiling = (index === 0 ? top : below[index - 1])!.from;
    const { word, shown } = hintAt((band.from + ceiling) / 2);
    expect(word).toBe(band.word);
    expect(shown).toContain(fillText(text.interaction.damaged, { damage: band.word, name }));
  }
  const intact = hintAt(1);
  expect(intact.word).toBeUndefined();
  expect(intact.shown).toContain(name);
  for (const band of below) {
    expect(intact.shown).not.toContain(band.word);
  }
  expect(hintAt((top!.from + 1) / 2)).toEqual(intact);
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
  expect(playCrosshairFrame(true, true, projected, false)).toEqual({ visible: true, screenPosition: projected });
});

it('lets a presented optic reticle replace the overlapping firearm HUD crosshair', () => {
  const projected = { left: 30, top: 20 };
  expect(playCrosshairFrame(true, true, projected, true).visible).toBe(false);
  expect(playCrosshairFrame(true, true, projected, false).visible).toBe(true);
});

it('hides off-screen and behind-camera firearm crosshairs but keeps the no-firearm crosshair centered', () => {
  const camera = new PerspectiveCamera(60, 2, 0.1, 100);
  const viewport = { left: 30, top: 20, width: 800, height: 400 };
  const blockSize = 1;
  const offScreen = projectCrosshairScreenPosition(camera, viewport, [0, 50, -10], blockSize);
  const behindCamera = projectCrosshairScreenPosition(camera, viewport, [0, 0, 1], blockSize);

  expect(offScreen).toBeUndefined();
  expect(behindCamera).toBeUndefined();
  expect(playCrosshairFrame(true, true, offScreen, false)).toEqual({ visible: false });
  expect(playCrosshairFrame(true, true, behindCamera, false)).toEqual({ visible: false });

  const defaultCrosshair = playCrosshairFrame(true, false, undefined, false);
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
  expect(playCrosshairFrame(true, true, beyondFarPlane, false)).toMatchObject({ visible: true });
});

it('omits expired notices and the duplicated rest interruption but retains the interaction hint', () => {
  const visible = hudVisibility({ ...DEFAULT_HUD_OPTIONS, shown: true, messages: true, interaction: true });
  const state = Object.freeze({
    now: 20,
    notice: 'old',
    noticeUntil: 10,
    interactionHint: 'F: search the cupboard',
    interruption: 'Hurt',
    resting: true,
  });
  const restingPrompt = drawn(playPromptText(state, visible, text.prompt)).textContent;
  expect(restingPrompt).toContain(state.interactionHint);
  expect(restingPrompt).not.toContain(state.interruption);
  const interruptedPrompt = drawn(playPromptText({ ...state, resting: false }, visible, text.prompt)).textContent;
  expect(interruptedPrompt).toContain(state.interactionHint);
  expect(interruptedPrompt).toContain(state.interruption);
});

it('draws the live turn and tip keys as key caps in the carry hint, follows a rebind, and shows none with hints off', () => {
  const promptFor = (interaction: boolean): HTMLElement =>
    drawn(
      playPromptText(
        {
          now: 1,
          notice: '',
          noticeUntil: 0,
          interactionHint: playCarryText('fixture set down', text.interaction),
          interruption: undefined,
          resting: false,
        },
        hudVisibility({ ...DEFAULT_HUD_OPTIONS, shown: true, interaction }),
        text.prompt,
      ),
    );
  const caps = (prompt: HTMLElement): string[] =>
    Array.from(prompt.querySelectorAll('.keycap'), (cap) => cap.textContent ?? '');
  const before = caps(promptFor(true));
  expect(before).toContain(labelForAction('carry.turn'));
  expect(before).toContain(labelForAction('carry.tip'));
  expect(inputBindings.rebind('carry.turn', [{ code: 'KeyJ' }])).toBeUndefined();
  try {
    const after = caps(promptFor(true));
    expect(after).toContain(labelForAction('carry.turn'));
    expect(after).not.toEqual(before);
    expect(promptFor(false).textContent).toBe('');
  } finally {
    inputBindings.reset();
  }
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
  expect(
    playPromptText(state, hudVisibility({ ...DEFAULT_HUD_OPTIONS, shown: true, messages: false }), text.prompt),
  ).toBe('');
  expect(
    drawn(playPromptText(state, hudVisibility({ ...DEFAULT_HUD_OPTIONS, shown: true, messages: true }), text.prompt))
      .textContent,
  ).toContain(reason);
});
