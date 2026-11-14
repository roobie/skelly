// Winter is the base cycle with a midwinter sun path and cool twilights, which read as winter where the base's warm
// ones read as summer. Everything else stays shared, so a base change reaches both seasons.
local base = import '../skelly.day-cycle/dayCycle.jsonnet';

base {
  dayCycle+: {
    // As far past the solstice as the base date, so the two seasons mirror each other.
    date: { month: 12, day: 25 },
    looks+: {
      dawn+: {
        sky: '#7c8494',
        lightColor: '#e8bca4',
        ambientSky: '#a8b0c0',
        ambientGround: '#3c3c40',
        heightFogColor: '#98a0ac',
        dome+: { zenith: '#6c7688', horizonGlow: '#c0b4b0' },
      },
      dusk+: {
        sky: '#5e6676',
        lightColor: '#e0a488',
        ambientSky: '#8090ac',
        ambientGround: '#30323a',
        heightFogColor: '#6c7484',
        dome+: { zenith: '#56627e', horizonGlow: '#a8a4b0' },
      },
    },
  },
}
