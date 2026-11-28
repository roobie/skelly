import { rubbleBlockIds } from '@skelly/engine/internal/core/rubble.ts';
import { meleeProfileForWeapon, meleeWeaponFromContent } from '@skelly/engine/internal/game/melee.ts';
import { playerTuning } from '@skelly/engine/internal/game/player.ts';
import { bundledModIdsFromUrl, selectBundledMods } from '@skelly/engine/packs';
import { configFromUrl, createSession, IDLE } from '@skelly/engine/session';
import { applyStartState } from '@skelly/engine/sim';
import { bodyOverlapsBlock, CHUNK, createWorldSetup, raycast, toChunk, type Vec3 } from '@skelly/engine/world';
import { ChunkMeshes } from '@skelly/presentation/render';
import { describe, expect, it } from 'vitest';
import supportLookManifest from '../mods/skelly.deadvox.scenario.test-house.support-look/pack/manifest.json' with {
  type: 'json',
};
import { productModIntake } from '../src/product/mods.ts';
import { ragdollSweepViewer } from '../src/product/ragdoll.ts';
import { stackActorFigureFiles } from './baseContentFiles.ts';
import { withReusedBuilds } from './bundledContentReuse.ts';
import { quietMesherSource } from './fixtures/quietMesherSource.ts';

/**
 * The support look as it is played: the real world setup the start builds, columns arrived around the spawn, and the
 * player's own melee swing along the start's aim, with whole frames of simulation after it.
 */
const playLook = (buried = false) => {
  const id = buried ? 'skelly.deadvox.scenario.test-house.support-buried-look' : supportLookManifest.id;
  // The look's link names only the start mod, as a tester opens it.
  const query = new URLSearchParams({ 'start-mod': id });
  const linked = withReusedBuilds(() =>
    selectBundledMods(productModIntake, bundledModIdsFromUrl(query), [], { form: 'id', id }),
  );
  if (linked.content.issues.length > 0) {
    throw new Error(JSON.stringify(linked.content.issues));
  }
  const config = configFromUrl(query, { debug: true }, linked.content, ragdollSweepViewer);
  const { registry } = linked.content;
  const { blockSize } = config.scale;
  const setup = createWorldSetup(config, new ChunkMeshes(blockSize, registry), quietMesherSource());
  const { canonicalTerrain: canonical, simulationWorld: simulation, world: rendered } = setup;
  const feet = setup.spawn.pos.map((value) => value / blockSize) as Vec3;
  const solid = (x: number, y: number, z: number) => registry.blocks[canonical.getBlock(x, y, z)]!.solid;
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      simulation.arrive(toChunk(Math.floor(feet[0])) + dx, toChunk(Math.floor(feet[2])) + dz);
    }
  }
  const session = createSession({
    registry,
    actorFigureFiles: stackActorFigureFiles(registry),
    world: simulation,
    scale: config.scale,
    seed: config.seed,
    start: 43_200,
    spawn: feet,
    terrainDestruction: { terrain: canonical, source: setup },
    isSolid: solid,
    isOpaque: solid,
    ready: () => false,
    controls: {
      active: () => true,
      intent: () => IDLE,
      yaw: () => 0,
      pitch: () => 0,
      walking: () => false,
      descending: () => false,
    },
    audio: { play: () => undefined },
    notice: () => undefined,
    onRead: () => undefined,
  });
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      session.onColumn(toChunk(Math.floor(feet[0])) + dx, toChunk(Math.floor(feet[2])) + dz, setup);
    }
  }
  const tuning = playerTuning(registry);
  const eye: Vec3 = [feet[0], feet[1] + tuning.eye / blockSize, feet[2]];
  const direction: Vec3 = [-Math.sin(setup.spawn.yaw), 0, -Math.cos(setup.spawn.yaw)];
  const aimed = raycast(eye, direction, tuning.debugBlockTool.reachMetres / blockSize, solid)!;
  const frames = (count: number) => {
    for (let frame = 0; frame < count; frame++) {
      session.sim.scheduler.advance(1 / 60);
    }
  };
  const start = registry.starts.get(config.startId)!;
  applyStartState(session.inventory, start, {
    fresh: true,
    character: session.character,
    body: session.sim.body,
    damageCell: session.damageTerrainCell,
    loseSupport: (cell) => simulation.support.lost(registry, cell, blockSize),
  });
  const heldKit = start.kit.find((entry) => entry.destination.kind === 'hand');
  const weapon = heldKit ? meleeWeaponFromContent(registry.items.get(heldKit.item)!.weapon!.melee) : undefined;
  /** One blow of the start's held weapon along the aim, then a second of simulation. */
  const swing = () => {
    if (!weapon) {
      throw new Error('This look has no held melee weapon');
    }
    const hands = { right: null, left: null };
    session.playerCombat.beginMeleeSwing({
      origin: eye,
      direction,
      weapon,
      profile: meleeProfileForWeapon(registry.meleeClasses, weapon.type),
      twoHanded: false,
      hands,
    });
    for (let step = 0; step < 40; step++) {
      session.playerCombat.tick(0.05, hands);
    }
    frames(60);
  };
  const block = (cell: Vec3) => registry.blocks[canonical.getBlock(...cell)]!;
  return {
    registry,
    simulation,
    rendered,
    aimed,
    block,
    frames,
    swing,
    session,
    start,
    minY: config.scale.minCy * CHUNK,
  };
};

const expectedLandings = (look: ReturnType<typeof playLook>, falling: Vec3[]) => {
  const removed = new Set([...falling, look.aimed.block].map((cell) => cell.join(',')));
  const destinations = new Map<string, Vec3>();
  const solidAfterBreak = (cell: Vec3) =>
    destinations.has(cell.join(',')) || (look.block(cell).solid && !removed.has(cell.join(',')));
  for (const source of [...falling].sort((a, b) => a[1] - b[1])) {
    const destination: Vec3 = [...source];
    while (destination[1] > look.minY && !solidAfterBreak([destination[0], destination[1] - 1, destination[2]])) {
      destination[1] -= 1;
    }
    destinations.set(destination.join(','), destination);
  }
  return destinations;
};

describe('support look as played', () => {
  it('starts the buried look inside real rubble without a setup action', () => {
    const look = playLook(true);
    look.frames(1);
    const buried = look.session.body.buried!;
    expect(buried.length).toBeGreaterThan(0);
    for (const cell of buried) {
      expect(rubbleBlockIds(look.registry).has(look.block(cell).id)).toBe(true);
    }
    expect(buried.some((cell) => bodyOverlapsBlock(look.session.body, cell))).toBe(true);
  });
  it('drops the post top, beam run and floor onto solid terrain when blows break the aimed post cell, keeping the stub', () => {
    const look = playLook();
    const { registry, simulation, rendered, aimed, block, frames, swing } = look;
    const rubble = rubbleBlockIds(registry);
    const [x, y, z] = aimed.block;
    // The prop is the plank structure around the aimed cell; it is read before the first blow.
    const span = Array.from({ length: 13 }, (_, at) => at - 6);
    const prop = span
      .flatMap((dx) => span.flatMap((dy) => span.map((dz): Vec3 => [x + dx, y + dy, z + dz])))
      .filter((cell) => block(cell).solid && block(cell).id.startsWith('plank_'));
    const held = prop.filter((cell) => cell[1] > y);
    const stub = prop.filter((cell) => cell[1] < y && cell[0] === x && cell[2] === z);
    expect(held.length).toBeGreaterThan(1);
    expect(stub.length).toBeGreaterThan(0);
    const landing = expectedLandings(look, held);
    const aimedId = block(aimed.block).id;
    for (let blows = 0; blows < 60 && block(aimed.block).id === aimedId; blows++) {
      swing();
    }
    expect(block(aimed.block).id, 'aimed cell never broke').not.toBe(aimedId);
    frames(600);
    expect(simulation.support.cascading).toBe(false);
    expect(landing.size).toBe(held.length);
    for (const cell of landing.values()) {
      expect(rubble.has(block(cell).id), `${cell} is ${block(cell).id}`).toBe(true);
      expect(block([cell[0], cell[1] - 1, cell[2]]).solid).toBe(true);
      expect(registry.blocks[rendered.getBlock(...cell)]!.id).toBe(block(cell).id);
    }
    for (const cell of held.filter((source) => !landing.has(source.join(',')))) {
      expect(block(cell).solid).toBe(false);
      expect(registry.blocks[rendered.getBlock(...cell)]!.solid).toBe(false);
    }
    for (const cell of stub) {
      expect(block(cell).id.startsWith('plank_')).toBe(true);
    }
  });
});
