(() => {
  const APK = "https://github.com/carvpab/voith-metrologia-app/releases/latest/download/voith-metrologia.apk";
  const EXE = "https://github.com/carvpab/voith-metrologia-app/releases/latest/download/voith-metrologia-setup.exe";
  const PERM_KEY = "voith_user_permissions_matrix_v1";

  const PERMISSIONS = [
    { id: "view_dashboard", label: "Ver Dashboard & KPIs", group: "Leitura" },
    { id: "view_inventory", label: "Consultar Inventário (441)", group: "Leitura" },
    { id: "view_cautela", label: "Consultar Cautela & Campo", group: "Leitura" },
    { id: "edit_instrument", label: "Editar / Cadastrar Instrumentos", group: "Operação" },
    { id: "delete_instrument", label: "Excluir Instrumentos", group: "Operação" },
    { id: "register_calib", label: "Registrar Calibrações & Certificados", group: "Operação" },
    { id: "batch_external", label: "Criar / Enviar Lote & Romaneio Externo", group: "Operação" },
    { id: "mark_lost_deact", label: "Marcar Perdido / Baixar Equipamento", group: "Operação" },
    { id: "export_reports", label: "Gerar PDF / Relatórios / Backup", group: "Gestão" },
    { id: "sync_cloud_ota", label: "Sincronizar Nuvem & Atualizações OTA", group: "Gestão" },
    { id: "manage_users", label: "Criar / Gerenciar Usuários & Logins", group: "Admin" },
    { id: "manage_hierarchy", label: "Configurar Hierarquia & Permissões", group: "Admin" }
  ];

  const PRESETS = {
    ADMIN: PERMISSIONS.map(p => p.id),
    GESTOR: ["view_dashboard", "view_inventory", "view_cautela", "edit_instrument", "register_calib", "batch_external", "export_reports", "sync_cloud_ota"],
    METROLOGISTA: ["view_dashboard", "view_inventory", "view_cautela", "edit_instrument", "register_calib", "batch_external", "export_reports"],
    OPERADOR: ["view_dashboard", "view_inventory", "view_cautela"]
  };

  const loadMatrix = () => {
    try { return JSON.parse(localStorage.getItem(PERM_KEY) || "{}"); } catch (_) { return {}; }
  };

  const saveMatrix = (data) => {
    try { localStorage.setItem(PERM_KEY, JSON.stringify(data)); } catch (_) {}
  };

  const discoverUsers = () => {
    const list = [];
    const seen = new Set();
    document.querySelectorAll("table tbody tr").forEach((tr) => {
      const tds = Array.from(tr.querySelectorAll("td")).map(c => String(c.textContent || "").trim()).filter(Boolean);
      if (tds.length >= 2) {
        const login = tds[0].toLowerCase();
        const name = tds[1];
        const role = (tds.find(c => /^(ADMIN|GESTOR|METROLOGISTA|OPERADOR|TÉCNICO|TECNICO)/i.test(c)) || "OPERADOR").toUpperCase();
        if (login && !seen.has(login)) {
          seen.add(login);
          list.push({ login, name, role });
        }
      }
    });
    if (!list.length) {
      list.push({ login: "pablo", name: "Pablo Carvalho", role: "ADMIN" });
    }
    return list;
  };

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
    let tag = "Latest", apkUrl = APK, exeUrl = EXE;
    let apkMeta = "Pacote Android (.apk) • Campo e cautela";
    let exeMeta = "Instalador Windows (.exe) • Estações e lab";
    try {
      const r = await fetch("https://api.github.com/repos/carvpab/voith-metrologia-app/releases/latest");
      if (r.ok) {
        const j = await r.json();
        tag = j.tag_name || tag;
        const a = j.assets || [];
        const apkAsset = a.find(x => /\.apk$/i.test(x.name));
        const exeAsset = a.find(x => /\.exe$/i.test(x.name));
        if (apkAsset) {
          apkUrl = apkAsset.browser_download_url;
          if (apkAsset.size) apkMeta = "APK Android • " + (apkAsset.size / (1024 * 1024)).toFixed(1) + " MB";
        }
        if (exeAsset) {
          exeUrl = exeAsset.browser_download_url;
          if (exeAsset.size) exeMeta = "Windows EXE • " + (exeAsset.size / (1024 * 1024)).toFixed(1) + " MB";
        }
      }
    } catch (_) {}

    const d = document.createElement("div");
    d.id = "vu-dl-voith";
    d.style.cssText = "position:fixed;inset:0;z-index:10600;overflow:auto;padding:24px 16px;background-image:linear-gradient(rgba(148,163,184,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(148,163,184,.06) 1px,transparent 1px),linear-gradient(145deg,#061021 0%,#0a1d3d 55%,#071329 100%);background-size:32px 32px,32px 32px,100% 100%;color:#f8fafc;font-family:system-ui,-apple-system,sans-serif;";
    d.innerHTML =
      "<div style=\"max-width:920px;margin:0 auto;background:#ffffff;color:#0f172a;border-radius:16px;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.5);border:1px solid #cbd5e1;\">" +
        "<div style=\"background:linear-gradient(90deg,#002466 0%,#0055b8 100%);color:#fff;padding:18px 24px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;\">" +
          "<div style=\"display:flex;align-items:center;gap:12px;\"><span style=\"background:#fff;color:#003399;font-weight:900;font-size:13px;padding:5px 10px;border-radius:6px;\">VOITH</span><div><div style=\"font-weight:800;font-size:16px;\">Voith Metrologia &bull; Downloads</div><div style=\"font-size:12px;color:#dbeafe;\">Release: " + tag + "</div></div></div>" +
          "<div style=\"display:flex;gap:8px;\"><button type=\"button\" id=\"vu-go-login\" style=\"padding:8px 14px;border-radius:8px;border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.15);color:#fff;font-weight:700;font-size:12px;cursor:pointer;\">Op&ccedil;&otilde;es de Login</button><button type=\"button\" id=\"vu-close-dl\" style=\"width:34px;height:34px;border-radius:8px;border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.15);color:#fff;font-size:18px;line-height:1;cursor:pointer;\">&times;</button></div>" +
        "</div>" +
        "<div style=\"padding:24px;background:#f8fafc;display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px;\">" +
          "<div style=\"background:#fff;border:1px solid #cbd5e1;border-top:4px solid #0055b8;border-radius:12px;padding:20px;display:flex;flex-direction:column;justify-content:space-between;gap:14px;\"><div><div style=\"font-weight:800;font-size:18px;color:#0f172a;\">Android (.APK)</div><div style=\"font-size:12.5px;color:#475569;margin-top:4px;\">" + apkMeta + "</div></div><a href=\"" + apkUrl + "\" target=\"_blank\" rel=\"noopener\" style=\"display:block;text-align:center;padding:11px;border-radius:8px;background:#0055b8;color:#fff;font-weight:800;font-size:13px;text-decoration:none;\">Baixar APK</a></div>" +
          "<div style=\"background:#fff;border:1px solid #cbd5e1;border-top:4px solid #002466;border-radius:12px;padding:20px;display:flex;flex-direction:column;justify-content:space-between;gap:14px;\"><div><div style=\"font-weight:800;font-size:18px;color:#0f172a;\">Windows (.EXE)</div><div style=\"font-size:12.5px;color:#475569;margin-top:4px;\">" + exeMeta + "</div></div><a href=\"" + exeUrl + "\" target=\"_blank\" rel=\"noopener\" style=\"display:block;text-align:center;padding:11px;border-radius:8px;background:#002466;color:#fff;font-weight:800;font-size:13px;text-decoration:none;\">Baixar Instalador EXE</a></div>" +
        "</div>" +
      "</div>";
    document.body.appendChild(d);
    d.querySelector("#vu-close-dl").onclick = () => d.remove();
    d.querySelector("#vu-go-login").onclick = focusLogin;
  };

  const addBtn = () => {
    if (document.getElementById("vu-dl-btn")) return;
    const b = document.createElement("button");
    b.id = "vu-dl-btn";
    b.type = "button";
    b.textContent = "Baixar App";
    const isMobile = window.innerWidth <= 768;
    b.style.cssText = "position:fixed;" + (isMobile ? "bottom:84px;right:12px;padding:6px 11px;font-size:11px;" : "bottom:14px;right:14px;padding:8px 14px;font-size:12px;") + "z-index:9950;border-radius:8px;border:1px solid #93c5fd;background:linear-gradient(90deg,#002466,#0055b8);color:#fff;font-weight:800;font-family:system-ui,-apple-system,sans-serif;box-shadow:0 8px 20px rgba(0,51,153,.35);cursor:pointer;";
    b.onclick = openDownloadPage;
    document.body.appendChild(b);
  };

  const findContentArea = (tabEl) => {
    const modal = tabEl.closest("[role=dialog], .modal, [class*='modal' i], [class*='admin' i]") || document.body;
    const candidates = Array.from(modal.querySelectorAll("div, section")).filter((el) => {
      if (el.id === "vu-rbac-matrix-box") return false;
      const hasFormOrTable = el.querySelector("input, select, table, form");
      const notSidebar = !el.closest("aside, nav, [class*='sidebar' i]");
      return Boolean(hasFormOrTable && notSidebar);
    });
    return candidates[0] || modal;
  };

  const hideRbacBox = () => {
    const box = document.getElementById("vu-rbac-matrix-box");
    if (box) box.style.display = "none";
    document.querySelectorAll("[data-vu-rbac-hidden='1']").forEach((el) => {
      el.style.display = el.dataset.vuPrevDisp || "";
      delete el.dataset.vuRbacHidden;
      delete el.dataset.vuPrevDisp;
    });
  };

  const openRbacMatrix = (tabEl) => {
    const area = findContentArea(tabEl);
    if (!area) return;

    Array.from(area.children).forEach((child) => {
      if (child.id === "vu-rbac-matrix-box") return;
      if (!child.dataset.vuRbacHidden) {
        child.dataset.vuPrevDisp = child.style.display || "";
        child.dataset.vuRbacHidden = "1";
      }
      child.style.display = "none";
    });

    let box = document.getElementById("vu-rbac-matrix-box");
    if (!box) {
      box = document.createElement("div");
      box.id = "vu-rbac-matrix-box";
      box.style.cssText = "display:grid;gap:12px;color:#0f172a;font-family:system-ui,-apple-system,sans-serif;";
      area.appendChild(box);
    }

    const users = discoverUsers();
    const matrix = loadMatrix();

    const getUserPerms = (u) => {
      if (Array.isArray(matrix[u.login])) return new Set(matrix[u.login]);
      const base = PRESETS[u.role] || PRESETS.OPERADOR;
      return new Set(base);
    };

    const userCardsHtml = users.map((u) => {
      const activeSet = getUserPerms(u);
      const checksHtml = PERMISSIONS.map((p) => {
        const checked = activeSet.has(p.id) ? "checked" : "";
        return (
          `<label style="display:flex;align-items:center;gap:7px;padding:6px 8px;border-radius:7px;background:#f8fafc;border:1px solid #e2e8f0;font-size:11.5px;color:#1e293b;cursor:pointer;">` +
            `<input type="checkbox" data-login="${u.login}" data-perm="${p.id}" ${checked} style="width:14px;height:14px;accent-color:#0055b8;cursor:pointer;">` +
            `<span>${p.label}</span>` +
          `</label>`
        );
      }).join("");

      return (
        `<div data-user-card="${u.login}" style="padding:12px 14px;border-radius:12px;background:#ffffff;border:1px solid #cbd5e1;display:grid;gap:10px;">` +
          `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">` +
            `<div>` +
              `<span style="font-weight:800;font-size:13.5px;color:#0f172a;">${u.name}</span> ` +
              `<span style="font-size:12px;color:#64748b;">(${u.login})</span>` +
            `</div>` +
            `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">` +
              `<span style="font-size:11px;font-weight:700;color:#475569;">Modelo rápido:</span>` +
              `<button type="button" data-preset="${u.login}:ADMIN" style="padding:3px 8px;border-radius:6px;border:1px solid #93c5fd;background:#eff6ff;color:#003399;font-size:11px;font-weight:700;cursor:pointer;">Admin</button>` +
              `<button type="button" data-preset="${u.login}:GESTOR" style="padding:3px 8px;border-radius:6px;border:1px solid #bae6fd;background:#f0f9ff;color:#0369a1;font-size:11px;font-weight:700;cursor:pointer;">Gestor</button>` +
              `<button type="button" data-preset="${u.login}:METROLOGISTA" style="padding:3px 8px;border-radius:6px;border:1px solid #cbd5e1;background:#f8fafc;color:#0f172a;font-size:11px;font-weight:700;cursor:pointer;">Metrologista</button>` +
              `<button type="button" data-preset="${u.login}:OPERADOR" style="padding:3px 8px;border-radius:6px;border:1px solid #e2e8f0;background:#fff;color:#475569;font-size:11px;font-weight:700;cursor:pointer;">Operador</button>` +
            `</div>` +
          `</div>` +
          `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(215px,1fr));gap:6px;">${checksHtml}</div>` +
        `</div>`
      );
    }).join("");

    box.innerHTML =
      `<div style="padding:12px 14px;border-radius:12px;background:linear-gradient(90deg,#eff6ff,#dbeafe);border:1px solid #93c5fd;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">` +
        `<div>` +
          `<div style="font-weight:800;font-size:14px;color:#002466;">Tipos de Login &amp; Permissões por Pessoa</div>` +
          `<div style="font-size:12px;color:#334155;">Marque ou desmarque as caixas do que cada pessoa pode ou não fazer.</div>` +
        `</div>` +
        `<button type="button" id="vu-save-perms-btn" style="padding:8px 16px;border-radius:8px;border:none;background:#0055b8;color:#ffffff;font-weight:800;font-size:12px;cursor:pointer;">Salvar Permissões</button>` +
      `</div>` +
      `<div style="display:grid;gap:10px;">${userCardsHtml}</div>` +
      `<div id="vu-perms-msg" style="font-size:12px;font-weight:700;color:#15803d;min-height:16px;"></div>`;

    box.querySelectorAll("[data-preset]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const [login, presetKey] = String(btn.getAttribute("data-preset") || "").split(":");
        const allowed = new Set(PRESETS[presetKey] || []);
        box.querySelectorAll(`input[type=checkbox][data-login="${login}"]`).forEach((cb) => {
          cb.checked = allowed.has(cb.getAttribute("data-perm"));
        });
      });
    });

    box.querySelector("#vu-save-perms-btn").onclick = () => {
      const next = loadMatrix();
      users.forEach((u) => {
        const checkedIds = Array.from(box.querySelectorAll(`input[type=checkbox][data-login="${u.login}"]:checked`))
          .map(cb => cb.getAttribute("data-perm"));
        next[u.login] = checkedIds;
      });
      saveMatrix(next);
      const msg = box.querySelector("#vu-perms-msg");
      if (msg) msg.textContent = "Permissões salvas para cada pessoa!";
    };

    box.style.display = "grid";
  };

  const hookTabs = () => {
    addBtn();
    const candidates = Array.from(document.querySelectorAll("button, a, [role=tab]")).filter((el) => {
      const t = String(el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
      return t.includes("hierarqu") || t.includes("tipos de login") || el.id === "admTabRbac";
    });

    candidates.forEach((tab) => {
      if (tab.dataset.vuRbacHooked) return;
      tab.dataset.vuRbacHooked = "1";
      tab.addEventListener("click", () => setTimeout(() => openRbacMatrix(tab), 60));
    });

    const otherTabs = Array.from(document.querySelectorAll("aside button, aside a, nav button, nav a, [role=tab], [id^='admTab']")).filter((el) => {
      const t = String(el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
      return !t.includes("hierarqu") && !t.includes("tipos de login") && el.id !== "admTabRbac";
    });

    otherTabs.forEach((ot) => {
      if (ot.dataset.vuOtherHooked) return;
      ot.dataset.vuOtherHooked = "1";
      ot.addEventListener("click", () => hideRbacBox());
    });
  };

  const obs = new MutationObserver(hookTabs);
  const boot = () => {
    addBtn();
    hookTabs();
    obs.observe(document.body, { childList: true, subtree: true });
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.VoithUpgrade = Object.assign({}, window.VoithUpgrade, {
    openDownloadPage,
    focusLoginScreen: focusLogin,
    getUserPermissions: () => loadMatrix()
  });
})();