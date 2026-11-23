/* ============================================================================
 * VOITH TURBO — PRECISION METROLOGY OS v16.19 • cloud.js
 * Integração Supabase PostgreSQL com envelope PostgREST { payload: ... }
 * ============================================================================ */

window.VoithCloud = (function () {
    function getConfig() {
        var cfg = window.VOITH_CONFIG || {};
        var url = (cfg.SUPABASE_URL || 'https://sowiybqammlsiyyqtvyt.supabase.co').replace(/\/+$/, '');
        var key = cfg.SUPABASE_KEY || localStorage.getItem('voith_sb_key') || '';
        return { url: url, key: key };
    }

    function buildHeaders(key) {
        var h = { 'Content-Type': 'application/json', 'apikey': key };
        if (key && key.indexOf('eyJ') === 0) h['Authorization'] = 'Bearer ' + key;
        return h;
    }

    function setCloudPill(statusText, mode, errText) {
        VoithDB.state.cloudStatus = statusText;
        VoithDB.state.cloudError = errText || '';
        var dot = document.getElementById('cloudDot');
        var txt = document.getElementById('cloudText');
        var btn = document.getElementById('cloudPillBtn');
        var mStat = document.getElementById('cloudModalStatus');
        var mSync = document.getElementById('cloudLastSync');
        var mErr = document.getElementById('cloudModalErr');

        if (txt) txt.textContent = statusText;
        if (btn) btn.title = 'Banco SQL (Nuvem): ' + statusText;
        if (dot) {
            dot.className = 'w-2.5 h-2.5 rounded-full ' +
                (mode === 'ok' ? 'bg-emerald-500' : mode === 'warn' ? 'bg-amber-400' : 'bg-rose-500');
        }
        if (mStat) mStat.textContent = statusText;
        if (mSync) mSync.textContent = VoithDB.state.lastSyncLabel || '-';
        if (mErr) {
            if (errText) { mErr.textContent = errText; mErr.classList.remove('hidden'); }
            else { mErr.textContent = ''; mErr.classList.add('hidden'); }
        }
    }

    // PostgREST RPC: public.voith_rpc(payload JSONB) => DEVE enviar { payload: body }
    async function callRpc(actionPayload, allowQueue) {
        var cfg = getConfig();
        if (!cfg.key) return { ok: false, error: 'Chave pública do Supabase não configurada.' };

        var body = Object.assign({}, actionPayload, {
            clientPlatform: window.VOITH_PLATFORM || 'WEB',
            requestId: 'req_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6)
        });
        if (VoithDB.state.session && VoithDB.state.session.token && !body.auth) {
            body.auth = { token: VoithDB.state.session.token };
        }

        var t0 = performance.now();
        try {
            var r = await fetch(cfg.url + '/rest/v1/rpc/voith_rpc', {
                method: 'POST',
                headers: buildHeaders(cfg.key),
                body: JSON.stringify({ payload: body }),
                cache: 'no-store'
            });
            var text = await r.text();
            var data;
            try { data = JSON.parse(text); } catch (e) {
                data = { ok: false, error: 'Resposta inválida (HTTP ' + r.status + '): ' + text.slice(0, 140) };
            }
            if (!r.ok && data && !data.error) {
                data = { ok: false, error: data.message || ('Erro HTTP ' + r.status + ' na função voith_rpc.') };
            }
            VoithDB.logTelemetry('RPC_' + String(actionPayload.action || '').toUpperCase(), data.ok ? 'OK' : (data.error || ('HTTP ' + r.status)), performance.now() - t0);

            if (data && data.unauthorized) {
                VoithDB.state.session = null;
                VoithDB.persistSession();
                if (typeof applyAuthBodyClasses === 'function') applyAuthBodyClasses();
                showToast('Sessão expirada. Entre novamente para editar.', 'warn');
            }
            if (data && data.conflict) {
                openConflictModal(data, body);
            }
            return data;
        } catch (err) {
            VoithDB.logTelemetry('RPC_OFFLINE', (actionPayload.action || '') + ': ' + err.message, performance.now() - t0);
            if (allowQueue && (actionPayload.action === 'save_delta' || actionPayload.action === 'save_custody_receipt')) {
                var mutId = 'mut_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
                VoithDB.state.outbox.push({ mutationId: mutId, payload: Object.assign({}, body, { mutationId: mutId }) });
                VoithDB.persistOutbox();
                setCloudPill('Fila Offline (' + VoithDB.state.outbox.length + ')', 'warn', 'Sem conexão — salvo na fila local.');
                showToast('Sem conexão: alteração salva na fila offline (Outbox).', 'warn');
                return { ok: true, queuedOffline: true };
            }
            return { ok: false, offline: true, error: 'Sem conexão com o servidor Supabase (' + err.message + ').' };
        }
    }

    async function callPublicRpc(fnName, params) {
        var cfg = getConfig();
        if (!cfg.key) return { ok: false, error: 'Sem chave pública.' };
        try {
            var r = await fetch(cfg.url + '/rest/v1/rpc/' + fnName, {
                method: 'POST',
                headers: buildHeaders(cfg.key),
                body: JSON.stringify(params || {}),
                cache: 'no-store'
            });
            return await r.json();
        } catch (e) {
            return { ok: false, error: e.message };
        }
    }

    async function loadState(manual, silent) {
        var cfg = getConfig();
        if (!cfg.key) {
            setCloudPill('Sem Chave Pública', 'err', 'Configure VOITH_CONFIG.SUPABASE_KEY.');
            return false;
        }
        if (!silent) setCloudPill('Sincronizando...', 'warn');
        var t0 = performance.now();
        try {
            var rawText = '';
            if (!manual && window.__VOITH_CLOUD_PREFETCH__ && window.__VOITH_CLOUD_PREFETCH__.promise) {
                var p = window.__VOITH_CLOUD_PREFETCH__.promise;
                window.__VOITH_CLOUD_PREFETCH__ = null;
                rawText = await p;
            } else {
                var resp = await fetch(cfg.url + '/rest/v1/rpc/voith_load_state', {
                    method: 'POST',
                    headers: buildHeaders(cfg.key),
                    body: '{}',
                    cache: 'no-store'
                });
                rawText = await resp.text();
            }
            var data = JSON.parse(rawText);
            VoithDB.logTelemetry('LOAD_STATE', data.ok ? 'OK' : 'FAIL', performance.now() - t0);
            if (data && data.ok) {
                var newInst = Array.isArray(data.instrumentsData) ? data.instrumentsData : [];
                var newHist = Array.isArray(data.calibrationHistory) ? data.calibrationHistory : [];
                var newLost = Array.isArray(data.lostInstrumentsData) ? data.lostInstrumentsData : [];
                var unchanged = silent &&
                    VoithDB.state.updatedAt &&
                    data.updatedAt === VoithDB.state.updatedAt &&
                    newInst.length === VoithDB.state.instruments.length &&
                    newHist.length === VoithDB.state.history.length &&
                    newLost.length === VoithDB.state.lost.length;

                VoithDB.state.lastSyncLabel = new Date().toLocaleTimeString('pt-BR');
                if (unchanged) {
                    setCloudPill('Supabase SQL v' + (data.apiVersion || 16) + ' • Tempo Real', 'ok');
                    return true;
                }

                VoithDB.state.instruments = newInst;
                VoithDB.state.history = newHist;
                VoithDB.state.lost = newLost;
                VoithDB.state.controlledLists = data.controlledLists || { locals: [], sectors: [], aliases: {} };
                VoithDB.state.updatedAt = data.updatedAt || '';
                VoithDB.state.apiVersion = data.apiVersion || 16;
                VoithDB.persistCache();

                // Remove skeleton shimmer classes once loaded
                document.querySelectorAll('.vp-skel').forEach(function (n) { n.classList.remove('vp-skel'); });

                setCloudPill('Supabase SQL v' + VoithDB.state.apiVersion + ' • Tempo Real', 'ok');

                // Valida sessão se houver token salvo
                if (VoithDB.state.session && VoithDB.state.session.token) {
                    var v = await callRpc({ action: 'validate_token', token: VoithDB.state.session.token });
                    if (v && v.authenticated) {
                        VoithDB.state.session.displayName = v.displayName;
                        VoithDB.state.session.isAdmin = Boolean(v.isAdmin);
                        VoithDB.persistSession();
                        await flushOutbox(true);
                        await loadReceiptsQuiet();
                    } else if (v && v.authenticated === false) {
                        VoithDB.state.session = null;
                        VoithDB.persistSession();
                    }
                }
                if (typeof applyAuthBodyClasses === 'function') applyAuthBodyClasses();
                if (typeof renderAllViews === 'function') renderAllViews();
                if (manual) showToast('Base atualizada do Supabase (' + VoithDB.state.instruments.length + ' ativos).', 'ok');
                return true;
            } else {
                setCloudPill('Erro de leitura', 'err', (data && (data.error || data.message)) || 'Falha ao ler voith_load_state.');
                return false;
            }
        } catch (err) {
            VoithDB.logTelemetry('LOAD_OFFLINE', err.message, performance.now() - t0);
            document.querySelectorAll('.vp-skel').forEach(function (n) { n.classList.remove('vp-skel'); });
            setCloudPill('Modo Offline (Cache Local)', 'err', err.message);
            if (typeof renderAllViews === 'function') renderAllViews();
            return false;
        }
    }

    async function flushOutbox(quiet) {
        if (!VoithDB.state.outbox.length || !VoithDB.isEditor()) return;
        var synced = 0;
        while (VoithDB.state.outbox.length > 0) {
            var item = VoithDB.state.outbox[0];
            var res = await callRpc(item.payload, false);
            if (res && res.ok) {
                VoithDB.state.outbox.shift();
                VoithDB.persistOutbox();
                synced++;
            } else {
                break;
            }
        }
        if (synced > 0) {
            setCloudPill('Supabase SQL v' + VoithDB.state.apiVersion + ' • Tempo Real', 'ok');
            if (!quiet) showToast(synced + ' alteração(ões) da fila offline sincronizadas!', 'ok');
        }
    }

    async function saveDelta(delta, auditEvents, force) {
        VoithDB.persistCache();
        if (!VoithDB.isEditor()) return { ok: false, error: 'Modo Consulta.' };
        var res = await callRpc({
            action: 'save_delta',
            delta: delta,
            auditEvents: auditEvents || [],
            force: Boolean(force)
        }, true);
        if (res && res.ok && !res.queuedOffline) {
            VoithDB.state.updatedAt = res.savedAt || VoithDB.state.updatedAt;
            VoithDB.state.lastSyncLabel = new Date().toLocaleTimeString('pt-BR');
            if (res.revUpdates) {
                var ru = res.revUpdates;
                if (ru.inst) VoithDB.state.instruments.forEach(function (x) { if (ru.inst[String(x.id)]) x.rev = ru.inst[String(x.id)]; });
                if (ru.hist) VoithDB.state.history.forEach(function (x) { if (ru.hist[String(x.id)]) x.rev = ru.hist[String(x.id)]; });
                if (ru.lost) VoithDB.state.lost.forEach(function (x) { if (ru.lost[String(x.id)]) x.rev = ru.lost[String(x.id)]; });
            }
            VoithDB.persistCache();
            setCloudPill('Supabase SQL v' + VoithDB.state.apiVersion + ' • Tempo Real', 'ok');
        }
        return res;
    }

    async function saveFull(auditEvents, force) {
        VoithDB.persistCache();
        if (!VoithDB.isEditor()) return { ok: false, error: 'Modo Consulta.' };
        var res = await callRpc({
            action: 'save',
            baseUpdatedAt: VoithDB.state.updatedAt,
            instrumentsData: VoithDB.state.instruments,
            calibrationHistory: VoithDB.state.history,
            lostInstrumentsData: VoithDB.state.lost,
            auditEvents: auditEvents || [],
            force: Boolean(force)
        }, false);
        if (res && res.ok) {
            VoithDB.state.updatedAt = res.savedAt || VoithDB.state.updatedAt;
            VoithDB.state.lastSyncLabel = new Date().toLocaleTimeString('pt-BR');
            VoithDB.persistCache();
            setCloudPill('Supabase SQL v' + VoithDB.state.apiVersion + ' • Tempo Real', 'ok');
        }
        return res;
    }

    async function loadReceiptsQuiet() {
        if (!VoithDB.isEditor()) return;
        var r = await callRpc({ action: 'list_custody_receipts', limit: 150 });
        if (r && r.ok && Array.isArray(r.receipts)) {
            VoithDB.state.receipts = r.receipts;
        }
    }

    return {
        callRpc: callRpc,
        callPublicRpc: callPublicRpc,
        loadState: loadState,
        flushOutbox: flushOutbox,
        saveDelta: saveDelta,
        saveFull: saveFull,
        loadReceiptsQuiet: loadReceiptsQuiet,
        setCloudPill: setCloudPill
    };
})();