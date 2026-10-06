// Read-only play presentation. No input handlers, commands, admission or simulation writes.
import { render } from 'lit-html';
import { formatClock } from '../core/clock.ts';
import type { Needs } from '../core/needs.ts';
import { labelForAction } from '../game/inputBindings.ts';
import { type HandlingPresentationSource, renderHandling } from './hud.ts';
import type { HudOptionsState } from './hudOptions.ts';

export interface PlayHudRoots {
  readonly hud: HTMLElement;
  readonly prompt: HTMLElement;
  readonly crosshair: HTMLElement;
}

export interface PlayHudFrame {
  readonly hud: string;
  readonly prompt: string;
  readonly crosshairVisible: boolean;
}

/** Rendering consumes a completed projection, never live session/input APIs. */
export const renderPlayHud = (roots: PlayHudRoots, frame: PlayHudFrame): void => {
  render(frame.hud, roots.hud);
  roots.hud.hidden = frame.hud === '';
  roots.crosshair.hidden = !frame.crosshairVisible;
  render(frame.prompt, roots.prompt);
  roots.prompt.hidden = frame.prompt === '';
};

export const renderPlayInventoryStats = (root: HTMLElement, open: boolean, needs: string): void => {
  root.hidden = !open;
  render(needs, root);
};

export const renderPlayHandling = (root: HTMLElement, queue: HandlingPresentationSource, visible: boolean): void => {
  if (!visible) {
    root.hidden = true;
    return;
  }
  renderHandling(root, queue);
};

export interface PlayStatus {
  readonly calendar: number;
  readonly speed: number;
  readonly paused: boolean;
  readonly needs: Readonly<Needs>;
  readonly health: number;
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

export const playNeedsText = ({ needs, health, sprinting, lightCharge }: PlayStatus): string => {
  const { calories, hydration, fatigue, stamina } = needs;
  const light = lightCharge === undefined ? '' : `   light ${Math.round(lightCharge * 100)}%`;
  return [
    `health ${health.toFixed(0)}%   stamina ${stamina.toFixed(0)}%${sprinting ? ' (sprinting)' : ''}${light}`,
    `food ${calories.toFixed(0)}%   water ${hydration.toFixed(0)}%   fatigue ${fatigue.toFixed(0)}%`,
  ].join('\n');
};

const optionalLine = (visible: boolean, text: string): string => (visible ? text : '');

export const playHudText = (state: PlayHudState, visible: Readonly<HudOptionsState>): string => {
  const { calendar, speed, paused, carriedGrams, fps, seed, radiusMetres, walking, meshed, pending, looking } = state;
  const [x, y, z] = state.positionMetres.map((v) => v.toFixed(1));
  const acceleration = speed > 1.05 ? `   ×${speed.toFixed(0)}` : '';
  return [
    optionalLine(visible.clock, `${formatClock(calendar)}${acceleration}${paused ? '   paused' : ''}`),
    optionalLine(visible.stats, playNeedsText(state)),
    optionalLine(visible.stats, `carrying ${(carriedGrams / 1000).toFixed(1)} kg`),
    optionalLine(visible.details, `${fps.toFixed(0)} fps   seed ${seed}`),
    optionalLine(visible.details, `radius ${radiusMetres} m   ${walking ? 'walking' : 'jogging'} (Z)`),
    optionalLine(visible.details, `pos ${x} ${y} ${z} m`),
    optionalLine(visible.details, `chunks ${meshed} meshed, ${pending} pending`),
    optionalLine(visible.interaction && Boolean(looking), `looking at ${looking}`),
  ]
    .filter((line) => line !== '')
    .join('\n');
};

export interface PlayPromptState {
  readonly now: number;
  readonly notice: string;
  readonly noticeUntil: number;
  readonly interactionHint: string | undefined;
  readonly itemActionHint: string | undefined;
  readonly interruption: string | undefined;
  readonly resting: boolean;
}

export const playPromptText = (state: PlayPromptState, visible: Readonly<HudOptionsState>): string => {
  const { now, notice, noticeUntil, interactionHint, itemActionHint, interruption, resting } = state;
  const lines = visible.messages && now < noticeUntil ? [notice] : [];
  if (visible.interaction && interactionHint !== undefined) {
    lines.push(interactionHint);
  }
  if (visible.interaction && itemActionHint !== undefined) {
    lines.push(itemActionHint);
  }
  // Rest has its own Continue/Stop prompt; don't duplicate it in the world prompt.
  if (visible.messages && interruption !== undefined && !resting) {
    lines.push(
      `${interruption}.   ${labelForAction('compression.continue')}: continue   ${labelForAction('handling.stop')}: stop`,
    );
  }
  return lines.join('\n');
};

export interface InteractionHint {
  readonly doorReason?: string | undefined;
  readonly lock?: string | undefined;
  readonly door: boolean;
  readonly open: boolean;
  readonly container: boolean;
  readonly readable: boolean;
  readonly restAction: 'rest' | 'sleep' | undefined;
  readonly searched: boolean;
  readonly name: string;
  readonly fullName: string;
}

/** Describes an already selected target; never selects/executes the interaction. */
export const playInteractionText = ({
  door,
  open,
  doorReason,
  lock,
  container,
  readable,
  restAction,
  searched,
  name,
  fullName,
}: InteractionHint): string => {
  if (door) {
    return `${labelForAction('world.interact')}: ${open ? 'close' : 'open'} the ${name}${doorReason ? ` — ${doorReason}` : ''}${lock ? `   Activate: ${lock}` : ''}`;
  }
  if (readable) {
    return `${labelForAction('world.interact')}: read the ${name}`;
  }
  if (restAction) {
    return `${labelForAction('world.interact')}: ${restAction === 'sleep' ? 'Sleep' : 'Rest'} on the ${name}`;
  }
  if (container) {
    return `${labelForAction('world.interact')}: ${searched ? 'look in' : 'search'} the ${name}`;
  }
  return fullName;
};
