// Tiled 1.11 / Qt 5 ES module (ES6, not object spread). No Node/npm runtime dependency.
import {
  buildingBounds,
  defaultFoundation,
  hasSegment,
  lotOf,
  standingHeight,
} from '../../src/core/authoredTerrain.mjs';

const root = FileInfo.path(tiled.projectFilePath);
const ID_PATTERN = /^[a-z0-9_]+$/;
const CLASSES = ['building', 'player_spawn', 'shambler', 'woodland', 'track', 'ridge', 'hill'];
const ENUM_TYPES = { template: 'template_id', zombie: 'zombie_type' };

function readJson(path) {
  const file = new TextFile(path, TextFile.ReadOnly);
  try {
    return JSON.parse(file.readAll());
  } finally {
    file.close();
  }
}
function writeJson(path, value) {
  const file = new TextFile(path, TextFile.WriteOnly);
  file.write(`${JSON.stringify(value, null, 2)}\n`);
  file.commit(); // QSaveFile: close() without commit silently cancels the write.
}
function content() {
  return {
    templates: readJson(`${root}/../src/content/base/templates.json`).templates,
    zombies: readJson(`${root}/../src/content/base/zombies.json`).zombies,
  };
}
function scalar(object, name, fallback) {
  const property = object.property(name);
  let value = property;
  // Custom enums are PropertyValue wrappers with integer indices in Tiled 1.11.
  if (property !== null && typeof property === 'object') {
    const definition = readJson(tiled.projectFilePath).propertyTypes.find((t) => t.name === ENUM_TYPES[name]);
    if (!definition) {
      throw new Error(`${object.name}: unsupported custom property ${name}`);
    }
    value = definition.values[property.value];
  }
  if (value === undefined || value === '') {
    if (fallback !== undefined) {
      return fallback;
    }
    throw new Error(`${object.name}: missing property ${name}`);
  }
  return value;
}
function finite(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${name}: expected finite number`);
  }
  return value;
}
function optionalString(object, name) {
  const value = object.property(name);
  if (value === null || value === undefined || value === '') {
    return;
  }
  if (typeof value !== 'string') {
    throw new Error(`${object.name}: expected string property ${name}`);
  }
  return value;
}
function pointInside(layout, [x, z], name, inset = 0) {
  const b = layout.bounds;
  if (x < b.x0 + inset || z < b.z0 + inset || x > b.x1 - inset || z > b.z1 - inset) {
    throw new Error(`${name}: outside site bounds`);
  }
}
function objects(container, result = []) {
  for (let i = 0; i < container.layerCount; i++) {
    const layer = container.layerAt(i);
    if (layer.offset.x !== 0 || layer.offset.y !== 0) {
      throw new Error(`Layer offsets are not supported: ${layer.name}`);
    }
    if (layer.isGroupLayer) {
      objects(layer, result);
    } else if (layer.isObjectLayer) {
      result.push(...layer.objects);
    } else {
      throw new Error(`Only object/group layers are supported: ${layer.name}`);
    }
  }
  return result;
}
function objectInfo(object) {
  const name = object.name || `object ${object.id}`;
  const x = finite(object.x, `${name}.x`);
  const z = finite(object.y, `${name}.y`);
  const rotation = ((finite(object.rotation, `${name}.rotation`) % 360) + 360) % 360;
  const cls = object.className;
  if (!CLASSES.includes(cls)) {
    throw new Error(`${name}: unknown class ${cls}`);
  }
  if (cls !== 'building' && rotation !== 0) {
    throw new Error(`${name}: only buildings may rotate; spawn bearing is a property`);
  }
  return { name, x, z, rotation, cls };
}
function addBuilding(object, info, context) {
  const { name, x, z, rotation } = info;
  const { layout, pack, footprints } = context;
  if (object.shape !== MapObject.Rectangle) {
    throw new Error(`${name}: building must be a rectangle`);
  }
  const template = scalar(object, 'template');
  const definition = pack.templates.find((t) => t.id === template);
  if (!definition) {
    throw new Error(`${name}: unknown template ${template}`);
  }
  if (![0, 90, 180, 270].includes(rotation)) {
    throw new Error(`${name}: rotation must be a quarter turn`);
  }
  const w = definition.size[0] * 0.5;
  const d = definition.size[2] * 0.5;
  if (object.width !== w || object.height !== d) {
    throw new Error(`${name}: rectangle must match unrotated template ${w}x${d} m`);
  }
  // Tiled rotates around the rectangle's top-left pivot; Placement uses the rotated minimum.
  const offsets = { 0: [0, 0], 90: [-d, 0], 180: [-w, -d], 270: [0, -w] };
  const offset = offsets[rotation];
  const position = [x + offset[0], 0, z + offset[1]];
  const rect = buildingBounds({ position, rotation }, definition.size);
  position[1] = finite(scalar(object, 'elevation', defaultFoundation(layout, rect)), `${name}.elevation`);
  if (!position.every((v) => Number.isInteger(v * 2))) {
    throw new Error(`${name}: position must be snapped to 0.5 m`);
  }
  const storeys = scalar(object, 'storeys', 1);
  if (!Number.isInteger(storeys) || storeys < 1 || storeys > 8) {
    throw new Error(`${name}: storeys must be 1..8`);
  }
  pointInside(layout, [rect.x0, rect.z0], name);
  pointInside(layout, [rect.x1, rect.z1], name);
  if (footprints.some((r) => r.x0 < rect.x1 && rect.x0 < r.x1 && r.z0 < rect.z1 && rect.z0 < r.z1)) {
    throw new Error(`${name}: buildings overlap`);
  }
  footprints.push(rect);
  layout.buildings.push({ template, position, rotation, storeys });
}
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
  const lots = layout.buildings.map((building) =>
    lotOf(building, buildingBounds(building, pack.templates.find((t) => t.id === building.template).size)),
  );
  const position = [x, finite(scalar(object, 'elevation', standingHeight(layout, lots, x, z)), `${name}.elevation`), z];
  if (cls === 'player_spawn') {
    if (layout.player) {
      throw new Error('Exactly one player_spawn is required');
    }
    layout.player = { position, bearing: finite(scalar(object, 'bearing', 0), `${name}.bearing`) };
    return;
  }
  const type = scalar(object, 'zombie');
  if (!pack.zombies.some((t) => t.id === type)) {
    throw new Error(`${name}: unknown zombie type ${type}`);
  }
  const chance = finite(scalar(object, 'chance', 1), `${name}.chance`);
  if (chance < 0 || chance > 1) {
    throw new Error(`${name}: chance must be 0..1`);
  }
  const from = optionalString(object, 'window_from');
  const to = optionalString(object, 'window_to');
  if (to !== undefined && from === undefined) {
    throw new Error(`${name}: window_to requires window_from`);
  }
  const window = from === undefined ? undefined : { from, ...(to === undefined ? {} : { to }) };
  layout.shamblers.push({ type, position, chance, ...(window ? { window } : {}) });
}
function areaPoints(object, info) {
  const { name, x, z, cls } = info;
  if (object.shape !== (cls === 'woodland' ? MapObject.Polygon : MapObject.Polyline)) {
    throw new Error(`${name}: expected ${cls === 'woodland' ? 'polygon' : 'polyline'}`);
  }
  const points = object.polygon.map((p) => [finite(x + p.x, name), finite(z + p.y, name)]);
  if (points.length < (cls === 'woodland' ? 3 : 2)) {
    throw new Error(`${name}: not enough vertices`);
  }
  return points;
}
function addWoodland(object, info, { layout }) {
  const { name } = info;
  const points = areaPoints(object, info);
  const density = finite(scalar(object, 'density'), `${name}.density`);
  if (density < 0 || density > 1) {
    throw new Error(`${name}: density must be 0..1`);
  }
  for (const point of points) {
    pointInside(layout, point, name);
  }
  layout.woodlands.push({ polygon: points, density });
}
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
  const surface = scalar(object, 'surface', 'dirt');
  if (!['dirt', 'asphalt'].includes(surface)) {
    throw new Error(`${name}: surface must be dirt or asphalt`);
  }
  layout.tracks.push({ points, width, surface });
}
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
  const radii = [finite(object.width, name) / 2, finite(object.height, name) / 2];
  if (radii.some((r) => r <= 0)) {
    throw new Error(`${name}: hill radii must be positive`);
  }
  const centre = [x + radii[0], z + radii[1]];
  pointInside(layout, centre, name);
  layout.terrain.push({ kind: 'hill', centre, radii, rise });
}
export function exportLayout(map) {
  if (map.tileWidth !== 1 || map.tileHeight !== 1 || map.infinite || map.orientation !== TileMap.Orthogonal) {
    throw new Error('Use a finite orthogonal map with 1x1 tiles (one pixel = one metre)');
  }
  const id = scalar(map, 'id');
  if (!ID_PATTERN.test(id) || ['hamlet', 'forest', 'city'].includes(id)) {
    throw new Error('Invalid/reserved site id');
  }
  const ground = finite(scalar(map, 'ground'), 'ground');
  if (!Number.isInteger(ground * 2)) {
    throw new Error('ground must be snapped to 0.5 m');
  }
  const layout = {
    id,
    bounds: { x0: 0, z0: 0, x1: map.width, z1: map.height },
    ground,
    terrain: [],
    buildings: [],
    player: null,
    shamblers: [],
    woodlands: [],
    tracks: [],
  };
  const context = { layout, pack: content(), footprints: [] };
  const writers = {
    building: addBuilding,
    // biome-ignore lint/style/useNamingConvention: literal Tiled object class name.
    player_spawn: addSpawn,
    shambler: addSpawn,
    woodland: addWoodland,
    track: addTrack,
    ridge: addTerrain,
    hill: addTerrain,
  };
  const entries = objects(map).map((object) => ({ object, info: objectInfo(object) }));
  // Contextual defaults depend on all terrain and lots, never layer/object ordering.
  for (const classes of [['ridge', 'hill'], ['building'], ['player_spawn', 'shambler', 'woodland', 'track']]) {
    for (const { object, info } of entries) {
      if (classes.includes(info.cls)) {
        writers[info.cls](object, info, context);
      }
    }
  }
  if (!layout.player) {
    throw new Error('Exactly one player_spawn is required');
  }
  return { layouts: [layout] };
}
const format = {
  name: 'Deadvox site layout',
  extension: 'json',
  write(map, fileName) {
    try {
      writeJson(fileName, exportLayout(map));
      return '';
    } catch (error) {
      return String(error.message || error);
    }
  },
};
tiled.registerMapFormat('deadvox-site', format);

function member(name, type, value, propertyType) {
  return Object.assign({ name, type, value }, propertyType ? { propertyType } : {});
}
export function generatePropertyTypes() {
  const pack = content();
  const project = readJson(tiled.projectFilePath);
  const existing = project.propertyTypes || [];
  let nextId = Math.max(0, ...existing.map((type) => type.id)) + 1;
  const definitions = [
    {
      name: 'template_id',
      type: 'enum',
      storageType: 'string',
      values: pack.templates.map((t) => t.id).sort(),
      valuesAsFlags: false,
    },
    {
      name: 'zombie_type',
      type: 'enum',
      storageType: 'string',
      values: pack.zombies.map((t) => t.id).sort(),
      valuesAsFlags: false,
    },
    { name: 'building', members: [member('template', 'string', '', 'template_id'), member('storeys', 'int', 1)] },
    { name: 'player_spawn', members: [member('bearing', 'float', 0)] },
    {
      name: 'shambler',
      members: [
        member('zombie', 'string', '', 'zombie_type'),
        member('chance', 'float', 1),
        member('window_from', 'string', ''),
        member('window_to', 'string', ''),
      ],
    },
    { name: 'woodland', members: [member('density', 'float', 1)] },
    { name: 'track', members: [member('width', 'float', 3), member('surface', 'string', 'dirt')] },
    { name: 'ridge', members: [member('rise', 'float', 10), member('width', 'float', 40)] },
    { name: 'hill', members: [member('rise', 'float', 4)] },
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
