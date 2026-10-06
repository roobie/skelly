const ANALYTICS_SCRIPT = '<script async src="https://scripts.simpleanalyticscdn.com/latest.js"></script>';

export const pagesAnalyticsPlugin = (enabled: boolean) => ({
  name: 'skelly:pages-analytics',
  apply: 'build' as const,
  transformIndexHtml(html: string) {
    if (!enabled) {
      return html;
    }
    return html.replace('</head>', `  ${ANALYTICS_SCRIPT}\n</head>`);
  },
});
