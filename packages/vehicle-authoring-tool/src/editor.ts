import type { Registry } from '../../deadvox/src/core/content.ts';
import { vehicleContentIssues } from '../../deadvox/src/core/vehicleBlueprint.ts';
import {
  exportVehicleBlueprint,
  type VehicleBlueprintExport,
  type VehicleBlueprintInput,
  type VehicleFittingExport,
} from './export.ts';

export type Fitting = VehicleFittingExport;
export type Vec3 = Fitting['at'];
export type Service = NonNullable<Fitting['service']>;

/** Which side's fitting a reference to a replaced fitting moves to. */
export type Side = 'near' | 'far' | 'both';

/** What a pair does with one reference of the original: kept on both twins, or the far twin rests on another id. */
export type PairSupport = { readonly kind: 'shared' } | { readonly kind: 'paired'; readonly far: string };

export interface PairChoices {
  readonly base: string;
  /** One entry for each id in the original's `supportedBy`. */
  readonly supports: Readonly<Record<string, PairSupport>>;
  /** One entry for each other fitting that rests on the original. */
  readonly outside: Readonly<Record<string, Side>>;
  /** Required exactly when the original has a `service`. */
  readonly serviceNames?: { readonly near: string; readonly far: string };
}

const indexOf = (blueprint: VehicleBlueprintInput, id: string): number => {
  const index = blueprint.fittings.findIndex((fitting) => fitting.id === id);
  if (index < 0) {
    throw new Error(`No fitting "${id}"`);
  }
  return index;
};

const withFittings = (blueprint: VehicleBlueprintInput, fittings: readonly Fitting[]): VehicleBlueprintInput => ({
  ...blueprint,
  fittings,
});

const replaceOne = (blueprint: VehicleBlueprintInput, id: string, next: (fitting: Fitting) => Fitting) => {
  const index = indexOf(blueprint, id);
  return withFittings(
    blueprint,
    blueprint.fittings.map((fitting, i) => (i === index ? next(fitting) : fitting)),
  );
};

export const addFitting = (
  blueprint: VehicleBlueprintInput,
  { id, part, at = [0, 0, 0] }: { id: string; part: string; at?: Vec3 },
): VehicleBlueprintInput => {
  if (id === '' || part === '') {
    throw new Error('A fitting needs an id and a part');
  }
  if (blueprint.fittings.some((fitting) => fitting.id === id)) {
    throw new Error(`Fitting "${id}" already exists`);
  }
  return withFittings(blueprint, [...blueprint.fittings, { id, part, at, supportedBy: [] }]);
};

/** Others may still rest on it; that is reported as a content issue and blocks export. */
export const removeFitting = (blueprint: VehicleBlueprintInput, id: string): VehicleBlueprintInput => {
  indexOf(blueprint, id);
  return withFittings(
    blueprint,
    blueprint.fittings.filter((fitting) => fitting.id !== id),
  );
};

export const setAt = (blueprint: VehicleBlueprintInput, id: string, at: Vec3): VehicleBlueprintInput =>
  replaceOne(blueprint, id, (fitting) => ({ ...fitting, at }));

/** Sets or clears `mirror` on this one record; `at` stays, and so does every other fitting. */
export const toggleMirror = (blueprint: VehicleBlueprintInput, id: string): VehicleBlueprintInput =>
  replaceOne(blueprint, id, ({ mirror, ...fitting }) => (mirror ? fitting : { ...fitting, mirror: true }));

export const setSupportedBy = (
  blueprint: VehicleBlueprintInput,
  id: string,
  supportedBy: readonly string[],
): VehicleBlueprintInput => replaceOne(blueprint, id, (fitting) => ({ ...fitting, supportedBy }));

/** `undefined` clears the key. */
export const setCargo = (
  blueprint: VehicleBlueprintInput,
  id: string,
  cargo: Fitting['cargo'],
): VehicleBlueprintInput =>
  replaceOne(blueprint, id, ({ cargo: _old, ...fitting }) => (cargo === undefined ? fitting : { ...fitting, cargo }));

/** `undefined` clears the key. */
export const setService = (
  blueprint: VehicleBlueprintInput,
  id: string,
  service: Service | undefined,
): VehicleBlueprintInput =>
  replaceOne(blueprint, id, ({ service: _old, ...fitting }) =>
    service === undefined ? fitting : { ...fitting, service },
  );

export const renameFitting = (blueprint: VehicleBlueprintInput, id: string, to: string): VehicleBlueprintInput => {
  indexOf(blueprint, id);
  if (to === '') {
    throw new Error('A fitting needs an id');
  }
  if (to !== id && blueprint.fittings.some((fitting) => fitting.id === to)) {
    throw new Error(`Fitting "${to}" already exists`);
  }
  const rename = (name: string) => (name === id ? to : name);
  return withFittings(
    blueprint,
    blueprint.fittings.map((fitting) => ({
      ...fitting,
      id: rename(fitting.id),
      supportedBy: fitting.supportedBy.map(rename),
    })),
  );
};

/**
 * Replaces one unmirrored fitting with `<base>_near` and `<base>_far`, as `packages/deadvox/src/content/base/vehicles.jsonnet`, `pair` does.
 * Every choice is the author's: nothing is inferred from names, and a missing choice refuses the operation.
 */
export const createMirroredPair = (
  blueprint: VehicleBlueprintInput,
  id: string,
  { base, supports, outside, serviceNames }: PairChoices,
): VehicleBlueprintInput => {
  const original = blueprint.fittings[indexOf(blueprint, id)]!;
  if (original.mirror) {
    throw new Error(`Fitting "${id}" is mirrored; clear its mirror first`);
  }
  const [nearId, farId] = [`${base}_near`, `${base}_far`];
  if (base === '' || blueprint.fittings.some((fitting) => fitting.id !== id && [nearId, farId].includes(fitting.id))) {
    throw new Error(`A pair named "${base}" needs a base whose twin ids are free`);
  }
  for (const support of original.supportedBy) {
    const choice = supports[support];
    if (!choice || (choice.kind === 'paired' && choice.far === '')) {
      throw new Error(`Choose shared or paired for "${support}"`);
    }
  }
  const resting = blueprint.fittings.filter((fitting) => fitting.id !== id && fitting.supportedBy.includes(id));
  for (const { id: other } of resting) {
    if (!outside[other]) {
      throw new Error(`Choose a side for "${other}", which rests on "${id}"`);
    }
  }
  if (original.service && !(serviceNames?.near && serviceNames.far)) {
    throw new Error('Name the service on each side');
  }

  const side = (which: 'near' | 'far'): Fitting => {
    const { service, ...rest } = original;
    return {
      ...rest,
      id: which === 'near' ? nearId : farId,
      // `0 - z`, not `-z`: a centred twin stays 0, because -0 doesn't survive a JSON round trip.
      // biome-ignore lint/complexity/noImplicitCoercions: `-z` would give -0 for a centred twin.
      at: which === 'near' ? original.at : [original.at[0], original.at[1], 0 - original.at[2]],
      supportedBy: original.supportedBy.map((support) => {
        const choice = supports[support]!;
        return which === 'far' && choice.kind === 'paired' ? choice.far : support;
      }),
      ...(service ? { service: { ...service, name: serviceNames![which] } } : {}),
      ...(which === 'far' ? { mirror: true as const } : {}),
    };
  };

  const twins = [side('near'), side('far')];
  const retarget = (fitting: Fitting): Fitting => {
    const choice = outside[fitting.id];
    if (!(choice && fitting.supportedBy.includes(id))) {
      return fitting;
    }
    const to = { near: [nearId], far: [farId], both: [nearId, farId] }[choice];
    return { ...fitting, supportedBy: fitting.supportedBy.flatMap((support) => (support === id ? to : [support])) };
  };
  return withFittings(
    blueprint,
    blueprint.fittings.flatMap((fitting) => (fitting.id === id ? twins : [retarget(fitting)])),
  );
};

/** The form Save downloads for the author to hand-merge into the Jsonnet source. */
export const saveBlueprint = (blueprint: VehicleBlueprintInput): string => JSON.stringify(blueprint, null, 2);

export const loadSavedBlueprint = (text: string): VehicleBlueprintInput => JSON.parse(text) as VehicleBlueprintInput;

/** Deadvox's content issues for the edited blueprint, in place of the one it was loaded from. */
export const blueprintIssues = (registry: Registry, blueprint: VehicleBlueprintInput): string[] =>
  vehicleContentIssues({
    ...registry,
    // The registry's own type brands sim seconds, which only its schema parse produces.
    vehicleBlueprints: new Map([[blueprint.id, blueprint]]) as unknown as Registry['vehicleBlueprints'],
  })
    .filter((issue) => issue.section === 'vehicleBlueprints' && issue.id === blueprint.id)
    .map(({ path, message }) => `${path}: ${message}`);

/** Export is refused while the blueprint has issues. */
export const checkedExport = (registry: Registry, blueprint: VehicleBlueprintInput): VehicleBlueprintExport => {
  const issues = blueprintIssues(registry, blueprint);
  if (issues.length > 0) {
    throw new Error(`Export refused:\n${issues.join('\n')}`);
  }
  return exportVehicleBlueprint(blueprint);
};
