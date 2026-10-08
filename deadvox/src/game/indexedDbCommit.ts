export const createDurableWriteTransaction = (database: IDBDatabase, store: string): IDBTransaction =>
  database.transaction(store, 'readwrite', { durability: 'strict' });
