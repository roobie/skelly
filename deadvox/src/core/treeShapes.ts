// Own file so the content schema can pick from the keys without importing vegetation.ts's runtime graph.
export const TREE_SHAPES = ['broadleaf', 'conifer', 'young'] as const;

export type TreeShape = (typeof TREE_SHAPES)[number];
