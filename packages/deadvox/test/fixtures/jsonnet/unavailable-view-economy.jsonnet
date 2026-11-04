local economy = import 'packages/deadvox/mods/skelly.deadvox.residual/economy.libsonnet';

{
  itemEconomy: economy.itemEconomy([{ id: 'fixture_unavailable_view_optic', opticView: 'unavailable' }]),
}
