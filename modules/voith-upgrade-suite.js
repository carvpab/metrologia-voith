/**
 * ============================================================================
 * VOITH METROLOGIA — Upgrade Suite v5.3
 * - Trava automática para instrumento Vencido / Reprovado / Em Laboratório
 * - Próxima Calibração ao devolver cautela "Aguardando calibração"
 * - Análise de Risco & Impacto Retroativo (Non-Conformance)
 * - Gráfico de Tendência de Deriva & Custo por Família + Taxa de Reprovação
 * - Visualizador da Trilha de Auditoria Imutável (audit_logs)
 * - Extrator Modular do index.html (gera styles/main.css e js/core.js)
 * - Interceptação nativa de voltar Android/Capacitor + Rolagem horizontal de abas
 * ============================================================================
 */
(function (global) {
  'use strict';

  const PERMISSION_LABELS = {
    view_instruments: 'Visualizar instrumentos',
    edit_instruments: 'Editar / cadastrar instrumentos',
    delete_instruments: 'Excluir / desativar instrumentos',
    bulk_actions: 'Usar ações em lote (Bulk Actions)',
    manage_calibrations: 'Gerenciar envios e retornos de calibração',
    view_sla_costs: 'Ver indicadores de SLA, deriva e custos',
    request_cautela: 'Preencher cautela (retirada de instrumento)',
    approve_cautela: 'Aprovar cautelas / liberar instrumento bloqueado',
    override_cautela_holder: 'Preencher cautela em nome de outro colaborador',
    manage_users: 'Criar e editar usuários (abaixo da sua hierarquia)',
    manage_roles: 'Criar e editar tipos de login e hierarquia',
    manage_releases: 'Gerenciar canais OTA (beta / stable)',
    export_backup: 'Exportar backup completo'
  };

  const state = {
    cfg: {},
    profile: null,
    selectedTags: new Set(),
    pendingMutations: 0,
    syncing: false,
    errorBurstCache: new Map(),
    otaChannel: localStorage.getItem('voith_ota_channel') || 'stable',
    modalHistoryPushed: false,
    modalReturnToAdmin: false,
    ignoreNextPopstate: false,
    blockExitUntil: 0,
    adminLockObserver: null
  };

  async function rpc(fnName, params = {}) {
    const { supabaseUrl, supabaseAnonKey } = state.cfg;
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Configure supabaseUrl e supabaseAnonKey no VoithUpgrade.init()');
    }
    const headers = {
      'Content-Type': 'application/json',
      apikey: supabaseAnonKey
    };
    if (String(supabaseAnonKey).startsWith('eyJ')) {
      headers.Authorization = `Bearer ${supabaseAnonKey}`;
    }
    const res = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/rpc/${fnName}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(params)
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`RPC ${fnName} falhou (${res.status}): ${txt}`);
    }
    return res.json();
  }

  function hasPerm(permKey) {
    if (!state.profile) return false;
    if (Number(state.profile.hierarchy_level) >= 100) return true;
    return Boolean(state.profile.permissions && state.profile.permissions[permKey]);
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normText(v) {
    return String(v ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function getAllInstruments() {
    return typeof state.cfg.getInstruments === 'function' ? (state.cfg.getInstruments() || []) : [];
  }

  function findInstrumentByTag(tag) {
    const clean = String(tag ?? '').trim().toUpperCase();
    if (!clean) return null;
    return getAllInstruments().find((i) => {
      const code = String(i.code || i.tag || i.codigo || i.Instrumento || i.id || '').trim().toUpperCase();
      return code === clean;
    }) || null;
  }

  function parseFlexDate(raw) {
    if (!raw) return null;
    const s = String(raw).trim();
    const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (br) return new Date(`${br[3]}-${br[2]}-${br[1]}T12:00:00`);
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return new Date(`${iso[1]}-${iso[2]}-${iso[3]}T12:00:00`);
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function evaluateInstrumentBlock(inst) {
    if (!inst) return { blocked: false, reason: '', statusLabel: 'Não localizado' };
    const rawStatus = String(inst.status || inst.Status || inst.situacao || '').trim();
    const nStatus = normText(rawStatus);
    const dueRaw = inst.proxCal || inst.proxima_calibracao || inst.dueDate || inst['Data da Próxima Calibração'] || '';
    const dueDate = parseFlexDate(dueRaw);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (nStatus.includes('reprovad') || nStatus.includes('fora de tolerancia') || nStatus.includes('bloquead')) {
      return { blocked: true, severity: 'danger', statusLabel: rawStatus || 'REPROVADO / BLOQUEADO', reason: `Instrumento marcado como "${rawStatus}". Uso proibido na produção.` };
    }
    if (nStatus.includes('laborat') || nStatus.includes('externo') || nStatus.includes('calibrac')) {
      return { blocked: true, severity: 'warn', statusLabel: rawStatus || 'EM LABORATÓRIO', reason: `Instrumento enviado para calibração externa ("${rawStatus}").` };
    }
    if (nStatus.includes('inativ') || nStatus.includes('perdid') || nStatus.includes('baixad')) {
      return { blocked: true, severity: 'danger', statusLabel: rawStatus || 'BAIXADO / INATIVO', reason: `Instrumento baixado ou inativo ("${rawStatus}").` };
    }
    if (nStatus.includes('vencid') || (dueDate && dueDate < today)) {
      const fmtDue = dueDate ? dueDate.toLocaleDateString('pt-BR') : dueRaw;
      return { blocked: true, severity: 'danger', statusLabel: 'VENCIDO', reason: `Calibração vencida em ${fmtDue || 'data anterior'}. Recolher para calibração antes de operar.` };
    }
    return { blocked: false, severity: 'ok', statusLabel: rawStatus || 'EM DIA', reason: '' };
  }

  function classifyFamily(item) {
    const text = normText([
      item.family, item.familia, item.category, item.categoria,
      item.desc, item.descricao, item['Descrição'], item.instrumentDesc
    ].join(' '));

    if (/torqu|apert|dinamometr/.test(text)) return 'Torque';
    if (/multimetr|amper|voltim|megohm|terr|eletric|alicate amper|oscilosc|fonte/.test(text)) return 'Elétrica';
    if (/press|manometr|vacuometr|termometr|temperatur|pir[oô]metr|umidade|termo-higrom/.test(text)) return 'Pressão & Temp.';
    if (/paquimet|micromet|relogio compar|subito|calibrador|bloco padrao|trena|goniometr|rugosimetr|altimetr|esquadro|desempeno/.test(text)) return 'Dimensional';
    return 'Outros';
  }

  function injectStyles() {
    let style = document.getElementById('voith-upgrade-styles');
    if (!style) {
      style = document.createElement('style');
      style.id = 'voith-upgrade-styles';
      document.head.appendChild(style);
    }
    style.textContent = `
      .vu-admin-tabs-scroll,
      #adminUsersModal [role="tablist"],
      #adminUsersModal div:has(> #admTabUsers),
      #adminUsersModal div:has(> button[id^="admTab"]) {
        display: flex !important;
        flex-direction: row !important;
        flex-wrap: nowrap !important;
        overflow-x: auto !important;
        overflow-y: hidden !important;
        -webkit-overflow-scrolling: touch !important;
        scrollbar-width: thin !important;
        touch-action: pan-x !important;
        max-width: 100% !important;
        gap: 6px !important;
        padding-bottom: 6px !important;
      }
      @media (max-width: 640px) {
        .vu-admin-tabs-scroll,
        #adminUsersModal [role="tablist"],
        #adminUsersModal div:has(> #admTabUsers),
        #adminUsersModal div:has(> button[id^="admTab"]) {
          padding-left: 12px !important;
          padding-right: 20px !important;
        }
      }
      .vu-admin-tabs-scroll > *,
      #adminUsersModal [role="tablist"] > *,
      #adminUsersModal div:has(> #admTabUsers) > *,
      #adminUsersModal div:has(> button[id^="admTab"]) > * {
        white-space: nowrap !important;
        flex-shrink: 0 !important;
      }

      .vu-sync-pill,
      #vu-sync-pill {
        position: fixed !important;
        bottom: 18px !important;
        right: 18px !important;
        top: auto !important;
        left: auto !important;
        z-index: 9500 !important;
        display: inline-flex; align-items: center; gap: 8px;
        padding: 6px 12px; border-radius: 999px; font: 600 12px/1.2 system-ui, sans-serif;
        box-shadow: 0 4px 16px rgba(0,0,0,.28); backdrop-filter: blur(8px);
        transition: all .2s ease; user-select: none; cursor: pointer;
      }
      .vu-sync-ok { background: #0f2e1f; color: #5eead4; border: 1px solid #166534; }
      .vu-sync-busy { background: #0f2540; color: #93c5fd; border: 1px solid #1d4ed8; }
      .vu-sync-offline { background: #3b2208; color: #fcd34d; border: 1px solid #d97706; }
      .vu-dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; }

      .vu-backdrop {
        position: fixed; inset: 0; z-index: 9800; background: rgba(6, 11, 20, .75);
        display: flex; align-items: flex-start; justify-content: center;
        padding: 36px 12px 24px; overflow-y: auto; backdrop-filter: blur(4px);
      }
      .vu-modal {
        width: 100%; max-width: 920px; background: #0f172a; color: #e2e8f0;
        border: 1px solid #334155; border-radius: 14px; overflow: hidden;
        box-shadow: 0 24px 60px rgba(0,0,0,.6); font-family: system-ui, -apple-system, sans-serif;
      }
      .vu-modal-sm { max-width: 640px; }
      .vu-header {
        display: flex; align-items: center; justify-content: space-between; gap: 10px;
        padding: 14px 16px; background: #1e293b; border-bottom: 1px solid #334155;
      }
      .vu-header-left { display: flex; align-items: center; gap: 10px; min-width: 0; }
      .vu-header h3 { margin: 0; font-size: 15px; font-weight: 700; color: #f8fafc; }
      .vu-close {
        background: transparent; border: none; color: #94a3b8; font-size: 22px; line-height: 1; cursor: pointer; flex-shrink: 0;
      }
      .vu-body { padding: 16px; max-height: 80vh; overflow-y: auto; }
      .vu-input, .vu-select, .vu-textarea {
        width: 100%; box-sizing: border-box; padding: 9px 11px; border-radius: 8px;
        border: 1px solid #334155; background: #0b1220; color: #f8fafc; font-size: 13px;
      }
      .vu-input:disabled { opacity: .75; background: #162032; cursor: not-allowed; }
      .vu-btn {
        padding: 8px 14px; border-radius: 8px; border: 1px solid #334155;
        background: #1e293b; color: #f8fafc; font: 600 13px/1.2 system-ui, sans-serif; cursor: pointer;
      }
      .vu-btn:hover { background: #334155; }
      .vu-btn:disabled { opacity: .45; cursor: not-allowed; }
      .vu-btn-sm { padding: 6px 10px; font-size: 12px; white-space: nowrap; flex-shrink: 0; }
      .vu-btn-primary { background: #0284c7; border-color: #0ea5e9; color: #fff; }
      .vu-btn-primary:hover { background: #0369a1; }
      .vu-btn-danger { background: #991b1b; border-color: #dc2626; color: #fff; }
      .vu-btn-warn { background: #92400e; border-color: #f59e0b; color: #fff; }
      .vu-grid-2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
      .vu-grid-3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
      @media (max-width: 640px) { .vu-grid-2, .vu-grid-3, .vu-perm-grid { grid-template-columns: 1fr; } }
      .vu-card {
        background: #111c30; border: 1px solid #24324a; border-radius: 10px; padding: 14px;
      }
      .vu-alert-danger {
        background: rgba(153, 27, 27, .28); border: 1px solid #ef4444; color: #fecaca;
        border-radius: 10px; padding: 12px; font-size: 12.5px;
      }
      .vu-alert-warn {
        background: rgba(146, 64, 14, .28); border: 1px solid #f59e0b; color: #fde68a;
        border-radius: 10px; padding: 12px; font-size: 12.5px;
      }
      .vu-badge {
        display: inline-block; padding: 3px 8px; border-radius: 999px;
        font-size: 11px; font-weight: 600; background: #1e3a5f; color: #7dd3fc;
      }
      .vu-badge-green { background: #064e3b; color: #6ee7b7; }
      .vu-badge-amber { background: #451a03; color: #fcd34d; }
      .vu-badge-red { background: #7f1d1d; color: #fca5a5; }

      .vu-tabs {
        display: flex; gap: 8px; margin-bottom: 14px; border-bottom: 1px solid #334155; padding-bottom: 10px;
        overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none;
      }
      .vu-tabs::-webkit-scrollbar { display: none; }
      .vu-tab {
        background: transparent; border: none; color: #94a3b8; font-weight: 600;
        padding: 6px 12px; cursor: pointer; border-radius: 6px; white-space: nowrap; flex-shrink: 0;
      }
      .vu-tab.active { background: #0284c7; color: #fff; }
      .vu-perm-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 8px; }
      .vu-perm-item { display: flex; align-items: center; gap: 8px; font-size: 12px; background: #0b1220; padding: 7px 9px; border-radius: 6px; border: 1px solid #1e293b; cursor: pointer; }
      .vu-table-wrap { width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; }
      .vu-table { width: 100%; border-collapse: collapse; font-size: 12.5px; min-width: 540px; }
      .vu-table th, .vu-table td { padding: 8px 10px; border-bottom: 1px solid #1e293b; text-align: left; }
      .vu-table th { color: #94a3b8; font-weight: 600; }

      .vu-bar-track { width: 100%; height: 10px; background: #0b1220; border-radius: 999px; overflow: hidden; border: 1px solid #1e293b; }
      .vu-bar-fill { height: 100%; border-radius: 999px; transition: width .3s ease; }
    `;
  }

  function enableWheelHorizontalScroll(el) {
    if (!el || el.dataset.vuWheelBound) return;
    el.dataset.vuWheelBound = '1';
    el.addEventListener('wheel', (e) => {
      if (el.scrollWidth > el.clientWidth && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        el.scrollLeft += e.deltaY;
        e.preventDefault();
      }
    }, { passive: false });
  }

  function isNativeApk() {
    return Boolean(global.Capacitor && (typeof global.Capacitor.isNativePlatform !== 'function' || global.Capacitor.isNativePlatform()));
  }

  function ensureAdminModalVisible() {
    const adm = document.getElementById('adminUsersModal');
    if (!adm) return;
    if (adm.classList.contains('hidden') || adm.style.display === 'none') {
      if (typeof global.openAdminUsersModal === 'function') {
        global.openAdminUsersModal();
      } else {
        adm.classList.remove('hidden');
        adm.style.display = '';
      }
    }
  }

  function startAdminBackgroundLock() {
    stopAdminBackgroundLock();
    const adm = document.getElementById('adminUsersModal');
    if (!adm) return;
    state.adminLockObserver = new MutationObserver(() => {
      if (state.modalReturnToAdmin && document.querySelector('[data-vu-modal="1"]')) {
        if (adm.classList.contains('hidden')) adm.classList.remove('hidden');
      }
    });
    state.adminLockObserver.observe(adm, { attributes: true, attributeFilter: ['class', 'style'] });
  }

  function stopAdminBackgroundLock() {
    if (state.adminLockObserver) {
      state.adminLockObserver.disconnect();
      state.adminLockObserver = null;
    }
  }

  function guardCapacitorExitApp() {
    const appPlugin = global.Capacitor && global.Capacitor.Plugins && global.Capacitor.Plugins.App;
    if (!appPlugin || typeof appPlugin.exitApp !== 'function' || appPlugin.__vuGuarded) return;
    const origExit = appPlugin.exitApp.bind(appPlugin);
    appPlugin.exitApp = function () {
      if (document.querySelector('[data-vu-modal="1"]') || Date.now() < state.blockExitUntil) {
        return Promise.resolve();
      }
      return origExit.apply(this, arguments);
    };
    appPlugin.__vuGuarded = true;
  }

  function pushModalHistory(returnToAdmin = false) {
    state.modalReturnToAdmin = Boolean(returnToAdmin);
    if (state.modalReturnToAdmin) startAdminBackgroundLock();
    state.blockExitUntil = Date.now() + 2500;
    try {
      history.pushState({ vuModal: true, fromAdmin: state.modalReturnToAdmin }, '', window.location.href);
      state.modalHistoryPushed = true;
    } catch (_) {}
  }

  function handleMobileBackEvent(e) {
    const activeModals = document.querySelectorAll('[data-vu-modal="1"]');
    if (!activeModals.length) return false;

    if (e && typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
    if (e && typeof e.preventDefault === 'function' && e.cancelable) e.preventDefault();

    state.blockExitUntil = Date.now() + 2500;
    const shouldReturnAdmin = state.modalReturnToAdmin;
    state.modalHistoryPushed = false;

    activeModals.forEach((el) => el.remove());
    stopAdminBackgroundLock();
    state.modalReturnToAdmin = false;

    if (shouldReturnAdmin) {
      ensureAdminModalVisible();
      setTimeout(ensureAdminModalVisible, 50);
      setTimeout(ensureAdminModalVisible, 180);
    }
    return true;
  }

  function bindCapacitorBackListener() {
    guardCapacitorExitApp();
    const appPlugin = global.Capacitor && global.Capacitor.Plugins && global.Capacitor.Plugins.App;
    if (appPlugin && typeof appPlugin.addListener === 'function' && !appPlugin.__vuBackListenerAdded) {
      appPlugin.__vuBackListenerAdded = true;
      try {
        appPlugin.addListener('backButton', (data) => {
          handleMobileBackEvent(data);
        });
      } catch (_) {}
    }
  }

  function setupHistoryBackHandler() {
    bindCapacitorBackListener();
    setTimeout(bindCapacitorBackListener, 1200);
    setTimeout(bindCapacitorBackListener, 3500);

    const onBack = (e) => { handleMobileBackEvent(e); };
    document.addEventListener('backbutton', onBack, true);
    window.addEventListener('backbutton', onBack, true);

    window.addEventListener('popstate', (e) => {
      if (state.ignoreNextPopstate) {
        state.ignoreNextPopstate = false;
        e.stopImmediatePropagation();
        e.stopPropagation();
        return;
      }
      if (document.querySelector('[data-vu-modal="1"]')) {
        handleMobileBackEvent(e);
      }
    }, true);
  }

  function closeModals(options = {}) {
    const { fromPopstate = false, keepHistory = false, reopenAdmin = false } = options;
    stopAdminBackgroundLock();
    document.querySelectorAll('[data-vu-modal="1"]').forEach((el) => el.remove());

    if (!keepHistory && state.modalHistoryPushed) {
      state.modalHistoryPushed = false;
      if (!fromPopstate && !isNativeApk()) {
        state.ignoreNextPopstate = true;
        try { history.back(); } catch (_) {}
        setTimeout(() => { state.ignoreNextPopstate = false; }, 350);
      }
    }
    if (!keepHistory) state.modalReturnToAdmin = false;

    if (reopenAdmin) {
      ensureAdminModalVisible();
      setTimeout(ensureAdminModalVisible, 60);
      setTimeout(ensureAdminModalVisible, 200);
    }
  }

  function injectAppHooks() {
    const adminTabsBar = document.querySelector('#adminUsersModal #admTabOta')?.parentElement
      || document.querySelector('#adminUsersModal #admTabUsers')?.parentElement
      || document.querySelector('#adminUsersModal button[id^="admTab"]')?.parentElement;

    if (adminTabsBar) {
      adminTabsBar.classList.add('vu-admin-tabs-scroll');
      enableWheelHorizontalScroll(adminTabsBar);

      if (!document.getElementById('admTabRbac')) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'admTabRbac';
        btn.className = 'px-3.5 py-2 rounded-t-lg font-bold text-amber-600 dark:text-amber-300 hover:underline cursor-pointer';
        btn.textContent = 'Tipos de Login & Hierarquia';
        btn.addEventListener('click', () => openRbacAdminModal());
        adminTabsBar.appendChild(btn);
      }

      if (!document.getElementById('admTabAudit')) {
        const btnAudit = document.createElement('button');
        btnAudit.type = 'button';
        btnAudit.id = 'admTabAudit';
        btnAudit.className = 'px-3.5 py-2 rounded-t-lg font-bold text-sky-600 dark:text-sky-300 hover:underline cursor-pointer';
        btnAudit.textContent = 'Auditoria & Governança';
        btnAudit.addEventListener('click', () => openAuditLogsModal(true));
        adminTabsBar.appendChild(btnAudit);
      }

      if (!document.getElementById('admTabSplit')) {
        const btnSplit = document.createElement('button');
        btnSplit.type = 'button';
        btnSplit.id = 'admTabSplit';
        btnSplit.className = 'px-3.5 py-2 rounded-t-lg font-bold text-emerald-600 dark:text-emerald-300 hover:underline cursor-pointer';
        btnSplit.textContent = 'Modularizar HTML';
        btnSplit.addEventListener('click', () => openModularizerModal(true));
        adminTabsBar.appendChild(btnSplit);
      }
    }

    const calPresetBtn = document.querySelector('#custodyModal button[onclick*="applyCustPreset"]');
    if (calPresetBtn && calPresetBtn.parentElement && !document.getElementById('vuAutoFillCustBtn')) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'vuAutoFillCustBtn';
      btn.className = 'px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-400/30 font-extrabold cursor-pointer';
      btn.textContent = 'Auto-Preencher Login';
      btn.addEventListener('click', () => {
        const c = document.getElementById('custPickerCode');
        openCautelaModal(c ? c.value : '');
      });
      calPresetBtn.parentElement.appendChild(btn);
    }

    const extReturnModal = document.getElementById('extReturnModal') || document.getElementById('batchReturnModal');
    if (extReturnModal && !extReturnModal.dataset.vuNcHooked) {
      extReturnModal.dataset.vuNcHooked = '1';
      extReturnModal.addEventListener('change', (e) => {
        const val = normText(e.target && e.target.value);
        if (val.includes('reprovad') || val.includes('fora') || val.includes('nao conforme')) {
          const codeEl = extReturnModal.querySelector('input[id*="Code"], select[id*="Code"], [data-code]');
          const tag = codeEl ? (codeEl.value || codeEl.dataset.code) : '';
          setTimeout(() => openRetroactiveImpactModal(tag), 250);
        }
      });
    }

    const custodyModalEl = document.getElementById('custodyModal');
    if (custodyModalEl && !custodyModalEl.dataset.vuNextCalHooked) {
      custodyModalEl.dataset.vuNextCalHooked = '1';

      function toIsoDateStr(val) {
        if (!val) return '';
        const s = String(val).trim();
        const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
        if (iso) return iso[1];
        const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
        if (br) return `${br[3]}-${br[2]}-${br[1]}`;
        return '';
      }

      function formatBrFromIso(isoStr) {
        const m = String(isoStr || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
        return m ? `${m[3]}/${m[2]}/${m[1]}` : isoStr;
      }

      function getActiveCustodyInstrument() {
        const codeEl = document.getElementById('custPickerCode') || custodyModalEl.querySelector('[data-code]');
        const code = codeEl ? (codeEl.value || codeEl.dataset.code || codeEl.textContent) : '';
        return findInstrumentByTag(code);
      }

      function syncNextCalBox() {
        const confirmBtn = custodyModalEl.querySelector('button[onclick*="confirmCustodyReturn"], button[id*="confirmReturn"], button[onclick*="returnCustody"]');
        const returnBox = confirmBtn ? confirmBtn.parentElement : null;
        if (!returnBox) return;

        const inst = getActiveCustodyInstrument();
        const statusTxt = normText([
          inst && (inst.status || inst.Status || inst.situacao),
          custodyModalEl.textContent
        ].join(' '));
        const isWaitingCal = statusTxt.includes('aguardando calibr') || statusTxt.includes('em calibr') || statusTxt.includes('recolhido para calibr');

        let box = document.getElementById('vu-return-next-cal-box');
        if (!isWaitingCal) {
          if (box) box.style.display = 'none';
          return;
        }

        if (!box) {
          box = document.createElement('div');
          box.id = 'vu-return-next-cal-box';
          box.style.cssText = 'margin:10px 0 12px;padding:10px 12px;border-radius:10px;background:#0b1220;border:1px solid #0284c7;text-align:left;';
          box.innerHTML = `
            <label for="vuReturnNextCalDate" style="display:block;font-size:11px;font-weight:700;letter-spacing:.04em;color:#7dd3fc;margin-bottom:6px;text-transform:uppercase;">
              Nova Data da Próxima Calibração (ao devolver)
            </label>
            <input id="vuReturnNextCalDate" type="date" class="vu-input" style="padding:8px 10px;" />
            <div style="font-size:11px;color:#94a3b8;margin-top:4px;">
              Atualiza a validade do instrumento automaticamente ao confirmar a devolução.
            </div>
          `;
          confirmBtn.parentNode.insertBefore(box, confirmBtn);
        }

        box.style.display = 'block';
        const dateInp = box.querySelector('#vuReturnNextCalDate');
        if (dateInp && inst && !dateInp.dataset.vuTouched) {
          const curDue = inst.proxCal || inst.proxima_calibracao || inst.dueDate || inst['Data da Próxima Calibração'] || '';
          dateInp.value = toIsoDateStr(curDue);
          dateInp.addEventListener('input', () => { dateInp.dataset.vuTouched = '1'; });
        }
      }

      function applyNextCalToInstrument() {
        const dateInp = document.getElementById('vuReturnNextCalDate');
        if (!dateInp || !dateInp.value) return;

        const isoVal = dateInp.value;
        const brVal = formatBrFromIso(isoVal);
        const inst = getActiveCustodyInstrument();
        if (!inst) return;

        if ('proxCal' in inst) inst.proxCal = isoVal;
        if ('proxima_calibracao' in inst) inst.proxima_calibracao = isoVal;
        if ('dueDate' in inst) inst.dueDate = isoVal;
        if ('Data da Próxima Calibração' in inst) inst['Data da Próxima Calibração'] = brVal;

        const autoCheck = custodyModalEl.querySelector('input[type="checkbox"]');
        if (autoCheck && !autoCheck.checked) {
          autoCheck.checked = true;
          autoCheck.dispatchEvent(new Event('change', { bubbles: true }));
        }

        if (typeof global.recalcInstrumentStatus === 'function') global.recalcInstrumentStatus(inst);
        if (typeof global.saveDB === 'function') global.saveDB();
        if (typeof global.renderAll === 'function') global.renderAll();
        if (typeof global.scheduleCloudSync === 'function') global.scheduleCloudSync();
      }

      custodyModalEl.addEventListener('click', (e) => {
        const targetBtn = e.target.closest('button');
        if (!targetBtn) return;
        const txt = normText(targetBtn.textContent);
        const onAttr = String(targetBtn.getAttribute('onclick') || '');
        if (txt.includes('confirmar devolucao') || onAttr.includes('confirmCustodyReturn') || onAttr.includes('returnCustody')) {
          applyNextCalToInstrument();
        }
      }, true);

      const mo = new MutationObserver(() => {
        const inp = document.getElementById('vuReturnNextCalDate');
        if (inp) inp.dataset.vuTouched = '';
        setTimeout(syncNextCalBox, 40);
      });
      mo.observe(custodyModalEl, { attributes: true, childList: true, subtree: true, attributeFilter: ['class', 'style'] });
      setTimeout(syncNextCalBox, 80);
    }
  }

  function renderSyncPill() {
    let pill = document.getElementById('vu-sync-pill');
    const online = navigator.onLine;
    const count = state.pendingMutations;
    const shouldShow = !online || state.syncing || count > 0;

    if (!shouldShow) {
      if (pill) pill.style.display = 'none';
      return;
    }

    if (!pill) {
      pill = document.createElement('div');
      pill.id = 'vu-sync-pill';
      pill.title = 'Clique para abrir a Central Voith Metrologia';
      pill.addEventListener('click', openQuickMenu);
      document.body.appendChild(pill);
    }

    pill.style.display = 'inline-flex';
    if (!online) {
      pill.className = 'vu-sync-pill vu-sync-offline';
      pill.innerHTML = `<span class="vu-dot"></span> Offline — ${count} pendente(s)`;
    } else {
      pill.className = 'vu-sync-pill vu-sync-busy';
      pill.innerHTML = `<span class="vu-dot"></span> Sincronizando (${count})...`;
    }
  }

  function setPendingMutations(count, isSyncing = false) {
    state.pendingMutations = Math.max(0, Number(count) || 0);
    state.syncing = Boolean(isSyncing);
    renderSyncPill();
  }

  function setupOfflineMonitors() {
    window.addEventListener('online', () => {
      renderSyncPill();
      if (typeof state.cfg.onReconnect === 'function') state.cfg.onReconnect();
    });
    window.addEventListener('offline', renderSyncPill);
    window.addEventListener('beforeunload', (e) => {
      if (state.pendingMutations > 0) {
        e.preventDefault();
        e.returnValue = 'Existem alterações pendentes de sincronização. Tem certeza que deseja fechar?';
      }
    });
    renderSyncPill();
  }

  async function openCautelaModal(preselectedTag = '') {
    if (!state.profile) await loadSessionProfile();
    if (!state.profile) {
      return alert('Sessão não localizada no servidor. Faça login novamente para preencher a cautela.');
    }
    if (!hasPerm('request_cautela')) {
      return alert('Seu tipo de login não tem permissão para solicitar/preencher cautelas.');
    }
    closeModals({ keepHistory: true });
    pushModalHistory(false);

    const prof = state.profile;
    const canOverrideHolder = hasPerm('override_cautela_holder');
    const canOverrideBlock = Number(prof.hierarchy_level) >= 50 || hasPerm('approve_cautela') || canOverrideHolder;
    const lockAttr = canOverrideHolder ? '' : 'disabled';

    const backdrop = document.createElement('div');
    backdrop.className = 'vu-backdrop';
    backdrop.dataset.vuModal = '1';
    backdrop.innerHTML = `
      <div class="vu-modal vu-modal-sm">
        <div class="vu-header">
          <div class="vu-header-left">
            <button type="button" class="vu-btn vu-btn-sm vu-close-btn">&larr; Voltar</button>
            <h3>Nova Cautela de Instrumento</h3>
          </div>
          <button type="button" class="vu-close">&times;</button>
        </div>
        <div class="vu-body">
          <div style="margin-bottom:12px;">
            <span class="vu-badge vu-badge-green">
              Preenchido pelo login (${escapeHtml(prof.role_name || prof.role_code || '')})
            </span>
          </div>
          <form id="vu-cautela-form" style="display:flex;flex-direction:column;gap:12px;">
            <div class="vu-grid-2">
              <div>
                <label style="font-size:12px;color:#94a3b8;">Nome do Colaborador</label>
                <input class="vu-input" name="holder_name" value="${escapeHtml(prof.display_name)}" ${lockAttr} required />
              </div>
              <div>
                <label style="font-size:12px;color:#94a3b8;">Matrícula</label>
                <input class="vu-input" name="holder_matricula" value="${escapeHtml(prof.matricula)}" ${lockAttr} required />
              </div>
            </div>
            <div class="vu-grid-2">
              <div>
                <label style="font-size:12px;color:#94a3b8;">Setor</label>
                <input class="vu-input" name="holder_setor" value="${escapeHtml(prof.setor)}" ${lockAttr} required />
              </div>
              <div>
                <label style="font-size:12px;color:#94a3b8;">TAG / Código do Instrumento</label>
                <input class="vu-input" id="vu-cautela-tag" name="instrument_tag" value="${escapeHtml(preselectedTag)}" placeholder="Ex: AC401573" required />
              </div>
            </div>
            <div id="vu-cautela-guard-box"></div>
            <div>
              <label style="font-size:12px;color:#94a3b8;">Observações / Ordem de Serviço</label>
              <textarea class="vu-textarea" name="notes" rows="2" placeholder="Motivo da retirada ou local de uso..."></textarea>
            </div>
            <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:6px;">
              <button type="button" class="vu-btn vu-close-btn">Cancelar</button>
              <button type="submit" id="vu-cautela-submit" class="vu-btn vu-btn-primary">Registrar Cautela</button>
            </div>
          </form>
        </div>
      </div>
    `;

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop || e.target.classList.contains('vu-close') || e.target.classList.contains('vu-close-btn')) closeModals();
    });
    document.body.appendChild(backdrop);

    const tagInput = backdrop.querySelector('#vu-cautela-tag');
    const guardBox = backdrop.querySelector('#vu-cautela-guard-box');
    const submitBtn = backdrop.querySelector('#vu-cautela-submit');

    function evaluateTagGuard() {
      const inst = findInstrumentByTag(tagInput.value);
      const check = evaluateInstrumentBlock(inst);

      if (!inst) {
        guardBox.innerHTML = '';
        submitBtn.disabled = false;
        return { inst: null, check };
      }

      const desc = escapeHtml(inst.desc || inst.descricao || inst['Descrição'] || '');
      if (!check.blocked) {
        guardBox.innerHTML = `
          <div class="vu-card" style="padding:10px;font-size:12px;border-color:#166534;">
            <strong style="color:#6ee7b7;">✓ Instrumento liberado (${escapeHtml(check.statusLabel)})</strong>
            <div style="color:#94a3b8;margin-top:2px;">${desc}</div>
          </div>
        `;
        submitBtn.disabled = false;
        return { inst, check };
      }

      if (!canOverrideBlock) {
        guardBox.innerHTML = `
          <div class="vu-alert-danger">
            <strong>⛔ BLOQUEIO AUTOMÁTICO — ${escapeHtml(check.statusLabel)}</strong>
            <div style="margin-top:4px;">${escapeHtml(check.reason)}</div>
            <div style="margin-top:6px;font-size:11.5px;opacity:.9;">
              Seu nível hierárquico (${prof.hierarchy_level}) não permite retirar instrumentos vencidos, reprovados ou em laboratório. Solicite liberação a um Líder ou Metrologia.
            </div>
          </div>
        `;
        submitBtn.disabled = true;
      } else {
        guardBox.innerHTML = `
          <div class="vu-alert-warn">
            <strong>⚠️ ATENÇÃO — ${escapeHtml(check.statusLabel)}</strong>
            <div style="margin-top:4px;">${escapeHtml(check.reason)}</div>
            <div style="margin-top:8px;">
              <label style="font-size:11.5px;font-weight:700;display:block;margin-bottom:4px;">
                Justificativa Técnica Obrigatória (Liberação Nível ${prof.hierarchy_level}):
              </label>
              <input class="vu-input" name="override_reason" placeholder="Ex: Recolhimento para calibração externa ou uso restrito autorizado..." required />
            </div>
          </div>
        `;
        submitBtn.disabled = false;
      }
      return { inst, check };
    }

    tagInput.addEventListener('input', evaluateTagGuard);
    evaluateTagGuard();

    backdrop.querySelector('#vu-cautela-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const { inst, check } = evaluateTagGuard();
      if (check.blocked && !canOverrideBlock) return;

      const fd = new FormData(e.target);
      const payload = {
        holder_name: fd.get('holder_name') || prof.display_name,
        holder_matricula: fd.get('holder_matricula') || prof.matricula,
        holder_setor: fd.get('holder_setor') || prof.setor,
        instrument_tag: String(fd.get('instrument_tag') || '').trim(),
        instrument_status: inst ? (inst.status || inst.Status || check.statusLabel) : '',
        instrument_blocked: Boolean(check.blocked),
        override_reason: String(fd.get('override_reason') || '').trim(),
        notes: String(fd.get('notes') || '').trim()
      };

      try {
        const token = state.cfg.getSessionToken ? state.cfg.getSessionToken() : '';
        const res = await rpc('voith_create_cautela_autofill', { p_token: token, p_payload: payload });
        if (!res.ok) return alert(res.error || 'Erro ao registrar cautela.');
        closeModals();
        if (typeof state.cfg.onCautelaCreated === 'function') {
          state.cfg.onCautelaCreated(res.cautela);
        } else {
          alert(`Cautela registrada para ${res.cautela.requester_name} (Mat. ${res.cautela.requester_matricula}) — Status: ${res.cautela.status}`);
        }
      } catch (err) {
        alert('Falha ao comunicar com o Supabase: ' + err.message);
      }
    });
  }

  async function openRetroactiveImpactModal(preselectedTag = '') {
    if (!state.profile) await loadSessionProfile();
    closeModals({ keepHistory: true });
    pushModalHistory(false);

    const backdrop = document.createElement('div');
    backdrop.className = 'vu-backdrop';
    backdrop.dataset.vuModal = '1';
    backdrop.innerHTML = `
      <div class="vu-modal">
        <div class="vu-header">
          <div class="vu-header-left">
            <button type="button" class="vu-btn vu-btn-sm vu-close-btn">&larr; Voltar</button>
            <h3>Análise de Risco & Impacto Retroativo (Não-Conformidade)</h3>
          </div>
          <button type="button" class="vu-close">&times;</button>
        </div>
        <div class="vu-body">
          <div class="vu-alert-warn" style="margin-bottom:14px;">
            Rastreie todos os colaboradores, setores e movimentações que utilizaram um instrumento reprovado ou fora de tolerância desde sua última calibração válida.
          </div>
          <form id="vu-nc-form" class="vu-grid-3" style="margin-bottom:14px;align-items:end;">
            <div>
              <label style="font-size:12px;color:#94a3b8;">TAG do Instrumento Reprovado</label>
              <input class="vu-input" name="tag" value="${escapeHtml(preselectedTag)}" placeholder="Ex: AC401573" required />
            </div>
            <div>
              <label style="font-size:12px;color:#94a3b8;">Analisar desde (Data Última Calibração)</label>
              <input class="vu-input" name="since" type="date" value="${new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10)}" />
            </div>
            <div>
              <button type="submit" class="vu-btn vu-btn-warn" style="width:100%;">Rastrear Impacto</button>
            </div>
          </form>
          <div id="vu-nc-result"></div>
        </div>
      </div>
    `;

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop || e.target.classList.contains('vu-close') || e.target.classList.contains('vu-close-btn')) closeModals();
    });
    document.body.appendChild(backdrop);

    const resultEl = backdrop.querySelector('#vu-nc-result');

    async function runTrace(tag, since) {
      if (!tag) return;
      resultEl.innerHTML = '<div style="color:#94a3b8;padding:12px;">Consultando histórico de cautelas e auditoria...</div>';
      const inst = findInstrumentByTag(tag);
      const localCustodies = (global.VoithDB && global.VoithDB.state && Array.isArray(global.VoithDB.state.custodies))
        ? global.VoithDB.state.custodies.filter((c) => String(c.code || c.instrument_tag || '').toUpperCase() === tag.toUpperCase())
        : [];

      let cloudCautelas = [];
      let auditTrail = [];
      try {
        const token = state.cfg.getSessionToken ? state.cfg.getSessionToken() : '';
        const res = await rpc('voith_retroactive_impact', {
          p_token: token,
          p_instrument_tag: tag,
          p_since_date: since ? `${since}T00:00:00Z` : null
        });
        if (res.ok) {
          cloudCautelas = res.cautelas || [];
          auditTrail = res.audit_trail || [];
        }
      } catch (_) {}

      const merged = [...cloudCautelas, ...localCustodies];
      const sectors = Array.from(new Set(merged.map((c) => c.requester_setor || c.setor || c.sector || (inst && inst.setor)).filter(Boolean)));

      resultEl.innerHTML = `
        <div class="vu-grid-3" style="margin-bottom:14px;">
          <div class="vu-card">
            <div style="font-size:11px;color:#94a3b8;">Instrumento</div>
            <div style="font-size:16px;font-weight:700;">${escapeHtml(tag.toUpperCase())}</div>
            <div style="font-size:11.5px;color:#94a3b8;">${escapeHtml(inst ? (inst.desc || inst.descricao || '') : 'Não localizado no cadastro')}</div>
          </div>
          <div class="vu-card">
            <div style="font-size:11px;color:#94a3b8;">Retiradas / Cautelas no Período</div>
            <div style="font-size:22px;font-weight:700;color:#fbbf24;">${merged.length}</div>
          </div>
          <div class="vu-card">
            <div style="font-size:11px;color:#94a3b8;">Setores Impactados</div>
            <div style="font-size:13px;font-weight:700;color:#fca5a5;margin-top:4px;">${sectors.length ? escapeHtml(sectors.join(', ')) : 'Nenhum setor registrado'}</div>
          </div>
        </div>
        <div class="vu-table-wrap">
          <table class="vu-table">
            <thead><tr><th>Data</th><th>Colaborador</th><th>Matrícula</th><th>Setor</th><th>Observação / OS</th></tr></thead>
            <tbody>
              ${merged.length ? merged.map((c) => `
                <tr>
                  <td>${escapeHtml(c.created_at ? new Date(c.created_at).toLocaleString('pt-BR') : (c.date || c.data || '—'))}</td>
                  <td><strong>${escapeHtml(c.requester_name || c.holder_name || c.user || '—')}</strong></td>
                  <td>${escapeHtml(c.requester_matricula || c.matricula || '—')}</td>
                  <td><span class="vu-badge vu-badge-red">${escapeHtml(c.requester_setor || c.setor || '—')}</span></td>
                  <td>${escapeHtml(c.notes || c.obs || '—')}</td>
                </tr>
              `).join('') : '<tr><td colspan="5" style="text-align:center;color:#94a3b8;">Nenhuma cautela encontrada para este instrumento no período selecionado.</td></tr>'}
            </tbody>
          </table>
        </div>
        ${auditTrail.length ? `<div style="margin-top:12px;font-size:12px;color:#94a3b8;">+ ${auditTrail.length} registro(s) na trilha de auditoria encontrados para esta TAG.</div>` : ''}
      `;
    }

    backdrop.querySelector('#vu-nc-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      runTrace(String(fd.get('tag') || '').trim(), fd.get('since'));
    });

    if (preselectedTag) runTrace(preselectedTag, backdrop.querySelector('input[name="since"]').value);
  }

  function computeLabSlaMetrics(history) {
    const labMap = new Map();
    const famMap = new Map();
    const today = new Date();

    for (const row of history || []) {
      const lab = String(row.lab || row.laboratorio || row.lab_name || 'Não informado').trim();
      if (!labMap.has(lab)) {
        labMap.set(lab, { lab, totalEnvios: 0, concluidos: 0, leadDaysSum: 0, atrasados: 0, reprovados: 0, custoTotal: 0 });
      }
      const stat = labMap.get(lab);
      stat.totalEnvios += 1;

      const sent = parseFlexDate(row.sent_date || row.data_envio || row.sentAt || row.envio);
      const ret = parseFlexDate(row.return_date || row.data_retorno || row.returnedAt || row.retorno);
      const exp = parseFlexDate(row.expected_return_date || row.previsao_retorno || row.previsao);
      const cost = Number(row.cost_brl ?? row.custo ?? row.cost ?? 0);
      const resultText = normText([row.result, row.resultado, row.status, row.obs, row.observacao].join(' '));
      const isReproved = resultText.includes('reprovad') || resultText.includes('fora') || resultText.includes('ajuste') || resultText.includes('deriva');

      if (!Number.isNaN(cost) && cost > 0) stat.custoTotal += cost;
      if (isReproved) stat.reprovados += 1;

      if (sent && ret) {
        const diff = Math.max(0, Math.round((ret - sent) / 86400000));
        stat.concluidos += 1;
        stat.leadDaysSum += diff;
      } else if (exp && exp < today) {
        stat.atrasados += 1;
      }

      const inst = findInstrumentByTag(row.code || row.tag || row.instrument_tag);
      const fam = classifyFamily({ ...row, ...(inst || {}) });
      if (!famMap.has(fam)) famMap.set(fam, { family: fam, envios: 0, reprovados: 0, custoTotal: 0 });
      const fStat = famMap.get(fam);
      fStat.envios += 1;
      if (!Number.isNaN(cost) && cost > 0) fStat.custoTotal += cost;
      if (isReproved) fStat.reprovados += 1;
    }

    const labs = Array.from(labMap.values()).map((s) => ({
      ...s,
      leadTimeMedio: s.concluidos ? (s.leadDaysSum / s.concluidos).toFixed(1) : '—',
      custoMedio: s.totalEnvios ? s.custoTotal / s.totalEnvios : 0,
      taxaReprovacao: s.totalEnvios ? ((s.reprovados / s.totalEnvios) * 100).toFixed(1) : '0.0'
    })).sort((a, b) => b.custoTotal - a.custoTotal);

    const families = Array.from(famMap.values()).map((f) => ({
      ...f,
      taxaDeriva: f.envios ? ((f.reprovados / f.envios) * 100).toFixed(1) : '0.0'
    })).sort((a, b) => b.custoTotal - a.custoTotal || b.envios - a.envios);

    return { labs, families };
  }

  async function openLabSlaModal() {
    if (!state.profile) await loadSessionProfile();
    if (!hasPerm('view_sla_costs')) return alert('Seu perfil não tem permissão para visualizar SLA e custos.');
    closeModals({ keepHistory: true });
    pushModalHistory(false);

    const history = typeof state.cfg.getCalibrationHistory === 'function' ? state.cfg.getCalibrationHistory() : [];
    const { labs, families } = computeLabSlaMetrics(history);
    const totalCost = labs.reduce((acc, r) => acc + r.custoTotal, 0);
    const maxFamCost = Math.max(1, ...families.map((f) => f.custoTotal || f.envios));
    const fmtBRL = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const backdrop = document.createElement('div');
    backdrop.className = 'vu-backdrop';
    backdrop.dataset.vuModal = '1';
    backdrop.innerHTML = `
      <div class="vu-modal">
        <div class="vu-header">
          <div class="vu-header-left">
            <button type="button" class="vu-btn vu-btn-sm vu-close-btn">&larr; Voltar</button>
            <h3>SLA, Custos & Tendência de Deriva por Família</h3>
          </div>
          <button type="button" class="vu-close">&times;</button>
        </div>
        <div class="vu-body">
          <div class="vu-grid-3" style="margin-bottom:14px;">
            <div class="vu-card"><div style="font-size:11px;color:#94a3b8;">Laboratórios Ativos</div><div style="font-size:22px;font-weight:700;">${labs.length}</div></div>
            <div class="vu-card"><div style="font-size:11px;color:#94a3b8;">Custo Acumulado</div><div style="font-size:22px;font-weight:700;color:#38bdf8;">${fmtBRL(totalCost)}</div></div>
            <div class="vu-card"><div style="font-size:11px;color:#94a3b8;">Envios Atrasados</div><div style="font-size:22px;font-weight:700;color:#fbbf24;">${labs.reduce((a, r) => a + r.atrasados, 0)}</div></div>
          </div>

          <div class="vu-card" style="margin-bottom:14px;">
            <h4 style="margin:0 0 10px;font-size:13.5px;font-weight:700;">Comparativo de Custo & Taxa de Deriva / Reprovação por Família</h4>
            ${families.length ? families.map((f) => {
              const metricVal = f.custoTotal > 0 ? f.custoTotal : f.envios;
              const pct = Math.min(100, Math.round((metricVal / maxFamCost) * 100));
              const derivaNum = Number(f.taxaDeriva);
              const barColor = derivaNum >= 15 ? '#ef4444' : (derivaNum >= 5 ? '#f59e0b' : '#0ea5e9');
              return `
                <div style="margin-bottom:10px;">
                  <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
                    <strong>${escapeHtml(f.family)} <span style="color:#94a3b8;font-weight:400;">(${f.envios} calibrações)</span></strong>
                    <span>${fmtBRL(f.custoTotal)} • Deriva/Reprov.: <strong style="color:${barColor};">${f.taxaDeriva}%</strong></span>
                  </div>
                  <div class="vu-bar-track"><div class="vu-bar-fill" style="width:${pct}%;background:${barColor};"></div></div>
                </div>
              `;
            }).join('') : '<div style="font-size:12px;color:#94a3b8;">Sem histórico de calibração externa para agrupar por família.</div>'}
          </div>

          <div class="vu-table-wrap">
            <table class="vu-table">
              <thead><tr><th>Laboratório</th><th>Envios</th><th>Lead Time</th><th>Atrasados</th><th>Taxa Reprov.</th><th>Custo Total</th><th>Custo Médio</th></tr></thead>
              <tbody>
                ${labs.length ? labs.map((r) => `
                  <tr>
                    <td><strong>${escapeHtml(r.lab)}</strong></td>
                    <td>${r.totalEnvios}</td>
                    <td>${r.leadTimeMedio} dias</td>
                    <td>${r.atrasados > 0 ? `<span class="vu-badge vu-badge-amber">${r.atrasados}</span>` : '0'}</td>
                    <td>${Number(r.taxaReprovacao) > 0 ? `<span class="vu-badge vu-badge-red">${r.taxaReprovacao}%</span>` : '0.0%'}</td>
                    <td>${fmtBRL(r.custoTotal)}</td>
                    <td>${fmtBRL(r.custoMedio)}</td>
                  </tr>
                `).join('') : '<tr><td colspan="7" style="text-align:center;color:#94a3b8;">Sem registros em calibration_history.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop || e.target.classList.contains('vu-close') || e.target.classList.contains('vu-close-btn')) closeModals();
    });
    document.body.appendChild(backdrop);
  }

  async function openAuditLogsModal(fromAdmin = false) {
    if (!state.profile) await loadSessionProfile();
    if (!state.profile) return alert('Sessão inválida. Faça login novamente.');
    closeModals({ keepHistory: true });
    pushModalHistory(Boolean(fromAdmin));

    const token = state.cfg.getSessionToken ? state.cfg.getSessionToken() : '';
    const backdrop = document.createElement('div');
    backdrop.className = 'vu-backdrop';
    backdrop.dataset.vuModal = '1';
    backdrop.innerHTML = `
      <div class="vu-modal">
        <div class="vu-header">
          <div class="vu-header-left">
            <button type="button" class="vu-btn vu-btn-sm vu-back-btn">&larr; Voltar</button>
            <h3>Trilha de Auditoria Imutável (ISO / IATF)</h3>
          </div>
          <button type="button" class="vu-close">&times;</button>
        </div>
        <div class="vu-body">
          <div style="display:flex;gap:8px;margin-bottom:12px;">
            <input id="vu-audit-search" class="vu-input" placeholder="Filtrar por TAG, usuário, tabela ou ação..." />
            <button type="button" id="vu-audit-reload" class="vu-btn vu-btn-primary">Buscar</button>
          </div>
          <div id="vu-audit-body"><div style="color:#94a3b8;">Carregando registros imutáveis...</div></div>
        </div>
      </div>
    `;

    const closeFn = () => closeModals({ reopenAdmin: Boolean(fromAdmin) });
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop || e.target.classList.contains('vu-close')) closeFn();
    });
    backdrop.querySelector('.vu-back-btn').addEventListener('click', closeFn);
    document.body.appendChild(backdrop);

    const bodyEl = backdrop.querySelector('#vu-audit-body');
    const searchEl = backdrop.querySelector('#vu-audit-search');

    async function loadLogs(q = '') {
      try {
        const res = await rpc('voith_list_audit_logs', { p_token: token, p_limit: 120, p_search: q });
        if (!res.ok) {
          bodyEl.innerHTML = `<div class="vu-alert-danger">${escapeHtml(res.error || 'Erro ao carregar logs.')}</div>`;
          return;
        }
        const logs = res.logs || [];
        bodyEl.innerHTML = `
          <div class="vu-table-wrap">
            <table class="vu-table">
              <thead><tr><th>Data / Hora</th><th>Responsável</th><th>Ação</th><th>Entidade</th><th>ID / TAG</th><th>Resumo Alteração</th></tr></thead>
              <tbody>
                ${logs.length ? logs.map((l) => {
                  const summary = l.new_value ? JSON.stringify(l.new_value).slice(0, 90) : (l.old_value ? JSON.stringify(l.old_value).slice(0, 90) : '—');
                  return `
                    <tr>
                      <td style="white-space:nowrap;">${l.created_at ? new Date(l.created_at).toLocaleString('pt-BR') : '—'}</td>
                      <td><strong>${escapeHtml(l.actor_name || l.actor_username || 'Sistema')}</strong></td>
                      <td><span class="vu-badge">${escapeHtml(l.action || '—')}</span></td>
                      <td>${escapeHtml(l.entity_type || '—')}</td>
                      <td><strong>${escapeHtml(l.entity_id || '—')}</strong></td>
                      <td style="font-size:11px;color:#94a3b8;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(summary)}">${escapeHtml(summary)}</td>
                    </tr>
                  `;
                }).join('') : '<tr><td colspan="6" style="text-align:center;color:#94a3b8;">Nenhum evento registrado ainda em audit_logs.</td></tr>'}
              </tbody>
            </table>
          </div>
        `;
      } catch (err) {
        bodyEl.innerHTML = `<div class="vu-alert-danger">Falha ao consultar audit_logs: ${escapeHtml(err.message)}</div>`;
      }
    }

    backdrop.querySelector('#vu-audit-reload').addEventListener('click', () => loadLogs(searchEl.value.trim()));
    searchEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); loadLogs(searchEl.value.trim()); }
    });
    loadLogs('');
  }

  function openModularizerModal(fromAdmin = false) {
    closeModals({ keepHistory: true });
    pushModalHistory(Boolean(fromAdmin));

    const backdrop = document.createElement('div');
    backdrop.className = 'vu-backdrop';
    backdrop.dataset.vuModal = '1';
    backdrop.innerHTML = `
      <div class="vu-modal vu-modal-sm">
        <div class="vu-header">
          <div class="vu-header-left">
            <button type="button" class="vu-btn vu-btn-sm vu-back-btn">&larr; Voltar</button>
            <h3>Modularização Progressiva do index.html</h3>
          </div>
          <button type="button" class="vu-close">&times;</button>
        </div>
        <div class="vu-body" style="display:flex;flex-direction:column;gap:12px;">
          <div class="vu-card" style="font-size:12.5px;line-height:1.5;">
            Gera automaticamente os 3 arquivos separados para você subir no GitHub Web:
            <ul style="margin:8px 0 0 18px;color:#94a3b8;">
              <li><strong>styles/main.css</strong> (CSS principal extraído)</li>
              <li><strong>js/core.js</strong> (lógica JavaScript interna extraída)</li>
              <li><strong>index.html</strong> (enxuto, apontando para os 2 arquivos acima)</li>
            </ul>
          </div>
          <button type="button" id="vu-run-split" class="vu-btn vu-btn-primary">Gerar e Baixar Pacote Modular (3 arquivos)</button>
          <div id="vu-split-status" style="font-size:12px;color:#94a3b8;"></div>
        </div>
      </div>
    `;

    const closeFn = () => closeModals({ reopenAdmin: Boolean(fromAdmin) });
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop || e.target.classList.contains('vu-close')) closeFn();
    });
    backdrop.querySelector('.vu-back-btn').addEventListener('click', closeFn);
    document.body.appendChild(backdrop);

    function downloadTextFile(filename, content, mime = 'text/plain;charset=utf-8') {
      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    }

    backdrop.querySelector('#vu-run-split').addEventListener('click', async () => {
      const statusEl = backdrop.querySelector('#vu-split-status');
      statusEl.textContent = 'Lendo index.html atual...';
      try {
        const res = await fetch('./index.html', { cache: 'no-store' });
        const html = await res.text();

        const cssChunks = [];
        let cleanHtml = html.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (full, inner) => {
          if (full.includes('voith-upgrade-styles')) return '';
          cssChunks.push(inner.trim());
          return '';
        });

        const jsChunks = [];
        cleanHtml = cleanHtml.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (full, attrs, inner) => {
          if (/\bsrc\s*=/.test(attrs)) return full;
          if (inner.includes('VoithUpgrade.init')) return full;
          jsChunks.push(inner.trim());
          return '';
        });

        cleanHtml = cleanHtml.replace('</head>', '    <link rel="stylesheet" href="./styles/main.css?v=16.25.6" />\n</head>');
        cleanHtml = cleanHtml.replace('</body>', '    <script src="./js/core.js?v=16.25.6"></script>\n</body>');

        downloadTextFile('main.css', cssChunks.join('\n\n/* --- */\n\n'), 'text/css;charset=utf-8');
        setTimeout(() => downloadTextFile('core.js', jsChunks.join('\n\n// ---\n\n'), 'application/javascript;charset=utf-8'), 400);
        setTimeout(() => downloadTextFile('index.html', cleanHtml, 'text/html;charset=utf-8'), 800);

        statusEl.innerHTML = `<span style="color:#6ee7b7;">✓ Concluído!</span> Suba <code>main.css</code> na pasta <code>styles/</code>, <code>core.js</code> na pasta <code>js/</code> e substitua o <code>index.html</code> na raiz de <code>metrologia-voith</code>.`;
      } catch (err) {
        statusEl.innerHTML = `<span style="color:#fca5a5;">Erro ao processar: ${escapeHtml(err.message)}</span>`;
      }
    });
  }

  async function openRbacAdminModal(isRefresh = false, activeTab = 'roles') {
    if (!state.profile) await loadSessionProfile();
    if (!state.profile) {
      return alert('Não foi possível validar sua sessão no Supabase. Verifique se você está logado.');
    }
    if (!hasPerm('manage_users') && !hasPerm('manage_roles')) {
      return alert('Seu perfil não possui permissão para gerenciar logins ou hierarquia.');
    }
    closeModals({ keepHistory: true });
    if (!isRefresh) pushModalHistory(true);

    const token = state.cfg.getSessionToken ? state.cfg.getSessionToken() : '';
    let roles = [];
    let users = [];
    try {
      const rRes = await rpc('voith_list_roles', { p_token: token });
      if (rRes.ok) roles = rRes.roles || [];
      if (hasPerm('manage_users')) {
        const uRes = await rpc('voith_list_users', { p_token: token });
        if (uRes.ok) users = uRes.users || [];
      }
    } catch (err) {
      closeModals({ reopenAdmin: true });
      return alert('Erro ao carregar perfis/usuários: ' + err.message);
    }

    const backdrop = document.createElement('div');
    backdrop.className = 'vu-backdrop';
    backdrop.dataset.vuModal = '1';
    backdrop.innerHTML = `
      <div class="vu-modal">
        <div class="vu-header">
          <div class="vu-header-left">
            <button type="button" class="vu-btn vu-btn-sm vu-back-admin">&larr; Voltar</button>
            <h3>Gestão de Logins, Permissões e Hierarquia</h3>
          </div>
          <button type="button" class="vu-close" aria-label="Fechar">&times;</button>
        </div>
        <div class="vu-body">
          <div class="vu-tabs">
            <button type="button" class="vu-tab ${activeTab === 'roles' ? 'active' : ''}" data-tab="roles">Tipos de Login & Hierarquia</button>
            <button type="button" class="vu-tab ${activeTab === 'users' ? 'active' : ''}" data-tab="users">Usuários (Nome, Matrícula, Setor)</button>
          </div>
          <div id="vu-rbac-content"></div>
        </div>
      </div>
    `;

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop || e.target.classList.contains('vu-close')) closeModals({ reopenAdmin: true });
    });
    backdrop.querySelector('.vu-back-admin').addEventListener('click', () => closeModals({ reopenAdmin: true }));
    document.body.appendChild(backdrop);

    const content = backdrop.querySelector('#vu-rbac-content');
    const callerLevel = Number(state.profile?.hierarchy_level || 10);

    function renderUsersTab() {
      const roleOptions = roles
        .filter((r) => callerLevel >= 100 || r.hierarchy_level < callerLevel)
        .map((r) => `<option value="${escapeHtml(r.code)}">${escapeHtml(r.name)} (Nível ${r.hierarchy_level})</option>`)
        .join('');

      content.innerHTML = `
        <div class="vu-card" style="margin-bottom:14px;">
          <h4 style="margin:0 0 10px;font-weight:700;">Cadastrar / Editar Usuário</h4>
          <form id="vu-user-form" autocomplete="off" style="display:flex;flex-direction:column;gap:10px;">
            <div class="vu-grid-3">
              <input class="vu-input" name="username" autocomplete="off" placeholder="Login (ex: joao.silva)" required />
              <input class="vu-input" name="display_name" autocomplete="off" placeholder="Nome Completo" required />
              <input class="vu-input" name="matricula" autocomplete="off" placeholder="Matrícula (ex: 12345)" required />
            </div>
            <div class="vu-grid-3">
              <input class="vu-input" name="setor" autocomplete="off" placeholder="Setor (ex: Usinagem / Turbo)" required />
              <select class="vu-select" name="role_code">${roleOptions}</select>
              <input class="vu-input" name="password" type="password" autocomplete="new-password" placeholder="Senha (vazio = manter atual)" />
            </div>
            <div style="display:flex;justify-content:flex-end;">
              <button class="vu-btn vu-btn-primary" type="submit">Salvar Usuário</button>
            </div>
          </form>
        </div>
        <div class="vu-table-wrap">
          <table class="vu-table">
            <thead><tr><th>Login</th><th>Nome</th><th>Matrícula</th><th>Setor</th><th>Tipo de Login</th><th>Nível</th></tr></thead>
            <tbody>
              ${users.map((u) => `
                <tr>
                  <td><strong>${escapeHtml(u.username)}</strong></td>
                  <td>${escapeHtml(u.display_name)}</td>
                  <td>${escapeHtml(u.matricula || '—')}</td>
                  <td>${escapeHtml(u.setor || '—')}</td>
                  <td><span class="vu-badge">${escapeHtml(u.role_name || u.role_code)}</span></td>
                  <td>${u.hierarchy_level}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;

      content.querySelector('#vu-user-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const payload = Object.fromEntries(fd.entries());
        try {
          const res = await rpc('voith_upsert_user_profile', { p_token: token, p_user: payload });
          if (!res.ok) return alert(res.error || 'Erro ao salvar usuário.');
          alert('Usuário salvo com sucesso!');
          openRbacAdminModal(true, 'users');
        } catch (err) {
          alert('Erro ao salvar usuário: ' + err.message);
        }
      });
    }

    function renderRolesTab() {
      const canManageRoles = hasPerm('manage_roles');
      content.innerHTML = `
        ${canManageRoles ? `
        <div class="vu-card" style="margin-bottom:14px;">
          <h4 style="margin:0 0 10px;font-weight:700;">Criar / Editar Tipo de Login</h4>
          <form id="vu-role-form" style="display:flex;flex-direction:column;gap:10px;">
            <div class="vu-grid-3">
              <input class="vu-input" name="code" placeholder="Código (ex: LIDER_USINAGEM)" required />
              <input class="vu-input" name="name" placeholder="Nome de Exibição" required />
              <input class="vu-input" name="hierarchy_level" type="number" min="1" max="${callerLevel >= 100 ? 99 : callerLevel - 1}" value="20" placeholder="Hierarquia (1-99)" required />
            </div>
            <input class="vu-input" name="description" placeholder="Descrição breve das responsabilidades" />
            <div class="vu-perm-grid">
              ${Object.entries(PERMISSION_LABELS).map(([k, label]) => `
                <label class="vu-perm-item">
                  <input type="checkbox" name="perm_${k}" ${k === 'view_instruments' || k === 'request_cautela' ? 'checked' : ''} />
                  <span>${escapeHtml(label)}</span>
                </label>
              `).join('')}
            </div>
            <div style="display:flex;justify-content:flex-end;">
              <button class="vu-btn vu-btn-primary" type="submit">Salvar Tipo de Login</button>
            </div>
          </form>
        </div>` : '<p style="color:#94a3b8;">Apenas perfis com permissão de gestão de papéis podem criar novos tipos de login.</p>'}
        <div class="vu-table-wrap">
          <table class="vu-table">
            <thead><tr><th>Código</th><th>Nome</th><th>Hierarquia</th><th>Permissões Ativas</th></tr></thead>
            <tbody>
              ${roles.map((r) => {
                const activePerms = Object.entries(r.permissions || {}).filter(([, v]) => v).length;
                return `
                  <tr>
                    <td><strong>${escapeHtml(r.code)}</strong></td>
                    <td>${escapeHtml(r.name)}<div style="font-size:11px;color:#94a3b8;">${escapeHtml(r.description || '')}</div></td>
                    <td><span class="vu-badge">Nível ${r.hierarchy_level}</span></td>
                    <td>${activePerms} permissões</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;

      const rForm = content.querySelector('#vu-role-form');
      if (rForm) {
        rForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target);
          const perms = {};
          Object.keys(PERMISSION_LABELS).forEach((k) => { perms[k] = fd.get(`perm_${k}`) === 'on'; });
          const payload = {
            code: fd.get('code'),
            name: fd.get('name'),
            description: fd.get('description'),
            hierarchy_level: Number(fd.get('hierarchy_level')),
            permissions: perms
          };
          try {
            const res = await rpc('voith_upsert_role', { p_token: token, p_role: payload });
            if (!res.ok) return alert(res.error || 'Erro ao salvar tipo de login.');
            alert('Tipo de login salvo com sucesso!');
            openRbacAdminModal(true, 'roles');
          } catch (err) {
            alert('Erro ao salvar tipo de login: ' + err.message);
          }
        });
      }
    }

    backdrop.querySelectorAll('.vu-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        backdrop.querySelectorAll('.vu-tab').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        if (btn.dataset.tab === 'users') renderUsersTab();
        else renderRolesTab();
      });
    });

    if (activeTab === 'users') renderUsersTab();
    else renderRolesTab();
  }

  async function openQuickMenu() {
    if (!state.profile) await loadSessionProfile();
    closeModals({ keepHistory: true });
    pushModalHistory(false);
    const prof = state.profile;
    const backdrop = document.createElement('div');
    backdrop.className = 'vu-backdrop';
    backdrop.dataset.vuModal = '1';
    backdrop.innerHTML = `
      <div class="vu-modal vu-modal-sm">
        <div class="vu-header">
          <h3>Central Voith Metrologia</h3>
          <button type="button" class="vu-close">&times;</button>
        </div>
        <div class="vu-body" style="display:flex;flex-direction:column;gap:10px;">
          ${prof ? `
            <div class="vu-card">
              <strong>${escapeHtml(prof.display_name)}</strong>
              <span class="vu-badge" style="margin-left:6px;">${escapeHtml(prof.role_name)} (Nível ${prof.hierarchy_level})</span>
              <div style="font-size:12px;color:#94a3b8;margin-top:4px;">
                Matrícula: ${escapeHtml(prof.matricula || '—')} • Setor: ${escapeHtml(prof.setor || '—')}
              </div>
            </div>
          ` : '<div class="vu-card" style="font-size:12px;color:#fcd34d;">Sessão ainda não vinculada ao perfil RBAC.</div>'}
          <button type="button" class="vu-btn vu-btn-primary" id="vu-act-cautela">📋 Nova Cautela (com Trava Metrológica)</button>
          <button type="button" class="vu-btn vu-btn-warn" id="vu-act-nc">⚠️ Análise de Impacto Retroativo (Reprovados)</button>
          ${hasPerm('view_sla_costs') ? '<button type="button" class="vu-btn" id="vu-act-sla">📊 SLA, Custos & Tendência de Deriva</button>' : ''}
          ${(hasPerm('manage_users') || hasPerm('manage_roles')) ? '<button type="button" class="vu-btn" id="vu-act-rbac">🔐 Logins, Permissões e Hierarquia</button>' : ''}
          <button type="button" class="vu-btn" id="vu-act-audit">🛡️ Trilha de Auditoria Imutável</button>
        </div>
      </div>
    `;
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop || e.target.classList.contains('vu-close')) closeModals();
    });
    document.body.appendChild(backdrop);

    backdrop.querySelector('#vu-act-cautela').onclick = () => openCautelaModal('');
    backdrop.querySelector('#vu-act-nc').onclick = () => openRetroactiveImpactModal('');
    const slaBtn = backdrop.querySelector('#vu-act-sla');
    if (slaBtn) slaBtn.onclick = openLabSlaModal;
    const rbacBtn = backdrop.querySelector('#vu-act-rbac');
    if (rbacBtn) rbacBtn.onclick = () => openRbacAdminModal(false, 'roles');
    backdrop.querySelector('#vu-act-audit').onclick = () => openAuditLogsModal(false);
  }

  function sendTelemetryError(eventType, message, stack) {
    const key = `${eventType}:${message}`;
    const now = Date.now();
    if (state.errorBurstCache.has(key) && now - state.errorBurstCache.get(key) < 30000) return;
    state.errorBurstCache.set(key, now);
    const payload = {
      event_type: eventType,
      app_version: state.cfg.appVersion || 'unknown',
      screen: typeof state.cfg.getCurrentScreen === 'function' ? state.cfg.getCurrentScreen() : location.hash || '/',
      message: String(message || 'Erro desconhecido'),
      stack: String(stack || ''),
      user_agent: navigator.userAgent,
      meta: { ota_channel: state.otaChannel, online: navigator.onLine }
    };
    if (!navigator.onLine) {
      const q = JSON.parse(localStorage.getItem('voith_telemetry_queue') || '[]');
      q.push(payload);
      localStorage.setItem('voith_telemetry_queue', JSON.stringify(q.slice(-25)));
      return;
    }
    const token = state.cfg.getSessionToken ? state.cfg.getSessionToken() : '';
    rpc('voith_log_telemetry', { p_token: token, p_payload: payload }).catch(() => {});
  }

  function setupErrorTelemetry() {
    window.addEventListener('error', (ev) => {
      sendTelemetryError('window_onerror', ev.message, ev.error?.stack || `${ev.filename}:${ev.lineno}:${ev.colno}`);
    });
    window.addEventListener('unhandledrejection', (ev) => {
      const reason = ev.reason;
      sendTelemetryError('unhandled_rejection', reason?.message || String(reason), reason?.stack || '');
    });
  }

  async function loadSessionProfile() {
    const token = state.cfg.getSessionToken ? state.cfg.getSessionToken() : '';
    if (!token) return null;
    try {
      const res = await rpc('voith_get_session_profile', { p_token: token });
      if (res.ok && res.profile) {
        state.profile = res.profile;
        document.querySelectorAll('[data-permission]').forEach((el) => {
          const required = el.getAttribute('data-permission');
          el.style.display = hasPerm(required) ? '' : 'none';
        });
        return state.profile;
      }
    } catch (e) {
      console.warn('VoithUpgrade loadSessionProfile:', e.message);
    }
    return null;
  }

  function init(config = {}) {
    state.cfg = config;
    injectStyles();
    injectAppHooks();
    setupHistoryBackHandler();
    setupOfflineMonitors();
    setupErrorTelemetry();
    loadSessionProfile();
  }

  global.VoithUpgrade = {
    init,
    loadSessionProfile,
    hasPerm,
    getProfile: () => state.profile,
    setPendingMutations,
    openCautelaModal,
    openRetroactiveImpactModal,
    openRbacAdminModal,
    openLabSlaModal,
    openAuditLogsModal,
    openModularizerModal,
    openQuickMenu,
    getOtaChannel: () => state.otaChannel
  };
})(window);