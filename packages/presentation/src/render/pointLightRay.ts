/**
 * Prototype copy of `packages/engine/src/core/raycast.ts`, `raycast`, exercised by the lighting GPU probe.
 * Native shader floats can disagree with CPU doubles at near-corner crossings; this is not exact equivalence.
 */
export const POINT_LIGHT_RAY_GLSL = `
uniform highp sampler3D uLightBlockers;
uniform vec3 uLightBlockerOrigin;
uniform vec3 uLightBlockerSize;
bool lightCellBlocks(ivec3 cell) {
  ivec3 local = cell - ivec3(uLightBlockerOrigin);
  if (any(lessThan(local, ivec3(0))) || any(greaterThanEqual(local, ivec3(uLightBlockerSize)))) return false;
  return texelFetch(uLightBlockers, local, 0).r > 0.5;
}
float pointLightRay(vec3 from, vec3 to, vec3 bodyMin, vec3 bodyMax) {
  vec3 delta = to - from;
  float distance = length(delta);
  if (distance == 0.0) return 1.0;
  vec3 dir = delta / distance;
  ivec3 cell = ivec3(floor(from));
  ivec3 start = cell;
  ivec3 end = ivec3(floor(to));
  ivec3 step = ivec3(0);
  float infinity = uintBitsToFloat(0x7f800000u);
  vec3 tMax = vec3(infinity);
  vec3 tDelta = vec3(infinity);
  for (int axis = 0; axis < 3; axis++) {
    if (dir[axis] > 0.0) {
      step[axis] = 1;
      tDelta[axis] = 1.0 / dir[axis];
      tMax[axis] = (float(cell[axis]) + 1.0 - from[axis]) / dir[axis];
    } else if (dir[axis] < 0.0) {
      step[axis] = -1;
      tDelta[axis] = -1.0 / dir[axis];
      tMax[axis] = (from[axis] - float(cell[axis])) / -dir[axis];
    }
  }
  for (;;) {
    int axis = tMax.x < tMax.y ? (tMax.x < tMax.z ? 0 : 2) : (tMax.y < tMax.z ? 1 : 2);
    float t = tMax[axis];
    if (t > distance) return 1.0;
    cell[axis] += step[axis];
    tMax[axis] += tDelta[axis];
    bool endpoint = all(equal(cell, start)) || all(equal(cell, end));
    bool body = all(greaterThanEqual(vec3(cell), bodyMin)) && all(lessThan(vec3(cell), bodyMax));
    if (!endpoint && !body && lightCellBlocks(cell)) return 0.0;
  }
}
`;
