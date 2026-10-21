import type { NeutralModel } from '@skelly/thing-core/schema';
import {
  array,
  check,
  type InferOutput,
  nonEmpty,
  optional,
  parse,
  pipe,
  regex,
  strictObject,
  string,
  unknown,
} from 'valibot';

const RowSchema = strictObject({
  id: pipe(string(), regex(/^[a-z][a-z0-9_]*$/)),
  kind: pipe(string(), nonEmpty()),
  source: pipe(string(), nonEmpty()),
  options: optional(unknown()),
});
const RecipeSchema = pipe(
  array(RowSchema),
  nonEmpty(),
  check((rows) => new Set(rows.map(({ id }) => id)).size === rows.length, 'duplicate export id'),
);
export type RecipeRow = InferOutput<typeof RowSchema>;
export interface ModelExport<Model extends NeutralModel = NeutralModel> {
  readonly modelEntry: Model;
  readonly glb: Uint8Array;
}
export interface RecipeExport<Model extends NeutralModel = NeutralModel> {
  readonly id: string;
  readonly kind: string;
  readonly source: string;
  readonly generate: () => ModelExport<Model>;
}
export const recipeAsset = ({ id }: RecipeRow) => ({ id, file: `assets/models/${id}.glb` as const });
export const recipeOptions = (row: RecipeRow) => (row.options === undefined ? {} : row.options);
const contextual = <T>(row: RecipeRow, work: () => T): T => {
  try {
    return work();
  } catch (error) {
    throw new Error(
      `Export ${row.id} (${row.kind}, ${row.source}): ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
};
export const loadRecipe = <Model extends NeutralModel>(
  value: unknown,
  exporters: Readonly<Record<string, (row: RecipeRow) => () => ModelExport<Model>>>,
): readonly RecipeExport<Model>[] =>
  parse(RecipeSchema, value).map((row) =>
    contextual(row, () => {
      if (!Object.hasOwn(exporters, row.kind)) {
        throw new Error('unknown export kind');
      }
      const generate = exporters[row.kind]!(row);
      return { id: row.id, kind: row.kind, source: row.source, generate: () => contextual(row, generate) };
    }),
  );
