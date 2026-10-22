// Vehicle parts are items whose exported models carry mass, baked collision and datums; blueprints
// place them by item id in the vehicle frame (metres; x forward, y up, z toward the near side).
local part(id, name, size, capabilities, description) = {
  id: id,
  name: name,
  category: 'misc',
  model: id,
  size: size,
  description: description,
  vehicle: { capabilities: capabilities },
};
local fitting(id, part, at, supportedBy=[]) = { id: id, part: part, at: at, supportedBy: supportedBy };
local batteryBay(tray, at) = [
  fitting('battery_tray', tray, at),
  fitting('battery', 'car_battery', [at[0], at[1] + 0.03, at[2]], ['battery_tray']),
];
local headlamps(x, y, z) = [
  fitting('headlamp_near', 'car_headlamp', [x, y, z]),
  fitting('headlamp_far', 'car_headlamp', [x, y, -z]) + { mirror: true },
];
(import 'economy.libsonnet').pack({
  models: [
    import 'things/car_battery.model.json',
    import 'things/car_headlamp.model.json',
    import 'things/hatchback_battery_tray.model.json',
    import 'things/pickup_battery_tray.model.json',
  ],
  items: [
    part('car_battery', 'Car battery', [3, 2], ['electricity'], 'Twelve volts, if it still holds a charge.'),
    part('car_headlamp', 'Headlamp unit', [2, 2], ['light', 'glazing'], 'A sealed lamp and its lens.'),
    part('hatchback_battery_tray', 'Hatchback battery tray', [3, 2], [], 'A pressed steel shelf for a battery.'),
    part('pickup_battery_tray', 'Pickup battery tray', [4, 3], [], 'A heavy steel shelf for a battery.'),
  ],
  vehicleBlueprints: [
    { id: 'hatchback', name: 'Hatchback', fittings: batteryBay('hatchback_battery_tray', [1.45, 0.55, 0.3]) + headlamps(1.85, 0.62, 0.55) },
    { id: 'pickup', name: 'Pickup', fittings: batteryBay('pickup_battery_tray', [1.9, 0.8, 0.35]) + headlamps(2.35, 0.85, 0.65) },
  ],
})
