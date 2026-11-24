import { AuthoredSite } from '@skelly/engine/internal/core/authoredSite.ts';
import { placedBlockAt } from '@skelly/engine/internal/core/templates.ts';
import { toggleLight } from '@skelly/engine/inventory';
import { bundledModIdsFromUrl, selectBundledMods } from '@skelly/engine/packs';
import { configFromUrl, createSession, IDLE } from '@skelly/engine/session';
import { Chunk, toChunk, type Vec3, World } from '@skelly/engine/world';
import { describe, expect, it, vi } from 'vitest';
import lookManifest from '../mods/skelly.deadvox.scenario.test-house.lit-window-look/pack/manifest.json' with {
  type: 'json',
};
import startsFile from '../mods/skelly.deadvox.scenario.test-house.lit-window-look/starts.json' with { type: 'json' };
import { productModIntake } from '../src/product/mods.ts';
import { ragdollSweepViewer } from '../src/product/ragdoll.ts';
import { stackActorFigureFiles } from './baseContentFiles.ts';
import { withReusedBuilds } from './bundledContentReuse.ts';

vi.mock('@skelly/engine/internal/game/streamer.ts', () => {
  class Streamer {}
  // biome-ignore lint/style/useNamingConvention: the mocked module exports this class name.
  return { Streamer };
});

interface Cover {
  side: 'front' | 'back';
  type: string;
  open?: true;
}

/**
 * The lit-window look as its start plays it: its site's walls and window, its shambler marker, its player spawn and
 * its lit lamp. A fixture that does not stage the lure it promises is a defect, so the proof runs on its own staging.
 */
const staging = () => {
  const query = new URLSearchParams({ 'start-mod': lookManifest.id, mods: lookManifest.id });
  const linked = withReusedBuilds(() =>
    selectBundledMods(productModIntake, bundledModIdsFromUrl(query), [], { form: 'id', id: lookManifest.id }),
  );
  const config = configFromUrl(query, { debug: true }, linked.content, ragdollSweepViewer);
  const { registry } = linked.content;
  const site = new AuthoredSite(config.seed, registry, config.scale, registry.layouts.get(config.site)!);
  const { blockSize } = config.scale;
  const placement = site.placements.at(-1)!;
  const [ox, , oz] = placement.origin;
  const [sx, , sz] = placement.template.size;
  const columns: [number, number][] = [];
  for (let cx = toChunk(ox); cx <= toChunk(ox + sx - 1); cx++) {
    for (let cz = toChunk(oz); cz <= toChunk(oz + sz - 1); cz++) {
      columns.push([cx, cz]);
    }
  }
  const windows = columns
    .flatMap(([cx, cz]) => site.furnitureIn(cx, cz))
    .filter(({ spec }) => spec.type.includes('window'));
  const shamblers = columns.flatMap(([cx, cz]) => site.actorsIn(cx, cz)).filter(({ type }) => type === 'shambler');
  const roomLamp = startsFile.starts[0]!.kit.find(({ id }) => id === 'roomlamp')!;
  const lamp = roomLamp.destination.pos as Vec3;
  if (windows.length !== 1 || shamblers.length !== 1 || 'lit' in roomLamp) {
    throw new Error('the look stages one window, one shambler and an unlit lamp');
  }
  const solid = (x: number, y: number, z: number): boolean => {
    for (const each of site.placements) {
      const block = placedBlockAt(each, [x, y, z]);
      if (block !== undefined) {
        return registry.blocks[block]!.solid;
      }
    }
    return y < placement.origin[1];
  };
  return {
    registry,
    scale: config.scale,
    seed: config.seed,
    solid,
    window: windows[0]!.spec,
    shambler: shamblers[0]!.pos,
    lamp,
    player: site.spawn.pos.map((value) => value / blockSize) as Vec3,
  };
};

/**
 * The look's check as its README performs it: the start's unlit lamp and cover fitted first, then the lamp lit, and
 * the shambler watched. `drawn` opens a fitted curtain after lighting. The shambler spawns as the world spawns it,
 * facing east, and is not drawn before the lamp is lit.
 */
const watched = (cover: Cover | undefined, { lit, drawn = false }: { lit: boolean; drawn?: boolean }) => {
  const scene = staging();
  const { registry } = scene;
  const world = new World();
  world.addChunk(new Chunk(0, 0, 0));
  let placed: ReturnType<typeof createSession>['entities'] | undefined;
  const session = createSession({
    registry,
    actorFigureFiles: stackActorFigureFiles(registry),
    world,
    scale: scene.scale,
    seed: scene.seed,
    // Calendar zero is midnight, so the lamp is the only light around.
    start: 0,
    spawn: scene.player,
    ready: () => true,
    isSolid: scene.solid,
    isOpaque: (x, y, z) => scene.solid(x, y, z) || placed?.obstructs(x, y, z, 'sight') === true,
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
  const fitted = session.entities.add({ ...scene.window, ...(cover ? { boarding: cover } : {}) });
  const lamp = session.inventory.create('oil_lamp');
  if (!session.inventory.add(lamp, { kind: 'pile', pos: scene.lamp })) {
    throw new Error('the fixture lamp must stand where the start puts it');
  }
  session.sim.paused = false;
  const id = session.actors.add(registry.actors.get('shambler')!, scene.shambler, [1, 0, 0]);
  const drawnToLamp = () => session.actorStore.get(id)!.agent!.mode === 'investigate';
  session.sim.scheduler.advance(0.1);
  if (drawnToLamp()) {
    throw new Error('the shambler must not be drawn before the lamp is lit');
  }
  if (lit && toggleLight(registry, lamp, session.sim.calendar) !== undefined) {
    throw new Error('the fixture lamp must light');
  }
  session.sim.scheduler.advance(0.1);
  if (drawn) {
    if (drawnToLamp() || session.entities.operateWindow(fitted!, 'openCurtain', scene.player, []) !== undefined) {
      throw new Error('the curtain must hide the lit lamp, then open');
    }
    session.sim.scheduler.advance(0.1);
  }
  return drawnToLamp();
};

describe('a window cover in the light sense, as the lit-window look stages it', () => {
  it('draws the shambler to the lit lamp seen through the bare window', () => {
    expect(watched(undefined, { lit: true })).toBe(true);
  });

  it('is not drawn by the player beside the window when the lamp stays out', () => {
    expect(watched(undefined, { lit: false })).toBe(false);
  });

  it.each([
    ['wood boards', { side: 'front', type: 'wood_window_boarding' }],
    ['a sheet panel', { side: 'front', type: 'sheet_window_panel' }],
    ['a closed curtain', { side: 'back', type: 'window_curtain' }],
  ] as const)('hides the lit lamp behind %s', (_name, cover) => {
    expect(watched(cover, { lit: true })).toBe(false);
  });

  it('shows the lit lamp once the closed curtain is drawn open', () => {
    expect(watched({ side: 'back', type: 'window_curtain' }, { lit: true, drawn: true })).toBe(true);
  });
});
