/** One uncoloured mesh as plain arrays, so a worker can build it and hand over its buffers. */
export interface PartData {
  readonly attributes: readonly { readonly name: string; readonly array: Float32Array; readonly itemSize: number }[];
  readonly index: Uint32Array;
  /** One per quad, in vertex order: quad `q` owns vertices `4q` to `4q + 3`. */
  readonly materials: readonly string[];
  readonly quads: number;
  readonly sphere: { readonly center: readonly [number, number, number]; readonly radius: number };
}

/** What a blueprint less its removed parts looks like before any paint: the same for every look that shares both. */
export interface ShapeData {
  readonly solidBaseY: number;
  readonly solid: PartData | undefined;
  readonly clear: PartData | undefined;
}
