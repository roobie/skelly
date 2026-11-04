import process from 'node:process';
import { readStackContentFiles, readStackContentSources } from '../tools/readBundledPacks.ts';

const DEFAULT_STACK = 'skelly.deadvox';

export const baseContentFiles = () => readStackContentFiles(process.cwd(), DEFAULT_STACK);

export const baseContentSources = () => readStackContentSources(process.cwd(), DEFAULT_STACK);
