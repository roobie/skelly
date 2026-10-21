import { writeFile } from 'node:fs/promises';
import { BoxGeometry, CylinderGeometry, DoubleSide, Group, Mesh, MeshStandardMaterial } from 'three';
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

const body = new MeshStandardMaterial({ color: 0x23_26_22, roughness: 0.7 });
const straps = new MeshStandardMaterial({ color: 0x15_1a_20, roughness: 1, side: DoubleSide });
const lens = new MeshStandardMaterial({ color: 0x1c_3a_2a, roughness: 0.2, metalness: 0.3 });
const add = (group) => (name, geometry, material, position) => {
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(...position);
  group.add(mesh);
  return mesh;
};

// Front is +z and the head's centre is the origin, as for the riot helmet, so the figure turns it the same way.
const goggles = new Group();
goggles.name = 'Night-vision goggles';
add(goggles)('strap', new CylinderGeometry(0.158, 0.158, 0.022, 16, 1, true), straps, [0, 0, 0]);
add(goggles)('bridge', new BoxGeometry(0.11, 0.035, 0.035), body, [0, 0, 0.16]);
for (const side of [-1, 1]) {
  add(goggles)('tube', new CylinderGeometry(0.024, 0.026, 0.07, 12), body, [side * 0.036, 0, 0.205]).rotation.x =
    Math.PI / 2;
  add(goggles)('lens', new CylinderGeometry(0.02, 0.02, 0.004, 12), lens, [side * 0.036, 0, 0.241]).rotation.x =
    Math.PI / 2;
}

await Promise.all(
  [['night_vision_goggles', goggles]].map(async ([id, model]) => {
    const bytes = await new GLTFExporter().parseAsync(model, { binary: true });
    await writeFile(new URL(`../src/content/base/assets/models/${id}.glb`, import.meta.url), Buffer.from(bytes));
  }),
);
