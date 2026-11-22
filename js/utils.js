// ============================================================================
// VOITH TURBO — PRECISION METROLOGY OS v11 • UTILS, STATE & CANONICALIZER
// ============================================================================
const DEFAULT_SHEETS_API_URL = "https://script.google.com/macros/s/AKfycbzvF-QtaDJNXFtwLnLlsRociAmIt2FLgXiVW4EIDFSJsqlx23cbstEQCrg51i9i5vF0mw/exec";
const KEYS = {
    inst: 'voith_instruments_official_v313',
    hist: 'voith_history_official_v313',
    lost: 'voith_lost_official_v313',
    auth: 'voith_editor_auth_v316',
    dark: 'voith_dark_mode_v312',
    compact: 'voith_compact_v313',
    ps: 'voith_ps_v5',
    sb: 'voith_sb_col_v10'
};
const ADMIN_USER = 'pablo';

// ---- Estado Global ----
let instrumentsData = [];
let calibrationHistory = [];
let lostInstrumentsData = [];
let controlledLists = {
    locals: [],
    sectors: [
        'Voith Turbo (Industrial)',
        'Voith Turbo (Ferroviária)',
        'Voith Turbo (Qualidade)',
        'Voith Turbo (Almoxarifado)',
        'Voith Turbo (Manutenção)',
        'Voith Turbo (Automotive)',
        'Voith Turbo - Assist. Téc. Industrial',
        'Vorecon'
    ],
    aliases: {
        'p1': 'Bancada P1',
        'voith turbo - industrial': 'Voith Turbo (Industrial)',
        'voith turbo (ferroviaria)': 'Voith Turbo (Ferroviária)',
        'voith turbo (industrial)- vorecon': 'Voith Turbo (Industrial) - Vorecon'
    }
};

let filteredInv = [];
let selectedIds = new Set();
let labSelectedIds = new Set();
let kbRowIdx = -1;

let currentView = 'command';
let currentRefISO = '';
let quickStatusTab = '';
let invSortField = '';
let invSortDir = 'asc';
let invPage = 1;
let invPageSize = 20;
let invViewMode = 'auto';
let isCompact = false;
let custodyGroupMode = 'holder';
let labSubTab = 'external';
let labStatusFilter = '';

// Auth & Cloud State
let currentAuth = null;
let serverSupportsDelta = false;
let serverSupportsToken = false;
let isCloudReady = false;
let isApplyingCloud = false;
let isSyncing = false;
let pendingSync = false;
let offlineDirty = false;
let hasConflict = false;
let lastServerUpdatedAt = '';
let lastCloudCheckMs = 0;
let syncTimer = null;
let pendingAuditEvents = [];
let cachedAuditEvents = [];

// Undo, Spotlight, Modals & Performance Cache State
let undoStack = [];
const MAX_UNDO = 10;
let searchDebounceTimer = null;
let cmdResults = [];
let cmdSelectedIdx = 0;
let custodyTargetIds = [];
let externalBatchIds = [];
let pendingImportItems = [];
let confirmCallback = null;
let rapidQueueIds = [];
let rapidQueueIdx = 0;

// Turbo Engine Caches
const isoDayCache = new Map();
const instMetaCache = new WeakMap();
let metaCacheRefISO = '';
let metaCacheTodayISO = '';
let dirtyViews = { command: true, inventory: true, custody: true, lab: true, dropdowns: true };
let invRenderToken = 0;
let invPageItemsCache = [];
let invRenderedCount = 0;
let invPrewarmHandle = null;
const INV_FIRST_BATCH = 35;
const INV_NEXT_BATCH = 45;
const INV_VIRTUAL_THRESHOLD = 50;
const INV_VIRTUAL_OVERSCAN = 10;
let invVirtualActive = false;
let invVirtStart = -1;
let invVirtEnd = -1;
let invVirtualRaf = 0;
let savedInvScrollTop = 0;
let lastWindowWasMobile = window.innerWidth < 768;
let sheetJsLoadPromise = null;
let localPersistHandle = null;
let localPersistDirty = false;
const domCache = Object.create(null);

function $el(id) {
    let n = domCache[id];
    if (!n || !n.isConnected) {
        n = document.getElementById(id);
        if (n) domCache[id] = n;
    }
    return n;
}

// ---- Inline SVG Icon Helpers (Zero FontAwesome CDN) ----
function svgIcon(name, cls = '') {
    const clean = String(name || 'circle-info').replace(/^fa-/, '');
    return `<svg class="vp-ico${cls ? ' ' + cls : ''}" aria-hidden="true"><use href="#i-${clean}"/></svg>`;
}
function setSvgIcon(el, name, cls) {
    if (!el) return;
    const clean = String(name || 'circle-info').replace(/^fa-/, '');
    if (cls !== undefined) el.setAttribute('class', `vp-ico${cls ? ' ' + cls : ''}`);
    const use = el.querySelector('use');
    if (use) use.setAttribute('href', `#i-${clean}`);
    else el.innerHTML = `<use href="#i-${clean}"/>`;
}

// ---- Busca Sem Acentos & Tolerante a Formatação ----
function normSearch(s) {
    return String(s ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}
function normCompact(s) {
    return normSearch(s).replace(/[^a-z0-9]/g, '');
}
function matchesQuery(hayNorm, hayCompact, qNorm, qCompact) {
    if (!qNorm) return true;
    if (hayNorm.includes(qNorm)) return true;
    if (qCompact && qCompact.length >= 2 && hayCompact.includes(qCompact)) return true;
    // Multi-word AND match (ex: "paquimetro t1")
    if (qNorm.includes(' ')) {
        const parts = qNorm.split(' ').filter(Boolean);
        return parts.every(p => hayNorm.includes(p));
    }
    return false;
}

// ---- Padronização / Normalização na Entrada (Lista Controlada + Aliases) ----
function cleanSpaces(s) {
    return String(s ?? '').replace(/\s+/g, ' ').trim();
}
function canonicalizeLocal(raw) {
    const cleaned = cleanSpaces(raw);
    if (!cleaned) return '';
    const key = normSearch(cleaned);
    const aliases = (controlledLists && controlledLists.aliases) || {};
    for (const [ak, av] of Object.entries(aliases)) {
        if (normSearch(ak) === key) return av;
    }
    const official = (controlledLists && Array.isArray(controlledLists.locals)) ? controlledLists.locals : [];
    for (let i = 0; i < official.length; i++) {
        if (normSearch(official[i]) === key) return official[i];
    }
    return cleaned;
}
function canonicalizeSector(raw) {
    const cleaned = cleanSpaces(raw);
    if (!cleaned) return 'Voith Turbo (Industrial)';
    const key = normSearch(cleaned);
    const aliases = (controlledLists && controlledLists.aliases) || {};
    for (const [ak, av] of Object.entries(aliases)) {
        if (normSearch(ak) === key) return av;
    }
    const official = (controlledLists && Array.isArray(controlledLists.sectors)) ? controlledLists.sectors : [];
    for (let i = 0; i < official.length; i++) {
        if (normSearch(official[i]) === key) return official[i];
    }
    return cleaned;
}
const STANDARD_CYCLES = [6, 12, 18, 24, 36];
function inferCycleMonths(desc, currentCycle) {
    if (currentCycle === 0 || currentCycle === '0') return 0;
    if (currentCycle !== undefined && currentCycle !== null && currentCycle !== '') {
        const n = Math.round(Number(currentCycle));
        if (Number.isFinite(n) && n >= 1 && n <= 120) return n;
    }
    const d = normSearch(desc);
    if (/torquimetro|torqueadeira/.test(d)) return 6;
    if (/tampao|anel de rosca|anel roscado|chaveta|esquadro|haste padrao/.test(d)) return 24;
    return 12;
}

function normalizeInstrument(raw, fallbackId) {
    const x = raw && typeof raw === 'object' ? raw : {};
    const str = (v) => (v === null || v === undefined) ? '' : cleanSpaces(v);
    let pc = str(x.proxCal);
    if (pc.length > 10 && /^\d{4}-\d{2}-\d{2}/.test(pc)) pc = pc.slice(0, 10);
    let cd = str(x.custodyDate);
    if (cd.length > 10 && /^\d{4}-\d{2}-\d{2}/.test(cd)) cd = cd.slice(0, 10);
    const desc = str(x.desc) || 'Instrumento';
    return {
        ...x,
        id: Number(x.id) || fallbackId,
        code: str(x.code).toUpperCase(),
        desc,
        cc: str(x.cc),
        setor: str(x.setor) || 'Voith Turbo (Industrial)',
        local: str(x.local),
        resp: str(x.resp),
        min: str(x.min),
        max: str(x.max),
        proxCal: pc,
        status: str(x.status),
        obs: str(x.obs),
        custodyHolder: str(x.custodyHolder),
        custodyReturnTo: str(x.custodyReturnTo),
        custodyDate: cd,
        custodyReason: str(x.custodyReason),
        cycleMonths: inferCycleMonths(desc, x.cycleMonths)
    };
}

function deepCloneFast(obj) {
    return (typeof structuredClone === 'function') ? structuredClone(obj) : JSON.parse(JSON.stringify(obj));
}

// ---- Utilitários Seguros ----
function escapeHtml(v) {
    return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k, v) { try { localStorage.setItem(k, v); } catch {} }
function safeDel(k) { try { localStorage.removeItem(k); } catch {} }
function sessGet(k) { try { return sessionStorage.getItem(k); } catch { return null; } }
function sessSet(k, v) { try { sessionStorage.setItem(k, v); } catch {} }
function sessDel(k) { try { sessionStorage.removeItem(k); } catch {} }

function getTodayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function addDaysISO(baseISO, days) {
    const [y,m,d] = (baseISO || getTodayISO()).split('-').map(Number);
    const dt = new Date(y, m - 1, d + days);
    return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
}
function addMonthsISO(baseISO, months, dayOne = false) {
    const [y,m,d] = (baseISO || getTodayISO()).split('-').map(Number);
    const dt = new Date(y, (m - 1) + months, dayOne ? 1 : d);
    return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
}
function isoToDayNum(iso) {
    if (typeof iso !== 'string' || iso.length !== 10 || iso.charCodeAt(4) !== 45 || iso.charCodeAt(7) !== 45) return null;
    let cached = isoDayCache.get(iso);
    if (cached !== undefined) return cached;
    const y = +iso.slice(0, 4), m = +iso.slice(5, 7), d = +iso.slice(8, 10);
    if (!y || !m || !d) { isoDayCache.set(iso, null); return null; }
    const num = Math.floor(Date.UTC(y, m - 1, d) / 86400000);
    if (isoDayCache.size > 4000) isoDayCache.clear();
    isoDayCache.set(iso, num);
    return num;
}
function daysBetween(fromISO, toISO) {
    const a = isoToDayNum(fromISO);
    if (a === null) return null;
    const b = isoToDayNum(toISO);
    if (b === null) return null;
    return b - a;
}
function fmtBR(iso) {
    if (!iso) return '-';
    const p = String(iso).split('-');
    return (p.length === 3 && p[0].length === 4) ? `${p[2]}/${p[1]}/${p[0]}` : iso;
}
function maskBRDate(inp) {
    const d = inp.value.replace(/\D/g,'').slice(0,8);
    if (d.length > 4) inp.value = `${d.slice(0,2)}/${d.slice(2,4)}/${d.slice(4)}`;
    else if (d.length > 2) inp.value = `${d.slice(0,2)}/${d.slice(2)}`;
    else inp.value = d;
}
function parseMonthYearISO(raw) {
    if (!raw) return '';
    const t = normSearch(raw);
    if (/verificar|conserto|reparo|avaliar/.test(t)) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
    const br = t.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
    if (br) return `${br[3]}-${br[2]}-${br[1]}`;
    const map = { janeiro:'01', fevereiro:'02', marco:'03', abril:'04', maio:'05', junho:'06', julho:'07', agosto:'08', setembro:'09', outubro:'10', novembro:'11', dezembro:'12' };
    for (const [k,v] of Object.entries(map)) {
        if (t.includes(k)) {
            const y = t.match(/20\d{2}/);
            if (y) return `${y[0]}-${v}-01`;
        }
    }
    return '';
}
function parseManualISO(raw) {
    const v = String(raw || '').trim();
    if (!v) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    const br = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (br) {
        const [,d,m,y] = br;
        const dt = new Date(Number(y), Number(m)-1, Number(d));
        if (dt.getFullYear()===Number(y) && dt.getMonth()===Number(m)-1 && dt.getDate()===Number(d)) return `${y}-${m}-${d}`;
        return null;
    }
    return parseMonthYearISO(v) || null;
}
function openPicker(id) {
    const el = document.getElementById(id);
    if (!el) return;
    try {
        if (typeof el.showPicker === 'function') {
            el.showPicker();
            return;
        }
    } catch (e) {}
    try { el.focus(); el.click(); } catch (e) {}
}
function sortByCode(arr) {
    arr.sort((a,b) => String(a.code||'').localeCompare(String(b.code||''), 'pt-BR', { numeric:true, sensitivity:'base' }));
}

function parseTsvData(tsv, startId = 1) {
    const out = [];
    tsv.split(/\r?\n/).filter(l => l.trim()).forEach((line, idx) => {
        const c = line.split('\t');
        const code = (c[0]||'').trim();
        if (!code || /^c[oó]digo$/i.test(code)) return;
        const desc = cleanSpaces(c[1] || 'Instrumento');
        const rawCal = (c[2]||'').trim();
        const rawSt = (c[3]||'').trim().toUpperCase();
        const iso = parseMonthYearISO(rawCal);
        let status = '';
        const obs = [];
        if (!iso && rawCal) {
            obs.push(rawCal);
            status = /conserto|reparo/i.test(rawCal) ? 'EM REPARO' : 'PENDÊNCIA DE DATA';
        } else if (rawSt === 'AGUARDANDO CALIBRAÇÃO' || rawSt === 'EM REPARO') {
            status = rawSt;
        }
        if ((c[10]||'').trim()) obs.push(c[10].trim());
        out.push({
            id: startId + idx,
            code: code.toUpperCase(), desc,
            cc: cleanSpaces(c[4]||''),
            setor: canonicalizeSector(c[5]||'Voith Turbo (Industrial)'),
            local: canonicalizeLocal(c[6]||''),
            resp: cleanSpaces(c[7]||''),
            min: cleanSpaces(c[8]||''),
            max: cleanSpaces(c[9]||''),
            proxCal: iso,
            status,
            obs: obs.join(' | '),
            cycleMonths: inferCycleMonths(desc)
        });
    });
    return out;
}

function calcStatus(dateStr, manualStatus) {
    if (manualStatus === 'EM REPARO' || manualStatus === 'AGUARDANDO CALIBRAÇÃO' || manualStatus === 'PENDÊNCIA DE DATA') return manualStatus;
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return 'PENDÊNCIA DE DATA';
    const diff = daysBetween(currentRefISO || getTodayISO(), dateStr);
    if (diff < 0) return 'VENCIDA';
    if (diff <= 30) return 'PRÓXIMA DO VENCIMENTO';
    return 'EM DIA';
}

function getCountdownMeta(dateStr, st) {
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return { text:'', cls:'', vcls:'' };
    if (st === 'EM REPARO' || st === 'AGUARDANDO CALIBRAÇÃO' || st === 'PENDÊNCIA DE DATA') return { text:'', cls:'', vcls:'' };
    const diff = daysBetween(currentRefISO || getTodayISO(), dateStr);
    if (diff === null) return { text:'', cls:'', vcls:'' };
    if (diff < 0) return { text: `Vencido há ${Math.abs(diff)}d`, cls: 'text-rose-600 dark:text-rose-400 font-bold', vcls: 'vr-cd-over', barPct: 100, barCls: 'vr-vb-over' };
    if (diff <= 30) {
        const p = Math.max(12, Math.round((diff / 30) * 35));
        return { text: `Vence em ${diff}d`, cls: 'text-amber-600 dark:text-amber-400 font-bold', vcls: 'vr-cd-soon', barPct: p, barCls: 'vr-vb-soon' };
    }
    const p = Math.min(100, Math.max(36, Math.round((diff / 365) * 100)));
    return { text: `+${Math.round(diff/30)}m válidos`, cls: 'text-emerald-600 dark:text-emerald-400 font-semibold', vcls: 'vr-cd-ok', barPct: p, barCls: 'vr-vb-ok' };
}

function getFamily(desc) {
    const d = normSearch(desc);
    if (/torqu|dinam|balan|forca/.test(d)) return { key:'TORQUE', label:'Torque / Força', icon:'wrench', cls:'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300', vcls:'vr-f-tor' };
    if (/multim|megom|ohm|loop|tacom/.test(d)) return { key:'ELETRICA', label:'Elétrica', icon:'bolt', cls:'bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-300', vcls:'vr-f-ele' };
    if (/manom|pressao|termom|temper/.test(d)) return { key:'TEMP_PRESSAO', label:'Temp. / Pressão', icon:'temperature-half', cls:'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300', vcls:'vr-f-tmp' };
    return { key:'DIMENSIONAL', label:'Dimensional', icon:'ruler-combined', cls:'bg-sky-100 dark:bg-sky-500/20 text-[#004C97] dark:text-[#00A8E8]', vcls:'vr-f-dim' };
}

function getStatusStyle(st) {
    if (st === 'EM DIA') return { pill:'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30', accent:'border-l-emerald-500', vp:'vr-p-ok', va:'vr-s-ok' };
    if (st === 'VENCIDA') return { pill:'bg-rose-100 dark:bg-rose-500/20 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-500/30', accent:'border-l-rose-600', vp:'vr-p-over', va:'vr-s-over' };
    if (st === 'PRÓXIMA DO VENCIMENTO') return { pill:'bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-500/30', accent:'border-l-amber-500', vp:'vr-p-soon', va:'vr-s-soon' };
    if (st === 'AGUARDANDO CALIBRAÇÃO') return { pill:'bg-sky-100 dark:bg-sky-500/20 text-sky-800 dark:text-sky-300 border-sky-200 dark:border-sky-500/30', accent:'border-l-sky-500', vp:'vr-p-wait', va:'vr-s-wait' };
    if (st === 'EM REPARO') return { pill:'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-800 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/30', accent:'border-l-indigo-500', vp:'vr-p-rep', va:'vr-s-rep' };
    return { pill:'bg-purple-100 dark:bg-purple-500/20 text-purple-800 dark:text-purple-300 border-purple-200 dark:border-purple-500/30', accent:'border-l-purple-500', vp:'vr-p-pend', va:'vr-s-pend' };
}

function invalidateInstMeta(it) {
    if (it) instMetaCache.delete(it);
}
function getInstMeta(it) {
    const ref = currentRefISO || metaCacheTodayISO || getTodayISO();
    let m = instMetaCache.get(it);
    if (
        m && m.ref === ref && m.code === it.code && m.proxCal === it.proxCal &&
        m.rawStatus === it.status && m.desc === it.desc && m.setor === it.setor &&
        m.local === it.local && m.holder === it.custodyHolder && m.ret === it.custodyReturnTo &&
        m.resp === it.resp && m.min === it.min && m.max === it.max && m.obs === it.obs &&
        m.cDate === it.custodyDate && m.cycle === it.cycleMonths
    ) {
        return m;
    }
    const st = calcStatus(it.proxCal, it.status);
    const fam = getFamily(it.desc);
    const cd = getCountdownMeta(it.proxCal, st);
    const rawHay = `${it.code} ${it.desc} ${it.local||''} ${it.resp||''} ${it.setor||''} ${it.min||''} ${it.max||''} ${it.custodyHolder||''} ${it.custodyReturnTo||''} ${it.obs||''}`;
    const hay = normSearch(rawHay);
    const hayCompact = normCompact(`${it.code} ${it.local||''} ${it.desc}`);
    m = {
        ref, st, fam, cd, hay, hayCompact,
        ss: getStatusStyle(st),
        code: it.code, proxCal: it.proxCal, rawStatus: it.status, desc: it.desc,
        setor: it.setor, local: it.local, holder: it.custodyHolder, ret: it.custodyReturnTo,
        resp: it.resp, min: it.min, max: it.max, obs: it.obs, cDate: it.custodyDate, cycle: it.cycleMonths,
        rowCache: Object.create(null),
        cardCache: Object.create(null)
    };
    instMetaCache.set(it, m);
    return m;
}

// ---- Toast & Confirm ----
function showToast(msg, type = 'info', opts = {}) {
    let wrap = document.getElementById('toastWrap');
    if (!wrap) {
        wrap = document.createElement('div');
        wrap.id = 'toastWrap';
        wrap.className = 'fixed bottom-5 right-5 z-[999] flex flex-col gap-2 max-w-md';
        document.body.appendChild(wrap);
    }
    const t = document.createElement('div');
    const bg = type === 'error' ? 'bg-rose-600' : type === 'success' ? 'bg-emerald-600' : 'bg-[#001833] border border-[#00A8E8]/40';
    t.className = `${bg} text-white px-4 py-3 rounded-xl shadow-2xl text-xs font-semibold flex items-center justify-between gap-3 vp-animate`;
    const left = document.createElement('div');
    left.className = 'flex items-center gap-2';
    left.innerHTML = svgIcon(type === 'error' ? 'circle-exclamation' : type === 'success' ? 'circle-check' : 'circle-info');
    const span = document.createElement('span');
    span.textContent = msg;
    left.appendChild(span);
    t.appendChild(left);

    if (opts.canUndo && undoStack.length > 0 && isEditor()) {
        const ub = document.createElement('button');
        ub.type = 'button';
        ub.className = 'px-2.5 py-1 rounded-lg bg-white/20 hover:bg-white/30 font-extrabold text-[11px] cursor-pointer shrink-0 inline-flex items-center gap-1';
        ub.innerHTML = `${svgIcon('rotate-left')}<span>Desfazer</span>`;
        ub.onclick = () => { t.remove(); undoLastAction(); };
        t.appendChild(ub);
    }
    wrap.appendChild(t);
    setTimeout(() => { if (t.parentNode) t.remove(); }, opts.canUndo ? 6000 : 3400);
}

function openConfirmModal(title, msg, onConfirm) {
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMessage').textContent = msg;
    confirmCallback = onConfirm;
    document.getElementById('confirmProceedBtn').onclick = () => {
        const cb = confirmCallback;
        closeConfirmModal();
        if (cb) cb();
    };
    document.getElementById('confirmModal').classList.remove('hidden');
}
function closeConfirmModal() {
    document.getElementById('confirmModal').classList.add('hidden');
    confirmCallback = null;
}

// ---- Tema, Avatares & Navegação ----
const AVATAR_GRADS = [
    'linear-gradient(135deg,#004C97,#00A8E8)',
    'linear-gradient(135deg,#0F766E,#14B8A6)',
    'linear-gradient(135deg,#4338CA,#818CF8)',
    'linear-gradient(135deg,#B45309,#F59E0B)',
    'linear-gradient(135deg,#9F1239,#F43F5E)',
    'linear-gradient(135deg,#1D4ED8,#38BDF8)'
];
function getAvatarMeta(name) {
    const clean = String(name || '?').trim();
    const parts = clean.split(/\s+/).filter(Boolean);
    const ini = parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : clean.slice(0, 2).toUpperCase();
    let h = 0;
    for (let i = 0; i < clean.length; i++) h = ((h << 5) - h + clean.charCodeAt(i)) | 0;
    return { ini: ini || '?', bg: AVATAR_GRADS[Math.abs(h) % AVATAR_GRADS.length] };
}

function toggleSidebarCollapse() {
    const next = !document.body.classList.contains('sb-collapsed');
    document.body.classList.toggle('sb-collapsed', next);
    safeSet(KEYS.sb, next ? 'true' : 'false');
}
function openMobileSidebar() { document.body.classList.add('sb-mob-open'); }
function closeMobileSidebar() { document.body.classList.remove('sb-mob-open'); }

const VIEW_HEADERS = {
    command: ['Command Center', 'Telemetria executiva e saúde da frota Voith Turbo'],
    inventory: ['Inventário da Frota', 'Consulta, filtros combinados, cautelas e edição rápida'],
    custody: ['Cautela & Campo', 'Quadro público de posse atual e controle de devoluções'],
    lab: ['Laboratório & Baixas', 'Calibrações externas, alertas de SLA e itens desativados']
};

function applyTheme(isDark) {
    document.documentElement.classList.toggle('dark', isDark);
    setSvgIcon(document.getElementById('themeIcon'), isDark ? 'sun' : 'moon', isDark ? 'text-amber-300 text-xs' : 'text-xs');
    setSvgIcon(document.getElementById('sbThemeIcon'), isDark ? 'sun' : 'moon', 'w-5 text-center text-amber-300 shrink-0');
    const sbl = document.getElementById('sbThemeLabel');
    if (sbl) sbl.textContent = isDark ? 'Modo Claro' : 'Modo Escuro';
}
function toggleTheme() {
    const root = document.documentElement;
    const next = !root.classList.contains('dark');
    const commitSwap = () => {
        root.classList.add('vp-no-trans');
        applyTheme(next);
        requestAnimationFrame(() => {
            requestAnimationFrame(() => root.classList.remove('vp-no-trans'));
        });
    };
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (typeof document.startViewTransition === 'function' && !reduced) {
        try { document.startViewTransition(commitSwap); } catch (e) { commitSwap(); }
    } else {
        commitSwap();
    }
    requestAnimationFrame(() => safeSet(KEYS.dark, next ? 'true' : 'false'));
}

function scheduleInventoryPrewarm() {
    if (!dirtyViews.inventory || currentView === 'inventory') return;
    if (invPrewarmHandle) {
        if (typeof cancelIdleCallback === 'function') cancelIdleCallback(invPrewarmHandle);
        else clearTimeout(invPrewarmHandle);
        invPrewarmHandle = null;
    }
    const run = () => {
        invPrewarmHandle = null;
        if (!dirtyViews.inventory || currentView === 'inventory') return;
        if (dirtyViews.dropdowns) { populateFilterDropdowns(); dirtyViews.dropdowns = false; }
        applyInventoryFilters();
        dirtyViews.inventory = false;
    };
    if (typeof requestIdleCallback === 'function') invPrewarmHandle = requestIdleCallback(run, { timeout: 450 });
    else invPrewarmHandle = setTimeout(run, 90);
}

function navigateTo(view, skipAutoRender = false) {
    const prevView = currentView;
    const changed = prevView !== view;

    if (changed && prevView === 'inventory') {
        const wrap = document.getElementById('inventoryTableWrap');
        if (wrap && !isCardsViewActive()) savedInvScrollTop = wrap.scrollTop;
        if (isCardsViewActive() && invRenderedCount > INV_FIRST_BATCH) {
            const cw = document.getElementById('inventoryCardsWrap');
            if (cw) cw.innerHTML = '';
            invRenderedCount = 0;
            dirtyViews.inventory = true;
        }
    }

    currentView = view;
    ['command', 'inventory', 'custody', 'lab'].forEach(v => {
        const sec = document.getElementById(`view-${v}`);
        if (!sec) return;
        if (v === view) sec.removeAttribute('data-hidden');
        else sec.setAttribute('data-hidden', 'true');
    });
    document.querySelectorAll('[data-nav]').forEach(btn => {
        btn.classList.toggle('is-active', btn.getAttribute('data-nav') === view);
    });
    const vh = VIEW_HEADERS[view];
    if (vh) {
        const tt = document.getElementById('topbarViewTitle');
        const ts = document.getElementById('topbarViewSub');
        if (tt) tt.textContent = vh[0];
        if (ts) ts.textContent = vh[1];
    }
    if (changed) window.scrollTo({ top: 0, behavior: 'instant' });
    if (skipAutoRender) return;

    if (dirtyViews.dropdowns && (view === 'inventory' || view === 'command')) {
        populateFilterDropdowns();
        dirtyViews.dropdowns = false;
    }
    if (view === 'command' && dirtyViews.command) {
        renderDynamicSimulator();
        renderCommandCenter();
        dirtyViews.command = false;
    } else if (view === 'inventory') {
        if (dirtyViews.inventory) {
            dirtyViews.inventory = false;
            requestAnimationFrame(() => {
                if (currentView === 'inventory') applyInventoryFilters();
                else dirtyViews.inventory = true;
            });
        } else if (invVirtualActive && !isCardsViewActive()) {
            requestAnimationFrame(() => {
                if (currentView !== 'inventory') return;
                const wrap = document.getElementById('inventoryTableWrap');
                if (wrap && savedInvScrollTop > 0) wrap.scrollTop = savedInvScrollTop;
                updateVirtualTableWindow(false);
            });
        }
    } else if (view === 'custody' && dirtyViews.custody) {
        dirtyViews.custody = false;
        requestAnimationFrame(() => {
            if (currentView === 'custody') renderCustodyBoard();
            else dirtyViews.custody = true;
        });
    } else if (view === 'lab' && dirtyViews.lab) {
        dirtyViews.lab = false;
        requestAnimationFrame(() => {
            if (currentView === 'lab') renderLabTables();
            else dirtyViews.lab = true;
        });
    }
}

function toggleSystemMenu(e) {
    if (e) e.stopPropagation();
    document.getElementById('systemMenuDropdown').classList.toggle('hidden');
}
function closeSystemMenu() {
    const m = document.getElementById('systemMenuDropdown');
    if (m) m.classList.add('hidden');
}
