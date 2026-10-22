import { applyPoint, rotY, type Transform, type Vec3 } from '@skelly/engine/foundation/math.ts';
import type { ExtrudedPolygonSolid, Solid, Vec2 } from '@skelly/engine/shapes/solid.ts';
import { integer, minValue, parse, pipe, strictObject } from 'valibot';
import { cylinder, positive, scalar } from './shapes.ts';

const prism = (id: string, size: Vec3, frame: Transform, slot = 'body'): ExtrudedPolygonSolid => {
  const [x, y, z] = size;
  const profile = [
    [-x / 2, 0, -z / 2],
    [-x / 2, 0, z / 2],
    [x / 2, 0, z / 2],
    [x / 2, 0, -z / 2],
  ] as const;
  return {
    id,
    kind: 'extruded-polygon',
    axis: 'y',
    slot,
    profile: profile.map((point): Vec2 => {
      const placed = applyPoint(frame, point);
      return [placed[2], placed[0]];
    }),
    z: [frame.t[1] - y / 2, frame.t[1] + y / 2],
  };
};

export const handOpener = (params: Readonly<Record<string, string>>): readonly Solid[] => {
  const d = parse(
    strictObject({
      handleLength: positive,
      tangWidth: positive,
      tangDepth: positive,
      gripLength: positive,
      gripWidth: positive,
      gripDepth: positive,
      handleGap: positive,
      handleSplay: positive,
      jawLength: positive,
      jawWidth: positive,
      jawThickness: positive,
      jawGap: positive,
      pivotRadius: positive,
      feedRadius: positive,
      feedThickness: positive,
      toothDepth: positive,
      toothCount: pipe(scalar, integer(), minValue(3)),
      cutterRadius: positive,
      cutterThickness: positive,
      spindleRadius: positive,
      spindleHeight: positive,
      keyLength: positive,
      keyWidth: positive,
      keyThickness: positive,
    }),
    params,
  );
  if (
    !(
      d.gripLength < d.handleLength &&
      d.tangWidth < d.gripWidth &&
      d.tangDepth < d.gripDepth &&
      d.handleSplay < 90 &&
      d.feedThickness < d.jawGap &&
      d.cutterThickness < d.jawGap &&
      d.keyWidth < d.keyLength &&
      d.spindleRadius < d.feedRadius &&
      d.toothDepth < d.feedRadius
    )
  ) {
    throw new Error('Invalid hand opener dimensions');
  }
  const solids: Solid[] = [];
  const handleY = d.gripDepth / 2;
  const topY = handleY + d.jawGap / 2;
  const lowerY = handleY - d.jawGap / 2;
  const wheelX = d.jawLength - d.feedRadius;
  const disk = (id: string, dimensions: readonly [number, number], origin: Vec3, slot = 'body') => {
    solids.push({ ...cylinder(id, dimensions[0], dimensions[1], slot), origin });
  };
  for (const [side, name] of [
    [-1, 'left'],
    [1, 'right'],
  ] as const) {
    const frame: Transform = { r: rotY(side * d.handleSplay), t: [0, handleY, (side * d.handleGap) / 2] };
    const tangCenter = applyPoint(frame, [-d.handleLength / 2, 0, 0]);
    solids.push(prism(`tang-${name}`, [d.handleLength, d.tangDepth, d.tangWidth], { ...frame, t: tangCenter }));
    const gripCenter = applyPoint(frame, [-d.handleLength + d.gripLength / 2, 0, 0]);
    solids.push(prism(`grip-${name}`, [d.gripLength, d.gripDepth, d.gripWidth], { ...frame, t: gripCenter }, 'grip'));
    const end = applyPoint(frame, [-d.handleLength, -d.gripDepth / 2, 0]);
    disk(`grip-end-${name}`, [d.gripWidth / 2, d.gripDepth], end, 'grip');
  }
  solids.push(
    prism('upper-jaw', [d.jawLength, d.jawThickness, d.jawWidth], { r: rotY(0), t: [d.jawLength / 2, topY, 0] }),
    prism('lower-jaw', [d.jawLength, d.jawThickness, d.jawWidth], { r: rotY(0), t: [d.jawLength / 2, lowerY, 0] }),
  );
  disk('pivot', [d.pivotRadius, d.jawGap + d.jawThickness * 2], [0, lowerY - d.jawThickness, 0]);
  disk('feed-wheel', [d.feedRadius, d.feedThickness], [wheelX, lowerY + d.jawThickness / 2, d.feedRadius / 2], 'wheel');
  for (let index = 0; index < d.toothCount; index++) {
    const angle = (index * 360) / d.toothCount;
    const frame: Transform = { r: rotY(angle), t: [wheelX, handleY, d.feedRadius / 2] };
    const point = applyPoint(frame, [d.feedRadius, 0, 0]);
    solids.push(prism(`feed-tooth-${index}`, [d.toothDepth, d.feedThickness, d.toothDepth], { ...frame, t: point }));
  }
  disk(
    'cutting-wheel',
    [d.cutterRadius, d.cutterThickness],
    [wheelX, topY - d.cutterThickness, -d.cutterRadius],
    'body',
  );
  disk('winding-spindle', [d.spindleRadius, d.spindleHeight], [wheelX, topY, d.feedRadius / 2]);
  const keyY = topY + d.spindleHeight;
  solids.push(
    prism(
      'winding-key',
      [d.keyLength - d.keyWidth, d.keyThickness, d.keyWidth],
      {
        r: rotY(0),
        t: [wheelX, keyY, d.feedRadius / 2],
      },
      'key',
    ),
  );
  for (const side of [-1, 1]) {
    disk(
      `key-wing-${side}`,
      [d.keyWidth / 2, d.keyThickness],
      [wheelX + (side * (d.keyLength - d.keyWidth)) / 2, keyY - d.keyThickness / 2, d.feedRadius / 2],
      'key',
    );
  }
  return solids;
};
