// Normal play: walk, look, loot, and manage what you carry. The simulation core runs
// the clock, the player's physics, needs and the handling queue; Esc pauses it.
// Build mode (B, with ?debug=1) is a development tool for editing blocks.

import { Vector3 } from 'three';
import assetManifest from '../content/base/assets/manifest.json' with { type: 'json' };
import { validateManifest } from '../core/assets.ts';
import { type BlockEntity, searchTime } from '../core/blockEntities.ts';
import { CLOCK_RATIO, formatClock, hourOfDay } from '../core/clock.ts';
import type { Vec3 } from '../core/coords.ts';
import { HandlingQueue } from '../core/handling.ts';
import { Inventory, type Pile } from '../core/inventory.ts';
import { bodyOverlapsBlock, stepBody } from '../core/physics.ts';
import { raycast } from '../core/raycast.ts';
import { Simulation } from '../core/sim.ts';
import { skyAt } from '../core/sky.ts';
import { cellsOf } from '../core/templates.ts';
import { FurnitureMeshes } from '../render/furniture.ts';
import { HeldItems } from '../render/hands.ts';
import { ModelLibrary } from '../render/models.ts';
import { PileMeshes } from '../render/piles.ts';
import { applySky } from '../render/sky.ts';
import { mountCredits } from '../ui/credits.ts';
import { Quickbar, renderHandling, renderQuickbar } from '../ui/hud.ts';
import { InventoryScreen } from '../ui/inventoryScreen.ts';
import { BuildMode } from './build.ts';
import type { Engine } from './engine.ts';
import { Input } from './input.ts';
import { startingLoadout } from './loadout.ts';
import { createPlayerBody, PLAYER, paceFactor, physicsFor, steer } from './player.ts';
import { toHands } from './targets.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const PHYSICS_RATE = 60;
const HANDLING_RATE = 20;
/** Metres: how far away you can loot a pile or furniture. */
const LOOT_REACH = 2;
/** Metres: how far away you can open a door or search a container you're looking at. */
const USE_REACH = 2;
/** Metres above the feet that reach to furniture is measured from. */
const CHEST = 1;
const QUICK_KEY = /^Digit([1-5])$/;
const IDLE = { forward: 0, right: 0, jump: false, sprint: false, walk: false };

export const startPlay = (engine: Engine): void => {
  const { config, registry, streamer, renderer, scene, camera, meshes } = engine;
  const { scale } = config;
  const s = scale.blockSize;
  const physics = physicsFor(scale);
  const eyeHeight = PLAYER.eye / s;

  const [sx, sy, sz] = engine.spawn.pos;
  const body = createPlayerBody(scale, sx / s, sy / s + 0.01, sz / s);
  const input = new Input(renderer.domElement);
  input.yaw = engine.spawn.yaw;

  /** The air block at the player's feet, where drops land. */
  const feet = (): Vec3 => [Math.floor(body.pos[0]), Math.floor(body.pos[1] + 0.01), Math.floor(body.pos[2])];
  /** Metres from the player's feet to the middle of a pile's block. */
  const pileDistance = (pos: Vec3) =>
    Math.hypot(pos[0] + 0.5 - body.pos[0], pos[1] - body.pos[1], pos[2] + 0.5 - body.pos[2]) * s;

  // ---- items ----

  const { entities } = engine;
  const inventory = new Inventory(registry, undefined, entities);
  inventory.canReach = (pos) => pileDistance(pos) <= LOOT_REACH;
  const chest = (): Vec3 => [body.pos[0], body.pos[1] + CHEST / s, body.pos[2]];
  /** Metres from the player's chest to the nearest part of a piece of furniture. */
  const entityDistance = (entity: BlockEntity) => entities.distance(entity, chest()) * s;
  inventory.canReachEntity = (entity) => entityDistance(entity) <= LOOT_REACH;
  startingLoadout(inventory);
  // Furniture, with the loot rolled for it, arrives with its column.
  streamer.onColumn = (cx, cz) => {
    for (const { spec, loot } of engine.site?.furnitureIn(cx, cz) ?? []) {
      inventory.furnish(spec, loot);
    }
  };
  const queue = new HandlingQueue(inventory);
  const quickbar = new Quickbar();
  const models = new ModelLibrary(registry, (message) => {
    const box = $('errors');
    box.textContent = [box.textContent, message].filter(Boolean).join('\n');
  });
  const piles = new PileMeshes(s, models);
  const furniture = new FurnitureMeshes(s);
  const held = new HeldItems(inventory, models);
  scene.add(piles.group, furniture.group);

  // ---- simulation ----

  /** Debug stand-in for a hostile nearby (U), until shamblers exist. */
  let danger: string | undefined;
  const sim = new Simulation({
    seed: config.seed,
    clock: { ratio: CLOCK_RATIO, start: config.start },
    unsafe: () => danger,
  });
  const { compression } = sim;

  // The player is held still until there is ground under them. Inputs are locked
  // while time is compressed. Handling and a heavy load slow you down.
  sim.scheduler.register({
    id: 'player',
    rate: PHYSICS_RATE,
    tick: (dt) => {
      if (!streamer.isReady(body.pos[0], body.pos[2])) {
        return;
      }
      const moving = input.locked && !compression.locksInput;
      const intent = moving ? input.intent() : IDLE;
      const handling = queue.busy;
      steer(body, scale, input.yaw, {
        ...intent,
        sprint: intent.sprint && !handling,
        pace: paceFactor(inventory.carriedWeight(), handling),
      });
      stepBody(body, dt, engine.isSolid, physics);
    },
  });

  // ---- UI ----

  const overlay = $('overlay');
  const inventoryPanel = $('inventory');
  const hud = $('hud');
  const prompt = $('prompt');
  const quickbarBox = $('quickbar');
  const handlingBox = $('handling');
  const credits = validateManifest('assets/manifest.json', assetManifest);
  $('errors').textContent = [engine.contentErrors, ...credits.issues.map((i) => `${i.source} ${i.path}: ${i.message}`)]
    .filter(Boolean)
    .join('\n');
  mountCredits({ about: $('about'), box: $('credits'), show: $('show-credits') }, credits.manifest);

  /** A message that isn't an interruption, such as why a move was refused. */
  let notice = '';
  let noticeUntil = 0;
  const showNotice = (text: string) => {
    notice = text;
    noticeUntil = performance.now() + 3000;
  };

  sim.scheduler.register({
    id: 'handling',
    rate: HANDLING_RATE,
    tick: (dt) => {
      // Handling happens in real time; compressed time belongs to long actions.
      if (compression.c > 1) {
        return;
      }
      for (const { job, reason } of queue.tick(dt).failed) {
        showNotice(`${job.label}: ${reason.toLowerCase()}`);
      }
    },
  });

  // ---- furniture: searching and doors ----

  /** Containers with a search queued, so pressing again doesn't queue another. */
  const searching = new Set<BlockEntity>();
  const nameOf = (entity: BlockEntity) => entities.defOf(entity).name.toLowerCase();

  const search = (entity: BlockEntity): string | undefined => {
    if (entity.searched || searching.has(entity)) {
      return undefined;
    }
    searching.add(entity);
    queue.enqueueAction(`Search the ${nameOf(entity)}`, searchTime(entities.defOf(entity)), () => {
      searching.delete(entity);
      const reached = inventory.canReachEntity(entity);
      if (reached) {
        entities.markSearched(entity);
      }
      return reached ? undefined : 'Too far away';
    });
    return undefined;
  };

  const toggleDoor = (entity: BlockEntity) => {
    const closing = entity.open;
    const time = entities.defOf(entity).door?.handling ?? 0;
    queue.enqueueAction(`${closing ? 'Close' : 'Open'} the ${nameOf(entity)}`, time, () => {
      const [x0, y0, z0] = entity.pos;
      const inTheWay = [...cellsOf(entity.size)].some(([x, y, z]) => bodyOverlapsBlock(body, [x0 + x, y0 + y, z0 + z]));
      const blocked = closing && inTheWay;
      if (!blocked) {
        entities.setOpen(entity, !closing);
      }
      return blocked ? "You're in the way" : undefined;
    });
  };

  const screen = new InventoryScreen(inventoryPanel, inventory, queue, {
    feet,
    nearby: () => inventory.pilesNear(body.pos, LOOT_REACH / s),
    distance: (pile: Pile) => pileDistance(pile.pos),
    containers: () => entities.containersNear(chest(), LOOT_REACH / s),
    entityDistance,
    search,
    searching: (entity) => searching.has(entity),
    notice: showNotice,
    assign: (slot, item) => {
      quickbar.assign(slot, item);
      showNotice(`${inventory.name(item)} on quickbar ${slot + 1}`);
    },
  });

  const build = new BuildMode(engine, $('hotbar'), body, PLAYER.reach / s);

  let started = false;
  const syncOverlay = () => {
    started ||= input.locked;
    overlay.hidden = input.locked || screen.isOpen;
    $('go').textContent = started ? 'Paused. Click to continue' : 'Click to play';
  };
  overlay.addEventListener('click', (e) => {
    if (!(e.target instanceof HTMLAnchorElement)) {
      input.lock();
    }
  });
  renderer.domElement.addEventListener('click', () => {
    if (!(input.locked || screen.isOpen)) {
      input.lock();
    }
  });
  document.addEventListener('pointerlockchange', syncOverlay);

  const compress = () => {
    queue.cancel();
    const result = sim.compress();
    if (!result.ok) {
      showNotice(`Can't rest: ${result.reason}`);
    }
  };

  /** Debug keys (`?debug=1`): T starts or stops compression, N makes a noise, U toggles danger. */
  const debugKeys = new Map<string, () => void>([
    ['KeyT', () => (compression.active ? compression.stop() : compress())],
    ['KeyN', () => sim.emit({ kind: 'interrupt', reason: 'You hear something outside' })],
    [
      'KeyU',
      () => {
        danger = danger ? undefined : 'Something is close';
      },
    ],
  ]);

  /** C continues and X stops after an interruption. Returns true if the key was used. */
  const timeKeys = (code: string): boolean => {
    if (compression.interruption === undefined) {
      const debug = config.debug ? debugKeys.get(code) : undefined;
      debug?.();
      return debug !== undefined;
    }
    if (code === 'KeyC') {
      compress();
      return true;
    }
    if (code === 'KeyX') {
      compression.stop();
      return true;
    }
    return false;
  };

  const toggleInventory = () => {
    if (screen.isOpen) {
      screen.close();
      input.lock();
    } else {
      screen.open();
      input.unlock();
    }
    syncOverlay();
  };

  /** A quickbar key puts its item in your hands; pressing it again uses it. */
  const quickKey = (slot: number) => {
    const item = quickbar.slots[slot];
    if (!item) {
      showNotice(`Quickbar ${slot + 1} is empty: open the inventory, pick an item, press ${slot + 1}`);
      return;
    }
    const at = inventory.locate(item);
    if (!at) {
      showNotice(`The ${inventory.name(item).toLowerCase()} isn't with you`);
    } else if (at.kind === 'hand') {
      showNotice(`Nothing to do with the ${inventory.name(item).toLowerCase()} yet`);
    } else {
      const reason = toHands(inventory, queue, item, feet());
      if (reason) {
        showNotice(reason);
      }
    }
  };

  const playKeys = (code: string) => {
    const quick = QUICK_KEY.exec(code);
    if (code === 'KeyB' && config.debug) {
      build.toggle();
    } else if (code === 'KeyE' && !compression.locksInput) {
      use();
    } else if (code === 'KeyX') {
      queue.cancel();
    } else if (!build.key(code) && quick && !compression.locksInput) {
      quickKey(Number(quick[1]) - 1);
    }
  };

  globalThis.addEventListener('keydown', (e) => {
    if (e.code === 'Tab') {
      e.preventDefault();
    }
    if (e.repeat || timeKeys(e.code)) {
      return;
    }
    if (e.code === 'Tab' && !compression.locksInput) {
      toggleInventory();
    } else if (screen.isOpen) {
      if (screen.onKey(e)) {
        e.preventDefault();
      }
    } else {
      playKeys(e.code);
    }
  });
  globalThis.addEventListener('wheel', (e) => {
    if (input.locked) {
      build.wheel(e.deltaY);
    }
  });

  const lookDir = (): Vec3 => {
    const d = new Vector3(0, 0, -1).applyEuler(camera.rotation);
    return [d.x, d.y, d.z];
  };
  const eye = (): Vec3 => [body.pos[0], body.pos[1] + eyeHeight, body.pos[2]];

  /** The furniture in the crosshair, open doors included. */
  const lookedAt = (): BlockEntity | undefined => {
    const hit = raycast(
      eye(),
      lookDir(),
      USE_REACH / s,
      (x, y, z) => engine.isSolid(x, y, z) || entities.at(x, y, z) !== undefined,
    );
    return hit && entities.at(...hit.block);
  };

  /** What E would do to it, for the prompt. */
  const useText = (entity: BlockEntity): string => {
    if (entities.defOf(entity).door) {
      return `E: ${entity.open ? 'close' : 'open'} the ${nameOf(entity)}`;
    }
    if (entity.pockets) {
      return `E: ${entity.searched ? 'look in' : 'search'} the ${nameOf(entity)}`;
    }
    return entities.defOf(entity).name;
  };

  /** E: opens or closes a door; searches a container and opens the inventory beside it. */
  function use(): void {
    const entity = lookedAt();
    if (!entity) {
      return;
    }
    if (entities.defOf(entity).door) {
      toggleDoor(entity);
    } else if (entity.pockets) {
      search(entity);
      if (!screen.isOpen) {
        toggleInventory();
      }
    }
  }

  renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
  renderer.domElement.addEventListener('mousedown', (e) => {
    if (input.locked && !compression.locksInput) {
      build.click(e.button, eye(), lookDir());
    }
  });

  // ---- loop ----

  let last = performance.now();
  let fps = 0;

  const clockText = (): string => {
    const speed = compression.c > 1.05 ? `   ×${compression.c.toFixed(0)}` : '';
    return `${formatClock(sim.calendar)}${speed}${sim.paused ? '   paused' : ''}`;
  };

  const needsText = (): string => {
    const { calories, hydration, fatigue } = sim.needs;
    return `food ${calories.toFixed(0)}%   water ${hydration.toFixed(0)}%   fatigue ${fatigue.toFixed(0)}%`;
  };

  const hudText = (looking: string): string => {
    const [x, y, z] = body.pos.map((v) => (v * s).toFixed(1));
    return [
      clockText(),
      needsText(),
      `carrying ${(inventory.carriedWeight() / 1000).toFixed(1)} kg${build.on ? '   BUILD MODE (B)' : ''}`,
      config.debug ? `debug: B build, T rest, N noise, U danger (${danger ? 'on' : 'off'})` : '',
      `${fps.toFixed(0)} fps   seed ${config.seed}`,
      `radius ${config.radiusM} m   ${input.walking ? 'walking' : 'jogging'} (Z)`,
      `pos ${x} ${y} ${z} m`,
      `chunks ${meshes.count} meshed, ${streamer.pending} pending`,
      looking ? `looking at ${looking}` : '',
    ]
      .filter((line) => line !== '')
      .join('\n');
  };

  const promptText = (now: number): string => {
    const lines = now < noticeUntil ? [notice] : [];
    const entity = input.locked && !build.on ? lookedAt() : undefined;
    if (entity) {
      lines.push(useText(entity));
    }
    if (compression.interruption !== undefined) {
      lines.push(`${compression.interruption}.   C: continue   X: stop`);
    }
    return lines.join('\n');
  };

  let quickbarDrawn = '';
  const drawQuickbar = () => {
    const key = `${inventory.version}|${quickbar.slots.map((i) => i?.uid ?? 0).join(',')}`;
    if (key !== quickbarDrawn) {
      quickbarDrawn = key;
      renderQuickbar(quickbarBox, quickbar, inventory);
    }
    quickbarBox.hidden = build.on;
  };

  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05;

    streamer.update(body.pos[0], body.pos[2]);
    sim.paused = !overlay.hidden; // the pause card is up
    sim.frame(dt);
    applySky(engine.sky, skyAt(hourOfDay(sim.calendar)));
    piles.sync(inventory);
    furniture.sync(entities);

    const [ex, ey, ez] = eye();
    camera.position.set(ex * s, ey * s, ez * s);
    camera.rotation.set(input.pitch, input.yaw, 0);

    hud.textContent = hudText(build.target(eye(), lookDir(), input.locked));
    prompt.textContent = promptText(now);
    prompt.hidden = prompt.textContent === '';
    screen.update();
    drawQuickbar();
    if (screen.isOpen) {
      handlingBox.hidden = true;
    } else {
      renderHandling(handlingBox, queue);
    }
    renderer.render(scene, camera);
    held.render(renderer, camera, engine.sky);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
};
