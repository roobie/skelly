// A vehicle's moving parts share the door recordings and differ by pitch: a bonnet or lid is a wider, lighter panel
// than a door, and an armoured hatch or ramp a heavier plate, so each family sounds its weight without new audio.
local audio(stem) = ['assets/audio/%s-%02d.ogg' % [stem, n] for n in [1, 2, 3]];
local sound(id, description, stem, gain, pitch) = {
  id: id, description: description, variants: audio(stem), gain: gain,
  pitchJitter: pitch, gainJitter: [0.9, 1.1], minIntervalSimSeconds: 0.08,
  category: 'world', noise: { enabled: true, radiusMetres: 12 },
};
{
  sounds: [
    sound('vehicle_door_open', 'Open a vehicle door within reach.', 'door-open', 0.6, [1.1, 1.2]),
    sound('vehicle_door_close', 'Shut a vehicle door within reach.', 'door-close', 0.8, [1.1, 1.2]),
    sound('vehicle_lid_open', 'Lift a bonnet, tailgate or boot lid within reach.', 'door-open', 0.5, [1.25, 1.35]),
    sound('vehicle_lid_close', 'Drop a bonnet, tailgate or boot lid shut within reach.', 'door-close', 0.85, [1.2, 1.3]),
    sound('vehicle_hatch_open', 'Swing an armoured hatch or ramp open within reach.', 'door-open', 0.7, [0.7, 0.8]),
    sound('vehicle_hatch_close', 'Swing an armoured hatch or ramp shut within reach.', 'door-close', 1, [0.65, 0.75]),
  ],
}
