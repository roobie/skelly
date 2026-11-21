local burns(ignition, douse, sprint, stow, drop, relight) = {
  ignition: ignition,
  douse: douse,
  sprint: sprint,
  stow: stow,
  drop: drop,
  relight: relight,
};

(import 'tools/jsonnet/lib/item-policy.libsonnet').itemPack({
  items: [
    {
      id: 'glowstick',
      name: 'Glowstick',
      category: 'light',
      weight: 30,
      size: [1, 2],
      description: 'A sealed chemical light.',
      model: 'glowstick',
      light: {
        radius: 2,
        seenFrom: 15,
        color: '#62ff81',
        intensity: 0.46,
        emissive: 0.8,
        burnTimeGameHours: 8,
        burning: burns('snap', douse=false, sprint='stay', stow='stay', drop='stay', relight=false),
      },
    },
    {
      id: 'road_flare',
      name: 'Road flare',
      category: 'light',
      size: [1, 2],
      description: 'A road flare. It burns red and bright until it is spent.',
      model: 'road_flare',
      light: {
        radius: 4,
        seenFrom: 40,
        color: '#ff3b24',
        intensity: 1.65,
        emissive: 1,
        burnTimeGameHours: 1,
        burning: burns('snap', douse=false, sprint='stay', stow='stay', drop='stay', relight=false),
      },
    },
  ],
})
