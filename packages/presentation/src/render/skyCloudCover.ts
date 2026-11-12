// How much cloud each kind draws for a cover, apart from the dome's shader so a test can run the same source.
// The functions take and return plain floats; `coverage` is the cover already scaled by the dome's cover gain.
// Both kinds draw no cloud at no cover and grow from there, so a sky clearing to nothing thins out rather than pops.

export const CLOUD_COVER_GLSL = /* glsl */ `
  // One layered layer's cloud where the field's noise is noise. The noise can rise past 1, where a threshold just
  // under 1 would show its peaks at once; capped at 1 they wait for the cover. A cover whose edge ends at or below 1
  // draws as uncapped.
  float layeredCover ( float noise, float coverage, float softness ) {
    float threshold = 1.0 - coverage;
    return smoothstep( threshold, threshold + softness, min( noise, 1.0 ) );
  }

  // The scatter kind's coverage where its region noise is region, about -1 to 1. The region swings coverage by up to
  // its strength but never by more than the cover itself, so a thin cover keeps its gaps and banks thin with it.
  float scatterCoverage ( float coverage, float region, float strength ) {
    return clamp( coverage + region * min( coverage, strength ), 0.0, 1.0 );
  }
`;
