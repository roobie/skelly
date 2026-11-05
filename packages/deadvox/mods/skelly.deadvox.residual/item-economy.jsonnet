local economy = import 'tools/jsonnet/lib/economy.libsonnet';
local sources = [
  import 'camp.jsonnet',
  import 'gauntlet.jsonnet',
  import 'items-other.jsonnet',
  import 'items-playtest.jsonnet',
  import 'locks.jsonnet',
  import 'rural-police.jsonnet',
];
{
  itemEconomy: economy.itemEconomy(std.flattenArrays([source.items for source in sources])),
}
