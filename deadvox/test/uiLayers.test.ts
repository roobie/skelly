import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const style = readFileSync('src/ui/style.css', 'utf8');
const UI_LAYER_REFERENCE = /^var\(--ui-layer-[\w-]+\)$/;
const root = style.match(/:root\s*\{([^}]*)\}/)?.[1];
if (!root) {
  throw new Error('UI layer declarations are missing from :root');
}

const layers = [...root.matchAll(/(--ui-layer-[\w-]+)\s*:\s*(\d+)\s*;/g)].map(([, name, value]) => ({
  name: name!,
  value: Number(value),
}));
const layerPositions = new Map(layers.map(({ name }, index) => [name, index]));
const positionOf = (name: string): number => {
  const position = layerPositions.get(`--ui-layer-${name}`);
  if (position === undefined) {
    throw new Error(`Missing UI layer --ui-layer-${name}`);
  }
  return position;
};

describe('UI layer order', () => {
  it('declares every stacking value once and uses the shared list in CSS and inline styles', () => {
    expect(new Set(layers.map(({ name }) => name)).size).toBe(layers.length);
    expect(layers.map(({ value }) => value)).toEqual([...layers.map(({ value }) => value)].sort((a, b) => a - b));

    const declarations = [...style.matchAll(/z-index:\s*([^;]+);/g)].map(([, value]) => value!.trim());
    expect(declarations.length).toBeGreaterThan(0);
    expect(declarations.every((value) => UI_LAYER_REFERENCE.test(value))).toBe(true);
    for (const declaration of declarations) {
      expect(layerPositions.has(declaration.slice(4, -1))).toBe(true);
    }

    const mobActors = readFileSync('src/render/mobActors.ts', 'utf8');
    expect(mobActors).toContain("zIndex: 'var(--ui-layer-perception-labels)'");
    const gamePlay = readFileSync('src/game/play.ts', 'utf8');
    expect(gamePlay).toContain('z-index:var(--ui-layer-review-map)');
  });

  it('keeps the drag ghost above draggable panels and the game cursor above ordinary game layers', () => {
    expect(positionOf('drag-ghost')).toBeGreaterThan(positionOf('inventory'));
    expect(positionOf('drag-ghost')).toBeGreaterThan(positionOf('crafting'));

    const cursorPosition = positionOf('game-cursor');
    for (const { name } of layers) {
      if (
        name !== '--ui-layer-game-cursor' &&
        name !== '--ui-layer-startup-screen' &&
        name !== '--ui-layer-review-map'
      ) {
        expect(layerPositions.get(name)).toBeLessThan(cursorPosition);
      }
    }
    expect(positionOf('startup-screen')).toBeGreaterThan(cursorPosition);
    expect(positionOf('review-map')).toBe(layers.length - 1);
  });
});
