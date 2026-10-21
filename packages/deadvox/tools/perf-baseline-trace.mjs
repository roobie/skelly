import { writeFile } from 'node:fs/promises';

export function traceCapture(session, path, categories) {
  let finish;
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

export async function startTrace(session, path, categories) {
  if (!Array.isArray(categories) || categories.length === 0) {
    throw new Error('Trace categories must be explicit in the workload config');
  }
  let complete;
  const completed = new Promise((resolve) => {
    complete = resolve;
  });
  session.once('Tracing.tracingComplete', complete);
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
