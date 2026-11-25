/**
 * ============================================================================
 * VOITH METROLOGIA — Upgrade Suite v6.2 (Operação de Campo & Planejamento)
 * - Pré-cadastro de Lote para Envio Externo & Romaneio (totais, setores, armários)
 * - Alerta de Proximidade de Vencimento por Janela de Dias (7, 15, 30, 60 dias)
 * - Painel de Pendências do Colaborador (cautelas abertas, prazos e troca de turno)
 * - Mantém Menu Lateral PC / Bottom Sheet Mobile, Toasts, Command Palette e RBAC
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

  const DEFAULT_ROLES = [
    {
      code: 'ADMIN',
      name: 'Administrador',
      hierarchy_level: 100,
      description: 'Acesso total ao sistema, hierarquia, auditoria e configurações.',
      permissions: Object.fromEntries(Object.keys(PERMISSION_LABELS).map((k) => [k, true]))
    },
    {
      code: 'LIDER_METROLOGIA',
      name: 'Líder / Metrologia',
      hierarchy_level: 60,
      description: 'Gerencia calibrações, libera bloqueios e acompanha SLA/deriva.',
      permissions: {
        view_instruments: true, edit_instruments: true, bulk_actions: true,
        manage_calibrations: true, view_sla_costs: true, request_cautela: true,
        approve_cautela: true, override_cautela_holder: true, manage_users: true
      }
    },
    {
      code: 'TECNICO_OPERADOR',
      name: 'Técnico / Operador',
      hierarchy_level: 20,
      description: 'Consulta instrumentos e registra cautelas de uso.',
      permissions: {
        view_instruments: true, request_cautela: true
      }
    }
  ];

  const state = {
    cfg: {},
    profile: null,
    pendingMutations: 0,
    syncing: false,
    errorBurstCache: new Map(),
    otaChannel: localStorage.getItem('voith_ota_channel') || 'stable',
    modalStack: [],
    activeInlineTab: null,
    blockExitUntil: 0
  };

  function ensureMobileMeta() {
    let vp = document.querySelector('meta[name="viewport"]');
    if (vp) {
      const content = vp.getAttribute('content') || '';
      if (!content.includes('viewport-fit=cover')) {
        vp.setAttribute('content', content ? `${content}, viewport-fit=cover` : 'width=device-width, initial-scale=1.0, viewport-fit=cover');
      }
    } else {
      vp = document.createElement('meta');
      vp.name = 'viewport';
      vp.content = 'width=device-width, initial-scale=1.0, viewport-fit=cover';
      document.head.appendChild(vp);
    }

    if (!document.querySelector('meta[name="mobile-web-app-capable"]')) {
      const m = document.createElement('meta');
      m.name = 'mobile-web-app-capable';
      m.content = 'yes';
      document.head.appendChild(m);
    }
  }

  function haptic(kind = 'light') {
    const plugin = global.Capacitor && global.Capacitor.Plugins && global.Capacitor.Plugins.Haptics;
    if (plugin) {
      try {
        if (kind === 'success' && typeof plugin.notification === 'function') {
          plugin.notification({ type: 'SUCCESS' });
          return;
        }
        if (kind === 'error' && typeof plugin.notification === 'function') {
          plugin.notification({ type: 'ERROR' });
          return;
        }
        if (kind === 'warn' && typeof plugin.notification === 'function') {
          plugin.notification({ type: 'WARNING' });
          return;
        }
        if (typeof plugin.impact === 'function') {
          plugin.impact({ style: kind === 'medium' ? 'MEDIUM' : 'LIGHT' });
          return;
        }
      } catch (_) {}
    }

    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        if (kind === 'success') navigator.vibrate([12, 35, 18]);
        else if (kind === 'error') navigator.vibrate([25, 40, 25]);
        else if (kind === 'medium') navigator.vibrate(18);
        else navigator.vibrate(10);
      } catch (_) {}
    }
  }

  function resolveSupabaseConfig() {
    const url = state.cfg.supabaseUrl
      || global.SUPABASE_URL
      || global.VOITH_SUPABASE_URL
      || (global.VoithCloud && global.VoithCloud.url)
      || localStorage.getItem('voith_supabase_url')
      || '';
    const key = state.cfg.supabaseAnonKey
      || global.SUPABASE_ANON_KEY
      || global.VOITH_SUPABASE_ANON_KEY
      || (global.VoithCloud && global.VoithCloud.anonKey)
      || localStorage.getItem('voith_supabase_key')
      || '';
    return { supabaseUrl: url, supabaseAnonKey: key };
  }

  function resolveSessionToken() {
    if (typeof state.cfg.getSessionToken === 'function') {
      const t = state.cfg.getSessionToken();
      if (t) return t;
    }
    return localStorage.getItem('voith_session_token')
      || localStorage.getItem('voith_token')
      || sessionStorage.getItem('voith_session_token')
      || '';
  }

  async function rpc(fnName, params = {}) {
    const { supabaseUrl, supabaseAnonKey } = resolveSupabaseConfig();
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Credenciais do Supabase não configuradas nesta sessão.');
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
    if (!state.profile) return true;
    if (Number(state.profile.hierarchy_level) >= 100) return true;
    if (!state.profile.permissions) return true;
    return Boolean(state.profile.permissions[permKey]);
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

  function debounce(fn, wait = 160) {
    let t = null;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  function getAllInstruments() {
    if (typeof state.cfg.getInstruments === 'function') {
      const list = state.cfg.getInstruments();
      if (Array.isArray(list) && list.length) return list;
    }
    if (global.VoithDB && global.VoithDB.state && Array.isArray(global.VoithDB.state.instruments)) {
      return global.VoithDB.state.instruments;
    }
    if (Array.isArray(global.instruments)) return global.instruments;
    if (Array.isArray(global.DB)) return global.DB;
    return [];
  }

  function getInstrumentCode(i) {
    return String(i?.code || i?.tag || i?.codigo || i?.Instrumento || i?.id || '').trim().toUpperCase();
  }

  function getInstrumentDesc(i) {
    return String(i?.desc || i?.descricao || i?.['Descrição'] || i?.instrumentDesc || i?.nome || 'Sem descrição').trim();
  }

  function getInstrumentSector(i) {
    return String(i?.sector || i?.setor || i?.Setor || i?.area || 'Sem setor').trim();
  }

  function getInstrumentCabinet(i) {
    return String(i?.armario || i?.cabinet || i?.local || i?.Armário || i?.location || 'Sem armário').trim();
  }

  function getInstrumentDueRaw(i) {
    return i?.proxCal || i?.proxima_calibracao || i?.dueDate || i?.['Data da Próxima Calibração'] || i?.vencimento || '';
  }

  function findInstrumentByTag(tag) {
    const clean = String(tag ?? '').trim().toUpperCase();
    if (!clean) return null;
    return getAllInstruments().find((i) => getInstrumentCode(i) === clean) || null;
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
    const dueRaw = getInstrumentDueRaw(inst);
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

  function getOpenCustodies() {
    let rawList = [];
    if (typeof state.cfg.getCustodies === 'function') {
      const c = state.cfg.getCustodies();
      if (Array.isArray(c)) rawList = c;
    }
    if (!rawList.length && global.VoithDB && global.VoithDB.state && Array.isArray(global.VoithDB.state.custodies)) {
      rawList = global.VoithDB.state.custodies;
    }
    if (!rawList.length && Array.isArray(global.custodies)) rawList = global.custodies;

    return rawList.filter((item) => {
      if (!item) return false;
      if (item.returned === true || item.returned_at || item.data_retorno || item.return_date) return false;
      const st = normText(item.status || item.situacao || item.estado || '');
      if (st.includes('devolvid') || st.includes('encerrad') || st.includes('finalizad') || st.includes('fechad')) return false;
      return true;
    });
  }

  /* -------------------------------------------------------------------------
   * Toasts, Confirmação e Skeleton Loaders
   * ------------------------------------------------------------------------- */
  function showToast(message, type = 'info', duration = 3800) {
    let box = document.getElementById('vu-toast-stack');
    if (!box) {
      box = document.createElement('div');
      box.id = 'vu-toast-stack';
      document.body.appendChild(box);
    }

    const icons = { success: '✓', error: '✕', warn: '⚠', info: 'ℹ' };
    const el = document.createElement('div');
    el.className = `vu-toast vu-toast-${type}`;
    el.setAttribute('role', 'status');
    el.innerHTML = `
      <span class="vu-toast-ico">${icons[type] || icons.info}</span>
      <span class="vu-toast-msg">${escapeHtml(message)}</span>
      <button type="button" class="vu-toast-x" aria-label="Fechar">&times;</button>
    `;

    const dismiss = () => {
      if (el.dataset.closing) return;
      el.dataset.closing = '1';
      el.classList.remove('vu-toast-in');
      setTimeout(() => el.remove(), 220);
    };

    el.querySelector('.vu-toast-x').onclick = dismiss;
    box.appendChild(el);
    requestAnimationFrame(() => el.classList.add('vu-toast-in'));

    if (type === 'success') haptic('success');
    else if (type === 'error') haptic('error');
    else if (type === 'warn') haptic('warn');
    else haptic('light');

    if (duration > 0) setTimeout(dismiss, duration);
    return dismiss;
  }

  function installFriendlyAlert() {
    if (global.__vuNativeAlert) return;
    global.__vuNativeAlert = typeof global.alert === 'function' ? global.alert.bind(global) : () => {};
    global.alert = function (msg) {
      const text = String(msg ?? '').trim();
      if (!text) return;
      const low = normText(text);
      let type = 'info';
      if (/erro|falha|invalido|invalida|nao tem permissao|nao possui permissao|bloquead|negad|nao localizad/.test(low)) type = 'error';
      else if (/sucesso|salvo|salva|registrad|concluid|atualizad|enviado/.test(low)) type = 'success';
      else if (/atencao|aviso|alerta|vencid|reprovad|offline/.test(low)) type = 'warn';
      showToast(text, type);
    };
  }

  function showConfirm({ title = 'Confirmar ação', message = '', confirmText = 'Confirmar', cancelText = 'Cancelar', danger = false } = {}) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (val) => {
        if (settled) return;
        settled = true;
        closeOverlayById('vu-confirm-dialog', true);
        resolve(val);
      };

      const backdrop = document.createElement('div');
      backdrop.className = 'vu-backdrop';
      backdrop.innerHTML = `
        <div class="vu-modal vu-modal-xs" role="alertdialog" aria-modal="true">
          <div class="vu-sheet-handle"></div>
          <div class="vu-header">
            <h3>${escapeHtml(title)}</h3>
            <button type="button" class="vu-close" aria-label="Fechar">&times;</button>
          </div>
          <div class="vu-body" style="padding:18px;">
            <p style="margin:0 0 18px;font-size:13.5px;line-height:1.55;color:var(--vu-muted-text);">${escapeHtml(message)}</p>
            <div style="display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;">
              <button type="button" class="vu-btn vu-cfm-cancel">${escapeHtml(cancelText)}</button>
              <button type="button" class="vu-btn ${danger ? 'vu-btn-danger' : 'vu-btn-primary'} vu-cfm-ok">${escapeHtml(confirmText)}</button>
            </div>
          </div>
        </div>
      `;

      backdrop.querySelector('.vu-close').onclick = () => finish(false);
      backdrop.querySelector('.vu-cfm-cancel').onclick = () => finish(false);
      backdrop.querySelector('.vu-cfm-ok').onclick = () => { haptic('medium'); finish(true); };

      openOverlay({ id: 'vu-confirm-dialog', element: backdrop, onClose: () => finish(false) });
    });
  }

  function skeletonCardsHtml(cards = 3, rows = 4) {
    return `
      <div class="vu-skel-wrap" aria-busy="true">
        <div class="vu-grid-3" style="margin-bottom:14px;">
          ${Array.from({ length: cards }).map(() => `
            <div class="vu-card">
              <div class="vu-skel" style="width:48%;height:11px;margin-bottom:10px;"></div>
              <div class="vu-skel" style="width:72%;height:24px;"></div>
            </div>
          `).join('')}
        </div>
        <div class="vu-card" style="display:flex;flex-direction:column;gap:12px;">
          ${Array.from({ length: rows }).map(() => `
            <div style="display:grid;grid-template-columns:1.1fr 2fr 1fr;gap:10px;">
              <div class="vu-skel" style="height:14px;"></div>
              <div class="vu-skel" style="height:14px;"></div>
              <div class="vu-skel" style="height:14px;"></div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  /* -------------------------------------------------------------------------
   * Estilos
   * ------------------------------------------------------------------------- */
  function injectStyles() {
    let style = document.getElementById('voith-upgrade-styles');
    if (!style) {
      style = document.createElement('style');
      style.id = 'voith-upgrade-styles';
      document.head.appendChild(style);
    }
    style.textContent = `
      :root {
        --vu-safe-top: env(safe-area-inset-top, 0px);
        --vu-safe-bottom: env(safe-area-inset-bottom, 0px);
        --vu-safe-left: env(safe-area-inset-left, 0px);
        --vu-safe-right: env(safe-area-inset-right, 0px);
        --vu-bg: #ffffff;
        --vu-surface: #f8fafc;
        --vu-header-bg: #0b1628;
        --vu-border: #e2e8f0;
        --vu-text: #0f172a;
        --vu-muted-text: #475569;
        --vu-input-bg: #ffffff;
        --vu-accent: #0284c7;
        --vu-skel-a: #e2e8f0;
        --vu-skel-b: #f1f5f9;
        --vu-ease: cubic-bezier(0.22, 1, 0.36, 1);
      }

      html.dark, body.dark {
        --vu-bg: #0f172a;
        --vu-surface: #111c30;
        --vu-header-bg: #0b1628;
        --vu-border: #334155;
        --vu-text: #f8fafc;
        --vu-muted-text: #94a3b8;
        --vu-input-bg: #0b1220;
        --vu-skel-a: #1e293b;
        --vu-skel-b: #334155;
      }

      body {
        padding-top: var(--vu-safe-top);
        padding-bottom: var(--vu-safe-bottom);
        padding-left: var(--vu-safe-left);
        padding-right: var(--vu-safe-right);
        overscroll-behavior-y: contain;
      }

      @media (min-width: 769px) {
        #adminUsersModal > div {
          max-width: 1120px !important;
          width: min(95vw, 1120px) !important;
        }
        .vu-admin-workspace {
          display: flex !important;
          flex-direction: row !important;
          align-items: stretch !important;
          min-height: 540px !important;
          max-height: 78vh !important;
          padding: 0 !important;
          gap: 0 !important;
        }
        .vu-admin-sidebar {
          display: flex !important;
          flex-direction: column !important;
          flex-wrap: nowrap !important;
          width: 248px !important;
          min-width: 248px !important;
          flex-shrink: 0 !important;
          padding: 14px 10px !important;
          gap: 4px !important;
          margin: 0 !important;
          border-bottom: none !important;
          border-right: 1px solid var(--vu-border) !important;
          background: var(--vu-surface) !important;
          overflow-y: auto !important;
          overflow-x: hidden !important;
        }
        .vu-admin-sidebar > button {
          width: 100% !important;
          text-align: left !important;
          justify-content: flex-start !important;
          display: flex !important;
          align-items: center !important;
          gap: 8px !important;
          padding: 10px 12px !important;
          border-radius: 10px !important;
          font-size: 13px !important;
          line-height: 1.3 !important;
          white-space: normal !important;
          transition: background 0.16s ease, color 0.16s ease !important;
        }
        .vu-admin-sidebar > button:hover { background: rgba(2, 132, 199, 0.12) !important; }
        .vu-admin-sidebar > button.vu-sidebar-active {
          background: rgba(2, 132, 199, 0.18) !important;
          color: #0284c7 !important;
          font-weight: 700 !important;
          box-shadow: inset 3px 0 0 #0284c7 !important;
        }
        html.dark .vu-admin-sidebar > button.vu-sidebar-active {
          color: #7dd3fc !important;
          box-shadow: inset 3px 0 0 #38bdf8 !important;
        }
        .vu-admin-stage {
          flex: 1 1 auto !important;
          min-width: 0 !important;
          padding: 18px 22px !important;
          overflow-y: auto !important;
          background: var(--vu-bg) !important;
          color: var(--vu-text) !important;
        }
      }

      @media (max-width: 768px) {
        #adminUsersModal {
          align-items: flex-end !important;
          justify-content: center !important;
          padding: 0 !important;
        }
        #adminUsersModal > div {
          width: 100% !important;
          max-width: 100% !important;
          max-height: 90vh !important;
          margin: 0 !important;
          border-radius: 22px 22px 0 0 !important;
          padding-bottom: var(--vu-safe-bottom) !important;
          animation: vuSheetUp 0.24s var(--vu-ease) both;
          overflow: hidden !important;
          display: flex !important;
          flex-direction: column !important;
        }
        .vu-admin-workspace {
          display: flex !important;
          flex-direction: column !important;
          flex: 1 1 auto !important;
          min-height: 0 !important;
          overflow: hidden !important;
          padding: 0 !important;
        }
        .vu-admin-sidebar {
          display: flex !important;
          flex-direction: row !important;
          flex-wrap: nowrap !important;
          overflow-x: auto !important;
          overflow-y: hidden !important;
          -webkit-overflow-scrolling: touch !important;
          scrollbar-width: none !important;
          gap: 6px !important;
          padding: 10px 12px !important;
          margin: 0 !important;
          border-bottom: 1px solid var(--vu-border) !important;
          background: var(--vu-surface) !important;
          flex-shrink: 0 !important;
        }
        .vu-admin-sidebar::-webkit-scrollbar { display: none; }
        .vu-admin-sidebar > button {
          white-space: nowrap !important;
          flex-shrink: 0 !important;
          border-radius: 999px !important;
          padding: 8px 13px !important;
          font-size: 12.5px !important;
        }
        .vu-admin-sidebar > button.vu-sidebar-active {
          background: #0284c7 !important;
          color: #ffffff !important;
        }
        .vu-admin-stage {
          flex: 1 1 auto !important;
          overflow-y: auto !important;
          padding: 14px 14px calc(18px + var(--vu-safe-bottom)) !important;
          -webkit-overflow-scrolling: touch !important;
          color: var(--vu-text) !important;
        }
      }

      @keyframes vuSheetUp {
        from { transform: translateY(36px); opacity: 0.4; }
        to { transform: translateY(0); opacity: 1; }
      }

      .vu-backdrop {
        position: fixed; inset: 0; z-index: 9800;
        background: rgba(6, 11, 20, 0.72);
        backdrop-filter: blur(5px);
        display: flex; align-items: flex-start; justify-content: center;
        padding: calc(32px + var(--vu-safe-top)) 14px calc(24px + var(--vu-safe-bottom));
        overflow-y: auto;
        opacity: 0;
        transition: opacity 0.18s ease;
      }
      .vu-backdrop.vu-open { opacity: 1; }

      .vu-modal {
        width: 100%; max-width: 960px;
        background: var(--vu-bg); color: var(--vu-text);
        border: 1px solid var(--vu-border); border-radius: 16px;
        overflow: hidden;
        box-shadow: 0 24px 64px rgba(0, 0, 0, 0.48);
        font-family: system-ui, -apple-system, sans-serif;
        transform: translateY(14px) scale(0.985);
        transition: transform 0.22s var(--vu-ease);
      }
      .vu-backdrop.vu-open .vu-modal { transform: translateY(0) scale(1); }
      .vu-modal-sm { max-width: 660px; }
      .vu-modal-xs { max-width: 440px; }
      .vu-sheet-handle { display: none; }

      @media (max-width: 768px) {
        .vu-backdrop { align-items: flex-end; padding: 0; overflow-y: hidden; }
        .vu-modal, .vu-modal-sm, .vu-modal-xs {
          max-width: 100%; max-height: 90vh;
          border-radius: 22px 22px 0 0;
          border-left: none; border-right: none; border-bottom: none;
          display: flex; flex-direction: column;
          transform: translateY(100%);
        }
        .vu-backdrop.vu-open .vu-modal { transform: translateY(0); }
        .vu-sheet-handle {
          display: block; width: 40px; height: 4px; border-radius: 999px;
          background: rgba(148, 163, 184, 0.45); margin: 10px auto 2px; flex-shrink: 0;
        }
        .vu-body { flex: 1 1 auto; max-height: none; padding-bottom: calc(20px + var(--vu-safe-bottom)) !important; }
      }

      .vu-header {
        display: flex; align-items: center; justify-content: space-between; gap: 10px;
        padding: 14px 16px; background: var(--vu-header-bg); color: #f8fafc;
        border-bottom: 1px solid rgba(148, 163, 184, 0.2);
      }
      .vu-header-left { display: flex; align-items: center; gap: 10px; min-width: 0; }
      .vu-header h3 { margin: 0; font-size: 15px; font-weight: 700; color: #f8fafc; }
      .vu-close {
        background: transparent; border: none; color: #cbd5e1;
        font-size: 22px; line-height: 1; cursor: pointer; flex-shrink: 0;
        width: 32px; height: 32px; border-radius: 8px;
      }
      .vu-close:hover { background: rgba(255,255,255,0.1); color: #fff; }
      .vu-body { padding: 16px; max-height: 78vh; overflow-y: auto; -webkit-overflow-scrolling: touch; }

      .vu-input, .vu-select, .vu-textarea {
        width: 100%; box-sizing: border-box; padding: 9px 11px; border-radius: 9px;
        border: 1px solid var(--vu-border); background: var(--vu-input-bg);
        color: var(--vu-text); font-size: 13px;
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
      }
      .vu-input:focus, .vu-select:focus, .vu-textarea:focus {
        outline: none; border-color: #0ea5e9; box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.18);
      }
      .vu-input:disabled { opacity: 0.72; cursor: not-allowed; }

      .vu-btn {
        padding: 8px 14px; border-radius: 9px; border: 1px solid var(--vu-border);
        background: var(--vu-surface); color: var(--vu-text);
        font: 600 13px/1.2 system-ui, sans-serif; cursor: pointer;
        transition: transform 0.1s ease, background 0.15s ease, opacity 0.15s ease;
      }
      .vu-btn:hover { opacity: 0.92; }
      .vu-btn:active { transform: scale(0.97); }
      .vu-btn:disabled { opacity: 0.45; cursor: not-allowed; }
      .vu-btn-sm { padding: 6px 10px; font-size: 12px; white-space: nowrap; flex-shrink: 0; }
      .vu-btn-primary { background: #0284c7; border-color: #0284c7; color: #fff; }
      .vu-btn-primary:hover { background: #0369a1; }
      .vu-btn-success { background: #059669; border-color: #059669; color: #fff; }
      .vu-btn-danger { background: #dc2626; border-color: #dc2626; color: #fff; }
      .vu-btn-warn { background: #d97706; border-color: #d97706; color: #fff; }

      .vu-grid-2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
      .vu-grid-3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
      .vu-grid-4 { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
      @media (max-width: 768px) { .vu-grid-4 { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      @media (max-width: 640px) { .vu-grid-2, .vu-grid-3, .vu-grid-4, .vu-perm-grid { grid-template-columns: 1fr; } }

      .vu-card {
        background: var(--vu-surface); border: 1px solid var(--vu-border);
        border-radius: 12px; padding: 14px;
      }
      .vu-alert-danger {
        background: rgba(220, 38, 38, 0.12); border: 1px solid rgba(239, 68, 68, 0.55);
        color: #b91c1c; border-radius: 10px; padding: 12px; font-size: 12.5px;
      }
      html.dark .vu-alert-danger { color: #fecaca; background: rgba(153, 27, 27, 0.28); }
      .vu-alert-warn {
        background: rgba(217, 119, 6, 0.12); border: 1px solid rgba(245, 158, 11, 0.55);
        color: #92400e; border-radius: 10px; padding: 12px; font-size: 12.5px;
      }
      html.dark .vu-alert-warn { color: #fde68a; background: rgba(146, 64, 14, 0.28); }

      .vu-badge {
        display: inline-block; padding: 3px 9px; border-radius: 999px;
        font-size: 11px; font-weight: 600; background: rgba(2, 132, 199, 0.14); color: #0284c7;
      }
      html.dark .vu-badge { background: #1e3a5f; color: #7dd3fc; }
      .vu-badge-green { background: rgba(16, 185, 129, 0.15); color: #047857; }
      html.dark .vu-badge-green { background: #064e3b; color: #6ee7b7; }
      .vu-badge-amber { background: rgba(245, 158, 11, 0.16); color: #b45309; }
      html.dark .vu-badge-amber { background: #451a03; color: #fcd34d; }
      .vu-badge-red { background: rgba(239, 68, 68, 0.16); color: #b91c1c; }
      html.dark .vu-badge-red { background: #7f1d1d; color: #fca5a5; }

      .vu-tabs {
        display: flex; gap: 8px; margin-bottom: 14px; border-bottom: 1px solid var(--vu-border);
        padding-bottom: 10px; overflow-x: auto; scrollbar-width: none;
      }
      .vu-tabs::-webkit-scrollbar { display: none; }
      .vu-tab {
        background: transparent; border: none; color: var(--vu-muted-text); font-weight: 600;
        padding: 7px 13px; cursor: pointer; border-radius: 8px; white-space: nowrap; flex-shrink: 0;
      }
      .vu-tab.active { background: #0284c7; color: #fff; }

      .vu-window-pills { display: flex; gap: 6px; flex-wrap: wrap; }
      .vu-win-pill {
        padding: 6px 12px; border-radius: 999px; border: 1px solid var(--vu-border);
        background: var(--vu-input-bg); color: var(--vu-text); font-size: 12px; font-weight: 700; cursor: pointer;
      }
      .vu-win-pill.active { background: #0284c7; border-color: #0284c7; color: #fff; }

      .vu-perm-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 8px; }
      .vu-perm-item {
        display: flex; align-items: center; gap: 8px; font-size: 12px;
        background: var(--vu-input-bg); padding: 8px 10px; border-radius: 8px;
        border: 1px solid var(--vu-border); cursor: pointer;
      }
      .vu-table-wrap { width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; }
      .vu-table { width: 100%; border-collapse: collapse; font-size: 12.5px; min-width: 560px; }
      .vu-table th, .vu-table td { padding: 9px 10px; border-bottom: 1px solid var(--vu-border); text-align: left; }
      .vu-table th { color: var(--vu-muted-text); font-weight: 600; }

      .vu-bar-track { width: 100%; height: 10px; background: var(--vu-input-bg); border-radius: 999px; overflow: hidden; border: 1px solid var(--vu-border); }
      .vu-bar-fill { height: 100%; border-radius: 999px; transition: width 0.35s var(--vu-ease); }

      #vu-toast-stack {
        position: fixed; top: calc(16px + var(--vu-safe-top)); right: calc(16px + var(--vu-safe-right));
        z-index: 10500; display: flex; flex-direction: column; gap: 8px;
        width: min(370px, calc(100vw - 28px)); pointer-events: none;
      }
      .vu-toast {
        pointer-events: auto; display: flex; align-items: flex-start; gap: 10px;
        padding: 11px 13px; border-radius: 12px; font: 600 13px/1.38 system-ui, sans-serif;
        background: var(--vu-bg); color: var(--vu-text); border: 1px solid var(--vu-border);
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.28); opacity: 0; transform: translateY(-10px) scale(0.97);
        transition: opacity 0.2s ease, transform 0.22s var(--vu-ease);
      }
      .vu-toast.vu-toast-in { opacity: 1; transform: translateY(0) scale(1); }
      .vu-toast-ico {
        width: 22px; height: 22px; border-radius: 999px; flex-shrink: 0;
        display: inline-flex; align-items: center; justify-content: center;
        font-size: 12px; font-weight: 800; color: #fff; background: #0284c7;
      }
      .vu-toast-success { border-left: 4px solid #10b981; }
      .vu-toast-success .vu-toast-ico { background: #10b981; }
      .vu-toast-warn { border-left: 4px solid #f59e0b; }
      .vu-toast-warn .vu-toast-ico { background: #f59e0b; }
      .vu-toast-error { border-left: 4px solid #ef4444; }
      .vu-toast-error .vu-toast-ico { background: #ef4444; }
      .vu-toast-msg { flex: 1; min-width: 0; word-break: break-word; }
      .vu-toast-x { background: transparent; border: none; color: var(--vu-muted-text); font-size: 18px; line-height: 1; cursor: pointer; padding: 0 2px; }

      .vu-skel {
        border-radius: 6px;
        background: linear-gradient(90deg, var(--vu-skel-a) 25%, var(--vu-skel-b) 50%, var(--vu-skel-a) 75%);
        background-size: 200% 100%; animation: vuShimmer 1.25s infinite linear;
      }
      @keyframes vuShimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }

      .vu-cmd-box {
        width: 100%; max-width: 620px; background: var(--vu-bg); color: var(--vu-text);
        border: 1px solid var(--vu-border); border-radius: 16px; overflow: hidden;
        box-shadow: 0 28px 70px rgba(0, 0, 0, 0.52); transform: translateY(-8px) scale(0.985);
        transition: transform 0.18s var(--vu-ease);
      }
      .vu-backdrop.vu-open .vu-cmd-box { transform: translateY(0) scale(1); }
      .vu-cmd-head { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-bottom: 1px solid var(--vu-border); background: var(--vu-surface); }
      .vu-cmd-input { flex: 1; border: none; outline: none; background: transparent; color: var(--vu-text); font-size: 14.5px; font-weight: 500; }
      .vu-cmd-kbd { font-size: 11px; font-weight: 700; padding: 3px 7px; border-radius: 6px; border: 1px solid var(--vu-border); color: var(--vu-muted-text); }
      .vu-cmd-list { max-height: 390px; overflow-y: auto; padding: 8px; }
      .vu-cmd-group { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--vu-muted-text); padding: 8px 10px 4px; }
      .vu-cmd-item {
        width: 100%; border: none; background: transparent; color: var(--vu-text);
        display: flex; align-items: center; justify-content: space-between; gap: 10px;
        padding: 10px 12px; border-radius: 10px; cursor: pointer; text-align: left; font-size: 13.5px;
      }
      .vu-cmd-item.selected, .vu-cmd-item:hover { background: rgba(2, 132, 199, 0.15); }
      .vu-cmd-item-sub { font-size: 11.5px; color: var(--vu-muted-text); }
      .vu-cmd-foot {
        display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;
        padding: 9px 14px; font-size: 11px; color: var(--vu-muted-text);
        border-top: 1px solid var(--vu-border); background: var(--vu-surface);
      }

      .vu-sync-pill, #vu-sync-pill {
        position: fixed !important; bottom: calc(18px + var(--vu-safe-bottom)) !important; right: calc(18px + var(--vu-safe-right)) !important;
        z-index: 9500 !important; display: inline-flex; align-items: center; gap: 8px;
        padding: 7px 13px; border-radius: 999px; font: 600 12px/1.2 system-ui, sans-serif;
        box-shadow: 0 6px 18px rgba(0,0,0,.28); backdrop-filter: blur(8px); user-select: none; cursor: pointer;
      }
      .vu-sync-busy { background: #0f2540; color: #93c5fd; border: 1px solid #1d4ed8; }
      .vu-sync-offline { background: #3b2208; color: #fcd34d; border: 1px solid #d97706; }
      .vu-dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; }
    `;
  }

  /* -------------------------------------------------------------------------
   * Navegação / Overlays / Voltar Android
   * ------------------------------------------------------------------------- */
  function openOverlay({ id, element, onClose = null, closeOnBackdrop = true }) {
    closeOverlayById(id, true);
    const z = 9700 + state.modalStack.length * 10;
    element.style.zIndex = String(z);
    element.dataset.vuModal = '1';
    element.dataset.vuModalId = id;

    if (closeOnBackdrop) {
      element.addEventListener('click', (e) => {
        if (e.target === element) closeOverlayById(id);
      });
    }

    document.body.appendChild(element);
    requestAnimationFrame(() => element.classList.add('vu-open'));
    state.modalStack.push({ id, element, onClose });
    state.blockExitUntil = Date.now() + 2000;
    haptic('light');
  }

  function closeOverlayById(id, silent = false) {
    const idx = state.modalStack.findIndex((m) => m.id === id);
    if (idx === -1) return false;
    const [entry] = state.modalStack.splice(idx, 1);
    entry.element.classList.remove('vu-open');
    setTimeout(() => entry.element.remove(), 180);
    if (!silent && typeof entry.onClose === 'function') entry.onClose();
    return true;
  }

  function closeTopOverlay() {
    if (!state.modalStack.length) return false;
    const top = state.modalStack.pop();
    top.element.classList.remove('vu-open');
    setTimeout(() => top.element.remove(), 180);
    if (typeof top.onClose === 'function') top.onClose();
    haptic('light');
    return true;
  }

  function isAdminModalOpen() {
    const adm = document.getElementById('adminUsersModal');
    return Boolean(adm && !adm.classList.contains('hidden') && adm.style.display !== 'none');
  }

  function handleBackAction(e) {
    if (state.modalStack.length > 0) {
      if (e && typeof e.preventDefault === 'function' && e.cancelable) e.preventDefault();
      if (e && typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      state.blockExitUntil = Date.now() + 2000;
      closeTopOverlay();
      return true;
    }

    if (isAdminModalOpen()) {
      if (e && typeof e.preventDefault === 'function' && e.cancelable) e.preventDefault();
      if (e && typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      state.blockExitUntil = Date.now() + 2000;
      if (state.activeInlineTab) {
        showNativeAdminPanes();
      } else {
        const adm = document.getElementById('adminUsersModal');
        const closeBtn = adm.querySelector('button[onclick*="close"], button[aria-label*="Fechar"], .close');
        if (closeBtn) closeBtn.click();
        else adm.classList.add('hidden');
      }
      haptic('light');
      return true;
    }
    return false;
  }

  function setupBackNavigation() {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') handleBackAction(e);
    });

    const onBack = (e) => handleBackAction(e);
    document.addEventListener('backbutton', onBack, true);
    window.addEventListener('backbutton', onBack, true);

    const bindCap = () => {
      const appPlugin = global.Capacitor && global.Capacitor.Plugins && global.Capacitor.Plugins.App;
      if (!appPlugin) return;
      if (typeof appPlugin.exitApp === 'function' && !appPlugin.__vuGuarded) {
        const orig = appPlugin.exitApp.bind(appPlugin);
        appPlugin.exitApp = function () {
          if (state.modalStack.length > 0 || isAdminModalOpen() || Date.now() < state.blockExitUntil) {
            return Promise.resolve();
          }
          return orig.apply(this, arguments);
        };
        appPlugin.__vuGuarded = true;
      }
      if (typeof appPlugin.addListener === 'function' && !appPlugin.__vuBackBound) {
        appPlugin.__vuBackBound = true;
        try {
          appPlugin.addListener('backButton', (ev) => handleBackAction(ev));
        } catch (_) {}
      }
    };
    bindCap();
    setTimeout(bindCap, 1200);
    setTimeout(bindCap, 3500);
  }

  /* -------------------------------------------------------------------------
   * Painel Administrativo (Sidebar PC / Bottom Sheet Celular)
   * ------------------------------------------------------------------------- */
  function showNativeAdminPanes() {
    state.activeInlineTab = null;
    const nativeWrap = document.getElementById('vu-admin-native-panes');
    const customStage = document.getElementById('vu-admin-custom-stage');
    if (nativeWrap) nativeWrap.style.display = '';
    if (customStage) {
      customStage.style.display = 'none';
      customStage.innerHTML = '';
    }
    document.querySelectorAll('.vu-admin-sidebar > button').forEach((b) => b.classList.remove('vu-sidebar-active'));
  }

  function activateInlineAdminStage(tabId, renderFn) {
    const adm = document.getElementById('adminUsersModal');
    if (adm && (adm.classList.contains('hidden') || adm.style.display === 'none')) {
      if (typeof global.openAdminUsersModal === 'function') global.openAdminUsersModal();
      else {
        adm.classList.remove('hidden');
        adm.style.display = '';
      }
    }

    transformAdminModal();
    const nativeWrap = document.getElementById('vu-admin-native-panes');
    const customStage = document.getElementById('vu-admin-custom-stage');
    if (!customStage) {
      renderFn(null);
      return;
    }

    state.activeInlineTab = tabId;
    if (nativeWrap) nativeWrap.style.display = 'none';
    customStage.style.display = 'block';

    document.querySelectorAll('.vu-admin-sidebar > button').forEach((b) => {
      b.classList.toggle('vu-sidebar-active', b.id === tabId);
    });
    haptic('light');
    renderFn(customStage);
  }

  function transformAdminModal() {
    const adminTabsBar = document.querySelector('#adminUsersModal #admTabUsers')?.parentElement
      || document.querySelector('#adminUsersModal #admTabOta')?.parentElement
      || document.querySelector('#adminUsersModal button[id^="admTab"]')?.parentElement;

    if (!adminTabsBar || !adminTabsBar.parentElement) return;
    const workspace = adminTabsBar.parentElement;

    if (!workspace.classList.contains('vu-admin-workspace')) {
      const nativeSiblings = Array.from(workspace.children).filter((el) => el !== adminTabsBar);
      workspace.classList.add('vu-admin-workspace');
      adminTabsBar.classList.add('vu-admin-sidebar');

      const stage = document.createElement('div');
      stage.className = 'vu-admin-stage';
      stage.id = 'vu-admin-stage';

      const nativeWrap = document.createElement('div');
      nativeWrap.id = 'vu-admin-native-panes';
      nativeSiblings.forEach((node) => nativeWrap.appendChild(node));

      const customStage = document.createElement('div');
      customStage.id = 'vu-admin-custom-stage';
      customStage.style.display = 'none';

      stage.appendChild(nativeWrap);
      stage.appendChild(customStage);
      workspace.appendChild(stage);

      Array.from(adminTabsBar.querySelectorAll('button')).forEach((btn) => {
        if (!btn.dataset.vuNativeHooked) {
          btn.dataset.vuNativeHooked = '1';
          btn.addEventListener('click', () => {
            showNativeAdminPanes();
            btn.classList.add('vu-sidebar-active');
            haptic('light');
          });
        }
      });
    }

    const addSidebarTab = (id, label, colorClass, handler) => {
      const existing = document.getElementById(id);
      if (existing) {
        if (!existing.dataset.vuClickBound) {
          existing.dataset.vuClickBound = '1';
          existing.addEventListener('click', handler);
        }
        return;
      }
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = id;
      btn.dataset.vuClickBound = '1';
      btn.className = `font-semibold cursor-pointer ${colorClass}`;
      btn.textContent = label;
      btn.addEventListener('click', handler);
      adminTabsBar.appendChild(btn);
    };

    addSidebarTab('admTabBatchDraft', '📦 Lote & Romaneio Externo', 'text-cyan-600 dark:text-cyan-300', () => openBatchDraftModal(true));
    addSidebarTab('admTabDueWindow', '⏳ Vencimentos (7/15/30/60d)', 'text-rose-600 dark:text-rose-300', () => openDueWindowModal(true));
    addSidebarTab('admTabHolderPend', '👷 Pendências Colaborador', 'text-teal-600 dark:text-teal-300', () => openHolderPendenciesModal(true));
    addSidebarTab('admTabRbac', '🔐 Tipos de Login & Hierarquia', 'text-amber-600 dark:text-amber-300', () => openRbacAdminModal(false, 'roles'));
    addSidebarTab('admTabSlaInline', '📊 SLA, Custos & Deriva', 'text-indigo-600 dark:text-indigo-300', () => openLabSlaModal(true));
    addSidebarTab('admTabAudit', '🛡️ Auditoria & Governança', 'text-sky-600 dark:text-sky-300', () => openAuditLogsModal(true));
    addSidebarTab('admTabSplit', '🧩 Modularizar HTML', 'text-emerald-600 dark:text-emerald-300', () => openModularizerModal(true));
  }

  /* -------------------------------------------------------------------------
   * FUNCIONALIDADE 1: Pré-cadastro de Lote para Envio Externo & Romaneio
   * ------------------------------------------------------------------------- */
  const BATCH_STORAGE_KEY = 'voith_external_batch_draft_v1';

  function loadBatchDraft() {
    try {
      const raw = JSON.parse(localStorage.getItem(BATCH_STORAGE_KEY) || 'null');
      if (raw && Array.isArray(raw.tags)) {
        return {
          loteName: String(raw.loteName || `LOTE-${new Date().toISOString().slice(0, 10)}`),
          labName: String(raw.labName || ''),
          expectedReturn: String(raw.expectedReturn || ''),
          tags: Array.from(new Set(raw.tags.map((t) => String(t || '').trim().toUpperCase()).filter(Boolean)))
        };
      }
    } catch (_) {}
    return {
      loteName: `LOTE-${new Date().toISOString().slice(0, 10)}`,
      labName: '',
      expectedReturn: '',
      tags: []
    };
  }

  function saveBatchDraft(draft) {
    try { localStorage.setItem(BATCH_STORAGE_KEY, JSON.stringify(draft)); } catch (_) {}
  }

  function buildRomaneioText(draft, items) {
    const sectors = Array.from(new Set(items.map((x) => x.sector).filter(Boolean)));
    const cabinets = Array.from(new Set(items.map((x) => x.cabinet).filter(Boolean)));
    const lines = [
      'ROMANEIO DE SEPARAÇÃO — ENVIO PARA CALIBRAÇÃO EXTERNA (VOITH)',
      `Lote: ${draft.loteName || '—'}`,
      `Laboratório: ${draft.labName || 'A definir'}`,
      `Previsão de Retorno: ${draft.expectedReturn || '—'}`,
      `Total de Instrumentos: ${items.length}`,
      `Setores de Origem: ${sectors.join(', ') || '—'}`,
      `Armários / Locais: ${cabinets.join(', ') || '—'}`,
      '------------------------------------------------------------',
      ...items.map((x, idx) => `${idx + 1}. [${x.code}] ${x.desc} | Setor: ${x.sector} | Armário: ${x.cabinet} | Validade: ${x.due || '—'}`)
    ];
    return lines.join('\n');
  }

  function mountBatchDraftView(container) {
    let draft = loadBatchDraft();
    const allInsts = getAllInstruments();

    function enrichTags(tags) {
      return tags.map((code) => {
        const inst = findInstrumentByTag(code);
        return {
          code,
          desc: inst ? getInstrumentDesc(inst) : 'Instrumento não localizado no cadastro',
          sector: inst ? getInstrumentSector(inst) : '—',
          cabinet: inst ? getInstrumentCabinet(inst) : '—',
          due: inst ? getInstrumentDueRaw(inst) : '—'
        };
      });
    }

    function render() {
      const items = enrichTags(draft.tags);
      const sectors = Array.from(new Set(items.map((x) => x.sector).filter((s) => s && s !== '—')));
      const cabinets = Array.from(new Set(items.map((x) => x.cabinet).filter((c) => c && c !== '—')));

      container.innerHTML = `
        <h3 style="margin:0 0 12px;font-size:16px;font-weight:700;">Pré-cadastro de Lote para Envio Externo & Romaneio</h3>
        <div class="vu-card" style="margin-bottom:14px;">
          <div class="vu-grid-3" style="margin-bottom:10px;">
            <div>
              <label style="font-size:11.5px;color:var(--vu-muted-text);display:block;margin-bottom:4px;">Identificação do Lote</label>
              <input id="vu-batch-name" class="vu-input" value="${escapeHtml(draft.loteName)}" placeholder="Ex: LOTE-TURBO-01" />
            </div>
            <div>
              <label style="font-size:11.5px;color:var(--vu-muted-text);display:block;margin-bottom:4px;">Laboratório de Destino</label>
              <input id="vu-batch-lab" class="vu-input" value="${escapeHtml(draft.labName)}" placeholder="Ex: Laboratório RBC / Voith" />
            </div>
            <div>
              <label style="font-size:11.5px;color:var(--vu-muted-text);display:block;margin-bottom:4px;">Previsão de Retorno</label>
              <input id="vu-batch-ret" type="date" class="vu-input" value="${escapeHtml(draft.expectedReturn)}" />
            </div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <input id="vu-batch-tag-input" list="vu-batch-inst-datalist" class="vu-input" style="flex:1;min-width:200px;" placeholder="Digite ou escolha uma TAG para adicionar ao lote..." />
            <datalist id="vu-batch-inst-datalist">
              ${allInsts.slice(0, 500).map((i) => `<option value="${escapeHtml(getInstrumentCode(i))}">${escapeHtml(getInstrumentDesc(i))} (${escapeHtml(getInstrumentSector(i))})</option>`).join('')}
            </datalist>
            <button type="button" id="vu-batch-add-btn" class="vu-btn vu-btn-primary">+ Adicionar ao Lote</button>
            <button type="button" id="vu-batch-due30-btn" class="vu-btn vu-btn-warn">Incluir Vencendo em 30d</button>
          </div>
        </div>

        <div class="vu-grid-3" style="margin-bottom:14px;">
          <div class="vu-card">
            <div style="font-size:11px;color:var(--vu-muted-text);">Quantidade no Lote</div>
            <div style="font-size:22px;font-weight:700;color:#0284c7;">${items.length}</div>
          </div>
          <div class="vu-card">
            <div style="font-size:11px;color:var(--vu-muted-text);">Setores de Origem (${sectors.length})</div>
            <div style="font-size:12.5px;font-weight:700;margin-top:4px;">${sectors.length ? escapeHtml(sectors.join(', ')) : '—'}</div>
          </div>
          <div class="vu-card">
            <div style="font-size:11px;color:var(--vu-muted-text);">Armários / Locais (${cabinets.length})</div>
            <div style="font-size:12.5px;font-weight:700;margin-top:4px;">${cabinets.length ? escapeHtml(cabinets.join(', ')) : '—'}</div>
          </div>
        </div>

        <div class="vu-table-wrap" style="margin-bottom:14px;">
          <table class="vu-table">
            <thead><tr><th>TAG</th><th>Descrição</th><th>Setor</th><th>Armário / Local</th><th>Validade</th><th>Ação</th></tr></thead>
            <tbody>
              ${items.length ? items.map((x) => `
                <tr>
                  <td><strong>${escapeHtml(x.code)}</strong></td>
                  <td>${escapeHtml(x.desc)}</td>
                  <td><span class="vu-badge">${escapeHtml(x.sector)}</span></td>
                  <td>${escapeHtml(x.cabinet)}</td>
                  <td>${escapeHtml(x.due || '—')}</td>
                  <td><button type="button" class="vu-btn vu-btn-sm vu-btn-danger vu-batch-rm" data-code="${escapeHtml(x.code)}">Remover</button></td>
                </tr>
              `).join('') : '<tr><td colspan="6" style="text-align:center;color:var(--vu-muted-text);">Nenhum instrumento adicionado ao lote ainda.</td></tr>'}
            </tbody>
          </table>
        </div>

        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:space-between;">
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button type="button" id="vu-batch-copy-rom" class="vu-btn">📋 Copiar Romaneio</button>
            <button type="button" id="vu-batch-print-rom" class="vu-btn">🖨️ Imprimir Romaneio</button>
            <button type="button" id="vu-batch-clear-btn" class="vu-btn vu-btn-danger">Limpar Lote</button>
          </div>
          <button type="button" id="vu-batch-send-btn" class="vu-btn vu-btn-success">🚀 Enviar Lote para Calibração</button>
        </div>
      `;

      const syncMetaFields = () => {
        draft.loteName = container.querySelector('#vu-batch-name')?.value.trim() || draft.loteName;
        draft.labName = container.querySelector('#vu-batch-lab')?.value.trim() || '';
        draft.expectedReturn = container.querySelector('#vu-batch-ret')?.value || '';
        saveBatchDraft(draft);
      };

      container.querySelector('#vu-batch-name')?.addEventListener('change', syncMetaFields);
      container.querySelector('#vu-batch-lab')?.addEventListener('change', syncMetaFields);
      container.querySelector('#vu-batch-ret')?.addEventListener('change', syncMetaFields);

      container.querySelector('#vu-batch-add-btn')?.addEventListener('click', () => {
        syncMetaFields();
        const inp = container.querySelector('#vu-batch-tag-input');
        const code = String(inp?.value || '').trim().toUpperCase();
        if (!code) return showToast('Informe ou selecione uma TAG para adicionar.', 'warn');
        if (!draft.tags.includes(code)) draft.tags.push(code);
        saveBatchDraft(draft);
        render();
        showToast(`TAG ${code} adicionada ao lote.`, 'success', 2000);
      });

      container.querySelector('#vu-batch-due30-btn')?.addEventListener('click', () => {
        syncMetaFields();
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const limit = new Date(today.getTime() + 30 * 86400000);
        let added = 0;
        for (const inst of getAllInstruments()) {
          const d = parseFlexDate(getInstrumentDueRaw(inst));
          if (d && d <= limit) {
            const c = getInstrumentCode(inst);
            if (c && !draft.tags.includes(c)) {
              draft.tags.push(c);
              added += 1;
            }
          }
        }
        saveBatchDraft(draft);
        render();
        showToast(added ? `${added} instrumento(s) incluído(s) no lote.` : 'Nenhum instrumento vencendo em até 30 dias encontrado.', added ? 'success' : 'info');
      });

      container.querySelectorAll('.vu-batch-rm').forEach((btn) => {
        btn.addEventListener('click', () => {
          const c = btn.dataset.code;
          draft.tags = draft.tags.filter((t) => t !== c);
          saveBatchDraft(draft);
          render();
        });
      });

      container.querySelector('#vu-batch-clear-btn')?.addEventListener('click', async () => {
        if (!draft.tags.length) return;
        const ok = await showConfirm({
          title: 'Limpar pré-cadastro de lote?',
          message: `Remover os ${draft.tags.length} instrumento(s) desta lista de separação?`,
          confirmText: 'Limpar',
          danger: true
        });
        if (!ok) return;
        draft.tags = [];
        saveBatchDraft(draft);
        render();
        showToast('Lista de separação limpa.', 'info', 2000);
      });

      container.querySelector('#vu-batch-copy-rom')?.addEventListener('click', () => {
        syncMetaFields();
        const text = buildRomaneioText(draft, enrichTags(draft.tags));
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(() => showToast('Romaneio copiado para a área de transferência!', 'success'));
        } else {
          showToast('Romaneio preparado.', 'info');
        }
      });

      container.querySelector('#vu-batch-print-rom')?.addEventListener('click', () => {
        syncMetaFields();
        const text = buildRomaneioText(draft, enrichTags(draft.tags));
        const win = global.open('', '_blank', 'width=760,height=640');
        if (win) {
          win.document.write(`<pre style="font:13px/1.5 monospace;padding:24px;white-space:pre-wrap;">${escapeHtml(text)}</pre>`);
          win.document.close();
          win.print();
        } else {
          showToast('Permita popups para imprimir o romaneio.', 'warn');
        }
      });

      container.querySelector('#vu-batch-send-btn')?.addEventListener('click', async () => {
        syncMetaFields();
        if (!draft.tags.length) return showToast('Adicione ao menos um instrumento antes de enviar o lote.', 'warn');
        const ok = await showConfirm({
          title: 'Confirmar envio do lote externo?',
          message: `Enviar ${draft.tags.length} instrumento(s) do lote "${draft.loteName}" para calibração externa${draft.labName ? ` (${draft.labName})` : ''}?`,
          confirmText: 'Confirmar envio'
        });
        if (!ok) return;

        if (typeof global.openBatchSendModal === 'function') {
          global.openBatchSendModal(draft.tags.slice());
          return;
        }

        // Atualiza status local caso a função nativa de envio em lote não tenha assinatura com array
        let updatedCount = 0;
        for (const tag of draft.tags) {
          const inst = findInstrumentByTag(tag);
          if (inst) {
            if ('status' in inst) inst.status = 'EM CALIBRAÇÃO';
            if ('Status' in inst) inst.Status = 'EM CALIBRAÇÃO';
            updatedCount += 1;
          }
        }
        if (typeof global.saveDB === 'function') global.saveDB();
        if (typeof global.renderAll === 'function') global.renderAll();
        if (typeof global.scheduleCloudSync === 'function') global.scheduleCloudSync();

        draft.tags = [];
        saveBatchDraft(draft);
        render();
        showToast(`Lote processado (${updatedCount} instrumento(s) atualizado(s)).`, 'success');
      });
    }

    render();
  }

  function openBatchDraftModal(preferInline = true) {
    if (preferInline && document.getElementById('adminUsersModal')) {
      activateInlineAdminStage('admTabBatchDraft', (stage) => {
        if (stage) mountBatchDraftView(stage);
      });
      return;
    }

    const backdrop = document.createElement('div');
    backdrop.className = 'vu-backdrop';
    backdrop.innerHTML = `
      <div class="vu-modal">
        <div class="vu-sheet-handle"></div>
        <div class="vu-header">
          <div class="vu-header-left">
            <button type="button" class="vu-btn vu-btn-sm vu-close-btn">&larr; Voltar</button>
            <h3>Pré-cadastro de Lote & Romaneio Externo</h3>
          </div>
          <button type="button" class="vu-close">&times;</button>
        </div>
        <div class="vu-body" id="vu-batch-standalone"></div>
      </div>
    `;
    backdrop.querySelectorAll('.vu-close, .vu-close-btn').forEach((b) => {
      b.onclick = () => closeOverlayById('vu-batch-modal');
    });
    openOverlay({ id: 'vu-batch-modal', element: backdrop });
    mountBatchDraftView(backdrop.querySelector('#vu-batch-standalone'));
  }

  /* -------------------------------------------------------------------------
   * FUNCIONALIDADE 2: Alerta de Proximidade de Vencimento por Janela (7/15/30/60d)
   * ------------------------------------------------------------------------- */
  function mountDueWindowView(container, defaultDays = 30) {
    let selectedDays = defaultDays;
    let sectorFilter = '';
    let cabinetFilter = '';

    const allInsts = getAllInstruments();
    const sectors = Array.from(new Set(allInsts.map(getInstrumentSector).filter((s) => s && s !== 'Sem setor'))).sort();
    const cabinets = Array.from(new Set(allInsts.map(getInstrumentCabinet).filter((c) => c && c !== 'Sem armário'))).sort();

    function computeFiltered() {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const rows = [];

      for (const inst of allInsts) {
        const sec = getInstrumentSector(inst);
        const cab = getInstrumentCabinet(inst);
        if (sectorFilter && sec !== sectorFilter) continue;
        if (cabinetFilter && cab !== cabinetFilter) continue;

        const dueDate = parseFlexDate(getInstrumentDueRaw(inst));
        if (!dueDate) continue;
        dueDate.setHours(0, 0, 0, 0);

        const diffDays = Math.round((dueDate.getTime() - today.getTime()) / 86400000);
        if (diffDays <= selectedDays) {
          rows.push({
            code: getInstrumentCode(inst),
            desc: getInstrumentDesc(inst),
            sector: sec,
            cabinet: cab,
            dueDate,
            dueFmt: dueDate.toLocaleDateString('pt-BR'),
            diffDays
          });
        }
      }

      return rows.sort((a, b) => a.diffDays - b.diffDays);
    }

    function render() {
      const rows = computeFiltered();
      const vencidos = rows.filter((r) => r.diffDays < 0).length;
      const urgentes7 = rows.filter((r) => r.diffDays >= 0 && r.diffDays <= 7).length;

      container.innerHTML = `
        <h3 style="margin:0 0 12px;font-size:16px;font-weight:700;">Alerta de Proximidade de Vencimento</h3>
        <div class="vu-card" style="margin-bottom:14px;display:flex;flex-direction:column;gap:12px;">
          <div>
            <div style="font-size:11.5px;color:var(--vu-muted-text);margin-bottom:6px;">Janela de Dias</div>
            <div class="vu-window-pills">
              ${[7, 15, 30, 60].map((d) => `
                <button type="button" class="vu-win-pill ${selectedDays === d ? 'active' : ''}" data-days="${d}">Próximos ${d} dias</button>
              `).join('')}
            </div>
          </div>
          <div class="vu-grid-2">
            <div>
              <label style="font-size:11.5px;color:var(--vu-muted-text);display:block;margin-bottom:4px;">Filtrar por Setor</label>
              <select id="vu-due-sector" class="vu-select">
                <option value="">Todos os setores</option>
                ${sectors.map((s) => `<option value="${escapeHtml(s)}" ${sectorFilter === s ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('')}
              </select>
            </div>
            <div>
              <label style="font-size:11.5px;color:var(--vu-muted-text);display:block;margin-bottom:4px;">Filtrar por Armário / Local</label>
              <select id="vu-due-cabinet" class="vu-select">
                <option value="">Todos os armários</option>
                ${cabinets.map((c) => `<option value="${escapeHtml(c)}" ${cabinetFilter === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
              </select>
            </div>
          </div>
        </div>

        <div class="vu-grid-3" style="margin-bottom:14px;">
          <div class="vu-card">
            <div style="font-size:11px;color:var(--vu-muted-text);">Na Janela (≤ ${selectedDays}d)</div>
            <div style="font-size:22px;font-weight:700;color:#0284c7;">${rows.length}</div>
          </div>
          <div class="vu-card">
            <div style="font-size:11px;color:var(--vu-muted-text);">Vencidos</div>
            <div style="font-size:22px;font-weight:700;color:#dc2626;">${vencidos}</div>
          </div>
          <div class="vu-card">
            <div style="font-size:11px;color:var(--vu-muted-text);">Críticos (0 a 7 dias)</div>
            <div style="font-size:22px;font-weight:700;color:#d97706;">${urgentes7}</div>
          </div>
        </div>

        <div style="display:flex;justify-content:flex-end;margin-bottom:10px;">
          <button type="button" id="vu-due-to-batch" class="vu-btn vu-btn-primary vu-btn-sm">+ Enviar Selecionados (${rows.length}) ao Pré-Lote</button>
        </div>

        <div class="vu-table-wrap">
          <table class="vu-table">
            <thead><tr><th>Prazo</th><th>TAG</th><th>Descrição</th><th>Setor</th><th>Armário</th><th>Validade</th></tr></thead>
            <tbody>
              ${rows.length ? rows.map((r) => {
                const badge = r.diffDays < 0
                  ? `<span class="vu-badge vu-badge-red">Vencido há ${Math.abs(r.diffDays)}d</span>`
                  : (r.diffDays <= 7
                    ? `<span class="vu-badge vu-badge-amber">Em ${r.diffDays}d</span>`
                    : `<span class="vu-badge">Em ${r.diffDays}d</span>`);
                return `
                  <tr>
                    <td>${badge}</td>
                    <td><strong>${escapeHtml(r.code)}</strong></td>
                    <td>${escapeHtml(r.desc)}</td>
                    <td>${escapeHtml(r.sector)}</td>
                    <td>${escapeHtml(r.cabinet)}</td>
                    <td>${escapeHtml(r.dueFmt)}</td>
                  </tr>
                `;
              }).join('') : `<tr><td colspan="6" style="text-align:center;color:var(--vu-muted-text);">Nenhum instrumento vencendo nos próximos ${selectedDays} dias para este filtro.</td></tr>`}
            </tbody>
          </table>
        </div>
      `;

      container.querySelectorAll('.vu-win-pill').forEach((p) => {
        p.addEventListener('click', () => {
          selectedDays = Number(p.dataset.days);
          haptic('light');
          render();
        });
      });

      container.querySelector('#vu-due-sector')?.addEventListener('change', (e) => {
        sectorFilter = e.target.value;
        render();
      });

      container.querySelector('#vu-due-cabinet')?.addEventListener('change', (e) => {
        cabinetFilter = e.target.value;
        render();
      });

      container.querySelector('#vu-due-to-batch')?.addEventListener('click', () => {
        if (!rows.length) return showToast('Nenhum instrumento listado para enviar ao lote.', 'info');
        const draft = loadBatchDraft();
        let added = 0;
        for (const r of rows) {
          if (r.code && !draft.tags.includes(r.code)) {
            draft.tags.push(r.code);
            added += 1;
          }
        }
        saveBatchDraft(draft);
        showToast(`${added} instrumento(s) adicionado(s) ao pré-lote externo.`, 'success');
        openBatchDraftModal(true);
      });
    }

    render();
  }

  function openDueWindowModal(preferInline = true, defaultDays = 30) {
    if (preferInline && document.getElementById('adminUsersModal')) {
      activateInlineAdminStage('admTabDueWindow', (stage) => {
        if (stage) mountDueWindowView(stage, defaultDays);
      });
      return;
    }

    const backdrop = document.createElement('div');
    backdrop.className = 'vu-backdrop';
    backdrop.innerHTML = `
      <div class="vu-modal">
        <div class="vu-sheet-handle"></div>
        <div class="vu-header">
          <div class="vu-header-left">
            <button type="button" class="vu-btn vu-btn-sm vu-close-btn">&larr; Voltar</button>
            <h3>Alerta de Proximidade de Vencimento</h3>
          </div>
          <button type="button" class="vu-close">&times;</button>
        </div>
        <div class="vu-body" id="vu-due-standalone"></div>
      </div>
    `;
    backdrop.querySelectorAll('.vu-close, .vu-close-btn').forEach((b) => {
      b.onclick = () => closeOverlayById('vu-due-modal');
    });
    openOverlay({ id: 'vu-due-modal', element: backdrop });
    mountDueWindowView(backdrop.querySelector('#vu-due-standalone'), defaultDays);
  }

  /* -------------------------------------------------------------------------
   * FUNCIONALIDADE 3: Painel de Pendências do Colaborador
   * ------------------------------------------------------------------------- */
  function mountHolderPendenciesView(container) {
    let query = '';
    let sectorFilter = '';

    function buildGroups() {
      const openList = getOpenCustodies();
      const map = new Map();
      const now = Date.now();

      for (const c of openList) {
        const holderName = String(c.requester_name || c.holder_name || c.responsavel || c.colaborador || c.user || 'Colaborador não identificado').trim();
        const matricula = String(c.requester_matricula || c.matricula || c.holder_matricula || '—').trim();
        const sector = String(c.requester_setor || c.setor || c.holder_setor || '—').trim();
        const tag = String(c.instrument_tag || c.code || c.tag || c.codigo || '—').trim().toUpperCase();
        const inst = findInstrumentByTag(tag);
        const desc = inst ? getInstrumentDesc(inst) : String(c.desc || c.descricao || 'Instrumento em cautela');
        const dueRaw = c.due_date || c.prazo || c.expected_return || c.data_prevista || c.created_at || c.data || '';
        const dueDate = parseFlexDate(dueRaw);
        const isOverdue = Boolean(dueDate && dueDate.getTime() < now);

        const key = `${holderName.toLowerCase()}|${matricula.toLowerCase()}`;
        if (!map.has(key)) {
          map.set(key, { holderName, matricula, sector, items: [], overdueCount: 0 });
        }
        const grp = map.get(key);
        if (grp.sector === '—' && sector !== '—') grp.sector = sector;
        if (isOverdue) grp.overdueCount += 1;
        grp.items.push({
          tag,
          desc,
          sector,
          dueFmt: dueDate ? dueDate.toLocaleDateString('pt-BR') : (dueRaw || 'Em aberto'),
          isOverdue
        });
      }

      const groups = Array.from(map.values());
      const allSectors = Array.from(new Set(groups.map((g) => g.sector).filter((s) => s && s !== '—'))).sort();

      const filtered = groups.filter((g) => {
        if (sectorFilter && g.sector !== sectorFilter) return false;
        if (!query) return true;
        const q = normText(query);
        const hay = normText(`${g.holderName} ${g.matricula} ${g.sector} ${g.items.map((i) => `${i.tag} ${i.desc}`).join(' ')}`);
        return hay.includes(q);
      }).sort((a, b) => b.items.length - a.items.length);

      return { filtered, allSectors, totalOpen: openList.length };
    }

    function render() {
      const { filtered, allSectors, totalOpen } = buildGroups();

      container.innerHTML = `
        <h3 style="margin:0 0 12px;font-size:16px;font-weight:700;">Painel de Pendências do Colaborador</h3>
        <div class="vu-card" style="margin-bottom:14px;">
          <div class="vu-grid-2">
            <div>
              <label style="font-size:11.5px;color:var(--vu-muted-text);display:block;margin-bottom:4px;">Buscar Técnico / Matrícula / TAG</label>
              <input id="vu-pend-search" class="vu-input" value="${escapeHtml(query)}" placeholder="Ex: Pablo, matrícula ou TAG..." />
            </div>
            <div>
              <label style="font-size:11.5px;color:var(--vu-muted-text);display:block;margin-bottom:4px;">Filtrar por Setor</label>
              <select id="vu-pend-sector" class="vu-select">
                <option value="">Todos os setores</option>
                ${allSectors.map((s) => `<option value="${escapeHtml(s)}" ${sectorFilter === s ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('')}
              </select>
            </div>
          </div>
        </div>

        <div class="vu-grid-2" style="margin-bottom:14px;">
          <div class="vu-card">
            <div style="font-size:11px;color:var(--vu-muted-text);">Colaboradores com Pendências</div>
            <div style="font-size:22px;font-weight:700;color:#0284c7;">${filtered.length}</div>
          </div>
          <div class="vu-card">
            <div style="font-size:11px;color:var(--vu-muted-text);">Cautelas em Aberto</div>
            <div style="font-size:22px;font-weight:700;color:#d97706;">${totalOpen}</div>
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:10px;">
          ${filtered.length ? filtered.map((g) => `
            <div class="vu-card">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
                <div>
                  <strong style="font-size:14px;">${escapeHtml(g.holderName)}</strong>
                  <span class="vu-badge" style="margin-left:6px;">Mat. ${escapeHtml(g.matricula)}</span>
                  <span style="font-size:12px;color:var(--vu-muted-text);margin-left:6px;">• ${escapeHtml(g.sector)}</span>
                </div>
                <div>
                  <span class="vu-badge ${g.overdueCount > 0 ? 'vu-badge-red' : 'vu-badge-amber'}">${g.items.length} instrumento(s)</span>
                </div>
              </div>
              <div class="vu-table-wrap">
                <table class="vu-table" style="min-width:420px;">
                  <thead><tr><th>TAG</th><th>Instrumento</th><th>Prazo / Registro</th></tr></thead>
                  <tbody>
                    ${g.items.map((it) => `
                      <tr>
                        <td><strong>${escapeHtml(it.tag)}</strong></td>
                        <td>${escapeHtml(it.desc)}</td>
                        <td>${it.isOverdue ? `<span class="vu-badge vu-badge-red">${escapeHtml(it.dueFmt)}</span>` : escapeHtml(it.dueFmt)}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          `).join('') : `<div class="vu-card" style="text-align:center;color:var(--vu-muted-text);padding:24px;">Nenhuma cautela em aberto encontrada para este filtro.</div>`}
        </div>
      `;

      const sInp = container.querySelector('#vu-pend-search');
      if (sInp) {
        sInp.addEventListener('input', debounce((e) => {
          query = e.target.value;
          render();
        }, 140));
      }

      container.querySelector('#vu-pend-sector')?.addEventListener('change', (e) => {
        sectorFilter = e.target.value;
        render();
      });
    }

    render();
  }

  function openHolderPendenciesModal(preferInline = true) {
    if (preferInline && document.getElementById('adminUsersModal')) {
      activateInlineAdminStage('admTabHolderPend', (stage) => {
        if (stage) mountHolderPendenciesView(stage);
      });
      return;
    }

    const backdrop = document.createElement('div');
    backdrop.className = 'vu-backdrop';
    backdrop.innerHTML = `
      <div class="vu-modal">
        <div class="vu-sheet-handle"></div>
        <div class="vu-header">
          <div class="vu-header-left">
            <button type="button" class="vu-btn vu-btn-sm vu-close-btn">&larr; Voltar</button>
            <h3>Painel de Pendências do Colaborador</h3>
          </div>
          <button type="button" class="vu-close">&times;</button>
        </div>
        <div class="vu-body" id="vu-pend-standalone"></div>
      </div>
    `;
    backdrop.querySelectorAll('.vu-close, .vu-close-btn').forEach((b) => {
      b.onclick = () => closeOverlayById('vu-pend-modal');
    });
    openOverlay({ id: 'vu-pend-modal', element: backdrop });
    mountHolderPendenciesView(backdrop.querySelector('#vu-pend-standalone'));
  }

  /* -------------------------------------------------------------------------
   * Command Palette (Ctrl + K)
   * ------------------------------------------------------------------------- */
  function openInstrumentQuickCard(inst) {
    const code = getInstrumentCode(inst);
    const desc = getInstrumentDesc(inst);
    const sector = getInstrumentSector(inst);
    const cabinet = getInstrumentCabinet(inst);
    const due = getInstrumentDueRaw(inst) || '—';
    const check = evaluateInstrumentBlock(inst);
    const badgeCls = check.blocked ? (check.severity === 'warn' ? 'vu-badge-amber' : 'vu-badge-red') : 'vu-badge-green';

    const backdrop = document.createElement('div');
    backdrop.className = 'vu-backdrop';
    backdrop.innerHTML = `
      <div class="vu-modal vu-modal-sm">
        <div class="vu-sheet-handle"></div>
        <div class="vu-header">
          <div class="vu-header-left">
            <h3>🔧 ${escapeHtml(code)}</h3>
            <span class="vu-badge ${badgeCls}">${escapeHtml(check.statusLabel)}</span>
          </div>
          <button type="button" class="vu-close">&times;</button>
        </div>
        <div class="vu-body" style="display:flex;flex-direction:column;gap:14px;">
          <div class="vu-card">
            <div style="font-size:14px;font-weight:700;margin-bottom:6px;">${escapeHtml(desc)}</div>
            <div style="font-size:12.5px;color:var(--vu-muted-text);display:flex;flex-wrap:wrap;gap:12px;">
              <span><strong>Setor:</strong> ${escapeHtml(sector)}</span>
              <span><strong>Armário/Local:</strong> ${escapeHtml(cabinet)}</span>
              <span><strong>Próx. Calibração:</strong> ${escapeHtml(due)}</span>
            </div>
          </div>
          ${check.blocked ? `<div class="${check.severity === 'warn' ? 'vu-alert-warn' : 'vu-alert-danger'}">${escapeHtml(check.reason)}</div>` : ''}
          <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;">
            <button type="button" class="vu-btn" id="vu-qi-batch">+ Adicionar ao Pré-Lote</button>
            <button type="button" class="vu-btn vu-btn-warn" id="vu-qi-nc">⚠️ Impacto Retroativo</button>
            <button type="button" class="vu-btn vu-btn-primary" id="vu-qi-cautela">📋 Nova Cautela</button>
          </div>
        </div>
      </div>
    `;

    backdrop.querySelector('.vu-close').onclick = () => closeOverlayById('vu-quick-inst');
    backdrop.querySelector('#vu-qi-batch').onclick = () => {
      const draft = loadBatchDraft();
      if (!draft.tags.includes(code)) draft.tags.push(code);
      saveBatchDraft(draft);
      closeOverlayById('vu-quick-inst');
      showToast(`TAG ${code} adicionada ao pré-lote externo.`, 'success');
    };
    backdrop.querySelector('#vu-qi-cautela').onclick = () => {
      closeOverlayById('vu-quick-inst', true);
      openCautelaModal(code);
    };
    backdrop.querySelector('#vu-qi-nc').onclick = () => {
      closeOverlayById('vu-quick-inst', true);
      openRetroactiveImpactModal(code);
    };

    openOverlay({ id: 'vu-quick-inst', element: backdrop });
  }

  function triggerLegacyPdfAction() {
    const pdfBtn = Array.from(document.querySelectorAll('button')).find((b) => normText(b.textContent).includes('armario / pdf') || normText(b.textContent).includes('pdf'));
    if (pdfBtn) {
      pdfBtn.click();
      haptic('light');
    } else {
      showToast('Abra a tela inicial ou o inventário para acessar Armário / PDF.', 'info');
    }
  }

  function toggleThemeAction() {
    const themeBtn = document.querySelector('button[onclick*="Theme"], button[onclick*="theme"], button[id*="theme"], button[title*="Tema"]');
    if (themeBtn) themeBtn.click();
    else document.documentElement.classList.toggle('dark');
    haptic('light');
    showToast('Tema alternado com sucesso.', 'info', 1800);
  }

  function openCommandPalette(initialQuery = '') {
    const commands = [
      { id: 'lote', label: 'Pré-cadastro de Lote & Romaneio Externo', kw: 'lote romaneio envio externo calibracao', tag: '> lote', run: () => openBatchDraftModal(false) },
      { id: 'vencimentos', label: 'Alerta de Vencimentos (7, 15, 30 ou 60 dias)', kw: 'vencimento prazo janela dias proximo', tag: '> vencimentos', run: () => openDueWindowModal(false, 30) },
      { id: 'pendencias', label: 'Painel de Pendências do Colaborador', kw: 'pendencias colaborador tecnico cautela turno', tag: '> pendencias', run: () => openHolderPendenciesModal(false) },
      { id: 'cautela', label: 'Nova Cautela (com Trava Metrológica)', kw: 'cautela retirada instrumento', tag: '> cautela', run: () => openCautelaModal('') },
      { id: 'sla', label: 'SLA, Custos & Tendência de Deriva', kw: 'sla custo laboratorio deriva', tag: '> sla', run: () => openLabSlaModal(false) },
      { id: 'impacto', label: 'Análise de Impacto Retroativo (Reprovados)', kw: 'impacto risco nc reprovado', tag: '> impacto', run: () => openRetroactiveImpactModal('') },
      { id: 'hierarquia', label: 'Tipos de Login, Usuários & Hierarquia', kw: 'hierarquia rbac login usuario admin', tag: '> hierarquia', run: () => openRbacAdminModal(false, 'roles') },
      { id: 'auditoria', label: 'Trilha de Auditoria Imutável (ISO / IATF)', kw: 'auditoria audit logs iso', tag: '> auditoria', run: () => openAuditLogsModal(true) },
      { id: 'pdf', label: 'Abrir Relatórios / Armário PDF', kw: 'pdf relatorio armario imprimir', tag: '> pdf', run: triggerLegacyPdfAction },
      { id: 'tema', label: 'Alternar Modo Claro / Escuro', kw: 'tema dark light escuro claro', tag: '> tema', run: toggleThemeAction }
    ];

    const backdrop = document.createElement('div');
    backdrop.className = 'vu-backdrop';
    backdrop.innerHTML = `
      <div class="vu-cmd-box" role="dialog" aria-label="Command Palette">
        <div class="vu-sheet-handle"></div>
        <div class="vu-cmd-head">
          <span style="font-size:16px;opacity:.7;">⌘</span>
          <input type="text" class="vu-cmd-input" value="${escapeHtml(initialQuery)}" placeholder="Digite uma TAG, setor ou '>' para comandos (ex: > lote, > vencimentos, > pendencias)..." autocomplete="off" />
          <span class="vu-cmd-kbd">ESC</span>
        </div>
        <div class="vu-cmd-list"></div>
        <div class="vu-cmd-foot">
          <span>↑↓ navegar • Enter abrir • &gt; comandos rápidos</span>
          <span id="vu-cmd-count"></span>
        </div>
      </div>
    `;

    const input = backdrop.querySelector('.vu-cmd-input');
    const listEl = backdrop.querySelector('.vu-cmd-list');
    const countEl = backdrop.querySelector('#vu-cmd-count');
    let selectedIdx = 0;
    let items = [];

    function runItem(idx) {
      const target = items[idx];
      if (!target) return;
      closeOverlayById('vu-command-palette', true);
      haptic('light');
      target.run();
    }

    function render() {
      if (!items.length) {
        listEl.innerHTML = `<div style="padding:26px;text-align:center;color:var(--vu-muted-text);font-size:13px;">Nenhum instrumento ou comando encontrado.</div>`;
        countEl.textContent = '0 resultados';
        return;
      }

      let lastGroup = '';
      listEl.innerHTML = items.map((item, idx) => {
        const groupHeader = item.group !== lastGroup ? `<div class="vu-cmd-group">${escapeHtml(item.group)}</div>` : '';
        lastGroup = item.group;
        return `
          ${groupHeader}
          <button type="button" class="vu-cmd-item ${idx === selectedIdx ? 'selected' : ''}" data-idx="${idx}">
            <div style="min-width:0;">
              <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(item.title)}</div>
              ${item.sub ? `<div class="vu-cmd-item-sub">${escapeHtml(item.sub)}</div>` : ''}
            </div>
            <span class="vu-cmd-kbd">${escapeHtml(item.tag || '')}</span>
          </button>
        `;
      }).join('');

      countEl.textContent = `${items.length} resultado(s)`;
      listEl.querySelectorAll('.vu-cmd-item').forEach((btn) => {
        btn.onclick = () => runItem(Number(btn.dataset.idx));
      });
      const selEl = listEl.querySelector('.vu-cmd-item.selected');
      if (selEl) selEl.scrollIntoView({ block: 'nearest' });
    }

    const compute = debounce((rawVal) => {
      const q = String(rawVal || '').trim();
      const qNorm = normText(q);
      selectedIdx = 0;

      if (q.startsWith('>')) {
        const term = normText(q.slice(1).trim());
        items = commands
          .filter((c) => !term || normText(c.label).includes(term) || c.kw.includes(term))
          .map((c) => ({ group: 'Comandos Rápidos', title: `⚡ ${c.label}`, sub: '', tag: c.tag, run: c.run }));
        render();
        return;
      }

      const insts = getAllInstruments();
      const matchedInsts = !qNorm
        ? insts.slice(0, 5)
        : insts.filter((i) => {
            const hay = normText([
              getInstrumentCode(i), getInstrumentDesc(i),
              getInstrumentSector(i), getInstrumentCabinet(i), i.status, i.Status
            ].join(' '));
            return hay.includes(qNorm);
          }).slice(0, 14);

      const instItems = matchedInsts.map((i) => ({
        group: qNorm ? 'Instrumentos Encontrados' : 'Instrumentos Recentes',
        title: `🔧 ${getInstrumentCode(i)} — ${getInstrumentDesc(i)}`,
        sub: `${getInstrumentSector(i)} • ${getInstrumentCabinet(i)}`,
        tag: i.status || i.Status || 'EM DIA',
        run: () => openInstrumentQuickCard(i)
      }));

      const cmdItems = commands
        .filter((c) => !qNorm || normText(c.label).includes(qNorm) || c.kw.includes(qNorm))
        .slice(0, qNorm ? 5 : 5)
        .map((c) => ({ group: 'Ações & Atalhos', title: `⚡ ${c.label}`, sub: '', tag: c.tag, run: c.run }));

      items = qNorm ? [...instItems, ...cmdItems] : [...cmdItems, ...instItems];
      render();
    }, 120);

    input.addEventListener('input', () => compute(input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedIdx = (selectedIdx + 1) % Math.max(1, items.length);
        render();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedIdx = (selectedIdx - 1 + items.length) % Math.max(1, items.length);
        render();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        runItem(selectedIdx);
      }
    });

    openOverlay({ id: 'vu-command-palette', element: backdrop });
    compute(initialQuery);
    setTimeout(() => input.focus(), 40);
  }

  function setupCommandPaletteTriggers() {
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (state.modalStack.some((m) => m.id === 'vu-command-palette')) {
          closeOverlayById('vu-command-palette');
        } else {
          openCommandPalette('');
        }
      }
    }, true);

    document.addEventListener('click', (e) => {
      const target = e.target.closest('kbd, span, button');
      if (!target) return;
      const txt = String(target.textContent || '').trim().toLowerCase();
      if (txt === 'ctrl k' || txt === 'ctrl+k' || txt === '⌘k') {
        e.preventDefault();
        e.stopPropagation();
        openCommandPalette('');
      }
    }, true);
  }

  /* -------------------------------------------------------------------------
   * Hooks no App, Cautela, Devolução, Impacto, SLA, Auditoria e RBAC
   * ------------------------------------------------------------------------- */
  function injectAppHooks() {
    transformAdminModal();

    const adm = document.getElementById('adminUsersModal');
    if (adm && !adm.dataset.vuWatched) {
      adm.dataset.vuWatched = '1';
      const obs = new MutationObserver(() => {
        if (!adm.classList.contains('hidden')) transformAdminModal();
      });
      obs.observe(adm, { attributes: true, attributeFilter: ['class', 'style'] });
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
        const statusTxt = normText([inst && (inst.status || inst.Status || inst.situacao), custodyModalEl.textContent].join(' '));
        const isWaitingCal = statusTxt.includes('aguardando calibr') || statusTxt.includes('em calibr') || statusTxt.includes('recolhido para calibr');

        let box = document.getElementById('vu-return-next-cal-box');
        if (!isWaitingCal) {
          if (box) box.style.display = 'none';
          return;
        }
        if (!box) {
          box = document.createElement('div');
          box.id = 'vu-return-next-cal-box';
          box.className = 'vu-card';
          box.style.cssText = 'margin:10px 0 12px;border-color:#0284c7;text-align:left;';
          box.innerHTML = `
            <label for="vuReturnNextCalDate" style="display:block;font-size:11px;font-weight:700;letter-spacing:.04em;color:#0284c7;margin-bottom:6px;text-transform:uppercase;">
              Nova Data da Próxima Calibração (ao devolver)
            </label>
            <input id="vuReturnNextCalDate" type="date" class="vu-input" />
          `;
          confirmBtn.parentNode.insertBefore(box, confirmBtn);
        }
        box.style.display = 'block';
        const dateInp = box.querySelector('#vuReturnNextCalDate');
        if (dateInp && inst && !dateInp.dataset.vuTouched) {
          dateInp.value = toIsoDateStr(getInstrumentDueRaw(inst));
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
        showToast(`Validade atualizada para ${brVal}`, 'success');
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

  async function openCautelaModal(preselectedTag = '') {
    if (!state.profile) await loadSessionProfile();
    const prof = state.profile || {
      display_name: localStorage.getItem('voith_user_name') || 'Pablo Carvalho',
      matricula: localStorage.getItem('voith_matricula') || '',
      setor: localStorage.getItem('voith_setor') || '',
      role_name: 'Operador',
      hierarchy_level: 20,
      permissions: { request_cautela: true }
    };
    if (!hasPerm('request_cautela')) return showToast('Seu tipo de login não tem permissão para solicitar cautelas.', 'error');

    const canOverrideHolder = hasPerm('override_cautela_holder');
    const canOverrideBlock = Number(prof.hierarchy_level) >= 50 || hasPerm('approve_cautela') || canOverrideHolder;
    const lockAttr = canOverrideHolder ? '' : 'disabled';

    const backdrop = document.createElement('div');
    backdrop.className = 'vu-backdrop';
    backdrop.innerHTML = `
      <div class="vu-modal vu-modal-sm">
        <div class="vu-sheet-handle"></div>
        <div class="vu-header">
          <div class="vu-header-left">
            <button type="button" class="vu-btn vu-btn-sm vu-close-btn">&larr; Voltar</button>
            <h3>Nova Cautela de Instrumento</h3>
          </div>
          <button type="button" class="vu-close">&times;</button>
        </div>
        <div class="vu-body">
          <div style="margin-bottom:12px;">
            <span class="vu-badge vu-badge-green">Preenchido pelo login (${escapeHtml(prof.role_name || prof.role_code || '')})</span>
          </div>
          <form id="vu-cautela-form" style="display:flex;flex-direction:column;gap:12px;">
            <div class="vu-grid-2">
              <div>
                <label style="font-size:12px;color:var(--vu-muted-text);">Nome do Colaborador</label>
                <input class="vu-input" name="holder_name" value="${escapeHtml(prof.display_name)}" ${lockAttr} required />
              </div>
              <div>
                <label style="font-size:12px;color:var(--vu-muted-text);">Matrícula</label>
                <input class="vu-input" name="holder_matricula" value="${escapeHtml(prof.matricula)}" ${lockAttr} required />
              </div>
            </div>
            <div class="vu-grid-2">
              <div>
                <label style="font-size:12px;color:var(--vu-muted-text);">Setor</label>
                <input class="vu-input" name="holder_setor" value="${escapeHtml(prof.setor)}" ${lockAttr} required />
              </div>
              <div>
                <label style="font-size:12px;color:var(--vu-muted-text);">TAG / Código do Instrumento</label>
                <input class="vu-input" id="vu-cautela-tag" name="instrument_tag" value="${escapeHtml(preselectedTag)}" placeholder="Ex: AC401573" required />
              </div>
            </div>
            <div id="vu-cautela-guard-box"></div>
            <div>
              <label style="font-size:12px;color:var(--vu-muted-text);">Observações / Ordem de Serviço</label>
              <textarea class="vu-textarea" name="notes" rows="2" placeholder="Motivo da retirada ou local de uso..."></textarea>
            </div>
            <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:4px;">
              <button type="button" class="vu-btn vu-close-btn">Cancelar</button>
              <button type="submit" id="vu-cautela-submit" class="vu-btn vu-btn-primary">Registrar Cautela</button>
            </div>
          </form>
        </div>
      </div>
    `;

    backdrop.querySelectorAll('.vu-close, .vu-close-btn').forEach((b) => {
      b.onclick = () => closeOverlayById('vu-cautela-modal');
    });
    openOverlay({ id: 'vu-cautela-modal', element: backdrop });

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
      const desc = escapeHtml(getInstrumentDesc(inst));
      if (!check.blocked) {
        guardBox.innerHTML = `
          <div class="vu-card" style="padding:10px;font-size:12px;border-color:#10b981;">
            <strong style="color:#059669;">✓ Instrumento liberado (${escapeHtml(check.statusLabel)})</strong>
            <div style="color:var(--vu-muted-text);margin-top:2px;">${desc}</div>
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
              <input class="vu-input" name="override_reason" placeholder="Ex: Recolhimento para calibração externa..." required />
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

      submitBtn.disabled = true;
      submitBtn.textContent = 'Registrando...';
      try {
        const token = resolveSessionToken();
        const res = await rpc('voith_create_cautela_autofill', { p_token: token, p_payload: payload });
        if (!res.ok) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Registrar Cautela';
          return showToast(res.error || 'Erro ao registrar cautela.', 'error');
        }
        closeOverlayById('vu-cautela-modal', true);
        if (typeof state.cfg.onCautelaCreated === 'function') state.cfg.onCautelaCreated(res.cautela);
        showToast(`Cautela registrada (${payload.instrument_tag})`, 'success');
      } catch (err) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Registrar Cautela';
        showToast('Falha ao comunicar com o Supabase: ' + err.message, 'error');
      }
    });
  }

  async function openRetroactiveImpactModal(preselectedTag = '') {
    if (!state.profile) await loadSessionProfile();

    const backdrop = document.createElement('div');
    backdrop.className = 'vu-backdrop';
    backdrop.innerHTML = `
      <div class="vu-modal">
        <div class="vu-sheet-handle"></div>
        <div class="vu-header">
          <div class="vu-header-left">
            <button type="button" class="vu-btn vu-btn-sm vu-close-btn">&larr; Voltar</button>
            <h3>Análise de Risco & Impacto Retroativo</h3>
          </div>
          <button type="button" class="vu-close">&times;</button>
        </div>
        <div class="vu-body">
          <div class="vu-alert-warn" style="margin-bottom:14px;">
            Rastreie colaboradores, setores e cautelas de um instrumento reprovado desde a última calibração válida.
          </div>
          <form id="vu-nc-form" class="vu-grid-3" style="margin-bottom:14px;align-items:end;">
            <div>
              <label style="font-size:12px;color:var(--vu-muted-text);">TAG do Instrumento Reprovado</label>
              <input class="vu-input" name="tag" value="${escapeHtml(preselectedTag)}" placeholder="Ex: AC401573" required />
            </div>
            <div>
              <label style="font-size:12px;color:var(--vu-muted-text);">Analisar desde</label>
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

    backdrop.querySelectorAll('.vu-close, .vu-close-btn').forEach((b) => {
      b.onclick = () => closeOverlayById('vu-nc-modal');
    });
    openOverlay({ id: 'vu-nc-modal', element: backdrop });

    const resultEl = backdrop.querySelector('#vu-nc-result');

    async function runTrace(tag, since) {
      if (!tag) return;
      resultEl.innerHTML = skeletonCardsHtml(3, 3);
      const inst = findInstrumentByTag(tag);
      const localCustodies = (global.VoithDB && global.VoithDB.state && Array.isArray(global.VoithDB.state.custodies))
        ? global.VoithDB.state.custodies.filter((c) => String(c.code || c.instrument_tag || '').toUpperCase() === tag.toUpperCase())
        : [];

      let cloudCautelas = [];
      let auditTrail = [];
      try {
        const token = resolveSessionToken();
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
            <div style="font-size:11px;color:var(--vu-muted-text);">Instrumento</div>
            <div style="font-size:16px;font-weight:700;">${escapeHtml(tag.toUpperCase())}</div>
            <div style="font-size:11.5px;color:var(--vu-muted-text);">${escapeHtml(inst ? getInstrumentDesc(inst) : 'Não localizado no cadastro')}</div>
          </div>
          <div class="vu-card">
            <div style="font-size:11px;color:var(--vu-muted-text);">Retiradas no Período</div>
            <div style="font-size:22px;font-weight:700;color:#d97706;">${merged.length}</div>
          </div>
          <div class="vu-card">
            <div style="font-size:11px;color:var(--vu-muted-text);">Setores Impactados</div>
            <div style="font-size:13px;font-weight:700;color:#dc2626;margin-top:4px;">${sectors.length ? escapeHtml(sectors.join(', ')) : 'Nenhum setor registrado'}</div>
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
              `).join('') : '<tr><td colspan="5" style="text-align:center;color:var(--vu-muted-text);">Nenhuma cautela encontrada para este instrumento no período.</td></tr>'}
            </tbody>
          </table>
        </div>
        ${auditTrail.length ? `<div style="margin-top:12px;font-size:12px;color:var(--vu-muted-text);">+ ${auditTrail.length} registro(s) na trilha de auditoria encontrados para esta TAG.</div>` : ''}
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
        stat.concluidos += 1;
        stat.leadDaysSum += Math.max(0, Math.round((ret - sent) / 86400000));
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

  function buildLabSlaMarkup() {
    const history = typeof state.cfg.getCalibrationHistory === 'function' ? state.cfg.getCalibrationHistory() : [];
    const { labs, families } = computeLabSlaMetrics(history);
    const totalCost = labs.reduce((acc, r) => acc + r.custoTotal, 0);
    const maxFamCost = Math.max(1, ...families.map((f) => f.custoTotal || f.envios));
    const fmtBRL = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    return `
      <div class="vu-grid-3" style="margin-bottom:14px;">
        <div class="vu-card"><div style="font-size:11px;color:var(--vu-muted-text);">Laboratórios Ativos</div><div style="font-size:22px;font-weight:700;">${labs.length}</div></div>
        <div class="vu-card"><div style="font-size:11px;color:var(--vu-muted-text);">Custo Acumulado</div><div style="font-size:22px;font-weight:700;color:#0284c7;">${fmtBRL(totalCost)}</div></div>
        <div class="vu-card"><div style="font-size:11px;color:var(--vu-muted-text);">Envios Atrasados</div><div style="font-size:22px;font-weight:700;color:#d97706;">${labs.reduce((a, r) => a + r.atrasados, 0)}</div></div>
      </div>
      <div class="vu-card" style="margin-bottom:14px;">
        <h4 style="margin:0 0 10px;font-size:13.5px;font-weight:700;">Custo & Taxa de Deriva / Reprovação por Família</h4>
        ${families.length ? families.map((f) => {
          const metricVal = f.custoTotal > 0 ? f.custoTotal : f.envios;
          const pct = Math.min(100, Math.round((metricVal / maxFamCost) * 100));
          const derivaNum = Number(f.taxaDeriva);
          const barColor = derivaNum >= 15 ? '#ef4444' : (derivaNum >= 5 ? '#f59e0b' : '#0ea5e9');
          return `
            <div style="margin-bottom:10px;">
              <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;gap:8px;flex-wrap:wrap;">
                <strong>${escapeHtml(f.family)} <span style="color:var(--vu-muted-text);font-weight:400;">(${f.envios} calibrações)</span></strong>
                <span>${fmtBRL(f.custoTotal)} • Deriva: <strong style="color:${barColor};">${f.taxaDeriva}%</strong></span>
              </div>
              <div class="vu-bar-track"><div class="vu-bar-fill" style="width:${pct}%;background:${barColor};"></div></div>
            </div>
          `;
        }).join('') : '<div style="font-size:12px;color:var(--vu-muted-text);">Sem histórico de calibração externa para agrupar por família.</div>'}
      </div>
      <div class="vu-table-wrap">
        <table class="vu-table">
          <thead><tr><th>Laboratório</th><th>Envios</th><th>Lead Time</th><th>Atrasados</th><th>Reprov.</th><th>Custo Total</th><th>Custo Médio</th></tr></thead>
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
            `).join('') : '<tr><td colspan="7" style="text-align:center;color:var(--vu-muted-text);">Sem registros em calibration_history.</td></tr>'}
          </tbody>
        </table>
      </div>
    `;
  }

  async function openLabSlaModal(inlineInAdmin = false) {
    if (!state.profile) await loadSessionProfile();
    if (inlineInAdmin) {
      activateInlineAdminStage('admTabSlaInline', (stage) => {
        if (!stage) return openLabSlaModal(false);
        stage.innerHTML = `<h3 style="margin:0 0 14px;font-size:16px;font-weight:700;">SLA, Custos & Tendência de Deriva</h3>${buildLabSlaMarkup()}`;
      });
      return;
    }

    const backdrop = document.createElement('div');
    backdrop.className = 'vu-backdrop';
    backdrop.innerHTML = `
      <div class="vu-modal">
        <div class="vu-sheet-handle"></div>
        <div class="vu-header">
          <div class="vu-header-left">
            <button type="button" class="vu-btn vu-btn-sm vu-close-btn">&larr; Voltar</button>
            <h3>SLA, Custos & Tendência de Deriva</h3>
          </div>
          <button type="button" class="vu-close">&times;</button>
        </div>
        <div class="vu-body">${buildLabSlaMarkup()}</div>
      </div>
    `;
    backdrop.querySelectorAll('.vu-close, .vu-close-btn').forEach((b) => {
      b.onclick = () => closeOverlayById('vu-sla-modal');
    });
    openOverlay({ id: 'vu-sla-modal', element: backdrop });
  }

  async function mountAuditView(container) {
    container.innerHTML = `
      <h3 style="margin:0 0 12px;font-size:16px;font-weight:700;">Trilha de Auditoria Imutável (ISO / IATF)</h3>
      <div style="display:flex;gap:8px;margin-bottom:14px;">
        <input id="vu-audit-search" class="vu-input" placeholder="Filtrar por TAG, usuário, tabela ou ação..." />
        <button type="button" id="vu-audit-reload" class="vu-btn vu-btn-primary">Buscar</button>
      </div>
      <div id="vu-audit-body">${skeletonCardsHtml(3, 5)}</div>
    `;

    const token = resolveSessionToken();
    const bodyEl = container.querySelector('#vu-audit-body');
    const searchEl = container.querySelector('#vu-audit-search');

    async function loadLogs(q = '') {
      bodyEl.innerHTML = skeletonCardsHtml(0, 5);
      try {
        const res = await rpc('voith_list_audit_logs', { p_token: token, p_limit: 120, p_search: q });
        if (!res.ok) {
          bodyEl.innerHTML = `<div class="vu-alert-warn">${escapeHtml(res.error || 'Sem registros ou permissão restrita para logs.')}</div>`;
          return;
        }
        const logs = res.logs || [];
        bodyEl.innerHTML = `
          <div class="vu-table-wrap">
            <table class="vu-table">
              <thead><tr><th>Data / Hora</th><th>Responsável</th><th>Ação</th><th>Entidade</th><th>ID / TAG</th><th>Resumo</th></tr></thead>
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
                      <td style="font-size:11px;color:var(--vu-muted-text);max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(summary)}">${escapeHtml(summary)}</td>
                    </tr>
                  `;
                }).join('') : '<tr><td colspan="6" style="text-align:center;color:var(--vu-muted-text);">Nenhum evento registrado em audit_logs.</td></tr>'}
              </tbody>
            </table>
          </div>
        `;
      } catch (err) {
        bodyEl.innerHTML = `<div class="vu-alert-warn">Auditoria indisponível no momento: ${escapeHtml(err.message)}</div>`;
      }
    }

    container.querySelector('#vu-audit-reload').onclick = () => loadLogs(searchEl.value.trim());
    searchEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); loadLogs(searchEl.value.trim()); }
    });
    loadLogs('');
  }

  async function openAuditLogsModal(preferInline = true) {
    if (!state.profile) await loadSessionProfile();
    if (preferInline && document.getElementById('adminUsersModal')) {
      activateInlineAdminStage('admTabAudit', (stage) => {
        if (!stage) return openAuditLogsModal(false);
        mountAuditView(stage);
      });
      return;
    }

    const backdrop = document.createElement('div');
    backdrop.className = 'vu-backdrop';
    backdrop.innerHTML = `
      <div class="vu-modal">
        <div class="vu-sheet-handle"></div>
        <div class="vu-header">
          <div class="vu-header-left">
            <button type="button" class="vu-btn vu-btn-sm vu-close-btn">&larr; Voltar</button>
            <h3>Trilha de Auditoria Imutável</h3>
          </div>
          <button type="button" class="vu-close">&times;</button>
        </div>
        <div class="vu-body" id="vu-audit-standalone"></div>
      </div>
    `;
    backdrop.querySelectorAll('.vu-close, .vu-close-btn').forEach((b) => {
      b.onclick = () => closeOverlayById('vu-audit-modal');
    });
    openOverlay({ id: 'vu-audit-modal', element: backdrop });
    mountAuditView(backdrop.querySelector('#vu-audit-standalone'));
  }

  function getCachedRoles() {
    try {
      const saved = JSON.parse(localStorage.getItem('voith_custom_roles_v6') || 'null');
      if (Array.isArray(saved) && saved.length) return saved;
    } catch (_) {}
    return DEFAULT_ROLES.slice();
  }

  function saveCachedRoles(roles) {
    try { localStorage.setItem('voith_custom_roles_v6', JSON.stringify(roles)); } catch (_) {}
  }

  async function mountRbacView(container, activeTab = 'roles') {
    container.innerHTML = `
      <h3 style="margin:0 0 12px;font-size:16px;font-weight:700;">Gestão de Logins, Permissões e Hierarquia</h3>
      ${skeletonCardsHtml(2, 4)}
    `;

    const token = resolveSessionToken();
    let roles = getCachedRoles();
    let users = [];

    try {
      const rRes = await rpc('voith_list_roles', { p_token: token });
      if (rRes && rRes.ok && Array.isArray(rRes.roles) && rRes.roles.length) {
        roles = rRes.roles;
        saveCachedRoles(roles);
      }
    } catch (_) {}

    try {
      const uRes = await rpc('voith_list_users', { p_token: token });
      if (uRes && uRes.ok && Array.isArray(uRes.users)) users = uRes.users;
    } catch (_) {}

    container.innerHTML = `
      <h3 style="margin:0 0 12px;font-size:16px;font-weight:700;">Gestão de Logins, Permissões e Hierarquia</h3>
      <div class="vu-tabs">
        <button type="button" class="vu-tab ${activeTab === 'roles' ? 'active' : ''}" data-tab="roles">Tipos de Login & Hierarquia</button>
        <button type="button" class="vu-tab ${activeTab === 'users' ? 'active' : ''}" data-tab="users">Usuários (Nome, Matrícula, Setor)</button>
      </div>
      <div id="vu-rbac-content"></div>
    `;

    const content = container.querySelector('#vu-rbac-content');
    const callerLevel = Number(state.profile?.hierarchy_level || 100);

    function renderUsersTab() {
      const roleOptions = roles
        .filter((r) => callerLevel >= 100 || Number(r.hierarchy_level) <= callerLevel)
        .map((r) => `<option value="${escapeHtml(r.code)}">${escapeHtml(r.name)} (Nível ${r.hierarchy_level})</option>`)
        .join('');

      content.innerHTML = `
        <div class="vu-card" style="margin-bottom:14px;">
          <h4 style="margin:0 0 10px;font-weight:700;font-size:13.5px;">Cadastrar / Editar Usuário</h4>
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
              ${users.length ? users.map((u) => `
                <tr>
                  <td><strong>${escapeHtml(u.username)}</strong></td>
                  <td>${escapeHtml(u.display_name)}</td>
                  <td>${escapeHtml(u.matricula || '—')}</td>
                  <td>${escapeHtml(u.setor || '—')}</td>
                  <td><span class="vu-badge">${escapeHtml(u.role_name || u.role_code)}</span></td>
                  <td>${u.hierarchy_level}</td>
                </tr>
              `).join('') : '<tr><td colspan="6" style="text-align:center;color:var(--vu-muted-text);">Nenhum usuário adicional listado na nuvem.</td></tr>'}
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
          if (!res.ok) return showToast(res.error || 'Erro ao salvar usuário.', 'error');
          showToast('Usuário salvo com sucesso!', 'success');
          mountRbacView(container, 'users');
        } catch (err) {
          showToast('Erro ao salvar usuário: ' + err.message, 'error');
        }
      });
    }

    function renderRolesTab() {
      content.innerHTML = `
        <div class="vu-card" style="margin-bottom:14px;">
          <h4 style="margin:0 0 10px;font-weight:700;font-size:13.5px;">Criar / Editar Tipo de Login & Hierarquia</h4>
          <form id="vu-role-form" style="display:flex;flex-direction:column;gap:10px;">
            <div class="vu-grid-3">
              <input class="vu-input" name="code" placeholder="Código (ex: LIDER_USINAGEM)" required />
              <input class="vu-input" name="name" placeholder="Nome de Exibição" required />
              <input class="vu-input" name="hierarchy_level" type="number" min="1" max="99" value="20" required />
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
        </div>
        <div class="vu-table-wrap">
          <table class="vu-table">
            <thead><tr><th>Código</th><th>Nome</th><th>Hierarquia</th><th>Permissões Ativas</th></tr></thead>
            <tbody>
              ${roles.map((r) => {
                const activePerms = Object.entries(r.permissions || {}).filter(([, v]) => v).length;
                return `
                  <tr>
                    <td><strong>${escapeHtml(r.code)}</strong></td>
                    <td>${escapeHtml(r.name)}<div style="font-size:11px;color:var(--vu-muted-text);">${escapeHtml(r.description || '')}</div></td>
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
            code: String(fd.get('code') || '').trim().toUpperCase(),
            name: String(fd.get('name') || '').trim(),
            description: String(fd.get('description') || '').trim(),
            hierarchy_level: Number(fd.get('hierarchy_level')),
            permissions: perms
          };

          const idx = roles.findIndex((item) => item.code === payload.code);
          const nextRoles = roles.slice();
          if (idx >= 0) nextRoles[idx] = { ...nextRoles[idx], ...payload };
          else nextRoles.push(payload);
          saveCachedRoles(nextRoles);
          roles = nextRoles;

          try {
            const res = await rpc('voith_upsert_role', { p_token: token, p_role: payload });
            if (res && res.ok) showToast('Tipo de login salvo na nuvem e localmente!', 'success');
            else showToast('Tipo de login salvo localmente.', 'warn');
          } catch (_) {
            showToast('Tipo de login salvo localmente na hierarquia.', 'success');
          }
          mountRbacView(container, 'roles');
        });
      }
    }

    container.querySelectorAll('.vu-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.vu-tab').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        haptic('light');
        if (btn.dataset.tab === 'users') renderUsersTab();
        else renderRolesTab();
      });
    });

    if (activeTab === 'users') renderUsersTab();
    else renderRolesTab();
  }

  async function openRbacAdminModal(_isRefresh = false, activeTab = 'roles') {
    if (!state.profile) await loadSessionProfile();
    if (document.getElementById('adminUsersModal')) {
      activateInlineAdminStage('admTabRbac', (stage) => {
        if (stage) mountRbacView(stage, activeTab);
      });
      return;
    }

    const backdrop = document.createElement('div');
    backdrop.className = 'vu-backdrop';
    backdrop.innerHTML = `
      <div class="vu-modal">
        <div class="vu-sheet-handle"></div>
        <div class="vu-header">
          <div class="vu-header-left">
            <button type="button" class="vu-btn vu-btn-sm vu-close-btn">&larr; Voltar</button>
            <h3>Logins, Permissões e Hierarquia</h3>
          </div>
          <button type="button" class="vu-close">&times;</button>
        </div>
        <div class="vu-body" id="vu-rbac-standalone"></div>
      </div>
    `;
    backdrop.querySelectorAll('.vu-close, .vu-close-btn').forEach((b) => {
      b.onclick = () => closeOverlayById('vu-rbac-modal');
    });
    openOverlay({ id: 'vu-rbac-modal', element: backdrop });
    mountRbacView(backdrop.querySelector('#vu-rbac-standalone'), activeTab);
  }

  function mountModularizerView(container) {
    container.innerHTML = `
      <h3 style="margin:0 0 12px;font-size:16px;font-weight:700;">Modularização Progressiva do index.html</h3>
      <div class="vu-card" style="font-size:13px;line-height:1.55;margin-bottom:14px;">
        Extrai automaticamente o CSS e o JavaScript interno do <code>index.html</code> em 3 arquivos prontos:
        <ul style="margin:8px 0 0 18px;color:var(--vu-muted-text);">
          <li><strong>styles/main.css</strong></li>
          <li><strong>js/core.js</strong></li>
          <li><strong>index.html</strong> (enxuto)</li>
        </ul>
      </div>
      <button type="button" id="vu-run-split" class="vu-btn vu-btn-primary">Gerar e Baixar Pacote Modular</button>
      <div id="vu-split-status" style="font-size:12.5px;color:var(--vu-muted-text);margin-top:12px;"></div>
    `;

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

    container.querySelector('#vu-run-split').addEventListener('click', async () => {
      const ok = await showConfirm({
        title: 'Gerar arquivos modulares?',
        message: 'O navegador fará o download de 3 arquivos (main.css, core.js e index.html) para você revisar antes de publicar.',
        confirmText: 'Baixar agora'
      });
      if (!ok) return;

      const statusEl = container.querySelector('#vu-split-status');
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
          if (/\bsrc\s*=/.test(attrs) || inner.includes('VoithUpgrade.init')) return full;
          jsChunks.push(inner.trim());
          return '';
        });
        cleanHtml = cleanHtml.replace('</head>', '    <link rel="stylesheet" href="./styles/main.css" />\n</head>');
        cleanHtml = cleanHtml.replace('</body>', '    <script src="./js/core.js"></script>\n</body>');

        downloadTextFile('main.css', cssChunks.join('\n\n/* --- */\n\n'), 'text/css;charset=utf-8');
        setTimeout(() => downloadTextFile('core.js', jsChunks.join('\n\n// ---\n\n'), 'application/javascript;charset=utf-8'), 400);
        setTimeout(() => downloadTextFile('index.html', cleanHtml, 'text/html;charset=utf-8'), 800);

        statusEl.textContent = 'Download dos 3 arquivos iniciado com sucesso.';
        showToast('Pacote modular gerado com sucesso!', 'success');
      } catch (err) {
        statusEl.textContent = 'Erro ao processar: ' + err.message;
        showToast('Erro ao modularizar: ' + err.message, 'error');
      }
    });
  }

  function openModularizerModal(preferInline = true) {
    if (preferInline && document.getElementById('adminUsersModal')) {
      activateInlineAdminStage('admTabSplit', (stage) => {
        if (stage) mountModularizerView(stage);
      });
      return;
    }
    const backdrop = document.createElement('div');
    backdrop.className = 'vu-backdrop';
    backdrop.innerHTML = `
      <div class="vu-modal vu-modal-sm">
        <div class="vu-sheet-handle"></div>
        <div class="vu-header">
          <h3>Modularização do index.html</h3>
          <button type="button" class="vu-close">&times;</button>
        </div>
        <div class="vu-body" id="vu-split-standalone"></div>
      </div>
    `;
    backdrop.querySelector('.vu-close').onclick = () => closeOverlayById('vu-split-modal');
    openOverlay({ id: 'vu-split-modal', element: backdrop });
    mountModularizerView(backdrop.querySelector('#vu-split-standalone'));
  }

  async function openQuickMenu() {
    openCommandPalette('>');
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
      pill.title = 'Clique para abrir a Command Palette (Ctrl + K)';
      pill.addEventListener('click', () => openCommandPalette('>'));
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
      showToast('Conexão restabelecida. Sincronizando dados...', 'success', 2600);
      if (typeof state.cfg.onReconnect === 'function') state.cfg.onReconnect();
    });
    window.addEventListener('offline', () => {
      renderSyncPill();
      showToast('Modo offline ativo. Suas alterações serão sincronizadas ao reconectar.', 'warn', 3600);
    });
    window.addEventListener('beforeunload', (e) => {
      if (state.pendingMutations > 0) {
        e.preventDefault();
        e.returnValue = 'Existem alterações pendentes de sincronização.';
      }
    });
    renderSyncPill();
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
    const token = resolveSessionToken();
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
    const token = resolveSessionToken();
    if (!token) return null;
    try {
      const res = await rpc('voith_get_session_profile', { p_token: token });
      if (res && res.ok && res.profile) {
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
    ensureMobileMeta();
    injectStyles();
    installFriendlyAlert();
    injectAppHooks();
    setupBackNavigation();
    setupCommandPaletteTriggers();
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
    toast: showToast,
    confirm: showConfirm,
    haptic,
    openCommandPalette,
    openBatchDraftModal,
    openDueWindowModal,
    openHolderPendenciesModal,
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