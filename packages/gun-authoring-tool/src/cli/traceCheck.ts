import { readdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { parseTraceRecord, resolveTraceReference } from '../gun/traceRecord.ts';

const PATH_SEPARATOR = /[\\/]/;
const LINK = /\]\(([^\s)]+)\)/g;

const inside = (root: string, file: string): string => {
  const path = resolve(root, file);
  if (isAbsolute(file) || relative(root, path).split(PATH_SEPARATOR).includes('..')) {
    throw new Error('Trace paths must stay inside their owning directory');
  }
  return path;
};

const cites = (document: string, documentPath: string, target: string): boolean =>
  [...document.matchAll(LINK)].some((match) => resolve(dirname(documentPath), match[1]!) === target);

export const checkTraceRecords = (packageRoot: string): string[] => {
  const root = resolve(packageRoot);
  const references = resolve(root, 'references');
  return readdirSync(references)
    .filter((file) => file.endsWith('.trace.json'))
    .sort()
    .flatMap((file) => {
      try {
        const path = resolve(references, file);
        const record = parseTraceRecord(JSON.parse(readFileSync(path, 'utf8')));
        const documentPath = inside(root, record.document);
        const document = readFileSync(documentPath, 'utf8');
        if (!cites(document, documentPath, path)) {
          throw new Error('Study document must link its trace record');
        }
        if (record.reference) {
          const svgPath = inside(references, record.reference.svg);
          if (!cites(document, documentPath, svgPath)) {
            throw new Error('Study document must link its trace SVG');
          }
          resolveTraceReference(record.reference, readFileSync(svgPath, 'utf8'));
        }
        return [];
      } catch (error) {
        return [`${file}: ${error instanceof Error ? error.message : String(error)}`];
      }
    });
};
