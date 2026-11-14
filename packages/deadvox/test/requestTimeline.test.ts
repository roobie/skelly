import { createServer, request, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { createRequestTimeline } from './browser/requestTimeline.mjs';

const get = (port: number, path: string, headers: Record<string, string>) =>
  new Promise<void>((resolve) => {
    const outgoing = request({ port, path, headers }, (response) => {
      response.resume();
      response.on('end', resolve);
    });
    outgoing.on('error', () => resolve());
    outgoing.end();
  });

describe('request timeline', () => {
  it('names a document request the server received but never answered, and ignores subresources', async () => {
    const timeline = createRequestTimeline();
    const held: ServerResponse[] = [];
    const server = createServer((_, response) => {
      if (_.url === '/held') {
        held.push(response);
        return;
      }
      response.end('ok');
    });
    timeline.watchServer(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    await get(port, '/answered', { 'sec-fetch-dest': 'document' });
    await get(port, '/script.js', { 'sec-fetch-dest': 'script' });
    const heldRequest = get(port, '/held', { 'sec-fetch-dest': 'document' });
    await new Promise<void>((resolve) => {
      const poll = () => (held.length > 0 ? resolve() : setImmediate(poll));
      poll();
    });

    const output = timeline.format();
    for (const response of held) {
      response.destroy();
    }
    await Promise.all([heldRequest, new Promise((resolve) => server.close(resolve))]);

    expect(output).toContain('"event":"answered"');
    expect(output).not.toContain('script.js');
    const summary = JSON.parse(output.split('REQUEST_TIMELINE_SUMMARY ')[1] ?? '{}');
    expect(summary.serverUnanswered).toEqual(['/held']);
  });
});
