local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
local magazine = (import 'packages/skelly-assets/built/skelly.firearms/gungen/magazine_stanag_30.model.json').gun;
// The press check by eye: the AR in hand with a full magazine fitted, so one rack puts brass in the chamber to show.
{
  starts: [kit.fixture + kit.notSiteDefault + {
    id: 'presschecklook',
    site: 'testHouseAmalgam',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
    kit+: [
      { id: 'rifle', item: 'rifle_assault', condition: 1, destination: { kind: 'hand', role: 'dominant' } },
      {
        id: 'magazine', item: 'magazine_stanag_30',
        cartridges: std.repeat(['cartridge_5_d_56x45'], magazine.capacity),
        destination: { kind: 'slot', parent: 'rifle', slot: 'magazine' },
      },
    ],
  }],
}
