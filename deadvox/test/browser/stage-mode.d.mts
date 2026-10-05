export type BrowserStageMode = 'pixel' | 'render-free';

export function browserStageMode(stage: string, override?: BrowserStageMode): BrowserStageMode;
export function browserStageArgs(stage: string, extra?: string[], override?: BrowserStageMode): string[];
export function browserStageUrl(stage: string, address: string, override?: BrowserStageMode): string;
