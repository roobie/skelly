export interface CameraState {
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
}

const CAMERA_VALUES = 6;
const CAMERA_PRECISION = 3;

/** Parses a URL camera as position followed by OrbitControls' aim target. */
export const parseCameraState = (value: string | null): CameraState | undefined => {
  if (value === null) {
    return undefined;
  }
  const fields = value.split(',');
  if (fields.length !== CAMERA_VALUES || fields.some((field) => field.trim() === '')) {
    return undefined;
  }
  const values = fields.map(Number);
  if (values.some((coordinate) => !Number.isFinite(coordinate))) {
    return undefined;
  }
  return {
    position: [values[0]!, values[1]!, values[2]!],
    target: [values[3]!, values[4]!, values[5]!],
  };
};

const formatCoordinate = (coordinate: number): string => {
  const rounded = Number(coordinate.toFixed(CAMERA_PRECISION));
  return Object.is(rounded, -0) ? '0' : String(rounded);
};

/** Serializes position followed by OrbitControls' aim target for the URL. */
export const serializeCameraState = (state: CameraState): string =>
  [...state.position, ...state.target].map(formatCoordinate).join(',');
