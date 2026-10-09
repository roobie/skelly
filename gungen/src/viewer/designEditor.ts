// Pure design-editor state transitions and persistence. No DOM or rendering.
import type { Design, DesignLocks, DesignOrigin, DesignStatus } from '@skelly/engine/core/design.ts';
import { loadDesignValue } from '@skelly/engine/core/designLoader.ts';
import { resolve } from '@skelly/engine/core/resolve.ts';
import type { Assembly, Domain, PartInstance } from '@skelly/engine/core/schema.ts';
import type { ParamChoice, Template } from '@skelly/engine/core/template.ts';
import { GUN_PREFABS, type PrefabCatalogue, type PrefabCatalogueEntry } from '../gun/prefabs.ts';
import { clearParam, type EditResult, setParam, setSlotPresent } from './paramPanel.ts';

export interface DesignEditorState {
  readonly template: Template | undefined;
  readonly assembly: Assembly;
  readonly locks: DesignLocks;
  readonly status: DesignStatus;
  readonly calibre?: string;
  readonly finish?: Readonly<Record<string, string>>;
  readonly origin?: DesignOrigin;
  /** Explicit values already present in a design file are all deliberate choices. */
  readonly chosenParams: Readonly<Record<string, readonly string[]>>;
}

type DesignEditorError = 'missing-template' | 'missing-part' | 'family-not-allowed';
export type DesignEditorResult =
  | { readonly ok: true; readonly state: DesignEditorState }
  | {
      readonly ok: false;
      readonly reason: DesignEditorError;
    };

const EMPTY_LOCKS: DesignLocks = { params: {}, optionalParts: [] };
const own = (record: Readonly<Record<string, unknown>>, key: string): boolean => Object.hasOwn(record, key);
const paramReference = (choice: ParamChoice | undefined): boolean =>
  choice !== undefined && typeof choice === 'object' && !Array.isArray(choice) && 'fromSlot' in choice;
const includeNames = (names: readonly string[], ...added: readonly string[]): readonly string[] =>
  [...new Set([...names, ...added])].sort();
const excludeName = (names: readonly string[], name: string): readonly string[] =>
  names.filter((item) => item !== name);
const withParamNames = (
  values: Readonly<Record<string, readonly string[]>>,
  part: string,
  names: readonly string[],
): Readonly<Record<string, readonly string[]>> => {
  const next = { ...values };
  if (names.length === 0) {
    delete next[part];
  } else {
    next[part] = names;
  }
  return next;
};

/** State for a seed, fixture, or upload. A template-less build can be viewed, but not saved as a design. */
export const createEditorState = (
  template: Template | undefined,
  assembly: Assembly,
  options: {
    readonly status?: DesignStatus;
    readonly calibre?: string;
    readonly locks?: DesignLocks;
    readonly finish?: Readonly<Record<string, string>>;
    readonly origin?: DesignOrigin;
  } = {},
): DesignEditorState => {
  const { calibre } = options;
  return {
    template,
    assembly,
    locks: options.locks ?? EMPTY_LOCKS,
    status: options.status ?? 'draft',
    ...(calibre === undefined ? {} : { calibre }),
    ...(options.finish ? { finish: options.finish } : {}),
    ...(options.origin ? { origin: options.origin } : {}),
    chosenParams: {},
  };
};

/** Converts a loaded design to editable viewer state without materializing implicit params. */
export const editorStateFromDesign = (design: Design, template: Template | undefined): DesignEditorState => ({
  template,
  assembly: design.assembly,
  locks: design.locks,
  status: design.status,
  ...(design.calibre === undefined ? {} : { calibre: design.calibre }),
  ...(design.finish ? { finish: design.finish } : {}),
  ...(design.origin ? { origin: design.origin } : {}),
  chosenParams: Object.fromEntries(
    Object.entries(design.assembly.parts).map(([id, part]) => [id, Object.keys(part.params ?? {})]),
  ),
});

export const withEditorAssembly = (state: DesignEditorState, assembly: Assembly): DesignEditorState => ({
  ...state,
  assembly,
});

export const withEditorStatus = (state: DesignEditorState, status: DesignStatus): DesignEditorState => ({
  ...state,
  status,
});

/** Toggles an explicit parameter lock; locking an implicit value first preserves its resolved value. */
export const toggleParamLock = (
  state: DesignEditorState,
  domain: Domain,
  partId: string,
  name: string,
): DesignEditorState => {
  const existing = state.locks.params[partId] ?? [];
  const locking = !existing.includes(name);
  const { assembly: initialAssembly, chosenParams: initialChosenParams } = state;
  let assembly = initialAssembly;
  let chosenParams = initialChosenParams;
  if (locking && assembly.parts[partId] && !own(assembly.parts[partId]!.params ?? {}, name)) {
    const value = resolve(assembly, domain).params.get(partId)?.[name]?.value;
    if (value !== undefined) {
      assembly = {
        ...assembly,
        parts: {
          ...assembly.parts,
          [partId]: { ...assembly.parts[partId]!, params: { ...assembly.parts[partId]!.params, [name]: value } },
        },
      };
      chosenParams = { ...chosenParams, [partId]: includeNames(chosenParams[partId] ?? [], name) };
    }
  }
  const nextNames = locking ? includeNames(existing, name) : excludeName(existing, name);
  return {
    ...state,
    assembly,
    chosenParams,
    locks: { ...state.locks, params: withParamNames(state.locks.params, partId, nextNames) },
  };
};

/** Toggles whether an optional template slot's present/absent choice is fixed. */
export const toggleOptionalPartLock = (state: DesignEditorState, slotId: string): DesignEditorState => {
  const existing = state.locks.optionalParts;
  const optionalParts = existing.includes(slotId) ? excludeName(existing, slotId) : includeNames(existing, slotId);
  return { ...state, locks: { ...state.locks, optionalParts } };
};

/** Edits a chosen value and detaches a prefab if this is one of its fixed params. */
export const editParam = (
  state: DesignEditorState,
  domain: Domain,
  edit: { readonly partId: string; readonly name: string; readonly value: string },
  prefabs: PrefabCatalogue = GUN_PREFABS,
): { readonly state: DesignEditorState } & EditResult => {
  const { partId, name, value } = edit;
  const { assembly, dropped } = setParam(state.assembly, domain, { part: partId, name }, value);
  const part = assembly.parts[partId];
  const reference = part?.prefab;
  const entry =
    reference && prefabs.find((candidate) => candidate.id === reference.id && candidate.version === reference.version);
  const nextPart: PartInstance | undefined =
    part && entry && own(entry.fixedParams, name)
      ? (({ prefab: _prefab, ...withoutPrefab }) => withoutPrefab)(part)
      : part;
  const nextAssembly =
    nextPart && nextPart !== part ? { ...assembly, parts: { ...assembly.parts, [partId]: nextPart } } : assembly;
  return {
    state: {
      ...state,
      assembly: nextAssembly,
      chosenParams: { ...state.chosenParams, [partId]: includeNames(state.chosenParams[partId] ?? [], name) },
    },
    assembly: nextAssembly,
    dropped,
  };
};

/** Clears a param to its baseline value and removes it from the explicit-choice set. */
export const clearEditorParam = (
  state: DesignEditorState,
  domain: Domain,
  edit: { readonly baseline: Assembly; readonly partId: string; readonly name: string },
  prefabs: PrefabCatalogue = GUN_PREFABS,
): { readonly state: DesignEditorState } & EditResult => {
  const { baseline, partId, name } = edit;
  const { assembly, dropped } = clearParam(state.assembly, domain, baseline, { part: partId, name });
  const original = state.assembly.parts[partId];
  const reference = original?.prefab;
  const entry =
    reference && prefabs.find((candidate) => candidate.id === reference.id && candidate.version === reference.version);
  const part = assembly.parts[partId];
  const nextPart: PartInstance | undefined =
    part && entry && own(entry.fixedParams, name)
      ? (({ prefab: _prefab, ...withoutPrefab }) => withoutPrefab)(part)
      : part;
  const nextAssembly =
    nextPart && nextPart !== part ? { ...assembly, parts: { ...assembly.parts, [partId]: nextPart } } : assembly;
  return {
    state: {
      ...state,
      assembly: nextAssembly,
      chosenParams: withParamNames(state.chosenParams, partId, excludeName(state.chosenParams[partId] ?? [], name)),
    },
    assembly: nextAssembly,
    dropped,
  };
};

/** Adds/removes an optional part via its template, preserving locks only for the slot's presence. */
export const setOptionalPart = (state: DesignEditorState, slotId: string, present: boolean): DesignEditorState => {
  if (!state.template) {
    return state;
  }
  const wasPresent = own(state.assembly.parts, slotId);
  const assembly = setSlotPresent(state.assembly, state.template, slotId, present);
  const locks =
    !present && wasPresent ? { ...state.locks, params: withParamNames(state.locks.params, slotId, []) } : state.locks;
  const chosenParams = !present && wasPresent ? withParamNames(state.chosenParams, slotId, []) : state.chosenParams;
  return { ...state, assembly, locks, chosenParams };
};

/** The picker source is filtered by PartInstance.family (the registry key), not the visual role. */
export const availablePrefabs = (
  state: DesignEditorState,
  partId: string,
  prefabs: PrefabCatalogue = GUN_PREFABS,
): readonly PrefabCatalogueEntry[] => {
  const family = state.assembly.parts[partId]?.family;
  return family ? prefabs.filter((prefab) => prefab.family === family) : [];
};

/** Choosing a prefab copies all fixed params and records its versioned identity. */
export const choosePrefab = (
  state: DesignEditorState,
  partId: string,
  prefab: PrefabCatalogueEntry,
): DesignEditorResult => {
  const part = state.assembly.parts[partId];
  if (!part) {
    return { ok: false, reason: 'missing-part' };
  }
  if (part.family !== prefab.family) {
    return { ok: false, reason: 'family-not-allowed' };
  }
  const slot = state.template?.slots.find((candidate) => candidate.id === partId);
  if (slot && slot.family !== prefab.family) {
    return { ok: false, reason: 'family-not-allowed' };
  }
  const params = { ...part.params, ...prefab.fixedParams };
  const assembly = {
    ...state.assembly,
    parts: {
      ...state.assembly.parts,
      [partId]: { ...part, params, prefab: { id: prefab.id, version: prefab.version } },
    },
  };
  return {
    ok: true,
    state: {
      ...state,
      assembly,
      chosenParams: {
        ...state.chosenParams,
        [partId]: includeNames(state.chosenParams[partId] ?? [], ...Object.keys(prefab.fixedParams)),
      },
    },
  };
};

/** Clears only the catalogue identity; the current copied params remain deliberate values. */
export const clearPrefab = (state: DesignEditorState, partId: string): DesignEditorState => {
  const part = state.assembly.parts[partId];
  if (!part?.prefab) {
    return state;
  }
  const { prefab: _prefab, ...withoutPrefab } = part;
  return {
    ...state,
    assembly: { ...state.assembly, parts: { ...state.assembly.parts, [partId]: withoutPrefab } },
  };
};

/** Family changes are only legal when they retain the template slot's declared family. */
export const setPartFamily = (state: DesignEditorState, partId: string, family: string): DesignEditorResult => {
  const part = state.assembly.parts[partId];
  if (!part) {
    return { ok: false, reason: 'missing-part' };
  }
  const slot = state.template?.slots.find((candidate) => candidate.id === partId);
  if (!slot || slot.family !== family) {
    return { ok: false, reason: 'family-not-allowed' };
  }
  return {
    ok: true,
    state: {
      ...state,
      assembly: { ...state.assembly, parts: { ...state.assembly.parts, [partId]: { ...part, family } } },
    },
  };
};

const prefabFixesParam = (part: PartInstance, name: string): boolean => {
  const reference = part.prefab;
  const entry =
    reference && GUN_PREFABS.find((prefab) => prefab.id === reference.id && prefab.version === reference.version);
  return Boolean(entry && own(entry.fixedParams, name));
};

interface ChosenPartContext {
  readonly state: DesignEditorState;
  readonly domain: Domain;
  readonly resolved: ReturnType<typeof resolve>;
  readonly id: string;
  readonly part: PartInstance;
}

const keepChosenParam = (
  { state, domain, resolved, id, part }: ChosenPartContext,
  name: string,
  value: string,
): boolean => {
  if ((state.locks.params[id] ?? []).includes(name) || (state.chosenParams[id] ?? []).includes(name)) {
    return true;
  }
  if (prefabFixesParam(part, name)) {
    return true;
  }
  const choice = state.template?.slots.find((slot) => slot.id === id)?.params?.[name];
  if (choice !== undefined) {
    return !paramReference(choice);
  }
  const spec = domain.families[part.family]?.params[name];
  const resolvedParam = resolved.params.get(id)?.[name];
  return !(
    spec &&
    (value === spec.default || (resolvedParam?.source === 'inherited' && resolvedParam.value === value))
  );
};

const chosenPart = (context: ChosenPartContext): PartInstance => {
  const { part } = context;
  const params = Object.fromEntries(
    Object.entries(part.params ?? {}).filter(([name, value]) => keepChosenParam(context, name, value)),
  );
  if (Object.keys(params).length > 0) {
    return { ...part, params };
  }
  const { params: _params, ...withoutParams } = part;
  return withoutParams;
};

const chosenAssembly = (state: DesignEditorState, domain: Domain): Assembly => {
  const resolved = resolve(state.assembly, domain);
  const parts = Object.fromEntries(
    Object.entries(state.assembly.parts).map(([id, part]) => [id, chosenPart({ state, domain, resolved, id, part })]),
  );
  const { expect: _expect, ...assembly } = state.assembly;
  return { ...assembly, parts };
};

export type SaveDesignResult =
  | { readonly ok: true; readonly design: Design; readonly text: string }
  | { readonly ok: false; readonly reason: DesignEditorError };

/** Produces the design-file contract; implicit defaults and inherited values remain absent. */
export const saveDesign = (state: DesignEditorState, domain: Domain): SaveDesignResult => {
  if (!state.template) {
    return { ok: false, reason: 'missing-template' };
  }
  for (const [id, part] of Object.entries(state.assembly.parts)) {
    const slot = state.template.slots.find((candidate) => candidate.id === id);
    if (!slot || slot.family !== part.family) {
      return { ok: false, reason: 'family-not-allowed' };
    }
  }
  const design: Design = {
    format: 1,
    template: state.template.name,
    ...(state.calibre === undefined ? {} : { calibre: state.calibre }),
    assembly: chosenAssembly(state, domain),
    locks: state.locks,
    status: state.status,
    ...(state.finish ? { finish: state.finish } : {}),
    ...(state.origin ? { origin: state.origin } : {}),
  };
  return { ok: true, design, text: `${JSON.stringify(design, null, 2)}\n` };
};

/** Invalid publication requests download as drafts; draft saving is never gated. */
export const saveDesignForDownload = (
  state: DesignEditorState,
  domain: Domain,
): SaveDesignResult & { readonly downgraded?: boolean } => {
  const saved = saveDesign(state, domain);
  if (!saved.ok || saved.design.status !== 'published' || !state.template) {
    return saved;
  }
  const checked = loadDesignValue(saved.design, { domain, template: state.template, prefabs: GUN_PREFABS });
  if (checked.ok && checked.issues.length === 0) {
    return saved;
  }
  const draft = saveDesign(withEditorStatus(state, 'draft'), domain);
  return draft.ok ? { ...draft, downgraded: true } : draft;
};
