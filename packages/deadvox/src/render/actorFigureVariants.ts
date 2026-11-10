import type { BufferGeometry } from 'three';
import type { ActorFigureFile } from '../engine/content.ts';
import { actorFigureGeometry } from './actorFigureGeometry.ts';

// Content types that share a figure model and seed bake identical figures under their own names. Drawing each
// distinct figure once keeps the shared bone texture within small GPU texture limits and saves a draw call per copy.

/** One figure as the renderer would draw it, under the figure key it is drawn for. */
export interface DrawnFigure<T> {
  readonly key: string;
  readonly type: T;
  readonly figure: ActorFigureFile;
}

/** Figures that draw alike, with the geometry they share. */
export interface FigureVariant<T> {
  readonly type: T;
  readonly figure: ActorFigureFile;
  readonly geometry: BufferGeometry;
  readonly keys: readonly string[];
}

const sameGeometry = (a: BufferGeometry, b: BufferGeometry): boolean => {
  const names = Object.keys(a.attributes);
  const arrays = (geometry: BufferGeometry) => [
    ...names.map((name) => geometry.getAttribute(name)),
    geometry.getIndex(),
  ];
  if (names.length !== Object.keys(b.attributes).length) {
    return false;
  }
  const left = arrays(a);
  const right = arrays(b);
  return left.every((attribute, i) => {
    const other = right[i];
    if (!(attribute && other && attribute.itemSize === other.itemSize)) {
      return false;
    }
    const x = new Uint8Array(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength);
    const y = new Uint8Array(other.array.buffer, other.array.byteOffset, other.array.byteLength);
    return x.length === y.length && x.every((byte, k) => byte === y[k]);
  });
};

/** The body and clips the renderer reads, without the content type that names them. */
const drawnData = ({ body, clips }: ActorFigureFile): string => JSON.stringify([{ ...body, type: undefined }, clips]);

/** The distinct figures among `figures`, in first-seen order, each with every key that draws as it. */
export const figureVariants = <T>(figures: readonly DrawnFigure<T>[]): FigureVariant<T>[] => {
  const variants: (FigureVariant<T> & { readonly data: string; readonly keys: string[] })[] = [];
  for (const { key, type, figure } of figures) {
    const geometry = actorFigureGeometry(figure.mesh, figure.body);
    const data = drawnData(figure);
    const same = variants.find((variant) => variant.data === data && sameGeometry(variant.geometry, geometry));
    if (same) {
      geometry.dispose();
      same.keys.push(key);
      continue;
    }
    variants.push({ type, figure, geometry, keys: [key], data });
  }
  return variants.map(({ type, figure, geometry, keys }) => ({ type, figure, geometry, keys }));
};
