import { BufferAttribute, BufferGeometry } from 'three';
import type { ActorBody } from '../core/schema/actors.ts';

// The built actor GLB (`packages/skelly-assets/tools/actorBake.mjs`, `actorGlb`) read synchronously into the
// crowd geometry the bone-texture shader draws. A session decodes every figure before its first frame, so the
// async GLTFLoader would only add a wait; a layout this reader does not know throws instead of drawing wrong.

const GLB_MAGIC = 0x46_54_6c_67;
const JSON_CHUNK = 0x4e_4f_53_4a;
const BIN_CHUNK = 0x00_4e_49_42;
const FLOAT = 5126;
const UNSIGNED_INT = 5125;
const TRIANGLES = 4;
const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 } as const;

interface Accessor {
  readonly bufferView: number;
  readonly byteOffset?: number;
  readonly componentType: number;
  readonly count: number;
  readonly type: keyof typeof COMPONENTS;
}

interface BufferView {
  readonly byteOffset?: number;
  readonly byteLength: number;
  readonly byteStride?: number;
}

interface Primitive {
  readonly attributes: Readonly<Record<string, number>>;
  readonly indices?: number;
  readonly mode?: number;
}

interface Gltf {
  readonly nodes: readonly { readonly mesh?: number; readonly extras?: { readonly bones?: readonly string[] } }[];
  readonly meshes: readonly { readonly primitives: readonly Primitive[] }[];
  readonly accessors: readonly Accessor[];
  readonly bufferViews: readonly BufferView[];
}

interface Glb {
  readonly json: Gltf;
  readonly bin: Uint8Array;
}

const text = new TextDecoder();

const chunks = (mesh: Uint8Array, id: string): Glb => {
  const view = new DataView(mesh.buffer, mesh.byteOffset, mesh.byteLength);
  if (mesh.byteLength < 20 || view.getUint32(0, true) !== GLB_MAGIC || view.getUint32(4, true) !== 2) {
    throw new Error(`Actor mesh ${id} is not a glTF 2.0 binary`);
  }
  const jsonLength = view.getUint32(12, true);
  const binAt = 20 + jsonLength;
  if (view.getUint32(16, true) !== JSON_CHUNK || binAt + 8 > mesh.byteLength) {
    throw new Error(`Actor mesh ${id} has no JSON chunk`);
  }
  if (view.getUint32(binAt + 4, true) !== BIN_CHUNK) {
    throw new Error(`Actor mesh ${id} has no binary chunk`);
  }
  return {
    json: JSON.parse(text.decode(mesh.subarray(20, binAt))) as Gltf,
    bin: mesh.subarray(binAt + 8, binAt + 8 + view.getUint32(binAt, true)),
  };
};

/** One accessor's elements, copied out of the binary chunk so the arrays own aligned buffers. */
const accessorData = (
  { json, bin }: Glb,
  index: number | undefined,
  want: { readonly type: keyof typeof COMPONENTS; readonly componentType: number },
  name: string,
): { readonly values: Float32Array | Uint32Array; readonly count: number } => {
  const accessor = index === undefined ? undefined : json.accessors[index];
  if (!accessor || accessor.type !== want.type || accessor.componentType !== want.componentType) {
    throw new Error(`${name} must be a ${want.type} accessor of component type ${want.componentType}`);
  }
  const view = json.bufferViews[accessor.bufferView];
  const elementBytes = COMPONENTS[want.type] * 4;
  if (!view || (view.byteStride !== undefined && view.byteStride !== elementBytes)) {
    throw new Error(`${name} must be tightly packed`);
  }
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const end = start + accessor.count * elementBytes;
  if (end > (view.byteOffset ?? 0) + view.byteLength || end > bin.byteLength) {
    throw new Error(`${name} runs past its buffer view`);
  }
  // Copied through the Uint8Array constructor because a Node Buffer's `slice` shares memory instead of copying.
  const bytes = new Uint8Array(bin.subarray(start, end)).buffer;
  return {
    values: want.componentType === FLOAT ? new Float32Array(bytes) : new Uint32Array(bytes),
    count: accessor.count,
  };
};

/** Every `stride`-wide element's components from `from` up to `width`, as a tightly packed array. */
const components = (values: Float32Array, stride: number, from: number, width: number): Float32Array => {
  const out = new Float32Array((values.length / stride) * width);
  for (let element = 0; element < values.length / stride; element++) {
    for (let component = 0; component < width; component++) {
      out[element * width + component] = values[element * stride + from + component]!;
    }
  }
  return out;
};

/**
 * The figure's built mesh as crowd geometry: per-vertex position, normal, colour, owning bone, neighbouring bone and
 * emission, indexed by the body's own bone order, which the mesh's bone list must repeat.
 */
export const actorFigureGeometry = (
  mesh: Uint8Array,
  body: Pick<ActorBody, 'type' | 'seed' | 'bones'>,
): BufferGeometry => {
  const id = `${body.type}.${body.seed}`;
  const glb = chunks(mesh, id);
  const node = glb.json.nodes.find((candidate) => candidate.mesh !== undefined);
  const bones = node?.extras?.bones;
  if (!(bones && bones.length === body.bones.length && bones.every((name, i) => name === body.bones[i]!.id))) {
    throw new Error(`Actor mesh ${id} must list the body's bones in body order`);
  }
  const primitives = glb.json.meshes[node!.mesh!]?.primitives ?? [];
  const [primitive] = primitives;
  if (!(primitive && primitives.length === 1 && (primitive.mode ?? TRIANGLES) === TRIANGLES)) {
    throw new Error(`Actor mesh ${id} must be one triangle primitive`);
  }
  const attribute = (semantic: string, type: keyof typeof COMPONENTS) =>
    accessorData(glb, primitive.attributes[semantic], { type, componentType: FLOAT }, `Actor mesh ${id} ${semantic}`);
  const position = attribute('POSITION', 'VEC3');
  const parts = [attribute('NORMAL', 'VEC3'), attribute('COLOR_0', 'VEC4'), attribute('TEXCOORD_1', 'VEC2')];
  const emission = attribute('TEXCOORD_2', 'VEC2');
  if ([...parts, emission].some(({ count }) => count !== position.count)) {
    throw new Error(`Actor mesh ${id} attributes must share one vertex count`);
  }
  const [normal, color, bone] = parts.map(({ values }) => values as Float32Array) as [
    Float32Array,
    Float32Array,
    Float32Array,
  ];
  const indices = accessorData(
    glb,
    primitive.indices,
    { type: 'SCALAR', componentType: UNSIGNED_INT },
    `Actor mesh ${id} indices`,
  );
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(position.values, 3));
  geometry.setAttribute('normal', new BufferAttribute(normal, 3));
  // The fourth colour component carries the material's emissive weight, which the crowd emission already holds.
  geometry.setAttribute('color', new BufferAttribute(components(color, 4, 0, 3), 3));
  geometry.setAttribute('boneIndex', new BufferAttribute(components(bone, 2, 0, 1), 1));
  geometry.setAttribute('neighbourBone', new BufferAttribute(components(bone, 2, 1, 1), 1));
  geometry.setAttribute('crowdEmission', new BufferAttribute(emission.values, 2));
  geometry.setIndex(new BufferAttribute(indices.values, 1));
  geometry.computeBoundingSphere();
  return geometry;
};
