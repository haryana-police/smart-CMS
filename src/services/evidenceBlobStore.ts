// src/services/evidenceBlobStore.ts
// Persistent binary blob store backed by IndexedDB and server-side evidence store.
// Solves localStorage quota limits by safely storing full-fidelity base64/blob files
// across page reloads, browser sessions, and route transitions.

const IDB_NAME = "cms_evidence_blob_store_v1";
const IDB_STORE = "evidence_blobs";
const IDB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function getDb(): Promise<IDBDatabase> {
  if (typeof window === "undefined" || !window.indexedDB) {
    return Promise.reject(new Error("IndexedDB is not available"));
  }

  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = window.indexedDB.open(IDB_NAME, IDB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE, { keyPath: "key" });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        console.warn("Error opening IndexedDB evidence blob store:", request.error);
        reject(request.error);
      };
    });
  }

  return dbPromise;
}

export interface StoredBlobRecord {
  key: string;
  dataUrl: string;
  mimeType?: string;
  fileName?: string;
  fileSize?: number | string;
  storedAt: string;
}

// In-memory fallback cache
const memoryBlobCache = new Map<string, string>();

export const evidenceBlobStore = {
  /**
   * Persistently store a dataUrl under one or more keys in IndexedDB and memory
   */
  async put(key: string, dataUrl: string, metadata?: { mimeType?: string; fileName?: string; fileSize?: number | string }): Promise<void> {
    if (!key || !dataUrl) return;

    // Cache in memory immediately


    try {
      const db = await getDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, "readwrite");
        const store = tx.objectStore(IDB_STORE);

        const record: StoredBlobRecord = {
          key,
          dataUrl,
          mimeType: metadata?.mimeType,
          fileName: metadata?.fileName,
          fileSize: metadata?.fileSize,
          storedAt: new Date().toISOString(),
        };

        store.put(record);

        tx.oncomplete = () => {memoryBlobCache.set(key,dataUrl);resolve();};
        tx.onabort = () => reject(tx.error || new Error("Evidence save aborted."));
        tx.onerror = () => {
          console.warn("Failed to store blob in IndexedDB:", tx.error);
          reject(tx.error || new Error("Evidence could not be saved."));
        };
      });
    } catch (err) {
      memoryBlobCache.delete(key);
      throw new Error("Evidence could not be saved. Check browser storage and retry.");
    }
  },

  /**
   * Retrieve a dataUrl by key from memory or IndexedDB
   */
  async get(key: string): Promise<string | null> {
    if (!key) return null;

    // Check memory cache first
    const mem = memoryBlobCache.get(key) || memoryBlobCache.get(key.toLowerCase().trim());
    if (mem && mem.length > 50) return mem;

    try {
      const db = await getDb();
      return new Promise((resolve) => {
        const tx = db.transaction(IDB_STORE, "readonly");
        const store = tx.objectStore(IDB_STORE);
        const req = store.get(key);

        req.onsuccess = () => {
          if (req.result?.dataUrl) {
            memoryBlobCache.set(key, req.result.dataUrl);
            resolve(req.result.dataUrl);
          } else {
            // Try normalized lowercase key
            const normKey = key.toLowerCase().trim();
            if (normKey !== key) {
              const req2 = store.get(normKey);
              req2.onsuccess = () => {
                if (req2.result?.dataUrl) {
                  memoryBlobCache.set(key, req2.result.dataUrl);
                  resolve(req2.result.dataUrl);
                } else {
                  resolve(null);
                }
              };
              req2.onerror = () => resolve(null);
            } else {
              resolve(null);
            }
          }
        };

        req.onerror = () => resolve(null);
      });
    } catch (err) {
      console.warn("IndexedDB get error:", err);
      return null;
    }
  },

  /**
   * Remove a blob from IndexedDB and memory
   */
  async delete(key: string): Promise<void> {
    if (!key) return;
    memoryBlobCache.delete(key);
    memoryBlobCache.delete(key.toLowerCase().trim());

    try {
      const db = await getDb();
      return new Promise((resolve) => {
        const tx = db.transaction(IDB_STORE, "readwrite");
        const store = tx.objectStore(IDB_STORE);
        store.delete(key);
        store.delete(key.toLowerCase().trim());
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch {
      // ignore
    }
  },

  /**
   * Convert a base64 DataURL to a high-compatibility native Blob URL for <iframe> viewing
   */
  createBlobUrl(dataUrl: string): string {
    if (!dataUrl) return "";
    if (dataUrl.startsWith("blob:") || dataUrl.startsWith("http")) return dataUrl;

    try {
      const commaIndex = dataUrl.indexOf(",");
      if (commaIndex === -1) return dataUrl;

      const header = dataUrl.slice(0, commaIndex);
      const payload = dataUrl.slice(commaIndex + 1);
      const mimeMatch = header.match(/:(.*?);/);
      const mimeType = mimeMatch ? mimeMatch[1] : "application/pdf";

      // Percent-encoded (URL-encoded) payloads — e.g. the registered complaint
      // docket `data:text/html;charset=utf-8,${encodeURIComponent(html)}` — are
      // NOT base64: atob() on them throws and silently degrades the preview.
      let bytes: Uint8Array<ArrayBuffer>;
      if (/;[ \t]*base64/i.test(header)) {
        const byteCharacters = atob(payload);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        bytes = new Uint8Array(byteNumbers);
      } else if (payload.includes("%")) {
        bytes = new TextEncoder().encode(decodeURIComponent(payload));
      } else {
        bytes = new TextEncoder().encode(payload);
      }
      const blob = new Blob([bytes], { type: mimeType });
      return URL.createObjectURL(blob);
    } catch (e) {
      console.warn("Could not create Blob URL from dataUrl:", e);
      return dataUrl;
    }
  },
};
