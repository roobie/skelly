local repair = (import '../skelly.deadvox.scenario.test-house.cell-repair-look/starts.jsonnet').starts[0];
{
  starts: [repair + {
    id: 'rubblelook',
    site: 'testHouseRubbleLook',
    blockDamage: [repair.blockDamage[0] + { cell: [-21, 45, 28] }],
  }],
}
