import type { Assembly, Domain } from '@skelly/engine/core/schema.ts';
import { type Report, validate } from '@skelly/engine/core/validate.ts';
import { attachmentCompatibility } from './attachmentCompatibility.ts';
import { ATTACHMENT_IDS, attachmentInstanceForId, attachmentSlots } from './attachments.ts';
import { gunDomain } from './domain.ts';

interface AttachmentFitRequest {
  readonly id: string;
  readonly port?: string;
}

export type AttachmentFitParseResult =
  | { readonly ok: true; readonly requests: readonly AttachmentFitRequest[] }
  | { readonly ok: false; readonly message: string };

export const parseAttachmentFit = (values: readonly string[]): AttachmentFitParseResult => {
  const requests: AttachmentFitRequest[] = [];
  for (const value of values) {
    const separator = value.indexOf('@');
    const id = separator < 0 ? value : value.slice(0, separator);
    const port = separator < 0 ? undefined : value.slice(separator + 1);
    if (!ATTACHMENT_IDS.includes(id as (typeof ATTACHMENT_IDS)[number])) {
      return { ok: false, message: `Unknown attachment: ${id || value}` };
    }
    if (port !== undefined && !port) {
      return { ok: false, message: `Missing mount port for ${id}.` };
    }
    requests.push({ id, ...(port === undefined ? {} : { port }) });
  }
  return { ok: true, requests };
};

export type AttachmentPreviewResult =
  | { readonly ok: true; readonly report: Report }
  | { readonly ok: false; readonly message: string };

const selectSlots = (
  requests: readonly AttachmentFitRequest[],
  slots: ReturnType<typeof attachmentSlots>,
  compatibility: Readonly<Record<string, readonly string[]>>,
):
  | {
      readonly ok: true;
      readonly selected: readonly { readonly request: AttachmentFitRequest; readonly slot: (typeof slots)[number] }[];
    }
  | { readonly ok: false; readonly message: string } => {
  const selected: { readonly request: AttachmentFitRequest; readonly slot: (typeof slots)[number] }[] = [];
  const used = new Set<string>();
  for (const request of requests) {
    const choice = chooseSlot(request, slots, compatibility);
    if (typeof choice === 'string') {
      return { ok: false, message: choice };
    }
    if (used.has(choice.id)) {
      return { ok: false, message: `Only one preview attachment can use ${choice.id}.` };
    }
    used.add(choice.id);
    selected.push({ request, slot: choice });
  }
  return { ok: true, selected };
};

const issueKey = (issue: Report['issues'][number]): string =>
  JSON.stringify([issue.rule, issue.message, issue.parts, issue.ports ?? [], issue.keepOut ?? null]);

const chooseSlot = (
  request: AttachmentFitRequest,
  slots: ReturnType<typeof attachmentSlots>,
  compatibility: Readonly<Record<string, readonly string[]>>,
): (typeof slots)[number] | string => {
  const matching = request.port
    ? slots.filter(({ id }) => id === request.port || id.startsWith(`${request.port}.`))
    : slots;
  if (matching.length === 0) {
    return `Unknown attachment mount port: ${request.port}`;
  }
  const slot = matching.find(({ id }) => compatibility[id]?.includes(request.id));
  return slot ?? `${request.id} is incompatible with ${request.port ?? 'this assembly'}.`;
};

/** Adds validated, shareable preview fits without changing the source assembly or its issues. */
export const previewFittedAttachments = (
  source: Report,
  values: readonly string[],
  domain: Domain = gunDomain,
): AttachmentPreviewResult => {
  const parsed = parseAttachmentFit(values);
  if (!parsed.ok) {
    return parsed;
  }
  if (parsed.requests.length === 0) {
    return { ok: true, report: source };
  }

  const slots = attachmentSlots(source.resolved);
  const compatibility = attachmentCompatibility(source.resolved.assembly, slots, domain);
  const selection = selectSlots(parsed.requests, slots, compatibility);
  if (!selection.ok) {
    return selection;
  }
  const { selected } = selection;

  const parts = { ...source.resolved.assembly.parts };
  const connections = [...source.resolved.assembly.connections];
  for (const [index, { request, slot }] of selected.entries()) {
    const instance = attachmentInstanceForId(request.id);
    let partId = `fit-preview-${index}`;
    while (parts[partId]) {
      partId = `_${partId}`;
    }
    parts[partId] = instance;
    const slotSeparator = slot.id.lastIndexOf('.');
    const from = slotSeparator < 0 ? '' : slot.id.slice(0, slotSeparator);
    if (!from) {
      return { ok: false, message: `Could not resolve mount port ${slot.id}.` };
    }
    connections.push({
      from,
      to: `${partId}.base`,
      ...(slot.notchIndex === undefined ? {} : { slot: slot.notchIndex }),
    });
  }
  const assembly: Assembly = { ...source.resolved.assembly, parts, connections };
  const preview = validate(assembly, domain);
  const originalIssues = new Set(source.issues.map(issueKey));
  const addedIssues = preview.issues.filter((issue) => !originalIssues.has(issueKey(issue)));
  if (addedIssues.length > 0) {
    return {
      ok: false,
      message: addedIssues.map(({ message }) => message).join(' '),
    };
  }
  return { ok: true, report: preview };
};
