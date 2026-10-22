import { mateTransform, resolve } from '@skelly/engine/assembly/resolve.ts';
import {
  keepOut,
  keepOutBetweenParts,
  keepOutForPart,
  solidOverlap,
  solidOverlapBetweenParts,
  solidOverlapForPart,
} from '@skelly/engine/assembly/rules.ts';
import type {
  Assembly,
  Domain,
  ParamSpec,
  PartDef,
  Resolved,
  ResolvedParam,
  Rule,
} from '@skelly/engine/assembly/schema.ts';
import { checkRule, validationRules } from '@skelly/engine/assembly/validate.ts';
import type { Issue } from '@skelly/engine/foundation/issue.ts';
import type { Transform } from '@skelly/engine/foundation/math.ts';
import {
  ATTACHMENT_IDS,
  type AttachmentSlotMetadata,
  attachmentInstanceForId,
  attachmentMetadata,
  attachmentMountSlot,
  railSpanFitsNotch,
} from './attachments.ts';
import { gunDomain } from './domain.ts';
import { mountCanAccept } from './mounts.ts';
import { getOptic } from './optics.ts';
import { opticLoadingClearance, opticLoadingClearanceForPart, opticMountFit, opticMountFitForPart } from './rules.ts';

interface Candidate {
  readonly id: string;
  readonly family: string;
  /** Every param value the part is built with. */
  readonly params: Readonly<Record<string, string>>;
  readonly resolvedParams: Readonly<Record<string, ResolvedParam>>;
  readonly definition: PartDef;
}

const resolvedHostParam = (
  spec: ParamSpec,
  host: string,
  hostParams: Readonly<Record<string, ResolvedParam>>,
): ResolvedParam => {
  const source = (spec.from ?? [])
    .filter(({ port }) => port === 'base')
    .map(({ param }) => ({ param, value: hostParams[param]?.value }))
    .find(({ value }) => value !== undefined);
  return source?.value !== undefined && spec.values.includes(source.value)
    ? { value: source.value, source: 'inherited', from: `${host}.${source.param}` }
    : { value: spec.default, source: 'default' };
};

// A fitted attachment inherits params from its host when resolved, so certification builds each
// candidate with the host's values: otherwise it would judge a part that never sits on that host.
const hostedCandidate = (id: string, base: Resolved, host: string): Candidate => {
  const { family, params } = attachmentInstanceForId(id);
  const familyDef = base.domain.families[family];
  if (!familyDef) {
    throw new Error(`No part family for attachment ${id}`);
  }
  const hostParams = base.params.get(host) ?? {};
  const resolvedParams = Object.fromEntries(
    Object.entries(familyDef.params).map(([name, spec]): [string, ResolvedParam] => {
      const set = params[name];
      return [name, set === undefined ? resolvedHostParam(spec, host, hostParams) : { value: set, source: 'set' }];
    }),
  );
  const values = Object.fromEntries(Object.entries(resolvedParams).map(([name, { value }]) => [name, value]));
  return { id, family, params: values, resolvedParams, definition: familyDef.build(values) };
};

const hostedCandidates = (base: Resolved): ((id: string, host: string) => Candidate) => {
  const built = new Map<string, Candidate>();
  return (id, host) => {
    const key = JSON.stringify([host, id]);
    const cached = built.get(key);
    if (cached) {
      return cached;
    }
    const candidate = hostedCandidate(id, base, host);
    built.set(key, candidate);
    return candidate;
  };
};

const slotHost = (slotId: string): readonly [host: string, port: string] => {
  const [host, port] = slotId.split('.');
  if (!(host && port)) {
    throw new Error(`Malformed attachment slot ID ${slotId}`);
  }
  return [host, port];
};

const withCandidate = ({
  base,
  candidate,
  connection,
  hostPart,
  hostPortId,
  partId,
  placement,
}: {
  readonly base: Resolved;
  readonly candidate: Candidate;
  readonly connection: { readonly from: string; readonly to: string; readonly slot?: number };
  readonly hostPart: string;
  readonly hostPortId: string;
  readonly partId: string;
  readonly placement?: Transform;
}): Resolved | undefined => {
  const hostDefinition = base.defs.get(hostPart);
  const hostTransform = base.placed.get(hostPart);
  const hostPort = hostDefinition?.ports.find(({ id }) => id === hostPortId);
  const attachmentPort = candidate.definition.ports.find(({ id }) => id === 'base');
  if (!(hostDefinition && hostTransform && hostPort && attachmentPort)) {
    return undefined;
  }
  const resolvedConnection = {
    index: base.connections.length,
    conn: connection,
    from: { part: hostPart, port: hostPort },
    to: { part: partId, port: attachmentPort },
    role: 'tree' as const,
  };
  return {
    ...base,
    assembly: {
      ...base.assembly,
      parts: {
        ...base.assembly.parts,
        [partId]: {
          family: candidate.family,
          params: Object.fromEntries(
            Object.entries(candidate.resolvedParams)
              .filter(([, { source }]) => source === 'set')
              .map(([name, { value }]) => [name, value]),
          ),
        },
      },
      connections: [...base.assembly.connections, connection],
    },
    defs: new Map([...base.defs, [partId, candidate.definition]]),
    params: new Map([...base.params, [partId, candidate.resolvedParams]]),
    placed: new Map([
      ...base.placed,
      [partId, placement ?? mateTransform({ hostTransform, hostPort, slot: connection.slot, attachmentPort })],
    ]),
    connections: [...base.connections, resolvedConnection],
  };
};

// Certification runs validation's own rule list, so a certified fit cannot fail validation. Rules
// with a per-part variant check only the candidate's interactions, which is all a fit can change.
const PER_PART_RULES = new Map<Rule, (r: Resolved, part: string) => Issue[]>([
  [solidOverlap, solidOverlapForPart],
  [keepOut, keepOutForPart],
  [opticMountFit, opticMountFitForPart],
  [opticLoadingClearance, opticLoadingClearanceForPart],
]);

const issueKey = (issue: Issue): string => JSON.stringify(issue);

/** Validation's issues on the bare firearm, which no fit is blamed for. */
const bareIssueKeys = (base: Resolved): ReadonlySet<string> =>
  new Set(
    validationRules(base.domain)
      .filter((rule) => !PER_PART_RULES.has(rule))
      .flatMap((rule) => checkRule(rule, base).map(issueKey)),
  );

const fits = (resolved: Resolved, partId: string, bareIssues: ReadonlySet<string>): boolean =>
  validationRules(resolved.domain).every((rule) => {
    const perPart = PER_PART_RULES.get(rule);
    return perPart
      ? checkRule(rule, resolved, (r) => perPart(r, partId)).length === 0
      : checkRule(rule, resolved).every((issue) => bareIssues.has(issueKey(issue)));
  });

const passesFitRules = ({
  base,
  bareIssues,
  candidate,
  slot,
  host,
  port,
}: {
  readonly base: Resolved;
  readonly bareIssues: ReadonlySet<string>;
  readonly candidate: Candidate;
  readonly slot: Pick<AttachmentSlotMetadata, 'id' | 'mount' | 'notchIndex'>;
  readonly host: string;
  readonly port: string;
}): boolean => {
  const mount = candidate.definition.ports.find(({ id }) => id === 'base')?.mount;
  // A mount mismatch cannot pass port-compat; equality never certifies the fit.
  if (mount !== slot.mount) {
    return false;
  }
  const hostPort = base.defs.get(host)?.ports.find(({ id }) => id === port);
  const optic = candidate.family === 'sight' ? getOptic(candidate.params.type, candidate.params.mountSection) : undefined;
  if (optic && !(hostPort && mountCanAccept(hostPort, optic.mount, slot.notchIndex ?? 0))) {
    return false;
  }
  // The exported span is what the runtime fitter requires on the rail, so certify only what it will accept.
  const span = attachmentMetadata(
    candidate.family,
    candidate.params,
    base.domain.units.metresPerUnit,
    candidate.definition,
  )?.properties.railSpanNotches;
  if (hostPort && slot.notchIndex !== undefined && !railSpanFitsNotch(span, slot.notchIndex, hostPort)) {
    return false;
  }
  const partId = `candidate-${candidate.id}`;
  const connection = {
    from: `${host}.${port}`,
    to: `${partId}.base`,
    ...(slot.notchIndex === undefined ? {} : { slot: slot.notchIndex }),
  };
  const resolved = withCandidate({ base, candidate, connection, hostPart: host, hostPortId: port, partId });
  return resolved !== undefined && fits(resolved, partId, bareIssues);
};

/** Runs validation's rules for every viable attachment/slot pair. */
export const attachmentCompatibility = (
  firearm: Assembly,
  slots: readonly Pick<AttachmentSlotMetadata, 'id' | 'mount' | 'notchIndex'>[],
  domain: Domain = gunDomain,
  excludedAttachments: readonly string[] = [],
): Readonly<Record<string, readonly string[]>> => {
  const source = resolve(firearm, domain);
  const fittedParts = new Set(
    [...source.defs].flatMap(([id, definition]) => {
      const params = Object.fromEntries(
        Object.entries(source.params.get(id) ?? {}).map(([name, value]) => [name, value.value]),
      );
      return attachmentMetadata(
        source.assembly.parts[id]?.family ?? definition.family,
        params,
        domain.units.metresPerUnit,
        definition,
      )
        ? [id]
        : [];
    }),
  );
  const bareFirearm: Assembly = {
    ...firearm,
    parts: Object.fromEntries(Object.entries(firearm.parts).filter(([id]) => !fittedParts.has(id))),
    connections: firearm.connections.filter(
      ({ from, to }) => !(fittedParts.has(from.split('.')[0]!) || fittedParts.has(to.split('.')[0]!)),
    ),
  };
  const base = resolve(bareFirearm, domain);
  const bareIssues = bareIssueKeys(base);
  const candidateFor = hostedCandidates(base);

  return Object.fromEntries(
    slots.map((slot) => {
      const [host, port] = slotHost(slot.id);
      const accepted = ATTACHMENT_IDS.filter(
        (id) =>
          !excludedAttachments.includes(id) &&
          passesFitRules({ base, bareIssues, candidate: candidateFor(id, host), slot, host, port }),
      );
      return [slot.id, accepted];
    }),
  );
};

type AttachmentCompatibilityChoice = readonly [slotId: string, attachmentId: string];
export type AttachmentCompatibilityPair = readonly [
  first: AttachmentCompatibilityChoice,
  second: AttachmentCompatibilityChoice,
];

const compatibilityPairCache = new WeakMap<Domain, Map<string, readonly AttachmentCompatibilityPair[]>>();

const compareText = (a: string, b: string): number => {
  if (a < b) {
    return -1;
  }
  return a > b ? 1 : 0;
};
const compareChoices = (a: AttachmentCompatibilityChoice, b: AttachmentCompatibilityChoice): number =>
  compareText(a[0], b[0]) || compareText(a[1], b[1]);
const comparePairs = (a: AttachmentCompatibilityPair, b: AttachmentCompatibilityPair): number =>
  compareChoices(a[0], b[0]) || compareChoices(a[1], b[1]);
const canonicalPair = (
  a: AttachmentCompatibilityChoice,
  b: AttachmentCompatibilityChoice,
): AttachmentCompatibilityPair => (compareChoices(a, b) <= 0 ? [a, b] : [b, a]);

const slotConnection = (slot: AttachmentSlotMetadata, partId: string) => {
  const [host, port] = slotHost(slot.id);
  return {
    hostPart: host,
    hostPortId: port,
    connection: {
      from: `${host}.${port}`,
      to: `${partId}.base`,
      ...(slot.notchIndex === undefined ? {} : { slot: slot.notchIndex }),
    },
  };
};

const mountedSlot = (
  resolved: Resolved,
  partId: string,
  mount: AttachmentSlotMetadata['mount'],
  slots: readonly AttachmentSlotMetadata[],
): AttachmentSlotMetadata | undefined => {
  const id = attachmentMountSlot(resolved, partId, mount);
  return id ? slots.find((slot) => slot.id === id) : undefined;
};

interface FittedDefault {
  readonly choice: AttachmentCompatibilityChoice;
  readonly candidate: Candidate;
}

const bareFirearmAndDefaults = (
  firearm: Assembly,
  slots: readonly AttachmentSlotMetadata[],
  domain: Domain,
): { readonly bareFirearm: Assembly; readonly defaults: readonly FittedDefault[] } => {
  const source = resolve(firearm, domain);
  const attachmentParts = new Set<string>();
  const defaults = [...source.defs].flatMap(([partId, definition]) => {
    const instance = source.assembly.parts[partId];
    if (!instance) {
      return [];
    }
    const params = Object.fromEntries(
      Object.entries(source.params.get(partId) ?? {}).map(([name, value]) => [name, value.value]),
    );
    const metadata = attachmentMetadata(instance.family, params, domain.units.metresPerUnit, definition);
    if (!metadata) {
      return [];
    }
    attachmentParts.add(partId);
    const slot = mountedSlot(source, partId, metadata.mount, slots);
    if (!slot) {
      return [];
    }
    return [
      {
        choice: [slot.id, metadata.id] as AttachmentCompatibilityChoice,
        candidate: {
          id: metadata.id,
          family: instance.family,
          params,
          resolvedParams: source.params.get(partId) ?? {},
          definition,
        },
      },
    ];
  });
  const bareFirearm: Assembly = {
    ...firearm,
    parts: Object.fromEntries(Object.entries(firearm.parts).filter(([id]) => !attachmentParts.has(id))),
    connections: firearm.connections.filter(
      ({ from, to }) => !(attachmentParts.has(from.split('.')[0]!) || attachmentParts.has(to.split('.')[0]!)),
    ),
  };
  return { bareFirearm, defaults };
};

type ChoiceCandidate = (choice: AttachmentCompatibilityChoice) => Candidate;

const certifyDynamicPairs = (
  singles: readonly AttachmentCompatibilityChoice[],
  candidateFor: ChoiceCandidate,
  fitsPair: (
    firstChoice: AttachmentCompatibilityChoice,
    firstCandidate: Candidate,
    secondChoice: AttachmentCompatibilityChoice,
    secondCandidate: Candidate,
  ) => boolean,
  add: (a: AttachmentCompatibilityChoice, b: AttachmentCompatibilityChoice) => void,
): void => {
  for (let first = 0; first < singles.length; first++) {
    const firstChoice = singles[first]!;
    const firstCandidate = candidateFor(firstChoice);
    for (let second = first + 1; second < singles.length; second++) {
      const secondChoice = singles[second]!;
      if (firstChoice[0] === secondChoice[0]) {
        continue;
      }
      if (fitsPair(firstChoice, firstCandidate, secondChoice, candidateFor(secondChoice))) {
        add(firstChoice, secondChoice);
      }
    }
  }
};

const certifyDefaultPairs = ({
  singles,
  defaults,
  candidateFor,
  fitsPair,
  add,
}: {
  readonly singles: readonly AttachmentCompatibilityChoice[];
  readonly defaults: readonly FittedDefault[];
  readonly candidateFor: ChoiceCandidate;
  readonly fitsPair: (
    firstChoice: AttachmentCompatibilityChoice,
    firstCandidate: Candidate,
    secondChoice: AttachmentCompatibilityChoice,
    secondCandidate: Candidate,
  ) => boolean;
  readonly add: (a: AttachmentCompatibilityChoice, b: AttachmentCompatibilityChoice) => void;
}): void => {
  for (const firstChoice of singles) {
    const firstCandidate = candidateFor(firstChoice);
    for (const fitted of defaults) {
      if (
        firstChoice[0] !== fitted.choice[0] &&
        fitsPair(firstChoice, firstCandidate, fitted.choice, fitted.candidate)
      ) {
        add(firstChoice, fitted.choice);
      }
    }
  }
};

const certifyPairs = (
  singles: readonly AttachmentCompatibilityChoice[],
  defaults: readonly FittedDefault[],
  candidateFor: ChoiceCandidate,
  fitsPair: (
    firstChoice: AttachmentCompatibilityChoice,
    firstCandidate: Candidate,
    secondChoice: AttachmentCompatibilityChoice,
    secondCandidate: Candidate,
  ) => boolean,
): readonly AttachmentCompatibilityPair[] => {
  const certified = new Map<string, AttachmentCompatibilityPair>();
  const add = (a: AttachmentCompatibilityChoice, b: AttachmentCompatibilityChoice): void => {
    const pair = canonicalPair(a, b);
    certified.set(JSON.stringify(pair), pair);
  };
  certifyDynamicPairs(singles, candidateFor, fitsPair, add);
  certifyDefaultPairs({ singles, defaults, candidateFor, fitsPair, add });
  return [...certified.values()].sort(comparePairs);
};

/** Certifies every clear pair of distinct single-fit choices and each such choice beside a fitted default. */
export const attachmentCompatibilityPairs = (
  firearm: Assembly,
  slots: readonly AttachmentSlotMetadata[],
  compatibility: Readonly<Record<string, readonly string[]>>,
  domain: Domain = gunDomain,
): readonly AttachmentCompatibilityPair[] => {
  const cacheKey = JSON.stringify([firearm, slots, compatibility]);
  let cache = compatibilityPairCache.get(domain);
  if (!cache) {
    cache = new Map();
    compatibilityPairCache.set(domain, cache);
  }
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const { bareFirearm, defaults } = bareFirearmAndDefaults(firearm, slots, domain);
  const base = resolve(bareFirearm, domain);
  const slotsById = new Map(slots.map((slot) => [slot.id, slot]));
  const singles = Object.entries(compatibility)
    .flatMap(([slotId, ids]) => ids.map((id) => [slotId, id] as AttachmentCompatibilityChoice))
    .sort(compareChoices);
  const hosted = hostedCandidates(base);
  const candidateFor: ChoiceCandidate = ([slotId, id]) => hosted(id, slotHost(slotId)[0]);
  const placementCache = new Map<string, Transform>();
  const placementFor = (
    choice: AttachmentCompatibilityChoice,
    candidate: Candidate,
    connection: { readonly from: string; readonly to: string; readonly slot?: number },
  ): Transform | undefined => {
    const key = JSON.stringify([choice, candidate.id]);
    const cachedPlacement = placementCache.get(key);
    if (cachedPlacement) {
      return cachedPlacement;
    }
    const [hostPart, hostPortId] = connection.from.split('.');
    const hostTransform = hostPart ? base.placed.get(hostPart) : undefined;
    const hostPort =
      hostPart && hostPortId ? base.defs.get(hostPart)?.ports.find(({ id }) => id === hostPortId) : undefined;
    const attachmentPort = candidate.definition.ports.find(({ id }) => id === 'base');
    if (!(hostTransform && hostPort && attachmentPort)) {
      return undefined;
    }
    const placement = mateTransform({ hostTransform, hostPort, slot: connection.slot, attachmentPort });
    placementCache.set(key, placement);
    return placement;
  };
  const placeChoice = (
    resolved: Resolved,
    choice: AttachmentCompatibilityChoice,
    candidate: Candidate,
    ordinal: number,
  ): { readonly resolved: Resolved; readonly partId: string } | undefined => {
    const slot = slotsById.get(choice[0]);
    if (!slot) {
      return undefined;
    }
    let partId = `compatibility-candidate-${ordinal}`;
    while (base.defs.has(partId)) {
      partId = `_${partId}`;
    }
    const connection = slotConnection(slot, partId);
    const placement = placementFor(choice, candidate, connection.connection);
    if (!placement) {
      return undefined;
    }
    const withPart = withCandidate({ base: resolved, candidate, ...connection, partId, placement });
    return withPart ? { resolved: withPart, partId } : undefined;
  };
  const fitsPair = (
    firstChoice: AttachmentCompatibilityChoice,
    firstCandidate: Candidate,
    secondChoice: AttachmentCompatibilityChoice,
    secondCandidate: Candidate,
  ): boolean => {
    if (firstChoice[0] === secondChoice[0]) {
      return false;
    }
    const firstIsOrdered = compareChoices(firstChoice, secondChoice) <= 0;
    const orderedFirst = firstIsOrdered ? firstChoice : secondChoice;
    const orderedFirstCandidate = firstIsOrdered ? firstCandidate : secondCandidate;
    const orderedSecond = firstIsOrdered ? secondChoice : firstChoice;
    const orderedSecondCandidate = firstIsOrdered ? secondCandidate : firstCandidate;
    const withFirst = placeChoice(base, orderedFirst, orderedFirstCandidate, 0);
    if (!withFirst) {
      return false;
    }
    const withSecond = placeChoice(withFirst.resolved, orderedSecond, orderedSecondCandidate, 1);
    if (!withSecond) {
      return false;
    }
    // Singles certify every validation rule against the firearm; only pair-dependent geometry changes here.
    return (
      solidOverlapBetweenParts(withSecond.resolved, withFirst.partId, withSecond.partId).length === 0 &&
      keepOutBetweenParts(withSecond.resolved, withFirst.partId, withSecond.partId).length === 0
    );
  };
  const result = certifyPairs(singles, defaults, candidateFor, fitsPair);
  cache.set(cacheKey, result);
  return result;
};
