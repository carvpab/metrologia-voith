(() => {
  "use strict";

  const APK_FALLBACK = "https://github.com/carvpab/voith-metrologia-app/releases/latest/download/voith-metrologia.apk";
  const EXE_FALLBACK = "https://github.com/carvpab/voith-metrologia-app/releases/latest/download/voith-metrologia-setup.exe";
  const PROFILES_KEY = "voith_detailed_user_profiles_v1";
  const AUDIT_KEY = "voith_admin_audit_log_v1";

  const SECTORS = [
    "Metrologia / Turbo",
    "Qualidade",
    "Ferrovi\u00e1ria",
    "Automotive/Engates",
    "Assist\u00eancia T\u00e9cnica Automotive",
    "Industrial",
    "Assist\u00eancia T\u00e9cnica Industrial",
    "Ferrovi\u00e1ria Redutor",
    "Vorecon"
  ];

  const PERMISSION_GROUPS = [
    {
      group: "Invent\u00e1rio & Instrumentos",
      items: [
        { id: "inv_view", label: "Visualizar lista de instrumentos (441)" },
        { id: "inv_create", label: "Cadastrar novos instrumentos" },
        { id: "inv_edit", label: "Editar dados, faixa e setor do instrumento" },
        { id: "inv_delete", label: "Excluir instrumentos do cadastro" },
        { id: "inv_lost", label: "Marcar equipamento como Perdido / Baixado" },
        { id: "inv_restore", label: "Restaurar equipamentos perdidos/baixados" }
      ]
    },
    {
      group: "Calibra\u00e7\u00f5es, Cautela & Laborat\u00f3rio",
      items: [
        { id: "cal_register", label: "Registrar calibra\u00e7\u00e3o e n\u00famero de certificado" },
        { id: "cal_batch_send", label: "Criar e enviar Lote / Romaneio Externo" },
        { id: "cal_batch_return", label: "Registrar retorno de laborat\u00f3rio externo" },
        { id: "cautela_assign", label: "Realizar cautela / entrega a colaborador" },
        { id: "cautela_return", label: "Registrar devolu\u00e7\u00e3o de cautela" }
      ]
    },
    {
      group: "Relat\u00f3rios, Nuvem, OTA & Administra\u00e7\u00e3o",
      items: [
        { id: "rep_pdf_iso", label: "Gerar relat\u00f3rios PDF / Auditoria ISO / Arm\u00e1rio" },
        { id: "rep_backup", label: "Exportar e restaurar backup completo" },
        { id: "cloud_sync", label: "Sincronizar dados com nuvem / Supabase" },
        { id: "ota_manage", label: "Ver e disparar atualiza\u00e7\u00f5es OTA / App" },
        { id: "adm_users", label: "Criar e gerenciar logins de usu\u00e1rios" },
        { id: "adm_hierarchy", label: "Configurar matr\u00edculas, setores e permiss\u00f5es" }
      ]
    }
  ];

  const ALL_PERM_IDS = PERMISSION_GROUPS.flatMap(g => g.items.map(i => i.id));
  const PRESET_PERMS = {
    ADMIN: ALL_PERM_IDS,
    GESTOR: ["inv_view","inv_create","inv_edit","inv_lost","inv_restore","cal_register","cal_batch_send","cal_batch_return","cautela_assign","cautela_return","rep_pdf_iso","rep_backup","cloud_sync","ota_manage"],
    METROLOGISTA: ["inv_view","inv_create","inv_edit","cal_register","cal_batch_send","cal_batch_return","cautela_assign","cautela_return","rep_pdf_iso","cloud_sync"],
    OPERADOR: ["inv_view","cautela_assign","cautela_return","rep_pdf_iso"]
  };

  const norm = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const isVisible = (el) => {
    if (!el || !el.isConnected) return false;
    const cs = window.getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  const setControlValue = (el, val) => {
    if (!el) return;
    const str = String(val == null ? "" : val);
    if (el.tagName === "SELECT") {
      const target = norm(str);
      const opts = Array.from(el.options || []);
      const hit =
        opts.find((o) => norm(o.value) === target || norm(o.textContent) === target) ||
        opts.find((o) => norm(o.textContent).includes(target) || target.includes(norm(o.textContent)));
      if (hit) { el.value = hit.value; } else if (str.trim()) { const o = document.createElement("option"); o.value = str; o.textContent = str; el.appendChild(o); el.value = str; }
    } else {
      const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, "value");
      if (desc && desc.set) desc.set.call(el, str);
      else el.value = str;
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const loadProfiles = () => {
    try { return JSON.parse(localStorage.getItem(PROFILES_KEY) || "{}"); } catch (_) { return {}; }
  };
  const saveProfiles = (obj) => {
    try { localStorage.setItem(PROFILES_KEY, JSON.stringify(obj)); } catch (_) {}
  };
  const pushAudit = (action, detail) => {
    try {
      const logs = JSON.parse(localStorage.getItem(AUDIT_KEY) || "[]");
      logs.unshift({ at: new Date().toLocaleString("pt-BR"), action, detail });
      localStorage.setItem(AUDIT_KEY, JSON.stringify(logs.slice(0, 80)));
    } catch (_) {}
  };
  const loadAudit = () => {
    try { return JSON.parse(localStorage.getItem(AUDIT_KEY) || "[]"); } catch (_) { return []; }
  };

  /* -------------------- LEITURA DA FROTA DE INSTRUMENTOS -------------------- */
  let cachedInstruments = [];
  let lastInstrumentScan = 0;

  const extractInstrumentItem = (obj) => {
    if (!obj || typeof obj !== "object") return null;
    const code = String(
      obj.code || obj.codigo || obj.cod || obj.tag || obj.patrimonio || obj.instrument_code || ""
    ).trim();
    if (!code || code.length < 3 || code.length > 35 || /^\d{2}:\d{2}/.test(code)) return null;
    const name = String(
      obj.name || obj.instrumento || obj.descricao || obj.description || obj.desc || obj.nome || obj.equipamento || obj.tipo || ""
    ).trim();
    const sector = String(obj.sector || obj.setor || obj.area || "").trim();
    const local = String(obj.local || obj.armario || obj.location || obj.localizacao || obj.posse || "").trim();
    const status = String(obj.status || obj.situacao || "").trim();
    return { code, name, sector, local, status };
  };

  const collectFromArray = (arr, map) => {
    if (!Array.isArray(arr) || arr.length < 2) return;
    for (let i = 0; i < arr.length; i++) {
      const item = extractInstrumentItem(arr[i]);
      if (item && !map.has(item.code.toUpperCase())) {
        map.set(item.code.toUpperCase(), item);
      }
    }
  };

  const readLiveInstruments = (force = false) => {
    const now = Date.now();
    if (!force && cachedInstruments.length >= 10 && now - lastInstrumentScan < 4000) {
      return cachedInstruments;
    }

    const map = new Map();

    // 1. Globais conhecidas
    const directCandidates = [
      window.instruments,
      window.ITEMS,
      window.allInstruments,
      window.DATA,
      window.db && window.db.instruments,
      window.state && window.state.instruments,
      window.state && window.state.items,
      window.appState && window.appState.instruments
    ];
    directCandidates.forEach((c) => collectFromArray(c, map));

    // 2. Varredura leve de arrays no localStorage
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i) || "";
        if (k === PROFILES_KEY || k === AUDIT_KEY) continue;
        const raw = localStorage.getItem(k);
        if (!raw || raw.length < 40 || (raw[0] !== "[" && raw[0] !== "{")) continue;
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            collectFromArray(parsed, map);
          } else if (parsed && typeof parsed === "object") {
            ["instruments", "items", "data", "list", "rows", "frota", "equipamentos"].forEach((sub) => {
              if (Array.isArray(parsed[sub])) collectFromArray(parsed[sub], map);
            });
          }
        } catch (_) {}
      }
    } catch (_) {}

    // 3. Fallback: varredura de globals proprias do window (caso o nome da variavel seja outro)
    if (map.size < 10) {
      try {
        const keys = Object.keys(window);
        for (let i = 0; i < keys.length; i++) {
          const k = keys[i];
          if (/^(webkit|moz|on|CSS|HTML|SVG|DOM|Intl|WebGL|Audio|Media|Performance|Navigator)/i.test(k)) continue;
          let v;
          try { v = window[k]; } catch (_) { continue; }
          if (Array.isArray(v) && v.length >= 10 && v[0] && typeof v[0] === "object") {
            collectFromArray(v, map);
          }
        }
      } catch (_) {}
    }

    // 4. Complemento com linhas visiveis da tabela do Inventario
    document.querySelectorAll("table tbody tr").forEach((tr) => {
      const tds = Array.from(tr.querySelectorAll("td"));
      if (tds.length < 3) return;
      const codeCell = tds.map((td) => String(td.textContent || "").trim()).find((txt) => /\b[A-Z]{1,4}\d{4,}\b/.test(txt));
      if (!codeCell) return;
      const m = codeCell.match(/\b([A-Z]{1,4}\d{4,}[A-Z0-9-]*)\b/);
      if (!m) return;
      const code = m[1];
      if (!map.has(code.toUpperCase())) {
        const nameTxt = String((tds[2] && tds[2].textContent) || "").replace(/\s+/g, " ").trim();
        const sectorTxt = String((tds[3] && tds[3].textContent) || "").replace(/\s+/g, " ").trim();
        const localTxt = String((tds[4] && tds[4].textContent) || "").replace(/\s+/g, " ").trim();
        map.set(code.toUpperCase(), { code, name: nameTxt, sector: sectorTxt, local: localTxt, status: "" });
      }
    });

    if (map.size > 0) {
      cachedInstruments = Array.from(map.values());
      lastInstrumentScan = now;
    }
    return cachedInstruments;
  };

  const searchInstruments = (query, limit = 15) => {
    const q = norm(query);
    const list = readLiveInstruments();
    if (!q) return list.slice(0, limit);

    const scored = [];
    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      const c = norm(it.code);
      const n = norm(it.name);
      const s = norm(it.sector);
      const l = norm(it.local);
      let score = 0;
      if (c === q) score = 100;
      else if (c.endsWith(q)) score = 92;
      else if (c.startsWith(q)) score = 88;
      else if (c.includes(q)) score = 80;
      else if (n.includes(q)) score = 55;
      else if (l.includes(q) || s.includes(q)) score = 35;
      if (score > 0) scored.push({ item: it, score });
    }
    scored.sort((a, b) => b.score - a.score || a.item.code.localeCompare(b.item.code));
    return scored.slice(0, limit).map((x) => x.item);
  };

  /* -------------------- BUSCA PARCIAL EM "BUSCAR INSTRUMENTO POR CODIGO" -------------------- */
  let bypassPartialIntercept = false;
  let activeSuggestBox = null;
  let activeSuggestInput = null;

  const closeSuggestBox = () => {
    if (activeSuggestBox) activeSuggestBox.style.display = "none";
    activeSuggestInput = null;
  };

  const ensureSuggestBox = () => {
    if (activeSuggestBox && activeSuggestBox.isConnected) return activeSuggestBox;
    const box = document.createElement("div");
    box.id = "vu-code-suggest";
    box.style.cssText = "position:fixed;display:none;z-index:10920;background:#ffffff;border:1px solid #93c5fd;border-radius:10px;box-shadow:0 16px 36px rgba(15,23,42,.22);max-height:260px;overflow-y:auto;font-family:system-ui,-apple-system,sans-serif;";
    document.body.appendChild(box);
    activeSuggestBox = box;
    return box;
  };

  const positionSuggestBox = (inputEl) => {
    if (!activeSuggestBox || !inputEl || !isVisible(inputEl)) return;
    const r = inputEl.getBoundingClientRect();
    activeSuggestBox.style.left = Math.max(8, r.left) + "px";
    activeSuggestBox.style.top = (r.bottom + 4) + "px";
    activeSuggestBox.style.width = Math.max(260, r.width) + "px";
  };

  const findLocateButtonForInput = (inputEl) => {
    let cur = inputEl.parentElement;
    for (let i = 0; i < 3 && cur; i++) {
      const btn = Array.from(cur.querySelectorAll("button")).find((b) => norm(b.textContent) === "localizar");
      if (btn) return btn;
      cur = cur.parentElement;
    }
    return null;
  };

  const enhancePartialCodeSearch = () => {
    const locateBtns = Array.from(document.querySelectorAll("button")).filter((b) => {
      if (!isVisible(b) || b.closest("#vu-bulk-modal") || b.closest("#vu-adm-inner")) return false;
      return norm(b.textContent) === "localizar";
    });

    locateBtns.forEach((locBtn) => {
      const wrap = locBtn.parentElement;
      if (!wrap) return;
      const inputEl =
        wrap.querySelector("input:not([type=hidden]):not([type=checkbox]):not([type=radio])") ||
        (wrap.parentElement && wrap.parentElement.querySelector("input:not([type=hidden]):not([type=checkbox]):not([type=radio])"));
      if (!inputEl || inputEl.dataset.vuPartialBound === "1") return;

      inputEl.dataset.vuPartialBound = "1";
      inputEl.setAttribute("autocomplete", "off");
      if (!inputEl.placeholder || /^AC\d+/i.test(inputEl.placeholder)) {
        inputEl.placeholder = "Ex: 9981, AC409981 ou nome do instrumento...";
      }

      const selectAndLocate = (code) => {
        setControlValue(inputEl, code);
        closeSuggestBox();
        bypassPartialIntercept = true;
        locBtn.click();
        setTimeout(() => { bypassPartialIntercept = false; }, 120);
      };

      const renderSuggestions = () => {
        const q = String(inputEl.value || "").trim();
        const box = ensureSuggestBox();
        if (q.length < 2) {
          closeSuggestBox();
          return;
        }
        const matches = searchInstruments(q, 10);
        if (!matches.length) {
          closeSuggestBox();
          return;
        }
        activeSuggestInput = inputEl;
        box.innerHTML = matches.map((it) => {
          const sub = [it.name, it.local, it.sector].filter(Boolean).join(" \u2022 ");
          return (
            `<button type="button" data-code="${it.code}" class="vu-sug-row" style="display:flex;flex-direction:column;align-items:flex-start;gap:2px;width:100%;padding:9px 12px;border:none;border-bottom:1px solid #f1f5f9;background:#ffffff;text-align:left;cursor:pointer;">` +
              `<span style="font-weight:800;font-size:13px;color:#004899;">${it.code}</span>` +
              (sub ? `<span style="font-size:11.5px;color:#475569;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;">${sub}</span>` : "") +
            `</button>`
          );
        }).join("");

        box.querySelectorAll(".vu-sug-row").forEach((rowBtn) => {
          rowBtn.addEventListener("mouseenter", () => { rowBtn.style.background = "#eff6ff"; });
          rowBtn.addEventListener("mouseleave", () => { rowBtn.style.background = "#ffffff"; });
          rowBtn.addEventListener("mousedown", (ev) => {
            ev.preventDefault();
            selectAndLocate(rowBtn.getAttribute("data-code"));
          });
        });

        positionSuggestBox(inputEl);
        box.style.display = "block";
      };

      inputEl.addEventListener("input", renderSuggestions);
      inputEl.addEventListener("focus", renderSuggestions);

      inputEl.addEventListener("keydown", (ev) => {
        if (ev.key === "Escape") {
          closeSuggestBox();
          return;
        }
        if (ev.key === "Enter") {
          const q = String(inputEl.value || "").trim();
          if (!q) return;
          const matches = searchInstruments(q, 5);
          const exact = matches.find((m) => norm(m.code) === norm(q));
          if (!exact && matches.length > 0) {
            const top = matches[0];
            if (matches.length === 1 || norm(top.code).endsWith(norm(q))) {
              ev.preventDefault();
              ev.stopPropagation();
              selectAndLocate(top.code);
            }
          }
        }
      }, true);

      locBtn.addEventListener("click", (ev) => {
        if (bypassPartialIntercept) return;
        const q = String(inputEl.value || "").trim();
        if (!q) return;
        const matches = searchInstruments(q, 10);
        const exact = matches.find((m) => norm(m.code) === norm(q));
        if (exact) {
          closeSuggestBox();
          return;
        }
        if (matches.length > 0) {
          const endMatches = matches.filter((m) => norm(m.code).endsWith(norm(q)));
          if (matches.length === 1 || endMatches.length === 1) {
            const picked = endMatches.length === 1 ? endMatches[0] : matches[0];
            setControlValue(inputEl, picked.code);
            closeSuggestBox();
          } else {
            ev.preventDefault();
            ev.stopPropagation();
            renderSuggestions();
          }
        }
      }, true);
    });
  };

  document.addEventListener("mousedown", (ev) => {
    if (!activeSuggestBox || activeSuggestBox.style.display === "none") return;
    if (activeSuggestBox.contains(ev.target) || (activeSuggestInput && activeSuggestInput.contains(ev.target))) return;
    closeSuggestBox();
  });

  window.addEventListener("scroll", () => {
    if (activeSuggestInput && activeSuggestBox && activeSuggestBox.style.display === "block") {
      positionSuggestBox(activeSuggestInput);
    }
  }, true);

  /* -------------------- CAUTELA EM MASSA -------------------- */
  let bulkSelectedMap = new Map();
  let bulkRunning = false;

  const detectLoggedUserName = () => {
    const candidates = Array.from(document.querySelectorAll("aside, nav")).filter((el) => String(el.textContent || "").includes("Administrador") || String(el.textContent || "").includes("Sair"));
    for (const c of candidates) {
      const m = String(c.textContent || "").match(/([A-Z\u00c0-\u00dd][a-z\u00e0-\u00ff]+(?:\s+[A-Z\u00c0-\u00dd][a-z\u00e0-\u00ff]+)+)\s*(?:Administrador|Gestor|Metrologista|Operador)/);
      if (m) return m[1].trim();
    }
    return "";
  };

  const getCheckedInventoryItems = () => {
    const items = [];
    const seen = new Set();
    const live = readLiveInstruments();
    const byCode = new Map(live.map((x) => [x.code.toUpperCase(), x]));

    document.querySelectorAll("table tbody tr").forEach((tr) => {
      if (!isVisible(tr)) return;
      const cb = tr.querySelector("input[type=checkbox]:checked");
      if (!cb) return;
      const text = String(tr.textContent || "");
      const m = text.match(/\b([A-Z]{1,4}\d{4,}[A-Z0-9-]*)\b/);
      if (!m) return;
      const code = m[1].toUpperCase();
      if (seen.has(code)) return;
      seen.add(code);
      const known = byCode.get(code);
      if (known) {
        items.push(known);
      } else {
        const tds = Array.from(tr.querySelectorAll("td"));
        items.push({
          code: m[1],
          name: String((tds[2] && tds[2].textContent) || "").replace(/\s+/g, " ").trim(),
          sector: String((tds[3] && tds[3].textContent) || "").replace(/\s+/g, " ").trim(),
          local: String((tds[4] && tds[4].textContent) || "").replace(/\s+/g, " ").trim(),
          status: ""
        });
      }
    });
    return items;
  };

  const updateInventoryBulkBar = () => {
    const checked = getCheckedInventoryItems();
    let bar = document.getElementById("vu-inv-bulk-bar");
    if (!checked.length || bulkRunning) {
      if (bar) bar.style.display = "none";
      return;
    }
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "vu-inv-bulk-bar";
      bar.style.cssText = "position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:9940;background:#0b1f44;color:#ffffff;padding:10px 14px;border-radius:12px;border:1px solid #38bdf8;box-shadow:0 14px 36px rgba(0,0,0,.35);display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-family:system-ui,-apple-system,sans-serif;";
      document.body.appendChild(bar);
    }
    bar.innerHTML =
      `<span style="font-size:12.5px;font-weight:800;">${checked.length} instrumento(s) selecionado(s)</span>` +
      `<button type="button" id="vu-inv-go-bulk" style="padding:7px 14px;border-radius:8px;border:none;background:#facc15;color:#0f172a;font-weight:800;font-size:12px;cursor:pointer;">Levar para Cautela em Massa</button>` +
      `<button type="button" id="vu-inv-clear-bulk" style="padding:6px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.35);background:transparent;color:#e2e8f0;font-weight:700;font-size:11.5px;cursor:pointer;">Limpar</button>`;
    bar.style.display = "flex";

    bar.querySelector("#vu-inv-go-bulk").onclick = () => openBulkCustodyModal(getCheckedInventoryItems());
    bar.querySelector("#vu-inv-clear-bulk").onclick = () => {
      document.querySelectorAll("table input[type=checkbox]:checked").forEach((cb) => cb.click());
      bar.style.display = "none";
    };
  };

  const injectBulkCustodyButton = () => {
    const quickBtn = Array.from(document.querySelectorAll("button")).find((b) => {
      if (!isVisible(b) || b.closest("#vu-bulk-modal")) return false;
      return norm(b.textContent).includes("nova cautela rapida");
    });
    if (!quickBtn || !quickBtn.parentElement) return;
    if (quickBtn.parentElement.querySelector("#vu-bulk-custody-btn")) return;

    const btn = document.createElement("button");
    btn.id = "vu-bulk-custody-btn";
    btn.type = "button";
    btn.textContent = "Cautela em Massa";
    btn.style.cssText = "padding:8px 14px;border-radius:10px;border:1px solid #004899;background:#004899;color:#ffffff;font-weight:800;font-size:12.5px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;box-shadow:0 4px 12px rgba(0,72,153,.22);";
    btn.onclick = () => openBulkCustodyModal([]);
    quickBtn.insertAdjacentElement("afterend", btn);
  };

  const findOpenCustodyModal = () => {
    const locBtn = Array.from(document.querySelectorAll("button")).find((b) => {
      if (!isVisible(b) || b.closest("#vu-bulk-modal") || b.closest("#vu-adm-inner")) return false;
      return norm(b.textContent) === "localizar";
    });
    if (!locBtn) return null;

    let modal = locBtn.parentElement;
    for (let i = 0; i < 6 && modal && modal !== document.body; i++) {
      const hasSubmit = Array.from(modal.querySelectorAll("button")).some((b) => {
        const t = norm(b.textContent);
        return isVisible(b) && /(confirmar|registrar|salvar|emitir|gerar|gravar)/.test(t) && !/(localizar|cancelar|fechar)/.test(t);
      });
      if (hasSubmit) break;
      modal = modal.parentElement;
    }
    const codeInput =
      (locBtn.parentElement && locBtn.parentElement.querySelector("input:not([type=hidden]):not([type=checkbox])")) ||
      (modal && modal.querySelector("input:not([type=hidden]):not([type=checkbox])"));
    return modal && codeInput ? { modal, locBtn, codeInput } : null;
  };

  const getFieldHint = (el) => {
    const parts = [el.id, el.name, el.placeholder, el.getAttribute("aria-label")];
    if (el.id) {
      const lbl = document.querySelector(`label[for="${el.id}"]`);
      if (lbl) parts.push(lbl.textContent);
    }
    const closestLabel = el.closest("label");
    if (closestLabel) parts.push(closestLabel.textContent);
    if (el.parentElement) {
      const siblingLabel = el.parentElement.querySelector("label, span, p, div");
      if (siblingLabel && siblingLabel !== el && String(siblingLabel.textContent || "").length < 80) {
        parts.push(siblingLabel.textContent);
      }
    }
    return norm(parts.filter(Boolean).join(" "));
  };

  const closeTopNativeOverlays = () => {
    const modals = Array.from(document.querySelectorAll("[role=dialog], .fixed.inset-0")).filter((el) => {
      if (!isVisible(el)) return false;
      if (el.id === "vu-bulk-modal" || el.id === "vu-bulk-progress" || el.id === "vu-dl-voith") return false;
      const t = String(el.textContent || "");
      return !t.includes("Monitoramento de Frota");
    });
    modals.forEach((m) => {
      const closeBtn = Array.from(m.querySelectorAll("button")).find((b) => {
        if (!isVisible(b)) return false;
        const t = norm(b.textContent);
        const raw = String(b.textContent || "").trim();
        return raw === "\u00d7" || raw === "x" || raw === "X" || t === "fechar" || t === "concluir" || t === "ok" || t === "voltar" || t === "cancelar";
      });
      if (closeBtn) closeBtn.click();
    });
  };

  const ensureOnCustodyAndOpenQuickModal = async () => {
    let found = findOpenCustodyModal();
    if (found) return found;

    let quickBtn = Array.from(document.querySelectorAll("button")).find((b) => isVisible(b) && norm(b.textContent).includes("nova cautela rapida"));
    if (!quickBtn) {
      const custodyTab = Array.from(document.querySelectorAll("aside button, aside a, nav button, nav a, footer button, button")).find((b) => {
        if (!isVisible(b) || b.closest("#vu-bulk-modal")) return false;
        const t = norm(b.textContent);
        return t.startsWith("cautela");
      });
      if (custodyTab) {
        custodyTab.click();
        await sleep(350);
      }
      quickBtn = Array.from(document.querySelectorAll("button")).find((b) => isVisible(b) && norm(b.textContent).includes("nova cautela rapida"));
    }

    if (!quickBtn) return null;
    quickBtn.click();

    for (let i = 0; i < 20; i++) {
      await sleep(120);
      found = findOpenCustodyModal();
      if (found) return found;
    }
    return null;
  };

  const executeBulkCustodyQueue = async (items, responsavel, motivo, destino) => {
    bulkRunning = true;
    const bulkModal = document.getElementById("vu-bulk-modal");
    if (bulkModal) bulkModal.remove();
    const invBar = document.getElementById("vu-inv-bulk-bar");
    if (invBar) invBar.style.display = "none";

    if (!document.getElementById("vu-silent-bulk-css")) {
      const st = document.createElement("style");
      st.id = "vu-silent-bulk-css";
      st.textContent = `
        body.vu-silent-bulk [role="dialog"]:not(#vu-bulk-progress),
        body.vu-silent-bulk .fixed.inset-0:not(#vu-bulk-progress):not(#vu-dl-voith):not(#vu-bulk-modal) {
          opacity: 0.01 !important;
          pointer-events: none !important;
          transition: none !important;
          animation: none !important;
        }
        body.vu-silent-bulk *:not(#vu-bulk-progress):not(#vu-bulk-progress *) {
          transition: none !important;
          animation: none !important;
        }
        @keyframes vuSpin { to { transform: rotate(360deg); } }
      `;
      document.head.appendChild(st);
    }

    document.body.classList.add("vu-silent-bulk");

    let prog = document.getElementById("vu-bulk-progress");
    if (prog) prog.remove();
    prog = document.createElement("div");
    prog.id = "vu-bulk-progress";
    prog.style.cssText = "position:fixed;inset:0;z-index:2147483000;background:rgba(6,16,33,0.82);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:16px;font-family:system-ui,-apple-system,sans-serif;";
    document.body.appendChild(prog);

    const okList = [];
    const failList = [];

    const renderProg = (idx, code, msg) => {
      const pct = Math.round((idx / items.length) * 100);
      prog.innerHTML =
        `<div style="width:min(440px,92vw);background:#0b1f44;color:#ffffff;border:1px solid #38bdf8;border-radius:16px;padding:22px 24px;box-shadow:0 24px 60px rgba(0,0,0,.55);display:grid;gap:12px;">` +
          `<div style="display:flex;align-items:center;gap:12px;">` +
            `<div style="width:24px;height:24px;border-radius:50%;border:3px solid rgba(125,211,252,.28);border-top-color:#38bdf8;animation:vuSpin .8s linear infinite;flex-shrink:0;"></div>` +
            `<div style="flex:1;">` +
              `<div style="font-size:14.5px;font-weight:800;">Registrando Cautelas em Segundo Plano</div>` +
              `<div style="font-size:12px;color:#bfdbfe;">${idx} de ${items.length} conclu\u00eddo(s) &bull; ${pct}%</div>` +
            `</div>` +
          `</div>` +
          `<div style="font-size:12.5px;color:#e2e8f0;background:rgba(255,255,255,.06);padding:9px 12px;border-radius:9px;border:1px solid rgba(148,163,184,.2);">` +
            `${msg}${code ? " \u2014 <strong style='color:#7dd3fc;'>" + code + "</strong>" : ""}` +
          `</div>` +
          `<div style="height:8px;background:rgba(255,255,255,.15);border-radius:999px;overflow:hidden;">` +
            `<div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#0284c7,#38bdf8);transition:width .25s ease;"></div>` +
          `</div>` +
          `<div style="font-size:11px;color:#94a3b8;">Aguarde alguns segundos. N\u00e3o atualize a p\u00e1gina at\u00e9 concluir.</div>` +
        `</div>`;
    };

    try {
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        renderProg(i, it.code, "Processando instrumento");

        closeTopNativeOverlays();
        await sleep(140);

        const ctx = await ensureOnCustodyAndOpenQuickModal();
        if (!ctx) {
          failList.push(`${it.code} (modal n\u00e3o abriu)`);
          continue;
        }

        bypassPartialIntercept = true;
        setControlValue(ctx.codeInput, it.code);
        await sleep(70);
        ctx.locBtn.click();
        await sleep(340);
        bypassPartialIntercept = false;

        const controls = Array.from(ctx.modal.querySelectorAll("input, select, textarea")).filter((el) => {
          if (el === ctx.codeInput || !isVisible(el) || el.disabled) return false;
          const tp = String(el.type || "").toLowerCase();
          return !["hidden", "checkbox", "radio", "file", "submit", "button"].includes(tp);
        });

        let filledResp = false;
        let filledMotivo = false;

        controls.forEach((el) => {
          const hint = getFieldHint(el);
          if (!filledResp && /(respons|colaborad|portador|pessoa|tecnic|retir|quem|holder|nome)/.test(hint) && !/(instrument|codigo|equip|armario|destin)/.test(hint)) {
            setControlValue(el, responsavel);
            filledResp = true;
          } else if (!filledMotivo && /(motivo|finalidade|observ|obs|reason|justific|tipo)/.test(hint)) {
            setControlValue(el, motivo);
            filledMotivo = true;
          } else if (destino && /(devolv|destin|armario|local|return)/.test(hint)) {
            setControlValue(el, destino);
          }
        });

        if (!filledResp) {
          const firstText = controls.find((el) => el.tagName === "INPUT" && (!el.value || el.value === ""));
          if (firstText) setControlValue(firstText, responsavel);
        }

        await sleep(120);

        const submitBtn = Array.from(ctx.modal.querySelectorAll("button")).find((b) => {
          if (!isVisible(b) || b.disabled) return false;
          const t = norm(b.textContent);
          return /(confirmar|registrar|salvar|emitir|gerar|gravar)/.test(t) && !/(localizar|cancelar|fechar|limpar|massa)/.test(t);
        });

        if (!submitBtn) {
          failList.push(`${it.code} (bot\u00e3o salvar n\u00e3o encontrado)`);
          closeTopNativeOverlays();
          continue;
        }

        submitBtn.click();
        await sleep(900);

        closeTopNativeOverlays();
        await sleep(180);

        okList.push(it.code);
        renderProg(i + 1, it.code, "Registrado com sucesso");
      }

      pushAudit("Cautela em Massa", `Respons\u00e1vel: ${responsavel} | Motivo: ${motivo} | OK: ${okList.length}/${items.length}`);
    } catch (err) {
      failList.push(String((err && err.message) || err));
    } finally {
      closeTopNativeOverlays();
      document.body.classList.remove("vu-silent-bulk");
      bulkRunning = false;
      document.querySelectorAll("table input[type=checkbox]:checked").forEach((cb) => cb.click());
    }

    prog.style.cssText = "position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:2147483000;width:min(460px,92vw);background:#0b1f44;color:#ffffff;border:1px solid #38bdf8;border-radius:14px;padding:14px 16px;box-shadow:0 20px 50px rgba(0,0,0,.45);font-family:system-ui,-apple-system,sans-serif;";
    prog.innerHTML =
      `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">` +
        `<div style="font-size:13.5px;font-weight:800;color:${failList.length ? "#fde047" : "#86efac"};">Conclu\u00eddo: ${okList.length} de ${items.length} enviados para cautela</div>` +
        `<button type="button" id="vu-prog-close" style="padding:4px 10px;border-radius:6px;border:1px solid rgba(255,255,255,.35);background:transparent;color:#fff;font-weight:700;font-size:11.5px;cursor:pointer;">Fechar</button>` +
      `</div>` +
      (failList.length ? `<div style="margin-top:6px;font-size:11.5px;color:#fecaca;">N\u00e3o conclu\u00eddos: ${failList.join(", ")}</div>` : `<div style="margin-top:6px;font-size:11.5px;color:#cbd5e1;">Todos os itens foram salvos no Supabase e registrados na aba Cautela &amp; Campo.</div>`);

    prog.querySelector("#vu-prog-close").onclick = () => prog.remove();
    setTimeout(() => { if (prog && prog.isConnected && !failList.length) prog.remove(); }, 6000);
  };

  const openBulkCustodyModal = (initialItems = []) => {
    const old = document.getElementById("vu-bulk-modal");
    if (old) old.remove();

    bulkSelectedMap = new Map();
    initialItems.forEach((it) => {
      if (it && it.code) bulkSelectedMap.set(it.code.toUpperCase(), it);
    });

    readLiveInstruments(true);
    const defaultResp = detectLoggedUserName();

    const overlay = document.createElement("div");
    overlay.id = "vu-bulk-modal";
    overlay.style.cssText = "position:fixed;inset:0;z-index:10850;background:rgba(15,23,42,.62);display:flex;align-items:center;justify-content:center;padding:16px;font-family:system-ui,-apple-system,sans-serif;";
    overlay.innerHTML =
      `<div style="width:min(760px,96vw);max-height:92vh;background:#ffffff;color:#0f172a;border-radius:16px;overflow:hidden;box-shadow:0 28px 70px rgba(0,0,0,.45);display:flex;flex-direction:column;">` +
        `<div style="background:linear-gradient(90deg,#002466,#004899);color:#ffffff;padding:16px 20px;display:flex;justify-content:space-between;align-items:center;gap:10px;">` +
          `<div>` +
            `<div style="font-size:16px;font-weight:800;">Cautela em Massa</div>` +
            `<div style="font-size:12px;color:#bfdbfe;">Selecione v\u00e1rios instrumentos por c\u00f3digo parcial (ex: 9981) ou nome e envie todos juntos.</div>` +
          `</div>` +
          `<button type="button" id="vu-bulk-close" style="width:34px;height:34px;border-radius:8px;border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.15);color:#fff;font-size:19px;line-height:1;cursor:pointer;">&times;</button>` +
        `</div>` +
        `<div style="padding:18px 20px;overflow-y:auto;display:grid;gap:14px;">` +
          `<div style="display:grid;gap:8px;">` +
            `<label style="font-size:11.5px;font-weight:800;color:#334155;text-transform:uppercase;">1. Buscar ou colar c\u00f3digos (aceita c\u00f3digo parcial ex: 9981, 7973)</label>` +
            `<div style="display:flex;gap:8px;flex-wrap:wrap;">` +
              `<input id="vu-bulk-search" type="text" placeholder="Digite 9981, paqu\u00edmetro, ou cole v\u00e1rios separados por v\u00edrgula..." style="flex:1;min-width:220px;padding:9px 12px;border-radius:9px;border:1px solid #cbd5e1;font-size:13px;color:#0f172a;">` +
              `<button type="button" id="vu-bulk-add-list" style="padding:9px 14px;border-radius:9px;border:1px solid #004899;background:#eff6ff;color:#004899;font-weight:800;font-size:12px;cursor:pointer;">+ Adicionar da busca</button>` +
            `</div>` +
            `<div id="vu-bulk-results" style="display:grid;gap:5px;max-height:175px;overflow-y:auto;border:1px solid #e2e8f0;border-radius:10px;padding:8px;background:#f8fafc;"></div>` +
          `</div>` +
          `<div style="display:grid;gap:6px;">` +
            `<div style="display:flex;justify-content:space-between;align-items:center;">` +
              `<span id="vu-bulk-count-lbl" style="font-size:12px;font-weight:800;color:#002466;">Instrumentos selecionados (0)</span>` +
              `<button type="button" id="vu-bulk-clear-sel" style="border:none;background:transparent;color:#dc2626;font-size:11.5px;font-weight:700;cursor:pointer;">Limpar lista</button>` +
            `</div>` +
            `<div id="vu-bulk-chips" style="display:flex;gap:6px;flex-wrap:wrap;min-height:38px;padding:8px;border-radius:10px;border:1px dashed #cbd5e1;background:#ffffff;"></div>` +
          `</div>` +
          `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;padding-top:4px;border-top:1px solid #e2e8f0;">` +
            `<label style="display:grid;gap:4px;font-size:11.5px;font-weight:700;color:#334155;">Respons\u00e1vel / Colaborador *` +
              `<input id="vu-bulk-resp" type="text" value="${defaultResp}" placeholder="Ex: Pablo Carvalho" style="padding:9px 10px;border-radius:8px;border:1px solid #cbd5e1;font-size:12.5px;color:#0f172a;">` +
            `</label>` +
            `<label style="display:grid;gap:4px;font-size:11.5px;font-weight:700;color:#334155;">Motivo / Finalidade` +
              `<select id="vu-bulk-motivo" style="padding:9px 10px;border-radius:8px;border:1px solid #cbd5e1;font-size:12.5px;color:#0f172a;background:#fff;">` +
                `<option value="Empr\u00e9stimo operacional em bancada">Empr\u00e9stimo operacional em bancada</option>` +
                `<option value="Encaminhado para reparo / manuten\u00e7\u00e3o">Encaminhado para reparo / manuten\u00e7\u00e3o</option>` +
                `<option value="Envio para calibra\u00e7\u00e3o externa">Envio para calibra\u00e7\u00e3o externa</option>` +
                `<option value="Calibra\u00e7\u00e3o interna">Calibra\u00e7\u00e3o interna</option>` +
                `<option value="Verifica\u00e7\u00e3o / auditoria interna">Verifica\u00e7\u00e3o / auditoria interna</option>` +
                `<option value="Uso em campo / montagem">Uso em campo / montagem</option>` +
              `</select>` +
            `</label>` +
            `<label style="display:grid;gap:4px;font-size:11.5px;font-weight:700;color:#334155;">Devolver p/ (opcional)` +
              `<input id="vu-bulk-dest" type="text" placeholder="Vazio = mant\u00e9m arm\u00e1rio original" style="padding:9px 10px;border-radius:8px;border:1px solid #cbd5e1;font-size:12.5px;color:#0f172a;">` +
            `</label>` +
          `</div>` +
          `<div id="vu-bulk-err" style="font-size:12px;font-weight:700;color:#dc2626;min-height:16px;"></div>` +
        `</div>` +
        `<div style="padding:14px 20px;border-top:1px solid #e2e8f0;background:#f8fafc;display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap;">` +
          `<button type="button" id="vu-bulk-cancel" style="padding:9px 16px;border-radius:9px;border:1px solid #cbd5e1;background:#fff;color:#334155;font-weight:700;font-size:12.5px;cursor:pointer;">Cancelar</button>` +
          `<button type="button" id="vu-bulk-submit" style="padding:9px 18px;border-radius:9px;border:none;background:#16a34a;color:#fff;font-weight:800;font-size:12.5px;cursor:pointer;">Registrar Cautela em Massa (0)</button>` +
        `</div>` +
      `</div>`;

    document.body.appendChild(overlay);

    const searchInp = overlay.querySelector("#vu-bulk-search");
    const resBox = overlay.querySelector("#vu-bulk-results");
    const chipsBox = overlay.querySelector("#vu-bulk-chips");
    const countLbl = overlay.querySelector("#vu-bulk-count-lbl");
    const submitBtn = overlay.querySelector("#vu-bulk-submit");
    const errBox = overlay.querySelector("#vu-bulk-err");

    const refreshChips = () => {
      const arr = Array.from(bulkSelectedMap.values());
      countLbl.textContent = `Instrumentos selecionados (${arr.length})`;
      submitBtn.textContent = `Registrar Cautela em Massa (${arr.length})`;
      if (!arr.length) {
        chipsBox.innerHTML = `<span style="font-size:12px;color:#94a3b8;">Nenhum instrumento adicionado ainda. Pesquise acima e clique nos itens para incluir.</span>`;
        return;
      }
      chipsBox.innerHTML = arr.map((it) =>
        `<span style="display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:999px;background:#eff6ff;border:1px solid #93c5fd;font-size:12px;font-weight:700;color:#003399;">` +
          `<span>${it.code}${it.name ? " \u2022 " + it.name.slice(0, 26) : ""}</span>` +
          `<button type="button" data-rm="${it.code.toUpperCase()}" style="border:none;background:transparent;color:#003399;font-weight:900;cursor:pointer;font-size:14px;line-height:1;padding:0;">&times;</button>` +
        `</span>`
      ).join("");

      chipsBox.querySelectorAll("[data-rm]").forEach((b) => {
        b.onclick = () => {
          bulkSelectedMap.delete(b.getAttribute("data-rm"));
          refreshChips();
          refreshResults();
        };
      });
    };

    const refreshResults = () => {
      const q = String(searchInp.value || "").trim();
      const hits = searchInstruments(q, 20);
      if (!hits.length) {
        resBox.innerHTML = `<div style="font-size:12px;color:#64748b;padding:6px;">Nenhum instrumento encontrado para "${q}".</div>`;
        return;
      }
      resBox.innerHTML = hits.map((it) => {
        const key = it.code.toUpperCase();
        const picked = bulkSelectedMap.has(key);
        const info = [it.name, it.local, it.sector].filter(Boolean).join(" \u2022 ");
        return (
          `<button type="button" data-toggle-code="${key}" style="display:flex;justify-content:space-between;align-items:center;gap:10px;width:100%;padding:8px 10px;border-radius:8px;border:1px solid ${picked ? "#2563eb" : "#e2e8f0"};background:${picked ? "#eff6ff" : "#ffffff"};text-align:left;cursor:pointer;">` +
            `<div style="min-width:0;">` +
              `<div style="font-weight:800;font-size:12.5px;color:#0f172a;">${it.code}</div>` +
              (info ? `<div style="font-size:11.5px;color:#475569;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${info}</div>` : "") +
            `</div>` +
            `<span style="flex-shrink:0;padding:3px 9px;border-radius:6px;font-size:11px;font-weight:800;background:${picked ? "#16a34a" : "#e2e8f0"};color:${picked ? "#fff" : "#334155"};">${picked ? "Selecionado" : "+ Incluir"}</span>` +
          `</button>`
        );
      }).join("");

      const byKey = new Map(hits.map((h) => [h.code.toUpperCase(), h]));
      resBox.querySelectorAll("[data-toggle-code]").forEach((btn) => {
        btn.onclick = () => {
          const k = btn.getAttribute("data-toggle-code");
          if (bulkSelectedMap.has(k)) bulkSelectedMap.delete(k);
          else if (byKey.has(k)) bulkSelectedMap.set(k, byKey.get(k));
          refreshChips();
          refreshResults();
        };
      });
    };

    const addTokensFromSearch = () => {
      const raw = String(searchInp.value || "").trim();
      if (!raw) return;
      const tokens = raw.split(/[\s,;|\n]+/).map((t) => t.trim()).filter((t) => t.length >= 2);
      let added = 0;
      tokens.forEach((tk) => {
        const matches = searchInstruments(tk, 5);
        if (matches.length) {
          const best = matches.find((m) => norm(m.code) === norm(tk) || norm(m.code).endsWith(norm(tk))) || matches[0];
          if (best) {
            bulkSelectedMap.set(best.code.toUpperCase(), best);
            added++;
          }
        }
      });
      if (added > 0) {
        searchInp.value = "";
        errBox.textContent = "";
        refreshChips();
        refreshResults();
      } else {
        errBox.textContent = "Nenhum c\u00f3digo correspondente encontrado na busca.";
      }
    };

    searchInp.addEventListener("input", () => { errBox.textContent = ""; refreshResults(); });
    searchInp.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        addTokensFromSearch();
      }
    });
    overlay.querySelector("#vu-bulk-add-list").onclick = addTokensFromSearch;
    overlay.querySelector("#vu-bulk-clear-sel").onclick = () => { bulkSelectedMap.clear(); refreshChips(); refreshResults(); };
    overlay.querySelector("#vu-bulk-close").onclick = () => overlay.remove();
    overlay.querySelector("#vu-bulk-cancel").onclick = () => overlay.remove();

    submitBtn.onclick = () => {
      const list = Array.from(bulkSelectedMap.values());
      const resp = String(overlay.querySelector("#vu-bulk-resp").value || "").trim();
      const mot = String(overlay.querySelector("#vu-bulk-motivo").value || "").trim();
      const dest = String(overlay.querySelector("#vu-bulk-dest").value || "").trim();

      if (!list.length) {
        errBox.textContent = "Adicione pelo menos 1 instrumento antes de registrar.";
        return;
      }
      if (!resp) {
        errBox.textContent = "Informe o nome do respons\u00e1vel / colaborador.";
        return;
      }
      executeBulkCustodyQueue(list, resp, mot, dest);
    };

    refreshChips();
    refreshResults();
    setTimeout(() => searchInp.focus(), 60);
  };

  /* -------------------- DESCOBERTA DE USUARIOS (SEM APP_BOOT) -------------------- */
  const discoverUsers = (scopeEl) => {
    const isLogNoise = (login, name) => {
      const l = String(login || "").trim().toLowerCase();
      const n = String(name || "").trim().toUpperCase();
      return !l || /^\d{2}:\d{2}/.test(l) || l.includes("health_check") || n === "APP_BOOT" || n === "VOITH-OS";
    };

    const stored = loadProfiles();
    const map = new Map();
    Object.entries(stored).forEach(([k, p]) => {
      if (isLogNoise(k, p && p.name)) return;
      map.set(k.toLowerCase(), {
        login: k.toLowerCase(),
        name: p.name || k,
        matricula: p.matricula || "",
        sector: p.sector || "Metrologia / Turbo",
        role: p.role || "OPERADOR",
        perms: Array.isArray(p.perms) ? p.perms : (PRESET_PERMS[p.role] || PRESET_PERMS.OPERADOR)
      });
    });

    const root = scopeEl || document;
    root.querySelectorAll("table").forEach((tbl) => {
      const hdr = String((tbl.querySelector("thead") || tbl.querySelector("tr") || {}).textContent || "").toUpperCase();
      if (!(hdr.includes("LOGIN") && hdr.includes("PERFIL"))) return;
      tbl.querySelectorAll("tbody tr").forEach((tr) => {
        const tds = Array.from(tr.querySelectorAll("td")).map(td => String(td.textContent || "").trim()).filter(Boolean);
        if (tds.length >= 2) {
          const login = tds[0].toLowerCase();
          const name = tds[1];
          if (login.includes(" ") || login.length > 30 || isLogNoise(login, name)) return;
          const roleCell = tds.find(c => /^(ADMIN|GESTOR|METROLOGISTA|OPERADOR|T\u00c9CNICO|TECNICO)/i.test(c));
          const role = roleCell ? roleCell.toUpperCase() : "OPERADOR";
          const ex = map.get(login);
          map.set(login, {
            login,
            name: (ex && ex.name) || name,
            matricula: (ex && ex.matricula) || "",
            sector: (ex && ex.sector) || "Metrologia / Turbo",
            role: (ex && ex.role) || role,
            perms: (ex && ex.perms) || (PRESET_PERMS[role] || PRESET_PERMS.OPERADOR)
          });
        }
      });
    });

    if (!map.has("pablo")) {
      map.set("pablo", {
        login: "pablo",
        name: "Pablo Carvalho",
        matricula: "",
        sector: "Metrologia / Turbo",
        role: "ADMIN",
        perms: PRESET_PERMS.ADMIN
      });
    }
    return Array.from(map.values());
  };

  /* -------------------- CONTROLE DE VOLTAR (APP ANDROID + MOBILE WEB) -------------------- */
  let currentTab = "painel";
  const tabHistory = [];
  let isNavigatingBack = false;

  const detectTabKey = (el) => {
    const raw = norm(el.textContent).replace(/\s+/g, " ");
    if (!raw || raw.length > 36) return null;
    if (raw === "painel" || raw.startsWith("command center")) return "painel";
    if (raw.startsWith("inventario")) return "inventario";
    if (raw.startsWith("cautela")) return "cautela";
    if (raw === "lab" || raw.startsWith("lab & baixas") || raw.startsWith("lab ")) return "lab";
    return null;
  };

  const pushBrowserHistory = () => {
    try { window.history.pushState({ vuNav: true }, ""); } catch (_) {}
  };

  const clickTabByKey = (key) => {
    const btns = Array.from(document.querySelectorAll("nav button, nav a, aside button, aside a, footer button, [role=tab], button"));
    const match = btns.find((b) => isVisible(b) && detectTabKey(b) === key && !b.closest("#vu-adm-inner") && !b.closest("#vu-bulk-modal"));
    if (match) {
      isNavigatingBack = true;
      match.click();
      currentTab = key;
      setTimeout(() => { isNavigatingBack = false; }, 120);
      return true;
    }
    return false;
  };

  const findCloseBtn = (root) => {
    if (!root) return null;
    return Array.from(root.querySelectorAll("button")).find((b) => {
      if (!isVisible(b)) return false;
      const t = String(b.textContent || "").trim();
      const aria = String(b.getAttribute("aria-label") || "").toLowerCase();
      return t === "\u00d7" || t === "x" || t === "X" || t === "\u2715" || aria.includes("fechar") || aria.includes("close");
    }) || null;
  };

  const handleBackAction = () => {
    const bulk = document.getElementById("vu-bulk-modal");
    if (bulk && isVisible(bulk)) {
      bulk.remove();
      return "handled";
    }

    const dl = document.getElementById("vu-dl-voith");
    if (dl && isVisible(dl)) {
      dl.remove();
      return "handled";
    }

    const admInner = document.getElementById("vu-adm-inner");
    if (admInner && isVisible(admInner)) {
      const closeAdm = findCloseBtn(admInner);
      if (closeAdm) {
        closeAdm.click();
        return "handled";
      }
    }

    const openOverlays = Array.from(document.querySelectorAll("[role=dialog], .fixed.inset-0")).filter((el) => {
      if (!isVisible(el) || el.id === "vu-dl-voith" || el.id === "vu-bulk-modal") return false;
      return !String(el.textContent || "").includes("Monitoramento de Frota");
    });
    for (let i = openOverlays.length - 1; i >= 0; i--) {
      const cBtn = findCloseBtn(openOverlays[i]);
      if (cBtn) {
        cBtn.click();
        return "handled";
      }
    }

    const drawer = Array.from(document.querySelectorAll("aside, div")).find((el) => {
      if (!isVisible(el)) return false;
      const r = el.getBoundingClientRect();
      const t = String(el.textContent || "");
      return r.left >= -5 && r.width > 180 && r.width < window.innerWidth * 0.9 && t.includes("WORKSPACES") && t.includes("Command Center");
    });
    if (drawer && window.innerWidth <= 900) {
      const closeDrawer = findCloseBtn(drawer);
      if (closeDrawer) {
        closeDrawer.click();
        return "handled";
      }
    }

    while (tabHistory.length > 0) {
      const prev = tabHistory.pop();
      if (prev && prev !== currentTab && clickTabByKey(prev)) return "handled";
    }

    if (currentTab !== "painel" && clickTabByKey("painel")) return "handled";
    return "exit";
  };

  window.__voithBackHandler = handleBackAction;

  document.addEventListener("click", (ev) => {
    if (isNavigatingBack) return;
    const btn = ev.target && ev.target.closest ? ev.target.closest("button, a") : null;
    if (!btn || btn.closest("#vu-adm-inner") || btn.closest("#vu-dl-voith") || btn.closest("#vu-bulk-modal")) return;
    const key = detectTabKey(btn);
    if (key && key !== currentTab) {
      tabHistory.push(currentTab);
      if (tabHistory.length > 20) tabHistory.shift();
      currentTab = key;
      pushBrowserHistory();
    }
  }, true);

  window.addEventListener("popstate", () => { handleBackAction(); });

  /* -------------------- PORTAL DE DOWNLOADS VOITH -------------------- */
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
    pushBrowserHistory();
    let tag = "Latest", apkUrl = APK_FALLBACK, exeUrl = EXE_FALLBACK;
    let apkMeta = "Pacote Android (.apk) \u2022 Coleta em campo e cautela";
    let exeMeta = "Instalador Windows (.exe) \u2022 Esta\u00e7\u00f5es de trabalho e lab";
    try {
      const r = await fetch("https://api.github.com/repos/carvpab/voith-metrologia-app/releases/latest");
      if (r.ok) {
        const j = await r.json();
        tag = j.tag_name || tag;
        const a = j.assets || [];
        const apk = a.find(x => /\.apk$/i.test(x.name));
        const exe = a.find(x => /\.exe$/i.test(x.name));
        if (apk) {
          apkUrl = apk.browser_download_url;
          if (apk.size) apkMeta = "APK Android \u2022 " + (apk.size / 1048576).toFixed(1) + " MB \u2022 Campo e cautela";
        }
        if (exe) {
          exeUrl = exe.browser_download_url;
          if (exe.size) exeMeta = "Windows EXE \u2022 " + (exe.size / 1048576).toFixed(1) + " MB \u2022 PC e laborat\u00f3rio";
        }
      }
    } catch (_) {}

    const d = document.createElement("div");
    d.id = "vu-dl-voith";
    d.style.cssText = "position:fixed;inset:0;z-index:10600;overflow:auto;padding:28px 16px;background-image:linear-gradient(rgba(148,163,184,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(148,163,184,.06) 1px,transparent 1px),radial-gradient(circle at 20% 15%,rgba(0,102,204,.35),transparent 45%),linear-gradient(145deg,#061021 0%,#0a1d3d 55%,#071329 100%);background-size:32px 32px,32px 32px,100% 100%,100% 100%;color:#f8fafc;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;";
    d.innerHTML =
      '<div style="max-width:940px;margin:0 auto;background:rgba(255,255,255,.98);color:#0f172a;border-radius:18px;overflow:hidden;box-shadow:0 28px 70px rgba(0,0,0,.55);border:1px solid rgba(147,197,253,.45);">' +
        '<div style="background:linear-gradient(90deg,#002466 0%,#004899 55%,#0066cc 100%);color:#fff;padding:20px 26px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;border-bottom:3px solid #38bdf8;">' +
          '<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;">' +
            '<span style="background:#fff;color:#003399;font-weight:900;font-size:14px;padding:6px 12px;border-radius:8px;letter-spacing:.08em;">VOITH</span>' +
            '<div><div style="font-weight:800;font-size:17px;">Voith Metrologia &bull; Portal de Downloads</div><div style="font-size:12px;color:#bfdbfe;margin-top:2px;">Release ativa: <strong style="color:#fff;">' + tag + '</strong></div></div>' +
          '</div>' +
          '<div style="display:flex;gap:8px;">' +
            '<button type="button" id="vu-go-login" style="padding:9px 15px;border-radius:9px;border:1px solid rgba(255,255,255,.4);background:rgba(255,255,255,.16);color:#fff;font-weight:700;font-size:12.5px;cursor:pointer;">Op&ccedil;&otilde;es de Login</button>' +
            '<button type="button" id="vu-close-dl" style="width:36px;height:36px;border-radius:9px;border:1px solid rgba(255,255,255,.4);background:rgba(255,255,255,.16);color:#fff;font-size:20px;line-height:1;cursor:pointer;">&times;</button>' +
          '</div>' +
        '</div>' +
        '<div style="padding:28px 26px;background:linear-gradient(180deg,#f8fafc 0%,#eef4fb 100%);">' +
          '<div style="margin-bottom:22px;"><div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.09em;color:#004899;">Metrologia &bull; Voith Turbo</div><h1 style="margin:4px 0 6px;font-size:24px;font-weight:900;color:#0f172a;">Escolha o instalador do seu dispositivo</h1><p style="margin:0;font-size:13.5px;color:#475569;">Baixe a vers&atilde;o oficial mais recente para Android ou Windows.</p></div>' +
          '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(265px,1fr));gap:20px;">' +
            '<div style="background:#fff;border:1px solid #cbd5e1;border-top:5px solid #0055b8;border-radius:14px;padding:22px;display:flex;flex-direction:column;justify-content:space-between;gap:16px;"><div><span style="font-size:11px;font-weight:800;padding:4px 10px;border-radius:999px;background:#eff6ff;color:#004899;">ANDROID &bull; TABLET / CELULAR</span><div style="font-size:19px;font-weight:800;margin:12px 0 6px;">Voith Metrologia Android</div><div style="font-size:13px;color:#475569;">' + apkMeta + '</div></div><a href="' + apkUrl + '" target="_blank" rel="noopener" style="display:block;text-align:center;padding:12px;border-radius:10px;background:linear-gradient(90deg,#004899,#0066cc);color:#fff;font-weight:800;font-size:13.5px;text-decoration:none;">Baixar APK (.apk)</a></div>' +
            '<div style="background:#fff;border:1px solid #cbd5e1;border-top:5px solid #002466;border-radius:14px;padding:22px;display:flex;flex-direction:column;justify-content:space-between;gap:16px;"><div><span style="font-size:11px;font-weight:800;padding:4px 10px;border-radius:999px;background:#e2e8f0;color:#0f172a;">WINDOWS &bull; DESKTOP / PC</span><div style="font-size:19px;font-weight:800;margin:12px 0 6px;">Voith Metrologia Windows</div><div style="font-size:13px;color:#475569;">' + exeMeta + '</div></div><a href="' + exeUrl + '" target="_blank" rel="noopener" style="display:block;text-align:center;padding:12px;border-radius:10px;background:linear-gradient(90deg,#002466,#004899);color:#fff;font-weight:800;font-size:13.5px;text-decoration:none;">Baixar Instalador (.exe)</a></div>' +
          '</div>' +
          '<div style="margin-top:20px;padding-top:16px;border-top:1px solid #cbd5e1;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;"><span style="font-size:12.5px;color:#334155;">J&aacute; instalou o app? Acesse sua conta.</span><button type="button" id="vu-dl-login-cta" style="padding:10px 18px;border-radius:9px;border:1px solid #004899;background:#fff;color:#004899;font-weight:800;font-size:12.5px;cursor:pointer;">Ir para Op&ccedil;&otilde;es de Login &rarr;</button></div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(d);
    d.querySelector("#vu-close-dl").onclick = () => d.remove();
    d.querySelector("#vu-go-login").onclick = focusLogin;
    d.querySelector("#vu-dl-login-cta").onclick = focusLogin;
  };

  /* -------------------- ESTILOS VIA CSS PURO -------------------- */
  const ensureStyles = () => {
    if (document.getElementById("vu-admin-sidebar-css")) return;
    const st = document.createElement("style");
    st.id = "vu-admin-sidebar-css";
    st.textContent = `
      #vu-dl-btn {
        position: fixed;
        bottom: 14px;
        right: 14px;
        padding: 8px 14px;
        font-size: 12px;
        z-index: 35;
        border-radius: 8px;
        border: 1px solid #93c5fd;
        background: linear-gradient(90deg, #002466, #0055b8);
        color: #ffffff;
        font-weight: 800;
        font-family: system-ui, -apple-system, sans-serif;
        box-shadow: 0 8px 20px rgba(0, 51, 153, .35);
        cursor: pointer;
      }
      @media (max-width: 768px) {
        #vu-dl-btn {
          bottom: 82px;
          right: 12px;
          padding: 6px 11px;
          font-size: 11px;
        }
        #vu-inv-bulk-bar {
          bottom: 82px !important;
          width: 94vw !important;
          justify-content: center !important;
        }
      }
      .vu-adm-card-host {
        max-width: 1080px !important;
        width: 95vw !important;
        max-height: 90vh !important;
        padding: 0 !important;
        overflow: hidden !important;
      }
      #vu-adm-inner {
        display: flex;
        flex-direction: row;
        width: 100%;
        max-height: 90vh;
        background: #ffffff;
        overflow: hidden;
      }
      #vu-admin-sidebar {
        width: 245px;
        flex: 0 0 245px;
        background: #f8fafc;
        border-right: 1px solid #e2e8f0;
        padding: 14px 10px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        overflow-y: auto;
      }
      #vu-admin-sidebar .vu-side-item {
        display: flex !important;
        align-items: center !important;
        gap: 8px !important;
        width: 100% !important;
        text-align: left !important;
        padding: 10px 12px !important;
        border-radius: 10px !important;
        border: none !important;
        background: transparent !important;
        font-size: 13px !important;
        font-weight: 600 !important;
        color: #475569 !important;
        cursor: pointer !important;
        white-space: normal !important;
        line-height: 1.25 !important;
      }
      #vu-admin-sidebar .vu-side-item:hover {
        background: #eef2ff !important;
        color: #1e3a8a !important;
      }
      #vu-admin-sidebar .vu-side-item.vu-active {
        background: #dbeafe !important;
        color: #004899 !important;
        font-weight: 800 !important;
        box-shadow: inset 3px 0 0 #0284c7 !important;
      }
      #vu-admin-main {
        flex: 1 1 auto;
        min-width: 0;
        display: flex;
        flex-direction: column;
        max-height: 90vh;
        overflow: hidden;
        padding: 16px 20px;
        background: #ffffff;
      }
      #vu-admin-scroll {
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
        padding-top: 12px;
        padding-right: 4px;
      }
      @media (max-width: 768px) {
        .vu-adm-card-host {
          width: 96vw !important;
          max-height: 92vh !important;
        }
        #vu-adm-inner {
          flex-direction: column;
          max-height: 92vh;
        }
        #vu-admin-sidebar {
          width: 100%;
          flex: 0 0 auto;
          flex-direction: row;
          overflow-x: auto;
          overflow-y: hidden;
          border-right: none;
          border-bottom: 1px solid #e2e8f0;
          padding: 8px;
          order: 2;
        }
        #vu-admin-sidebar .vu-side-item {
          width: auto !important;
          flex: 0 0 auto !important;
          white-space: nowrap !important;
          padding: 8px 11px !important;
          font-size: 12px !important;
        }
        #vu-admin-main {
          padding: 12px;
          order: 1;
          flex: 1 1 auto;
          min-height: 0;
        }
      }
    `;
    document.head.appendChild(st);
  };

  const addDownloadBtnOnce = () => {
    if (document.getElementById("vu-dl-btn")) return;
    const b = document.createElement("button");
    b.id = "vu-dl-btn";
    b.type = "button";
    b.textContent = "Baixar App";
    b.onclick = openDownloadPage;
    document.body.appendChild(b);
  };

  /* -------------------- RENDERIZADORES DAS ABAS EXTRAS DO ADMIN -------------------- */
  const renderRbacView = (container, modalScope) => {
    let selectedLogin = discoverUsers(modalScope)[0].login;
    let lastMsg = "";

    const draw = () => {
      const users = discoverUsers(modalScope);
      const active = users.find(u => u.login === selectedLogin) || users[0];
      const permSet = new Set(active.perms || []);

      const chips = users.map(u => {
        const sel = u.login === active.login;
        return `<button type="button" data-pick="${u.login}" style="padding:7px 12px;border-radius:8px;border:1px solid ${sel ? "#004899" : "#cbd5e1"};background:${sel ? "#004899" : "#fff"};color:${sel ? "#fff" : "#0f172a"};font-size:12px;font-weight:700;cursor:pointer;">${u.name} (${u.login})</button>`;
      }).join("");

      const sectorOpts = SECTORS.map(s => `<option value="${s}" ${active.sector === s ? "selected" : ""}>${s}</option>`).join("");

      const groupsHtml = PERMISSION_GROUPS.map(g => {
        const items = g.items.map(it =>
          `<label style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:8px;background:#f8fafc;border:1px solid #e2e8f0;font-size:12px;color:#1e293b;cursor:pointer;">` +
            `<input type="checkbox" class="vu-perm-cb" data-pid="${it.id}" ${permSet.has(it.id) ? "checked" : ""} style="width:15px;height:15px;accent-color:#004899;cursor:pointer;">` +
            `<span>${it.label}</span>` +
          `</label>`
        ).join("");
        return `<div style="padding:12px 14px;border-radius:12px;background:#fff;border:1px solid #cbd5e1;display:grid;gap:8px;"><div style="font-size:12.5px;font-weight:800;color:#002466;">${g.group}</div><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(225px,1fr));gap:7px;">${items}</div></div>`;
      }).join("");

      container.innerHTML =
        `<div style="display:grid;gap:12px;color:#0f172a;padding-bottom:18px;">` +
          `<div style="position:sticky;top:0;z-index:5;padding:12px 14px;border-radius:12px;background:#eff6ff;border:1px solid #93c5fd;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">` +
            `<div>` +
              `<div style="font-size:14.5px;font-weight:800;color:#002466;">Gerenciar Login, Matr&iacute;cula, Setor &amp; Acessos</div>` +
              `<div style="font-size:12px;color:#334155;">Configure a pessoa e marque o que ela pode ou n&atilde;o fazer.</div>` +
            `</div>` +
            `<div style="display:flex;gap:8px;flex-wrap:wrap;">` +
              `<button type="button" id="vu-new-user-btn" style="padding:8px 12px;border-radius:8px;border:1px solid #004899;background:#fff;color:#004899;font-weight:800;font-size:12px;cursor:pointer;">+ Nova Pessoa</button>` +
              `<button type="button" id="vu-save-top-btn" style="padding:8px 16px;border-radius:8px;border:none;background:#16a34a;color:#fff;font-weight:800;font-size:12px;cursor:pointer;box-shadow:0 4px 12px rgba(22,163,74,.28);">Salvar Acessos</button>` +
            `</div>` +
          `</div>` +
          (lastMsg ? `<div style="padding:9px 12px;border-radius:8px;background:#dcfce7;border:1px solid #86efac;color:#166534;font-size:12px;font-weight:700;">${lastMsg}</div>` : "") +
          `<div style="padding:14px;border-radius:12px;background:#fff;border:1px solid #cbd5e1;display:grid;gap:12px;">` +
            `<div style="display:flex;gap:8px;flex-wrap:wrap;">${chips}</div>` +
            `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;">` +
              `<label style="display:grid;gap:4px;font-size:11.5px;font-weight:700;color:#334155;">Login<input id="vu-ed-login" type="text" value="${active.login}" style="padding:8px 10px;border-radius:8px;border:1px solid #cbd5e1;font-size:12.5px;color:#0f172a;"></label>` +
              `<label style="display:grid;gap:4px;font-size:11.5px;font-weight:700;color:#334155;">Nome Completo<input id="vu-ed-name" type="text" value="${active.name}" style="padding:8px 10px;border-radius:8px;border:1px solid #cbd5e1;font-size:12.5px;color:#0f172a;"></label>` +
              `<label style="display:grid;gap:4px;font-size:11.5px;font-weight:700;color:#334155;">Matr&iacute;cula<input id="vu-ed-mat" type="text" value="${active.matricula || ""}" placeholder="Ex: 104829" style="padding:8px 10px;border-radius:8px;border:1px solid #cbd5e1;font-size:12.5px;color:#0f172a;"></label>` +
              `<label style="display:grid;gap:4px;font-size:11.5px;font-weight:700;color:#334155;">Setor<select id="vu-ed-sector" style="padding:8px 10px;border-radius:8px;border:1px solid #cbd5e1;font-size:12.5px;color:#0f172a;background:#fff;">${sectorOpts}</select></label>` +
            `</div>` +
            `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">` +
              `<span style="font-size:11.5px;font-weight:700;color:#475569;">Preencher modelo:</span>` +
              `<button type="button" data-pre="ADMIN" style="padding:4px 10px;border-radius:6px;border:1px solid #93c5fd;background:#eff6ff;color:#003399;font-size:11.5px;font-weight:700;cursor:pointer;">Admin</button>` +
              `<button type="button" data-pre="GESTOR" style="padding:4px 10px;border-radius:6px;border:1px solid #bae6fd;background:#f0f9ff;color:#0369a1;font-size:11.5px;font-weight:700;cursor:pointer;">Gestor</button>` +
              `<button type="button" data-pre="METROLOGISTA" style="padding:4px 10px;border-radius:6px;border:1px solid #cbd5e1;background:#f8fafc;color:#0f172a;font-size:11.5px;font-weight:700;cursor:pointer;">Metrologista</button>` +
              `<button type="button" data-pre="OPERADOR" style="padding:4px 10px;border-radius:6px;border:1px solid #e2e8f0;background:#fff;color:#475569;font-size:11.5px;font-weight:700;cursor:pointer;">Operador</button>` +
            `</div>` +
          `</div>` +
          groupsHtml +
          `<div style="display:flex;justify-content:flex-end;">` +
            `<button type="button" id="vu-save-bottom-btn" style="padding:10px 20px;border-radius:8px;border:none;background:#16a34a;color:#fff;font-weight:800;font-size:13px;cursor:pointer;">Salvar Acessos da Pessoa</button>` +
          `</div>` +
        `</div>`;

      const doSave = () => {
        const lg = String(container.querySelector("#vu-ed-login").value || "").trim().toLowerCase();
        const nm = String(container.querySelector("#vu-ed-name").value || "").trim();
        const mt = String(container.querySelector("#vu-ed-mat").value || "").trim();
        const sc = String(container.querySelector("#vu-ed-sector").value || "Metrologia / Turbo");
        if (!lg) return;
        const checked = Array.from(container.querySelectorAll(".vu-perm-cb:checked")).map(cb => cb.getAttribute("data-pid"));
        const all = loadProfiles();
        all[lg] = { login: lg, name: nm || lg, matricula: mt, sector: sc, role: checked.length === ALL_PERM_IDS.length ? "ADMIN" : "CUSTOM", perms: checked };
        saveProfiles(all);
        pushAudit("Hierarquia Atualizada", `${nm || lg} (${lg}) | Mat: ${mt || "-"} | Setor: ${sc} | ${checked.length} permiss\u00f5es`);
        selectedLogin = lg;
        lastMsg = `Salvo! ${nm || lg} (${lg}) \u2022 Matr\u00edcula: ${mt || "\u2014"} \u2022 Setor: ${sc} \u2022 ${checked.length} acessos ativos.`;
        draw();
      };

      container.querySelector("#vu-save-top-btn").onclick = doSave;
      container.querySelector("#vu-save-bottom-btn").onclick = doSave;
      container.querySelectorAll("[data-pick]").forEach(b => {
        b.onclick = () => { selectedLogin = b.getAttribute("data-pick"); lastMsg = ""; draw(); };
      });
      container.querySelectorAll("[data-pre]").forEach(b => {
        b.onclick = () => {
          const set = new Set(PRESET_PERMS[b.getAttribute("data-pre")] || []);
          container.querySelectorAll(".vu-perm-cb").forEach(cb => { cb.checked = set.has(cb.getAttribute("data-pid")); });
        };
      });
      container.querySelector("#vu-new-user-btn").onclick = () => {
        const nl = prompt("Login da nova pessoa (ex: lucas):");
        if (!nl) return;
        const clean = nl.trim().toLowerCase();
        const nm = prompt("Nome completo (ex: Lucas Galbe):") || clean;
        const mt = prompt("Matr\u00edcula (opcional):") || "";
        const all = loadProfiles();
        all[clean] = { login: clean, name: nm.trim(), matricula: mt.trim(), sector: "Metrologia / Turbo", role: "OPERADOR", perms: PRESET_PERMS.OPERADOR };
        saveProfiles(all);
        pushAudit("Pessoa Adicionada", `${nm.trim()} (${clean})`);
        selectedLogin = clean;
        lastMsg = `Pessoa ${nm.trim()} criada. Marque os acessos e clique em Salvar Acessos.`;
        draw();
      };
    };
    draw();
  };

  const renderExtraTabView = (tabId, container, modalScope) => {
    const items = readLiveInstruments();
    const totalCount = items.length || 441;

    if (tabId === "admTabRbac") {
      renderRbacView(container, modalScope);
      return;
    }

    if (tabId === "admTabBatchDraft") {
      container.innerHTML =
        `<div style="display:grid;gap:12px;color:#0f172a;">` +
          `<div style="padding:14px;border-radius:12px;background:#ecfeff;border:1px solid #a5f3fc;"><div style="font-size:15px;font-weight:800;color:#155e75;">&#128230; Lote &amp; Romaneio Externo</div><div style="font-size:12.5px;color:#334155;">Monte lotes de envio para laborat&oacute;rios acreditados RBC/Inmetro e emita romaneio de sa&iacute;da.</div></div>` +
          `<div style="padding:14px;border-radius:12px;background:#fff;border:1px solid #cbd5e1;display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;">` +
            `<label style="display:grid;gap:4px;font-size:11.5px;font-weight:700;">Laborat&oacute;rio Destino<input id="vu-batch-lab" placeholder="Ex: Lab Calibra\u00e7\u00e3o RBC" style="padding:8px;border-radius:8px;border:1px solid #cbd5e1;"></label>` +
            `<label style="display:grid;gap:4px;font-size:11.5px;font-weight:700;">N&ordm; RPS / NF<input id="vu-batch-nf" placeholder="Ex: NF-2026-084" style="padding:8px;border-radius:8px;border:1px solid #cbd5e1;"></label>` +
            `<label style="display:grid;gap:4px;font-size:11.5px;font-weight:700;">C&oacute;digos dos Instrumentos<input id="vu-batch-codes" placeholder="Ex: AC422294, AC407781" style="padding:8px;border-radius:8px;border:1px solid #cbd5e1;"></label>` +
          `</div>` +
          `<div style="display:flex;gap:8px;justify-content:flex-end;">` +
            `<button type="button" id="vu-batch-print" style="padding:9px 16px;border-radius:8px;border:none;background:#0891b2;color:#fff;font-weight:800;font-size:12.5px;cursor:pointer;">Gerar Romaneio para Impress&atilde;o</button>` +
          `</div>` +
          `<div id="vu-batch-out" style="font-size:12px;color:#15803d;font-weight:700;"></div>` +
        `</div>`;
      container.querySelector("#vu-batch-print").onclick = () => {
        const lab = container.querySelector("#vu-batch-lab").value || "Laborat\u00f3rio Externo";
        const nf = container.querySelector("#vu-batch-nf").value || "S/N";
        const codes = container.querySelector("#vu-batch-codes").value || "Lista selecionada";
        pushAudit("Romaneio Gerado", `Lab: ${lab} | NF: ${nf} | Itens: ${codes}`);
        container.querySelector("#vu-batch-out").textContent = `Romaneio registrado (${lab} \u2022 ${nf}). Abrindo impress\u00e3o...`;
        const w = window.open("", "_blank");
        if (w) {
          w.document.write(`<html><head><title>Romaneio Voith</title></head><body style="font-family:sans-serif;padding:24px;"><h2>VOITH TURBO &mdash; Romaneio de Calibra&ccedil;&atilde;o Externa</h2><p><strong>Laborat&oacute;rio:</strong> ${lab}<br><strong>RPS / NF:</strong> ${nf}<br><strong>Data:</strong> ${new Date().toLocaleDateString("pt-BR")}</p><hr><p><strong>Instrumentos:</strong> ${codes}</p><script>window.print();<\/script></body></html>`);
          w.document.close();
        }
      };
      return;
    }

    if (tabId === "admTabDueWindow") {
      container.innerHTML =
        `<div style="display:grid;gap:12px;color:#0f172a;">` +
          `<div style="padding:14px;border-radius:12px;background:#fff1f2;border:1px solid #fecdd3;"><div style="font-size:15px;font-weight:800;color:#9f1239;">&#9203; Vencimentos Programados (7 / 15 / 30 / 60 dias)</div><div style="font-size:12.5px;color:#475569;">Acompanhamento preventivo da frota (${totalCount} instrumentos) para evitar bloqueio em auditoria.</div></div>` +
          `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px;">` +
            `<div style="padding:14px;border-radius:10px;background:#fff;border:1px solid #fecdd3;border-top:4px solid #e11d48;"><div style="font-size:11px;font-weight:800;color:#e11d48;">CR&Iacute;TICO &bull; 7 DIAS</div><div style="font-size:20px;font-weight:900;margin-top:4px;">A&ccedil;&atilde;o Imediata</div><div style="font-size:11.5px;color:#64748b;">Priorizar recolhimento</div></div>` +
            `<div style="padding:14px;border-radius:10px;background:#fff;border:1px solid #fed7aa;border-top:4px solid #ea580c;"><div style="font-size:11px;font-weight:800;color:#ea580c;">ALERTA &bull; 15 DIAS</div><div style="font-size:20px;font-weight:900;margin-top:4px;">Programar Lote</div><div style="font-size:11.5px;color:#64748b;">SLA m&eacute;dio lab: 15d</div></div>` +
            `<div style="padding:14px;border-radius:10px;background:#fff;border:1px solid #fde68a;border-top:4px solid #d97706;"><div style="font-size:11px;font-weight:800;color:#d97706;">RADAR &bull; 30 DIAS</div><div style="font-size:20px;font-weight:900;margin-top:4px;">Pr&oacute;ximo M&ecirc;s</div><div style="font-size:11.5px;color:#64748b;">Avisar respons&aacute;veis</div></div>` +
            `<div style="padding:14px;border-radius:10px;background:#fff;border:1px solid #bfdbfe;border-top:4px solid #2563eb;"><div style="font-size:11px;font-weight:800;color:#2563eb;">PREVIS&Atilde;O &bull; 60 DIAS</div><div style="font-size:20px;font-weight:900;margin-top:4px;">Planejamento</div><div style="font-size:11.5px;color:#64748b;">Or&ccedil;amento de calibra&ccedil;&atilde;o</div></div>` +
          `</div>` +
        `</div>`;
      return;
    }

    if (tabId === "admTabHolderPend") {
      const profiles = discoverUsers(modalScope);
      const rows = profiles.map(u => `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-radius:10px;background:#fff;border:1px solid #cbd5e1;"><div><strong>${u.name}</strong> <span style="color:#64748b;font-size:12px;">(${u.login})</span><div style="font-size:11.5px;color:#475569;">Setor: ${u.sector} &bull; Matr&iacute;cula: ${u.matricula || "\u2014"}</div></div><span style="padding:4px 10px;border-radius:999px;background:#f0fdfa;color:#0f766e;font-size:11.5px;font-weight:700;border:1px solid #99f6e4;">Regular / Sem Atrasos</span></div>`).join("");
      container.innerHTML =
        `<div style="display:grid;gap:12px;color:#0f172a;">` +
          `<div style="padding:14px;border-radius:12px;background:#f0fdfa;border:1px solid #99f6e4;"><div style="font-size:15px;font-weight:800;color:#115e59;">&#128119; Pend&ecirc;ncias por Colaborador</div><div style="font-size:12.5px;color:#334155;">Controle de cautelas ativas e devolu&ccedil;&otilde;es pendentes por respons&aacute;vel.</div></div>` +
          `<div style="display:grid;gap:8px;">${rows}</div>` +
        `</div>`;
      return;
    }

    if (tabId === "admTabSlaInline") {
      container.innerHTML =
        `<div style="display:grid;gap:12px;color:#0f172a;">` +
          `<div style="padding:14px;border-radius:12px;background:#eef2ff;border:1px solid #c7d2fe;"><div style="font-size:15px;font-weight:800;color:#3730a3;">&#128202; SLA, Custos &amp; Deriva Metrol&oacute;gica</div><div style="font-size:12.5px;color:#334155;">Indicadores de desempenho de laborat&oacute;rios externos, prazo m&eacute;dio e rastreabilidade.</div></div>` +
          `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;">` +
            `<div style="padding:14px;border-radius:10px;background:#fff;border:1px solid #cbd5e1;"><div style="font-size:11px;font-weight:800;color:#4f46e5;">META SLA LABORAT&Oacute;RIO</div><div style="font-size:22px;font-weight:900;margin-top:4px;">15 dias</div><div style="font-size:11.5px;color:#64748b;">Prazo contratual m&aacute;ximo</div></div>` +
            `<div style="padding:14px;border-radius:10px;background:#fff;border:1px solid #cbd5e1;"><div style="font-size:11px;font-weight:800;color:#0284c7;">FROTA MONITORADA</div><div style="font-size:22px;font-weight:900;margin-top:4px;">${totalCount} itens</div><div style="font-size:11.5px;color:#64748b;">Voith Turbo &bull; 9 setores</div></div>` +
            `<div style="padding:14px;border-radius:10px;background:#fff;border:1px solid #cbd5e1;"><div style="font-size:11px;font-weight:800;color:#16a34a;">CONFORMIDADE ISO 9001</div><div style="font-size:22px;font-weight:900;margin-top:4px;">Ativa</div><div style="font-size:11.5px;color:#64748b;">Certificados e hist&oacute;rico em nuvem</div></div>` +
          `</div>` +
        `</div>`;
      return;
    }

    if (tabId === "admTabAudit") {
      const logs = loadAudit();
      const logRows = logs.length
        ? logs.map(l => `<div style="padding:8px 10px;border-radius:8px;background:#fff;border:1px solid #e2e8f0;font-size:12px;"><strong>${l.at}</strong> &mdash; <span style="color:#004899;font-weight:700;">${l.action}</span>: ${l.detail}</div>`).join("")
        : `<div style="padding:12px;border-radius:8px;background:#f8fafc;border:1px solid #e2e8f0;font-size:12px;color:#64748b;">Nenhuma altera&ccedil;&atilde;o registrada nesta sess&atilde;o ainda. Altera&ccedil;&otilde;es de hierarquia, cautela em massa e romaneios aparecem aqui automaticamente.</div>`;
      container.innerHTML =
        `<div style="display:grid;gap:12px;color:#0f172a;">` +
          `<div style="padding:14px;border-radius:12px;background:#f0f9ff;border:1px solid #bae6fd;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;"><div><div style="font-size:15px;font-weight:800;color:#075985;">&#128737; Auditoria &amp; Governan&ccedil;a</div><div style="font-size:12.5px;color:#334155;">Trilha de auditoria para altera&ccedil;&otilde;es de acessos, permiss&otilde;es e movimenta&ccedil;&otilde;es.</div></div><button type="button" id="vu-exp-audit" style="padding:7px 12px;border-radius:8px;border:1px solid #0284c7;background:#fff;color:#0284c7;font-weight:800;font-size:12px;cursor:pointer;">Exportar CSV</button></div>` +
          `<div style="display:grid;gap:6px;">${logRows}</div>` +
        `</div>`;
      container.querySelector("#vu-exp-audit").onclick = () => {
        const csv = "Data;Acao;Detalhes\n" + loadAudit().map(l => `"${l.at}";"${l.action}";"${l.detail}"`).join("\n");
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
        a.download = "auditoria-voith-metrologia.csv";
        a.click();
      };
      return;
    }

    if (tabId === "admTabSplit") {
      const ver = (window.VOITH_CONFIG && window.VOITH_CONFIG.APP_VERSION) || "16.25.0";
      container.innerHTML =
        `<div style="display:grid;gap:12px;color:#0f172a;">` +
          `<div style="padding:14px;border-radius:12px;background:#ecfdf5;border:1px solid #a7f3d0;"><div style="font-size:15px;font-weight:800;color:#065f46;">&#129513; Modulariza&ccedil;&atilde;o &amp; Arquitetura HTML</div><div style="font-size:12.5px;color:#334155;">Status dos m&oacute;dulos carregados na aplica&ccedil;&atilde;o (Vers&atilde;o ${ver}).</div></div>` +
          `<div style="display:grid;gap:8px;font-size:12.5px;">` +
            `<div style="padding:10px 12px;border-radius:8px;background:#fff;border:1px solid #cbd5e1;"><strong>index.html</strong> &mdash; Cockpit principal + Supabase + Realtime</div>` +
            `<div style="padding:10px 12px;border-radius:8px;background:#fff;border:1px solid #cbd5e1;"><strong>modules/voith-upgrade-suite.js</strong> &mdash; Sidebar Admin, RBAC, Busca Parcial, Cautela em Massa &amp; Downloads</div>` +
            `<div style="padding:10px 12px;border-radius:8px;background:#fff;border:1px solid #cbd5e1;"><strong>app.js / cloud.js / db.js / views.js</strong> &mdash; M&oacute;dulos preparados para separa&ccedil;&atilde;o incremental</div>` +
          `</div>` +
        `</div>`;
    }
  };

  /* -------------------- SIDEBAR DO MODAL ADMINISTRATIVO -------------------- */
  const upgradeAdminModal = () => {
    if (document.getElementById("vu-adm-inner")) return;

    const titleEl = Array.from(document.querySelectorAll("h1, h2, h3, h4, span, p, div")).find((el) => {
      if (!isVisible(el)) return false;
      const txt = String(el.textContent || "").trim();
      if (!txt.includes("Painel Administrativo (Voith)") || txt.length > 80) return false;
      return !Array.from(el.children).some(ch => String(ch.textContent || "").includes("Painel Administrativo (Voith)"));
    });
    if (!titleEl) return;

    let modalCard = titleEl.parentElement;
    while (modalCard && modalCard !== document.body && modalCard !== document.documentElement) {
      const txt = String(modalCard.textContent || "");
      if (txt.includes("Usu\u00e1rios & Logins") && txt.includes("OTA & Telemetria")) break;
      modalCard = modalCard.parentElement;
    }

    if (!modalCard || modalCard === document.body || modalCard === document.documentElement) return;
    if (modalCard.dataset.vuSidebarDone === "1") return;

    const cardTxt = String(modalCard.textContent || "");
    if (
      cardTxt.includes("Monitoramento de Frota") ||
      cardTxt.includes("WORKSPACES") ||
      cardTxt.includes("Command Center") ||
      modalCard.classList.contains("inset-0")
    ) {
      return;
    }

    modalCard.dataset.vuSidebarDone = "1";
    modalCard.classList.add("vu-adm-card-host");
    pushBrowserHistory();

    const nativeTabBtns = Array.from(modalCard.querySelectorAll("button, [role=tab]")).filter(btn => {
      const t = String(btn.textContent || "").replace(/\s+/g, " ").trim();
      return /^(Usu\u00e1rios & Logins|Locais & Setores Oficiais|Risco & SLA Lab|OTA & Telemetria|Tipos de Login & Hierarquia)$/i.test(t);
    });
    const origTabBar = nativeTabBtns[0] ? nativeTabBtns[0].parentElement : null;

    const inner = document.createElement("div");
    inner.id = "vu-adm-inner";

    const sidebar = document.createElement("aside");
    sidebar.id = "vu-admin-sidebar";

    const mainCol = document.createElement("div");
    mainCol.id = "vu-admin-main";

    const scrollArea = document.createElement("div");
    scrollArea.id = "vu-admin-scroll";

    const customView = document.createElement("div");
    customView.id = "vu-custom-tab-view";
    customView.style.display = "none";

    let darkHeader = titleEl;
    while (darkHeader.parentElement && darkHeader.parentElement !== modalCard) {
      darkHeader = darkHeader.parentElement;
    }

    const existingChildren = Array.from(modalCard.children);
    modalCard.innerHTML = "";
    inner.appendChild(sidebar);
    inner.appendChild(mainCol);
    modalCard.appendChild(inner);

    const nativeBodyBlocks = [];
    existingChildren.forEach((ch) => {
      if (ch === darkHeader) {
        ch.style.borderRadius = "10px";
        ch.style.flexShrink = "0";
        mainCol.appendChild(ch);
      } else {
        scrollArea.appendChild(ch);
        nativeBodyBlocks.push(ch);
      }
    });
    scrollArea.appendChild(customView);
    mainCol.appendChild(scrollArea);

    const setActiveSideBtn = (activeBtn) => {
      sidebar.querySelectorAll(".vu-side-item").forEach(b => b.classList.remove("vu-active"));
      if (activeBtn) activeBtn.classList.add("vu-active");
    };

    const showNativeMode = (btn) => {
      customView.style.display = "none";
      nativeBodyBlocks.forEach(b => { if (b !== origTabBar) b.style.display = ""; });
      setActiveSideBtn(btn);
      scrollArea.scrollTop = 0;
    };

    const showCustomMode = (tabId, btn) => {
      nativeBodyBlocks.forEach(b => { b.style.display = "none"; });
      customView.style.display = "block";
      setActiveSideBtn(btn);
      renderExtraTabView(tabId, customView, modalCard);
      scrollArea.scrollTop = 0;
    };

    let rbacNativeBtn = null;
    nativeTabBtns.forEach((btn, idx) => {
      const txt = String(btn.textContent || "").replace(/\s+/g, " ").trim();
      btn.classList.add("vu-side-item");
      sidebar.appendChild(btn);

      if (/hierarquia|tipos de login/i.test(txt)) {
        rbacNativeBtn = btn;
        btn.id = "admTabRbac";
        btn.addEventListener("click", (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          showCustomMode("admTabRbac", btn);
        }, true);
      } else {
        if (idx === 0) btn.classList.add("vu-active");
        btn.addEventListener("click", () => showNativeMode(btn));
      }
    });

    if (origTabBar && origTabBar !== modalCard && origTabBar !== scrollArea && !origTabBar.querySelector("input, table, form")) {
      origTabBar.style.display = "none";
    }

    const extraTabs = [
      { id: "admTabBatchDraft", html: "&#128230; Lote &amp; Romaneio Externo", color: "#0891b2" },
      { id: "admTabDueWindow", html: "&#9203; Vencimentos (7/15/30/60d)", color: "#e11d48" },
      { id: "admTabHolderPend", html: "&#128119; Pend&ecirc;ncias Colaborador", color: "#0d9488" },
      { id: "admTabRbac", html: "&#128274; Tipos de Login &amp; Hierarquia", color: "#d97706" },
      { id: "admTabSlaInline", html: "&#128202; SLA, Custos &amp; Deriva", color: "#4f46e5" },
      { id: "admTabAudit", html: "&#128737; Auditoria &amp; Governan&ccedil;a", color: "#0284c7" },
      { id: "admTabSplit", html: "&#129513; Modularizar HTML", color: "#059669" }
    ];

    extraTabs.forEach((t) => {
      if (t.id === "admTabRbac" && rbacNativeBtn) return;
      const b = document.createElement("button");
      b.type = "button";
      b.id = t.id;
      b.className = "vu-side-item";
      b.innerHTML = `<span style="color:${t.color};font-weight:700;">${t.html}</span>`;
      b.addEventListener("click", () => showCustomMode(t.id, b));
      sidebar.appendChild(b);
    });
  };

  /* -------------------- AGENDAMENTO LEVE (SEM LOOP) -------------------- */
  let uiTimer = null;
  const ensureInternalCalibOption = () => {
    document.querySelectorAll("select").forEach((sel) => {
      if (sel.id === "vu-bulk-motivo") return;
      const opts = Array.from(sel.options || []);
      const isMotivo = opts.some((o) => /emprestimo operacional|calibracao externa|encaminhado para reparo/.test(norm(o.textContent)));
      if (!isMotivo) return;
      if (opts.some((o) => norm(o.textContent).includes("calibracao interna"))) return;
      const opt = document.createElement("option");
      opt.value = "Calibra\u00e7\u00e3o interna";
      opt.textContent = "Calibra\u00e7\u00e3o interna";
      const ref = opts.find((o) => norm(o.textContent).includes("calibracao externa"));
      if (ref && ref.nextSibling) sel.insertBefore(opt, ref.nextSibling);
      else sel.appendChild(opt);
    });
  };

  const runUiPass = () => {
    upgradeAdminModal();
    enhancePartialCodeSearch();
    injectBulkCustodyButton();
    updateInventoryBulkBar();
    ensureInternalCalibOption();
  };

  const scheduleUiPass = (delay = 140) => {
    if (uiTimer) return;
    uiTimer = setTimeout(() => {
      uiTimer = null;
      runUiPass();
    }, delay);
  };

  const boot = () => {
    ensureStyles();
    addDownloadBtnOnce();
    scheduleUiPass(200);

    document.addEventListener("click", () => {
      scheduleUiPass(120);
      setTimeout(() => scheduleUiPass(320), 320);
    }, true);

    document.addEventListener("change", (ev) => {
      if (ev.target && ev.target.type === "checkbox") {
        setTimeout(updateInventoryBulkBar, 30);
      }
    }, true);

    window.addEventListener("hashchange", () => scheduleUiPass(150));

    const obs = new MutationObserver((mutations) => {
      for (let i = 0; i < mutations.length; i++) {
        const tgt = mutations[i].target;
        if (tgt && tgt.id && tgt.id.startsWith("vu-")) continue;
        scheduleUiPass(160);
        break;
      }
    });
    obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "hidden"] });
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.VoithUpgrade = Object.assign({
    loadSessionProfile: () => {},
    setPendingMutations: () => {}
  }, window.VoithUpgrade || {}, {
    openDownloadPage,
    focusLoginScreen: focusLogin,
    openBulkCustody: () => openBulkCustodyModal([]),
    getUserProfiles: () => loadProfiles()
  });
})();

/* VOITH_IMAGE_IMPORTER_V1_START */
(() => {
  "use strict";

  const TESSERACT_CDN = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
  const norm = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const isVisible = (el) => {
    if (!el || !el.isConnected) return false;
    const cs = window.getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  const setControlValue = (el, val) => {
    if (!el) return false;
    const str = String(val == null ? "" : val).trim();
    if (!str) return false;

    if (el.tagName === "SELECT") {
      const target = norm(str);
      const opts = Array.from(el.options || []);
      const hit =
        opts.find((o) => norm(o.value) === target || norm(o.textContent) === target) ||
        opts.find((o) => norm(o.textContent).includes(target) || (target.length >= 4 && target.includes(norm(o.textContent))));
      if (hit) {
        el.value = hit.value;
      } else {
        return false;
      }
    } else {
      let finalVal = str;
      if (String(el.type || "").toLowerCase() === "date") {
        const m = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (m) finalVal = `${m[3]}-${m[2]}-${m[1]}`;
      }
      const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, "value");
      if (desc && desc.set) desc.set.call(el, finalVal);
      else el.value = finalVal;
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  };

  const getFieldHint = (el) => {
    const parts = [el.id, el.name, el.placeholder, el.getAttribute("aria-label")];
    if (el.id) {
      const lbl = document.querySelector(`label[for="${el.id}"]`);
      if (lbl) parts.push(lbl.textContent);
    }
    const closestLbl = el.closest("label");
    if (closestLbl) parts.push(closestLbl.textContent);
    if (el.parentElement) {
      const sib = el.parentElement.querySelector("label, span, p");
      if (sib && sib !== el && String(sib.textContent || "").length < 80) {
        parts.push(sib.textContent);
      }
    }
    return norm(parts.filter(Boolean).join(" "));
  };

  const getExistingCodesSet = () => {
    const set = new Set();
    const sources = [
      window.instruments,
      window.ITEMS,
      window.allInstruments,
      window.state && window.state.instruments
    ];
    sources.forEach((arr) => {
      if (!Array.isArray(arr)) return;
      arr.forEach((it) => {
        const c = String((it && (it.code || it.codigo || it.cod)) || "").trim().toUpperCase();
        if (c) set.add(c);
      });
    });
    document.querySelectorAll("table tbody tr").forEach((tr) => {
      const m = String(tr.textContent || "").match(/\b([A-Z]{2}\d{5,7}[A-Z0-9-]*)\b/);
      if (m) set.add(m[1].toUpperCase());
    });
    return set;
  };

  const mapSectorName = (raw) => {
    const s = norm(raw);
    if (!s) return "";
    if (s.includes("ferroviaria") && s.includes("redutor")) return "Ferrovi\u00e1ria Redutor";
    if (s.includes("ferrovi")) return "Ferrovi\u00e1ria";
    if (s.includes("assist") && s.includes("automot")) return "Assist\u00eancia T\u00e9cnica Automotive";
    if (s.includes("automot") || s.includes("engate")) return "Automotive/Engates";
    if (s.includes("assist") && s.includes("industr")) return "Assist\u00eancia T\u00e9cnica Industrial";
    if (s.includes("industr")) return "Industrial";
    if (s.includes("qualid")) return "Qualidade";
    if (s.includes("vorecon")) return "Vorecon";
    if (s.includes("metrolog")) return "Metrologia / Turbo";
    const paren = String(raw || "").match(/\(([^)]+)\)/);
    return paren ? paren[1].trim() : String(raw || "").trim();
  };

  const normalizeDateBR = (raw) => {
    const s = String(raw || "").trim();
    let m = s.match(/(\d{2})[\/.-](\d{2})[\/.-](\d{4})/);
    if (m) return `${m[1]}/${m[2]}/${m[3]}`;
    m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    return "";
  };

  const formatRange = (ini, fim) => {
    const a = String(ini || "").replace(/[^\d,.-]/g, "").trim();
    const b = String(fim || "").replace(/[^\d,.-]/g, "").trim();
    if (a && b) return `${a} ~ ${b}`;
    return a || b || "";
  };

  const parseVoithLines = (rawText) => {
    const lines = String(rawText || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const items = [];
    const seen = new Set();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Modo 1: Colado direto do Excel (separado por TAB)
      if (line.includes("\t")) {
        const cols = line.split("\t").map((c) => c.trim());
        const codeMatch = String(cols[0] || "").toUpperCase().replace(/\s+/g, "").match(/^([A-Z]{2}\d{5,7}[A-Z0-9-]*)$/);
        if (!codeMatch) continue;
        const code = codeMatch[1];
        if (seen.has(code)) continue;
        seen.add(code);

        const desc = cols[1] || "";
        const validade = normalizeDateBR(cols[2] || "");
        const cc = cols[3] || "";
        const setor = mapSectorName(cols[4] || "");
        const responsavel = cols[5] || "";
        const faixaIni = cols[6] || "";
        const faixaFim = cols[7] || "";
        items.push({
          code,
          desc,
          validade,
          cc,
          setor,
          responsavel,
          faixaIni,
          faixaFim,
          faixa: formatRange(faixaIni, faixaFim)
        });
        continue;
      }

      // Modo 2: Texto vindo do OCR da imagem da Listagem de Instrumentos
      const clean = line
        .replace(/[|\u00a6\[\]{}]/g, " ")
        .replace(/[_\u2014\u2013]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      const codeRe = /\b([A-Z]{2}\s*\d{5,7}[A-Z0-9-]*)\b/i;
      const cm = clean.match(codeRe);
      if (!cm) continue;

      const code = cm[1].replace(/\s+/g, "").toUpperCase();
      if (seen.has(code)) continue;
      seen.add(code);

      const afterCode = clean.slice(cm.index + cm[0].length).trim();
      const dateRe = /\b(\d{2}[\/.-]\d{2}[\/.-]\d{4})\b/;
      const dm = afterCode.match(dateRe);

      let desc = "";
      let validade = "";
      let rest = "";

      if (dm) {
        desc = afterCode.slice(0, dm.index).replace(/^[\s.,;:'"`-]+|[\s.,;:'"`-]+$/g, "").trim();
        validade = normalizeDateBR(dm[1]);
        rest = afterCode.slice(dm.index + dm[0].length).trim();
      } else {
        desc = afterCode;
      }

      let cc = "";
      let setor = "";
      let responsavel = "";
      let faixaIni = "";
      let faixaFim = "";

      if (rest) {
        // Centro de custo (ex: 4311 F, 4310 A)
        const ccm = rest.match(/^(\d{4}\s*[A-Z]?)\b/i);
        if (ccm) {
          cc = ccm[1].trim().toUpperCase();
          rest = rest.slice(ccm[0].length).trim();
        }

        // Faixa Inicial e Faixa Final no fim da linha (ex: 0,1 200 ou 0 150)
        const fm = rest.match(/['"`.,]*(-?\d+(?:[.,]\d+)?)\s+['"`.,]*(-?\d+(?:[.,]\d+)?)\s*$/);
        if (fm) {
          faixaIni = fm[1];
          faixaFim = fm[2];
          rest = rest.slice(0, fm.index).trim();
        }

        // Setor (ex: Voith Turbo (Ferroviaria) ou Voith Turbo (Automotive))
        const sm = rest.match(/(?:voith\s*turbo\s*)?\(([^)]+)\)/i);
        if (sm) {
          setor = mapSectorName(sm[1]);
          rest = (rest.slice(0, sm.index) + " " + rest.slice(sm.index + sm[0].length)).trim();
        } else {
          const kw = rest.match(/(ferrovi[a\u00e1]ria(?:\s+redutor)?|automotive(?:\/engates)?|industrial|qualidade|vorecon|metrologia)/i);
          if (kw) {
            setor = mapSectorName(kw[1]);
            rest = (rest.slice(0, kw.index) + " " + rest.slice(kw.index + kw[0].length)).trim();
          }
        }

        responsavel = rest
          .replace(/voith\s*turbo/ig, "")
          .replace(/^[\s.,;:'"`()-]+|[\s.,;:'"`()-]+$/g, "")
          .replace(/\s+/g, " ")
          .trim();
      }

      items.push({
        code,
        desc,
        validade,
        cc,
        setor,
        responsavel,
        faixaIni,
        faixaFim,
        faixa: formatRange(faixaIni, faixaFim)
      });
    }

    return items;
  };

  const loadTesseract = () => {
    if (window.Tesseract && typeof window.Tesseract.recognize === "function") {
      return Promise.resolve(window.Tesseract);
    }
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${TESSERACT_CDN}"]`);
      if (existing) {
        existing.addEventListener("load", () => resolve(window.Tesseract));
        existing.addEventListener("error", () => reject(new Error("Falha ao carregar OCR.")));
        return;
      }
      const sc = document.createElement("script");
      sc.src = TESSERACT_CDN;
      sc.async = true;
      sc.onload = () => resolve(window.Tesseract);
      sc.onerror = () => reject(new Error("N\u00e3o foi poss\u00edvel carregar o leitor de imagem (Tesseract)."));
      document.head.appendChild(sc);
    });
  };

  // Aumenta nitidez e remove triangulos verdes do Excel antes do OCR
  const preprocessImageForOcr = (blob) => {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        try {
          const scale = Math.min(3, Math.max(1.8, 2200 / Math.max(img.width, 1)));
          const w = Math.min(3400, Math.round(img.width * scale));
          const h = Math.round(img.height * (w / img.width));
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, w, h);
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(img, 0, 0, w, h);

          const imgData = ctx.getImageData(0, 0, w, h);
          const d = imgData.data;
          for (let i = 0; i < d.length; i += 4) {
            const r = d[i], g = d[i + 1], b = d[i + 2];
            // Apaga triangulo verde de aviso do Excel e linhas azuis claras de cabecalho
            if (g > r + 22 && g > b + 22) {
              d[i] = d[i + 1] = d[i + 2] = 255;
              continue;
            }
            const gray = 0.299 * r + 0.587 * g + 0.114 * b;
            const boosted = gray < 165 ? Math.max(0, gray * 0.72) : Math.min(255, gray * 1.18);
            d[i] = d[i + 1] = d[i + 2] = boosted;
          }
          ctx.putImageData(imgData, 0, 0);
          URL.revokeObjectURL(url);
          resolve(canvas);
        } catch (err) {
          URL.revokeObjectURL(url);
          reject(err);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Imagem inv\u00e1lida ou corrompida."));
      };
      img.src = url;
    });
  };

  /* -------------------- CRIACAO AUTOMATICA VIA MODAL NATIVO "+ NOVO ITEM" -------------------- */
  const findNewItemButton = () => {
    return Array.from(document.querySelectorAll("button")).find((b) => {
      if (!isVisible(b) || b.closest("#vu-img-modal")) return false;
      const t = norm(b.textContent);
      return t.includes("novo item") || t === "+ novo" || t.includes("novo instrumento");
    }) || null;
  };

  const findOpenNewItemModal = () => {
    const candidates = Array.from(document.querySelectorAll("[role=dialog], .fixed.inset-0, .modal")).filter((el) => {
      if (!isVisible(el) || el.id === "vu-img-modal" || el.id === "vu-img-progress" || el.id === "vu-dl-voith" || el.id === "vu-bulk-modal") return false;
      const inputs = el.querySelectorAll("input:not([type=hidden]):not([type=checkbox]), select, textarea");
      const hasSave = Array.from(el.querySelectorAll("button")).some((b) => {
        const t = norm(b.textContent);
        return isVisible(b) && /(salvar|cadastrar|criar|adicionar|gravar|confirmar)/.test(t) && !/(cancelar|fechar|novo item|imagem)/.test(t);
      });
      return inputs.length >= 3 && hasSave && !String(el.textContent || "").includes("Monitoramento de Frota");
    });
    return candidates.length ? candidates[candidates.length - 1] : null;
  };

  const closeNativeNewItemModal = (modal) => {
    if (!modal || !isVisible(modal)) return;
    const cBtn = Array.from(modal.querySelectorAll("button")).find((b) => {
      if (!isVisible(b)) return false;
      const raw = String(b.textContent || "").trim();
      const t = norm(b.textContent);
      return raw === "\u00d7" || raw === "x" || raw === "X" || t === "cancelar" || t === "fechar";
    });
    if (cBtn) cBtn.click();
  };

  const createInstrumentsQueue = async (rows) => {
    const impModal = document.getElementById("vu-img-modal");
    if (impModal) impModal.remove();

    let prog = document.getElementById("vu-img-progress");
    if (prog) prog.remove();
    prog = document.createElement("div");
    prog.id = "vu-img-progress";
    prog.style.cssText = "position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:10985;width:min(470px,92vw);background:#0b1f44;color:#ffffff;border:1px solid #38bdf8;border-radius:14px;padding:14px 16px;box-shadow:0 20px 50px rgba(0,0,0,.45);font-family:system-ui,-apple-system,sans-serif;";
    document.body.appendChild(prog);

    const ok = [];
    const fail = [];

    const drawProg = (idx, code, msg) => {
      const pct = Math.round((idx / rows.length) * 100);
      prog.innerHTML =
        `<div style="display:flex;justify-content:space-between;font-size:13px;font-weight:800;">` +
          `<span>Criando Instrumentos (${idx}/${rows.length})</span>` +
          `<span style="color:#7dd3fc;">${pct}%</span>` +
        `</div>` +
        `<div style="font-size:12px;color:#cbd5e1;margin:6px 0 8px;">${msg}${code ? " \u2014 <strong>" + code + "</strong>" : ""}</div>` +
        `<div style="height:7px;background:rgba(255,255,255,.15);border-radius:999px;overflow:hidden;"><div style="height:100%;width:${pct}%;background:#22c55e;transition:width .2s;"></div></div>`;
    };

    for (let i = 0; i < rows.length; i++) {
      const it = rows[i];
      drawProg(i, it.code, "Abrindo cadastro e preenchendo dados");

      let modal = findOpenNewItemModal();
      if (!modal) {
        const newBtn = findNewItemButton();
        if (!newBtn) {
          fail.push(`${it.code} (bot\u00e3o + Novo Item n\u00e3o encontrado)`);
          continue;
        }
        newBtn.click();
        for (let t = 0; t < 20; t++) {
          await sleep(100);
          modal = findOpenNewItemModal();
          if (modal) break;
        }
      }

      if (!modal) {
        fail.push(`${it.code} (janela de cadastro n\u00e3o abriu)`);
        continue;
      }

      const controls = Array.from(modal.querySelectorAll("input, select, textarea")).filter((el) => {
        if (!isVisible(el) || el.disabled || el.readOnly) return false;
        const tp = String(el.type || "").toLowerCase();
        return !["hidden", "checkbox", "radio", "file", "submit", "button"].includes(tp);
      });

      const used = new Set();
      const fillBy = (val, regex, excludeRegex, tagFilter) => {
        if (!val) return false;
        const target = controls.find((el) => {
          if (used.has(el)) return false;
          if (tagFilter && !tagFilter(el)) return false;
          const h = getFieldHint(el);
          if (excludeRegex && excludeRegex.test(h)) return false;
          return regex.test(h);
        });
        if (target && setControlValue(target, val)) {
          used.add(target);
          return true;
        }
        return false;
      };

      // 1. Codigo
      const filledCode = fillBy(it.code, /(codigo|code|patrimonio|tag|identif|ac4)/, /(setor|centro|custo)/);
      if (!filledCode && controls[0]) {
        setControlValue(controls[0], it.code);
        used.add(controls[0]);
      }

      // 2. Descricao / Instrumento
      fillBy(it.desc, /(descri|instrument|nome|equip|modelo|tipo)/, /(codigo|code|setor|respons|faixa|obs|centro)/);

      // 3. Faixa (separada ou campo unico)
      const filledIni = fillBy(it.faixaIni, /(faixa\s*inic|min|inicial)/, /(final|max)/);
      const filledFim = fillBy(it.faixaFim, /(faixa\s*fin|max|final)/, /(inic|min)/);
      if (!filledIni && !filledFim) {
        fillBy(it.faixa, /(faixa|capac|range|medicao|escala)/, /(setor|data|valid)/);
      }

      // 4. Data da Proxima Calibracao / Validade
      const filledDate =
        fillBy(it.validade, /(valid|proxim|venc|calibr|data)/, /(ultima|emiss|aquis|compra|cadast)/, (el) => el.type === "date") ||
        fillBy(it.validade, /(valid|proxim|venc|calibr|data)/, /(ultima|emiss|aquis|compra|cadast|period|meses)/);
      if (!filledDate && it.validade) {
        const anyDate = controls.find((el) => !used.has(el) && el.type === "date");
        if (anyDate && setControlValue(anyDate, it.validade)) used.add(anyDate);
      }

      // 5. Setor
      fillBy(it.setor, /(setor|sector|area|chapa|divis|depart)/, /(local|armario|respons)/);

      // 6. Responsavel
      fillBy(it.responsavel, /(respons|tecnic|colaborad|gestor|owner|holder)/, /(setor|local|armario)/);

      // 7. Centro de Custo ou Observacao
      if (it.cc) {
        const filledCc = fillBy(it.cc, /(centro|custo|cc)/, /(obs)/);
        if (!filledCc) {
          fillBy(`CC: ${it.cc}`, /(obs|nota|coment|detalh)/, null);
        }
      }

      await sleep(160);

      const saveBtn = Array.from(modal.querySelectorAll("button")).find((b) => {
        if (!isVisible(b) || b.disabled) return false;
        const t = norm(b.textContent);
        return /(salvar|cadastrar|criar|adicionar|gravar|confirmar)/.test(t) && !/(cancelar|fechar|novo item|imagem|limpar)/.test(t);
      });

      if (!saveBtn) {
        fail.push(`${it.code} (bot\u00e3o salvar n\u00e3o encontrado)`);
        closeNativeNewItemModal(modal);
        continue;
      }

      saveBtn.click();
      await sleep(950);

      // Se o modal ainda estiver aberto, fecha antes do proximo
      const stillOpen = findOpenNewItemModal();
      if (stillOpen) {
        closeNativeNewItemModal(stillOpen);
        await sleep(220);
      }

      ok.push(it.code);
      drawProg(i + 1, it.code, "Cadastrado com sucesso");
    }

    prog.innerHTML =
      `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">` +
        `<div style="font-size:13.5px;font-weight:800;color:${fail.length ? "#fde047" : "#86efac"};">Conclu\u00eddo: ${ok.length} de ${rows.length} instrumento(s) criado(s)</div>` +
        `<button type="button" id="vu-img-prog-close" style="padding:4px 10px;border-radius:6px;border:1px solid rgba(255,255,255,.35);background:transparent;color:#fff;font-weight:700;font-size:11.5px;cursor:pointer;">Fechar</button>` +
      `</div>` +
      (fail.length ? `<div style="margin-top:6px;font-size:11.5px;color:#fecaca;">N\u00e3o criados: ${fail.join(", ")}</div>` : `<div style="margin-top:6px;font-size:11.5px;color:#cbd5e1;">Verifique os novos itens no Invent\u00e1rio e aguarde a bolinha verde sincronizar com o Supabase.</div>`);

    prog.querySelector("#vu-img-prog-close").onclick = () => prog.remove();
    setTimeout(() => { if (prog && prog.isConnected && !fail.length) prog.remove(); }, 7000);
  };

  /* -------------------- MODAL DE IMPORTACAO DE IMAGEM / PLANILHA -------------------- */
  const openImageImportModal = () => {
    const old = document.getElementById("vu-img-modal");
    if (old) old.remove();

    let parsedRows = [];
    const existingCodes = getExistingCodesSet();

    const overlay = document.createElement("div");
    overlay.id = "vu-img-modal";
    overlay.style.cssText = "position:fixed;inset:0;z-index:10900;background:rgba(15,23,42,.66);display:flex;align-items:center;justify-content:center;padding:14px;font-family:system-ui,-apple-system,sans-serif;";
    overlay.innerHTML =
      `<div style="width:min(980px,96vw);max-height:92vh;background:#ffffff;color:#0f172a;border-radius:16px;overflow:hidden;box-shadow:0 28px 70px rgba(0,0,0,.45);display:flex;flex-direction:column;">` +
        `<div style="background:linear-gradient(90deg,#002466,#0055b8);color:#ffffff;padding:15px 20px;display:flex;justify-content:space-between;align-items:center;gap:12px;">` +
          `<div>` +
            `<div style="font-size:16px;font-weight:800;">Importar Instrumentos por Imagem ou Excel</div>` +
            `<div style="font-size:12px;color:#bfdbfe;">Envie um print/foto da Listagem de Instrumentos Voith, d\u00ea Ctrl+V na imagem ou cole linhas direto do Excel.</div>` +
          `</div>` +
          `<button type="button" id="vu-img-close" style="width:34px;height:34px;border-radius:8px;border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.15);color:#fff;font-size:19px;line-height:1;cursor:pointer;">&times;</button>` +
        `</div>` +
        `<div style="padding:16px 20px;overflow-y:auto;display:grid;gap:14px;">` +
          `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;">` +
            `<label id="vu-img-drop" style="border:2px dashed #60a5fa;border-radius:12px;background:#eff6ff;padding:16px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;text-align:center;cursor:pointer;">` +
              `<input id="vu-img-file" type="file" accept="image/*" style="display:none;">` +
              `<div style="font-weight:800;font-size:13.5px;color:#003399;">Clique para escolher imagem ou arraste aqui</div>` +
              `<div style="font-size:11.5px;color:#475569;">Tamb\u00e9m aceita <strong>Ctrl + V</strong> de um print da tela (PNG / JPG)</div>` +
            `</label>` +
            `<div style="border:1px solid #cbd5e1;border-radius:12px;background:#f8fafc;padding:12px;display:grid;gap:6px;">` +
              `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">` +
                `<span style="font-weight:800;font-size:12px;color:#334155;">Ou cole linhas do Excel / texto aqui:</span>` +
                `<button type="button" id="vu-img-parse-txt" style="padding:5px 10px;border-radius:7px;border:none;background:#004899;color:#fff;font-weight:700;font-size:11.5px;cursor:pointer;">Ler Texto</button>` +
              `</div>` +
              `<textarea id="vu-img-raw" rows="3" placeholder="Cole linhas da planilha (Ctrl+C no Excel -> Ctrl+V aqui)..." style="width:100%;padding:8px;border-radius:8px;border:1px solid #cbd5e1;font-size:12px;font-family:monospace;resize:vertical;"></textarea>` +
            `</div>` +
          `</div>` +
          `<div id="vu-img-status" style="font-size:12.5px;font-weight:700;color:#0369a1;min-height:18px;"></div>` +
          `<div id="vu-img-preview-wrap" style="display:none;gap:8px;">` +
            `<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">` +
              `<span id="vu-img-count" style="font-size:12.5px;font-weight:800;color:#002466;">Itens detectados (0)</span>` +
              `<span style="font-size:11.5px;color:#64748b;">Revise ou edite qualquer campo abaixo antes de cadastrar.</span>` +
            `</div>` +
            `<div style="overflow-x:auto;border:1px solid #cbd5e1;border-radius:10px;">` +
              `<table style="width:100%;border-collapse:collapse;font-size:12px;min-width:780px;">` +
                `<thead><tr style="background:#f1f5f9;color:#334155;text-align:left;">` +
                  `<th style="padding:8px;width:32px;"><input type="checkbox" id="vu-img-chk-all" checked></th>` +
                  `<th style="padding:8px;">C\u00f3digo</th>` +
                  `<th style="padding:8px;">Descri\u00e7\u00e3o</th>` +
                  `<th style="padding:8px;">Pr\u00f3x. Cal.</th>` +
                  `<th style="padding:8px;">Setor</th>` +
                  `<th style="padding:8px;">Respons\u00e1vel</th>` +
                  `<th style="padding:8px;">Faixa</th>` +
                  `<th style="padding:8px;width:85px;">CC</th>` +
                `</tr></thead>` +
                `<tbody id="vu-img-tbody"></tbody>` +
              `</table>` +
            `</div>` +
          `</div>` +
        `</div>` +
        `<div style="padding:14px 20px;border-top:1px solid #e2e8f0;background:#f8fafc;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">` +
          `<button type="button" id="vu-img-add-manual" style="padding:8px 12px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;color:#334155;font-weight:700;font-size:12px;cursor:pointer;">+ Adicionar linha manual</button>` +
          `<div style="display:flex;gap:10px;">` +
            `<button type="button" id="vu-img-cancel" style="padding:9px 16px;border-radius:9px;border:1px solid #cbd5e1;background:#fff;color:#334155;font-weight:700;font-size:12.5px;cursor:pointer;">Cancelar</button>` +
            `<button type="button" id="vu-img-create" disabled style="padding:9px 18px;border-radius:9px;border:none;background:#16a34a;color:#fff;font-weight:800;font-size:12.5px;cursor:pointer;opacity:.55;">Criar Instrumentos (0)</button>` +
          `</div>` +
        `</div>` +
      `</div>`;

    document.body.appendChild(overlay);

    const fileInp = overlay.querySelector("#vu-img-file");
    const dropZone = overlay.querySelector("#vu-img-drop");
    const rawTxt = overlay.querySelector("#vu-img-raw");
    const statusEl = overlay.querySelector("#vu-img-status");
    const prevWrap = overlay.querySelector("#vu-img-preview-wrap");
    const tbody = overlay.querySelector("#vu-img-tbody");
    const countEl = overlay.querySelector("#vu-img-count");
    const createBtn = overlay.querySelector("#vu-img-create");
    const chkAll = overlay.querySelector("#vu-img-chk-all");

    const updateCreateCount = () => {
      const n = tbody.querySelectorAll(".vu-row-chk:checked").length;
      createBtn.textContent = `Criar Instrumentos (${n})`;
      createBtn.disabled = n === 0;
      createBtn.style.opacity = n === 0 ? ".55" : "1";
    };

    const renderTable = () => {
      prevWrap.style.display = parsedRows.length ? "grid" : "none";
      countEl.textContent = `Itens detectados (${parsedRows.length})`;
      tbody.innerHTML = parsedRows.map((r, idx) => {
        const exists = existingCodes.has(String(r.code || "").toUpperCase());
        const inpCss = "width:100%;padding:5px 7px;border:1px solid #cbd5e1;border-radius:6px;font-size:12px;color:#0f172a;background:#fff;";
        return (
          `<tr data-idx="${idx}" style="border-top:1px solid #e2e8f0;background:${exists ? "#fffbeb" : "#ffffff"};">` +
            `<td style="padding:6px 8px;"><input type="checkbox" class="vu-row-chk" ${exists ? "" : "checked"}></td>` +
            `<td style="padding:6px;"><input class="vu-c-code" value="${r.code || ""}" style="${inpCss}font-weight:800;">${exists ? '<div style="font-size:10px;color:#b45309;font-weight:700;margin-top:2px;">J\u00e1 cadastrado</div>' : ""}</td>` +
            `<td style="padding:6px;"><input class="vu-c-desc" value="${r.desc || ""}" style="${inpCss}"></td>` +
            `<td style="padding:6px;width:108px;"><input class="vu-c-val" value="${r.validade || ""}" placeholder="DD/MM/AAAA" style="${inpCss}"></td>` +
            `<td style="padding:6px;"><input class="vu-c-setor" value="${r.setor || ""}" style="${inpCss}"></td>` +
            `<td style="padding:6px;"><input class="vu-c-resp" value="${r.responsavel || ""}" style="${inpCss}"></td>` +
            `<td style="padding:6px;width:105px;"><input class="vu-c-faixa" value="${r.faixa || ""}" placeholder="0 ~ 150" style="${inpCss}"></td>` +
            `<td style="padding:6px;width:85px;"><input class="vu-c-cc" value="${r.cc || ""}" style="${inpCss}"></td>` +
          `</tr>`
        );
      }).join("");

      tbody.querySelectorAll(".vu-row-chk").forEach((c) => { c.onchange = updateCreateCount; });
      updateCreateCount();
    };

    const runOcrOnBlob = async (blob) => {
      try {
        statusEl.style.color = "#0369a1";
        statusEl.textContent = "Preparando imagem e carregando motor de leitura (OCR)...";
        const [Tesseract, canvas] = await Promise.all([loadTesseract(), preprocessImageForOcr(blob)]);
        statusEl.textContent = "Lendo texto da imagem (0%)...";
        const res = await Tesseract.recognize(canvas, "por", {
          logger: (m) => {
            if (m && m.status === "recognizing text" && typeof m.progress === "number") {
              statusEl.textContent = `Lendo dados da imagem (${Math.round(m.progress * 100)}%)...`;
            }
          }
        });
        const text = (res && res.data && res.data.text) || "";
        rawTxt.value = text;
        parsedRows = parseVoithLines(text);
        if (parsedRows.length) {
          statusEl.style.color = "#15803d";
          statusEl.textContent = `${parsedRows.length} instrumento(s) lido(s) da imagem! Confira os campos e clique em Criar Instrumentos.`;
        } else {
          statusEl.style.color = "#b45309";
          statusEl.textContent = "Texto lido, mas nenhum c\u00f3digo no formato AC000000 foi encontrado. Voc\u00ea pode ajustar o texto acima e clicar em Ler Texto.";
        }
        renderTable();
      } catch (err) {
        statusEl.style.color = "#dc2626";
        statusEl.textContent = "Erro ao ler imagem: " + (err && err.message ? err.message : err);
      }
    };

    fileInp.onchange = () => {
      const f = fileInp.files && fileInp.files[0];
      if (f) runOcrOnBlob(f);
    };

    dropZone.ondragover = (ev) => { ev.preventDefault(); dropZone.style.background = "#dbeafe"; };
    dropZone.ondragleave = () => { dropZone.style.background = "#eff6ff"; };
    dropZone.ondrop = (ev) => {
      ev.preventDefault();
      dropZone.style.background = "#eff6ff";
      const f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
      if (f) runOcrOnBlob(f);
    };

    const onPaste = (ev) => {
      if (!overlay.isConnected) {
        document.removeEventListener("paste", onPaste);
        return;
      }
      const items = ev.clipboardData && ev.clipboardData.items;
      if (items) {
        for (let i = 0; i < items.length; i++) {
          if (items[i].type && items[i].type.startsWith("image/")) {
            ev.preventDefault();
            const blob = items[i].getAsFile();
            if (blob) runOcrOnBlob(blob);
            return;
          }
        }
      }
      if (document.activeElement === rawTxt) {
        setTimeout(() => {
          parsedRows = parseVoithLines(rawTxt.value);
          if (parsedRows.length) {
            statusEl.style.color = "#15803d";
            statusEl.textContent = `${parsedRows.length} instrumento(s) lido(s) da planilha colada!`;
            renderTable();
          }
        }, 50);
      }
    };
    document.addEventListener("paste", onPaste);

    overlay.querySelector("#vu-img-parse-txt").onclick = () => {
      parsedRows = parseVoithLines(rawTxt.value);
      statusEl.style.color = parsedRows.length ? "#15803d" : "#b45309";
      statusEl.textContent = parsedRows.length
        ? `${parsedRows.length} instrumento(s) detectado(s) no texto.`
        : "Nenhuma linha com c\u00f3digo (ex: AC424767) encontrada no texto.";
      renderTable();
    };

    overlay.querySelector("#vu-img-add-manual").onclick = () => {
      parsedRows.push({ code: "", desc: "", validade: "", cc: "", setor: "", responsavel: "", faixaIni: "", faixaFim: "", faixa: "" });
      renderTable();
    };

    chkAll.onchange = () => {
      tbody.querySelectorAll(".vu-row-chk").forEach((c) => { c.checked = chkAll.checked; });
      updateCreateCount();
    };

    const closeModal = () => {
      document.removeEventListener("paste", onPaste);
      overlay.remove();
    };
    overlay.querySelector("#vu-img-close").onclick = closeModal;
    overlay.querySelector("#vu-img-cancel").onclick = closeModal;

    createBtn.onclick = () => {
      const selected = [];
      tbody.querySelectorAll("tr").forEach((tr) => {
        const chk = tr.querySelector(".vu-row-chk");
        if (!chk || !chk.checked) return;
        const code = String(tr.querySelector(".vu-c-code").value || "").trim().toUpperCase();
        if (!code) return;
        const faixa = String(tr.querySelector(".vu-c-faixa").value || "").trim();
        const parts = faixa.split(/[~a\-]/).map((x) => x.trim()).filter(Boolean);
        selected.push({
          code,
          desc: String(tr.querySelector(".vu-c-desc").value || "").trim(),
          validade: String(tr.querySelector(".vu-c-val").value || "").trim(),
          setor: String(tr.querySelector(".vu-c-setor").value || "").trim(),
          responsavel: String(tr.querySelector(".vu-c-resp").value || "").trim(),
          faixa,
          faixaIni: parts[0] || "",
          faixaFim: parts[1] || "",
          cc: String(tr.querySelector(".vu-c-cc").value || "").trim()
        });
      });
      if (!selected.length) return;
      document.removeEventListener("paste", onPaste);
      createInstrumentsQueue(selected);
    };
  };

  /* -------------------- INJECAO DOS BOTOES -------------------- */
  const injectImageImportButtons = () => {
    // 1. Ao lado do botao "+ Novo Item" no topo
    const newBtn = findNewItemButton();
    if (newBtn && newBtn.parentElement && !newBtn.parentElement.querySelector("#vu-open-img-import")) {
      const b = document.createElement("button");
      b.id = "vu-open-img-import";
      b.type = "button";
      b.textContent = "Ler Imagem";
      b.title = "Importar instrumentos lendo print/imagem da Listagem Voith ou colando do Excel";
      b.style.cssText = "padding:7px 11px;border-radius:10px;border:1px solid #0284c7;background:#f0f9ff;color:#0369a1;font-weight:800;font-size:12px;cursor:pointer;white-space:nowrap;";
      b.onclick = openImageImportModal;
      newBtn.insertAdjacentElement("afterend", b);
    }

    // 2. Dentro do proprio modal "+ Novo Item" caso o usuario clique nele primeiro
    const openNewModal = findOpenNewItemModal();
    if (openNewModal && !openNewModal.querySelector("#vu-modal-img-btn")) {
      const header = openNewModal.querySelector("div, header");
      if (header) {
        const b2 = document.createElement("button");
        b2.id = "vu-modal-img-btn";
        b2.type = "button";
        b2.textContent = "Importar de Imagem / Excel";
        b2.style.cssText = "margin:8px 16px 0;padding:7px 12px;border-radius:8px;border:1px solid #0284c7;background:#eff6ff;color:#004899;font-weight:800;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;";
        b2.onclick = () => {
          closeNativeNewItemModal(openNewModal);
          setTimeout(openImageImportModal, 120);
        };
        header.insertAdjacentElement("afterend", b2);
      }
    }
  };

  let t = null;
  const schedule = (delay = 180) => {
    if (t) return;
    t = setTimeout(() => { t = null; injectImageImportButtons(); }, delay);
  };

  const init = () => {
    schedule(250);
    document.addEventListener("click", () => schedule(150), true);
    const obs = new MutationObserver((muts) => {
      for (let i = 0; i < muts.length; i++) {
        const tgt = muts[i].target;
        if (tgt && tgt.id && tgt.id.startsWith("vu-")) continue;
        schedule(200);
        break;
      }
    });
    obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "hidden"] });
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  window.VoithUpgrade = Object.assign({}, window.VoithUpgrade || {}, { openImageImportModal });
})();
/* VOITH_IMAGE_IMPORTER_V1_END */
