// How much cloud each kind draws for a cover, apart from the dome's shader so a test can run the same source.
// The functions take and return plain floats; `coverage` is the cover already scaled by the dome's cover gain.

export const CLOUD_COVER_GLSL = /* glsl */ `
  // One layered layer's cloud where the field's noise is noise.
  float layeredCover ( float noise, float coverage, float softness ) {
    float threshold = 1.0 - coverage;
    return smoothstep( threshold, threshold + softness, noise );
  }

  // The scatter kind's coverage where its region noise is region, about -1 to 1.
  float scatterCoverage ( float coverage, float region, float strength ) {
    return clamp( coverage + region * strength, 0.0, 1.0 );
  }
`;
