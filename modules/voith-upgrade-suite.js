/**
 * ============================================================================
 * VOITH METROLOGIA — Upgrade Suite v5.2
 * - Trava automática para instrumento Vencido / Reprovado / Em Laboratório
 * - Próxima Calibração ao devolver cautela "Aguardando calibração"
 * - Análise de Risco & Impacto Retroativo (Non-Conformance)
 * - Gráfico de Tendência de Deriva & Custo por Família + Taxa de Reprovação
 * - Visualizador da Trilha de Auditoria Imutável (audit_logs)
 * - Extrator Modular do index.html (gera styles/main.css e js/core.js)
 * - Gesto voltar Android/Capacitor + Rolagem horizontal de abas no modal
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
    state.blockExitUntil = Date.now() + 2000;
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

  function setupHistoryBackHandler() {
    guardCapacitorExitApp();
    const onBack = (e) => { handleMobileBackEvent(e); };
    document.addEventListener('backbutton', onBack, true);
    window.addEventListener('backbutton', onBack, true);

    const
