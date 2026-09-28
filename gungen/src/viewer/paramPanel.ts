// Pure logic for the viewer's parameter panel (item gungen5-param-panel):
// which params exist on the current model, what changing one produces, and
// how overrides round-trip through the URL. No DOM or three.js — main.ts
// wires this to the page. A change here only ever edits the Assembly; the
// caller re-runs resolve()/validate() the same way loading a fixture does
// (PROJECT.md: "no second code path").

import { type ResolvedParam, resolve } from '../core/resolve.ts';
import type { Assembly, Connection, Domain, PartInstance } from '../core/schema.ts';
import type { Choice, Template } from '../core/template.ts';

const partOf = (ref: string): string => ref.slice(0, ref.indexOf('.'));
const choiceValues = <T>(c: Choice<T>): readonly T[] => (Array.isArray(c) ? (c as readonly T[]) : [c as T]);

// ---- Listing ----

/** Where a param's current value came from, for display. */
export type ParamState =
  | { readonly kind: 'seed' }
  | { readonly kind: 'user' }
  | { readonly kind: 'inherited'; readonly from: string };

export interface ParamValueInfo {
  readonly value: string;
  /** Whether the current template's slot allows this value. `undefined` when there's no template (a fixture). */
  readonly permitted: boolean | undefined;
}

export interface PanelParam {
  readonly name: string;
  readonly current: string;
  /** Every value the family allows, per ParamSpec.values, not just the template's subset. */
  readonly values: readonly ParamValueInfo[];
  readonly state: ParamState;
}

export interface PanelPart {
  readonly id: string;
  readonly family: string;
  readonly present: true;
  /** True when the template can omit this part (slot chance < 1). Always false without a template. */
  readonly optional: boolean;
  readonly params: readonly PanelParam[];
}

/** An optional slot the template declares that the current model doesn't use. */
export interface PanelSlot {
  readonly id: string;
  readonly family: string;
  readonly present: false;
  readonly optional: true;
}

export type PanelEntry = PanelPart | PanelSlot;

const slotOf = (template: Template | undefined, id: string) => template?.slots.find((s) => s.id === id);

const permittedValues = (template: Template | undefined, partId: string, name: string): Set<string> | undefined => {
  const choice = slotOf(template, partId)?.params?.[name];
  return choice === undefined ? undefined : new Set(choiceValues(choice));
};

/** Where a resolved param's value came from, for the panel: seed, user override, or a neighbour. */
const paramState = (
  resolvedParam: ResolvedParam,
  explicit: string | undefined,
  seedExplicit: string | undefined,
): ParamState => {
  if (resolvedParam.source === 'inherited') {
    return { kind: 'inherited', from: resolvedParam.from! };
  }
  return explicit === seedExplicit ? { kind: 'seed' } : { kind: 'user' };
};

/**
 * Lists every part in `current` and every param its family declares (offering
 * every value the family allows), plus any optional template slot that isn't
 * present. `baseline` is what "seed" vs "user" is measured against: the
 * loaded fixture, or the assembly `generate()` produced for the seed, before
 * any panel edits.
 */
export const buildPanelModel = (
  current: Assembly,
  baseline: Assembly,
  domain: Domain,
  template: Template | undefined,
): readonly PanelEntry[] => {
  const resolved = resolve(current, domain);
  const entries: PanelEntry[] = [];

  for (const [id, inst] of Object.entries(current.parts)) {
    const family = domain.families[inst.family];
    const resolvedParams = resolved.params.get(id);
    if (!(family && resolvedParams)) {
      continue; // Unresolved (unknown family, bad param, …): already reported under `structure`.
    }
    const params: PanelParam[] = Object.entries(family.params).map(([name, spec]) => {
      const r = resolvedParams[name]!;
      const values = spec.values.map((value) => ({
        value,
        permitted: template ? (permittedValues(template, id, name)?.has(value) ?? true) : undefined,
      }));
      const state = paramState(r, current.parts[id]?.params?.[name], baseline.parts[id]?.params?.[name]);
      return { name, current: r.value, values, state };
    });
    entries.push({ id, family: inst.family, present: true, optional: (slotOf(template, id)?.chance ?? 1) < 1, params });
  }

  if (template) {
    for (const slot of template.slots) {
      if (slot.id in current.parts || (slot.chance ?? 1) >= 1) {
        continue;
      }
      entries.push({ id: slot.id, family: slot.family, present: false, optional: true });
    }
  }
  return entries;
};

// ---- Editing ----

/** Sets one part's param to an explicit value. */
export const setParam = (assembly: Assembly, part: string, name: string, value: string): Assembly => {
  const inst = assembly.parts[part];
  if (!inst) {
    return assembly;
  }
  return { ...assembly, parts: { ...assembly.parts, [part]: { ...inst, params: { ...inst.params, [name]: value } } } };
};

/** Clears a user override, restoring the seed's (baseline's) value for that param. */
export const clearParam = (assembly: Assembly, baseline: Assembly, part: string, name: string): Assembly => {
  const inst = assembly.parts[part];
  if (!inst) {
    return assembly;
  }
  const seedValue = baseline.parts[part]?.params?.[name];
  const params: Record<string, string> = { ...inst.params };
  if (seedValue === undefined) {
    delete params[name];
  } else {
    params[name] = seedValue;
  }
  return { ...assembly, parts: { ...assembly.parts, [part]: { ...inst, params } } };
};

/**
 * Turns an optional slot on or off. Off removes the part and every
 * connection touching it. On adds the part (default params: unset, same as
 * a template leaving them out) and every connection the template declares
 * between it and parts already present, picking the first available `from`
 * option and slot 0 for a slotted one — a deterministic instantiation the
 * user can then adjust part by part, not a re-run of the seeded generator.
 */
export const setSlotPresent = (assembly: Assembly, template: Template, slotId: string, present: boolean): Assembly => {
  if (!present) {
    if (!(slotId in assembly.parts)) {
      return assembly;
    }
    const parts = { ...assembly.parts };
    delete parts[slotId];
    return {
      ...assembly,
      parts,
      connections: assembly.connections.filter((c) => partOf(c.from) !== slotId && partOf(c.to) !== slotId),
    };
  }
  if (slotId in assembly.parts) {
    return assembly;
  }
  const slot = template.slots.find((s) => s.id === slotId);
  if (!slot) {
    return assembly;
  }
  const parts: Record<string, PartInstance> = { ...assembly.parts, [slotId]: { family: slot.family } };
  const added: Connection[] = template.connections
    .filter((t) => {
      const froms = choiceValues(t.from).map(partOf);
      return (
        (partOf(t.to) === slotId || froms.includes(slotId)) && partOf(t.to) in parts && froms.some((f) => f in parts)
      );
    })
    .map((t) => {
      const from = choiceValues(t.from).find((f) => partOf(f) in parts)!;
      const conn: Connection = { from, to: t.to };
      return t.slot === undefined ? conn : { ...conn, slot: 0 };
    });
  return { ...assembly, parts, connections: [...assembly.connections, ...added] };
};

// ---- URL round-trip ----

export interface Overrides {
  /** part -> param name -> value. */
  readonly params: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /** part -> forced presence, only where it differs from the baseline. */
  readonly presence: Readonly<Record<string, boolean>>;
}

export const EMPTY_OVERRIDES: Overrides = { params: {}, presence: {} };

export const hasOverrides = (o: Overrides): boolean =>
  Object.keys(o.params).length > 0 || Object.keys(o.presence).length > 0;

/** Everything in `current` that differs from `baseline`: param overrides and presence toggles. */
export const diffOverrides = (baseline: Assembly, current: Assembly): Overrides => {
  const params: Record<string, Record<string, string>> = {};
  const presence: Record<string, boolean> = {};
  for (const id of new Set([...Object.keys(baseline.parts), ...Object.keys(current.parts)])) {
    const inBaseline = id in baseline.parts;
    const inCurrent = id in current.parts;
    if (inBaseline !== inCurrent) {
      presence[id] = inCurrent;
    }
    if (!inCurrent) {
      continue;
    }
    const baseParams = baseline.parts[id]?.params ?? {};
    const curParams = current.parts[id]?.params ?? {};
    for (const name of new Set([...Object.keys(baseParams), ...Object.keys(curParams)])) {
      const value = curParams[name];
      if (value !== undefined && value !== baseParams[name]) {
        params[id] ??= {};
        params[id][name] = value;
      }
    }
  }
  return { params, presence };
};

/** `part.param:value` and `part:on|off` tokens, comma-separated — the `set=` query value. */
export const serializeOverrides = (o: Overrides): string =>
  [
    ...Object.entries(o.presence).map(([part, present]) => `${part}:${present ? 'on' : 'off'}`),
    ...Object.entries(o.params).flatMap(([part, params]) =>
      Object.entries(params).map(([name, value]) => `${part}.${name}:${value}`),
    ),
  ].join(',');

export const parseOverrides = (text: string): Overrides => {
  const params: Record<string, Record<string, string>> = {};
  const presence: Record<string, boolean> = {};
  for (const token of text.split(',')) {
    if (!token) {
      continue;
    }
    const sep = token.indexOf(':');
    if (sep < 0) {
      continue;
    }
    const key = token.slice(0, sep);
    const value = token.slice(sep + 1);
    const dot = key.indexOf('.');
    if (dot < 0) {
      presence[key] = value === 'on';
    } else {
      const part = key.slice(0, dot);
      params[part] ??= {};
      params[part][key.slice(dot + 1)] = value;
    }
  }
  return { params, presence };
};

/** Rebuilds an edited assembly from a baseline plus a set of overrides. */
export const applyOverrides = (baseline: Assembly, template: Template | undefined, overrides: Overrides): Assembly => {
  let assembly = baseline;
  if (template) {
    for (const [part, present] of Object.entries(overrides.presence)) {
      assembly = setSlotPresent(assembly, template, part, present);
    }
  }
  for (const [part, params] of Object.entries(overrides.params)) {
    for (const [name, value] of Object.entries(params)) {
      assembly = setParam(assembly, part, name, value);
    }
  }
  return assembly;
};
