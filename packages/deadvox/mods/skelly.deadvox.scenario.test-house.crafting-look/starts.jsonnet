local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
local base = (import '../skelly.deadvox.scenario.test-house/layouts-test-house.jsonnet').layouts[0];
local catalogue = import 'catalogue.jsonnet';
{
  starts: [kit.fixture + kit.notSiteDefault + {
    id: 'craftinglook', site: 'testHouseCraftingLook',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
    recipes: kit.common.recipes + [recipe.id for recipe in catalogue.recipes],
  }],
  layouts: [base + {
    id: 'testHouseCraftingLook',
    actors: [],
    showroom: base.showroom + {
      row: [-8.5, 21.5, -1],
      // The workbench (the repair stock) stands north of the spawn with the chair and crate either side of the
      // southward walk, so the look reaches every piece from the spawn and one straight walk away from the
      // workbench leaves the stock out of reach while the work targets stay in it. The chair stands worn into a low
      // condition band, so one repair (`catalogue.jsonnet`, the chair repair) visibly lifts it to the repair ceiling
      // (`packages/deadvox/DESIGN.md`, "Repair ceiling"), after which its ring offers no Repair. The showroom's charging station has a crate of its own with stock on top, so this crate
      // stands nearer the spawn than that one: the crate the look meets first is the one it can take apart.
      slots: [{
        furniture: 'chair',
        placement: { position: [-9, 21.5, 0], facing: 's' },
        wear: 0.8,
      }, {
        furniture: 'crate',
        placement: { position: [-7, 21.5, -0.5], facing: 's' },
      }, {
        furniture: 'workbench',
        placement: { position: [-8.5, 21.5, -2.5], facing: 's' },
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
