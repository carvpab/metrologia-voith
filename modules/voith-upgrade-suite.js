(() => {
  const APK = "https://github.com/carvpab/voith-metrologia-app/releases/latest/download/voith-metrologia.apk";
  const EXE = "https://github.com/carvpab/voith-metrologia-app/releases/latest/download/voith-metrologia-setup.exe";
  const STORE_KEY = "voith_user_hierarchy_v1";

  const getMap = () => {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || "{}"); } catch (_) { return {}; }
  };
  const saveMap = (m) => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(m)); } catch (_) {}
  };

  const discoverUsers = () => {
    const found = new Map();
    const map = getMap();

    document.querySelectorAll("table tbody tr").forEach((tr) => {
      const cells = Array.from(tr.querySelectorAll("td")).map(td => (td.textContent || "").trim()).filter(Boolean);
      if (cells.length >= 2) {
        const login = cells[0].toLowerCase();
        const nome = cells[1];
        if (login && login.length < 40 && !/^(login|ação|ações|perfil)$/i.test(login)) {
          found.set(login, { login, nome, role: map[login] || (cells[2] && /admin|gestor|metrolog|operad/i.test(cells[2]) ? cells[2].toUpperCase() : "OPERADOR") });
        }
      }
    });

    Object.keys(map).forEach((login) => {
      if (!found.has(login)) {
        found.set(login, { login, nome: login, role: map[login] || "OPERADOR" });
      }
    });

    if (!found.has("pablo")) {
      found.set("pablo", { login: "pablo", nome: "Pablo Carvalho", role: map["pablo"] || "ADMIN" });
    }

    return Array.from(found.values());
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
    d.style.cssText = [
      "position:fixed;inset:0;z-index:10600;overflow:auto;padding:28px 16px;",
      "background-image:linear-gradient(rgba(148,163,184,.06) 1px, transparent 1px),linear-gradient(90deg, rgba(148,163,184,.06) 1px, transparent 1px),radial-gradient(circle at 20% 15%, rgba(0,102,204,.35), transparent 45%),linear-gradient(145deg,#061021 0%,#0a1d3d 55%,#071329 100%);",
      "background-size:32px 32px, 32px 32px, 100% 100%, 100% 100%;",
      "color:#f8fafc;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;"
    ].join("");

    d.innerHTML =
      "<div style=\"max-width:920px;margin:0 auto;background:#ffffff;color:#0f172a;border-radius:16px;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.5);border:1px solid #cbd5e1;\">" +
        "<div style=\"background:linear-gradient(90deg,#002466 0%,#0055b8 100%);color:#ffffff;padding:18px 24px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;\">" +
          "<div style=\"display:flex;align-items:center;gap:12px;flex-wrap:wrap;\">" +
            "<span style=\"background:#ffffff;color:#003399;font-weight:900;font-size:13px;padding:5px 10px;border-radius:6px;letter-spacing:.06em;\">VOITH</span>" +
            "<div><div style=\"font-weight:800;font-size:16px;\">Voith Metrologia • Downloads</div><div style=\"font-size:12px;color:#dbeafe;\">Release ativa: " + tag + "</div></div>" +
          "</div>" +
          "<div style=\"display:flex;gap:8px;\">" +
            "<button type=\"button\" id=\"vu-go-login\" style=\"padding:8px 14px;border-radius:8px;border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.15);color:#fff;font-weight:700;font-size:12.5px;cursor:pointer;\">Op&ccedil;&otilde;es de Login</button>" +
            "<button type=\"button\" id=\"vu-close-dl\" style=\"width:34px;height:34px;border-radius:8px;border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.15);color:#fff;font-size:18px;line-height:1;cursor:pointer;\">&times;</button>" +
          "</div>" +
        "</div>" +
        "<div style=\"padding:26px 24px;background:#f8fafc;\">" +
          "<h1 style=\"margin:0 0 6px;font-size:23px;font-weight:800;color:#0f172a;\">Escolha a vers&atilde;o do seu dispositivo</h1>" +
          "<p style=\"margin:0 0 20px;font-size:13.5px;color:#475569;\">Baixe o instalador mais recente para Android ou Windows.</p>" +
          "<div style=\"display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px;\">" +
            "<div style=\"background:#fff;border:1px solid #cbd5e1;border-top:4px solid #0055b8;border-radius:12px;padding:20px;display:flex;flex-direction:column;justify-content:space-between;gap:14px;\">" +
              "<div><div style=\"font-size:18px;font-weight:800;color:#0f172a;\">Android (.APK)</div><div style=\"font-size:12.5px;color:#475569;margin-top:4px;\">" + apkMeta + "</div></div>" +
              "<a href=\"" + apkUrl + "\" target=\"_blank\" rel=\"noopener\" style=\"display:block;text-align:center;padding:11px 16px;border-radius:8px;background:#0055b8;color:#fff;font-weight:800;font-size:13.5px;text-decoration:none;\">Baixar APK</a>" +
            "</div>" +
            "<div style=\"background:#fff;border:1px solid #cbd5e1;border-top:4px solid #002466;border-radius:12px;padding:20px;display:flex;flex-direction:column;justify-content:space-between;gap:14px;\">" +
              "<div><div style=\"font-size:18px;font-weight:800;color:#0f172a;\">Windows (.EXE)</div><div style=\"font-size:12.5px;color:#475569;margin-top:4px;\">" + exeMeta + "</div></div>" +
              "<a href=\"" + exeUrl + "\" target=\"_blank\" rel=\"noopener\" style=\"display:block;text-align:center;padding:11px 16px;border-radius:8px;background:#002466;color:#fff;font-weight:800;font-size:13.5px;text-decoration:none;\">Baixar Instalador EXE</a>" +
            "</div>" +
          "</div>" +
          "<div style=\"margin-top:20px;padding-top:14px;border-top:1px solid #e2e8f0;text-align:right;\">" +
            "<button type=\"button\" id=\"vu-dl-login-cta\" style=\"padding:9px 16px;border-radius:8px;border:1px solid #0055b8;background:#fff;color:#0055b8;font-weight:800;font-size:12.5px;cursor:pointer;\">Ir para Op&ccedil;&otilde;es de Login &rarr;</button>" +
          "</div>" +
        "</div>" +
      "</div>";

    document.body.appendChild(d);
    d.querySelector("#vu-close-dl").onclick = () => d.remove();
    d.querySelector("#vu-go-login").onclick = focusLogin;
    d.querySelector("#vu-dl-login-cta").onclick = focusLogin;
  };

  const addBtn = () => {
    if (document.getElementById("vu-dl-btn")) return;
    const b = document.createElement("button");
    b.id = "vu-dl-btn";
    b.type = "button";
    b.textContent = "Baixar App";
    b.style.cssText = "position:fixed;bottom:14px;right:14px;z-index:9950;padding:8px 14px;border-radius:8px;border:1px solid #93c5fd;background:#003399;color:#ffffff;font:800 12px system-ui,-apple-system,sans-serif;box-shadow:0 8px 20px rgba(0,51,153,.35);cursor:pointer;";
    b.onclick = openDownloadPage;
    document.body.appendChild(b);
  };

  const removeHierarchyDrawer = () => {
    const existing = document.getElementById("vu-user-hierarchy-drawer");
    if (existing) existing.remove();
  };

  const openUserHierarchyConfig = (anchorEl) => {
    removeHierarchyDrawer();
    const map = getMap();
    const users = discoverUsers();

    const drawer = document.createElement("div");
    drawer.id = "vu-user-hierarchy-drawer";
    drawer.style.cssText = "margin-top:14px;padding:14px;border-radius:12px;border:1px solid #cbd5e1;background:#f8fafc;color:#0f172a;display:grid;gap:10px;";

    const rowsHtml = users.map((u) => {
      const currentRole = map[u.login] || u.role || "OPERADOR";
      const opts = ["ADMIN", "GESTOR", "METROLOGISTA", "OPERADOR"].map(r =>
        "<option value=\"" + r + "\"" + (currentRole === r ? " selected" : "") + ">" + r + "</option>"
      ).join("");
      return (
        "<div style=\"display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 12px;border-radius:10px;background:#ffffff;border:1px solid #e2e8f0;\">" +
          "<div>" +
            "<div style=\"font-weight:800;font-size:13px;color:#0f172a;\">" + u.nome + " <span style=\"font-weight:600;color:#64748b;\">(" + u.login + ")</span></div>" +
            "<div style=\"font-size:11.5px;color:#475569;\">Perfil atual: <strong class=\"vu-cur-role\" style=\"color:#004899;\">" + currentRole + "</strong></div>" +
          "</div>" +
          "<select data-login=\"" + u.login + "\" class=\"vu-role-select\" style=\"padding:6px 10px;border-radius:8px;border:1px solid #94a3b8;background:#fff;color:#0f172a;font-weight:700;font-size:12px;cursor:pointer;\">" +
            opts +
          "</select>" +
        "</div>"
      );
    }).join("");

    drawer.innerHTML =
      "<div style=\"display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;\">" +
        "<div>" +
          "<div style=\"font-weight:800;font-size:14px;color:#002466;\">Configurar Hierarquia por Pessoa</div>" +
          "<div style=\"font-size:12px;color:#475569;\">Defina o n&iacute;vel de cada usu&aacute;rio e salve.</div>" +
        "</div>" +
        "<div style=\"display:flex;gap:8px;align-items:center;flex-wrap:wrap;\">" +
          "<input id=\"vu-new-login\" type=\"text\" placeholder=\"login (ex: lucas)\" style=\"padding:6px 10px;border-radius:8px;border:1px solid #cbd5e1;font-size:12px;width:145px;\">" +
          "<select id=\"vu-new-role\" style=\"padding:6px 10px;border-radius:8px;border:1px solid #cbd5e1;font-size:12px;font-weight:700;\">" +
            "<option value=\"ADMIN\">ADMIN</option>" +
            "<option value=\"GESTOR\">GESTOR</option>" +
            "<option value=\"METROLOGISTA\">METROLOGISTA</option>" +
            "<option value=\"OPERADOR\" selected>OPERADOR</option>" +
          "</select>" +
          "<button type=\"button\" id=\"vu-add-person-role\" style=\"padding:6px 12px;border-radius:8px;border:none;background:#0055b8;color:#fff;font-weight:700;font-size:12px;cursor:pointer;\">Definir</button>" +
        "</div>" +
      "</div>" +
      "<div id=\"vu-people-list\" style=\"display:grid;gap:8px;\">" + rowsHtml + "</div>" +
      "<div style=\"display:flex;justify-content:flex-end;gap:8px;align-items:center;\">" +
        "<span id=\"vu-save-feedback\" style=\"font-size:12px;font-weight:700;color:#15803d;\"></span>" +
        "<button type=\"button\" id=\"vu-save-hierarchy\" style=\"padding:8px 16px;border-radius:8px;border:none;background:#002466;color:#fff;font-weight:800;font-size:12.5px;cursor:pointer;\">Salvar Hierarquias</button>" +
      "</div>";

    const parent = (anchorEl && anchorEl.closest("[role=dialog], .modal, [class*='modal' i], [class*='panel' i]")) || document.body;
    parent.appendChild(drawer);

    drawer.querySelectorAll(".vu-role-select").forEach((sel) => {
      sel.addEventListener("change", () => {
        const login = sel.getAttribute("data-login");
        const m = getMap();
        m[login] = sel.value;
        saveMap(m);
        const badge = sel.parentElement && sel.parentElement.querySelector(".vu-cur-role");
        if (badge) badge.textContent = sel.value;
      });
    });

    drawer.querySelector("#vu-add-person-role").addEventListener("click", () => {
      const inp = drawer.querySelector("#vu-new-login");
      const rSel = drawer.querySelector("#vu-new-role");
      const login = String((inp && inp.value) || "").trim().toLowerCase();
      if (!login) return;
      const m = getMap();
      m[login] = rSel.value;
      saveMap(m);
      inp.value = "";
      openUserHierarchyConfig(anchorEl);
      const fb = document.getElementById("vu-save-feedback");
      if (fb) fb.textContent = "Perfil de " + login + " atualizado para " + rSel.value;
    });

    drawer.querySelector("#vu-save-hierarchy").addEventListener("click", () => {
      const m = getMap();
      drawer.querySelectorAll(".vu-role-select").forEach((sel) => {
        m[sel.getAttribute("data-login")] = sel.value;
      });
      saveMap(m);
      const fb = drawer.querySelector("#vu-save-feedback");
      if (fb) fb.textContent = "Hierarquias salvas!";
    });
  };

  let busy = false;
  const bindTabs = () => {
    if (busy) return;
    busy = true;
    try {
      addBtn();
      document.querySelectorAll("button, [role=tab], a").forEach((el) => {
        if (el.dataset.vuHierListener) return;
        const txt = String(el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
        if (!txt) return;
        const isHierTab = txt.includes("hierarqu") || txt.includes("tipos de login");
        const isOtherModalTab = Boolean(el.closest("[role=dialog], .modal, [class*='modal' i], [class*='panel' i]")) && !isHierTab;
        if (isHierTab) {
          el.dataset.vuHierListener = "1";
          el.addEventListener("click", () => {
            setTimeout(() => openUserHierarchyConfig(el), 60);
          });
        } else if (isOtherModalTab) {
          el.dataset.vuHierListener = "1";
          el.addEventListener("click", removeHierarchyDrawer);
        }
      });
    } finally {
      busy = false;
    }
  };

  const obs = new MutationObserver(bindTabs);
  const start = () => {
    addBtn();
    bindTabs();
    obs.observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();

  window.VoithUpgrade = Object.assign({}, window.VoithUpgrade, { openDownloadPage, focusLoginScreen: focusLogin, openUserHierarchyConfig });
})();