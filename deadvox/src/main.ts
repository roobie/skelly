import * as THREE from 'three';
import { CHUNK } from './core/coords.ts';
import { type ContentSource, blockColors, blockId, buildRegistry } from './core/content.ts';
import type { Stack } from './core/inventory.ts';
import { bodyOverlapsBlock, stepBody } from './core/physics.ts';
import { raycast } from './core/raycast.ts';
import { World } from './core/world.ts';
import { terrainHeight } from './core/worldgen.ts';
import { Input } from './game/input.ts';
import { EYE_HEIGHT, REACH, createPlayerBody, steer } from './game/player.ts';
import { Streamer } from './game/streamer.ts';
import { ChunkMeshes } from './render/chunks.ts';
import { renderInventory } from './ui/inventory.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') ?? 1) | 0;
const RADIUS = Number(params.get('radius') ?? 5);

// ---- content ----
// Base content is bundled. Mods would be appended to this list (from URLs or local files).

const files = import.meta.glob<unknown>('./content/base/*.json', { eager: true, import: 'default' });
const sources: ContentSource[] = Object.entries(files)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([source, data]) => ({ source, data }));
const { registry, issues } = buildRegistry(sources);
$('errors').textContent = issues.map((i) => `${i.source} ${i.path}: ${i.message}`).join('\n');

const terrain = {
  grass: blockId(registry, 'grass'),
  dirt: blockId(registry, 'dirt'),
  stone: blockId(registry, 'stone'),
  sand: blockId(registry, 'sand'),
};
const placeable = registry.blocks.slice(1);
let selected = 0;

const inventory: Stack[] = [
  { item: 'canned_beans', count: 2 },
  { item: 'water_bottle', count: 1 },
  { item: 'bandage', count: 3 },
  { item: 'kitchen_knife', count: 1 },
  { item: 'matches', count: 1 },
].filter((s) => registry.items.has(s.item));

// ---- world ----

const world = new World();
const isSolid = (x: number, y: number, z: number) => {
  const id = world.getBlock(x, y, z);
  return id !== 0 && registry.blocks[id]!.solid;
};

// ---- rendering ----

const view = $('view');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
view.appendChild(renderer.domElement);

const sky = new THREE.Color(0xa9bfd0);
const scene = new THREE.Scene();
scene.background = sky;
scene.fog = new THREE.Fog(sky, RADIUS * CHUNK * 0.55, RADIUS * CHUNK * 0.95);
scene.add(new THREE.HemisphereLight(0xdfe8f0, 0x5a4a3a, 1.3));
const sun = new THREE.DirectionalLight(0xfff2dd, 1.6);
sun.position.set(0.4, 1, 0.25);
scene.add(sun);

const camera = new THREE.PerspectiveCamera(75, 1, 0.05, RADIUS * CHUNK * 1.5);
camera.rotation.order = 'YXZ';

const meshes = new ChunkMeshes();
scene.add(meshes.group);

const outline = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002)),
  new THREE.LineBasicMaterial({ color: 0x111111 }),
);
outline.visible = false;
scene.add(outline);

const resize = () => {
  renderer.setSize(view.clientWidth, view.clientHeight);
  camera.aspect = view.clientWidth / Math.max(view.clientHeight, 1);
  camera.updateProjectionMatrix();
};
resize();
new ResizeObserver(resize).observe(view);

// ---- player and streaming ----

const body = createPlayerBody(0.5, terrainHeight(seed, 0, 0) + 1, 0.5);
const streamer = new Streamer({ world, meshes, seed, terrain, colors: blockColors(registry), radius: RADIUS });
const input = new Input(renderer.domElement);

// ---- UI ----

const overlay = $('overlay');
const inventoryPanel = $('inventory');
const hud = $('hud');
const hotbar = $('hotbar');

const syncOverlay = () => {
  overlay.hidden = input.locked || !inventoryPanel.hidden;
};
overlay.addEventListener('click', () => input.lock());
renderer.domElement.addEventListener('click', () => {
  if (!input.locked) input.lock();
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

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'Tab') {
    const open = inventoryPanel.hidden;
    inventoryPanel.hidden = !open;
    if (open) {
      renderInventory(inventoryPanel, inventory, registry);
      input.unlock();
    } else {
      input.lock();
    }
    syncOverlay();
  }
  const digit = /^Digit([1-9])$/.exec(e.code);
  if (digit && Number(digit[1]) <= Math.min(9, placeable.length)) {
    selected = Number(digit[1]) - 1;
    drawHotbar();
  }
});
window.addEventListener('wheel', (e) => {
  if (!input.locked) return;
  const n = Math.min(9, placeable.length);
  selected = (selected + (e.deltaY > 0 ? 1 : -1) + n) % n;
  drawHotbar();
});

// ---- block editing ----

const lookDir = (): [number, number, number] => {
  const d = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation);
  return [d.x, d.y, d.z];
};
const eye = (): [number, number, number] => [body.pos[0], body.pos[1] + EYE_HEIGHT, body.pos[2]];

renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
renderer.domElement.addEventListener('mousedown', (e) => {
  if (!input.locked) return;
  const hit = raycast(eye(), lookDir(), REACH, isSolid);
  if (!hit) return;
  if (e.button === 0) {
    streamer.markEdited(world.setBlock(...hit.block, 0));
  } else if (e.button === 2) {
    const target: [number, number, number] = [
      hit.block[0] + hit.normal[0],
      hit.block[1] + hit.normal[1],
      hit.block[2] + hit.normal[2],
    ];
    if (bodyOverlapsBlock(body, target)) return;
    const block = placeable[selected];
    if (block) streamer.markEdited(world.setBlock(...target, blockId(registry, block.id)));
  }
});

// ---- loop ----

const STEP = 1 / 60;
let last = performance.now();
let acc = 0;
let fps = 0;

const frame = (now: number) => {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05;

  streamer.update(body.pos[0], body.pos[2]);

  // Hold the player still until there is ground under them.
  if (streamer.isReady(body.pos[0], body.pos[2])) {
    acc += dt;
    while (acc >= STEP) {
      const intent = input.locked ? input.intent() : { forward: 0, right: 0, jump: false, sprint: false };
      steer(body, input.yaw, intent);
      stepBody(body, STEP, isSolid);
      acc -= STEP;
    }
  }

  camera.position.set(...eye());
  camera.rotation.set(input.pitch, input.yaw, 0);

  const hit = input.locked ? raycast(eye(), lookDir(), REACH, isSolid) : undefined;
  outline.visible = hit !== undefined;
  if (hit) outline.position.set(hit.block[0] + 0.5, hit.block[1] + 0.5, hit.block[2] + 0.5);

  const [x, y, z] = body.pos;
  hud.textContent = [
    `${fps.toFixed(0)} fps   seed ${seed}`,
    `pos ${x.toFixed(1)} ${y.toFixed(1)} ${z.toFixed(1)}`,
    `chunks ${meshes.count} meshed, ${streamer.pending} pending`,
    hit ? `looking at ${registry.blocks[world.getBlock(...hit.block)]?.name}` : '',
  ].join('\n');

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
};
requestAnimationFrame(frame);
