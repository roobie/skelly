local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
// The window covers by eye at night: the room in `layouts.jsonnet`, `test_house_window_kit`, with an oil lamp lit on
// its floor in the middle of the room, in blocks. The common kit already knows the window cover recipes, and the
// fixture's top skills mean no recipe refuses for skill.
{
  starts: [kit.fixture + kit.notSiteDefault + {
    id: 'windowkitlook',
    site: 'testHouseWindowKitLook',
    startTimeGameTimeOfDay: '22:00',
    kit: kit.fixture.kit + [
      { id: 'roomlamp', item: 'oil_lamp', lit: true, destination: { kind: 'pile', pos: [-16, 42, 36] } },
    ],
  }],
}
