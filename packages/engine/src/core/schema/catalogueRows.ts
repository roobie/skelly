import { array, nonEmpty, pipe, strictObject } from 'valibot';
import { Id } from './primitives.ts';

/** A row of furniture ids for the debug showroom; any mod can add one without depending on the showroom's host. */
export const CatalogueRowSchema = strictObject({
  id: Id,
  furniture: pipe(array(Id), nonEmpty()),
});
