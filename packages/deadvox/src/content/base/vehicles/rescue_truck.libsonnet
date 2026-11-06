// Items and blueprint for the heavy rescue truck, derived from the fire engine with its tank, ladder and pump removed. Its added rows are in `packages/thing-authoring-tool/vehicles/rescue_truck.libsonnet`.
local kit = import '../vehicle-kit.libsonnet';
local base = (import 'fire_engine.libsonnet').blueprint;
local part = kit.part;
local fitting = kit.fitting;
local origin = kit.origin;
local pile = kit.pileSize;
local removed = ['water_tank', 'gantry', 'roof_ladder', 'pump_panel', 'hose_reel'];
{
  items: [
    part('rescue_truck_racking', 'Rescue truck equipment racking', pile, ['storage']),
    part('rescue_truck_marking', 'Rescue truck marking band', pile, []),
    part('rescue_truck_rear_shutter', 'Rescue truck rear shutter', pile, ['protection']),
    part('rescue_truck_roof_rack', 'Rescue truck roof rack', pile, ['structure']),
    part('rescue_truck_roof_gear', 'Rescue truck roof gear', pile, ['storage']),
    part('rescue_truck_light_mast', 'Rescue truck light mast', pile, ['light', 'structure']),
    part('rescue_truck_winch', 'Rescue truck front winch', [12, 4], ['structure']),
  ],
  blueprint: base + {
    id: 'rescue_truck',
    name: 'Rescue truck',
    fittings: [f for f in base.fittings if !std.member(removed, f.id)] + [
      fitting('racking', 'rescue_truck_racking', origin, ['body']),
      fitting('marking', 'rescue_truck_marking', origin, ['body']),
      fitting('rear_shutter', 'rescue_truck_rear_shutter', origin, ['body']),
      fitting('roof_rack', 'rescue_truck_roof_rack', origin, ['body']),
      fitting('roof_gear', 'rescue_truck_roof_gear', origin, ['roof_rack']),
      fitting('light_mast', 'rescue_truck_light_mast', origin, ['body']),
      fitting('winch', 'rescue_truck_winch', origin, ['front_bumper']),
    ],
  },
}
