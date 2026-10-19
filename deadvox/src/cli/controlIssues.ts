// Default keys name input actions, which live in game code. The simulation graph under
// src/core must not import them, so these checks run beside the validate CLI instead.
import type { ContentIssue, Registry } from '../core/content.ts';
import { type BindingMap, controlRowIssue, defaultKeySetIssues } from '../game/inputBindings.ts';

/** `baseSources` are the sources of the base pack; the game reads default keys from nowhere else. */
export const controlIssues = (
  registry: Registry,
  origins: ReadonlyMap<string, { source: string; path: string }>,
  baseSources: ReadonlySet<string>,
): ContentIssue[] => {
  const issues: ContentIssue[] = [];
  const valid = new Map<string, BindingMap extends ReadonlyMap<string, infer Keys> ? Keys : never>();
  for (const control of registry.controls.values()) {
    const origin = origins.get(`controls:${control.id}`)!;
    const message = baseSources.has(origin.source)
      ? controlRowIssue(control.id, control.keys)
      : "only the base pack sets default keys; mods can't yet";
    if (message) {
      issues.push({ source: origin.source, path: origin.path, message });
    } else {
      valid.set(control.id, control.keys);
    }
  }
  for (const message of defaultKeySetIssues(valid)) {
    issues.push({ source: 'core content', path: 'controls', message });
  }
  return issues;
};
