/**
 * ============================================================================
 * VOITH METROLOGIA — Upgrade Suite v6.2 + Auto-Update OTA Nivel 2
 * ============================================================================
 */
(function (global) {
  'use strict';

  const REPO_APP = 'carvpab/voith-metrologia-app';
  const VERSION_URL = './version.json';
  const STORAGE_KEY_VER = 'voith_cached_web_version_v1';

  function detectPlatform() {
    const ua = navigator.userAgent || '';
    const isAndroid = /Android/i.test(ua) || Boolean(global.Capacitor && global.Capacitor.getPlatform && global.Capacitor.getPlatform() === 'android');
    const isWindows = /Windows/i.test(ua);
    return { isAndroid, isWindows };
  }

  async function clearAllWebCachesAndReload() {
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.update().catch(() => {})));
      }
    } catch (_) {}
    const url = new URL(window.location.href);
    url.searchParams.set('_ota', String(Date.now()));
    window.location.replace(url.toString());
  }

  async function fetchRemoteVersion() {
    try {
      const res = await fetch(`${VERSION_URL}?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return null;
      return await res.json();
    } catch (_) {
      return null;
    }
  }

  async function fetchLatestRelease() {
    try {
      const res = await fetch(`https://api.github.com/repos/${REPO_APP}/releases/latest`, {
        headers: { Accept: 'application/vnd.github+json' }
      });
      if (!res.ok) return null;
      const data = await res.json();
      const assets = Array.isArray(data.assets) ? data.assets : [];
      const apkAsset = assets.find((a) => /\.apk$/i.test(a.name));
      const exeAsset = assets.find((a) => /\.exe$/i.test(a.name));
      return {
        tag: data.tag_name || '',
        name: data.name || data.tag_name || '',
        apkUrl: apkAsset ? apkAsset.browser_download_url : `https://github.com/${REPO_APP}/releases/latest/download/voith-metrologia.apk`,
        exeUrl: exeAsset ? exeAsset.browser_download_url : `https://github.com/${REPO_APP}/releases/latest/download/voith-metrologia-setup.exe`
      };
    } catch (_) {
      return null;
    }
  }

  function showUpdateBanner({ title, subtitle, buttonText, onAction }) {
    if (document.getElementById('vu-ota-banner')) return;
    const bar = document.createElement('div');
    bar.id = 'vu-ota-banner';
    bar.style.cssText = [
      'position:fixed',
      'bottom:calc(16px + env(safe-area-inset-bottom, 0px))',
      'left:50%',
      'transform:translateX(-50%)',
      'z-index:10400',
      'width:min(540px, calc(100vw - 24px))',
      'background:#0b1628',
      'color:#f8fafc',
      'border:1px solid #0ea5e9',
      'border-radius:14px',
      'padding:12px 14px',
      'box-shadow:0 16px 42px rgba(0,0,0,0.48)',
      'display:flex',
      'align-items:center',
      'justify-content:space-between',
      'gap:12px',
      'font-family:system-ui,-apple-system,sans-serif'
    ].join(';');

    bar.innerHTML = `
      <div style="min-width:0;">
        <div style="font-size:13px;font-weight:700;color:#38bdf8;">${title}</div>
        <div style="font-size:12px;color:#cbd5e1;margin-top:2px;">${subtitle}</div>
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
        <button type="button" id="vu-ota-go" style="padding:7px 12px;border-radius:8px;border:none;background:#0284c7;color:#fff;font-weight:700;font-size:12px;cursor:pointer;">${buttonText}</button>
        <button type="button" id="vu-ota-dismiss" style="background:transparent;border:none;color:#94a3b8;font-size:18px;cursor:pointer;padding:2px 6px;">&times;</button>
      </div>
    `;
    bar.querySelector('#vu-ota-go').onclick = onAction;
    bar.querySelector('#vu-ota-dismiss').onclick = () => bar.remove();
    document.body.appendChild(bar);
  }

  async function checkUpdates(manual = false) {
    const remoteVer = await fetchRemoteVersion();
    const currentLocalVer = localStorage.getItem(STORAGE_KEY_VER);

    if (remoteVer && remoteVer.version) {
      if (!currentLocalVer) {
        localStorage.setItem(STORAGE_KEY_VER, String(remoteVer.version));
      } else if (String(remoteVer.version) !== currentLocalVer) {
        showUpdateBanner({
          title: `Nova versao Web disponivel (${remoteVer.version})`,
          subtitle: 'Telas e regras atualizadas prontas para carregar.',
          buttonText: 'Atualizar Agora',
          onAction: () => {
            localStorage.setItem(STORAGE_KEY_VER, String(remoteVer.version));
            clearAllWebCachesAndReload();
          }
        });
        return;
      }
    }

    const release = await fetchLatestRelease();
    const { isAndroid, isWindows } = detectPlatform();
    const lastSeenRelease = localStorage.getItem('voith_seen_release_tag') || '';

    if (release && release.tag && (manual || release.tag !== lastSeenRelease)) {
      const downloadUrl = isAndroid ? release.apkUrl : (isWindows ? release.exeUrl : release.apkUrl);
      const pkgLabel = isAndroid ? 'APK Android' : (isWindows ? 'Instalador Windows (.exe)' : 'Pacote Nativo');
      showUpdateBanner({
        title: `Atualizacao Nativa (${release.tag})`,
        subtitle: `Novo ${pkgLabel} disponivel para instalacao direta.`,
        buttonText: 'Baixar e Instalar',
        onAction: () => {
          localStorage.setItem('voith_seen_release_tag', release.tag);
          window.open(downloadUrl, '_blank');
        }
      });
    } else if (manual && global.VoithUpgrade && typeof global.VoithUpgrade.toast === 'function') {
      global.VoithUpgrade.toast('Seu sistema ja esta na versao mais recente!', 'success');
    }
  }

  const prevSuite = global.VoithUpgrade || {};
  global.VoithUpgrade = Object.assign({}, prevSuite, {
    checkUpdates,
    forceWebReload: clearAllWebCachesAndReload
  });

  setTimeout(() => { checkUpdates(false); }, 3500);
})(window);