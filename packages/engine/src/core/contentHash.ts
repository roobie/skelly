import { canonicalJson } from './canonicalJson.ts';
import type { ContentSource } from './content.ts';

export const contentSourceKey = (sources: readonly ContentSource[]): string =>
  canonicalJson(sources.map(({ source, data }) => [source, data]));

export const contentDigest = async (key: string): Promise<string> => {
  const hash = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};
