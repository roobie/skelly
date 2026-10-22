import { html, render, type TemplateResult } from 'lit-html';
import { type HintText, keyCap } from './keyCap.ts';

export const HUD_OPTION_KEYS = [
  'stats',
  'clock',
  'details',
  'crosshair',
  'interaction',
  'interactionOutline',
  'quickbar',
  'handling',
  'messages',
] as const;
type HudOptionKey = (typeof HUD_OPTION_KEYS)[number];
export type HudOptionsState = Record<HudOptionKey, boolean>;
// The master switch hides the whole HUD without touching each option, so showing it again restores what was shown.
export type HudSettings = HudOptionsState & { shown: boolean };
type HudSettingKey = keyof HudSettings;

// New players need the HUD to understand the game; experienced players can turn it off as diegetic affordances grow.
export const DEFAULT_HUD_OPTIONS: HudOptionsState = {
  stats: true,
  clock: true,
  details: true,
  crosshair: true,
  interaction: true,
  interactionOutline: true,
  quickbar: true,
  handling: true,
  messages: true,
};

// Hints about the world would be drawn over a modal screen that has taken the player's attention from it.
export const hudVisibility = (state: HudSettings, debug = false, modalOpen = false): HudOptionsState => {
  const visible = Object.fromEntries(
    HUD_OPTION_KEYS.map((key) => [key, debug || (state.shown && state[key])]),
  ) as HudOptionsState;
  return modalOpen ? { ...visible, interaction: false } : visible;
};

const STORAGE_KEY = 'deadvox.hud-options';

export const readHudOptions = (): HudSettings => {
  try {
    const saved = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!saved) {
      return { ...DEFAULT_HUD_OPTIONS, shown: true };
    }
    const parsed = JSON.parse(saved) as Partial<HudSettings>;
    const options = Object.fromEntries(
      HUD_OPTION_KEYS.map((key) => [key, typeof parsed[key] === 'boolean' ? parsed[key] : DEFAULT_HUD_OPTIONS[key]]),
    ) as HudOptionsState;
    // Only an explicit hide keeps the HUD hidden; a missing switch must not blank every option at once.
    return { ...options, shown: parsed.shown !== false };
  } catch {
    return { ...DEFAULT_HUD_OPTIONS, shown: true };
  }
};

export const writeHudOptions = (state: HudSettings): void => {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage is optional (private browsing, sandboxed pages, quota exhaustion).
  }
};

const LABELS: Record<HudOptionKey, string> = {
  stats: 'Health, blood, bleeding, food, water, fatigue, pain, stamina and carrying weight',
  clock: 'Clock and time compression',
  details: 'World details (FPS, seed, position, chunks and movement)',
  crosshair: 'Crosshair',
  interaction: 'Interaction hints and target name',
  interactionOutline: 'Interactible outline',
  quickbar: 'Quickbar',
  handling: 'Handling progress',
  messages: 'Messages and interruptions',
};

const optionTemplate = (
  key: HudSettingKey,
  label: HintText,
  state: HudSettings,
  change: (key: HudSettingKey, value: boolean) => void,
): TemplateResult => html`
  <label data-hud-option=${key}><input type="checkbox" .checked=${state[key]} @change=${(e: Event) => change(key, (e.target as HTMLInputElement).checked)} /> ${label}</label>
`;

const optionsTemplate = (
  state: HudSettings,
  change: (key: HudSettingKey, value: boolean) => void,
): TemplateResult => html`
  <section class="hud-options">
    <h2>HUD</h2>
    ${optionTemplate('shown', html`Show the HUD (hold ${keyCap('hud.toggle')} in play)`, state, change)}
    ${HUD_OPTION_KEYS.map((key) => optionTemplate(key, LABELS[key], state, change))}
  </section>
`;

export const renderHudOptions = (
  root: HTMLElement,
  state: HudSettings,
  change: (key: HudSettingKey, value: boolean) => void,
): void => {
  render(optionsTemplate(state, change), root);
};
