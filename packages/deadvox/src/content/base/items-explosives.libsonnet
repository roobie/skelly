// Thrown explosives (`DESIGN.md`, "Hand grenade").

// Tuned so one grenade in the middle of a horde shreds it: against shamblers the blast kills within about two
// thirds of its radius and severs limbs nearly to its edge, and one fragment severs a limb. A full-strength level throw
// clears the blast, while fragments reach beyond it as a separate hazard. The fragment count
// stays where one blast into a full horde costs about a frame.
local items = [
  {
    id: 'frag_grenade',
    name: 'Hand grenade',
    category: 'weapon',
    weight: 400,
    size: [1, 1],
    description: 'A fragmentation grenade. With the pin pulled, its fuse lights as it leaves the hand.',
    explosive: {
      fuseSimSeconds: 4,
      blast: { radiusMetres: 7, damage: 180, impulse: 30 },
      fragments: { count: 600, damage: 30, rangeMetres: 15, impulse: 0.5 },
      sound: 'grenade_blast',
    },
  },
];

{
  items: items,
}
