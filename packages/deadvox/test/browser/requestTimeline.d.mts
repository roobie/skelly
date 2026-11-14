import type { Server } from 'node:http';
import type { Page } from 'playwright';

export interface RequestTimeline {
  watchServer: (httpServer: Server) => void;
  watchPage: (page: Page) => void;
  format: () => string;
}

export function createRequestTimeline(): RequestTimeline;
