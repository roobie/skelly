import { safeParse } from 'valibot';
import type { Registry } from './content.ts';
import { type ActorBody, ActorBodySchema, type ActorClips, ActorClipsSchema, actorFigureKey } from './schema/actors.ts';

export interface ActorFigureFile {
  readonly body: ActorBody;
  readonly clips: ActorClips;
  /** The built GLB, kept as bytes: only the renderer decodes it, so the simulation never pays for a mesh. */
  readonly mesh: Uint8Array;
}

/** Decoded figure files keyed by figure row id; built once per session start, before the first tick. */
export type ActorFigureFiles = ReadonlyMap<string, ActorFigureFile>;

/** The built body and clips of one figure from the loaded map; a missing figure throws. */
export const actorFigure = (files: ActorFigureFiles, type: { readonly id: string }, seed: number): ActorFigureFile => {
  const key = actorFigureKey(type.id, seed);
  const figure = files.get(key);
  if (!figure) {
    throw new Error(`Actor figure ${key} was not loaded`);
  }
  return figure;
};

/** The bytes of one declared file of a figure row, named by the content file that declares the row and the pack path. */
export type FigureFileRead<T> = (contentFile: string, path: string) => T;

const text = new TextDecoder();

const decoded = (id: string, bodyBytes: Uint8Array, clipsBytes: Uint8Array, mesh: Uint8Array): ActorFigureFile => {
  const body = safeParse(ActorBodySchema, JSON.parse(text.decode(bodyBytes)));
  const clips = safeParse(ActorClipsSchema, JSON.parse(text.decode(clipsBytes)));
  if (!(body.success && clips.success)) {
    const first = (body.success ? undefined : body.issues[0]) ?? (clips.success ? undefined : clips.issues[0]);
    throw new Error(`Actor figure ${id}: ${first?.message ?? 'invalid figure files'}`);
  }
  return { body: body.output, clips: clips.output, mesh };
};

const figureRows = (registry: Registry) =>
  [...registry.actorFigures.values()].map((row) => {
    const origin = registry.contentOrigins.get(`actorFigures:${row.id}`);
    if (!origin) {
      throw new Error(`Actor figure ${row.id}: no content origin`);
    }
    return { row, source: origin.source };
  });

/** Every figure row of the registry, read synchronously; Node reads through the pack reader. */
export const readActorFigureFiles = (registry: Registry, read: FigureFileRead<Uint8Array>): ActorFigureFiles =>
  new Map(
    figureRows(registry).map(({ row, source }) => [
      row.id,
      decoded(row.id, read(source, row.body), read(source, row.clips), read(source, row.mesh)),
    ]),
  );

/** Every figure row of the registry, fetched concurrently; the browser awaits it before the session starts. */
export const loadActorFigureFiles = async (
  registry: Registry,
  read: FigureFileRead<Promise<Uint8Array>>,
): Promise<ActorFigureFiles> =>
  new Map(
    await Promise.all(
      figureRows(registry).map(async ({ row, source }) => {
        const [body, clips, mesh] = await Promise.all([
          read(source, row.body),
          read(source, row.clips),
          read(source, row.mesh),
        ]);
        return [row.id, decoded(row.id, body, clips, mesh)] as const;
      }),
    ),
  );
