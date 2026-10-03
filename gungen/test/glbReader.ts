// A tiny .glb reader for tests: enough to check what the exporter wrote, independent of the writer.

export interface GltfJson {
  asset: { version: string; generator?: string };
  scene: number;
  scenes: { nodes: number[] }[];
  nodes: {
    name?: string;
    children?: number[];
    mesh?: number;
    translation?: number[];
    rotation?: number[];
    extras?: Record<string, unknown>;
  }[];
  meshes: { name?: string; primitives: GltfPrimitive[]; extras?: Record<string, unknown> }[];
  materials: { name?: string; pbrMetallicRoughness: { baseColorFactor: number[] } }[];
  accessors: {
    bufferView: number;
    componentType: number;
    count: number;
    type: string;
    min?: number[];
    max?: number[];
  }[];
  bufferViews: { buffer: number; byteOffset: number; byteLength: number }[];
  buffers?: { byteLength: number }[];
  extras?: Record<string, unknown>;
}

export interface GltfPrimitive {
  // biome-ignore lint/style/useNamingConvention: glTF attribute semantics are upper case
  attributes: { POSITION: number; NORMAL: number };
  indices: number;
  material: number;
  extras?: { solid?: string; material?: string; slot?: string };
}

export interface ReadGlb {
  readonly json: GltfJson;
  readonly bin: Uint8Array;
  readonly floats: (accessor: number) => Float32Array;
}

export const readGlb = (glb: Uint8Array): ReadGlb => {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  if (view.getUint32(0, true) !== 0x46_54_6c_67 || view.getUint32(4, true) !== 2) {
    throw new Error('not a glb 2 file');
  }
  if (view.getUint32(8, true) !== glb.byteLength) {
    throw new Error('glb length header disagrees with the byte length');
  }
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLength))) as GltfJson;
  const binStart = 20 + jsonLength;
  const bin =
    binStart < glb.byteLength
      ? glb.subarray(binStart + 8, binStart + 8 + view.getUint32(binStart, true))
      : new Uint8Array();
  return {
    json,
    bin,
    floats: (accessor) => {
      const a = json.accessors[accessor]!;
      const bv = json.bufferViews[a.bufferView]!;
      const comps = a.type === 'VEC3' ? 3 : 1;
      const copy = bin.slice(bv.byteOffset, bv.byteOffset + a.count * comps * 4);
      return new Float32Array(copy.buffer);
    },
  };
};
