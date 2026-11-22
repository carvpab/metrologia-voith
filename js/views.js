// ============================================================================
// VOITH TURBO — PRECISION METROLOGY OS v11 • VIEWS & WORKSPACES
// ============================================================================
// ---- Simulador Dinâmico de Horizonte ----
        function renderDynamicSimulator() {
            const today = getTodayISO();
            const isToday = currentRefISO === today;
            document.getElementById('heroRefDateDisplay').textContent = fmtBR(currentRefISO);
            document.getElementById('heroCustomDatePicker').value = currentRefISO;

            const pill = document.getElementById('simDatePill');
            if (pill) {
                pill.classList.toggle('hidden', isToday);
                pill.classList.toggle('sm:inline-flex', !isToday);
                document.getElementById('simDatePillText').textContent = `Ref. ${fmtBR(currentRefISO)}`;
            }
            const mobSim = document.getElementById('mobSimBtn');
            if (mobSim) {
                mobSim.classList.toggle('hidden', isToday);
                mobSim.classList.toggle('inline-flex', !isToday);
                document.getElementById('mobSimText').textContent = `Ref. ${fmtBR(currentRefISO)}`;
            }
            syncMobileStatusStrip();

            const presets = [
                { label: 'Hoje', iso: today },
                { label: '+30 dias', iso: addDaysISO(today, 30) },
                { label: '+60 dias', iso: addDaysISO(today, 60) },
                { label: '+90 dias', iso: addDaysISO(today, 90) },
                { label: '+6 meses', iso: addMonthsISO(today, 6) },
                { label: '+1 ano', iso: addMonthsISO(today, 12) }
            ];

            document.getElementById('dynamicSimulatorBar').innerHTML = presets.map(p => {
                const active = p.iso === currentRefISO;
                return `<button type="button" onclick="setRefDateISO('${p.iso}')" class="px-2.5 sm:px-3 py-2 sm:py-1.5 rounded-lg text-[11px] font-bold text-center transition cursor-pointer ${
                    active
                        ? 'bg-[#00A8E8] text-[#001429] shadow'
                        : 'bg-white/10 hover:bg-white/20 text-slate-200 border border-white/10'
                }">${p.label}</button>`;
            }).join('');
        }
        function setRefDateISO(iso) {
            currentRefISO = iso || getTodayISO();
            renderAll(false);
        }
        function resetRefDate() { setRefDateISO(getTodayISO()); }

        function updateNavCountersFast() {
            let inCustody = 0;
            for (let i = 0; i < instrumentsData.length; i++) {
                const h = instrumentsData[i].custodyHolder;
                if (h && h.trim()) inCustody++;
            }
            let inTransit = 0;
            for (let i = 0; i < calibrationHistory.length; i++) {
                if (calibrationHistory[i].status !== 'CONCLUÍDO') inTransit++;
            }
            document.getElementById('navCountInventory').textContent = instrumentsData.length;
            document.getElementById('navCountCustody').textContent = inCustody;
            document.getElementById('navCountLab').textContent = inTransit;
            const mc = document.getElementById('mobNavCustody');
            if (mc) { mc.textContent = inCustody; mc.classList.toggle('hidden', inCustody === 0); }
            const ml = document.getElementById('mobNavLab');
            if (ml) { ml.textContent = inTransit; ml.classList.toggle('hidden', inTransit === 0); }
        }

        // ---- Renderização Global Otimizada (Renderiza apenas a aba visível; demais sob demanda) ----
        function renderAll(dataChanged = true) {
            metaCacheTodayISO = getTodayISO();
            metaCacheRefISO = currentRefISO || metaCacheTodayISO;
            dirtyViews.command = true;
            dirtyViews.inventory = true;
            dirtyViews.custody = true;
            dirtyViews.lab = true;
            if (dataChanged) dirtyViews.dropdowns = true;

            if (dirtyViews.dropdowns) {
                populateFilterDropdowns();
                dirtyViews.dropdowns = false;
            }
            updateNavCountersFast();

            if (currentView === 'command') {
                renderDynamicSimulator();
                renderCommandCenter();
                dirtyViews.command = false;
                scheduleInventoryPrewarm();
            } else if (currentView === 'inventory') {
                renderDynamicSimulator();
                applyInventoryFilters();
                dirtyViews.inventory = false;
            } else if (currentView === 'custody') {
                renderDynamicSimulator();
                renderCustodyBoard();
                dirtyViews.custody = false;
            } else if (currentView === 'lab') {
                renderDynamicSimulator();
                renderLabTables();
                dirtyViews.lab = false;
            }
        }

        function populateFilterDropdowns() {
            const sectors = [...new Set([...(controlledLists.sectors || []), ...instrumentsData.map(i => i.setor).filter(Boolean)])].sort();
            const locals = [...new Set([...(controlledLists.locals || []), ...instrumentsData.map(i => i.local).filter(Boolean)])].sort();
            const resps = [...new Set(instrumentsData.map(i => i.resp).filter(Boolean))].sort();
            const months = [...new Set(instrumentsData.map(i => i.proxCal && /^\d{4}-\d{2}/.test(i.proxCal) ? i.proxCal.slice(0,7) : '').filter(Boolean))].sort();
            const mNames = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

            const fill = (id, items, def, extra = '') => {
                const el = document.getElementById(id); if (!el) return;
                const prev = el.value;
                el.innerHTML = `<option value="">${def}</option>${extra}${items.map(x => {
                    const val = typeof x === 'string' ? x : x.v;
                    const lbl = typeof x === 'string' ? x : x.l;
                    return `<option value="${escapeHtml(val)}">${escapeHtml(lbl)}</option>`;
                }).join('')}`;
                if (prev) el.value = prev;
            };

            fill('fSetor', sectors, 'Todos os Setores');
            fill('fLocal', locals, 'Todas as Localizações', '<option value="__NONE__">⚠️ Sem Local Definido</option>');
            fill('fResp', resps, 'Todos os Responsáveis');
            const ymPopCounts = {};
            for (let i = 0; i < instrumentsData.length; i++) {
                const pc = instrumentsData[i].proxCal;
                if (pc && pc.length >= 7) {
                    const ym = pc.slice(0, 7);
                    ymPopCounts[ym] = (ymPopCounts[ym] || 0) + 1;
                }
            }
            const monthOptions = months.map(ym => {
                const [y,m] = ym.split('-');
                return { v:ym, l:`${mNames[Number(m)-1]}/${y} (${ymPopCounts[ym] || 0})` };
            });
            fill('fMonth', months.map(ym => { const [y,m] = ym.split('-'); return { v:ym, l:`${mNames[Number(m)-1]}/${y}` }; }), 'Todos os Meses');
            fill('printMonthSel', monthOptions, 'Todos os Meses');
            fill('printSetorSel', sectors, 'Todos os Setores');
            fill('printRespSel', resps, 'Todos os Responsáveis');

            const people = new Set(resps);
            instrumentsData.forEach(i => { if (i.custodyHolder?.trim()) people.add(i.custodyHolder.trim()); });
            if (isEditor() && currentAuth.displayName) people.add(currentAuth.displayName);

            const dests = new Set([...locals, ...resps]);
            instrumentsData.forEach(i => { if (i.custodyReturnTo?.trim()) dests.add(i.custodyReturnTo.trim()); });

            document.getElementById('dlSetores').innerHTML = sectors.map(s => `<option value="${escapeHtml(s)}">`).join('');
            document.getElementById('dlLocais').innerHTML = locals.map(l => `<option value="${escapeHtml(l)}">`).join('');
            document.getElementById('dlPessoas').innerHTML = [...people].sort().map(p => `<option value="${escapeHtml(p)}">`).join('');
            document.getElementById('dlDestinos').innerHTML = [...dests].sort().map(d => `<option value="${escapeHtml(d)}">`).join('');
        }

        function renderCommandCenter() {
            const c = { 'EM DIA':0, 'VENCIDA':0, 'PRÓXIMA DO VENCIMENTO':0, 'PENDÊNCIA DE DATA':0, 'EM REPARO':0, 'AGUARDANDO CALIBRAÇÃO':0 };
            let noLocal = 0, inCustody = 0, lateCustody = 0;
            const today = getTodayISO();

            instrumentsData.forEach(it => {
                const st = getInstMeta(it).st;
                if (c[st] !== undefined) c[st]++;
                if (!it.local || !it.local.trim()) noLocal++;
                if (it.custodyHolder && it.custodyHolder.trim()) {
                    inCustody++;
                    const dOut = daysBetween(it.custodyDate, today);
                    if (dOut !== null && dOut >= 7) lateCustody++;
                }
            });

            const total = instrumentsData.length;
            const mapped = total - noLocal;
            const mappedPct = total > 0 ? Math.round((mapped / total) * 100) : 0;
            const classif = c['EM DIA'] + c['VENCIDA'] + c['PRÓXIMA DO VENCIMENTO'];
            const conf = classif > 0 ? (c['EM DIA'] / classif) * 100 : 0;
            const inTransit = calibrationHistory.filter(h => h.status !== 'CONCLUÍDO').length;

            // Nav counters
            document.getElementById('navCountInventory').textContent = total;
            document.getElementById('navCountCustody').textContent = inCustody;
            document.getElementById('navCountLab').textContent = inTransit;
            const mc = document.getElementById('mobNavCustody');
            if (mc) { mc.textContent = inCustody; mc.classList.toggle('hidden', inCustody === 0); }
            const ml = document.getElementById('mobNavLab');
            if (ml) { ml.textContent = inTransit; ml.classList.toggle('hidden', inTransit === 0); }

            // SVG Gauge Arc
            const circ = 414.69;
            const offset = circ - (circ * Math.min(100, Math.max(0, conf)) / 100);
            document.getElementById('heroGaugeProgress').style.strokeDashoffset = offset.toFixed(2);
            document.getElementById('heroCompliancePct').textContent = `${conf.toFixed(1)}%`;
            document.getElementById('heroMiniOk').textContent = c['EM DIA'];
            document.getElementById('heroMiniSoon').textContent = c['PRÓXIMA DO VENCIMENTO'];
            document.getElementById('heroMiniOverdue').textContent = c['VENCIDA'];
            const tag = document.getElementById('heroGaugeStatusTag');
            if (conf >= 85) { tag.textContent = 'ÓTIMO'; tag.className = 'px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[10px]'; }
            else if (conf >= 70) { tag.textContent = 'ATENÇÃO'; tag.className = 'px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-400/30 text-[10px]'; }
            else { tag.textContent = 'CRÍTICO'; tag.className = 'px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-400/30 text-[10px]'; }

            // KPIs + Mini Barras Proporcionais
            const overPct = total > 0 ? ((c['VENCIDA'] / total) * 100) : 0;
            const soonPct = total > 0 ? ((c['PRÓXIMA DO VENCIMENTO'] / total) * 100) : 0;
            const custPct = total > 0 ? ((inCustody / total) * 100) : 0;

            document.getElementById('kpiOverdue').textContent = c['VENCIDA'];
            document.getElementById('kpiOverduePct').textContent = `${overPct.toFixed(1)}% da frota`;
            document.getElementById('kpiOverdueBar').style.width = `${Math.min(100, Math.max(c['VENCIDA'] > 0 ? 4 : 0, overPct)).toFixed(1)}%`;

            document.getElementById('kpiSoon').textContent = c['PRÓXIMA DO VENCIMENTO'];
            document.getElementById('kpiSoonPct').textContent = `${soonPct.toFixed(1)}% da frota`;
            document.getElementById('kpiSoonBar').style.width = `${Math.min(100, Math.max(c['PRÓXIMA DO VENCIMENTO'] > 0 ? 4 : 0, soonPct)).toFixed(1)}%`;

            document.getElementById('kpiCustody').textContent = inCustody;
            document.getElementById('kpiCustodyPct').textContent = `${custPct.toFixed(1)}% da frota`;
            document.getElementById('kpiCustodyBar').style.width = `${Math.min(100, Math.max(inCustody > 0 ? 5 : 0, custPct)).toFixed(1)}%`;
            document.getElementById('kpiCustodySub').textContent = lateCustody > 0 ? `${lateCustody} retirado(s) há +7 dias` : 'Ver quadro de devoluções';
            const kcm = document.getElementById('kpiCustodySubMob'); if (kcm) kcm.textContent = lateCustody > 0 ? `${lateCustody} há +7d` : 'Em posse';

            document.getElementById('kpiMappedPct').textContent = `${mappedPct}%`;
            document.getElementById('kpiMappedCount').textContent = `${mapped} / ${total} localizados`;
            document.getElementById('kpiNoLocalCount').textContent = `${noLocal} s/ local`;
            document.getElementById('kpiMappedBar').style.width = `${mappedPct}%`;

            document.getElementById('kpiTotal').textContent = total;
            document.getElementById('kpiWaiting').textContent = c['AGUARDANDO CALIBRAÇÃO'];
            document.getElementById('kpiRepair').textContent = c['EM REPARO'];
            document.getElementById('kpiPending').textContent = c['PENDÊNCIA DE DATA'];
            document.getElementById('kpiInTransit').textContent = inTransit;

            // 12-Month Calibration Radar (O(N) single pass)
            const ymCounts = {};
            for (let i = 0; i < instrumentsData.length; i++) {
                const pc = instrumentsData[i].proxCal;
                if (pc && pc.length >= 7) {
                    const ym = pc.slice(0, 7);
                    ymCounts[ym] = (ymCounts[ym] || 0) + 1;
                }
            }
            const [ry, rm] = (currentRefISO || today).split('-').map(Number);
            const mLbl = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
            const buckets = [];
            for (let i = 0; i < 12; i++) {
                const dt = new Date(ry, (rm - 1) + i, 1);
                const ym = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;
                buckets.push({ ym, label: `${mLbl[dt.getMonth()]}/${String(dt.getFullYear()).slice(2)}`, cnt: ymCounts[ym] || 0, idx: i });
            }
            const maxCnt = Math.max(1, ...buckets.map(b => b.cnt));
            const sum12 = buckets.reduce((acc, b) => acc + b.cnt, 0);
            const avg12 = sum12 / 12;
            const peakBucket = buckets.reduce((best, b) => (b.cnt > best.cnt ? b : best), buckets[0]);
            document.getElementById('radarTotalBadge').textContent = `${sum12} venc. nos 12m`;
            document.getElementById('radarPeakBadge').textContent = peakBucket.cnt > 0 ? `Pico: ${peakBucket.label} (${peakBucket.cnt})` : 'Sem picos';
            const avgLineEl = document.getElementById('radarAvgLine');
            if (avgLineEl) {
                if (sum12 > 0) {
                    const avgPct = Math.min(92, Math.max(12, Math.round((avg12 / maxCnt) * 100)));
                    // Bar area sits between bottom ~2.1rem and height 5.5rem (88px)
                    avgLineEl.style.bottom = `calc(2.15rem + ${(avgPct * 0.88).toFixed(1)}px)`;
                    avgLineEl.classList.remove('hidden');
                    document.getElementById('radarAvgLabel').textContent = `Média: ${avg12.toFixed(1)}/mês`;
                } else {
                    avgLineEl.classList.add('hidden');
                }
            }

            document.getElementById('radar12Months').innerHTML = buckets.map(b => {
                const pctH = b.cnt === 0 ? 6 : Math.max(12, Math.round((b.cnt / maxCnt) * 100));
                const isPeak = peakBucket.cnt > 0 && b.ym === peakBucket.ym;
                const share = sum12 > 0 ? ((b.cnt / sum12) * 100).toFixed(1) : '0.0';
                const barCls = b.cnt === 0 ? 'bg-slate-200 dark:bg-slate-800'
                    : b.idx === 0 ? 'bg-rose-500'
                    : isPeak ? 'bg-gradient-to-t from-rose-600 to-amber-400'
                    : b.idx === 1 ? 'bg-amber-500'
                    : 'bg-gradient-to-t from-[#004C97] to-[#00A8E8]';
                return `
                    <button type="button" onclick="jumpToInventoryFilter({month:'${b.ym}'})" title="${b.label}: ${b.cnt} instrumento(s) (${share}% da demanda anual)" class="group flex flex-col items-center gap-1.5 p-2 rounded-xl hover:bg-[#F3F6FA] dark:hover:bg-[#0D1D34] transition cursor-pointer">
                        <span class="font-mono text-xs font-extrabold ${isPeak || (b.idx===0 && b.cnt>0) ? 'text-rose-600 dark:text-rose-400' : ''}">${b.cnt}</span>
                        <div class="w-full flex items-end justify-center px-1" style="height:88px">
                            <div class="w-full rounded-t-md ${barCls} group-hover:opacity-85 transition-all" style="height:${pctH}%"></div>
                        </div>
                        <span class="text-[10px] font-bold uppercase ${isPeak ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'}">${b.label}</span>
                    </button>`;
            }).join('');

            // Family SVG Donut Chart (Zero-library pure SVG, click-to-filter)
            const famMeta = [
                { key:'DIMENSIONAL', label:'Dimensional', color:'#004C97', darkColor:'#00A8E8', icon:'ruler-combined' },
                { key:'TORQUE', label:'Torque / Força', color:'#F59E0B', darkColor:'#FBBF24', icon:'wrench' },
                { key:'TEMP_PRESSAO', label:'Temp. / Pressão', color:'#E11D48', darkColor:'#FB7185', icon:'temperature-half' },
                { key:'ELETRICA', label:'Elétrica', color:'#10B981', darkColor:'#34D399', icon:'bolt' }
            ];
            const famCounts = { DIMENSIONAL:0, TORQUE:0, TEMP_PRESSAO:0, ELETRICA:0 };
            for (let i = 0; i < instrumentsData.length; i++) {
                const fk = getInstMeta(instrumentsData[i]).fam.key;
                if (famCounts[fk] !== undefined) famCounts[fk]++;
            }
            const donutTotal = Math.max(1, total);
            const rDonut = 52, cDonut = 2 * Math.PI * rDonut;
            let accOffset = 0;
            const segs = [];
            famMeta.forEach(fm => {
                const cnt = famCounts[fm.key] || 0;
                if (cnt <= 0) return;
                const frac = cnt / donutTotal;
                const segLen = Math.max(2, frac * cDonut - 2.2);
                segs.push(`<circle cx="70" cy="70" r="${rDonut}" fill="none" stroke="${fm.color}" stroke-width="16" stroke-dasharray="${segLen.toFixed(2)} ${(cDonut - segLen).toFixed(2)}" stroke-dashoffset="${(-accOffset).toFixed(2)}" class="cursor-pointer" onclick="jumpToInventoryFilter({family:'${fm.key}'})"><title>${fm.label}: ${cnt} (${(frac*100).toFixed(1)}%)</title></circle>`);
                accOffset += frac * cDonut;
            });
            document.getElementById('familyDonutSvg').innerHTML = `<circle cx="70" cy="70" r="${rDonut}" fill="none" stroke="rgba(148,163,184,0.16)" stroke-width="16"/>${segs.join('')}`;
            document.getElementById('familyDonutTotal').textContent = total;
            document.getElementById('familyDonutLegend').innerHTML = famMeta.map(fm => {
                const cnt = famCounts[fm.key] || 0;
                const pct = total > 0 ? ((cnt / total) * 100).toFixed(1) : '0.0';
                return `<button type="button" onclick="jumpToInventoryFilter({family:'${fm.key}'})" class="w-full px-2.5 py-1.5 rounded-lg bg-[#F7F9FC] dark:bg-[#0D1D34] hover:bg-[#EAF0F6] dark:hover:bg-[#132846] border border-[#DCE4EE] dark:border-[#172E4E] flex items-center justify-between gap-2 text-xs cursor-pointer transition">
                    <span class="flex items-center gap-2 min-w-0">
                        <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${fm.color}"></span>
                        <span class="font-bold truncate">${fm.label}</span>
                    </span>
                    <span class="font-mono text-[11px] shrink-0"><strong>${cnt}</strong> <span class="text-slate-400">(${pct}%)</span></span>
                </button>`;
            }).join('');

            // Factory Floor Map (Armários & Bancadas)
            const cabMap = {};
            instrumentsData.forEach(it => {
                const loc = (it.local || '').trim();
                if (!loc) return;
                if (!cabMap[loc]) cabMap[loc] = { total:0, ok:0, soon:0, over:0 };
                cabMap[loc].total++;
                const st = getInstMeta(it).st;
                if (st === 'EM DIA') cabMap[loc].ok++;
                else if (st === 'PRÓXIMA DO VENCIMENTO') cabMap[loc].soon++;
                else if (st === 'VENCIDA') cabMap[loc].over++;
            });
            const cabs = Object.entries(cabMap).sort((a,b) => b[1].total - a[1].total);
            document.getElementById('factoryFloorGrid').innerHTML = cabs.map(([loc, s]) => {
                const okP = Math.round((s.ok/s.total)*100);
                const soonP = Math.round((s.soon/s.total)*100);
                const overP = Math.round((s.over/s.total)*100);
                const sl = escapeHtml(loc).replace(/'/g, "\\'");
                return `
                    <div class="vp-card vp-card-hover rounded-xl p-3.5 flex flex-col justify-between gap-2.5">
                        <div class="flex items-start justify-between gap-2">
                            <button type="button" onclick="jumpToInventoryFilter({local:'${sl}'})" class="text-left min-w-0 cursor-pointer group">
                                <div class="text-xs font-extrabold text-[#004C97] dark:text-[#00A8E8] group-hover:underline truncate"><svg class="vp-ico mr-1" aria-hidden="true"><use href="#i-location-dot"/></svg>${escapeHtml(loc)}</div>
                                <div class="font-mono text-[11px] text-slate-500 mt-0.5">${s.total} itens ${s.over > 0 ? `• <span class="text-rose-600 dark:text-rose-400 font-bold">${s.over} venc.</span>` : '• <span class="text-emerald-600 font-semibold">OK</span>'}</div>
                            </button>
                            <button type="button" onclick="quickPrintCabinet('${sl}')" class="w-7 h-7 rounded-lg bg-[#F3F6FA] dark:bg-[#132846] hover:bg-[#004C97] hover:text-white text-slate-500 dark:text-slate-300 flex items-center justify-center cursor-pointer transition shrink-0" title="Imprimir Folha Porta de Armário (${escapeHtml(loc)})">
                                <svg class="vp-ico text-[11px]" aria-hidden="true"><use href="#i-print"/></svg>
                            </button>
                        </div>
                        <div class="w-full h-1.5 rounded-full bg-[#EAF0F6] dark:bg-[#132846] overflow-hidden flex">
                            <div class="bg-emerald-500 h-full" style="width:${okP}%"></div>
                            <div class="bg-amber-500 h-full" style="width:${soonP}%"></div>
                            <div class="bg-rose-500 h-full" style="width:${overP}%"></div>
                        </div>
                    </div>`;
            }).join('') || '<div class="col-span-full text-xs text-slate-400">Nenhum local mapeado ainda.</div>';

            // Sector Health Matrix
            const secMap = {};
            instrumentsData.forEach(it => {
                const s = it.setor || 'Outros';
                if (!secMap[s]) secMap[s] = { total:0, ok:0, soon:0, over:0 };
                secMap[s].total++;
                const st = getInstMeta(it).st;
                if (st === 'EM DIA') secMap[s].ok++;
                else if (st === 'PRÓXIMA DO VENCIMENTO') secMap[s].soon++;
                else if (st === 'VENCIDA') secMap[s].over++;
            });
            document.getElementById('sectorHealthList').innerHTML = Object.entries(secMap)
                .sort((a,b) => b[1].total - a[1].total)
                .map(([sec, s]) => {
                    const okP = (s.ok/s.total)*100, soonP = (s.soon/s.total)*100, overP = (s.over/s.total)*100;
                    const ss = escapeHtml(sec).replace(/'/g, "\\'");
                    return `
                        <button type="button" onclick="jumpToInventoryFilter({setor:'${ss}'})" class="w-full text-left group space-y-1 cursor-pointer">
                            <div class="flex items-center justify-between text-xs">
                                <span class="font-bold group-hover:text-[#004C97] dark:group-hover:text-[#00A8E8] truncate pr-2">${escapeHtml(sec.replace('Voith Turbo ', ''))}</span>
                                <span class="font-mono text-[11px] text-slate-500 shrink-0"><strong>${s.total}</strong> <span class="text-emerald-600">(${s.ok})</span> ${s.over?`<span class="text-rose-600 font-bold">• ${s.over} venc</span>`:''}</span>
                            </div>
                            <div class="w-full h-2.5 rounded-full bg-[#EAF0F6] dark:bg-[#132846] overflow-hidden flex">
                                <div class="bg-emerald-500 h-full" style="width:${okP}%"></div>
                                <div class="bg-amber-500 h-full" style="width:${soonP}%"></div>
                                <div class="bg-rose-500 h-full" style="width:${overP}%"></div>
                            </div>
                        </button>`;
                }).join('');

            // Technicians List
            const techMap = {};
            instrumentsData.forEach(it => {
                const r = (it.resp || '').trim(); if (!r) return;
                if (!techMap[r]) techMap[r] = { total:0, over:0, soon:0 };
                techMap[r].total++;
                const st = getInstMeta(it).st;
                if (st === 'VENCIDA') techMap[r].over++;
                else if (st === 'PRÓXIMA DO VENCIMENTO') techMap[r].soon++;
            });
            document.getElementById('techniciansList').innerHTML = Object.entries(techMap)
                .sort((a,b) => b[1].total - a[1].total)
                .map(([name, s]) => {
                    const sn = escapeHtml(name).replace(/'/g, "\\'");
                    const av = getAvatarMeta(name);
                    return `
                        <div class="p-3 rounded-xl bg-[#F7F9FC] dark:bg-[#0D1D34] border border-[#DCE4EE] dark:border-[#172E4E] flex items-center justify-between gap-2.5">
                            <button type="button" onclick="jumpToInventoryFilter({resp:'${sn}'})" class="flex items-center gap-2.5 text-left min-w-0 cursor-pointer group">
                                <span class="ck-avatar" style="background:${av.bg}">${escapeHtml(av.ini)}</span>
                                <span class="min-w-0">
                                    <span class="block text-xs font-bold group-hover:text-[#004C97] dark:group-hover:text-[#00A8E8] truncate">${escapeHtml(name)}</span>
                                    <span class="block font-mono text-[11px] text-slate-500">${s.total} itens • <span class="text-rose-600 dark:text-rose-400 font-bold">${s.over} venc.</span>${s.soon?` • ${s.soon} próx.`:''}</span>
                                </span>
                            </button>
                            <div class="flex items-center gap-1 shrink-0">
                                <button type="button" onclick="copySummaryReport('TECH','${sn}')" class="px-2 py-1 rounded bg-white dark:bg-[#091527] border border-[#DCE4EE] dark:border-[#23426B] hover:border-[#004C97] text-[10px] font-bold cursor-pointer" title="Copiar cobrança p/ Teams/WhatsApp"><svg class="vp-ico" aria-hidden="true"><use href="#i-copy"/></svg></button>
                                <button type="button" onclick="quickPrintResp('${sn}')" class="editor-only px-2 py-1 rounded bg-[#004C97] text-white text-[10px] font-bold cursor-pointer" title="Gerar PDF ISO">PDF</button>
                            </div>
                        </div>`;
                }).join('');
        }

        // ---- Inventário: Filtros, Debounce, Chips, Tabela, Cartões, Edição Inline ----
        const QUICK_STATUS_KEYS = new Set(['', 'VENCIDA', 'PRÓXIMA DO VENCIMENTO', 'EM DIA', 'AGUARDANDO CALIBRAÇÃO']);

        function jumpToInventoryFilter(opts = {}) {
            navigateTo('inventory', true);
            if (dirtyViews.dropdowns) {
                populateFilterDropdowns();
                dirtyViews.dropdowns = false;
            }
            resetInventoryFilters(false);
            if (opts.status) {
                const fs = document.getElementById('fStatus');
                if (fs) fs.value = opts.status;
                quickStatusTab = QUICK_STATUS_KEYS.has(opts.status) ? opts.status : '';
                updateQuickStatusTabsUI();
            }
            if (opts.local) document.getElementById('fLocal').value = opts.local;
            if (opts.setor) document.getElementById('fSetor').value = opts.setor;
            if (opts.resp) document.getElementById('fResp').value = opts.resp;
            if (opts.month) document.getElementById('fMonth').value = opts.month;
            if (opts.family) document.getElementById('fFamily').value = opts.family;
            dirtyViews.inventory = false;
            applyInventoryFilters();
        }

        function setQuickStatusTab(val) {
            quickStatusTab = val;
            const fs = document.getElementById('fStatus');
            if (fs && !val.startsWith('__')) {
                fs.value = val;
            }
            updateQuickStatusTabsUI();
            applyInventoryFilters();
        }

        function onAdvStatusChange() {
            const val = document.getElementById('fStatus')?.value || '';
            if (!quickStatusTab.startsWith('__')) {
                quickStatusTab = QUICK_STATUS_KEYS.has(val) ? val : '';
                updateQuickStatusTabsUI();
            }
            applyInventoryFilters();
        }

        function updateQuickStatusTabsUI() {
            const fsVal = document.getElementById('fStatus')?.value || '';
            document.querySelectorAll('.qtab-btn').forEach(btn => {
                const v = btn.getAttribute('data-qtab') || '';
                const on = v === ''
                    ? (quickStatusTab === '' && fsVal === '')
                    : (v === quickStatusTab);
                if (on) {
                    btn.className = 'qtab-btn px-3.5 py-1.5 rounded-lg font-extrabold bg-[#004C97] text-white shadow cursor-pointer transition inline-flex items-center gap-1.5';
                } else if (v === '__CUSTODY__') {
                    btn.className = 'qtab-btn px-3.5 py-1.5 rounded-lg font-semibold bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-400/30 text-amber-800 dark:text-amber-300 cursor-pointer transition inline-flex items-center gap-1.5';
                } else {
                    btn.className = 'qtab-btn px-3.5 py-1.5 rounded-lg font-semibold bg-white dark:bg-[#091527] border border-[#DCE4EE] dark:border-[#172E4E] text-slate-600 dark:text-slate-300 hover:border-[#004C97] cursor-pointer transition inline-flex items-center gap-1.5';
                }
            });
        }

        function toggleAdvFilters() {
            const p = document.getElementById('invAdvFiltersPanel');
            const c = document.getElementById('advFilterChev');
            const open = p.classList.contains('hidden');
            p.classList.toggle('hidden', !open);
            if (c) c.style.transform = open ? 'rotate(180deg)' : 'rotate(0deg)';
        }

        function debouncedFilterInventory() {
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(applyInventoryFilters, 55);
        }

        function resetInventoryFilters(shouldApply = true) {
            document.getElementById('invSearchInput').value = '';
            ['fStatus','fSetor','fLocal','fResp','fMonth','fFamily'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
            quickStatusTab = '';
            invSortField = ''; invSortDir = 'asc';
            updateQuickStatusTabsUI();
            updateSortIcons();
            if (shouldApply) applyInventoryFilters();
        }

        function removeSingleInvFilter(k) {
            if (k === 'q') document.getElementById('invSearchInput').value = '';
            else if (k === 'tab') {
                quickStatusTab = '';
                updateQuickStatusTabsUI();
            } else if (k === 'fStatus') {
                const fs = document.getElementById('fStatus');
                if (fs) fs.value = '';
                if (!quickStatusTab.startsWith('__')) quickStatusTab = '';
                updateQuickStatusTabsUI();
            } else {
                const el = document.getElementById(k);
                if (el) el.value = '';
            }
            applyInventoryFilters();
        }

        function sortInventoryBy(field) {
            if (invSortField === field) {
                if (invSortDir === 'asc') invSortDir = 'desc';
                else { invSortField = ''; invSortDir = 'asc'; }
            } else { invSortField = field; invSortDir = 'asc'; }
            updateSortIcons();
            applyInventoryFilters();
        }
        function updateSortIcons() {
            ['code','desc','setor','local','proxCal','status'].forEach(f => {
                const i = document.getElementById(`si-${f}`); if (!i) return;
                if (invSortField === f) setSvgIcon(i, invSortDir === 'asc' ? 'sort-up' : 'sort-down', 'text-[#004C97] dark:text-[#00A8E8] text-xs');
                else setSvgIcon(i, 'sort', 'opacity-40 text-[10px]');
            });
        }

        function applyInventoryFilters() {
            const qRaw = (document.getElementById('invSearchInput')?.value || '').trim();
            const q = normSearch(qRaw);
            const qComp = normCompact(qRaw);
            kbRowIdx = -1;
            const statusSel = document.getElementById('fStatus')?.value || '';
            const setor = document.getElementById('fSetor')?.value || '';
            const local = document.getElementById('fLocal')?.value || '';
            const resp = document.getElementById('fResp')?.value || '';
            const month = document.getElementById('fMonth')?.value || '';
            const fam = document.getElementById('fFamily')?.value || '';

            filteredInv = instrumentsData.filter(it => {
                const m = getInstMeta(it);
                const st = m.st;
                if (quickStatusTab === '__CUSTODY__' && !(it.custodyHolder && it.custodyHolder.trim())) return false;
                else if (quickStatusTab === '__NOLOC__' && it.local && it.local.trim()) return false;
                else if (quickStatusTab && !quickStatusTab.startsWith('__') && !statusSel && st !== quickStatusTab) return false;

                if (statusSel) {
                    if (statusSel === '__URGENT__') {
                        if (st !== 'VENCIDA' && st !== 'PRÓXIMA DO VENCIMENTO') return false;
                    } else if (st !== statusSel) {
                        return false;
                    }
                }

                if (setor && !it.setor.includes(setor)) return false;
                if (local === '__NONE__' && it.local && it.local.trim()) return false;
                if (local && local !== '__NONE__' && it.local !== local) return false;
                if (resp && it.resp !== resp) return false;
                if (month && !(it.proxCal && it.proxCal.startsWith(month))) return false;
                if (fam && m.fam.key !== fam) return false;
                if (q && !matchesQuery(m.hay, m.hayCompact, q, qComp)) return false;
                return true;
            });

            if (invSortField) {
                const dir = invSortDir === 'asc' ? 1 : -1;
                const prio = { 'VENCIDA':1, 'PRÓXIMA DO VENCIMENTO':2, 'PENDÊNCIA DE DATA':3, 'AGUARDANDO CALIBRAÇÃO':4, 'EM REPARO':5, 'EM DIA':6 };
                filteredInv.sort((a,b) => {
                    if (invSortField === 'proxCal') return (a.proxCal || (dir>0?'9999':'0000')).localeCompare(b.proxCal || (dir>0?'9999':'0000')) * dir;
                    if (invSortField === 'status') return ((prio[calcStatus(a.proxCal,a.status)]||9) - (prio[calcStatus(b.proxCal,b.status)]||9)) * dir;
                    return String(a[invSortField]||'').localeCompare(String(b[invSortField]||''), 'pt-BR', { numeric:true }) * dir;
                });
            }

            // Active Filter Chips & Badge
            const advCount = [statusSel, setor, local, resp, month, fam].filter(Boolean).length;
            const advBadge = document.getElementById('advFilterCountBadge');
            if (advBadge) { advBadge.textContent = advCount; advBadge.classList.toggle('hidden', advCount === 0); }

            const chips = [];
            if (qRaw) chips.push({ k:'q', l:`Busca: "${qRaw}"` });
            if (quickStatusTab === '__CUSTODY__') chips.push({ k:'tab', l:'Em Posse' });
            else if (quickStatusTab === '__NOLOC__') chips.push({ k:'tab', l:'Sem Local' });
            if (statusSel) chips.push({ k:'fStatus', l:`Status: ${statusSel==='__URGENT__'?'Vencidos + Próx. 30d':statusSel}` });
            if (setor) chips.push({ k:'fSetor', l:`Setor: ${setor.replace('Voith Turbo ','')}` });
            if (local) chips.push({ k:'fLocal', l:`Local: ${local==='__NONE__'?'Sem Local':local}` });
            if (resp) chips.push({ k:'fResp', l:`Resp.: ${resp}` });
            if (month) chips.push({ k:'fMonth', l:`Mês: ${month}` });
            if (fam) chips.push({ k:'fFamily', l:`Família: ${fam}` });

            const cBar = document.getElementById('invChipsBar');
            const cList = document.getElementById('invChipsList');
            if (chips.length > 0) {
                cBar.classList.remove('hidden');
                cList.innerHTML = chips.map(ch => `<button type="button" onclick="removeSingleInvFilter('${ch.k}')" class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#EAF0F6] dark:bg-[#132846] text-[#004C97] dark:text-[#00A8E8] font-bold text-[11px] cursor-pointer hover:opacity-80">${escapeHtml(ch.l)} <svg class="vp-ico text-[9px]" aria-hidden="true"><use href="#i-xmark"/></svg></button>`).join('');
            } else {
                cBar.classList.add('hidden');
                cList.innerHTML = '';
            }

            invPage = 1;
            renderInventoryView();
        }

        function isCardsViewActive() {
            if (invViewMode === 'cards') return true;
            if (invViewMode === 'table') return false;
            return window.innerWidth < 768;
        }

        function buildTableRowHtml(it, canEdit, todayISO) {
            const m = getInstMeta(it);
            const sel = selectedIds.has(it.id);
            const cKey = (canEdit ? '1' : '0') + (sel ? '1' : '0') + todayISO;
            const cached = m.rowCache[cKey];
            if (cached) return cached;

            const st = m.st, ss = m.ss, fam = m.fam, cd = m.cd;
            const hasRange = (it.min && it.min !== '-') || (it.max && it.max !== '-');
            const hasCust = Boolean(it.custodyHolder && it.custodyHolder.trim());
            const retDest = it.custodyReturnTo || it.local || it.resp || '';
            const dOut = hasCust ? daysBetween(it.custodyDate, todayISO) : null;
            const ptr = canEdit ? ' vr-ptr' : '';

            const out = `<tr data-id="${it.id}" class="vr ${ss.va}${sel ? ' vr-sel' : ''}">
                <td class="editor-only vr-td-c"><input type="checkbox" ${sel?'checked':''} onchange="toggleSelectRow(${it.id},this.checked,this)" class="vr-chk"></td>
                <td class="vr-td">
                    <button type="button" onclick="openInspectorModal(${it.id})" class="vr-code vr-code-btn" title="Abrir ficha técnica de ${escapeHtml(it.code)}">${escapeHtml(it.code)}</button>
                    ${it.resp ? `<div class="vr-resp">${escapeHtml(it.resp)}</div>` : ''}
                </td>
                <td class="vr-td">
                    <div class="vr-flex">
                        <span class="vr-fam ${fam.vcls}" title="${fam.label}">${svgIcon(fam.icon)}</span>
                        <div>
                            <div class="vr-desc">${escapeHtml(it.desc)}</div>
                            ${hasRange ? `<div class="vr-rng">${escapeHtml(it.min||'0')} – ${escapeHtml(it.max||'-')}</div>` : ''}
                        </div>
                    </div>
                </td>
                <td class="vr-td"><span class="vr-sec">${escapeHtml(String(it.setor||'').replace('Voith Turbo ',''))}</span></td>
                <td class="vr-td${ptr}" ondblclick="inlineEditCell(this,${it.id},'local')">
                    ${it.local ? `<span class="vr-loc"><svg class="vp-ico" aria-hidden="true"><use href="#i-location-dot"/></svg>${escapeHtml(it.local)}</span>` : '<span class="vr-noloc">Sem local</span>'}
                    ${hasCust ? `<div class="vr-cust">
                        <div class="vr-cust-h"><svg class="vp-ico" aria-hidden="true"><use href="#i-handshake"/></svg> ${escapeHtml(it.custodyHolder)}${dOut!==null && dOut>=7 ? ` <span class="vr-late">(${dOut}d!)</span>` : ''}</div>
                        ${retDest ? `<div class="vr-cust-r">↩ ${escapeHtml(retDest)}</div>` : ''}
                    </div>` : ''}
                </td>
                <td class="vr-td${ptr}" ondblclick="inlineEditCell(this,${it.id},'proxCal')">
                    <div class="vr-dt">${fmtBR(it.proxCal)}</div>
                    ${cd.text ? `<div class="vr-cd ${cd.vcls}">${cd.text}</div>` : ''}
                    ${cd.barPct !== undefined ? `<div class="vr-vbar"><div class="vr-vbar-fill ${cd.barCls}" style="width:${cd.barPct}%"></div></div>` : ''}
                </td>
                <td class="vr-td"><span class="vr-pill ${ss.vp}"><span class="vr-dot"></span>${st}</span></td>
                <td class="vr-td vr-obs${ptr}" ondblclick="inlineEditCell(this,${it.id},'obs')" title="${escapeHtml(it.obs||'')}">${escapeHtml(it.obs||'-')}</td>
                <td class="vr-td-c">
                    <div class="vr-acts">
                        <button type="button" onclick="openCustodyModal([${it.id}])" class="editor-only vr-btn ${hasCust?'vr-btn-c-on':'vr-btn-c'}" title="${hasCust?'Gerenciar / Devolver Cautela':'Registrar Cautela'}"><svg class="vp-ico" aria-hidden="true"><use href="#i-handshake"/></svg></button>
                        <button type="button" onclick="openInspectorModal(${it.id})" class="vr-btn vr-btn-e" title="${canEdit?'Editar':'Ver ficha'}">${svgIcon(canEdit ? "sliders" : "eye")}</button>
                    </div>
                </td>
            </tr>`;
            m.rowCache[cKey] = out;
            return out;
        }

        function buildCardHtml(it, canEdit) {
            const m = getInstMeta(it);
            const sel = selectedIds.has(it.id);
            const cKey = (canEdit ? '1' : '0') + (sel ? '1' : '0');
            const cached = m.cardCache[cKey];
            if (cached) return cached;

            const st = m.st, ss = m.ss, fam = m.fam, cd = m.cd;
            const hasCust = Boolean(it.custodyHolder && it.custodyHolder.trim());
            const retDest = it.custodyReturnTo || it.local || it.resp || '';
            const out = `<div data-id="${it.id}" class="vc ${ss.va}">
                <div class="vc-top">
                    <div class="vc-id">
                        <input type="checkbox" ${selectedIds.has(it.id)?'checked':''} onchange="toggleSelectRow(${it.id},this.checked,this)" class="editor-only vr-chk">
                        <span class="vc-fam ${fam.vcls}">${svgIcon(fam.icon)}</span>
                        <div class="vc-meta">
                            <button type="button" onclick="openInspectorModal(${it.id})" class="vc-code vr-code-btn" title="Abrir ficha técnica de ${escapeHtml(it.code)}">${escapeHtml(it.code)}</button>
                            <div class="vc-resp">${escapeHtml(it.resp || 'Sem responsável')}</div>
                        </div>
                    </div>
                    <span class="vr-pill ${ss.vp}"><span class="vr-dot"></span>${st}</span>
                </div>
                <div class="vc-desc">${escapeHtml(it.desc)}</div>
                ${hasCust ? `<div class="vc-cust">
                    <div class="vr-cust-h"><svg class="vp-ico" aria-hidden="true"><use href="#i-handshake"/></svg> Em posse: ${escapeHtml(it.custodyHolder)}</div>
                    ${retDest ? `<div class="vr-cust-r">Devolver p/: <strong>${escapeHtml(retDest)}</strong></div>` : ''}
                </div>` : ''}
                <div class="vc-grid">
                    <div><span class="vc-lbl">Local</span><strong>${escapeHtml(it.local || 'Sem local')}</strong></div>
                    <div><span class="vc-lbl">Validade</span><span class="vr-dt">${fmtBR(it.proxCal)}</span>${cd.text ? `<div class="vr-cd ${cd.vcls}">${cd.text}</div>` : ''}${cd.barPct !== undefined ? `<div class="vr-vbar"><div class="vr-vbar-fill ${cd.barCls}" style="width:${cd.barPct}%"></div></div>` : ''}</div>
                </div>
                <div class="vc-acts">
                    <button type="button" onclick="openCustodyModal([${it.id}])" class="editor-only vc-b ${hasCust?'vc-b-c-on':'vc-b-c'}"><svg class="vp-ico" aria-hidden="true"><use href="#i-handshake"/></svg> ${hasCust?'Devolver':'Posse'}</button>
                    <button type="button" onclick="openInspectorModal(${it.id})" class="vc-b vc-b-e">${canEdit?'Editar':'Detalhes'}</button>
                </div>
            </div>`;
            m.cardCache[cKey] = out;
            return out;
        }

        function buildLoadMoreSentinel(cardsMode, remaining) {
            if (cardsMode) {
                return `<div id="invLoadMoreSentinel" style="grid-column:1/-1;text-align:center;padding:0.75rem"><button type="button" onclick="appendMoreInventoryRows()" class="vr-more-btn">Carregar mais (${remaining} restantes)</button></div>`;
            }
            return `<tr id="invLoadMoreSentinel"><td colspan="9" class="vr-more-td"><button type="button" onclick="appendMoreInventoryRows()" class="vr-more-btn">Role para baixo ou clique para carregar mais (${remaining} restantes)</button></td></tr>`;
        }

        function appendMoreInventoryRows() {
            if (invRenderedCount >= invPageItemsCache.length) return;
            const cardsMode = isCardsViewActive();
            const targetEl = document.getElementById(cardsMode ? 'inventoryCardsWrap' : 'inventoryTableBody');
            if (!targetEl) return;
            const sentinel = document.getElementById('invLoadMoreSentinel');
            if (sentinel) sentinel.remove();

            const canEdit = isEditor();
            const todayISO = metaCacheTodayISO || getTodayISO();
            const nextEnd = Math.min(invRenderedCount + INV_NEXT_BATCH, invPageItemsCache.length);
            const slice = invPageItemsCache.slice(invRenderedCount, nextEnd);
            const htmlChunk = cardsMode
                ? slice.map(it => buildCardHtml(it, canEdit)).join('')
                : slice.map(it => buildTableRowHtml(it, canEdit, todayISO)).join('');
            invRenderedCount = nextEnd;

            const remaining = invPageItemsCache.length - invRenderedCount;
            targetEl.insertAdjacentHTML('beforeend', remaining > 0 ? htmlChunk + buildLoadMoreSentinel(cardsMode, remaining) : htmlChunk);
        }

        function updateVirtualTableWindow(force = false) {
            if (!invVirtualActive || isCardsViewActive()) return;
            const tbody = $el('inventoryTableBody');
            const wrap = $el('inventoryTableWrap');
            if (!tbody || !wrap) return;
            // Não interrompe edição inline ativa na célula
            if (!force && tbody.querySelector('input[type="text"]')) return;

            const total = invPageItemsCache.length;
            if (total === 0) return;

            const estH = isCompact ? 42 : 60;
            const viewH = wrap.clientHeight > 80 ? wrap.clientHeight : Math.round(window.innerHeight * 0.66);
            const scrollTop = wrap.scrollTop || 0;
            const atBottom = wrap.scrollHeight > viewH && (scrollTop + viewH >= wrap.scrollHeight - 8);

            let startIdx = Math.max(0, Math.floor(scrollTop / estH) - INV_VIRTUAL_OVERSCAN);
            let endIdx = atBottom
                ? total
                : Math.min(total, Math.ceil((scrollTop + viewH) / estH) + INV_VIRTUAL_OVERSCAN);

            if (endIdx - startIdx < 24) {
                startIdx = Math.max(0, endIdx - 24);
            }

            if (!force && startIdx === invVirtStart && endIdx === invVirtEnd) return;
            invVirtStart = startIdx;
            invVirtEnd = endIdx;

            const canEdit = isEditor();
            const todayISO = metaCacheTodayISO || getTodayISO();
            const topH = startIdx * estH;
            const botH = (total - endIdx) * estH;

            let html = '';
            if (topH > 0) html += `<tr class="vr-spacer" aria-hidden="true"><td colspan="9" style="height:${topH}px"></td></tr>`;
            for (let i = startIdx; i < endIdx; i++) {
                html += buildTableRowHtml(invPageItemsCache[i], canEdit, todayISO);
            }
            if (botH > 0) html += `<tr class="vr-spacer" aria-hidden="true"><td colspan="9" style="height:${botH}px"></td></tr>`;
            tbody.innerHTML = html;
        }

        function renderInventoryView() {
            const tbody = document.getElementById('inventoryTableBody');
            const cards = document.getElementById('inventoryCardsWrap');
            if (!tbody || !cards) return;

            ++invRenderToken;
            const start = (invPage - 1) * invPageSize;
            const pageItems = filteredInv.slice(start, start + invPageSize);
            invPageItemsCache = pageItems;
            invRenderedCount = 0;
            invVirtualActive = false;
            invVirtStart = -1;
            invVirtEnd = -1;
            savedInvScrollTop = 0;

            const canEdit = isEditor();
            const cardsMode = isCardsViewActive();
            const todayISO = metaCacheTodayISO || getTodayISO();

            const totalPages = Math.ceil(filteredInv.length / invPageSize) || 1;
            document.getElementById('invPaginationInfo').textContent = pageItems.length === 0
                ? '0 instrumentos'
                : `Exibindo ${start + 1}–${Math.min(start + invPageSize, filteredInv.length)} de ${filteredInv.length} instrumentos`;
            document.getElementById('invPageLabel').textContent = `${invPage} / ${totalPages}`;
            document.getElementById('btnPrevPage').disabled = invPage <= 1;
            document.getElementById('btnNextPage').disabled = invPage >= totalPages;

            if (pageItems.length === 0) {
                if (cardsMode) {
                    cards.innerHTML = '<div style="grid-column:1/-1;padding:2.5rem;text-align:center;color:#94A3B8;font-size:0.875rem">Nenhum instrumento encontrado.</div>';
                    tbody.innerHTML = '';
                } else {
                    tbody.innerHTML = '<tr><td colspan="9" style="padding:2.5rem;text-align:center;color:#94A3B8">Nenhum instrumento corresponde aos filtros atuais.</td></tr>';
                    cards.innerHTML = '';
                }
                return;
            }

            const chkAll = document.getElementById('chkSelectAllPage');
            if (chkAll) chkAll.checked = pageItems.every(i => selectedIds.has(i.id));

            const targetEl = cardsMode ? cards : tbody;
            const otherEl = cardsMode ? tbody : cards;
            if (otherEl.firstChild) otherEl.innerHTML = '';

            const wrap = document.getElementById('inventoryTableWrap');
            if (wrap) wrap.scrollTop = 0;

            // MODO TABELA + >50 ITENS (ex: 100 ou "Todos" = 441): Virtual Scrolling real (~28 linhas no DOM sempre!)
            if (!cardsMode && pageItems.length > INV_VIRTUAL_THRESHOLD) {
                invVirtualActive = true;
                invRenderedCount = pageItems.length;
                updateVirtualTableWindow(true);
                return;
            }

            // MODO CARTÕES ou <=50 itens: lote inicial de 35 + carregamento sob demanda ao rolar
            const initialCount = Math.min(pageItems.length, INV_FIRST_BATCH);
            const slice = pageItems.slice(0, initialCount);
            const rowsHtml = cardsMode
                ? slice.map(it => buildCardHtml(it, canEdit)).join('')
                : slice.map(it => buildTableRowHtml(it, canEdit, todayISO)).join('');
            invRenderedCount = initialCount;

            const remaining = pageItems.length - invRenderedCount;
            targetEl.innerHTML = remaining > 0 ? rowsHtml + buildLoadMoreSentinel(cardsMode, remaining) : rowsHtml;
        }

        function stepPage(delta) {
            const total = Math.ceil(filteredInv.length / invPageSize) || 1;
            invPage = Math.min(total, Math.max(1, invPage + delta));
            renderInventoryView();
        }
        function updatePageSizeButtonsUI(n) {
            document.querySelectorAll('.ps-btn').forEach(b => {
                b.classList.toggle('is-on', Number(b.getAttribute('data-ps')) === n);
            });
        }
        function setPageSize(n) {
            invPageSize = n; safeSet(KEYS.ps, String(n)); invPage = 1;
            updatePageSizeButtonsUI(n);
            renderInventoryView();
        }
        function setDensity(comp) {
            isCompact = comp; safeSet(KEYS.compact, comp ? 'true' : 'false');
            document.body.classList.toggle('vp-compact', comp);
            document.getElementById('btnDensNorm').className = `px-2.5 py-1.5 rounded-md font-bold text-[11px] cursor-pointer ${!comp?'bg-[#004C97] text-white':'text-slate-600 dark:text-slate-300'}`;
            document.getElementById('btnDensComp').className = `px-2.5 py-1.5 rounded-md font-bold text-[11px] cursor-pointer ${comp?'bg-[#004C97] text-white':'text-slate-600 dark:text-slate-300'}`;
            if (invVirtualActive && currentView === 'inventory') updateVirtualTableWindow(true);
        }
        function applyViewModeUI() {
            const tw = document.getElementById('inventoryTableWrap');
            const cw = document.getElementById('inventoryCardsWrap');
            const lbl = document.getElementById('viewToggleLabel');
            const ico = document.getElementById('viewToggleIcon');
            if (invViewMode === 'cards') {
                tw.className = 'hidden'; cw.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3';
                lbl.textContent = 'Tabela'; setSvgIcon(ico, 'table');
            } else if (invViewMode === 'table') {
                tw.className = 'block overflow-x-auto vp-table-wrap rounded-lg border border-[#DCE4EE] dark:border-[#172E4E]'; cw.className = 'hidden';
                lbl.textContent = 'Cartões'; setSvgIcon(ico, 'grip');
            } else {
                tw.className = 'hidden md:block vp-table-wrap rounded-lg border border-[#DCE4EE] dark:border-[#172E4E]';
                cw.className = 'md:hidden grid grid-cols-1 sm:grid-cols-2 gap-3';
                const mob = window.innerWidth < 768;
                lbl.textContent = mob ? 'Tabela' : 'Cartões'; setSvgIcon(ico, mob ? 'table' : 'grip');
            }
        }
        function toggleInventoryViewMode() {
            if (invViewMode === 'auto') invViewMode = window.innerWidth < 768 ? 'table' : 'cards';
            else invViewMode = invViewMode === 'cards' ? 'table' : 'cards';
            applyViewModeUI();
            if (currentView === 'inventory') renderInventoryView();
            else dirtyViews.inventory = true;
        }

        function inlineEditCell(cell, id, field) {
            if (!isEditor() || cell.querySelector('input')) return;
            const it = instrumentsData.find(x => x.id === id); if (!it) return;
            const inp = document.createElement('input');
            inp.type = 'text';
            inp.value = field === 'proxCal' ? (it.proxCal ? fmtBR(it.proxCal) : '') : (it[field] || '');
            if (field === 'proxCal') { inp.maxLength = 10; inp.placeholder = 'DD/MM/AAAA'; inp.oninput = () => maskBRDate(inp); }
            if (field === 'local') inp.setAttribute('list', 'dlLocais');
            inp.className = 'w-full px-2 py-1 text-xs font-bold bg-white text-slate-900 border-2 border-[#004C97] rounded';
            cell.innerHTML = ''; cell.appendChild(inp); inp.focus(); inp.select();
            let done = false;
            const commit = () => {
                if (done) return; done = true;
                const val = inp.value.trim();
                if (field === 'proxCal') {
                    const iso = parseManualISO(val);
                    if (val && !iso) { showToast('Data inválida (DD/MM/AAAA).', 'error'); renderInventoryView(); return; }
                    if ((iso||'') === (it.proxCal||'')) { renderInventoryView(); return; }
                    pushUndo(`Validade de ${it.code}`);
                    queueAudit({ module:'Inventário', action:'Edição Rápida', target:it.code, field:'Validade', before:fmtBR(it.proxCal), after:fmtBR(iso), details:`Alterou validade de ${it.code}` });
                    it.proxCal = iso || '';
                    if (it.proxCal) it.status = '';
                } else {
                    if (val === (it[field]||'')) { renderInventoryView(); return; }
                    pushUndo(`Edição de ${it.code}`);
                    queueAudit({ module:'Inventário', action:'Edição Rápida', target:it.code, field, before:it[field]||'-', after:val||'-', details:`Alterou ${field} de ${it.code}` });
                    it[field] = field === 'local' ? canonicalizeLocal(val) : val;
                }
                invalidateInstMeta(it);
                DeltaTracker.markInstUpsert(it);
                persistAll(); renderAll();
                showToast(`${it.code} atualizado!`, 'success', { canUndo:true });
            };
            inp.onkeydown = e => { if (e.key==='Enter') commit(); if (e.key==='Escape') renderInventoryView(); };
            inp.onblur = commit;
        }

        // Batch Selection & Dock
        function toggleSelectRow(id, checked, inputEl) {
            if (checked) selectedIds.add(id); else selectedIds.delete(id);
            const row = inputEl && inputEl.closest ? inputEl.closest('tr') : null;
            if (row) row.classList.toggle('vr-sel', checked);
            updateBatchDock();
        }
        function toggleSelectAllPage(checked) {
            const start = (invPage - 1) * invPageSize;
            filteredInv.slice(start, start + invPageSize).forEach(i => checked ? selectedIds.add(i.id) : selectedIds.delete(i.id));
            renderInventoryView(); updateBatchDock();
        }
        function clearBatchSelection() { selectedIds.clear(); renderInventoryView(); updateBatchDock(); }
        function updateBatchDock() {
            const dock = document.getElementById('batchDock'); if (!dock) return;
            if (!isEditor() || selectedIds.size === 0) { dock.classList.add('hidden'); return; }
            dock.classList.remove('hidden');
            document.getElementById('batchCountLabel').textContent = selectedIds.size;
        }
        function applyBatchLocation() {
            if (!requireEditor()) return;
            const loc = canonicalizeLocal(document.getElementById('batchLocInput').value.trim());
            if (!loc) { showToast('Digite uma localização.', 'error'); return; }
            pushUndo(`Local "${loc}" (${selectedIds.size} itens)`);
            const upd = [];
            instrumentsData.forEach(it => { if (selectedIds.has(it.id)) { it.local = loc; invalidateInstMeta(it); upd.push(it); } });
            DeltaTracker.markInstUpsert(upd);
            queueAudit({ module:'Inventário', action:'Local em Lote', target:`${selectedIds.size} itens`, field:'Localização', before:'Diversos', after:loc, details:`Aplicou local ${loc} em ${selectedIds.size} itens` });
            selectedIds.clear(); document.getElementById('batchLocInput').value = '';
            persistAll(); updateBatchDock(); renderAll();
            showToast(`Local "${loc}" aplicado!`, 'success', { canUndo:true });
        }
        function openBatchDeleteConfirm() {
            if (!requireEditor() || selectedIds.size === 0) return;
            const n = selectedIds.size;
            openConfirmModal('Excluir Selecionados', `Excluir ${n} instrumento(s) da base ativa? Você poderá desfazer com Ctrl+Z.`, () => {
                pushUndo(`Exclusão em lote (${n} itens)`);
                queueAudit({ module:'Inventário', action:'Exclusão em Lote', target:`${n} itens`, field:'Registro', before:'Ativo', after:'Excluído', details:`Excluiu ${n} itens` });
                const delIds = [...selectedIds];
                instrumentsData = instrumentsData.filter(i => !selectedIds.has(i.id));
                DeltaTracker.markInstDelete(delIds);
                selectedIds.clear(); persistAll(); updateBatchDock(); renderAll();
                showToast(`${n} item(ns) excluído(s).`, 'info', { canUndo:true });
            });
        }

        
// ---- Workspace 3: Quadro Público de Cautela & Campo ----
        function setCustodyGroupMode(mode) {
            custodyGroupMode = mode;
            document.getElementById('btnCustGroupHolder').className = `px-3 py-1.5 rounded-md cursor-pointer ${mode==='holder'?'bg-[#004C97] text-white':'text-slate-600 dark:text-slate-300'}`;
            document.getElementById('btnCustGroupFlat').className = `px-3 py-1.5 rounded-md cursor-pointer ${mode==='flat'?'bg-[#004C97] text-white':'text-slate-600 dark:text-slate-300'}`;
            renderCustodyBoard();
        }

        function renderCustodyBoard() {
            const qRaw = (document.getElementById('custodySearchInput')?.value || '').trim();
            const q = normSearch(qRaw), qComp = normCompact(qRaw);
            const today = getTodayISO();
            const allIn = instrumentsData.filter(i => i.custodyHolder && i.custodyHolder.trim());
            const filtered = allIn.filter(i => !q || matchesQuery(normSearch(`${i.code} ${i.desc} ${i.custodyHolder} ${i.custodyReturnTo||''} ${i.custodyReason||''} ${i.local||''}`), normCompact(`${i.code} ${i.custodyHolder}`), q, qComp));

            let lateCnt = 0;
            const holdersSet = new Set();
            allIn.forEach(i => {
                holdersSet.add(i.custodyHolder.trim());
                const d = daysBetween(i.custodyDate, today);
                if (d !== null && d >= 7) lateCnt++;
            });

            document.getElementById('custStatTotal').textContent = allIn.length;
            document.getElementById('custStatLate').textContent = lateCnt;
            document.getElementById('custStatHolders').textContent = holdersSet.size;

            const box = document.getElementById('custodyBoardContainer');
            if (filtered.length === 0) {
                box.innerHTML = `<div class="vp-card rounded-xl p-10 text-center space-y-2">
                    <svg class="vp-ico text-3xl text-emerald-500" aria-hidden="true"><use href="#i-circle-check"/></svg>
                    <div class="font-display font-bold text-base">${allIn.length===0 ? 'Nenhum instrumento em cautela no momento' : 'Nenhum resultado para essa busca'}</div>
                    <p class="text-xs text-slate-500">Todos os equipamentos constam em seus armários ou bancadas de origem.</p>
                </div>`;
                return;
            }

            const canEdit = isEditor();
            const renderCard = (it) => {
                const st = getInstMeta(it).st;
                const ss = getStatusStyle(st);
                const dOut = daysBetween(it.custodyDate, today);
                const ageTag = dOut === null ? '' : dOut >= 15
                    ? `<span class="px-2 py-0.5 rounded bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 font-mono text-[10px] font-extrabold">⚠️ ${dOut} dias fora</span>`
                    : dOut >= 7
                    ? `<span class="px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 font-mono text-[10px] font-extrabold">⏱ ${dOut} dias fora</span>`
                    : `<span class="px-2 py-0.5 rounded bg-[#EAF0F6] dark:bg-[#132846] text-slate-600 dark:text-slate-300 font-mono text-[10px] font-semibold">${dOut === 0 ? 'Retirado hoje' : `há ${dOut}d`}</span>`;
                const retDest = it.custodyReturnTo || it.local || it.resp || 'Não informado';
                return `<div class="vp-card rounded-xl p-4 border-l-4 ${dOut>=15?'border-l-rose-600':dOut>=7?'border-l-amber-500':'border-l-[#00A8E8]'} flex flex-col justify-between gap-3">
                    <div class="space-y-2">
                        <div class="flex items-start justify-between gap-2">
                            <button type="button" onclick="openInspectorModal(${it.id})" class="text-left min-w-0 cursor-pointer group">
                                <div class="font-mono font-bold text-[#004C97] dark:text-[#00A8E8] text-sm group-hover:underline">${escapeHtml(it.code)}</div>
                                <div class="font-semibold text-xs truncate">${escapeHtml(it.desc)}</div>
                            </button>
                            <span class="px-2 py-0.5 rounded-full border text-[10px] font-extrabold shrink-0 ${ss.pill}">${st}</span>
                        </div>
                        <div class="p-2.5 rounded-lg bg-[#F7F9FC] dark:bg-[#061121] border border-[#DCE4EE] dark:border-[#172E4E] text-xs space-y-1">
                            <div class="flex justify-between gap-2"><span class="text-slate-500">Em posse de:</span><strong class="truncate">${escapeHtml(it.custodyHolder)}</strong></div>
                            <div class="flex justify-between gap-2"><span class="text-slate-500">Devolver para:</span><strong class="text-[#004C97] dark:text-[#00A8E8] truncate">${escapeHtml(retDest)}</strong></div>
                            ${it.custodyReason ? `<div class="text-[11px] text-slate-500 pt-1 border-t border-[#DCE4EE] dark:border-[#172E4E]">${escapeHtml(it.custodyReason)}</div>` : ''}
                        </div>
                    </div>
                    <div class="flex items-center justify-between gap-2 pt-1">
                        <div class="flex items-center gap-1.5">${ageTag}</div>
                        <div class="flex items-center gap-1.5">
                            ${canEdit ? `<button type="button" onclick="openCustodyModal([${it.id}])" class="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-extrabold cursor-pointer transition"><svg class="vp-ico mr-1" aria-hidden="true"><use href="#i-rotate-left"/></svg>Devolver</button>` : ''}
                        </div>
                    </div>
                </div>`;
            };

            if (custodyGroupMode === 'flat') {
                box.innerHTML = `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">${filtered.map(renderCard).join('')}</div>`;
                return;
            }

            const grouped = {};
            filtered.forEach(i => {
                const h = i.custodyHolder.trim();
                if (!grouped[h]) grouped[h] = [];
                grouped[h].push(i);
            });
            box.innerHTML = Object.entries(grouped).sort((a,b) => b[1].length - a[1].length).map(([holder, items]) => {
                const sh = escapeHtml(holder).replace(/'/g, "\\'");
                return `<div class="vp-card rounded-xl p-5 space-y-3.5">
                    <div class="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#DCE4EE] dark:border-[#172E4E]">
                        <div class="flex items-center gap-2.5">
                            <div class="w-9 h-9 rounded-xl text-white font-display font-bold flex items-center justify-center text-xs shadow" style="background:${getAvatarMeta(holder).bg}">${escapeHtml(getAvatarMeta(holder).ini)}</div>
                            <div>
                                <div class="font-display font-bold text-base">${escapeHtml(holder)}</div>
                                <div class="text-[11px] text-slate-500">${items.length} ${items.length===1?'instrumento em posse':'instrumentos em posse'}</div>
                            </div>
                        </div>
                        <button type="button" onclick="copySummaryReport('HOLDER','${sh}')" class="px-3 py-1.5 rounded-lg bg-[#EAF0F6] dark:bg-[#132846] hover:bg-[#004C97] hover:text-white text-[#004C97] dark:text-[#00A8E8] text-xs font-bold cursor-pointer transition inline-flex items-center gap-1.5">
                            <svg class="vp-ico" aria-hidden="true"><use href="#i-copy"/></svg> Copiar Cobrança
                        </button>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">${items.map(renderCard).join('')}</div>
                </div>`;
            }).join('');
        }

        
// ---- Workspace 4: Laboratório Externo (com SLA Atraso) & Perdidos ----
        function setLabSubTab(tab) {
            labSubTab = tab;
            document.getElementById('subpanel-external').classList.toggle('hidden', tab !== 'external');
            document.getElementById('subpanel-lost').classList.toggle('hidden', tab !== 'lost');
            document.getElementById('subLabBtn').className = tab === 'external'
                ? 'px-4 py-2 rounded-lg text-xs font-extrabold bg-[#004C97] text-white cursor-pointer transition inline-flex items-center gap-2'
                : 'px-4 py-2 rounded-lg text-xs font-bold bg-white dark:bg-[#091527] border border-[#DCE4EE] dark:border-[#172E4E] text-slate-700 dark:text-slate-300 cursor-pointer transition inline-flex items-center gap-2';
            document.getElementById('subLostBtn').className = tab === 'lost'
                ? 'px-4 py-2 rounded-lg text-xs font-extrabold bg-rose-600 text-white cursor-pointer transition inline-flex items-center gap-2'
                : 'px-4 py-2 rounded-lg text-xs font-bold bg-white dark:bg-[#091527] border border-[#DCE4EE] dark:border-[#172E4E] text-slate-700 dark:text-slate-300 cursor-pointer transition inline-flex items-center gap-2';
        }
        function setLabStatusFilter(st) {
            labStatusFilter = st;
            document.querySelectorAll('.ls-btn').forEach(b => {
                const on = (b.getAttribute('data-ls')||'') === st;
                b.classList.toggle('ring-2', on); b.classList.toggle('ring-[#00A8E8]', on);
            });
            renderLabTables();
        }
        function isLabOverdue(h) {
            if (h.status === 'CONCLUÍDO') return false;
            const today = getTodayISO();
            if (h.dateRetorno && /^\d{4}-\d{2}-\d{2}$/.test(h.dateRetorno)) {
                return daysBetween(today, h.dateRetorno) < 0;
            }
            const dSent = daysBetween(h.dateEnvio, today);
            return dSent !== null && dSent > 15;
        }
        function extractRpsKey(obs) {
            const m = String(obs || '').match(/RPS[-\s#]?[A-Z0-9]+/i);
            return m ? m[0].toUpperCase().replace(/\s+/g, '') : '';
        }
        function toggleLabSelect(hid, checked) {
            if (checked) labSelectedIds.add(hid); else labSelectedIds.delete(hid);
            updateLabBatchBar();
        }
        function toggleLabSelectAll(checked) {
            calibrationHistory.forEach(h => {
                if (h.status !== 'CONCLUÍDO' && h.id) {
                    if (checked) labSelectedIds.add(h.id); else labSelectedIds.delete(h.id);
                }
            });
            renderLabTables();
        }
        function selectLabByGroup(kind, val) {
            labSelectedIds.clear();
            calibrationHistory.forEach(h => {
                if (h.status === 'CONCLUÍDO' || !h.id) return;
                if (kind === 'rps' && extractRpsKey(h.obs) === val) labSelectedIds.add(h.id);
                else if (kind === 'lab' && String(h.lab || '').trim() === val) labSelectedIds.add(h.id);
            });
            renderLabTables();
        }
        function clearLabSelection() {
            labSelectedIds.clear();
            renderLabTables();
        }
        function updateLabBatchBar() {
            const bar = document.getElementById('labBatchBar');
            const cntEl = document.getElementById('labSelCount');
            const chipsEl = document.getElementById('labRpsQuickChips');
            if (!bar) return;
            const transit = calibrationHistory.filter(h => h.status !== 'CONCLUÍDO');
            const validIds = new Set(transit.map(h => h.id));
            [...labSelectedIds].forEach(id => { if (!validIds.has(id)) labSelectedIds.delete(id); });

            const rpsCounts = {};
            const labCounts = {};
            transit.forEach(h => {
                const r = extractRpsKey(h.obs);
                if (r) rpsCounts[r] = (rpsCounts[r] || 0) + 1;
                const l = String(h.lab || '').trim();
                if (l) labCounts[l] = (labCounts[l] || 0) + 1;
            });
            const quickBtns = [];
            Object.entries(rpsCounts).filter(([, c]) => c >= 2).forEach(([r, c]) => {
                quickBtns.push(`<button type="button" onclick="selectLabByGroup('rps','${escapeHtml(r)}')" class="px-2 py-0.5 rounded bg-white dark:bg-[#091527] border border-emerald-300 dark:border-emerald-500/30 font-mono text-[10px] font-bold cursor-pointer hover:bg-emerald-600 hover:text-white transition">Lote ${escapeHtml(r)} (${c})</button>`);
            });
            if (quickBtns.length === 0) {
                Object.entries(labCounts).filter(([, c]) => c >= 2).slice(0, 3).forEach(([l, c]) => {
                    const sl = escapeHtml(l).replace(/'/g, "\\'");
                    quickBtns.push(`<button type="button" onclick="selectLabByGroup('lab','${sl}')" class="px-2 py-0.5 rounded bg-white dark:bg-[#091527] border border-emerald-300 dark:border-emerald-500/30 text-[10px] font-bold cursor-pointer hover:bg-emerald-600 hover:text-white transition">Selecionar ${escapeHtml(l)} (${c})</button>`);
                });
            }
            if (chipsEl) chipsEl.innerHTML = quickBtns.join('');
            if (cntEl) cntEl.textContent = labSelectedIds.size;
            const showBar = isEditor() && (labSelectedIds.size > 0 || quickBtns.length > 0);
            bar.classList.toggle('hidden', !showBar);
        }

        function renderLabTables() {
            ensureHistoryIds();
            const qRaw = (document.getElementById('labSearchInput')?.value || '').trim();
            const q = normSearch(qRaw), qComp = normCompact(qRaw);
            const all = calibrationHistory;
            const transit = all.filter(h => h.status !== 'CONCLUÍDO');
            const late = all.filter(isLabOverdue);
            const done = all.filter(h => h.status === 'CONCLUÍDO');

            document.getElementById('labExtCount').textContent = all.length;
            document.getElementById('labLostCount').textContent = lostInstrumentsData.length;
            document.getElementById('lsAll').textContent = all.length;
            document.getElementById('lsTransit').textContent = transit.length;
            document.getElementById('lsLate').textContent = late.length;
            document.getElementById('lsDone').textContent = done.length;

            updateLabBatchBar();

            const rows = all.map((h, idx) => ({ h, idx })).filter(({ h }) => {
                if (labStatusFilter === 'EM TRÂNSITO' && h.status === 'CONCLUÍDO') return false;
                if (labStatusFilter === 'CONCLUÍDO' && h.status !== 'CONCLUÍDO') return false;
                if (labStatusFilter === 'ATRASADO' && !isLabOverdue(h)) return false;
                if (q && !matchesQuery(normSearch(`${h.code} ${h.desc} ${h.lab} ${h.obs} ${h.setor}`), normCompact(`${h.code} ${h.obs}`), q, qComp)) return false;
                return true;
            });

            const chkAll = document.getElementById('chkLabAll');
            if (chkAll) chkAll.checked = transit.length > 0 && transit.every(h => labSelectedIds.has(h.id));

            const tb = document.getElementById('labHistoryTbody');
            const labCards = document.getElementById('labHistoryCards');
            if (rows.length === 0) {
                tb.innerHTML = '<tr><td colspan="8" class="p-8 text-center text-slate-400">Nenhum registro de calibração externa.</td></tr>';
                if (labCards) labCards.innerHTML = '<div class="p-6 text-center text-xs text-slate-400">Nenhum registro de calibração externa.</div>';
            } else {
                const today = getTodayISO();
                tb.innerHTML = rows.map(({ h, idx }) => {
                    const isDone = h.status === 'CONCLUÍDO';
                    const overdue = isLabOverdue(h);
                    const daysOut = !isDone ? daysBetween(h.dateEnvio, today) : null;
                    const isSel = !isDone && labSelectedIds.has(h.id);
                    return `<tr class="${isSel ? 'bg-emerald-50/80 dark:bg-emerald-500/15' : overdue ? 'bg-rose-50/70 dark:bg-rose-500/10' : 'hover:bg-[#F7F9FC] dark:hover:bg-[#0D1D34]'}">
                        <td class="editor-only p-3.5 text-center">${!isDone ? `<input type="checkbox" ${isSel?'checked':''} onchange="toggleLabSelect(${h.id},this.checked)" class="rounded cursor-pointer">` : ''}</td>
                        <td class="p-3.5">
                            <div class="font-mono font-bold text-xs">${fmtBR(h.dateEnvio)}</div>
                            ${overdue ? `<span class="inline-block mt-0.5 px-1.5 py-0.5 rounded bg-rose-600 text-white text-[9px] font-extrabold uppercase">SLA ATRASADO (${daysOut}d)</span>` : (!isDone && daysOut !== null ? `<span class="text-[10px] text-slate-500">há ${daysOut}d no lab</span>` : '')}
                        </td>
                        <td class="p-3.5 text-xs">
                            <div class="font-mono font-bold">${h.dateRetorno === 'Em Andamento' ? '<span class="text-amber-600">Em Andamento</span>' : fmtBR(h.dateRetorno)}</div>
                            ${h.newCalDate ? `<div class="text-[10px] text-emerald-600 font-bold">Val.: ${fmtBR(h.newCalDate)}</div>` : ''}
                        </td>
                        <td class="p-3.5">
                            <button type="button" onclick="openInspectorByCode('${escapeHtml(h.code).replace(/'/g, "\\'")}')" class="vr-code-btn font-mono font-bold text-xs text-[#004C97] dark:text-[#00A8E8]" title="Abrir ficha técnica">${escapeHtml(h.code)}</button>
                            <div class="text-xs font-semibold">${escapeHtml(h.desc)}</div>
                        </td>
                        <td class="p-3.5 text-xs font-semibold">${escapeHtml(h.lab)}</td>
                        <td class="p-3.5 text-xs text-slate-500 max-w-[200px] truncate" title="${escapeHtml(h.obs||'')}">${escapeHtml(h.obs||'-')}</td>
                        <td class="p-3.5 text-center">
                            <span class="px-2.5 py-1 rounded-full text-[10px] font-extrabold ${isDone?'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300':overdue?'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300':'bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300'}">${isDone?'CONCLUÍDO':overdue?'ATRASADO':'EM TRÂNSITO'}</span>
                        </td>
                        <td class="editor-only p-3.5 text-center whitespace-nowrap">
                            ${!isDone ? `<button type="button" onclick="openReturnLabModal(${idx})" class="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold mr-1 cursor-pointer">Retorno</button>` : ''}
                            <button type="button" onclick="openExternalModal(${idx})" class="px-2 py-1 rounded-lg bg-[#EAF0F6] dark:bg-[#132846] text-xs cursor-pointer" title="Editar"><svg class="vp-ico" aria-hidden="true"><use href="#i-pen"/></svg></button>
                            <button type="button" onclick="deleteHistoryRow(${idx})" class="px-2 py-1 rounded-lg bg-rose-100 dark:bg-rose-500/20 text-rose-600 text-xs cursor-pointer" title="Excluir"><svg class="vp-ico" aria-hidden="true"><use href="#i-trash"/></svg></button>
                        </td>
                    </tr>`;
                }).join('');

                if (labCards) {
                    labCards.innerHTML = rows.map(({ h, idx }) => {
                        const isDone = h.status === 'CONCLUÍDO';
                        const overdue = isLabOverdue(h);
                        const daysOut = !isDone ? daysBetween(h.dateEnvio, today) : null;
                        const borderL = isDone ? 'border-l-emerald-500' : overdue ? 'border-l-rose-600' : 'border-l-amber-500';
                        const isSel = !isDone && labSelectedIds.has(h.id);
                        return `<div class="vp-card rounded-xl p-3.5 border-l-4 ${borderL} space-y-2.5">
                            <div class="flex items-start justify-between gap-2">
                                <div class="flex items-start gap-2 min-w-0">
                                    ${!isDone ? `<input type="checkbox" ${isSel?'checked':''} onchange="toggleLabSelect(${h.id},this.checked)" class="editor-only vr-chk mt-0.5">` : ''}
                                    <div class="min-w-0">
                                    <button type="button" onclick="openInspectorByCode('${escapeHtml(h.code).replace(/'/g, "\\'")}')" class="vr-code-btn font-mono font-bold text-sm text-[#004C97] dark:text-[#00A8E8]" title="Abrir ficha técnica">${escapeHtml(h.code)}</button>
                                    <div class="text-xs font-bold leading-snug">${escapeHtml(h.desc)}</div>
                                    </div>
                                </div>
                                <span class="px-2.5 py-1 rounded-full text-[10px] font-extrabold shrink-0 ${isDone?'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300':overdue?'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300':'bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300'}">${isDone?'CONCLUÍDO':overdue?`ATRASADO (${daysOut}d)`:`NO LAB (${daysOut??0}d)`}</span>
                            </div>
                            <div class="grid grid-cols-2 gap-2 text-xs bg-[#F7F9FC] dark:bg-[#061121] p-2.5 rounded-lg border border-[#DCE4EE] dark:border-[#172E4E]">
                                <div><span class="block text-[10px] font-bold uppercase text-slate-400">Laboratório</span><strong class="truncate block">${escapeHtml(h.lab)}</strong></div>
                                <div><span class="block text-[10px] font-bold uppercase text-slate-400">Envio</span><strong class="font-mono">${fmtBR(h.dateEnvio)}</strong></div>
                                <div><span class="block text-[10px] font-bold uppercase text-slate-400">Retorno</span><strong class="font-mono">${h.dateRetorno === 'Em Andamento' ? 'Em Andamento' : fmtBR(h.dateRetorno)}</strong></div>
                                <div><span class="block text-[10px] font-bold uppercase text-slate-400">Nova Validade</span><strong class="font-mono text-emerald-600 dark:text-emerald-400">${h.newCalDate ? fmtBR(h.newCalDate) : '-'}</strong></div>
                            </div>
                            ${h.obs ? `<div class="text-xs text-slate-500 dark:text-slate-400">${escapeHtml(h.obs)}</div>` : ''}
                            <div class="editor-only flex items-center gap-2 pt-1">
                                ${!isDone ? `<button type="button" onclick="openReturnLabModal(${idx})" class="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold cursor-pointer">Confirmar Retorno</button>` : ''}
                                <button type="button" onclick="openExternalModal(${idx})" class="px-3.5 py-2 rounded-lg bg-[#EAF0F6] dark:bg-[#132846] text-xs font-bold cursor-pointer"><svg class="vp-ico mr-1" aria-hidden="true"><use href="#i-pen"/></svg>Editar</button>
                                <button type="button" onclick="deleteHistoryRow(${idx})" class="px-3 py-2 rounded-lg bg-rose-100 dark:bg-rose-500/20 text-rose-600 text-xs font-bold cursor-pointer"><svg class="vp-ico" aria-hidden="true"><use href="#i-trash"/></svg></button>
                            </div>
                        </div>`;
                    }).join('');
                }
            }

            const ltb = document.getElementById('lostTbody');
            const lostCards = document.getElementById('lostCards');
            if (lostInstrumentsData.length === 0) {
                ltb.innerHTML = '<tr><td colspan="6" class="p-8 text-center text-slate-400">Nenhum instrumento desativado ou perdido.</td></tr>';
                if (lostCards) lostCards.innerHTML = '<div class="p-6 text-center text-xs text-slate-400">Nenhum instrumento desativado ou perdido.</div>';
            } else {
                ltb.innerHTML = lostInstrumentsData.map((l, idx) => `<tr class="hover:bg-[#F7F9FC] dark:hover:bg-[#0D1D34]">
                    <td class="p-3.5 font-mono font-bold text-xs text-rose-600 dark:text-rose-400">${escapeHtml(l.code)}</td>
                    <td class="p-3.5 font-semibold text-xs">${escapeHtml(l.desc)}</td>
                    <td class="p-3.5 text-xs">${escapeHtml(l.setor||'-')} <span class="text-slate-400 font-mono">(${escapeHtml(l.cc||'-')})</span></td>
                    <td class="p-3.5 font-mono text-xs">${fmtBR(l.lastCal)}</td>
                    <td class="p-3.5 text-xs text-slate-500">${escapeHtml(l.obs||'-')}</td>
                    <td class="editor-only p-3.5 text-center whitespace-nowrap">
                        <button type="button" onclick="restoreLostItem(${idx})" class="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold mr-1 cursor-pointer">Restaurar</button>
                        <button type="button" onclick="openLostModal(${idx})" class="px-2 py-1 rounded-lg bg-[#EAF0F6] dark:bg-[#132846] text-xs cursor-pointer"><svg class="vp-ico" aria-hidden="true"><use href="#i-pen"/></svg></button>
                        <button type="button" onclick="deleteLostItem(${idx})" class="px-2 py-1 rounded-lg bg-rose-100 dark:bg-rose-500/20 text-rose-600 text-xs cursor-pointer"><svg class="vp-ico" aria-hidden="true"><use href="#i-trash"/></svg></button>
                    </td>
                </tr>`).join('');

                if (lostCards) {
                    lostCards.innerHTML = lostInstrumentsData.map((l, idx) => `<div class="vp-card rounded-xl p-3.5 border-l-4 border-l-rose-600 space-y-2.5">
                        <div class="flex items-start justify-between gap-2">
                            <div class="min-w-0">
                                <div class="font-mono font-bold text-sm text-rose-600 dark:text-rose-400">${escapeHtml(l.code)}</div>
                                <div class="text-xs font-bold leading-snug">${escapeHtml(l.desc)}</div>
                            </div>
                            <span class="font-mono text-[11px] text-slate-500 shrink-0">${fmtBR(l.lastCal)}</span>
                        </div>
                        <div class="text-xs text-slate-500 dark:text-slate-400 bg-[#F7F9FC] dark:bg-[#061121] p-2.5 rounded-lg border border-[#DCE4EE] dark:border-[#172E4E]">
                            <div class="font-semibold text-slate-700 dark:text-slate-200 mb-0.5">${escapeHtml(l.setor||'-')} (${escapeHtml(l.cc||'-')})</div>
                            <div>${escapeHtml(l.obs||'Sem observação.')}</div>
                        </div>
                        <div class="editor-only flex items-center gap-2 pt-1">
                            <button type="button" onclick="restoreLostItem(${idx})" class="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold cursor-pointer">Restaurar p/ Frota</button>
                            <button type="button" onclick="openLostModal(${idx})" class="px-3.5 py-2 rounded-lg bg-[#EAF0F6] dark:bg-[#132846] text-xs font-bold cursor-pointer"><svg class="vp-ico mr-1" aria-hidden="true"><use href="#i-pen"/></svg>Editar</button>
                            <button type="button" onclick="deleteLostItem(${idx})" class="px-3 py-2 rounded-lg bg-rose-100 dark:bg-rose-500/20 text-rose-600 text-xs font-bold cursor-pointer"><svg class="vp-ico" aria-hidden="true"><use href="#i-trash"/></svg></button>
                        </div>
                    </div>`).join('');
                }
            }
        }

        

// ---- Modal V11: Resumo Visual de "Sem Local" por Setor ----
function openUnmappedModal() {
    const unmapped = instrumentsData.filter(i => !i.local || !i.local.trim());
    document.getElementById('unmappedModalSub').textContent = `${unmapped.length} instrumento(s) sem armário ou bancada`;
    const box = document.getElementById('unmappedBreakdownList');
    if (unmapped.length === 0) {
        box.innerHTML = `<div class="p-8 text-center space-y-2">${svgIcon('circle-check', 'text-3xl text-emerald-500 mx-auto')}<div class="font-bold text-sm">100% da frota mapeada!</div><p class="text-xs text-slate-500">Todos os instrumentos possuem armário ou bancada definidos.</p></div>`;
    } else {
        const secCounts = {};
        unmapped.forEach(it => {
            const s = it.setor || 'Outros';
            secCounts[s] = (secCounts[s] || 0) + 1;
        });
        const sorted = Object.entries(secCounts).sort((a, b) => b[1] - a[1]);
        const maxN = Math.max(1, sorted[0][1]);
        box.innerHTML = sorted.map(([sec, cnt]) => {
            const pct = Math.round((cnt / unmapped.length) * 100);
            const barW = Math.max(8, Math.round((cnt / maxN) * 100));
            const safeS = escapeHtml(sec).replace(/'/g, "\\'");
            return `<div class="p-3 rounded-xl bg-[#F7F9FC] dark:bg-[#0D1D34] border border-[#DCE4EE] dark:border-[#172E4E] space-y-2">
                <div class="flex items-center justify-between gap-2 text-xs">
                    <button type="button" onclick="closeUnmappedModal(); jumpToInventoryFilter({local:'__NONE__', setor:'${safeS}'});" class="font-bold text-left hover:text-[#004C97] dark:hover:text-[#00A8E8] hover:underline truncate cursor-pointer">${escapeHtml(sec.replace('Voith Turbo ', ''))}</button>
                    <span class="font-mono font-extrabold text-orange-600 dark:text-orange-400 shrink-0">${cnt} <span class="text-slate-400 font-normal">(${pct}%)</span></span>
                </div>
                <div class="w-full h-2 rounded-full bg-[#EAF0F6] dark:bg-[#132846] overflow-hidden">
                    <div class="h-full bg-amber-500 rounded-full" style="width:${barW}%"></div>
                </div>
                <div class="flex justify-end gap-2">
                    <button type="button" onclick="closeUnmappedModal(); jumpToInventoryFilter({local:'__NONE__', setor:'${safeS}'});" class="text-[11px] font-bold text-[#004C97] dark:text-[#00A8E8] hover:underline cursor-pointer">Filtrar</button>
                    <button type="button" onclick="closeUnmappedModal(); openRapidLocalModal('${safeS}');" class="editor-only text-[11px] font-extrabold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer">Preencher setor →</button>
                </div>
            </div>`;
        }).join('');
    }
    document.getElementById('unmappedModal').classList.remove('hidden');
}
function closeUnmappedModal() {
    document.getElementById('unmappedModal').classList.add('hidden');
}

// ---- Modal V11: Modo "Preencher Locais" em Sequência Rápida ----
function openRapidLocalModal(sectorFilter = '') {
    if (!requireEditor()) return;
    rapidQueueIds = instrumentsData
        .filter(i => (!i.local || !i.local.trim()) && (!sectorFilter || i.setor === sectorFilter))
        .map(i => i.id);
    if (rapidQueueIds.length === 0) {
        showToast('Todos os instrumentos deste escopo já possuem localização!', 'success');
        return;
    }
    rapidQueueIdx = 0;
    document.getElementById('rapidLocalModal').classList.remove('hidden');
    renderRapidLocalStep();
}
function closeRapidLocalModal() {
    document.getElementById('rapidLocalModal').classList.add('hidden');
}
function renderRapidLocalStep() {
    while (rapidQueueIdx < rapidQueueIds.length) {
        const it = instrumentsData.find(x => x.id === rapidQueueIds[rapidQueueIdx]);
        if (it && (!it.local || !it.local.trim())) break;
        rapidQueueIdx++;
    }
    if (rapidQueueIdx >= rapidQueueIds.length) {
        closeRapidLocalModal();
        showToast('Fila de preenchimento de locais concluída!', 'success');
        return;
    }
    const it = instrumentsData.find(x => x.id === rapidQueueIds[rapidQueueIdx]);
    const rem = rapidQueueIds.length - rapidQueueIdx;
    document.getElementById('rlProgressLbl').textContent = `Item ${rapidQueueIdx + 1} de ${rapidQueueIds.length} (${rem} restantes)`;
    document.getElementById('rlCode').textContent = it.code;
    document.getElementById('rlSetor').textContent = (it.setor || '').replace('Voith Turbo ', '');
    document.getElementById('rlDesc').textContent = it.desc;
    document.getElementById('rlResp').textContent = it.resp ? `Responsável: ${it.resp}` : 'Sem responsável';

    const locFreq = {};
    instrumentsData.forEach(x => { if (x.local) locFreq[x.local] = (locFreq[x.local] || 0) + 1; });
    const topLocs = [...new Set([...(controlledLists.locals || []), ...Object.entries(locFreq).sort((a,b) => b[1]-a[1]).map(x => x[0])])].slice(0, 8);
    document.getElementById('rlQuickChips').innerHTML = topLocs.map(l => {
        const sl = escapeHtml(l).replace(/'/g, "\\'");
        return `<button type="button" onclick="pickRapidChip('${sl}')" class="px-2.5 py-1.5 rounded-lg bg-[#EAF0F6] dark:bg-[#132846] hover:bg-[#004C97] hover:text-white text-[#004C97] dark:text-[#00A8E8] text-xs font-bold cursor-pointer transition">${escapeHtml(l)}</button>`;
    }).join('');

    const inp = document.getElementById('rlInput');
    inp.value = '';
    setTimeout(() => inp.focus(), 30);
}
function pickRapidChip(loc) {
    document.getElementById('rlInput').value = loc;
    saveRapidLocal();
}
function saveRapidLocal() {
    if (!requireEditor()) return;
    const raw = document.getElementById('rlInput').value.trim();
    if (!raw) { showToast('Digite ou toque em um armário/bancada.', 'error'); return; }
    const loc = canonicalizeLocal(raw);
    const it = instrumentsData.find(x => x.id === rapidQueueIds[rapidQueueIdx]);
    if (!it) { rapidQueueIdx++; renderRapidLocalStep(); return; }
    pushUndo(`Local de ${it.code}`);
    it.local = loc;
    invalidateInstMeta(it);
    DeltaTracker.markInstUpsert(it);
    queueAudit({ module:'Inventário', action:'Preencher Locais', target:it.code, field:'Localização', before:'Sem local', after:loc, details:`Definiu local ${loc} no modo rápido` });
    persistAll();
    renderAll();
    rapidQueueIdx++;
    renderRapidLocalStep();
}
function skipRapidLocal() {
    rapidQueueIdx++;
    renderRapidLocalStep();
}

// ---- Navegação por Teclado na Tabela do Inventário (↑ / ↓ / Enter no PC) ----
function stepInventoryKeyboard(delta) {
    if (currentView !== 'inventory' || isCardsViewActive() || !invPageItemsCache.length) return;
    if (kbRowIdx < 0) kbRowIdx = delta > 0 ? 0 : invPageItemsCache.length - 1;
    else kbRowIdx = Math.min(invPageItemsCache.length - 1, Math.max(0, kbRowIdx + delta));

    const wrap = $el('inventoryTableWrap');
    if (invVirtualActive && wrap) {
        const estH = isCompact ? 42 : 60;
        const targetTop = kbRowIdx * estH;
        if (targetTop < wrap.scrollTop || targetTop > wrap.scrollTop + wrap.clientHeight - estH * 2) {
            wrap.scrollTop = Math.max(0, targetTop - Math.round(wrap.clientHeight / 3));
            updateVirtualTableWindow(true);
        }
    }

    const it = invPageItemsCache[kbRowIdx];
    const tbody = $el('inventoryTableBody');
    if (!tbody || !it) return;
    tbody.querySelectorAll('tr.vr-kb').forEach(r => r.classList.remove('vr-kb'));
    const row = tbody.querySelector(`tr[data-id="${it.id}"]`);
    if (row) {
        row.classList.add('vr-kb');
        row.scrollIntoView({ block: 'nearest' });
    }
}
function openKeyboardSelectedRow() {
    if (currentView !== 'inventory' || kbRowIdx < 0 || kbRowIdx >= invPageItemsCache.length) return false;
    const it = invPageItemsCache[kbRowIdx];
    if (it) { openInspectorModal(it.id); return true; }
    return false;
}

