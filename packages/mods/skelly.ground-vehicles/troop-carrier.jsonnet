// The wheeled troop carrier and its stowage. It is its own file because its racks take the firearms pack's guns and
// ammunition and no other vehicle does, so a check that loads the other vehicles needs nothing from that pack. Its
// shared and structural parts are in `vehicles.jsonnet`.
local vehicles = import 'packages/mods/skelly.ground-vehicles/vehicles.libsonnet';
// A storage part's inside is fixed by its design, so it is an authored container rather than cargo space, which is
// sized by the load floor it is marked out on. Racks take the firearms pack's guns and ammunition by reading its
// item rows, so a new gun or cartridge fits without editing this pack.
local firearmsItems = std.flattenArrays([
  (import 'packages/mods/skelly.firearms/models-firearms.json').items,
  (import 'packages/mods/skelly.firearms/items-pistol.json').items,
  (import 'packages/mods/skelly.firearms/items-revolver.json').items,
  (import 'packages/mods/skelly.firearms/items-ammunition.json').items,
  (import 'packages/mods/skelly.firearms/firearms-items.json').items,
]);
local firearmIds = [item.id for item in firearmsItems if std.objectHas(item, 'firearm')];
local ammoIds = [item.id for item in firearmsItems if item.category == 'ammo'];
local storagePart(id, name, size, container) = vehicles.part(id, name, size, ['storage']) + { container: container };
// A rack of slots takes up to one gun a slot, whatever its size: a list, like a board stack, not a grid.
local rifleRack(id, name, size, slots) = storagePart(id, name, size, {
  accepts: firearmIds,
  maxCount: slots,
  pockets: [{ name: name, layout: 'pile', handlingSimSeconds: 0.6 }],
});
// A grid pocket in inventory cells (0.1 m) across the part's opening.
local bin(id, name, size, grid, handlingSimSeconds, accepts=null) = storagePart(id, name, size, {
  [if accepts != null then 'accepts']: accepts,
  pockets: [{ name: name, grid: grid, handlingSimSeconds: handlingSimSeconds }],
});
// The hull is welded plate like the tracked vehicle's: its panels rest on the belly and the roof on both sides; each
// wheel rests on its own row's axle, and the side plates, bins and lockers on their own side.
local apcSites = (import 'packages/skelly-assets/built/skelly.ground-vehicles/vehicles/apc.placements.json').sites;
local apcSupports = {
  belly: [],
  nose: ['belly'],
  rear: ['belly'],
  side: ['belly'],
  roof: ['side_near', 'side_far'],
  ramp: ['rear'],
  engine_deck: ['nose', 'roof'],
  turret_ring: ['roof'],
  turret: ['turret_ring'],
  heavy_machine_gun: ['turret'],
  coaxial_machine_gun: ['turret'],
  turret_sight: ['turret'],
  turret_periscope: ['turret'],
  turret_hatch: ['turret'],
  smoke_launcher: ['turret'],
  cupola: ['roof'],
  cupola_lid: ['cupola'],
  driver_hatch: ['roof'],
  squad_hatch: ['roof'],
  periscope_rear: ['roof'],
  driver_periscope: ['roof'],
  engine: ['belly'],
  gearbox: ['engine'],
  radiator: ['belly'],
  exhaust: ['engine'],
  driver_panel: ['belly'],
  driver_seat: ['belly'],
  steering_wheel: ['driver_panel'],
  rifle_rack: ['belly'],
  ammo_rack: ['belly'],
  bench: ['belly'],
  wall_locker: ['side'],
  stowage_bin: ['side'],
  plate: ['side'],
  tow_hitch: ['rear'],
  axle: ['belly'],
  wheel: ['axle'],
  headlamp: ['nose'],
  fuel_tank: ['rear'],
  tail_lamp: ['rear'],
  battery_tray: ['belly'],
  battery: ['battery_tray'],
};
(import 'tools/jsonnet/lib/item-presentation.libsonnet')(
  import 'presentation/item-materials.json',
).pack((import 'tools/jsonnet/lib/item-policy.libsonnet').itemPack({
  models: [
    import 'packages/skelly-assets/built/skelly.ground-vehicles/things/apc_rifle_rack.model.json',
    import 'packages/skelly-assets/built/skelly.ground-vehicles/things/apc_ammo_rack.model.json',
    import 'packages/skelly-assets/built/skelly.ground-vehicles/things/apc_stowage_bin.model.json',
    import 'packages/skelly-assets/built/skelly.ground-vehicles/things/apc_wall_locker.model.json',
  ],
  items: [
    // Ten slots: the rack's rails run 2.3 m, a little over ten rifles side by side.
    rifleRack('apc_rifle_rack', 'Rifle rack', [10, 6], 10),
    bin('apc_ammo_rack', 'Ammunition rack', [6, 6], [7, 3], 0.8, ammoIds),
    bin('apc_stowage_bin', 'Stowage bin', [8, 4], [8, 4], 1.2),
    bin('apc_wall_locker', 'Wall locker', [10, 6], [8, 8], 1.2),
  ],
  vehicleBlueprints: [
    { id: 'apc', name: 'Troop carrier', fittings: vehicles.releasedFittings(apcSites, apcSupports, 'paint-olive', ['wheel']) },
  ],
}))
