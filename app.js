/* ============================================================================
 * VOITH TURBO — PRECISION METROLOGY OS v16.12 • app.js
 * Controlador completo: Navegação, Modais, Inspector, Dossiê RBC, Cautela SHA-256,
 * Lab, Perdidos, Impressão PDF/Armário, Importação Diff, Admin, Auditoria, OTA
 * ============================================================================ */

var _searchTimer = null;
var _confirmCallback = null;
var _custTargetIds = [];
var _extBatchIds = [];
var _rapidQueue = [];
var _rapidIndex = 0;
var _secretAuditTaps = 0;
var _secretAuditTimer = null;
var _secretItemTaps = 0;
var _secretItemTimer = null;
var _sigSigned = false;
var _sigBound = false;
var _cmdSelectedIdx = 0;
var _cmdItems = [];

// ===================== NAVEGAÇÃO & TEMA =====================
function navigateTo(view) {
    VoithDB.state.view = view;
    ['command', 'inventory', 'custody', 'lab'].forEach(function (v) {
        var sec = document.getElementById('view-' + v);
        if (sec) sec.setAttribute('data-hidden', v === view ? 'false' : 'true');
    });
    document.querySelectorAll('[data-nav]').forEach(function (b) {
        b.classList.toggle('is-active', b.dataset.nav === view);
    });
    var meta = {
        command: ['Command Center', 'Telemetria executiva e saúde da frota Voith Turbo'],
        inventory: ['Inventário', 'Cadastro mestre de instrumentos, validades e localizações'],
        custody: ['Cautela & Campo', 'Consulta em tempo real de posse e comprovantes SHA-256'],
        lab: ['Lab & Baixas', 'Envios para calibração externa e equipamentos baixados/perdidos']
    }[view] || ['Command Center', ''];
    var tEl = document.getElementById('topbarViewTitle');
    var sEl = document.getElementById('topbarViewSub');
    if (tEl) tEl.textContent = meta[0];
    if (sEl) sEl.textContent = meta[1];

    if (view === 'command') renderCommandCenter();
    else if (view === 'inventory') renderInventoryView();
    else if (view === 'custody') renderCustodyBoard();
    else if (view === 'lab') renderLabTables();
}

function openMobileSidebar() {
    var sb = document.getElementById('vpSidebar');
    var bd = document.getElementById('sbBackdrop');
    if (sb) sb.classList.add('is-open');
    if (bd) bd.classList.add('is-open');
}

function closeMobileSidebar() {
    var sb = document.getElementById('vpSidebar');
    var bd = document.getElementById('sbBackdrop');
    if (sb) sb.classList.remove('is-open');
    if (bd) bd.classList.remove('is-open');
}

function toggleSidebarCollapse() {
    document.body.classList.toggle('ck-sb-collapsed');
    try { localStorage.setItem(VoithDB.KEYS.SIDEBAR_KEY, document.body.classList.contains('ck-sb-collapsed') ? '1' : '0'); } catch (e) {}
}

function toggleTheme() {
    document.documentElement.classList.add('ck-theme-switching');
    var isDark = document.documentElement.classList.toggle('dark');
    try { localStorage.setItem(VoithDB.KEYS.DARK_KEY, isDark ? 'true' : 'false'); } catch (e) {}
    syncThemeIcons();
    requestAnimationFrame(function () {
        requestAnimationFrame(function () {
            document.documentElement.classList.remove('ck-theme-switching');
        });
    });
}

function syncThemeIcons() {
    var isDark = document.documentElement.classList.contains('dark');
    var lbl = document.getElementById('sbThemeLabel');
    if (lbl) lbl.textContent = isDark ? 'Modo Claro' : 'Modo Escuro';
    ['sbThemeIcon', 'themeIcon'].forEach(function (id) {
        var svg = document.getElementById(id);
        if (svg) svg.innerHTML = '<use href="#' + (isDark ? 'i-sun' : 'i-moon') + '"/>';
    });
}

function toggleFactoryMode() {
    var on = document.body.classList.toggle('vp-factory-mode');
    try { localStorage.setItem(VoithDB.KEYS.FACTORY_KEY, on ? '1' : '0'); } catch (e) {}
    showToast(on ? 'Modo Fábrica (Alto Contraste) ativado.' : 'Modo Fábrica desativado.', 'ok');
}

function toggleSystemMenu(ev) {
    if (ev) ev.stopPropagation();
    var dd = document.getElementById('systemMenuDropdown');
    if (dd) dd.classList.toggle('hidden');
}

function closeSystemMenu() {
    var dd = document.getElementById('systemMenuDropdown');
    if (dd) dd.classList.add('hidden');
}

// ===================== AUTENTICAÇÃO =====================
function applyAuthBodyClasses() {
    var isEd = VoithDB.isEditor();
    var isAd = VoithDB.isAdmin();
    document.body.classList.toggle('vp-readonly', !isEd);
    document.body.classList.toggle('vp-editor', isEd);
    document.body.classList.toggle('vp-admin', isAd);

    if (isEd && VoithDB.state.session) {
        var dn = VoithDB.state.session.displayName || VoithDB.state.session.username || 'Editor';
        var av = document.getElementById('sbUserAvatar');
        var nm = document.getElementById('headerUserName');
        var rl = document.getElementById('sbUserRole');
        if (av) av.textContent = getInitials(dn);
        if (nm) nm.textContent = dn;
        if (rl) rl.textContent = isAd ? 'Administrador' : 'Modo Editor';
    }
    VoithDB.updateUndoUI();
    updateBatchDockUI();
}

function openLoginModal() {
    var m = document.getElementById('loginModal');
    var err = document.getElementById('loginErrBox');
    if (err) { err.textContent = ''; err.classList.add('hidden'); }
    if (m) m.classList.remove('hidden');
    var p = document.getElementById('loginPassInp');
    if (p) { p.value = ''; setTimeout(function () { p.focus(); }, 60); }
}

function closeLoginModal() {
    var m = document.getElementById('loginModal');
    if (m) m.classList.add('hidden');
}

async function submitLogin(ev) {
    if (ev) ev.preventDefault();
    var u = (document.getElementById('loginUserInp').value || '').trim();
    var p = document.getElementById('loginPassInp').value || '';
    var rem = Boolean(document.getElementById('loginRemChk').checked);
    var err = document.getElementById('loginErrBox');
    var btn = document.getElementById('loginBtnSub');

    if (btn) { btn.disabled = true; btn.textContent = 'Entrando...'; }
    if (err) err.classList.add('hidden');

    var res = await VoithCloud.callRpc({ action: 'login', username: u, password: p, remember: rem }, false);
    if (btn) { btn.disabled = false; btn.textContent = 'Entrar'; }

    if (res && res.ok && res.token) {
        VoithDB.state.session = {
            username: res.username,
            displayName: res.displayName,
            isAdmin: Boolean(res.isAdmin),
            token: res.token,
            expiresAt: res.expiresAt
        };
        VoithDB.persistSession();
        closeLoginModal();
        applyAuthBodyClasses();
        await VoithCloud.flushOutbox(true);
        await VoithCloud.loadReceiptsQuiet();
        renderAllViews();
        showToast('Bem-vindo, ' + (res.displayName || res.username) + '!', 'ok');
    } else {
        if (err) {
            err.textContent = (res && res.error) || 'Usuário ou senha incorretos.';
            err.classList.remove('hidden');
        }
    }
}

async function logoutEditor() {
    var tok = VoithDB.state.session && VoithDB.state.session.token;
    VoithDB.state.session = null;
    VoithDB.persistSession();
    applyAuthBodyClasses();
    renderAllViews();
    if (tok) await VoithCloud.callRpc({ action: 'logout', token: tok }, false);
    showToast('Sessão encerrada (Modo Consulta).', 'ok');
}

function openChangePassModal() {
    var m = document.getElementById('changePassModal');
    var e = document.getElementById('cpErr');
    if (e) e.classList.add('hidden');
    ['cpOld', 'cpNew', 'cpConf'].forEach(function (id) { var x = document.getElementById(id); if (x) x.value = ''; });
    if (m) m.classList.remove('hidden');
}

function closeChangePassModal() {
    var m = document.getElementById('changePassModal');
    if (m) m.classList.add('hidden');
}

async function submitChangePass(ev) {
    if (ev) ev.preventDefault();
    var oldP = document.getElementById('cpOld').value;
    var newP = document.getElementById('cpNew').value;
    var confP = document.getElementById('cpConf').value;
    var err = document.getElementById('cpErr');
    if (newP !== confP) {
        if (err) { err.textContent = 'As senhas novas não coincidem.'; err.classList.remove('hidden'); }
        return;
    }
    var r = await VoithCloud.callRpc({ action: 'change_password', currentPassword: oldP, newPassword: newP }, false);
    if (r && r.ok && r.token) {
        VoithDB.state.session.token = r.token;
        VoithDB.state.session.expiresAt = r.expiresAt;
        VoithDB.persistSession();
        closeChangePassModal();
        showToast('Senha alterada com sucesso!', 'ok');
    } else if (err) {
        err.textContent = (r && r.error) || 'Erro ao alterar senha.';
        err.classList.remove('hidden');
    }
}

// ===================== SIMULADOR DE DATA / HORIZONTE =====================
function setHorizonDays(days) {
    VoithDB.state.refDateISO = '';
    VoithDB.state.horizonOffsetDays = Number(days || 0);
    renderAllViews();
}

function setRefDateISO(iso) {
    VoithDB.state.refDateISO = iso || '';
    VoithDB.state.horizonOffsetDays = 0;
    var d = parseDateBR(iso);
    var brInp = document.getElementById('heroCustomDateBR');
    if (brInp && d) brInp.value = formatDateBR(d);
    var box = document.getElementById('heroManualDateBox');
    if (box) box.classList.add('hidden');
    renderAllViews();
    if (d) showToast('Simulando horizonte para ' + formatDateBR(d), 'ok');
}

function resetRefDate() {
    VoithDB.state.refDateISO = '';
    VoithDB.state.horizonOffsetDays = 0;
    var inp = document.getElementById('heroCustomDatePicker');
    if (inp) inp.value = '';
    var brInp = document.getElementById('heroCustomDateBR');
    if (brInp) brInp.value = '';
    var box = document.getElementById('heroManualDateBox');
    if (box) box.classList.add('hidden');
    renderAllViews();
}

function toggleManualSimDateBox() {
    var box = document.getElementById('heroManualDateBox');
    var inp = document.getElementById('heroCustomDateBR');
    if (!box) return;
    var opening = box.classList.contains('hidden');
    box.classList.toggle('hidden', !opening);
    if (opening && inp) {
        inp.value = formatDateBR(VoithDB.getRefDate());
        setTimeout(function () { inp.focus(); inp.select(); }, 30);
    }
}

function applyManualSimDateBR(ev) {
    if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
    var inp = document.getElementById('heroCustomDateBR');
    if (!inp) return;
    var d = parseDateBR(inp.value);
    if (!d) {
        showToast('Digite uma data válida no formato DD/MM/AAAA.', 'warn');
        return;
    }
    VoithDB.state.refDateISO = formatDateISO(d);
    VoithDB.state.horizonOffsetDays = 0;
    var box = document.getElementById('heroManualDateBox');
    if (box) box.classList.add('hidden');
    renderAllViews();
    showToast('Simulando horizonte para ' + formatDateBR(d), 'ok');
}

// ===================== FILTROS & INVENTÁRIO =====================
function jumpToInventoryFilter(opts) {
    var f = VoithDB.state.filters;
    f.search = '';
    f.status = opts.status || '';
    f.setor = opts.setor || '';
    f.local = opts.local || '';
    f.resp = opts.resp || '';
    f.month = opts.month || '';
    f.family = opts.family || '';
    f.quickTab = '';
    VoithDB.state.page = 1;
    syncFilterInputs();
    navigateTo('inventory');
}

function syncFilterInputs() {
    var f = VoithDB.state.filters;
    var setV = function (id, val) { var el = document.getElementById(id); if (el) el.value = val || ''; };
    setV('invSearchInput', f.search);
    setV('fStatus', f.status);
    setV('fSetor', f.setor);
    setV('fLocal', f.local);
    setV('fResp', f.resp);
    setV('fMonth', f.month);
    setV('fFamily', f.family);
}

function setQuickStatusTab(val) {
    VoithDB.state.filters.quickTab = val || '';
    if (val) VoithDB.state.filters.status = '';
    VoithDB.state.page = 1;
    syncFilterInputs();
    renderInventoryView();
}

function onAdvStatusChange() {
    VoithDB.state.filters.quickTab = '';
    applyInventoryFilters();
}

function applyInventoryFilters() {
    var f = VoithDB.state.filters;
    var getV = function (id) { var el = document.getElementById(id); return el ? el.value : ''; };
    f.search = getV('invSearchInput');
    f.status = getV('fStatus');
    f.setor = getV('fSetor');
    f.local = getV('fLocal');
    f.resp = getV('fResp');
    f.month = getV('fMonth');
    f.family = getV('fFamily');
    VoithDB.state.page = 1;
    renderInventoryView();
}

function debouncedFilterInventory() {
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(applyInventoryFilters, 140);
}

function clearSingleFilter(key) {
    VoithDB.state.filters[key] = '';
    if (key === 'status') VoithDB.state.filters.quickTab = '';
    syncFilterInputs();
    VoithDB.state.page = 1;
    renderInventoryView();
}

function resetInventoryFilters(rerender) {
    var f = VoithDB.state.filters;
    f.search = ''; f.status = ''; f.setor = ''; f.local = ''; f.resp = ''; f.month = ''; f.family = ''; f.quickTab = '';
    VoithDB.state.page = 1;
    syncFilterInputs();
    if (rerender) renderInventoryView();
}

function toggleAdvFilters() {
    var p = document.getElementById('invAdvFiltersPanel');
    var c = document.getElementById('advFilterChev');
    if (p) p.classList.toggle('hidden');
    if (c) c.style.transform = p && !p.classList.contains('hidden') ? 'rotate(180deg)' : '';
}

function toggleInventoryViewMode() {
    var st = VoithDB.state;
    st.invViewMode = st.invViewMode === 'cards' ? 'table' : 'cards';
    var lbl = document.getElementById('viewToggleLabel');
    var ico = document.getElementById('viewToggleIcon');
    if (lbl) lbl.textContent = st.invViewMode === 'cards' ? 'Tabela' : 'Cartões';
    if (ico) ico.innerHTML = '<use href="#' + (st.invViewMode === 'cards' ? 'i-table' : 'i-grip') + '"/>';
    renderInventoryView();
}

function setDensity(compact) {
    VoithDB.state.compactTable = Boolean(compact);
    var bN = document.getElementById('btnDensNorm');
    var bC = document.getElementById('btnDensComp');
    if (bN && bC) {
        bN.className = !compact ? 'px-2.5 py-1.5 rounded-md font-bold bg-[#004C97] text-white text-[11px] cursor-pointer' : 'px-2.5 py-1.5 rounded-md font-bold text-slate-600 dark:text-slate-300 text-[11px] cursor-pointer';
        bC.className = compact ? 'px-2.5 py-1.5 rounded-md font-bold bg-[#004C97] text-white text-[11px] cursor-pointer' : 'px-2.5 py-1.5 rounded-md font-bold text-slate-600 dark:text-slate-300 text-[11px] cursor-pointer';
    }
    renderInventoryView();
}

function setPageSize(ps) {
    VoithDB.state.pageSize = Number(ps || 20);
    VoithDB.state.page = 1;
    document.querySelectorAll('.ps-btn').forEach(function (b) {
        b.classList.toggle('is-on', Number(b.dataset.ps) === VoithDB.state.pageSize);
    });
    renderInventoryView();
}

function stepPage(delta) {
    VoithDB.state.page += Number(delta);
    renderInventoryView();
}

function sortInventoryBy(col) {
    var st = VoithDB.state;
    if (st.sortCol === col) st.sortDir = st.sortDir === 'asc' ? 'desc' : 'asc';
    else { st.sortCol = col; st.sortDir = 'asc'; }
    renderInventoryView();
}

function toggleRowSelect(id, checked) {
    if (checked) VoithDB.state.selectedIds.add(id);
    else VoithDB.state.selectedIds.delete(id);
    updateBatchDockUI();
}

function toggleSelectAllPage(checked) {
    var st = VoithDB.state;
    var all = getFilteredInventory();
    var start = (st.page - 1) * st.pageSize;
    var slice = all.slice(start, start + st.pageSize);
    slice.forEach(function (it) {
        if (checked) st.selectedIds.add(it.id);
        else st.selectedIds.delete(it.id);
    });
    renderInventoryView();
}

function clearBatchSelection() {
    VoithDB.state.selectedIds.clear();
    var chk = document.getElementById('chkSelectAllPage');
    if (chk) chk.checked = false;
    renderInventoryView();
}

function inlineEditCell(id, field, td) {
    if (!VoithDB.isEditor() || td.querySelector('input')) return;
    var it = VoithDB.state.instruments.find(function (x) { return x.id === id; });
    if (!it) return;
    var prevVal = field === 'proxCal' ? toBRDateStr(it[field]) : String(it[field] || '');
    var inp = document.createElement('input');
    inp.type = 'text';
    inp.value = prevVal;
    if (field === 'local') inp.setAttribute('list', 'dlLocais');
    if (field === 'proxCal') inp.addEventListener('input', function () { maskBRDate(inp); });
    inp.className = 'w-full px-2 py-1 bg-white dark:bg-[#061121] border border-[#004C97] rounded text-xs font-semibold';
    td.innerHTML = '';
    td.appendChild(inp);
    inp.focus();
    inp.select();

    var commit = async function () {
        var nextVal = inp.value.trim();
        if (field === 'local') nextVal = VoithDB.normalizeControlled(nextVal, 'local');
        if (field === 'proxCal') nextVal = toBRDateStr(nextVal);
        if (nextVal === prevVal) { renderInventoryView(); return; }
        VoithDB.pushUndo('Editar ' + field);
        var snap = VoithDB.makeItemSnapshot(it);
        it._baseRev = it.rev || 1;
        it._baseSnapshot = snap;
        it[field] = nextVal;
        renderAllViews();
        await VoithCloud.saveDelta(
            { instUpsert: [it] },
            [{ module: 'Inventário', action: 'Edição Rápida', target: it.code, field: field, before: prevVal || '-', after: nextVal || '-', details: 'Editou ' + field + ' de ' + it.code }]
        );
        showToast(it.code + ' atualizado.', 'ok');
    };
    inp.addEventListener('blur', commit);
    inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
        if (e.key === 'Escape') { renderInventoryView(); }
    });
}

// ===================== INSPECTOR DRAWER & DOSSIÊ RBC =====================
function openInspectorModal(id) {
    var overlay = document.getElementById('inspectorOverlay');
    if (!overlay) return;
    var isNew = Number(id) === -1;
    var it = isNew ? {
        id: -1, code: '', desc: '', cc: '', setor: 'Voith Turbo (Industrial)',
        local: '', resp: '', min: '', max: '', proxCal: '', status: 'AUTO',
        obs: '', custodyHolder: '', custodyReturnTo: '', custodyDate: '', custodyReason: '', cycleMonths: 12
    } : VoithDB.state.instruments.find(function (x) { return x.id === Number(id); });
    if (!it) return;

    document.getElementById('inspId').value = it.id;
    document.getElementById('inspCode').value = it.code || '';
    document.getElementById('inspCC').value = it.cc || '';
    document.getElementById('inspDesc').value = it.desc || '';
    document.getElementById('inspMin').value = it.min || '';
    document.getElementById('inspMax').value = it.max || '';
    document.getElementById('inspSetor').value = it.setor || '';
    document.getElementById('inspResp').value = it.resp || '';
    document.getElementById('inspLocal').value = it.local || '';
    document.getElementById('inspDate').value = toBRDateStr(it.proxCal);
    document.getElementById('inspObs').value = it.obs || '';
    document.getElementById('inspCustHolder').value = it.custodyHolder || '';
    document.getElementById('inspCustReturn').value = it.custodyReturnTo || '';
    document.getElementById('inspCustDate').value = toBRDateStr(it.custodyDate);
    document.getElementById('inspCustReason').value = it.custodyReason || '';

    var stSel = document.getElementById('inspStatus');
    if (stSel) {
        var raw = String(it.status || '').toUpperCase();
        var validOpts = ['AUTO', 'EM DIA', 'VENCIDA', 'PRÓXIMA DO VENCIMENTO', 'PENDÊNCIA DE DATA', 'EM REPARO', 'AGUARDANDO CALIBRAÇÃO'];
        stSel.value = validOpts.indexOf(raw) !== -1 ? raw : 'AUTO';
    }

    var cycSel = document.getElementById('inspCycle');
    var cycCustomWrap = document.getElementById('inspCycleCustomWrap');
    var cycCustomInp = document.getElementById('inspCycleCustom');
    var cm = Number(it.cycleMonths == null ? 12 : it.cycleMonths);
    if (cycSel) {
        if ([0, 6, 12, 18, 24, 36].indexOf(cm) !== -1) {
            cycSel.value = String(cm);
            if (cycCustomWrap) cycCustomWrap.classList.add('hidden');
        } else {
            cycSel.value = 'CUSTOM';
            if (cycCustomInp) cycCustomInp.value = cm;
            if (cycCustomWrap) cycCustomWrap.classList.remove('hidden');
        }
    }
    var manWrap = document.getElementById('inspCycleManualDateWrap');
    if (manWrap) manWrap.classList.add('hidden');

    var eff = isNew ? 'NOVO ITEM' : getEffectiveStatus(it);
    document.getElementById('inspTitle').textContent = isNew ? 'Novo Instrumento' : (it.code + ' — ' + it.desc);
    document.getElementById('inspBadgeStatus').textContent = eff;
    var diff = isNew ? null : daysBetween(VoithDB.getRefDate(), parseDateBR(it.proxCal));
    document.getElementById('inspCountdownTag').textContent = diff == null ? '' : (diff < 0 ? ('Vencido há ' + Math.abs(diff) + 'd') : ('Vence em ' + diff + 'd'));

    var filtered = getFilteredInventory();
    var pos = filtered.findIndex(function (x) { return x.id === it.id; });
    document.getElementById('inspPosLabel').textContent = isNew ? 'Novo' : ((pos >= 0 ? (pos + 1) : '-') + ' / ' + filtered.length);

    document.getElementById('inspBtnLost').classList.toggle('hidden', isNew);
    document.getElementById('inspBtnDel').classList.toggle('hidden', isNew);
    document.getElementById('inspBtnSaveNext').classList.toggle('hidden', isNew);
    document.getElementById('inspDupWarn').classList.add('hidden');
    document.getElementById('inspAuditBox').classList.add('hidden');
    document.getElementById('inspRbcBox').classList.add('hidden');

    // Readonly toggle on inputs
    var ro = !VoithDB.isEditor();
    overlay.querySelectorAll('#inspScrollBody input, #inspScrollBody select, #inspScrollBody textarea').forEach(function (inp) {
        if (inp.type === 'hidden') return;
        inp.disabled = ro;
    });

    overlay.classList.remove('hidden');
}

function closeInspectorModal() {
    var overlay = document.getElementById('inspectorOverlay');
    if (overlay) overlay.classList.add('hidden');
}

function stepInspector(delta) {
    var curId = Number(document.getElementById('inspId').value);
    var filtered = getFilteredInventory();
    var idx = filtered.findIndex(function (x) { return x.id === curId; });
    if (idx === -1) return;
    var nextIdx = idx + Number(delta);
    if (nextIdx >= 0 && nextIdx < filtered.length) openInspectorModal(filtered[nextIdx].id);
}

function checkInspectorDuplicate() {
    var code = (document.getElementById('inspCode').value || '').trim().toUpperCase();
    var curId = Number(document.getElementById('inspId').value);
    var warn = document.getElementById('inspDupWarn');
    if (!warn) return;
    if (!code) { warn.classList.add('hidden'); return; }
    var dup = VoithDB.state.instruments.find(function (x) { return x.id !== curId && String(x.code || '').toUpperCase() === code; });
    if (dup) {
        warn.textContent = '⚠ Código já cadastrado: ' + dup.desc;
        warn.className = 'text-[11px] font-bold mt-1 text-rose-600';
    } else {
        warn.classList.add('hidden');
    }
}

function onInspDateInput(el) { maskBRDate(el); }
function setInspDateFromISO(iso) {
    var d = parseDateBR(iso);
    if (d) document.getElementById('inspDate').value = formatDateBR(d);
}
function onInspCycleChange() {
    var v = document.getElementById('inspCycle').value;
    document.getElementById('inspCycleCustomWrap').classList.toggle('hidden', v !== 'CUSTOM');
    document.getElementById('inspCycleManualDateWrap').classList.toggle('hidden', v !== '0');
}
function onInspManualDateInput(el) {
    maskBRDate(el);
    if (el.value.length === 10) document.getElementById('inspDate').value = el.value;
}

async function saveInspector(openNext) {
    if (!VoithDB.isEditor()) { openLoginModal(); return; }
    var idVal = Number(document.getElementById('inspId').value);
    var code = (document.getElementById('inspCode').value || '').trim().toUpperCase();
    var desc = (document.getElementById('inspDesc').value || '').trim();
    if (!code || !desc) { showToast('Preencha Código e Descrição.', 'err'); return; }

    var cycSel = document.getElementById('inspCycle').value;
    var cycMonths = cycSel === 'CUSTOM' ? Number(document.getElementById('inspCycleCustom').value || 12) : Number(cycSel || 12);

    var setor = VoithDB.normalizeControlled(document.getElementById('inspSetor').value, 'sector') || 'Voith Turbo (Industrial)';
    var local = VoithDB.normalizeControlled(document.getElementById('inspLocal').value, 'local');

    VoithDB.pushUndo('Salvar ' + code);

    var isNew = idVal === -1;
    var existing = isNew ? null : VoithDB.state.instruments.find(function (x) { return x.id === idVal; });
    var snap = existing ? VoithDB.makeItemSnapshot(existing) : null;

    var item = Object.assign({}, existing || {}, {
        id: isNew ? Date.now() : idVal,
        code: code,
        desc: desc,
        cc: (document.getElementById('inspCC').value || '').trim(),
        setor: setor,
        local: local,
        resp: (document.getElementById('inspResp').value || '').trim(),
        min: (document.getElementById('inspMin').value || '').trim(),
        max: (document.getElementById('inspMax').value || '').trim(),
        proxCal: toBRDateStr(document.getElementById('inspDate').value),
        status: document.getElementById('inspStatus').value,
        obs: (document.getElementById('inspObs').value || '').trim(),
        custodyHolder: (document.getElementById('inspCustHolder').value || '').trim(),
        custodyReturnTo: (document.getElementById('inspCustReturn').value || '').trim(),
        custodyDate: toBRDateStr(document.getElementById('inspCustDate').value),
        custodyReason: (document.getElementById('inspCustReason').value || '').trim(),
        cycleMonths: cycMonths,
        rev: existing ? (existing.rev || 1) : 1
    });
    if (existing) { item._baseRev = existing.rev || 1; item._baseSnapshot = snap; }

    if (isNew) VoithDB.state.instruments.unshift(item);
    else {
        var idx = VoithDB.state.instruments.findIndex(function (x) { return x.id === idVal; });
        if (idx >= 0) VoithDB.state.instruments[idx] = item;
    }

    renderAllViews();
    if (openNext) stepInspector(1);
    else closeInspectorModal();

    var res = await VoithCloud.saveDelta(
        { instUpsert: [item] },
        [{ module: 'Inventário', action: isNew ? 'Inclusão' : 'Edição', target: item.code, field: 'Ficha', before: snap ? (snap.local || '-') : '-', after: item.local || '-', details: (isNew ? 'Cadastrou ' : 'Editou ') + item.code }]
    );
    if (res && res.ok) showToast(item.code + ' salvo no banco SQL!', 'ok');
    else if (res && !res.conflict) showToast(res.error || 'Erro ao salvar.', 'err');
}

function moveInspectorToLost() {
    if (!VoithDB.isEditor()) return;
    var idVal = Number(document.getElementById('inspId').value);
    var it = VoithDB.state.instruments.find(function (x) { return x.id === idVal; });
    if (!it) return;
    openConfirmModal('Mover para Perdidos / Baixados', 'Deseja mover ' + it.code + ' (' + it.desc + ') para a lista de Perdidos / Desativados?', async function () {
        VoithDB.pushUndo('Mover ' + it.code + ' p/ Perdidos');
        var lostRow = {
            id: Date.now(), code: it.code, desc: it.desc, cc: it.cc || '',
            setor: it.setor || '', lastCal: toBRDateStr(it.proxCal), obs: it.obs || 'Baixado / Extraviado', rev: 1
        };
        VoithDB.state.instruments = VoithDB.state.instruments.filter(function (x) { return x.id !== idVal; });
        VoithDB.state.lost.unshift(lostRow);
        closeInspectorModal();
        renderAllViews();
        await VoithCloud.saveDelta(
            { instDelete: [String(idVal)], lostUpsert: [lostRow] },
            [{ module: 'Perdidos', action: 'Baixa', target: it.code, field: 'Status', before: 'Ativo', after: 'Perdido/Baixado', details: 'Moveu ' + it.code + ' para Perdidos' }]
        );
        showToast(it.code + ' movido para Perdidos.', 'ok');
    });
}

function deleteInspectorItem() {
    if (!VoithDB.isEditor()) return;
    var idVal = Number(document.getElementById('inspId').value);
    var it = VoithDB.state.instruments.find(function (x) { return x.id === idVal; });
    if (!it) return;
    openConfirmModal('Excluir Instrumento', 'Excluir definitivamente ' + it.code + ' (' + it.desc + ') do inventário?', async function () {
        VoithDB.pushUndo('Excluir ' + it.code);
        VoithDB.state.instruments = VoithDB.state.instruments.filter(function (x) { return x.id !== idVal; });
        closeInspectorModal();
        renderAllViews();
        await VoithCloud.saveDelta(
            { instDelete: [String(idVal)] },
            [{ module: 'Inventário', action: 'Exclusão', target: it.code, field: 'Registro', before: it.desc, after: 'Excluído', details: 'Excluiu ' + it.code }]
        );
        showToast(it.code + ' excluído.', 'ok');
    });
}

function copyCurrentInstrumentCard() {
    var code = document.getElementById('inspCode').value;
    var desc = document.getElementById('inspDesc').value;
    var setor = document.getElementById('inspSetor').value;
    var local = document.getElementById('inspLocal').value;
    var prox = document.getElementById('inspDate').value;
    var holder = document.getElementById('inspCustHolder').value;
    var txt = '*' + code + '* — ' + desc + '\nSetor: ' + (setor || '-') + '\nLocal: ' + (local || 'Sem local') + '\nPróx. Calibração: ' + (prox || '-') + (holder ? '\nEm posse: ' + holder : '');
    copyTextToClipboard(txt, 'Ficha de ' + code + ' copiada!');
}

function openCustodyFromInspector() {
    var idVal = Number(document.getElementById('inspId').value);
    if (idVal === -1) return;
    closeInspectorModal();
    openCustodyForItem(idVal);
}

// 5 cliques no status do Inspector abrem Dossiê RBC + Auditoria do item
function onSecretItemAuditTap() {
    _secretItemTaps++;
    clearTimeout(_secretItemTimer);
    _secretItemTimer = setTimeout(function () { _secretItemTaps = 0; }, 1600);
    if (_secretItemTaps >= 5) {
        _secretItemTaps = 0;
        if (!VoithDB.isEditor()) { showToast('Entre como Editor/Admin para abrir o Dossiê RBC.', 'warn'); return; }
        openItemRbcAndAudit();
    }
}

async function openItemRbcAndAudit() {
    var code = (document.getElementById('inspCode').value || '').trim().toUpperCase();
    if (!code) return;
    var rbcBox = document.getElementById('inspRbcBox');
    var rbcList = document.getElementById('inspRbcList');
    if (rbcBox && rbcList) {
        rbcBox.classList.remove('hidden');
        rbcList.textContent = 'Carregando certificados RBC...';
        var r = await VoithCloud.callRpc({ action: 'list_certificates', instrumentCode: code }, false);
        if (r && r.ok) {
            var certs = r.certificates || [];
            if (!certs.length) rbcList.textContent = 'Nenhum certificado RBC cadastrado para ' + code + '.';
            else rbcList.innerHTML = certs.map(function (c) {
                return '<div class="flex items-center justify-between gap-2 py-1 border-b border-sky-200/50 dark:border-sky-400/20"><span><strong>' + escHtml(c.certNumber) + '</strong> • ' + escHtml(c.calDate) + ' • ' + escHtml(c.labName || '-') + ' • U: ' + escHtml(c.uncertainty || '-') + '</span>' + (VoithDB.isAdmin() ? '<button type="button" onclick="deleteRbcCert(' + c.id + ')" class="text-rose-600 font-bold cursor-pointer">&times;</button>' : '') + '</div>';
            }).join('');
        } else {
            rbcList.textContent = (r && r.error) || 'Erro ao carregar dossiê.';
        }
    }
    if (VoithDB.isAdmin()) {
        var ab = document.getElementById('inspAuditBox');
        var al = document.getElementById('inspAuditList');
        if (ab && al) {
            ab.classList.remove('hidden');
            var ar = await VoithCloud.callRpc({ action: 'list_audit', limit: 200 }, false);
            var evs = (ar && ar.ok && ar.events ? ar.events : []).filter(function (e) { return String(e.target || '').toUpperCase() === code; });
            al.innerHTML = evs.map(function (e) {
                return '<div class="py-1 border-b border-[#DCE4EE] dark:border-[#172E4E]"><span class="font-mono text-slate-400">' + new Date(e.timestamp).toLocaleString('pt-BR') + '</span> • <strong>' + escHtml(e.displayName) + '</strong>: ' + escHtml(e.action) + ' (' + escHtml(e.details || e.after) + ')</div>';
            }).join('') || '<div class="text-slate-400">Sem histórico de auditoria para ' + code + '.</div>';
        }
    }
}

function toggleRbcCertForm() {
    var w = document.getElementById('rbcCertFormWrap');
    if (w) w.classList.toggle('hidden');
}

async function submitRbcCertificate() {
    var idVal = Number(document.getElementById('inspId').value);
    var code = (document.getElementById('inspCode').value || '').trim().toUpperCase();
    var num = (document.getElementById('rbcCertNum').value || '').trim();
    var dt = (document.getElementById('rbcCertDate').value || '').trim();
    if (!num || !dt) { showToast('Informe Nº do Certificado e Data.', 'err'); return; }
    var r = await VoithCloud.callRpc({
        action: 'add_certificate',
        certificate: {
            instrumentId: idVal > 0 ? idVal : 0,
            instrumentCode: code,
            certNumber: num,
            calDate: dt,
            labName: (document.getElementById('rbcCertLab').value || '').trim(),
            uncertainty: (document.getElementById('rbcCertUnc').value || '').trim(),
            resultStatus: 'APROVADO'
        }
    }, false);
    if (r && r.ok) {
        document.getElementById('rbcCertFormWrap').classList.add('hidden');
        ['rbcCertNum', 'rbcCertDate', 'rbcCertLab', 'rbcCertUnc'].forEach(function (k) { document.getElementById(k).value = ''; });
        showToast('Certificado RBC salvo!', 'ok');
        openItemRbcAndAudit();
    } else showToast((r && r.error) || 'Erro ao salvar certificado.', 'err');
}

async function deleteRbcCert(certId) {
    var r = await VoithCloud.callRpc({ action: 'delete_certificate', id: certId }, false);
    if (r && r.ok) { showToast('Certificado removido.', 'ok'); openItemRbcAndAudit(); }
}

// ===================== CAUTELA RÁPIDA + ASSINATURA + TRAVA METROLÓGICA + SHA-256 =====================
function bindSignaturePadOnce() {
    if (_sigBound) return;
    var pad = document.getElementById('custSigCanvas');
    if (!pad) return;
    _sigBound = true;
    var ctx = pad.getContext('2d');
    ctx.strokeStyle = '#00A8E8';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    var drawing = false;
    var getPt = function (e) {
        var r = pad.getBoundingClientRect();
        var t = e.touches ? e.touches[0] : e;
        return { x: (t.clientX - r.left) * (pad.width / r.width), y: (t.clientY - r.top) * (pad.height / r.height) };
    };
    var start = function (e) { drawing = true; _sigSigned = true; var p = getPt(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
    var move = function (e) { if (!drawing) return; e.preventDefault(); var p = getPt(e); ctx.lineTo(p.x, p.y); ctx.stroke(); };
    var end = function () { drawing = false; };
    pad.addEventListener('mousedown', start);
    pad.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    pad.addEventListener('touchstart', start, { passive: false });
    pad.addEventListener('touchmove', move, { passive: false });
    pad.addEventListener('touchend', end);
}

function clearCustodySignature() {
    var pad = document.getElementById('custSigCanvas');
    if (pad) pad.getContext('2d').clearRect(0, 0, pad.width, pad.height);
    _sigSigned = false;
}

function openCustodyForItem(id) {
    if (!VoithDB.isEditor()) { openLoginModal(); return; }
    _custTargetIds = [Number(id)];
    openCustodyModalInternal(false);
}

function openBatchCustody() {
    if (!VoithDB.isEditor()) { openLoginModal(); return; }
    _custTargetIds = Array.from(VoithDB.state.selectedIds);
    if (!_custTargetIds.length) return;
    openCustodyModalInternal(false);
}

function openNewCustodyPickerModal() {
    if (!VoithDB.isEditor()) { openLoginModal(); return; }
    _custTargetIds = [];
    openCustodyModalInternal(true);
}

function openCustodyModalInternal(showPicker) {
    var m = document.getElementById('custodyModal');
    if (!m) return;
    document.getElementById('custPickerWrap').classList.toggle('hidden', !showPicker);
    if (showPicker) document.getElementById('custPickerCode').value = '';
    clearCustodySignature();
    bindSignaturePadOnce();
    refreshCustodyModalTargetUI();
    m.classList.remove('hidden');
}

function lookupCustodyPicker() {
    var q = (document.getElementById('custPickerCode').value || '').trim().toUpperCase();
    var found = VoithDB.state.instruments.find(function (x) { return String(x.code || '').toUpperCase() === q; });
    _custTargetIds = found ? [found.id] : [];
    refreshCustodyModalTargetUI();
}

function refreshCustodyModalTargetUI() {
    var items = _custTargetIds.map(function (id) { return VoithDB.state.instruments.find(function (x) { return x.id === id; }); }).filter(Boolean);
    var sumT = document.getElementById('custSummaryTitle');
    var sumS = document.getElementById('custSummarySub');
    var retBan = document.getElementById('custReturnBanner');
    var lockBox = document.getElementById('custMetroLockBox');

    if (!items.length) {
        sumT.textContent = 'Selecione um instrumento acima';
        sumS.textContent = '-';
        retBan.classList.add('hidden');
        lockBox.classList.add('hidden');
        return;
    }

    var first = items[0];
    var isSingle = items.length === 1;
    var activeCust = isSingle && Boolean(String(first.custodyHolder || '').trim());

    sumT.textContent = isSingle ? (first.code + ' — ' + first.desc) : (items.length + ' instrumentos selecionados');
    sumS.textContent = isSingle ? ('Setor: ' + (first.setor || '-') + ' • Origem: ' + (first.local || 'Sem local')) : items.map(function (x) { return x.code; }).slice(0, 8).join(', ');

    if (activeCust) {
        retBan.classList.remove('hidden');
        document.getElementById('custActiveSummary').innerHTML = 'Atualmente em posse de <strong>' + escHtml(first.custodyHolder) + '</strong> desde <span class="font-mono">' + escHtml(toBRDateStr(first.custodyDate) || '-') + '</span>. Devolver para: <strong>' + escHtml(first.custodyReturnTo || first.local || '-') + '</strong>.';
    } else {
        retBan.classList.add('hidden');
    }

    // Trava Metrológica para retirada de vencidos / em reparo / aguardando
    var irregulars = items.filter(function (it) {
        if (String(it.custodyHolder || '').trim()) return false;
        var ef = getEffectiveStatus(it);
        return ef === 'VENCIDA' || ef === 'EM REPARO' || ef === 'AGUARDANDO CALIBRAÇÃO';
    });
    if (irregulars.length && !activeCust) {
        lockBox.classList.remove('hidden');
        document.getElementById('custMetroLockTitle').textContent = 'TRAVA METROLÓGICA (' + getEffectiveStatus(irregulars[0]) + ')';
        document.getElementById('custLockAckChk').checked = false;
        document.getElementById('custLockJustInp').value = '';
    } else {
        lockBox.classList.add('hidden');
    }

    document.getElementById('custHolderInp').value = isSingle ? (first.custodyHolder || '') : '';
    document.getElementById('custReturnInp').value = isSingle ? (first.custodyReturnTo || first.local || '') : '';
    document.getElementById('custDateInp').value = (isSingle && first.custodyDate) ? toBRDateStr(first.custodyDate) : todayBR();
    document.getElementById('custReasonInp').value = isSingle ? (first.custodyReason || '') : '';
    document.getElementById('custSectorInp').value = isSingle ? (first.setor || '') : '';
    document.getElementById('custBadgeInp').value = '';
    document.getElementById('custStatusSel').value = '__KEEP__';

    // Chips rápidos de destino
    var chipsEl = document.getElementById('custReturnChips');
    var destSug = [first.local, first.resp].filter(Boolean);
    if (chipsEl) {
        chipsEl.innerHTML = destSug.map(function (d) {
            return '<button type="button" onclick="document.getElementById(\'custReturnInp\').value=' + JSON.stringify(d).replace(/"/g, '&quot;') + '" class="px-2 py-0.5 rounded bg-[#EAF0F6] dark:bg-[#132846] text-[10px] font-bold cursor-pointer">' + escHtml(d) + '</button>';
        }).join('');
    }
}

function closeCustodyModal() {
    var m = document.getElementById('custodyModal');
    if (m) m.classList.add('hidden');
}

function fillCustodyMe() {
    var dn = (VoithDB.state.session && (VoithDB.state.session.displayName || VoithDB.state.session.username)) || 'Pablo Carvalho';
    document.getElementById('custHolderInp').value = dn;
}

function applyCustPreset(kind) {
    if (kind === 'CAL') {
        fillCustodyMe();
        document.getElementById('custStatusSel').value = 'AGUARDANDO CALIBRAÇÃO';
        document.getElementById('custReasonInp').value = 'Recolhido para calibração';
    } else if (kind === 'LOAN') {
        document.getElementById('custReasonInp').value = 'Empréstimo operacional em bancada';
    } else if (kind === 'REP') {
        fillCustodyMe();
        document.getElementById('custStatusSel').value = 'EM REPARO';
        document.getElementById('custReasonInp').value = 'Encaminhado para reparo / manutenção';
    }
}

async function confirmCustodyReturn() {
    var items = _custTargetIds.map(function (id) { return VoithDB.state.instruments.find(function (x) { return x.id === id; }); }).filter(Boolean);
    if (!items.length) return;
    var resetSt = Boolean(document.getElementById('custResetStatusChk').checked);
    var sig = _sigSigned ? document.getElementById('custSigCanvas').toDataURL('image/png') : '';
    VoithDB.pushUndo('Devolução Cautela');

    var upserts = [];
    var audits = [];
    var first = items[0];
    var prevHolder = first.custodyHolder || 'Portador';
    var retTo = first.custodyReturnTo || first.local || '';

    items.forEach(function (it) {
        var snap = VoithDB.makeItemSnapshot(it);
        it._baseRev = it.rev || 1;
        it._baseSnapshot = snap;
        it.custodyHolder = '';
        it.custodyReturnTo = '';
        it.custodyDate = '';
        it.custodyReason = '';
        if (resetSt) it.status = 'AUTO';
        upserts.push(it);
        audits.push({ module: 'Cautela', action: 'Devolução', target: it.code, field: 'Posse', before: snap.custodyHolder || '-', after: 'Devolvido', details: 'Devolvido por ' + (snap.custodyHolder || '-') });
    });

    closeCustodyModal();
    renderAllViews();

    var receipt = {
        id: Date.now(), eventType: 'DEVOLUCAO',
        instrumentId: first.id, instrumentCode: first.code, instrumentDesc: first.desc,
        instrumentStatus: getEffectiveStatus(first), holderName: prevHolder,
        holderBadge: (document.getElementById('custBadgeInp').value || '').trim(),
        holderSector: (document.getElementById('custSectorInp').value || first.setor || '').trim(),
        returnTo: retTo, reason: 'Devolução registrada', overrideWarning: '',
        signatureData: sig, clientPlatform: window.VOITH_PLATFORM
    };
    var results = await Promise.all([
        VoithCloud.saveDelta({ instUpsert: upserts }, audits),
        VoithCloud.callRpc({ action: 'save_custody_receipt', receipt: receipt }, true)
    ]);
    var rRes = results[1];
    receipt.receiptCode = (rRes && rRes.receiptCode) || ('CT-' + String(receipt.id).slice(-5));
    receipt.integrityHash = (rRes && rRes.integrityHash) || 'OFFLINE-QUEUED';
    VoithDB.state.receipts.unshift(receipt);
    openReceiptShareModal(receipt);
}

async function saveCustodyModal() {
    var items = _custTargetIds.map(function (id) { return VoithDB.state.instruments.find(function (x) { return x.id === id; }); }).filter(Boolean);
    if (!items.length) { showToast('Localize um instrumento primeiro.', 'err'); return; }
    var holder = (document.getElementById('custHolderInp').value || '').trim();
    if (!holder) { showToast('Informe quem está em posse do instrumento.', 'err'); return; }

    var lockBox = document.getElementById('custMetroLockBox');
    var warnTxt = '';
    if (lockBox && !lockBox.classList.contains('hidden')) {
        var ack = document.getElementById('custLockAckChk').checked;
        var just = (document.getElementById('custLockJustInp').value || '').trim();
        if (!ack || !just) {
            showToast('Trava Metrológica: confirme ciência e preencha a justificativa.', 'err');
            return;
        }
        warnTxt = document.getElementById('custMetroLockTitle').textContent + ': ' + just;
    }

    var retTo = (document.getElementById('custReturnInp').value || '').trim();
    var cDate = (document.getElementById('custDateInp').value || '').trim() || todayBR();
    var reason = (document.getElementById('custReasonInp').value || '').trim();
    var stSel = document.getElementById('custStatusSel').value;
    var badge = (document.getElementById('custBadgeInp').value || '').trim();
    var sector = (document.getElementById('custSectorInp').value || '').trim();
    var sig = _sigSigned ? document.getElementById('custSigCanvas').toDataURL('image/png') : '';

    VoithDB.pushUndo('Cautela Rápida');
    var upserts = [];
    var audits = [];
    items.forEach(function (it) {
        var snap = VoithDB.makeItemSnapshot(it);
        it._baseRev = it.rev || 1;
        it._baseSnapshot = snap;
        it.custodyHolder = holder;
        it.custodyReturnTo = retTo || it.local || '';
        it.custodyDate = cDate;
        it.custodyReason = reason;
        if (stSel && stSel !== '__KEEP__') it.status = stSel;
        upserts.push(it);
        audits.push({ module: 'Cautela', action: 'Retirada', target: it.code, field: 'Posse', before: snap.custodyHolder || '-', after: holder, details: 'Retirado por ' + holder + (warnTxt ? ' | ' + warnTxt : '') });
    });

    VoithDB.state.selectedIds.clear();
    closeCustodyModal();
    renderAllViews();

    var first = items[0];
    var receipt = {
        id: Date.now(), eventType: 'RETIRADA',
        instrumentId: first.id, instrumentCode: items.length === 1 ? first.code : (first.code + ' (+' + (items.length - 1) + ')'),
        instrumentDesc: first.desc, instrumentStatus: getEffectiveStatus(first),
        holderName: holder, holderBadge: badge, holderSector: sector || first.setor || '',
        returnTo: retTo || first.local || '', reason: reason, overrideWarning: warnTxt,
        signatureData: sig, clientPlatform: window.VOITH_PLATFORM
    };
    var results = await Promise.all([
        VoithCloud.saveDelta({ instUpsert: upserts }, audits),
        VoithCloud.callRpc({ action: 'save_custody_receipt', receipt: receipt }, true)
    ]);
    var rRes = results[1];
    receipt.receiptCode = (rRes && rRes.receiptCode) || ('CT-' + String(receipt.id).slice(-5));
    receipt.integrityHash = (rRes && rRes.integrityHash) || 'OFFLINE-QUEUED';
    VoithDB.state.receipts.unshift(receipt);
    openReceiptShareModal(receipt);
}

function openReceiptShareModal(rec) {
    var msg = [
        '*VOITH TURBO — COMPROVANTE (' + rec.eventType + ')*',
        'Protocolo: *' + rec.receiptCode + '*',
        'Ativo: *' + rec.instrumentCode + '* — ' + (rec.instrumentDesc || ''),
        'Portador: *' + rec.holderName + '*' + (rec.holderBadge ? ' (Matr. ' + rec.holderBadge + ')' : ''),
        rec.returnTo ? 'Destino: ' + rec.returnTo : '',
        rec.reason ? 'Motivo: ' + rec.reason : '',
        rec.overrideWarning ? '⚠️ Alerta: ' + rec.overrideWarning : '',
        'Selo SHA-256: `' + String(rec.integrityHash || '').slice(0, 16) + '`'
    ].filter(Boolean).join('\n');

    document.getElementById('receiptShareMeta').textContent = 'Protocolo ' + rec.receiptCode + ' • SHA-256: ' + String(rec.integrityHash || '').slice(0, 16);
    document.getElementById('receiptShareText').value = msg;
    document.getElementById('receiptShareWa').href = 'https://wa.me/?text=' + encodeURIComponent(msg);
    document.getElementById('receiptShareModal').classList.remove('hidden');
}

function closeReceiptShareModal() { document.getElementById('receiptShareModal').classList.add('hidden'); }
function copyReceiptShareText() { copyTextToClipboard(document.getElementById('receiptShareText').value, 'Comprovante copiado!'); }

function setCustodyGroupMode(mode) {
    VoithDB.state.custodyGroupMode = mode;
    if (mode === 'receipts' && VoithDB.isEditor()) {
        VoithCloud.loadReceiptsQuiet().then(renderCustodyBoard);
    } else {
        renderCustodyBoard();
    }
}

// ===================== AÇÕES EM LOTE NO INVENTÁRIO =====================
async function applyBatchLocation() {
    if (!VoithDB.isEditor()) return;
    var loc = VoithDB.normalizeControlled(document.getElementById('batchLocInput').value, 'local');
    if (!loc) { showToast('Informe o local para aplicar.', 'warn'); return; }
    var ids = Array.from(VoithDB.state.selectedIds);
    if (!ids.length) return;
    VoithDB.pushUndo('Local em Lote');
    var upserts = [];
    ids.forEach(function (id) {
        var it = VoithDB.state.instruments.find(function (x) { return x.id === id; });
        if (it) {
            it._baseRev = it.rev || 1;
            it._baseSnapshot = VoithDB.makeItemSnapshot(it);
            it.local = loc;
            upserts.push(it);
        }
    });
    document.getElementById('batchLocInput').value = '';
    clearBatchSelection();
    renderAllViews();
    await VoithCloud.saveDelta({ instUpsert: upserts }, [{ module: 'Inventário', action: 'Local em Lote', target: upserts.length + ' itens', field: 'Local', before: '-', after: loc, details: 'Aplicou local ' + loc + ' em ' + upserts.length + ' itens' }]);
    showToast('Local "' + loc + '" aplicado em ' + upserts.length + ' item(ns).', 'ok');
}

function openBatchDeleteConfirm() {
    var ids = Array.from(VoithDB.state.selectedIds);
    if (!ids.length) return;
    openConfirmModal('Excluir em Lote', 'Deseja excluir ' + ids.length + ' instrumento(s) selecionado(s)?', async function () {
        VoithDB.pushUndo('Excluir em Lote');
        var idSet = new Set(ids);
        VoithDB.state.instruments = VoithDB.state.instruments.filter(function (x) { return !idSet.has(x.id); });
        clearBatchSelection();
        renderAllViews();
        await VoithCloud.saveDelta({ instDelete: ids.map(String) }, [{ module: 'Inventário', action: 'Exclusão em Lote', target: ids.length + ' itens', field: 'Registro', before: '-', after: 'Excluído', details: 'Excluiu ' + ids.length + ' itens' }]);
        showToast(ids.length + ' instrumento(s) excluído(s).', 'ok');
    });
}

// ===================== LABORATÓRIO EXTERNO & PERDIDOS =====================
function setLabSubTab(tab) {
    VoithDB.state.labSubTab = tab;
    document.getElementById('subpanel-external').classList.toggle('hidden', tab !== 'external');
    document.getElementById('subpanel-lost').classList.toggle('hidden', tab !== 'lost');
    document.getElementById('subLabBtn').className = tab === 'external'
        ? 'px-3.5 py-2.5 sm:py-2 rounded-lg text-xs font-extrabold bg-[#004C97] text-white cursor-pointer transition inline-flex items-center justify-center gap-2'
        : 'px-3.5 py-2.5 sm:py-2 rounded-lg text-xs font-bold bg-white dark:bg-[#091527] border border-[#DCE4EE] dark:border-[#172E4E] text-slate-700 dark:text-slate-300 cursor-pointer transition inline-flex items-center justify-center gap-2';
    document.getElementById('subLostBtn').className = tab === 'lost'
        ? 'px-3.5 py-2.5 sm:py-2 rounded-lg text-xs font-extrabold bg-rose-600 text-white cursor-pointer transition inline-flex items-center justify-center gap-2'
        : 'px-3.5 py-2.5 sm:py-2 rounded-lg text-xs font-bold bg-white dark:bg-[#091527] border border-[#DCE4EE] dark:border-[#172E4E] text-slate-700 dark:text-slate-300 cursor-pointer transition inline-flex items-center justify-center gap-2';
}

function setLabStatusFilter(st) {
    VoithDB.state.labStatusFilter = st || '';
    renderLabTables();
}

function openExternalModal(idx) {
    if (!VoithDB.isEditor()) { openLoginModal(); return; }
    _extBatchIds = [];
    document.getElementById('extEditIdx').value = idx;
    document.getElementById('extSingleCodeWrap').classList.remove('hidden');
    document.getElementById('extBatchSummary').classList.add('hidden');
    document.getElementById('extCodeInp').value = '';
    document.getElementById('extCodeInfo').textContent = '';
    document.getElementById('extDateEnvio').value = todayBR();
    var prev = new Date(); prev.setDate(prev.getDate() + 15);
    document.getElementById('extDatePrev').value = formatDateBR(prev);
    document.getElementById('extObsInp').value = '';
    document.getElementById('externalModal').classList.remove('hidden');
}

function openBatchExternalModal() {
    if (!VoithDB.isEditor()) { openLoginModal(); return; }
    _extBatchIds = Array.from(VoithDB.state.selectedIds);
    if (!_extBatchIds.length) return;
    document.getElementById('extSingleCodeWrap').classList.add('hidden');
    var sum = document.getElementById('extBatchSummary');
    sum.classList.remove('hidden');
    var codes = _extBatchIds.map(function (id) {
        var it = VoithDB.state.instruments.find(function (x) { return x.id === id; });
        return it ? it.code : '';
    }).filter(Boolean);
    sum.textContent = codes.length + ' instrumento(s): ' + codes.join(', ');
    document.getElementById('extDateEnvio').value = todayBR();
    var prev = new Date(); prev.setDate(prev.getDate() + 15);
    document.getElementById('extDatePrev').value = formatDateBR(prev);
    document.getElementById('extObsInp').value = '';
    document.getElementById('externalModal').classList.remove('hidden');
}

function closeExternalModal() { document.getElementById('externalModal').classList.add('hidden'); }

function lookupExtCode() {
    var q = (document.getElementById('extCodeInp').value || '').trim().toUpperCase();
    var it = VoithDB.state.instruments.find(function (x) { return String(x.code || '').toUpperCase() === q; });
    document.getElementById('extCodeInfo').textContent = it ? (it.desc + ' • ' + (it.setor || '')) : '';
}

async function saveExternalModal() {
    var dtEnv = (document.getElementById('extDateEnvio').value || '').trim() || todayBR();
    var dtPrev = (document.getElementById('extDatePrev').value || '').trim();
    var lab = (document.getElementById('extLabInp').value || '').trim() || 'Laboratório Externo';
    var obs = (document.getElementById('extObsInp').value || '').trim();

    var targets = [];
    if (_extBatchIds.length) {
        targets = _extBatchIds.map(function (id) { return VoithDB.state.instruments.find(function (x) { return x.id === id; }); }).filter(Boolean);
    } else {
        var code = (document.getElementById('extCodeInp').value || '').trim().toUpperCase();
        if (!code) { showToast('Informe o código do instrumento.', 'err'); return; }
        var found = VoithDB.state.instruments.find(function (x) { return String(x.code || '').toUpperCase() === code; });
        targets = [found || { id: null, code: code, desc: 'Instrumento', setor: '' }];
    }

    VoithDB.pushUndo('Envio Externo');
    var histUp = [], instUp = [], audits = [];
    targets.forEach(function (it, idx) {
        var hRow = {
            id: Date.now() + idx, dateEnvio: dtEnv, datePrev: dtPrev, dateRetorno: '', newCalDate: '',
            code: it.code, desc: it.desc || '', setor: it.setor || '', lab: lab, obs: obs, status: 'EM TRÂNSITO', rev: 1
        };
        VoithDB.state.history.unshift(hRow);
        histUp.push(hRow);
        if (it.id) {
            it._baseRev = it.rev || 1;
            it._baseSnapshot = VoithDB.makeItemSnapshot(it);
            it.status = 'AGUARDANDO CALIBRAÇÃO';
            instUp.push(it);
        }
        audits.push({ module: 'Lab', action: 'Envio Externo', target: it.code, field: 'Laboratório', before: '-', after: lab, details: 'Enviou ' + it.code + ' para ' + lab });
    });

    VoithDB.state.selectedIds.clear();
    closeExternalModal();
    renderAllViews();
    await VoithCloud.saveDelta({ instUpsert: instUp, histUpsert: histUp }, audits);
    showToast(histUp.length + ' envio(s) registrado(s)!', 'ok');
}

function openReturnLabModal(histId) {
    var h = VoithDB.state.history.find(function (x) { return x.id === Number(histId); });
    if (!h) return;
    document.getElementById('retLabIdx').value = h.id;
    document.getElementById('retLabTitle').textContent = h.code + ' — ' + (h.desc || '');
    document.getElementById('retLabSub').textContent = 'Lab: ' + (h.lab || '-') + ' • Envio: ' + (toBRDateStr(h.dateEnvio) || '-');
    var now = new Date();
    document.getElementById('retLabDate').value = formatDateBR(now);
    var inst = VoithDB.state.instruments.find(function (x) { return String(x.code || '').toUpperCase() === String(h.code || '').toUpperCase(); });
    var cm = inst && inst.cycleMonths ? Number(inst.cycleMonths) : 12;
    document.getElementById('retLabCycleTag').textContent = '(' + cm + 'm)';
    document.getElementById('retLabNewValid').value = formatDateBR(addMonthsToDate(now, cm));
    document.getElementById('retLabObs').value = h.obs || '';

    var cBox = document.getElementById('retLabCustBox');
    if (inst && String(inst.custodyHolder || '').trim()) {
        cBox.classList.remove('hidden');
        document.getElementById('retLabCustMsg').textContent = 'Cautela ativa com: ' + inst.custodyHolder;
        document.getElementById('retLabClearCustChk').checked = false;
    } else {
        cBox.classList.add('hidden');
    }
    document.getElementById('returnLabModal').classList.remove('hidden');
}

function closeReturnLabModal() { document.getElementById('returnLabModal').classList.add('hidden'); }
function addReturnMonths(m) {
    var d = parseDateBR(document.getElementById('retLabDate').value) || new Date();
    document.getElementById('retLabNewValid').value = formatDateBR(addMonthsToDate(d, m));
}

async function confirmReturnLab() {
    var hid = Number(document.getElementById('retLabIdx').value);
    var h = VoithDB.state.history.find(function (x) { return x.id === hid; });
    if (!h) return;
    var dtRet = (document.getElementById('retLabDate').value || '').trim() || todayBR();
    var newVal = (document.getElementById('retLabNewValid').value || '').trim();
    if (!newVal) { showToast('Informe a nova validade.', 'err'); return; }
    var obs = (document.getElementById('retLabObs').value || '').trim();
    var clearCust = Boolean(document.getElementById('retLabClearCustChk').checked);

    VoithDB.pushUndo('Retorno Lab ' + h.code);
    h._baseRev = h.rev || 1;
    h.status = 'CONCLUÍDO';
    h.dateRetorno = dtRet;
    h.newCalDate = newVal;
    h.obs = obs;

    var delta = { histUpsert: [h] };
    var inst = VoithDB.state.instruments.find(function (x) { return String(x.code || '').toUpperCase() === String(h.code || '').toUpperCase(); });
    if (inst) {
        inst._baseRev = inst.rev || 1;
        inst._baseSnapshot = VoithDB.makeItemSnapshot(inst);
        inst.proxCal = newVal;
        inst.status = 'AUTO';
        if (clearCust) { inst.custodyHolder = ''; inst.custodyReturnTo = ''; inst.custodyDate = ''; inst.custodyReason = ''; }
        delta.instUpsert = [inst];
    }
    closeReturnLabModal();
    renderAllViews();
    await VoithCloud.saveDelta(delta, [{ module: 'Lab', action: 'Retorno Concluído', target: h.code, field: 'Validade', before: '-', after: newVal, details: 'Retornou do lab com validade ' + newVal }]);
    showToast(h.code + ' atualizado para EM DIA!', 'ok');
}

function toggleLabRowSelect(id, checked) {
    if (checked) VoithDB.state.selectedLabIds.add(id);
    else VoithDB.state.selectedLabIds.delete(id);
    renderLabTables();
}

function toggleLabSelectAll(checked) {
    VoithDB.state.history.forEach(function (h) {
        if (h.status !== 'CONCLUÍDO') {
            if (checked) VoithDB.state.selectedLabIds.add(h.id);
            else VoithDB.state.selectedLabIds.delete(h.id);
        }
    });
    renderLabTables();
}

function clearLabSelection() {
    VoithDB.state.selectedLabIds.clear();
    var c = document.getElementById('chkLabAll'); if (c) c.checked = false;
    renderLabTables();
}

function openBatchReturnLabModal() {
    var ids = Array.from(VoithDB.state.selectedLabIds);
    if (!ids.length) return;
    var rows = ids.map(function (id) { return VoithDB.state.history.find(function (x) { return x.id === id; }); }).filter(Boolean);
    document.getElementById('brLabSummaryTitle').textContent = rows.length + ' instrumento(s) selecionado(s)';
    document.getElementById('brLabCodesList').textContent = rows.map(function (r) { return r.code; }).join(', ');
    document.getElementById('brLabDate').value = todayBR();
    document.getElementById('brLabUseCycleChk').checked = true;
    toggleBatchReturnCycleMode();
    document.getElementById('batchReturnLabModal').classList.remove('hidden');
}

function closeBatchReturnLabModal() { document.getElementById('batchReturnLabModal').classList.add('hidden'); }
function toggleBatchReturnCycleMode() {
    var auto = document.getElementById('brLabUseCycleChk').checked;
    document.getElementById('brLabFixedValidWrap').classList.toggle('hidden', auto);
}

async function confirmBatchReturnLab() {
    var ids = Array.from(VoithDB.state.selectedLabIds);
    var dtRet = (document.getElementById('brLabDate').value || '').trim() || todayBR();
    var baseD = parseDateBR(dtRet) || new Date();
    var autoCyc = document.getElementById('brLabUseCycleChk').checked;
    var fixedV = (document.getElementById('brLabFixedValid').value || '').trim();
    var obs = (document.getElementById('brLabObs').value || '').trim();
    var clearCust = document.getElementById('brLabClearCustChk').checked;
    if (!autoCyc && !fixedV) { showToast('Informe a validade fixa.', 'err'); return; }

    VoithDB.pushUndo('Retorno Lab em Lote');
    var histUp = [], instUp = [], audits = [];
    ids.forEach(function (id) {
        var h = VoithDB.state.history.find(function (x) { return x.id === id; });
        if (!h) return;
        var inst = VoithDB.state.instruments.find(function (x) { return String(x.code || '').toUpperCase() === String(h.code || '').toUpperCase(); });
        var cm = inst && inst.cycleMonths ? Number(inst.cycleMonths) : 12;
        var nv = autoCyc ? formatDateBR(addMonthsToDate(baseD, cm)) : fixedV;
        h._baseRev = h.rev || 1;
        h.status = 'CONCLUÍDO';
        h.dateRetorno = dtRet;
        h.newCalDate = nv;
        if (obs) h.obs = obs;
        histUp.push(h);
        if (inst) {
            inst._baseRev = inst.rev || 1;
            inst._baseSnapshot = VoithDB.makeItemSnapshot(inst);
            inst.proxCal = nv;
            inst.status = 'AUTO';
            if (clearCust) { inst.custodyHolder = ''; inst.custodyReturnTo = ''; inst.custodyDate = ''; inst.custodyReason = ''; }
            instUp.push(inst);
        }
        audits.push({ module: 'Lab', action: 'Retorno em Lote', target: h.code, field: 'Validade', before: '-', after: nv, details: 'Retorno lote: ' + nv });
    });
    clearLabSelection();
    closeBatchReturnLabModal();
    renderAllViews();
    await VoithCloud.saveDelta({ histUpsert: histUp, instUpsert: instUp }, audits);
    showToast(histUp.length + ' retorno(s) concluído(s)!', 'ok');
}

function deleteHistoryRow(hid) {
    openConfirmModal('Excluir Registro', 'Remover este lançamento do histórico de calibração externa?', async function () {
        VoithDB.pushUndo('Excluir Histórico Lab');
        VoithDB.state.history = VoithDB.state.history.filter(function (x) { return x.id !== Number(hid); });
        renderAllViews();
        await VoithCloud.saveDelta({ histDelete: [String(hid)] }, []);
        showToast('Lançamento removido.', 'ok');
    });
}

function openLostModal(idx) {
    if (!VoithDB.isEditor()) { openLoginModal(); return; }
    document.getElementById('lostIdx').value = idx;
    ['lostCode', 'lostCC', 'lostDesc', 'lostSetor', 'lostLastCal', 'lostObs'].forEach(function (k) { document.getElementById(k).value = ''; });
    document.getElementById('lostModal').classList.remove('hidden');
}
function closeLostModal() { document.getElementById('lostModal').classList.add('hidden'); }

async function saveLostModal() {
    var code = (document.getElementById('lostCode').value || '').trim().toUpperCase();
    var desc = (document.getElementById('lostDesc').value || '').trim();
    if (!code || !desc) { showToast('Preencha Código e Descrição.', 'err'); return; }
    var row = {
        id: Date.now(), code: code, desc: desc,
        cc: (document.getElementById('lostCC').value || '').trim(),
        setor: (document.getElementById('lostSetor').value || '').trim(),
        lastCal: (document.getElementById('lostLastCal').value || '').trim(),
        obs: (document.getElementById('lostObs').value || '').trim(), rev: 1
    };
    VoithDB.pushUndo('Cadastrar Perdido');
    VoithDB.state.lost.unshift(row);
    closeLostModal();
    renderAllViews();
    await VoithCloud.saveDelta({ lostUpsert: [row] }, [{ module: 'Perdidos', action: 'Inclusão', target: code, field: 'Status', before: '-', after: 'Perdido', details: row.obs }]);
    showToast(code + ' cadastrado em Perdidos.', 'ok');
}

async function restoreLostItem(lid) {
    var l = VoithDB.state.lost.find(function (x) { return x.id === Number(lid); });
    if (!l) return;
    VoithDB.pushUndo('Restaurar ' + l.code);
    var inst = {
        id: Date.now(), code: l.code, desc: l.desc, cc: l.cc || '', setor: l.setor || 'Voith Turbo (Industrial)',
        local: '', resp: '', min: '', max: '', proxCal: l.lastCal || '', status: 'AUTO',
        obs: 'Restaurado de Perdidos', custodyHolder: '', custodyReturnTo: '', custodyDate: '', custodyReason: '', cycleMonths: 12, rev: 1
    };
    VoithDB.state.lost = VoithDB.state.lost.filter(function (x) { return x.id !== Number(lid); });
    VoithDB.state.instruments.unshift(inst);
    renderAllViews();
    await VoithCloud.saveDelta({ instUpsert: [inst], lostDelete: [String(lid)] }, [{ module: 'Perdidos', action: 'Restauração', target: l.code, field: 'Status', before: 'Perdido', after: 'Ativo', details: 'Restaurou ' + l.code }]);
    showToast(l.code + ' restaurado ao Inventário!', 'ok');
}

function deleteLostItem(lid) {
    openConfirmModal('Excluir Perdido', 'Remover permanentemente este item de Perdidos/Desativados?', async function () {
        VoithDB.pushUndo('Excluir Perdido');
        VoithDB.state.lost = VoithDB.state.lost.filter(function (x) { return x.id !== Number(lid); });
        renderAllViews();
        await VoithCloud.saveDelta({ lostDelete: [String(lid)] }, []);
        showToast('Removido.', 'ok');
    });
}

// ===================== IMPRESSÃO PDF & RELATÓRIOS =====================
function openPrintModal(tpl) {
    populateGlobalDatalistsAndFilters();
    var sel = document.getElementById('printTplSel');
    if (sel && tpl) sel.value = tpl;
    document.getElementById('printModal').classList.remove('hidden');
    updatePrintPreviewCount();
}

function openPrintModalFromInventory(tpl) {
    openPrintModal(tpl);
    var f = VoithDB.state.filters;
    document.getElementById('printStatusSel').value = f.status || '';
    document.getElementById('printSetorSel').value = f.setor || '';
    document.getElementById('printRespSel').value = f.resp || '';
    document.getElementById('printMonthSel').value = f.month || '';
    document.getElementById('printLocalInp').value = f.local === '__NONE__' ? '' : (f.local || '');
    updatePrintPreviewCount();
}

function closePrintModal() { document.getElementById('printModal').classList.add('hidden'); }

function applyPrintQuickPreset(kind) {
    if (kind === 'CLEAR') {
        document.getElementById('printMonthSel').value = '';
        document.getElementById('printStatusSel').value = '';
        document.getElementById('printLocalInp').value = '';
        document.getElementById('printSetorSel').value = '';
        document.getElementById('printRespSel').value = '';
    } else if (kind === '__THIS_MONTH__') {
        var now = VoithDB.getRefDate();
        document.getElementById('printMonthSel').value = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    } else {
        document.getElementById('printStatusSel').value = kind;
    }
    updatePrintPreviewCount();
}

function getPrintFilteredItems() {
    var mon = document.getElementById('printMonthSel').value;
    var st = document.getElementById('printStatusSel').value;
    var loc = normStr(document.getElementById('printLocalInp').value);
    var sec = document.getElementById('printSetorSel').value;
    var resp = document.getElementById('printRespSel').value;
    var ref = VoithDB.getRefDate();

    return VoithDB.state.instruments.filter(function (it) {
        var eff = getEffectiveStatus(it, ref);
        if (st === '__URGENT__') { if (eff !== 'VENCIDA' && eff !== 'PRÓXIMA DO VENCIMENTO') return false; }
        else if (st && eff !== st) return false;
        if (sec && String(it.setor || '').trim() !== sec) return false;
        if (resp && String(it.resp || '').trim() !== resp) return false;
        if (loc && normStr(it.local).indexOf(loc) === -1) return false;
        if (mon) {
            var d = parseDateBR(it.proxCal);
            var ym = d ? (d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')) : '';
            if (ym !== mon) return false;
        }
        return true;
    });
}

function updatePrintPreviewCount() {
    var n = getPrintFilteredItems().length;
    var lbl = document.getElementById('printPreviewCount');
    var btn = document.getElementById('printExecuteBtn');
    if (lbl) lbl.textContent = n + ' item(ns) selecionado(s)';
    if (btn) btn.disabled = n === 0;
}

function executePrintDocument() {
    var tpl = document.getElementById('printTplSel') ? document.getElementById('printTplSel').value : 'CABINET';
    var items = getPrintFilteredItems();
    var chk = Boolean(document.getElementById('printChecklistChk').checked);
    var loc = document.getElementById('printLocalInp').value.trim();
    var sec = document.getElementById('printSetorSel').value;
    var resp = document.getElementById('printRespSel').value;
    var title = tpl === 'ISO' ? 'Relatório Oficial de Auditoria Metrológica (ISO 9001)' : (loc ? 'Folha Porta de Armário — ' + loc : 'Folha de Controle de Armário / Lista');
    var sub = [loc && ('Local: ' + loc), sec && ('Setor: ' + sec), resp && ('Resp.: ' + resp)].filter(Boolean).join(' • ') || 'Frota Voith Turbo Brasil';
    closePrintModal();
    openPrintableWindow(title, sub, items, chk);
}

function quickPrintLocal(loc) {
    var items = VoithDB.state.instruments.filter(function (i) { return String(i.local || '').trim() === loc; });
    openPrintableWindow('Folha Porta de Armário — ' + loc, 'Chão de Fábrica • Local: ' + loc, items, true);
}

function quickPrintTech(resp) {
    var items = VoithDB.state.instruments.filter(function (i) { return String(i.resp || '').trim() === resp; });
    openPrintableWindow('Relatório Técnico — ' + resp, 'Gestão Técnica • Responsável: ' + resp, items, false);
}

function openPrintableWindow(title, subtitle, items, withChecklist) {
    var w = window.open('', '_blank', 'width=980,height=760');
    if (!w) { window.print(); return; }
    var ref = VoithDB.getRefDate();
    var rowsHtml = items.map(function (it) {
        var ef = getEffectiveStatus(it, ref);
        var color = ef === 'VENCIDA' ? '#dc2626' : (ef === 'PRÓXIMA DO VENCIMENTO' ? '#d97706' : '#059669');
        return '<tr>' +
            (withChecklist ? '<td style="text-align:center;font-size:15px">☐</td>' : '') +
            '<td><strong>' + escHtml(it.code) + '</strong></td>' +
            '<td>' + escHtml(it.desc) + '</td>' +
            '<td>' + escHtml(it.setor || '-') + '</td>' +
            '<td>' + escHtml(it.local || '-') + '</td>' +
            '<td>' + escHtml(it.resp || '-') + '</td>' +
            '<td style="font-family:monospace">' + escHtml(toBRDateStr(it.proxCal) || '-') + '</td>' +
            '<td style="color:' + color + ';font-weight:700">' + escHtml(ef) + '</td>' +
        '</tr>';
    }).join('');

    w.document.write('<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>' + escHtml(title) + '</title>' +
        '<style>body{font-family:Segoe UI,Arial,sans-serif;padding:24px;color:#0f172a} .hdr{border-bottom:3px solid #004C97;padding-bottom:10px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:flex-end} table{width:100%;border-collapse:collapse;font-size:11.5px} th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:left} th{background:#f1f5f9;text-transform:uppercase;font-size:10px} @media print{.no-p{display:none}}</style></head><body>' +
        '<div class="hdr"><div><div style="font-size:11px;font-weight:800;color:#004C97;letter-spacing:0.12em">VOITH TURBO BRASIL • METROLOGIA</div><h2 style="margin:4px 0 2px">' + escHtml(title) + '</h2><div style="font-size:12px;color:#475569">' + escHtml(subtitle) + ' • Total: ' + items.length + ' instrumento(s)</div></div>' +
        '<div style="text-align:right;font-size:11px;color:#475569">Emitido em ' + new Date().toLocaleString('pt-BR') + '<br><button class="no-p" onclick="window.print()" style="margin-top:6px;padding:6px 14px;background:#004C97;color:#fff;border:none;border-radius:6px;font-weight:700;cursor:pointer">Imprimir / Salvar PDF</button></div></div>' +
        '<table><thead><tr>' + (withChecklist ? '<th style="width:28px">OK</th>' : '') + '<th>Código</th><th>Descrição</th><th>Setor</th><th>Local</th><th>Responsável</th><th>Validade</th><th>Status</th></tr></thead><tbody>' + rowsHtml + '</tbody></table></body></html>');
    w.document.close();
}

function copySummaryReport(mode) {
    var ref = VoithDB.getRefDate();
    var list = [];
    var header = '';
    if (mode === 'OVERDUE') {
        list = VoithDB.state.instruments.filter(function (i) { return getEffectiveStatus(i, ref) === 'VENCIDA'; });
        header = '*VOITH TURBO — INSTRUMENTOS VENCIDOS (' + list.length + ')*';
    } else if (mode === 'CUSTODY') {
        list = VoithDB.state.instruments.filter(function (i) { return Boolean(String(i.custodyHolder || '').trim()); });
        header = '*VOITH TURBO — INSTRUMENTOS EM CAUTELA (' + list.length + ')*';
    } else {
        list = getFilteredInventory();
        header = '*VOITH TURBO — LISTA FILTRADA (' + list.length + ')*';
    }
    if (!list.length) { showToast('Nenhum item encontrado para copiar.', 'warn'); return; }
    var lines = list.map(function (i) {
        return '• ' + i.code + ' — ' + i.desc + ' | ' + (i.local || 'S/Local') + ' | Val: ' + (toBRDateStr(i.proxCal) || '-') + (i.custodyHolder ? ' | Posse: ' + i.custodyHolder : '');
    });
    copyTextToClipboard(header + '\n' + lines.join('\n'), list.length + ' item(ns) copiado(s)!');
}

function copyTechReport(resp) {
    var ref = VoithDB.getRefDate();
    var exp = VoithDB.state.instruments.filter(function (i) { return String(i.resp || '').trim() === resp && getEffectiveStatus(i, ref) === 'VENCIDA'; });
    var list = exp.length ? exp : VoithDB.state.instruments.filter(function (i) { return String(i.resp || '').trim() === resp; });
    var lines = list.map(function (i) { return '• ' + i.code + ' — ' + i.desc + ' (' + (i.local || 'S/Local') + ') | Val: ' + (toBRDateStr(i.proxCal) || '-'); });
    copyTextToClipboard('*Responsável: ' + resp + '* (' + list.length + ' itens)\n' + lines.join('\n'), 'Lista de ' + resp + ' copiada!');
}

function exportCSV() {
    var ref = VoithDB.getRefDate();
    var hdr = ['Codigo', 'Descricao', 'CC', 'Setor', 'Local', 'Responsavel', 'Min', 'Max', 'ProxCal', 'Status', 'Cautela', 'Obs'].map(csvCell).join(';');
    var rows = VoithDB.state.instruments.map(function (i) {
        return [i.code, i.desc, i.cc, i.setor, i.local, i.resp, i.min, i.max, toBRDateStr(i.proxCal), getEffectiveStatus(i, ref), i.custodyHolder, i.obs].map(csvCell).join(';');
    });
    var blob = new Blob(['\uFEFF' + hdr + '\n' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'voith-metrologia-' + formatDateISO(new Date()) + '.csv';
    a.click();
    showToast('Base CSV exportada!', 'ok');
}

// ===================== BACKUP, CLOUD, CONFLITOS, UNDO =====================
function openBackupModal() { document.getElementById('backupModal').classList.remove('hidden'); }
function closeBackupModal() { document.getElementById('backupModal').classList.add('hidden'); }

function downloadJsonBackup() {
    var payload = {
        exportedAt: new Date().toISOString(),
        appVersion: '16.12',
        instrumentsData: VoithDB.state.instruments,
        calibrationHistory: VoithDB.state.history,
        lostInstrumentsData: VoithDB.state.lost,
        controlledLists: VoithDB.state.controlledLists
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'voith-backup-' + formatDateISO(new Date()) + '.json';
    a.click();
    showToast('Backup JSON baixado!', 'ok');
}

function restoreJsonBackup(ev) {
    var file = ev.target && ev.target.files && ev.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = async function (e) {
        try {
            var data = JSON.parse(e.target.result);
            if (!Array.isArray(data.instrumentsData)) throw new Error('JSON inválido.');
            VoithDB.pushUndo('Restaurar Backup JSON');
            VoithDB.state.instruments = data.instrumentsData;
            VoithDB.state.history = data.calibrationHistory || [];
            VoithDB.state.lost = data.lostInstrumentsData || [];
            closeBackupModal();
            renderAllViews();
            await VoithCloud.saveFull([{ module: 'Backup', action: 'Restauração', target: 'Base Completa', field: 'JSON', before: '-', after: VoithDB.state.instruments.length + ' itens', details: 'Restaurou backup JSON' }], true);
            showToast('Backup restaurado com sucesso!', 'ok');
        } catch (err) { showToast('Arquivo JSON inválido: ' + err.message, 'err'); }
    };
    reader.readAsText(file);
}

function downloadOfflineHtml() {
    var blob = new Blob([document.documentElement.outerHTML], { type: 'text/html;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'voith-metrologia-offline.html';
    a.click();
}

function openCloudModal() {
    VoithCloud.setCloudPill(VoithDB.state.cloudStatus, VoithDB.state.cloudError ? 'err' : 'ok', VoithDB.state.cloudError);
    document.getElementById('cloudModal').classList.remove('hidden');
}
function closeCloudModal() { document.getElementById('cloudModal').classList.add('hidden'); }
function loadFromCloud(manual, silent) { VoithCloud.loadState(manual, silent); }
async function forcePushCloud() {
    if (!VoithDB.isEditor()) { openLoginModal(); return; }
    var res = await VoithCloud.saveFull([{ module: 'Cloud', action: 'Push Forçado', target: 'Base', field: 'Full', before: '-', after: VoithDB.state.instruments.length + ' itens', details: 'Envio completo forçado' }], true);
    if (res && res.ok) { closeCloudModal(); showToast('Base sincronizada com sucesso!', 'ok'); }
    else showToast((res && res.error) || 'Erro ao enviar.', 'err');
}

function retryOfflineSyncNow() { VoithCloud.flushOutbox(false); }

function openConflictModal(data, originalPayload) {
    VoithDB.state.pendingConflict = { data: data, payload: originalPayload };
    document.getElementById('conflictTime').textContent = data.serverUpdatedAt || 'agora';
    var box = document.getElementById('conflictItemsBox');
    if (box && Array.isArray(data.conflicts) && data.conflicts.length) {
        box.classList.remove('hidden');
        box.removeAttribute('hidden');
        box.style.display = 'block';
        box.innerHTML = data.conflicts.map(function (c) {
            return '<div class="py-1 border-b border-amber-200/40"><strong>' + escHtml(c.code) + '</strong> (' + escHtml(c.kind) + '): sua rev ' + c.clientRev + ' vs servidor rev ' + c.serverRev + '</div>';
        }).join('');
    }
    document.getElementById('conflictModal').classList.remove('hidden');
}

async function resolveConflict(choice) {
    document.getElementById('conflictModal').classList.add('hidden');
    var pc = VoithDB.state.pendingConflict;
    VoithDB.state.pendingConflict = null;
    if (choice === 'reload') {
        await VoithCloud.loadState(true, false);
    } else if (choice === 'force' && pc && pc.payload) {
        var p = Object.assign({}, pc.payload, { force: true });
        var r = await VoithCloud.callRpc(p, false);
        if (r && r.ok) showToast('Sua versão foi salva com sucesso!', 'ok');
    }
}

async function undoLastAction() {
    if (!VoithDB.state.undoStack.length) return;
    var snap = VoithDB.state.undoStack.pop();
    VoithDB.state.instruments = snap.instruments;
    VoithDB.state.history = snap.history;
    VoithDB.state.lost = snap.lost;
    renderAllViews();
    await VoithCloud.saveFull([{ module: 'Sistema', action: 'Desfazer', target: snap.label, field: 'Undo', before: '-', after: 'Restaurado', details: 'Desfez: ' + snap.label }], true);
    showToast('Desfeito: ' + snap.label, 'ok');
}

// ===================== IMPORTAÇÃO EXCEL / CSV COM PRÉVIA =====================
function openPasteImportModal() {
    VoithDB.state.pendingImportRows = null;
    document.getElementById('importPasteArea').value = '';
    document.getElementById('importDiffBox').classList.add('hidden');
    document.getElementById('btnConfirmImport').disabled = true;
    document.getElementById('importModal').classList.remove('hidden');
}
function closeImportModal() { document.getElementById('importModal').classList.add('hidden'); }

function parseDelimitedRows(text) {
    var lines = String(text || '').split(/\r?\n/).filter(function (l) { return l.trim(); });
    var out = [];
    lines.forEach(function (line, idx) {
        var sep = line.indexOf('\t') !== -1 ? '\t' : ';';
        var cols = line.split(sep).map(function (c) { return c.replace(/^"|"$/g, '').trim(); });
        if (idx === 0 && /codigo|code|identific/i.test(cols[0])) return;
        if (!cols[0]) return;
        out.push({
            code: cols[0].toUpperCase(),
            desc: cols[1] || 'Instrumento',
            proxCal: cols[2] || '',
            status: cols[3] || 'AUTO',
            setor: cols[4] || 'Voith Turbo (Industrial)',
            local: cols[5] || '',
            resp: cols[6] || ''
        });
    });
    return out;
}

function analyzePastePreview() {
    var rows = parseDelimitedRows(document.getElementById('importPasteArea').value);
    VoithDB.state.pendingImportRows = rows;
    if (!rows.length) {
        document.getElementById('importDiffBox').classList.add('hidden');
        document.getElementById('btnConfirmImport').disabled = true;
        return;
    }
    var curMap = new Set(VoithDB.state.instruments.map(function (x) { return String(x.code || '').toUpperCase(); }));
    var newMap = new Set(rows.map(function (x) { return x.code; }));
    var newCnt = 0, updCnt = 0, missCnt = 0;
    rows.forEach(function (r) { if (curMap.has(r.code)) updCnt++; else newCnt++; });
    curMap.forEach(function (c) { if (!newMap.has(c)) missCnt++; });

    document.getElementById('diffNewCount').textContent = newCnt;
    document.getElementById('diffUpdCount').textContent = updCnt;
    document.getElementById('diffMissingCount').textContent = missCnt;
    document.getElementById('importDiffBox').classList.remove('hidden');
    document.getElementById('btnConfirmImport').disabled = false;
}

function handleImportFileSelect(ev) {
    var file = ev.target && ev.target.files && ev.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (e) {
        openPasteImportModal();
        document.getElementById('importPasteArea').value = e.target.result;
        analyzePastePreview();
    };
    reader.readAsText(file);
    ev.target.value = '';
}

async function confirmPendingImport() {
    var rows = VoithDB.state.pendingImportRows || [];
    if (!rows.length) return;
    var replaceAll = document.getElementById('importReplaceAllChk').checked;
    VoithDB.pushUndo('Importação Planilha');
    if (replaceAll) VoithDB.state.instruments = [];

    var byCode = {};
    VoithDB.state.instruments.forEach(function (x) { byCode[String(x.code || '').toUpperCase()] = x; });
    rows.forEach(function (r, idx) {
        var ex = byCode[r.code];
        if (ex) {
            if (r.desc) ex.desc = r.desc;
            if (r.proxCal) ex.proxCal = r.proxCal;
            if (r.status) ex.status = r.status;
            if (r.setor) ex.setor = r.setor;
            if (r.local) ex.local = r.local;
            if (r.resp) ex.resp = r.resp;
        } else {
            VoithDB.state.instruments.push({
                id: Date.now() + idx, code: r.code, desc: r.desc, cc: '', setor: r.setor,
                local: r.local, resp: r.resp, min: '', max: '', proxCal: r.proxCal,
                status: r.status, obs: '', custodyHolder: '', custodyReturnTo: '',
                custodyDate: '', custodyReason: '', cycleMonths: 12, rev: 1
            });
        }
    });
    closeImportModal();
    renderAllViews();
    await VoithCloud.saveFull([{ module: 'Importação', action: 'Planilha', target: rows.length + ' linhas', field: 'Base', before: '-', after: VoithDB.state.instruments.length + ' itens', details: 'Importou planilha' }], true);
    showToast('Importação concluída (' + rows.length + ' linhas)!', 'ok');
}

// ===================== LACUNAS SEM LOCAL & PREENCHIMENTO RÁPIDO =====================
function openUnmappedModal() {
    var unmapped = VoithDB.state.instruments.filter(function (i) { return !String(i.local || '').trim(); });
    document.getElementById('unmappedModalSub').textContent = unmapped.length + ' instrumento(s) sem armário/bancada';
    var bySec = {};
    unmapped.forEach(function (i) {
        var s = i.setor || 'Sem Setor';
        bySec[s] = (bySec[s] || 0) + 1;
    });
    var listEl = document.getElementById('unmappedBreakdownList');
    listEl.innerHTML = Object.entries(bySec).sort(function (a, b) { return b[1] - a[1]; }).map(function (e) {
        return '<button type="button" onclick="closeUnmappedModal(); jumpToInventoryFilter({setor:' + JSON.stringify(e[0]).replace(/"/g, '&quot;') + ',local:\'__NONE__\'})" class="w-full p-3 rounded-xl bg-[#F7F9FC] dark:bg-[#0D1D34] border border-[#DCE4EE] dark:border-[#172E4E] hover:border-[#004C97] flex items-center justify-between text-xs cursor-pointer"><span class="font-bold">' + escHtml(e[0]) + '</span><span class="font-mono font-extrabold text-orange-600">' + e[1] + ' s/ local</span></button>';
    }).join('') || '<div class="text-xs text-emerald-600 font-bold text-center py-6">100% da frota possui localização cadastrada!</div>';
    document.getElementById('unmappedModal').classList.remove('hidden');
}
function closeUnmappedModal() { document.getElementById('unmappedModal').classList.add('hidden'); }

function openRapidLocalModal() {
    if (!VoithDB.isEditor()) { openLoginModal(); return; }
    _rapidQueue = VoithDB.state.instruments.filter(function (i) { return !String(i.local || '').trim(); });
    _rapidIndex = 0;
    if (!_rapidQueue.length) { showToast('Todos os instrumentos já possuem localização!', 'ok'); return; }
    renderRapidLocalStep();
    document.getElementById('rapidLocalModal').classList.remove('hidden');
}
function closeRapidLocalModal() { document.getElementById('rapidLocalModal').classList.add('hidden'); }

function renderRapidLocalStep() {
    if (_rapidIndex >= _rapidQueue.length) { closeRapidLocalModal(); showToast('Preenchimento de locais concluído!', 'ok'); return; }
    var it = _rapidQueue[_rapidIndex];
    document.getElementById('rlProgressLbl').textContent = (_rapidQueue.length - _rapidIndex) + ' restantes';
    document.getElementById('rlCode').textContent = it.code;
    document.getElementById('rlSetor').textContent = it.setor || '-';
    document.getElementById('rlDesc').textContent = it.desc;
    document.getElementById('rlResp').textContent = 'Resp.: ' + (it.resp || '-');
    var inp = document.getElementById('rlInput');
    inp.value = '';
    setTimeout(function () { inp.focus(); }, 40);

    var freq = {};
    VoithDB.state.instruments.forEach(function (x) { if (x.local) freq[x.local] = (freq[x.local] || 0) + 1; });
    var topLocs = Object.entries(freq).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 8).map(function (e) { return e[0]; });
    document.getElementById('rlQuickChips').innerHTML = topLocs.map(function (l) {
        return '<button type="button" onclick="document.getElementById(\'rlInput\').value=' + JSON.stringify(l).replace(/"/g, '&quot;') + '; saveRapidLocal()" class="px-2.5 py-1 rounded-lg bg-[#EAF0F6] dark:bg-[#132846] hover:bg-[#004C97] hover:text-white text-[11px] font-bold cursor-pointer transition">' + escHtml(l) + '</button>';
    }).join('');
}

async function saveRapidLocal() {
    var it = _rapidQueue[_rapidIndex];
    var loc = VoithDB.normalizeControlled(document.getElementById('rlInput').value, 'local');
    if (!it || !loc) return;
    it._baseRev = it.rev || 1;
    it._baseSnapshot = VoithDB.makeItemSnapshot(it);
    it.local = loc;
    _rapidIndex++;
    renderAllViews();
    renderRapidLocalStep();
    await VoithCloud.saveDelta({ instUpsert: [it] }, [{ module: 'Localização', action: 'Mapeamento Rápido', target: it.code, field: 'Local', before: '-', after: loc, details: 'Definiu local ' + loc }]);
}

function skipRapidLocal() { _rapidIndex++; renderRapidLocalStep(); }

// ===================== PAINEL ADMINISTRATIVO (USUÁRIOS, LISTAS, RISCO, OTA) =====================
function openAdminUsersModal() {
    if (!VoithDB.isAdmin()) { showToast('Acesso restrito ao Administrador.', 'warn'); return; }
    setAdminTab('users');
    document.getElementById('adminUsersModal').classList.remove('hidden');
}
function closeAdminUsersModal() { document.getElementById('adminUsersModal').classList.add('hidden'); }

function setAdminTab(tab) {
    ['users', 'lists', 'risk', 'ota'].forEach(function (k) {
        var btn = document.getElementById('admTab' + k.charAt(0).toUpperCase() + k.slice(1));
        var pane = document.getElementById('admPane' + k.charAt(0).toUpperCase() + k.slice(1));
        if (pane) pane.classList.toggle('hidden', k !== tab);
        if (btn) {
            btn.className = k === tab
                ? 'px-3.5 py-2 rounded-t-lg font-extrabold bg-white dark:bg-[#091527] text-[#004C97] dark:text-[#00A8E8] border-t border-l border-r border-[#DCE4EE] dark:border-[#172E4E] cursor-pointer'
                : 'px-3.5 py-2 rounded-t-lg font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer';
        }
    });
    if (tab === 'users') loadAdminUsersList();
    else if (tab === 'lists') populateControlledListsForm();
    else if (tab === 'risk') loadAdminAnalytics();
    else if (tab === 'ota') loadAdminOtaTelemetry();
}

async function loadAdminUsersList() {
    var tb = document.getElementById('auTbody');
    if (tb) tb.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-slate-400">Carregando usuários...</td></tr>';
    var r = await VoithCloud.callRpc({ action: 'list_users' }, false);
    if (!r || !r.ok) { if (tb) tb.innerHTML = '<tr><td colspan="4" class="p-4 text-rose-600">' + escHtml((r && r.error) || 'Erro') + '</td></tr>'; return; }
    tb.innerHTML = (r.users || []).map(function (u) {
        var roleCls = u.role === 'ADMIN' ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300' : 'bg-[#EAF0F6] dark:bg-[#132846] text-[#004C97] dark:text-[#00A8E8]';
        return '<tr><td class="p-3 font-mono font-bold text-[#004C97] dark:text-[#00A8E8]">' + escHtml(u.username) + '</td><td class="p-3 font-semibold">' + escHtml(u.displayName) + '</td><td class="p-3"><span class="px-2 py-0.5 rounded font-extrabold text-[10px] ' + roleCls + '">' + escHtml(u.role) + '</span></td><td class="p-3 text-center">' +
            (u.username !== 'pablo'
                ? '<button type="button" onclick="openResetPassModal(' + JSON.stringify(u.username).replace(/"/g, '&quot;') + ')" class="px-2 py-1 rounded bg-amber-100 text-amber-800 font-bold mr-1 cursor-pointer">Senha</button><button type="button" onclick="deleteAdminUser(' + JSON.stringify(u.username).replace(/"/g, '&quot;') + ')" class="px-2 py-1 rounded bg-rose-100 text-rose-700 font-bold cursor-pointer">Excluir</button>'
                : '<span class="text-slate-400">Protegido</span>') +
        '</td></tr>';
    }).join('');
}

async function submitCreateUser(ev) {
    if (ev) ev.preventDefault();
    var err = document.getElementById('auErr');
    if (err) err.classList.add('hidden');
    var r = await VoithCloud.callRpc({
        action: 'create_user',
        newUser: {
            username: document.getElementById('auLogin').value.trim(),
            displayName: document.getElementById('auName').value.trim(),
            password: document.getElementById('auPass').value.trim()
        }
    }, false);
    if (r && r.ok) {
        ['auLogin', 'auName', 'auPass'].forEach(function (k) { document.getElementById(k).value = ''; });
        showToast('Usuário criado!', 'ok');
        loadAdminUsersList();
    } else if (err) {
        err.textContent = (r && r.error) || 'Erro ao criar login.';
        err.classList.remove('hidden');
    }
}

function openResetPassModal(username) {
    document.getElementById('rpUser').value = username;
    document.getElementById('rpLabel').textContent = username;
    document.getElementById('rpPass').value = '';
    document.getElementById('rpErr').classList.add('hidden');
    document.getElementById('resetPassModal').classList.remove('hidden');
}
function closeResetPassModal() { document.getElementById('resetPassModal').classList.add('hidden'); }

async function submitResetUserPass(ev) {
    if (ev) ev.preventDefault();
    var r = await VoithCloud.callRpc({
        action: 'reset_password',
        targetUsername: document.getElementById('rpUser').value,
        newPassword: document.getElementById('rpPass').value
    }, false);
    if (r && r.ok) { closeResetPassModal(); showToast('Senha redefinida!', 'ok'); }
    else {
        var e = document.getElementById('rpErr');
        e.textContent = (r && r.error) || 'Erro.';
        e.classList.remove('hidden');
    }
}

function deleteAdminUser(username) {
    openConfirmModal('Excluir Usuário', 'Deseja excluir o acesso de "' + username + '"?', async function () {
        var r = await VoithCloud.callRpc({ action: 'delete_user', targetUsername: username }, false);
        if (r && r.ok) { showToast('Usuário excluído.', 'ok'); loadAdminUsersList(); }
    });
}

function populateControlledListsForm() {
    var cl = VoithDB.state.controlledLists || { locals: [], sectors: [], aliases: {} };
    document.getElementById('clLocalsArea').value = (cl.locals || []).join('\n');
    document.getElementById('clSectorsArea').value = (cl.sectors || []).join('\n');
    document.getElementById('clAliasesArea').value = Object.entries(cl.aliases || {}).map(function (e) { return e[0] + ' = ' + e[1]; }).join('\n');
}

function autoSeedControlledLists() {
    var locs = Array.from(new Set(VoithDB.state.instruments.map(function (i) { return String(i.local || '').trim(); }).filter(Boolean))).sort();
    var secs = Array.from(new Set(VoithDB.state.instruments.map(function (i) { return String(i.setor || '').trim(); }).filter(Boolean))).sort();
    document.getElementById('clLocalsArea').value = locs.join('\n');
    document.getElementById('clSectorsArea').value = secs.join('\n');
    showToast('Listas preenchidas a partir da base atual.', 'ok');
}

async function saveControlledListsForm() {
    var locals = document.getElementById('clLocalsArea').value.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
    var sectors = document.getElementById('clSectorsArea').value.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
    var aliases = {};
    document.getElementById('clAliasesArea').value.split(/\r?\n/).forEach(function (line) {
        var idx = line.indexOf('=');
        if (idx > 0) {
            var k = normStr(line.slice(0, idx));
            var v = line.slice(idx + 1).trim();
            if (k && v) aliases[k] = v;
        }
    });
    var cl = { locals: locals, sectors: sectors, aliases: aliases };
    VoithDB.state.controlledLists = cl;
    var r = await VoithCloud.callRpc({ action: 'save_lists', controlledLists: cl }, false);
    if (r && r.ok) { populateGlobalDatalistsAndFilters(); showToast('Listas oficiais salvas!', 'ok'); }
    else showToast((r && r.error) || 'Erro ao salvar listas.', 'err');
}

async function runBaseHygiene() {
    VoithDB.pushUndo('Higienização Base');
    var changed = [];
    VoithDB.state.instruments.forEach(function (it) {
        var nl = VoithDB.normalizeControlled(it.local, 'local');
        var ns = VoithDB.normalizeControlled(it.setor, 'sector');
        if (nl !== (it.local || '') || ns !== (it.setor || '')) {
            it._baseRev = it.rev || 1;
            it._baseSnapshot = VoithDB.makeItemSnapshot(it);
            it.local = nl;
            it.setor = ns;
            changed.push(it);
        }
    });
    if (!changed.length) { showToast('Base já está higienizada!', 'ok'); return; }
    renderAllViews();
    await VoithCloud.saveDelta({ instUpsert: changed }, [{ module: 'Admin', action: 'Higienização', target: changed.length + ' itens', field: 'Local/Setor', before: '-', after: 'Padronizado', details: 'Padronizou ' + changed.length + ' itens' }]);
    showToast(changed.length + ' instrumento(s) padronizado(s)!', 'ok');
}

async function loadAdminAnalytics(fromClick) {
    var el = document.getElementById('admRiskContent');
    if (!el) return;
    el.innerHTML = '<div class="p-4 text-xs text-slate-400 font-semibold">Consultando métricas e SLA no PostgreSQL...</div>';
    var r = await VoithCloud.callRpc({ action: 'get_metrology_analytics' }, false);
    if (!r || !r.ok) {
        el.innerHTML = '<div class="p-3 rounded-lg bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300 text-xs font-bold">' + escHtml((r && r.error) || 'Erro ao consultar servidor.') + '</div>';
        return;
    }
    var rec = r.labRecurrence || [];
    var nowTime = new Date().toLocaleTimeString('pt-BR');
    var ref = VoithDB.getRefDate();
    var criticalInst = VoithDB.state.instruments.filter(function (i) { return getEffectiveStatus(i, ref) === 'VENCIDA'; }).slice(0, 10);

    var tableBodyHtml = rec.length
        ? rec.map(function (x) {
            return '<tr><td class="p-2.5 font-mono font-bold text-[#004C97] dark:text-[#00A8E8]">' + escHtml(x.code) + '</td><td class="p-2.5">' + escHtml(x.desc) + '</td><td class="p-2.5 font-mono font-bold">' + x.labCount + '</td><td class="p-2.5 font-mono">' + x.openCount + '</td><td class="p-2.5">' + escHtml(x.lastLab || '-') + '</td></tr>';
        }).join('')
        : '<tr><td colspan="5" class="p-4 text-center text-slate-400">Nenhum envio de calibração externa registrado no histórico de laboratório ainda.</td></tr>';

    el.innerHTML = '<div class="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold">✓ Sincronizado com o servidor às ' + nowTime + '</div>' +
        '<div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">' +
            '<div class="p-3 rounded-xl bg-[#F7F9FC] dark:bg-[#061121] border border-[#DCE4EE] dark:border-[#172E4E]"><div class="text-[10px] font-bold uppercase text-slate-400">Certificados RBC</div><div class="font-display text-xl font-bold">' + (r.totalCertificates || 0) + '</div></div>' +
            '<div class="p-3 rounded-xl bg-[#F7F9FC] dark:bg-[#061121] border border-[#DCE4EE] dark:border-[#172E4E]"><div class="text-[10px] font-bold uppercase text-slate-400">Comprovantes SHA-256</div><div class="font-display text-xl font-bold">' + (r.totalReceipts || 0) + '</div></div>' +
            '<div class="p-3 rounded-xl bg-[#F7F9FC] dark:bg-[#061121] border border-[#DCE4EE] dark:border-[#172E4E]"><div class="text-[10px] font-bold uppercase text-slate-400">Eventos Auditoria</div><div class="font-display text-xl font-bold">' + (r.totalAuditEvents || 0) + '</div></div>' +
            '<div class="p-3 rounded-xl bg-[#F7F9FC] dark:bg-[#061121] border border-[#DCE4EE] dark:border-[#172E4E]"><div class="text-[10px] font-bold uppercase text-slate-400">Outbox Idempotente</div><div class="font-display text-xl font-bold">' + (r.idempotentMutations || 0) + '</div></div>' +
        '</div>' +
        '<div class="space-y-1.5"><div class="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Recorrência de Envios a Laboratório Externo</div>' +
        '<div class="overflow-x-auto rounded-lg border border-[#DCE4EE] dark:border-[#172E4E]"><table class="w-full text-left border-collapse text-xs"><thead class="bg-[#F7F9FC] dark:bg-[#0D1D34] text-[10px] font-bold uppercase text-slate-500"><tr><th class="p-2.5">Código</th><th class="p-2.5">Instrumento</th><th class="p-2.5">Envios Lab</th><th class="p-2.5">Em Aberto</th><th class="p-2.5">Último Lab</th></tr></thead><tbody class="divide-y divide-[#DCE4EE] dark:divide-[#172E4E]">' + tableBodyHtml + '</tbody></table></div></div>' +
        (criticalInst.length ? '<div class="space-y-1.5"><div class="text-[10px] font-extrabold uppercase tracking-wider text-rose-600 dark:text-rose-400">Top 10 Instrumentos Críticos (Vencidos)</div><div class="flex flex-wrap gap-1.5">' + criticalInst.map(function (c) { return '<button type="button" onclick="closeAdminUsersModal(); openInspectorModal(' + c.id + ')" class="px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 font-mono text-[11px] font-bold cursor-pointer">' + escHtml(c.code) + '</button>'; }).join('') + '</div></div>' : '');

    if (fromClick) showToast('Risco & SLA Lab atualizado do PostgreSQL!', 'ok');
}

async function loadAdminOtaTelemetry(fromClick) {
    var el = document.getElementById('admOtaContent');
    if (!el) return;
    el.innerHTML = '<div class="p-4 text-xs text-slate-400 font-semibold">Consultando Canal OTA, Telemetria e Eventos ERP...</div>';
    var res = await Promise.all([
        VoithCloud.callPublicRpc('get_release_channel', { p_channel: 'stable' }),
        VoithCloud.callRpc({ action: 'list_telemetry', limit: 30 }, false),
        VoithCloud.callRpc({ action: 'list_domain_events', limit: 20 }, false)
    ]);
    var ota = res[0], tel = res[1], dom = res[2];
    var latest = ota && ota.ok && ota.latest;
    var srvTel = (tel && tel.ok && Array.isArray(tel.telemetry) && tel.telemetry.length > 0) ? tel.telemetry : null;
    var rows = srvTel || VoithDB.state.telemetry.slice(0, 25);
    var telOrigin = srvTel ? 'Telemetria do Servidor (PostgreSQL)' : 'Telemetria Local desta Sessão (' + rows.length + ' eventos)';
    var domEvents = (dom && dom.ok && Array.isArray(dom.events)) ? dom.events : [];
    var nowTime = new Date().toLocaleTimeString('pt-BR');

    el.innerHTML = '<div class="flex items-center justify-between gap-2 text-[11px]">' +
            '<span class="text-emerald-600 dark:text-emerald-400 font-bold">✓ Consulta concluída às ' + nowTime + '</span>' +
            '<button type="button" onclick="sendTestTelemetryPing()" class="px-2.5 py-1 rounded-lg bg-[#EAF0F6] dark:bg-[#132846] hover:bg-[#004C97] hover:text-white text-[#004C97] dark:text-[#00A8E8] font-bold cursor-pointer">Gravar Ping no Servidor</button>' +
        '</div>' +
        (latest ? '<div class="p-3.5 rounded-xl bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-400/30 space-y-1"><div class="flex items-center justify-between gap-2"><span class="font-extrabold text-[#004C97] dark:text-[#00A8E8]">Canal OTA (' + escHtml(latest.channel) + ') — Última Release: v' + escHtml(latest.version) + '</span><span class="font-mono text-[10px] px-2 py-0.5 rounded bg-white dark:bg-[#091527] font-bold">App Atual: v16.12</span></div><pre class="whitespace-pre-wrap font-mono text-[11px] text-slate-600 dark:text-slate-300">' + escHtml(latest.changelog) + '</pre></div>' : '') +
        '<div class="space-y-1.5"><div class="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">' + telOrigin + '</div>' +
        '<div class="overflow-x-auto rounded-lg border border-[#DCE4EE] dark:border-[#172E4E]"><table class="w-full text-left border-collapse text-[11px]"><thead class="bg-[#F7F9FC] dark:bg-[#0D1D34] text-[10px] font-bold uppercase text-slate-500"><tr><th class="p-2">Hora</th><th class="p-2">Evento</th><th class="p-2">ms</th><th class="p-2">Plataforma</th><th class="p-2">Detalhe</th></tr></thead><tbody class="divide-y divide-[#DCE4EE] dark:divide-[#172E4E]">' +
        (rows.map(function (t) { return '<tr><td class="p-2 font-mono">' + new Date(t.ts).toLocaleTimeString('pt-BR') + '</td><td class="p-2 font-bold">' + escHtml(t.type) + '</td><td class="p-2 font-mono">' + (t.latencyMs || 0) + '</td><td class="p-2">' + escHtml(t.platform || 'WEB') + '</td><td class="p-2 text-slate-500">' + escHtml(t.detail) + '</td></tr>'; }).join('') || '<tr><td colspan="5" class="p-4 text-center text-slate-400">Sem eventos de telemetria ainda.</td></tr>') +
        '</tbody></table></div></div>' +
        '<div class="space-y-1.5"><div class="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Eventos de Domínio ERP/SAP (' + domEvents.length + ')</div>' +
        (domEvents.length ? '<div class="overflow-x-auto rounded-lg border border-[#DCE4EE] dark:border-[#172E4E]"><table class="w-full text-left border-collapse text-[11px]"><thead class="bg-[#F7F9FC] dark:bg-[#0D1D34] text-[10px] font-bold uppercase text-slate-500"><tr><th class="p-2">Evento</th><th class="p-2">Ativo</th><th class="p-2">Usuário</th><th class="p-2">Data</th></tr></thead><tbody class="divide-y divide-[#DCE4EE] dark:divide-[#172E4E]">' + domEvents.map(function (d) { return '<tr><td class="p-2 font-bold">' + escHtml(d.eventName) + '</td><td class="p-2 font-mono">' + escHtml(d.aggregateCode || '-') + '</td><td class="p-2">' + escHtml(d.actorUser || '-') + '</td><td class="p-2 font-mono">' + new Date(d.createdAt).toLocaleString('pt-BR') + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="text-[11px] text-slate-400">Nenhum evento ERP emitido ainda (use "Gravar Ping no Servidor" acima para testar).</div>') + '</div>';

    if (fromClick) showToast('Canal OTA e Telemetria atualizados!', 'ok');
}

async function sendTestTelemetryPing() {
    var t0 = performance.now();
    await VoithCloud.callRpc({
        action: 'log_telemetry',
        eventType: 'HEALTH_PING',
        detail: 'Teste manual de telemetria via Painel Admin v16.12',
        latencyMs: Math.round(performance.now() - t0),
        appVersion: '16.12.0',
        username: (VoithDB.state.session && VoithDB.state.session.username) || 'pablo'
    }, false);
    await VoithCloud.callRpc({
        action: 'emit_domain_event',
        eventName: 'METROLOGY_HEALTH_CHECK',
        aggregateCode: 'VOITH-OS',
        eventPayload: { version: '16.12.0', instruments: VoithDB.state.instruments.length }
    }, false);
    showToast('Ping gravado no PostgreSQL!', 'ok');
    loadAdminOtaTelemetry(false);
}

async function downloadSignedServerSnapshot() {
    if (!VoithDB.isAdmin()) { showToast('Exclusivo para Administrador.', 'warn'); return; }
    var r = await VoithCloud.callRpc({ action: 'export_full_snapshot' }, false);
    if (!r || !r.ok) { showToast((r && r.error) || 'Erro ao gerar snapshot.', 'err'); return; }
    var blob = new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'voith-snapshot-sha256-' + formatDateISO(new Date()) + '.json';
    a.click();
    showToast('Snapshot SHA-256 baixado! Hash: ' + String(r.snapshotSha256 || '').slice(0, 12), 'ok');
}

// ===================== COFRE OCULTO DE AUDITORIA (5 CLIQUES NO LOGO VOITH) =====================
function onSecretAuditTap(ev) {
    if (ev) ev.stopPropagation();
    _secretAuditTaps++;
    clearTimeout(_secretAuditTimer);
    _secretAuditTimer = setTimeout(function () { _secretAuditTaps = 0; }, 1600);
    if (_secretAuditTaps >= 5) {
        _secretAuditTaps = 0;
        if (!VoithDB.isAdmin()) { showToast('Trilha de Auditoria restrita ao Administrador.', 'warn'); return; }
        document.getElementById('auditVaultModal').classList.remove('hidden');
        loadAuditVault(true);
    }
}

function closeAuditVaultModal() { document.getElementById('auditVaultModal').classList.add('hidden'); }

async function loadAuditVault() {
    document.getElementById('auditVaultMeta').textContent = 'Consultando PostgreSQL Append-Only...';
    var r = await VoithCloud.callRpc({ action: 'list_audit', limit: 250 }, false);
    if (r && r.ok) {
        VoithDB.state.auditLogs = r.events || [];
        document.getElementById('auditVaultMeta').textContent = VoithDB.state.auditLogs.length + ' evento(s) imutável(is) carregado(s)';
        renderAuditVaultTable();
    } else {
        document.getElementById('auditVaultMeta').textContent = (r && r.error) || 'Erro ao carregar auditoria.';
    }
}

function renderAuditVaultTable() {
    var q = normStr(document.getElementById('auditSearchInp') ? document.getElementById('auditSearchInp').value : '');
    var rows = (VoithDB.state.auditLogs || []).filter(function (ev) {
        if (!q) return true;
        return normStr([ev.displayName, ev.username, ev.module, ev.action, ev.target, ev.details, ev.before, ev.after].join(' ')).indexOf(q) !== -1;
    });
    document.getElementById('auditVaultTbody').innerHTML = rows.map(function (ev) {
        return '<tr><td class="p-3 font-mono whitespace-nowrap">' + new Date(ev.timestamp).toLocaleString('pt-BR') + '</td>' +
            '<td class="p-3 font-bold">' + escHtml(ev.displayName || ev.username) + ' <span class="text-[10px] text-slate-400">(' + escHtml(ev.clientPlatform || 'WEB') + ')</span></td>' +
            '<td class="p-3">' + escHtml(ev.module) + ' / <strong>' + escHtml(ev.action) + '</strong></td>' +
            '<td class="p-3 font-mono font-bold text-[#004C97] dark:text-[#00A8E8]">' + escHtml(ev.target) + '</td>' +
            '<td class="p-3 text-slate-500">' + escHtml(ev.before) + ' → ' + escHtml(ev.after) + '</td>' +
            '<td class="p-3 text-slate-500">' + escHtml(ev.details) + '</td></tr>';
    }).join('') || '<tr><td colspan="6" class="p-6 text-center text-slate-400">Nenhum evento encontrado.</td></tr>';
}

// ===================== SPOTLIGHT COMMAND PALETTE (CTRL+K) =====================
function openCommandPalette() {
    var m = document.getElementById('cmdPaletteModal');
    if (!m) return;
    m.classList.remove('hidden');
    var inp = document.getElementById('cmdSearchInput');
    if (inp) { inp.value = ''; setTimeout(function () { inp.focus(); }, 40); }
    _cmdSelectedIdx = 0;
    renderCommandPalette();
}

function closeCommandPalette() {
    var m = document.getElementById('cmdPaletteModal');
    if (m) m.classList.add('hidden');
}

function renderCommandPalette() {
    var q = normStr(document.getElementById('cmdSearchInput') ? document.getElementById('cmdSearchInput').value : '');
    var ref = VoithDB.getRefDate();
    var items = [];

    // 1. Instrumentos (top 4 quando vazio, top 10 quando digitando)
    var maxInst = q ? 10 : 4;
    VoithDB.state.instruments.forEach(function (it) {
        if (items.length >= maxInst) return;
        var hay = normStr([it.code, it.desc, it.local, it.setor, it.resp, it.custodyHolder].join(' '));
        if (!q || hay.indexOf(q) !== -1) {
            var eff = getEffectiveStatus(it, ref);
            items.push({
                tag: 'INSTRUMENTOS',
                icon: 'i-gauge-high',
                title: it.code + ' — ' + it.desc,
                sub: eff + ' • ' + (it.local || 'Sem local'),
                run: function () { openInspectorModal(it.id); }
            });
        }
    });

    // 2. Armários & Bancadas (top 4 mais frequentes)
    var locFreq = {};
    VoithDB.state.instruments.forEach(function (it) {
        var l = String(it.local || '').trim();
        if (l) locFreq[l] = (locFreq[l] || 0) + 1;
    });
    var topLocs = Object.entries(locFreq).sort(function (a, b) { return b[1] - a[1]; }).map(function (e) { return e[0]; });
    var addedLocs = 0;
    topLocs.forEach(function (loc) {
        if (addedLocs >= 4) return;
        if (!q || normStr(loc).indexOf(q) !== -1) {
            addedLocs++;
            items.push({
                tag: 'ARMÁRIOS & BANCADAS',
                icon: 'i-location-dot',
                title: loc,
                sub: 'Filtrar inventário por ' + loc,
                run: function () { jumpToInventoryFilter({ local: loc }); }
            });
        }
    });

    // 3. Ações rápidas
    var actions = [
        { tag: 'AÇÕES', icon: 'i-plus', title: 'Cadastrar Novo Instrumento', sub: 'Abrir ficha em branco', run: function () { openInspectorModal(-1); } },
        { tag: 'AÇÕES', icon: 'i-print', title: 'Imprimir Folha Porta de Armário', sub: 'Gerar folha pronta para plastificar', run: function () { openPrintModal('CABINET'); } },
        { tag: 'AÇÕES', icon: 'i-handshake', title: 'Abrir Quadro Público de Cautelas', sub: 'Ver instrumentos em posse no campo', run: function () { navigateTo('custody'); } }
    ];
    actions.forEach(function (ac) {
        if (!q || normStr(ac.title + ' ' + ac.sub).indexOf(q) !== -1) items.push(ac);
    });

    _cmdItems = items;
    if (_cmdSelectedIdx >= items.length) _cmdSelectedIdx = 0;
    var listEl = document.getElementById('cmdResultsList');
    if (listEl) {
        listEl.innerHTML = items.map(function (it, idx) {
            var active = idx === _cmdSelectedIdx;
            return '<button type="button" onclick="executeCmdItem(' + idx + ')" class="w-full text-left px-3.5 py-2.5 rounded-xl flex items-center justify-between gap-3 cursor-pointer ' + (active ? 'bg-[#004C97] text-white shadow' : 'hover:bg-[#F3F6FA] dark:hover:bg-[#132846]') + '">' +
                '<div class="flex items-center gap-3 min-w-0">' +
                    '<svg class="vp-ico text-base shrink-0 ' + (active ? 'text-sky-200' : 'text-[#004C97] dark:text-[#00A8E8]') + '" aria-hidden="true"><use href="#' + it.icon + '"/></svg>' +
                    '<div class="min-w-0"><div class="text-xs font-bold truncate">' + escHtml(it.title) + '</div><div class="text-[11px] truncate ' + (active ? 'text-sky-200' : 'text-slate-400') + '">' + escHtml(it.sub) + '</div></div>' +
                '</div>' +
                '<span class="text-[10px] font-extrabold uppercase tracking-wider shrink-0 ' + (active ? 'text-sky-100' : 'text-slate-400') + '">' + escHtml(it.tag) + '</span></button>';
        }).join('') || '<div class="p-6 text-center text-xs text-slate-400">Nenhum resultado para "' + escHtml(q) + '".</div>';
    }
}

function executeCmdItem(idx) {
    var it = _cmdItems[idx];
    closeCommandPalette();
    if (it && typeof it.run === 'function') it.run();
}

function handleCmdKeydown(ev) {
    if (ev.key === 'Escape') { closeCommandPalette(); return; }
    if (ev.key === 'ArrowDown') { ev.preventDefault(); _cmdSelectedIdx = Math.min(_cmdItems.length - 1, _cmdSelectedIdx + 1); renderCommandPalette(); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); _cmdSelectedIdx = Math.max(0, _cmdSelectedIdx - 1); renderCommandPalette(); }
    else if (ev.key === 'Enter') { ev.preventDefault(); executeCmdItem(_cmdSelectedIdx); }
}

// ===================== MODAL DE CONFIRMAÇÃO GENÉRICA =====================
function openConfirmModal(title, msg, onConfirm) {
    _confirmCallback = onConfirm;
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMessage').textContent = msg;
    var btn = document.getElementById('confirmProceedBtn');
    btn.onclick = function () {
        closeConfirmModal();
        if (typeof _confirmCallback === 'function') _confirmCallback();
    };
    document.getElementById('confirmModal').classList.remove('hidden');
}

function closeConfirmModal() { document.getElementById('confirmModal').classList.add('hidden'); }

// ===================== INICIALIZAÇÃO GLOBAL =====================
function bootApp() {
    try {
        if (localStorage.getItem(VoithDB.KEYS.SIDEBAR_KEY) === '1') document.body.classList.add('ck-sb-collapsed');
        if (localStorage.getItem(VoithDB.KEYS.FACTORY_KEY) === '1') document.body.classList.add('vp-factory-mode');
    } catch (e) {}

    syncThemeIcons();
    applyAuthBodyClasses();
    renderAllViews();

    document.addEventListener('click', function (e) {
        if (!e.target.closest('#systemMenuWrap')) closeSystemMenu();
    });

    window.addEventListener('keydown', function (e) {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            openCommandPalette();
            return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && VoithDB.isEditor()) {
            var tag = (e.target && e.target.tagName) || '';
            if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
                e.preventDefault();
                undoLastAction();
            }
            return;
        }
        if (e.key === 'Escape') {
            closeCommandPalette();
            closeSystemMenu();
            closeInspectorModal();
            closeCustodyModal();
            closeExternalModal();
            closeReturnLabModal();
            closeBatchReturnLabModal();
            closeLostModal();
            closeImportModal();
            closePrintModal();
            closeBackupModal();
            closeCloudModal();
            closeLoginModal();
            closeChangePassModal();
            closeAdminUsersModal();
            closeResetPassModal();
            closeUnmappedModal();
            closeRapidLocalModal();
            closeAuditVaultModal();
            closeReceiptShareModal();
            closeConfirmModal();
            closeWhatsNewModal();
        }
    });

    var _rszT = null; window.addEventListener('resize', function () { clearTimeout(_rszT); _rszT = setTimeout(function () { if (VoithDB.state.view === 'inventory') renderInventoryView(); }, 180); });
    setTimeout(function () { checkOtaUpdatesOnBoot(); }, 1200);
    VoithCloud.loadState(false, false).then(function () {
        checkOtaUpdatesOnBoot();
        sendBootTelemetryOnce();
    });

    setInterval(function () {
        if (!document.hidden && !VoithDB.state.pendingConflict) {
            VoithCloud.loadState(false, true);
        }
    }, 25000);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootApp);
else bootApp();

// ===================== OTA AUTOMÁTICO & MODAL "O QUE MUDOU" (v16.12) =====================
var _lastOtaVersionShown = '';
var _otaCheckDone = false;

function compareVersions(a, b) {
    var pa = String(a || '0').replace(/^v/i, '').split('.').map(function (n) { return parseInt(n, 10) || 0; });
    var pb = String(b || '0').replace(/^v/i, '').split('.').map(function (n) { return parseInt(n, 10) || 0; });
    for (var i = 0; i < Math.max(pa.length, pb.length, 3); i++) {
        var na = pa[i] || 0, nb = pb[i] || 0;
        if (na > nb) return 1;
        if (na < nb) return -1;
    }
    return 0;
}

function evaluateReleaseDisplay(latest, curVer) {
    if (!latest || !latest.version) return;
    var lastSeen = '';
    var prevVer = '';
    try {
        lastSeen = localStorage.getItem('voith_last_seen_release_v16') || '';
        prevVer = localStorage.getItem('voith_prev_running_ver_v16') || '';
    } catch (e) {}

    var cmp = compareVersions(latest.version, curVer);
    var justUpdatedToThis = (prevVer && prevVer !== curVer && cmp === 0);

    if (cmp > 0) {
        openWhatsNewModal(latest, true, curVer);
    } else if ((cmp === 0 && lastSeen !== latest.version) || justUpdatedToThis) {
        openWhatsNewModal(latest, false, curVer);
    }

    try { localStorage.setItem('voith_prev_running_ver_v16', curVer); } catch (e) {}
}

async function checkOtaUpdatesOnBoot() {
    if (_otaCheckDone) return;
    var curVer = (window.VOITH_CONFIG && window.VOITH_CONFIG.APP_VERSION) || '16.12.0';

    // 1. Tenta mostrar cache local imediato se houver release salva ainda não vista
    try {
        var cachedRel = JSON.parse(localStorage.getItem('voith_cached_release_v16') || 'null');
        if (cachedRel && cachedRel.version) {
            setTimeout(function () { evaluateReleaseDisplay(cachedRel, curVer); }, 350);
        }
    } catch (e) {}

    // 2. Consulta canal OTA atualizado no servidor
    var ota = await VoithCloud.callPublicRpc('get_release_channel', { p_channel: 'stable' });
    if (!ota || !ota.ok || !ota.latest || !ota.latest.version) return;
    _otaCheckDone = true;
    VoithDB.state.releaseChannel = ota;
    try { localStorage.setItem('voith_cached_release_v16', JSON.stringify(ota.latest)); } catch (e) {}

    setTimeout(function () { evaluateReleaseDisplay(ota.latest, curVer); }, 450);
}

function openWhatsNewModal(releaseObj, needsReload, curVer) {
    var modal = document.getElementById('whatsNewModal');
    if (!modal) return;
    _lastOtaVersionShown = releaseObj.version || '';
    var badge = document.getElementById('wnBadge');
    var title = document.getElementById('wnTitle');
    var meta = document.getElementById('wnMeta');
    var chg = document.getElementById('wnChangelog');
    var reloadBtn = document.getElementById('wnReloadBtn');

    if (badge) badge.textContent = needsReload ? 'Nova Atualização Disponível' : 'Sistema Atualizado Automaticamente';
    if (title) title.textContent = needsReload ? ('Nova Versão v' + releaseObj.version + ' Disponível') : ('Novidades da Versão v' + releaseObj.version);
    if (meta) {
        meta.textContent = needsReload
            ? ('Você está na v' + curVer + '. Clique em "Atualizar Agora" para carregar a v' + releaseObj.version + ' sem precisar reinstalar.')
            : ('Você abriu a versão v' + curVer + '. Veja abaixo o que mudou:');
    }
    if (chg) chg.textContent = releaseObj.changelog || '- Melhorias gerais de desempenho e estabilidade.';
    if (reloadBtn) reloadBtn.classList.toggle('hidden', !needsReload);
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
}

function closeWhatsNewModal() {
    var modal = document.getElementById('whatsNewModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = '';
    }
    if (_lastOtaVersionShown) {
        try { localStorage.setItem('voith_last_seen_release_v16', _lastOtaVersionShown); } catch (e) {}
    }
}

function applyOtaReloadNow() {
    if (_lastOtaVersionShown) {
        try { localStorage.setItem('voith_last_seen_release_v16', _lastOtaVersionShown); } catch (e) {}
    }
    var liveUrl = (window.VOITH_CONFIG && window.VOITH_CONFIG.LIVE_APP_URL) || '';
    if (location.protocol === 'file:' && liveUrl) {
        window.location.href = liveUrl + '?v=' + Date.now();
        return;
    }
    var base = window.location.href.split('?')[0];
    window.location.href = base + '?v=' + Date.now();
}

function sendBootTelemetryOnce() {
    try {
        if (sessionStorage.getItem('voith_boot_ping_sent')) return;
        sessionStorage.setItem('voith_boot_ping_sent', '1');
    } catch (e) {}
    var curVer = (window.VOITH_CONFIG && window.VOITH_CONFIG.APP_VERSION) || '16.12.0';
    var user = (VoithDB.state.session && VoithDB.state.session.username) || 'consulta';
    VoithCloud.callRpc({
        action: 'log_telemetry',
        eventType: 'APP_BOOT',
        detail: 'Acesso ativo em ' + (window.VOITH_PLATFORM || 'WEB') + ' (v' + curVer + ')',
        latencyMs: 0,
        appVersion: curVer,
        username: user
    }, false);
}

function togglePublishReleaseForm() {
    var f = document.getElementById('admPublishReleaseForm');
    if (!f) return;
    f.classList.toggle('hidden');
    if (!f.classList.contains('hidden')) {
        var vInp = document.getElementById('otaPubVersion');
        if (vInp && !vInp.value) vInp.value = (window.VOITH_CONFIG && window.VOITH_CONFIG.APP_VERSION) || '16.12.0';
    }
}

async function submitPublishRelease(ev) {
    if (ev) ev.preventDefault();
    if (!VoithDB.isAdmin()) { showToast('Exclusivo para Administrador.', 'warn'); return; }
    var ver = (document.getElementById('otaPubVersion').value || '').trim();
    var ch = document.getElementById('otaPubChannel').value || 'stable';
    var chg = (document.getElementById('otaPubChangelog').value || '').trim();
    var btn = document.getElementById('otaPubBtn');
    if (!ver || !chg) { showToast('Preencha a versão e o texto do que mudou.', 'err'); return; }

    if (btn) { btn.disabled = true; btn.textContent = 'Publicando...'; }
    var r = await VoithCloud.callRpc({
        action: 'publish_release',
        version: ver,
        channel: ch,
        changelog: chg,
        downloadUrl: (window.VOITH_CONFIG && window.VOITH_CONFIG.LIVE_APP_URL) || 'https://carvpab.github.io/metrologia-voith/'
    }, false);
    if (btn) { btn.disabled = false; btn.textContent = 'Publicar & Notificar Usuários'; }

    if (r && r.ok) {
        document.getElementById('admPublishReleaseForm').classList.add('hidden');
        document.getElementById('otaPubChangelog').value = '';
        showToast('Release v' + ver + ' publicada! Todos verão as novidades ao abrir o app.', 'ok');
        loadAdminOtaTelemetry(false);
    } else {
        showToast((r && r.error) || 'Erro ao publicar release.', 'err');
    }
}
