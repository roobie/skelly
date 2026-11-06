// Helpers for vehicle items and blueprints, shared by `vehicles.jsonnet` and each vehicle's own file.
local part(id, name, size, capabilities, description=null) = {
  id: id,
  name: name,
  category: 'misc',
  model: id,
  size: size,
  vehicle: {
    capabilities: capabilities,
    obstruction: {
      // Glazing retains body collision but admits sight and light.
      sight: !std.member(capabilities, 'glazing'),
      light: !std.member(capabilities, 'glazing'),
      // Sound and combat remain explicit rather than inferred from a part name or model.
      sound: true,
      combat: true,
    },
  },
} + (if description == null then {} else { description: description });
local fitting(id, part, at, supportedBy=[], service=null) =
  { id: id, part: part, at: at, supportedBy: supportedBy } +
  if service == null then {} else { service: service };
// A paired site's service names each side, since the opened vehicle lists both while empty.
local service(mount, durationSimSeconds, qualities={}, near=null, far=null) = {
  mount: mount,
  durationSimSeconds: durationSimSeconds,
  qualities: qualities,
  names:: { near: near, far: far },
};
local sideService(service, side) =
  if service == null then null else service + { name: service.names[side] };
// A near-side fitting and its far-side twin, reflected across the centre plane. `0 - z` rather than `-z`
// keeps a centred twin at 0: -0 doesn't survive a JSON round trip, so the admitted registry would differ.
local pair(id, part, at, supportedBy, service=null) = [
  fitting(id + '_near', part, at, [support + '_near' for support in supportedBy.paired] + supportedBy.shared, sideService(service, 'near')),
  fitting(id + '_far', part, [at[0], at[1], 0 - at[2]], [support + '_far' for support in supportedBy.paired] + supportedBy.shared, sideService(service, 'far')) + { mirror: true },
];
local on(shared=[], paired=[]) = { shared: shared, paired: paired };
local batteryBay(tray, at, supportedBy=[]) = [
  fitting('battery_tray', tray, at, supportedBy),
  fitting('battery', 'car_battery', [at[0], at[1] + 0.03, at[2]], ['battery_tray']),
];
local headlamps(x, y, z, supportedBy=[]) = pair('headlamp', 'car_headlamp', [x, y, z], on(supportedBy));
// A factory cargo space: `at` is the centre of its footprint on the load floor, `cells` its size in inventory
// cells along x, y and z (`src/core/cargoSpace.ts`).
local cargoSpace(id, at, cells, floor) = fitting(id, 'cargo_space', at, [floor]) + { cargo: cells };
// The hatchback's own panels are pressed for its body and authored where they sit on it, so they fit at
// its origin; shared parts are placed by their own frames.
local origin = [0, 0, 0];
// `src/core/inventoryScale.ts`, `PILE_GRID`. A body panel is larger than a floor pile; the cap costs
// nothing until a carrying design gives oversized parts their own class.
local pileSize = [12, 6];
{
  part: part,
  fitting: fitting,
  service: service,
  pair: pair,
  on: on,
  batteryBay: batteryBay,
  headlamps: headlamps,
  cargoSpace: cargoSpace,
  origin: origin,
  pileSize: pileSize,
}
