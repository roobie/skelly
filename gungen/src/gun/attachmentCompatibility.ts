import type { Transform } from '@skelly/engine/core/math.ts';
import { mateTransform, type Resolved, resolve } from '@skelly/engine/core/resolve.ts';
import {
  keepOutBetweenParts,
  keepOutForPart,
  portCompat,
  solidOverlapBetweenParts,
  solidOverlapForPart,
} from '@skelly/engine/core/rules.ts';
import type { Assembly, Domain, PartDef } from '@skelly/engine/core/schema.ts';
import { ATTACHMENT_FAMILIES } from './attachmentParts.ts';
import {
  ATTACHMENT_IDS,
  type AttachmentSlotMetadata,
  attachmentInstanceForId,
  attachmentMetadata,
  attachmentMountSlot,
} from './attachments.ts';
import { gunDomain } from './domain.ts';
import { mountCanAccept } from './mounts.ts';
import { getOptic } from './optics.ts';
import { FAMILIES } from './parts.ts';
import { opticLoadingClearanceForPart, opticMountFitForPart } from './rules.ts';

interface Candidate {
  readonly id: string;
  readonly family: string;
  readonly params: Readonly<Record<string, string>>;
  readonly definition: PartDef;
}

const standaloneCandidate = (id: string): Candidate => {
  const { family, params } = attachmentInstanceForId(id);
  const familyDef = FAMILIES[family] ?? ATTACHMENT_FAMILIES[family];
  if (!familyDef) {
    throw new Error(`No part family for attachment ${id}`);
  }
  return { id, family, params, definition: familyDef.build(params) };
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
      parts: { ...base.assembly.parts, [partId]: { family: candidate.family, params: candidate.params } },
      connections: [...base.assembly.connections, connection],
    },
    defs: new Map([...base.defs, [partId, candidate.definition]]),
    params: new Map([
      ...base.params,
      [
        partId,
        Object.fromEntries(
          Object.entries(candidate.params).map(([key, value]) => [key, { value, source: 'set' as const }]),
        ),
      ],
    ]),
    placed: new Map([
      ...base.placed,
      [partId, placement ?? mateTransform({ hostTransform, hostPort, slot: connection.slot, attachmentPort })],
    ]),
    connections: [...base.connections, resolvedConnection],
  };
};

const fitIssues = (resolved: Resolved, candidate: Candidate, partId: string) => {
  const optic = candidate.family === 'sight' ? getOptic(candidate.params.type) : undefined;
  return [
    ...portCompat.check(resolved),
    ...solidOverlapForPart(resolved, partId),
    ...(optic ? opticMountFitForPart(resolved, partId) : []),
    ...(optic ? opticLoadingClearanceForPart(resolved, partId) : []),
    ...keepOutForPart(resolved, partId),
  ];
};

const passesFitRules = ({
  base,
  candidate,
  slot,
  host,
  port,
}: {
  readonly base: Resolved;
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
  const optic = candidate.family === 'sight' ? getOptic(candidate.params.type) : undefined;
  if (optic) {
    const hostPort = base.defs.get(host)?.ports.find(({ id }) => id === port);
    if (!(hostPort && mountCanAccept(hostPort, optic.mount, slot.notchIndex ?? 0))) {
      return false;
    }
  }
  const partId = `candidate-${candidate.id}`;
  const connection = {
    from: `${host}.${port}`,
    to: `${partId}.base`,
    ...(slot.notchIndex === undefined ? {} : { slot: slot.notchIndex }),
  };
  const resolved = withCandidate({ base, candidate, connection, hostPart: host, hostPortId: port, partId });
  return resolved !== undefined && fitIssues(resolved, candidate, partId).length === 0;
};

/** Runs gungen's port, optic-support and keep-out rules for every viable attachment/slot pair. */
export const attachmentCompatibility = (
  firearm: Assembly,
  slots: readonly Pick<AttachmentSlotMetadata, 'id' | 'mount' | 'notchIndex'>[],
  domain: Domain = gunDomain,
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
        gunDomain.units.metresPerUnit,
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
  const candidatesByMount = new Map<string, Candidate[]>();
  for (const id of ATTACHMENT_IDS) {
    const candidate = standaloneCandidate(id);
    const mount = candidate.definition.ports.find(({ id: portId }) => portId === 'base')?.mount;
    if (mount) {
      const candidates = candidatesByMount.get(mount) ?? [];
      candidates.push(candidate);
      candidatesByMount.set(mount, candidates);
    }
  }

  return Object.fromEntries(
    slots.map((slot) => {
      const [host, port] = slot.id.split('.');
      if (!(host && port)) {
        throw new Error(`Malformed attachment slot ID ${slot.id}`);
      }
      const accepted = (candidatesByMount.get(slot.mount) ?? [])
        .filter((candidate) => passesFitRules({ base, candidate, slot, host, port }))
        .map(({ id }) => id);
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
  const [host, port] = slot.id.split('.');
  if (!(host && port)) {
    throw new Error(`Malformed attachment slot ID ${slot.id}`);
  }
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
        candidate: { id: metadata.id, family: instance.family, params, definition },
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

const certifyDynamicPairs = (
  singles: readonly AttachmentCompatibilityChoice[],
  candidates: ReadonlyMap<string, Candidate>,
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
    const firstCandidate = candidates.get(firstChoice[1]);
    if (!firstCandidate) {
      continue;
    }
    for (let second = first + 1; second < singles.length; second++) {
      const secondChoice = singles[second]!;
      if (firstChoice[0] === secondChoice[0]) {
        continue;
      }
      const secondCandidate = candidates.get(secondChoice[1]);
      if (secondCandidate && fitsPair(firstChoice, firstCandidate, secondChoice, secondCandidate)) {
        add(firstChoice, secondChoice);
      }
    }
  }
};

const certifyDefaultPairs = ({
  singles,
  defaults,
  candidates,
  fitsPair,
  add,
}: {
  readonly singles: readonly AttachmentCompatibilityChoice[];
  readonly defaults: readonly FittedDefault[];
  readonly candidates: ReadonlyMap<string, Candidate>;
  readonly fitsPair: (
    firstChoice: AttachmentCompatibilityChoice,
    firstCandidate: Candidate,
    secondChoice: AttachmentCompatibilityChoice,
    secondCandidate: Candidate,
  ) => boolean;
  readonly add: (a: AttachmentCompatibilityChoice, b: AttachmentCompatibilityChoice) => void;
}): void => {
  for (const firstChoice of singles) {
    const firstCandidate = candidates.get(firstChoice[1]);
    if (!firstCandidate) {
      continue;
    }
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
  candidates: ReadonlyMap<string, Candidate>,
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
  certifyDynamicPairs(singles, candidates, fitsPair, add);
  certifyDefaultPairs({ singles, defaults, candidates, fitsPair, add });
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
  const candidates = new Map(ATTACHMENT_IDS.map((id) => [id, standaloneCandidate(id)]));
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
    // Singles certify connection and optic rules against the firearm; only pair-dependent geometry changes here.
    return (
      solidOverlapBetweenParts(withSecond.resolved, withFirst.partId, withSecond.partId).length === 0 &&
      keepOutBetweenParts(withSecond.resolved, withFirst.partId, withSecond.partId).length === 0
    );
  };
  const result = certifyPairs(singles, defaults, candidates, fitsPair);
  cache.set(cacheKey, result);
  return result;
};
