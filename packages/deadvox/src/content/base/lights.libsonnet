// Battery beams shared by every item that is a flashlight: the handheld one and the mounts that carry the same lamp.

// A battery beam: an LED light whose cone is shaped by `beam` and which drains AA batteries.
local batteryBeam(radius, seenFrom, intensity, beam, chargePerGameHour) = {
  radius: radius,
  seenFrom: seenFrom,
  color: '#fff1d8',
  intensity: intensity,
  beam: beam,
  power: { battery: 'aa_battery', chargePerGameHour: chargePerGameHour, swapSimSeconds: 2 },
};

{
  batteryBeam:: batteryBeam,
  flashlight:: batteryBeam(
    radius=20,
    seenFrom=40,
    intensity=5,
    beam={ angleDegrees: 60, penumbra: 0.6, decay: 1, spill: { enabled: false, radiusRatio: 1.5, intensity: 0.18 } },
    chargePerGameHour=0.25,
  ),
}
