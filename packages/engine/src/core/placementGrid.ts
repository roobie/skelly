// The one placement grid: authored and placed positions snap to it, and a fixed spot must already lie on it.
// Any module that rounds or checks a placed position uses these, so the grid has a single owner.

export const PLACEMENT_GRID_METRES = 0.5;

/** Whether a metre coordinate already lies on the placement grid. Division by the step is exact for a 0.5 m step. */
export const onPlacementGrid = (metres: number): boolean => Number.isInteger(metres / PLACEMENT_GRID_METRES);

/** The nearest placement-grid coordinate to a metre value. */
export const snapToPlacementGrid = (metres: number): number =>
  Math.round(metres / PLACEMENT_GRID_METRES) * PLACEMENT_GRID_METRES;
