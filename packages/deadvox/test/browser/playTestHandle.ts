import type { startPlay } from '@skelly/presentation/play';

/** What a `play-test=1` page publishes as `skellyPlayTest`; see `src/main.ts`, `publishPlayTest`. */
export type PlayTestHandle = ReturnType<Awaited<ReturnType<typeof startPlay>>['playTest']>;
