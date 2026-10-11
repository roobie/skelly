// Thrown explosives (DESIGN.md, "Hand grenade").

// Spike tuning, roughly a fragmentation grenade: killing close by, wounding out to its fragment range.
local items = [
  {
    id: 'frag_grenade',
    name: 'Hand grenade',
    category: 'weapon',
    weight: 400,
    size: [1, 1],
    description: 'A fragmentation grenade. The fuse burns from the moment it leaves the hand.',
    explosive: {
      fuseSimSeconds: 4,
      blast: { radiusMetres: 4, damage: 80 },
      fragments: { count: 600, damage: 20, rangeMetres: 15, impulse: 0.35 },
      sound: 'grenade_blast',
    },
  },
];

{
  items: items,
}
