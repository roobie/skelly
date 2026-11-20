local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
// Noon, so the steel's wear steps read in flat daylight. A light pack with an empty jerry can puts the climber
// between what the worn segment bears and what a sound one does, so the same climb holds on one pipe and tears the
// other.
{
  starts: [kit.fixture + kit.notSiteDefault + {
    id: 'downspoutlook',
    site: 'downspoutLook',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
    kit: kit.common.kit + [
      { id: 'pack', item: 'school_backpack', count: 1, destination: { kind: 'worn' } },
      { id: 'can', item: 'jerry_can', destination: { kind: 'pocket', parent: 'pack', pocket: 0 } },
    ],
  }],
}
