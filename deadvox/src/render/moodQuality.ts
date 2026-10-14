export const sceneRenderScale = (value: number): number =>
  Number.isFinite(value) ? Math.max(0.5, Math.min(1, value)) : 1;

export const bloomRenderScale = (value: number): number =>
  Number.isFinite(value) ? Math.max(0.25, Math.min(1, value)) : 1;
