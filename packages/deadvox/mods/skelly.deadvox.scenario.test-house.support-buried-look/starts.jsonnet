local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
{
  starts: [kit.fixture + {
    id: 'supportburiedlook',
    site: 'testHouseSupportBuriedLook',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
    supportLoss: [[-22, 48, 30]],
  }],
}
