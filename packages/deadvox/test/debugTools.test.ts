import { Window } from 'happy-dom';
import { afterAll, describe, expect, it } from 'vitest';
import { actorPoseInputFor } from '../src/core/actorPose.ts';
import { posedHumanoidRegionBoxes } from '../src/core/actorRegions.ts';
import { BlockEntities } from '../src/core/blockEntities.ts';
import { dominantSide } from '../src/core/character.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { Inventory } from '../src/core/inventory.ts';
import { magazineSpec } from '../src/core/magazine.ts';
import { mountedOptic, opticViewSettings } from '../src/core/opticView.ts';
import { stepBody } from '../src/core/physics.ts';
import { makeScale } from '../src/core/scale.ts';
import { applyStartKit } from '../src/core/startState.ts';
import { copyTextOrSelect, formatMeleeResult } from '../src/debug/index.ts';
import { stepNoclip } from '../src/debug/noclip.ts';
import { startupContent } from './baseRegistry.ts';
import { dayStateAtHour } from './dayPhaseFixture.ts';
import { fitFixtureOptic, grenadeStart, shortFirearmStart } from './fixtures/debugStarts.ts';
import { FISTS_MELEE } from './fixtures/unarmed.ts';
import { createPlayerBody, PLAYER, physicsFor } from './playerFixture.ts';
import { TEST_SENSE_TUNING } from './senseFixture.ts';
import { ActorSystem } from './zombieSystemFixture.ts';

const content = startupContent();
const { registry } = content;
const SCALE = makeScale(0.5);
const FLOOR = (_x: number, y: number) => y === 0;
const INTENT = { forward: 1, right: 0, jump: false, sprint: false, walk: false };
const IDLE = { forward: 0, right: 0, jump: false, sprint: false, walk: false };
const RISE = { ...IDLE, jump: true };

const fly = (
  body: ReturnType<typeof createPlayerBody>,
  intent: typeof IDLE | typeof INTENT | typeof RISE,
  descend = false,
) => stepNoclip({ body, scale: SCALE, yaw: -Math.PI / 2, pitch: 0, intent, descend, dt: 1 / 60 }, PLAYER);

const makeDoorWorld = () => {
  const entities = new BlockEntities(registry);
  const door = entities.add({ type: 'wood_door', pos: [4, 1, 0], size: [2, 4, 1], facing: 'n' })!;
  const wall = (x: number, y: number) => x === 2 && y >= 1 && y <= 4;
  const solid = (x: number, y: number, z: number) => y === 0 || wall(x, y) || entities.isSolid(x, y, z);
  return { door, entities, solid, wall };
};

const playerEye: Vec3 = [0, (SCALE.blockSize + PLAYER.eye) / SCALE.blockSize, 0];
const copyDom = new Window();
const copyDocument = copyDom.document as unknown as Document;
const copyHost = (): HTMLElement => {
  copyDocument.body.replaceChildren();
  const host = copyDocument.createElement('div');
  const fallback = copyDocument.createElement('textarea');
  fallback.className = 'debug-copy-fallback';
  fallback.hidden = true;
  host.append(fallback);
  copyDocument.body.append(host);
  return host;
};
afterAll(() => copyDom.happyDOM.abort());

describe('debug snapshot result copying', () => {
  it('uses the Clipboard API when available', async () => {
    let copied = '';
    const host = copyHost();

    expect(
      await copyTextOrSelect(
        'measurement line',
        {
          writeText: (text) => {
            copied = text;
            return Promise.resolve();
          },
        },
        host,
      ),
    ).toBe(true);
    expect(copied).toBe('measurement line');
  });

  it('uses execCommand when the Clipboard API is unavailable', async () => {
    let command = '';
    let copied = '';
    Object.defineProperty(copyDocument, 'execCommand', {
      configurable: true,
      value: (name: string) => {
        command = name;
        copied = (copyDocument.activeElement as HTMLTextAreaElement).value;
        return true;
      },
    });
    const host = copyHost();

    expect(await copyTextOrSelect('measurement line', undefined, host)).toBe(true);
    expect(command).toBe('copy');
    expect(copied).toBe('measurement line');
    expect(host.querySelector<HTMLTextAreaElement>('textarea.debug-copy-fallback')?.hidden).toBe(true);
  });

  it('shows and selects a readonly textarea if Clipboard API and execCommand both fail without unlocking', async () => {
    let pointerLocked = true;
    Object.defineProperty(copyDocument, 'execCommand', { configurable: true, value: () => false });
    Object.defineProperty(copyDocument, 'exitPointerLock', {
      configurable: true,
      value: () => {
        pointerLocked = false;
      },
    });
    const host = copyHost();

    expect(await copyTextOrSelect('measurement line', undefined, host)).toBe(false);
    const fallback = host.querySelector('textarea.debug-copy-fallback') as HTMLTextAreaElement;
    expect(fallback).not.toBeNull();
    expect(fallback.readOnly).toBe(true);
    expect(fallback.value).toBe('measurement line');
    expect(copyDocument.activeElement).toBe(fallback);
    expect([fallback.selectionStart, fallback.selectionEnd]).toEqual([0, 'measurement line'.length]);
    expect(pointerLocked).toBe(true);
  });
});

describe('debug starting equipment', () => {
  it('formats actual melee hit outcomes for the debug panel', () => {
    expect(
      formatMeleeResult({
        id: 1,
        region: 'head',
        damage: 15,
        healthBefore: 15,
        healthAfter: 0,
        outcome: 'decapitated',
      }),
    ).toBe('head 15 damage (15→0) · decapitated');
    expect(
      formatMeleeResult({
        id: 2,
        region: 'torso',
        damage: 15,
        healthBefore: 15,
        healthAfter: 0,
        outcome: 'incapacitated',
      }),
    ).toBe('torso 15 damage (15→0) · incapacitated');
    expect(formatMeleeResult({ damage: 0, outcome: 'nothing' })).toBe('nothing · no region hit');
  });
  it('a baseball bat swings with its damage, reach, and 10 N·s impulse', () => {
    const weaponDef = registry.items.get('baseball_bat')!.weapon!.melee!;
    const weapon = { ...weaponDef, cooldown: weaponDef.cooldownSimSeconds };
    expect(weapon).toMatchObject({ damage: 15, reach: 0.8, impulse: 10 });
    let launchImpulse: number | undefined;
    const system = new ActorSystem({
      player: () => ({
        pos: [0, playerEye[1] - PLAYER.eye / SCALE.blockSize, 0],
        facing: [1, 0, 0],
        movement: 'still',
        lit: false,
        lightSeenFrom: 40,
        eyeHeightMetres: 1.3,
      }),
      isSolid: FLOOR,
      isOpaque: FLOOR,
      dayPhase: () => dayStateAtHour(12),
      blockSize: SCALE.blockSize,
      physics: physicsFor(SCALE),
      tuning: TEST_SENSE_TUNING,
      hurtPlayer: () => undefined,
      onSever: (_id, _zombie, _part, hit) => {
        launchImpulse = hit.impulse;
      },
    });
    const shambler = {
      ...registry.actors.get('shambler')!,
      dismember: { chance: 0, headOnKillChance: 1 },
    };
    const id = system.add(shambler, [1.85 / SCALE.blockSize, 1, 0], [-1, 0, 0]);
    const zombie = system.store.get(id)!;
    zombie.figureSeed = 1;
    zombie.regions.head = weapon.damage;
    const boxes = posedHumanoidRegionBoxes(actorPoseInputFor(zombie, id, SCALE.blockSize)).head;
    const target = boxes
      .map((box) => box.voxelCentroid)
      .find((candidate) => {
        const direction = candidate.map((value, axis) => value - playerEye[axis]!) as Vec3;
        const length = Math.hypot(...direction);
        const ray = direction.map((value) => value / length) as Vec3;
        return system.aimAt(playerEye, ray, weapon)?.region === 'head';
      })!;
    const direction = target.map((value, axis) => value - playerEye[axis]!) as Vec3;
    const length = Math.hypot(...direction);
    const ray = direction.map((value) => value / length) as Vec3;
    expect(system.swing(playerEye, ray, FISTS_MELEE)).toBeUndefined();
    expect(system.swing(playerEye, ray, weapon)).toBe(id);
    expect(zombie.regions.head).toBe(0);
    expect(launchImpulse).toBeCloseTo(10 * shambler.severedImpulseScale);
  });

  it('a fixture grenade kit holds a throwable with compatible packed spares', () => {
    const inventory = new Inventory(registry);
    applyStartKit(inventory, grenadeStart());
    const held = inventory.hands[dominantSide(inventory.character)]!;
    expect(registry.items.get(held.type)?.explosive).toBeDefined();
    expect([...inventory.items()].some(({ item }) => item.uid !== held.uid && item.type === held.type)).toBe(true);
  });

  it('a fixture short-firearm kit fits a filled compatible magazine and spare ammunition', () => {
    const inventory = new Inventory(registry);
    applyStartKit(inventory, shortFirearmStart(registry));
    const gun = inventory.hands[dominantSide(inventory.character)]!;
    const definition = registry.items.get(gun.type)!;
    const model = registry.models.get(definition.model!)!;
    expect(definition.twoHanded).toBe(true);
    expect(model.gun?.action?.triggerMode).toBe('semi');
    const magazine = gun.slots!.magazine!;
    expect(magazine.cartridges!.length).toBeGreaterThan(0);
    expect(magazine.cartridges!.length).toBe(magazineSpec(registry, magazine.type)!.capacity);
    for (const round of magazine.cartridges!) {
      expect(registry.items.get(round)?.ammo?.calibre).toBe(model.gun!.calibre);
    }
    const packed = inventory.worn.back!.pockets!.flat();
    expect(
      packed.some(({ item }) => item.count > 0 && registry.items.get(item.type)?.ammo?.calibre === model.gun!.calibre),
    ).toBe(true);
  });

  it('previews every supported optic through certified loadout fitting with a usable reticle', () => {
    const optics = [...registry.items.values()].filter((item) => {
      const model = item.model ? registry.models.get(item.model) : undefined;
      return model && opticViewSettings(item, model);
    });
    expect(optics.length).toBeGreaterThan(0);
    for (const optic of optics) {
      let previewed = false;
      const hosts = [...registry.items.values()].filter((item) => item.firearm);
      for (const host of hosts) {
        const inventory = new Inventory(registry);
        const firearm = inventory.create(host.id);
        try {
          fitFixtureOptic(inventory, firearm, optic.id);
        } catch {
          continue;
        }
        const fitted = mountedOptic(registry, firearm);
        expect(fitted?.item.id).toBe(optic.id);
        expect(opticViewSettings(fitted!.item, fitted!.model)?.reticle?.primitives.length).toBeGreaterThan(0);
        previewed = true;
        break;
      }
      expect(previewed, optic.id).toBe(true);
    }
  });
});

describe('debug god mode and noclip', () => {
  it('noclip passes through a solid wall and closed real wood door and stays aloft without ground', () => {
    const { door, entities, solid } = makeDoorWorld();
    expect(door.open).toBe(false);
    expect(solid(2, 1, 0)).toBe(true);
    expect(entities.isSolid(4, 1, 0)).toBe(true);
    const body = createPlayerBody(SCALE, 0, 1, 0.5);
    for (let frame = 0; frame < 5 * 60; frame++) {
      fly(body, INTENT);
    }
    expect(body.pos[0]).toBeGreaterThan(6);
    expect(body.pos[1]).toBe(1);

    const airborne = createPlayerBody(SCALE, 10, 20, 10);
    for (let frame = 0; frame < 5 * 60; frame++) {
      fly(airborne, IDLE);
    }
    expect(airborne.pos[1]).toBe(20);
    expect(airborne.vel).toEqual([0, 0, 0]);

    const lift = createPlayerBody(SCALE, 10, 10, 10);
    for (let frame = 0; frame < 60; frame++) {
      fly(lift, RISE);
    }
    expect(lift.pos[1]).toBeGreaterThan(10);
    for (let frame = 0; frame < 60; frame++) {
      fly(lift, IDLE, true);
    }
    expect(lift.pos[1]).toBeCloseTo(10, 6);
  });

  it('normal physics blocks the same wall/door moves and restores falling without crashing inside a door', () => {
    const { door, solid, wall } = makeDoorWorld();
    expect(door.open).toBe(false);
    const wallBody = createPlayerBody(SCALE, 0, 1, 0.5);
    wallBody.onGround = true;
    for (let frame = 0; frame < 5 * 60; frame++) {
      wallBody.vel[0] = 4.3 / SCALE.blockSize;
      stepBody(wallBody, 1 / 60, solid, physicsFor(SCALE));
    }
    expect(wall(2, 1)).toBe(true);
    expect(wallBody.pos[0] + wallBody.halfWidth).toBeLessThanOrEqual(2.001);

    const doorBody = createPlayerBody(SCALE, 3, 1, 0.5);
    doorBody.onGround = true;
    for (let frame = 0; frame < 5 * 60; frame++) {
      doorBody.vel[0] = 4.3 / SCALE.blockSize;
      stepBody(doorBody, 1 / 60, solid, physicsFor(SCALE));
    }
    expect(doorBody.pos[0] + doorBody.halfWidth).toBeLessThanOrEqual(4.001);

    const falling = createPlayerBody(SCALE, 10, 20, 10);
    for (let frame = 0; frame < 5 * 60; frame++) {
      stepBody(falling, 1 / 60, () => false, physicsFor(SCALE));
    }
    expect(falling.pos[1]).toBeLessThan(20);

    const embedded = createPlayerBody(SCALE, 5, 1, 0.5);
    embedded.onGround = false;
    expect(() => stepBody(embedded, 1 / 60, solid, physicsFor(SCALE))).not.toThrow();
  });
});
