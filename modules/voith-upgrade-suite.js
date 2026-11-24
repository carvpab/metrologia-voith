/**
 * ============================================================================
 * VOITH METROLOGIA — Upgrade Suite v4.4
 * - Auto-oculta pílula quando sincronizado
 * - Botão "← Voltar" na Gestão de Logins & Hierarquia
 * - Auto-injeta aba RBAC no Painel Admin e botão Auto-Preencher na Cautela
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
    view_sla_costs: 'Ver indicadores de SLA e custos de laboratórios',
    request_cautela: 'Preencher cautela (retirada de instrumento)',
    approve_cautela: 'Aprovar cautelas de terceiros',
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
    otaChannel: localStorage.getItem('voith_ota_channel') || 'stable'
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

  function injectStyles() {
    let style = document.getElementById('voith-upgrade-styles');
    if (!style) {
      style = document.createElement('style');
      style.id = 'voith-upgrade-styles';
      document.head.appendChild(style);
    }
    style.textContent = `
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
        padding: 48px 16px 24px; overflow-y: auto; backdrop-filter: blur(4px);
      }
      .vu-modal {
        width: 100%; max-width: 880px; background: #0f172a; color: #e2e8f0;
        border: 1px solid #334155; border-radius: 14px; overflow: hidden;
        box-shadow: 0 24px 60px rgba(0,0,0,.6); font-family: system-ui, -apple-system, sans-serif;
      }
      .vu-modal-sm { max-width: 620px; }
      .vu-header {
        display: flex; align-items: center; justify-content: space-between; gap: 12px;
        padding: 16px 20px; background: #1e293b; border-bottom: 1px solid #334155;
      }
      .vu-header-left { display: flex; align-items: center; gap: 10px; min-width: 0; }
      .vu-header h3 { margin: 0; font-size: 16px; font-weight: 700; color: #f8fafc; }
      .vu-close {
        background: transparent; border: none; color: #94a3b8; font-size: 22px; line-height: 1; cursor: pointer;
      }
      .vu-body { padding: 18px 20px; max-height: 76vh; overflow-y: auto; }
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
      .vu-btn-sm { padding: 6px 10px; font-size: 12px; }
      .vu-btn-primary { background: #0284c7; border-color: #0ea5e9; color: #fff; }
      .vu-btn-primary:hover { background: #0369a1; }
      .vu-btn-danger { background: #991b1b; border-color: #dc2626; color: #fff; }
      .vu-grid-2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
      .vu-grid-3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
      @media (max-width: 640px) { .vu-grid-2, .vu-grid-3, .vu-perm-grid { grid-template-columns: 1fr; } }
      .vu-card {
        background: #111c30; border: 1px solid #24324a; border-radius: 10px; padding: 14px;
      }
      .vu-badge {
        display: inline-block; padding: 3px 8px; border-radius: 999px;
        font-size: 11px; font-weight: 600; background: #1e3a5f; color: #7dd3fc;
      }
      .vu-badge-green { background: #064e3b; color: #6ee7b7; }
      .vu-badge-amber { background: #451a03; color: #fcd34d; }

      .vu-k-list { margin-top: 12px; display: flex; flex-direction: column; gap: 6px; }
      .vu-k-item {
        display: flex; justify-content: space-between; align-items: center; gap: 12px;
        padding: 10px 12px; border-radius: 8px; background: #111c30;
        border: 1px solid transparent; cursor: pointer;
      }
      .vu-k-item.active, .vu-k-item:hover { border-color: #0ea5e9; background: #17253d; }

      .vu-tabs { display: flex; gap: 8px; margin-bottom: 14px; border-bottom: 1px solid #334155; padding-bottom: 10px; }
      .vu-tab { background: transparent; border: none; color: #94a3b8; font-weight: 600; padding: 6px 12px; cursor: pointer; border-radius: 6px; }
      .vu-tab.active { background: #0284c7; color: #fff; }
      .vu-perm-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 8px; }
      .vu-perm-item { display: flex; align-items: center; gap: 8px; font-size: 12px; background: #0b1220; padding: 7px 9px; border-radius: 6px; border: 1px solid #1e293b; cursor: pointer; }
      .vu-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
      .vu-table th, .vu-table td { padding: 8px 10px; border-bottom: 1px solid #1e293b; text-align: left; }
      .vu-table th { color: #94a3b8; font-weight: 600; }
    `;
  }

  function injectAppHooks() {
    const adminTabsBar = document.querySelector('#adminUsersModal #admTabOta')?.parentElement
      || document.querySelector('#adminUsersModal #admTabUsers')?.parentElement;
    if (adminTabsBar && !document.getElementById('admTabRbac')) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'admTabRbac';
      btn.className = 'px-3.5 py-2 rounded-t-lg font-bold text-amber-600 dark:text-amber-300 hover:underline cursor-pointer';
      btn.textContent = 'Tipos de Login & Hierarquia';
      btn.addEventListener('click', () => openRbacAdminModal());
      adminTabsBar.appendChild(btn);
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

  function openGlobalSearch() {
    closeModals();
    const instruments = typeof state.cfg.getInstruments === 'function' ? state.cfg.getInstruments() : [];
    let activeIdx = 0;
    let filtered = instruments.slice(0, 12);

    const backdrop = document.createElement('div');
    backdrop.className = 'vu-backdrop';
    backdrop.dataset.vuModal = '1';
    backdrop.innerHTML = `
      <div class="vu-modal vu-modal-sm">
        <div class="vu-header">
          <h3>Busca Global de Instrumentos <span class="vu-badge">Ctrl + K</span></h3>
          <button type="button" class="vu-close" aria-label="Fechar">&times;</button>
        </div>
        <div class="vu-body">
          <input id="vu-k-input" class="vu-input" placeholder="Digite TAG, nº de série, descrição, setor ou responsável..." autofocus />
          <div id="vu-k-list" class="vu-k-list"></div>
        </div>
      </div>
    `;

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop || e.target.classList.contains('vu-close')) closeModals();
    });
    document.body.appendChild(backdrop);

    const input = backdrop.querySelector('#vu-k-input');
    const listEl = backdrop.querySelector('#vu-k-list');

    function norm(v) {
      return String(v ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }

    function renderResults() {
      if (!filtered.length) {
        listEl.innerHTML = `<div style="color:#94a3b8;padding:14px;text-align:center;">Nenhum instrumento encontrado.</div>`;
        return;
      }
      listEl.innerHTML = filtered.map((inst, idx) => {
        const tag = inst.code || inst.tag || inst.codigo || inst.Instrumento || inst.id || '-';
        const desc = inst.desc || inst.descricao || inst.description || inst['Descrição'] || '';
        const setor = inst.setor || inst.sector || inst['Setor/Chapa'] || '';
        const resp = inst.resp || inst.responsavel || inst.responsible || inst['Responsável'] || '';
        return `
          <div class="vu-k-item ${idx === activeIdx ? 'active' : ''}" data-idx="${idx}">
            <div>
              <div style="font-weight:700;color:#f8fafc;">${escapeHtml(tag)} <span style="font-weight:400;color:#94a3b8;">— ${escapeHtml(desc)}</span></div>
              <div style="font-size:11.5px;color:#94a3b8;margin-top:2px;">Setor: ${escapeHtml(setor || '—')} • Resp.: ${escapeHtml(resp || '—')}</div>
            </div>
            <span class="vu-badge">${escapeHtml(inst.status || inst.Status || 'Ver')}</span>
          </div>
        `;
      }).join('');

      listEl.querySelectorAll('.vu-k-item').forEach((el) => {
        el.addEventListener('click', () => selectItem(Number(el.dataset.idx)));
      });
    }

    function selectItem(idx) {
      const item = filtered[idx];
      if (!item) return;
      closeModals();
      if (typeof state.cfg.onSelectInstrument === 'function') state.cfg.onSelectInstrument(item);
    }

    input.addEventListener('input', () => {
      const q = norm(input.value.trim());
      activeIdx = 0;
      filtered = !q ? instruments.slice(0, 12) : instruments.filter((i) => {
        const hay = norm([i.code, i.tag, i.desc, i.setor, i.resp, i.local].join(' '));
        return hay.includes(q);
      }).slice(0, 20);
      renderResults();
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); activeIdx = Math.min(filtered.length - 1, activeIdx + 1); renderResults(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); activeIdx = Math.max(0, activeIdx - 1); renderResults(); }
      else if (e.key === 'Enter') { e.preventDefault(); selectItem(activeIdx); }
      else if (e.key === 'Escape') { closeModals(); }
    });

    renderResults();
    setTimeout(() => input.focus(), 20);
  }

  async function openCautelaModal(preselectedTag = '') {
    if (!state.profile) await loadSessionProfile();
    if (!state.profile) {
      return alert('Sessão não localizada no servidor. Faça login novamente para preencher a cautela.');
    }
    if (!hasPerm('request_cautela')) {
      return alert('Seu tipo de login não tem permissão para solicitar/preencher cautelas.');
    }
    closeModals();

    const prof = state.profile;
    const canOverride = hasPerm('override_cautela_holder');
    const lockAttr = canOverride ? '' : 'disabled';

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
              Preenchido automaticamente pelo login (${escapeHtml(prof.role_name || prof.role_code || '')})
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
                <input class="vu-input" name="instrument_tag" value="${escapeHtml(preselectedTag)}" placeholder="Ex: AC401573" required />
              </div>
            </div>
            <div>
              <label style="font-size:12px;color:#94a3b8;">Observações / Ordem de Serviço</label>
              <textarea class="vu-textarea" name="notes" rows="2" placeholder="Motivo da retirada ou local de uso..."></textarea>
            </div>
            <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:6px;">
              <button type="button" class="vu-btn vu-close-btn">Cancelar</button>
              <button type="submit" class="vu-btn vu-btn-primary">Registrar Cautela</button>
            </div>
          </form>
        </div>
      </div>
    `;

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop || e.target.classList.contains('vu-close') || e.target.classList.contains('vu-close-btn')) closeModals();
    });
    document.body.appendChild(backdrop);

    backdrop.querySelector('#vu-cautela-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = {
        holder_name: fd.get('holder_name') || prof.display_name,
        holder_matricula: fd.get('holder_matricula') || prof.matricula,
        holder_setor: fd.get('holder_setor') || prof.setor,
        instrument_tag: String(fd.get('instrument_tag') || '').trim(),
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

  async function openRbacAdminModal() {
    if (!state.profile) await loadSessionProfile();
    if (!state.profile) {
      return alert('Não foi possível validar sua sessão no Supabase. Verifique se você está logado.');
    }
    if (!hasPerm('manage_users') && !hasPerm('manage_roles')) {
      return alert('Seu perfil não possui permissão para gerenciar logins ou hierarquia.');
    }
    closeModals();

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
            <button type="button" class="vu-tab active" data-tab="roles">Tipos de Login & Hierarquia</button>
            <button type="button" class="vu-tab" data-tab="users">Usuários (Nome, Matrícula, Setor)</button>
          </div>
          <div id="vu-rbac-content"></div>
        </div>
      </div>
    `;

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop || e.target.classList.contains('vu-close')) closeModals();
    });
    const backBtn = backdrop.querySelector('.vu-back-admin');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        closeModals();
        const adm = document.getElementById('adminUsersModal');
        if (adm && adm.classList.contains('hidden') && typeof global.openAdminUsersModal === 'function') {
          global.openAdminUsersModal();
        }
      });
    }
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
          <form id="vu-user-form" style="display:flex;flex-direction:column;gap:10px;">
            <div class="vu-grid-3">
              <input class="vu-input" name="username" placeholder="Login (ex: joao.silva)" required />
              <input class="vu-input" name="display_name" placeholder="Nome Completo" required />
              <input class="vu-input" name="matricula" placeholder="Matrícula (ex: 12345)" required />
            </div>
            <div class="vu-grid-3">
              <input class="vu-input" name="setor" placeholder="Setor (ex: Usinagem / Turbo)" required />
              <select class="vu-select" name="role_code">${roleOptions}</select>
              <input class="vu-input" name="password" type="password" placeholder="Senha (vazio = manter atual)" />
            </div>
            <div style="display:flex;justify-content:flex-end;">
              <button class="vu-btn vu-btn-primary" type="submit">Salvar Usuário</button>
            </div>
          </form>
        </div>
        <table class="vu-table">
          <thead>
            <tr><th>Login</th><th>Nome</th><th>Matrícula</th><th>Setor</th><th>Tipo de Login</th><th>Nível</th></tr>
          </thead>
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
      `;

      content.querySelector('#vu-user-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const payload = Object.fromEntries(fd.entries());
        const res = await rpc('voith_upsert_user_profile', { p_token: token, p_user: payload });
        if (!res.ok) return alert(res.error);
        alert('Usuário salvo com sucesso!');
        openRbacAdminModal();
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
      `;

      const rForm = content.querySelector('#vu-role-form');
      if (rForm) {
        rForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target);
          const perms = {};
          Object.keys(PERMISSION_LABELS).forEach((k) => {
            perms[k] = fd.get(`perm_${k}`) === 'on';
          });
          const payload = {
            code: fd.get('code'),
            name: fd.get('name'),
            description: fd.get('description'),
            hierarchy_level: Number(fd.get('hierarchy_level')),
            permissions: perms
          };
          const res = await rpc('voith_upsert_role', { p_token: token, p_role: payload });
          if (!res.ok) return alert(res.error);
          alert('Tipo de login salvo com sucesso!');
          openRbacAdminModal();
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

    renderRolesTab();
  }

  function computeLabSlaMetrics(history) {
    const map = new Map();
    const today = new Date();
    for (const row of history || []) {
      const lab = String(row.lab || row.laboratorio || row.lab_name || 'Não informado').trim();
      if (!map.has(lab)) map.set(lab, { lab, totalEnvios: 0, concluidos: 0, leadDaysSum: 0, atrasados: 0, custoTotal: 0 });
      const stat = map.get(lab);
      stat.totalEnvios += 1;
      const sent = row.sent_date || row.data_envio || row.sentAt || row.envio;
      const ret = row.return_date || row.data_retorno || row.returnedAt || row.retorno;
      const exp = row.expected_return_date || row.previsao_retorno || row.previsao;
      const cost = Number(row.cost_brl ?? row.custo ?? row.cost ?? 0);
      if (!Number.isNaN(cost) && cost > 0) stat.custoTotal += cost;
      if (sent && ret) {
        const diff = Math.max(0, Math.round((new Date(ret) - new Date(sent)) / 86400000));
        if (!Number.isNaN(diff)) { stat.concluidos += 1; stat.leadDaysSum += diff; }
      } else if (exp && new Date(exp) < today) {
        stat.atrasados += 1;
      }
    }
    return Array.from(map.values()).map((s) => ({
      ...s,
      leadTimeMedio: s.concluidos ? (s.leadDaysSum / s.concluidos).toFixed(1) : '—',
      custoMedio: s.totalEnvios ? s.custoTotal / s.totalEnvios : 0
    })).sort((a, b) => b.custoTotal - a.custoTotal);
  }

  async function openLabSlaModal() {
    if (!state.profile) await loadSessionProfile();
    if (!hasPerm('view_sla_costs')) return alert('Seu perfil não tem permissão para visualizar SLA e custos.');
    closeModals();
    const history = typeof state.cfg.getCalibrationHistory === 'function' ? state.cfg.getCalibrationHistory() : [];
    const rows = computeLabSlaMetrics(history);
    const totalCost = rows.reduce((acc, r) => acc + r.custoTotal, 0);
    const fmtBRL = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const backdrop = document.createElement('div');
    backdrop.className = 'vu-backdrop';
    backdrop.dataset.vuModal = '1';
    backdrop.innerHTML = `
      <div class="vu-modal">
        <div class="vu-header">
          <div class="vu-header-left">
            <button type="button" class="vu-btn vu-btn-sm vu-close-btn">&larr; Voltar</button>
            <h3>SLA e Custos de Laboratórios Externos</h3>
          </div>
          <button type="button" class="vu-close">&times;</button>
        </div>
        <div class="vu-body">
          <div class="vu-grid-3" style="margin-bottom:14px;">
            <div class="vu-card"><div style="font-size:11px;color:#94a3b8;">Laboratórios Ativos</div><div style="font-size:22px;font-weight:700;">${rows.length}</div></div>
            <div class="vu-card"><div style="font-size:11px;color:#94a3b8;">Custo Acumulado</div><div style="font-size:22px;font-weight:700;color:#38bdf8;">${fmtBRL(totalCost)}</div></div>
            <div class="vu-card"><div style="font-size:11px;color:#94a3b8;">Envios Atrasados</div><div style="font-size:22px;font-weight:700;color:#fbbf24;">${rows.reduce((a, r) => a + r.atrasados, 0)}</div></div>
          </div>
          <table class="vu-table">
            <thead><tr><th>Laboratório</th><th>Envios</th><th>Lead Time Médio</th><th>Atrasados</th><th>Custo Acumulado</th><th>Custo Médio</th></tr></thead>
            <tbody>
              ${rows.length ? rows.map((r) => `
                <tr>
                  <td><strong>${escapeHtml(r.lab)}</strong></td>
                  <td>${r.totalEnvios}</td>
                  <td>${r.leadTimeMedio} dias</td>
                  <td>${r.atrasados > 0 ? `<span class="vu-badge vu-badge-amber">${r.atrasados}</span>` : '0'}</td>
                  <td>${fmtBRL(r.custoTotal)}</td>
                  <td>${fmtBRL(r.custoMedio)}</td>
                </tr>
              `).join('') : '<tr><td colspan="6" style="text-align:center;color:#94a3b8;">Sem registros em calibration_history.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop || e.target.classList.contains('vu-close') || e.target.classList.contains('vu-close-btn')) closeModals();
    });
    document.body.appendChild(backdrop);
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
    window.addEventListener('online', () => {
      const q = JSON.parse(localStorage.getItem('voith_telemetry_queue') || '[]');
      if (!q.length) return;
      localStorage.removeItem('voith_telemetry_queue');
      const token = state.cfg.getSessionToken ? state.cfg.getSessionToken() : '';
      q.forEach((p) => rpc('voith_log_telemetry', { p_token: token, p_payload: p }).catch(() => {}));
    });
  }

  async function openQuickMenu() {
    if (!state.profile) await loadSessionProfile();
    closeModals();
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
          ` : '<div class="vu-card" style="font-size:12px;color:#fcd34d;">Sessão ainda não vinculada ao perfil RBAC. Faça login como Editor.</div>'}
          <button type="button" class="vu-btn vu-btn-primary" id="vu-act-cautela">📋 Nova Cautela (Auto-preenchida)</button>
          ${hasPerm('view_sla_costs') ? '<button type="button" class="vu-btn" id="vu-act-sla">📊 SLA e Custos de Laboratórios</button>' : ''}
          ${(hasPerm('manage_users') || hasPerm('manage_roles')) ? '<button type="button" class="vu-btn" id="vu-act-rbac">🔐 Logins, Permissões e Hierarquia</button>' : ''}
        </div>
      </div>
    `;
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop || e.target.classList.contains('vu-close')) closeModals();
    });
    document.body.appendChild(backdrop);

    backdrop.querySelector('#vu-act-cautela').onclick = () => openCautelaModal('');
    const slaBtn = backdrop.querySelector('#vu-act-sla');
    if (slaBtn) slaBtn.onclick = openLabSlaModal;
    const rbacBtn = backdrop.querySelector('#vu-act-rbac');
    if (rbacBtn) rbacBtn.onclick = openRbacAdminModal;
  }

  function closeModals() {
    document.querySelectorAll('[data-vu-modal="1"]').forEach((el) => el.remove());
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
    setupOfflineMonitors();
    setupErrorTelemetry();

    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        if (typeof global.openCommandPalette === 'function') return;
        e.preventDefault();
        openGlobalSearch();
      }
    });

    loadSessionProfile();
  }

  global.VoithUpgrade = {
    init,
    loadSessionProfile,
    hasPerm,
    getProfile: () => state.profile,
    setPendingMutations,
    openGlobalSearch,
    openCautelaModal,
    openRbacAdminModal,
    openLabSlaModal,
    openQuickMenu,
    getOtaChannel: () => state.otaChannel
  };
})(window);
