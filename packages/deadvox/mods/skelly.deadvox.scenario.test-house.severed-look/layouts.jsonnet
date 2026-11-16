local layout = (import '../skelly.deadvox.scenario.test-house/layouts-test-house.jsonnet').layouts[0];
local field = import 'severed-field.libsonnet';
{
  layouts: [layout + {
    id: 'testHouseSeveredLook',
    actors: [],
    buildings+: [{ template: field.deck.id, position: field.deckPosition, rotation: 0 }],
    showroom: layout.showroom + {
      capacity: std.length(field.crates),
      // The spawn faces the newest slot, so the centre row comes last and the look opens down the middle of the field.
      slots: [
        { furniture: 'crate', placement: { position: crate.position, facing: 'n' }, items: crate.items }
        for crate in [crate for crate in field.crates if crate.row != field.centre] +
                     [crate for crate in field.crates if crate.row == field.centre]
      ],
    },
    player: { position: field.spawn, bearing: 90 },
  }],
}
