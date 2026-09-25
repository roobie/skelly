// Normal play: walk, look, break and place blocks, open the inventory, and wait
// (a debug long action that compresses time).

import { BoxGeometry, EdgesGeometry, LineBasicMaterial, LineSegments, Vector3 } from 'three';
import { blockId } from '../core/content.ts';
import type { Vec3 } from '../core/coords.ts';
import type { Stack } from '../core/inventory.ts';
import { bodyOverlapsBlock, stepBody } from '../core/physics.ts';
import { raycast } from '../core/raycast.ts';
import { Clock, formatClock, HOUR, hourOf } from '../core/sim/clock.ts';
import { Simulation } from '../core/sim/simulation.ts';
import { skyAt } from '../core/sim/sky.ts';
import { applySky } from '../render/sky.ts';
import { renderInventory } from '../ui/inventory.ts';
import type { Engine } from './engine.ts';
import { Input } from './input.ts';
import { createPlayerBody, PLAYER, physicsFor, steer } from './player.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
/** Player physics rate, in simulation ticks per second. */
const PLAYER_HZ = 60;
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
  const params = new URLSearchParams(location.search);
  const debug = params.has('debug');
  // Debug: `?debug=1&time=22` starts the clock at 22:00 on day 1.
  const startHour = Number(params.get('time'));
  const clock = debug && startHour >= 0 && startHour < 24 ? new Clock(startHour * HOUR) : new Clock();

  // ---- simulation ----

  const sim = new Simulation(clock);
  sim.scheduler.add({
    id: 'player',
    interval: 1 / PLAYER_HZ,
    kind: 'fixed',
    tick: (dt) => {
      // Hold the player still until there is ground under them.
      if (!streamer.isReady(body.pos[0], body.pos[2])) {
        return;
      }
      // Inputs are locked while time is compressed.
      const intent = input.locked && !sim.compression.running ? input.intent() : IDLE;
      steer(body, scale, input.yaw, intent);
      stepBody(body, dt, isSolid, physics);
    },
  });
  /** Shown in the HUD when Wait couldn't start. */
  let refused = '';

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
  $('errors').textContent = engine.contentErrors;

  const syncOverlay = () => {
    overlay.hidden = input.locked || !inventoryPanel.hidden;
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

  const toggleInventory = () => {
    const open = inventoryPanel.hidden === true;
    inventoryPanel.hidden = !open;
    if (open) {
      renderInventory(inventoryPanel, inventory, registry);
      input.unlock();
    } else {
      input.lock();
    }
    syncOverlay();
  };

  const toggleWait = () => {
    if (sim.compression.running) {
      sim.compression.stop();
    } else {
      refused = sim.compression.start() ?? '';
    }
  };

  const selectSlot = (code: string) => {
    const digit = DIGIT_KEY.exec(code);
    if (digit && Number(digit[1]) <= Math.min(9, placeable.length)) {
      selected = Number(digit[1]) - 1;
      drawHotbar();
    }
  };

  globalThis.addEventListener('keydown', (e) => {
    if (e.repeat) {
      return;
    }
    if (e.code === 'Tab') {
      toggleInventory();
    } else if (e.code === 'KeyT') {
      toggleWait();
    } else if (e.code === 'KeyI' && debug && sim.compression.running) {
      sim.compression.interrupt('debug: simulated threat');
    } else {
      selectSlot(e.code);
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
    if (!input.locked) {
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

  const waitStatus = (): string => {
    const { compression } = sim;
    if (compression.running) {
      return `Waiting… time ×${compression.factor.toFixed(0)} (T to stop)`;
    }
    if (compression.interruption !== undefined) {
      return `Interrupted: ${compression.interruption}. T to continue waiting.`;
    }
    return refused === '' ? 'T: wait' : `Can't wait: ${refused}`;
  };

  const hudText = (hit: ReturnType<typeof target>): string => {
    const [x, y, z] = body.pos.map((v) => (v * s).toFixed(1));
    return [
      `${formatClock(sim.clock.calendar)}${sim.paused ? '   paused' : ''}`,
      waitStatus(),
      `${fps.toFixed(0)} fps   seed ${config.seed}`,
      `radius ${config.radiusM} m   ${input.walking ? 'walking' : 'jogging'} (Z)`,
      `pos ${x} ${y} ${z} m`,
      `chunks ${meshes.count} meshed, ${streamer.pending} pending`,
      hit ? `looking at ${registry.blocks[world.getBlock(...hit.block)]?.name}` : '',
    ].join('\n');
  };

  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05;

    streamer.update(body.pos[0], body.pos[2]);
    // Esc (leaving the game view) pauses; the inventory screen doesn't.
    sim.paused = !input.locked && inventoryPanel.hidden === true;
    sim.frame(dt);
    applySky(scene, engine.lights, skyAt(hourOf(sim.clock.calendar)));

    const [ex, ey, ez] = eye();
    camera.position.set(ex * s, ey * s, ez * s);
    camera.rotation.set(input.pitch, input.yaw, 0);

    hud.textContent = hudText(target());
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
};
