const DATABASE_NAME = 'time-keyword-memory-derived-cache';
const STORE_NAME = 'entries';
const DATABASE_VERSION = 1;

export class IndexedDbCacheAdapter {
    #databasePromise = null;

    constructor({ indexedDB = globalThis.indexedDB } = {}) {
        if (!indexedDB || typeof indexedDB.open !== 'function') {
            throw new Error('IndexedDB 不可用。');
        }
        this.indexedDB = indexedDB;
    }

    #open() {
        if (this.#databasePromise) return this.#databasePromise;
        this.#databasePromise = new Promise((resolve, reject) => {
            const request = this.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
            request.onupgradeneeded = () => {
                const database = request.result;
                if (!database.objectStoreNames.contains(STORE_NAME)) {
                    database.createObjectStore(STORE_NAME);
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error ?? new Error('打开 IndexedDB 失败。'));
        });
        return this.#databasePromise;
    }

    async #request(mode, action) {
        const database = await this.#open();
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(STORE_NAME, mode);
            const request = action(transaction.objectStore(STORE_NAME));
            request.onsuccess = () => resolve(request.result ?? null);
            request.onerror = () => reject(request.error ?? new Error('IndexedDB 操作失败。'));
            transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB 事务已中止。'));
        });
    }

    get(key) {
        return this.#request('readonly', store => store.get(key));
    }

    async set(key, value) {
        await this.#request('readwrite', store => store.put(value, key));
    }

    async delete(key) {
        await this.#request('readwrite', store => store.delete(key));
    }
}
