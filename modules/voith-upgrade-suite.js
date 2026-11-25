(() => {
  const APK = "https://github.com/carvpab/voith-metrologia-app/releases/latest/download/voith-metrologia.apk";
  const EXE = "https://github.com/carvpab/voith-metrologia-app/releases/latest/download/voith-metrologia-setup.exe";
  const PROFILES_KEY = "voith_detailed_user_profiles_v1";

  const SECTORS = [
    "Metrologia / Turbo",
    "Qualidade",
    "Ferroviária",
    "Automotive/Engates",
    "Assistência Técnica Automotive",
    "Industrial",
    "Assistência Técnica Industrial",
    "Ferroviária Redutor",
    "Vorecon"
  ];

  const PERMISSION_GROUPS = [
    {
      group: "Inventário & Instrumentos",
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
      group: "Calibrações, Cautela & Laboratório",
      items: [
        { id: "cal_register", label: "Registrar calibração e número de certificado" },
        { id: "cal_batch_send", label: "Criar e enviar Lote / Romaneio Externo" },
        { id: "cal_batch_return", label: "Registrar retorno de laboratório externo" },
        { id: "cautela_assign", label: "Realizar cautela / entrega a colaborador" },
        { id: "cautela_return", label: "Registrar devolução de cautela" }
      ]
    },
    {
      group: "Relatórios, Nuvem, OTA & Administração",
      items: [
        { id: "rep_pdf_iso", label: "Gerar relatórios PDF / Auditoria ISO / Armário" },
        { id: "rep_backup", label: "Exportar e restaurar backup completo" },
        { id: "cloud_sync", label: "Sincronizar dados com nuvem / Google Sheets" },
        { id: "ota_manage", label: "Ver e disparar atualizações OTA / App" },
        { id: "adm_users", label: "Criar e gerenciar logins de usuários" },
        { id: "adm_hierarchy", label: "Configurar matrículas, setores e permissões" }
      ]
    }
  ];

  const ALL_PERM_IDS = PERMISSION_GROUPS.flatMap(g => g.items.map(i => i.id));

  const PRESET_PERMS = {
    ADMIN: ALL_PERM_IDS,
    GESTOR: [
      "inv_view", "inv_create", "inv_edit", "inv_lost", "inv_restore",
      "cal_register", "cal_batch_send", "cal_batch_return",
      "cautela_assign", "cautela_return",
      "rep_pdf_iso", "rep_backup", "cloud_sync", "ota_manage"
    ],
    METROLOGISTA: [
      "inv_view", "inv_create", "inv_edit",
      "cal_register", "cal_batch_send", "cal_batch_return",
      "cautela_assign", "cautela_return", "rep_pdf_iso", "cloud_sync"
    ],
    OPERADOR: [
      "inv_view", "cautela_assign", "cautela_return", "rep_pdf_iso"
    ]
  };

  const loadProfiles = () => {
    try { return JSON.parse(localStorage.getItem(PROFILES_KEY) || "{}"); } catch (_) { return {}; }
  };

  const saveProfiles = (obj) => {
    try { localStorage.setItem(PROFILES_KEY, JSON.stringify(obj)); } catch (_) {}
  };

  const getDiscoveredUsers = () => {
    const stored = loadProfiles();
    const map = new Map();

    Object.entries(stored).forEach(([loginKey, p]) => {
      map.set(loginKey.toLowerCase(), {
        login: loginKey.toLowerCase(),
        name: p.name || loginKey,
        matricula: p.matricula || "",
        sector: p.sector || "Metrologia / Turbo",
        role: p.role || "OPERADOR",
        perms: Array.isArray(p.perms) ? p.perms : (PRESET_PERMS[p.role] || PRESET_PERMS.OPERADOR)
      });
    });

    document.querySelectorAll("table tbody tr").forEach((tr) => {
      const tds = Array.from(tr.querySelectorAll("td")).map(td => String(td.textContent || "").trim()).filter(Boolean);
      if (tds.length >= 2) {
        const login = tds[0].toLowerCase();
        const name = tds[1];
        const roleMatch = tds.find(c => /^(ADMIN|GESTOR|METROLOGISTA|OPERADOR|TÉCNICO|TECNICO)/i.test(c));
        const role = roleMatch ? roleMatch.toUpperCase() : "OPERADOR";
        const existing = map.get(login);
        map.set(login, {
          login,
          name: (existing && existing.name) || name,
          matricula: (existing && existing.matricula) || "",
          sector: (existing && existing.sector) || "Metrologia / Turbo",
          role: (existing && existing.role) || role,
          perms: (existing && existing.perms) || (PRESET_PERMS[role] || PRESET_PERMS.OPERADOR)
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

  const ensureSidebarTabs = () => {
    const extraTabs = [
      { id: "admTabRbac", label: "Tipos de Login & Hierarquia" },
      { id: "admTabSlaInline", label: "SLA, Custos & Deriva" },
      { id: "admTabAudit", label: "Auditoria & Governança" },
      { id: "admTabSplit", label: "Modularizar HTML" }
    ];

    const sidebars = Array.from(document.querySelectorAll("aside, nav, [class*='sidebar' i], [class*='menu' i]")).filter((el) => {
      const txt = String(el.textContent || "");
      return txt.includes("Usuários & Logins") || txt.includes("OTA & Telemetria");
    });

    sidebars.forEach((sb) => {
      extraTabs.forEach((t) => {
        const exists = Array.from(sb.querySelectorAll("button, a, [role=tab]")).some((el) => {
          const curTxt = String(el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
          return el.id === t.id || curTxt.includes(t.label.toLowerCase().slice(0, 12));
        });
        if (!exists) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.id = t.id;
          btn.textContent = t.label;
          btn.style.cssText = "display:flex;align-items:center;width:100%;text-align:left;padding:9px 12px;margin-top:4px;border-radius:8px;border:none;background:transparent;color:#334155;font-size:12.5px;font-weight:600;cursor:pointer;";
          sb.appendChild(btn);
        }
      });
    });
  };

  const findMainPanelArea = (tabEl) => {
    const modal = tabEl.closest("[role=dialog], .modal, [class*='modal' i], [class*='admin' i]") || document.body;
    const candidates = Array.from(modal.querySelectorAll("div, section, main")).filter((el) => {
      if (el.id === "vu-rbac-full-panel") return false;
      const notNav = !el.closest("aside, nav, [class*='sidebar' i]");
      const hasContent = el.querySelector("input, select, table, form") || el.children.length >= 2;
      return Boolean(notNav && hasContent);
    });
    return candidates[0] || modal;
  };

  const hideRbacPanel = () => {
    const p = document.getElementById("vu-rbac-full-panel");
    if (p) p.style.display = "none";
    document.querySelectorAll("[data-vu-hid='1']").forEach((el) => {
      el.style.display = el.dataset.vuPrevD || "";
      delete el.dataset.vuHid;
      delete el.dataset.vuPrevD;
    });
  };

  const renderRbacPanel = (tabEl) => {
    const area = findMainPanelArea(tabEl);
    if (!area) return;

    Array.from(area.children).forEach((ch) => {
      if (ch.id === "vu-rbac-full-panel") return;
      if (!ch.dataset.vuHid) {
        ch.dataset.vuPrevD = ch.style.display || "";
        ch.dataset.vuHid = "1";
      }
      ch.style.display = "none";
    });

    let panel = document.getElementById("vu-rbac-full-panel");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "vu-rbac-full-panel";
      panel.style.cssText = "display:grid;gap:14px;color:#0f172a;font-family:system-ui,-apple-system,sans-serif;";
      area.appendChild(panel);
    }

    const users = getDiscoveredUsers();
    let selectedLogin = users[0] ? users[0].login : "pablo";

    const drawEditor = () => {
      const currentUsers = getDiscoveredUsers();
      const activeUser = currentUsers.find(u => u.login === selectedLogin) || currentUsers[0];
      const activePerms = new Set((activeUser && activeUser.perms) || []);

      const userChipsHtml = currentUsers.map((u) => {
        const isSel = u.login === activeUser.login;
        return (
          `<button type="button" data-pick-user="${u.login}" style="padding:7px 12px;border-radius:8px;border:1px solid ${isSel ? "#004899" : "#cbd5e1"};background:${isSel ? "#004899" : "#ffffff"};color:${isSel ? "#ffffff" : "#0f172a"};font-size:12px;font-weight:700;cursor:pointer;">` +
            `${u.name} (${u.login})` +
          `</button>`
        );
      }).join("");

      const sectorOpts = SECTORS.map((s) =>
        `<option value="${s}" ${activeUser.sector === s ? "selected" : ""}>${s}</option>`
      ).join("");

      const groupsHtml = PERMISSION_GROUPS.map((grp) => {
        const checks = grp.items.map((item) => {
          const chk = activePerms.has(item.id) ? "checked" : "";
          return (
            `<label style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:8px;background:#f8fafc;border:1px solid #e2e8f0;font-size:12px;color:#1e293b;cursor:pointer;">` +
              `<input type="checkbox" class="vu-perm-cb" data-perm-id="${item.id}" ${chk} style="width:15px;height:15px;accent-color:#004899;cursor:pointer;">` +
              `<span>${item.label}</span>` +
            `</label>`
          );
        }).join("");

        return (
          `<div style="padding:12px 14px;border-radius:12px;background:#ffffff;border:1px solid #cbd5e1;display:grid;gap:8px;">` +
            `<div style="font-size:12.5px;font-weight:800;color:#002466;">${grp.group}</div>` +
            `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:7px;">${checks}</div>` +
          `</div>`
        );
      }).join("");

      panel.innerHTML =
        `<div style="padding:14px 16px;border-radius:12px;background:#ffffff;border:1px solid #cbd5e1;display:grid;gap:12px;">` +
          `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">` +
            `<div>` +
              `<div style="font-size:15px;font-weight:800;color:#0f172a;">Gerenciar Login, Matrícula, Setor &amp; Acessos</div>` +
              `<div style="font-size:12px;color:#475569;">Configure os dados da pessoa e marque exatamente o que ela pode ou não fazer.</div>` +
            `</div>` +
            `<button type="button" id="vu-new-person-btn" style="padding:7px 12px;border-radius:8px;border:1px solid #004899;background:#eff6ff;color:#004899;font-weight:800;font-size:12px;cursor:pointer;">+ Nova Pessoa / Login</button>` +
          `</div>` +

          `<div style="display:flex;gap:8px;flex-wrap:wrap;">${userChipsHtml}</div>` +

          `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:10px;padding-top:4px;">` +
            `<label style="display:grid;gap:4px;font-size:11.5px;font-weight:700;color:#334155;">Login` +
              `<input id="vu-ed-login" type="text" value="${activeUser.login}" style="padding:8px 10px;border-radius:8px;border:1px solid #cbd5e1;font-size:12.5px;color:#0f172a;">` +
            `</label>` +
            `<label style="display:grid;gap:4px;font-size:11.5px;font-weight:700;color:#334155;">Nome Completo` +
              `<input id="vu-ed-name" type="text" value="${activeUser.name}" style="padding:8px 10px;border-radius:8px;border:1px solid #cbd5e1;font-size:12.5px;color:#0f172a;">` +
            `</label>` +
            `<label style="display:grid;gap:4px;font-size:11.5px;font-weight:700;color:#334155;">Matrícula` +
              `<input id="vu-ed-mat" type="text" value="${activeUser.matricula || ""}" placeholder="Ex: 104829" style="padding:8px 10px;border-radius:8px;border:1px solid #cbd5e1;font-size:12.5px;color:#0f172a;">` +
            `</label>` +
            `<label style="display:grid;gap:4px;font-size:11.5px;font-weight:700;color:#334155;">Setor` +
              `<select id="vu-ed-sector" style="padding:8px 10px;border-radius:8px;border:1px solid #cbd5e1;font-size:12.5px;color:#0f172a;background:#fff;">${sectorOpts}</select>` +
            `</label>` +
          `</div>` +

          `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding-top:2px;">` +
            `<span style="font-size:11.5px;font-weight:700;color:#475569;">Preencher modelo:</span>` +
            `<button type="button" data-apply-preset="ADMIN" style="padding:4px 10px;border-radius:6px;border:1px solid #93c5fd;background:#eff6ff;color:#003399;font-size:11px;font-weight:700;cursor:pointer;">Admin</button>` +
            `<button type="button" data-apply-preset="GESTOR" style="padding:4px 10px;border-radius:6px;border:1px solid #bae6fd;background:#f0f9ff;color:#0369a1;font-size:11px;font-weight:700;cursor:pointer;">Gestor</button>` +
            `<button type="button" data-apply-preset="METROLOGISTA" style="padding:4px 10px;border-radius:6px;border:1px solid #cbd5e1;background:#f8fafc;color:#0f172a;font-size:11px;font-weight:700;cursor:pointer;">Metrologista</button>` +
            `<button type="button" data-apply-preset="OPERADOR" style="padding:4px 10px;border-radius:6px;border:1px solid #e2e8f0;background:#fff;color:#475569;font-size:11px;font-weight:700;cursor:pointer;">Operador</button>` +
          `</div>` +
        `</div>` +

        groupsHtml +

        `<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">` +
          `<span id="vu-save-status" style="font-size:12px;font-weight:700;color:#15803d;"></span>` +
          `<button type="button" id="vu-save-person-btn" style="padding:10px 18px;border-radius:8px;border:none;background:#16a34a;color:#ffffff;font-weight:800;font-size:12.5px;cursor:pointer;">Salvar Acessos da Pessoa</button>` +
        `</div>`;

      panel.querySelectorAll("[data-pick-user]").forEach((btn) => {
        btn.addEventListener("click", () => {
          selectedLogin = btn.getAttribute("data-pick-user");
          drawEditor();
        });
      });

      panel.querySelector("#vu-new-person-btn").onclick = () => {
        const newLogin = prompt("Digite o login (ex: lucas):");
        if (!newLogin) return;
        const clean = newLogin.trim().toLowerCase();
        const all = loadProfiles();
        if (!all[clean]) {
          all[clean] = {
            login: clean,
            name: clean.charAt(0).toUpperCase() + clean.slice(1),
            matricula: "",
            sector: "Metrologia / Turbo",
            role: "OPERADOR",
            perms: PRESET_PERMS.OPERADOR
          };
          saveProfiles(all);
        }
        selectedLogin = clean;
        drawEditor();
      };

      panel.querySelectorAll("[data-apply-preset]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const pKey = btn.getAttribute("data-apply-preset");
          const set = new Set(PRESET_PERMS[pKey] || []);
          panel.querySelectorAll(".vu-perm-cb").forEach((cb) => {
            cb.checked = set.has(cb.getAttribute("data-perm-id"));
          });
        });
      });

      panel.querySelector("#vu-save-person-btn").onclick = () => {
        const edLogin = String(panel.querySelector("#vu-ed-login").value || "").trim().toLowerCase();
        const edName = String(panel.querySelector("#vu-ed-name").value || "").trim();
        const edMat = String(panel.querySelector("#vu-ed-mat").value || "").trim();
        const edSector = String(panel.querySelector("#vu-ed-sector").value || "Metrologia / Turbo");
        if (!edLogin) return;

        const checkedPerms = Array.from(panel.querySelectorAll(".vu-perm-cb:checked"))
          .map(cb => cb.getAttribute("data-perm-id"));

        const all = loadProfiles();
        all[edLogin] = {
          login: edLogin,
          name: edName || edLogin,
          matricula: edMat,
          sector: edSector,
          role: checkedPerms.length === ALL_PERM_IDS.length ? "ADMIN" : "CUSTOMIZADO",
          perms: checkedPerms
        };
        saveProfiles(all);
        selectedLogin = edLogin;

        const st = panel.querySelector("#vu-save-status");
        if (st) st.textContent = `Salvo para ${edName || edLogin} (${edLogin}) — Matrícula: ${edMat || "—"} • Setor: ${edSector} (${checkedPerms.length} acessos).`;
        drawEditor();
      };
    };

    drawEditor();
    panel.style.display = "grid";
  };

  const bindTabs = () => {
    addBtn();
    ensureSidebarTabs();

    document.querySelectorAll("button, a, [role=tab]").forEach((el) => {
      if (el.dataset.vuBound) return;
      el.dataset.vuBound = "1";
      const txt = String(el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
      const isRbac = el.id === "admTabRbac" || txt.includes("hierarqu") || txt.includes("tipos de login");

      el.addEventListener("click", () => {
        if (isRbac) {
          setTimeout(() => renderRbacPanel(el), 60);
        } else {
          hideRbacPanel();
        }
      });
    });
  };

  const obs = new MutationObserver(bindTabs);
  const boot = () => {
    addBtn();
    bindTabs();
    obs.observe(document.body, { childList: true, subtree: true });
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.VoithUpgrade = Object.assign({}, window.VoithUpgrade, {
    openDownloadPage,
    focusLoginScreen: focusLogin,
    getUserProfiles: () => loadProfiles()
  });
})();