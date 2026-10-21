// biome-ignore-all lint/correctness/noNodejsModules: reproducible asset-authoring CLI
import { writeFile } from 'node:fs/promises';
import {
  BoxGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
} from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

// Texture-free GLTFExporter still uses the browser reader for its binary buffer.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((result) => {
      this.result = result;
      this.onloadend?.();
    });
  }
};

const material = (color, metalness = 0, roughness = 0.7) =>
  new MeshStandardMaterial({ color, metalness, roughness, side: DoubleSide });
const steel = material(0xa4_ad_b0, 0.65, 0.4);
const innerSteel = material(0x79_83_85, 0.45, 0.55);
const darkSteel = material(0x49_52_57, 0.6, 0.5);
const redGrip = material(0x83_25_1c);
const beansLabel = material(0xa7_53_35);
const soupLabel = material(0xbe_a7_71);
const paper = material(0xdd_ce_a1);
const beansFood = material(0x8e_43_20);
const soupFood = material(0xad_6d_25);
const drawing = (group) => {
  const add = (name, geometry, finish, position) => {
    const mesh = new Mesh(geometry, finish);
    mesh.name = name;
    mesh.position.set(...position);
    group.add(mesh);
    return mesh;
  };
  return {
    add,
    box: (name, size, finish, position) => add(name, new BoxGeometry(...size), finish, position),
    disk: (name, [radius, thickness], finish, position) =>
      add(name, new CylinderGeometry(radius, radius, thickness, 32), finish, position),
    ring: (name, radius, tube, position) => {
      const mesh = add(name, new TorusGeometry(radius, tube, 6, 32), steel, position);
      mesh.rotation.x = Math.PI / 2;
      return mesh;
    },
  };
};

const can = (radius, height, label, food) => {
  const group = new Group();
  const draw = drawing(group);
  group.name = 'Opened tin with attached lid';
  draw.add('hollow wall', new CylinderGeometry(radius, radius, height, 32, 1, true), innerSteel, [0, height / 2, 0]);
  draw.disk('bottom', [radius, 0.0015], innerSteel, [0, 0.001, 0]);
  draw.add('paper label', new CylinderGeometry(radius + 0.0003, radius + 0.0003, height * 0.68, 32, 1, true), label, [
    0,
    height / 2,
    0,
  ]);
  for (const y of [height * 0.2, height * 0.8]) {
    draw.add('label stripe', new CylinderGeometry(radius + 0.0005, radius + 0.0005, 0.003, 32, 1, true), paper, [
      0,
      y,
      0,
    ]);
  }
  draw.ring('bottom rolled seam', radius, 0.0014, [0, 0.0015, 0]);
  draw.ring('open mouth rolled seam', radius, 0.0012, [0, height, 0]);
  const hinge = new Group();
  hinge.name = 'uncut lid hinge';
  hinge.position.set(0, height, -radius);
  hinge.rotation.x = -Math.PI * 0.42;
  group.add(hinge);
  drawing(hinge).disk('bent open lid', [radius - 0.001, 0.0008], steel, [0, 0, radius - 0.001]);
  drawing(hinge).ring('lid pressed rim', radius - 0.004, 0.000_65, [0, 0.0006, radius - 0.001]);
  if (food) {
    draw.disk('retained serving', [radius - 0.001, 0.003], food, [0, height * 0.77, 0]);
    if (food === beansFood) {
      for (const [x, z, turn] of [
        [-0.014, -0.012, 0.3],
        [0.008, -0.018, 1],
        [0.018, 0, -0.4],
        [-0.013, 0.011, 0.7],
        [0.004, 0.019, -0.6],
        [0, 0, 0.4],
      ]) {
        const bean = draw.add('bean', new SphereGeometry(0.006, 8, 6), beansFood, [x, height * 0.79, z]);
        bean.scale.set(1, 0.55, 1.5);
        bean.rotation.y = turn;
      }
    }
  }
  return group;
};

const opener = new Group();
const draw = drawing(opener);
opener.name = 'Hand can opener';
for (const side of [-1, 1]) {
  const arm = new Group();
  arm.position.set(0.035, 0.015, side * 0.004);
  arm.rotation.y = side * 0.16;
  opener.add(arm);
  const handle = drawing(arm);
  handle.box('steel handle tang', [0.127, 0.006, 0.008], steel, [-0.058, 0, 0]);
  handle.box('red grip', [0.092, 0.014, 0.014], redGrip, [-0.075, 0, 0]);
  handle.add('grip end', new SphereGeometry(0.007, 8, 6), redGrip, [-0.121, 0, 0]);
}
draw.box('upper jaw', [0.037, 0.004, 0.021], steel, [0.043, 0.023, 0]);
draw.box('lower jaw', [0.032, 0.004, 0.018], darkSteel, [0.046, 0.009, 0]);
draw.disk('pivot rivet', [0.004, 0.019], steel, [0.027, 0.017, 0]);
draw.disk('toothed feed wheel', [0.009, 0.005], darkSteel, [0.052, 0.015, 0.004]);
for (let i = 0; i < 12; i++) {
  const angle = (i * Math.PI) / 6;
  const tooth = draw.box('feed tooth', [0.003, 0.005, 0.002], steel, [
    0.052 + Math.cos(angle) * 0.009,
    0.015,
    0.004 + Math.sin(angle) * 0.009,
  ]);
  tooth.rotation.y = -angle;
}
draw.disk('cutting wheel', [0.008, 0.002], steel, [0.049, 0.021, -0.009]);
draw.disk('winding spindle', [0.003, 0.022], steel, [0.052, 0.035, 0.004]);
draw.box('butterfly winding key', [0.032, 0.006, 0.012], darkSteel, [0.052, 0.047, 0.004]);
for (const side of [-1, 1]) {
  draw.disk('key wing', [0.007, 0.006], darkSteel, [0.052 + side * 0.014, 0.047, 0.004]);
}

await Promise.all(
  [
    ['opened_beans', can(0.037, 0.11, beansLabel, beansFood)],
    ['opened_soup', can(0.034, 0.12, soupLabel, soupFood)],
    ['empty_can', can(0.037, 0.11, beansLabel)],
    ['can_opener', opener],
  ].map(async ([id, model]) => {
    const bytes = await new GLTFExporter().parseAsync(model, { binary: true });
    await writeFile(new URL(`../src/content/base/assets/models/${id}.glb`, import.meta.url), Buffer.from(bytes));
  }),
);
