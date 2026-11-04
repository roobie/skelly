// Minimal leaper viewer: step seeds, switch between the template grid and far LOD, play or scrub each clip
// on a whole or cut body. URL parameters (seed, size, clip, t, play, cut, view, shot, layers) reproduce a
// view for headless screenshots and filmstrips.

import {
  AmbientLight,
  Box3,
  BoxGeometry,
  type BufferAttribute,
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
import { materialOf } from '../core/voxelize.ts';
import { severedBoneSet } from '../mob/dismember.ts';
import { LEAPER_CLIPS, leaperClip, leaperFrame, locomotionFor } from '../mob/leaper/motion.ts';
import { LEAPER_TEMPLATE } from '../mob/leaper/plan.ts';
import { jointCracks } from '../mob/leaper/seams.ts';
import { type Actor, buildActor, disposeActor } from './scene.ts';

const BLOCK_METRES = 0.5;
const POST_METRES = 2;
const TRUNK_JOINTS = ['spine', 'chest', 'head'] as const;
type View = 'front' | 'side' | 'three-quarter';
const VIEW_DIRECTIONS: Readonly<Record<View, readonly [number, number, number]>> = {
  front: [0, 0.18, -1],
  side: [1, 0.18, 0],
  'three-quarter': [0.85, 0.35, -1],
};
/** Cut presets: which severed state a clip plays on. */
const CUTS: Readonly<Record<string, readonly string[]>> = {
  none: [],
  'thigh.L': ['thigh.L'],
  'thigh.R': ['thigh.R'],
  'both thighs': ['thigh.L', 'thigh.R'],
  'upperArm.L': ['upperArm.L'],
  head: ['head'],
};
const LOCOMOTION = new Set(['stalk', 'bound']);

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
const clipSelect = element<HTMLSelectElement>('clip');
const cutSelect = element<HTMLSelectElement>('cut');
const playBox = element<HTMLInputElement>('play');
const timeSlider = element<HTMLInputElement>('time');
for (const clip of ['rest', ...LEAPER_CLIPS]) {
  clipSelect.add(new Option(clip === 'rest' ? 'rest (coiled)' : clip, clip));
}
for (const cut of Object.keys(CUTS)) {
  cutSelect.add(new Option(cut, cut));
}
seedInput.value = params.get('seed') ?? '0';
sizeSelect.value = params.get('size') ?? 'template';
clipSelect.value = params.get('clip') ?? 'idle';
cutSelect.value = params.get('cut') ?? 'none';
playBox.checked = params.get('play') !== '0';
timeSlider.value = params.get('t') ?? '0';
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
const ground = new Mesh(new PlaneGeometry(16, 16), new MeshStandardMaterial({ color: 0x3a_3d_42, roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground, new GridHelper(16, 16 / BLOCK_METRES, 0x55_5a_62, 0x46_4a_51));

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

interface Shown {
  readonly realized: Realized;
  readonly actor: Actor;
  readonly clip: string;
  readonly mirrored: boolean;
  readonly cuts: readonly string[];
  /** Per flesh mesh: its glow attribute, the material emission of each vertex, and which vertices charge. */
  readonly glows: readonly { attribute: BufferAttribute; base: Float32Array; charged: Uint8Array }[];
}
let shown: Shown | undefined;

const resize = (): void => {
  const { clientWidth: width, clientHeight: height } = host;
  renderer.setSize(width, height);
  camera.aspect = width / Math.max(1, height);
  camera.updateProjectionMatrix();
};

const applyLayers = (): void => {
  if (shown) {
    shown.actor.flesh.visible = shownLayers.has('flesh');
    shown.actor.skeleton.visible = shownLayers.has('skeleton');
    shown.actor.colorByBone.visible = shownLayers.has('colorByBone');
  }
  post.visible = shownLayers.has('scale');
  for (const box of document.querySelectorAll<HTMLInputElement>('[data-layer]')) {
    box.checked = shownLayers.has(box.dataset.layer!);
  }
};

const glowsOf = (realized: Realized, actor: Actor): Shown['glows'] =>
  actor.flesh.children.map((child) => {
    const mesh = child as Mesh;
    const attribute = mesh.geometry.getAttribute('glow') as BufferAttribute;
    const boneIndex = realized.body.bones.findIndex((bone) => bone.id === mesh.userData.boneId);
    const { colors } = realized.meshes.get(boneIndex)!;
    const charged = Uint8Array.from(colors, (byte) =>
      realized.body.materials[materialOf(realized.voxels, byte)]!.charged === true ? 1 : 0,
    );
    return { attribute, base: Float32Array.from(attribute.array as Float32Array), charged };
  });

/** Poses the shown actor at normalized clip time `u` and brightens its charged materials. */
const poseAt = (u: number): void => {
  if (!shown) {
    return;
  }
  const { realized, actor, clip, mirrored, cuts } = shown;
  const frame =
    clip === 'rest'
      ? { pose: { root: [0, 0, 0] as const, rotations: {} }, charge: 1, airborne: false }
      : leaperFrame(realized, clip, u, { cuts, mirrored });
  actor.applyPose(frame.pose);
  for (const { attribute, base, charged } of shown.glows) {
    for (let v = 0; v < base.length; v++) {
      attribute.setX(v, charged[v] ? base[v]! * frame.charge : base[v]!);
    }
    attribute.needsUpdate = true;
  }
  const hidden = severedBoneSet(realized.body.bones, cuts);
  const cracks = jointCracks(realized, frame.pose, TRUNK_JOINTS, hidden);
  element('frame').textContent =
    `t ${u.toFixed(3)}${frame.airborne ? ' (airborne)' : ''} · charge ${frame.charge.toFixed(2)} · trunk cracks ` +
    TRUNK_JOINTS.map((joint) => `${joint} ${(cracks.get(joint) ?? 0).toFixed(2)}`).join(', ');
};

/** Frames the camera on the whole clip, so a travelling clip stays in view without the camera moving. */
const frame = (): void => {
  if (!shown) {
    return;
  }
  const box = new Box3().setFromObject(post, true);
  for (const u of [0, 0.25, 0.5, 0.6, 0.75, 1]) {
    poseAt(u);
    shown.actor.root.updateMatrixWorld(true);
    box.union(new Box3().setFromObject(shown.actor.flesh, true));
  }
  poseAt(Number(timeSlider.value));
  const center = box.getCenter(new Vector3());
  const radius = box.getSize(new Vector3()).length() / 2;
  const distance = radius / Math.sin(((camera.fov / 2) * Math.PI) / 180);
  controls.target.copy(center);
  camera.position.copy(center).addScaledVector(new Vector3(...VIEW_DIRECTIONS[view]).normalize(), distance * 0.92);
  controls.update();
};

const report = (realized: Realized, full: Realized): void => {
  element('description').textContent = LEAPER_TEMPLATE.description;
  const verdict = (r: Realized): string =>
    r.report.ok ? `<span class="pass">valid</span>` : `<span class="fail">invalid</span>`;
  element('status').innerHTML = `Template grid ${verdict(full)} · shown ${verdict(realized)} (${realized.profile})`;
  element('issues').innerHTML = realized.report.issues
    .map((issue) => `<li><span class="rule">${issue.rule}</span> ${issue.message}</li>`)
    .join('');
  const rows: [string, string][] = [
    ['Voxel size', `${realized.voxels.size.toFixed(4)} m`],
    ['Voxels', String(realized.report.stats.voxels)],
    ['Triangles', String(realized.report.stats.triangles)],
    ['Bones', String(realized.body.bones.length)],
  ];
  element('stats').innerHTML = rows.map(([k, v]) => `<div><span class="k">${k}</span> ${v}</div>`).join('');
};

const syncUrl = (): void => {
  const url = new URL(location.href);
  url.searchParams.set('seed', seedInput.value);
  url.searchParams.set('size', sizeSelect.value);
  url.searchParams.set('clip', clipSelect.value);
  url.searchParams.set('cut', cutSelect.value);
  url.searchParams.set('t', Number(timeSlider.value).toFixed(3));
  url.searchParams.set('play', playBox.checked ? '1' : '0');
  url.searchParams.set('view', view);
  history.replaceState(null, '', url);
};

const show = (): void => {
  const seed = Number.parseInt(seedInput.value, 10) || 0;
  const genome = generate(LEAPER_TEMPLATE, seed);
  const full = realize(genome);
  const realized =
    sizeSelect.value === 'far' && full.report.ok
      ? realizeLod({ genome, realized: full, seed, attempts: 1 }, FAR_LOD_HALF_BLOCK_VOXEL_SIZE).realized
      : full;
  if (shown) {
    scene.remove(shown.actor.root);
    disposeActor(shown.actor);
  }
  const cuts = CUTS[cutSelect.value] ?? [];
  const hidden = severedBoneSet(realized.body.bones, cuts);
  const gait = LOCOMOTION.has(clipSelect.value)
    ? locomotionFor(hidden, clipSelect.value === 'bound')
    : { clip: clipSelect.value, mirrored: clipSelect.value === 'limp' && cuts.includes('thigh.R') };
  const actor = buildActor(realized, realized.voxels.size);
  actor.setSeveredBones(hidden);
  scene.add(actor.root);
  shown = { realized, actor, clip: gait.clip, mirrored: gait.mirrored, cuts, glows: glowsOf(realized, actor) };
  element('clip-note').textContent =
    gait.clip === clipSelect.value ? '' : `This body plays ${gait.clip}${gait.mirrored ? ' (mirrored)' : ''}.`;
  applyLayers();
  report(realized, full);
  frame();
  syncUrl();
};

const step = (by: number): void => {
  seedInput.value = String((Number.parseInt(seedInput.value, 10) || 0) + by);
  show();
};
element('prev-seed').addEventListener('click', () => step(-1));
element('next-seed').addEventListener('click', () => step(1));
for (const control of [seedInput, sizeSelect, clipSelect, cutSelect]) {
  control.addEventListener('change', show);
}
playBox.addEventListener('change', syncUrl);
timeSlider.addEventListener('input', () => {
  playBox.checked = false;
  poseAt(Number(timeSlider.value));
  syncUrl();
});
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-view]')) {
  button.addEventListener('click', () => {
    view = button.dataset.view as View;
    frame();
    syncUrl();
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
let last = performance.now();
renderer.setAnimationLoop((now: number) => {
  if (shown && playBox.checked && shown.clip !== 'rest') {
    const { seconds } = leaperClip(shown.clip);
    timeSlider.value = String((Number(timeSlider.value) + (now - last) / 1000 / seconds) % 1);
    poseAt(Number(timeSlider.value));
  }
  last = now;
  controls.update();
  renderer.render(scene, camera);
});
document.body.dataset.ready = '1';
