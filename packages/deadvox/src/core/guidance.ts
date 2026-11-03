import { INPUT_BINDINGS, POINTER_ACTIONS } from '../game/inputBindings.ts';
import type { Registry } from './content.ts';
import type { GuidanceDef } from './schema/guidance.ts';

const actionIds = new Set([...INPUT_BINDINGS, ...POINTER_ACTIONS].map(({ id }) => id));
type HintPart = GuidanceDef['steps'][number]['hints'][number]['parts'][number];

const itemPartReference = (part: HintPart): [string, string] | undefined => {
  if ('use' in part) {
    return ['use', part.use];
  }
  if ('itemName' in part) {
    return ['itemName', part.itemName];
  }
  if ('wieldItem' in part) {
    return ['wieldItem', part.wieldItem];
  }
  return undefined;
};

export const guidanceIssues = (guide: GuidanceDef, registry: Registry): [string, string][] => {
  const issues: [string, string][] = [];
  const item = (id: string, path: string) => {
    if (!registry.items.has(id)) {
      issues.push([path, `no item "${id}"`]);
    }
  };
  const action = (id: string, path: string) => {
    if (!actionIds.has(id)) {
      issues.push([path, `no input action "${id}"`]);
    }
  };
  for (const key of ['door', 'searched'] as const) {
    const id = guide.observe[key];
    if (id && !registry.furniture.has(id)) {
      issues.push([`.observe.${key}`, `no furniture "${id}"`]);
    }
  }
  guide.observe.hands?.forEach((id, i) => {
    item(id, `.observe.hands[${i}]`);
  });
  if (guide.observe.light) {
    item(guide.observe.light, '.observe.light');
  }
  guide.rules.forEach((rule, i) => {
    if ('item' in rule.when) {
      item(rule.when.item, `.rules[${i}].when.item`);
    }
  });
  guide.steps.forEach((step, i) => {
    step.topics.forEach((id, j) => {
      action(id, `.steps[${i}].topics[${j}]`);
    });
    step.hints.forEach((hint, j) => {
      const path = `.steps[${i}].hints[${j}]`;
      hint.when.held?.forEach((id, k) => {
        item(id, `${path}.when.held[${k}]`);
      });
      if (hint.when.carried) {
        item(hint.when.carried, `${path}.when.carried`);
      }
      hint.parts.forEach((part, k) => {
        const at = `${path}.parts[${k}]`;
        if ('action' in part) {
          action(part.action, `${at}.action`);
        }
        const reference = itemPartReference(part);
        if (reference) {
          item(reference[1], `${at}.${reference[0]}`);
        }
      });
    });
  });
  return issues;
};
