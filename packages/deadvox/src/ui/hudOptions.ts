import { html, render, type TemplateResult } from 'lit-html';
import { fillHint, type HintText, keyCap } from './keyCap.ts';

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

type HudOptionLabels = Readonly<Record<HudOptionKey, string>>;

const optionTemplate = (
  key: HudSettingKey,
  label: HintText,
  state: HudSettings,
  change: (key: HudSettingKey, value: boolean) => void,
): TemplateResult => html`
  <label data-hud-option=${key}><input type="checkbox" .checked=${state[key]} @change=${(e: Event) => change(key, (e.target as HTMLInputElement).checked)} /> ${label}</label>
`;

export interface HudOptionsText {
  readonly labels: HudOptionLabels;
  readonly heading: string;
  /** The master switch's label; `{key}` is the hold-to-toggle key cap. */
  readonly showHud: string;
}

const optionsTemplate = (
  text: HudOptionsText,
  state: HudSettings,
  change: (key: HudSettingKey, value: boolean) => void,
): TemplateResult => html`
  <section class="hud-options">
    <h2>${text.heading}</h2>
    ${optionTemplate('shown', fillHint(text.showHud, { key: keyCap('hud.toggle') }), state, change)}
    ${HUD_OPTION_KEYS.map((key) => optionTemplate(key, text.labels[key], state, change))}
  </section>
`;

export const renderHudOptions = (
  root: HTMLElement,
  labels: HudOptionsText,
  state: HudSettings,
  change: (key: HudSettingKey, value: boolean) => void,
): void => {
  render(optionsTemplate(labels, state, change), root);
};
