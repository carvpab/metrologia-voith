(() => {
  const APK = "https://github.com/carvpab/voith-metrologia-app/releases/latest/download/voith-metrologia.apk";
  const EXE = "https://github.com/carvpab/voith-metrologia-app/releases/latest/download/voith-metrologia-setup.exe";
  const HIER_STORAGE_KEY = "voith_user_hierarchy_v1";

  const HIERARCHIES = [
    { id: "ADMIN", label: "ADMIN", desc: "Acesso total: usuários, logins, OTA, setores e auditoria." },
    { id: "GESTOR", label: "GESTOR / LÍDER", desc: "Aprova romaneios externos, acompanha vencimentos e pendências." },
    { id: "METROLOGISTA", label: "TÉCNICO / METROLOGISTA", desc: "Calibrações, inventário, certificados e movimentação." },
    { id: "OPERADOR", label: "OPERADOR / CONSULTA", desc: "Consulta de frota, status de calibração e cautela." }
  ];

  const getSavedHierarchies = () => {
    try {
      return JSON.parse(localStorage.getItem(HIER_STORAGE_KEY) || "{}");
    } catch (_) {
      return {};
    }
  };

  const setSavedHierarchies = (map) => {
    try {
      localStorage.setItem(HIER_STORAGE_KEY, JSON.stringify(map));
    } catch (_) {}
  };

  const discoverUsers = () => {
    const found = [];
    const seen = new Set();

    // Tenta ler linhas de tabelas existentes no modal/página (ex: login pablo | Pablo Carvalho | ADMIN)
    document.querySelectorAll("table tbody tr").forEach((tr) => {
      const cells = Array.from(tr.querySelectorAll("td")).map(td => String(td.textContent || "").trim()).filter(Boolean);
      if (cells.length >= 2) {
        const login = cells[0].toLowerCase();
        const name = cells[1];
        const currentRole = (cells.find(c => /^(ADMIN|GESTOR|METROLOGISTA|OPERADOR|TÉCNICO|TECNICO|USER|LÍDER|LIDER)/i.test(c)) || "ADMIN").toUpperCase();
        if (login && !seen.has(login)) {
          seen.add(login);
          found.push({ login, name, role: currentRole });
        }
      }
    });

    // Tenta ler listas/objetos no localStorage caso existam
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i) || "";
        if (/user|login|auth|session|voith/i.test(k) && k !== HIER_STORAGE_KEY) {
          const raw = localStorage.getItem(k);
          if (!raw || raw.length > 20000) continue;
          const parsed = JSON.parse(raw);
          const list = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.users) ? parsed.users : []);
          list.forEach((u) => {
            if (u && (u.login || u.usuario || u.user || u.nome || u.name)) {
              const login = String(u.login || u.usuario || u.user || u.nome || u.name).trim().toLowerCase();
              const name = String(u.nome || u.name || u.login || u.usuario || "").trim();
              const role = String(u.perfil || u.role || u.hierarquia || "OPERADOR").toUpperCase();
              if (login && !seen.has(login)) {
                seen.add(login);
                found.push({ login, name: name || login, role });
              }
            }
          });
        }
      }
    } catch (_) {}

    if (!found.length) {
      found.push({ login: "pablo", name: "Pablo Carvalho", role: "ADMIN" });
    }

    const saved = getSavedHierarchies();
    return found.map((u) => ({
      ...u,
      role: saved[u.login] || u.role || "OPERADOR"
    }));
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
          if (apkAsset.size) apkMeta = "APK Android • " + (apkAsset.size / (1024 * 1024)).toFixed(1) + " MB • Coleta e cautela";
        }
        if (exeAsset) {
          exeUrl = exeAsset.browser_download_url;
          if (exeAsset.size) exeMeta = "Windows EXE • " + (exeAsset.size / (1024 * 1024)).toFixed(1) + " MB • PC e laboratório";
        }
      }
    } catch (_) {}

    const d = document.createElement("div");
    d.id = "vu-dl-voith";
    d.style.cssText = [
      "position:fixed;inset:0;z-index:10600;overflow:auto;padding:28px 16px;",
      "background-image:linear-gradient(rgba(148,163,184,.06) 1px, transparent 1px),linear-gradient(90deg, rgba(148,163,184,.06) 1px, transparent 1px),radial-gradient(circle at 20% 15%, rgba(0,102,204,.35), transparent 45%),linear-gradient(145deg,#061021 0%,#0a1d3d 55%,#071329 100%);",
      "background-size:32px 32px, 32px 32px, 100% 100%, 100% 100%;",
      "color:#f8fafc;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;"
    ].join("");

    d.innerHTML =
      "<div style=\"max-width:940px;margin:0 auto;background:rgba(255,255,255,.98);color:#0f172a;border-radius:18px;overflow:hidden;box-shadow:0 28px 70px rgba(0,0,0,.55);border:1px solid rgba(147,197,253,.45);\">" +
        "<div style=\"background:linear-gradient(90deg,#002466 0%,#004899 55%,#0066cc 100%);color:#ffffff;padding:20px 26px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;border-bottom:3px solid #38bdf8;\">" +
          "<div style=\"display:flex;align-items:center;gap:14px;flex-wrap:wrap;\">" +
            "<span style=\"background:#ffffff;color:#003399;font-weight:900;font-size:14px;padding:6px 12px;border-radius:8px;letter-spacing:.08em;\">VOITH</span>" +
            "<div>" +
              "<div style=\"font-weight:800;font-size:17px;\">Voith Metrologia &bull; Portal de Downloads</div>" +
              "<div style=\"font-size:12px;color:#bfdbfe;margin-top:2px;\">Release ativa: <strong style=\"color:#ffffff;\">" + tag + "</strong> &bull; GitHub Releases</div>" +
            "</div>" +
          "</div>" +
          "<div style=\"display:flex;align-items:center;gap:8px;\">" +
            "<button type=\"button\" id=\"vu-go-login\" style=\"padding:9px 15px;border-radius:9px;border:1px solid rgba(255,255,255,.4);background:rgba(255,255,255,.16);color:#ffffff;font-weight:700;font-size:12.5px;cursor:pointer;\">Op&ccedil;&otilde;es de Login</button>" +
            "<button type=\"button\" id=\"vu-close-dl\" aria-label=\"Fechar\" style=\"width:36px;height:36px;border-radius:9px;border:1px solid rgba(255,255,255,.4);background:rgba(255,255,255,.16);color:#ffffff;font-size:20px;line-height:1;cursor:pointer;\">&times;</button>" +
          "</div>" +
        "</div>" +
        "<div style=\"padding:28px 26px;background:linear-gradient(180deg,#f8fafc 0%,#eef4fb 100%);\">" +
          "<div style=\"margin-bottom:22px;\">" +
            "<div style=\"font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.09em;color:#004899;margin-bottom:4px;\">Metrologia &bull; Voith Turbo</div>" +
            "<h1 style=\"margin:0 0 6px;font-size:25px;font-weight:900;color:#0f172a;\">Escolha o instalador do seu dispositivo</h1>" +
            "<p style=\"margin:0;font-size:13.5px;color:#475569;\">Baixe o pacote oficial para Android ou Windows e acesse o sistema.</p>" +
          "</div>" +
          "<div style=\"display:grid;grid-template-columns:repeat(auto-fit,minmax(275px,1fr));gap:20px;\">" +
            "<div style=\"background:#ffffff;border:1px solid #cbd5e1;border-top:5px solid #0055b8;border-radius:14px;padding:22px;display:flex;flex-direction:column;justify-content:space-between;gap:18px;box-shadow:0 10px 24px rgba(15,23,42,.06);\">" +
              "<div>" +
                "<div style=\"display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;\">" +
                  "<span style=\"font-size:11px;font-weight:800;padding:4px 10px;border-radius:999px;background:#eff6ff;color:#004899;border:1px solid #bfdbfe;\">ANDROID &bull; TABLET / CELULAR</span>" +
                  "<span style=\"font-size:12px;font-weight:800;color:#0055b8;\">.APK</span>" +
                "</div>" +
                "<div style=\"font-size:19px;font-weight:800;color:#0f172a;margin-bottom:6px;\">Voith Metrologia Android</div>" +
                "<div style=\"font-size:13px;color:#475569;line-height:1.45;\">" + apkMeta + "</div>" +
              "</div>" +
              "<a href=\"" + apkUrl + "\" target=\"_blank\" rel=\"noopener\" style=\"display:block;text-align:center;padding:12px 16px;border-radius:10px;background:linear-gradient(90deg,#004899,#0066cc);color:#ffffff;font-weight:800;font-size:13.5px;text-decoration:none;\">Baixar APK (.apk)</a>" +
            "</div>" +
            "<div style=\"background:#ffffff;border:1px solid #cbd5e1;border-top:5px solid #002466;border-radius:14px;padding:22px;display:flex;flex-direction:column;justify-content:space-between;gap:18px;box-shadow:0 10px 24px rgba(15,23,42,.06);\">" +
              "<div>" +
                "<div style=\"display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;\">" +
                  "<span style=\"font-size:11px;font-weight:800;padding:4px 10px;border-radius:999px;background:#e2e8f0;color:#0f172a;border:1px solid #cbd5e1;\">WINDOWS &bull; DESKTOP / PC</span>" +
                  "<span style=\"font-size:12px;font-weight:800;color:#002466;\">.EXE</span>" +
                "</div>" +
                "<div style=\"font-size:19px;font-weight:800;color:#0f172a;margin-bottom:6px;\">Voith Metrologia Windows</div>" +
                "<div style=\"font-size:13px;color:#475569;line-height:1.45;\">" + exeMeta + "</div>" +
              "</div>" +
              "<a href=\"" + exeUrl + "\" target=\"_blank\" rel=\"noopener\" style=\"display:block;text-align:center;padding:12px 16px;border-radius:10px;background:linear-gradient(90deg,#002466,#004899);color:#ffffff;font-weight:800;font-size:13.5px;text-decoration:none;\">Baixar Instalador (.exe)</a>" +
            "</div>" +
          "</div>" +
          "<div style=\"margin-top:22px;padding-top:16px;border-top:1px solid #cbd5e1;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;\">" +
            "<span style=\"font-size:12.5px;color:#334155;\">Pronto para entrar no sistema? Abra as op&ccedil;&otilde;es de autentica&ccedil;&atilde;o.</span>" +
            "<button type=\"button\" id=\"vu-dl-login-cta\" style=\"padding:10px 18px;border-radius:9px;border:1px solid #004899;background:#ffffff;color:#004899;font-weight:800;font-size:12.5px;cursor:pointer;\">Ir para Op&ccedil;&otilde;es de Login &rarr;</button>" +
          "</div>" +
        "</div>" +
      "</div>";

    document.body.appendChild(d);
    d.querySelector("#vu-close-dl").onclick = () => d.remove();
    d.querySelector("#vu-go-login").onclick = focusLogin;
    d.querySelector("#vu-dl-login-cta").onclick = focusLogin;
  };

  // Posição segura no mobile: acima da barra inferior para não cobrir ícones
  const addBtn = () => {
    if (document.getElementById("vu-dl-btn")) return;
    const b = document.createElement("button");
    b.id = "vu-dl-btn";
    b.type = "button";
    b.textContent = "Baixar App";
    const isMobile = window.innerWidth <= 768;
    b.style.cssText = [
      "position:fixed;",
      isMobile ? "bottom:78px;right:12px;padding:6px 11px;font-size:11px;" : "bottom:14px;right:14px;padding:8px 14px;font-size:12px;",
      "z-index:9950;border-radius:8px;border:1px solid #93c5fd;",
      "background:linear-gradient(90deg,#002466,#0055b8);color:#ffffff;",
      "font-weight:800;font-family:system-ui,-apple-system,sans-serif;",
      "box-shadow:0 8px 20px rgba(0,51,153,.38);cursor:pointer;"
    ].join("");
    b.onclick = openDownloadPage;
    document.body.appendChild(b);
  };

  const getTabContainer = (tabEl) => {
    let cur = tabEl.parentElement;
    for (let i = 0; i < 4 && cur; i++) {
      if (cur.parentElement && cur.parentElement.children.length >= 2) {
        return cur.parentElement;
      }
      cur = cur.parentElement;
    }
    return tabEl.parentElement ? tabEl.parentElement.parentElement : document.body;
  };

  const clearHierarchyView = (root) => {
    if (!root) return;
    const panel = root.querySelector("#vu-hierarchy-view");
    if (panel) panel.remove();
    Array.from(root.querySelectorAll("[data-vu-hidden-by-hier='1']")).forEach((el) => {
      el.style.display = el.dataset.vuPrevDisplay || "";
      delete el.dataset.vuHiddenByHier;
      delete el.dataset.vuPrevDisplay;
    });
  };

  const showHierarchyView = (tabEl) => {
    const root = getTabContainer(tabEl);
    if (!root) return;

    // Mantém barra de abas visível, esconde apenas o conteúdo da aba anterior dentro do container
    const tabBar = tabEl.closest("[role=tablist]") || tabEl.parentElement;
    Array.from(root.children).forEach((child) => {
      if (child === tabBar || child.id === "vu-hierarchy-view") return;
      if (!child.dataset.vuHiddenByHier) {
        child.dataset.vuPrevDisplay = child.style.display || "";
        child.dataset.vuHiddenByHier = "1";
      }
      child.style.display = "none";
    });

    let panel = root.querySelector("#vu-hierarchy-view");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "vu-hierarchy-view";
      panel.style.cssText = "margin-top:14px;display:grid;gap:12px;color:#0f172a;";
      document.body.appendChild;
      root.appendChild(panel);
    }

    const users = discoverUsers();
    const saved = getSavedHierarchies();

    const userRowsHtml = users.map((u) => {
      const optionsHtml = HIERARCHIES.map((h) =>
        `<option value="${h.id}" ${u.role === h.id ? "selected" : ""}>${h.label}</option>`
      ).join("");

      return (
        `<div data-user-login="${u.login}" style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 12px;border-radius:10px;background:#ffffff;border:1px solid #cbd5e1;">` +
          `<div>` +
            `<div style="font-weight:800;font-size:13px;color:#0f172a;">${u.name} <span style="font-weight:600;color:#64748b;">(${u.login})</span></div>` +
            `<div style="font-size:11.5px;color:#475569;">Perfil atual: <strong class="vu-cur-role-txt" style="color:#004899;">${u.role}</strong></div>` +
          `</div>` +
          `<div style="display:flex;align-items:center;gap:8px;">` +
            `<select class="vu-user-role-select" style="padding:7px 10px;border-radius:8px;border:1px solid #94a3b8;background:#f8fafc;color:#0f172a;font-weight:700;font-size:12px;cursor:pointer;">${optionsHtml}</select>` +
          `</div>` +
        `</div>`
      );
    }).join("");

    const legendHtml = HIERARCHIES.map((h) =>
      `<div style="padding:9px 12px;border-radius:9px;background:#f8fafc;border:1px solid #e2e8f0;font-size:12px;">` +
        `<strong style="color:#003399;">${h.label}</strong> &mdash; ${h.desc}` +
      `</div>`
    ).join("");

    panel.innerHTML =
      `<div style="padding:12px 14px;border-radius:10px;background:linear-gradient(90deg,#eff6ff,#dbeafe);border:1px solid #93c5fd;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">` +
        `<div>` +
          `<div style="font-weight:800;font-size:14px;color:#002466;">Configurar Hierarquia por Pessoa</div>` +
          `<div style="font-size:12px;color:#334155;">Selecione a hierarquia de cada usuário e clique em Salvar Hierarquias.</div>` +
        `</div>` +
        `<button type="button" id="vu-save-hier-btn" style="padding:8px 14px;border-radius:8px;border:none;background:#004899;color:#ffffff;font-weight:800;font-size:12px;cursor:pointer;">Salvar Hierarquias</button>` +
      `</div>` +
      `<div id="vu-hier-users-list" style="display:grid;gap:8px;">${userRowsHtml}</div>` +
      `<div style="display:grid;gap:6px;margin-top:4px;">` +
        `<div style="font-size:11.5px;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:.05em;">Referência de Perfis</div>` +
        legendHtml +
      `</div>` +
      `<div id="vu-hier-feedback" style="font-size:12px;font-weight:700;color:#15803d;min-height:16px;"></div>`;

    panel.querySelectorAll(".vu-user-role-select").forEach((sel) => {
      sel.addEventListener("change", (ev) => {
        const row = ev.target.closest("[data-user-login]");
        const login = row ? row.getAttribute("data-user-login") : "";
        const txtEl = row ? row.querySelector(".vu-cur-role-txt") : null;
        if (txtEl) txtEl.textContent = ev.target.value;
        if (login) {
          saved[login] = ev.target.value;
          setSavedHierarchies(saved);
        }
      });
    });

    const saveBtn = panel.querySelector("#vu-save-hier-btn");
    if (saveBtn) {
      saveBtn.onclick = () => {
        const nextMap = { ...getSavedHierarchies() };
        panel.querySelectorAll("[data-user-login]").forEach((row) => {
          const login = row.getAttribute("data-user-login");
          const sel = row.querySelector(".vu-user-role-select");
          if (login && sel) nextMap[login] = sel.value;
        });
        setSavedHierarchies(nextMap);

        // Atualiza células visíveis na tabela de usuários se ela existir no DOM
        document.querySelectorAll("table tbody tr").forEach((tr) => {
          const cells = Array.from(tr.querySelectorAll("td"));
          if (cells.length >= 3) {
            const login = String(cells[0].textContent || "").trim().toLowerCase();
            if (nextMap[login]) {
              const badge = cells[2].querySelector("span, button") || cells[2];
              badge.textContent = nextMap[login];
            }
          }
        });

        const fb = panel.querySelector("#vu-hier-feedback");
        if (fb) fb.textContent = "Hierarquias salvas com sucesso!";
      };
    }

    panel.style.display = "grid";
  };

  const bindAdminTabs = () => {
    addBtn();
    const allTabs = Array.from(document.querySelectorAll("button, [role=tab], a")).filter((el) => {
      const modal = el.closest("[role=dialog], .modal, [class*='modal' i], [class*='panel' i]");
      return Boolean(modal);
    });

    allTabs.forEach((el) => {
      if (el.dataset.vuTabBound) return;
      el.dataset.vuTabBound = "1";
      const txt = String(el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
      const isHier = txt.includes("hierarqu") || txt.includes("tipos de login");
      el.addEventListener("click", () => {
        const root = getTabContainer(el);
        if (isHier) setTimeout(() => showHierarchyView(el), 60);
        else clearHierarchyView(root);
      });
    });
  };

  const obs = new MutationObserver(bindAdminTabs);
  const start = () => {
    addBtn();
    bindAdminTabs();
    obs.observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();

  window.VoithUpgrade = Object.assign({}, window.VoithUpgrade, { openDownloadPage, focusLoginScreen: focusLogin });
})();