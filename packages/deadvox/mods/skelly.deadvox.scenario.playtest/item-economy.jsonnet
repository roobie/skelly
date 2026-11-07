local economy = import 'tools/jsonnet/lib/economy.libsonnet';
{
  itemEconomy: economy.itemEconomy((import 'items-playtest.jsonnet').items),
}
