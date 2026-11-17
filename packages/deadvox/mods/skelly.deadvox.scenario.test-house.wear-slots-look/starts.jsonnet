local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
{
  starts: [kit.fixture + kit.notSiteDefault + {
    id: 'wearslotslook',
    site: 'testHouse',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
    kit+: [
      { id: 'survey_pack', item: 'fixture_survey_pack', condition: 1, destination: { kind: 'worn' } },
      { id: 'hidden_harness', item: 'fixture_hidden_harness', condition: 1, destination: { kind: 'worn' } },
      { id: 'pack_beans', item: 'canned_beans', destination: { kind: 'pocket', parent: 'survey_pack', pocket: 0 } },
    ],
  }],
}
