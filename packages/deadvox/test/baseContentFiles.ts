import process from 'node:process';
import { admitPacks } from '../src/core/packAdmission.ts';
import { readBundledPacks, readStackContentFiles, readStackContentSources } from '../tools/readBundledPacks.ts';

const DEFAULT_STACK = 'skelly.deadvox';

export const baseContentFiles = () => readStackContentFiles(process.cwd(), DEFAULT_STACK);

export const baseContentSources = () => readStackContentSources(process.cwd(), DEFAULT_STACK);

/** The stack in admission order, as production builds it: block indices follow this order. */
export const startupContentSources = () => admitPacks(readBundledPacks(process.cwd(), DEFAULT_STACK)).sources;
