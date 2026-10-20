local packs = [
  import 'items-tools.libsonnet', import 'items-other.libsonnet', import 'items-slice2-content.libsonnet',
  import 'items-wearables.libsonnet', import 'items-food.libsonnet', import 'items-playtest.libsonnet',
  import 'items-explosives.libsonnet', import 'recipes.libsonnet',
];
local items = std.flattenArrays([pack.items for pack in packs]);
local masses = std.foldl(function(acc, item)
  local id = if std.objectHas(item, 'model') then item.model else item.id;
  acc + { [id]: std.set((if std.objectHas(acc, id) then acc[id] else []) + [item.weight / 1000]) },
  items, {});
local estimates = {
  pistol_compact: 0.7, pistol_full: 0.9, rifle_battle: 4, shotgun_auto: 3.5,
  smg_compact: 2.5, smg_full: 3, sniper_rifle: 5, sniper_material: 12,
  baton: 0.5, cleaver: 0.5, fire_axe: 2.5, frying_pan: 1.2, golf_club: 0.45, hand_axe: 0.7,
  katana: 1.2, pickaxe: 3, pocket_knife: 0.1, shovel: 1.8, sickle: 0.4, sledgehammer: 4, tanto: 0.2,
  pliers: 0.3, sewing_kit: 0.22, notebook: 0.3, paper_sheet: 0.005, folded_note: 0.005,
};
local aliases = { riot_helmet_view: 'riot_helmet' };
function(model)
  local id = if std.objectHas(aliases, model.id) then aliases[model.id] else model.id;
  local candidates = if std.objectHas(estimates, id) then [estimates[id]] else
    assert std.objectHas(masses, id) : 'No authored physical mass for ' + id;
    masses[id];
  assert std.length(candidates) == 1 : 'Ambiguous authored physical mass for ' + id;
  model + { parts: { body: { massKg: candidates[0], centreOfMass: [0, 0, 0] } } }
