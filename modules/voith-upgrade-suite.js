(() => {
  const APK = "https://github.com/carvpab/voith-metrologia-app/releases/latest/download/voith-metrologia.apk";
  const EXE = "https://github.com/carvpab/voith-metrologia-app/releases/latest/download/voith-metrologia-setup.exe";

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
    let tag = "Latest", apkUrl = APK, exeUrl = EXE, apkMeta = "Pacote de instalação Android", exeMeta = "Instalador Windows Desktop";
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
    d.style.cssText = "position:fixed;inset:0;z-index:10600;background:#0b1526;color:#f8fafc;overflow:auto;padding:24px 16px;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;";
    d.innerHTML =
      "<div style=\"max-width:920px;margin:0 auto;background:#ffffff;color:#0f172a;border-radius:16px;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.45);border:1px solid #cbd5e1;\">" +
        "<div style=\"background:linear-gradient(90deg,#002b7f 0%,#0055b8 100%);color:#ffffff;padding:18px 24px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;\">" +
          "<div style=\"display:flex;align-items:center;gap:12px;flex-wrap:wrap;\">" +
            "<span style=\"background:#ffffff;color:#003399;font-weight:900;font-size:13px;padding:5px 10px;border-radius:6px;letter-spacing:.06em;\">VOITH</span>" +
            "<div>" +
              "<div style=\"font-weight:800;font-size:16px;\">Voith Metrologia • Centro de Downloads</div>" +
              "<div style=\"font-size:12px;color:#dbeafe;\">Release ativa: " + tag + "</div>" +
            "</div>" +
          "</div>" +
          "<div style=\"display:flex;align-items:center;gap:8px;\">" +
            "<button type=\"button\" id=\"vu-go-login\" style=\"padding:8px 14px;border-radius:8px;border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.14);color:#ffffff;font-weight:700;font-size:12.5px;cursor:pointer;\">Op&ccedil;&otilde;es de Login</button>" +
            "<button type=\"button\" id=\"vu-close-dl\" aria-label=\"Fechar\" style=\"width:34px;height:34px;border-radius:8px;border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.14);color:#ffffff;font-size:18px;line-height:1;cursor:pointer;\">&times;</button>" +
          "</div>" +
        "</div>" +
        "<div style=\"padding:28px 24px;background:#f8fafc;\">" +
          "<div style=\"margin-bottom:22px;\">" +
            "<div style=\"font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#0055b8;margin-bottom:4px;\">Distribui&ccedil;&atilde;o Oficial</div>" +
            "<h1 style=\"margin:0 0 6px;font-size:24px;font-weight:800;color:#0f172a;\">Selecione a vers&atilde;o do seu dispositivo</h1>" +
            "<p style=\"margin:0;font-size:13.5px;color:#475569;\">Baixe o instalador correspondente ao aparelho para acesso ao sistema de calibra&ccedil;&atilde;o e invent&aacute;rio.</p>" +
          "</div>" +
          "<div style=\"display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px;\">" +
            "<div style=\"background:#ffffff;border:1px solid #cbd5e1;border-top:4px solid #0055b8;border-radius:12px;padding:20px;display:flex;flex-direction:column;justify-content:space-between;gap:16px;\">" +
              "<div>" +
                "<div style=\"display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;\">" +
                  "<span style=\"font-size:11px;font-weight:800;padding:3px 8px;border-radius:999px;background:#eff6ff;color:#0055b8;border:1px solid #bfdbfe;\">ANDROID / TABLET</span>" +
                  "<span style=\"font-size:11.5px;font-weight:700;color:#64748b;\">.APK</span>" +
                "</div>" +
                "<div style=\"font-size:18px;font-weight:800;color:#0f172a;margin-bottom:4px;\">Voith Metrologia Android</div>" +
                "<div style=\"font-size:12.5px;color:#475569;\">" + apkMeta + " • Coleta em campo e cautela</div>" +
              "</div>" +
              "<a href=\"" + apkUrl + "\" target=\"_blank\" rel=\"noopener\" style=\"display:block;text-align:center;padding:11px 16px;border-radius:8px;background:#0055b8;color:#ffffff;font-weight:800;font-size:13.5px;text-decoration:none;\">Baixar APK (.apk)</a>" +
            "</div>" +
            "<div style=\"background:#ffffff;border:1px solid #cbd5e1;border-top:4px solid #002b7f;border-radius:12px;padding:20px;display:flex;flex-direction:column;justify-content:space-between;gap:16px;\">" +
              "<div>" +
                "<div style=\"display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;\">" +
                  "<span style=\"font-size:11px;font-weight:800;padding:3px 8px;border-radius:999px;background:#f1f5f9;color:#0f172a;border:1px solid #cbd5e1;\">WINDOWS DESKTOP</span>" +
                  "<span style=\"font-size:11.5px;font-weight:700;color:#64748b;\">.EXE</span>" +
                "</div>" +
                "<div style=\"font-size:18px;font-weight:800;color:#0f172a;margin-bottom:4px;\">Voith Metrologia Windows</div>" +
                "<div style=\"font-size:12.5px;color:#475569;\">" + exeMeta + " • Esta&ccedil;&otilde;es de trabalho e laborat&oacute;rio</div>" +
              "</div>" +
              "<a href=\"" + exeUrl + "\" target=\"_blank\" rel=\"noopener\" style=\"display:block;text-align:center;padding:11px 16px;border-radius:8px;background:#002b7f;color:#ffffff;font-weight:800;font-size:13.5px;text-decoration:none;\">Baixar Instalador (.exe)</a>" +
            "</div>" +
          "</div>" +
          "<div style=\"margin-top:20px;padding-top:16px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;\">" +
            "<span style=\"font-size:12px;color:#64748b;\">J&aacute; possui o aplicativo instalado? Acesse sua conta para continuar.</span>" +
            "<button type=\"button\" id=\"vu-dl-login-cta\" style=\"padding:9px 16px;border-radius:8px;border:1px solid #0055b8;background:#ffffff;color:#0055b8;font-weight:800;font-size:12.5px;cursor:pointer;\">Ir para Op&ccedil;&otilde;es de Login &rarr;</button>" +
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
      panel.style.cssText = "margin-top:14px;display:grid;gap:10px;color:#0f172a;";
      panel.innerHTML =
        "<div style=\"display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 12px;border-radius:10px;background:#eff6ff;border:1px solid #bfdbfe;\">" +
          "<div>" +
            "<div style=\"font-weight:800;font-size:13.5px;color:#003399;\">Tipos de Login &amp; Hierarquia de Acesso</div>" +
            "<div style=\"font-size:12px;color:#334155;\">N&iacute;veis de permiss&atilde;o definidos para opera&ccedil;&atilde;o e gest&atilde;o.</div>" +
          "</div>" +
        "</div>" +
        "<div style=\"padding:10px 12px;border-radius:10px;background:#ffffff;border:1px solid #e2e8f0;font-size:12.5px;\"><strong>ADMIN</strong> &mdash; Controle completo de usu&aacute;rios, logins, OTA, telemetria e auditoria.</div>" +
        "<div style=\"padding:10px 12px;border-radius:10px;background:#ffffff;border:1px solid #e2e8f0;font-size:12.5px;\"><strong>GESTOR / L&Iacute;DER</strong> &mdash; Aprova&ccedil;&atilde;o de romaneios externos, acompanhamento de vencimentos e pend&ecirc;ncias.</div>" +
        "<div style=\"padding:10px 12px;border-radius:10px;background:#ffffff;border:1px solid #e2e8f0;font-size:12.5px;\"><strong>T&Eacute;CNICO / METROLOGISTA</strong> &mdash; Execu&ccedil;&atilde;o de calibra&ccedil;&otilde;es, invent&aacute;rio e movimenta&ccedil;&atilde;o de instrumentos.</div>" +
        "<div style=\"padding:10px 12px;border-radius:10px;background:#ffffff;border:1px solid #e2e8f0;font-size:12.5px;\"><strong>OPERADOR / CONSULTA</strong> &mdash; Consulta de status, cautela e leitura do painel.</div>";
      root.appendChild(panel);
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
        if (isHier) {
          setTimeout(() => showHierarchyView(el), 50);
        } else {
          clearHierarchyView(root);
        }
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