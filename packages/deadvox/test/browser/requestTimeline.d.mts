import type { IncomingMessage, ServerResponse } from 'node:http';

export interface TimelineRequest {
  url: () => string;
  isNavigationRequest: () => boolean;
  failure: () => { errorText: string } | null;
}

type RequestListener = (request: TimelineRequest) => void;

export interface TimelinePage {
  on: {
    // biome-ignore lint/style/useUnifiedTypeSignatures: one signature per event lets Playwright's per-event overloads assign.
    (event: 'request', listener: RequestListener): unknown;
    (event: 'requestfinished', listener: RequestListener): unknown;
    (event: 'requestfailed', listener: RequestListener): unknown;
  };
}

// Structural, so Vite's HTTP-or-HTTP/2 server union is assignable as well as a plain `node:http` server.
export interface TimelineServer {
  on: (event: 'request', listener: (request: IncomingMessage, response: ServerResponse) => void) => unknown;
}

export interface RequestTimeline {
  watchServer: (httpServer: TimelineServer) => void;
  watchPage: (page: TimelinePage) => void;
  format: () => string;
}

export function createRequestTimeline(): RequestTimeline;
