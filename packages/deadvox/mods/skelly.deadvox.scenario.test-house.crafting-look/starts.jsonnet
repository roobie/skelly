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
    // A hatchback parked in the pavilion's open west bay, within reach of the spawn with nothing between, so the
    // crosshair names its parts with their condition (`packages/deadvox/INTERFACE.md`, "Condition"). Its front doors
    // stand worn, so the part lines show a low band beside the top band of the intact parts.
    vehicles: base.vehicles + [{
      blueprint: 'hatchback',
      placementKey: 'testHouse.crafting-look-hatchback',
      position: [-10.1, 21.5, -0.5],
      facing: 'e',
      wear: { front_door_near: 0.7, front_door_far: 0.7 },
    }],
    showroom: base.showroom + {
      row: [-8.5, 21.5, -1],
      // The workbench (the repair stock) stands north of the spawn with the chair and crate either side of the
      // southward walk, so the look reaches every piece from the spawn and one straight walk away from the
      // workbench leaves the stock out of reach while the work targets stay in it. The chair stands worn into a low
      // condition band, so one repair (`catalogue.jsonnet`, the chair repair) visibly lifts it to the repair ceiling
      // (`packages/deadvox/DESIGN.md`, "Repair ceiling"), after which its ring offers no Repair. The showroom's charging station has a crate of its own with stock on top, so this crate
      // stands nearer the spawn than that one: the crate the look meets first is the one it can take apart. An intact
      // electric lamp west and a fridge east of the workbench stand in reach, so the crosshair shows a top-band
      // condition on powered pieces too (`packages/deadvox/INTERFACE.md`, "Condition"); the lamp stays out of the
      // lines to the hatchback's doors and to the chair. A low fixture housing (`housing.jsonnet`) stands beside the chair,
      // clear of the hatchback's front door swing, the southward walk and the lines to the chair and the doors, so its
      // Work on reviews part service from the spawn. They come first so the workbench stays the newest slot the spawn faces.
      capacity: 6,
      slots: [{
        furniture: 'electric_lamp',
        placement: { position: [-9, 21.5, -2], facing: 's' },
      }, {
        furniture: 'fridge',
        placement: { position: [-6, 21.5, -1.5], facing: 's' },
      }, {
        furniture: 'chair',
        placement: { position: [-9, 21.5, 0], facing: 's' },
        wear: 0.8,
      }, {
        furniture: 'crate',
        placement: { position: [-7, 21.5, -0.5], facing: 's' },
        // Worn, so its title in the inventory's "Around you" shows a low band's blip.
        wear: 0.6,
      }, {
        furniture: 'craft_look_housing',
        placement: { position: [-8.5, 21.5, 0.5], facing: 's' },
      }, {
        furniture: 'workbench',
        placement: { position: [-8.5, 21.5, -2.5], facing: 's' },
        // Intact, so an unpowered piece shows the top band as well.
        wear: 0,
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
