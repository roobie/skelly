local economy = import 'tools/jsonnet/lib/economy.libsonnet';
{
  itemEconomy: economy.itemEconomy((import 'locks.jsonnet').items),
}
