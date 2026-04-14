// Shared state management.
// - State.get / set / remove  →  localStorage (small values like theme)
// - State.largeGet / largeSet / largeRemove  →  IndexedDB (images, large arrays)

const State = (() => {
    // --- Small data: localStorage ---
    function get(key) { return localStorage.getItem(key); }
    function set(key, value) { localStorage.setItem(key, value); }
    function remove(key) { localStorage.removeItem(key); }

    // --- Large data: IndexedDB ---
    let _db = null;

    function openDB() {
        if (_db) return Promise.resolve(_db);
        return new Promise((resolve, reject) => {
            const req = indexedDB.open("rank-grid-db", 1);
            req.onupgradeneeded = () => req.result.createObjectStore("kv");
            req.onsuccess = () => { _db = req.result; resolve(_db); };
            req.onerror = () => reject(req.error);
        });
    }

    async function largeGet(key) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const req = db.transaction("kv", "readonly").objectStore("kv").get(key);
            req.onsuccess = () => resolve(req.result ?? null);
            req.onerror = () => reject(req.error);
        });
    }

    async function largeSet(key, value) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const req = db.transaction("kv", "readwrite").objectStore("kv").put(value, key);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }

    async function largeRemove(key) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const req = db.transaction("kv", "readwrite").objectStore("kv").delete(key);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }

    return { get, set, remove, largeGet, largeSet, largeRemove };
})();
