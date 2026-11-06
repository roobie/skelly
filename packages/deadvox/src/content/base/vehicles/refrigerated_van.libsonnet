// The white panel van with a roof cooling unit; its load space is the base van's (`panel_van.libsonnet`).
local kit = import '../vehicle-kit.libsonnet';
local base = (import 'panel_van.libsonnet').blueprint;
{
  items: [
    kit.part('refrigerated_van_cooling_unit', 'Van roof cooling unit', kit.pileSize, ['electricity']),
    kit.part('refrigerated_van_lining', 'Van insulated lining', kit.pileSize, ['structure']),
  ],
  blueprint: base + {
    id: 'refrigerated_van',
    name: 'Refrigerated van',
    fittings: base.fittings + [
      kit.fitting('cooling_unit', 'refrigerated_van_cooling_unit', kit.origin, ['shell']),
      kit.fitting('lining', 'refrigerated_van_lining', kit.origin, ['shell']),
    ],
  },
}
