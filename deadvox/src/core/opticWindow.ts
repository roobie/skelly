export const PLAYER_VIEW_FOV_DEGREES = 75;

/** Camera distance at which a circular ocular opening fills a fraction of the vertical view. */
export const opticWindowDistance = (diameterMetres: number, fill: number, verticalFovDegrees: number): number => {
  if (
    !Number.isFinite(diameterMetres) ||
    diameterMetres <= 0 ||
    !Number.isFinite(fill) ||
    fill <= 0 ||
    fill >= 1 ||
    !Number.isFinite(verticalFovDegrees) ||
    verticalFovDegrees <= 0 ||
    verticalFovDegrees >= 180
  ) {
    throw new RangeError('Invalid optic-window dimensions or view');
  }
  return diameterMetres / (2 * fill * Math.tan((verticalFovDegrees * Math.PI) / 360));
};
