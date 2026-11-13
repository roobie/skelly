import type { ColumnSource } from '../core/site.ts';
import type { Session } from './session.ts';

export const columnArrival = (session: Pick<Session, 'onColumn' | 'onColumnUnload'>, source: ColumnSource) => ({
  load: (cx: number, cz: number): void => session.onColumn(cx, cz, source),
  unload: (cx: number, cz: number): void => session.onColumnUnload(cx, cz),
});
