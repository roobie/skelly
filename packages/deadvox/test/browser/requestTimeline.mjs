// Failure-only request timeline; the reason is in `docs/browser-ci.md`, "Browser CI ownership and evidence".
/** @import * as Declared from './requestTimeline.d.mts' */
/**
 * @typedef {{ url: string | undefined, method?: string | undefined, status?: number, failure?: string | undefined }} Detail
 * @typedef {{ at: number, side: 'server' | 'browser', id: number, event: string } & Detail} Entry
 */

const MAX_ENTRIES = 256;

/** @type {typeof Declared.createRequestTimeline} */
export const createRequestTimeline = () => {
  /** @type {Entry[]} */
  const entries = [];
  /**
   * @param {Entry['side']} side
   * @param {number} id
   * @param {string} event
   * @param {Detail} detail
   */
  const record = (side, id, event, detail) => {
    entries.push({ at: Date.now(), side, id, event, ...detail });
    if (entries.length > MAX_ENTRIES) {
      entries.shift();
    }
  };
  let serverRequests = 0;
  let browserRequests = 0;

  /** @type {Declared.RequestTimeline['watchServer']} */
  const watchServer = (httpServer) => {
    httpServer.on('request', (request, response) => {
      if (request.headers['sec-fetch-dest'] !== 'document') {
        return;
      }
      serverRequests += 1;
      const id = serverRequests;
      record('server', id, 'received', { url: request.url, method: request.method });
      response.on('finish', () => record('server', id, 'answered', { url: request.url, status: response.statusCode }));
      response.on('close', () => {
        if (!response.writableFinished) {
          record('server', id, 'closed-unanswered', { url: request.url });
        }
      });
    });
  };

  /** @type {Declared.RequestTimeline['watchPage']} */
  const watchPage = (page) => {
    /** @type {WeakMap<Declared.TimelineRequest, number>} */
    const ids = new WeakMap();
    page.on('request', (request) => {
      if (request.isNavigationRequest()) {
        browserRequests += 1;
        ids.set(request, browserRequests);
        record('browser', browserRequests, 'sent', { url: request.url() });
      }
    });
    page.on('requestfinished', (request) => {
      const id = ids.get(request);
      if (id !== undefined) {
        record('browser', id, 'finished', { url: request.url() });
      }
    });
    page.on('requestfailed', (request) => {
      const id = ids.get(request);
      if (id !== undefined) {
        record('browser', id, 'failed', { url: request.url(), failure: request.failure()?.errorText });
      }
    });
  };

  const unanswered = () => {
    const answered = new Set(
      entries.filter((entry) => entry.side === 'server' && entry.event !== 'received').map((entry) => entry.id),
    );
    return entries.filter((entry) => entry.side === 'server' && entry.event === 'received' && !answered.has(entry.id));
  };

  const format = () =>
    [
      ...entries.map(
        (entry) => `REQUEST_TIMELINE ${JSON.stringify({ ...entry, at: new Date(entry.at).toISOString() })}`,
      ),
      `REQUEST_TIMELINE_SUMMARY ${JSON.stringify({ serverReceived: serverRequests, browserSent: browserRequests, serverPending: unanswered().map((entry) => entry.url) })}`,
    ].join('\n');

  return { watchServer, watchPage, format };
};
