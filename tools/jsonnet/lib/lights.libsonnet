// Battery beams shared by every item that is a flashlight: the handheld one and the mounts that carry the same lamp.

// A battery beam: an LED light whose cone is shaped by `beam`.
local batteryBeam(radius, seenFrom, intensity, beam) = {
  radius: radius,
  seenFrom: seenFrom,
  color: '#fff1d8',
  intensity: intensity,
  beam: beam,
};

// The AA battery slot every battery light draws on; it comes with a fresh single-use cell.
local aaSlot(drainPerGameHour) = {
  accepts: ['aa_battery', 'rechargeable_aa_battery'],
  comesWith: 'aa_battery',
  swapSimSeconds: 2,
  drainPerGameHour: drainPerGameHour,
};

{
  batteryBeam:: batteryBeam,
  aaSlot:: aaSlot,
  flashlight:: batteryBeam(
    radius=20,
    seenFrom=40,
    intensity=4,
    beam={ angleDegrees: 60, penumbra: 0.6, decay: 1, spill: { enabled: false, radiusRatio: 1.5, intensity: 0.18 } },
  ),
  flashlightSlot:: aaSlot(0.25),
}
