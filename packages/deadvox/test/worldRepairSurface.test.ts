import { Window } from 'happy-dom';
import { afterAll, afterEach, expect, it, vi } from 'vitest';
import { baseRegistryWith } from './baseRegistry.ts';
import { RECIPE, STOCK, worldRepairSources } from './worldRepairFixture.ts';

const dom = new Window();
for (const key of [
  'document',
  'HTMLElement',
  'Element',
  'Node',
  'Event',
  'MouseEvent',
  'KeyboardEvent',
  'Document',
  'DocumentFragment',
] as const) {
  Object.defineProperty(globalThis, key, { configurable: true, value: dom[key] });
}
const { mountWorldRepairFixture } = await import('./worldRepairSurfaceFixture.ts');
afterAll(() => dom.happyDOM.abort());
afterEach(() => document.body.replaceChildren());
const make = () => {
  const root = document.createElement('section');
  document.body.append(root);
  const fixture = mountWorldRepairFixture(root, baseRegistryWith(worldRepairSources()));
  const key = (code: string, repeat = false) => fixture.keyboard.press(new KeyboardEvent('keydown', { code, repeat }));
  const up = (code: string) => fixture.keyboard.release(new KeyboardEvent('keyup', { code }));
  const tap = (code: string) => {
    key(code);
    up(code);
  };
  const button = (action: string) => root.querySelector<HTMLButtonElement>(`[data-world-action="${action}"]`)!;
  const aim = () => {
    key('ArrowRight');
    fixture.surface.update(2);
    up('ArrowRight');
  };
  return { ...fixture, root, key, up, tap, button, aim };
};

it('keyboard aims from outside the ray, inspects live requirements and backs out without acquiring anything', () => {
  const f = make();
  const before = f.inventory.snapshotState();
  const preview = vi.spyOn(f.commands, 'previewEntityRepair');
  f.open();
  expect(f.surface.kind).toBe('meta');
  expect(f.aimedEntity()).toBeUndefined();
  f.aim();
  expect(f.aimedEntity()).toBe(f.target.uid);
  f.key('ArrowUp');
  const aimedLook = { ...f.look };
  f.tap('Enter');
  f.surface.update(1);
  expect(f.look).toEqual(aimedLook);
  expect(f.surface.context).toBe('world-service');
  expect(document.activeElement).toBe(f.button('details'));
  f.tap('Enter');
  expect(f.root.querySelectorAll('.craft-components').length).toBeGreaterThan(0);
  expect(preview).toHaveBeenLastCalledWith(RECIPE, f.target.uid, {});
  f.tap('Backspace');
  f.tap('Backspace');
  f.surface.update(1);
  expect(f.look).toEqual(aimedLook);
  f.up('ArrowUp');
  f.tap('Backspace');
  expect(f.surface.context).toBeUndefined();
  expect(f.intents).toEqual([]);
  expect(f.inventory.snapshotState()).toEqual(before);
});

it('pointer and keyboard confirmation emit identical copied UID intents through the injected owner', () => {
  const f = make();
  const preference = { 0: STOCK };
  f.surface.open(RECIPE, preference);
  f.aim();
  f.button('inspect').click();
  f.button('details').click();
  f.button('confirm').click();
  const [mouse] = f.intents;
  expect(mouse).toEqual({ kind: 'craft.repair-entity', recipeId: RECIPE, entityUid: f.target.uid, preference });
  f.turn(-f.look.yaw, 0);
  f.surface.open(RECIPE, preference);
  f.aim();
  f.tap('Enter');
  f.tap('Enter');
  f.tap('Enter');
  expect(f.intents).toEqual([mouse, mouse]);
  preference[0] = 'changed-after-selection';
  expect(f.intents[0]).toEqual(mouse);
  expect(mouse).toMatchObject({ preference: { 0: STOCK } });
  expect(f.inventory.hands.right).toBeUndefined();
});

it('context transfer consumes held confirmation until release', () => {
  const f = make();
  f.open();
  f.aim();
  f.key('Enter');
  expect(f.button('details')).toBeDefined();
  f.key('Enter', true);
  f.key('Enter');
  expect(f.root.querySelector('[data-world-action="confirm"]')).toBeNull();
  f.up('Enter');
  f.key('Enter');
  expect(f.button('confirm')).toBeDefined();
  f.key('Enter', true);
  f.key('Enter');
  expect(f.intents).toEqual([]);
  f.up('Enter');
  f.tap('Enter');
  expect(f.intents).toHaveLength(1);
});

it('focus loss closes details and a repeated key or stale pointer control cannot commit after return', () => {
  const f = make();
  f.open();
  f.aim();
  f.tap('Enter');
  f.tap('Enter');
  const oldButton = f.button('confirm');
  f.keyboard.windowBlurred();
  expect(f.root.hidden).toBe(true);
  f.key('Enter', true);
  oldButton.click();
  f.up('Enter');
  expect(f.intents).toEqual([]);
  f.open();
  f.tap('Enter');
  f.tap('Enter');
  f.tap('Enter');
  expect(f.intents).toHaveLength(1);
});

it('details retain the chosen UID across aim change and refuse a target that leaves reach', () => {
  const f = make();
  f.open();
  f.aim();
  f.tap('Enter');
  f.tap('Enter');
  f.turn(Math.PI, 0);
  expect(f.aimedEntity()).toBeUndefined();
  f.position[0] = 100;
  f.surface.update(0);
  expect(f.button('confirm').getAttribute('aria-disabled')).toBe('true');
  f.button('confirm').focus();
  expect(document.activeElement).toBe(f.button('confirm'));
  f.tap('Enter');
  expect(f.intents).toEqual([]);
  f.position[0] = 0;
  f.tap('Enter');
  expect(f.intents[0]).toMatchObject({ entityUid: f.target.uid });
});
