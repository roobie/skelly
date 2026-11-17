local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
local magazine = (import 'packages/skelly-assets/built/skelly.firearms/gungen/magazine_pistol_9.model.json').gun;
// Case landings by ear: the pistol in hand with a full magazine fitted, so one rack chambers a round, and a box's
// worth of rounds pocketed for refills.
{
  starts: [kit.fixture + {
    id: 'caselandinglook',
    site: 'testHouseCaseLandingLook',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
    kit+: [
      { id: 'pistol', item: 'pistol_service', condition: 1, destination: { kind: 'hand', role: 'dominant' } },
      {
        id: 'magazine', item: 'magazine_pistol_9',
        cartridges: std.repeat(['cartridge_9x19'], magazine.capacity),
        destination: { kind: 'slot', parent: 'pistol', slot: 'magazine' },
      },
      {
        id: 'rounds', item: 'cartridge_9x19', count: 50,
        destination: { kind: 'pocket', parent: 'jeans', pocket: 1 },
      },
    ],
  }],
}
