local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
// Shod in the tallest-soled footwear deadvox bundles, so taking the boots off in third person shows the figure step down
// onto the bare foot (`packages/deadvox/DESIGN.md`, "Worn items seen").
{
  starts: [kit.fixture + kit.notSiteDefault + {
    id: 'soleliftlook',
    site: 'testHouse',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
    kit: [entry for entry in super.kit if entry.id != 'sneakers'] + [
      { id: 'boots', item: 'rubber_boots', condition: 1, destination: { kind: 'worn' } },
    ],
  }],
}
