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

// ---- Delta Change Tracker v11.3 (com Trava de Revisão `rev` por Item + Fila Offline Persistente) ----
const DeltaTracker = {
    fullRequired: false,
    instUpsert: new Map(),
    instDelete: new Set(),
    histUpsert: new Map(),
    histDelete: new Set(),
    lostUpsert: new Map(),
    lostDelete: new Set(),
    baseRevs: {
        inst: new Map(),
        hist: new Map(),
        lost: new Map()
    },

    _captureBaseRev(bucket, id, itemRev, sourceArr) {
        if (this.baseRevs[bucket].has(id)) return this.baseRevs[bucket].get(id);
        let revVal = itemRev;
        if (revVal === undefined && Array.isArray(sourceArr)) {
            const found = sourceArr.find(x => x && x.id === id);
            if (found) revVal = found.rev;
        }
        const resolved = revVal === 0 ? 0 : Math.max(1, Number(revVal) || 1);
        this.baseRevs[bucket].set(id, resolved);
        return resolved;
    },

    markInstUpsert(items) {
        (Array.isArray(items) ? items : [items]).forEach(it => {
            if (!it || it.id === undefined) return;
            const baseRev = this._captureBaseRev('inst', it.id, it.rev);
            this.instDelete.delete(it.id);
            const copy = deepCloneFast(it);
            copy._baseRev = baseRev;
            this.instUpsert.set(it.id, copy);
        });
    },
    markInstDelete(ids) {
        (Array.isArray(ids) ? ids : [ids]).forEach(id => {
            if (id === undefined || id === null) return;
            this._captureBaseRev('inst', id, undefined, instrumentsData);
            this.instUpsert.delete(id);
            this.instDelete.add(id);
        });
    },
    markHistUpsert(items) {
        (Array.isArray(items) ? items : [items]).forEach(h => {
            if (!h) return;
            if (!h.id) h.id = Date.now() + Math.floor(Math.random() * 10000);
            const baseRev = this._captureBaseRev('hist', h.id, h.rev);
            this.histDelete.delete(h.id);
            const copy = deepCloneFast(h);
            copy._baseRev = baseRev;
            this.histUpsert.set(h.id, copy);
        });
    },
    markHistDelete(ids) {
        (Array.isArray(ids) ? ids : [ids]).forEach(id => {
            if (!id) return;
            this._captureBaseRev('hist', id, undefined, calibrationHistory);
            this.histUpsert.delete(id);
            this.histDelete.add(id);
        });
    },
    markLostUpsert(items) {
        (Array.isArray(items) ? items : [items]).forEach(l => {
            if (!l) return;
            if (!l.id) l.id = Date.now() + Math.floor(Math.random() * 10000);
            const baseRev = this._captureBaseRev('lost', l.id, l.rev);
            this.lostDelete.delete(l.id);
            const copy = deepCloneFast(l);
            copy._baseRev = baseRev;
            this.lostUpsert.set(l.id, copy);
        });
    },
    markLostDelete(ids) {
        (Array.isArray(ids) ? ids : [ids]).forEach(id => {
            if (!id) return;
            this._captureBaseRev('lost', id, undefined, lostInstrumentsData);
            this.lostUpsert.delete(id);
            this.lostDelete.add(id);
        });
    },
    markFullSyncRequired() {
        this.fullRequired = true;
    },
    pendingCount() {
        const n = this.instUpsert.size + this.instDelete.size +
                  this.histUpsert.size + this.histDelete.size +
                  this.lostUpsert.size + this.lostDelete.size;
        return this.fullRequired ? Math.max(1, n) : n;
    },
    hasDelta() {
        return !this.fullRequired && (
            this.instUpsert.size > 0 || this.instDelete.size > 0 ||
            this.histUpsert.size > 0 || this.histDelete.size > 0 ||
            this.lostUpsert.size > 0 || this.lostDelete.size > 0
        );
    },
    snapshotDelta() {
        const delRevs = { inst: {}, hist: {}, lost: {} };
        this.instDelete.forEach(id => { if (this.baseRevs.inst.has(id)) delRevs.inst[String(id)] = this.baseRevs.inst.get(id); });
        this.histDelete.forEach(id => { if (this.baseRevs.hist.has(id)) delRevs.hist[String(id)] = this.baseRevs.hist.get(id); });
        this.lostDelete.forEach(id => { if (this.baseRevs.lost.has(id)) delRevs.lost[String(id)] = this.baseRevs.lost.get(id); });
        return {
            instUpsert: [...this.instUpsert.values()],
            instDelete: [...this.instDelete],
            histUpsert: [...this.histUpsert.values()],
            histDelete: [...this.histDelete],
            lostUpsert: [...this.lostUpsert.values()],
            lostDelete: [...this.lostDelete],
            deleteBaseRevs: delRevs
        };
    },
    serialize() {
        if (!this.fullRequired && this.pendingCount() === 0) return null;
        return {
            fullRequired: this.fullRequired,
            instUpsert: [...this.instUpsert.entries()],
            instDelete: [...this.instDelete],
            histUpsert: [...this.histUpsert.entries()],
            histDelete: [...this.histDelete],
            lostUpsert: [...this.lostUpsert.entries()],
            lostDelete: [...this.lostDelete],
            baseRevs: {
                inst: [...this.baseRevs.inst.entries()],
                hist: [...this.baseRevs.hist.entries()],
                lost: [...this.baseRevs.lost.entries()]
            }
        };
    },
    hydrate(saved) {
        this.clear(false);
        if (!saved || typeof saved !== 'object') return false;
        this.fullRequired = Boolean(saved.fullRequired);
        if (Array.isArray(saved.instUpsert)) saved.instUpsert.forEach(([k, v]) => this.instUpsert.set(k, v));
        if (Array.isArray(saved.instDelete)) saved.instDelete.forEach(id => this.instDelete.add(id));
        if (Array.isArray(saved.histUpsert)) saved.histUpsert.forEach(([k, v]) => this.histUpsert.set(k, v));
        if (Array.isArray(saved.histDelete)) saved.histDelete.forEach(id => this.histDelete.add(id));
        if (Array.isArray(saved.lostUpsert)) saved.lostUpsert.forEach(([k, v]) => this.lostUpsert.set(k, v));
        if (Array.isArray(saved.lostDelete)) saved.lostDelete.forEach(id => this.lostDelete.add(id));
        if (saved.baseRevs) {
            if (Array.isArray(saved.baseRevs.inst)) saved.baseRevs.inst.forEach(([k, v]) => this.baseRevs.inst.set(k, v));
            if (Array.isArray(saved.baseRevs.hist)) saved.baseRevs.hist.forEach(([k, v]) => this.baseRevs.hist.set(k, v));
            if (Array.isArray(saved.baseRevs.lost)) saved.baseRevs.lost.forEach(([k, v]) => this.baseRevs.lost.set(k, v));
        }
        return this.pendingCount() > 0;
    },
    clear(persistClear = true) {
        this.fullRequired = false;
        this.instUpsert.clear();
        this.instDelete.clear();
        this.histUpsert.clear();
        this.histDelete.clear();
        this.lostUpsert.clear();
        this.lostDelete.clear();
        this.baseRevs.inst.clear();
        this.baseRevs.hist.clear();
        this.baseRevs.lost.clear();
        if (persistClear) VoithDB.set('pendingDelta', null);
    }
};

function ensureHistoryIds() {
    let base = Date.now();
    calibrationHistory.forEach((h, i) => {
        if (!h.id) h.id = base + i;
        if (h.rev === undefined || h.rev === null || h.rev === '') h.rev = 1;
        else h.rev = h.rev === 0 ? 0 : Math.max(1, Number(h.rev) || 1);
    });
    lostInstrumentsData.forEach((l, i) => {
        if (!l.id) l.id = base + 5000 + i;
        if (l.rev === undefined || l.rev === null || l.rev === '') l.rev = 1;
        else l.rev = l.rev === 0 ? 0 : Math.max(1, Number(l.rev) || 1);
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
    VoithDB.set('pendingDelta', (offlineDirty || DeltaTracker.pendingCount() > 0) ? DeltaTracker.serialize() : null);
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
