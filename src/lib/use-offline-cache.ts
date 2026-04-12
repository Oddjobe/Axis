"use client"

const DB_NAME = 'axis-africa-cache';
const DB_VERSION = 1;
const STORE_NAME = 'data-cache';
const CACHE_VERSION_KEY = '__cache_version__';
const CURRENT_CACHE_VERSION = '3.1'; // Bump when data shape changes

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
            reject(new Error('IndexedDB not available'));
            return;
        }
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function getFromIDB<T>(key: string): Promise<T | null> {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            
            // Check cache version first
            const versionReq = store.get(CACHE_VERSION_KEY);
            versionReq.onsuccess = () => {
                if (versionReq.result !== CURRENT_CACHE_VERSION) {
                    resolve(null); // Cache version mismatch, treat as miss
                    return;
                }
                const dataReq = store.get(key);
                dataReq.onsuccess = () => resolve(dataReq.result ?? null);
                dataReq.onerror = () => reject(dataReq.error);
            };
            versionReq.onerror = () => resolve(null);
        });
    } catch {
        return null;
    }
}

async function setInIDB<T>(key: string, value: T): Promise<void> {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            store.put(CURRENT_CACHE_VERSION, CACHE_VERSION_KEY);
            store.put(value, key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    } catch {
        // Silently fail
    }
}

export async function cacheData<T>(key: string, data: T): Promise<void> {
    await setInIDB(key, { data, timestamp: Date.now() });
}

export async function getCachedData<T>(key: string, maxAgeMs: number = 86400000): Promise<T | null> {
    const cached = await getFromIDB<{ data: T; timestamp: number }>(key);
    if (!cached) return null;
    if (Date.now() - cached.timestamp > maxAgeMs) return null;
    return cached.data;
}
