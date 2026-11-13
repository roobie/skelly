local economy = import 'tools/jsonnet/lib/economy.libsonnet';
{
  itemEconomy: economy.itemEconomy((import 'rural-police.jsonnet').items + (import 'templates-medical.jsonnet').items),
}
