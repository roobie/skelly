local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
local start(id, site) = kit.fixture + kit.notSiteDefault + {
  id: id, site: site,
  startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
  kit+: [{ id: 'control', item: 'instrument_fixture_control', condition: 1, destination: { kind: 'hand', role: 'off' } }],
};
{ starts: [start('plantinstrumentslook', 'plantInstrumentsLook')] }
