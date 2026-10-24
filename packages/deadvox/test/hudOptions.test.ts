import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InteractionTarget } from '../src/core/interactionPick.ts';
import { FurnitureMeshes } from '../src/render/furniture.ts';
import { markInteractionTarget } from '../src/render/interactionMarker.ts';
import { PileMeshes } from '../src/render/piles.ts';
import {
  DEFAULT_HUD_OPTIONS,
  HUD_OPTION_KEYS,
  type HudSettings,
  hudVisibility,
  readHudOptions,
  writeHudOptions,
} from '../src/ui/hudOptions.ts';

const storage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
};

const onlyFirstOptionOff = (): HudSettings => ({
  ...DEFAULT_HUD_OPTIONS,
  [HUD_OPTION_KEYS[0]]: false,
  shown: true,
});

describe('HUD options', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads the declared defaults when there are no saved settings', () => {
    vi.stubGlobal('localStorage', storage());
    expect(readHudOptions()).toEqual({ ...DEFAULT_HUD_OPTIONS, shown: true });
  });

  it('saves the outline option independently and hides an already shown marker when it is off', () => {
    vi.stubGlobal('localStorage', storage());
    const furniture = new FurnitureMeshes(0.5);
    const piles = new PileMeshes(0.5);
    const target: InteractionTarget = { kind: 'body', id: 1, distanceBlocks: 1 };
    const services = {
      furniture,
      piles,
      blockSize: 0.5,
      definition: () => {
        throw new Error('Not a furniture target');
      },
      body: () => ({ pos: [3, 0, 4] as [number, number, number], halfWidth: 0.4, height: 0.5 }),
    };
    markInteractionTarget(target, true, services);
    const marker = furniture.group.children[0]!;
    expect(marker.visible).toBe(true);
    writeHudOptions({ ...DEFAULT_HUD_OPTIONS, shown: true, interaction: true, interactionOutline: false });
    const visible = hudVisibility(readHudOptions());
    expect(visible.interaction).toBe(true);
    markInteractionTarget(target, visible.interactionOutline, services);
    expect(marker.visible).toBe(false);
    piles.dispose();
  });

  it.each(HUD_OPTION_KEYS)('enables only the %s element when its toggle is on', (key) => {
    const state = {
      ...Object.fromEntries(HUD_OPTION_KEYS.map((option) => [option, option === key])),
      shown: true,
    } as HudSettings;
    const visible = hudVisibility(state);
    expect(visible[key]).toBe(true);
    for (const other of HUD_OPTION_KEYS.filter((candidate) => candidate !== key)) {
      expect(visible[other]).toBe(false);
    }
  });

  it('overrides hidden HUD options in debug mode', () => {
    const hidden = { ...Object.fromEntries(HUD_OPTION_KEYS.map((key) => [key, false])), shown: false } as HudSettings;
    expect(hudVisibility(hidden, true)).toEqual(Object.fromEntries(HUD_OPTION_KEYS.map((key) => [key, true])));
  });

  it('hides the interaction hint while a modal screen is open and leaves the other elements alone', () => {
    const settings = { ...DEFAULT_HUD_OPTIONS, shown: true, interaction: true };
    const open = hudVisibility(settings, false, true);
    expect(open.interaction).toBe(false);
    expect(open).toEqual({ ...hudVisibility(settings), interaction: false });
    expect(hudVisibility(settings, true, true).interaction).toBe(false);
  });

  it('hides every element while the HUD is hidden and shows each option as set once it is shown again', () => {
    const settings = onlyFirstOptionOff();
    const shownVisibility = hudVisibility(settings);
    settings.shown = false;
    expect(Object.values(hudVisibility(settings)).some(Boolean)).toBe(false);
    settings.shown = true;
    expect(hudVisibility(settings)).toEqual(shownVisibility);
  });

  it('keeps a hidden HUD and its options across a reload', () => {
    vi.stubGlobal('localStorage', storage());
    writeHudOptions({ ...onlyFirstOptionOff(), shown: false });
    expect(readHudOptions()).toEqual({ ...onlyFirstOptionOff(), shown: false });
  });

  it('reads saved options without a master switch as a shown HUD', () => {
    vi.stubGlobal('localStorage', storage());
    const { shown: _shown, ...options } = onlyFirstOptionOff();
    writeHudOptions(options as HudSettings);
    expect(readHudOptions()).toEqual(onlyFirstOptionOff());
  });

  it('starts an option missing from an older saved set enabled', () => {
    vi.stubGlobal('localStorage', storage());
    const [missing, ...kept] = HUD_OPTION_KEYS;
    writeHudOptions({
      ...Object.fromEntries(kept.map((key) => [key, false])),
      shown: true,
    } as unknown as HudSettings);
    const read = readHudOptions();
    expect(read[missing]).toBe(DEFAULT_HUD_OPTIONS[missing]);
    expect(kept.every((key) => read[key] === false)).toBe(true);
  });
});
