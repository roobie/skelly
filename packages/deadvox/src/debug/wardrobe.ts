// Wardrobe spike: player figures in a row, each wearing a list of items, for comparing worn looks side by side.
// Query: looks=a,b|c (one figure per |-separated list, `bare` for none), view=front|back|side|three,
// pose=standing|walking|crouching|prone, phase=<gait radians>, focus=body|head|hand|foot.
import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { CORE_CONTENT_IDS } from '../core/contentIds.ts';
import type { Vec3 } from '../core/coords.ts';
import { graphicsTuningOf } from '../core/graphicsTuning.ts';
import { BLOCK_SIZE } from '../core/scale.ts';
import { buildBundledContent } from '../game/bundledContent.ts';
import { ModelLibrary } from '../render/models.ts';
import { type PlayerFigurePose, PlayerMeshes } from '../render/playerFigure.ts';

const query = new URLSearchParams(location.search);
const looks = (
  query.get('looks') ??
  'bare|jacket_leather,cowboy_hat,gloves_leather,boots_combat|armor_lc_plate,helmet_plate,gloves_plate,lc_sabaton,legguard_lightplate|armor_trooper,helmet_trooper,gloves_trooper,boots_trooper,legguard_trooper'
)
  .split('|')
  .map((look) => (look === 'bare' ? [] : look.split(',').filter(Boolean)));
const view = query.get('view') ?? 'three';
const poseName = query.get('pose') ?? 'standing';
const focus = query.get('focus') ?? 'body';
const SPACING = 0.85;

const canvas = document.querySelector<HTMLCanvasElement>('#scene')!;
const renderer = new WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight, false);
const scene = new Scene();
scene.background = new Color(0xb8_c4_c8);
scene.add(new HemisphereLight(0xdf_e8_f0, 0x5a_50_48, 1.4));
scene.add(new AmbientLight(0xff_ff_ff, 0.35));
const sun = new DirectionalLight(0xff_f4_e0, 2.2);
sun.position.set(-2, 4, -3);
scene.add(sun);
const camera = new PerspectiveCamera(focus === 'body' ? 32 : 22, innerWidth / innerHeight, 0.05, 50);
// The player's own head sits on a layer the first-person camera skips; this camera sees every layer.
camera.layers.enableAll();

const { registry } = buildBundledContent();
const models = new ModelLibrary(
  registry,
  (message) => {
    document.querySelector('#stats')!.textContent = message;
  },
  undefined,
  graphicsTuningOf(registry).modelLoadConcurrency,
);
const figure = registry.figures.get(CORE_CONTENT_IDS.player)!;
const moving = poseName.endsWith('walking') || poseName === 'walking';
const stance = (poseName.replace(/-?walking$/, '') || 'standing') as PlayerFigurePose['stance'];

const people = looks.map((wear, index) => {
  const meshes = new PlayerMeshes(BLOCK_SIZE, figure, registry.models, models);
  const worn: Record<string, { uid: number; type: string; count: number; condition: number }> = {};
  wear.forEach((type, n) => {
    const slot = registry.items.get(type)?.wearable?.slot;
    if (!slot) {
      throw new Error(`Not wearable: ${type}`);
    }
    worn[slot] = { uid: index * 100 + n + 1, type, count: 1, condition: 1 };
  });
  // Seen from the front, +x is on the left, so the first look stands at +x.
  const x = ((looks.length - 1) / 2 - index) * SPACING;
  const pose: PlayerFigurePose = {
    body: { pos: [x / BLOCK_SIZE, 0, 0] as Vec3, vel: [0, 0, 0], halfWidth: 0.3, height: 1.8, onGround: true },
    yaw: 0,
    stepOffset: 0,
    gaitPhase: Number(query.get('phase') ?? 1.2),
    moving,
    stance,
    dt: 0.25,
    thirdPerson: true,
    wornItems: { registry, worn } as unknown as NonNullable<PlayerFigurePose['wornItems']>,
  };
  scene.add(meshes.group);
  return { meshes, pose, wear };
});

// Pickers edit the last figure in the row and the camera; each change reloads with the new query.
function picker(label: string, value: string, options: string[], apply: (picked: string) => void): void {
  const select = document.createElement('select');
  select.innerHTML = options
    .map((option) => `<option${option === value ? ' selected' : ''}>${option}</option>`)
    .join('');
  select.addEventListener('change', () => {
    apply(select.value);
    location.search = query.toString();
  });
  const wrap = document.createElement('label');
  wrap.append(label, select);
  document.querySelector('#pickers')!.append(wrap);
}
const bySlot = new Map<string, string[]>();
for (const [id, item] of registry.items) {
  const slot = item.wearable?.slot;
  if (slot) {
    bySlot.set(slot, [...(bySlot.get(slot) ?? []), id].sort());
  }
}
const edited = looks.at(-1) ?? [];
for (const [slot, ids] of [...bySlot].sort(([a], [b]) => a.localeCompare(b))) {
  const current = edited.find((type) => registry.items.get(type)?.wearable?.slot === slot) ?? '—';
  picker(slot, current, ['—', ...ids], (picked) => {
    const rest = edited.filter((type) => registry.items.get(type)?.wearable?.slot !== slot);
    const next = picked === '—' ? rest : [...rest, picked];
    const row = looks.slice(0, -1).map((wear) => (wear.length > 0 ? wear.join(',') : 'bare'));
    query.set('looks', [...row, next.length > 0 ? next.join(',') : 'bare'].join('|'));
  });
}
picker('view', view, ['front', 'back', 'side', 'three'], (picked) => query.set('view', picked));
picker('pose', poseName, ['standing', 'walking', 'crouching', 'prone'], (picked) => query.set('pose', picked));
picker('focus', focus, ['body', 'head', 'hand', 'foot'], (picked) => query.set('focus', picked));

// From behind, the row reads the other way round.
document.querySelector('#labels')!.innerHTML = (view === 'back' ? [...looks].reverse() : looks)
  .map((wear) => `<span>${wear.length > 0 ? wear.join(' + ') : 'bare'}</span>`)
  .join('');

// The figures face -z, so the front view looks along +z.
const placeCamera = (): void => {
  const width = looks.length * SPACING;
  const target = new Vector3(0, 0.95, 0);
  let distance = Math.max(4.2, width * 1.55);
  if (focus !== 'body') {
    const box = new Box3();
    const wanted = { head: 'figure-head', hand: 'figure-wrist', foot: 'leg-ankle' }[focus]!;
    people[0]!.meshes.group.traverse((node) => {
      if (node.name === wanted) {
        box.expandByPoint(node.getWorldPosition(new Vector3()));
      }
    });
    // Close-ups frame the first figure only.
    box.getCenter(target);
    target.y += { head: 0.1, hand: -0.06, foot: -0.02 }[focus]!;
    distance = { head: 0.9, hand: 1.1, foot: 1.2 }[focus]!;
  }
  const direction = {
    front: new Vector3(0, 0.12, -1),
    back: new Vector3(0, 0.12, 1),
    side: new Vector3(1, 0.1, 0),
    three: new Vector3(0.75, 0.25, -1),
  }[view]!.normalize();
  camera.position.copy(target).addScaledVector(direction, distance);
  camera.lookAt(target);
};

let settled = 0;
let version = -1;
const frame = (): void => {
  for (const { meshes, pose } of people) {
    meshes.sync(pose);
  }
  if (models.version !== version || !people.every(({ meshes }) => meshes.loaded)) {
    ({ version } = models);
    settled = 0;
  } else {
    settled += 1;
  }
  placeCamera();
  renderer.render(scene, camera);
  const stats = people.map(({ meshes, wear }) => {
    let count = 0;
    let triangles = 0;
    meshes.group.traverseVisible((node) => {
      if (node instanceof Mesh) {
        count += 1;
        const { index } = node.geometry;
        triangles += (index ? index.count : node.geometry.attributes.position!.count) / 3;
      }
    });
    return `${wear.length > 0 ? wear.join('+') : 'bare'}: ${count} meshes, ${Math.round(triangles)} tris`;
  });
  document.querySelector('#stats')!.textContent = stats.join('\n');
  if (settled === 20) {
    document.title = 'wardrobe ready';
  }
  requestAnimationFrame(frame);
};
frame();
