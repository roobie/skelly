local economy = import 'economy.libsonnet';
local sources = [
  import 'packages/mods/skelly.inventory/inventory-items.jsonnet',
  import 'camp.jsonnet',
  import 'gauntlet.jsonnet',
  import 'items-ammunition.jsonnet',
  import 'items-attachments.jsonnet',
  import 'items-explosives.jsonnet',
  import 'items-food.jsonnet',
  import 'items-gun-parts.jsonnet',
  import 'items-other.jsonnet',
  import 'items-pistol.jsonnet',
  import 'items-playtest.jsonnet',
  import 'items-revolver.jsonnet',
  import 'items-slice2-content.jsonnet',
  import 'items-tools.jsonnet',
  import 'items-wearables.jsonnet',
  import 'locks.jsonnet',
  import 'models-firearms.jsonnet',
  import 'readables.jsonnet',
  import 'recipes.jsonnet',
  import 'rural-police.jsonnet',
  import 'vehicles.jsonnet',
];
{
  itemEconomy: economy.itemEconomy(std.flattenArrays([source.items for source in sources])),
}
