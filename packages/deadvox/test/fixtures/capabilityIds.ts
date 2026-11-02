import body from '../../src/content/base/body.json' with { type: 'json' };
import graphics from '../../src/content/base/graphics.json' with { type: 'json' };
import melee from '../../src/content/base/items-tools.json' with { type: 'json' };
import look from '../../src/content/base/look.json' with { type: 'json' };
import power from '../../src/content/base/power.json' with { type: 'json' };
import range from '../../src/content/base/range.json' with { type: 'json' };
import recipes from '../../src/content/base/recipes.json' with { type: 'json' };
import saves from '../../src/content/base/saves.json' with { type: 'json' };
import sites from '../../src/content/base/site-generation.json' with { type: 'json' };
import ui from '../../src/content/base/ui.json' with { type: 'json' };
import weathering from '../../src/content/base/weathering.json' with { type: 'json' };
import { claimedId } from '../../src/core/capabilities.ts';

const id = (rows: { id: string; capability?: string }[], capability: string): string =>
  claimedId(new Map(rows.map((row) => [row.id, row])), capability);

export const fixtureIds = {
  powerTuning: id(power.powerTuning, 'power'),
  coreUi: id(ui.ui, 'interface'),
  coreGraphics: id(graphics.graphics, 'graphics'),
  coreLook: id(look.look, 'defaultLook'),
  player: id(body.body, 'player'),
  autosave: id(saves.saves, 'autosave'),
  authoredSite: id(sites.siteGeneration, 'authoredSite'),
  testRange: id(range.handlingRange, 'testRange'),
  firearmsCombat: id(recipes.skills, 'firearmsCombat'),
  meleeCombat: id(recipes.skills, 'meleeCombat'),
  fistsMeleeClass: id(melee.meleeClasses, 'unarmed'),
  inventoryManagement: id(recipes.skills, 'inventoryManagement'),
  crafting: id(recipes.skills, 'crafting'),
};

export const defaultWeatheringId = id(weathering.weathering, 'defaultWeathering');
