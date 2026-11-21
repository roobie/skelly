export interface CellWorldWork {
  readonly cell: [number, number, number];
  readonly block: string;
  readonly epoch: number;
  readonly operation: 'repair' | 'take_apart';
}
