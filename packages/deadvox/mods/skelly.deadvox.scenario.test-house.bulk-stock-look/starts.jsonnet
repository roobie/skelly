local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
// The bulk-stock look by eye: empty hands at noon beside the three material stacks; the debug take-apart key
// (F2 gate + NumpadDecimal) starts each stack's disassembly for the fixture's checks.
{
  starts: [kit.fixture + kit.notSiteDefault + {
    id: 'bulkstocklook',
    site: 'testHouseBulkStock',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
  }],
}
