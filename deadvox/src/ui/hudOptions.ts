import { html, render, type TemplateResult } from 'lit-html';

export const HUD_OPTION_KEYS = [
  'stats',
  'clock',
  'details',
  'crosshair',
  'interaction',
  'quickbar',
  'handling',
  'messages',
] as const;
export type HudOptionKey = (typeof HUD_OPTION_KEYS)[number];
export type HudOptionsState = Record<HudOptionKey, boolean>;

// New players need the HUD to understand the game; experienced players can turn it off as diegetic affordances grow.
export const DEFAULT_HUD_OPTIONS: HudOptionsState = {
  stats: true,
  clock: true,
  details: true,
  crosshair: true,
  interaction: true,
  quickbar: true,
  handling: true,
  messages: true,
};

export const hudVisibility = (state: HudOptionsState, debug = false): HudOptionsState =>
  Object.fromEntries(HUD_OPTION_KEYS.map((key) => [key, debug || state[key]])) as HudOptionsState;

const STORAGE_KEY = 'deadvox.hud-options';

export const readHudOptions = (): HudOptionsState => {
  try {
    const saved = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!saved) {
      return { ...DEFAULT_HUD_OPTIONS };
    }
    const parsed = JSON.parse(saved) as Partial<HudOptionsState>;
    return Object.fromEntries(
      HUD_OPTION_KEYS.map((key) => [key, typeof parsed[key] === 'boolean' ? parsed[key] : false]),
    ) as HudOptionsState;
  } catch {
    return { ...DEFAULT_HUD_OPTIONS };
  }
};

export const writeHudOptions = (state: HudOptionsState): void => {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage is optional (private browsing, sandboxed pages, quota exhaustion).
  }
};

const LABELS: Record<HudOptionKey, string> = {
  stats: 'Health, blood, bleeding, food, water, fatigue, stamina and carrying weight',
  clock: 'Clock and time compression',
  details: 'World details (FPS, seed, position, chunks and movement)',
  crosshair: 'Crosshair',
  interaction: 'Interaction hints and target name',
  quickbar: 'Quickbar',
  handling: 'Handling progress',
  messages: 'Messages and interruptions',
};

const optionsTemplate = (
  state: HudOptionsState,
  change: (key: HudOptionKey, value: boolean) => void,
): TemplateResult => html`
  <section class="hud-options">
    <h2>HUD</h2>
    ${HUD_OPTION_KEYS.map(
      (key) => html`
      <label><input type="checkbox" .checked=${state[key]} @change=${(e: Event) => change(key, (e.target as HTMLInputElement).checked)} /> ${LABELS[key]}</label>
    `,
    )}
  </section>
`;

export const renderHudOptions = (
  root: HTMLElement,
  state: HudOptionsState,
  change: (key: HudOptionKey, value: boolean) => void,
): void => {
  render(optionsTemplate(state, change), root);
};
