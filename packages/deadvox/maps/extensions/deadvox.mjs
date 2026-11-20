// Tiled 1.11 / Qt 5 ES module (ES6, not object spread). No Node/npm runtime dependency.
import { buildingBounds, defaultFoundation, hasSegment, lotOf, standingHeight } from '../../../engine/src/terrain.mjs';

/** @import { GroundLot, Point, Rect, TerrainFeature } from '../../../engine/src/core/authoredTerrain.mjs' */
// The layout types spell out only what this extension writes, because this program checks the extension
// without engine sources.
/** @typedef {[number, number, number]} Vec3 */
/**
 * @typedef {object} SiteBuilding
 * @property {string} template
 * @property {Vec3} position
 * @property {number} rotation
 * @property {number} storeys
 * @property {unknown} [lootContext]
 * @property {unknown[]} [fixedLoot]
 */
/** @typedef {{ fromGameTimeOfDay: string; toGameTimeOfDay?: string }} SpawnWindow */
/** @typedef {{ type: string; position: Vec3; chance: number; window?: SpawnWindow }} SiteActor */
/** @typedef {{ id: string; area: Rect }} SiteBeat */
/**
 * @typedef {object} SiteLayout
 * @property {string} id
 * @property {unknown} lootContext
 * @property {Rect} bounds
 * @property {number} ground
 * @property {TerrainFeature[]} terrain
 * @property {SiteBuilding[]} buildings
 * @property {{ position: Vec3; bearing: number } | null} player
 * @property {{ polygon: Point[]; profile: string }[]} woodlands
 * @property {{ points: Point[]; width: number; surface: string }[]} tracks
 * @property {unknown} [attemptPolicy]
 * @property {string} [startTimeGameTimeOfDay]
 * @property {SiteActor[]} actors
 * @property {{ id: string; position: Vec3 }[]} hordes
 * @property {SiteBeat[]} [beats]
 */
/** @typedef {{ id: string; size: Vec3 }} ContentTemplate */
/** @typedef {{ templates: ContentTemplate[]; actors: { id: string }[] }} ContentPack */
/** @typedef {{ id: number; name: string; values?: string[] }} ProjectPropertyType */
/** @typedef {{ propertyTypes?: ProjectPropertyType[] }} TiledProject */
/** @typedef {{ layout: SiteLayout; pack: ContentPack; footprints: Rect[]; beats: SiteBeat[] }} ExportContext */
/** @typedef {{ name: string; x: number; z: number; rotation: number; cls: ObjectClass }} ObjectInfo */
/** @typedef {keyof typeof WRITERS} ObjectClass */

const root = FileInfo.path(tiled.projectFilePath);
const ID_PATTERN = /^[a-z0-9_]+$/;
/** @type {Readonly<Record<string, string>>} */
const ENUM_TYPES = { template: 'template_id', actor: 'actor_type' };

/**
 * @param {string} path
 * @returns {unknown}
 */
function readJson(path) {
  const file = new TextFile(path, TextFile.ReadOnly);
  try {
    return JSON.parse(file.readAll());
  } finally {
    file.close();
  }
}
/** @returns {TiledProject} */
function readProject() {
  return /** @type {TiledProject} */ (readJson(tiled.projectFilePath));
}
/**
 * @param {string} path
 * @param {unknown} value
 */
function writeJson(path, value) {
  const file = new TextFile(path, TextFile.WriteOnly);
  const json = JSON.stringify(value, null, 2)
    .replace(
      /\[\s*((?:"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?)(?:\s*,\s*(?:"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?))*)\s*\]/g,
      (_match, values) => `[${values.replace(/,\s*/g, ', ')}]`,
    )
    .replace(/\[\s*(\[[-\d., ]+\](?:,\s*\[[-\d., ]+\])*)\s*\]/g, (match, rows, offset, text) => {
      const compact = `[${rows.replace(/,\s*/g, ', ')}]`;
      const prefixLength = offset - text.lastIndexOf('\n', offset) - 1;
      return prefixLength + compact.length < 120 ? compact : match;
    });
  file.write(`${json}\n`);
  file.commit(); // QSaveFile: close() without commit silently cancels the write.
}
// Tiled cannot load TypeScript, so this mirrors `packages/engine/src/core/codeUnitOrder.ts`, `compareCodeUnits`.
/**
 * @param {string} left
 * @param {string} right
 */
function compareCodeUnits(left, right) {
  if (left < right) {
    return -1;
  }
  return left > right ? 1 : 0;
}
/** @returns {ContentPack} */
function content() {
  const mods = `${root}/../mods`;
  const templateFiles = [
    'skelly.deadvox.buildings/templates.json',
    'skelly.deadvox.scenario.cabins/templates-cabins.json',
    'skelly.deadvox.woods/templates.json',
    'skelly.deadvox.scenario.stairs/templates-stairs.json',
    'skelly.deadvox.scenario.playtest/templates-playtest.json',
    'skelly.deadvox.rural-sites/templates-medical.json',
    'skelly.deadvox.buildings/templates-workshop.json',
    'skelly.deadvox.camp/camp.json',
    'skelly.deadvox.scenario.playtest/ladders.json',
  ];
  /** @type {ContentTemplate[]} */
  const templates = [];
  for (const file of templateFiles) {
    const entries = /** @type {{ templates?: ContentTemplate[] }} */ (readJson(`${mods}/${file}`)).templates || [];
    for (const entry of entries) {
      templates.push(entry);
    }
  }
  const { actors } = /** @type {Pick<ContentPack, 'actors'>} */ (
    readJson(`${mods}/skelly.deadvox.actors/enemies.json`)
  );
  return { templates, actors };
}
/**
 * The map is a TileMap, which carries no name.
 * @param {MapObject | TileMap} object
 */
function ownerName(object) {
  return 'isTileMap' in object ? 'map' : object.name;
}
/**
 * @param {MapObject | TileMap} object
 * @param {string} name
 * @param {unknown} [fallback]
 * @returns {unknown}
 */
function scalar(object, name, fallback) {
  const property = object.property(name);
  /** @type {unknown} */
  let value = property;
  // Custom enums are PropertyValue wrappers with integer indices in Tiled 1.11.
  if (property !== null && typeof property === 'object') {
    const index = /** @type {PropertyValue} */ (property).value;
    const definition = (readProject().propertyTypes || []).find((t) => t.name === ENUM_TYPES[name]);
    const values = definition ? definition.values : undefined;
    if (!values) {
      throw new Error(`${ownerName(object)}: unsupported custom property ${name}`);
    }
    value = typeof index === 'number' ? values[index] : undefined;
  }
  if (value === undefined || value === '') {
    if (fallback !== undefined) {
      return fallback;
    }
    throw new Error(`${ownerName(object)}: missing property ${name}`);
  }
  return value;
}
/**
 * @param {MapObject | TileMap} object
 * @param {string} name
 * @param {string} [fallback]
 */
function requiredString(object, name, fallback) {
  const value = scalar(object, name, fallback);
  if (typeof value !== 'string') {
    throw new Error(`${ownerName(object)}: expected string property ${name}`);
  }
  return value;
}
/**
 * @param {unknown} value
 * @param {string} name
 */
function finite(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${name}: expected finite number`);
  }
  return value;
}
/**
 * @param {MapObject | TileMap} object
 * @param {string} name
 * @returns {string | undefined}
 */
function optionalString(object, name) {
  const value = object.property(name);
  if (value === null || value === undefined || value === '') {
    return;
  }
  if (typeof value !== 'string') {
    throw new Error(`${ownerName(object)}: expected string property ${name}`);
  }
  return value;
}
/**
 * @param {SiteLayout} layout
 * @param {Point} point
 * @param {string} name
 */
function pointInside(layout, [x, z], name, inset = 0) {
  const b = layout.bounds;
  if (x < b.x0 + inset || z < b.z0 + inset || x > b.x1 - inset || z > b.z1 - inset) {
    throw new Error(`${name}: outside site bounds`);
  }
}
/**
 * @param {TileMap | GroupLayer} container
 * @param {MapObject[]} [result]
 */
function objects(container, result = []) {
  for (let i = 0; i < container.layerCount; i++) {
    const layer = container.layerAt(i);
    if (layer.offset.x !== 0 || layer.offset.y !== 0) {
      throw new Error(`Layer offsets are not supported: ${layer.name}`);
    }
    // Tiled's layer flags are not type guards, so each cast names the layer kind its flag reports.
    if (layer.isGroupLayer) {
      objects(/** @type {GroupLayer} */ (layer), result);
    } else if (layer.isObjectLayer) {
      result.push(.../** @type {ObjectGroup} */ (layer).objects);
    } else {
      throw new Error(`Only object/group layers are supported: ${layer.name}`);
    }
  }
  return result;
}
/**
 * @param {string} cls
 * @returns {cls is ObjectClass}
 */
function isObjectClass(cls) {
  return Object.keys(WRITERS).includes(cls);
}
/**
 * @param {MapObject} object
 * @returns {ObjectInfo}
 */
function objectInfo(object) {
  const name = object.name || `object ${object.id}`;
  const x = finite(object.x, `${name}.x`);
  const z = finite(object.y, `${name}.y`);
  const rotation = ((finite(object.rotation, `${name}.rotation`) % 360) + 360) % 360;
  const cls = object.className;
  if (!isObjectClass(cls)) {
    throw new Error(`${name}: unknown class ${cls}`);
  }
  if (cls !== 'building' && rotation !== 0) {
    throw new Error(`${name}: only buildings may rotate; spawn bearing is a property`);
  }
  return { name, x, z, rotation, cls };
}
/**
 * @param {MapObject} object
 * @param {ObjectInfo} info
 * @param {ExportContext} context
 */
function addBuilding(object, info, context) {
  const { name, x, z, rotation } = info;
  const { layout, pack, footprints } = context;
  if (object.shape !== MapObject.Rectangle) {
    throw new Error(`${name}: building must be a rectangle`);
  }
  const template = requiredString(object, 'template');
  const definition = pack.templates.find((t) => t.id === template);
  if (!definition) {
    throw new Error(`${name}: unknown template ${template}`);
  }
  const w = definition.size[0] * 0.5;
  const d = definition.size[2] * 0.5;
  // Tiled rotates around the rectangle's top-left pivot; Placement uses the rotated minimum.
  /** @type {Record<number, Point | undefined>} */
  const offsets = { 0: [0, 0], 90: [-d, 0], 180: [-w, -d], 270: [0, -w] };
  const offset = offsets[rotation];
  if (!offset) {
    throw new Error(`${name}: rotation must be a quarter turn`);
  }
  if (object.width !== w || object.height !== d) {
    throw new Error(`${name}: rectangle must match unrotated template ${w}x${d} m`);
  }
  /** @type {Vec3} */
  const position = [x + offset[0], 0, z + offset[1]];
  const rect = buildingBounds({ position, rotation }, definition.size);
  position[1] = finite(scalar(object, 'elevation', defaultFoundation(layout, rect)), `${name}.elevation`);
  if (!position.every((v) => Number.isInteger(v * 2))) {
    throw new Error(`${name}: position must be snapped to 0.5 m`);
  }
  const storeys = scalar(object, 'storeys', 1);
  if (typeof storeys !== 'number' || !Number.isInteger(storeys) || storeys < 1 || storeys > 8) {
    throw new Error(`${name}: storeys must be 1..8`);
  }
  const fixedLootText = requiredString(object, 'fixed_loot', '[]');
  /** @type {unknown} */
  let fixedLoot;
  try {
    fixedLoot = JSON.parse(fixedLootText);
  } catch (error) {
    // Tiled's script engine has no error causes, so the parse error travels in the message.
    throw new Error(`${name}: fixed_loot must be JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!Array.isArray(fixedLoot)) {
    throw new Error(`${name}: fixed_loot must be a JSON array`);
  }
  pointInside(layout, [rect.x0, rect.z0], name);
  pointInside(layout, [rect.x1, rect.z1], name);
  if (footprints.some((r) => r.x0 < rect.x1 && rect.x0 < r.x1 && r.z0 < rect.z1 && rect.z0 < r.z1)) {
    throw new Error(`${name}: buildings overlap`);
  }
  footprints.push(rect);
  /** @type {SiteBuilding} */
  const building = { template, position, rotation, storeys };
  const lootContext = optionalString(object, 'loot_context');
  if (lootContext !== undefined) {
    building.lootContext = JSON.parse(lootContext);
  }
  if (fixedLoot.length > 0) {
    building.fixedLoot = fixedLoot;
  }
  layout.buildings.push(building);
}
/**
 * @param {ExportContext} context
 * @returns {GroundLot[]}
 */
function buildingLots({ layout, pack }) {
  return layout.buildings.map((building) => {
    const definition = pack.templates.find((t) => t.id === building.template);
    if (!definition) {
      throw new Error(`Unknown template ${building.template}`);
    }
    return lotOf(building, buildingBounds(building, definition.size));
  });
}
/**
 * @param {MapObject} object
 * @param {ObjectInfo} info
 * @param {ExportContext} context
 */
function addSpawn(object, info, context) {
  const { name, x, z, cls } = info;
  const { layout, pack } = context;
  if (object.shape !== MapObject.Point) {
    throw new Error(`${name}: spawn must be a point`);
  }
  pointInside(layout, [x, z], name);
  if (x === layout.bounds.x1 || z === layout.bounds.z1) {
    throw new Error(`${name}: outside site bounds`);
  }
  const lots = buildingLots(context);
  /** @type {Vec3} */
  const position = [x, finite(scalar(object, 'elevation', standingHeight(layout, lots, x, z)), `${name}.elevation`), z];
  if (cls === 'player_spawn') {
    if (layout.player) {
      throw new Error('Exactly one player_spawn is required');
    }
    layout.player = { position, bearing: finite(scalar(object, 'bearing', 0), `${name}.bearing`) };
    return;
  }
  const type = requiredString(object, 'actor');
  if (!pack.actors.some((t) => t.id === type)) {
    throw new Error(`${name}: unknown zombie type ${type}`);
  }
  const chance = finite(scalar(object, 'chance', 1), `${name}.chance`);
  if (chance < 0 || chance > 1) {
    throw new Error(`${name}: chance must be 0..1`);
  }
  const fromGameTimeOfDay = optionalString(object, 'window_from');
  const toGameTimeOfDay = optionalString(object, 'window_to');
  if (toGameTimeOfDay !== undefined && fromGameTimeOfDay === undefined) {
    throw new Error(`${name}: window_to requires window_from`);
  }
  const window =
    fromGameTimeOfDay === undefined
      ? undefined
      : Object.assign({ fromGameTimeOfDay }, toGameTimeOfDay === undefined ? {} : { toGameTimeOfDay });
  layout.actors.push(Object.assign({ type, position, chance }, window ? { window } : {}));
}
/**
 * @param {MapObject} object
 * @param {ObjectInfo} info
 * @param {ExportContext} context
 */
function addHorde(object, info, context) {
  const { name, x, z } = info;
  const { layout } = context;
  if (object.shape !== MapObject.Point) {
    throw new Error(`${name}: horde must be a point`);
  }
  pointInside(layout, [x, z], name);
  if (x === layout.bounds.x1 || z === layout.bounds.z1) {
    throw new Error(`${name}: outside site bounds`);
  }
  const id = requiredString(object, 'horde_id');
  if (!ID_PATTERN.test(id)) {
    throw new Error(`${name}: invalid horde_id`);
  }
  if (layout.hordes.some((horde) => horde.id === id)) {
    throw new Error(`${name}: duplicate horde_id ${id}`);
  }
  /** @type {Vec3} */
  const position = [x, standingHeight(layout, buildingLots(context), x, z), z];
  if (!position.every((value) => Number.isInteger(value * 2))) {
    throw new Error(`${name}: position must be snapped to 0.5 m`);
  }
  layout.hordes.push({ id, position });
}
/**
 * @param {MapObject} object
 * @param {ObjectInfo} info
 */
function areaPoints(object, info) {
  const { name, x, z, cls } = info;
  if (object.shape !== (cls === 'woodland' ? MapObject.Polygon : MapObject.Polyline)) {
    throw new Error(`${name}: expected ${cls === 'woodland' ? 'polygon' : 'polyline'}`);
  }
  const points = object.polygon.map(
    /** @returns {Point} */
    (p) => [finite(x + p.x, name), finite(z + p.y, name)],
  );
  if (points.length < (cls === 'woodland' ? 3 : 2)) {
    throw new Error(`${name}: not enough vertices`);
  }
  return points;
}
/**
 * @param {MapObject} object
 * @param {ObjectInfo} info
 * @param {ExportContext} context
 */
function addWoodland(object, info, { layout }) {
  const { name } = info;
  const points = areaPoints(object, info);
  const profile = scalar(object, 'profile');
  if (typeof profile !== 'string' || !profile) {
    throw new Error(`${name}: missing cover profile`);
  }
  for (const point of points) {
    pointInside(layout, point, name);
  }
  layout.woodlands.push({ polygon: points, profile });
}
/**
 * @param {MapObject} object
 * @param {ObjectInfo} info
 * @param {ExportContext} context
 */
function addTrack(object, info, { layout }) {
  const { name } = info;
  const points = areaPoints(object, info);
  const width = finite(scalar(object, 'width'), `${name}.width`);
  if (width <= 0) {
    throw new Error(`${name}: width must be positive`);
  }
  for (const point of points) {
    pointInside(layout, point, name, width / 2);
  }
  const surface = requiredString(object, 'surface', 'dirt');
  if (!['dirt', 'asphalt'].includes(surface)) {
    throw new Error(`${name}: surface must be dirt or asphalt`);
  }
  layout.tracks.push({ points, width, surface });
}
/**
 * @param {MapObject} object
 * @param {ObjectInfo} info
 * @param {ExportContext} context
 */
function addTerrain(object, info, { layout }) {
  const { cls, name, x, z } = info;
  const rise = finite(scalar(object, 'rise'), `${name}.rise`);
  if (rise <= 0) {
    throw new Error(`${name}: rise must be positive`);
  }
  if (cls === 'ridge') {
    const points = areaPoints(object, info);
    const width = finite(scalar(object, 'width'), `${name}.width`);
    if (width <= 0 || !hasSegment(points)) {
      throw new Error(`${name}: ridge needs positive width and a non-zero segment`);
    }
    for (const point of points) {
      pointInside(layout, point, name);
    }
    layout.terrain.push({ kind: 'ridge', points, rise, width });
    return;
  }
  if (object.shape !== MapObject.Ellipse) {
    throw new Error(`${name}: hill must be an ellipse`);
  }
  /** @type {Point} */
  const radii = [finite(object.width, name) / 2, finite(object.height, name) / 2];
  if (radii.some((r) => r <= 0)) {
    throw new Error(`${name}: hill radii must be positive`);
  }
  /** @type {[number, number]} */
  const centre = [x + radii[0], z + radii[1]];
  pointInside(layout, centre, name);
  layout.terrain.push({ kind: 'hill', centre, radii, rise });
}
/**
 * @param {MapObject} object
 * @param {ObjectInfo} info
 * @param {ExportContext} context
 */
function addBeat(object, info, { layout, beats }) {
  const { name, x, z } = info;
  if (object.shape !== MapObject.Rectangle) {
    throw new Error(`${name}: beat must be a rectangle`);
  }
  const id = requiredString(object, 'beat');
  if (!ID_PATTERN.test(id)) {
    throw new Error(`${name}: invalid beat id`);
  }
  if (beats.some((beat) => beat.id === id)) {
    throw new Error(`${name}: beat ${id} is used more than once`);
  }
  const area = { x0: x, z0: z, x1: x + finite(object.width, name), z1: z + finite(object.height, name) };
  if (area.x1 <= area.x0 || area.z1 <= area.z0) {
    throw new Error(`${name}: beat area must have positive size`);
  }
  pointInside(layout, [area.x0, area.z0], name);
  pointInside(layout, [area.x1, area.z1], name);
  beats.push({ id, area });
}
const WRITERS = {
  building: addBuilding,
  // biome-ignore lint/style/useNamingConvention: literal Tiled object class name.
  player_spawn: addSpawn,
  shambler: addSpawn,
  horde: addHorde,
  woodland: addWoodland,
  track: addTrack,
  ridge: addTerrain,
  hill: addTerrain,
  beat: addBeat,
};
/**
 * @param {TileMap} map
 * @returns {{ layouts: [SiteLayout] }}
 */
export function exportLayout(map) {
  if (map.tileWidth !== 1 || map.tileHeight !== 1 || map.infinite || map.orientation !== TileMap.Orthogonal) {
    throw new Error('Use a finite orthogonal map with 1x1 tiles (one pixel = one metre)');
  }
  const id = requiredString(map, 'id');
  if (!ID_PATTERN.test(id) || ['forest', 'city'].includes(id)) {
    throw new Error('Invalid/reserved site id');
  }
  const ground = finite(scalar(map, 'ground'), 'ground');
  if (!Number.isInteger(ground * 2)) {
    throw new Error('ground must be snapped to 0.5 m');
  }
  const lootContext = JSON.parse(requiredString(map, 'loot_context'));
  const attemptPolicy = optionalString(map, 'attempt_policy');
  const startTimeGameTimeOfDay = requiredString(map, 'startTime', '');
  /** @type {SiteLayout} */
  const layout = Object.assign(
    {
      id,
      lootContext,
      bounds: { x0: 0, z0: 0, x1: map.width, z1: map.height },
      ground,
      terrain: [],
      buildings: [],
      player: null,
      woodlands: [],
      tracks: [],
    },
    attemptPolicy === undefined ? {} : { attemptPolicy: JSON.parse(attemptPolicy) },
    startTimeGameTimeOfDay ? { startTimeGameTimeOfDay } : {},
    { actors: [], hordes: [] },
  );
  /** @type {ExportContext} */
  const context = { layout, pack: content(), footprints: [], beats: [] };
  const entries = objects(map).map((object) => ({ object, info: objectInfo(object) }));
  // Contextual defaults depend on all terrain and lots, never layer/object ordering.
  for (const classes of [
    ['ridge', 'hill'],
    ['building'],
    ['player_spawn', 'shambler', 'horde', 'woodland', 'track', 'beat'],
  ]) {
    for (const { object, info } of entries) {
      if (classes.includes(info.cls)) {
        WRITERS[info.cls](object, info, context);
      }
    }
  }
  if (!layout.player) {
    throw new Error('Exactly one player_spawn is required');
  }
  if (context.beats.length > 0) {
    layout.beats = context.beats;
  }
  return { layouts: [layout] };
}
/** @type {ScriptedMapFormat} */
const format = {
  name: 'Deadvox site layout',
  extension: 'json',
  write(map, fileName) {
    try {
      writeJson(fileName, exportLayout(map));
      return '';
    } catch (error) {
      return error instanceof Error && error.message ? error.message : String(error);
    }
  },
};
tiled.registerMapFormat('deadvox-site', format);

/**
 * @param {string} name
 * @param {string} type
 * @param {string | number} value
 * @param {string} [propertyType]
 */
function member(name, type, value, propertyType) {
  return Object.assign({ name, type, value }, propertyType ? { propertyType } : {});
}
export function generatePropertyTypes() {
  const pack = content();
  const project = readProject();
  const existing = project.propertyTypes || [];
  let nextId = Math.max(0, ...existing.map((type) => type.id)) + 1;
  const definitions = [
    {
      name: 'template_id',
      type: 'enum',
      storageType: 'string',
      values: pack.templates.map((t) => t.id).sort(compareCodeUnits),
      valuesAsFlags: false,
    },
    {
      name: 'actor_type',
      type: 'enum',
      storageType: 'string',
      values: pack.actors.map((t) => t.id).sort(compareCodeUnits),
      valuesAsFlags: false,
    },
    {
      name: 'building',
      members: [
        member('template', 'string', '', 'template_id'),
        member('storeys', 'int', 1),
        member('fixed_loot', 'string', '[]'),
      ],
    },
    { name: 'player_spawn', members: [member('bearing', 'float', 0)] },
    {
      name: 'shambler',
      members: [
        member('actor', 'string', '', 'actor_type'),
        member('chance', 'float', 1),
        member('window_from', 'string', ''),
        member('window_to', 'string', ''),
      ],
    },
    { name: 'woodland', members: [member('profile', 'string', 'woodland')] },
    { name: 'track', members: [member('width', 'float', 3), member('surface', 'string', 'dirt')] },
    { name: 'ridge', members: [member('rise', 'float', 10), member('width', 'float', 40)] },
    { name: 'hill', members: [member('rise', 'float', 4)] },
    { name: 'beat', members: [member('beat', 'string', '')] },
    { name: 'horde', members: [member('horde_id', 'string', '')] },
  ].map((definition) => {
    const prior = existing.find((type) => type.name === definition.name);
    const id = prior ? prior.id : nextId;
    if (!prior) {
      nextId += 1;
    }
    return Object.assign(
      { id },
      definition,
      definition.type ? {} : { type: 'class', useAs: ['object'], color: '#ff70a080', drawFill: true },
    );
  });
  const names = definitions.map((definition) => definition.name);
  project.propertyTypes = existing.filter((definition) => !names.includes(definition.name)).concat(definitions);
  writeJson(tiled.projectFilePath, project);
  tiled.log(
    'Generated Deadvox property types. Close/reopen the project to refresh Tiled 1.11; do not save stale project types.',
  );
}
const action = tiled.registerAction('DeadvoxGeneratePropertyTypes', generatePropertyTypes);
action.text = 'Generate Deadvox property types (reopen project)';
tiled.extendMenu('MapView.Objects', [{ action: 'DeadvoxGeneratePropertyTypes' }]);
