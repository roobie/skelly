import { safeParse } from 'valibot';
import type { Registry } from './content.ts';
import { type ActorBody, ActorBodySchema, type ActorClips, ActorClipsSchema } from './schema/actors.ts';

export interface ActorFigureFile {
  readonly body: ActorBody;
  readonly clips: ActorClips;
}

/** Decoded figure files keyed by figure row id; built once per session start, before the first tick. */
export type ActorFigureFiles = ReadonlyMap<string, ActorFigureFile>;

/** One declared file of a figure row, named by the content file that declares the row and the pack path. */
export type FigureFileRead<T> = (contentFile: string, path: string) => T;

const decoded = (id: string, bodyData: unknown, clipsData: unknown): ActorFigureFile => {
  const body = safeParse(ActorBodySchema, bodyData);
  const clips = safeParse(ActorClipsSchema, clipsData);
  if (!(body.success && clips.success)) {
    const first = (body.success ? undefined : body.issues[0]) ?? (clips.success ? undefined : clips.issues[0]);
    throw new Error(`Actor figure ${id}: ${first?.message ?? 'invalid figure files'}`);
  }
  return { body: body.output, clips: clips.output };
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
export const readActorFigureFiles = (registry: Registry, read: FigureFileRead<unknown>): ActorFigureFiles =>
  new Map(
    figureRows(registry).map(({ row, source }) => [
      row.id,
      decoded(row.id, read(source, row.body), read(source, row.clips)),
    ]),
  );

/** Every figure row of the registry, fetched concurrently; the browser awaits it before the session starts. */
export const loadActorFigureFiles = async (
  registry: Registry,
  read: FigureFileRead<Promise<unknown>>,
): Promise<ActorFigureFiles> =>
  new Map(
    await Promise.all(
      figureRows(registry).map(
        async ({ row, source }) =>
          [row.id, decoded(row.id, ...(await Promise.all([read(source, row.body), read(source, row.clips)])))] as const,
      ),
    ),
  );
