import type { Assembly, Domain, PartDef, PartFamily } from '@skelly/engine/assembly/schema.ts';
import { validate } from '@skelly/engine/assembly/validate.ts';
import { applyPoint, scale, type Vec3 } from '@skelly/engine/foundation/math.ts';
import { localSolidBounds } from '@skelly/engine/shapes/geometry.ts';
import type { Solid } from '@skelly/engine/shapes/solid.ts';
import { MATERIALS } from '@skelly/thing-core/materials';
import { ModelPointSchema, type NeutralModel, NeutralModelSchema } from '@skelly/thing-core/schema';
import { singlePart } from '@skelly/thing-core/single-part';
import type { Palette } from '@skelly/thing-export/exportTypes.ts';
import {
  array,
  boolean,
  check,
  finite,
  type InferOutput,
  integer,
  minValue,
  nonEmpty,
  number,
  optional,
  parse,
  picklist,
  pipe,
  record,
  strictObject,
  string,
} from 'valibot';
import content from '../items.json' with { type: 'json' };
import { coil } from './families/coil.ts';
import { fuse } from './families/fuse.ts';
import { compass, keycard, key as keyFamily, lighter, matchbox } from './families/handheld.ts';
import { arm, base, shade } from './families/lamp.ts';
import { carton, vessel } from './families/package.ts';
import { ring } from './families/ring.ts';
import { spool } from './families/spool.ts';

const positive = pipe(number(), finite(), minValue(Number.MIN_VALUE));
const name = pipe(string(), nonEmpty());
const material = pipe(
  name,
  check((id) => Object.hasOwn(MATERIALS, id), 'unknown shared material'),
);
const PortSchema = strictObject({
  id: name,
  mount: name,
  gender: picklist(['male', 'female']),
  pos: ModelPointSchema,
  normal: ModelPointSchema,
  up: ModelPointSchema,
  required: boolean(),
});
const PartSchema = strictObject({
  id: name,
  family: name,
  params: record(name, string()),
  massKg: positive,
  finish: record(name, material),
  ports: array(PortSchema),
});
const ItemSchema = strictObject({
  id: name,
  parts: pipe(
    array(PartSchema),
    nonEmpty(),
    check((parts) => new Set(parts.map(({ id }) => id)).size === parts.length, 'duplicate part id'),
  ),
  connections: array(strictObject({ from: name, to: name })),
  handling: optional(
    strictObject({
      part: name,
      solid: name,
      fraction: pipe(
        ModelPointSchema,
        check((point) => point.every((value) => value >= 0 && value <= 1), 'grip fraction outside solid'),
      ),
      turn: ModelPointSchema,
      hold: NeutralModelSchema.entries.hold,
      roll: NeutralModelSchema.entries.roll,
    }),
  ),
});
const CatalogueSchema = strictObject({
  units: strictObject({ metresPerUnit: positive, grid: positive, bevel: pipe(number(), finite(), minValue(0)) }),
  facets: pipe(positive, integer(), minValue(3)),
  defaultMaterial: material,
  items: pipe(
    array(ItemSchema),
    nonEmpty(),
    check((items) => new Set(items.map(({ id }) => id)).size === items.length, 'duplicate item id'),
  ),
});
export type ToolItem = InferOutput<typeof ItemSchema>;
type ToolPart = ToolItem['parts'][number];
const builders = {
  ring,
  spool,
  coil,
  fuse,
  compass,
  lighter,
  matchbox,
  key: keyFamily,
  keycard,
  cylinder: base,
  arm,
  shade,
  carton,
  vessel,
} satisfies Record<string, (params: Readonly<Record<string, string>>) => readonly Solid[]>;
const buildPart = (part: ToolPart, params = part.params): PartDef => {
  if (!Object.hasOwn(builders, part.family)) {
    throw new Error(`Unknown thing family ${part.family}`);
  }
  const solids = builders[part.family as keyof typeof builders](params);
  for (const solid of solids) {
    if (!(solid.slot && Object.hasOwn(part.finish, solid.slot))) {
      throw new Error(`Missing finish for ${part.id}/${solid.id}`);
    }
  }
  return { family: part.family, solids, ports: part.ports, axes: [], keepOuts: [] };
};
export const loadCatalogue = (value: unknown = content) => {
  const data = parse(CatalogueSchema, value);
  for (const item of data.items) {
    for (const part of item.parts) {
      buildPart(part);
    }
  }
  return data;
};
export const catalogue = loadCatalogue();
export const palette: Palette = {
  familyColors: {},
  specialColors: {},
  materials: MATERIALS,
  fallbackColor: MATERIALS[catalogue.defaultMaterial]!.colour,
  fallbackFinish: MATERIALS[catalogue.defaultMaterial]!.finish,
};

export const buildItem = (item: ToolItem) => {
  const first = item.parts[0]!;
  let assembly: Assembly;
  let domain: Domain;
  let masses: Readonly<Record<string, number>>;
  if (item.parts.length === 1) {
    const wrapped = singlePart({ id: first.id, part: buildPart(first), massKg: first.massKg, units: catalogue.units });
    assembly = {
      ...wrapped.assembly,
      name: item.id,
      parts: { [first.id]: { family: first.family, appearance: { finish: first.finish } } },
      connections: item.connections,
    };
    ({ domain, masses } = wrapped);
  } else {
    const families: Record<string, PartFamily> = Object.fromEntries(
      item.parts.map((part) => [
        part.id,
        {
          name: part.family,
          params: Object.fromEntries(
            Object.entries(part.params).map(([key, value]) => [key, { values: [value], default: value }]),
          ),
          build: (params: Readonly<Record<string, string>>) => ({ ...buildPart(part, params), family: part.id }),
        },
      ]),
    );
    assembly = {
      name: item.id,
      root: first.id,
      parts: Object.fromEntries(
        item.parts.map((part) => [
          part.id,
          { family: part.id, params: part.params, appearance: { finish: part.finish } },
        ]),
      ),
      connections: item.connections,
    };
    domain = { name: item.id, units: catalogue.units, axisRules: [], families };
    masses = Object.fromEntries(item.parts.map((part) => [part.id, part.massKg]));
  }
  const report = validate(assembly, domain);
  if (report.issues.length > 0) {
    throw new Error(`${item.id}: ${JSON.stringify(report.issues)}`);
  }
  let handling: Pick<NeutralModel, 'grip' | 'hold' | 'roll'> = {};
  if (item.handling) {
    const datum = item.handling;
    const solid = report.resolved.defs.get(datum.part)?.solids.find(({ id }) => id === datum.solid);
    const placed = report.resolved.placed.get(datum.part);
    if (!(solid && placed)) {
      throw new Error(`${item.id}: missing handling geometry ${datum.part}/${datum.solid}`);
    }
    const [min, max] = localSolidBounds(solid);
    const point = min.map((value, axis) => value + datum.fraction[axis]! * (max[axis]! - value)) as unknown as Vec3;
    handling = {
      grip: { at: scale(applyPoint(placed, point), catalogue.units.metresPerUnit), turn: datum.turn },
      hold: datum.hold,
      roll: datum.roll,
    };
  }
  return { report, masses, handling };
};
