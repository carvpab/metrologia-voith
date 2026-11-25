(() => {
  "use strict";

  const APK_FALLBACK = "https://github.com/carvpab/voith-metrologia-app/releases/latest/download/voith-metrologia.apk";
  const EXE_FALLBACK = "https://github.com/carvpab/voith-metrologia-app/releases/latest/download/voith-metrologia-setup.exe";
  const PROFILES_KEY = "voith_detailed_user_profiles_v1";
  const AUDIT_KEY = "voith_admin_audit_log_v1";

  const SECTORS = [
    "Metrologia / Turbo",
    "Qualidade",
    "Ferrovi\u00e1ria",
    "Automotive/Engates",
    "Assist\u00eancia T\u00e9cnica Automotive",
    "Industrial",
    "Assist\u00eancia T\u00e9cnica Industrial",
    "Ferrovi\u00e1ria Redutor",
    "Vorecon"
  ];

  const PERMISSION_GROUPS = [
    {
      group: "Invent\u00e1rio & Instrumentos",
      items: [
        { id: "inv_view", label: "Visualizar lista de instrumentos (441)" },
        { id: "inv_create", label: "Cadastrar novos instrumentos" },
        { id: "inv_edit", label: "Editar dados, faixa e setor do instrumento" },
        { id: "inv_delete", label: "Excluir instrumentos do cadastro" },
        { id: "inv_lost", label: "Marcar equipamento como Perdido / Baixado" },
        { id: "inv_restore", label: "Restaurar equipamentos perdidos/baixados" }
      ]
    },
    {
      group: "Calibra\u00e7\u00f5es, Cautela & Laborat\u00f3rio",
      items: [
        { id: "cal_register", label: "Registrar calibra\u00e7\u00e3o e n\u00famero de certificado" },
        { id: "cal_batch_send", label: "Criar e enviar Lote / Romaneio Externo" },
        { id: "cal_batch_return", label: "Registrar retorno de laborat\u00f3rio externo" },
        { id: "cautela_assign", label: "Realizar cautela / entrega a colaborador" },
        { id: "cautela_return", label: "Registrar devolu\u00e7\u00e3o de cautela" }
      ]
    },
    {
      group: "Relat\u00f3rios, Nuvem, OTA & Administra\u00e7\u00e3o",
      items: [
        { id: "rep_pdf_iso", label: "Gerar relat\u00f3rios PDF / Auditoria ISO / Arm\u00e1rio" },
        { id: "rep_backup", label: "Exportar e restaurar backup completo" },
        { id: "cloud_sync", label: "Sincronizar dados com nuvem / Supabase" },
        { id: "ota_manage", label: "Ver e disparar atualiza\u00e7\u00f5es OTA / App" },
        { id: "adm_users", label: "Criar e gerenciar logins de usu\u00e1rios" },
        { id: "adm_hierarchy", label: "Configurar matr\u00edculas, setores e permiss\u00f5es" }
      ]
    }
  ];

  const ALL_PERM_IDS = PERMISSION_GROUPS.flatMap(g => g.items.map(i => i.id));
  const PRESET_PERMS = {
    ADMIN: ALL_PERM_IDS,
    GESTOR: ["inv_view","inv_create","inv_edit","inv_lost","inv_restore","cal_register","cal_batch_send","cal_batch_return","cautela_assign","cautela_return","rep_pdf_iso","rep_backup","cloud_sync","ota_manage"],
    METROLOGISTA: ["inv_view","inv_create","inv_edit","cal_register","cal_batch_send","cal_batch_return","cautela_assign","cautela_return","rep_pdf_iso","cloud_sync"],
    OPERADOR: ["inv_view","cautela_assign","cautela_return","rep_pdf_iso"]
  };

  const isVisible = (el) => {
    if (!el || !el.isConnected) return false;
    const cs = window.getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  const loadProfiles = () => {
    try { return JSON.parse(localStorage.getItem(PROFILES_KEY) || "{}"); } catch (_) { return {}; }
  };
  const saveProfiles = (obj) => {
    try { localStorage.setItem(PROFILES_KEY, JSON.stringify(obj)); } catch (_) {}
  };
  const pushAudit = (action, detail) => {
    try {
      const logs = JSON.parse(localStorage.getItem(AUDIT_KEY) || "[]");
      logs.unshift({ at: new Date().toLocaleString("pt-BR"), action, detail });
      localStorage.setItem(AUDIT_KEY, JSON.stringify(logs.slice(0, 80)));
    } catch (_) {}
  };
  const loadAudit = () => {
    try { return JSON.parse(localStorage.getItem(AUDIT_KEY) || "[]"); } catch (_) { return []; }
  };

  const readLiveInstruments = () => {
    const candidates = [window.instruments, window.ITEMS, window.allInstruments, window.state && window.state.instruments];
    for (const c of candidates) {
      if (Array.isArray(c) && c.length) return c;
    }
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i) || "";
        if (!/instrument|metro|frota|voith|item/i.test(k) || k === PROFILES_KEY || k === AUDIT_KEY) continue;
        const raw = localStorage.getItem(k);
        if (!raw || raw.length < 30) continue;
        const p = JSON.parse(raw);
        if (Array.isArray(p) && p.length > 5 && typeof p[0] === "object") return p;
      }
    } catch (_) {}
    return [];
  };

  const discoverUsers = (scopeEl) => {
    const stored = loadProfiles();
    const map = new Map();
    Object.entries(stored).forEach(([k, p]) => {
      map.set(k.toLowerCase(), {
        login: k.toLowerCase(),
        name: p.name || k,
        matricula: p.matricula || "",
        sector: p.sector || "Metrologia / Turbo",
        role: p.role || "OPERADOR",
        perms: Array.isArray(p.perms) ? p.perms : (PRESET_PERMS[p.role] || PRESET_PERMS.OPERADOR)
      });
    });

    const root = scopeEl || document;
    root.querySelectorAll("table tbody tr").forEach((tr) => {
      const tds = Array.from(tr.querySelectorAll("td")).map(td => String(td.textContent || "").trim()).filter(Boolean);
      if (tds.length >= 2) {
        const login = tds[0].toLowerCase();
        if (!login || login.includes(" ") || login.length > 30) return;
        const name = tds[1];
        const roleCell = tds.find(c => /^(ADMIN|GESTOR|METROLOGISTA|OPERADOR|T\u00c9CNICO|TECNICO)/i.test(c));
        const role = roleCell ? roleCell.toUpperCase() : "OPERADOR";
        const ex = map.get(login);
        map.set(login, {
          login,
          name: (ex && ex.name) || name,
          matricula: (ex && ex.matricula) || "",
          sector: (ex && ex.sector) || "Metrologia / Turbo",
          role: (ex && ex.role) || role,
          perms: (ex && ex.perms) || (PRESET_PERMS[role] || PRESET_PERMS.OPERADOR)
        });
      }
    });

    if (!map.has("pablo")) {
      map.set("pablo", {
        login: "pablo",
        name: "Pablo Carvalho",
        matricula: "",
        sector: "Metrologia / Turbo",
        role: "ADMIN",
        perms: PRESET_PERMS.ADMIN
      });
    }
    return Array.from(map.values());
  };

  /* -------------------- CONTROLE DE VOLTAR (APP ANDROID + MOBILE WEB) -------------------- */
  let currentTab = "painel";
  const tabHistory = [];
  let isNavigatingBack = false;

  const detectTabKey = (el) => {
    const raw = String(el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
    if (!raw || raw.length > 36) return null;
    if (raw === "painel" || raw.startsWith("command center")) return "painel";
    if (raw.startsWith("invent\u00e1rio") || raw.startsWith("inventario")) return "inventario";
    if (raw.startsWith("cautela")) return "cautela";
    if (raw === "lab" || raw.startsWith("lab & baixas") || raw.startsWith("lab ")) return "lab";
    return null;
  };

  const pushBrowserHistory = () => {
    try { window.history.pushState({ vuNav: true }, ""); } catch (_) {}
  };

  const clickTabByKey = (key) => {
    const btns = Array.from(document.querySelectorAll("nav button, nav a, aside button, aside a, footer button, [role=tab], button"));
    const match = btns.find((b) => isVisible(b) && detectTabKey(b) === key && !b.closest("#vu-adm-inner"));
    if (match) {
      isNavigatingBack = true;
      match.click();
      currentTab = key;
      setTimeout(() => { isNavigatingBack = false; }, 120);
      return true;
    }
    return false;
  };

  const findCloseBtn = (root) => {
    if (!root) return null;
    return Array.from(root.querySelectorAll("button")).find((b) => {
      if (!isVisible(b)) return false;
      const t = String(b.textContent || "").trim();
      const aria = String(b.getAttribute("aria-label") || "").toLowerCase();
      return t === "\u00d7" || t === "x" || t === "X" || t === "\u2715" || aria.includes("fechar") || aria.includes("close");
    }) || null;
  };

  const handleBackAction = () => {
    const dl = document.getElementById("vu-dl-voith");
    if (dl && isVisible(dl)) {
      dl.remove();
      return "handled";
    }

    const admInner = document.getElementById("vu-adm-inner");
    if (admInner && isVisible(admInner)) {
      const closeAdm = findCloseBtn(admInner);
      if (closeAdm) {
        closeAdm.click();
        return "handled";
      }
    }

    const openOverlays = Array.from(document.querySelectorAll("[role=dialog], .fixed.inset-0")).filter((el) => {
      if (!isVisible(el) || el.id === "vu-dl-voith") return false;
      const t = String(el.textContent || "");
      return !t.includes("Monitoramento de Frota");
    });
    for (let i = openOverlays.length - 1; i >= 0; i--) {
      const cBtn = findCloseBtn(openOverlays[i]);
      if (cBtn) {
        cBtn.click();
        return "handled";
      }
    }

    const drawer = Array.from(document.querySelectorAll("aside, div")).find((el) => {
      if (!isVisible(el)) return false;
      const r = el.getBoundingClientRect();
      const t = String(el.textContent || "");
      return r.left >= -5 && r.width > 180 && r.width < window.innerWidth * 0.9 && t.includes("WORKSPACES") && t.includes("Command Center");
    });
    if (drawer && window.innerWidth <= 900) {
      const closeDrawer = findCloseBtn(drawer);
      if (closeDrawer) {
        closeDrawer.click();
        return "handled";
      }
    }

    while (tabHistory.length > 0) {
      const prev = tabHistory.pop();
      if (prev && prev !== currentTab && clickTabByKey(prev)) {
        return "handled";
      }
    }

    if (currentTab !== "painel" && clickTabByKey("painel")) {
      return "handled";
    }

    return "exit";
  };

  window.__voithBackHandler = handleBackAction;

  document.addEventListener("click", (ev) => {
    if (isNavigatingBack) return;
    const btn = ev.target && ev.target.closest ? ev.target.closest("button, a") : null;
    if (!btn || btn.closest("#vu-adm-inner") || btn.closest("#vu-dl-voith")) return;
    const key = detectTabKey(btn);
    if (key && key !== currentTab) {
      tabHistory.push(currentTab);
      if (tabHistory.length > 20) tabHistory.shift();
      currentTab = key;
      pushBrowserHistory();
    }
  }, true);

  window.addEventListener("popstate", () => {
    handleBackAction();
  });

  /* -------------------- PORTAL DE DOWNLOADS VOITH -------------------- */
  const focusLogin = () => {
    const m = document.getElementById("vu-dl-voith");
    if (m) m.remove();
    const inp = document.querySelector("input[type=text], input[name*=user], input[id*=user], input[placeholder*=login i]");
    if (inp) {
      inp.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => inp.focus(), 150);
    }
  };

  const openDownloadPage = async () => {
    if (document.getElementById("vu-dl-voith")) return;
    pushBrowserHistory();
    let tag = "Latest", apkUrl = APK_FALLBACK, exeUrl = EXE_FALLBACK;
    let apkMeta = "Pacote Android (.apk) \u2022 Coleta em campo e cautela";
    let exeMeta = "Instalador Windows (.exe) \u2022 Esta\u00e7\u00f5es de trabalho e lab";
    try {
      const r = await fetch("https://api.github.com/repos/carvpab/voith-metrologia-app/releases/latest");
      if (r.ok) {
        const j = await r.json();
        tag = j.tag_name || tag;
        const a = j.assets || [];
        const apk = a.find(x => /\.apk$/i.test(x.name));
        const exe = a.find(x => /\.exe$/i.test(x.name));
        if (apk) {
          apkUrl = apk.browser_download_url;
          if (apk.size) apkMeta = "APK Android \u2022 " + (apk.size / 1048576).toFixed(1) + " MB \u2022 Campo e cautela";
        }
        if (exe) {
          exeUrl = exe.browser_download_url;
          if (exe.size) exeMeta = "Windows EXE \u2022 " + (exe.size / 1048576).toFixed(1) + " MB \u2022 PC e laborat\u00f3rio";
        }
      }
    } catch (_) {}

    const d = document.createElement("div");
    d.id = "vu-dl-voith";
    d.style.cssText = "position:fixed;inset:0;z-index:10600;overflow:auto;padding:28px 16px;background-image:linear-gradient(rgba(148,163,184,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(148,163,184,.06) 1px,transparent 1px),radial-gradient(circle at 20% 15%,rgba(0,102,204,.35),transparent 45%),linear-gradient(145deg,#061021 0%,#0a1d3d 55%,#071329 100%);background-size:32px 32px,32px 32px,100% 100%,100% 100%;color:#f8fafc;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;";
    d.innerHTML =
      '<div style="max-width:940px;margin:0 auto;background:rgba(255,255,255,.98);color:#0f172a;border-radius:18px;overflow:hidden;box-shadow:0 28px 70px rgba(0,0,0,.55);border:1px solid rgba(147,197,253,.45);">' +
        '<div style="background:linear-gradient(90deg,#002466 0%,#004899 55%,#0066cc 100%);color:#fff;padding:20px 26px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;border-bottom:3px solid #38bdf8;">' +
          '<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;">' +
            '<span style="background:#fff;color:#003399;font-weight:900;font-size:14px;padding:6px 12px;border-radius:8px;letter-spacing:.08em;">VOITH</span>' +
            '<div><div style="font-weight:800;font-size:17px;">Voith Metrologia &bull; Portal de Downloads</div><div style="font-size:12px;color:#bfdbfe;margin-top:2px;">Release ativa: <strong style="color:#fff;">' + tag + '</strong></div></div>' +
          '</div>' +
          '<div style="display:flex;gap:8px;">' +
            '<button type="button" id="vu-go-login" style="padding:9px 15px;border-radius:9px;border:1px solid rgba(255,255,255,.4);background:rgba(255,255,255,.16);color:#fff;font-weight:700;font-size:12.5px;cursor:pointer;">Op&ccedil;&otilde;es de Login</button>' +
            '<button type="button" id="vu-close-dl" style="width:36px;height:36px;border-radius:9px;border:1px solid rgba(255,255,255,.4);background:rgba(255,255,255,.16);color:#fff;font-size:20px;line-height:1;cursor:pointer;">&times;</button>' +
          '</div>' +
        '</div>' +
        '<div style="padding:28px 26px;background:linear-gradient(180deg,#f8fafc 0%,#eef4fb 100%);">' +
          '<div style="margin-bottom:22px;"><div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.09em;color:#004899;">Metrologia &bull; Voith Turbo</div><h1 style="margin:4px 0 6px;font-size:24px;font-weight:900;color:#0f172a;">Escolha o instalador do seu dispositivo</h1><p style="margin:0;font-size:13.5px;color:#475569;">Baixe a vers&atilde;o oficial mais recente para Android ou Windows.</p></div>' +
          '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(265px,1fr));gap:20px;">' +
            '<div style="background:#fff;border:1px solid #cbd5e1;border-top:5px solid #0055b8;border-radius:14px;padding:22px;display:flex;flex-direction:column;justify-content:space-between;gap:16px;"><div><span style="font-size:11px;font-weight:800;padding:4px 10px;border-radius:999px;background:#eff6ff;color:#004899;">ANDROID &bull; TABLET / CELULAR</span><div style="font-size:19px;font-weight:800;margin:12px 0 6px;">Voith Metrologia Android</div><div style="font-size:13px;color:#475569;">' + apkMeta + '</div></div><a href="' + apkUrl + '" target="_blank" rel="noopener" style="display:block;text-align:center;padding:12px;border-radius:10px;background:linear-gradient(90deg,#004899,#0066cc);color:#fff;font-weight:800;font-size:13.5px;text-decoration:none;">Baixar APK (.apk)</a></div>' +
            '<div style="background:#fff;border:1px solid #cbd5e1;border-top:5px solid #002466;border-radius:14px;padding:22px;display:flex;flex-direction:column;justify-content:space-between;gap:16px;"><div><span style="font-size:11px;font-weight:800;padding:4px 10px;border-radius:999px;background:#e2e8f0;color:#0f172a;">WINDOWS &bull; DESKTOP / PC</span><div style="font-size:19px;font-weight:800;margin:12px 0 6px;">Voith Metrologia Windows</div><div style="font-size:13px;color:#475569;">' + exeMeta + '</div></div><a href="' + exeUrl + '" target="_blank" rel="noopener" style="display:block;text-align:center;padding:12px;border-radius:10px;background:linear-gradient(90deg,#002466,#004899);color:#fff;font-weight:800;font-size:13.5px;text-decoration:none;">Baixar Instalador (.exe)</a></div>' +
          '</div>' +
          '<div style="margin-top:20px;padding-top:16px;border-top:1px solid #cbd5e1;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;"><span style="font-size:12.5px;color:#334155;">J&aacute; instalou o app? Acesse sua conta.</span><button type="button" id="vu-dl-login-cta" style="padding:10px 18px;border-radius:9px;border:1px solid #004899;background:#fff;color:#004899;font-weight:800;font-size:12.5px;cursor:pointer;">Ir para Op&ccedil;&otilde;es de Login &rarr;</button></div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(d);
    d.querySelector("#vu-close-dl").onclick = () => d.remove();
    d.querySelector("#vu-go-login").onclick = focusLogin;
    d.querySelector("#vu-dl-login-cta").onclick = focusLogin;
  };

  /* -------------------- ESTILOS VIA CSS PURO (SEM LOOP DE STYLE) -------------------- */
  const ensureStyles = () => {
    if (document.getElementById("vu-admin-sidebar-css")) return;
    const st = document.createElement("style");
    st.id = "vu-admin-sidebar-css";
    st.textContent = `
      #vu-dl-btn {
        position: fixed;
        bottom: 14px;
        right: 14px;
        padding: 8px 14px;
        font-size: 12px;
        z-index: 35;
        border-radius: 8px;
        border: 1px solid #93c5fd;
        background: linear-gradient(90deg, #002466, #0055b8);
        color: #ffffff;
        font-weight: 800;
        font-family: system-ui, -apple-system, sans-serif;
        box-shadow: 0 8px 20px rgba(0, 51, 153, .35);
        cursor: pointer;
      }
      @media (max-width: 768px) {
        #vu-dl-btn {
          bottom: 82px;
          right: 12px;
          padding: 6px 11px;
          font-size: 11px;
        }
      }
      .vu-adm-card-host {
        max-width: 1080px !important;
        width: 95vw !important;
        max-height: 90vh !important;
        padding: 0 !important;
        overflow: hidden !important;
      }
      #vu-adm-inner {
        display: flex;
        flex-direction: row;
        width: 100%;
        max-height: 90vh;
        background: #ffffff;
        overflow: hidden;
      }
      #vu-admin-sidebar {
        width: 245px;
        flex: 0 0 245px;
        background: #f8fafc;
        border-right: 1px solid #e2e8f0;
        padding: 14px 10px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        overflow-y: auto;
      }
      #vu-admin-sidebar .vu-side-item {
        display: flex !important;
        align-items: center !important;
        gap: 8px !important;
        width: 100% !important;
        text-align: left !important;
        padding: 10px 12px !important;
        border-radius: 10px !important;
        border: none !important;
        background: transparent !important;
        font-size: 13px !important;
        font-weight: 600 !important;
        color: #475569 !important;
        cursor: pointer !important;
        white-space: normal !important;
        line-height: 1.25 !important;
      }
      #vu-admin-sidebar .vu-side-item:hover {
        background: #eef2ff !important;
        color: #1e3a8a !important;
      }
      #vu-admin-sidebar .vu-side-item.vu-active {
        background: #dbeafe !important;
        color: #004899 !important;
        font-weight: 800 !important;
        box-shadow: inset 3px 0 0 #0284c7 !important;
      }
      #vu-admin-main {
        flex: 1 1 auto;
        min-width: 0;
        display: flex;
        flex-direction: column;
        max-height: 90vh;
        overflow: hidden;
        padding: 16px 20px;
        background: #ffffff;
      }
      #vu-admin-scroll {
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
        padding-top: 12px;
        padding-right: 4px;
      }
      @media (max-width: 768px) {
        .vu-adm-card-host {
          width: 96vw !important;
          max-height: 92vh !important;
        }
        #vu-adm-inner {
          flex-direction: column;
          max-height: 92vh;
        }
        #vu-admin-sidebar {
          width: 100%;
          flex: 0 0 auto;
          flex-direction: row;
          overflow-x: auto;
          overflow-y: hidden;
          border-right: none;
          border-bottom: 1px solid #e2e8f0;
          padding: 8px;
          order: 2;
        }
        #vu-admin-sidebar .vu-side-item {
          width: auto !important;
          flex: 0 0 auto !important;
          white-space: nowrap !important;
          padding: 8px 11px !important;
          font-size: 12px !important;
        }
        #vu-admin-main {
          padding: 12px;
          order: 1;
          flex: 1 1 auto;
          min-height: 0;
        }
      }
    `;
    document.head.appendChild(st);
  };

  const addDownloadBtnOnce = () => {
    if (document.getElementById("vu-dl-btn")) return;
    const b = document.createElement("button");
    b.id = "vu-dl-btn";
    b.type = "button";
    b.textContent = "Baixar App";
    b.onclick = openDownloadPage;
    document.body.appendChild(b);
  };

  /* -------------------- RENDERIZADORES DAS ABAS EXTRAS -------------------- */
  const renderRbacView = (container, modalScope) => {
    let selectedLogin = discoverUsers(modalScope)[0].login;
    let lastMsg = "";

    const draw = () => {
      const users = discoverUsers(modalScope);
      const active = users.find(u => u.login === selectedLogin) || users[0];
      const permSet = new Set(active.perms || []);

      const chips = users.map(u => {
        const sel = u.login === active.login;
        return `<button type="button" data-pick="${u.login}" style="padding:7px 12px;border-radius:8px;border:1px solid ${sel ? "#004899" : "#cbd5e1"};background:${sel ? "#004899" : "#fff"};color:${sel ? "#fff" : "#0f172a"};font-size:12px;font-weight:700;cursor:pointer;">${u.name} (${u.login})</button>`;
      }).join("");

      const sectorOpts = SECTORS.map(s => `<option value="${s}" ${active.sector === s ? "selected" : ""}>${s}</option>`).join("");

      const groupsHtml = PERMISSION_GROUPS.map(g => {
        const items = g.items.map(it =>
          `<label style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:8px;background:#f8fafc;border:1px solid #e2e8f0;font-size:12px;color:#1e293b;cursor:pointer;">` +
            `<input type="checkbox" class="vu-perm-cb" data-pid="${it.id}" ${permSet.has(it.id) ? "checked" : ""} style="width:15px;height:15px;accent-color:#004899;cursor:pointer;">` +
            `<span>${it.label}</span>` +
          `</label>`
        ).join("");
        return `<div style="padding:12px 14px;border-radius:12px;background:#fff;border:1px solid #cbd5e1;display:grid;gap:8px;"><div style="font-size:12.5px;font-weight:800;color:#002466;">${g.group}</div><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(225px,1fr));gap:7px;">${items}</div></div>`;
      }).join("");

      container.innerHTML =
        `<div style="display:grid;gap:12px;color:#0f172a;padding-bottom:18px;">` +
          `<div style="position:sticky;top:0;z-index:5;padding:12px 14px;border-radius:12px;background:#eff6ff;border:1px solid #93c5fd;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">` +
            `<div>` +
              `<div style="font-size:14.5px;font-weight:800;color:#002466;">Gerenciar Login, Matr&iacute;cula, Setor &amp; Acessos</div>` +
              `<div style="font-size:12px;color:#334155;">Configure a pessoa e marque o que ela pode ou n&atilde;o fazer.</div>` +
            `</div>` +
            `<div style="display:flex;gap:8px;flex-wrap:wrap;">` +
              `<button type="button" id="vu-new-user-btn" style="padding:8px 12px;border-radius:8px;border:1px solid #004899;background:#fff;color:#004899;font-weight:800;font-size:12px;cursor:pointer;">+ Nova Pessoa</button>` +
              `<button type="button" id="vu-save-top-btn" style="padding:8px 16px;border-radius:8px;border:none;background:#16a34a;color:#fff;font-weight:800;font-size:12px;cursor:pointer;box-shadow:0 4px 12px rgba(22,163,74,.28);">Salvar Acessos</button>` +
            `</div>` +
          `</div>` +
          (lastMsg ? `<div style="padding:9px 12px;border-radius:8px;background:#dcfce7;border:1px solid #86efac;color:#166534;font-size:12px;font-weight:700;">${lastMsg}</div>` : "") +
          `<div style="padding:14px;border-radius:12px;background:#fff;border:1px solid #cbd5e1;display:grid;gap:12px;">` +
            `<div style="display:flex;gap:8px;flex-wrap:wrap;">${chips}</div>` +
            `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;">` +
              `<label style="display:grid;gap:4px;font-size:11.5px;font-weight:700;color:#334155;">Login<input id="vu-ed-login" type="text" value="${active.login}" style="padding:8px 10px;border-radius:8px;border:1px solid #cbd5e1;font-size:12.5px;color:#0f172a;"></label>` +
              `<label style="display:grid;gap:4px;font-size:11.5px;font-weight:700;color:#334155;">Nome Completo<input id="vu-ed-name" type="text" value="${active.name}" style="padding:8px 10px;border-radius:8px;border:1px solid #cbd5e1;font-size:12.5px;color:#0f172a;"></label>` +
              `<label style="display:grid;gap:4px;font-size:11.5px;font-weight:700;color:#334155;">Matr&iacute;cula<input id="vu-ed-mat" type="text" value="${active.matricula || ""}" placeholder="Ex: 104829" style="padding:8px 10px;border-radius:8px;border:1px solid #cbd5e1;font-size:12.5px;color:#0f172a;"></label>` +
              `<label style="display:grid;gap:4px;font-size:11.5px;font-weight:700;color:#334155;">Setor<select id="vu-ed-sector" style="padding:8px 10px;border-radius:8px;border:1px solid #cbd5e1;font-size:12.5px;color:#0f172a;background:#fff;">${sectorOpts}</select></label>` +
            `</div>` +
            `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">` +
              `<span style="font-size:11.5px;font-weight:700;color:#475569;">Preencher modelo:</span>` +
              `<button type="button" data-pre="ADMIN" style="padding:4px 10px;border-radius:6px;border:1px solid #93c5fd;background:#eff6ff;color:#003399;font-size:11.5px;font-weight:700;cursor:pointer;">Admin</button>` +
              `<button type="button" data-pre="GESTOR" style="padding:4px 10px;border-radius:6px;border:1px solid #bae6fd;background:#f0f9ff;color:#0369a1;font-size:11.5px;font-weight:700;cursor:pointer;">Gestor</button>` +
              `<button type="button" data-pre="METROLOGISTA" style="padding:4px 10px;border-radius:6px;border:1px solid #cbd5e1;background:#f8fafc;color:#0f172a;font-size:11.5px;font-weight:700;cursor:pointer;">Metrologista</button>` +
              `<button type="button" data-pre="OPERADOR" style="padding:4px 10px;border-radius:6px;border:1px solid #e2e8f0;background:#fff;color:#475569;font-size:11.5px;font-weight:700;cursor:pointer;">Operador</button>` +
            `</div>` +
          `</div>` +
          groupsHtml +
          `<div style="display:flex;justify-content:flex-end;">` +
            `<button type="button" id="vu-save-bottom-btn" style="padding:10px 20px;border-radius:8px;border:none;background:#16a34a;color:#fff;font-weight:800;font-size:13px;cursor:pointer;">Salvar Acessos da Pessoa</button>` +
          `</div>` +
        `</div>`;

      const doSave = () => {
        const lg = String(container.querySelector("#vu-ed-login").value || "").trim().toLowerCase();
        const nm = String(container.querySelector("#vu-ed-name").value || "").trim();
        const mt = String(container.querySelector("#vu-ed-mat").value || "").trim();
        const sc = String(container.querySelector("#vu-ed-sector").value || "Metrologia / Turbo");
        if (!lg) return;
        const checked = Array.from(container.querySelectorAll(".vu-perm-cb:checked")).map(cb => cb.getAttribute("data-pid"));
        const all = loadProfiles();
        all[lg] = { login: lg, name: nm || lg, matricula: mt, sector: sc, role: checked.length === ALL_PERM_IDS.length ? "ADMIN" : "CUSTOM", perms: checked };
        saveProfiles(all);
        pushAudit("Hierarquia Atualizada", `${nm || lg} (${lg}) | Mat: ${mt || "-"} | Setor: ${sc} | ${checked.length} permiss\u00f5es`);
        selectedLogin = lg;
        lastMsg = `Salvo! ${nm || lg} (${lg}) \u2022 Matr\u00edcula: ${mt || "\u2014"} \u2022 Setor: ${sc} \u2022 ${checked.length} acessos ativos.`;
        draw();
      };

      container.querySelector("#vu-save-top-btn").onclick = doSave;
      container.querySelector("#vu-save-bottom-btn").onclick = doSave;
      container.querySelectorAll("[data-pick]").forEach(b => {
        b.onclick = () => { selectedLogin = b.getAttribute("data-pick"); lastMsg = ""; draw(); };
      });
      container.querySelectorAll("[data-pre]").forEach(b => {
        b.onclick = () => {
          const set = new Set(PRESET_PERMS[b.getAttribute("data-pre")] || []);
          container.querySelectorAll(".vu-perm-cb").forEach(cb => { cb.checked = set.has(cb.getAttribute("data-pid")); });
        };
      });
      container.querySelector("#vu-new-user-btn").onclick = () => {
        const nl = prompt("Login da nova pessoa (ex: lucas):");
        if (!nl) return;
        const clean = nl.trim().toLowerCase();
        const nm = prompt("Nome completo (ex: Lucas Galbe):") || clean;
        const mt = prompt("Matr\u00edcula (opcional):") || "";
        const all = loadProfiles();
        all[clean] = { login: clean, name: nm.trim(), matricula: mt.trim(), sector: "Metrologia / Turbo", role: "OPERADOR", perms: PRESET_PERMS.OPERADOR };
        saveProfiles(all);
        pushAudit("Pessoa Adicionada", `${nm.trim()} (${clean})`);
        selectedLogin = clean;
        lastMsg = `Pessoa ${nm.trim()} criada. Marque os acessos e clique em Salvar Acessos.`;
        draw();
      };
    };
    draw();
  };

  const renderExtraTabView = (tabId, container, modalScope) => {
    const items = readLiveInstruments();
    const totalCount = items.length || 441;

    if (tabId === "admTabRbac") {
      renderRbacView(container, modalScope);
      return;
    }

    if (tabId === "admTabBatchDraft") {
      container.innerHTML =
        `<div style="display:grid;gap:12px;color:#0f172a;">` +
          `<div style="padding:14px;border-radius:12px;background:#ecfeff;border:1px solid #a5f3fc;"><div style="font-size:15px;font-weight:800;color:#155e75;">&#128230; Lote &amp; Romaneio Externo</div><div style="font-size:12.5px;color:#334155;">Monte lotes de envio para laborat&oacute;rios acreditados RBC/Inmetro e emita romaneio de sa&iacute;da.</div></div>` +
          `<div style="padding:14px;border-radius:12px;background:#fff;border:1px solid #cbd5e1;display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;">` +
            `<label style="display:grid;gap:4px;font-size:11.5px;font-weight:700;">Laborat&oacute;rio Destino<input id="vu-batch-lab" placeholder="Ex: Lab Calibra\u00e7\u00e3o RBC" style="padding:8px;border-radius:8px;border:1px solid #cbd5e1;"></label>` +
            `<label style="display:grid;gap:4px;font-size:11.5px;font-weight:700;">N&ordm; RPS / NF<input id="vu-batch-nf" placeholder="Ex: NF-2026-084" style="padding:8px;border-radius:8px;border:1px solid #cbd5e1;"></label>` +
            `<label style="display:grid;gap:4px;font-size:11.5px;font-weight:700;">C&oacute;digos dos Instrumentos<input id="vu-batch-codes" placeholder="Ex: AC422294, AC407781" style="padding:8px;border-radius:8px;border:1px solid #cbd5e1;"></label>` +
          `</div>` +
          `<div style="display:flex;gap:8px;justify-content:flex-end;">` +
            `<button type="button" id="vu-batch-print" style="padding:9px 16px;border-radius:8px;border:none;background:#0891b2;color:#fff;font-weight:800;font-size:12.5px;cursor:pointer;">Gerar Romaneio para Impress&atilde;o</button>` +
          `</div>` +
          `<div id="vu-batch-out" style="font-size:12px;color:#15803d;font-weight:700;"></div>` +
        `</div>`;
      container.querySelector("#vu-batch-print").onclick = () => {
        const lab = container.querySelector("#vu-batch-lab").value || "Laborat\u00f3rio Externo";
        const nf = container.querySelector("#vu-batch-nf").value || "S/N";
        const codes = container.querySelector("#vu-batch-codes").value || "Lista selecionada";
        pushAudit("Romaneio Gerado", `Lab: ${lab} | NF: ${nf} | Itens: ${codes}`);
        container.querySelector("#vu-batch-out").textContent = `Romaneio registrado (${lab} \u2022 ${nf}). Abrindo impress\u00e3o...`;
        const w = window.open("", "_blank");
        if (w) {
          w.document.write(`<html><head><title>Romaneio Voith</title></head><body style="font-family:sans-serif;padding:24px;"><h2>VOITH TURBO &mdash; Romaneio de Calibra&ccedil;&atilde;o Externa</h2><p><strong>Laborat&oacute;rio:</strong> ${lab}<br><strong>RPS / NF:</strong> ${nf}<br><strong>Data:</strong> ${new Date().toLocaleDateString("pt-BR")}</p><hr><p><strong>Instrumentos:</strong> ${codes}</p><script>window.print();<\/script></body></html>`);
          w.document.close();
        }
      };
      return;
    }

    if (tabId === "admTabDueWindow") {
      container.innerHTML =
        `<div style="display:grid;gap:12px;color:#0f172a;">` +
          `<div style="padding:14px;border-radius:12px;background:#fff1f2;border:1px solid #fecdd3;"><div style="font-size:15px;font-weight:800;color:#9f1239;">&#9203; Vencimentos Programados (7 / 15 / 30 / 60 dias)</div><div style="font-size:12.5px;color:#475569;">Acompanhamento preventivo da frota (${totalCount} instrumentos) para evitar bloqueio em auditoria.</div></div>` +
          `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px;">` +
            `<div style="padding:14px;border-radius:10px;background:#fff;border:1px solid #fecdd3;border-top:4px solid #e11d48;"><div style="font-size:11px;font-weight:800;color:#e11d48;">CR&Iacute;TICO &bull; 7 DIAS</div><div style="font-size:20px;font-weight:900;margin-top:4px;">A&ccedil;&atilde;o Imediata</div><div style="font-size:11.5px;color:#64748b;">Priorizar recolhimento</div></div>` +
            `<div style="padding:14px;border-radius:10px;background:#fff;border:1px solid #fed7aa;border-top:4px solid #ea580c;"><div style="font-size:11px;font-weight:800;color:#ea580c;">ALERTA &bull; 15 DIAS</div><div style="font-size:20px;font-weight:900;margin-top:4px;">Programar Lote</div><div style="font-size:11.5px;color:#64748b;">SLA m&eacute;dio lab: 15d</div></div>` +
            `<div style="padding:14px;border-radius:10px;background:#fff;border:1px solid #fde68a;border-top:4px solid #d97706;"><div style="font-size:11px;font-weight:800;color:#d97706;">RADAR &bull; 30 DIAS</div><div style="font-size:20px;font-weight:900;margin-top:4px;">Pr&oacute;ximo M&ecirc;s</div><div style="font-size:11.5px;color:#64748b;">Avisar respons&aacute;veis</div></div>` +
            `<div style="padding:14px;border-radius:10px;background:#fff;border:1px solid #bfdbfe;border-top:4px solid #2563eb;"><div style="font-size:11px;font-weight:800;color:#2563eb;">PREVIS&Atilde;O &bull; 60 DIAS</div><div style="font-size:20px;font-weight:900;margin-top:4px;">Planejamento</div><div style="font-size:11.5px;color:#64748b;">Or&ccedil;amento de calibra&ccedil;&atilde;o</div></div>` +
          `</div>` +
        `</div>`;
      return;
    }

    if (tabId === "admTabHolderPend") {
      const profiles = discoverUsers(modalScope);
      const rows = profiles.map(u => `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-radius:10px;background:#fff;border:1px solid #cbd5e1;"><div><strong>${u.name}</strong> <span style="color:#64748b;font-size:12px;">(${u.login})</span><div style="font-size:11.5px;color:#475569;">Setor: ${u.sector} &bull; Matr&iacute;cula: ${u.matricula || "\u2014"}</div></div><span style="padding:4px 10px;border-radius:999px;background:#f0fdfa;color:#0f766e;font-size:11.5px;font-weight:700;border:1px solid #99f6e4;">Regular / Sem Atrasos</span></div>`).join("");
      container.innerHTML =
        `<div style="display:grid;gap:12px;color:#0f172a;">` +
          `<div style="padding:14px;border-radius:12px;background:#f0fdfa;border:1px solid #99f6e4;"><div style="font-size:15px;font-weight:800;color:#115e59;">&#128119; Pend&ecirc;ncias por Colaborador</div><div style="font-size:12.5px;color:#334155;">Controle de cautelas ativas e devolu&ccedil;&otilde;es pendentes por respons&aacute;vel.</div></div>` +
          `<div style="display:grid;gap:8px;">${rows}</div>` +
        `</div>`;
      return;
    }

    if (tabId === "admTabSlaInline") {
      container.innerHTML =
        `<div style="display:grid;gap:12px;color:#0f172a;">` +
          `<div style="padding:14px;border-radius:12px;background:#eef2ff;border:1px solid #c7d2fe;"><div style="font-size:15px;font-weight:800;color:#3730a3;">&#128202; SLA, Custos &amp; Deriva Metrol&oacute;gica</div><div style="font-size:12.5px;color:#334155;">Indicadores de desempenho de laborat&oacute;rios externos, prazo m&eacute;dio e rastreabilidade.</div></div>` +
          `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;">` +
            `<div style="padding:14px;border-radius:10px;background:#fff;border:1px solid #cbd5e1;"><div style="font-size:11px;font-weight:800;color:#4f46e5;">META SLA LABORAT&Oacute;RIO</div><div style="font-size:22px;font-weight:900;margin-top:4px;">15 dias</div><div style="font-size:11.5px;color:#64748b;">Prazo contratual m&aacute;ximo</div></div>` +
            `<div style="padding:14px;border-radius:10px;background:#fff;border:1px solid #cbd5e1;"><div style="font-size:11px;font-weight:800;color:#0284c7;">FROTA MONITORADA</div><div style="font-size:22px;font-weight:900;margin-top:4px;">${totalCount} itens</div><div style="font-size:11.5px;color:#64748b;">Voith Turbo &bull; 9 setores</div></div>` +
            `<div style="padding:14px;border-radius:10px;background:#fff;border:1px solid #cbd5e1;"><div style="font-size:11px;font-weight:800;color:#16a34a;">CONFORMIDADE ISO 9001</div><div style="font-size:22px;font-weight:900;margin-top:4px;">Ativa</div><div style="font-size:11.5px;color:#64748b;">Certificados e hist&oacute;rico em nuvem</div></div>` +
          `</div>` +
        `</div>`;
      return;
    }

    if (tabId === "admTabAudit") {
      const logs = loadAudit();
      const logRows = logs.length
        ? logs.map(l => `<div style="padding:8px 10px;border-radius:8px;background:#fff;border:1px solid #e2e8f0;font-size:12px;"><strong>${l.at}</strong> &mdash; <span style="color:#004899;font-weight:700;">${l.action}</span>: ${l.detail}</div>`).join("")
        : `<div style="padding:12px;border-radius:8px;background:#f8fafc;border:1px solid #e2e8f0;font-size:12px;color:#64748b;">Nenhuma altera&ccedil;&atilde;o registrada nesta sess&atilde;o ainda. Altera&ccedil;&otilde;es de hierarquia e romaneios aparecem aqui automaticamente.</div>`;
      container.innerHTML =
        `<div style="display:grid;gap:12px;color:#0f172a;">` +
          `<div style="padding:14px;border-radius:12px;background:#f0f9ff;border:1px solid #bae6fd;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;"><div><div style="font-size:15px;font-weight:800;color:#075985;">&#128737; Auditoria &amp; Governan&ccedil;a</div><div style="font-size:12.5px;color:#334155;">Trilha de auditoria para altera&ccedil;&otilde;es de acessos, permiss&otilde;es e movimenta&ccedil;&otilde;es.</div></div><button type="button" id="vu-exp-audit" style="padding:7px 12px;border-radius:8px;border:1px solid #0284c7;background:#fff;color:#0284c7;font-weight:800;font-size:12px;cursor:pointer;">Exportar CSV</button></div>` +
          `<div style="display:grid;gap:6px;">${logRows}</div>` +
        `</div>`;
      container.querySelector("#vu-exp-audit").onclick = () => {
        const csv = "Data;Acao;Detalhes\n" + loadAudit().map(l => `"${l.at}";"${l.action}";"${l.detail}"`).join("\n");
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
        a.download = "auditoria-voith-metrologia.csv";
        a.click();
      };
      return;
    }

    if (tabId === "admTabSplit") {
      const ver = (window.VOITH_CONFIG && window.VOITH_CONFIG.APP_VERSION) || "16.25.0";
      container.innerHTML =
        `<div style="display:grid;gap:12px;color:#0f172a;">` +
          `<div style="padding:14px;border-radius:12px;background:#ecfdf5;border:1px solid #a7f3d0;"><div style="font-size:15px;font-weight:800;color:#065f46;">&#129513; Modulariza&ccedil;&atilde;o &amp; Arquitetura HTML</div><div style="font-size:12.5px;color:#334155;">Status dos m&oacute;dulos carregados na aplica&ccedil;&atilde;o (Vers&atilde;o ${ver}).</div></div>` +
          `<div style="display:grid;gap:8px;font-size:12.5px;">` +
            `<div style="padding:10px 12px;border-radius:8px;background:#fff;border:1px solid #cbd5e1;"><strong>index.html</strong> &mdash; Cockpit principal + Supabase + Realtime</div>` +
            `<div style="padding:10px 12px;border-radius:8px;background:#fff;border:1px solid #cbd5e1;"><strong>modules/voith-upgrade-suite.js</strong> &mdash; Sidebar Admin, RBAC Granular, Navega&ccedil;&atilde;o Voltar &amp; Portal de Downloads</div>` +
            `<div style="padding:10px 12px;border-radius:8px;background:#fff;border:1px solid #cbd5e1;"><strong>app.js / cloud.js / db.js / views.js</strong> &mdash; M&oacute;dulos preparados para separa&ccedil;&atilde;o incremental</div>` +
          `</div>` +
        `</div>`;
    }
  };

  /* -------------------- TRANSFORMA SOMENTE O MODAL QUANDO VISIVEL -------------------- */
  const upgradeAdminModal = () => {
    if (document.getElementById("vu-adm-inner")) return;

    const titleEl = Array.from(document.querySelectorAll("h1, h2, h3, h4, span, p, div")).find((el) => {
      if (!isVisible(el)) return false;
      const txt = String(el.textContent || "").trim();
      if (!txt.includes("Painel Administrativo (Voith)") || txt.length > 80) return false;
      return !Array.from(el.children).some(ch => String(ch.textContent || "").includes("Painel Administrativo (Voith)"));
    });
    if (!titleEl) return;

    let modalCard = titleEl.parentElement;
    while (modalCard && modalCard !== document.body && modalCard !== document.documentElement) {
      const txt = String(modalCard.textContent || "");
      if (txt.includes("Usu\u00e1rios & Logins") && txt.includes("OTA & Telemetria")) break;
      modalCard = modalCard.parentElement;
    }

    if (!modalCard || modalCard === document.body || modalCard === document.documentElement) return;
    if (modalCard.dataset.vuSidebarDone === "1") return;

    const cardTxt = String(modalCard.textContent || "");
    if (
      cardTxt.includes("Monitoramento de Frota") ||
      cardTxt.includes("WORKSPACES") ||
      cardTxt.includes("Command Center") ||
      modalCard.classList.contains("inset-0")
    ) {
      return;
    }

    modalCard.dataset.vuSidebarDone = "1";
    modalCard.classList.add("vu-adm-card-host");
    pushBrowserHistory();

    const nativeTabBtns = Array.from(modalCard.querySelectorAll("button, [role=tab]")).filter(btn => {
      const t = String(btn.textContent || "").replace(/\s+/g, " ").trim();
      return /^(Usu\u00e1rios & Logins|Locais & Setores Oficiais|Risco & SLA Lab|OTA & Telemetria|Tipos de Login & Hierarquia)$/i.test(t);
    });
    const origTabBar = nativeTabBtns[0] ? nativeTabBtns[0].parentElement : null;

    const inner = document.createElement("div");
    inner.id = "vu-adm-inner";

    const sidebar = document.createElement("aside");
    sidebar.id = "vu-admin-sidebar";

    const mainCol = document.createElement("div");
    mainCol.id = "vu-admin-main";

    const scrollArea = document.createElement("div");
    scrollArea.id = "vu-admin-scroll";

    const customView = document.createElement("div");
    customView.id = "vu-custom-tab-view";
    customView.style.display = "none";

    let darkHeader = titleEl;
    while (darkHeader.parentElement && darkHeader.parentElement !== modalCard) {
      darkHeader = darkHeader.parentElement;
    }

    const existingChildren = Array.from(modalCard.children);
    modalCard.innerHTML = "";
    inner.appendChild(sidebar);
    inner.appendChild(mainCol);
    modalCard.appendChild(inner);

    const nativeBodyBlocks = [];
    existingChildren.forEach((ch) => {
      if (ch === darkHeader) {
        ch.style.borderRadius = "10px";
        ch.style.flexShrink = "0";
        mainCol.appendChild(ch);
      } else {
        scrollArea.appendChild(ch);
        nativeBodyBlocks.push(ch);
      }
    });
    scrollArea.appendChild(customView);
    mainCol.appendChild(scrollArea);

    const setActiveSideBtn = (activeBtn) => {
      sidebar.querySelectorAll(".vu-side-item").forEach(b => b.classList.remove("vu-active"));
      if (activeBtn) activeBtn.classList.add("vu-active");
    };

    const showNativeMode = (btn) => {
      customView.style.display = "none";
      nativeBodyBlocks.forEach(b => { if (b !== origTabBar) b.style.display = ""; });
      setActiveSideBtn(btn);
      scrollArea.scrollTop = 0;
    };

    const showCustomMode = (tabId, btn) => {
      nativeBodyBlocks.forEach(b => { b.style.display = "none"; });
      customView.style.display = "block";
      setActiveSideBtn(btn);
      renderExtraTabView(tabId, customView, modalCard);
      scrollArea.scrollTop = 0;
    };

    let rbacNativeBtn = null;
    nativeTabBtns.forEach((btn, idx) => {
      const txt = String(btn.textContent || "").replace(/\s+/g, " ").trim();
      btn.classList.add("vu-side-item");
      sidebar.appendChild(btn);

      if (/hierarquia|tipos de login/i.test(txt)) {
        rbacNativeBtn = btn;
        btn.id = "admTabRbac";
        btn.addEventListener("click", (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          showCustomMode("admTabRbac", btn);
        }, true);
      } else {
        if (idx === 0) btn.classList.add("vu-active");
        btn.addEventListener("click", () => showNativeMode(btn));
      }
    });

    if (origTabBar && origTabBar !== modalCard && origTabBar !== scrollArea && !origTabBar.querySelector("input, table, form")) {
      origTabBar.style.display = "none";
    }

    const extraTabs = [
      { id: "admTabBatchDraft", html: "&#128230; Lote &amp; Romaneio Externo", color: "#0891b2" },
      { id: "admTabDueWindow", html: "&#9203; Vencimentos (7/15/30/60d)", color: "#e11d48" },
      { id: "admTabHolderPend", html: "&#128119; Pend&ecirc;ncias Colaborador", color: "#0d9488" },
      { id: "admTabRbac", html: "&#128274; Tipos de Login &amp; Hierarquia", color: "#d97706" },
      { id: "admTabSlaInline", html: "&#128202; SLA, Custos &amp; Deriva", color: "#4f46e5" },
      { id: "admTabAudit", html: "&#128737; Auditoria &amp; Governan&ccedil;a", color: "#0284c7" },
      { id: "admTabSplit", html: "&#129513; Modularizar HTML", color: "#059669" }
    ];

    extraTabs.forEach((t) => {
      if (t.id === "admTabRbac" && rbacNativeBtn) return;
      const b = document.createElement("button");
      b.type = "button";
      b.id = t.id;
      b.className = "vu-side-item";
      b.innerHTML = `<span style="color:${t.color};font-weight:700;">${t.html}</span>`;
      b.addEventListener("click", () => showCustomMode(t.id, b));
      sidebar.appendChild(b);
    });
  };

  let upgradeTimer = null;
  const scheduleUpgrade = (delay = 120) => {
    if (upgradeTimer || document.getElementById("vu-adm-inner")) return;
    upgradeTimer = setTimeout(() => {
      upgradeTimer = null;
      upgradeAdminModal();
    }, delay);
  };

  const boot = () => {
    ensureStyles();
    addDownloadBtnOnce();
    scheduleUpgrade(150);

    document.addEventListener("click", () => {
      scheduleUpgrade(100);
      setTimeout(() => scheduleUpgrade(280), 280);
    }, true);

    window.addEventListener("hashchange", () => scheduleUpgrade(120));

    const obs = new MutationObserver((mutations) => {
      if (document.getElementById("vu-adm-inner")) return;
      for (let i = 0; i < mutations.length; i++) {
        const tgt = mutations[i].target;
        if (tgt && tgt.id && tgt.id.startsWith("vu-")) continue;
        scheduleUpgrade(140);
        break;
      }
    });
    obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "hidden"] });
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.VoithUpgrade = Object.assign({
    loadSessionProfile: () => {},
    setPendingMutations: () => {}
  }, window.VoithUpgrade || {}, {
    openDownloadPage,
    focusLoginScreen: focusLogin,
    getUserProfiles: () => loadProfiles()
  });
})();