import { toggleLight } from '@skelly/engine/inventory';
import { createSession, IDLE } from '@skelly/engine/session';
import { Chunk, makeScale, type Vec3, World } from '@skelly/engine/world';
import { describe, expect, it, vi } from 'vitest';
import { stackActorFigureFiles } from './baseContentFiles.ts';
import { startupContent } from './baseRegistry.ts';

vi.mock('@skelly/engine/internal/game/streamer.ts', () => {
  class Streamer {}
  // biome-ignore lint/style/useNamingConvention: the mocked module exports this class name.
  return { Streamer };
});

const { registry } = startupContent();
const shambler = registry.actors.get('shambler')!;
const windowDef = registry.furniture.get('clear_casement_window')!;

interface Cover {
  side: 'front' | 'back';
  type: string;
  open?: true;
}
const WALL_Z = 5;
const WINDOW_AT: Vec3 = [-1, 1, WALL_Z];

const inWindow = (x: number, y: number, z: number) =>
  [x, y, z].every((value, axis) => value >= WINDOW_AT[axis]! && value < WINDOW_AT[axis]! + windowDef.size[axis]!);

/** Whether a shambler outside a wall with one window is drawn to a lit lamp inside, given what covers the window. */
const lureThrough = (cover?: Cover): boolean => {
  const world = new World();
  world.addChunk(new Chunk(0, 0, 0));
  let placed: ReturnType<typeof createSession>['entities'] | undefined;
  // The wall stops sight everywhere but the window's opening; only the window entity decides what that opening passes.
  const isOpaque = (x: number, y: number, z: number) =>
    y === 0 || placed?.obstructs(x, y, z, 'sight') === true || (z === WALL_Z && y >= 1 && !inWindow(x, y, z));
  const session = createSession({
    registry,
    actorFigureFiles: stackActorFigureFiles(registry),
    world,
    scale: makeScale(0.5),
    seed: 7,
    // Calendar zero is midnight, so the lamp is the only stimulus around.
    start: 0,
    spawn: [0, 1, -20],
    ready: () => true,
    isSolid: (_x, y) => y === 0,
    isOpaque,
    controls: {
      active: () => true,
      intent: () => IDLE,
      yaw: () => 0,
      pitch: () => 0,
      walking: () => true,
      descending: () => false,
    },
    audio: { play: () => undefined },
    notice: () => undefined,
    onRead: () => undefined,
  });
  placed = session.entities;
  session.entities.add({
    type: 'clear_casement_window',
    pos: WINDOW_AT,
    size: [...windowDef.size] as Vec3,
    facing: 'n',
    fixed: true,
    ...(cover ? { boarding: cover } : {}),
  });
  const lamp = session.inventory.create('oil_lamp');
  const refusal = toggleLight(registry, lamp, session.sim.calendar);
  if (refusal !== undefined || !session.inventory.add(lamp, { kind: 'pile', pos: [0, 1, WALL_Z + 3] })) {
    throw new Error('the fixture lamp must light and stand inside the room');
  }
  session.sim.paused = false;
  // Close enough that the sight line to the lamp on the floor passes through the opening, above its sill.
  const id = session.actors.add(shambler, [0.5, 1, WALL_Z - 2], [0, 0, 1]);
  session.sim.scheduler.advance(0.1);
  return session.actorStore.get(id)!.agent!.mode === 'investigate';
};

describe('a window cover in the light sense', () => {
  it('draws a shambler outside to a lit lamp seen through the bare window', () => {
    expect(lureThrough()).toBe(true);
  });

  it.each([
    ['wood boards', { side: 'front', type: 'wood_window_boarding' }],
    ['a sheet panel', { side: 'front', type: 'sheet_window_panel' }],
    ['a closed curtain', { side: 'back', type: 'window_curtain' }],
  ] as const)('hides the lit lamp behind %s', (_name, cover) => {
    expect(lureThrough(cover)).toBe(false);
  });

  it('shows the lit lamp again once the curtain is drawn open', () => {
    expect(lureThrough({ side: 'back', type: 'window_curtain', open: true })).toBe(true);
  });
});
