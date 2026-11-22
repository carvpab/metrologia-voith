// ============================================================================
// VOITH TURBO — PRECISION METROLOGY OS v12 • SUPABASE SQL, REALTIME & AUTH
// ============================================================================

// ---- Camada de Transporte Unificada (Supabase / Corporate REST / Legacy Sheets) ----
function getBackendMode() {
    const cfg = window.VOITH_CONFIG || {};
    if (cfg.BACKEND === 'supabase' && cfg.SUPABASE_URL && cfg.SUPABASE_KEY) return 'supabase';
    if (cfg.BACKEND === 'corporate_rest' && cfg.CORPORATE_API_URL) return 'corporate_rest';
    if (cfg.SHEETS_API_URL || DEFAULT_SHEETS_API_URL) return 'sheets';
    return 'none';
}
function isCloudConfigured() {
    return getBackendMode() !== 'none';
}
function getCloudUrl() {
    const cfg = window.VOITH_CONFIG || {};
    const mode = getBackendMode();
    if (mode === 'supabase') return String(cfg.SUPABASE_URL || '').replace(/\/+$/, '');
    if (mode === 'corporate_rest') return String(cfg.CORPORATE_API_URL || '').replace(/\/+$/, '');
    return String(cfg.SHEETS_API_URL || DEFAULT_SHEETS_API_URL || '').trim();
}
function getSupabaseHeaders() {
    const key = String((window.VOITH_CONFIG && window.VOITH_CONFIG.SUPABASE_KEY) || '').trim();
    const h = { 'Content-Type': 'application/json', 'apikey': key };
    // Chaves legadas JWT (eyJ...) aceitam Authorization: Bearer; chaves sb_publishable_ usam apenas apikey
    if (key.startsWith('eyJ')) h['Authorization'] = `Bearer ${key}`;
    return h;
}
function getBackendLabel() {
    const mode = getBackendMode();
    if (mode === 'supabase') return realtimeConnected ? 'Supabase SQL • Tempo Real' : 'Supabase SQL (v12)';
    if (mode === 'corporate_rest') return 'API Corporativa SQL';
    return serverSupportsDelta ? 'Nuvem Online (Delta)' : 'Nuvem Online';
}

async function cloudRpc(payloadObj, timeoutMs = 15000) {
    const mode = getBackendMode();
    const base = getCloudUrl();
    if (!base || mode === 'none') throw new Error('Backend não configurado.');

    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const tid = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
    try {
        let res;
        if (mode === 'supabase') {
            res = await fetch(`${base}/rest/v1/rpc/voith_rpc`, {
                method: 'POST',
                headers: getSupabaseHeaders(),
                body: JSON.stringify({ payload: payloadObj }),
                cache: 'no-store',
                signal: ctrl ? ctrl.signal : undefined
            });
        } else if (mode === 'corporate_rest') {
            res = await fetch(`${base}/rpc`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payloadObj),
                cache: 'no-store',
                signal: ctrl ? ctrl.signal : undefined
            });
        } else {
            res = await fetch(base, {
                method: 'POST',
                redirect: 'follow',
                cache: 'no-store',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(payloadObj),
                signal: ctrl ? ctrl.signal : undefined
            });
        }
        const raw = await res.text();
        let data;
        try { data = JSON.parse(raw); } catch { throw new Error(`Resposta inválida do servidor (HTTP ${res.status})`); }
        if (!res.ok) {
            throw new Error((data && (data.message || data.error || data.hint)) || `Erro HTTP ${res.status}`);
        }
        return data;
    } finally {
        if (tid) clearTimeout(tid);
    }
}

async function cloudLoadState(usePrefetch = false) {
    const mode = getBackendMode();
    const base = getCloudUrl();
    if (!base || mode === 'none') throw new Error('Backend não configurado.');

    const endpoint = mode === 'supabase'
        ? `${base}/rest/v1/rpc/voith_load_state`
        : mode === 'corporate_rest'
            ? `${base}/state`
            : `${base}${base.includes('?') ? '&' : '?'}t=${Date.now()}`;

    const fetchFresh = async () => {
        const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const tid = ctrl ? setTimeout(() => ctrl.abort(), 15000) : null;
        try {
            let res;
            if (mode === 'supabase') {
                res = await fetch(endpoint, {
                    method: 'POST',
                    headers: getSupabaseHeaders(),
                    body: '{}',
                    cache: 'no-store',
                    signal: ctrl ? ctrl.signal : undefined
                });
            } else if (mode === 'corporate_rest') {
                res = await fetch(endpoint, {
                    method: 'GET',
                    credentials: 'include',
                    cache: 'no-store',
                    signal: ctrl ? ctrl.signal : undefined
                });
            } else {
                res = await fetch(endpoint, {
                    method: 'GET',
                    redirect: 'follow',
                    cache: 'no-store',
                    signal: ctrl ? ctrl.signal : undefined
                });
            }
            const raw = await res.text();
            if (!res.ok) {
                let errObj = null;
                try { errObj = JSON.parse(raw); } catch {}
                throw new Error((errObj && (errObj.message || errObj.error)) || `Erro HTTP ${res.status}`);
            }
            return raw;
        } finally {
            if (tid) clearTimeout(tid);
        }
    };

    let raw;
    if (usePrefetch && window.__VOITH_CLOUD_PREFETCH__ && window.__VOITH_CLOUD_PREFETCH__.url === endpoint) {
        const p = window.__VOITH_CLOUD_PREFETCH__.promise;
        window.__VOITH_CLOUD_PREFETCH__ = null;
        try {
            raw = await Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('Prefetch timeout')), 12000))]);
        } catch {
            raw = await fetchFresh();
        }
    } else {
        raw = await fetchFresh();
    }
    const parsed = JSON.parse(raw);
    if (parsed && parsed.code && parsed.message && parsed.ok === undefined) {
        throw new Error(parsed.message);
    }
    return parsed;
}

// ---- Supabase Realtime WebSocket (Sincronização Instantânea APK <-> PC) ----
let realtimeWs = null;
let realtimeConnected = false;
let realtimeHeartbeatTimer = null;
let realtimeReconnectTimer = null;
let realtimeRefSeq = 1;
let realtimeBackoffMs = 3000;

function stopSupabaseRealtime() {
    clearInterval(realtimeHeartbeatTimer); realtimeHeartbeatTimer = null;
    clearTimeout(realtimeReconnectTimer); realtimeReconnectTimer = null;
    realtimeConnected = false;
    if (realtimeWs) {
        try { realtimeWs.onclose = null; realtimeWs.close(); } catch {}
        realtimeWs = null;
    }
}

function startSupabaseRealtime() {
    const cfg = window.VOITH_CONFIG || {};
    if (getBackendMode() !== 'supabase' || !cfg.REALTIME || !navigator.onLine) return;
    if (typeof WebSocket === 'undefined') return;
    if (realtimeWs && (realtimeWs.readyState === WebSocket.OPEN || realtimeWs.readyState === WebSocket.CONNECTING)) return;

    const base = getCloudUrl();
    const key = String(cfg.SUPABASE_KEY || '').trim();
    if (!base || !key) return;

    const wsUrl = base.replace(/^http/i, 'ws') + `/realtime/v1/websocket?apikey=${encodeURIComponent(key)}&vsn=1.0.0`;
    try {
        const ws = new WebSocket(wsUrl);
        realtimeWs = ws;

        ws.onopen = () => {
            realtimeConnected = true;
            realtimeBackoffMs = 3000;
            const joinRef = String(realtimeRefSeq++);
            ws.send(JSON.stringify({
                topic: 'realtime:public:system_meta',
                event: 'phx_join',
                payload: {
                    config: {
                        broadcast: { self: false },
                        presence: { key: '' },
                        postgres_changes: [
                            { event: '*', schema: 'public', table: 'system_meta' }
                        ]
                    }
                },
                ref: joinRef
            }));
            clearInterval(realtimeHeartbeatTimer);
            realtimeHeartbeatTimer = setInterval(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(realtimeRefSeq++) }));
                }
            }, 25000);
            if (isCloudReady && !isSyncing && !hasConflict && !offlineDirty) {
                setCloudUI('online', getBackendLabel());
            }
        };

        ws.onmessage = (ev) => {
            try {
                const msg = JSON.parse(ev.data);
                if (msg && msg.event === 'postgres_changes') {
                    const rec = msg.payload && msg.payload.data && msg.payload.data.record;
                    if (!rec || (rec.key && rec.key !== 'updatedAt')) return;
                    const srvVal = String(rec.value || '').trim();
                    if (srvVal && srvVal === lastServerUpdatedAt) return;
                    if (isSyncing || syncTimer || hasConflict || offlineDirty) return;
                    loadFromCloud(false, false, true);
                }
            } catch {}
        };

        ws.onerror = () => {
            // Falha silenciosa caso firewall corporativo bloqueie WebSocket
        };

        ws.onclose = () => {
            clearInterval(realtimeHeartbeatTimer); realtimeHeartbeatTimer = null;
            realtimeConnected = false;
            if (realtimeWs === ws) realtimeWs = null;
            if (isCloudReady && !isSyncing && !hasConflict && !offlineDirty && navigator.onLine) {
                setCloudUI('online', getBackendLabel());
            }
            if (navigator.onLine && document.visibilityState === 'visible') {
                clearTimeout(realtimeReconnectTimer);
                realtimeReconnectTimer = setTimeout(() => {
                    realtimeBackoffMs = Math.min(30000, realtimeBackoffMs * 2);
                    startSupabaseRealtime();
                }, realtimeBackoffMs);
            }
        };
    } catch {}
}

// ---- Autenticação Segura (Session Token v12 + bcrypt no PostgreSQL) ----
function isEditor() {
    return Boolean(currentAuth && currentAuth.username && (currentAuth.token || currentAuth.password));
}
function isAdmin() {
    return isEditor() && String(currentAuth.username).toLowerCase() === ADMIN_USER;
}
function getAuthPayload() {
    if (!currentAuth) return null;
    if (currentAuth.token) {
        return { username: currentAuth.username, token: currentAuth.token };
    }
    return { username: currentAuth.username, password: currentAuth.password };
}
function requireEditor(openIfLocked = true) {
    if (isEditor()) return true;
    showToast('Modo Consulta: faça login para editar.', 'info');
    if (openIfLocked) openLoginModal();
    return false;
}
function saveAuth(auth, remember) {
    const clean = {
        username: auth.username,
        displayName: auth.displayName || auth.username,
        isAdmin: Boolean(auth.isAdmin),
        remember: Boolean(remember)
    };
    if (auth.token) {
        clean.token = auth.token;
        clean.expiresAt = auth.expiresAt || '';
    } else if (auth.password) {
        clean.password = auth.password;
    }
    const data = JSON.stringify(clean);
    sessDel(KEYS.auth); safeDel(KEYS.auth);
    if (remember) safeSet(KEYS.auth, data); else sessSet(KEYS.auth, data);
}
function restoreAuth() {
    const raw = sessGet(KEYS.auth) || safeGet(KEYS.auth);
    if (!raw) { currentAuth = null; return; }
    try {
        const p = JSON.parse(raw);
        if (p && p.username && (p.token || p.password)) {
            if (p.expiresAt && Date.now() > Date.parse(p.expiresAt)) {
                sessDel(KEYS.auth); safeDel(KEYS.auth);
                currentAuth = null;
                return;
            }
            p.isAdmin = String(p.username).toLowerCase() === ADMIN_USER;
            currentAuth = p;
        }
    } catch { currentAuth = null; }
}
function applyAuthUI() {
    document.body.classList.toggle('vp-readonly', !isEditor());
    document.body.classList.toggle('vp-admin', isAdmin());
    const dispName = isEditor() ? (currentAuth.displayName || currentAuth.username) : 'Consulta';
    const uEl = document.getElementById('headerUserName');
    if (uEl) uEl.textContent = dispName;
    const avEl = document.getElementById('sbUserAvatar');
    if (avEl) {
        const av = getAvatarMeta(dispName);
        avEl.textContent = av.ini;
        avEl.style.background = av.bg;
    }
    const rEl = document.getElementById('sbUserRole');
    if (rEl) rEl.textContent = isAdmin() ? 'Administrador' : isEditor() ? 'Editor Voith' : 'Modo Consulta';
    if (!isEditor()) {
        selectedIds.clear();
        labSelectedIds.clear();
        updateBatchDock();
        closeCustodyModal(); closeExternalModal(); closeReturnLabModal(); closeBatchReturnLabModal();
        closeLostModal(); closeAdminUsersModal(); closeChangePassModal(); closeImportModal();
        closeRapidLocalModal(); closeAuditVaultModal();
    }
    updateUndoUI();
    if (typeof updateOfflineQueueBanner === 'function') updateOfflineQueueBanner();
    renderAll();
}

function openLoginModal() {
    document.getElementById('loginErrBox').classList.add('hidden');
    document.getElementById('loginPassInp').value = '';
    document.getElementById('loginModal').classList.remove('hidden');
    setTimeout(() => document.getElementById('loginUserInp').focus(), 40);
}
function closeLoginModal() { document.getElementById('loginModal').classList.add('hidden'); }

async function submitLogin(e) {
    e.preventDefault();
    const username = document.getElementById('loginUserInp').value.trim();
    const password = document.getElementById('loginPassInp').value.trim();
    const remember = document.getElementById('loginRemChk').checked;
    const errEl = document.getElementById('loginErrBox');
    const btn = document.getElementById('loginBtnSub');
    errEl.classList.add('hidden');
    btn.disabled = true; btn.textContent = 'Verificando...';
    try {
        const data = await cloudRpc({ action: 'login', baseUpdatedAt: '__AUTH_CHECK__', username, password, remember });
        if (!data.ok || !data.authenticated) {
            errEl.textContent = data.error || 'Usuário ou senha incorretos.';
            errEl.classList.remove('hidden');
            return;
        }
        const cleanU = String(data.username || username).trim().toLowerCase();
        currentAuth = {
            username: cleanU,
            displayName: data.displayName || username,
            isAdmin: Boolean(data.isAdmin) && cleanU === ADMIN_USER,
            remember
        };
        if (data.token) {
            currentAuth.token = data.token;
            currentAuth.expiresAt = data.expiresAt || '';
            serverSupportsToken = true;
        } else {
            currentAuth.password = password;
        }
        saveAuth(currentAuth, remember);
        closeLoginModal();
        applyAuthUI();
        showToast(`Bem-vindo(a), ${currentAuth.displayName}! Modo Editor ativo.`, 'success');
    } catch (err) {
        errEl.textContent = err.message || 'Falha ao autenticar no servidor.';
        errEl.classList.remove('hidden');
    } finally {
        btn.disabled = false; btn.textContent = 'Entrar';
    }
}

async function validateSessionQuietly() {
    if (!isEditor() || !isCloudConfigured()) return;
    try {
        const body = currentAuth.token
            ? { action: 'validate_token', auth: getAuthPayload() }
            : { action: 'login', baseUpdatedAt: '__AUTH_CHECK__', username: currentAuth.username, password: currentAuth.password };
        const data = await cloudRpc(body);
        if (data.authEndpoint && !data.authenticated) {
            logoutEditor(true);
            showToast('Sessão expirada ou senha alterada. Faça login novamente.', 'error');
        }
    } catch {}
}

function logoutEditor(silent = false) {
    if (currentAuth && currentAuth.token && isCloudConfigured()) {
        cloudRpc({ action: 'logout', token: currentAuth.token }).catch(() => {});
    }
    currentAuth = null; undoStack = [];
    sessDel(KEYS.auth); safeDel(KEYS.auth);
    applyAuthUI();
    if (!silent) showToast('Modo Consulta ativado.', 'info');
}

// Alterar Própria Senha
function openChangePassModal() {
    if (!requireEditor()) return;
    ['cpOld','cpNew','cpConf'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('cpErr').classList.add('hidden');
    document.getElementById('changePassModal').classList.remove('hidden');
}
function closeChangePassModal() { document.getElementById('changePassModal').classList.add('hidden'); }
async function submitChangePass(e) {
    e.preventDefault();
    if (!requireEditor()) return;
    const cur = document.getElementById('cpOld').value;
    const nw = document.getElementById('cpNew').value.trim();
    const cf = document.getElementById('cpConf').value.trim();
    const err = document.getElementById('cpErr');
    const btn = document.getElementById('cpBtn');
    err.classList.add('hidden');
    if (nw !== cf) { err.textContent = 'As novas senhas não coincidem.'; err.classList.remove('hidden'); return; }
    btn.disabled = true; btn.textContent = 'Salvando...';
    try {
        const d = await cloudRpc({
            action: 'change_password',
            auth: { username: currentAuth.username, password: cur, token: currentAuth.token || '' },
            currentPassword: cur,
            newPassword: nw
        });
        if (!d.ok) { err.textContent = d.error || 'Senha atual incorreta.'; err.classList.remove('hidden'); return; }
        if (d.token) {
            currentAuth.token = d.token;
            currentAuth.expiresAt = d.expiresAt || '';
            delete currentAuth.password;
        } else {
            currentAuth.password = nw;
        }
        saveAuth(currentAuth, currentAuth.remember);
        closeChangePassModal();
        showToast('Senha alterada com sucesso!', 'success');
    } catch (ex) {
        err.textContent = ex.message || 'Erro de conexão.'; err.classList.remove('hidden');
    } finally { btn.disabled = false; btn.textContent = 'Salvar Senha'; }
}

// ---- Painel Admin: Usuários + Listas Oficiais & Higienização ----
function openAdminUsersModal() {
    if (!isAdmin()) return;
    document.getElementById('auErr').classList.add('hidden');
    document.getElementById('adminUsersModal').classList.remove('hidden');
    setAdminTab('users');
    loadAdminUsers();
}
function closeAdminUsersModal() { document.getElementById('adminUsersModal').classList.add('hidden'); }
function setAdminTab(tab) {
    const isU = tab === 'users';
    document.getElementById('admPaneUsers').classList.toggle('hidden', !isU);
    document.getElementById('admPaneLists').classList.toggle('hidden', isU);
    document.getElementById('admTabUsers').className = isU
        ? 'px-3.5 py-2 rounded-t-lg font-extrabold bg-white dark:bg-[#091527] text-[#004C97] dark:text-[#00A8E8] border-t border-l border-r border-[#DCE4EE] dark:border-[#172E4E] cursor-pointer'
        : 'px-3.5 py-2 rounded-t-lg font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer';
    document.getElementById('admTabLists').className = !isU
        ? 'px-3.5 py-2 rounded-t-lg font-extrabold bg-white dark:bg-[#091527] text-[#004C97] dark:text-[#00A8E8] border-t border-l border-r border-[#DCE4EE] dark:border-[#172E4E] cursor-pointer'
        : 'px-3.5 py-2 rounded-t-lg font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer';
    if (!isU) renderControlledListsForm();
}

async function loadAdminUsers() {
    const tb = document.getElementById('auTbody');
    tb.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-slate-400">Carregando...</td></tr>';
    try {
        const d = await cloudRpc({ action: 'list_users', auth: getAuthPayload() });
        if (!d.ok) throw new Error(d.error);
        renderAdminUsers(d.users || []);
    } catch (e) {
        tb.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-rose-500">${escapeHtml(e.message || 'Erro ao carregar')}</td></tr>`;
    }
}
function renderAdminUsers(list) {
    const tb = document.getElementById('auTbody');
    tb.innerHTML = list.map(u => {
        const isRoot = String(u.username).toLowerCase() === ADMIN_USER;
        const su = escapeHtml(u.username).replace(/'/g, "\\'");
        const sn = escapeHtml(u.displayName || u.username).replace(/'/g, "\\'");
        return `<tr>
            <td class="p-3 font-mono font-bold text-[#004C97] dark:text-[#00A8E8]">${escapeHtml(u.username)}</td>
            <td class="p-3 font-semibold">${escapeHtml(u.displayName || u.username)}</td>
            <td class="p-3"><span class="px-2 py-0.5 rounded text-[10px] font-bold ${isRoot?'bg-amber-100 text-amber-900':'bg-sky-100 text-sky-900'}">${isRoot?'ADMIN':'EDITOR'}</span></td>
            <td class="p-3 text-center">${isRoot ? '<span class="text-slate-400">Protegido</span>' : `
                <button type="button" onclick="openResetPassModal('${su}','${sn}')" class="px-2 py-1 rounded bg-amber-100 text-amber-900 font-bold mr-1 cursor-pointer">Redefinir</button>
                <button type="button" onclick="askDeleteUser('${su}','${sn}')" class="px-2 py-1 rounded bg-rose-100 text-rose-700 font-bold cursor-pointer">Remover</button>
            `}</td>
        </tr>`;
    }).join('');
}
async function submitCreateUser(e) {
    e.preventDefault();
    if (!isAdmin()) return;
    const login = document.getElementById('auLogin').value.trim().toLowerCase();
    const name = document.getElementById('auName').value.trim();
    const pass = document.getElementById('auPass').value.trim();
    const err = document.getElementById('auErr');
    err.classList.add('hidden');
    try {
        const d = await cloudRpc({ action: 'create_user', auth: getAuthPayload(), newUser: { username: login, displayName: name, password: pass } });
        if (!d.ok) { err.textContent = d.error || 'Erro ao criar.'; err.classList.remove('hidden'); return; }
        ['auLogin','auName','auPass'].forEach(id => document.getElementById(id).value = '');
        renderAdminUsers(d.users || []);
        showToast(`Usuário "${login}" criado!`, 'success');
    } catch (ex) { err.textContent = ex.message || 'Falha na comunicação.'; err.classList.remove('hidden'); }
}
function openResetPassModal(u, name) {
    document.getElementById('rpUser').value = u;
    document.getElementById('rpLabel').textContent = `${name} (${u})`;
    document.getElementById('rpPass').value = `voith${Math.floor(1000+Math.random()*9000)}`;
    document.getElementById('rpErr').classList.add('hidden');
    document.getElementById('resetPassModal').classList.remove('hidden');
}
function closeResetPassModal() { document.getElementById('resetPassModal').classList.add('hidden'); }
async function submitResetUserPass(e) {
    e.preventDefault();
    const target = document.getElementById('rpUser').value;
    const pass = document.getElementById('rpPass').value.trim();
    const err = document.getElementById('rpErr');
    try {
        const d = await cloudRpc({ action: 'reset_password', auth: getAuthPayload(), targetUsername: target, newPassword: pass });
        if (!d.ok) { err.textContent = d.error || 'Erro'; err.classList.remove('hidden'); return; }
        closeResetPassModal();
        showToast(`Senha de "${target}" redefinida!`, 'success');
    } catch (ex) { err.textContent = ex.message || 'Erro de conexão.'; err.classList.remove('hidden'); }
}
function askDeleteUser(u, name) {
    openConfirmModal('Remover Login', `Remover acesso de editor de "${name}" (${u})?`, async () => {
        try {
            const d = await cloudRpc({ action: 'delete_user', auth: getAuthPayload(), targetUsername: u });
            if (!d.ok) { showToast(d.error || 'Erro ao remover', 'error'); return; }
            renderAdminUsers(d.users || []);
            showToast(`Login "${u}" removido.`, 'info');
        } catch { showToast('Erro de conexão.', 'error'); }
    });
}

// ---- Listas Controladas Oficiais & Higienização da Base ----
function renderControlledListsForm() {
    document.getElementById('clLocalsArea').value = (controlledLists.locals || []).join('\n');
    document.getElementById('clSectorsArea').value = (controlledLists.sectors || []).join('\n');
    const alLines = Object.entries(controlledLists.aliases || {}).map(([k, v]) => `${k} = ${v}`);
    document.getElementById('clAliasesArea').value = alLines.join('\n');

    let changes = 0;
    instrumentsData.forEach(it => {
        if (it.local && canonicalizeLocal(it.local) !== it.local) changes++;
        if (it.setor && canonicalizeSector(it.setor) !== it.setor) changes++;
    });
    document.getElementById('hygienePreviewText').textContent = changes > 0
        ? `${changes} campo(s) na base atual podem ser padronizados automaticamente agora.`
        : 'Base atual já está alinhada com as regras de padronização configuradas.';
}
function autoSeedControlledLists() {
    const locs = [...new Set(instrumentsData.map(i => cleanSpaces(i.local)).filter(Boolean))].sort();
    const secs = [...new Set(instrumentsData.map(i => cleanSpaces(i.setor)).filter(Boolean))].sort();
    document.getElementById('clLocalsArea').value = locs.join('\n');
    document.getElementById('clSectorsArea').value = secs.join('\n');
    showToast(`Carregados ${locs.length} locais e ${secs.length} setores da base.`, 'info');
}
async function saveControlledListsForm() {
    if (!isAdmin()) return;
    const locals = [...new Set(document.getElementById('clLocalsArea').value.split(/\r?\n/).map(cleanSpaces).filter(Boolean))];
    const sectors = [...new Set(document.getElementById('clSectorsArea').value.split(/\r?\n/).map(cleanSpaces).filter(Boolean))];
    const aliases = {};
    document.getElementById('clAliasesArea').value.split(/\r?\n/).forEach(line => {
        const idx = line.indexOf('=');
        if (idx > 0) {
            const k = cleanSpaces(line.slice(0, idx)).toLowerCase();
            const v = cleanSpaces(line.slice(idx + 1));
            if (k && v) aliases[k] = v;
        }
    });
    controlledLists = { locals, sectors, aliases };
    VoithDB.set('controlledLists', controlledLists);
    populateFilterDropdowns();
    renderControlledListsForm();
    if (isCloudConfigured()) {
        try {
            await cloudRpc({ action: 'save_lists', auth: getAuthPayload(), controlledLists });
        } catch {}
    }
    showToast('Listas controladas salvas!', 'success');
}
function runBaseHygiene() {
    if (!isAdmin()) return;
    let count = 0;
    const changed = [];
    instrumentsData.forEach(it => {
        const nl = it.local ? canonicalizeLocal(it.local) : '';
        const ns = it.setor ? canonicalizeSector(it.setor) : 'Voith Turbo (Industrial)';
        if (nl !== it.local || ns !== it.setor) count++;
    });
    if (count === 0) {
        showToast('Nenhum registro precisa de padronização.', 'info');
        return;
    }
    openConfirmModal('Higienizar Base', `Padronizar automaticamente ${count} instrumento(s) conforme as Listas Oficiais e Aliases? Você pode desfazer com Ctrl+Z.`, () => {
        pushUndo(`Higienização (${count} itens)`);
        instrumentsData.forEach(it => {
            const nl = it.local ? canonicalizeLocal(it.local) : '';
            const ns = it.setor ? canonicalizeSector(it.setor) : 'Voith Turbo (Industrial)';
            if (nl !== it.local || ns !== it.setor) {
                it.local = nl;
                it.setor = ns;
                invalidateInstMeta(it);
                changed.push(it);
            }
        });
        DeltaTracker.markInstUpsert(changed);
        queueAudit({ module:'Admin', action:'Higienizar Base', target:`${changed.length} itens`, field:'Setor/Local', before:'Variações', after:'Padronizado', details:`Padronizou ${changed.length} registros` });
        persistAll();
        renderAll();
        renderControlledListsForm();
        showToast(`${changed.length} instrumento(s) padronizado(s)!`, 'success', { canUndo:true });
    });
}

// ---- COFRE OCULTO DE AUDITORIA (EXCLUSIVO ADMIN — ZERO BOTÕES VISÍVEIS) ----
let secretTapCount = 0;
let secretTapTimer = null;
function onSecretAuditTap(e) {
    if (!isAdmin()) return;
    if (e) e.stopPropagation();
    secretTapCount++;
    clearTimeout(secretTapTimer);
    secretTapTimer = setTimeout(() => { secretTapCount = 0; }, 1400);
    if (secretTapCount >= 5) {
        secretTapCount = 0;
        openAuditVaultModal();
    }
}

let secretItemTapCount = 0;
let secretItemTapTimer = null;
function onSecretItemAuditTap() {
    if (!isAdmin()) return;
    secretItemTapCount++;
    clearTimeout(secretItemTapTimer);
    secretItemTapTimer = setTimeout(() => { secretItemTapCount = 0; }, 1100);
    if (secretItemTapCount >= 3) {
        secretItemTapCount = 0;
        toggleInspectorItemAudit();
    }
}

function openAuditVaultModal() {
    if (!isAdmin()) return;
    document.getElementById('auditSearchInp').value = '';
    document.getElementById('auditVaultModal').classList.remove('hidden');
    loadAuditVault(false);
}
function closeAuditVaultModal() {
    const m = document.getElementById('auditVaultModal');
    if (m) m.classList.add('hidden');
}
async function loadAuditVault(forceNet = false) {
    if (!isAdmin()) return;
    const meta = document.getElementById('auditVaultMeta');
    if (meta) meta.textContent = 'Consultando trilha no banco SQL...';
    if (isCloudConfigured() && (forceNet || cachedAuditEvents.length === 0)) {
        try {
            const d = await cloudRpc({ action: 'list_audit', auth: getAuthPayload(), limit: 300 });
            if (d.ok && Array.isArray(d.events)) {
                cachedAuditEvents = d.events;
            }
        } catch {}
    }
    renderAuditVaultTable();
}
function renderAuditVaultTable() {
    const tb = document.getElementById('auditVaultTbody');
    const meta = document.getElementById('auditVaultMeta');
    if (!tb) return;
    const q = normSearch(document.getElementById('auditSearchInp')?.value || '');
    const list = cachedAuditEvents.filter(ev => !q || normSearch(`${ev.displayName} ${ev.username} ${ev.module} ${ev.action} ${ev.target} ${ev.field} ${ev.before} ${ev.after} ${ev.details}`).includes(q));
    if (meta) meta.textContent = `${list.length} evento(s) exibido(s)`;
    if (list.length === 0) {
        tb.innerHTML = '<tr><td colspan="6" class="p-8 text-center text-slate-400">Nenhum evento de auditoria registrado ainda.</td></tr>';
        return;
    }
    tb.innerHTML = list.slice(0, 250).map(ev => {
        const dt = ev.timestamp ? new Date(ev.timestamp) : null;
        const when = (dt && !isNaN(dt.getTime())) ? dt.toLocaleString('pt-BR') : (ev.timestamp || '-');
        return `<tr class="hover:bg-[#F7F9FC] dark:hover:bg-[#0D1D34]">
            <td class="p-3 font-mono text-[11px] whitespace-nowrap text-slate-500">${escapeHtml(when)}</td>
            <td class="p-3 font-bold">${escapeHtml(ev.displayName || ev.username || '-')}</td>
            <td class="p-3"><span class="font-semibold">${escapeHtml(ev.module)}</span><div class="text-[10px] text-[#004C97] dark:text-[#00A8E8] font-bold">${escapeHtml(ev.action)}</div></td>
            <td class="p-3 font-mono font-bold text-[#004C97] dark:text-[#00A8E8]">${escapeHtml(ev.target)}</td>
            <td class="p-3 text-[11px]"><span class="text-slate-400">${escapeHtml(ev.before)}</span> → <strong class="text-emerald-700 dark:text-emerald-400">${escapeHtml(ev.after)}</strong></td>
            <td class="p-3 text-[11px] text-slate-500 max-w-[200px] truncate" title="${escapeHtml(ev.details)}">${escapeHtml(ev.details)}</td>
        </tr>`;
    }).join('');
}

async function toggleInspectorItemAudit() {
    if (!isAdmin()) return;
    const box = document.getElementById('inspAuditBox');
    const listEl = document.getElementById('inspAuditList');
    if (!box || !listEl) return;
    const code = (document.getElementById('inspCode').value || '').trim().toUpperCase();
    if (!code) return;
    if (!box.classList.contains('hidden')) {
        box.classList.add('hidden');
        return;
    }
    box.classList.remove('hidden');
    listEl.innerHTML = '<div class="text-slate-400">Carregando histórico...</div>';
    if (cachedAuditEvents.length === 0 && isCloudConfigured()) {
        await loadAuditVault(true);
    }
    const hits = cachedAuditEvents.filter(ev => normSearch(`${ev.target} ${ev.details}`).includes(normSearch(code))).slice(0, 12);
    if (hits.length === 0) {
        listEl.innerHTML = '<div class="text-slate-400">Nenhuma alteração registrada ainda para este código.</div>';
        return;
    }
    listEl.innerHTML = hits.map(ev => {
        const dt = ev.timestamp ? new Date(ev.timestamp) : null;
        const when = (dt && !isNaN(dt.getTime())) ? dt.toLocaleString('pt-BR') : '';
        return `<div class="p-2 rounded bg-white dark:bg-[#091527] border border-[#DCE4EE] dark:border-[#172E4E]">
            <div class="flex justify-between gap-2"><strong class="text-[#004C97] dark:text-[#00A8E8]">${escapeHtml(ev.action)} (${escapeHtml(ev.field)})</strong><span class="font-mono text-[10px] text-slate-400">${escapeHtml(when)}</span></div>
            <div class="text-slate-600 dark:text-slate-300 mt-0.5">${escapeHtml(ev.displayName || ev.username)}: ${escapeHtml(ev.before)} → <strong>${escapeHtml(ev.after)}</strong></div>
        </div>`;
    }).join('');
}

// ---- Motor Cloud Sync v12 (Supabase SQL + Realtime + Trava `rev` + Fila Offline) ----
function setCloudUI(state, text) {
    const pill = document.getElementById('cloudPillBtn');
    const dot = document.getElementById('cloudDot');
    const txt = document.getElementById('cloudText');
    const mod = document.getElementById('cloudModalStatus');
    if (txt) txt.textContent = text;
    if (mod) mod.textContent = text;
    if (!pill || !dot) return;
    const styles = {
        online: ['bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 border-emerald-400/30', 'bg-emerald-500'],
        syncing: ['bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-400/30', 'bg-sky-400 animate-ping'],
        warning: ['bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-400/30', 'bg-amber-500'],
        error: ['bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-400/30', 'bg-rose-500']
    }[state] || ['bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-white/15', 'bg-slate-400'];
    pill.className = `inline-flex items-center justify-center w-9 h-9 rounded-lg border cursor-pointer transition shrink-0 ${styles[0]}`;
    pill.title = `Banco SQL Cloud: ${text} (clique para detalhes)`;
    dot.className = `w-2.5 h-2.5 rounded-full ${styles[1]}`;
}

function updateOfflineQueueBanner() {
    const banner = document.getElementById('offlineQueueBanner');
    const txt = document.getElementById('offlineQueueText');
    const btn = document.getElementById('offlineRetryBtn');
    if (!banner || !txt) return;

    const pendingN = DeltaTracker.pendingCount();
    const shouldShow = isEditor() && !hasConflict && (offlineDirty || (!navigator.onLine && pendingN > 0));
    banner.classList.toggle('hidden', !shouldShow);
    banner.hidden = !shouldShow;
    banner.style.display = shouldShow ? 'flex' : 'none';
    if (!shouldShow) return;

    const count = Math.max(1, pendingN);
    const label = count === 1 ? '1 alteração pendente' : `${count} alterações pendentes`;
    if (!navigator.onLine) {
        txt.textContent = `${label} de envio — serão sincronizadas ao reconectar.`;
    } else if (isSyncing) {
        txt.textContent = `Reenviando ${label} para o banco SQL...`;
    } else {
        txt.textContent = `${label} de envio — clique em "Reenviar agora" para sincronizar.`;
    }
    if (btn) btn.disabled = isSyncing;
}

function retryOfflineSyncNow() {
    if (!requireEditor()) return;
    if (!navigator.onLine) {
        showToast('Sem conexão no momento. Assim que o sinal voltar, enviaremos automaticamente.', 'info');
        return;
    }
    clearTimeout(syncTimer);
    syncTimer = null;
    pushCloud(true, false);
}

function applyRevUpdates(revUpdates) {
    if (!revUpdates || typeof revUpdates !== 'object') return;
    const applyTo = (arr, mapObj) => {
        if (!mapObj || typeof mapObj !== 'object') return;
        for (let i = 0; i < arr.length; i++) {
            const k = String(arr[i].id);
            if (mapObj[k] !== undefined) {
                arr[i].rev = Number(mapObj[k]) || (Number(arr[i].rev) || 1);
            }
        }
    };
    applyTo(instrumentsData, revUpdates.inst);
    applyTo(calibrationHistory, revUpdates.hist);
    applyTo(lostInstrumentsData, revUpdates.lost);
}

let lastConflictScope = 'full';

function scheduleCloudSync() {
    if (!isEditor() || !isCloudConfigured() || !isCloudReady || isApplyingCloud) return;
    if (hasConflict) { setCloudUI('warning', 'Conflito'); return; }
    if (!navigator.onLine) {
        offlineDirty = true;
        VoithDB.set('pendingDelta', DeltaTracker.serialize());
        setCloudUI('warning', 'Fila Offline');
        updateOfflineQueueBanner();
        return;
    }
    if (isSyncing) { pendingSync = true; return; }
    clearTimeout(syncTimer);
    setCloudUI('syncing', 'Salvando...');
    syncTimer = setTimeout(() => { syncTimer = null; pushCloud(false, false); }, 150);
}

async function loadFromCloud(feedback = false, usePrefetch = false, silent = false) {
    if (!isCloudConfigured()) { setCloudUI('off', 'Offline'); return false; }
    if (silent && (isSyncing || syncTimer || hasConflict || offlineDirty)) return false;
    if (!silent) {
        const eb = document.getElementById('cloudModalErr');
        if (eb) eb.classList.add('hidden');
        setCloudUI('syncing', 'Sincronizando...');
    }
    try {
        const data = await cloudLoadState(usePrefetch);
        lastCloudCheckMs = Date.now();
        if (data.ok === false) throw new Error(data.error || 'Erro ao consultar banco SQL');

        serverSupportsDelta = Boolean(data.supportsDelta || Number(data.apiVersion) >= 11);
        serverSupportsToken = Boolean(data.supportsToken || Number(data.apiVersion) >= 11);

        if (data.controlledLists && typeof data.controlledLists === 'object') {
            if (Array.isArray(data.controlledLists.locals) && data.controlledLists.locals.length) controlledLists.locals = data.controlledLists.locals;
            if (Array.isArray(data.controlledLists.sectors) && data.controlledLists.sectors.length) controlledLists.sectors = data.controlledLists.sectors;
            if (data.controlledLists.aliases && Object.keys(data.controlledLists.aliases).length) controlledLists.aliases = data.controlledLists.aliases;
        }

        const srvTime = String(data.updatedAt || data.savedAt || '').trim();
        if (silent && srvTime && srvTime === lastServerUpdatedAt) return true;

        if (offlineDirty && DeltaTracker.pendingCount() > 0 && !feedback) {
            isCloudReady = true;
            document.body.classList.remove('vp-loading');
            updateOfflineQueueBanner();
            startSupabaseRealtime();
            if (isEditor() && navigator.onLine) {
                setTimeout(() => pushCloud(false, false), 250);
            }
            return true;
        }

        const hasData = !data.empty && ((data.instrumentsData?.length)||0) + ((data.calibrationHistory?.length)||0) + ((data.lostInstrumentsData?.length)||0) > 0;
        if (hasData) {
            if (silent && (isSyncing || syncTimer)) return true;
            isApplyingCloud = true;
            if (Array.isArray(data.instrumentsData)) {
                instrumentsData = data.instrumentsData.map((x,i) => normalizeInstrument(x, i+1));
                sortByCode(instrumentsData);
            }
            if (Array.isArray(data.calibrationHistory)) {
                calibrationHistory = data.calibrationHistory;
            }
            if (Array.isArray(data.lostInstrumentsData)) {
                lostInstrumentsData = data.lostInstrumentsData.map((x,i) => ({ ...x, id: Number(x.id) || (i+1) }));
            }
            ensureHistoryIds();
            VoithDB.saveSnapshot(instrumentsData, calibrationHistory, lostInstrumentsData, controlledLists, srvTime);
            isApplyingCloud = false;
            isCloudReady = true; hasConflict = false;
            lastServerUpdatedAt = srvTime;
            document.body.classList.remove('vp-loading');
            renderAll();
            updateOfflineQueueBanner();
            startSupabaseRealtime();
            const dt = srvTime ? new Date(srvTime) : new Date();
            document.getElementById('cloudLastSync').textContent = isNaN(dt.getTime()) ? new Date().toLocaleString('pt-BR') : dt.toLocaleString('pt-BR');
            setCloudUI('online', getBackendLabel());
            if (feedback) showToast(`Sincronizado (${instrumentsData.length} instrumentos).`, 'success');
            else if (silent) showToast('Atualização recebida em tempo real.', 'info');
            return true;
        } else {
            isCloudReady = true; hasConflict = false;
            document.body.classList.remove('vp-loading');
            startSupabaseRealtime();
            setCloudUI('warning', 'Banco Vazio (Pronto p/ Restaurar Backup)');
            return false;
        }
    } catch (err) {
        document.body.classList.remove('vp-loading');
        if (!silent) {
            setCloudUI('error', navigator.onLine ? 'Erro Sync' : 'Sem Conexão');
            const eb = document.getElementById('cloudModalErr');
            if (eb) { eb.textContent = String(err.message || err); eb.classList.remove('hidden'); }
        }
        updateOfflineQueueBanner();
        return false;
    }
}

async function pushCloud(feedback = false, force = false) {
    if (!isCloudConfigured() || !isEditor()) return;
    if (hasConflict && !force) return;
    if (!navigator.onLine) {
        offlineDirty = true;
        VoithDB.set('pendingDelta', DeltaTracker.serialize());
        setCloudUI('warning', 'Fila Offline');
        updateOfflineQueueBanner();
        return;
    }
    if (isSyncing) { pendingSync = true; return; }
    isSyncing = true; pendingSync = false;
    setCloudUI('syncing', 'Salvando...');
    updateOfflineQueueBanner();
    const auditBatch = pendingAuditEvents.slice();
    const useDelta = serverSupportsDelta && DeltaTracker.hasDelta();
    const deltaSnap = useDelta ? DeltaTracker.snapshotDelta() : null;

    try {
        let d;
        if (useDelta) {
            d = await cloudRpc({
                action: 'save_delta',
                auth: getAuthPayload(),
                updatedAt: new Date().toISOString(),
                baseUpdatedAt: lastServerUpdatedAt || '',
                force: Boolean(force),
                delta: deltaSnap,
                auditEvents: auditBatch
            });
            if (d && d.ok === false && /desconhecid|unknown/i.test(String(d.error || ''))) {
                serverSupportsDelta = false;
                d = null;
            }
        }
        if (!d) {
            d = await cloudRpc({
                action: 'save',
                auth: getAuthPayload(),
                updatedAt: new Date().toISOString(),
                baseUpdatedAt: lastServerUpdatedAt || '',
                force: Boolean(force),
                auditEvents: auditBatch,
                instrumentsData, calibrationHistory, lostInstrumentsData
            }, 30000);
        }
        if (d.unauthorized) {
            logoutEditor(true); setCloudUI('error', 'Acesso Negado'); openLoginModal(); return;
        }
        if (d.conflict) {
            hasConflict = true; pendingSync = false;
            lastConflictScope = d.conflictScope || 'full';
            setCloudUI('warning', 'Conflito');
            const dt = d.serverUpdatedAt ? new Date(d.serverUpdatedAt) : null;
            const timeStr = (dt && !isNaN(dt.getTime())) ? dt.toLocaleString('pt-BR') : 'Mais recente';
            const timeEl = document.getElementById('conflictTime');
            if (timeEl) timeEl.textContent = timeStr;

            const scopeEl = document.getElementById('conflictScopeMsg');
            const itemsBox = document.getElementById('conflictItemsBox');
            if (d.conflictScope === 'item' && Array.isArray(d.conflicts) && d.conflicts.length > 0) {
                if (scopeEl) scopeEl.innerHTML = `Outro editor alterou o(s) mesmo(s) registro(s) antes de você (<strong id="conflictTime">${escapeHtml(timeStr)}</strong>). Escolha se deseja recarregar a versão mais recente ou sobrescrever apenas estes itens:`;
                if (itemsBox) {
                    itemsBox.innerHTML = d.conflicts.map(c => `<div class="ck-conflict-item">
                        <span class="truncate"><span class="ck-conflict-code">${escapeHtml(c.code)}</span>${c.desc ? ` — ${escapeHtml(c.desc)}` : ''}</span>
                        <span class="font-mono text-[10px] text-slate-500 shrink-0">rev.${c.clientRev} → rev.${c.serverRev}</span>
                    </div>`).join('');
                    itemsBox.classList.remove('hidden'); itemsBox.hidden = false; itemsBox.style.display = 'flex';
                }
            } else {
                if (scopeEl) scopeEl.innerHTML = `Outra aba ou usuário salvou alterações mais recentes no servidor (<strong id="conflictTime">${escapeHtml(timeStr)}</strong>). Escolha como prosseguir:`;
                if (itemsBox) { itemsBox.innerHTML = ''; itemsBox.classList.add('hidden'); itemsBox.hidden = true; itemsBox.style.display = 'none'; }
            }
            document.getElementById('conflictModal').classList.remove('hidden');
            updateOfflineQueueBanner();
            return;
        }
        if (d.ok === false) throw new Error(d.error || 'Erro ao salvar');

        if (d.revUpdates) applyRevUpdates(d.revUpdates);
        isCloudReady = true; hasConflict = false; offlineDirty = false;
        DeltaTracker.clear(true);
        if (auditBatch.length) pendingAuditEvents.splice(0, auditBatch.length);
        if (d.savedAt) lastServerUpdatedAt = String(d.savedAt).trim();
        lastCloudCheckMs = Date.now();
        VoithDB.saveSnapshot(instrumentsData, calibrationHistory, lostInstrumentsData, controlledLists, lastServerUpdatedAt);
        document.getElementById('cloudLastSync').textContent = new Date().toLocaleString('pt-BR');
        if (!pendingSync) setCloudUI('online', getBackendLabel());
        updateOfflineQueueBanner();
        if (feedback) showToast(useDelta ? 'Salvo no Supabase SQL!' : 'Base completa salva no Supabase SQL!', 'success');
    } catch (err) {
        offlineDirty = true;
        VoithDB.set('pendingDelta', DeltaTracker.serialize());
        setCloudUI('error', navigator.onLine ? 'Erro ao Salvar' : 'Fila Offline');
        const eb = document.getElementById('cloudModalErr');
        if (eb) { eb.textContent = String(err.message || err); eb.classList.remove('hidden'); }
        updateOfflineQueueBanner();
        if (feedback) showToast('Erro ao salvar — alteração mantida na fila local.', 'error');
    } finally {
        isSyncing = false;
        updateOfflineQueueBanner();
        if (pendingSync && !hasConflict) { pendingSync = false; pushCloud(false, false); }
    }
}

function resolveConflict(mode) {
    document.getElementById('conflictModal').classList.add('hidden');
    hasConflict = false;
    if (mode === 'reload') {
        offlineDirty = false;
        DeltaTracker.clear(true);
        updateOfflineQueueBanner();
        loadFromCloud(true, false, false);
    } else {
        if (lastConflictScope !== 'item') DeltaTracker.markFullSyncRequired();
        pushCloud(true, true);
    }
}
function openCloudModal() { document.getElementById('cloudModal').classList.remove('hidden'); }
function closeCloudModal() { document.getElementById('cloudModal').classList.add('hidden'); }
function forcePushCloud() {
    if (!requireEditor()) return;
    clearTimeout(syncTimer); syncTimer = null; hasConflict = false;
    DeltaTracker.markFullSyncRequired();
    pushCloud(true, true);
}

window.addEventListener('offline', () => {
    stopSupabaseRealtime();
    if (isEditor()) {
        setCloudUI('warning', 'Sem Conexão');
        updateOfflineQueueBanner();
    }
});
window.addEventListener('online', () => {
    updateOfflineQueueBanner();
    startSupabaseRealtime();
    if (offlineDirty && isEditor()) {
        showToast('Conexão restabelecida — reenviando alterações pendentes...', 'info');
        pushCloud(true, false);
    }
});
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
        flushLocalPersistNow();
        if (syncTimer && !hasConflict) {
            clearTimeout(syncTimer); syncTimer = null; pushCloud(false, false);
        }
    } else if (document.visibilityState === 'visible') {
        startSupabaseRealtime();
        if (Date.now() - lastCloudCheckMs > 5000) {
            loadFromCloud(false, false, true);
        }
    }
});
window.addEventListener('pagehide', flushLocalPersistNow);
window.addEventListener('beforeunload', flushLocalPersistNow);
