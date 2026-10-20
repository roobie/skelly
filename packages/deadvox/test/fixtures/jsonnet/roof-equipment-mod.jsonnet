local decor = import '../../../src/content/base/gauntlet-city-decor.libsonnet';
local pool = decor.mapPools[0];
{
  mapPools: [pool + {
    choices: [
      if i == 0 then pool.choices[i] + { weight: pool.choices[i].weight * 2 }
      else pool.choices[i]
      for i in std.range(0, std.length(pool.choices) - 1)
    ],
  }],
}
