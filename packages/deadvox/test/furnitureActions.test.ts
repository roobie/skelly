import { validateContent } from '@skelly/engine/internal/core/content.ts';
import {
  ActionMenu,
  furnitureActionsFor,
  heldMenuActions,
  radialEntries,
  radialEntryIndex,
  reachTuning,
} from '@skelly/engine/sim';
import { describe, expect, it } from 'vitest';
import baseUi from '../../mods/skelly.ui/ui.json' with { type: 'json' };
import { baseRegistryWith } from './baseRegistry.ts';
import { AMOUNT, DURABILITY, PIECE, worldRepairFixture, worldRepairSources } from './worldRepairFixture.ts';

const piece = { uid: 7 };
const directions = { push: 0, drag: 180, lift: 270, own: 0, treat: 90 };
const tuning = { radiusPixels: 100, deadZonePixels: 20, selectionHalfAngleDegrees: 30 };
const entries = radialEntries(
  [
    { id: 'push', label: 'Push' },
    { id: 'drag', label: 'Drag' },
  ],
  directions,
);
const up = { x: 0, y: -tuning.radiusPixels };
const baseTuning = baseUi.ui[0]!;

describe('furniture service choices', () => {
  const registry = baseRegistryWith(worldRepairSources());

  it.each(['damaged', 'intact'] as const)('keeps lift in the held list on a small movable piece: %s', (state) => {
    const { inventory, target } = worldRepairFixture(registry);
    if (state === 'intact') {
      expect(inventory.entities.repair(target, DURABILITY)).toBe(true);
    }
    const blockSize = reachTuning(registry).furnitureMove.maxSizeMetres / 2;
    const choices = furnitureActionsFor(inventory, target, blockSize);
    expect(choices.some(({ id }) => id === 'lift')).toBe(true);
  });

  it('offers push and drag instead of lift for a wide movable piece', () => {
    const { inventory } = worldRepairFixture(registry);
    const target = inventory.entities.add({ type: PIECE, pos: [8, 1, 0], size: [4, 1, 1], facing: 'n' })!;
    expect(inventory.entities.bash(target, AMOUNT)).toBe('damaged');
    const blockSize = reachTuning(registry).furnitureMove.maxSizeMetres / 2;
    const choices = furnitureActionsFor(inventory, target, blockSize);
    expect(choices.some(({ id }) => id === 'push')).toBe(true);
    expect(choices.some(({ id }) => id === 'drag')).toBe(true);
    expect(choices.some(({ id }) => id === 'lift')).toBe(false);
  });
});

describe('radial entry geometry', () => {
  it('points at nothing inside the dead zone, however it leans', () => {
    expect(radialEntryIndex(0, -tuning.deadZonePixels / 2, entries, tuning)).toBeUndefined();
    expect(radialEntryIndex(0, -tuning.deadZonePixels * 2, entries, tuning)).toBe(0);
  });

  it('points at an entry only within its half-angle', () => {
    const at = (degrees: number) => {
      const radians = (degrees * Math.PI) / 180;
      return radialEntryIndex(Math.sin(radians) * 50, -Math.cos(radians) * 50, entries, tuning);
    };
    expect(at(tuning.selectionHalfAngleDegrees - 1)).toBe(0);
    expect(at(tuning.selectionHalfAngleDegrees + 1)).toBeUndefined();
    expect(at(180 - tuning.selectionHalfAngleDegrees + 1)).toBe(1);
  });

  it('keeps every entry at its authored direction when another action joins', () => {
    const grown = radialEntries([...entries, { id: 'lift', label: 'Lift' }], directions);
    expect(grown.slice(0, entries.length).map(({ angleRadians }) => angleRadians)).toEqual(
      entries.map(({ angleRadians }) => angleRadians),
    );
  });

  it('refuses an action with no authored direction', () => {
    expect(() => radialEntries([{ id: 'unplaced', label: 'Unplaced' }], directions)).toThrow('unplaced');
  });
});

describe('action menu directions in content', () => {
  const withActionMenu = (actionMenu: object) =>
    validateContent({ source: 'action-menu-fixture.json', data: { ui: [{ ...baseTuning, actionMenu }] } }).map(
      ({ path }) => path,
    );

  it('refuses two directions in one menu within two selection half-angles', () => {
    const { held } = baseTuning.actionMenu.directions;
    const crowded = { ...held, sharpen: held.own + baseTuning.actionMenu.selectionHalfAngleDegrees };
    expect(
      withActionMenu({ ...baseTuning.actionMenu, directions: { ...baseTuning.actionMenu.directions, held: crowded } }),
    ).toContain('ui[0].actionMenu.directions.held.sharpen');
  });

  it('refuses a dead zone that reaches the entry radius, which would leave every entry unreachable', () => {
    const { radiusPixels } = baseTuning.actionMenu;
    expect(withActionMenu({ ...baseTuning.actionMenu, deadZonePixels: radiusPixels })).toContain(
      'ui[0].actionMenu.deadZonePixels',
    );
  });

  it('refuses a menu action with no direction', () => {
    const { push: _, ...furniture } = baseTuning.actionMenu.directions.furniture;
    expect(
      withActionMenu({ ...baseTuning.actionMenu, directions: { ...baseTuning.actionMenu.directions, furniture } }),
    ).toContain('ui[0].actionMenu.directions.furniture.push');
  });
});

describe('action menu lifetime', () => {
  it('chooses nothing until the player points past the dead zone', () => {
    const menu = new ActionMenu();
    menu.open('furniture', piece, entries);
    menu.point(entries, { x: 0, y: -tuning.deadZonePixels / 2 }, tuning);
    expect(menu.choice(entries)).toBeUndefined();
    menu.point(entries, up, tuning);
    expect(menu.choice(entries)?.id).toBe('push');
    expect(Math.hypot(menu.pull.x, menu.pull.y)).toBeLessThanOrEqual(tuning.radiusPixels);
  });

  it('requires reopening after confirming an action', () => {
    const menu = new ActionMenu();
    menu.open('furniture', piece, entries);
    menu.step(entries, 1);
    expect(menu.confirm(entries)?.id).toBe('push');
    expect(menu.isOpen('furniture', piece.uid)).toBe(false);
    expect(menu.confirm(entries)).toBeUndefined();
    menu.open('furniture', piece, entries);
    expect(menu.isOpen('furniture', piece.uid)).toBe(true);
  });

  it('does not preserve an open menu across pause even if aim never changes', () => {
    const menu = new ActionMenu();
    menu.open('furniture', piece, entries);
    menu.step(entries, 1);
    menu.sync('furniture', piece.uid);
    expect(menu.isOpen('furniture', piece.uid)).toBe(true);
    menu.sync('furniture', piece.uid, true);
    menu.sync('furniture', piece.uid, false);
    expect(menu.confirm(entries)).toBeUndefined();
  });

  it('does not preserve an open menu when aim leaves the piece', () => {
    const menu = new ActionMenu();
    menu.open('furniture', piece, entries);
    menu.step(entries, 1);
    menu.sync('furniture', piece.uid + 1);
    menu.sync('furniture', piece.uid);
    expect(menu.confirm(entries)).toBeUndefined();
    menu.open('furniture', piece, entries);
    menu.sync('furniture', undefined);
    expect(menu.isOpen('furniture', piece.uid)).toBe(false);
  });
});

describe('held treatment child list', () => {
  const treatments = [
    { id: 'bandage:arm', label: 'Arm', treatment: { region: 'leftArm', itemType: 'bandage' } },
    { id: 'bandage:leg', label: 'Leg', treatment: { region: 'leftLeg', itemType: 'bandage' } },
  ] as const;
  const held = radialEntries(heldMenuActions([{ id: 'own', label: 'Use' }, ...treatments], 'Treat'), directions);
  const openOnTreat = (): ActionMenu => {
    const menu = new ActionMenu();
    menu.open('held', { uid: 3 }, held);
    menu.point(held, { x: tuning.radiusPixels, y: 0 }, tuning);
    return menu;
  };

  it('opens the treatments under Treat and confirms the chosen one', () => {
    const menu = openOnTreat();
    expect(menu.confirm(held)).toBeUndefined();
    expect(menu.childOpen).toBe(true);
    const children = menu.childList(held)!;
    expect(children.map(({ id }) => id)).toEqual(treatments.map(({ id }) => id));
    expect(menu.chooseChild(treatments[1].id, children)?.id).toBe(treatments[1].id);
    expect(menu.opened).toBeUndefined();
  });

  it('goes back to the ring with nothing chosen and no action', () => {
    const menu = openOnTreat();
    menu.confirm(held);
    expect(menu.chooseChild(undefined, menu.childList(held)!)).toBeUndefined();
    expect(menu.childOpen).toBe(false);
    expect(menu.isOpen('held', 3)).toBe(true);
    expect(menu.choice(held)).toBeUndefined();
  });
});
