import { readFile, writeFile } from 'node:fs/promises';
import { BoxGeometry, Mesh, MeshStandardMaterial } from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const base = new URL('../src/content/base/', import.meta.url);
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((result) => {
      this.result = result;
      this.onloadend?.();
    });
  }
};
const recipes = JSON.parse(await readFile(new URL('presentation/fuel-parts.json', base), 'utf8'));
await Promise.all(
  Object.entries(recipes).map(async ([id, { clear, fill }]) => {
    const file = new URL(`assets/models/${id}.glb`, base);
    const bytes = await readFile(file);
    const gltf = await new GLTFLoader().parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      '',
    );
    const root = gltf.scene.getObjectByName(id);
    if (!root) {
      throw new Error(`No authored model root ${id}`);
    }
    gltf.scene.getObjectByName(fill.piece)?.removeFromParent();
    root.traverse((object) => {
      if (!(object instanceof Mesh)) {
        return;
      }
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (!clear.materials.includes(gltf.parser.associations.get(material)?.materials)) {
          continue;
        }
        material.opacity = clear.opacity;
        material.transparent = true;
        material.depthWrite = false;
        // The authored clear finish must survive ModelLibrary's material-palette application.
        material.userData = {};
      }
    });
    const geometry = new BoxGeometry(...fill.size);
    geometry.translate(0, fill.size[1] / 2, 0);
    const material = new MeshStandardMaterial({ color: fill.color, roughness: fill.roughness });
    material.name = 'fuel';
    const mesh = new Mesh(geometry, material);
    mesh.name = fill.piece;
    mesh.position.set(...fill.bottom);
    root.add(mesh);
    const exported = await new GLTFExporter().parseAsync(root, { binary: true });
    await writeFile(file, Buffer.from(exported));
  }),
);
