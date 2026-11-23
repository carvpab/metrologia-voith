/* ============================================================================
 * VOITH TURBO — PRECISION METROLOGY OS v16.9 • utils.js
 * Utilitários puros: datas BR, classificação metrológica, máscaras, toast, CSV
 * ============================================================================ */

window.VOITH_PLATFORM = (function () {
    if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) return 'ANDROID_APK';
    if (navigator.userAgent && navigator.userAgent.indexOf('Electron') !== -1) return 'WINDOWS_EXE';
    return 'WEB';
})();

function escHtml(v) {
    return String(v == null ? '' : v)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function normStr(v) {
    return String(v == null ? '' : v)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function parseDateBR(str) {
    var s = String(str == null ? '' : str).trim();
    if (!s || s === '-' || s.toUpperCase() === 'N/A' || s.toUpperCase() === 'S/D') return null;
    var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (m) {
        var yr = Number(m[3]);
        if (yr < 100) yr += 2000;
        var d = new Date(yr, Number(m[2]) - 1, Number(m[1]), 12, 0, 0);
        return isNaN(d.getTime()) ? null : d;
    }
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
        var d2 = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
        return isNaN(d2.getTime()) ? null : d2;
    }
    return null;
}

function formatDateBR(d) {
    if (!d || isNaN(d.getTime())) return '';
    return String(d.getDate()).padStart(2, '0') + '/' +
           String(d.getMonth() + 1).padStart(2, '0') + '/' +
           d.getFullYear();
}

function formatDateISO(d) {
    if (!d || isNaN(d.getTime())) return '';
    return d.getFullYear() + '-' +
           String(d.getMonth() + 1).padStart(2, '0') + '-' +
           String(d.getDate()).padStart(2, '0');
}

function todayBR() {
    return formatDateBR(new Date());
}

function addMonthsToDate(d, months) {
    var base = d ? new Date(d.getTime()) : new Date();
    var target = new Date(base.getFullYear(), base.getMonth() + Number(months || 12), base.getDate(), 12, 0, 0);
    return target;
}

function daysBetween(a, b) {
    if (!a || !b) return null;
    var d1 = new Date(a.getFullYear(), a.getMonth(), a.getDate(), 12, 0, 0);
    var d2 = new Date(b.getFullYear(), b.getMonth(), b.getDate(), 12, 0, 0);
    return Math.round((d2.getTime() - d1.getTime()) / 86400000);
}

function maskBRDate(input) {
    if (!input) return;
    var v = String(input.value || '').replace(/\D/g, '').slice(0, 8);
    if (v.length >= 5) v = v.slice(0, 2) + '/' + v.slice(2, 4) + '/' + v.slice(4);
    else if (v.length >= 3) v = v.slice(0, 2) + '/' + v.slice(2);
    input.value = v;
}

function openPicker(id) {
    var el = document.getElementById(id);
    if (!el) return;
    try {
        if (typeof el.showPicker === 'function') { el.showPicker(); return; }
    } catch (e) {}
    el.focus();
    el.click();
}

function classifyFamily(desc) {
    var t = normStr(desc);
    if (/torquimet|chave de torque|multiplicador|dinamomet|celula de carga|forca|balanca|peso padrao|tracao|torq/.test(t)) return 'TORQUE';
    if (/manomet|termomet|piromet|pressostat|vacuomet|termohigromet|transdutor|pressao|temperatura|higromet|estufa|forno|termopar|baromet|calor|infra/.test(t)) return 'TEMP_PRESSAO';
    if (/multimet|amperimet|megohmet|terromet|alicate|osciloscop|fonte|volt|eletric|decibelimet|tacomet|estroboscop|hipot|ohmimet|capacimet|miliohm/.test(t)) return 'ELETRICA';
    return 'DIMENSIONAL';
}

function familyMeta(code) {
    if (code === 'TORQUE') return { key: 'TORQUE', label: 'Torque / Força', color: '#F59E0B', icon: 'i-wrench' };
    if (code === 'TEMP_PRESSAO') return { key: 'TEMP_PRESSAO', label: 'Temp. / Pressão', color: '#E11D48', icon: 'i-temperature-half' };
    if (code === 'ELETRICA') return { key: 'ELETRICA', label: 'Elétrica', color: '#10B981', icon: 'i-bolt' };
    return { key: 'DIMENSIONAL', label: 'Dimensional', color: '#004C97', icon: 'i-ruler-combined' };
}

function getEffectiveStatus(item, refDate) {
    var raw = normStr(item && item.status);
    if (raw.indexOf('reparo') !== -1 || raw.indexOf('manutenc') !== -1) return 'EM REPARO';
    if (raw.indexOf('aguard') !== -1) return 'AGUARDANDO CALIBRAÇÃO';
    if (raw.indexOf('pendenc') !== -1) return 'PENDÊNCIA DE DATA';
    var ref = refDate || (window.VoithDB ? window.VoithDB.getRefDate() : new Date());
    var dt = parseDateBR(item && item.proxCal);
    if (!dt) {
        if (raw && raw !== 'auto' && raw !== 'em dia' && raw !== 'vencida' && raw !== 'proxima do vencimento') {
            return String(item.status).toUpperCase();
        }
        return 'PENDÊNCIA DE DATA';
    }
    var diff = daysBetween(ref, dt);
    if (diff < 0) return 'VENCIDA';
    if (diff <= 30) return 'PRÓXIMA DO VENCIMENTO';
    return 'EM DIA';
}

function getStatusBadgeHtml(st) {
    if (st === 'VENCIDA') return '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30">VENCIDA</span>';
    if (st === 'PRÓXIMA DO VENCIMENTO') return '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30">PRÓX. 30D</span>';
    if (st === 'AGUARDANDO CALIBRAÇÃO') return '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-sky-100 dark:bg-sky-500/20 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-500/30">AGUARDANDO CAL.</span>';
    if (st === 'EM REPARO') return '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30">EM REPARO</span>';
    if (st === 'PENDÊNCIA DE DATA') return '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-500/30">PENDÊNCIA DATA</span>';
    return '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30">EM DIA</span>';
}

function getInitials(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'VO';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function copyTextToClipboard(text, okMsg) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
            showToast(okMsg || 'Copiado para a área de transferência!', 'ok');
        }).catch(function () {
            fallbackCopy(text, okMsg);
        });
    } else {
        fallbackCopy(text, okMsg);
    }
}

function fallbackCopy(text, okMsg) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); showToast(okMsg || 'Copiado!', 'ok'); } catch (e) {}
    document.body.removeChild(ta);
}

function showToast(msg, tone) {
    var wrap = document.getElementById('vpToastContainer');
    if (!wrap) return;
    var el = document.createElement('div');
    var cls = tone === 'err' ? 'bg-rose-600 text-white' :
              tone === 'warn' ? 'bg-amber-500 text-slate-950' :
              'bg-[#001833] text-white border border-[#00A8E8]/40';
    el.className = 'pointer-events-auto px-4 py-2.5 rounded-xl shadow-2xl text-xs font-bold flex items-center gap-2 transition-all ' + cls;
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(function () {
        el.style.opacity = '0';
        el.style.transform = 'translateY(8px)';
        setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 250);
    }, 3200);
}

function csvCell(v) {
    var s = String(v == null ? '' : v).replace(/"/g, '""');
    return '"' + s + '"';
}

function shortSectorLabel(setor) {
    var s = String(setor || '').trim();
    if (!s) return '-';
    var m = s.match(/\(([^)]+)\)\s*$/);
    if (m) return '(' + m[1].trim() + ')';
    return s.replace(/^Voith\s+Turbo\s*[-–]?\s*/i, '').trim() || s;
}

function getValidityCountdownInfo(item, refDate) {
    var dt = parseDateBR(item && item.proxCal);
    if (!dt) return { dateBr: (item && item.proxCal) || '-', label: 'Sem data', pct: 0, color: '#94A3B8', textCls: 'text-slate-400' };
    var ref = refDate || (window.VoithDB ? window.VoithDB.getRefDate() : new Date());
    var diff = daysBetween(ref, dt);
    var cycleDays = Math.max(30, Number(item && item.cycleMonths ? item.cycleMonths : 12) * 30);
    var dateBr = formatDateBR(dt);

    if (diff < 0) {
        var absD = Math.abs(diff);
        var lblOver = absD >= 60 ? ('-' + Math.round(absD / 30) + 'm vencido') : ('-' + absD + 'd vencido');
        return { dateBr: dateBr, label: lblOver, pct: 100, color: '#E11D48', textCls: 'text-rose-600 dark:text-rose-400' };
    }
    var pct = Math.max(6, Math.min(100, Math.round((diff / cycleDays) * 100)));
    if (diff <= 30) {
        return { dateBr: dateBr, label: diff === 0 ? 'Vence hoje' : ('+' + diff + 'd restantes'), pct: Math.max(12, pct), color: '#F59E0B', textCls: 'text-amber-600 dark:text-amber-400' };
    }
    var months = Math.floor(diff / 30);
    var lblOk = months >= 12 ? ('+' + (diff / 365).toFixed(1).replace('.0', '') + 'a válidos') : ('+' + months + 'm válidos');
    return { dateBr: dateBr, label: lblOk, pct: pct, color: '#10B981', textCls: 'text-emerald-600 dark:text-emerald-400' };
}
