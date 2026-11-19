local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
{ starts: [kit.fixture + kit.notSiteDefault + {
  id: 'plantinstrumentsdarklook', site: 'plantInstrumentsDarkLook',
  startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
}] }
