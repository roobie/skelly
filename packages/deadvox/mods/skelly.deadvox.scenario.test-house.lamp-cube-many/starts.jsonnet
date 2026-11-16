local one = (import '../skelly.deadvox.scenario.test-house.lamp-cube-one/starts.jsonnet').starts[0];
{
  starts: [one + {
    id: 'lampcubemany', site: 'testHouseLampCubeMany',
    kit: one.kit + [{
      id: 'offlamp', item: 'oil_lamp', lit: true,
      destination: { kind: 'hand', role: 'off' },
    }] + [
      { id: 'drop' + std.toString(i), item: 'oil_lamp', lit: true, destination: { kind: 'pile', pos: pos } }
      for i in std.range(0, 3)
      for pos in [[3, 42, -42], [5, 42, -34], [13, 42, -42], [13, 42, -34]][i:i+1]
    ],
  }],
}
