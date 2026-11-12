import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { addPagesAnalytics } from '../pagesAnalyticsPlugin.ts';

// Static pages are not built by Vite, so publication runs them through the same injection the builds use.
for (const file of process.argv.slice(2)) {
  writeFileSync(file, addPagesAnalytics(readFileSync(file, 'utf8')));
}
