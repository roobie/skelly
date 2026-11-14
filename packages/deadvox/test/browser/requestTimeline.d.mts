import type { Server } from 'node:http';

export interface RequestTimeline {
  watchServer: (httpServer: Server) => void;
  watchPage: (page: { on: (event: string, listener: (request: never) => void) => unknown }) => void;
  format: () => string;
}

export function createRequestTimeline(options?: { now?: () => number }): RequestTimeline;
