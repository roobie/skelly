import body from '../../mods/skelly.deadvox.residual/body.json' with { type: 'json' };
import graphics from '../../mods/skelly.deadvox.residual/graphics.json' with { type: 'json' };
import melee from '../../mods/skelly.deadvox.residual/items-tools.json' with { type: 'json' };
import look from '../../mods/skelly.deadvox.residual/look.json' with { type: 'json' };
import power from '../../mods/skelly.deadvox.residual/power.json' with { type: 'json' };
import recipes from '../../mods/skelly.deadvox.residual/recipes.json' with { type: 'json' };
import saves from '../../../mods/skelly.saves/saves.json' with { type: 'json' };
import sites from '../../mods/skelly.deadvox.residual/site-generation.json' with { type: 'json' };
import ui from '../../mods/skelly.deadvox.residual/ui.json' with { type: 'json' };
import weathering from '../../mods/skelly.deadvox.residual/weathering.json' with { type: 'json' };
import { claimedId } from '../../src/core/capabilities.ts';

const id = (rows: { id: string; capability?: string }[], capability: string): string =>
  claimedId(new Map(rows.map((row) => [row.id, row])), capability);

export const fixtureIds = {
  powerTuning: id(power.powerTuning, 'power'),
  ui: id(ui.ui, 'interface'),
  graphics: id(graphics.graphics, 'graphics'),
  defaultLook: id(look.look, 'defaultLook'),
  player: id(body.body, 'player'),
  autosave: id(saves.saves, 'autosave'),
  authoredSite: id(sites.siteGeneration, 'authoredSite'),
  firearmsCombat: id(recipes.skills, 'firearmsCombat'),
  meleeCombat: id(recipes.skills, 'meleeCombat'),
  unarmed: id(melee.meleeClasses, 'unarmed'),
  inventoryManagement: id(recipes.skills, 'inventoryManagement'),
  crafting: id(recipes.skills, 'crafting'),
};

export const defaultWeatheringId = id(weathering.weathering, 'defaultWeathering');
