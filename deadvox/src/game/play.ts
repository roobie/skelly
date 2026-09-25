// Normal play: walk, look, break and place blocks, open the inventory. The simulation
// core runs the clock, the player's physics and needs; Esc pauses it.

import { BoxGeometry, EdgesGeometry, LineBasicMaterial, LineSegments, Vector3 } from 'three';
import { CLOCK_RATIO, formatClock, hourOfDay } from '../core/clock.ts';
import { blockId } from '../core/content.ts';
import type { Vec3 } from '../core/coords.ts';
import type { Stack } from '../core/inventory.ts';
import { bodyOverlapsBlock, stepBody } from '../core/physics.ts';
import { raycast } from '../core/raycast.ts';
import { Simulation } from '../core/sim.ts';
import { skyAt } from '../core/sky.ts';
import { applySky } from '../render/sky.ts';
import { renderInventory } from '../ui/inventory.ts';
import type { Engine } from './engine.ts';
import { Input } from './input.ts';
import { createPlayerBody, PLAYER, physicsFor, steer } from './player.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const PHYSICS_RATE = 60;
const DIGIT_KEY = /^Digit([1-9])$/;
const IDLE = { forward: 0, right: 0, jump: false, sprint: false, walk: false };

export const startPlay = (engine: Engine): void => {
  const { config, registry, world, isSolid, streamer, renderer, scene, camera, meshes } = engine;
  const { scale } = config;
  const s = scale.blockSize;
  const physics = physicsFor(scale);
  const reach = PLAYER.reach / s;
  const eyeHeight = PLAYER.eye / s;

  const placeable = registry.blocks.slice(1);
  let selected = 0;
  const inventory: Stack[] = [
    { item: 'canned_beans', count: 2 },
    { item: 'water_bottle', count: 1 },
    { item: 'bandage', count: 3 },
    { item: 'kitchen_knife', count: 1 },
    { item: 'matches', count: 1 },
  ].filter((stack) => registry.items.has(stack.item));

  const [sx, sy, sz] = engine.spawn.pos;
  const body = createPlayerBody(scale, sx / s, sy / s + 0.01, sz / s);
  const input = new Input(renderer.domElement);
  input.yaw = engine.spawn.yaw;

  /** Debug stand-in for a hostile nearby (U), until shamblers exist. */
  let danger: string | undefined;
  const sim = new Simulation({
    seed: config.seed,
    clock: { ratio: CLOCK_RATIO, start: config.start },
    unsafe: () => danger,
  });
  const { compression } = sim;

  // The player is held still until there is ground under them. Inputs are locked
  // while time is compressed.
  sim.scheduler.register({
    id: 'player',
    rate: PHYSICS_RATE,
    tick: (dt) => {
      if (!streamer.isReady(body.pos[0], body.pos[2])) {
        return;
      }
      steer(body, scale, input.yaw, input.locked && !compression.locksInput ? input.intent() : IDLE);
      stepBody(body, dt, isSolid, physics);
    },
  });

  // Outline of the targeted block, in metres.
  const outline = new LineSegments(
    new EdgesGeometry(new BoxGeometry(s * 1.002, s * 1.002, s * 1.002)),
    new LineBasicMaterial({ color: 0x11_11_11 }),
  );
  outline.visible = false;
  scene.add(outline);

  // ---- UI ----

  const overlay = $('overlay');
  const inventoryPanel = $('inventory');
  const hud = $('hud');
  const hotbar = $('hotbar');
  const prompt = $('prompt');
  $('errors').textContent = engine.contentErrors;

  let started = false;
  const syncOverlay = () => {
    started ||= input.locked;
    overlay.hidden = input.locked || !inventoryPanel.hidden;
    $('go').textContent = started ? 'Paused. Click to continue' : 'Click to play';
  };
  overlay.addEventListener('click', (e) => {
    if (!(e.target instanceof HTMLAnchorElement)) {
      input.lock();
    }
  });
  renderer.domElement.addEventListener('click', () => {
    if (!input.locked) {
      input.lock();
    }
  });
  document.addEventListener('pointerlockchange', syncOverlay);

  const drawHotbar = () => {
    hotbar.replaceChildren(
      ...placeable.slice(0, 9).map((block, i) => {
        const slot = document.createElement('div');
        slot.className = i === selected ? 'selected' : '';
        const swatch = document.createElement('span');
        swatch.style.background = block.color;
        slot.append(swatch, `${i + 1} ${block.name}`);
        return slot;
      }),
    );
  };
  drawHotbar();

  /** A message that isn't an interruption, such as why compression was refused. */
  let notice = '';
  let noticeUntil = 0;
  const showNotice = (text: string) => {
    notice = text;
    noticeUntil = performance.now() + 3000;
  };
  const compress = () => {
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

  /** C continues and X stops after an interruption. */
  const timeKeys = (code: string) => {
    if (compression.interruption === undefined) {
      if (config.debug) {
        debugKeys.get(code)?.();
      }
    } else if (code === 'KeyC') {
      compress();
    } else if (code === 'KeyX') {
      compression.stop();
    }
  };

  const toggleInventory = () => {
    const open = inventoryPanel.hidden;
    inventoryPanel.hidden = !open;
    if (open) {
      renderInventory(inventoryPanel, inventory, registry);
      input.unlock();
    } else {
      input.lock();
    }
    syncOverlay();
  };

  globalThis.addEventListener('keydown', (e) => {
    if (e.repeat) {
      return;
    }
    timeKeys(e.code);
    if (e.code === 'Tab' && !compression.locksInput) {
      toggleInventory();
    }
    const digit = DIGIT_KEY.exec(e.code);
    if (digit && Number(digit[1]) <= Math.min(9, placeable.length)) {
      selected = Number(digit[1]) - 1;
      drawHotbar();
    }
  });
  globalThis.addEventListener('wheel', (e) => {
    if (!input.locked) {
      return;
    }
    const n = Math.min(9, placeable.length);
    selected = (selected + (e.deltaY > 0 ? 1 : -1) + n) % n;
    drawHotbar();
  });

  // ---- block editing (all in blocks) ----

  const lookDir = (): Vec3 => {
    const d = new Vector3(0, 0, -1).applyEuler(camera.rotation);
    return [d.x, d.y, d.z];
  };
  const eye = (): Vec3 => [body.pos[0], body.pos[1] + eyeHeight, body.pos[2]];

  renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
  renderer.domElement.addEventListener('mousedown', (e) => {
    if (!input.locked || compression.locksInput) {
      return;
    }
    const hit = raycast(eye(), lookDir(), reach, isSolid);
    if (!hit) {
      return;
    }
    if (e.button === 0) {
      streamer.markEdited(world.setBlock(...hit.block, 0));
    } else if (e.button === 2) {
      const target: Vec3 = [hit.block[0] + hit.normal[0], hit.block[1] + hit.normal[1], hit.block[2] + hit.normal[2]];
      const block = placeable[selected];
      if (block && !bodyOverlapsBlock(body, target)) {
        streamer.markEdited(world.setBlock(...target, blockId(registry, block.id)));
      }
    }
  });

  // ---- loop ----

  let last = performance.now();
  let fps = 0;

  /** Outlines the targeted block and returns it. */
  const target = () => {
    const hit = input.locked ? raycast(eye(), lookDir(), reach, isSolid) : undefined;
    outline.visible = hit !== undefined;
    if (hit) {
      outline.position.set((hit.block[0] + 0.5) * s, (hit.block[1] + 0.5) * s, (hit.block[2] + 0.5) * s);
    }
    return hit;
  };

  const clockText = (): string => {
    const speed = compression.c > 1.05 ? `   ×${compression.c.toFixed(0)}` : '';
    return `${formatClock(sim.calendar)}${speed}${sim.paused ? '   paused' : ''}`;
  };

  const needsText = (): string => {
    const { calories, hydration, fatigue } = sim.needs;
    return `food ${calories.toFixed(0)}%   water ${hydration.toFixed(0)}%   fatigue ${fatigue.toFixed(0)}%`;
  };

  const hudText = (hit: ReturnType<typeof target>): string => {
    const [x, y, z] = body.pos.map((v) => (v * s).toFixed(1));
    return [
      clockText(),
      needsText(),
      config.debug ? `debug: T rest, N noise, U danger (${danger ? 'on' : 'off'})` : '',
      `${fps.toFixed(0)} fps   seed ${config.seed}`,
      `radius ${config.radiusM} m   ${input.walking ? 'walking' : 'jogging'} (Z)`,
      `pos ${x} ${y} ${z} m`,
      `chunks ${meshes.count} meshed, ${streamer.pending} pending`,
      hit ? `looking at ${registry.blocks[world.getBlock(...hit.block)]?.name}` : '',
    ]
      .filter((line) => line !== '')
      .join('\n');
  };

  const promptText = (now: number): string => {
    const lines = now < noticeUntil ? [notice] : [];
    if (compression.interruption !== undefined) {
      lines.push(`${compression.interruption}.   C: continue   X: stop`);
    }
    return lines.join('\n');
  };

  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05;

    streamer.update(body.pos[0], body.pos[2]);
    sim.paused = !overlay.hidden; // the pause card is up
    sim.frame(dt);
    applySky(engine.sky, skyAt(hourOfDay(sim.calendar)));

    const [ex, ey, ez] = eye();
    camera.position.set(ex * s, ey * s, ez * s);
    camera.rotation.set(input.pitch, input.yaw, 0);

    hud.textContent = hudText(target());
    prompt.textContent = promptText(now);
    prompt.hidden = prompt.textContent === '';
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
};
