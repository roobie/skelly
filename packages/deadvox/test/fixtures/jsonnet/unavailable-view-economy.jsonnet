local economy = import 'tools/jsonnet/lib/economy.libsonnet';

{
  itemEconomy: economy.itemEconomy([{ id: 'fixture_unavailable_view_optic', opticView: 'unavailable' }]),
}
