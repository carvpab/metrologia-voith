/* ============================================================================
 * VOITH TURBO — PRECISION METROLOGY OS v16.7 • db.js
 * Estado central, Cache local, Undo, Outbox offline, Telemetria, Higienização
 * ============================================================================ */

window.VoithDB = (function () {
    var CACHE_KEY = 'voith_state_cache_v16';
    var SESSION_KEY = 'voith_session_v13';
    var OUTBOX_KEY = 'voith_outbox_queue_v13';
    var TELEMETRY_KEY = 'voith_telemetry_v13';
    var DARK_KEY = 'voith_dark_mode_v312';
    var FACTORY_KEY = 'voith_factory_mode_v16';
    var SIDEBAR_KEY = 'voith_sb_collapsed_v12';

    var state = {
        view: 'command',
        labSubTab: 'external',
        labStatusFilter: '',
        custodyGroupMode: 'holder',
        refDateISO: '', // vazio = hoje
        horizonOffsetDays: 0,
        invViewMode: 'auto', // auto | table | cards
        compactTable: false,
        page: 1,
        pageSize: 20,
        sortCol: 'code',
        sortDir: 'asc',
        filters: {
            search: '',
            status: '',
            setor: '',
            local: '',
            resp: '',
            month: '',
            family: '',
            quickTab: ''
        },
        selectedIds: new Set(),
        selectedLabIds: new Set(),
        instruments: [],
        history: [],
        lost: [],
        controlledLists: { locals: [], sectors: [], aliases: {} },
        receipts: [],
        auditLogs: [],
        analytics: null,
        releaseChannel: null,
        telemetry: [],
        outbox: [],
        undoStack: [],
        session: null,
        updatedAt: '',
        lastSyncLabel: '-',
        cloudStatus: 'Sincronizando...',
        cloudError: '',
        pendingConflict: null,
        pendingImportRows: null,
        apiVersion: 16
    };

    // Restaura sessão / outbox / telemetria / cache local
    try {
        var s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
        if (s && s.token && (!s.expiresAt || new Date(s.expiresAt) > new Date())) state.session = s;
    } catch (e) {}
    try { state.outbox = JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]'); } catch (e) { state.outbox = []; }
    try { state.telemetry = JSON.parse(localStorage.getItem(TELEMETRY_KEY) || '[]'); } catch (e) { state.telemetry = []; }
    try {
        var cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
        if (cached && Array.isArray(cached.instruments)) {
            state.instruments = cached.instruments;
            state.history = cached.history || [];
            state.lost = cached.lost || [];
            state.controlledLists = cached.controlledLists || { locals: [], sectors: [], aliases: {} };
            state.updatedAt = cached.updatedAt || '';
        }
    } catch (e) {}

    function persistCache() {
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({
                instruments: state.instruments,
                history: state.history,
                lost: state.lost,
                controlledLists: state.controlledLists,
                updatedAt: state.updatedAt
            }));
        } catch (e) {}
    }

    function persistSession() {
        try {
            if (state.session && state.session.token) localStorage.setItem(SESSION_KEY, JSON.stringify(state.session));
            else localStorage.removeItem(SESSION_KEY);
        } catch (e) {}
    }

    function persistOutbox() {
        try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(state.outbox)); } catch (e) {}
        updateOfflineBanner();
    }

    function logTelemetry(type, detail, latencyMs) {
        state.telemetry.unshift({
            ts: new Date().toISOString(),
            platform: window.VOITH_PLATFORM || 'WEB',
            type: type,
            detail: String(detail || '').slice(0, 220),
            latencyMs: Math.round(latencyMs || 0)
        });
        if (state.telemetry.length > 100) state.telemetry.length = 100;
        try { localStorage.setItem(TELEMETRY_KEY, JSON.stringify(state.telemetry)); } catch (e) {}
    }

    function pushUndo(label) {
        state.undoStack.push({
            label: label || 'Alteração',
            instruments: JSON.parse(JSON.stringify(state.instruments)),
            history: JSON.parse(JSON.stringify(state.history)),
            lost: JSON.parse(JSON.stringify(state.lost))
        });
        if (state.undoStack.length > 15) state.undoStack.shift();
        updateUndoUI();
    }

    function updateUndoUI() {
        var n = state.undoStack.length;
        var btn = document.getElementById('undoHeaderBtn');
        var lbl = document.getElementById('undoCountLabel');
        var mobBtn = document.getElementById('mobUndoBtn');
        var mobCnt = document.getElementById('mobUndoCount');
        if (lbl) lbl.textContent = n;
        if (mobCnt) mobCnt.textContent = n;
        if (btn) {
            if (n > 0 && state.session) { btn.classList.remove('hidden'); btn.classList.add('flex'); }
            else { btn.classList.add('hidden'); btn.classList.remove('flex'); }
        }
        if (mobBtn) {
            if (n > 0 && state.session) { mobBtn.classList.remove('hidden'); mobBtn.classList.add('inline-flex'); }
            else { mobBtn.classList.add('hidden'); mobBtn.classList.remove('inline-flex'); }
        }
        updateMobStripVisibility();
    }

    function updateOfflineBanner() {
        var b = document.getElementById('offlineQueueBanner');
        var txt = document.getElementById('offlineQueueText');
        if (!b) return;
        if (state.outbox.length > 0) {
            b.classList.remove('hidden');
            b.removeAttribute('hidden');
            b.style.display = 'flex';
            if (txt) txt.textContent = state.outbox.length + ' alteração(ões) na fila offline (Outbox) aguardando sincronização.';
        } else {
            b.classList.add('hidden');
            b.setAttribute('hidden', '');
            b.style.display = 'none';
        }
    }

    function updateMobStripVisibility() {
        var strip = document.getElementById('mobStatusStrip');
        var simBtn = document.getElementById('mobSimBtn');
        var undoBtn = document.getElementById('mobUndoBtn');
        if (!strip) return;
        var hasSim = simBtn && !simBtn.classList.contains('hidden');
        var hasUndo = undoBtn && !undoBtn.classList.contains('hidden');
        if (hasSim || hasUndo) strip.classList.remove('hidden');
        else strip.classList.add('hidden');
    }

    function getRefDate() {
        if (state.refDateISO) {
            var md = parseDateBR(state.refDateISO);
            if (md) return md;
        }
        var now = new Date();
        var ref = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
        if (state.horizonOffsetDays) ref.setDate(ref.getDate() + Number(state.horizonOffsetDays));
        return ref;
    }

    function isSimulatingDate() {
        return Boolean(state.refDateISO) || Number(state.horizonOffsetDays || 0) !== 0;
    }

    function normalizeControlled(val, kind) {
        var s = String(val || '').trim();
        if (!s) return '';
        var aliases = (state.controlledLists && state.controlledLists.aliases) || {};
        var key = normStr(s);
        if (aliases[key]) return aliases[key];
        var list = kind === 'sector' ? (state.controlledLists.sectors || []) : (state.controlledLists.locals || []);
        for (var i = 0; i < list.length; i++) {
            if (normStr(list[i]) === key) return list[i];
        }
        return s;
    }

    function isEditor() {
        return Boolean(state.session && state.session.token);
    }

    function isAdmin() {
        return Boolean(state.session && state.session.token && state.session.isAdmin);
    }

    function makeItemSnapshot(it) {
        return {
            code: it.code || '', desc: it.desc || '', cc: it.cc || '', setor: it.setor || '',
            local: it.local || '', resp: it.resp || '', min: it.min || '', max: it.max || '',
            proxCal: it.proxCal || '', status: it.status || '', obs: it.obs || '',
            custodyHolder: it.custodyHolder || '', custodyReturnTo: it.custodyReturnTo || '',
            custodyDate: it.custodyDate || '', custodyReason: it.custodyReason || ''
        };
    }

    return {
        state: state,
        KEYS: { DARK_KEY: DARK_KEY, FACTORY_KEY: FACTORY_KEY, SIDEBAR_KEY: SIDEBAR_KEY },
        persistCache: persistCache,
        persistSession: persistSession,
        persistOutbox: persistOutbox,
        logTelemetry: logTelemetry,
        pushUndo: pushUndo,
        updateUndoUI: updateUndoUI,
        updateOfflineBanner: updateOfflineBanner,
        updateMobStripVisibility: updateMobStripVisibility,
        getRefDate: getRefDate,
        isSimulatingDate: isSimulatingDate,
        normalizeControlled: normalizeControlled,
        isEditor: isEditor,
        isAdmin: isAdmin,
        makeItemSnapshot: makeItemSnapshot
    };
})();