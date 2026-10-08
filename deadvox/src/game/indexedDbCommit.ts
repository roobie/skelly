export const createDurableWriteTransaction = (database: IDBDatabase, store: string): IDBTransaction =>
  database.transaction(store, 'readwrite', { durability: 'strict' });

export const transactionDone = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('Save IndexedDB transaction aborted'));
    transaction.onerror = () => reject(transaction.error ?? new Error('Save IndexedDB transaction failed'));
  });
