import { writeFile } from 'node:fs/promises';
import { BoxGeometry, CylinderGeometry, DoubleSide, Group, Mesh, MeshStandardMaterial, SphereGeometry } from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

// The exporter uses the browser reader even for texture-free Node exports.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((result) => {
      this.result = result;
      this.onloadend?.();
    });
  }
};

const fabric = new MeshStandardMaterial({ color: 0x24_29_32, roughness: 1 });
const straps = new MeshStandardMaterial({ color: 0x15_1a_20, roughness: 1 });
const shell = new MeshStandardMaterial({ color: 0x20_29_36, roughness: 0.65 });
const visor = new MeshStandardMaterial({
  color: 0x9c_b9_c2,
  roughness: 0.25,
  transparent: true,
  opacity: 0.45,
  side: DoubleSide,
});
const add = (group) => (name, geometry, material, position) => {
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(...position);
  group.add(mesh);
  return mesh;
};
const box = (group) => (name, size, material, position) =>
  add(group)(name, new BoxGeometry(...size), material, position);

const vest = new Group();
vest.name = 'Stab vest';
box(vest)('front panel', [0.38, 0.045, 0.43], fabric, [0, 0.085, 0]);
box(vest)('back panel', [0.38, 0.04, 0.43], fabric, [0, 0.02, 0]);
for (const side of [-1, 1]) {
  box(vest)('shoulder strap', [0.07, 0.055, 0.16], straps, [side * 0.125, 0.05, -0.24]);
  box(vest)('waist fastening', [0.07, 0.075, 0.1], straps, [side * 0.2, 0.05, 0.1]);
}

const helmet = new Group();
helmet.name = 'Riot helmet';
add(helmet)('shell', new SphereGeometry(0.15, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), shell, [0, 0.04, 0]);
add(helmet)('padded rim', new CylinderGeometry(0.15, 0.14, 0.04, 12, 1, true), straps, [0, 0.04, 0]);
box(helmet)('visor', [0.25, 0.19, 0.012], visor, [0, 0.005, 0.145]);
box(helmet)('visor hinge left', [0.025, 0.035, 0.04], shell, [-0.14, 0.07, 0.06]);
box(helmet)('visor hinge right', [0.025, 0.035, 0.04], shell, [0.14, 0.07, 0.06]);

const view = new Group();
view.name = 'Riot helmet inside';
// Unit camera frustum; the renderer adapts x/y to the current field of view.
box(view)('pane', [2.4, 2.4, 0.001], visor, [0, 0, -1.2]);
box(view)('rim top', [0.16, 0.016, 0.002], straps, [0, 0.057, -0.06]);
box(view)('rim left', [0.012, 0.12, 0.002], straps, [-0.058, 0, -0.06]);
box(view)('rim right', [0.012, 0.12, 0.002], straps, [0.058, 0, -0.06]);

await Promise.all(
  [
    ['stab_vest', vest],
    ['riot_helmet', helmet],
    ['riot_helmet_view', view],
  ].map(async ([id, model]) => {
    const bytes = await new GLTFExporter().parseAsync(model, { binary: true });
    await writeFile(new URL(`../src/content/base/assets/models/${id}.glb`, import.meta.url), Buffer.from(bytes));
  }),
);
