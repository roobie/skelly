// An open-top sightseeing double decker: the double decker's lower deck, stairs and upper floor, cut off at a waist-
// high bulwark round the upper deck, about 11.5 t at the kerb. Metres in the vehicle frame.
local dd = import 'double_decker.spec.libsonnet';
local bulwark = 3.3;
local lean = dd.lean * (bulwark - dd.screens[0][0]) / (dd.roofBase - dd.screens[0][0]);
local deflectorX = 4.98;
dd {
  openTop: true,
  roofBase: bulwark, roof: bulwark,
  // Keeps the double decker's rake, so the shared upper floor still meets the front wall.
  lean: lean,
  decks: [dd.decks[0]],
  upperDeck: dd.decks[1].floor,
  screens: [dd.screens[0]],
  rearHoles: [dd.rearHoles[0]],
  paint: 'paint-green', accent: 'paint-cream', bumperFinish: 'paint-charcoal',
  shellMass: 7420,
  rail: { top: 3.78, post: 1.3, posts: 8 },
  // The rake lands the glass's foot on the bulwark's front cap.
  deflector: { x: deflectorX, top: 3.92, rake: dd.front - lean - 0.06 - deflectorX },
}
