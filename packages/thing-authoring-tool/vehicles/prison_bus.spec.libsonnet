// A prison transport on the coach's body: the same 12.2 m high-floor chassis in plain paint, with no sign, no luggage
// doors and white pillars, so each barred window stands alone in the side. The door is solid to shoulder height.
local coach = import 'coach.spec.libsonnet';
std.objectRemoveKey(coach, 'sign') + {
  paint: 'paint-white', band: 'paint-white', pillarFinish: 'paint-white',
  bumperFinish: 'paint-charcoal',
  stripes: [],
  seats: [row { part: 'bus_seat_pair' } for row in coach.seats],
  doorKick: 2.0, doorFinish: 'paint-charcoal',
  shellMass: 10330,
  bars: { z: 0.04, width: 0.05, pitch: 0.2, rail: 0.06 },
  bulkhead: { x: 4.04, panelTop: 2.15 },
}
