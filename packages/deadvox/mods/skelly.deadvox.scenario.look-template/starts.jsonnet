local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
// The look a new fixture copies: rename the pack and row, then keep only the fields its check needs.
{
  starts: [kit.fixture + kit.notSiteDefault + {
    id: 'looktemplate',
    // A site that spawns the tester beside the target; a new site comes with its layout in this pack.
    site: 'testHouseAmalgam',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
    kit+: [
      { id: 'shotgun', item: 'pump_shotgun', condition: 1, destination: { kind: 'hand', role: 'dominant' } },
      // A start hands over no loaded weapon until #1570, so the ammunition is pocketed.
      {
        id: 'buckshot', item: 'shell_12_gauge_00_buck', count: 8,
        destination: { kind: 'pocket', parent: 'jeans', pocket: 0 },
      },
    ],
  }],
}
