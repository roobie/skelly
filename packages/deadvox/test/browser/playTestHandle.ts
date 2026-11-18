import type { Engine, RenderedEngine, startPlay } from '@skelly/presentation/play';

/** What a `play-test=1` page publishes as `skellyPlayTest`; see `src/main.ts`, `publishPlayTest`. */
export type PlayTestHandle = ReturnType<Awaited<ReturnType<typeof startPlay>>['playTest']>;

const isRendered = (engine: Engine): engine is RenderedEngine =>
  engine.renderer !== undefined && engine.mood !== undefined && engine.shadows !== undefined;

/** The engine of a page that renders; a render-free (`render=0`) page starts play without renderer, mood or shadows. */
export const renderedEngine = (engine: Engine): RenderedEngine => {
  if (!isRendered(engine)) {
    throw new Error('This check needs a rendering page; drop render=0');
  }
  return engine;
};
