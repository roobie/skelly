// A flat-painted military body for the vehicle finishes look. No shipped blueprint wears flat paint yet, so this
// one is the exported vehicle's own body panels, placed where the export places them and carried by its frame.
local prefix = 'light_tactical_vehicle_';
local placements = (import 'packages/skelly-assets/built/skelly.ground-vehicles/vehicles/light_tactical_vehicle.placements.json').sites;
local sites = [site for site in placements if std.startsWith(site.part, prefix)];
local parts = std.set([site.part for site in sites]);
{
  items: [{
    id: part,
    workInProgress: false,
    name: 'Fixture ' + std.strReplace(std.substr(part, std.length(prefix), std.length(part)), '_', ' '),
    category: 'misc',
    model: part,
    size: [12, 6],
    vehicle: {
      drops: { default: 'item_drop_wood' },
      capabilities: ['structure'],
      // The shade a shipped body's panels give, so the fixture lights as a real vehicle would.
      obstruction: { sight: true, light: 0.35, sound: true, combat: true },
    },
  } for part in parts],
  vehicleBlueprints: [{
    id: 'fixture_tactical_vehicle',
    name: 'Fixture tactical vehicle',
    fittings: [site + { supportedBy: if site.id == 'frame' then [] else ['frame'] } for site in sites],
  }],
}
