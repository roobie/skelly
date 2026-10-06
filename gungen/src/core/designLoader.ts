// Design loader: text or a parsed value in, DesignLoadResult out (PROJECT.md,
// "3.0a contracts"). Domain-agnostic: the domain, the resolved template and the
// prefab catalogue are all explicit inputs, so core imports no gun data.
//
// Fatal (a load error): invalid JSON or shape, an unknown format, an unknown
// prefab id or version. Non-fatal (a draft with issues): an infeasible design,
// a stale template choice, a prefab whose values differ from the stored ones.
// A design stores only chosen values, so nothing is materialised on load.

import type {
  Design,
  DesignIssue,
  DesignLoadError,
  DesignLoadResult,
  DesignLocks,
  DesignOrigin,
  DesignOverrides,
  DesignStatus,
  NonEmptyReadonlyArray,
} from './design.ts';
import type { Issue } from './issue.ts';
import {
  describeValue,
  isRecord,
  joinPath,
  type Parsed,
  type ParseError,
  type ParseFailure,
  parseAssembly,
  parseRecord,
  parseStringArray,
} from './parseAssembly.ts';
import { resolve } from './resolve.ts';
import type { Assembly, Domain, PartInstance } from './schema.ts';
import type { ConditionalChoice, ParamReference, SlotTemplate, Template } from './template.ts';
import { validate } from './validate.ts';

/**
 * One catalogue revision. `family` is the domain's registry key (the key in
 * `Domain.families`, as stored in `PartInstance.family`); it is not
 * `PartDef.family`. The gun catalogue's `PrefabCatalogueEntry` fits this.
 */
interface DesignPrefabEntry {
  readonly id: string;
  readonly version: number;
  readonly family: string;
  readonly fixedParams: Readonly<Record<string, string>>;
}

export interface DesignLoadInputs {
  readonly domain: Domain;
  /** The template the design claims to belong to, already resolved by the caller. */
  readonly template: Template;
  readonly prefabs: readonly DesignPrefabEntry[];
}

const SUPPORTED_FORMAT = 1;

const failure = (path: string, message: string): ParseFailure => ({ ok: false, error: { path, message } });
const success = <T>(value: T): Parsed<T> => ({ ok: true, value });

const readDeclaredStatus = (raw: unknown): DesignStatus | undefined =>
  isRecord(raw) && (raw.status === 'draft' || raw.status === 'published') ? raw.status : undefined;

const fatal = (raw: unknown, error: DesignLoadError): DesignLoadResult => ({
  ok: false,
  declaredStatus: readDeclaredStatus(raw),
  error,
});

const prefixed = (base: string, error: ParseError): ParseError => ({
  path: error.path === '' ? base : `${base}.${error.path}`,
  message: error.message,
});

const parseString = (value: unknown, path: string): Parsed<string> =>
  typeof value === 'string' ? success(value) : failure(path, `expected a string, got ${describeValue(value)}`);

const parseBoolean = (value: unknown, path: string): Parsed<boolean> =>
  typeof value === 'boolean' ? success(value) : failure(path, `expected a boolean, got ${describeValue(value)}`);

const parseLocks = (value: unknown): Parsed<DesignLocks> => {
  if (!isRecord(value)) {
    return failure('locks', `expected an object, got ${describeValue(value)}`);
  }
  const params = parseRecord(value.params, 'locks.params', parseStringArray);
  if (!params.ok) {
    return params;
  }
  const optionalParts = parseStringArray(value.optionalParts, 'locks.optionalParts');
  return optionalParts.ok ? success({ params: params.value, optionalParts: optionalParts.value }) : optionalParts;
};

const parseOverrides = (value: unknown, path: string): Parsed<DesignOverrides> => {
  if (!isRecord(value)) {
    return failure(path, `expected an object, got ${describeValue(value)}`);
  }
  const params = parseRecord(value.params, joinPath(path, 'params'), (v, p) => parseRecord(v, p, parseString));
  if (!params.ok) {
    return params;
  }
  const presence = parseRecord(value.presence, joinPath(path, 'presence'), parseBoolean);
  return presence.ok ? success({ params: params.value, presence: presence.value }) : presence;
};

const parseOrigin = (value: unknown): Parsed<DesignOrigin> => {
  if (!isRecord(value)) {
    return failure('origin', `expected an object, got ${describeValue(value)}`);
  }
  const template = parseString(value.template, 'origin.template');
  if (!template.ok) {
    return template;
  }
  if (typeof value.seed !== 'number' || !Number.isFinite(value.seed)) {
    return failure('origin.seed', `expected a finite number, got ${describeValue(value.seed)}`);
  }
  const overrides = parseOverrides(value.overrides, 'origin.overrides');
  return overrides.ok ? success({ template: template.value, seed: value.seed, overrides: overrides.value }) : overrides;
};

/** Shape-checks everything after the format gate. */
const parseDesignBody = (raw: Record<string, unknown>): Parsed<Design> => {
  const template = parseString(raw.template, 'template');
  if (!template.ok) {
    return template;
  }
  if (raw.status !== 'draft' && raw.status !== 'published') {
    return failure('status', `expected "draft" or "published", got ${JSON.stringify(raw.status) ?? 'nothing'}`);
  }
  const locks = parseLocks(raw.locks);
  if (!locks.ok) {
    return locks;
  }
  const assembly = parseAssembly(raw.assembly);
  if (!assembly.ok) {
    return { ok: false, error: prefixed('assembly', assembly.error) };
  }
  const finish =
    raw.finish === undefined
      ? success(undefined)
      : parseRecord(raw.finish, 'finish', (v, p) => {
          const parsed = parseString(v, p);
          if (!parsed.ok) {
            return parsed;
          }
          return parsed.value.trim() === '' ? failure(p, 'expected a non-empty material id') : parsed;
        });
  if (!finish.ok) {
    return finish;
  }
  const origin = raw.origin === undefined ? success(undefined) : parseOrigin(raw.origin);
  if (!origin.ok) {
    return origin;
  }
  return success({
    format: SUPPORTED_FORMAT,
    template: template.value,
    assembly: assembly.assembly,
    locks: locks.value,
    status: raw.status,
    ...(finish.value === undefined ? {} : { finish: finish.value }),
    ...(origin.value === undefined ? {} : { origin: origin.value }),
  });
};

const partPath = (id: string, ...rest: string[]): string => ['assembly', 'parts', id, ...rest].join('.');

const isParamReference = (choice: unknown): choice is ParamReference =>
  isRecord(choice) && typeof choice.fromSlot === 'string';
const isConditionalChoice = (choice: unknown): choice is ConditionalChoice => isRecord(choice) && 'when' in choice;

const offeredValues = (choice: string | readonly string[]): readonly string[] =>
  typeof choice === 'string' ? [choice] : choice;

const staleParam = (
  part: PartInstance,
  slot: SlotTemplate,
  name: string,
  parts: Assembly['parts'],
): DesignIssue | undefined => {
  const choice = slot.params?.[name];
  const value = part.params?.[name];
  if (choice === undefined || value === undefined) {
    return undefined;
  }
  const path = partPath(slot.id, 'params', name);
  if (isConditionalChoice(choice)) {
    const condition = parts[choice.when.part]?.params?.[choice.when.param];
    const offered = condition === choice.when.equals ? choice.onMatch : choice.onMismatch;
    return offeredValues(offered).includes(value)
      ? undefined
      : {
          code: 'template-choice',
          message: `${slot.id}.${name} is "${value}", which the template no longer offers in this branch (${offeredValues(offered).join(', ')})`,
          path,
          parts: [slot.id],
        };
  }
  if (isParamReference(choice)) {
    const referenced = parts[choice.fromSlot]?.params?.[choice.param];
    return referenced !== undefined && referenced !== value
      ? {
          code: 'template-choice',
          message: `${slot.id}.${name} is "${value}" but the template takes it from ${choice.fromSlot}.${choice.param} ("${referenced}")`,
          path,
          parts: [slot.id],
        }
      : undefined;
  }
  return offeredValues(choice).includes(value)
    ? undefined
    : {
        code: 'template-choice',
        message: `${slot.id}.${name} is "${value}", which the template no longer offers (${offeredValues(choice).join(', ')})`,
        path,
        parts: [slot.id],
      };
};

const slotConditionMatches = (slot: SlotTemplate, assembly: Assembly, domain: Domain): boolean => {
  if (!slot.when) {
    return true;
  }
  const source = assembly.parts[slot.when.part];
  const family = source && domain.families[source.family];
  const value = source?.params?.[slot.when.param] ?? family?.params[slot.when.param]?.default;
  return value === slot.when.equals;
};

const slotIssues = (slot: SlotTemplate, assembly: Assembly, domain: Domain): DesignIssue[] => {
  const part = assembly.parts[slot.id];
  if (!slotConditionMatches(slot, assembly, domain)) {
    return part === undefined
      ? []
      : [
          {
            code: 'template-choice',
            message: `${slot.id} is included, but its template condition is not met`,
            path: partPath(slot.id),
            parts: [slot.id],
          },
        ];
  }
  if (part === undefined) {
    return (slot.chance ?? 1) >= 1
      ? [
          {
            code: 'template-choice',
            message: `the template always includes ${slot.id}, but the design has no such part`,
            path: partPath(slot.id),
            parts: [slot.id],
          },
        ]
      : [];
  }
  const issues: DesignIssue[] = [];
  if (part.family !== slot.family) {
    issues.push({
      code: 'template-choice',
      message: `${slot.id} is a ${part.family}, but the template's ${slot.id} slot is a ${slot.family}`,
      path: partPath(slot.id, 'family'),
      parts: [slot.id],
    });
  }
  for (const name of Object.keys(slot.params ?? {})) {
    const issue = staleParam(part, slot, name, assembly.parts);
    if (issue) {
      issues.push(issue);
    }
  }
  return issues;
};

const templateIssues = (design: Design, template: Template, domain: Domain): DesignIssue[] => {
  const issues: DesignIssue[] = [];
  if (design.template !== template.name) {
    issues.push({
      code: 'template-choice',
      message: `the design belongs to template "${design.template}", not "${template.name}"`,
      path: 'template',
    });
  }
  if (design.assembly.root !== template.root) {
    issues.push({
      code: 'template-choice',
      message: `the root is "${design.assembly.root}", but the template's root is "${template.root}"`,
      path: 'assembly.root',
    });
  }
  const slotIds = new Set(template.slots.map((s) => s.id));
  for (const slot of template.slots) {
    issues.push(...slotIssues(slot, design.assembly, domain));
  }
  for (const id of Object.keys(design.assembly.parts)) {
    if (!slotIds.has(id)) {
      issues.push({
        code: 'template-choice',
        message: `${id} is not a slot of template "${template.name}"`,
        path: partPath(id),
        parts: [id],
      });
    }
  }
  return issues;
};

const findPrefab = (prefabs: readonly DesignPrefabEntry[], id: string, version: number) =>
  prefabs.find((p) => p.id === id && p.version === version);

/** Fatal: the first part referencing a prefab id/version the catalogue lacks. */
const unknownPrefab = (assembly: Assembly, prefabs: readonly DesignPrefabEntry[]): DesignLoadError | undefined => {
  for (const [id, part] of Object.entries(assembly.parts)) {
    const ref = part.prefab;
    if (ref === undefined || findPrefab(prefabs, ref.id, ref.version)) {
      continue;
    }
    const knownIds = prefabs.some((p) => p.id === ref.id);
    return {
      code: 'unknown-prefab',
      message: knownIds
        ? `part ${id} references prefab "${ref.id}" version ${ref.version}, which the catalogue does not have`
        : `part ${id} references unknown prefab "${ref.id}"`,
      path: partPath(id, 'prefab'),
    };
  }
  return undefined;
};

const mismatch = (id: string, message: string, ...path: string[]): DesignIssue => ({
  code: 'prefab-values-mismatch',
  message,
  path: partPath(id, ...path),
  parts: [id],
});

const partPrefabIssues = (id: string, part: PartInstance, entry: DesignPrefabEntry): DesignIssue[] => {
  const label = `${entry.id}@${entry.version}`;
  const issues: DesignIssue[] = [];
  if (part.family !== entry.family) {
    issues.push(mismatch(id, `${id} is a ${part.family}, but prefab ${label} is for ${entry.family}`, 'family'));
  }
  for (const [name, fixed] of Object.entries(entry.fixedParams)) {
    const value = part.params?.[name];
    if (value !== fixed) {
      const shown = value === undefined ? 'unset' : `"${value}"`;
      issues.push(
        mismatch(id, `${id}.${name} is ${shown}, but prefab ${label} fixes it to "${fixed}"`, 'params', name),
      );
    }
  }
  return issues;
};

const prefabIssues = (assembly: Assembly, prefabs: readonly DesignPrefabEntry[]): DesignIssue[] =>
  Object.entries(assembly.parts).flatMap(([id, part]) => {
    const entry = part.prefab && findPrefab(prefabs, part.prefab.id, part.prefab.version);
    return entry ? partPrefabIssues(id, part, entry) : [];
  });

const toDesignIssues = (issues: readonly Issue[]): DesignIssue[] =>
  issues.map((issue) => ({ code: 'infeasible', message: `[${issue.rule}] ${issue.message}`, parts: issue.parts }));

/** Domain rules lint the placed portions of a build even when its structure is broken. */
const feasibilityIssues = (assembly: Assembly, domain: Domain): DesignIssue[] => {
  const resolved = resolve(assembly, domain);
  const unplaced = [...resolved.defs.keys()].filter((id) => !resolved.placed.has(id));
  const issues = toDesignIssues(validate(assembly, domain).issues);
  const unreported = unplaced.filter((id) => !resolved.issues.some((issue) => issue.parts.includes(id)));
  if (unreported.length > 0) {
    // Retain the loader's disconnected-part message where a required-port or
    // other structure issue already takes precedence inside resolve().
    issues.push({
      code: 'infeasible',
      message: `[structure] ${unreported.join(', ')} ${unreported.length === 1 ? 'is' : 'are'} not connected to the root`,
      parts: unreported,
    });
  }
  return issues;
};

const isNonEmpty = <T>(items: readonly T[]): items is NonEmptyReadonlyArray<T> => items.length > 0;

/** Loads a design from an already-parsed value. Never throws on bad input. */
export const loadDesignValue = (raw: unknown, inputs: DesignLoadInputs): DesignLoadResult => {
  if (!isRecord(raw)) {
    return fatal(raw, {
      code: 'invalid-shape',
      message: `expected a design object, got ${describeValue(raw)}`,
      path: '',
    });
  }
  if (raw.format === undefined) {
    return fatal(raw, { code: 'invalid-shape', message: 'missing "format"', path: 'format' });
  }
  if (raw.format !== SUPPORTED_FORMAT) {
    return fatal(raw, {
      code: 'unsupported-format',
      message: `unsupported design format ${JSON.stringify(raw.format)}; this build reads format ${SUPPORTED_FORMAT}`,
      path: 'format',
    });
  }
  const parsed = parseDesignBody(raw);
  if (!parsed.ok) {
    return fatal(raw, { code: 'invalid-shape', message: parsed.error.message, path: parsed.error.path });
  }
  const design = parsed.value;
  const unknown = unknownPrefab(design.assembly, inputs.prefabs);
  if (unknown) {
    return fatal(raw, unknown);
  }
  const issues = [
    ...templateIssues(design, inputs.template, inputs.domain),
    ...prefabIssues(design.assembly, inputs.prefabs),
    ...feasibilityIssues(design.assembly, inputs.domain),
  ];
  if (!isNonEmpty(issues)) {
    return { ok: true, declaredStatus: design.status, design, issues: [] };
  }
  return { ok: true, declaredStatus: design.status, design: { ...design, status: 'draft' }, issues };
};

/** Loads a design from file text. Invalid JSON is a load error. */
export const loadDesign = (text: string, inputs: DesignLoadInputs): DesignLoadResult => {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return {
      ok: false,
      declaredStatus: undefined,
      error: { code: 'invalid-json', message: `invalid JSON: ${err instanceof Error ? err.message : String(err)}` },
    };
  }
  return loadDesignValue(raw, inputs);
};
