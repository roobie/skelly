import type { Server } from 'node:http';

interface TimelineRequest {
  url: () => string;
  isNavigationRequest: () => boolean;
  failure: () => { errorText: string } | null;
}

type RequestEvent = 'request' | 'requestfinished' | 'requestfailed';

interface TimelinePage {
  on: (event: RequestEvent, listener: (request: TimelineRequest) => void) => unknown;
}

export interface RequestTimeline {
  watchServer: (httpServer: Server) => void;
  watchPage: (page: TimelinePage) => void;
  format: () => string;
}

export function createRequestTimeline(): RequestTimeline;
