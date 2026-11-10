import { claimedId } from '@skelly/engine/inventory';
import body from '../../../mods/skelly.body/body.json' with { type: 'json' };
import crafting from '../../../mods/skelly.crafting/crafting.json' with { type: 'json' };
import power from '../../../mods/skelly.electric-power/power.json' with { type: 'json' };
import firearms from '../../../mods/skelly.firearms/firearms-skills.json' with { type: 'json' };
import graphics from '../../../mods/skelly.graphics/graphics.json' with { type: 'json' };
import look from '../../../mods/skelly.graphics/look.json' with { type: 'json' };
import meleeItems from '../../../mods/skelly.melee/melee-items.json' with { type: 'json' };
import melee from '../../../mods/skelly.melee-classes/melee-classes.json' with { type: 'json' };
import progression from '../../../mods/skelly.progression/progression.json' with { type: 'json' };
import saves from '../../../mods/skelly.saves/saves.json' with { type: 'json' };
import ui from '../../../mods/skelly.ui/ui.json' with { type: 'json' };
import weathering from '../../../mods/skelly.weathering/weathering.json' with { type: 'json' };
import sites from '../../mods/skelly.deadvox.site-generation/site-generation.json' with { type: 'json' };

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
  firearmsCombat: id(firearms.skills, 'firearmsCombat'),
  meleeCombat: id(meleeItems.skills, 'meleeCombat'),
  unarmed: id(melee.meleeClasses, 'unarmed'),
  inventoryManagement: id(progression.skills, 'inventoryManagement'),
  crafting: id(crafting.skills, 'crafting'),
};

export const defaultWeatheringId = id(weathering.weathering, 'defaultWeathering');
