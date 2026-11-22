// ============================================================================
// VOITH TURBO — PRECISION METROLOGY OS v11 • INDEXEDDB, DELTA TRACKER & UNDO
// ============================================================================
const VoithDB = (() => {
    const DB_NAME = 'voith_metrology_db_v11';
    const STORE = 'kv';
    let dbPromise = null;

    function open() {
        if (dbPromise) return dbPromise;
        if (typeof indexedDB === 'undefined') return Promise.resolve(null);
        dbPromise = new Promise((resolve) => {
            try {
                const req = indexedDB.open(DB_NAME, 1);
                req.onupgradeneeded = () => {
                    const db = req.result;
                    if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
                };
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => resolve(null);
            } catch { resolve(null); }
        });
        return dbPromise;
    }

    async function get(key) {
        const db = await open();
        if (!db) return null;
        return new Promise((resolve) => {
            try {
                const tx = db.transaction(STORE, 'readonly');
                const req = tx.objectStore(STORE).get(key);
                req.onsuccess = () => resolve(req.result !== undefined ? req.result : null);
                req.onerror = () => resolve(null);
            } catch { resolve(null); }
        });
    }

    async function set(key, value) {
        const db = await open();
        if (!db) return false;
        return new Promise((resolve) => {
            try {
                const tx = db.transaction(STORE, 'readwrite');
                tx.objectStore(STORE).put(value, key);
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => resolve(false);
            } catch { resolve(false); }
        });
    }

    async function loadSnapshot() {
        const [inst, hist, lost, lists, updatedAt] = await Promise.all([
            get('instrumentsData'),
            get('calibrationHistory'),
            get('lostInstrumentsData'),
            get('controlledLists'),
            get('lastServerUpdatedAt')
        ]);
        if (Array.isArray(inst) && inst.length > 0) {
            return { inst, hist: Array.isArray(hist) ? hist : [], lost: Array.isArray(lost) ? lost : [], lists, updatedAt: updatedAt || '' };
        }
        // Auto-migração transparente do localStorage legado (v10) para IndexedDB (v11)
        try {
            const lsInst = JSON.parse(safeGet(KEYS.inst) || 'null');
            if (Array.isArray(lsInst) && lsInst.length > 0) {
                const lsHist = JSON.parse(safeGet(KEYS.hist) || '[]') || [];
                const lsLost = JSON.parse(safeGet(KEYS.lost) || '[]') || [];
                await saveSnapshot(lsInst, lsHist, lsLost, controlledLists, '');
                return { inst: lsInst, hist: lsHist, lost: lsLost, lists: null, updatedAt: '' };
            }
        } catch {}
        return null;
    }

    async function saveSnapshot(inst, hist, lost, lists, updatedAt) {
        const db = await open();
        if (!db) {
            // Fallback seguro caso ambiente bloqueie IndexedDB
            safeSet(KEYS.inst, JSON.stringify(inst));
            safeSet(KEYS.hist, JSON.stringify(hist));
            safeSet(KEYS.lost, JSON.stringify(lost));
            return;
        }
        return new Promise((resolve) => {
            try {
                const tx = db.transaction(STORE, 'readwrite');
                const st = tx.objectStore(STORE);
                st.put(inst, 'instrumentsData');
                st.put(hist, 'calibrationHistory');
                st.put(lost, 'lostInstrumentsData');
                if (lists) st.put(lists, 'controlledLists');
                if (updatedAt !== undefined) st.put(updatedAt, 'lastServerUpdatedAt');
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => resolve(false);
            } catch { resolve(false); }
        });
    }

    return { get, set, loadSnapshot, saveSnapshot };
})();

// ---- Delta Change Tracker (envia apenas linhas alteradas ao Google Sheets!) ----
const DeltaTracker = {
    fullRequired: false,
    instUpsert: new Map(),
    instDelete: new Set(),
    histUpsert: new Map(),
    histDelete: new Set(),
    lostUpsert: new Map(),
    lostDelete: new Set(),

    markInstUpsert(items) {
        (Array.isArray(items) ? items : [items]).forEach(it => {
            if (!it || it.id === undefined) return;
            this.instDelete.delete(it.id);
            this.instUpsert.set(it.id, deepCloneFast(it));
        });
    },
    markInstDelete(ids) {
        (Array.isArray(ids) ? ids : [ids]).forEach(id => {
            this.instUpsert.delete(id);
            this.instDelete.add(id);
        });
    },
    markHistUpsert(items) {
        (Array.isArray(items) ? items : [items]).forEach(h => {
            if (!h) return;
            if (!h.id) h.id = Date.now() + Math.floor(Math.random() * 10000);
            this.histDelete.delete(h.id);
            this.histUpsert.set(h.id, deepCloneFast(h));
        });
    },
    markHistDelete(ids) {
        (Array.isArray(ids) ? ids : [ids]).forEach(id => {
            if (!id) return;
            this.histUpsert.delete(id);
            this.histDelete.add(id);
        });
    },
    markLostUpsert(items) {
        (Array.isArray(items) ? items : [items]).forEach(l => {
            if (!l) return;
            if (!l.id) l.id = Date.now() + Math.floor(Math.random() * 10000);
            this.lostDelete.delete(l.id);
            this.lostUpsert.set(l.id, deepCloneFast(l));
        });
    },
    markLostDelete(ids) {
        (Array.isArray(ids) ? ids : [ids]).forEach(id => {
            if (!id) return;
            this.lostUpsert.delete(id);
            this.lostDelete.add(id);
        });
    },
    markFullSyncRequired() {
        this.fullRequired = true;
    },
    hasDelta() {
        return !this.fullRequired && (
            this.instUpsert.size > 0 || this.instDelete.size > 0 ||
            this.histUpsert.size > 0 || this.histDelete.size > 0 ||
            this.lostUpsert.size > 0 || this.lostDelete.size > 0
        );
    },
    snapshotDelta() {
        return {
            instUpsert: [...this.instUpsert.values()],
            instDelete: [...this.instDelete],
            histUpsert: [...this.histUpsert.values()],
            histDelete: [...this.histDelete],
            lostUpsert: [...this.lostUpsert.values()],
            lostDelete: [...this.lostDelete]
        };
    },
    clear() {
        this.fullRequired = false;
        this.instUpsert.clear();
        this.instDelete.clear();
        this.histUpsert.clear();
        this.histDelete.clear();
        this.lostUpsert.clear();
        this.lostDelete.clear();
    }
};

function ensureHistoryIds() {
    let base = Date.now();
    calibrationHistory.forEach((h, i) => {
        if (!h.id) h.id = base + i;
    });
    lostInstrumentsData.forEach((l, i) => {
        if (!l.id) l.id = base + 5000 + i;
    });
}

// ---- Auditoria + Undo ----
function queueAudit(ev) {
    if (!isEditor()) return;
    const c = (v, m = 180) => String(v ?? '-').trim().slice(0, m) || '-';
    const entry = {
        timestamp: new Date().toISOString(),
        username: currentAuth.username || '',
        displayName: currentAuth.displayName || currentAuth.username || '',
        module: c(ev.module || 'Sistema', 60),
        action: c(ev.action || 'Alteração', 60),
        target: c(ev.target || '-', 80),
        field: c(ev.field || '-', 80),
        before: c(ev.before, 180),
        after: c(ev.after, 180),
        details: c(ev.details || '', 320)
    };
    pendingAuditEvents.push(entry);
    cachedAuditEvents.unshift(entry);
    if (pendingAuditEvents.length > 120) pendingAuditEvents.shift();
    if (cachedAuditEvents.length > 500) cachedAuditEvents.length = 500;
}

function pushUndo(label) {
    undoStack.push({
        label,
        inst: deepCloneFast(instrumentsData),
        hist: deepCloneFast(calibrationHistory),
        lost: deepCloneFast(lostInstrumentsData)
    });
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    updateUndoUI();
}
function syncMobileStatusStrip() {
    const strip = document.getElementById('mobStatusStrip');
    if (!strip) return;
    const simOn = currentRefISO && currentRefISO !== getTodayISO();
    const undoOn = undoStack.length > 0 && isEditor();
    strip.classList.toggle('hidden', !simOn && !undoOn);
}
function updateUndoUI() {
    const btn = document.getElementById('undoHeaderBtn');
    const cnt = document.getElementById('undoCountLabel');
    const show = undoStack.length > 0 && isEditor();
    if (btn && cnt) {
        cnt.textContent = undoStack.length;
        btn.classList.toggle('hidden', !show);
        btn.classList.toggle('sm:flex', show);
    }
    const mobBtn = document.getElementById('mobUndoBtn');
    const mobCnt = document.getElementById('mobUndoCount');
    if (mobBtn && mobCnt) {
        mobCnt.textContent = undoStack.length;
        mobBtn.classList.toggle('hidden', !show);
        mobBtn.classList.toggle('inline-flex', show);
    }
    syncMobileStatusStrip();
}
function undoLastAction() {
    if (!isEditor() || undoStack.length === 0) return;
    const s = undoStack.pop();
    instrumentsData = s.inst;
    calibrationHistory = s.hist;
    lostInstrumentsData = s.lost;
    sortByCode(instrumentsData);
    selectedIds.clear();
    labSelectedIds.clear();
    updateBatchDock();
    DeltaTracker.markFullSyncRequired();
    queueAudit({ module:'Sistema', action:'Desfazer', target:'-', field:'Estado', before:s.label, after:'Revertido', details:`Desfez: ${s.label}` });
    persistAll({ full: true });
    renderAll();
    updateUndoUI();
    showToast(`Desfeito: ${s.label}`, 'info');
}

function flushLocalPersistNow() {
    if (localPersistHandle) {
        if (typeof cancelIdleCallback === 'function') cancelIdleCallback(localPersistHandle);
        else clearTimeout(localPersistHandle);
        localPersistHandle = null;
    }
    if (!localPersistDirty) return;
    localPersistDirty = false;
    VoithDB.saveSnapshot(instrumentsData, calibrationHistory, lostInstrumentsData, controlledLists, lastServerUpdatedAt);
}

function persistAll(opts = {}) {
    sortByCode(instrumentsData);
    ensureHistoryIds();
    if (opts.full) DeltaTracker.markFullSyncRequired();
    localPersistDirty = true;
    if (!localPersistHandle) {
        const run = () => { localPersistHandle = null; flushLocalPersistNow(); };
        localPersistHandle = (typeof requestIdleCallback === 'function')
            ? requestIdleCallback(run, { timeout: 220 })
            : setTimeout(run, 35);
    }
    scheduleCloudSync();
}
