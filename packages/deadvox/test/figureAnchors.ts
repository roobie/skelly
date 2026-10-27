import { type Object3D, Vector3 } from 'three';
import type { FigureDef, Registry } from '../src/core/content.ts';
import type { FigureLimb } from '../src/core/schema.ts';
import { FIGURE_PIVOT } from '../src/render/playerFigure.ts';

export const figureAnchorAt = ({
  group,
  registry,
  figure,
  name,
  model,
  anchor,
}: {
  group: Object3D;
  registry: Registry;
  figure: FigureDef;
  name: 'body' | FigureLimb;
  model: string;
  anchor: string;
}): Vector3 => {
  group.updateMatrixWorld(true);
  const drawn = group.getObjectByName(`figure-${name}`)!;
  const anchors = registry.models.get(model)!.anchors!;
  const point = new Vector3(...anchors[anchor]!);
  if (name === 'body') {
    const pivots = [
      [figure.body.spine.pivot, 'figure-spine'],
      [figure.body.neck.pivot, 'figure-neck'],
      [figure.body.head.pivot, FIGURE_PIVOT.head],
    ];
    const pivot = pivots.find(([joint]) => joint === anchor);
    if (pivot) {
      return drawn.getObjectByName(pivot[1]!)!.getWorldPosition(point);
    }
    if ([figure.body.joints.leftShoulder, figure.body.joints.rightShoulder].includes(anchor)) {
      return drawn
        .getObjectByName('figure-spine')!
        .localToWorld(point.sub(new Vector3(...anchors[figure.body.spine.pivot]!)));
    }
  }
  return point.applyMatrix4(drawn.matrixWorld);
};
