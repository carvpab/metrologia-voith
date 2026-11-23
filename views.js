/* ============================================================================
 * VOITH TURBO — PRECISION METROLOGY OS v16.15 • views.js
 * Renderização fiel ao Cockpit v12 (4 Workspaces + SVG Gauge + Donut + Radar)
 * ============================================================================ */

function getFilteredInventory() {
    var st = VoithDB.state;
    var f = st.filters;
    var ref = VoithDB.getRefDate();
    var q = normStr(f.search);

    var list = st.instruments.filter(function (it) {
        var eff = getEffectiveStatus(it, ref);
        var fam = classifyFamily(it.desc);
        var hasCust = Boolean(String(it.custodyHolder || '').trim());
        var loc = String(it.local || '').trim();

        // Quick tab overrides
        if (f.quickTab === '__CUSTODY__' && !hasCust) return false;
        if (f.quickTab === '__NOLOC__' && loc) return false;
        if (f.quickTab && f.quickTab !== '__CUSTODY__' && f.quickTab !== '__NOLOC__' && eff !== f.quickTab) return false;

        // Advanced filters
        if (f.status === '__URGENT__') {
            if (eff !== 'VENCIDA' && eff !== 'PRÓXIMA DO VENCIMENTO') return false;
        } else if (f.status && eff !== f.status) {
            return false;
        }
        if (f.setor && String(it.setor || '').trim() !== f.setor) return false;
        if (f.local === '__NONE__') {
            if (loc) return false;
        } else if (f.local && loc !== f.local) {
            return false;
        }
        if (f.resp && String(it.resp || '').trim() !== f.resp) return false;
        if (f.family && fam !== f.family) return false;
        if (f.month) {
            var dt = parseDateBR(it.proxCal);
            var ym = dt ? (dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0')) : '';
            if (ym !== f.month) return false;
        }
        if (q) {
            var wantsOver = /\bvencid/.test(q);
            var wantsNoLoc = /\bsem local\b/.test(q);
            var wantsCust = /\b(cautel|em posse)\b/.test(q);
            if (wantsOver && eff !== 'VENCIDA') return false;
            if (wantsNoLoc && loc) return false;
            if (wantsCust && !hasCust) return false;
            var cleaned = q.replace(/\b(vencidos?|vencidas?|sem local|cautelas?|em posse|da|do|de)\b/g, ' ').trim();
            if (cleaned) {
                var hay = normStr([it.code, it.desc, it.setor, it.local, it.resp, it.cc, it.obs, it.custodyHolder, it.custodyReturnTo, eff, familyMeta(fam).label].join(' '));
                var words = cleaned.split(/\s+/).filter(Boolean);
                for (var i = 0; i < words.length; i++) {
                    var w = words[i];
                    var stem = w.length > 4 && w.charAt(w.length - 1) === 's' ? w.slice(0, -1) : w;
                    if (hay.indexOf(stem) === -1) return false;
                }
            }
        }
        return true;
    });

    // Sort
    var col = st.sortCol || 'code';
    var dir = st.sortDir === 'desc' ? -1 : 1;
    list.sort(function (a, b) {
        var va, vb;
        if (col === 'proxCal') {
            var da = parseDateBR(a.proxCal);
            var db = parseDateBR(b.proxCal);
            va = da ? da.getTime() : 9e15;
            vb = db ? db.getTime() : 9e15;
            return (va - vb) * dir;
        }
        if (col === 'status') {
            va = getEffectiveStatus(a, ref);
            vb = getEffectiveStatus(b, ref);
        } else {
            va = String(a[col] || '');
            vb = String(b[col] || '');
        }
        return va.localeCompare(vb, 'pt-BR', { numeric: true, sensitivity: 'base' }) * dir;
    });

    return list;
}

function populateGlobalDatalistsAndFilters() {
    var st = VoithDB.state;
    var inst = st.instruments;
    var setoresSet = new Set(st.controlledLists.sectors || []);
    var locaisSet = new Set(st.controlledLists.locals || []);
    var respSet = new Set();
    var pessoasSet = new Set();
    var destinosSet = new Set(st.controlledLists.locals || []);
    var monthsSet = new Set();

    inst.forEach(function (it) {
        if (it.setor) setoresSet.add(String(it.setor).trim());
        if (it.local) { locaisSet.add(String(it.local).trim()); destinosSet.add(String(it.local).trim()); }
        if (it.resp) { respSet.add(String(it.resp).trim()); pessoasSet.add(String(it.resp).trim()); destinosSet.add(String(it.resp).trim()); }
        if (it.custodyHolder) pessoasSet.add(String(it.custodyHolder).trim());
        if (it.custodyReturnTo) destinosSet.add(String(it.custodyReturnTo).trim());
        var dt = parseDateBR(it.proxCal);
        if (dt) monthsSet.add(dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0'));
    });

    var setores = Array.from(setoresSet).filter(Boolean).sort();
    var locais = Array.from(locaisSet).filter(Boolean).sort();
    var resps = Array.from(respSet).filter(Boolean).sort();
    var pessoas = Array.from(pessoasSet).filter(Boolean).sort();
    var destinos = Array.from(destinosSet).filter(Boolean).sort();
    var months = Array.from(monthsSet).sort();

    function fillDL(id, arr) {
        var el = document.getElementById(id);
        if (el) el.innerHTML = arr.map(function (v) { return '<option value="' + escHtml(v) + '">'; }).join('');
    }
    fillDL('dlSetores', setores);
    fillDL('dlLocais', locais);
    fillDL('dlPessoas', pessoas);
    fillDL('dlDestinos', destinos);

    function fillSelect(id, allLabel, arr, curVal, extraTop) {
        var el = document.getElementById(id);
        if (!el) return;
        var html = '<option value="">' + escHtml(allLabel) + '</option>';
        if (extraTop) html += extraTop;
        html += arr.map(function (v) {
            var val = typeof v === 'object' ? v.val : v;
            var lbl = typeof v === 'object' ? v.lbl : v;
            return '<option value="' + escHtml(val) + '"' + (curVal === val ? ' selected' : '') + '>' + escHtml(lbl) + '</option>';
        }).join('');
        el.innerHTML = html;
    }

    var monthOpts = months.map(function (ym) {
        var p = ym.split('-');
        var d = new Date(Number(p[0]), Number(p[1]) - 1, 1);
        var lbl = d.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }).replace('.', '');
        return { val: ym, lbl: lbl.charAt(0).toUpperCase() + lbl.slice(1) };
    });

    fillSelect('fSetor', 'Todos os Setores', setores, st.filters.setor);
    fillSelect('fLocal', 'Todos os Locais', locais, st.filters.local, '<option value="__NONE__"' + (st.filters.local === '__NONE__' ? ' selected' : '') + '>Sem Localização</option>');
    fillSelect('fResp', 'Todos os Responsáveis', resps, st.filters.resp);
    fillSelect('fMonth', 'Todos os Meses', monthOpts, st.filters.month);

    fillSelect('printSetorSel', 'Todos os Setores', setores, document.getElementById('printSetorSel') ? document.getElementById('printSetorSel').value : '');
    fillSelect('printRespSel', 'Todos os Responsáveis', resps, document.getElementById('printRespSel') ? document.getElementById('printRespSel').value : '');
    fillSelect('printMonthSel', 'Todos os Meses', monthOpts, document.getElementById('printMonthSel') ? document.getElementById('printMonthSel').value : '');
}

function updateSidebarCounts() {
    var st = VoithDB.state;
    var invCnt = st.instruments.length;
    var custCnt = st.instruments.filter(function (i) { return Boolean(String(i.custodyHolder || '').trim()); }).length;
    var labOpen = st.history.filter(function (h) { return h.status !== 'CONCLUÍDO'; }).length;

    var setText = function (id, val) { var el = document.getElementById(id); if (el) el.textContent = val; };
    setText('navCountInventory', invCnt);
    setText('navCountCustody', custCnt);
    setText('navCountLab', labOpen);

    var mCust = document.getElementById('mobNavCustody');
    if (mCust) { mCust.textContent = custCnt; mCust.classList.toggle('hidden', custCnt === 0); }
    var mLab = document.getElementById('mobNavLab');
    if (mLab) { mLab.textContent = labOpen; mLab.classList.toggle('hidden', labOpen === 0); }
}

function updateSimPillsUI() {
    var ref = VoithDB.getRefDate();
    var br = formatDateBR(ref);
    var sim = VoithDB.isSimulatingDate();

    var heroDate = document.getElementById('heroRefDateDisplay');
    if (heroDate) heroDate.textContent = br;

    var simPill = document.getElementById('simDatePill');
    var simTxt = document.getElementById('simDatePillText');
    var mobSim = document.getElementById('mobSimBtn');
    var mobSimTxt = document.getElementById('mobSimText');

    if (simTxt) simTxt.textContent = 'Ref. ' + br;
    if (mobSimTxt) mobSimTxt.textContent = 'Ref. ' + br;
    if (simPill) {
        simPill.classList.toggle('hidden', !sim);
        simPill.classList.toggle('inline-flex', sim);
    }
    if (mobSim) {
        mobSim.classList.toggle('hidden', !sim);
        mobSim.classList.toggle('inline-flex', sim);
    }
    VoithDB.updateMobStripVisibility();

    var bar = document.getElementById('dynamicSimulatorBar');
    if (bar) {
        var presets = [
            { d: 0, lbl: 'Hoje' },
            { d: 30, lbl: '+30 dias' },
            { d: 60, lbl: '+60 dias' },
            { d: 90, lbl: '+90 dias' },
            { d: 180, lbl: '+6 meses' },
            { d: 365, lbl: '+1 ano' }
        ];
        bar.innerHTML = presets.map(function (p) {
            var active = !VoithDB.state.refDateISO && Number(VoithDB.state.horizonOffsetDays || 0) === p.d;
            var cls = active
                ? 'px-2.5 py-1 rounded-lg bg-[#00A8E8] text-[#001429] font-extrabold text-[11px] cursor-pointer transition shadow'
                : 'px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 font-semibold text-[11px] border border-white/10 cursor-pointer transition';
            return '<button type="button" onclick="setHorizonDays(' + p.d + ')" class="' + cls + '">' + p.lbl + '</button>';
        }).join('');
    }
}

function renderCommandCenter() {
    updateSimPillsUI();
    var st = VoithDB.state;
    var ref = VoithDB.getRefDate();
    var total = st.instruments.length;

    var okCnt = 0, soonCnt = 0, overdueCnt = 0, waitCnt = 0, repCnt = 0, pendCnt = 0;
    var custCnt = 0, mappedCnt = 0;
    var famCounts = { DIMENSIONAL: 0, TORQUE: 0, TEMP_PRESSAO: 0, ELETRICA: 0 };
    var sectorMap = {};
    var localMap = {};
    var respMap = {};
    var monthCounts = Array(12).fill(0);
    var monthKeys = [];
    var monthLabels = [];

    for (var m = 0; m < 12; m++) {
        var md = new Date(ref.getFullYear(), ref.getMonth() + m, 1);
        monthKeys.push(md.getFullYear() + '-' + String(md.getMonth() + 1).padStart(2, '0'));
        var mon = md.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase();
        monthLabels.push(mon + '/' + String(md.getFullYear()).slice(-2));
    }

    st.instruments.forEach(function (it) {
        var eff = getEffectiveStatus(it, ref);
        if (eff === 'EM DIA') okCnt++;
        else if (eff === 'PRÓXIMA DO VENCIMENTO') soonCnt++;
        else if (eff === 'VENCIDA') overdueCnt++;
        else if (eff === 'AGUARDANDO CALIBRAÇÃO') waitCnt++;
        else if (eff === 'EM REPARO') repCnt++;
        else pendCnt++;

        if (String(it.custodyHolder || '').trim()) custCnt++;

        var loc = String(it.local || '').trim();
        if (loc) {
            mappedCnt++;
            if (!localMap[loc]) localMap[loc] = { total: 0, ok: 0, soon: 0, overdue: 0 };
            localMap[loc].total++;
            if (eff === 'VENCIDA') localMap[loc].overdue++;
            else if (eff === 'PRÓXIMA DO VENCIMENTO') localMap[loc].soon++;
            else localMap[loc].ok++;
        }

        var sec = String(it.setor || 'Sem Setor').trim() || 'Sem Setor';
        if (!sectorMap[sec]) sectorMap[sec] = { total: 0, ok: 0, soon: 0, overdue: 0 };
        sectorMap[sec].total++;
        if (eff === 'VENCIDA') sectorMap[sec].overdue++;
        else if (eff === 'PRÓXIMA DO VENCIMENTO') sectorMap[sec].soon++;
        else sectorMap[sec].ok++;

        var resp = String(it.resp || '').trim();
        if (resp) {
            if (!respMap[resp]) respMap[resp] = { total: 0, ok: 0, soon: 0, overdue: 0 };
            respMap[resp].total++;
            if (eff === 'VENCIDA') respMap[resp].overdue++;
            else if (eff === 'PRÓXIMA DO VENCIMENTO') respMap[resp].soon++;
            else respMap[resp].ok++;
        }

        var fam = classifyFamily(it.desc);
        famCounts[fam] = (famCounts[fam] || 0) + 1;

        var dt = parseDateBR(it.proxCal);
        if (dt) {
            var diffM = (dt.getFullYear() - ref.getFullYear()) * 12 + (dt.getMonth() - ref.getMonth());
            if (diffM >= 0 && diffM < 12) monthCounts[diffM]++;
        }
    });

    var inLab = st.history.filter(function (h) { return h.status !== 'CONCLUÍDO'; }).length;

    // Fórmula exata do Cockpit v12 (345 / (345 + 21 + 65) = 80.0%)
    var denom = okCnt + soonCnt + overdueCnt;
    var pctCompliance = denom > 0 ? (okCnt / denom) * 100 : (total > 0 ? (okCnt / total) * 100 : 0);
    var pctStr = pctCompliance.toFixed(1) + '%';

    var setText = function (id, v) { var el = document.getElementById(id); if (el) el.textContent = v; };
    setText('heroCompliancePct', pctStr);
    setText('heroMiniOk', okCnt);
    setText('heroMiniSoon', soonCnt);
    setText('heroMiniOverdue', overdueCnt);

    var tag = document.getElementById('heroGaugeStatusTag');
    if (tag) {
        if (pctCompliance >= 90) {
            tag.textContent = 'EXCELENTE';
            tag.className = 'px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[10px]';
        } else if (pctCompliance >= 75) {
            tag.textContent = 'ATENÇÃO';
            tag.className = 'px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-400/30 text-[10px]';
        } else {
            tag.textContent = 'CRÍTICO';
            tag.className = 'px-2 py-0.5 rounded bg-rose-500/25 text-rose-300 border border-rose-400/35 text-[10px]';
        }
    }

    var arc = document.getElementById('heroGaugeProgress');
    if (arc) {
        var circ = 414.69;
        arc.style.transition = 'stroke-dashoffset 0.7s ease';
        arc.setAttribute('stroke-dashoffset', (circ * (1 - Math.min(1, Math.max(0, pctCompliance / 100)))).toFixed(2));
    }

    var pctOver = total ? (overdueCnt / total) * 100 : 0;
    var pctSoon = total ? (soonCnt / total) * 100 : 0;
    var pctCust = total ? (custCnt / total) * 100 : 0;
    var pctMap = total ? Math.round((mappedCnt / total) * 100) : 0;

    setText('kpiOverdue', overdueCnt);
    setText('kpiOverduePct', pctOver.toFixed(1) + '% da frota');
    var barOver = document.getElementById('kpiOverdueBar'); if (barOver) barOver.style.width = Math.min(100, pctOver) + '%';

    setText('kpiSoon', soonCnt);
    setText('kpiSoonPct', pctSoon.toFixed(1) + '% da frota');
    var barSoon = document.getElementById('kpiSoonBar'); if (barSoon) barSoon.style.width = Math.min(100, pctSoon) + '%';

    setText('kpiCustody', custCnt);
    setText('kpiCustodyPct', pctCust.toFixed(1) + '% da frota');
    var barCust = document.getElementById('kpiCustodyBar'); if (barCust) barCust.style.width = Math.min(100, pctCust) + '%';
    setText('kpiCustodySub', custCnt > 0 ? (custCnt + ' item(ns) retirados') : 'Ver quadro de devoluções');

    setText('kpiMappedPct', pctMap + '%');
    var barMap = document.getElementById('kpiMappedBar'); if (barMap) barMap.style.width = pctMap + '%';
    setText('kpiMappedCount', mappedCnt + ' / ' + total + ' localizados');
    setText('kpiNoLocalCount', Math.max(0, total - mappedCnt) + ' s/ local');

    setText('kpiTotal', total);
    setText('kpiWaiting', waitCnt);
    setText('kpiRepair', repCnt);
    setText('kpiPending', pendCnt);
    setText('kpiInTransit', inLab);

    // ---- Radar 12 Meses ----
    var sum12 = monthCounts.reduce(function (a, b) { return a + b; }, 0);
    var maxM = Math.max(1, Math.max.apply(null, monthCounts));
    var peakIdx = monthCounts.indexOf(Math.max.apply(null, monthCounts));
    var avg12 = sum12 / 12;

    setText('radarTotalBadge', sum12 + ' venc. nos 12m');
    setText('radarPeakBadge', 'Pico: ' + (monthLabels[peakIdx] || '-') + ' (' + (monthCounts[peakIdx] || 0) + ')');

    var avgLine = document.getElementById('radarAvgLine');
    var avgLbl = document.getElementById('radarAvgLabel');
    if (avgLine && avgLbl) {
        if (sum12 > 0) {
            var avgBottomPx = 24 + Math.round((avg12 / maxM) * 116);
            avgLine.style.bottom = avgBottomPx + 'px';
            avgLine.classList.remove('hidden');
            avgLbl.textContent = 'Média: ' + avg12.toFixed(1) + '/mês';
        } else {
            avgLine.classList.add('hidden');
        }
    }

    var radarEl = document.getElementById('radar12Months');
    if (radarEl) {
        radarEl.innerHTML = monthCounts.map(function (cnt, i) {
            var barH = cnt > 0 ? Math.max(10, Math.round((cnt / maxM) * 116)) : 4;
            var grad = 'linear-gradient(180deg, #00A8E8 0%, #004C97 100%)';
            var valColor = 'text-slate-600 dark:text-slate-300';
            if (i === peakIdx && cnt > 0) {
                grad = 'linear-gradient(180deg, #FB923C 0%, #F97316 55%, #EA580C 100%)';
                valColor = 'text-rose-600 dark:text-rose-400';
            } else if (i === 0 && cnt > 0) {
                grad = 'linear-gradient(180deg, #F43F5E 0%, #E11D48 100%)';
                valColor = 'text-rose-600 dark:text-rose-400';
            } else if (i === 1 && cnt > 0) {
                grad = 'linear-gradient(180deg, #FBBF24 0%, #F59E0B 100%)';
                valColor = 'text-amber-600 dark:text-amber-400';
            }
            return '<button type="button" onclick="jumpToInventoryFilter({month:\'' + monthKeys[i] + '\'})" class="flex flex-col items-center justify-end gap-1.5 cursor-pointer group" title="' + cnt + ' vencimentos em ' + monthLabels[i] + '">' +
                '<span class="font-mono text-[11px] font-extrabold ' + valColor + '">' + cnt + '</span>' +
                '<div class="w-full max-w-[46px] flex items-end justify-center" style="height:118px">' +
                    '<div class="w-full rounded-t-md transition-all duration-500 group-hover:opacity-85" style="height:' + barH + 'px;background:' + grad + '"></div>' +
                '</div>' +
                '<span class="font-mono text-[10px] font-bold ' + (i === peakIdx ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400') + '">' + monthLabels[i] + '</span>' +
            '</button>';
        }).join('');
    }

    // ---- Rosca SVG por Família Metrológica ----
    setText('familyDonutTotal', total);
    var famOrder = ['DIMENSIONAL', 'TORQUE', 'TEMP_PRESSAO', 'ELETRICA'];
    var donutSvg = document.getElementById('familyDonutSvg');
    var donutLeg = document.getElementById('familyDonutLegend');
    if (donutSvg && donutLeg) {
        var r = 52;
        var C = 2 * Math.PI * r;
        var offset = 0;
        var circles = '<circle cx="70" cy="70" r="' + r + '" fill="none" stroke="rgba(148,163,184,0.14)" stroke-width="18"/>';
        var legHtml = '';
        famOrder.forEach(function (fk) {
            var meta = familyMeta(fk);
            var cnt = famCounts[fk] || 0;
            var pct = total ? (cnt / total) * 100 : 0;
            var dash = total ? Math.max(0, (cnt / total) * C - 2) : 0;
            if (cnt > 0) {
                circles += '<circle cx="70" cy="70" r="' + r + '" fill="none" stroke="' + meta.color + '" stroke-width="18" stroke-dasharray="' + dash.toFixed(2) + ' ' + C.toFixed(2) + '" stroke-dashoffset="' + (-offset).toFixed(2) + '"/>';
                offset += (cnt / total) * C;
            }
            legHtml += '<button type="button" onclick="jumpToInventoryFilter({family:\'' + fk + '\'})" class="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-[#F7F9FC] dark:bg-[#0D1D34] hover:border-[#004C97] dark:hover:border-[#00A8E8] border border-[#DCE4EE] dark:border-[#172E4E] text-xs cursor-pointer transition">' +
                '<span class="inline-flex items-center gap-2 font-bold"><span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:' + meta.color + '"></span>' + escHtml(meta.label) + '</span>' +
                '<span class="font-mono font-bold">' + cnt + ' <span class="text-slate-400 font-normal">(' + pct.toFixed(1) + '%)</span></span>' +
            '</button>';
        });
        donutSvg.innerHTML = circles;
        donutLeg.innerHTML = legHtml;
    }

    // ---- Matriz de Setores Oficiais ----
    var secEl = document.getElementById('sectorHealthList');
    if (secEl) {
        var sectors = Object.entries(sectorMap).sort(function (a, b) { return b[1].total - a[1].total; });
        secEl.innerHTML = sectors.map(function (entry) {
            var name = entry[0], s = entry[1];
            var wOk = s.total ? (s.ok / s.total) * 100 : 0;
            var wSoon = s.total ? (s.soon / s.total) * 100 : 0;
            var wOver = s.total ? (s.overdue / s.total) * 100 : 0;
            return '<div onclick="jumpToInventoryFilter({setor:' + JSON.stringify(name).replace(/"/g, '&quot;') + '})" class="cursor-pointer group space-y-1.5">' +
                '<div class="flex items-center justify-between gap-2 text-xs">' +
                    '<span class="font-bold truncate group-hover:text-[#004C97] dark:group-hover:text-[#00A8E8] transition">' + escHtml(name) + '</span>' +
                    '<span class="font-mono text-[11px] shrink-0">' +
                        '<strong>' + s.total + '</strong> <span class="text-emerald-600 dark:text-emerald-400">(' + s.ok + ')</span>' +
                        (s.overdue > 0 ? ' • <strong class="text-rose-600 dark:text-rose-400">' + s.overdue + ' venc</strong>' : '') +
                    '</span>' +
                '</div>' +
                '<div class="w-full h-2 rounded-full bg-[#EAF0F6] dark:bg-[#132846] overflow-hidden flex">' +
                    '<div class="h-full bg-emerald-500" style="width:' + wOk.toFixed(1) + '%"></div>' +
                    '<div class="h-full bg-amber-500" style="width:' + wSoon.toFixed(1) + '%"></div>' +
                    '<div class="h-full bg-rose-500" style="width:' + wOver.toFixed(1) + '%"></div>' +
                '</div>' +
            '</div>';
        }).join('') || '<div class="text-xs text-slate-400">Nenhum setor carregado.</div>';
    }

    // ---- Chão de Fábrica (Armários & Bancadas) ----
    var floorEl = document.getElementById('factoryFloorGrid');
    if (floorEl) {
        var locals = Object.entries(localMap).sort(function (a, b) { return b[1].total - a[1].total; });
        floorEl.innerHTML = locals.map(function (entry) {
            var loc = entry[0], s = entry[1];
            var wOk = s.total ? (s.ok / s.total) * 100 : 0;
            var wSoon = s.total ? (s.soon / s.total) * 100 : 0;
            var wOver = s.total ? (s.overdue / s.total) * 100 : 0;
            var locJson = JSON.stringify(loc).replace(/"/g, '&quot;');
            return '<div onclick="jumpToInventoryFilter({local:' + locJson + '})" class="p-3 rounded-xl bg-[#F7F9FC] dark:bg-[#0D1D34] border border-[#DCE4EE] dark:border-[#172E4E] hover:border-[#004C97] dark:hover:border-[#00A8E8] cursor-pointer transition flex flex-col justify-between gap-2">' +
                '<div class="flex items-start justify-between gap-1.5">' +
                    '<div class="min-w-0">' +
                        '<div class="text-xs font-extrabold text-[#004C97] dark:text-[#00A8E8] truncate inline-flex items-center gap-1 max-w-full"><svg class="vp-ico shrink-0" aria-hidden="true"><use href="#i-location-dot"/></svg><span class="truncate">' + escHtml(loc) + '</span></div>' +
                        '<div class="font-mono text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">' + s.total + ' itens • ' + (s.overdue > 0 ? '<strong class="text-rose-600 dark:text-rose-400">' + s.overdue + ' venc.</strong>' : '<strong class="text-emerald-600 dark:text-emerald-400">OK</strong>') + '</div>' +
                    '</div>' +
                    '<button type="button" onclick="event.stopPropagation(); quickPrintLocal(' + locJson + ')" class="w-7 h-7 rounded-lg bg-white dark:bg-[#091527] border border-[#DCE4EE] dark:border-[#23426B] hover:border-[#004C97] text-slate-500 hover:text-[#004C97] flex items-center justify-center cursor-pointer shrink-0" title="Imprimir folha de ' + escHtml(loc) + '"><svg class="vp-ico text-[11px]" aria-hidden="true"><use href="#i-print"/></svg></button>' +
                '</div>' +
                '<div class="w-full h-1.5 rounded-full bg-[#EAF0F6] dark:bg-[#132846] overflow-hidden flex">' +
                    '<div class="h-full bg-emerald-500" style="width:' + wOk.toFixed(1) + '%"></div>' +
                    '<div class="h-full bg-amber-500" style="width:' + wSoon.toFixed(1) + '%"></div>' +
                    '<div class="h-full bg-rose-500" style="width:' + wOver.toFixed(1) + '%"></div>' +
                '</div>' +
            '</div>';
        }).join('') || '<div class="text-xs text-slate-400 col-span-full">Nenhum local mapeado ainda.</div>';
    }

    // ---- Gestão Técnica (Responsáveis com Avatares) ----
    var techEl = document.getElementById('techniciansList');
    if (techEl) {
        var palette = ['#3B82F6', '#E11D48', '#BE185D', '#2563EB', '#6366F1', '#991B1B', '#0D9488'];
        var resps = Object.entries(respMap).sort(function (a, b) { return b[1].total - a[1].total; });
        techEl.innerHTML = resps.map(function (entry, idx) {
            var name = entry[0], s = entry[1];
            var bg = palette[idx % palette.length];
            var nameJson = JSON.stringify(name).replace(/"/g, '&quot;');
            return '<div onclick="jumpToInventoryFilter({resp:' + nameJson + '})" class="p-3 rounded-xl bg-[#F7F9FC] dark:bg-[#0D1D34] border border-[#DCE4EE] dark:border-[#172E4E] hover:border-[#004C97] dark:hover:border-[#00A8E8] cursor-pointer transition flex items-center justify-between gap-2.5">' +
                '<div class="flex items-center gap-3 min-w-0">' +
                    '<div class="w-9 h-9 rounded-xl text-white font-display font-bold text-xs flex items-center justify-center shrink-0 shadow" style="background:' + bg + '">' + escHtml(getInitials(name)) + '</div>' +
                    '<div class="min-w-0">' +
                        '<div class="text-xs font-extrabold truncate">' + escHtml(name) + '</div>' +
                        '<div class="font-mono text-[11px] text-slate-500 dark:text-slate-400">' + s.total + ' itens • <strong class="' + (s.overdue > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400') + '">' + s.overdue + ' venc.</strong>' + (s.soon > 0 ? ' • ' + s.soon + ' próx.' : '') + '</div>' +
                    '</div>' +
                '</div>' +
                '<div class="flex items-center gap-1.5 shrink-0">' +
                    '<button type="button" onclick="event.stopPropagation(); copyTechReport(' + nameJson + ')" class="w-7 h-7 rounded-lg bg-white dark:bg-[#091527] border border-[#DCE4EE] dark:border-[#23426B] hover:border-[#004C97] text-slate-500 hover:text-[#004C97] flex items-center justify-center cursor-pointer" title="Copiar vencidos de ' + escHtml(name) + '"><svg class="vp-ico text-[11px]" aria-hidden="true"><use href="#i-copy"/></svg></button>' +
                    '<button type="button" onclick="event.stopPropagation(); quickPrintTech(' + nameJson + ')" class="px-2.5 py-1 rounded-lg bg-[#001833] hover:bg-[#004C97] text-white font-mono text-[10px] font-extrabold cursor-pointer transition">PDF</button>' +
                '</div>' +
            '</div>';
        }).join('') || '<div class="text-xs text-slate-400">Nenhum responsável atribuído.</div>';
    }
}

function renderInventoryView() {
    var st = VoithDB.state;
    var f = st.filters;
    var ref = VoithDB.getRefDate();
    var allFiltered = getFilteredInventory();

    // Update quick tab styling (fiel ao Cockpit v12 — cada pílula mantém sua cor)
    var qtabStyles = {
        '': {
            on: 'qtab-btn px-3.5 py-1.5 rounded-lg font-bold bg-[#004C97] text-white cursor-pointer inline-flex items-center gap-1.5 shadow',
            off: 'qtab-btn px-3.5 py-1.5 rounded-lg font-semibold bg-white dark:bg-[#091527] border border-[#DCE4EE] dark:border-[#172E4E] text-slate-700 dark:text-slate-200 hover:border-[#004C97] cursor-pointer inline-flex items-center gap-1.5'
        },
        'VENCIDA': {
            on: 'qtab-btn px-3.5 py-1.5 rounded-lg font-bold bg-rose-600 text-white cursor-pointer inline-flex items-center gap-1.5 shadow',
            off: 'qtab-btn px-3.5 py-1.5 rounded-lg font-semibold bg-white dark:bg-[#091527] border border-[#DCE4EE] dark:border-[#172E4E] text-rose-600 dark:text-rose-400 hover:border-rose-400 cursor-pointer inline-flex items-center gap-1.5'
        },
        'PRÓXIMA DO VENCIMENTO': {
            on: 'qtab-btn px-3.5 py-1.5 rounded-lg font-bold bg-amber-500 text-slate-950 cursor-pointer inline-flex items-center gap-1.5 shadow',
            off: 'qtab-btn px-3.5 py-1.5 rounded-lg font-semibold bg-white dark:bg-[#091527] border border-[#DCE4EE] dark:border-[#172E4E] text-amber-600 dark:text-amber-400 hover:border-amber-400 cursor-pointer inline-flex items-center gap-1.5'
        },
        'EM DIA': {
            on: 'qtab-btn px-3.5 py-1.5 rounded-lg font-bold bg-emerald-600 text-white cursor-pointer inline-flex items-center gap-1.5 shadow',
            off: 'qtab-btn px-3.5 py-1.5 rounded-lg font-semibold bg-white dark:bg-[#091527] border border-[#DCE4EE] dark:border-[#172E4E] text-emerald-600 dark:text-emerald-400 hover:border-emerald-400 cursor-pointer inline-flex items-center gap-1.5'
        },
        'AGUARDANDO CALIBRAÇÃO': {
            on: 'qtab-btn px-3.5 py-1.5 rounded-lg font-bold bg-sky-600 text-white cursor-pointer inline-flex items-center gap-1.5 shadow',
            off: 'qtab-btn px-3.5 py-1.5 rounded-lg font-semibold bg-white dark:bg-[#091527] border border-[#DCE4EE] dark:border-[#172E4E] text-sky-600 dark:text-sky-400 hover:border-sky-400 cursor-pointer inline-flex items-center gap-1.5'
        },
        '__CUSTODY__': {
            on: 'qtab-btn px-3.5 py-1.5 rounded-lg font-bold bg-amber-400 text-slate-950 cursor-pointer inline-flex items-center gap-1.5 shadow',
            off: 'qtab-btn px-3.5 py-1.5 rounded-lg font-semibold bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-400/30 text-amber-800 dark:text-amber-300 cursor-pointer inline-flex items-center gap-1.5'
        },
        '__NOLOC__': {
            on: 'qtab-btn px-3.5 py-1.5 rounded-lg font-bold bg-orange-600 text-white cursor-pointer inline-flex items-center gap-1.5 shadow',
            off: 'qtab-btn px-3.5 py-1.5 rounded-lg font-semibold bg-white dark:bg-[#091527] border border-[#DCE4EE] dark:border-[#172E4E] text-orange-600 dark:text-orange-400 hover:border-amber-400 cursor-pointer inline-flex items-center gap-1.5'
        }
    };
    document.querySelectorAll('.qtab-btn').forEach(function (b) {
        var key = b.dataset.qtab || '';
        var on = key === (f.quickTab || '');
        var stObj = qtabStyles[key] || qtabStyles[''];
        b.className = on ? stObj.on : stObj.off;
    });

    // Active filter chips
    var chips = [];
    if (f.status) chips.push({ k: 'status', lbl: 'Status: ' + (f.status === '__URGENT__' ? 'Vencidos + 30d' : f.status) });
    if (f.setor) chips.push({ k: 'setor', lbl: 'Setor: ' + f.setor });
    if (f.local) chips.push({ k: 'local', lbl: 'Local: ' + (f.local === '__NONE__' ? 'Sem Local' : f.local) });
    if (f.resp) chips.push({ k: 'resp', lbl: 'Resp.: ' + f.resp });
    if (f.month) chips.push({ k: 'month', lbl: 'Mês: ' + f.month });
    if (f.family) chips.push({ k: 'family', lbl: 'Família: ' + familyMeta(f.family).label });
    if (f.search) chips.push({ k: 'search', lbl: 'Busca: "' + f.search + '"' });

    var chipsBar = document.getElementById('invChipsBar');
    var chipsList = document.getElementById('invChipsList');
    var advBadge = document.getElementById('advFilterCountBadge');
    if (advBadge) {
        var advCnt = ['status', 'setor', 'local', 'resp', 'month', 'family'].filter(function (k) { return Boolean(f[k]); }).length;
        advBadge.textContent = advCnt;
        advBadge.classList.toggle('hidden', advCnt === 0);
    }
    if (chipsBar && chipsList) {
        chipsBar.classList.toggle('hidden', chips.length === 0);
        chipsList.innerHTML = chips.map(function (c) {
            return '<button type="button" onclick="clearSingleFilter(\'' + c.k + '\')" class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#EAF0F6] dark:bg-[#132846] text-[#004C97] dark:text-[#00A8E8] font-bold text-[11px] cursor-pointer hover:bg-rose-100 hover:text-rose-700 transition">' + escHtml(c.lbl) + ' <span>&times;</span></button>';
        }).join('');
    }

    // Pagination
    var total = allFiltered.length;
    var pages = Math.max(1, Math.ceil(total / st.pageSize));
    if (st.page > pages) st.page = pages;
    if (st.page < 1) st.page = 1;
    var start = (st.page - 1) * st.pageSize;
    var slice = allFiltered.slice(start, start + st.pageSize);

    var infoEl = document.getElementById('invPaginationInfo');
    if (infoEl) infoEl.textContent = 'Mostrando ' + (total ? (start + 1) : 0) + '–' + Math.min(total, start + slice.length) + ' de ' + total + ' instrumento(s)';
    var pgLbl = document.getElementById('invPageLabel');
    if (pgLbl) pgLbl.textContent = st.page + ' / ' + pages;
    var prevBtn = document.getElementById('btnPrevPage'); if (prevBtn) prevBtn.disabled = st.page <= 1;
    var nextBtn = document.getElementById('btnNextPage'); if (nextBtn) nextBtn.disabled = st.page >= pages;

    // View mode (Table vs Cards)
    var cardsWrap = document.getElementById('inventoryCardsWrap');
    var tableWrap = document.getElementById('inventoryTableWrap');
    if (cardsWrap && tableWrap) {
        if (st.invViewMode === 'cards') {
            cardsWrap.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3';
            tableWrap.className = 'hidden vp-table-wrap rounded-lg border border-[#DCE4EE] dark:border-[#172E4E]';
        } else if (st.invViewMode === 'table') {
            cardsWrap.className = 'hidden grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3';
            tableWrap.className = 'block vp-table-wrap rounded-lg border border-[#DCE4EE] dark:border-[#172E4E]';
        } else {
            cardsWrap.className = 'md:hidden grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3';
            tableWrap.className = 'hidden md:block vp-table-wrap rounded-lg border border-[#DCE4EE] dark:border-[#172E4E]';
        }
    }

    var isMobileWidth = window.innerWidth < 768;
    var showCardsNow = st.invViewMode === 'cards' || (st.invViewMode === 'auto' && isMobileWidth);
    var showTableNow = !showCardsNow;

    var padCls = st.compactTable ? 'py-1.5 px-2.5 text-xs' : 'p-3 text-xs';
    var tbody = document.getElementById('inventoryTableBody');
    if (tbody && showTableNow) {
        tbody.innerHTML = slice.map(function (it) {
            var eff = getEffectiveStatus(it, ref);
            var fam = familyMeta(classifyFamily(it.desc));
            var valInfo = getValidityCountdownInfo(it, ref);
            var checked = st.selectedIds.has(it.id);
            var rangeStr = [it.min, it.max].filter(Boolean).join(' ~ ');
            var hasCust = Boolean(String(it.custodyHolder || '').trim());
            var shortSec = shortSectorLabel(it.setor);
            return '<tr class="ck-inv-row border-b border-[#DCE4EE] dark:border-[#172E4E] hover:bg-[#F3F6FA] dark:hover:bg-[#0D1D34]' + (checked ? ' bg-sky-50/70 dark:bg-sky-500/10' : '') + '">' +
                '<td class="editor-only ' + padCls + ' text-center"><input type="checkbox" ' + (checked ? 'checked' : '') + ' onchange="toggleRowSelect(' + it.id + ', this.checked)" class="rounded cursor-pointer"></td>' +
                '<td class="' + padCls + '"><button type="button" onclick="openInspectorModal(' + it.id + ')" class="font-mono font-extrabold text-[#004C97] dark:text-[#00A8E8] hover:underline cursor-pointer text-left">' + escHtml(it.code) + '</button><div class="text-[10px] text-slate-400 truncate">' + escHtml(it.resp || '-') + '</div></td>' +
                '<td class="' + padCls + '"><div class="flex items-start gap-2"><span class="w-6 h-6 rounded-md flex items-center justify-center shrink-0 text-[11px]" style="background:' + fam.color + '18;color:' + fam.color + '"><svg class="vp-ico" aria-hidden="true"><use href="#' + fam.icon + '"/></svg></span><div class="min-w-0"><button type="button" onclick="openInspectorModal(' + it.id + ')" class="font-bold text-left hover:text-[#004C97] dark:hover:text-[#00A8E8] cursor-pointer">' + escHtml(it.desc) + '</button>' + (rangeStr ? '<div class="font-mono text-[10px] text-slate-400">Faixa: ' + escHtml(rangeStr) + '</div>' : '') + '</div></div></td>' +
                '<td class="' + padCls + '"><span class="ck-chip-sec" title="' + escHtml(it.setor || '-') + '">' + escHtml(shortSec) + '</span></td>' +
                '<td class="' + padCls + '" ondblclick="inlineEditCell(' + it.id + ', \'local\', this)" title="2 cliques para editar local">' +
                    (it.local
                        ? '<span class="ck-chip-loc"><svg class="vp-ico text-[#004C97] dark:text-[#00A8E8] text-[11px]" aria-hidden="true"><use href="#i-location-dot"/></svg><span class="truncate">' + escHtml(it.local) + '</span></span>'
                        : '<span class="text-orange-500 text-[11px] font-semibold">Sem local</span>') +
                    (hasCust ? '<div class="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 text-[10px] font-bold"><svg class="vp-ico text-[9px]" aria-hidden="true"><use href="#i-handshake"/></svg>' + escHtml(it.custodyHolder) + '</div>' : '') +
                '</td>' +
                '<td class="' + padCls + '" ondblclick="inlineEditCell(' + it.id + ', \'proxCal\', this)" title="2 cliques para editar validade">' +
                    '<div class="font-mono font-bold text-xs leading-tight">' + escHtml(valInfo.dateBr) + '</div>' +
                    '<div class="text-[10px] font-semibold mt-0.5 ' + valInfo.textCls + '">' + escHtml(valInfo.label) + '</div>' +
                    '<div class="ck-val-track"><div class="ck-val-fill" style="width:' + valInfo.pct + '%;background:' + valInfo.color + '"></div></div>' +
                '</td>' +
                '<td class="' + padCls + '">' + getStatusBadgeHtml(eff) + '</td>' +
                '<td class="' + padCls + ' text-[11px] text-slate-500 max-w-[140px] truncate" ondblclick="inlineEditCell(' + it.id + ', \'obs\', this)" title="' + escHtml(it.obs || '2 cliques para editar') + '">' + escHtml(it.obs || '-') + '</td>' +
                '<td class="' + padCls + ' text-center whitespace-nowrap">' +
                    '<button type="button" onclick="openInspectorModal(' + it.id + ')" class="w-7 h-7 rounded-lg bg-[#F3F6FA] dark:bg-[#132846] hover:bg-[#004C97] hover:text-white text-slate-600 dark:text-slate-300 inline-flex items-center justify-center cursor-pointer mr-1" title="Abrir Ficha Técnica"><svg class="vp-ico text-[11px]" aria-hidden="true"><use href="#i-eye"/></svg></button>' +
                    '<button type="button" onclick="openCustodyForItem(' + it.id + ')" class="editor-only-inline w-7 h-7 rounded-lg ' + (hasCust ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-600 hover:text-white' : 'bg-amber-100 text-amber-800 hover:bg-amber-400') + ' inline-flex items-center justify-center cursor-pointer" title="' + (hasCust ? 'Devolver Cautela' : 'Registrar Cautela') + '"><svg class="vp-ico text-[11px]" aria-hidden="true"><use href="#i-handshake"/></svg></button>' +
                '</td>' +
            '</tr>';
        }).join('') || '<tr><td colspan="9" class="p-8 text-center text-slate-400 text-xs">Nenhum instrumento encontrado com os filtros atuais.</td></tr>';
    }

    if (cardsWrap && showCardsNow) {
        cardsWrap.innerHTML = slice.map(function (it) {
            var eff = getEffectiveStatus(it, ref);
            var hasCust = Boolean(String(it.custodyHolder || '').trim());
            return '<div onclick="openInspectorModal(' + it.id + ')" class="p-3.5 rounded-xl bg-[#F7F9FC] dark:bg-[#0D1D34] border border-[#DCE4EE] dark:border-[#172E4E] hover:border-[#004C97] cursor-pointer space-y-2">' +
                '<div class="flex items-center justify-between gap-2"><span class="font-mono font-extrabold text-sm text-[#004C97] dark:text-[#00A8E8]">' + escHtml(it.code) + '</span>' + getStatusBadgeHtml(eff) + '</div>' +
                '<div class="font-bold text-xs">' + escHtml(it.desc) + '</div>' +
                '<div class="text-[11px] text-slate-500 flex flex-wrap gap-x-3 gap-y-1"><span>Setor: <strong>' + escHtml(it.setor || '-') + '</strong></span><span>Local: <strong>' + escHtml(it.local || 'Sem local') + '</strong></span><span>Val.: <strong class="font-mono">' + escHtml(getValidityCountdownInfo(it, ref).dateBr) + '</strong></span></div>' +
                (hasCust ? '<div class="text-[11px] font-bold text-amber-700 dark:text-amber-300">Em posse: ' + escHtml(it.custodyHolder) + '</div>' : '') +
            '</div>';
        }).join('') || '<div class="col-span-full p-6 text-center text-xs text-slate-400">Nenhum instrumento encontrado.</div>';
    }

    updateBatchDockUI();
}

function updateBatchDockUI() {
    var st = VoithDB.state;
    var dock = document.getElementById('batchDock');
    var lbl = document.getElementById('batchCountLabel');
    if (lbl) lbl.textContent = st.selectedIds.size;
    if (dock) {
        if (st.selectedIds.size > 0 && VoithDB.isEditor()) dock.classList.remove('hidden');
        else dock.classList.add('hidden');
    }
}

function renderCustodyBoard() {
    var st = VoithDB.state;
    var ref = VoithDB.getRefDate();
    var q = normStr(document.getElementById('custodySearchInput') ? document.getElementById('custodySearchInput').value : '');
    var inCustody = st.instruments.filter(function (it) { return Boolean(String(it.custodyHolder || '').trim()); });

    var lateCnt = 0;
    var holdersSet = new Set();
    inCustody.forEach(function (it) {
        holdersSet.add(String(it.custodyHolder).trim());
        var dt = parseDateBR(it.custodyDate);
        if (dt && daysBetween(dt, ref) > 7) lateCnt++;
    });

    var setText = function (id, v) { var el = document.getElementById(id); if (el) el.textContent = v; };
    setText('custStatTotal', inCustody.length);
    setText('custStatLate', lateCnt);
    setText('custStatHolders', holdersSet.size);

    // Style mode toggle buttons
    ['holder', 'flat', 'receipts'].forEach(function (m) {
        var btnId = m === 'holder' ? 'btnCustGroupHolder' : (m === 'flat' ? 'btnCustGroupFlat' : 'btnCustGroupReceipts');
        var b = document.getElementById(btnId);
        if (!b) return;
        b.className = st.custodyGroupMode === m
            ? 'px-3 py-1.5 rounded-md bg-[#004C97] text-white cursor-pointer'
            : 'px-3 py-1.5 rounded-md text-slate-600 dark:text-slate-300 cursor-pointer';
    });

    var cont = document.getElementById('custodyBoardContainer');
    if (!cont) return;

    if (st.custodyGroupMode === 'receipts') {
        var recs = (st.receipts || []).filter(function (r) {
            if (!q) return true;
            return normStr([r.receiptCode, r.instrumentCode, r.holderName, r.eventType, r.returnTo].join(' ')).indexOf(q) !== -1;
        });
        if (!recs.length) {
            cont.innerHTML = '<div class="vp-card rounded-xl p-8 text-center text-xs text-slate-400">' + (VoithDB.isEditor() ? 'Nenhum comprovante SHA-256 registrado ainda.' : 'Entre no Modo Editor para visualizar o histórico de comprovantes SHA-256.') + '</div>';
            return;
        }
        cont.innerHTML = '<div class="vp-card rounded-xl overflow-hidden"><div class="overflow-x-auto"><table class="w-full text-left border-collapse text-xs"><thead class="bg-[#F7F9FC] dark:bg-[#0D1D34] text-[10px] font-bold uppercase text-slate-500"><tr><th class="p-3">Protocolo</th><th class="p-3">Tipo</th><th class="p-3">Instrumento</th><th class="p-3">Portador / Matr.</th><th class="p-3">Destino / Motivo</th><th class="p-3">Selo SHA-256</th></tr></thead><tbody class="divide-y divide-[#DCE4EE] dark:divide-[#172E4E]">' +
            recs.map(function (r) {
                return '<tr><td class="p-3 font-mono font-bold text-[#004C97] dark:text-[#00A8E8]">' + escHtml(r.receiptCode) + '</td>' +
                    '<td class="p-3"><span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold ' + (r.eventType === 'DEVOLUCAO' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800') + '">' + escHtml(r.eventType) + '</span></td>' +
                    '<td class="p-3"><strong>' + escHtml(r.instrumentCode) + '</strong> ' + escHtml(r.instrumentDesc || '') + '</td>' +
                    '<td class="p-3 font-semibold">' + escHtml(r.holderName) + (r.holderBadge ? ' <span class="font-mono text-slate-400">(' + escHtml(r.holderBadge) + ')</span>' : '') + '</td>' +
                    '<td class="p-3 text-slate-500">' + escHtml(r.returnTo || '-') + (r.overrideWarning ? '<div class="text-rose-600 font-bold text-[10px]">⚠ ' + escHtml(r.overrideWarning) + '</div>' : '') + '</td>' +
                    '<td class="p-3 font-mono text-[10px] text-slate-500">' + escHtml(String(r.integrityHash || '').slice(0, 16)) + '</td></tr>';
            }).join('') +
        '</tbody></table></div></div>';
        return;
    }

    var filtered = inCustody.filter(function (it) {
        if (!q) return true;
        return normStr([it.code, it.desc, it.custodyHolder, it.custodyReturnTo, it.custodyReason, it.local].join(' ')).indexOf(q) !== -1;
    });

    if (!filtered.length) {
        cont.innerHTML = '<div class="vp-card rounded-xl p-10 text-center space-y-2"><div class="text-sm font-bold text-slate-600 dark:text-slate-300">Nenhum instrumento em cautela no momento</div><div class="text-xs text-slate-400">Todos os instrumentos encontram-se nos seus armários/bancadas de origem.</div></div>';
        return;
    }

    if (st.custodyGroupMode === 'flat') {
        cont.innerHTML = '<div class="vp-card rounded-xl overflow-hidden"><div class="overflow-x-auto"><table class="w-full text-left border-collapse text-xs"><thead class="bg-[#F7F9FC] dark:bg-[#0D1D34] text-[10px] font-bold uppercase text-slate-500"><tr><th class="p-3">Código</th><th class="p-3">Instrumento</th><th class="p-3">Em posse de</th><th class="p-3">Retirada</th><th class="p-3">Devolver para</th><th class="p-3">Motivo</th><th class="editor-only p-3 text-center">Ação</th></tr></thead><tbody class="divide-y divide-[#DCE4EE] dark:divide-[#172E4E]">' +
            filtered.map(function (it) {
                return '<tr><td class="p-3 font-mono font-bold text-[#004C97] dark:text-[#00A8E8]">' + escHtml(it.code) + '</td><td class="p-3 font-semibold">' + escHtml(it.desc) + '</td><td class="p-3 font-bold">' + escHtml(it.custodyHolder) + '</td><td class="p-3 font-mono">' + escHtml(toBRDateStr(it.custodyDate) || '-') + '</td><td class="p-3">' + escHtml(it.custodyReturnTo || it.local || '-') + '</td><td class="p-3 text-slate-500">' + escHtml(it.custodyReason || '-') + '</td><td class="editor-only p-3 text-center"><button type="button" onclick="openCustodyForItem(' + it.id + ')" class="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-bold cursor-pointer">Devolver</button></td></tr>';
            }).join('') +
        '</tbody></table></div></div>';
        return;
    }

    // Grouped by Holder
    var groups = {};
    filtered.forEach(function (it) {
        var h = String(it.custodyHolder).trim();
        if (!groups[h]) groups[h] = [];
        groups[h].push(it);
    });
    cont.innerHTML = Object.entries(groups).map(function (entry) {
        var holder = entry[0], items = entry[1];
        return '<div class="vp-card rounded-xl p-4 space-y-3">' +
            '<div class="flex items-center justify-between gap-2 pb-2.5 border-b border-[#DCE4EE] dark:border-[#172E4E]">' +
                '<div class="flex items-center gap-2.5"><div class="w-8 h-8 rounded-lg bg-amber-400 text-slate-950 font-display font-bold text-xs flex items-center justify-center">' + escHtml(getInitials(holder)) + '</div><div><div class="font-bold text-sm">' + escHtml(holder) + '</div><div class="text-[11px] text-slate-500">' + items.length + ' instrumento(s) em posse</div></div></div>' +
            '</div>' +
            '<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">' +
                items.map(function (it) {
                    return '<div class="p-3 rounded-lg bg-[#F7F9FC] dark:bg-[#0D1D34] border border-[#DCE4EE] dark:border-[#172E4E] flex flex-col justify-between gap-2 text-xs">' +
                        '<div><div class="flex items-center justify-between gap-2"><strong class="font-mono text-[#004C97] dark:text-[#00A8E8]">' + escHtml(it.code) + '</strong><span class="font-mono text-[10px] text-slate-400">' + escHtml(toBRDateStr(it.custodyDate) || '-') + '</span></div><div class="font-bold mt-0.5">' + escHtml(it.desc) + '</div><div class="text-[11px] text-slate-500 mt-1">Devolver p/: <strong>' + escHtml(it.custodyReturnTo || it.local || '-') + '</strong></div>' + (it.custodyReason ? '<div class="text-[11px] text-slate-400">' + escHtml(it.custodyReason) + '</div>' : '') + '</div>' +
                        '<div class="editor-only flex justify-end pt-1"><button type="button" onclick="openCustodyForItem(' + it.id + ')" class="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold cursor-pointer">Registrar Devolução</button></div>' +
                    '</div>';
                }).join('') +
            '</div>' +
        '</div>';
    }).join('');
}

function renderLabTables() {
    var st = VoithDB.state;
    var ref = VoithDB.getRefDate();
    var q = normStr(document.getElementById('labSearchInput') ? document.getElementById('labSearchInput').value : '');

    var allH = st.history || [];
    var transitCnt = 0, lateCnt = 0, doneCnt = 0;
    allH.forEach(function (h) {
        if (h.status === 'CONCLUÍDO') doneCnt++;
        else {
            transitCnt++;
            var dp = parseDateBR(h.datePrev);
            if (dp && daysBetween(ref, dp) < 0) lateCnt++;
        }
    });

    var setText = function (id, v) { var el = document.getElementById(id); if (el) el.textContent = v; };
    setText('labExtCount', allH.length);
    setText('labLostCount', st.lost.length);
    setText('lsAll', allH.length);
    setText('lsTransit', transitCnt);
    setText('lsLate', lateCnt);
    setText('lsDone', doneCnt);

    document.querySelectorAll('.ls-btn').forEach(function (b) {
        var active = (b.dataset.ls || '') === (st.labStatusFilter || '');
        if (active) b.classList.add('ring-2', 'ring-[#00A8E8]');
        else b.classList.remove('ring-2', 'ring-[#00A8E8]');
    });

    var filteredH = allH.filter(function (h) {
        var isDone = h.status === 'CONCLUÍDO';
        var dp = parseDateBR(h.datePrev);
        var isLate = !isDone && dp && daysBetween(ref, dp) < 0;
        if (st.labStatusFilter === 'CONCLUÍDO' && !isDone) return false;
        if (st.labStatusFilter === 'EM TRÂNSITO' && isDone) return false;
        if (st.labStatusFilter === 'ATRASADO' && !isLate) return false;
        if (q && normStr([h.code, h.desc, h.lab, h.obs, h.setor].join(' ')).indexOf(q) === -1) return false;
        return true;
    });

    var tbody = document.getElementById('labHistoryTbody');
    var cards = document.getElementById('labHistoryCards');
    if (tbody) {
        tbody.innerHTML = filteredH.map(function (h) {
            var isDone = h.status === 'CONCLUÍDO';
            var dp = parseDateBR(h.datePrev);
            var isLate = !isDone && dp && daysBetween(ref, dp) < 0;
            var badge = isDone
                ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-700">CONCLUÍDO</span>'
                : (isLate ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-100 text-rose-700">ATRASADO</span>' : '<span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800">EM TRÂNSITO</span>');
            var chk = st.selectedLabIds.has(h.id);
            return '<tr class="text-xs">' +
                '<td class="editor-only p-3 text-center">' + (!isDone ? '<input type="checkbox" ' + (chk ? 'checked' : '') + ' onchange="toggleLabRowSelect(' + h.id + ', this.checked)" class="rounded cursor-pointer">' : '') + '</td>' +
                '<td class="p-3 font-mono"><div>' + escHtml(toBRDateStr(h.dateEnvio) || '-') + '</div><div class="text-[10px] text-slate-400">Prev: ' + escHtml(toBRDateStr(h.datePrev) || '-') + '</div></td>' +
                '<td class="p-3 font-mono"><div>' + escHtml(toBRDateStr(h.dateRetorno) || '-') + '</div>' + (h.newCalDate ? '<div class="text-[10px] text-emerald-600 font-bold">Val: ' + escHtml(toBRDateStr(h.newCalDate)) + '</div>' : '') + '</td>' +
                '<td class="p-3"><strong class="font-mono text-[#004C97] dark:text-[#00A8E8]">' + escHtml(h.code) + '</strong><div class="text-[11px] text-slate-500">' + escHtml(h.desc) + '</div></td>' +
                '<td class="p-3 font-semibold">' + escHtml(h.lab || '-') + '</td>' +
                '<td class="p-3 text-slate-500">' + escHtml(h.obs || '-') + '</td>' +
                '<td class="p-3 text-center">' + badge + '</td>' +
                '<td class="editor-only p-3 text-center whitespace-nowrap">' +
                    (!isDone ? '<button type="button" onclick="openReturnLabModal(' + h.id + ')" class="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold cursor-pointer mr-1">Retorno</button>' : '') +
                    '<button type="button" onclick="deleteHistoryRow(' + h.id + ')" class="px-2 py-1 rounded bg-rose-100 text-rose-700 text-[11px] font-bold cursor-pointer">&times;</button>' +
                '</td>' +
            '</tr>';
        }).join('') || '<tr><td colspan="8" class="p-8 text-center text-xs text-slate-400">Nenhum envio externo registrado.</td></tr>';
    }
    if (cards) {
        cards.innerHTML = filteredH.map(function (h) {
            var isDone = h.status === 'CONCLUÍDO';
            return '<div class="p-3.5 rounded-xl bg-[#F7F9FC] dark:bg-[#0D1D34] border border-[#DCE4EE] dark:border-[#172E4E] text-xs space-y-1.5">' +
                '<div class="flex justify-between"><strong class="font-mono text-[#004C97] dark:text-[#00A8E8]">' + escHtml(h.code) + '</strong><span class="font-bold">' + escHtml(h.status) + '</span></div>' +
                '<div class="font-semibold">' + escHtml(h.desc) + '</div>' +
                '<div class="text-[11px] text-slate-500">Lab: ' + escHtml(h.lab || '-') + ' • Envio: ' + escHtml(toBRDateStr(h.dateEnvio) || '-') + '</div>' +
                (!isDone ? '<div class="editor-only pt-1"><button type="button" onclick="openReturnLabModal(' + h.id + ')" class="px-3 py-1 rounded bg-emerald-600 text-white font-bold cursor-pointer">Confirmar Retorno</button></div>' : '') +
            '</div>';
        }).join('') || '<div class="p-6 text-center text-xs text-slate-400">Nenhum envio externo.</div>';
    }

    var labBar = document.getElementById('labBatchBar');
    var labCnt = document.getElementById('labSelCount');
    if (labCnt) labCnt.textContent = st.selectedLabIds.size;
    if (labBar) labBar.classList.toggle('hidden', st.selectedLabIds.size === 0 || !VoithDB.isEditor());

    // Lost table
    var lostTbody = document.getElementById('lostTbody');
    var lostCards = document.getElementById('lostCards');
    if (lostTbody) {
        lostTbody.innerHTML = st.lost.map(function (l) {
            return '<tr class="text-xs"><td class="p-3 font-mono font-bold text-rose-600 dark:text-rose-400">' + escHtml(l.code) + '</td><td class="p-3 font-semibold">' + escHtml(l.desc) + '</td><td class="p-3">' + escHtml(l.setor || '-') + (l.cc ? ' • ' + escHtml(l.cc) : '') + '</td><td class="p-3 font-mono">' + escHtml(toBRDateStr(l.lastCal) || '-') + '</td><td class="p-3 text-slate-500">' + escHtml(l.obs || '-') + '</td><td class="editor-only p-3 text-center whitespace-nowrap"><button type="button" onclick="restoreLostItem(' + l.id + ')" class="px-2.5 py-1 rounded bg-[#004C97] text-white font-bold cursor-pointer mr-1">Restaurar</button><button type="button" onclick="deleteLostItem(' + l.id + ')" class="px-2 py-1 rounded bg-rose-100 text-rose-700 font-bold cursor-pointer">&times;</button></td></tr>';
        }).join('') || '<tr><td colspan="6" class="p-8 text-center text-xs text-slate-400">Nenhum instrumento perdido ou desativado.</td></tr>';
    }
    if (lostCards) {
        lostCards.innerHTML = st.lost.map(function (l) {
            return '<div class="p-3.5 rounded-xl bg-[#F7F9FC] dark:bg-[#0D1D34] border border-[#DCE4EE] dark:border-[#172E4E] text-xs space-y-1"><div class="font-mono font-bold text-rose-600">' + escHtml(l.code) + '</div><div class="font-semibold">' + escHtml(l.desc) + '</div><div class="text-slate-500">' + escHtml(l.obs || '-') + '</div><div class="editor-only pt-1"><button type="button" onclick="restoreLostItem(' + l.id + ')" class="px-3 py-1 rounded bg-[#004C97] text-white font-bold cursor-pointer">Restaurar</button></div></div>';
        }).join('') || '<div class="p-6 text-center text-xs text-slate-400">Nenhum item perdido.</div>';
    }
}

function renderAllViews() {
    populateGlobalDatalistsAndFilters();
    updateSidebarCounts();
    var v = VoithDB.state.view || 'command';
    if (v === 'command') renderCommandCenter();
    else if (v === 'inventory') renderInventoryView();
    else if (v === 'custody') renderCustodyBoard();
    else if (v === 'lab') renderLabTables();
    VoithDB.updateUndoUI();
    VoithDB.updateOfflineBanner();
}