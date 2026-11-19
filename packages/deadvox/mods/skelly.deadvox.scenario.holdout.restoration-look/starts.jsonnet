local restoration = import '../skelly.deadvox.scenario.holdout.restoration/restoration.libsonnet';
local pocket = { kind: 'pocket', parent: 'backpack', pocket: 0 };
// A spare for every slot the seed can fail and the tools every service needs, so the check starts at the module.
{
  starts: [restoration.start('holdoutrestorationlook', [
    { id: 'backpack', item: 'hiking_backpack', destination: { kind: 'worn' } },
    { id: 'screwdriver', item: 'screwdriver', condition: 1, destination: pocket },
    { id: 'pliers', item: 'adjustable_pliers', condition: 1, destination: pocket },
    { id: 'brushes', item: 'exciter_brush_set', condition: 1, destination: pocket },
    { id: 'governor', item: 'governor_linkage', condition: 1, destination: pocket },
    { id: 'fuse', item: 'field_fuse', condition: 1, destination: pocket },
  ])],
}
