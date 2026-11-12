// The physical sky model's terms are shared by every look; only its weight differs.
local physical(weight) = {
  weight: weight,
  exposure: 0.1,
  turbidity: 3,
  rayleigh: 1.3,
  mie: 0.005,
  mieDirectional: 0.8,
};

local sun(brightness, glow) = {
  colour: '#fff0d4',
  brightness: brightness,
  glowColour: '#ffa040',
  glow: glow,
};

local dome(zenith, horizonGlow, weight, cloudOpacity, stars, moon, sunLook) = {
  zenith: zenith,
  horizonGlow: horizonGlow,
  physical: physical(weight),
  clouds: { cover: 0.45, opacity: cloudOpacity },
  stars: stars,
  moon: { colour: '#b3bfd9', brightness: moon },
  sun: sunLook,
};

// The looks' own clouds show at this cloudiness, and sessions start there.
local fairCloudiness = 0.2;

local dawnDome = dome('#80786f', '#b7b1a4', 0.5, 1, 0, 0, sun(1, 1));

// Cool away from the setting sun, so the sunlit clouds read as warm against the earth's shadow rather than as
// blotches on a warm grey.
local duskDome = dome('#66708a', '#b8a6a8', 0.5, 1, 0, 0, sun(1, 1));

{
  dayCycle: {
    clockRatio: 8,
    latitudeDegrees: 40,
    date: { month: 6, day: 25 },
    twilight: 'nautical',
    defaultStartGameTimeOfDay: '10:00',
    midnightGameTimeOfDay: '00:00',
    noonGameTimeOfDay: '12:00',
    keys: [
      { phase: 'night', at: 0, look: 'night' },
      { phase: 'night', at: 0.3, look: 'deepNight' },
      { phase: 'night', at: 0.7, look: 'deepNight' },
      { phase: 'night', at: 0.9, look: 'night' },
      { phase: 'dawn', at: 0, look: 'night' },
      { phase: 'dawn', at: 1, look: 'dawn' },
      { phase: 'day', at: 0.12, look: 'day' },
      { phase: 'day', at: 0.85, look: 'day' },
      { phase: 'day', at: 0.95, look: 'dusk' },
      { phase: 'dusk', at: 0, look: 'dusk' },
      { phase: 'dusk', at: 0.72, look: 'night' },
    ],
    looks: {
      night: {
        sky: '#0a0d12',
        lightColor: '#7d8ca8',
        lightIntensity: 0.12,
        ambientSky: '#3a465a',
        ambientGround: '#100e0c',
        ambientIntensity: 0.22,
        fogNear: 0.15,
        fogFar: 0.6,
        heightFog: 0.007,
        heightFogColor: '#1c2430',
        bloom: 0.5,
        tone: 1,
        dome: dome('#070a10', '#141b26', 0, 0.6, 1, 1, sun(0, 0)),
      },
      // Lifted so roofs and the skyline read as silhouettes under the moon, while staying clearly night.
      deepNight: {
        sky: '#0b0f16',
        lightColor: '#6a7690',
        lightIntensity: 0.1,
        ambientSky: '#2a3446',
        ambientGround: '#08080a',
        ambientIntensity: 0.2,
        fogNear: 0.15,
        fogFar: 0.6,
        heightFog: 0.006,
        heightFogColor: '#18202c',
        bloom: 0.55,
        tone: 1,
        dome: dome('#05070c', '#111824', 0, 0.6, 1, 1, sun(0, 0)),
      },
      dawn: {
        sky: '#8a807e',
        lightColor: '#f0b088',
        lightIntensity: 0.7,
        ambientSky: '#b8b0b0',
        ambientGround: '#4a4038',
        ambientIntensity: 0.8,
        fogNear: 0.05,
        fogFar: 0.92,
        heightFog: 0.014,
        heightFogColor: '#b09a90',
        bloom: 0.2,
        tone: 0.85,
        dome: dawnDome,
      },
      day: {
        sky: '#a9bfd0',
        lightColor: '#fff2dd',
        lightIntensity: 1.6,
        ambientSky: '#dfe8f0',
        ambientGround: '#5a4a3a',
        ambientIntensity: 1.3,
        fogNear: 0.1,
        fogFar: 1,
        heightFog: 0.002,
        heightFogColor: '#b4c6d4',
        bloom: 0.08,
        tone: 0,
        dome: dome('#6f8aa3', '#c9c4b8', 1, 1, 0, 0, sun(1, 0)),
      },
      dusk: {
        sky: '#6a6470',
        lightColor: '#e89868',
        lightIntensity: 0.6,
        ambientSky: '#8c90a8',
        ambientGround: '#3a302a',
        ambientIntensity: 0.7,
        fogNear: 0.05,
        fogFar: 0.92,
        heightFog: 0.008,
        heightFogColor: '#7e7078',
        bloom: 0.25,
        tone: 0.85,
        dome: duskDome,
      },
    },
    weather: {
      defaults: { fogginess: 0.2, cloudiness: fairCloudiness, rain: 0 },
      fog: { nearTighten: 0.85, farTighten: 0.6 },
      fair: { cloudiness: fairCloudiness, kind: 'layered' },
      cloudy: {
        cloudiness: 0.5,
        kind: 'scatter',
        clouds: { cover: 0.15, opacity: 1 },
        physicalWeight: 0.8,
        skyLights: 0.85,
        light: 0.8,
        ambient: 0.95,
        skyColour: { saturation: 0.85, brightness: 0.97 },
      },
      overcast: {
        kind: 'layered',
        clouds: { cover: 0.65, opacity: 1 },
        physicalWeight: 0.15,
        skyLights: 0.1,
        light: 0.25,
        ambient: 0.75,
        skyColour: { saturation: 0.45, brightness: 0.9 },
      },
      rain: {
        kind: 'layered',
        clouds: { cover: 1, opacity: 1 },
        physicalWeight: 0,
        skyLights: 0,
        light: 0.2,
        ambient: 0.7,
        skyColour: { saturation: 0.6, brightness: 0.7 },
      },
    },
    domeShape: {
      horizonBand: [0.015, 0.14],
      glowBand: [0.12, 0.55],
      physicalBand: [0.3, 0.55],
      starField: { density: 0.014, size: 0.12, twinkle: 0.4 },
      // The moon and stars wash out over the first half of dawn, before its glow brightens.
      washOutBand: [-0.2, -0.1],
      // About 1.3 degrees across: stylised, but small enough not to read as a second sun. The gain leaves the
      // disc short of white, so its limb and seas show.
      moon: {
        disc: [0.99992, 0.99995],
        discGain: 1.1,
        limbDarkening: 0.5,
        maria: { depth: 0.3, scale: 2.2 },
        tightHalo: { power: 350, gain: 0.315 },
        wideHalo: { power: 14, gain: 0.063 },
      },
      sun: {
        disc: [0.99965, 0.9999],
        discGain: 4,
        tightHalo: { power: 900, gain: 0.6 },
        wideHalo: { power: 16, gain: 0.9 },
      },
      cloudLight: { light: 0.8, ambient: 0.25, facing: 0.4, deckLight: 0.5 },
      cloudShape: { coverGain: 1.2, edgeSoftness: 0.3, horizonFade: [0.02, 0.14] },
    },
    mainLight: { lowestHeight: 0.2, fromMoonAt: 1 },
    environment: {
      faceSize: 64,
      rebakeChange: 0.02,
      rebakeRealSeconds: 0.5,
      strength: 1,
    },
    clouds: {
      layered: {
        warp: 0.6,
        layers: [
          { scale: 0.35, angle: 0, drift: [0.0006, 0.00013], opacity: 0.32, shade: 1 },
          { scale: 0.83, angle: 2.1, drift: [-0.0011, 0.0004], opacity: 0.5, shade: 1 },
          { scale: 2.07, angle: 4.0, drift: [0.0028, -0.0019], opacity: 0.42, shade: 0 },
        ],
      },
      scatter: {
        scale: 0.36,
        drift: [0.0012, 0.0005],
        billow: 0.0004,
        region: { scale: 0.11, strength: 0.22 },
        density: 4.8,
        shadow: 0.45,
        lining: 0.6,
      },
    },
  },
}
