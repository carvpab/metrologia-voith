// ============================================================================
// VOITH TURBO — PRECISION METROLOGY OS v11 • INSPECTOR, MODALS & BOOT
// ============================================================================
// ---- Precision Inspector Drawer ----
        function openInspectorModal(id) {
            const canEdit = isEditor();
            const isNew = id === -1;
            if (isNew && !requireEditor()) return;
            const it = isNew ? { id:-1, code:'', cc:'4210 I', desc:'', min:'0', max:'', setor:'Voith Turbo (Industrial)', resp:'Lucas Galbe', local:'', proxCal:'', status:'', obs:'' } : instrumentsData.find(x => x.id === id);
            if (!it) return;

            document.getElementById('inspId').value = it.id;
            document.getElementById('inspTitle').textContent = isNew ? 'Novo Instrumento' : `${it.code} — ${it.desc}`;
            const st = isNew ? 'NOVO' : calcStatus(it.proxCal, it.status);
            document.getElementById('inspBadgeStatus').textContent = st;
            document.getElementById('inspCountdownTag').textContent = isNew ? '' : getCountdownMeta(it.proxCal, st).text;

            const idx = filteredInv.findIndex(x => x.id === id);
            document.getElementById('inspPosLabel').textContent = idx > -1 ? `${idx+1} / ${filteredInv.length}` : '-';
            document.getElementById('inspActionStrip').classList.toggle('hidden', isNew);
            ['inspBtnLost','inspBtnDel','inspBtnSaveNext'].forEach(k => document.getElementById(k).classList.toggle('hidden', isNew));

            document.getElementById('inspCode').value = it.code || '';
            document.getElementById('inspCC').value = it.cc || '';
            document.getElementById('inspDesc').value = it.desc || '';
            document.getElementById('inspMin').value = it.min || '';
            document.getElementById('inspMax').value = it.max || '';
            document.getElementById('inspSetor').value = it.setor || '';
            document.getElementById('inspResp').value = it.resp || '';
            document.getElementById('inspLocal').value = it.local || '';
            const brVal = it.proxCal ? fmtBR(it.proxCal) : '';
            document.getElementById('inspDate').value = brVal;
            document.getElementById('inspCycleManualDate').value = brVal;
            document.getElementById('inspDatePick').value = it.proxCal || '';
            document.getElementById('inspStatus').value = it.status || 'AUTO';
            const resolvedCycle = inferCycleMonths(it.desc, it.cycleMonths);
            const isStdCycle = resolvedCycle === 0 || STANDARD_CYCLES.includes(resolvedCycle);
            document.getElementById('inspCycle').value = isStdCycle ? String(resolvedCycle) : 'CUSTOM';
            document.getElementById('inspCycleCustom').value = isStdCycle ? '' : String(resolvedCycle);
            onInspCycleChange(false);
            const ab = document.getElementById('inspAuditBox'); if (ab) ab.classList.add('hidden');
            document.getElementById('inspCustHolder').value = it.custodyHolder || '';
            document.getElementById('inspCustReturn').value = it.custodyReturnTo || '';
            document.getElementById('inspCustDate').value = it.custodyDate ? fmtBR(it.custodyDate) : '';
            document.getElementById('inspCustReason').value = it.custodyReason || '';
            document.getElementById('inspObs').value = it.obs || '';
            document.getElementById('inspDupWarn').classList.add('hidden');

            ['inspCode','inspCC','inspDesc','inspMin','inspMax','inspSetor','inspResp','inspLocal','inspDate','inspStatus','inspCycle','inspCycleCustom','inspCycleManualDate','inspCustHolder','inspCustReturn','inspCustDate','inspCustReason','inspObs'].forEach(fid => {
                const el = document.getElementById(fid);
                el.disabled = !canEdit;
                el.classList.toggle('opacity-75', !canEdit);
            });

            document.getElementById('inspectorOverlay').classList.remove('hidden');
            const sb = document.getElementById('inspScrollBody');
            if (sb) sb.scrollTop = 0;
        }
        function openInspectorByCode(code) {
            const target = String(code || '').trim().toUpperCase();
            if (!target) return;
            const found = instrumentsData.find(x => String(x.code || '').trim().toUpperCase() === target);
            if (found) openInspectorModal(found.id);
            else showToast(`Instrumento ${target} não consta na frota ativa.`, 'info');
        }
        function closeInspectorModal() { document.getElementById('inspectorOverlay').classList.add('hidden'); }
        function stepInspector(delta) {
            const id = Number(document.getElementById('inspId').value);
            const idx = filteredInv.findIndex(x => x.id === id);
            if (idx === -1 || filteredInv.length === 0) return;
            openInspectorModal(filteredInv[(idx + delta + filteredInv.length) % filteredInv.length].id);
        }
        function checkInspectorDuplicate() {
            const id = Number(document.getElementById('inspId').value);
            const code = document.getElementById('inspCode').value.trim().toUpperCase();
            const warn = document.getElementById('inspDupWarn');
            const dup = code && instrumentsData.find(x => x.code.toUpperCase() === code && x.id !== id);
            if (dup) { warn.textContent = `Código já existe na base (${dup.desc}).`; warn.className = 'text-[11px] font-bold text-rose-600 mt-1'; }
            else warn.classList.add('hidden');
            return Boolean(dup);
        }
        function onInspDateInput(inp) {
            maskBRDate(inp);
            const man = document.getElementById('inspCycleManualDate');
            if (man && man.value !== inp.value) man.value = inp.value;
        }
        function onInspManualDateInput(inp) {
            maskBRDate(inp);
            const main = document.getElementById('inspDate');
            if (main && main.value !== inp.value) main.value = inp.value;
        }
        function setInspDateFromISO(iso) {
            const br = fmtBR(iso);
            const main = document.getElementById('inspDate');
            const man = document.getElementById('inspCycleManualDate');
            if (main) main.value = br;
            if (man) man.value = br;
        }
        function onInspCycleChange(focusInput = true) {
            const sel = document.getElementById('inspCycle');
            const customWrap = document.getElementById('inspCycleCustomWrap');
            const customInp = document.getElementById('inspCycleCustom');
            const manWrap = document.getElementById('inspCycleManualDateWrap');
            const manInp = document.getElementById('inspCycleManualDate');
            if (!sel) return;
            const isCustom = sel.value === 'CUSTOM';
            const isManual = sel.value === '0';
            if (customWrap) customWrap.classList.toggle('hidden', !isCustom);
            if (manWrap) manWrap.classList.toggle('hidden', !isManual);
            if (isManual && manInp) {
                const mainVal = document.getElementById('inspDate')?.value || '';
                if (manInp.value !== mainVal) manInp.value = mainVal;
                if (focusInput && !manInp.disabled) {
                    setTimeout(() => { manInp.focus(); manInp.select(); }, 20);
                }
            } else if (isCustom && focusInput && customInp && !customInp.disabled) {
                setTimeout(() => customInp.focus(), 20);
            }
        }
        function saveInspector(goNext = false) {
            if (!requireEditor()) return;
            const id = Number(document.getElementById('inspId').value);
            const code = document.getElementById('inspCode').value.trim().toUpperCase();
            const desc = document.getElementById('inspDesc').value.trim();
            if (!code || !desc) { showToast('Preencha Código e Descrição.', 'error'); return; }
            if (checkInspectorDuplicate()) { showToast(`Código ${code} duplicado.`, 'error'); return; }

            const rawD = (document.getElementById('inspCycle').value === '0' ? (document.getElementById('inspCycleManualDate').value.trim() || document.getElementById('inspDate').value.trim()) : document.getElementById('inspDate').value.trim());
            const iso = parseManualISO(rawD);
            if (rawD && !iso) { showToast('Data de validade inválida (DD/MM/AAAA).', 'error'); return; }

            const rawCD = document.getElementById('inspCustDate').value.trim();
            const custISO = parseManualISO(rawCD);
            if (rawCD && !custISO) { showToast('Data da cautela inválida (DD/MM/AAAA).', 'error'); return; }

            const cycSel = document.getElementById('inspCycle').value;
            let cycleMonths = 12;
            if (cycSel === '0') {
                cycleMonths = 0;
            } else if (cycSel === 'CUSTOM') {
                const rawM = Math.round(Number(document.getElementById('inspCycleCustom').value));
                if (!Number.isFinite(rawM) || rawM < 1 || rawM > 120) {
                    showToast('Informe uma periodicidade personalizada entre 1 e 120 meses (ou selecione Manual).', 'error');
                    return;
                }
                cycleMonths = rawM;
            } else {
                cycleMonths = Number(cycSel) || 12;
            }

            const holder = document.getElementById('inspCustHolder').value.trim();
            const stSel = document.getElementById('inspStatus').value;
            const payload = {
                code, desc,
                cc: document.getElementById('inspCC').value.trim(),
                min: document.getElementById('inspMin').value.trim(),
                max: document.getElementById('inspMax').value.trim(),
                setor: canonicalizeSector(document.getElementById('inspSetor').value.trim() || 'Voith Turbo (Industrial)'),
                resp: cleanSpaces(document.getElementById('inspResp').value.trim()),
                local: canonicalizeLocal(document.getElementById('inspLocal').value.trim()),
                cycleMonths,
                proxCal: iso || '',
                status: stSel === 'AUTO' ? '' : stSel,
                custodyHolder: holder,
                custodyReturnTo: holder ? document.getElementById('inspCustReturn').value.trim() : '',
                custodyDate: holder ? (custISO || getTodayISO()) : '',
                custodyReason: holder ? document.getElementById('inspCustReason').value.trim() : '',
                obs: document.getElementById('inspObs').value.trim()
            };

            if (id === -1) {
                pushUndo(`Cadastro ${code}`);
                const nid = instrumentsData.length ? Math.max(...instrumentsData.map(x => x.id)) + 1 : 1;
                const created = normalizeInstrument({ id: nid, rev: 0, ...payload }, nid);
                instrumentsData.unshift(created);
                DeltaTracker.markInstUpsert(created);
                queueAudit({ module:'Inventário', action:'Novo Cadastro', target:code, field:'Instrumento', before:'-', after:`${desc} | ${payload.local||'Sem local'}`, details:`Cadastrou ${code}` });
                persistAll(); renderAll(); closeInspectorModal();
                showToast(`${code} cadastrado!`, 'success', { canUndo:true });
                return;
            }
            pushUndo(`Edição ${code}`);
            const item = instrumentsData.find(x => x.id === id);
            if (item) {
                queueAudit({ module:'Inventário', action:'Edição', target:code, field:'Cadastro', before:`${item.local||'-'} | ${fmtBR(item.proxCal)}`, after:`${payload.local||'-'} | ${fmtBR(payload.proxCal)}`, details:`Atualizou ${code} (${desc})` });
                Object.assign(item, payload);
                invalidateInstMeta(item);
                DeltaTracker.markInstUpsert(item);
            }
            persistAll(); renderAll();
            showToast(`${code} salvo!`, 'success', { canUndo:true });
            if (goNext) stepInspector(1); else closeInspectorModal();
        }
        function moveInspectorToLost() {
            if (!requireEditor()) return;
            const id = Number(document.getElementById('inspId').value);
            const it = instrumentsData.find(x => x.id === id); if (!it) return;
            pushUndo(`Mover ${it.code} p/ Perdidos`);
            instrumentsData = instrumentsData.filter(x => x.id !== id);
            const lostRec = { id: Date.now(), code: it.code, desc: it.desc, setor: it.setor, cc: it.cc, lastCal: it.proxCal || getTodayISO(), obs: it.obs || 'Movido p/ Desativados/Perdidos' };
            lostInstrumentsData.unshift(lostRec);
            DeltaTracker.markInstDelete(id);
            DeltaTracker.markLostUpsert(lostRec);
            queueAudit({ module:'Inventário', action:'Mover p/ Perdidos', target:it.code, field:'Situação', before:'Ativo', after:'Perdido', details:`Moveu ${it.code} p/ perdidos` });
            persistAll(); renderAll(); closeInspectorModal();
            showToast(`${it.code} movido para Desativados/Perdidos.`, 'info', { canUndo:true });
        }
        function deleteInspectorItem() {
            if (!requireEditor()) return;
            const id = Number(document.getElementById('inspId').value);
            const it = instrumentsData.find(x => x.id === id); if (!it) return;
            openConfirmModal('Excluir Instrumento', `Excluir permanentemente ${it.code} (${it.desc})?`, () => {
                pushUndo(`Exclusão ${it.code}`);
                instrumentsData = instrumentsData.filter(x => x.id !== id);
                selectedIds.delete(id);
                DeltaTracker.markInstDelete(id);
                queueAudit({ module:'Inventário', action:'Exclusão', target:it.code, field:'Registro', before:it.desc, after:'Excluído', details:`Excluiu ${it.code}` });
                persistAll(); renderAll(); closeInspectorModal();
                showToast(`${it.code} excluído.`, 'info', { canUndo:true });
            });
        }
        function openCustodyFromInspector() {
            const id = Number(document.getElementById('inspId').value);
            if (id > -1) { closeInspectorModal(); openCustodyModal([id]); }
        }
        function copyCurrentInstrumentCard() {
            const id = Number(document.getElementById('inspId').value);
            const it = instrumentsData.find(x => x.id === id); if (!it) return;
            const st = getInstMeta(it).st;
            const txt = `🔧 *${it.code}* — ${it.desc}\n• Status: ${st} (Val.: ${fmtBR(it.proxCal)})\n• Setor: ${it.setor} | Local: ${it.local || 'Sem local'} | Resp.: ${it.resp || '-'}` + (it.custodyHolder ? `\n• 🤝 Em posse de: ${it.custodyHolder} → Devolver p/: ${it.custodyReturnTo || it.local || '-'}` : '');
            copyToClipboard(txt, `Ficha de ${it.code} copiada!`);
        }

        
// ---- Modal Cautela Rápida ----
        function openNewCustodyPickerModal() {
            if (!requireEditor()) return;
            custodyTargetIds = [];
            document.getElementById('custPickerWrap').classList.remove('hidden');
            document.getElementById('custPickerCode').value = '';
            document.getElementById('custModalTitle').innerHTML = '<svg class="vp-ico text-amber-300" aria-hidden="true"><use href="#i-handshake"/></svg> Nova Cautela Rápida';
            document.getElementById('custSummaryTitle').textContent = 'Digite o código acima para selecionar o instrumento';
            document.getElementById('custSummarySub').textContent = '-';
            document.getElementById('custReturnBanner').classList.add('hidden');
            document.getElementById('custHolderInp').value = '';
            document.getElementById('custReturnInp').value = '';
            document.getElementById('custStatusSel').value = '__KEEP__';
            document.getElementById('custDateInp').value = fmtBR(getTodayISO());
            document.getElementById('custReasonInp').value = '';
            document.getElementById('custReturnChips').innerHTML = '';
            document.getElementById('custMeBtn').textContent = currentAuth?.displayName ? `Eu (${currentAuth.displayName})` : 'Usar meu nome';
            document.getElementById('custodyModal').classList.remove('hidden');
            setTimeout(() => document.getElementById('custPickerCode').focus(), 40);
        }
        function lookupCustodyPicker() {
            const code = document.getElementById('custPickerCode').value.trim().toUpperCase();
            const found = instrumentsData.find(x => x.code.toUpperCase() === code);
            if (!found) {
                custodyTargetIds = [];
                document.getElementById('custSummaryTitle').textContent = code ? `Código "${code}" não encontrado.` : 'Digite um código válido.';
                document.getElementById('custSummarySub').textContent = '-';
                document.getElementById('custReturnBanner').classList.add('hidden');
                return;
            }
            populateCustodyModalForItems([found]);
        }
        function openBatchCustody() {
            if (!requireEditor()) return;
            const ids = instrumentsData.filter(i => selectedIds.has(i.id)).map(i => i.id);
            if (ids.length === 0) return;
            openCustodyModal(ids);
        }
        function openCustodyModal(ids) {
            if (!requireEditor()) return;
            const items = instrumentsData.filter(i => ids.includes(i.id));
            if (items.length === 0) return;
            document.getElementById('custPickerWrap').classList.add('hidden');
            populateCustodyModalForItems(items);
            document.getElementById('custodyModal').classList.remove('hidden');
        }
        function populateCustodyModalForItems(items) {
            custodyTargetIds = items.map(i => i.id);
            const isBatch = items.length > 1;
            const f = items[0];
            document.getElementById('custModalTitle').innerHTML = isBatch
                ? `<svg class="vp-ico text-amber-300" aria-hidden="true"><use href="#i-handshake"/></svg> Cautela em Lote (${items.length} itens)`
                : `<svg class="vp-ico text-amber-300" aria-hidden="true"><use href="#i-handshake"/></svg> Cautela — ${escapeHtml(f.code)}`;
            document.getElementById('custSummaryTitle').textContent = isBatch ? `${items.length} instrumentos selecionados` : `${f.code} — ${f.desc}`;
            document.getElementById('custSummarySub').textContent = isBatch ? items.map(i => i.code).slice(0,10).join(', ') : `Local: ${f.local || 'Sem local'} | Resp.: ${f.resp || '-'} | Status: ${calcStatus(f.proxCal, f.status)}`;
            document.getElementById('custMeBtn').textContent = currentAuth?.displayName ? `Eu (${currentAuth.displayName})` : 'Usar meu nome';

            const anyActive = items.some(i => i.custodyHolder && i.custodyHolder.trim());
            const rb = document.getElementById('custReturnBanner');
            if (anyActive) {
                rb.classList.remove('hidden');
                document.getElementById('custActiveSummary').innerHTML = isBatch
                    ? `Há cautelas ativas neste lote. Clique abaixo para encerrar todas e registrar devolução.`
                    : `Em posse de <strong>${escapeHtml(f.custodyHolder)}</strong> desde <strong>${fmtBR(f.custodyDate)}</strong>.<br>Devolver para: <strong>${escapeHtml(f.custodyReturnTo || f.local || f.resp || '-')}</strong>.`;
                document.getElementById('custResetStatusChk').checked = items.some(i => i.status === 'AGUARDANDO CALIBRAÇÃO' || i.status === 'EM REPARO');
            } else {
                rb.classList.add('hidden');
            }

            document.getElementById('custHolderInp').value = isBatch ? '' : (f.custodyHolder || '');
            document.getElementById('custReturnInp').value = isBatch ? '' : (f.custodyReturnTo || f.local || f.resp || '');
            document.getElementById('custStatusSel').value = '__KEEP__';
            document.getElementById('custDateInp').value = fmtBR((!isBatch && f.custodyDate) ? f.custodyDate : getTodayISO());
            document.getElementById('custReasonInp').value = isBatch ? '' : (f.custodyReason || '');

            const chips = [];
            if (!isBatch && f.local) chips.push(f.local);
            if (!isBatch && f.resp && f.resp !== f.local) chips.push(f.resp);
            document.getElementById('custReturnChips').innerHTML = chips.map(v => `<button type="button" onclick="document.getElementById('custReturnInp').value='${escapeHtml(v).replace(/'/g,"\\'")}'" class="px-2 py-0.5 rounded bg-[#EAF0F6] dark:bg-[#132846] text-[11px] font-semibold cursor-pointer">${escapeHtml(v)}</button>`).join('');
        }
        function closeCustodyModal() { document.getElementById('custodyModal').classList.add('hidden'); custodyTargetIds = []; }
        function fillCustodyMe() {
            const n = currentAuth?.displayName || currentAuth?.username || '';
            if (n) document.getElementById('custHolderInp').value = n;
        }
        function applyCustPreset(kind) {
            if (kind === 'CAL') { fillCustodyMe(); document.getElementById('custStatusSel').value = 'AGUARDANDO CALIBRAÇÃO'; document.getElementById('custReasonInp').value = 'Levando para calibração'; }
            else if (kind === 'REP') { fillCustodyMe(); document.getElementById('custStatusSel').value = 'EM REPARO'; document.getElementById('custReasonInp').value = 'Levando para reparo'; }
            else { document.getElementById('custStatusSel').value = '__KEEP__'; document.getElementById('custReasonInp').value = 'Empréstimo em bancada'; document.getElementById('custHolderInp').focus(); }
        }
        function saveCustodyModal() {
            if (!requireEditor()) return;
            const items = instrumentsData.filter(i => custodyTargetIds.includes(i.id));
            if (items.length === 0) { showToast('Selecione um instrumento válido.', 'error'); return; }
            const holder = document.getElementById('custHolderInp').value.trim();
            if (!holder) { showToast('Informe com quem está o instrumento.', 'error'); return; }
            const customRet = document.getElementById('custReturnInp').value.trim();
            const stChoice = document.getElementById('custStatusSel').value;
            const rawD = document.getElementById('custDateInp').value.trim();
            const iso = parseManualISO(rawD) || getTodayISO();
            const reason = document.getElementById('custReasonInp').value.trim();

            pushUndo(`Cautela (${items.length === 1 ? items[0].code : items.length + ' itens'})`);
            items.forEach(it => {
                const dest = customRet || it.local || it.resp || '';
                it.custodyHolder = holder; it.custodyReturnTo = dest; it.custodyDate = iso; it.custodyReason = reason;
                if (stChoice === 'AUTO') it.status = '';
                else if (stChoice !== '__KEEP__') it.status = stChoice;
                queueAudit({ module:'Cautela', action:'Registrar Posse', target:it.code, field:'Em Posse', before:'-', after:`${holder} → ${dest}`, details:`${it.code} em posse de ${holder} (${reason||'Cautela'})` });
            });
            items.forEach(invalidateInstMeta);
            DeltaTracker.markInstUpsert(items);
            if (items.length > 1) { selectedIds.clear(); updateBatchDock(); }
            persistAll(); renderAll(); closeCustodyModal();
            showToast(`Cautela registrada em posse de ${holder}!`, 'success', { canUndo:true });
        }
        function confirmCustodyReturn() {
            if (!requireEditor()) return;
            const items = instrumentsData.filter(i => custodyTargetIds.includes(i.id));
            if (items.length === 0) return;
            const resetSt = document.getElementById('custResetStatusChk').checked;
            pushUndo(`Devolução cautela (${items.length===1?items[0].code:items.length+' itens'})`);
            items.forEach(it => {
                const prev = it.custodyHolder || '-';
                const dest = it.custodyReturnTo || it.local || 'Origem';
                it.custodyHolder = ''; it.custodyReturnTo = ''; it.custodyDate = ''; it.custodyReason = '';
                if (resetSt) it.status = '';
                queueAudit({ module:'Cautela', action:'Devolução', target:it.code, field:'Em Posse', before:prev, after:`Devolvido p/ ${dest}`, details:`${it.code} devolvido por ${prev}` });
            });
            items.forEach(invalidateInstMeta);
            DeltaTracker.markInstUpsert(items);
            if (items.length > 1) { selectedIds.clear(); updateBatchDock(); }
            persistAll(); renderAll(); closeCustodyModal();
            showToast('Devolução registrada com sucesso!', 'success', { canUndo:true });
        }

        
// Modais Envio Externo & Retorno
        function openBatchExternalModal() {
            if (!requireEditor()) return;
            externalBatchIds = instrumentsData.filter(i => selectedIds.has(i.id)).map(i => i.id);
            if (externalBatchIds.length === 0) return;
            document.getElementById('extEditIdx').value = '-1';
            document.getElementById('extModalTitle').innerHTML = `<svg class="vp-ico text-[#00A8E8]" aria-hidden="true"><use href="#i-truck-ramp-box"/></svg> Envio em Lote (${externalBatchIds.length} itens)`;
            document.getElementById('extSingleCodeWrap').classList.add('hidden');
            const sb = document.getElementById('extBatchSummary');
            sb.classList.remove('hidden');
            sb.textContent = instrumentsData.filter(i => externalBatchIds.includes(i.id)).map(i => i.code).join(', ');
            document.getElementById('extDateEnvio').value = fmtBR(getTodayISO());
            document.getElementById('extDatePrev').value = fmtBR(addDaysISO(getTodayISO(), 15));
            document.getElementById('extLabInp').value = 'Labmetro Laboratórios';
            document.getElementById('extObsInp').value = '';
            document.getElementById('externalModal').classList.remove('hidden');
        }
        function openExternalModal(editIdx = -1) {
            if (!requireEditor()) return;
            externalBatchIds = [];
            document.getElementById('extEditIdx').value = editIdx;
            document.getElementById('extSingleCodeWrap').classList.remove('hidden');
            document.getElementById('extBatchSummary').classList.add('hidden');
            if (editIdx > -1) {
                const h = calibrationHistory[editIdx];
                document.getElementById('extModalTitle').textContent = 'Editar Envio Externo';
                document.getElementById('extCodeInp').value = h.code;
                document.getElementById('extCodeInfo').textContent = `${h.desc} (${h.setor})`;
                document.getElementById('extDateEnvio').value = fmtBR(h.dateEnvio);
                document.getElementById('extDatePrev').value = h.dateRetorno === 'Em Andamento' ? '' : fmtBR(h.dateRetorno);
                document.getElementById('extLabInp').value = h.lab;
                document.getElementById('extObsInp').value = h.obs;
            } else {
                document.getElementById('extModalTitle').textContent = 'Registrar Envio Externo';
                document.getElementById('extCodeInp').value = '';
                document.getElementById('extCodeInfo').textContent = '';
                document.getElementById('extDateEnvio').value = fmtBR(getTodayISO());
                document.getElementById('extDatePrev').value = fmtBR(addDaysISO(getTodayISO(), 15));
                document.getElementById('extLabInp').value = 'Labmetro Laboratórios';
                document.getElementById('extObsInp').value = '';
            }
            document.getElementById('externalModal').classList.remove('hidden');
        }
        function closeExternalModal() { document.getElementById('externalModal').classList.add('hidden'); externalBatchIds = []; }
        function lookupExtCode() {
            const c = document.getElementById('extCodeInp').value.trim().toUpperCase();
            const f = instrumentsData.find(x => x.code.toUpperCase() === c);
            document.getElementById('extCodeInfo').textContent = f ? `${f.desc} • ${f.setor}` : (c ? 'Código não encontrado na base ativa.' : '');
        }
        function saveExternalModal() {
            if (!requireEditor()) return;
            const dtE = parseManualISO(document.getElementById('extDateEnvio').value);
            const rawP = document.getElementById('extDatePrev').value.trim();
            const dtP = parseManualISO(rawP);
            if (!dtE) { showToast('Data de envio inválida.', 'error'); return; }
            if (rawP && !dtP) { showToast('Previsão de retorno inválida.', 'error'); return; }
            const lab = document.getElementById('extLabInp').value.trim() || 'Labmetro Laboratórios';
            const obs = document.getElementById('extObsInp').value.trim() || 'Enviado para calibração externa';

            if (externalBatchIds.length > 0) {
                const items = instrumentsData.filter(i => externalBatchIds.includes(i.id));
                pushUndo(`Envio em lote (${items.length} itens)`);
                items.forEach(it => {
                    const rec = { id: Date.now() + Math.floor(Math.random()*9999), dateEnvio:dtE, datePrev:dtP||'', dateRetorno:dtP||'Em Andamento', newCalDate:'', code:it.code, desc:it.desc, setor:it.setor, lab, obs, status:'EM TRÂNSITO' };
                    calibrationHistory.unshift(rec);
                    it.status = 'AGUARDANDO CALIBRAÇÃO';
                    invalidateInstMeta(it);
                    DeltaTracker.markInstUpsert(it);
                    DeltaTracker.markHistUpsert(rec);
                });
                queueAudit({ module:'Laboratório', action:'Envio em Lote', target:`${items.length} itens`, field:'Lab', before:'Ativos', after:lab, details:`Enviou ${items.length} itens p/ ${lab}` });
                selectedIds.clear(); updateBatchDock();
                persistAll(); renderAll(); closeExternalModal();
                showToast(`${items.length} itens enviados para ${lab}!`, 'success', { canUndo:true });
                return;
            }

            const editIdx = Number(document.getElementById('extEditIdx').value);
            const code = document.getElementById('extCodeInp').value.trim().toUpperCase();
            const it = instrumentsData.find(x => x.code.toUpperCase() === code);
            if (!it) { showToast('Informe um código existente na base ativa.', 'error'); return; }
            pushUndo(`Envio externo ${code}`);
            const rec = { id: editIdx>-1 ? (calibrationHistory[editIdx].id || Date.now()) : Date.now(), dateEnvio:dtE, datePrev:dtP||'', dateRetorno:dtP||'Em Andamento', newCalDate: editIdx>-1?(calibrationHistory[editIdx].newCalDate||''):'', code:it.code, desc:it.desc, setor:it.setor, lab, obs, status: editIdx>-1 ? calibrationHistory[editIdx].status : 'EM TRÂNSITO' };
            if (editIdx > -1) { calibrationHistory[editIdx] = rec; DeltaTracker.markHistUpsert(rec); }
            else { calibrationHistory.unshift(rec); it.status = 'AGUARDANDO CALIBRAÇÃO'; invalidateInstMeta(it); DeltaTracker.markInstUpsert(it); DeltaTracker.markHistUpsert(rec); }
            queueAudit({ module:'Laboratório', action:'Envio Externo', target:code, field:'Lab', before:'-', after:lab, details:`Registrou envio de ${code} p/ ${lab}` });
            persistAll(); renderAll(); closeExternalModal();
            showToast(`Envio de ${code} salvo!`, 'success', { canUndo:true });
        }

        function openReturnLabModal(idx) {
            if (!requireEditor()) return;
            const h = calibrationHistory[idx]; if (!h) return;
            document.getElementById('retLabIdx').value = idx;
            document.getElementById('retLabTitle').textContent = `${h.code} — ${h.desc}`;
            document.getElementById('retLabSub').textContent = `${h.lab} • Enviado em ${fmtBR(h.dateEnvio)}`;
            document.getElementById('retLabDate').value = fmtBR(getTodayISO());
            const instForCycle = instrumentsData.find(i => i.code.toUpperCase() === h.code.toUpperCase());
            const cycleM = instForCycle ? inferCycleMonths(instForCycle.desc, instForCycle.cycleMonths) : inferCycleMonths(h.desc, 12);
            const validInp = document.getElementById('retLabNewValid');
            const ct = document.getElementById('retLabCycleTag');
            if (cycleM === 0) {
                validInp.value = '';
                validInp.placeholder = 'DD/MM/AAAA (Manual)';
                if (ct) ct.textContent = '(Manual)';
                setTimeout(() => validInp.focus(), 40);
            } else {
                validInp.value = fmtBR(addMonthsISO(getTodayISO(), cycleM, true));
                validInp.placeholder = 'DD/MM/AAAA';
                if (ct) ct.textContent = `(Ciclo ${cycleM}m)`;
            }
            document.getElementById('retLabObs').value = (h.obs||'').replace(/\s*\(Nova validade:.*?\)/g,'').trim();
            const inst = instrumentsData.find(i => i.code.toUpperCase() === h.code.toUpperCase());
            const cb = document.getElementById('retLabCustBox');
            document.getElementById('retLabClearCustChk').checked = false;
            if (inst && inst.custodyHolder?.trim()) {
                cb.classList.remove('hidden');
                document.getElementById('retLabCustMsg').textContent = `Cautela ativa: em posse de ${inst.custodyHolder} → devolver p/ ${inst.custodyReturnTo || inst.local || 'origem'}`;
            } else cb.classList.add('hidden');
            document.getElementById('returnLabModal').classList.remove('hidden');
        }
        function closeReturnLabModal() { document.getElementById('returnLabModal').classList.add('hidden'); }
        function addReturnMonths(m) {
            const base = parseManualISO(document.getElementById('retLabDate').value) || getTodayISO();
            document.getElementById('retLabNewValid').value = fmtBR(addMonthsISO(base, m, true));
        }
        function confirmReturnLab() {
            if (!requireEditor()) return;
            const idx = Number(document.getElementById('retLabIdx').value);
            const h = calibrationHistory[idx]; if (!h) return;
            const dtRet = parseManualISO(document.getElementById('retLabDate').value) || getTodayISO();
            const dtVal = parseManualISO(document.getElementById('retLabNewValid').value);
            if (!dtVal) { showToast('Informe uma nova validade válida.', 'error'); return; }
            const obs = document.getElementById('retLabObs').value.trim();
            pushUndo(`Retorno lab ${h.code}`);
            h.dateRetorno = dtRet; h.newCalDate = dtVal; h.status = 'CONCLUÍDO';
            h.obs = obs ? `${obs} (Nova validade: ${fmtBR(dtVal)})` : `Calibrado (Nova validade: ${fmtBR(dtVal)})`;
            const inst = instrumentsData.find(i => i.code.toUpperCase() === h.code.toUpperCase());
            if (inst) {
                inst.proxCal = dtVal; inst.status = '';
                if (document.getElementById('retLabClearCustChk').checked) {
                    inst.custodyHolder = ''; inst.custodyReturnTo = ''; inst.custodyDate = ''; inst.custodyReason = '';
                }
            }
            queueAudit({ module:'Laboratório', action:'Retorno Calibração', target:h.code, field:'Validade', before:'-', after:fmtBR(dtVal), details:`Retorno de ${h.code} (${h.lab})` });
            DeltaTracker.markHistUpsert(h);
            if (inst) { invalidateInstMeta(inst); DeltaTracker.markInstUpsert(inst); }
            persistAll(); renderAll(); closeReturnLabModal();
            showToast(`Retorno de ${h.code} confirmado (Val.: ${fmtBR(dtVal)})!`, 'success', { canUndo:true });
        }
        function deleteHistoryRow(idx) {
            if (!requireEditor()) return;
            const h = calibrationHistory[idx];
            pushUndo(`Remover histórico ${h?.code||''}`);
            const removed = calibrationHistory.splice(idx, 1)[0];
            if (removed && removed.id) DeltaTracker.markHistDelete(removed.id);
            persistAll(); renderAll();
            showToast('Registro removido.', 'info', { canUndo:true });
        }

        // Perdidos Modal
        function openLostModal(idx = -1) {
            if (!requireEditor()) return;
            document.getElementById('lostIdx').value = idx;
            const l = idx > -1 ? lostInstrumentsData[idx] : { code:'', cc:'4311 F', desc:'', setor:'Voith Turbo (Ferroviária)', lastCal:'', obs:'' };
            document.getElementById('lostModalTitle').textContent = idx > -1 ? `Editar ${l.code}` : 'Cadastrar Perdido / Desativado';
            document.getElementById('lostCode').value = l.code || '';
            document.getElementById('lostCC').value = l.cc || '';
            document.getElementById('lostDesc').value = l.desc || '';
            document.getElementById('lostSetor').value = l.setor || '';
            document.getElementById('lostLastCal').value = l.lastCal ? fmtBR(l.lastCal) : '';
            document.getElementById('lostObs').value = l.obs || '';
            document.getElementById('lostModal').classList.remove('hidden');
        }
        function closeLostModal() { document.getElementById('lostModal').classList.add('hidden'); }
        function saveLostModal() {
            if (!requireEditor()) return;
            const idx = Number(document.getElementById('lostIdx').value);
            const code = document.getElementById('lostCode').value.trim().toUpperCase();
            const desc = document.getElementById('lostDesc').value.trim();
            if (!code || !desc) { showToast('Preencha Código e Descrição.', 'error'); return; }
            const rec = { id: idx>-1 ? lostInstrumentsData[idx].id : Date.now(), code, desc, cc: document.getElementById('lostCC').value.trim(), setor: document.getElementById('lostSetor').value.trim(), lastCal: parseManualISO(document.getElementById('lostLastCal').value) || '', obs: document.getElementById('lostObs').value.trim() };
            pushUndo(`Perdido ${code}`);
            if (idx > -1) lostInstrumentsData[idx] = rec; else lostInstrumentsData.unshift(rec);
            DeltaTracker.markLostUpsert(rec);
            queueAudit({ module:'Perdidos', action:idx>-1?'Edição':'Cadastro', target:code, field:'Registro', before:'-', after:rec.obs||'Perdido', details:`${code} em perdidos` });
            persistAll(); renderAll(); closeLostModal();
            showToast(`${code} salvo em Desativados/Perdidos.`, 'success', { canUndo:true });
        }
        function restoreLostItem(idx) {
            if (!requireEditor()) return;
            const l = lostInstrumentsData[idx]; if (!l) return;
            pushUndo(`Restaurar ${l.code}`);
            const rmL = lostInstrumentsData.splice(idx, 1)[0];
            const nid = instrumentsData.length ? Math.max(...instrumentsData.map(x => x.id)) + 1 : 1;
            const restored = normalizeInstrument({ id:nid, code:l.code, desc:l.desc, setor:canonicalizeSector(l.setor||'Voith Turbo (Industrial)'), cc:l.cc||'', local:'', resp:'', min:'', max:'', proxCal:l.lastCal||'', status:'', obs:`Restaurado de Perdidos (${l.obs||''})` }, nid);
            instrumentsData.unshift(restored);
            DeltaTracker.markInstUpsert(restored);
            if (rmL && rmL.id) DeltaTracker.markLostDelete(rmL.id);
            queueAudit({ module:'Perdidos', action:'Restauração', target:l.code, field:'Situação', before:'Perdido', after:'Base Ativa', details:`Restaurou ${l.code}` });
            persistAll(); renderAll();
            showToast(`${l.code} restaurado para o Inventário!`, 'success', { canUndo:true });
        }
        function deleteLostItem(idx) {
            if (!requireEditor()) return;
            const l = lostInstrumentsData[idx];
            pushUndo(`Remover perdido ${l?.code||''}`);
            const rmL = lostInstrumentsData.splice(idx, 1)[0];
            if (rmL && rmL.id) DeltaTracker.markLostDelete(rmL.id);
            persistAll(); renderAll();
            showToast('Registro excluído.', 'info', { canUndo:true });
        }

        // ---- Spotlight Command Palette (Ctrl+K) ----
        function openCommandPalette() {
            document.getElementById('cmdPaletteModal').classList.remove('hidden');
            const inp = document.getElementById('cmdSearchInput');
            inp.value = ''; cmdSelectedIdx = 0;
            renderCommandPalette();
            setTimeout(() => inp.focus(), 30);
        }
        function closeCommandPalette() { document.getElementById('cmdPaletteModal').classList.add('hidden'); }
        function renderCommandPalette() {
            const qRaw = (document.getElementById('cmdSearchInput').value || '').trim();
            const q = normSearch(qRaw), qComp = normCompact(qRaw);
            cmdResults = [];

            // 1. Instrumentos
            const instMatches = instrumentsData.filter(i => !q || matchesQuery(getInstMeta(i).hay, getInstMeta(i).hayCompact, q, qComp)).slice(0, q ? 8 : 4);
            instMatches.forEach(i => {
                const st = calcStatus(i.proxCal, i.status);
                cmdResults.push({
                    group: 'Instrumentos',
                    icon: 'gauge-high',
                    title: `${i.code} — ${i.desc}`,
                    sub: `${st} • ${i.local || 'Sem local'}${i.custodyHolder ? ` • Em posse: ${i.custodyHolder}` : ''}`,
                    run: () => { closeCommandPalette(); openInspectorModal(i.id); }
                });
            });

            // 2. Armários
            const locs = [...new Set(instrumentsData.map(i => i.local).filter(Boolean))].filter(l => !q || matchesQuery(normSearch(l), normCompact(l), q, qComp)).slice(0, 4);
            locs.forEach(l => cmdResults.push({
                group: 'Armários & Bancadas',
                icon: 'location-dot',
                title: l,
                sub: `Filtrar inventário por ${l}`,
                run: () => { closeCommandPalette(); jumpToInventoryFilter({ local: l }); }
            }));

            // 3. Ações Rápidas
            const actions = [
                { title:'Imprimir Folha Porta de Armário', sub:'Gerar folha pronta para plastificar', icon:'print', run:() => { closeCommandPalette(); openPrintModal('CABINET'); } },
                { title:'Abrir Quadro Público de Cautelas', sub:'Ver instrumentos em posse no campo', icon:'handshake', run:() => { closeCommandPalette(); navigateTo('custody'); } },
                { title:'Copiar Resumo de Vencidos (Teams/WhatsApp)', sub:'Texto pronto para cobrança', icon:'copy', run:() => { closeCommandPalette(); copySummaryReport('OVERDUE'); } },
                { title:'Alternar Modo Escuro / Claro', sub:'Trocar tema da interface', icon:'moon', run:() => { closeCommandPalette(); toggleTheme(); } }
            ];
            if (isEditor()) actions.unshift({ title:'Cadastrar Novo Instrumento', sub:'Abrir ficha em branco', icon:'plus', run:() => { closeCommandPalette(); openInspectorModal(-1); } });
            actions.filter(a => !q || normSearch(`${a.title} ${a.sub}`).includes(q)).forEach(a => cmdResults.push({ group:'Ações', ...a }));

            if (cmdSelectedIdx >= cmdResults.length) cmdSelectedIdx = 0;
            const list = document.getElementById('cmdResultsList');
            if (cmdResults.length === 0) {
                list.innerHTML = '<div class="p-6 text-center text-xs text-slate-400">Nenhum resultado encontrado.</div>';
                return;
            }
            list.innerHTML = cmdResults.map((r, i) => `
                <button type="button" onclick="executeCmdResult(${i})" class="w-full px-3.5 py-2.5 rounded-xl flex items-center justify-between gap-3 text-left cursor-pointer transition ${i===cmdSelectedIdx?'bg-[#004C97] text-white':'hover:bg-[#F3F6FA] dark:hover:bg-[#132846]'}">
                    <div class="flex items-center gap-3 min-w-0">
                        ${svgIcon(r.icon, `w-4 text-center ${i===cmdSelectedIdx?'text-[#00A8E8]':'text-[#004C97] dark:text-[#00A8E8]'}`)}
                        <div class="min-w-0">
                            <div class="text-xs font-bold truncate">${escapeHtml(r.title)}</div>
                            <div class="text-[11px] truncate ${i===cmdSelectedIdx?'text-sky-200':'text-slate-500'}">${escapeHtml(r.sub)}</div>
                        </div>
                    </div>
                    <span class="text-[10px] font-bold uppercase tracking-wider shrink-0 ${i===cmdSelectedIdx?'text-sky-200':'text-slate-400'}">${r.group}</span>
                </button>`).join('');
        }
        function executeCmdResult(idx) { if (cmdResults[idx]) cmdResults[idx].run(); }
        function handleCmdKeydown(e) {
            if (e.key === 'ArrowDown') { e.preventDefault(); cmdSelectedIdx = (cmdSelectedIdx + 1) % Math.max(1, cmdResults.length); renderCommandPalette(); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); cmdSelectedIdx = (cmdSelectedIdx - 1 + Math.max(1, cmdResults.length)) % Math.max(1, cmdResults.length); renderCommandPalette(); }
            else if (e.key === 'Enter' && cmdResults[cmdSelectedIdx]) { e.preventDefault(); cmdResults[cmdSelectedIdx].run(); }
        }

        // ---- Copiar Resumo / Cobrança (Teams / WhatsApp / E-mail) ----
        function copyToClipboard(text, successMsg) {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(() => showToast(successMsg, 'success')).catch(() => fallbackCopy(text, successMsg));
            } else fallbackCopy(text, successMsg);
        }
        function fallbackCopy(text, successMsg) {
            const ta = document.createElement('textarea'); ta.value = text;
            document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
            showToast(successMsg, 'success');
        }
        function copySummaryReport(mode, param = '') {
            let title = '', list = [];
            if (mode === 'OVERDUE') {
                list = instrumentsData.filter(i => calcStatus(i.proxCal, i.status) === 'VENCIDA');
                title = `⚠️ *VOITH TURBO — Instrumentos Vencidos (${list.length})* • Ref. ${fmtBR(currentRefISO)}`;
            } else if (mode === 'TECH') {
                list = instrumentsData.filter(i => i.resp === param && ['VENCIDA','PRÓXIMA DO VENCIMENTO'].includes(calcStatus(i.proxCal, i.status)));
                title = `📋 *VOITH TURBO — Pendências de ${param} (${list.length} itens)*`;
            } else if (mode === 'CUSTODY') {
                list = instrumentsData.filter(i => i.custodyHolder?.trim());
                title = `🤝 *VOITH TURBO — Instrumentos em Cautela / Posse (${list.length})*`;
            } else if (mode === 'HOLDER') {
                list = instrumentsData.filter(i => i.custodyHolder?.trim() === param);
                title = `🤝 *Cobrança de Cautela — ${param} (${list.length} item/ns)*`;
            } else {
                list = filteredInv.slice(0, 60);
                title = `📋 *VOITH TURBO — Lista Filtrada (${filteredInv.length} itens)*`;
            }
            if (list.length === 0) { showToast('Nenhum item nessa categoria para copiar.', 'info'); return; }
            const lines = list.map(i => {
                if (mode === 'CUSTODY' || mode === 'HOLDER') {
                    return `• ${i.code} — ${i.desc} | Posse: ${i.custodyHolder} → Devolver p/: ${i.custodyReturnTo || i.local || 'Origem'} (${fmtBR(i.custodyDate)})`;
                }
                return `• ${i.code} — ${i.desc} | ${calcStatus(i.proxCal, i.status)} (Val.: ${fmtBR(i.proxCal)}) | Local: ${i.local || 'Sem local'}`;
            });
            copyToClipboard(`${title}\n${lines.join('\n')}`, 'Resumo formatado copiado! Cole no Teams, WhatsApp ou E-mail.');
        }

        // ---- Importação Inteligente (.XLS / Excel Paste) com Prévia Diff ----
        function openPasteImportModal() {
            if (!requireEditor()) return;
            pendingImportItems = [];
            document.getElementById('importPasteWrap').classList.remove('hidden');
            document.getElementById('importPasteArea').value = '';
            document.getElementById('importDiffBox').classList.add('hidden');
            document.getElementById('btnConfirmImport').disabled = true;
            document.getElementById('importReplaceAllChk').checked = false;
            document.getElementById('importModal').classList.remove('hidden');
        }
        function closeImportModal() { document.getElementById('importModal').classList.add('hidden'); pendingImportItems = []; }
        function showDiffForItems(parsed) {
            pendingImportItems = parsed;
            const existingCodes = new Set(instrumentsData.map(i => i.code.toUpperCase()));
            const newCodes = new Set(parsed.map(i => i.code.toUpperCase()));
            let nNew = 0, nUpd = 0, nMiss = 0;
            parsed.forEach(p => { if (existingCodes.has(p.code.toUpperCase())) nUpd++; else nNew++; });
            existingCodes.forEach(c => { if (!newCodes.has(c)) nMiss++; });
            document.getElementById('diffNewCount').textContent = nNew;
            document.getElementById('diffUpdCount').textContent = nUpd;
            document.getElementById('diffMissingCount').textContent = nMiss;
            document.getElementById('importDiffBox').classList.toggle('hidden', parsed.length === 0);
            document.getElementById('btnConfirmImport').disabled = parsed.length === 0;
        }
        function analyzePastePreview() {
            const txt = document.getElementById('importPasteArea').value;
            showDiffForItems(parseTsvData(txt, 1));
        }
        function ensureSheetJs() {
            if (typeof XLSX !== 'undefined') return Promise.resolve();
            if (sheetJsLoadPromise) return sheetJsLoadPromise;
            sheetJsLoadPromise = new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = 'https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js';
                s.onload = () => resolve();
                s.onerror = () => { sheetJsLoadPromise = null; reject(new Error('Falha ao carregar leitor de Excel.')); };
                document.head.appendChild(s);
            });
            return sheetJsLoadPromise;
        }
        async function handleImportFileSelect(ev) {
            if (!requireEditor()) { ev.target.value = ''; return; }
            const file = ev.target.files[0]; if (!file) return;
            if (typeof XLSX === 'undefined') showToast('Carregando leitor de Excel...', 'info');
            try {
                await ensureSheetJs();
            } catch {
                showToast('Sem conexão para carregar o leitor .XLSX.', 'error');
                ev.target.value = '';
                return;
            }
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const wb = XLSX.read(new Uint8Array(e.target.result), { type:'array' });
                    const ws = wb.Sheets[wb.SheetNames[0]];
                    const rows = XLSX.utils.sheet_to_json(ws, { header:1, raw:false });
                    const tsv = rows.map(r => r.map(c => String(c ?? '').replace(/\t|\r?\n/g,' ')).join('\t')).join('\n');
                    const parsed = parseTsvData(tsv, 1);
                    if (parsed.length === 0) { showToast('Nenhum instrumento válido encontrado no arquivo.', 'error'); return; }
                    document.getElementById('importPasteWrap').classList.add('hidden');
                    document.getElementById('importReplaceAllChk').checked = false;
                    showDiffForItems(parsed);
                    document.getElementById('importModal').classList.remove('hidden');
                } catch { showToast('Erro ao ler a planilha.', 'error'); }
                ev.target.value = '';
            };
            reader.readAsArrayBuffer(file);
        }
        function confirmPendingImport() {
            if (!requireEditor() || pendingImportItems.length === 0) return;
            const replaceAll = document.getElementById('importReplaceAllChk').checked;
            pushUndo(`Importação (${pendingImportItems.length} itens)`);
            if (replaceAll) {
                instrumentsData = pendingImportItems.map((it, idx) => ({ ...it, id: idx + 1 }));
            } else {
                const map = new Map(instrumentsData.map(i => [i.code.toUpperCase(), i]));
                let maxId = instrumentsData.length ? Math.max(...instrumentsData.map(i => i.id)) : 0;
                pendingImportItems.forEach(p => {
                    const ex = map.get(p.code.toUpperCase());
                    if (ex) {
                        Object.assign(ex, { desc:p.desc, cc:p.cc||ex.cc, setor:p.setor||ex.setor, local:p.local||ex.local, resp:p.resp||ex.resp, min:p.min||ex.min, max:p.max||ex.max, proxCal:p.proxCal||ex.proxCal, status:p.status||ex.status, obs:p.obs||ex.obs });
                    } else {
                        maxId++;
                        instrumentsData.push({ ...p, id: maxId });
                    }
                });
            }
            queueAudit({ module:'Importação', action:replaceAll?'Substituição':'Mesclagem', target:`${pendingImportItems.length} itens`, field:'Base', before:'-', after:`Total ${instrumentsData.length}`, details:`Importou ${pendingImportItems.length} registros` });
            persistAll({ full: true }); renderAll(); closeImportModal();
            showToast(`Importação concluída (${instrumentsData.length} instrumentos na base)!`, 'success', { canUndo:true });
        }

        // ---- Impressão PDF (Folha Porta de Armário & Auditoria ISO) ----
        function filterPrintItems(loc, sec, resp, month, status) {
            return instrumentsData.filter(i => {
                if (loc && !(i.local||'').toLowerCase().includes(loc.toLowerCase())) return false;
                if (sec && !i.setor.includes(sec)) return false;
                if (resp && i.resp !== resp) return false;
                if (month && !(i.proxCal && i.proxCal.startsWith(month))) return false;
                if (status) {
                    const st = calcStatus(i.proxCal, i.status);
                    if (status === '__URGENT__') {
                        if (st !== 'VENCIDA' && st !== 'PRÓXIMA DO VENCIMENTO') return false;
                    } else if (st !== status) {
                        return false;
                    }
                }
                return true;
            });
        }
        function updatePrintPreviewCount() {
            const loc = (document.getElementById('printLocalInp')?.value || '').trim();
            const sec = document.getElementById('printSetorSel')?.value || '';
            const resp = document.getElementById('printRespSel')?.value || '';
            const month = document.getElementById('printMonthSel')?.value || '';
            const status = document.getElementById('printStatusSel')?.value || '';
            const items = filterPrintItems(loc, sec, resp, month, status);
            const cntEl = document.getElementById('printPreviewCount');
            const btn = document.getElementById('printExecuteBtn');
            if (cntEl) {
                cntEl.textContent = `${items.length} ${items.length === 1 ? 'item selecionado' : 'itens selecionados'}`;
                cntEl.className = items.length === 0
                    ? 'font-mono text-xs font-bold text-rose-600 dark:text-rose-400'
                    : 'font-mono text-xs font-bold text-[#004C97] dark:text-[#00A8E8]';
            }
            if (btn) btn.disabled = items.length === 0;
        }
        function applyPrintQuickPreset(kind) {
            const mSel = document.getElementById('printMonthSel');
            const sSel = document.getElementById('printStatusSel');
            const chk = document.getElementById('printChecklistChk');
            if (kind === 'CLEAR') {
                mSel.value = ''; sSel.value = '';
                document.getElementById('printLocalInp').value = '';
                document.getElementById('printSetorSel').value = '';
                document.getElementById('printRespSel').value = '';
                if (chk) chk.checked = false;
            } else if (kind === '__THIS_MONTH__') {
                const curYM = (currentRefISO || getTodayISO()).slice(0, 7);
                const hasOpt = [...mSel.options].some(o => o.value === curYM);
                mSel.value = hasOpt ? curYM : '';
                sSel.value = '';
                if (chk) chk.checked = true;
                if (!hasOpt) showToast('Não há vencimentos cadastrados no mês atual.', 'info');
            } else {
                sSel.value = kind;
                if (chk) chk.checked = true;
            }
            updatePrintPreviewCount();
        }
        function openPrintModalFromInventory(tpl = 'CABINET') {
            const locVal = document.getElementById('fLocal')?.value || '';
            openPrintModal(tpl, {
                local: locVal === '__NONE__' ? '' : locVal,
                setor: document.getElementById('fSetor')?.value || '',
                resp: document.getElementById('fResp')?.value || '',
                month: document.getElementById('fMonth')?.value || '',
                status: document.getElementById('fStatus')?.value || ''
            });
        }
        function openPrintModal(tpl = 'CABINET', preset = {}) {
            if (tpl === 'ISO' && !requireEditor()) return;
            document.getElementById('printTplSel').value = tpl;
            document.getElementById('printLocalInp').value = preset.local || '';
            document.getElementById('printSetorSel').value = preset.setor || '';
            document.getElementById('printRespSel').value = preset.resp || '';
            document.getElementById('printMonthSel').value = preset.month || '';
            document.getElementById('printStatusSel').value = preset.status || '';
            document.getElementById('printChecklistChk').checked = Boolean(preset.month || preset.status);
            document.getElementById('printModalTitle').innerHTML = tpl === 'CABINET'
                ? '<svg class="vp-ico text-[#00A8E8]" aria-hidden="true"><use href="#i-print"/></svg> Folha Porta de Armário / Recolhimento'
                : '<svg class="vp-ico text-rose-400" aria-hidden="true"><use href="#i-file-pdf"/></svg> Relatório Oficial Auditoria ISO';
            updatePrintPreviewCount();
            document.getElementById('printModal').classList.remove('hidden');
        }
        function closePrintModal() { document.getElementById('printModal').classList.add('hidden'); }
        function quickPrintCabinet(loc) { executePrintDocument('CABINET', loc, '', '', '', '', false); }
        function quickPrintResp(resp) { if (!requireEditor()) return; executePrintDocument('ISO', '', '', resp, '', '', false); }
        function executePrintDocument(forceTpl, forceLoc, forceSetor, forceResp, forceMonth, forceStatus, forceChecklist) {
            const tpl = forceTpl || (isEditor() ? document.getElementById('printTplSel').value : 'CABINET');
            const loc = (forceLoc !== undefined ? forceLoc : document.getElementById('printLocalInp').value).trim();
            const sec = forceSetor !== undefined ? forceSetor : document.getElementById('printSetorSel').value;
            const resp = forceResp !== undefined ? forceResp : document.getElementById('printRespSel').value;
            const month = forceMonth !== undefined ? forceMonth : (document.getElementById('printMonthSel')?.value || '');
            const status = forceStatus !== undefined ? forceStatus : (document.getElementById('printStatusSel')?.value || '');
            const withCheck = forceChecklist !== undefined ? Boolean(forceChecklist) : Boolean(document.getElementById('printChecklistChk')?.checked);

            const items = filterPrintItems(loc, sec, resp, month, status);
            if (items.length === 0) { showToast('Nenhum instrumento encontrado para esses filtros.', 'error'); return; }
            closePrintModal();

            const w = window.open('', '_blank');
            if (!w) { showToast('Permita pop-ups para gerar o PDF.', 'error'); return; }

            const mNames = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
            const monthLabel = month ? `${mNames[Number(month.split('-')[1])-1]}/${month.split('-')[0]}` : '';
            const statusLabels = { 'VENCIDA':'Somente Vencidos', '__URGENT__':'Vencidos + Próx. 30d', 'PRÓXIMA DO VENCIMENTO':'Próx. 30 dias', 'EM DIA':'Em Dia', 'AGUARDANDO CALIBRAÇÃO':'Aguardando Calibração', 'EM REPARO':'Em Reparo', 'PENDÊNCIA DE DATA':'Pendência de Data' };
            const filterParts = [];
            if (monthLabel) filterParts.push(`Mês: ${monthLabel}`);
            if (status) filterParts.push(`Status: ${statusLabels[status] || status}`);
            if (loc) filterParts.push(`Local: ${loc}`);
            if (sec) filterParts.push(`Setor: ${sec.replace('Voith Turbo ', '')}`);
            if (resp) filterParts.push(`Resp.: ${resp}`);

            const title = tpl === 'CABINET'
                ? (withCheck && !loc ? `CHECKLIST DE RECOLHIMENTO P/ CALIBRAÇÃO${monthLabel ? ' — ' + monthLabel.toUpperCase() : ''}` : `INVENTÁRIO PORTA DE ARMÁRIO — ${loc || (monthLabel ? monthLabel.toUpperCase() : 'GERAL')}`)
                : 'RELATÓRIO OFICIAL DE CONTROLE METROLÓGICO (ISO)';

            const rowsHtml = items.map(i => {
                const st = calcStatus(i.proxCal, i.status);
                const c = st==='VENCIDA'?'#DC2626':st==='PRÓXIMA DO VENCIMENTO'?'#D97706':st==='EM DIA'?'#059669':'#004C97';
                const locHtml = `${escapeHtml(i.local || 'Sem local')}${i.custodyHolder ? `<br><span style="font-size:9px;color:#B45309;font-weight:700">Posse: ${escapeHtml(i.custodyHolder)}</span>` : ''}`;
                return `<tr>
                    ${withCheck ? '<td style="text-align:center;font-size:14px;width:24px;color:#475569">☐</td>' : ''}
                    <td style="font-family:monospace;font-weight:700;color:#004C97">${escapeHtml(i.code)}</td>
                    <td><strong>${escapeHtml(i.desc)}</strong>${i.max?`<br><span style="font-size:10px;color:#555">Faixa: ${escapeHtml(i.min||'0')} a ${escapeHtml(i.max)}</span>`:''}</td>
                    <td>${locHtml}</td>
                    <td>${escapeHtml(i.resp||'-')}</td>
                    <td style="font-family:monospace;font-weight:700">${fmtBR(i.proxCal)}</td>
                    <td style="font-weight:700;color:${c}">${st}</td>
                </tr>`;
            }).join('');

            w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${escapeHtml(title)}</title>
            <style>
                body{font-family:Arial,sans-serif;color:#0F172A;margin:24px;font-size:11px}
                .hdr{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #004C97;padding-bottom:12px;margin-bottom:14px}
                .brand{font-size:22px;font-weight:800;letter-spacing:3px;color:#004C97}
                .flt{background:#F1F5F9;border:1px solid #CBD5E1;border-radius:6px;padding:6px 10px;margin-bottom:12px;font-size:10px;color:#334155}
                table{width:100%;border-collapse:collapse}
                th{background:#004C97;color:#fff;text-align:left;padding:7px 8px;font-size:10px;text-transform:uppercase}
                td{border-bottom:1px solid #CBD5E1;padding:6px 8px;vertical-align:top}
                tr:nth-child(even){background:#F8FAFC}
                .ftr{margin-top:24px;display:flex;justify-content:space-between;font-size:10px;color:#64748B;border-top:1px solid #CBD5E1;padding-top:10px}
                @media print{body{margin:10mm}}
            </style></head><body>
                <div class="hdr">
                    <div><div class="brand">VOITH <span style="color:#00A8E8;font-size:12px;letter-spacing:1px">TURBO</span></div><div style="font-weight:700;font-size:13px;margin-top:4px">${escapeHtml(title)}</div></div>
                    <div style="text-align:right;font-size:10px;color:#475569">Emissão: <strong>${fmtBR(getTodayISO())}</strong><br>Ref.: <strong>${fmtBR(currentRefISO)}</strong> • Total: <strong>${items.length} itens</strong></div>
                </div>
                ${filterParts.length ? `<div class="flt"><strong>Filtros aplicados:</strong> ${escapeHtml(filterParts.join('  •  '))}</div>` : ''}
                <table><thead><tr>${withCheck?'<th style="text-align:center;width:24px">OK</th>':''}<th>Código</th><th>Instrumento / Faixa</th><th>Local</th><th>Responsável</th><th>Validade</th><th>Status</th></tr></thead><tbody>${rowsHtml}</tbody></table>
                <div class="ftr"><span>Voith Turbo — Controle Metrológico</span><span>Conferido por: ___________________________ Data: ___/___/_____</span></div>
                <script>window.onload=function(){window.print();}<\/script>
            </body></html>`);
            w.document.close();
        }

        // ---- Export CSV, Backup JSON, Offline HTML ----
        function exportCSV() {
            if (!requireEditor()) return;
            let csv = "\uFEFFCodigo;Descricao;FaixaMin;FaixaMax;Setor;CC;Localizacao;Responsavel;ProximaCalibracao;Status;EmPosseDe;DevolverPara;DataCautela;MotivoCautela;Observacoes\n";
            instrumentsData.forEach(r => {
                csv += `${r.code};"${r.desc}";"${r.min||''}";"${r.max||''}";"${r.setor}";"${r.cc||''}";"${r.local||''}";"${r.resp||''}";${fmtBR(r.proxCal)};${calcStatus(r.proxCal,r.status)};"${r.custodyHolder||''}";"${r.custodyReturnTo||''}";"${r.custodyDate?fmtBR(r.custodyDate):''}";"${r.custodyReason||''}";"${r.obs||''}"\n`;
            });
            downloadBlob(csv, `voith_metrologia_${getTodayISO()}.csv`, 'text/csv;charset=utf-8;');
        }
        function openBackupModal() { if (requireEditor()) document.getElementById('backupModal').classList.remove('hidden'); }
        function closeBackupModal() { document.getElementById('backupModal').classList.add('hidden'); }
        function downloadJsonBackup() {
            const data = JSON.stringify({ exportedAt: new Date().toISOString(), instrumentsData, calibrationHistory, lostInstrumentsData }, null, 2);
            downloadBlob(data, `backup_voith_metrologia_${getTodayISO()}.json`, 'application/json');
            showToast('Backup JSON baixado!', 'success');
        }
        function restoreJsonBackup(ev) {
            const f = ev.target.files[0]; if (!f) return;
            const r = new FileReader();
            r.onload = (e) => {
                try {
                    const d = JSON.parse(e.target.result);
                    if (!Array.isArray(d.instrumentsData)) throw new Error();
                    pushUndo('Restauração de Backup JSON');
                    instrumentsData = d.instrumentsData;
                    if (Array.isArray(d.calibrationHistory)) calibrationHistory = d.calibrationHistory;
                    if (Array.isArray(d.lostInstrumentsData)) lostInstrumentsData = d.lostInstrumentsData;
                    persistAll({ full: true }); renderAll(); closeBackupModal();
                    showToast(`Backup restaurado (${instrumentsData.length} itens)!`, 'success', { canUndo:true });
                } catch { showToast('Arquivo de backup inválido.', 'error'); }
                ev.target.value = '';
            };
            r.readAsText(f);
        }
        function downloadOfflineHtml() {
            if (!requireEditor()) return;
            const tsv = instrumentsData.map(i => [i.code,i.desc,i.proxCal||i.obs||'',calcStatus(i.proxCal,i.status),i.cc||'',i.setor||'',i.local||'',i.resp||'',i.min||'',i.max||'',i.obs||''].join('\t')).join('\n');
            downloadBlob(tsv, `seed_voith_${getTodayISO()}.tsv`, 'text/tab-separated-values;charset=utf-8');
            showToast('Arquivo seed.tsv atualizado exportado!', 'success');
        }
        function downloadBlob(content, filename, mime) {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob([content], { type: mime }));
            a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a);
        }

        

// ---- Modal V11: Retorno em Lote do Laboratório ----
function openBatchReturnLabModal() {
    if (!requireEditor()) return;
    const items = calibrationHistory.filter(h => h.status !== 'CONCLUÍDO' && labSelectedIds.has(h.id));
    if (items.length === 0) {
        showToast('Selecione ao menos 1 instrumento em trânsito.', 'error');
        return;
    }
    document.getElementById('brLabSummaryTitle').textContent = `${items.length} instrumento(s) selecionado(s) para retorno`;
    document.getElementById('brLabCodesList').textContent = items.map(h => h.code).join(', ');
    document.getElementById('brLabDate').value = fmtBR(getTodayISO());
    document.getElementById('brLabFixedValid').value = fmtBR(addMonthsISO(getTodayISO(), 12, true));
    document.getElementById('brLabUseCycleChk').checked = true;
    document.getElementById('brLabObs').value = '';
    document.getElementById('brLabClearCustChk').checked = false;
    toggleBatchReturnCycleMode();
    document.getElementById('batchReturnLabModal').classList.remove('hidden');
}
function closeBatchReturnLabModal() {
    const m = document.getElementById('batchReturnLabModal');
    if (m) m.classList.add('hidden');
}
function hasManualCycleInBatch(items) {
    return items.some(h => {
        const inst = instrumentsData.find(i => i.code.toUpperCase() === h.code.toUpperCase());
        return inst && inferCycleMonths(inst.desc, inst.cycleMonths) === 0;
    });
}
function toggleBatchReturnCycleMode() {
    const useCycle = document.getElementById('brLabUseCycleChk').checked;
    const items = calibrationHistory.filter(h => h.status !== 'CONCLUÍDO' && labSelectedIds.has(h.id));
    const hasManual = hasManualCycleInBatch(items);
    const wrap = document.getElementById('brLabFixedValidWrap');
    const lbl = document.getElementById('brLabFixedValidLabel');
    if (wrap) wrap.classList.toggle('hidden', useCycle && !hasManual);
    if (lbl) lbl.textContent = (useCycle && hasManual) ? 'Validade p/ Itens Manuais *' : 'Validade Fixa p/ Todos *';
}
function confirmBatchReturnLab() {
    if (!requireEditor()) return;
    const items = calibrationHistory.filter(h => h.status !== 'CONCLUÍDO' && labSelectedIds.has(h.id));
    if (items.length === 0) return;

    const retISO = parseManualISO(document.getElementById('brLabDate').value) || getTodayISO();
    const useCycle = document.getElementById('brLabUseCycleChk').checked;
    const needsFixed = !useCycle || hasManualCycleInBatch(items);
    let fixedISO = '';
    if (needsFixed) {
        fixedISO = parseManualISO(document.getElementById('brLabFixedValid').value);
        if (!fixedISO) { showToast('Informe uma validade válida (DD/MM/AAAA).', 'error'); return; }
    }
    const extraObs = document.getElementById('brLabObs').value.trim();
    const clearCust = document.getElementById('brLabClearCustChk').checked;

    pushUndo(`Retorno em lote (${items.length} itens)`);
    const updInst = [];
    items.forEach(h => {
        const inst = instrumentsData.find(i => i.code.toUpperCase() === h.code.toUpperCase());
        const cycleM = inst ? inferCycleMonths(inst.desc, inst.cycleMonths) : inferCycleMonths(h.desc, 12);
        const newValidISO = (useCycle && cycleM > 0) ? addMonthsISO(retISO, cycleM, true) : fixedISO;

        h.dateRetorno = retISO;
        h.newCalDate = newValidISO;
        h.status = 'CONCLUÍDO';
        const baseObs = (h.obs || '').replace(/\s*\(Nova validade:.*?\)/g, '').trim();
        h.obs = [baseObs, extraObs].filter(Boolean).join(' • ') + ` (Nova validade: ${fmtBR(newValidISO)})`;

        if (inst) {
            inst.proxCal = newValidISO;
            inst.status = '';
            if (clearCust) {
                inst.custodyHolder = '';
                inst.custodyReturnTo = '';
                inst.custodyDate = '';
                inst.custodyReason = '';
            }
            invalidateInstMeta(inst);
            updInst.push(inst);
        }
    });

    DeltaTracker.markHistUpsert(items);
    if (updInst.length) DeltaTracker.markInstUpsert(updInst);
    queueAudit({
        module:'Laboratório', action:'Retorno em Lote', target:`${items.length} itens`,
        field:'Validade', before:'EM TRÂNSITO', after:'EM DIA',
        details:`Retorno em lote: ${items.map(x => x.code).join(', ')}`
    });
    labSelectedIds.clear();
    persistAll();
    closeBatchReturnLabModal();
    renderAll();
    showToast(`${items.length} instrumento(s) retornado(s) e atualizado(s) p/ EM DIA!`, 'success', { canUndo:true });
}

// ---- Gesto Touch: Arrastar Gaveta Inspector p/ Direita para Fechar (Mobile) ----
function initInspectorSwipeGesture() {
    const panel = document.getElementById('inspectorPanel');
    if (!panel) return;
    let startX = 0, startY = 0, dx = 0, dragging = false;

    panel.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        dx = 0; dragging = false;
    }, { passive: true });

    panel.addEventListener('touchmove', (e) => {
        if (e.touches.length !== 1) return;
        const curX = e.touches[0].clientX - startX;
        const curY = e.touches[0].clientY - startY;
        if (!dragging) {
            if (curX > 18 && Math.abs(curX) > Math.abs(curY) * 1.4) {
                dragging = true;
                panel.classList.add('is-dragging');
            } else {
                return;
            }
        }
        dx = Math.max(0, curX);
        panel.style.transform = `translate3d(${dx}px, 0, 0)`;
    }, { passive: true });

    const finishDrag = () => {
        if (!dragging) return;
        dragging = false;
        panel.classList.remove('is-dragging');
        if (dx > 80) {
            panel.style.transform = '';
            closeInspectorModal();
        } else {
            panel.style.transform = '';
        }
        dx = 0;
    };
    panel.addEventListener('touchend', finishDrag, { passive: true });
    panel.addEventListener('touchcancel', finishDrag, { passive: true });
}

// ---- Atalhos Globais de Teclado (Ctrl+K, Ctrl+Z, Ctrl+Shift+A Oculto, ↑/↓/Enter, Esc) ----
document.addEventListener('click', e => {
    const sm = document.getElementById('systemMenuWrap');
    if (sm && !sm.contains(e.target)) closeSystemMenu();
});
document.addEventListener('keydown', e => {
    const k = String(e.key || '').toLowerCase();
    const tag = document.activeElement?.tagName?.toUpperCase() || '';
    const inField = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag);

    if ((e.ctrlKey || e.metaKey) && k === 'k') {
        e.preventDefault(); openCommandPalette(); return;
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && k === 'a') {
        if (isAdmin()) { e.preventDefault(); openAuditVaultModal(); }
        return;
    }
    if (e.altKey && k === 'h' && !document.getElementById('inspectorOverlay').classList.contains('hidden')) {
        if (isAdmin()) { e.preventDefault(); toggleInspectorItemAudit(); }
        return;
    }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && k === 'z' && !inField) {
        e.preventDefault(); undoLastAction(); return;
    }

    const anyModalOpen = ['cmdPaletteModal','inspectorOverlay','custodyModal','externalModal','returnLabModal','batchReturnLabModal','lostModal','importModal','printModal','confirmModal','backupModal','cloudModal','loginModal','changePassModal','adminUsersModal','resetPassModal','unmappedModal','rapidLocalModal','auditVaultModal']
        .some(id => { const el = document.getElementById(id); return el && !el.classList.contains('hidden'); });

    if (!anyModalOpen && !inField && currentView === 'inventory') {
        if (e.key === 'ArrowDown') { e.preventDefault(); stepInventoryKeyboard(1); return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); stepInventoryKeyboard(-1); return; }
        if (e.key === 'Enter' && kbRowIdx >= 0) { e.preventDefault(); openKeyboardSelectedRow(); return; }
    }

    if (e.key === 'Escape') {
        closeSystemMenu(); closeMobileSidebar(); closeCommandPalette(); closeInspectorModal();
        closeCustodyModal(); closeExternalModal(); closeReturnLabModal(); closeBatchReturnLabModal();
        closeLostModal(); closeImportModal(); closePrintModal(); closeConfirmModal();
        closeBackupModal(); closeCloudModal(); closeLoginModal(); closeChangePassModal();
        closeAdminUsersModal(); closeResetPassModal(); closeUnmappedModal();
        closeRapidLocalModal(); closeAuditVaultModal();
    }
});

// ---- Inicialização Assíncrona (IndexedDB + Skeleton Screen + Seed Sob Demanda) ----
let initialized = false;
async function initApp() {
    if (initialized) return;
    initialized = true;
    currentRefISO = getTodayISO();
    applyTheme(safeGet(KEYS.dark) === 'true');
    if (safeGet(KEYS.sb) === 'true') document.body.classList.add('sb-collapsed');
    if (safeGet(KEYS.compact) === 'true') setDensity(true);
    const savedPs = Number(safeGet(KEYS.ps));
    if ([20,50,100,9999].includes(savedPs)) invPageSize = savedPs;
    updatePageSizeButtonsUI(invPageSize);

    restoreAuth();
    applyViewModeUI();
    initInspectorSwipeGesture();

    const [snap, savedPendingDelta] = await Promise.all([
        VoithDB.loadSnapshot(),
        VoithDB.get('pendingDelta')
    ]);
    if (savedPendingDelta && DeltaTracker.hydrate(savedPendingDelta)) {
        offlineDirty = true;
    }
    if (snap && Array.isArray(snap.inst) && snap.inst.length > 0) {
        instrumentsData = snap.inst.map((x, i) => normalizeInstrument(x, i + 1));
        calibrationHistory = Array.isArray(snap.hist) ? snap.hist : [];
        lostInstrumentsData = Array.isArray(snap.lost) ? snap.lost : [];
        if (snap.lists && typeof snap.lists === 'object') {
            if (Array.isArray(snap.lists.locals)) controlledLists.locals = snap.lists.locals;
            if (Array.isArray(snap.lists.sectors) && snap.lists.sectors.length) controlledLists.sectors = snap.lists.sectors;
            if (snap.lists.aliases) controlledLists.aliases = snap.lists.aliases;
        }
        if (snap.updatedAt) lastServerUpdatedAt = snap.updatedAt;
        sortByCode(instrumentsData);
        ensureHistoryIds();
        applyAuthUI();
    } else {
        document.body.classList.add('vp-loading');
        applyAuthUI();
    }

    const tblWrap = document.getElementById('inventoryTableWrap');
    if (tblWrap) {
        tblWrap.addEventListener('scroll', () => {
            if (currentView !== 'inventory') return;
            savedInvScrollTop = tblWrap.scrollTop;
            if (invVirtualActive) {
                if (!invVirtualRaf) {
                    invVirtualRaf = requestAnimationFrame(() => {
                        invVirtualRaf = 0;
                        updateVirtualTableWindow(false);
                    });
                }
                return;
            }
            if (invRenderedCount < invPageItemsCache.length) {
                if (tblWrap.scrollTop + tblWrap.clientHeight >= tblWrap.scrollHeight - 280) {
                    appendMoreInventoryRows();
                }
            }
        }, { passive: true });
    }
    window.addEventListener('scroll', () => {
        if (currentView !== 'inventory' || !isCardsViewActive()) return;
        if (invRenderedCount < invPageItemsCache.length) {
            if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 450) {
                appendMoreInventoryRows();
            }
        }
    }, { passive: true });

    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            const isMob = window.innerWidth < 768;
            if (isMob !== lastWindowWasMobile) {
                lastWindowWasMobile = isMob;
                applyViewModeUI();
                if (currentView === 'inventory' && invViewMode === 'auto') renderInventoryView();
                else dirtyViews.inventory = true;
            }
        }, 120);
    });

    if (getCloudUrl()) {
        const cloudOk = await loadFromCloud(false, true, false);
        if (!cloudOk && instrumentsData.length === 0) {
            try {
                const resp = await fetch('./data/seed.tsv');
                if (resp.ok) {
                    const txt = await resp.text();
                    instrumentsData = parseTsvData(txt, 1).map((x, i) => normalizeInstrument(x, i + 1));
                    sortByCode(instrumentsData);
                    VoithDB.saveSnapshot(instrumentsData, calibrationHistory, lostInstrumentsData, controlledLists, '');
                    renderAll();
                }
            } catch {}
        }
        document.body.classList.remove('vp-loading');
        if (isEditor()) validateSessionQuietly();
    } else {
        document.body.classList.remove('vp-loading');
        setCloudUI('off', 'Offline');
    }

    registerBackgroundWorker();
}

function registerBackgroundWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
    navigator.serviceWorker.register('./sw.js').then(reg => {
        reg.update().catch(() => {});
    }).catch(() => {});
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initApp);
else initApp();

