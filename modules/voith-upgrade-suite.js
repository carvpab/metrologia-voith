(() => {
  const APK = "https://github.com/carvpab/voith-metrologia-app/releases/latest/download/voith-metrologia.apk";
  const EXE = "https://github.com/carvpab/voith-metrologia-app/releases/latest/download/voith-metrologia-setup.exe";

  const focusLogin = () => {
    const m = document.getElementById("vu-dl-rave");
    if (m) m.remove();
    const inp = document.querySelector("input[type=text], input[name*=user], input[id*=user]");
    if (inp) {
      inp.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => inp.focus(), 150);
    }
  };

  const openPage = async () => {
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
            "<button id=\"vu-go-login\" style=\"padding:8px 14px;border-radius:10px;border:1px solid #64748b;background:#1e293b;color:#fff;font-weight:700;cursor:pointer\">Op&ccedil;&otilde;es de Login</button>" +
            "<button id=\"vu-close-dl\" style=\"padding:8px 12px;border-radius:10px;border:1px solid #64748b;background:#1e293b;color:#fff;font-weight:700;cursor:pointer\">&times;</button>" +
          "</div>" +
        "</div>" +
        "<h1 style=\"text-align:center;margin:0 0 24px;font-size:32px\">BAIXAR APLICATIVO</h1>" +
        "<div style=\"display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:18px\">" +
          "<div style=\"background:#0f172a;border:1px solid #334155;border-radius:16px;padding:22px;text-align:center\">" +
            "<h3>Android (.APK)</h3>" +
            "<p style=\"color:#94a3b8;font-size:13px\">Tablets e celulares</p>" +
            "<a href=\"" + apkUrl + "\" target=\"_blank\" style=\"display:block;padding:12px;border-radius:10px;background:#0284c7;color:#fff;font-weight:800;text-decoration:none\">Baixar APK</a>" +
          "</div>" +
          "<div style=\"background:#0f172a;border:1px solid #334155;border-radius:16px;padding:22px;text-align:center\">" +
            "<h3>Windows (.EXE)</h3>" +
            "<p style=\"color:#94a3b8;font-size:13px\">PCs e esta&ccedil;&otilde;es</p>" +
            "<a href=\"" + exeUrl + "\" target=\"_blank\" style=\"display:block;padding:12px;border-radius:10px;background:#0284c7;color:#fff;font-weight:800;text-decoration:none\">Baixar EXE</a>" +
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
    b.style.cssText = "position:fixed;top:12px;right:12px;z-index:9900;padding:7px 12px;border-radius:999px;border:1px solid #38bdf8;background:#0b1628;color:#fff;font:700 12px system-ui,sans-serif;cursor:pointer";
    b.onclick = openPage;
    document.body.appendChild(b);
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", addBtn);
  else addBtn();

  window.VoithUpgrade = Object.assign({}, window.VoithUpgrade, { openDownloadPage: openPage });
})();