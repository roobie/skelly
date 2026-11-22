local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
local start(id, site) = kit.fixture + kit.notSiteDefault + {
  id: id, site: site,
  startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
  kit+: [{ id: 'control', item: 'instrument_fixture_control', condition: 1, destination: { kind: 'hand', role: 'off' } }] + [
    { id: spare.item, item: spare.item, destination: { kind: 'pile', pos: spare.pos } }
    for spare in [
      { item: 'exciter_brush_set', pos: [-15, 42, -3] },
      { item: 'governor_linkage', pos: [-13, 42, -3] },
      { item: 'field_fuse', pos: [-11, 42, -3] },
      { item: 'bearing_oiler', pos: [-9, 42, -3] },
    ]
  ],
};
{ starts: [start('plantinstrumentslook', 'plantInstrumentsLook')] }
