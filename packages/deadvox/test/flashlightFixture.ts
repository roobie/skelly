// The flashlight's authored beam intensity lives in item content; the falloff calibration tests keep the
// value they were calibrated on, so a content retune does not silently move their arithmetic.
export const CALIBRATED_BEAM_INTENSITY = 5;
/** The punctual-light near field those calibrations assume, owned here for the same reason. */
export const CALIBRATED_NEAR_FIELD_M = 4;
