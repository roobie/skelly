// Minimal leaper viewer: step seeds, switch between the template grid and far LOD, and show each stance.
// URL parameters (seed, size, stance, view, shot, layers) reproduce a view for headless screenshots.

import {
  AmbientLight,
  Box3,
  BoxGeometry,
  Color,
  DirectionalLight,
  GridHelper,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FAR_LOD_HALF_BLOCK_VOXEL_SIZE, generate, type Realized, realize, realizeLod } from '../core/generate.ts';
import { LEAPER_TEMPLATE } from '../mob/leaper/plan.ts';
import { LEAPER_STANCES, type LeaperStance } from '../mob/leaper/poses.ts';
import { type Actor, buildActor, disposeActor } from './scene.ts';

const BLOCK_METRES = 0.5;
const POST_METRES = 2;
type View = 'front' | 'side' | 'three-quarter';
const VIEW_DIRECTIONS: Readonly<Record<View, readonly [number, number, number]>> = {
  front: [0, 0.18, -1],
  side: [1, 0.18, 0],
  'three-quarter': [0.85, 0.35, -1],
};

const element = <T extends HTMLElement>(id: string): T => {
  const found = document.getElementById(id);
  if (!found) {
    throw new Error(`viewer is missing #${id}`);
  }
  return found as T;
};

const params = new URLSearchParams(location.search);
if (params.get('shot') === '1') {
  document.body.classList.add('shot');
}
const seedInput = element<HTMLInputElement>('seed');
const sizeSelect = element<HTMLSelectElement>('voxel-size');
const stanceSelect = element<HTMLSelectElement>('stance');
seedInput.value = params.get('seed') ?? '0';
sizeSelect.value = params.get('size') ?? 'template';
stanceSelect.value = params.get('stance') ?? 'coiled';
let view: View = (params.get('view') as View | null) ?? 'three-quarter';
const shownLayers = new Set((params.get('layers') ?? 'flesh,scale').split(','));

const host = element<HTMLElement>('view');
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
host.append(renderer.domElement);
const scene = new Scene();
scene.background = new Color(0x26_29_2e);
const camera = new PerspectiveCamera(32, 1, 0.05, 100);
const controls = new OrbitControls(camera, renderer.domElement);
scene.add(new HemisphereLight(0xdf_e4_ec, 0x3a_34_30, 1.1), new AmbientLight(0xff_ff_ff, 0.25));
const sun = new DirectionalLight(0xff_f4_e6, 2.2);
sun.position.set(2.5, 4, -3);
scene.add(sun);
const ground = new Mesh(new PlaneGeometry(12, 12), new MeshStandardMaterial({ color: 0x3a_3d_42, roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground, new GridHelper(12, 12 / BLOCK_METRES, 0x55_5a_62, 0x46_4a_51));

/** A post banded every block, standing beside the actor, so height reads against the world's blocks. */
const scalePost = (): Group => {
  const post = new Group();
  for (let band = 0; band < POST_METRES / BLOCK_METRES; band++) {
    const mesh = new Mesh(
      new BoxGeometry(0.06, BLOCK_METRES, 0.06),
      new MeshStandardMaterial({ color: band % 2 === 0 ? 0xd8_d8_d0 : 0x7a_7c_80 }),
    );
    mesh.position.y = BLOCK_METRES * (band + 0.5);
    post.add(mesh);
  }
  post.position.set(-1, 0, 0.9);
  return post;
};
const post = scalePost();
scene.add(post);

let actor: Actor | undefined;
let realized: Realized | undefined;

const resize = (): void => {
  const { clientWidth: width, clientHeight: height } = host;
  renderer.setSize(width, height);
  camera.aspect = width / Math.max(1, height);
  camera.updateProjectionMatrix();
};

const frame = (): void => {
  if (!actor) {
    return;
  }
  const box = new Box3().setFromObject(actor.flesh, true).union(new Box3().setFromObject(post, true));
  const center = box.getCenter(new Vector3());
  const radius = box.getSize(new Vector3()).length() / 2;
  const distance = radius / Math.sin(((camera.fov / 2) * Math.PI) / 180);
  const direction = new Vector3(...VIEW_DIRECTIONS[view]).normalize();
  controls.target.copy(center);
  camera.position.copy(center).addScaledVector(direction, distance * 0.92);
  controls.update();
};

const applyLayers = (): void => {
  if (actor) {
    actor.flesh.visible = shownLayers.has('flesh');
    actor.skeleton.visible = shownLayers.has('skeleton');
    actor.colorByBone.visible = shownLayers.has('colorByBone');
  }
  post.visible = shownLayers.has('scale');
  for (const box of document.querySelectorAll<HTMLInputElement>('[data-layer]')) {
    box.checked = shownLayers.has(box.dataset.layer!);
  }
};

const report = (shown: Realized): void => {
  const height = actor ? new Box3().setFromObject(actor.flesh, true).max.y : 0;
  element('description').textContent = LEAPER_TEMPLATE.description;
  const status = element('status');
  status.innerHTML = shown.report.ok
    ? `<span class="pass">Valid</span> (${shown.profile} profile)`
    : `<span class="fail">Invalid</span> (${shown.profile} profile)`;
  element('issues').innerHTML = shown.report.issues
    .map((issue) => `<li><span class="rule">${issue.rule}</span> ${issue.message}</li>`)
    .join('');
  const rows: [string, string][] = [
    ['Voxel size', `${shown.voxels.size.toFixed(4)} m`],
    ['Voxels', String(shown.report.stats.voxels)],
    ['Triangles', String(shown.report.stats.triangles)],
    ['Bones', String(shown.body.bones.length)],
    ['Supports', [...shown.supportBones].join(', ')],
    ['Top of flesh', `${height.toFixed(2)} m`],
  ];
  element('stats').innerHTML = rows.map(([k, v]) => `<div><span class="k">${k}</span> ${v}</div>`).join('');
};

const show = (): void => {
  const seed = Number.parseInt(seedInput.value, 10) || 0;
  const genome = generate(LEAPER_TEMPLATE, seed);
  const full = realize(genome);
  realized = full;
  if (sizeSelect.value === 'far') {
    realized = full.report.ok
      ? realizeLod({ genome, realized: full, seed, attempts: 1 }, FAR_LOD_HALF_BLOCK_VOXEL_SIZE).realized
      : full;
  }
  if (actor) {
    scene.remove(actor.root);
    disposeActor(actor);
  }
  actor = buildActor(realized, realized.voxels.size);
  actor.applyPose(LEAPER_STANCES[stanceSelect.value as LeaperStance](realized));
  scene.add(actor.root);
  actor.root.updateMatrixWorld(true);
  applyLayers();
  report(realized);
  frame();
  const url = new URL(location.href);
  url.searchParams.set('seed', String(seed));
  url.searchParams.set('size', sizeSelect.value);
  url.searchParams.set('stance', stanceSelect.value);
  url.searchParams.set('view', view);
  history.replaceState(null, '', url);
};

const step = (by: number): void => {
  seedInput.value = String((Number.parseInt(seedInput.value, 10) || 0) + by);
  show();
};
element('prev-seed').addEventListener('click', () => step(-1));
element('next-seed').addEventListener('click', () => step(1));
seedInput.addEventListener('change', show);
sizeSelect.addEventListener('change', show);
stanceSelect.addEventListener('change', show);
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-view]')) {
  button.addEventListener('click', () => {
    view = button.dataset.view as View;
    frame();
  });
}
for (const box of document.querySelectorAll<HTMLInputElement>('[data-layer]')) {
  box.addEventListener('change', () => {
    if (box.checked) {
      shownLayers.add(box.dataset.layer!);
    } else {
      shownLayers.delete(box.dataset.layer!);
    }
    applyLayers();
  });
}
window.addEventListener('resize', () => {
  resize();
  frame();
});

resize();
show();
renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
document.body.dataset.ready = '1';
