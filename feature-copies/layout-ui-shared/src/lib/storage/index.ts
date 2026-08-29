// ─── localStorage ─────────────────────────────────────────────────────────────
export { ls, LS_KEYS }          from "./localStorage";
export type { StorageMeta, StorageEntry, SetOptions, LSKey } from "./localStorage";

// ─── sessionStorage ───────────────────────────────────────────────────────────
export { ss, SS_KEYS, liveSession } from "./sessionStorage";
export type { SSKey }              from "./sessionStorage";

// ─── IndexedDB ────────────────────────────────────────────────────────────────
export {
  idb,
  IDB_STORES,
  answersIDB,
  transcriptsIDB,
  aiCacheIDB,
  analyticsIDB,
} from "./indexedDB";

export type { IDBStoreName, IDBSchema } from "./indexedDB";
