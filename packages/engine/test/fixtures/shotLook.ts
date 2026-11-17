/** A fixture ability's shot look; the tests that use it never draw it. */
export const FIXTURE_SHOT_LOOK = {
  core: { color: '#ffffff', radiusMetres: 0.05 },
  halo: { color: '#ffffff', radiusMetres: 0.1 },
  light: { color: '#ffffff', intensity: 1, radiusMetres: 1 },
  trail: { color: '#ffffff', spacingMetres: 0.1, sizeMetres: 0.01, lifeRealSeconds: 0.1, driftMetresPerRealSecond: 0 },
  impact: { color: '#ffffff', radiusMetres: 0.1, lifeRealSeconds: 0.1 },
};
