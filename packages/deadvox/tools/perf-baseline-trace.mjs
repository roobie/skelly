import { writeFile } from 'node:fs/promises';

/** @typedef {{ stream?: string; dataLossOccurred?: boolean }} TracingComplete */
/** @typedef {{ data: string; base64Encoded?: boolean; eof: boolean }} TraceChunk */
/**
 * The DevTools commands a trace drives; a Playwright CDP session satisfies it.
 * @typedef {object} TraceSession
 * @property {(event: 'Tracing.tracingComplete', listener: (payload: TracingComplete) => void) => unknown} once
 * @property {{
 *   (method: 'Tracing.start', params: { categories: string; transferMode: 'ReturnAsStream' }): Promise<unknown>;
 *   (method: 'Tracing.end'): Promise<unknown>;
 *   (method: 'IO.read', params: { handle: string }): Promise<TraceChunk>;
 *   (method: 'IO.close', params: { handle: string }): Promise<unknown>;
 * }} send
 */

/**
 * @param {TraceSession | null} session
 * @param {string} path
 * @param {readonly string[]} categories
 */
export function traceCapture(session, path, categories) {
  /** @type {(() => Promise<void>) | null} */
  let finish = null;
  return {
    async start() {
      if (session) {
        finish = await startTrace(session, path, categories);
      }
    },
    async stop() {
      const stop = finish;
      finish = null;
      await stop?.();
    },
  };
}

/**
 * @param {TraceSession} session
 * @param {string} path
 * @param {readonly string[]} categories
 */
export async function startTrace(session, path, categories) {
  if (!Array.isArray(categories) || categories.length === 0) {
    throw new Error('Trace categories must be explicit in the workload config');
  }
  /** @type {Promise<TracingComplete>} */
  const completed = new Promise((resolve) => {
    session.once('Tracing.tracingComplete', resolve);
  });
  await session.send('Tracing.start', {
    categories: categories.join(','),
    transferMode: 'ReturnAsStream',
  });
  return async () => {
    await session.send('Tracing.end');
    const { stream, dataLossOccurred } = await completed;
    if (!stream) {
      throw new Error('Incomplete Chrome trace');
    }
    const chunks = [];
    try {
      if (dataLossOccurred) {
        throw new Error('Incomplete Chrome trace');
      }
      for (;;) {
        const { data, base64Encoded, eof } = await session.send('IO.read', { handle: stream });
        chunks.push(Buffer.from(data, base64Encoded ? 'base64' : 'utf8'));
        if (eof) {
          break;
        }
      }
      await writeFile(path, Buffer.concat(chunks));
    } finally {
      await session.send('IO.close', { handle: stream });
    }
  };
}
