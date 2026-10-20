import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const style = readFileSync('src/ui/style.css', 'utf8');
const UI_LAYER_REFERENCE = /^var\((--ui-layer-[\w-]+)\)$/;
const INLINE_LAYER_STYLE = /\b(?:z-index|zIndex)\s*:\s*(?:"([^"]+)"|'([^']+)'|([^,\s;}]+))/g;
const root = style.match(/:root\s*\{([^}]*)\}/)?.[1];
if (!root) {
  throw new Error('UI layer declarations are missing from :root');
}

const layers = [...root.matchAll(/(--ui-layer-[\w-]+)\s*:\s*(\d+)\s*;/g)].map(([, name, value]) => ({
  name: name!,
  value: Number(value),
}));
const layerPositions = new Map(layers.map(({ name }, index) => [name, index]));
const layerValues = new Map(layers.map(({ name, value }) => [name, value]));
const uiLayerValueOf = (name: string): number => {
  const value = layerValues.get(`--ui-layer-${name}`);
  if (value === undefined) {
    throw new Error(`Missing UI layer --ui-layer-${name}`);
  }
  return value;
};
const inventoryPromptFeedbackLayer =
  /body\.inventory-open\s+#prompt\s*\{[^}]*z-index:\s*var\(--ui-layer-inventory-feedback\);[^}]*\}/;
const positionOf = (name: string): number => {
  const position = layerPositions.get(`--ui-layer-${name}`);
  if (position === undefined) {
    throw new Error(`Missing UI layer --ui-layer-${name}`);
  }
  return position;
};

const typescriptFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return typescriptFiles(path);
    }
    return entry.isFile() && entry.name.endsWith('.ts') ? [path] : [];
  });

describe('UI layer order', () => {
  it('declares every stacking value once and uses the shared list in CSS and inline styles', () => {
    expect(new Set(layers.map(({ name }) => name)).size).toBe(layers.length);
    expect(layers.map(({ value }) => value)).toEqual([...layers.map(({ value }) => value)].sort((a, b) => a - b));

    const declarations = [...style.matchAll(/z-index:\s*([^;]+);/g)].map(([, value]) => value!.trim());
    expect(declarations.length).toBeGreaterThan(0);
    for (const declaration of declarations) {
      const layer = declaration.match(UI_LAYER_REFERENCE)?.[1];
      expect(layer).toBeDefined();
      expect(layerPositions.has(layer!)).toBe(true);
    }

    const inlineDeclarations = typescriptFiles('src').flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(INLINE_LAYER_STYLE)].map(([, doubleQuoted, singleQuoted, bare]) => ({
        file,
        value: doubleQuoted ?? singleQuoted ?? bare!,
      })),
    );
    expect(inlineDeclarations.length).toBeGreaterThan(0);
    for (const { file, value } of inlineDeclarations) {
      const layer = value.match(UI_LAYER_REFERENCE)?.[1];
      expect(layer, file).toBeDefined();
      expect(layerPositions.has(layer!)).toBe(true);
    }
  });

  it('keeps inventory feedback above its panel, the drag ghost above draggable panels, and the game cursor above ordinary game layers', () => {
    expect(uiLayerValueOf('inventory-feedback')).toBeGreaterThan(uiLayerValueOf('inventory'));
    expect(style).toMatch(inventoryPromptFeedbackLayer);
    expect(positionOf('drag-ghost')).toBeGreaterThan(positionOf('inventory'));
    expect(positionOf('drag-ghost')).toBeGreaterThan(positionOf('crafting'));

    const cursorPosition = positionOf('game-cursor');
    for (const { name } of layers) {
      if (
        name !== '--ui-layer-game-cursor' &&
        name !== '--ui-layer-error-report' &&
        name !== '--ui-layer-startup-screen' &&
        name !== '--ui-layer-world-loading' &&
        name !== '--ui-layer-review-map'
      ) {
        expect(layerPositions.get(name)).toBeLessThan(cursorPosition);
      }
    }
    expect(positionOf('startup-screen')).toBeGreaterThan(cursorPosition);
    expect(positionOf('world-loading')).toBeGreaterThan(cursorPosition);
    expect(positionOf('review-map')).toBeLessThan(positionOf('error-report'));
    expect(positionOf('error-report')).toBe(layers.length - 1);
  });
});
