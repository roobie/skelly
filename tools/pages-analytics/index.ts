import { readFileSync } from 'node:fs';

const ANALYTICS_SCRIPT = '<script async src="https://scripts.simpleanalyticscdn.com/latest.js"></script>';
// The badge art is white and pale teal, so the file wraps it in a dark footer that works on every page theme.
const BADGE = readFileSync(new URL('./badge.html', import.meta.url), 'utf8').trimEnd();

/** A page opts into the badge with this attribute on its body; game and full-viewport pages leave it off. */
export const BADGE_ATTRIBUTE = 'data-analytics-badge';
const BADGE_BODY = new RegExp(`<body\\b[^>]*\\s${BADGE_ATTRIBUTE}[\\s>=/]`);

/** Adds the analytics script to a page, and the badge footer when the page's body opts in. */
export const addPagesAnalytics = (html: string) => {
  if (!html.includes('</head>')) {
    throw new Error('Pages analytics requires a closing </head> tag');
  }
  const withScript = html.replace('</head>', `  ${ANALYTICS_SCRIPT}\n</head>`);
  if (!BADGE_BODY.test(html)) {
    return withScript;
  }
  if (!html.includes('</body>')) {
    throw new Error('Pages analytics badge requires a closing </body> tag');
  }
  return withScript.replace('</body>', `${BADGE}\n</body>`);
};

export const pagesAnalyticsPlugin = (enabled: boolean) => ({
  name: 'skelly:pages-analytics',
  apply: 'build' as const,
  transformIndexHtml(html: string) {
    return enabled ? addPagesAnalytics(html) : html;
  },
});
