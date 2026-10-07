import { mateTransform, type Resolved, resolve } from '../core/resolve.ts';
import { keepOutForPart, portCompat, solidOverlapForPart } from '../core/rules.ts';
import type { Assembly, PartDef } from '../core/schema.ts';
import { ATTACHMENT_FAMILIES } from './attachmentParts.ts';
import { ATTACHMENT_IDS, type AttachmentSlotMetadata, attachmentMetadata } from './attachments.ts';
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

const attachmentInstance = (
  id: string,
): { readonly family: string; readonly params: Readonly<Record<string, string>> } => {
  if (id.startsWith('optic-')) {
    return { family: 'sight', params: { type: id.slice('optic-'.length) } };
  }
  if (id === 'real-suppressor' || id === 'improvised-suppressor') {
    return { family: 'suppressor', params: { type: id } };
  }
  return { family: id, params: {} };
};

const withCandidate = ({
  base,
  candidate,
  connection,
  hostPart,
  hostPortId,
}: {
  readonly base: Resolved;
  readonly candidate: Candidate;
  readonly connection: { readonly from: string; readonly to: string; readonly slot?: number };
  readonly hostPart: string;
  readonly hostPortId: string;
}): Resolved | undefined => {
  const partId = `candidate-${candidate.id}`;
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
      [partId, mateTransform(hostTransform, hostPort, connection.slot, attachmentPort)],
    ]),
    connections: [...base.connections, resolvedConnection],
  };
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
  const resolved = withCandidate({ base, candidate, connection, hostPart: host, hostPortId: port });
  if (!resolved) {
    return false;
  }
  const issues = [
    ...portCompat.check(resolved),
    ...solidOverlapForPart(resolved, partId),
    ...(optic ? opticMountFitForPart(resolved, partId) : []),
    ...(optic ? opticLoadingClearanceForPart(resolved, partId) : []),
    ...keepOutForPart(resolved, partId),
  ];
  return issues.length === 0;
};

/** Runs gungen's port, optic-support and keep-out rules for every viable attachment/slot pair. */
export const attachmentCompatibility = (
  firearm: Assembly,
  slots: readonly Pick<AttachmentSlotMetadata, 'id' | 'mount' | 'notchIndex'>[],
): Readonly<Record<string, readonly string[]>> => {
  const source = resolve(firearm, gunDomain);
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
  const base = resolve(bareFirearm, gunDomain);
  const candidatesByMount = new Map<string, Candidate[]>();
  for (const id of ATTACHMENT_IDS) {
    const { family, params } = attachmentInstance(id);
    const familyDef = FAMILIES[family] ?? ATTACHMENT_FAMILIES[family];
    if (!familyDef) {
      throw new Error(`No part family for attachment ${id}`);
    }
    const candidate = { id, family, params, definition: familyDef.build(params) };
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
