(() => {
const APK = "https://github.com/carvpab/voith-metrologia-app/releases/latest/download/voith-metrologia.apk";
const EXE = "https://github.com/carvpab/voith-metrologia-app/releases/latest/download/voith-metrologia-setup.exe";

const focusLogin = () => {
const m = document.getElementById("vu-dl-rave");
if (m) m.remove();
const inp = document.querySelector("input[type=text], input[name*=user], input[id*=user], input[placeholder*=login i]");
if (inp) {
  inp.scrollIntoView({ behavior: "smooth", block: "center" });
  setTimeout(() => inp.focus(), 150);
}
};

const openDownloadPage = async () => {
if (document.getElementById("vu-dl-rave")) return;
let tag = "Latest", apkUrl = APK, exeUrl = EXE;
try {
  const r = await fetch("https://api.github.com/repos/carvpab/voith-metrologia-app/releases/latest");
  if (r.ok) {
    const j = await r.json();
    tag = j.tag_name || tag;
    const a = j.assets || [];
    apkUrl = (a.find(x => /\.apk$/i.test(x.name)) || {}).browser_download_url || APK;
    exeUrl = (a.find(x => /\.exe$/i.test(x.name)) || {}).browser_download_url || EXE;
  }
} catch (_) {}

const d = document.createElement("div");
d.id = "vu-dl-rave";
d.style.cssText = "position:fixed;inset:0;z-index:10600;background:linear-gradient(135deg,#091124,#141b4d,#1d1147);color:#fff;overflow:auto;padding:28px 16px;font-family:system-ui,sans-serif";
d.innerHTML =
  "<div style=\"max-width:860px;margin:0 auto\">" +
    "<div style=\"display:flex;justify-content:space-between;align-items:center;margin-bottom:28px;gap:10px;flex-wrap:wrap\">" +
      "<strong>VOITH METROLOGIA &bull; " + tag + "</strong>" +
      "<div style=\"display:flex;gap:8px\">" +
        "<button type=\"button\" id=\"vu-go-login\" style=\"padding:8px 14px;border-radius:10px;border:1px solid #64748b;background:#1e293b;color:#fff;font-weight:700;cursor:pointer\">Op&ccedil;&otilde;es de Login</button>" +
        "<button type=\"button\" id=\"vu-close-dl\" style=\"padding:8px 12px;border-radius:10px;border:1px solid #64748b;background:#1e293b;color:#fff;font-weight:700;cursor:pointer\">&times;</button>" +
      "</div>" +
    "</div>" +
    "<h1 style=\"text-align:center;margin:0 0 24px;font-size:32px\">BAIXAR APLICATIVO</h1>" +
    "<div style=\"display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:18px\">" +
      "<div style=\"background:#0f172a;border:1px solid #334155;border-radius:16px;padding:22px;text-align:center\">" +
        "<h3>Android (.APK)</h3>" +
        "<p style=\"color:#94a3b8;font-size:13px\">Tablets e celulares</p>" +
        "<a href=\"" + apkUrl + "\" target=\"_blank\" rel=\"noopener\" style=\"display:block;padding:12px;border-radius:10px;background:#0284c7;color:#fff;font-weight:800;text-decoration:none\">Baixar APK</a>" +
      "</div>" +
      "<div style=\"background:#0f172a;border:1px solid #334155;border-radius:16px;padding:22px;text-align:center\">" +
        "<h3>Windows (.EXE)</h3>" +
        "<p style=\"color:#94a3b8;font-size:13px\">PCs e esta&ccedil;&otilde;es</p>" +
        "<a href=\"" + exeUrl + "\" target=\"_blank\" rel=\"noopener\" style=\"display:block;padding:12px;border-radius:10px;background:#0284c7;color:#fff;font-weight:800;text-decoration:none\">Baixar EXE</a>" +
      "</div>" +
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
b.style.cssText = "position:fixed;bottom:14px;right:14px;z-index:9950;padding:8px 14px;border-radius:999px;border:1px solid #38bdf8;background:#0b1628;color:#fff;font:700 12px system-ui,sans-serif;box-shadow:0 8px 22px rgba(0,0,0,.35);cursor:pointer";
b.onclick = openDownloadPage;
document.body.appendChild(b);
};

const renderHierarchyPanel = (tabEl) => {
const container = tabEl.parentElement ? tabEl.parentElement.parentElement : document.body;
if (!container) return;
let box = container.querySelector("#vu-hierarchy-panel");
if (!box) {
  box = document.createElement("div");
  box.id = "vu-hierarchy-panel";
  box.style.cssText = "margin-top:14px;padding:14px;border-radius:12px;border:1px solid #cbd5e1;background:#f8fafc;color:#0f172a;font-size:13px;";
  box.innerHTML =
    "<div style=\"font-weight:800;font-size:14px;margin-bottom:8px\">Tipos de Login &amp; Hierarquia</div>" +
    "<div style=\"display:grid;gap:8px\">" +
      "<div style=\"padding:8px 10px;border-radius:8px;background:#fff;border:1px solid #e2e8f0\"><strong>ADMIN</strong> &mdash; Gest&atilde;o de usu&aacute;rios, permiss&otilde;es, OTA e auditoria.</div>" +
      "<div style=\"padding:8px 10px;border-radius:8px;background:#fff;border:1px solid #e2e8f0\"><strong>GESTOR / L&Iacute;DER</strong> &mdash; Aprova&ccedil;&atilde;o de romaneios, alertas de vencimento e pend&ecirc;ncias.</div>" +
      "<div style=\"padding:8px 10px;border-radius:8px;background:#fff;border:1px solid #e2e8f0\"><strong>T&Eacute;CNICO / METROLOGISTA</strong> &mdash; Calibra&ccedil;&otilde;es, invent&aacute;rio e movimenta&ccedil;&atilde;o de instrumentos.</div>" +
      "<div style=\"padding:8px 10px;border-radius:8px;background:#fff;border:1px solid #e2e8f0\"><strong>OPERADOR / CONSULTA</strong> &mdash; Visualiza&ccedil;&atilde;o do painel e cautela.</div>" +
    "</div>";
  container.appendChild(box);
}
box.style.display = "block";
};

const bindTabs = () => {
addBtn();
const els = Array.from(document.querySelectorAll("button, [role=tab], a, div")).filter((el) => {
  if (el.children.length > 2) return false;
  const t = String(el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
  return t === "tipos de login & hierarquia" || t.includes("hierarquia");
});
els.forEach((el) => {
  if (el.dataset.vuHierBound) return;
  el.dataset.vuHierBound = "1";
  el.addEventListener("click", () => {
    setTimeout(() => renderHierarchyPanel(el), 60);
  });
});
};

const obs = new MutationObserver(bindTabs);
const start = () => {
addBtn();
bindTabs();
obs.observe(document.body, { childList: true, subtree: true });
};
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
else start();

window.VoithUpgrade = Object.assign({}, window.VoithUpgrade, { openDownloadPage, focusLoginScreen: focusLogin });
})();