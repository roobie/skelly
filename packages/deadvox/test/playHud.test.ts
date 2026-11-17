// @vitest-environment happy-dom

import { BindingRegistry } from '@skelly/engine/input';
import { ATTRIBUTE_AVERAGE, resolve } from '@skelly/engine/internal/core/modifiers.ts';
import { conditionBand } from '@skelly/engine/inventory';
import { bodyRegionLabel } from '@skelly/engine/sim';
import { fillText, statText } from '@skelly/engine/text';
import { BlockEntities } from '@skelly/engine/world';
import { DEFAULT_HUD_OPTIONS, hudVisibility } from '@skelly/presentation/internal/ui/hudOptions.ts';
import {
  playCarryText,
  playCrosshairFrame,
  playInteractionText,
  playNeedsText,
  playPromptText,
  projectCrosshairScreenPosition,
  renderPlayHud,
} from '@skelly/presentation/internal/ui/playHud.ts';
import { effectsReadout, playReadout } from '@skelly/presentation/internal/ui/playReadout.ts';
import { BufferAttribute, BufferGeometry, Mesh, Object3D, PerspectiveCamera, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { INPUT_BINDINGS } from '../src/product/controls.ts';
import { baseRegistry, baseScreenText } from './baseRegistry.ts';
import { fixtureIds } from './fixtures/capabilityIds.ts';

const text = baseScreenText();
const inputBindings = new BindingRegistry(INPUT_BINDINGS);
const labelForAction = (actionId: string): string => inputBindings.label(actionId);

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
    actors: 1,
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
    effects: {},
  });
  const geometryBytes = Object.values(geometry.attributes).reduce(
    (sum, attribute) => sum + attribute.array.byteLength,
    0,
  );
  expect(view.position).toEqual(positionBlocks.map((coordinate) => coordinate * blockSize));
  expect(view.memoryBytes).toBe(chunks.reduce((sum, chunk) => sum + chunk.bytes, geometryBytes));
  expect(view.revealedActors).toEqual(
    revealedPositions.map((position) => position.map((coordinate) => (coordinate * blockSize).toFixed(1)).join(',')),
  );
  expect(view.movement).toBe('walking');
  expect(view.meshingDone).toBe(true);
  expect(
    playReadout({
      measurements: { ...measurements, holes: 3 },
      walking: true,
      positionBlocks,
      blockSize,
      calendar: 0,
      chunks,
      drawn,
      revealedPositions,
      effects: {},
    }).meshingDone,
  ).toBe(false);
  expect(view.fps).toBe(measurements.fps);
  expect(positionBlocks).toEqual([1, 2, 3]);
  geometry.dispose();
});

it('explains each attribute and resolved effect by the sources that moved it', () => {
  const ring = { attribute: 'strength', multiply: 2, source: 'fixture ring' } as const;
  const actor = { attributes: { strength: ATTRIBUTE_AVERAGE }, modifiers: [ring], trace: new Map() };
  resolve('melee.impulse', 1, actor, { attributes: { strength: { exponent: 1 } } });
  const readout = effectsReadout(actor);
  expect(readout.find(({ name }) => name === 'strength')?.sources).toEqual([
    { stage: 'modifier', source: ring.source, multiply: ring.multiply, add: 0 },
  ]);
  expect(
    readout.find(({ name }) => name === 'melee.impulse')?.sources.map(({ stage, source }) => [stage, source]),
  ).toEqual([['attribute', 'strength']]);
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
    lightCharge: undefined,
    pools: [],
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
    lightCharge: undefined,
    pools: [],
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

it('reads a held pool by its content name beside the vitals, and nothing for a character without pools', () => {
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
    bleeding: [],
    lightCharge: undefined,
    pools: [],
  };
  const name = 'Fixture pool';
  const pooled = playNeedsText({ ...status, pools: [{ name, amount: 7, maximum: 9 }] }, text.stats).split('\n');
  const without = playNeedsText(status, text.stats).split('\n');
  expect(pooled[0]).toContain(
    fillText(text.stats.pool, { name: name.toLowerCase(), value: statText(7), maximum: statText(9) }),
  );
  expect(without[0]).not.toContain(name.toLowerCase());
  expect(pooled.slice(1)).toEqual(without.slice(1));
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
    lightCharge: undefined,
    pools: [],
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
        condition: baseRegistry().inventory.get(fixtureIds.player)!.conditionBands.at(-1)!,
      },
      text.interaction,
      inputBindings,
    );
    const prompt = drawn(hint);
    expect(prompt.querySelector('.keycap')?.textContent).toBe(labelForAction('world.interact'));
    expect(prompt.textContent).not.toContain('F:');
  } finally {
    inputBindings.reset();
  }
});

const WORD_BREAK = /\W+/;

it("shows a piece's band from the shared band table as its blip alone in every band, the top band included", () => {
  const registry = baseRegistry();
  const bands = registry.inventory.get(fixtureIds.player)!.conditionBands;
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
    const band = conditionBand(registry, entities.conditionOf(piece));
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
        condition: band,
      },
      text.interaction,
      inputBindings,
    );
    const element = drawn(hint);
    const blip = element.querySelector<HTMLElement>('.condition-blip');
    return { word: band.word, shown: element.textContent, blip: blip?.style.getPropertyValue('--blip') };
  };
  for (const [index, band] of bands.entries()) {
    const next = bands[index + 1]?.from ?? 1;
    for (const condition of [(band.from + next) / 2, ...(next === 1 ? [1] : [])]) {
      const { word, shown, blip } = hintAt(condition);
      expect(word, `condition ${condition}`).toBe(band.word);
      expect(shown).toContain(fillText(text.interaction.conditioned, { condition: '', name }).trim());
      const shownWords = shown?.toLowerCase().split(WORD_BREAK) ?? [];
      for (const bandWord of band.word.toLowerCase().split(WORD_BREAK)) {
        expect(shownWords, 'the hint shows no band word').not.toContain(bandWord);
      }
      expect(blip, `${band.word} blip is its content colour`).toBe(band.color);
    }
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

it('omits expired notices and the duplicated rest interruption but retains the selected hint', () => {
  const visible = hudVisibility({ ...DEFAULT_HUD_OPTIONS, shown: true, messages: true, interaction: true });
  const state = Object.freeze({
    now: 20,
    notice: 'old',
    noticeUntil: 10,
    interactionHint: 'F: search the cupboard',
    itemActionHint: 'Rag:\n› left arm · bleeding',
    interruption: 'Hurt',
    resting: true,
  });
  const restingPrompt = drawn(playPromptText(state, visible, text.prompt, inputBindings)).textContent;
  expect(restingPrompt).toContain(state.interactionHint);
  expect(restingPrompt).toContain(state.itemActionHint);
  expect(restingPrompt).not.toContain(state.interruption);
  const interruptedPrompt = drawn(
    playPromptText({ ...state, resting: false }, visible, text.prompt, inputBindings),
  ).textContent;
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
          interactionHint: playCarryText('fixture set down', text.interaction, inputBindings),
          itemActionHint: undefined,
          interruption: undefined,
          resting: false,
        },
        hudVisibility({ ...DEFAULT_HUD_OPTIONS, shown: true, interaction }),
        text.prompt,
        inputBindings,
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
    itemActionHint: undefined,
    interruption: undefined,
    resting: false,
  });
  expect(
    playPromptText(
      state,
      hudVisibility({ ...DEFAULT_HUD_OPTIONS, shown: true, messages: false }),
      text.prompt,
      inputBindings,
    ),
  ).toBe('');
  expect(
    drawn(
      playPromptText(
        state,
        hudVisibility({ ...DEFAULT_HUD_OPTIONS, shown: true, messages: true }),
        text.prompt,
        inputBindings,
      ),
    ).textContent,
  ).toContain(reason);
});
