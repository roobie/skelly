// The released takes play unpitched: a surface's ring holds one pitch from landing to landing, and the takes already
// vary by seed.
local landings = import 'landings.libsonnet';
{
  soundFamilies: [{ id: family } for family in landings.families],
  sounds: [
    {
      id: take.id,
      description: 'A spent case lands on %s.' % take.surface,
      variants: [variant.path for variant in take.variants],
      gain: 0.4,
      pitchJitter: [1, 1],
      gainJitter: [0.9, 1.1],
      minIntervalSimSeconds: 0,
      category: 'world',
      noise: { enabled: false, radiusMetres: 1 },
      // Automatic fire lands a case per shot; the oldest landing gives way.
      voiceCap: 8,
    }
    for take in landings.takes
  ],
}
