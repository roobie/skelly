import { html, render } from 'lit-html';
import { getBuildRevision } from '../core/buildInfo.ts';
import type { HandBackFile } from '../game/playtestTools.ts';
import { listenForFactDetailPlacement } from './factDetailPlacement.ts';
import { isOwnError } from './ownError.ts';

export interface ErrorReportContext {
  readonly seed: number;
  readonly site: string;
  readonly clockText: () => string;
  readonly stop: () => void;
  readonly metricsFile?: () => HandBackFile;
  readonly replayFile?: () => Promise<HandBackFile>;
}

export interface ErrorDetails {
  readonly message: string;
  readonly stack?: string;
}

export interface ErrorReportTextOptions {
  readonly details: ErrorDetails;
  readonly context: ErrorReportContext | undefined;
  readonly userAgent: string;
  readonly revision: string;
  readonly occurredAt: Date;
}

export const errorDetails = (value: unknown): ErrorDetails => {
  if (value instanceof Error) {
    return { message: value.message || value.name, ...(value.stack ? { stack: value.stack } : {}) };
  }
  return { message: String(value) };
};

export const errorText = (details: ErrorDetails): string =>
  [details.message, details.stack && details.stack !== details.message ? details.stack : undefined]
    .filter(Boolean)
    .join('\n');

const GITHUB_URL_LIMIT = 7000;

export const feedbackUrlForError = (text: string, sourceHref: string): { href: string; attachReport: boolean } => {
  const url = new URL(sourceHref);
  url.searchParams.set('title', `Game error: ${text.split('\n', 1)[0]!.slice(0, 100)}`);
  url.searchParams.set(
    'body',
    `The game encountered an error.\n\nPlease attach the downloaded error report.\n\n\`\`\`text\n${text}\n\`\`\``,
  );
  if (url.href.length <= GITHUB_URL_LIMIT) {
    return { href: url.href, attachReport: false };
  }
  return { href: sourceHref, attachReport: true };
};

export const errorReportText = async ({
  details,
  context,
  userAgent,
  revision,
  occurredAt,
}: ErrorReportTextOptions): Promise<string> => {
  const playtest: Record<string, unknown> = {};
  if (context?.metricsFile) {
    try {
      playtest.metrics = JSON.parse(await context.metricsFile().blob.text());
    } catch {
      playtest.metricsUnavailable = true;
    }
  }
  if (context?.replayFile) {
    try {
      playtest.replay = JSON.parse(await (await context.replayFile()).blob.text());
    } catch {
      playtest.replayUnavailable = true;
    }
  }
  let world: { seed: number; site: string; clock: string | null } | null = null;
  if (context) {
    let clock: string | null = null;
    try {
      clock = context.clockText();
    } catch {
      clock = null;
    }
    world = { seed: context.seed, site: context.site, clock };
  }
  return `${JSON.stringify(
    {
      error: { message: details.message, stack: details.stack ?? null },
      occurredAt: occurredAt.toISOString(),
      buildRevision: revision,
      world,
      userAgent,
      playtest,
    },
    null,
    2,
  )}\n`;
};

let reportContext: ErrorReportContext | undefined;
let shown = false;

export const setErrorReportContext = (context: ErrorReportContext): void => {
  reportContext = context;
};

export const installErrorReportHandler = (): void => {
  // The static facts in the panel are never rendered through `factDetail()`, so placement starts here.
  listenForFactDetailPlacement();
  const panel = document.getElementById('error-report');
  if (!panel) {
    throw new Error('Missing #error-report panel');
  }
  const textNode = panel.querySelector<HTMLElement>('[data-error-text]')!;
  const copyButton = panel.querySelector<HTMLButtonElement>('[data-error-copy]')!;
  const downloadButton = panel.querySelector<HTMLButtonElement>('[data-error-download]')!;
  const downloadLink = panel.querySelector<HTMLAnchorElement>('[data-error-download-link]')!;
  const feedbackLink = panel.querySelector<HTMLAnchorElement>('[data-error-feedback]')!;
  const feedbackSource = document.querySelector<HTMLAnchorElement>('#playtest-feedback');
  const status = panel.querySelector<HTMLElement>('[data-error-status]')!;
  if (!feedbackSource) {
    throw new Error('Missing #playtest-feedback link');
  }
  let currentDetails: ErrorDetails | undefined;
  let currentText = '';

  const show = (reason: unknown): void => {
    if (shown) {
      return;
    }
    shown = true;
    currentDetails = errorDetails(reason);
    currentText = errorText(currentDetails);
    try {
      reportContext?.stop();
    } catch {
      // Showing the report must not fail while stopping a broken game.
    }
    render(html`${currentText}`, textNode);
    const feedback = feedbackUrlForError(currentText, feedbackSource.href);
    feedbackLink.href = feedback.href;
    for (const sibling of panel.parentElement?.children ?? []) {
      if (sibling !== panel && sibling instanceof HTMLElement) {
        sibling.inert = true;
      }
    }
    panel.hidden = false;
    document.getElementById('error-report-title')?.focus();
    render(html`${feedback.attachReport ? 'Error exceeds feedback URL limit.' : ''}`, status);
  };

  globalThis.addEventListener('error', (event) => {
    if (isOwnError(event, location.origin)) {
      show(event.error ?? event.message);
    }
  });
  globalThis.addEventListener('unhandledrejection', (event) => {
    if (isOwnError(event, location.origin)) {
      show(event.reason);
    }
  });
  copyButton.addEventListener('click', async () => {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard unavailable');
      }
      await navigator.clipboard.writeText(currentText);
      render(html`Full error text copied.`, status);
    } catch {
      render(html`Clipboard access failed.`, status);
    }
  });
  downloadButton.addEventListener('click', async () => {
    if (!currentDetails) {
      return;
    }
    try {
      const contents = await errorReportText({
        details: currentDetails,
        context: reportContext,
        userAgent: navigator.userAgent,
        revision: getBuildRevision(),
        occurredAt: new Date(),
      });
      const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
      downloadLink.href = url;
      downloadLink.download = 'deadvox-error-report.json';
      downloadLink.click();
      URL.revokeObjectURL(url);
      render(html`Error report downloaded.`, status);
    } catch {
      render(html`Could not create the error report.`, status);
    }
  });
};
