import type { FurnitureDef, GraphicsTuningDef } from '@skelly/engine/content';
import { type BlockEntity, rotationOf } from '@skelly/engine/world';
import { BoxGeometry, Euler, Group, Matrix4, Mesh, MeshLambertMaterial, Quaternion, Vector3 } from 'three';
import { withHeightFog } from './heightFog.ts';

type Triple = readonly [number, number, number];
const radians = (degrees: number) => (degrees * Math.PI) / 180;

/** Where a work site stands in its model's own frame, and the box a pick of it covers there, centred on it. */
export interface SiteAnchor {
  readonly position: Triple;
  readonly orientationDegrees?: Triple;
  readonly pickSize: Triple;
  /** Whether the model's own look draws the site's socket; otherwise its view marks the site by default. */
  readonly socketArt: boolean;
}

/** A site the model shows: its id and, when it has one, its anchor. */
interface AnchoredSite {
  readonly id: string;
  readonly anchor?: SiteAnchor;
}

// Content turns about the housing's fixed X, then Y, then Z axis, which is three.js's intrinsic order 'ZYX'.
export const anchorTurn = ([x, y, z]: Triple = [0, 0, 0]) =>
  new Quaternion().setFromEuler(new Euler(radians(x), radians(y), radians(z), 'ZYX'));

/** The world transform of a housing's own frame, where instrument looks and slot anchors stand. */
export const housingFrame = (entity: BlockEntity, def: FurnitureDef, blockSize: number): Matrix4 => {
  const [right, up, back] = rotationOf(entity).map((axis) => new Vector3(...axis));
  const rotation = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(right!, up!, back!));
  const origin = new Vector3()
    .fromArray(def.size.map((size) => 0.5 - size / 2))
    .applyQuaternion(rotation)
    .add(new Vector3().fromArray(entity.pos.map((value, axis) => value + entity.size[axis]! / 2)))
    .multiplyScalar(blockSize);
  return new Matrix4().compose(origin, rotation, new Vector3().setScalar(blockSize));
};

const anchorMatrix = ({ position, orientationDegrees }: SiteAnchor, scale = new Vector3(1, 1, 1)) =>
  new Matrix4().compose(new Vector3(...position), anchorTurn(orientationDegrees), scale);

/** Each anchored site's pick box as world corners, with its model's own frame standing at `frame`. */
export const socketBoxes = (
  sites: readonly AnchoredSite[],
  frame: Matrix4,
): { readonly site: string; readonly corners: readonly Vector3[] }[] => {
  const unit = [-0.5, 0.5];
  return sites.flatMap(({ id, anchor }) => {
    if (!anchor) {
      return [];
    }
    const box = frame.clone().multiply(anchorMatrix(anchor, new Vector3(...anchor.pickSize)));
    const corners = unit.flatMap((x) => unit.flatMap((y) => unit.map((z) => new Vector3(x, y, z).applyMatrix4(box))));
    return [{ site: id, corners }];
  });
};

/** Each axis a box edge can run along, with the two it stands off along. */
const EDGE_AXES = [
  [0, 1, 2],
  [1, 2, 0],
  [2, 0, 1],
] as const;

/** The twelve edges of a box of `size`, each a bar `edge` thick, as centre and extent. */
const boxEdges = (size: Triple, edge: number): { centre: Triple; extent: Triple }[] =>
  EDGE_AXES.flatMap(([along, across, through]) =>
    [-0.5, 0.5].flatMap((a) =>
      [-0.5, 0.5].map((b) => {
        const centre = [0, 0, 0] as [number, number, number];
        const extent = [edge, edge, edge] as [number, number, number];
        centre[across] = a * size[across];
        centre[through] = b * size[through];
        extent[along] = size[along] + edge;
        return { centre, extent };
      }),
    ),
  );

/**
 * The default marking of each anchored site the model draws no socket art for: its pick box's edges, so a site shows
 * on the model with no socket content. Keyed socket art replaces it.
 */
export const siteMarks = (
  sites: readonly AnchoredSite[],
  frame: Matrix4,
  look: GraphicsTuningDef['siteMark'],
): { readonly model: Group; readonly dispose: () => void } => {
  const model = new Group();
  frame.decompose(model.position, model.quaternion, model.scale);
  const geometry = new BoxGeometry(1, 1, 1);
  const material = withHeightFog(new MeshLambertMaterial({ color: look.color }), 'furniture');
  for (const { id, anchor } of sites) {
    if (!anchor || anchor.socketArt) {
      continue;
    }
    const mark = new Group();
    mark.name = `site-mark:${id}`;
    anchorMatrix(anchor).decompose(mark.position, mark.quaternion, mark.scale);
    for (const { centre, extent } of boxEdges(anchor.pickSize, look.edgeBlocks)) {
      const bar = new Mesh(geometry, material);
      bar.position.set(...centre);
      bar.scale.set(...extent);
      mark.add(bar);
    }
    model.add(mark);
  }
  return {
    model,
    dispose: () => {
      geometry.dispose();
      material.dispose();
    },
  };
};
