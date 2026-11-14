local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
local base = (import '../skelly.deadvox.scenario.test-house/layouts-test-house.jsonnet').layouts[0];
local catalogue = import 'catalogue.jsonnet';
{
  starts: [kit.fixture + kit.notSiteDefault + {
    id: 'craftinglook', site: 'testHouseCraftingLook',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
    recipes: [recipe.id for recipe in catalogue.recipes],
  }],
  layouts: [base + {
    id: 'testHouseCraftingLook',
    actors: [],
    showroom: base.showroom + {
      row: [-12, 21.5, -1],
      slots: [{
        furniture: 'workbench',
        items: [
          { item: 'craft_look_fibre', count: 1, placement: 'surface' },
          { item: 'craft_look_wood', count: 4, placement: 'surface' },
          { item: 'lamp_oil', placement: 'surface', liquidContents: { kind: 'filled', liquid: 'lamp_fuel', volumeMicrolitres: 500000 } },
          { item: 'lamp_oil', placement: 'surface', liquidContents: { kind: 'filled', liquid: 'lamp_fuel', volumeMicrolitres: 300000 } },
        ],
      }],
    },
  }],
}
