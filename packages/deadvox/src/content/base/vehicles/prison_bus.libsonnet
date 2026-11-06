// Items and blueprint for the prison bus. Its panels and layout come from its spec through the bus body helper.
local kit = import '../vehicle-kit.libsonnet';
local bus = import 'packages/thing-authoring-tool/vehicles/bus-body.libsonnet';
local s = import 'packages/thing-authoring-tool/vehicles/prison_bus.spec.libsonnet';
local deck = s.decks[0];
local g = bus.layout(s);
local panes = g.panes(deck);
local doorway = g.doorways[0];
local bars(j) =
  local twin = kit.pair('window_bars_' + j, 'prison_bus_window_bars', [(panes[j][0] + panes[j][1]) / 2, deck.waist, s.side], kit.on(['shell']));
  // The door takes the near side of its bay.
  if std.member([door.bay for door in s.doors], j) then [twin[1]] else twin;
{
  items: bus.items(kit, 'prison_bus', 'Prison bus', s) + [
    kit.part('prison_bus_window_bars', 'Prison bus window bars', kit.pileSize, ['protection']),
    kit.part('prison_bus_door_bars', 'Prison bus door bars', kit.pileSize, ['protection']),
    kit.part('prison_bus_bulkhead', 'Prison bus cage bulkhead', kit.pileSize, ['protection']),
    kit.part('prison_bus_rear_bars', 'Prison bus rear window bars', kit.pileSize, ['protection']),
  ],
  blueprint: {
    id: 'prison_bus',
    name: 'Prison bus',
    fittings: bus.fittings(kit, 'prison_bus', s)
              + std.flattenArrays([bars(j) for j in std.range(0, deck.bays - 1)])
              + [
                kit.fitting('door_bars', 'prison_bus_door_bars', [doorway[1] - g.leafWidth / 2, s.doorSill + s.doorKick, s.side - 0.035], ['door_0']),
                kit.fitting('bulkhead', 'prison_bus_bulkhead', kit.origin, ['shell']),
                kit.fitting('rear_bars', 'prison_bus_rear_bars', kit.origin, ['shell']),
                kit.fitting('roof_vent_fwd', 'roof_vent', [2.0, s.roof, 0], ['shell']),
                kit.fitting('roof_vent_aft', 'roof_vent', [-2.5, s.roof, 0], ['shell']),
              ],
  },
}
