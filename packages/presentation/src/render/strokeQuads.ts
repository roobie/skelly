/** A straight mark on a unit face, [x0, y0, x1, y1, width], in face-local units. */
export type Stroke = readonly [number, number, number, number, number];

/** Emits each stroke, which must have length, as two counter-clockwise triangles facing along the face's normal. */
export const strokeQuads = (strokes: Iterable<Stroke>, vertex: (x: number, y: number) => void): void => {
  for (const [x0, y0, x1, y1, width] of strokes) {
    const length = Math.hypot(x1 - x0, y1 - y0);
    const dx = ((-(y1 - y0) / length) * width) / 2;
    const dy = (((x1 - x0) / length) * width) / 2;
    vertex(x0 + dx, y0 + dy);
    vertex(x0 - dx, y0 - dy);
    vertex(x1 - dx, y1 - dy);
    vertex(x0 + dx, y0 + dy);
    vertex(x1 - dx, y1 - dy);
    vertex(x1 + dx, y1 + dy);
  }
};
