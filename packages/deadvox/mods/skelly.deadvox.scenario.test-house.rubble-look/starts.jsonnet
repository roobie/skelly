local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
// Rubble clearing by eye: the heap layout stands the tester beside a rubble row at eye height, and the start
// ships every skill at the top level and nothing else staged, because clearing rubble needs no tool and no
// recipe — the check is the heap at start, then the debug build tool and its take-apart key; rubble clearing
// has no crafting view until the world-work view (#1699's shape).
{
  starts: [kit.fixture + {
    id: 'rubblelook',
    site: 'testHouseRubbleLook',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
  }],
}
