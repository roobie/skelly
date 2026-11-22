// A works stores whose one shelf is walled into the corner by the door, with the aisle and both rooms left open, so
// only the storage service has nothing a body can stand beside.
local works = import '../../../mods/skelly.deadvox.buildings/works-stores.libsonnet';
local rows(shelf) = [
  shelf + '#.__....',
  '###.__....',
  '....__....',
  '....__....',
  '....__....',
  '.________.',
  '.________.',
  '..........',
];
local racking = works.racking('fixture_boxed_racking', [rows('SS') for _ in [1, 2, 3, 4]], {
  S: { furniture: 'shelf', facing: 'n' },
});
{
  mapPieces: [racking],
  mapAssemblies: [works.answer('fixture_boxed_stores', racking.id)],
}
