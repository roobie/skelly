import type { RenderedEngine, startPlay } from '@skelly/presentation/play';

/**
 * What a `play-test=1` page publishes as `skellyPlayTest`; see `src/main.ts`, `publishPlayTest`. Deadvox's main starts
 * play on a rendering engine, so the handle's engine renders.
 */
export type PlayTestHandle = ReturnType<Awaited<ReturnType<typeof startPlay>>['playTest']> & {
  readonly engine: RenderedEngine;
};
