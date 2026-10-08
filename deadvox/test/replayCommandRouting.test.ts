import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');
const callbackNames = (contract: string): string[] =>
  [...contract.matchAll(/^\s*(\w+)\??:\s*\(/gm)].map(([, name]) => name!);
const SCREEN_HOOKS_PATTERN = /export interface ScreenHooks\s*\{([\s\S]*?)\n\}/;
const CRAFT_CONTROLS_PATTERN = /controls:\s*\{([\s\S]*?)\n\s*\},/;

describe('screen command routing', () => {
  it('keeps inventory and crafting state-changing callbacks on the replay dispatcher', () => {
    const inventoryHooks = source('../src/ui/inventoryScreen.ts').match(SCREEN_HOOKS_PATTERN)?.[1];
    if (!inventoryHooks) {
      throw new Error('InventoryScreen must declare its callback contract');
    }
    const inventoryCallbacks = callbackNames(inventoryHooks);
    const readOnlyInventoryCallbacks = new Set([
      'reach',
      'feet',
      'nearby',
      'distance',
      'containers',
      'entityDistance',
      'searching',
      'notice',
      'refusal',
      'describe',
      'workOptions',
      'character',
      'body',
      'needs',
      'actionRefusal',
      'attachmentCandidates',
    ]);
    expect(inventoryCallbacks).toContain('dispatch');
    expect(inventoryCallbacks.filter((name) => name !== 'dispatch' && !readOnlyInventoryCallbacks.has(name))).toEqual(
      [],
    );

    const craftControls = source('../src/ui/craftController.ts').match(CRAFT_CONTROLS_PATTERN)?.[1];
    if (!craftControls) {
      throw new Error('Craft panel must declare its callback contract');
    }
    const craftCallbacks = callbackNames(craftControls);
    expect(craftCallbacks).toContain('dispatch');
    expect(craftCallbacks.filter((name) => name !== 'dispatch' && name !== 'notice')).toEqual([]);
  });
});
