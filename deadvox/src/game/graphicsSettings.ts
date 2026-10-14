import { type GraphicsOptions, type GraphicsSettings, validGraphicsSettings } from '../core/graphics.ts';

const STORAGE_KEY = 'deadvox.graphics-settings';
type SettingsStorage = Pick<Storage, 'getItem' | 'setItem'>;

export const readGraphicsSettings = (tuning: GraphicsOptions, storage?: SettingsStorage): GraphicsSettings => {
  try {
    const saved = (storage ?? globalThis.localStorage)?.getItem(STORAGE_KEY);
    return saved ? validGraphicsSettings(tuning, JSON.parse(saved)) : {};
  } catch {
    return {};
  }
};

export const writeGraphicsSettings = (
  tuning: GraphicsOptions,
  settings: GraphicsSettings,
  storage?: SettingsStorage,
): void => {
  try {
    (storage ?? globalThis.localStorage)?.setItem(STORAGE_KEY, JSON.stringify(validGraphicsSettings(tuning, settings)));
  } catch {
    // Storage is optional in private browsing or sandboxed pages.
  }
};
