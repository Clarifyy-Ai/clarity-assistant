// ─────────────────────────────────────────────────────────────────────────────
// indexedDB.ts — IndexedDB wrapper for large structured data storage.
// Used for answer bank, transcript history, offline AI responses,
// session recordings, and document caches that exceed localStorage limits.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Constants ────────────────────────────────────────────────────────────────

const DB_NAME    = "clarity-assistant";
const DB_VERSION = 1;

// ─── Store Names ──────────────────────────────────────────────────────────────

export const IDB_STORES = {
  ANSWERS:       "answers",        // saved AI answers
  TRANSCRIPTS:   "transcripts",    // session transcripts
  DOCUMENTS:     "documents",      // resume/JD document cache
  AI_CACHE:      "ai_cache",       // offline AI response cache
  AUDIO_CHUNKS:  "audio_chunks",   // raw audio buffer cache
  SESSIONS:      "sessions",       // full session snapshots
  ANALYTICS:     "analytics",      // offline analytics queue
} as const;

export type IDBStoreName = (typeof IDB_STORES)[keyof typeof IDB_STORES];

// ─── Schema ───────────────────────────────────────────────────────────────────

export interface IDBSchema {
  [IDB_STORES.ANSWERS]: {
    id:         string;
    sessionId:  string;
    question:   string;
    answer:     string;
    model:      string;
    createdAt:  number;
    tags:       string[];
  };
  [IDB_STORES.TRANSCRIPTS]: {
    id:         string;
    sessionId:  string;
    chunks:     Array<{ text: string; timestamp: number; speaker?: string }>;
    fullText:   string;
    createdAt:  number;
    durationMs: number;
  };
  [IDB_STORES.DOCUMENTS]: {
    id:         string;
    userId:     string;
    type:       "resume" | "jd" | "other";
    name:       string;
    content:    string;
    blob?:      Blob;
    updatedAt:  number;
  };
  [IDB_STORES.AI_CACHE]: {
    key:        string;   // hash of prompt
    response:   string;
    model:      string;
    createdAt:  number;
    expiresAt:  number;
  };
  [IDB_STORES.AUDIO_CHUNKS]: {
    id:         string;
    sessionId:  string;
    data:       ArrayBuffer;
    timestamp:  number;
    sampleRate: number;
  };
  [IDB_STORES.SESSIONS]: {
    id:         string;
    userId:     string;
    snapshot:   unknown;
    savedAt:    number;
    synced:     boolean;
  };
  [IDB_STORES.ANALYTICS]: {
    id:         string;
    event:      string;
    properties: Record<string, unknown>;
    timestamp:  number;
    synced:     boolean;
  };
}

// ─── DB Connection ────────────────────────────────────────────────────────────

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("[IndexedDB] Not available in this environment."));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      dbPromise = null;
      reject(new Error(`[IndexedDB] Failed to open: ${request.error?.message}`));
    };

    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // answers — indexed by sessionId
      if (!db.objectStoreNames.contains(IDB_STORES.ANSWERS)) {
        const store = db.createObjectStore(IDB_STORES.ANSWERS, { keyPath: "id" });
        store.createIndex("sessionId", "sessionId", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }

      // transcripts — indexed by sessionId
      if (!db.objectStoreNames.contains(IDB_STORES.TRANSCRIPTS)) {
        const store = db.createObjectStore(IDB_STORES.TRANSCRIPTS, { keyPath: "id" });
        store.createIndex("sessionId", "sessionId", { unique: false });
      }

      // documents — indexed by userId + type
      if (!db.objectStoreNames.contains(IDB_STORES.DOCUMENTS)) {
        const store = db.createObjectStore(IDB_STORES.DOCUMENTS, { keyPath: "id" });
        store.createIndex("userId",    "userId",    { unique: false });
        store.createIndex("type",      "type",      { unique: false });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }

      // ai_cache — keyed by prompt hash
      if (!db.objectStoreNames.contains(IDB_STORES.AI_CACHE)) {
        const store = db.createObjectStore(IDB_STORES.AI_CACHE, { keyPath: "key" });
        store.createIndex("expiresAt", "expiresAt", { unique: false });
      }

      // audio_chunks — indexed by sessionId
      if (!db.objectStoreNames.contains(IDB_STORES.AUDIO_CHUNKS)) {
        const store = db.createObjectStore(IDB_STORES.AUDIO_CHUNKS, { keyPath: "id" });
        store.createIndex("sessionId", "sessionId", { unique: false });
        store.createIndex("timestamp", "timestamp", { unique: false });
      }

      // sessions — indexed by userId + synced
      if (!db.objectStoreNames.contains(IDB_STORES.SESSIONS)) {
        const store = db.createObjectStore(IDB_STORES.SESSIONS, { keyPath: "id" });
        store.createIndex("userId", "userId", { unique: false });
        store.createIndex("synced", "synced", { unique: false });
      }

      // analytics — indexed by synced status
      if (!db.objectStoreNames.contains(IDB_STORES.ANALYTICS)) {
        const store = db.createObjectStore(IDB_STORES.ANALYTICS, { keyPath: "id" });
        store.createIndex("synced",    "synced",    { unique: false });
        store.createIndex("timestamp", "timestamp", { unique: false });
      }
    };
  });

  return dbPromise;
}

// ─── Generic CRUD Operations ──────────────────────────────────────────────────

async function withStore<T>(
  storeName: IDBStoreName,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx    = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);

    const request = operation(store);

    request.onsuccess = () => resolve(request.result);
    request.onerror   = () => reject(new Error(
      `[IndexedDB] ${mode} on "${storeName}" failed: ${request.error?.message}`
    ));

    tx.onerror = () => reject(new Error(
      `[IndexedDB] Transaction failed: ${tx.error?.message}`
    ));
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const idb = {
  /**
   * Add or update a record.
   */
  async put<S extends IDBStoreName>(
    store: S,
    record: IDBSchema[S]
  ): Promise<void> {
    await withStore(store, "readwrite", (s) => s.put(record));
  },

  /**
   * Get a record by primary key.
   */
  async get<S extends IDBStoreName>(
    store: S,
    key: string
  ): Promise<IDBSchema[S] | null> {
    const result = await withStore<IDBSchema[S]>(store, "readonly", (s) => s.get(key));
    return result ?? null;
  },

  /**
   * Get all records from a store.
   */
  async getAll<S extends IDBStoreName>(
    store: S
  ): Promise<IDBSchema[S][]> {
    return withStore<IDBSchema[S][]>(store, "readonly", (s) => s.getAll());
  },

  /**
   * Get records by an index value.
   * @example
   * const answers = await idb.getByIndex("answers", "sessionId", sessionId);
   */
  async getByIndex<S extends IDBStoreName>(
    store: S,
    indexName: string,
    value: IDBValidKey
  ): Promise<IDBSchema[S][]> {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const tx      = db.transaction(store, "readonly");
      const objStore = tx.objectStore(store);
      const index   = objStore.index(indexName);
      const request = index.getAll(value);

      request.onsuccess = () => resolve(request.result ?? []);
      request.onerror   = () => reject(new Error(
        `[IndexedDB] getByIndex "${store}.${indexName}" failed: ${request.error?.message}`
      ));
    });
  },

  /**
   * Delete a record by primary key.
   */
  async delete(store: IDBStoreName, key: string): Promise<void> {
    await withStore(store, "readwrite", (s) => s.delete(key));
  },

  /**
   * Delete all records in a store.
   */
  async clearStore(store: IDBStoreName): Promise<void> {
    await withStore(store, "readwrite", (s) => s.clear());
  },

  /**
   * Count records in a store.
   */
  async count(store: IDBStoreName): Promise<number> {
    return withStore<number>(store, "readonly", (s) => s.count());
  },

  /**
   * Check if a key exists.
   */
  async has(store: IDBStoreName, key: string): Promise<boolean> {
    const result = await idb.get(store, key);
    return result !== null;
  },

  /**
   * Batch put multiple records in one transaction.
   */
  async putBatch<S extends IDBStoreName>(
    store: S,
    records: IDBSchema[S][]
  ): Promise<void> {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      const s  = tx.objectStore(store);

      records.forEach((record) => s.put(record));

      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(new Error(
        `[IndexedDB] putBatch on "${store}" failed: ${tx.error?.message}`
      ));
    });
  },

  /**
   * Delete all records matching an index value.
   */
  async deleteByIndex(
    store: IDBStoreName,
    indexName: string,
    value: IDBValidKey
  ): Promise<number> {
    const db = await openDB();
    let count = 0;

    return new Promise((resolve, reject) => {
      const tx      = db.transaction(store, "readwrite");
      const objStore = tx.objectStore(store);
      const index   = objStore.index(indexName);
      const request = index.openCursor(IDBKeyRange.only(value));

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          cursor.delete();
          count++;
          cursor.continue();
        }
      };

      tx.oncomplete = () => resolve(count);
      tx.onerror    = () => reject(new Error(
        `[IndexedDB] deleteByIndex failed: ${tx.error?.message}`
      ));
    });
  },

  /**
   * Remove all expired records from the AI cache.
   */
  async purgeAICache(): Promise<number> {
    const db  = await openDB();
    const now = Date.now();
    let count = 0;

    return new Promise((resolve, reject) => {
      const tx      = db.transaction(IDB_STORES.AI_CACHE, "readwrite");
      const store   = tx.objectStore(IDB_STORES.AI_CACHE);
      const index   = store.index("expiresAt");
      const range   = IDBKeyRange.upperBound(now);
      const request = index.openCursor(range);

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          cursor.delete();
          count++;
          cursor.continue();
        }
      };

      tx.oncomplete = () => resolve(count);
      tx.onerror    = () => reject(tx.error);
    });
  },

  /**
   * Get all unsynced records (analytics, sessions) for background sync.
   */
  async getUnsynced<S extends typeof IDB_STORES.ANALYTICS | typeof IDB_STORES.SESSIONS>(
    store: S
  ): Promise<IDBSchema[S][]> {
    return idb.getByIndex(store, "synced", 0);  // IDB stores false as 0
  },

  /**
   * Mark a record as synced.
   */
  async markSynced(
    store: typeof IDB_STORES.ANALYTICS | typeof IDB_STORES.SESSIONS,
    id: string
  ): Promise<void> {
    const record = await idb.get(store, id);
    if (record) {
      await idb.put(store, { ...record, synced: true } as IDBSchema[typeof store]);
    }
  },

  /**
   * Wipe the entire IndexedDB database.
   */
  async nukeDatabase(): Promise<void> {
    dbPromise = null;
    if (typeof window === "undefined") return;

    return new Promise((resolve, reject) => {
      const request = window.indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess = () => resolve();
      request.onerror   = () => reject(request.error);
    });
  },
};

// ─── Domain-Specific Helpers ──────────────────────────────────────────────────

export const answersIDB = {
  save:           (record: IDBSchema["answers"]) => idb.put(IDB_STORES.ANSWERS, record),
  getById:        (id: string) => idb.get(IDB_STORES.ANSWERS, id),
  getBySession:   (sessionId: string) => idb.getByIndex(IDB_STORES.ANSWERS, "sessionId", sessionId),
  delete:         (id: string) => idb.delete(IDB_STORES.ANSWERS, id),
  deleteForSession: (sessionId: string) => idb.deleteByIndex(IDB_STORES.ANSWERS, "sessionId", sessionId),
};

export const transcriptsIDB = {
  save:         (record: IDBSchema["transcripts"]) => idb.put(IDB_STORES.TRANSCRIPTS, record),
  getById:      (id: string) => idb.get(IDB_STORES.TRANSCRIPTS, id),
  getBySession: (sessionId: string) => idb.getByIndex(IDB_STORES.TRANSCRIPTS, "sessionId", sessionId),
  delete:       (id: string) => idb.delete(IDB_STORES.TRANSCRIPTS, id),
};

export const aiCacheIDB = {
  get:   (key: string) => idb.get(IDB_STORES.AI_CACHE, key),
  set:   (record: IDBSchema["ai_cache"]) => idb.put(IDB_STORES.AI_CACHE, record),
  purge: () => idb.purgeAICache(),
};

export const analyticsIDB = {
  queue:      (record: IDBSchema["analytics"]) => idb.put(IDB_STORES.ANALYTICS, record),
  getUnsynced: () => idb.getUnsynced(IDB_STORES.ANALYTICS),
  markSynced: (id: string) => idb.markSynced(IDB_STORES.ANALYTICS, id),
};
