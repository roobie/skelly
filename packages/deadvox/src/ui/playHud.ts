// Read-only play presentation. No input handlers, commands, admission or simulation writes.

import { html, render, type TemplateResult } from 'lit-html';
import { type Camera, Vector3 } from 'three';
import { formatClock } from '../core/clock.ts';
import type { Vec3 } from '../core/coords.ts';
import type { Needs } from '../core/needs.ts';
import { countText, decimalText, hundredthsText, statText } from '../core/numberText.ts';
import type { PainReading } from '../core/pain.ts';
import type { ScreenText } from '../core/schema.ts';
import { fillText } from '../core/textTemplate.ts';
import { type HandlingPresentationSource, renderHandling } from './hud.ts';
import type { HudOptionsState } from './hudOptions.ts';
import { fillHint, type HintText, hintLines, keyCap } from './keyCap.ts';
import { interruptionPrompt } from './rest.ts';

export interface PlayHudRoots {
  readonly hud: HTMLElement;
  readonly prompt: HTMLElement;
  readonly crosshair: HTMLElement;
}

export const projectCrosshairScreenPosition = (
  camera: Camera,
  viewport: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
  point: Vec3,
  blockSize: number,
): { left: number; top: number } | undefined => {
  if (!(blockSize > 0 && viewport.width > 0 && viewport.height > 0)) {
    return undefined;
  }
  camera.updateMatrixWorld(true);
  const worldPosition = new Vector3(point[0] * blockSize, point[1] * blockSize, point[2] * blockSize);
  const viewPosition = worldPosition.clone().applyMatrix4(camera.matrixWorldInverse);
  const projected = worldPosition.project(camera);
  if (
    ![projected.x, projected.y, projected.z, viewPosition.z].every(Number.isFinite) ||
    projected.x < -1 ||
    projected.x > 1 ||
    projected.y < -1 ||
    projected.y > 1 ||
    viewPosition.z >= 0
  ) {
    return undefined;
  }
  return {
    left: viewport.left + ((projected.x + 1) / 2) * viewport.width,
    top: viewport.top + ((1 - projected.y) / 2) * viewport.height,
  };
};

export interface PlayCrosshairFrame {
  readonly visible: boolean;
  readonly screenPosition?: { readonly left: number; readonly top: number };
}

export const playCrosshairFrame = (
  enabled: boolean,
  firearmWielded: boolean,
  screenPosition: { readonly left: number; readonly top: number } | undefined,
  opticReticleVisible: boolean,
): PlayCrosshairFrame => {
  const position = firearmWielded ? screenPosition : undefined;
  return {
    visible: enabled && !opticReticleVisible && (!firearmWielded || position !== undefined),
    ...(position === undefined ? {} : { screenPosition: position }),
  };
};

export interface PlayHudFrame {
  readonly hud: HintText;
  readonly prompt: HintText;
  readonly crosshairVisible: boolean;
  readonly crosshairScreenPosition?: { readonly left: number; readonly top: number } | undefined;
}

/** Rendering consumes a completed projection, never live session/input APIs. */
export const renderPlayHud = (roots: PlayHudRoots, frame: PlayHudFrame): void => {
  render(frame.hud, roots.hud);
  roots.hud.hidden = frame.hud === '';
  roots.crosshair.hidden = !frame.crosshairVisible;
  if (frame.crosshairScreenPosition) {
    roots.crosshair.style.left = `${frame.crosshairScreenPosition.left}px`;
    roots.crosshair.style.top = `${frame.crosshairScreenPosition.top}px`;
  } else {
    roots.crosshair.style.removeProperty('left');
    roots.crosshair.style.removeProperty('top');
  }
  render(frame.prompt, roots.prompt);
  roots.prompt.hidden = frame.prompt === '';
};

export const renderPlayHandling = (
  root: HTMLElement,
  queue: HandlingPresentationSource,
  visible: boolean,
  text: ScreenText['handling'],
): void => {
  if (!visible) {
    root.hidden = true;
    return;
  }
  renderHandling(root, queue, text);
};

export interface PlayStatus {
  readonly calendar: number;
  readonly speed: number;
  readonly paused: boolean;
  readonly needs: Readonly<Needs>;
  readonly pain: Readonly<PainReading>;
  readonly painTier: string | undefined;
  readonly health: number;
  readonly blood: number;
  /** Each bleeding region's label, with its content tier's label and warning style. */
  readonly bleeding: readonly { readonly region: string; readonly label: string; readonly warn: boolean }[];
  readonly sprinting: boolean;
  /** Undefined means no selected light; zero means an empty selected light. */
  readonly lightCharge: number | undefined;
}

export interface PlayHudState extends PlayStatus {
  readonly carriedGrams: number;
  readonly fps: number;
  readonly seed: number;
  readonly radiusMetres: number;
  readonly walking: boolean;
  readonly positionMetres: readonly number[];
  readonly meshed: number;
  readonly pending: number;
  readonly looking: string;
}

type StatsText = ScreenText['stats'];
/** Readout entries on one line are spaced apart rather than punctuated. */
const GAP = '   ';
const whole = (template: string, value: number): string => fillText(template, { value: countText(value) });

export const playNeedsText = (
  { needs, pain, painTier, health, blood, bleeding, sprinting, lightCharge }: PlayStatus,
  text: StatsText,
): string => {
  const { calories, hydration, fatigue, stamina } = needs;
  return [
    [
      whole(text.health, health),
      whole(text.blood, blood),
      sprinting ? `${whole(text.stamina, stamina)} ${text.sprinting}` : whole(text.stamina, stamina),
      ...(lightCharge === undefined ? [] : [whole(text.light, lightCharge * 100)]),
    ].join(GAP),
    // Fatigue is sleep debt, not a share: 100 is a normal night's sleep and it can go past it.
    [whole(text.food, calories), whole(text.water, hydration), whole(text.fatigue, fatigue)].join(GAP),
    painTier ? fillText(text.painTier, { value: countText(pain.felt), tier: painTier }) : whole(text.pain, pain.felt),
    fillText(text.painParts, {
      acute: countText(pain.acute),
      injuries: countText(pain.injuries),
      relief: countText(pain.relief),
    }),
    // Only a tier content marks `warn` gets the warning sign (`DESIGN.md`, "Bleeding").
    ...bleeding.map(({ region, label, warn }) =>
      fillText(warn ? text.bleedingWarning : text.bleeding, { tier: label, region }),
    ),
  ].join('\n');
};

const optionalLine = (visible: boolean, text: HintText): HintText => (visible ? text : '');

export const playHudText = (
  state: PlayHudState,
  visible: Readonly<HudOptionsState>,
  text: StatsText,
): TemplateResult | '' => {
  const { calendar, speed, paused, carriedGrams, fps, seed, radiusMetres, walking, meshed, pending, looking } = state;
  const [x, y, z] = state.positionMetres.map(decimalText);
  const clock = [
    formatClock(calendar),
    ...(speed > 1.05 ? [fillText(text.speed, { speed: countText(speed) })] : []),
    ...(paused ? [text.paused] : []),
  ].join(GAP);
  const gait = fillHint(walking ? text.walking : text.jogging, { key: keyCap('movement.walk-toggle') });
  return hintLines(
    [
      optionalLine(visible.clock, clock),
      optionalLine(visible.stats, playNeedsText(state, text)),
      optionalLine(visible.stats, fillText(text.carrying, { kg: hundredthsText(carriedGrams / 1000) })),
      optionalLine(
        visible.details,
        [fillText(text.fps, { fps: countText(fps) }), fillText(text.seed, { seed: countText(seed) })].join(GAP),
      ),
      optionalLine(visible.details, html`${fillText(text.radius, { radius: statText(radiusMetres) })}${GAP}${gait}`),
      optionalLine(visible.details, fillText(text.position, { x: x!, y: y!, z: z! })),
      optionalLine(visible.details, fillText(text.chunks, { meshed: countText(meshed), pending: countText(pending) })),
      optionalLine(visible.interaction && Boolean(looking), fillText(text.looking, { name: looking })),
    ].filter((line) => line !== ''),
  );
};

export interface PlayPromptState {
  readonly now: number;
  readonly notice: string;
  readonly noticeUntil: number;
  readonly interactionHint: HintText | undefined;
  readonly itemActionHint: string | undefined;
  readonly interruption: string | undefined;
  readonly resting: boolean;
}

export const playPromptText = (
  state: PlayPromptState,
  visible: Readonly<HudOptionsState>,
  text: ScreenText['prompt'],
): TemplateResult | '' => {
  const { now, notice, noticeUntil, interactionHint, itemActionHint, interruption, resting } = state;
  const lines: HintText[] = visible.messages && now < noticeUntil ? [notice] : [];
  if (visible.interaction && interactionHint !== undefined) {
    lines.push(interactionHint);
  }
  if (visible.interaction && itemActionHint !== undefined) {
    lines.push(itemActionHint);
  }
  // Rest has its own Continue/Stop prompt; don't duplicate it in the world prompt.
  if (visible.messages && interruption !== undefined && !resting) {
    lines.push(interruptionPrompt(text, interruption, true));
  }
  return hintLines(lines);
};

export interface InteractionHint {
  readonly doorReason?: string | undefined;
  readonly lock?: string | undefined;
  readonly prying?: string | undefined;
  readonly door: boolean;
  readonly open: boolean;
  readonly container: boolean;
  readonly readable: boolean;
  readonly climbable: boolean;
  readonly restAction: 'rest' | 'sleep' | undefined;
  readonly searched: boolean;
  readonly name: string;
  readonly fullName: string;
  /** The condition band word of a damaged piece (`damageWord`); none for one in the top band. */
  readonly damage?: string | undefined;
}

type InteractionText = ScreenText['interaction'];

/** The interact key cap and what pressing it does. */
const interactLine = (text: InteractionText, action: string): TemplateResult =>
  fillHint(text.action, { key: keyCap('world.interact'), action });

const doorInteractionText = (
  { open, doorReason, lock, prying, name }: Pick<InteractionHint, 'open' | 'doorReason' | 'lock' | 'prying' | 'name'>,
  text: InteractionText,
): TemplateResult => {
  const verb = prying
    ? fillText(text.force, { name, method: prying })
    : fillText(open ? text.close : text.open, { name });
  const action = doorReason ? fillText(text.blocked, { action: verb, reason: doorReason }) : verb;
  return html`${interactLine(text, action)}${lock ? `   ${fillText(text.lock, { lock })}` : ''}`;
};

/** The carried piece's set-down line with its turn and tip actions, keys read from the live bindings. */
export const playCarryText = (setDown: HintText, text: InteractionText): TemplateResult =>
  html`${setDown} · ${fillHint(text.turn, { key: keyCap('carry.turn') })} · ${fillHint(text.tip, { key: keyCap('carry.tip') })}`;

/** Describes an already selected target; never selects/executes the interaction. */
export const playInteractionText = (
  {
    door,
    open,
    doorReason,
    lock,
    prying,
    container,
    readable,
    climbable,
    restAction,
    searched,
    name: plainName,
    fullName,
    damage,
  }: InteractionHint,
  text: InteractionText,
): HintText => {
  const name = damage ? fillText(text.damaged, { damage, name: plainName }) : plainName;
  if (door) {
    return doorInteractionText({ open, doorReason, lock, prying, name }, text);
  }
  if (climbable) {
    return interactLine(text, fillText(text.climb, { name }));
  }
  if (readable) {
    return interactLine(text, fillText(text.read, { name }));
  }
  if (restAction) {
    return interactLine(text, fillText(restAction === 'sleep' ? text.sleep : text.rest, { name }));
  }
  if (container) {
    return interactLine(text, fillText(searched ? text.lookIn : text.search, { name }));
  }
  return damage ? `${name.charAt(0).toUpperCase()}${name.slice(1)}` : fullName;
};
