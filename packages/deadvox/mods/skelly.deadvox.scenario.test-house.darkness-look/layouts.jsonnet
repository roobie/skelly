local layout = (import '../skelly.deadvox.scenario.test-house/layouts-test-house.jsonnet').layouts[0];
{
  layouts: [layout + {
    id: 'testHouseDarknessLook',
    player: { position: [1, 21, -7], bearing: 0 },
  }],
}
