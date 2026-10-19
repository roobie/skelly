import type { BlockEntities } from './blockEntities.ts';
import type { MeleeDamageKind } from './body.ts';
import type { Registry } from './content.ts';
import type { SolidAt } from './raycast.ts';
import type { World } from './world.ts';

/** Solid terrain blocks alone, for checks that track furniture themselves. */
export const terrainSolid =
  (world: World, registry: Registry): SolidAt =>
  (x, y, z) => {
    const block = world.getBlock(x, y, z);
    return block !== 0 && registry.blocks[block]!.solid;
  };

/** Physical blockers, including closed doors/furniture. */
export const worldSolid = (world: World, registry: Registry, entities: BlockEntities): SolidAt => {
  const terrain = terrainSolid(world, registry);
  return (x, y, z) => terrain(x, y, z) || entities.isSolid(x, y, z);
};

/** Sight blockers. Foliage can hide actors without stopping their bodies or sounds. */
export const worldOpaque =
  (world: World, registry: Registry, entities: BlockEntities): SolidAt =>
  (x, y, z) => {
    const block = world.getBlock(x, y, z);
    const definition = registry.blocks[block];
    return (block !== 0 && Boolean(definition?.opaque ?? definition?.solid)) || entities.isSolid(x, y, z);
  };

export const worldSoundBlocking =
  (
    world: World,
    registry: Registry,
    entities: BlockEntities,
    physical: SolidAt = worldSolid(world, registry, entities),
  ): SolidAt =>
  (x, y, z) => {
    const definition = registry.blocks[world.getBlock(x, y, z)];
    return (definition?.soundBlocking ?? physical(x, y, z)) || entities.isSolid(x, y, z);
  };

type MeleePassAttack = { kind: 'player'; damageKind: MeleeDamageKind } | { kind: 'zombie'; reachMetres: number };
export type MeleeBlocker = (attack: MeleePassAttack) => SolidAt;

export const worldMeleeBlocker =
  (
    world: World,
    registry: Registry,
    entities: BlockEntities,
    physical: SolidAt = worldSolid(world, registry, entities),
  ): MeleeBlocker =>
  (attack) =>
  (x, y, z) => {
    if (entities.isSolid(x, y, z)) {
      return true;
    }
    const definition = registry.blocks[world.getBlock(x, y, z)];
    const pass = definition?.meleePass;
    const blocked = physical(x, y, z);
    if (!(pass && blocked)) {
      return blocked;
    }
    return attack.kind === 'player'
      ? !pass.damageKinds.includes(attack.damageKind)
      : attack.reachMetres < pass.minimumZombieReachMetres;
  };
