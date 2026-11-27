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



/* VOITH_SMART_RANGE_SEARCH_V1_START */
(() => {
  "use strict";

  const norm = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

  const isVisible = (el) => {
    if (!el || !el.isConnected) return false;
    const cs = window.getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  const setInputVal = (el, val) => {
    if (!el) return;
    const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    if (desc && desc.set) desc.set.call(el, String(val));
    else el.value = String(val);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const parseNum = (v) => {
    if (v === null || v === undefined || v === "") return null;
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    const cleaned = String(v).trim().replace(/\s+/g, "").replace(",", ".");
    if (!/^-?\d+(?:\.\d+)?$/.test(cleaned)) return null;
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : null;
  };

  const parseRangeFromText = (txt) => {
    const s = String(txt || "");
    if (!s) return { min: null, max: null };
    const noDates = s.replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, " ");
    const m = noDates.match(/(-?\d+(?:[.,]\d+)?)\s*(?:~|\u2013|\u2014|-|\ba\b|\bat[\u00e9e]\b)\s*(-?\d+(?:[.,]\d+)?)/i);
    if (m) {
      const a = parseNum(m[1]);
      const b = parseNum(m[2]);
      if (a !== null && b !== null) {
        return { min: Math.min(a, b), max: Math.max(a, b) };
      }
    }
    return { min: null, max: null };
  };

  /* -------------------- CAPTURA DE INSTRUMENTOS COM FAIXA MIN/MAX -------------------- */
  let fetchedPool = [];
  let cacheItems = [];
  let lastScanAt = 0;

  const normalizeRecord = (obj) => {
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
    const resp = String(obj.responsavel || obj.responsible || obj.tecnico || obj.owner || obj.holder || "").trim();
    const status = String(obj.status || obj.situacao || "").trim();
    const unit = String(obj.unidade || obj.unit || obj.un || obj.medida_un || "").trim();

    let min = null;
    let max = null;
    const minKeys = ["faixa_min", "faixaMin", "faixa_inicial", "faixaInicial", "min", "minimo", "range_min", "rangeMin", "cap_min", "medida_min", "faixaMinima"];
    const maxKeys = ["faixa_max", "faixaMax", "faixa_final", "faixaFinal", "max", "maximo", "range_max", "rangeMax", "cap_max", "medida_max", "faixaMaxima"];

    for (let i = 0; i < minKeys.length; i++) {
      const n = parseNum(obj[minKeys[i]]);
      if (n !== null) { min = n; break; }
    }
    for (let i = 0; i < maxKeys.length; i++) {
      const n = parseNum(obj[maxKeys[i]]);
      if (n !== null) { max = n; break; }
    }

    const rangeStr = String(
      obj.faixa || obj.range || obj.capacidade || obj.capacity || obj.escala || obj.medida || obj.faixa_medicao || ""
    ).trim();

    if (min === null || max === null) {
      const parsed = parseRangeFromText(rangeStr || name);
      if (min === null) min = parsed.min;
      if (max === null) max = parsed.max;
    }

    if (min !== null && max !== null && min > max) {
      const tmp = min;
      min = max;
      max = tmp;
    }

    const rangeLabel =
      min !== null && max !== null
        ? `${String(min).replace(".", ",")} ~ ${String(max).replace(".", ",")}${unit ? " " + unit : ""}`
        : rangeStr;

    return { code, name, sector, local, resp, status, unit, min, max, rangeLabel };
  };

  const mergeRecords = (arr, map) => {
    if (!Array.isArray(arr) || arr.length < 2) return;
    for (let i = 0; i < arr.length; i++) {
      const rec = normalizeRecord(arr[i]);
      if (!rec) continue;
      const key = rec.code.toUpperCase();
      const prev = map.get(key);
      if (!prev) {
        map.set(key, rec);
      } else {
        map.set(key, {
          code: prev.code || rec.code,
          name: prev.name || rec.name,
          sector: prev.sector || rec.sector,
          local: prev.local || rec.local,
          resp: prev.resp || rec.resp,
          status: prev.status || rec.status,
          unit: prev.unit || rec.unit,
          min: prev.min !== null ? prev.min : rec.min,
          max: prev.max !== null ? prev.max : rec.max,
          rangeLabel: prev.rangeLabel || rec.rangeLabel
        });
      }
    }
  };

  // Intercepta respostas JSON do Supabase de forma passiva para manter a frota completa com faixas
  if (!window.__vuSmartFetchWrapped && typeof window.fetch === "function") {
    window.__vuSmartFetchWrapped = true;
    const origFetch = window.fetch.bind(window);
    window.fetch = function (...args) {
      const p = origFetch(...args);
      try {
        const reqUrl = typeof args[0] === "string" ? args[0] : (args[0] && args[0].url) || "";
        if (reqUrl.includes("/rest/v1/") && !reqUrl.includes("audit_logs")) {
          p.then((res) => {
            if (!res || !res.ok) return;
            const ct = String(res.headers && res.headers.get("content-type") || "");
            if (!ct.includes("json")) return;
            res.clone().json().then((data) => {
              if (Array.isArray(data) && data.length >= 5 && typeof data[0] === "object") {
                const probe = normalizeRecord(data[0]);
                if (probe) {
                  fetchedPool = data;
                  lastScanAt = 0;
                }
              }
            }).catch(() => {});
          }).catch(() => {});
        }
      } catch (_) {}
      return p;
    };
  }

  const getAllInstrumentsWithRange = () => {
    const now = Date.now();
    if (cacheItems.length >= 10 && now - lastScanAt < 4000) return cacheItems;

    const map = new Map();
    if (fetchedPool.length) mergeRecords(fetchedPool, map);

    [
      window.instruments,
      window.ITEMS,
      window.allInstruments,
      window.DATA,
      window.db && window.db.instruments,
      window.state && window.state.instruments,
      window.state && window.state.items,
      window.appState && window.appState.instruments
    ].forEach((src) => mergeRecords(src, map));

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i) || "";
        if (/voith_detailed_user|voith_admin_audit/i.test(k)) continue;
        const raw = localStorage.getItem(k);
        if (!raw || raw.length < 40 || (raw[0] !== "[" && raw[0] !== "{")) continue;
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) mergeRecords(parsed, map);
          else if (parsed && typeof parsed === "object") {
            ["instruments", "items", "data", "list", "rows", "frota", "equipamentos"].forEach((sub) => {
              if (Array.isArray(parsed[sub])) mergeRecords(parsed[sub], map);
            });
          }
        } catch (_) {}
      }
    } catch (_) {}

    if (map.size < 10) {
      try {
        const keys = Object.keys(window);
        for (let i = 0; i < keys.length; i++) {
          const k = keys[i];
          if (/^(webkit|moz|on|CSS|HTML|SVG|DOM|Intl|WebGL|Audio|Media|Performance|Navigator)/i.test(k)) continue;
          let v;
          try { v = window[k]; } catch (_) { continue; }
          if (Array.isArray(v) && v.length >= 10 && v[0] && typeof v[0] === "object") {
            mergeRecords(v, map);
          }
        }
      } catch (_) {}
    }

    // Fallback: extrai tambem da tabela visivel do Inventario (incluindo "Faixa: 20 ~ 120")
    document.querySelectorAll("table tbody tr").forEach((tr) => {
      const rowTxt = String(tr.textContent || "");
      const cm = rowTxt.match(/\b([A-Z]{1,4}\d{4,}[A-Z0-9-]*)\b/);
      if (!cm) return;
      const code = cm[1];
      const key = code.toUpperCase();
      const fm = rowTxt.match(/Faixa:\s*([^\n]+)/i);
      const parsed = parseRangeFromText(fm ? fm[1] : "");
      const tds = Array.from(tr.querySelectorAll("td"));
      const existing = map.get(key);
      if (!existing) {
        const nameTxt = String((tds[2] && tds[2].textContent) || "").replace(/Faixa:.*$/i, "").replace(/\s+/g, " ").trim();
        const sectorTxt = String((tds[3] && tds[3].textContent) || "").replace(/\s+/g, " ").trim();
        const localTxt = String((tds[4] && tds[4].textContent) || "").replace(/\s+/g, " ").trim();
        map.set(key, {
          code,
          name: nameTxt,
          sector: sectorTxt,
          local: localTxt,
          resp: "",
          status: "",
          unit: "",
          min: parsed.min,
          max: parsed.max,
          rangeLabel: parsed.min !== null && parsed.max !== null ? `${parsed.min} ~ ${parsed.max}` : ""
        });
      } else if (existing.min === null && parsed.min !== null) {
        existing.min = parsed.min;
        existing.max = parsed.max;
        existing.rangeLabel = `${parsed.min} ~ ${parsed.max}`;
      }
    });

    if (map.size > 0) {
      cacheItems = Array.from(map.values());
      lastScanAt = now;
    }
    return cacheItems;
  };

  /* -------------------- PARSER DE CONSULTA POR MEDIDA / FAIXA -------------------- */
  const STOPWORDS = new Set([
    "de", "da", "do", "das", "dos", "que", "meca", "medir", "mede", "medida", "medidas",
    "com", "uma", "um", "uns", "umas", "para", "pra", "ate", "entre", "faixa", "escala",
    "capacidade", "especifica", "especifico", "em", "no", "na", "nos", "nas", "por",
    "a", "e", "o", "os", "as", "ou", "ao", "aos", "alcance", "intervalo", "valor", "valores", "tipo"
  ]);

  const LOCATION_PREFIXES = new Set([
    "armario", "bancada", "prateleira", "gaveta", "setor", "sala", "box", "cc", "nf", "rps", "lote", "dia", "dias", "mes", "meses"
  ]);

  const UNIT_REGEX = /\b(n\s*\.?\s*m|nm|kgf\s*\.?\s*m|kgf\s*\.?\s*cm|kgf|lbf\s*\.?\s*ft|lbf\s*\.?\s*pol|lbf|mm|cm|pol|polegadas?|in|bar|psi|mpa|kpa|graus?|v|kv|mv|ma|ohm|kg|mg|ml)\b/gi;

  const detectUnitCategory = (qNorm) => {
    if (/\b(n\s*\.?\s*m|nm|kgf\s*\.?\s*m|kgf\s*\.?\s*cm|lbf)\b/i.test(qNorm)) return "torque";
    if (/\b(mm|cm|pol|polegadas?|in)\b/i.test(qNorm)) return "dim";
    if (/\b(bar|psi|mpa|kpa)\b/i.test(qNorm)) return "press";
    if (/\b(graus?|celsius|temp)\b/i.test(qNorm)) return "temp";
    return "";
  };

  const parseSmartRangeQuery = (rawQuery) => {
    const raw = String(rawQuery || "").trim();
    if (raw.length < 3) return null;

    // Ignora codigos puros (ex: 9981, AC409981)
    if (/^[a-z]{0,4}\d{3,}$/i.test(raw.replace(/\s+/g, ""))) return null;

    let q = norm(raw);
    // Remove datas para nao confundir com medidas
    q = q.replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, " ");

    const unitCat = detectUnitCategory(q);
    const hasUnit = Boolean(unitCat) || UNIT_REGEX.test(q);
    UNIT_REGEX.lastIndex = 0;

    const hasMeasureCue = /\b(meca|medir|mede|medida|faixa|escala|capacidade|ate|entre)\b/.test(q);

    let mode = null;
    let reqMin = null;
    let reqMax = null;
    let reqVal = null;
    let cleaned = q;

    // 1. Tenta detectar intervalo (ex: "200 a 500", "200-500", "200 ~ 500", "entre 200 e 500")
    const rangeMatch = q.match(/(?:^|[\s(])(-?\d+(?:[.,]\d+)?)\s*(?:a|ate|~|-|\u2013|\u2014|\be\b)\s*(-?\d+(?:[.,]\d+)?)(?=$|[\s),.;a-z])/i);
    if (rangeMatch) {
      const a = parseNum(rangeMatch[1]);
      const b = parseNum(rangeMatch[2]);
      if (a !== null && b !== null) {
        mode = "range";
        reqMin = Math.min(a, b);
        reqMax = Math.max(a, b);
        cleaned = q.slice(0, rangeMatch.index) + " " + q.slice(rangeMatch.index + rangeMatch[0].length);
      }
    }

    // 2. Se nao for intervalo, tenta detectar medida unica (ex: "paquimetro que meca 300 mm" ou "paquimetro 300")
    if (!mode) {
      const singleMatch = q.match(/(?:^|[\s(])(-?\d+(?:[.,]\d+)?)(?=$|[\s),.;a-z])/);
      if (singleMatch) {
        const before = q.slice(0, singleMatch.index).trim().split(/\s+/).pop() || "";
        const val = parseNum(singleMatch[1]);
        if (val !== null && !LOCATION_PREFIXES.has(before)) {
          cleaned = q.slice(0, singleMatch.index) + " " + q.slice(singleMatch.index + singleMatch[0].length);
          mode = "single";
          reqVal = val;
        }
      }
    }

    if (!mode) return null;

    // Remove unidades, pontuacao e palavras de ligacao para extrair o tipo de instrumento
    cleaned = cleaned.replace(UNIT_REGEX, " ").replace(/[^a-z0-9\s]/g, " ");
    const keywords = cleaned
      .split(/\s+/)
      .map((w) => w.trim())
      .filter((w) => w.length >= 3 && !STOPWORDS.has(w) && !/^\d+$/.test(w));

    // Evita falso positivo em buscas soltas sem unidade/dica nem tipo de instrumento (ex: "4311 F")
    if (mode === "single" && !hasUnit && !hasMeasureCue && keywords.length === 0) {
      return null;
    }

    // Remove plural simples em portugues para ajudar match (ex: "torquimetros" -> "torquimetro")
    const normKeywords = keywords.map((w) => (w.length > 5 && w.endsWith("s") ? w.slice(0, -1) : w));

    return { mode, reqMin, reqMax, reqVal, keywords: normKeywords, unitCat, raw };
  };

  const searchBySmartRange = (parsed) => {
    const all = getAllInstrumentsWithRange();
    const results = [];

    for (let i = 0; i < all.length; i++) {
      const it = all[i];
      if (it.min === null || it.max === null) continue;

      const hay = norm(`${it.name} ${it.code} ${it.sector} ${it.local} ${it.resp} ${it.unit}`);

      // Todas as palavras-chave do instrumento devem bater (ex: "torquimetro", "paquimetro")
      let kwOk = true;
      for (let k = 0; k < parsed.keywords.length; k++) {
        if (!hay.includes(parsed.keywords[k])) {
          kwOk = false;
          break;
        }
      }
      if (!kwOk) continue;

      let matchType = "";
      let score = 0;

      if (parsed.mode === "range") {
        const coversAll = it.min <= parsed.reqMin + 1e-6 && it.max >= parsed.reqMax - 1e-6;
        const overlaps = it.min <= parsed.reqMax && it.max >= parsed.reqMin;
        if (!coversAll && !overlaps) continue;

        if (Math.abs(it.min - parsed.reqMin) < 1e-6 && Math.abs(it.max - parsed.reqMax) < 1e-6) {
          matchType = "Faixa exata";
          score = 1000;
        } else if (coversAll) {
          matchType = "Atende a faixa";
          const spanDiff = Math.max(0, (it.max - it.min) - (parsed.reqMax - parsed.reqMin));
          score = 800 - Math.min(250, spanDiff * 0.15);
        } else {
          // Sobreposicao parcial: exige que cubra pelo menos 40% da faixa pedida
          const ov = Math.min(it.max, parsed.reqMax) - Math.max(it.min, parsed.reqMin);
          const reqSpan = Math.max(1, parsed.reqMax - parsed.reqMin);
          if (ov / reqSpan < 0.4) continue;
          matchType = "Faixa parcial";
          score = 400 + Math.round((ov / reqSpan) * 100);
        }
      } else {
        // Modo medida unica (ex: paquimetro que meca 300 mm)
        if (!(it.min <= parsed.reqVal + 1e-6 && it.max >= parsed.reqVal - 1e-6)) continue;

        if (Math.abs(it.max - parsed.reqVal) < 1e-6) {
          matchType = "Limite exato";
          score = 1000 - Math.min(50, it.min * 0.1);
        } else {
          matchType = "Atende medida";
          const excess = Math.max(0, it.max - parsed.reqVal);
          score = 800 - Math.min(250, excess * 0.2);
        }
      }

      // Bonus leve por categoria de unidade (sem excluir registros que nao tem unidade salva)
      if (parsed.unitCat === "torque" && /torquim/.test(hay)) score += 60;
      if (parsed.unitCat === "dim" && /paquim|microm|relogio|trena|regua|subito|calibrador|altimetro/.test(hay)) score += 60;
      if (parsed.unitCat === "press" && /manom|press/.test(hay)) score += 60;

      results.push({ item: it, matchType, score });
    }

    results.sort((a, b) => b.score - a.score || a.item.code.localeCompare(b.item.code));
    return results;
  };

  /* -------------------- DROPDOWN INTELIGENTE PARA TODAS AS BARRAS -------------------- */
  let dropdownEl = null;
  let activeInput = null;

  const closeDropdown = () => {
    if (dropdownEl) dropdownEl.style.display = "none";
    activeInput = null;
  };

  const ensureDropdown = () => {
    if (dropdownEl && dropdownEl.isConnected) return dropdownEl;
    const d = document.createElement("div");
    d.id = "vu-smart-range-dd";
    d.style.cssText = "position:fixed;display:none;z-index:2147482000;background:#ffffff;border:1px solid #60a5fa;border-radius:12px;box-shadow:0 20px 50px rgba(15,23,42,.28);max-height:56vh;overflow-y:auto;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#0f172a;";
    document.body.appendChild(d);
    dropdownEl = d;
    return d;
  };

  const positionDropdown = (inp) => {
    if (!dropdownEl || !inp || !isVisible(inp)) return;
    const r = inp.getBoundingClientRect();
    const vw = window.innerWidth;
    const w = Math.min(vw - 16, Math.max(320, r.width));
    const left = Math.max(8, Math.min(r.left, vw - w - 8));
    dropdownEl.style.left = left + "px";
    dropdownEl.style.top = Math.min(window.innerHeight - 120, r.bottom + 6) + "px";
    dropdownEl.style.width = w + "px";
  };

  const findAdjacentActionBtn = (inp) => {
    let cur = inp.parentElement;
    for (let i = 0; i < 3 && cur; i++) {
      const btn = Array.from(cur.querySelectorAll("button")).find((b) => {
        if (!isVisible(b)) return false;
        const t = norm(b.textContent);
        return t === "buscar" || t === "localizar";
      });
      if (btn) return btn;
      cur = cur.parentElement;
    }
    return null;
  };

  const applySelectedInstrument = (inp, item) => {
    closeDropdown();
    if (!inp || !item) return;

    // Caso 1: Barra de busca da Cautela em Massa -> adiciona direto na lista
    if (inp.id === "vu-bulk-search") {
      setInputVal(inp, item.code);
      const addBtn = document.getElementById("vu-bulk-add-list");
      if (addBtn) addBtn.click();
      return;
    }

    // Caso 2: Qualquer outra barra de pesquisa do site -> preenche codigo exato e dispara busca/localizar
    setInputVal(inp, item.code);
    const btn = findAdjacentActionBtn(inp);
    if (btn) {
      setTimeout(() => btn.click(), 40);
    } else {
      inp.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
    }
  };

  const renderSmartDropdown = (inp) => {
    const parsed = parseSmartRangeQuery(inp.value);
    if (!parsed) {
      if (activeInput === inp) closeDropdown();
      return false;
    }

    const hits = searchBySmartRange(parsed);
    const dd = ensureDropdown();
    activeInput = inp;

    const rangeDesc =
      parsed.mode === "range"
        ? `${String(parsed.reqMin).replace(".", ",")} a ${String(parsed.reqMax).replace(".", ",")}`
        : `medida ${String(parsed.reqVal).replace(".", ",")}`;
    const kwDesc = parsed.keywords.length ? parsed.keywords.join(" ") + " \u2022 " : "";
    const isBulk = inp.id === "vu-bulk-search";

    const headerHtml =
      `<div style="position:sticky;top:0;z-index:2;background:#eff6ff;border-bottom:1px solid #bfdbfe;padding:9px 12px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">` +
        `<div>` +
          `<div style="font-size:12px;font-weight:800;color:#002466;">Busca por Medida: ${kwDesc}${rangeDesc}</div>` +
          `<div style="font-size:11px;color:#334155;">${hits.length} instrumento(s) compat\u00edvel(is) encontrado(s)</div>` +
        `</div>` +
        `<div style="display:flex;align-items:center;gap:6px;">` +
          (isBulk && hits.length > 0
            ? `<button type="button" id="vu-smart-add-all" style="padding:4px 9px;border-radius:6px;border:none;background:#16a34a;color:#fff;font-size:11px;font-weight:800;cursor:pointer;">+ Incluir todos (${Math.min(hits.length, 30)})</button>`
            : "") +
          `<button type="button" id="vu-smart-close" style="border:none;background:transparent;color:#475569;font-size:16px;font-weight:800;cursor:pointer;padding:0 4px;">&times;</button>` +
        `</div>` +
      `</div>`;

    if (!hits.length) {
      dd.innerHTML =
        headerHtml +
        `<div style="padding:14px 12px;font-size:12px;color:#64748b;">Nenhum instrumento com faixa cadastrada compat\u00edvel com <strong>${rangeDesc}</strong>.</div>`;
    } else {
      const shown = hits.slice(0, 35);
      const rowsHtml = shown.map((entry, idx) => {
        const it = entry.item;
        const badgeBg = entry.matchType === "Faixa parcial" ? "#fef3c7" : "#dcfce7";
        const badgeCol = entry.matchType === "Faixa parcial" ? "#92400e" : "#166534";
        const stNorm = norm(it.status);
        const stBadge = it.status
          ? `<span style="font-size:10px;font-weight:800;padding:2px 6px;border-radius:999px;background:${stNorm.includes("venc") ? "#fee2e2" : "#e0f2fe"};color:${stNorm.includes("venc") ? "#b91c1c" : "#0369a1"};">${it.status}</span>`
          : "";
        const meta = [it.local, it.sector, it.resp].filter(Boolean).join(" \u2022 ");

        return (
          `<button type="button" data-smart-idx="${idx}" class="vu-smart-row" style="display:flex;flex-direction:column;gap:3px;width:100%;padding:9px 12px;border:none;border-bottom:1px solid #f1f5f9;background:#ffffff;text-align:left;cursor:pointer;">` +
            `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;width:100%;flex-wrap:wrap;">` +
              `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">` +
                `<span style="font-weight:800;font-size:13px;color:#004899;">${it.code}</span>` +
                `<span style="font-size:12.5px;font-weight:700;color:#0f172a;">${it.name || "Instrumento"}</span>` +
              `</div>` +
              `<div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;">` +
                `<span style="font-size:11px;font-weight:800;padding:2px 7px;border-radius:999px;background:${badgeBg};color:${badgeCol};">Faixa: ${it.rangeLabel} &bull; ${entry.matchType}</span>` +
                stBadge +
              `</div>` +
            `</div>` +
            (meta ? `<div style="font-size:11.5px;color:#64748b;">${meta}</div>` : "") +
          `</button>`
        );
      }).join("");

      dd.innerHTML = headerHtml + rowsHtml;

      dd.querySelectorAll(".vu-smart-row").forEach((rowBtn) => {
        rowBtn.addEventListener("mouseenter", () => { rowBtn.style.background = "#f0f9ff"; });
        rowBtn.addEventListener("mouseleave", () => { rowBtn.style.background = "#ffffff"; });
        rowBtn.addEventListener("mousedown", (ev) => {
          ev.preventDefault();
          const idx = Number(rowBtn.getAttribute("data-smart-idx"));
          if (shown[idx]) applySelectedInstrument(inp, shown[idx].item);
        });
      });

      const addAllBtn = dd.querySelector("#vu-smart-add-all");
      if (addAllBtn) {
        addAllBtn.addEventListener("mousedown", (ev) => {
          ev.preventDefault();
          const codes = shown.slice(0, 30).map((x) => x.item.code).join(", ");
          closeDropdown();
          setInputVal(inp, codes);
          const addBtn = document.getElementById("vu-bulk-add-list");
          if (addBtn) addBtn.click();
        });
      }
    }

    const closeBtn = dd.querySelector("#vu-smart-close");
    if (closeBtn) closeBtn.addEventListener("mousedown", (ev) => { ev.preventDefault(); closeDropdown(); });

    positionDropdown(inp);
    dd.style.display = "block";
    return true;
  };

  /* -------------------- IDENTIFICA E CONECTA TODAS AS BARRAS DE PESQUISA -------------------- */
  const isSearchInput = (el) => {
    if (!el || el.tagName !== "INPUT") return false;
    const tp = String(el.type || "text").toLowerCase();
    if (!["text", "search", ""].includes(tp)) return false;
    if (el.closest("#vu-img-modal") || el.closest("#vu-adm-inner") || el.closest("#vu-dl-voith")) return false;
    if (el.id === "vu-bulk-search") return true;

    // Exclui campos internos de cadastro/edicao de instrumento
    const hostCard = el.closest("[role=dialog], .fixed.inset-0, .modal, form");
    if (hostCard) {
      const hTxt = norm(hostCard.textContent || "");
      const isItemForm = hTxt.includes("descricao do instrumento") || (hTxt.includes("faixa minima") && hTxt.includes("faixa maxima"));
      if (isItemForm) return false;
    }

    if (tp === "search") return true;
    const sig = norm([el.id, el.name, el.placeholder, el.getAttribute("aria-label")].filter(Boolean).join(" "));
    if (/(buscar|pesquis|filtrar|search|codigo|ac4|9981)/.test(sig)) return true;
    return Boolean(findAdjacentActionBtn(el));
  };

  const bindAllSearchBars = () => {
    document.querySelectorAll("input").forEach((inp) => {
      if (inp.dataset.vuSmartRangeBound === "1") return;
      if (!isSearchInput(inp)) return;
      inp.dataset.vuSmartRangeBound = "1";

      let debounce = null;
      const trigger = () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => renderSmartDropdown(inp), 120);
      };

      inp.addEventListener("input", trigger);
      inp.addEventListener("focus", () => {
        if (String(inp.value || "").trim().length >= 3) renderSmartDropdown(inp);
      });

      inp.addEventListener("keydown", (ev) => {
        if (ev.key === "Escape") {
          closeDropdown();
          return;
        }
        if (ev.key === "Enter" && parseSmartRangeQuery(inp.value)) {
          ev.preventDefault();
          ev.stopPropagation();
          renderSmartDropdown(inp);
        }
      }, true);

      const actionBtn = findAdjacentActionBtn(inp);
      if (actionBtn && actionBtn.dataset.vuSmartBtnBound !== "1") {
        actionBtn.dataset.vuSmartBtnBound = "1";
        actionBtn.addEventListener("click", (ev) => {
          if (parseSmartRangeQuery(inp.value)) {
            ev.preventDefault();
            ev.stopPropagation();
            renderSmartDropdown(inp);
          }
        }, true);
      }
    });
  };

  document.addEventListener("mousedown", (ev) => {
    if (!dropdownEl || dropdownEl.style.display === "none") return;
    if (dropdownEl.contains(ev.target) || (activeInput && activeInput.contains(ev.target))) return;
    closeDropdown();
  });

  window.addEventListener("scroll", () => {
    if (activeInput && dropdownEl && dropdownEl.style.display === "block") {
      positionDropdown(activeInput);
    }
  }, true);

  window.addEventListener("resize", () => {
    if (activeInput && dropdownEl && dropdownEl.style.display === "block") {
      positionDropdown(activeInput);
    }
  });

  let bindTimer = null;
  const scheduleBind = (delay = 180) => {
    if (bindTimer) return;
    bindTimer = setTimeout(() => {
      bindTimer = null;
      bindAllSearchBars();
    }, delay);
  };

  const init = () => {
    scheduleBind(250);
    document.addEventListener("click", () => scheduleBind(150), true);
    const obs = new MutationObserver((muts) => {
      for (let i = 0; i < muts.length; i++) {
        const tgt = muts[i].target;
        if (tgt && tgt.id && tgt.id.startsWith("vu-")) continue;
        scheduleBind(200);
        break;
      }
    });
    obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "hidden"] });
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
/* VOITH_SMART_RANGE_SEARCH_V1_END */

/* VOITH_FAMILY_SUBFILTERS_V1_START */
(() => {
  "use strict";

  const norm = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

  const isVisible = (el) => {
    if (!el || !el.isConnected) return false;
    const cs = window.getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  const setInputVal = (el, val) => {
    if (!el) return;
    const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    if (desc && desc.set) desc.set.call(el, String(val));
    else el.value = String(val);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const FAMILIES = [
    {
      id: "dimensional",
      label: "Dimensional",
      nativeMatch: /dimension/i,
      subitems: [
        { id: "paquimetro", label: "Paqu\u00edmetro", query: "Paqu\u00edmetro", re: /paquim/i },
        { id: "micrometro", label: "Micr\u00f4metro", query: "Micr\u00f4metro", re: /microm/i },
        { id: "relogio", label: "Rel\u00f3gio (Comp./Apalp.)", query: "Rel\u00f3gio", re: /relogio/i },
        { id: "subito", label: "S\u00fabito", query: "S\u00fabito", re: /subito/i },
        { id: "imicro", label: "Imicro", query: "Imicro", re: /imicro/i },
        { id: "cal_folga", label: "Calibrador de Folga", query: "Calibrador de Folga", re: /calibrador.*folga|lamina.*folga|folga/i },
        { id: "cal_chaveta", label: "Calibrador de Chaveta", query: "Chaveta", re: /chaveta/i },
        { id: "cal_rosca", label: "Calibrador de Rosca", query: "Rosca", re: /calibrador.*rosca|anel\s+rosc|tampao\s+rosc|pente.*rosca/i },
        { id: "cal_tampao", label: "Calibrador Tamp\u00e3o", query: "Tamp\u00e3o", re: /tampao/i },
        { id: "cal_anel", label: "Calibrador Anel", query: "Anel", re: /\banel\b/i },
        { id: "dinamometro", label: "Dinam\u00f4metro", query: "Dinam\u00f4metro", re: /dinamom/i },
        { id: "trena", label: "Trena", query: "Trena", re: /\btrena\b/i },
        { id: "regua", label: "R\u00e9gua", query: "R\u00e9gua", re: /\bregua\b/i },
        { id: "escala", label: "Escala", query: "Escala", re: /\bescala\b/i },
        { id: "esquadro", label: "Esquadro", query: "Esquadro", re: /esquadro/i },
        { id: "nivel", label: "N\u00edvel", query: "N\u00edvel", re: /\bnivel\b/i },
        { id: "goniometro", label: "Goni\u00f4metro", query: "Goni\u00f4metro", re: /goniom/i },
        { id: "transferidor", label: "Transferidor", query: "Transferidor", re: /transferidor/i },
        { id: "tracador", label: "Tra\u00e7ador de Altura", query: "Tra\u00e7ador", re: /tracador/i },
        { id: "altimetro", label: "Alt\u00edmetro", query: "Alt\u00edmetro", re: /altimetro/i },
        { id: "bloco", label: "Bloco Padr\u00e3o", query: "Bloco", re: /\bbloco\b/i },
        { id: "rugosimetro", label: "Rugos\u00edmetro", query: "Rugos\u00edmetro", re: /rugos/i },
        { id: "durometro", label: "Dur\u00f4metro", query: "Dur\u00f4metro", re: /durom/i },
        { id: "espessura", label: "Medidor de Espessura", query: "Espessura", re: /espessura/i },
        { id: "camada", label: "Medidor de Camada", query: "Camada", re: /camada/i },
        { id: "desempeno", label: "Desempeno", query: "Desempeno", re: /desempeno/i },
        { id: "compasso", label: "Compasso", query: "Compasso", re: /compasso/i },
        { id: "calibrador_outros", label: "Calibrador (Geral)", query: "Calibrador", re: /calibrador/i }
      ]
    },
    {
      id: "torque",
      label: "Torque & For\u00e7a",
      nativeMatch: /torque|forca/i,
      subitems: [
        { id: "torquimetro", label: "Torqu\u00edmetro", query: "Torqu\u00edmetro", re: /torquim/i },
        { id: "dinamometro_t", label: "Dinam\u00f4metro", query: "Dinam\u00f4metro", re: /dinamom/i },
        { id: "multiplicador", label: "Multiplicador de Torque", query: "Multiplicador", re: /multiplicador/i },
        { id: "celula", label: "C\u00e9lula de Carga", query: "C\u00e9lula", re: /celula\s+de\s+carga/i },
        { id: "balanca", label: "Balan\u00e7a", query: "Balan\u00e7a", re: /balanca/i }
      ]
    },
    {
      id: "press_temp",
      label: "Press\u00e3o & Temp.",
      nativeMatch: /press|temp/i,
      subitems: [
        { id: "manometro", label: "Man\u00f4metro", query: "Man\u00f4metro", re: /manom/i },
        { id: "vacuometro", label: "Vacu\u00f4metro", query: "Vacu\u00f4metro", re: /vacuom/i },
        { id: "termometro", label: "Term\u00f4metro", query: "Term\u00f4metro", re: /termom/i },
        { id: "pirometro", label: "Pir\u00f4metro", query: "Pir\u00f4metro", re: /pirom/i },
        { id: "termohigro", label: "Termohigr\u00f4metro", query: "Termohigr", re: /termohigr|higrom/i },
        { id: "transmissor", label: "Transmissor", query: "Transmissor", re: /transmissor/i }
      ]
    },
    {
      id: "eletrica",
      label: "El\u00e9trica & Ensaios",
      nativeMatch: /eletr|ensaio/i,
      subitems: [
        { id: "multimetro", label: "Mult\u00edmetro", query: "Mult\u00edmetro", re: /multim/i },
        { id: "alicate", label: "Alicate Amper\u00edmetro", query: "Alicate", re: /alicate|amperim/i },
        { id: "megohmetro", label: "Meg\u00f4hmetro", query: "Meg", re: /megoh|megom/i },
        { id: "tacometro", label: "Tac\u00f4metro", query: "Tac\u00f4metro", re: /tacom/i },
        { id: "brilho", label: "Medidor de Brilho", query: "Brilho", re: /brilho/i },
        { id: "estrob", label: "Estrobosc\u00f3pio", query: "Estrob", re: /estrob/i },
        { id: "vibracao", label: "Analisador / Vibra\u00e7\u00e3o", query: "Vibra", re: /vibra/i },
        { id: "fonte", label: "Fonte", query: "Fonte", re: /\bfonte\b/i }
      ]
    }
  ];

  /* -------------------- LEITURA DA FROTA DE INSTRUMENTOS -------------------- */
  let fetchedPool = [];
  let cachedList = [];
  let lastScan = 0;

  const extractRec = (obj) => {
    if (!obj || typeof obj !== "object") return null;
    const code = String(obj.code || obj.codigo || obj.cod || obj.tag || obj.patrimonio || "").trim();
    if (!code || code.length < 3 || code.length > 35 || /^\d{2}:\d{2}/.test(code)) return null;
    const name = String(obj.name || obj.instrumento || obj.descricao || obj.description || obj.desc || obj.nome || obj.equipamento || obj.tipo || "").trim();
    const family = String(obj.familia || obj.family || obj.categoria || obj.category || "").trim();
    return { code, name, family };
  };

  const mergeList = (arr, map) => {
    if (!Array.isArray(arr) || arr.length < 2) return;
    for (let i = 0; i < arr.length; i++) {
      const r = extractRec(arr[i]);
      if (r && !map.has(r.code.toUpperCase())) map.set(r.code.toUpperCase(), r);
    }
  };

  if (!window.__vuFamilyFetchWrapped && typeof window.fetch === "function") {
    window.__vuFamilyFetchWrapped = true;
    const prevFetch = window.fetch.bind(window);
    window.fetch = function (...args) {
      const p = prevFetch(...args);
      try {
        const url = typeof args[0] === "string" ? args[0] : (args[0] && args[0].url) || "";
        if (url.includes("/rest/v1/") && !url.includes("audit_logs")) {
          p.then((res) => {
            if (!res || !res.ok) return;
            const ct = String((res.headers && res.headers.get("content-type")) || "");
            if (!ct.includes("json")) return;
            res.clone().json().then((data) => {
              if (Array.isArray(data) && data.length >= 5 && typeof data[0] === "object" && extractRec(data[0])) {
                fetchedPool = data;
                lastScan = 0;
                scheduleRender(80);
              }
            }).catch(() => {});
          }).catch(() => {});
        }
      } catch (_) {}
      return p;
    };
  }

  const getInventoryItems = () => {
    const now = Date.now();
    if (cachedList.length >= 10 && now - lastScan < 4500) return cachedList;

    const map = new Map();
    if (fetchedPool.length) mergeList(fetchedPool, map);

    [
      window.instruments,
      window.ITEMS,
      window.allInstruments,
      window.DATA,
      window.db && window.db.instruments,
      window.state && window.state.instruments,
      window.state && window.state.items,
      window.appState && window.appState.instruments
    ].forEach((src) => mergeList(src, map));

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i) || "";
        if (/voith_detailed_user|voith_admin_audit/i.test(k)) continue;
        const raw = localStorage.getItem(k);
        if (!raw || raw.length < 40 || (raw[0] !== "[" && raw[0] !== "{")) continue;
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) mergeList(parsed, map);
          else if (parsed && typeof parsed === "object") {
            ["instruments", "items", "data", "list", "rows", "frota", "equipamentos"].forEach((sub) => {
              if (Array.isArray(parsed[sub])) mergeList(parsed[sub], map);
            });
          }
        } catch (_) {}
      }
    } catch (_) {}

    if (map.size < 10) {
      try {
        const keys = Object.keys(window);
        for (let i = 0; i < keys.length; i++) {
          const k = keys[i];
          if (/^(webkit|moz|on|CSS|HTML|SVG|DOM|Intl|WebGL|Audio|Media|Performance|Navigator)/i.test(k)) continue;
          let v;
          try { v = window[k]; } catch (_) { continue; }
          if (Array.isArray(v) && v.length >= 10 && v[0] && typeof v[0] === "object") {
            mergeList(v, map);
          }
        }
      } catch (_) {}
    }

    if (map.size > 0) {
      cachedList = Array.from(map.values());
      lastScan = now;
    }
    return cachedList;
  };

  /* -------------------- CALCULO DE FAMILIAS E SUBITENS REAIS -------------------- */
  const buildFamilyStats = () => {
    const items = getInventoryItems();
    const hasData = items.length > 0;
    const famMap = new Map();

    FAMILIES.forEach((f) => {
      famMap.set(f.id, {
        id: f.id,
        label: f.label,
        nativeMatch: f.nativeMatch,
        codes: new Set(),
        subCounts: new Map(),
        extraSubs: new Map()
      });
      f.subitems.forEach((s) => {
        famMap.get(f.id).subCounts.set(s.id, { ...s, count: 0 });
      });
    });

    items.forEach((it) => {
      const nName = norm(it.name);
      const nFam = norm(it.family);
      let matchedAnyFamily = false;

      FAMILIES.forEach((f) => {
        const bucket = famMap.get(f.id);
        let matchedSubInThisFamily = false;

        for (let i = 0; i < f.subitems.length; i++) {
          const sub = f.subitems[i];
          // "calibrador_outros" so entra se nao bateu em calibrador especifico antes
          if (sub.id === "calibrador_outros" && matchedSubInThisFamily) continue;
          if (sub.re.test(nName)) {
            bucket.subCounts.get(sub.id).count++;
            bucket.codes.add(it.code);
            matchedSubInThisFamily = true;
            matchedAnyFamily = true;
            break;
          }
        }

        if (!matchedSubInThisFamily && nFam && f.nativeMatch.test(nFam)) {
          bucket.codes.add(it.code);
          matchedAnyFamily = true;
          registerAutoSub(bucket, it.name);
        }
      });

      // Itens nao classificados em Torque/Pressao/Eletrica entram em Dimensional com auto-subfiltro
      if (!matchedAnyFamily && it.name) {
        const dimBucket = famMap.get("dimensional");
        dimBucket.codes.add(it.code);
        registerAutoSub(dimBucket, it.name);
      }
    });

    const out = [];
    FAMILIES.forEach((f) => {
      const bucket = famMap.get(f.id);
      let subs = Array.from(bucket.subCounts.values());
      if (hasData) {
        subs = subs.filter((s) => s.count > 0);
        bucket.extraSubs.forEach((ex) => {
          if (ex.count >= 2) subs.push(ex);
        });
        subs.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
      }
      out.push({
        id: f.id,
        label: f.label,
        nativeMatch: f.nativeMatch,
        total: bucket.codes.size,
        hasData,
        subitems: subs
      });
    });

    return out;
  };

  const registerAutoSub = (bucket, rawName) => {
    const clean = String(rawName || "").replace(/\(.*?\)/g, "").trim();
    if (!clean) return;
    const words = clean.split(/\s+/).filter(Boolean);
    if (!words.length) return;
    let label = words[0];
    if (/^(medidor|calibrador|chave|base|jogo|conjunto|pente)$/i.test(norm(words[0])) && words.length >= 3 && /^(de|do|da)$/i.test(norm(words[1]))) {
      label = `${words[0]} ${words[1]} ${words[2]}`;
    } else if (/^(medidor|calibrador|chave|pente)$/i.test(norm(words[0])) && words.length >= 2) {
      label = `${words[0]} ${words[1]}`;
    }
    const key = norm(label);
    if (key.length < 4) return;
    const prev = bucket.extraSubs.get(key);
    if (prev) prev.count++;
    else bucket.extraSubs.set(key, { id: "auto_" + key.replace(/[^a-z0-9]/g, "_"), label, query: label, count: 1 });
  };

  /* -------------------- INTEGRACAO COM O INVENTARIO NATIVO -------------------- */
  let activeFamilyId = null;
  let activeSubId = null;
  let activeSubQuery = "";

  const findInventoryStatusBar = () => {
    const allBtns = Array.from(document.querySelectorAll("button")).filter((b) => isVisible(b) && !b.closest("#vu-family-bar"));
    const emDiaBtn = allBtns.find((b) => norm(b.textContent) === "em dia");
    if (!emDiaBtn || !emDiaBtn.parentElement) return null;
    const bar = emDiaBtn.parentElement;
    const txt = norm(bar.textContent || "");
    if (txt.includes("todos") && txt.includes("vencidos") && txt.includes("em dia")) {
      return bar;
    }
    return null;
  };

  const findInventorySearchInput = () => {
    const filtrosBtn = Array.from(document.querySelectorAll("button")).find((b) => {
      if (!isVisible(b) || b.closest("#vu-family-bar")) return false;
      const t = norm(b.textContent);
      return t === "filtros" || t.startsWith("filtros ");
    });
    if (filtrosBtn) {
      let cur = filtrosBtn.parentElement;
      for (let i = 0; i < 4 && cur; i++) {
        const inp = Array.from(cur.querySelectorAll("input")).find((el) => {
          if (!isVisible(el)) return false;
          const tp = String(el.type || "text").toLowerCase();
          if (!["text", "search", ""].includes(tp)) return false;
          return !String((el.parentElement && el.parentElement.textContent) || "").includes("Ctrl K");
        });
        if (inp) return inp;
        cur = cur.parentElement;
      }
    }
    return null;
  };

  const findNativeFamilySelect = () => {
    const selects = Array.from(document.querySelectorAll("select")).filter((s) => {
      if (s.closest("#vu-family-bar") || s.closest("#vu-adm-inner") || s.closest("#vu-bulk-modal") || s.closest("#vu-img-modal")) return false;
      if (s.closest("[role=dialog], .fixed.inset-0")) return false;
      const optsTxt = norm(Array.from(s.options || []).map((o) => o.textContent).join(" "));
      let hits = 0;
      if (optsTxt.includes("dimensional")) hits++;
      if (optsTxt.includes("torque")) hits++;
      if (optsTxt.includes("eletric")) hits++;
      if (optsTxt.includes("press") || optsTxt.includes("temp")) hits++;
      return hits >= 2;
    });
    return selects[0] || null;
  };

  const setNativeFamilySelect = (famObj) => {
    const sel = findNativeFamilySelect();
    if (!sel) return false;
    const opts = Array.from(sel.options || []);
    if (!famObj) {
      const resetOpt = opts.find((o) => o.value === "" || /^(todas|todos|qualquer)/i.test(norm(o.textContent))) || opts[0];
      if (resetOpt && sel.value !== resetOpt.value) {
        sel.value = resetOpt.value;
        sel.dispatchEvent(new Event("change", { bubbles: true }));
      }
      return true;
    }
    const matchOpt = opts.find((o) => famObj.nativeMatch.test(norm(o.textContent + " " + o.value)));
    if (matchOpt) {
      if (sel.value !== matchOpt.value) {
        sel.value = matchOpt.value;
        sel.dispatchEvent(new Event("change", { bubbles: true }));
      }
      return true;
    }
    return false;
  };

  const applyFamilySelection = (famStats, famId) => {
    const invInput = findInventorySearchInput();

    if (!famId || activeFamilyId === famId && !activeSubId) {
      activeFamilyId = null;
      activeSubId = null;
      activeSubQuery = "";
      setNativeFamilySelect(null);
      if (invInput && activeSubQuery) setInputVal(invInput, "");
      renderBar();
      return;
    }

    activeFamilyId = famId;
    activeSubId = null;
    if (invInput && activeSubQuery && norm(invInput.value) === norm(activeSubQuery)) {
      setInputVal(invInput, "");
    }
    activeSubQuery = "";

    const famObj = famStats.find((f) => f.id === famId);
    if (famObj) setNativeFamilySelect(famObj);
    renderBar();
  };

  const applySubitemSelection = (famObj, subObj) => {
    const invInput = findInventorySearchInput();

    // Clicar no mesmo subfiltro desmarca e volta para a familia inteira
    if (activeSubId === subObj.id) {
      activeSubId = null;
      activeSubQuery = "";
      if (invInput) setInputVal(invInput, "");
      setNativeFamilySelect(famObj);
      renderBar();
      return;
    }

    activeFamilyId = famObj.id;
    activeSubId = subObj.id;
    activeSubQuery = subObj.query;

    // Reseta select nativo de familia para evitar ocultar itens classificados em outra familia (ex: Dinamometro)
    setNativeFamilySelect(null);
    if (invInput) {
      setInputVal(invInput, subObj.query);
    }
    renderBar();
  };

  const resetAllSubfilters = () => {
    const invInput = findInventorySearchInput();
    const hadQuery = activeSubQuery;
    activeFamilyId = null;
    activeSubId = null;
    activeSubQuery = "";
    setNativeFamilySelect(null);
    if (invInput && hadQuery && norm(invInput.value) === norm(hadQuery)) {
      setInputVal(invInput, "");
    }
    renderBar();
  };

  /* -------------------- RENDERIZACAO DA BARRA DE FAMILIAS + SUBFILTROS -------------------- */
  const renderBar = () => {
    const statusBar = findInventoryStatusBar();
    const existing = document.getElementById("vu-family-bar");
    if (!statusBar) {
      if (existing) existing.remove();
      return;
    }

    const stats = buildFamilyStats();
    const isDark =
      document.documentElement.classList.contains("dark") ||
      document.body.classList.contains("dark");

    let host = existing;
    if (!host || host.previousElementSibling !== statusBar) {
      if (host) host.remove();
      host = document.createElement("div");
      host.id = "vu-family-bar";
      statusBar.insertAdjacentElement("afterend", host);
    }

    const bgMain = isDark ? "rgba(15,23,42,.65)" : "#f8fafc";
    const bdMain = isDark ? "rgba(148,163,184,.25)" : "#e2e8f0";
    const txtMuted = isDark ? "#94a3b8" : "#64748b";

    host.style.cssText = `margin-top:10px;margin-bottom:6px;display:grid;gap:8px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;`;

    const famBtnsHtml =
      `<button type="button" data-vu-fam="" style="padding:5px 11px;border-radius:999px;font-size:12px;font-weight:700;cursor:pointer;border:1px solid ${!activeFamilyId ? "#004899" : bdMain};background:${!activeFamilyId ? "#004899" : (isDark ? "#1e293b" : "#ffffff")};color:${!activeFamilyId ? "#ffffff" : (isDark ? "#e2e8f0" : "#334155")};white-space:nowrap;">Todas Fam\u00edlias</button>` +
      stats.map((f) => {
        const isAct = activeFamilyId === f.id;
        const countTag = f.hasData ? ` <span style="opacity:.82;font-weight:600;">(${f.total})</span>` : "";
        const arrow = isAct ? " &#9662;" : " &#9656;";
        return (
          `<button type="button" data-vu-fam="${f.id}" style="padding:5px 11px;border-radius:999px;font-size:12px;font-weight:700;cursor:pointer;border:1px solid ${isAct ? "#004899" : bdMain};background:${isAct ? "#004899" : (isDark ? "#1e293b" : "#ffffff")};color:${isAct ? "#ffffff" : (isDark ? "#e2e8f0" : "#334155")};white-space:nowrap;transition:all .15s;">` +
            `${f.label}${countTag}<span style="font-size:10px;">${arrow}</span>` +
          `</button>`
        );
      }).join("");

    const activeFam = stats.find((f) => f.id === activeFamilyId);
    let subPanelHtml = "";

    if (activeFam) {
      const subBg = isDark ? "rgba(30,58,138,.28)" : "#eff6ff";
      const subBd = isDark ? "rgba(96,165,250,.35)" : "#bfdbfe";
      const subTitleCol = isDark ? "#93c5fd" : "#003399";

      const allSubBtn =
        `<button type="button" data-vu-sub="__ALL__" style="padding:5px 10px;border-radius:8px;font-size:11.5px;font-weight:700;cursor:pointer;border:1px solid ${!activeSubId ? "#0284c7" : subBd};background:${!activeSubId ? "#0284c7" : (isDark ? "#0f172a" : "#ffffff")};color:${!activeSubId ? "#ffffff" : (isDark ? "#e2e8f0" : "#1e3a8a")};white-space:nowrap;">` +
          `Todos de ${activeFam.label}${activeFam.hasData ? " (" + activeFam.total + ")" : ""}` +
        `</button>`;

      const subBtns = activeFam.subitems.map((s) => {
        const isSubAct = activeSubId === s.id;
        const cTxt = activeFam.hasData && s.count ? ` (${s.count})` : "";
        return (
          `<button type="button" data-vu-sub="${s.id}" style="padding:5px 10px;border-radius:8px;font-size:11.5px;font-weight:700;cursor:pointer;border:1px solid ${isSubAct ? "#0284c7" : subBd};background:${isSubAct ? "#0284c7" : (isDark ? "#0f172a" : "#ffffff")};color:${isSubAct ? "#ffffff" : (isDark ? "#e2e8f0" : "#1e293b")};white-space:nowrap;">` +
            `${s.label}${cTxt}` +
          `</button>`
        );
      }).join("");

      subPanelHtml =
        `<div style="padding:9px 11px;border-radius:12px;background:${subBg};border:1px solid ${subBd};display:grid;gap:7px;">` +
          `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">` +
            `<span style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:${subTitleCol};">Subfiltros &bull; ${activeFam.label}</span>` +
            (activeSubId ? `<button type="button" id="vu-sub-clear" style="border:none;background:transparent;color:${isDark ? "#fca5a5" : "#dc2626"};font-size:11.5px;font-weight:700;cursor:pointer;padding:0;">Limpar subfiltro</button>` : "") +
          `</div>` +
          `<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">${allSubBtn}${subBtns}</div>` +
        `</div>`;
    }

    host.innerHTML =
      `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:7px 10px;border-radius:12px;background:${bgMain};border:1px solid ${bdMain};">` +
        `<span style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:${txtMuted};margin-right:2px;">Fam\u00edlias:</span>` +
        famBtnsHtml +
      `</div>` +
      subPanelHtml;

    host.querySelectorAll("[data-vu-fam]").forEach((btn) => {
      btn.onclick = () => {
        const fid = btn.getAttribute("data-vu-fam") || null;
        if (!fid) resetAllSubfilters();
        else applyFamilySelection(stats, fid);
      };
    });

    if (activeFam) {
      host.querySelectorAll("[data-vu-sub]").forEach((btn) => {
        btn.onclick = () => {
          const sid = btn.getAttribute("data-vu-sub");
          if (sid === "__ALL__") {
            activeSubId = null;
            activeSubQuery = "";
            const invInput = findInventorySearchInput();
            if (invInput) setInputVal(invInput, "");
            setNativeFamilySelect(activeFam);
            renderBar();
            return;
          }
          const subObj = activeFam.subitems.find((x) => x.id === sid);
          if (subObj) applySubitemSelection(activeFam, subObj);
        };
      });

      const clrBtn = host.querySelector("#vu-sub-clear");
      if (clrBtn) {
        clrBtn.onclick = () => {
          activeSubId = null;
          activeSubQuery = "";
          const invInput = findInventorySearchInput();
          if (invInput) setInputVal(invInput, "");
          setNativeFamilySelect(activeFam);
          renderBar();
        };
      }
    }
  };

  /* -------------------- SINCRONIZACAO COM LIMPAR TUDO E SELECT NATIVO -------------------- */
  let renderTimer = null;
  const scheduleRender = (delay = 160) => {
    if (renderTimer) return;
    renderTimer = setTimeout(() => {
      renderTimer = null;
      renderBar();
    }, delay);
  };

  document.addEventListener("change", (ev) => {
    const tgt = ev.target;
    if (!tgt || tgt.tagName !== "SELECT") return;
    const natSel = findNativeFamilySelect();
    if (tgt !== natSel) return;
    const selectedOpt = tgt.options && tgt.options[tgt.selectedIndex];
    const txt = norm((selectedOpt ? selectedOpt.textContent : "") + " " + tgt.value);
    const matched = FAMILIES.find((f) => f.nativeMatch.test(txt));
    if (matched && activeFamilyId !== matched.id) {
      activeFamilyId = matched.id;
      activeSubId = null;
      activeSubQuery = "";
      scheduleRender(60);
    } else if (!matched && !activeSubId && activeFamilyId) {
      activeFamilyId = null;
      scheduleRender(60);
    }
  }, true);

  document.addEventListener("click", (ev) => {
    const btn = ev.target && ev.target.closest ? ev.target.closest("button, a") : null;
    if (btn && !btn.closest("#vu-family-bar")) {
      const t = norm(btn.textContent);
      if (t === "limpar tudo" || t === "limpar filtros") {
        activeFamilyId = null;
        activeSubId = null;
        activeSubQuery = "";
      }
    }
    scheduleRender(140);
  }, true);

  document.addEventListener("input", (ev) => {
    const tgt = ev.target;
    if (!tgt || tgt.tagName !== "INPUT") return;
    const invInput = findInventorySearchInput();
    if (tgt === invInput && activeSubQuery && norm(tgt.value) !== norm(activeSubQuery)) {
      activeSubId = null;
      activeSubQuery = "";
      scheduleRender(80);
    }
  }, true);

  const init = () => {
    scheduleRender(220);
    window.addEventListener("hashchange", () => scheduleRender(140));
    const obs = new MutationObserver((muts) => {
      for (let i = 0; i < muts.length; i++) {
        const tgt = muts[i].target;
        if (tgt && tgt.id && tgt.id.startsWith("vu-")) continue;
        scheduleRender(180);
        break;
      }
    });
    obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "hidden"] });
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
/* VOITH_FAMILY_SUBFILTERS_V1_END */

/* VOITH_AUTOCOMPLETE_AUTOCORRECT_V1_START */
(() => {
  "use strict";

  const norm = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const compact = (s) => norm(s).replace(/[^a-z0-9]/g, "");

  const isVisible = (el) => {
    if (!el || !el.isConnected) return false;
    const cs = window.getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  const setInputVal = (el, val) => {
    if (!el) return;
    const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    if (desc && desc.set) desc.set.call(el, String(val));
    else el.value = String(val);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const getFieldHint = (el) => {
    const parts = [el.id, el.name, el.placeholder, el.getAttribute("aria-label"), el.getAttribute("list"), el.dataset.vuOrigList];
    if (el.id) {
      const lbl = document.querySelector(`label[for="${el.id}"]`);
      if (lbl) parts.push(lbl.textContent);
    }
    const closestLbl = el.closest("label");
    if (closestLbl) parts.push(closestLbl.textContent);
    if (el.parentElement) {
      const sib = el.parentElement.querySelector("label, span, p");
      if (sib && sib !== el && String(sib.textContent || "").length < 80) parts.push(sib.textContent);
    }
    return norm(parts.filter(Boolean).join(" "));
  };

  const levenshtein = (a, b) => {
    const m = a.length, n = b.length;
    if (!m) return n;
    if (!n) return m;
    let prev = new Array(n + 1);
    let curr = new Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
      curr[0] = i;
      const ca = a.charCodeAt(i - 1);
      for (let j = 1; j <= n; j++) {
        const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
        curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      }
      const tmp = prev; prev = curr; curr = tmp;
    }
    return prev[n];
  };

  const similarity = (a, b) => {
    const maxLen = Math.max(a.length, b.length);
    if (!maxLen) return 1;
    return 1 - levenshtein(a, b) / maxLen;
  };

  /* -------------------- COLETA DE VALORES OFICIAIS DA FROTA -------------------- */
  let fetchedPool = [];
  let cachedBuckets = { local: [], setor: [], resp: [], desc: [] };
  let lastBucketScan = 0;

  if (!window.__vuAutoFetchWrapped && typeof window.fetch === "function") {
    window.__vuAutoFetchWrapped = true;
    const prevFetch = window.fetch.bind(window);
    window.fetch = function (...args) {
      const p = prevFetch(...args);
      try {
        const url = typeof args[0] === "string" ? args[0] : (args[0] && args[0].url) || "";
        if (url.includes("/rest/v1/") && !url.includes("audit_logs")) {
          p.then((res) => {
            if (!res || !res.ok) return;
            const ct = String((res.headers && res.headers.get("content-type")) || "");
            if (!ct.includes("json")) return;
            res.clone().json().then((data) => {
              if (Array.isArray(data) && data.length >= 5 && typeof data[0] === "object") {
                fetchedPool = data;
                lastBucketScan = 0;
              }
            }).catch(() => {});
          }).catch(() => {});
        }
      } catch (_) {}
      return p;
    };
  }

  const addUnique = (map, val) => {
    const v = String(val || "").replace(/\s+/g, " ").trim();
    if (!v || v.length < 2 || v === "-" || /^[-–—]+$/.test(v)) return;
    const key = norm(v);
    if (!map.has(key)) {
      map.set(key, { val: v, count: 1 });
    } else {
      const entry = map.get(key);
      entry.count++;
      // Prefere versao com acento ou inicial maiuscula
      if (/[A-Z\u00c0-\u00dd]/.test(v) && !/[A-Z\u00c0-\u00dd]/.test(entry.val)) entry.val = v;
    }
  };

  const scanRecordsIntoBuckets = (arr, maps) => {
    if (!Array.isArray(arr) || arr.length < 2) return;
    for (let i = 0; i < arr.length; i++) {
      const o = arr[i];
      if (!o || typeof o !== "object") continue;
      addUnique(maps.local, o.local || o.armario || o.location || o.localizacao || o.local_fisico);
      addUnique(maps.setor, o.sector || o.setor || o.area || o.setor_oficial);
      addUnique(maps.resp, o.responsavel || o.responsible || o.tecnico || o.owner || o.holder);
      addUnique(maps.desc, o.name || o.instrumento || o.descricao || o.description || o.desc || o.equipamento);
    }
  };

  const getFleetBuckets = () => {
    const now = Date.now();
    if (now - lastBucketScan < 5000 && cachedBuckets.local.length > 0) return cachedBuckets;

    const maps = { local: new Map(), setor: new Map(), resp: new Map(), desc: new Map() };

    if (fetchedPool.length) scanRecordsIntoBuckets(fetchedPool, maps);

    [
      window.instruments,
      window.ITEMS,
      window.allInstruments,
      window.DATA,
      window.db && window.db.instruments,
      window.state && window.state.instruments,
      window.state && window.state.items,
      window.appState && window.appState.instruments
    ].forEach((src) => scanRecordsIntoBuckets(src, maps));

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i) || "";
        if (/voith_admin_audit/i.test(k)) continue;
        const raw = localStorage.getItem(k);
        if (!raw || raw.length < 20 || (raw[0] !== "[" && raw[0] !== "{")) continue;
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            if (typeof parsed[0] === "string") {
              if (/local|armar|location/i.test(k)) parsed.forEach((s) => addUnique(maps.local, s));
              if (/setor|sector/i.test(k)) parsed.forEach((s) => addUnique(maps.setor, s));
            } else {
              scanRecordsIntoBuckets(parsed, maps);
            }
          } else if (parsed && typeof parsed === "object") {
            ["instruments", "items", "data", "list", "rows", "frota"].forEach((sub) => {
              if (Array.isArray(parsed[sub])) scanRecordsIntoBuckets(parsed[sub], maps);
            });
            ["locations", "locais", "officialLocations"].forEach((sub) => {
              if (Array.isArray(parsed[sub])) parsed[sub].forEach((s) => addUnique(maps.local, typeof s === "string" ? s : (s && (s.name || s.nome))));
            });
            ["sectors", "setores", "officialSectors"].forEach((sub) => {
              if (Array.isArray(parsed[sub])) parsed[sub].forEach((s) => addUnique(maps.setor, typeof s === "string" ? s : (s && (s.name || s.nome))));
            });
          }
        } catch (_) {}
      }
    } catch (_) {}

    // Complementa com todos os <datalist> da pagina
    document.querySelectorAll("datalist").forEach((dl) => {
      const id = norm(dl.id || "");
      const targetMap = /setor|sector/.test(id) ? maps.setor : /resp|colab|tecnic/.test(id) ? maps.resp : /desc|instrum/.test(id) ? maps.desc : maps.local;
      dl.querySelectorAll("option").forEach((opt) => addUnique(targetMap, opt.value || opt.textContent));
    });

    const toSortedArray = (m) => Array.from(m.values()).sort((a, b) => b.count - a.count || a.val.localeCompare(b.val)).map((x) => x.val);
    cachedBuckets = {
      local: toSortedArray(maps.local),
      setor: toSortedArray(maps.setor),
      resp: toSortedArray(maps.resp),
      desc: toSortedArray(maps.desc)
    };
    lastBucketScan = now;
    return cachedBuckets;
  };

  const getOptionsForInput = (inp, fieldType) => {
    const unique = new Map();
    const origListId = inp.dataset.vuOrigList || inp.getAttribute("list");
    if (origListId) {
      const dl = document.getElementById(origListId);
      if (dl) {
        dl.querySelectorAll("option").forEach((opt) => {
          const v = String(opt.value || opt.textContent || "").trim();
          if (v && !unique.has(norm(v))) unique.set(norm(v), { val: v, official: true });
        });
      }
    }

    const buckets = getFleetBuckets();
    const list = buckets[fieldType] || [];
    list.forEach((v) => {
      const k = norm(v);
      if (!unique.has(k)) unique.set(k, { val: v, official: false });
    });

    return Array.from(unique.values());
  };

  /* -------------------- MOTOR DE BUSCA E CORRECAO FUZZY -------------------- */
  const rankCandidates = (rawInput, options) => {
    const qNorm = norm(rawInput);
    const qComp = compact(rawInput);
    if (!qComp) return [];

    const qTokens = qNorm.split(/\s+/).filter(Boolean);
    const qNums = qNorm.match(/\d+/g) || [];
    const ranked = [];

    for (let i = 0; i < options.length; i++) {
      const opt = options[i];
      const cNorm = norm(opt.val);
      const cComp = compact(opt.val);
      const cTokens = cNorm.split(/\s+/).filter(Boolean);
      const cNums = cNorm.match(/\d+/g) || [];

      let score = 0;
      let kind = "";

      if (cNorm === qNorm || cComp === qComp) {
        score = 1000;
        kind = "exact";
      } else if (cNorm.startsWith(qNorm) || cComp.startsWith(qComp)) {
        score = 880 - Math.min(80, (cComp.length - qComp.length) * 1.5);
        kind = "prefix";
      } else if (qTokens.length > 1 && qTokens.every((qt) => cTokens.some((ct) => ct.startsWith(qt) || ct.includes(qt)))) {
        score = 820;
        kind = "tokens";
      } else if (cNorm.includes(qNorm) || (qComp.length >= 3 && cComp.includes(qComp))) {
        score = 720;
        kind = "contains";
      } else if (qComp.length >= 4) {
        // Similaridade contra o texto inteiro ou contra o prefixo do mesmo tamanho (corrige erros enquanto digita)
        const fullSim = similarity(qComp, cComp);
        const prefSlice = cComp.slice(0, Math.min(cComp.length, qComp.length + 1));
        const prefSim = cComp.length >= qComp.length ? similarity(qComp, prefSlice) : 0;

        // Tambem testa contra cada palavra do candidato (ex: "tridimencional" em "Sala Tridimensional")
        let wordSim = 0;
        for (let w = 0; w < cTokens.length; w++) {
          const wt = compact(cTokens[w]);
          if (wt.length >= 4) {
            const s = similarity(qComp, wt);
            if (s > wordSim) wordSim = s;
          }
        }

        const bestSim = Math.max(fullSim, wordSim, prefSim * 0.94);
        if (bestSim >= 0.66) {
          score = Math.round(bestSim * 700);
          kind = "fuzzy";
        }
      }

      if (score > 0) {
        if (opt.official) score += 15;
        const numbersMatch = qNums.length === 0 || qNums.every((n) => cNums.includes(n));
        ranked.push({
          val: opt.val,
          score,
          kind,
          sim: similarity(qComp, cComp),
          numbersMatch
        });
      }
    }

    ranked.sort((a, b) => b.score - a.score || a.val.localeCompare(b.val));
    return ranked;
  };

  /* -------------------- TOAST COM DESFAZER PARA AUTOCORRECAO -------------------- */
  let toastTimer = null;
  const showUndoToast = (inp, oldVal, newVal) => {
    let t = document.getElementById("vu-autocorrect-toast");
    if (t) t.remove();
    t = document.createElement("div");
    t.id = "vu-autocorrect-toast";
    t.style.cssText = "position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:2147483100;background:#0f172a;color:#f8fafc;border:1px solid #22c55e;border-radius:10px;padding:8px 12px;display:flex;align-items:center;gap:10px;font-size:12px;font-family:system-ui,-apple-system,sans-serif;box-shadow:0 12px 30px rgba(0,0,0,.35);max-width:92vw;";
    t.innerHTML =
      `<span>Corrigido: <strong style="color:#86efac;">${newVal}</strong></span>` +
      `<button type="button" id="vu-ac-undo" style="padding:3px 8px;border-radius:6px;border:1px solid rgba(255,255,255,.35);background:transparent;color:#fde047;font-weight:800;font-size:11.5px;cursor:pointer;">Desfazer</button>`;
    document.body.appendChild(t);

    t.querySelector("#vu-ac-undo").onclick = () => {
      inp.dataset.vuSkipCorrectVal = oldVal;
      setInputVal(inp, oldVal);
      t.remove();
    };

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { if (t && t.isConnected) t.remove(); }, 5000);
  };

  /* -------------------- DROPDOWN COMPACTO (RESPONSIVO AO TECLADO MOBILE) -------------------- */
  let ddEl = null;
  let activeInp = null;
  let currentMatches = [];
  let selectedIdx = 0;

  const closeDd = () => {
    if (ddEl) ddEl.style.display = "none";
    activeInp = null;
    currentMatches = [];
    selectedIdx = 0;
  };

  const ensureDd = () => {
    if (ddEl && ddEl.isConnected) return ddEl;
    const d = document.createElement("div");
    d.id = "vu-autocomplete-dd";
    d.style.cssText = "position:fixed;display:none;z-index:2147482600;background:#ffffff;border:1px solid #3b82f6;border-radius:10px;box-shadow:0 16px 38px rgba(15,23,42,.26);overflow-y:auto;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#0f172a;";
    document.body.appendChild(d);
    ddEl = d;
    return d;
  };

  const positionDd = (inp) => {
    if (!ddEl || !inp || !isVisible(inp)) return;
    const r = inp.getBoundingClientRect();
    const vv = window.visualViewport;
    const vpHeight = vv ? vv.height : window.innerHeight;
    const vpTop = vv ? vv.offsetTop : 0;
    const vw = vv ? vv.width : window.innerWidth;

    const w = Math.min(vw - 16, Math.max(220, r.width));
    const left = Math.max(8, Math.min(r.left, vw - w - 8));

    const spaceBelow = vpTop + vpHeight - r.bottom - 10;
    const spaceAbove = r.top - vpTop - 10;

    ddEl.style.left = left + "px";
    ddEl.style.width = w + "px";

    if (spaceBelow >= 135 || spaceBelow >= spaceAbove) {
      ddEl.style.top = (r.bottom + 4) + "px";
      ddEl.style.bottom = "auto";
      ddEl.style.maxHeight = Math.max(100, Math.min(230, spaceBelow)) + "px";
    } else {
      ddEl.style.top = "auto";
      ddEl.style.bottom = (window.innerHeight - r.top + 4) + "px";
      ddEl.style.maxHeight = Math.max(100, Math.min(230, spaceAbove)) + "px";
    }
  };

  const pickOption = (inp, val) => {
    delete inp.dataset.vuSkipCorrectVal;
    setInputVal(inp, val);
    closeDd();
  };

  const renderDd = (inp, fieldType) => {
    const raw = String(inp.value || "").trim();
    const options = getOptionsForInput(inp, fieldType);
    if (!options.length) {
      closeDd();
      return;
    }

    let matches;
    if (!raw) {
      matches = options.slice(0, 12).map((o) => ({ val: o.val, kind: "list", score: 500, sim: 1, numbersMatch: true }));
    } else {
      matches = rankCandidates(raw, options).slice(0, 10);
      // Se ja esta exatamente igual ao unico resultado, esconde
      if (matches.length === 1 && matches[0].val === raw) {
        closeDd();
        return;
      }
    }

    if (!matches.length) {
      closeDd();
      return;
    }

    const d = ensureDd();
    activeInp = inp;
    currentMatches = matches;
    selectedIdx = 0;

    d.innerHTML = matches.map((m, idx) => {
      const badge =
        m.kind === "fuzzy"
          ? `<span style="font-size:10px;font-weight:800;padding:2px 6px;border-radius:999px;background:#fef3c7;color:#92400e;">Corre\u00e7\u00e3o</span>`
          : m.kind === "prefix" && raw.length >= 2
          ? `<span style="font-size:10px;font-weight:800;padding:2px 6px;border-radius:999px;background:#dcfce7;color:#166534;">Completar</span>`
          : "";
      return (
        `<button type="button" data-ac-idx="${idx}" class="vu-ac-row" style="display:flex;justify-content:space-between;align-items:center;gap:8px;width:100%;padding:9px 12px;border:none;border-bottom:1px solid #f1f5f9;background:${idx === 0 ? "#eff6ff" : "#ffffff"};color:#0f172a;font-size:13px;font-weight:${idx === 0 ? "800" : "600"};text-align:left;cursor:pointer;">` +
          `<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${m.val}</span>` +
          badge +
        `</button>`
      );
    }).join("");

    d.querySelectorAll(".vu-ac-row").forEach((btn) => {
      btn.addEventListener("mousedown", (ev) => {
        ev.preventDefault();
        const i = Number(btn.getAttribute("data-ac-idx"));
        if (currentMatches[i]) pickOption(inp, currentMatches[i].val);
      });
      btn.addEventListener("touchstart", (ev) => {
        ev.preventDefault();
        const i = Number(btn.getAttribute("data-ac-idx"));
        if (currentMatches[i]) pickOption(inp, currentMatches[i].val);
      }, { passive: false });
    });

    positionDd(inp);
    d.style.display = "block";
  };

  const tryAutoCorrect = (inp, fieldType) => {
    // Na descricao do instrumento apenas sugerimos, sem sobrescrever nomes novos
    if (fieldType === "desc") return;

    const raw = String(inp.value || "").trim();
    if (!raw || raw.length < 3) return;
    if (inp.dataset.vuSkipCorrectVal === raw) return;

    const options = getOptionsForInput(inp, fieldType);
    if (!options.length) return;

    // Se ja existe exatamente igual, nao faz nada
    if (options.some((o) => o.val === raw)) return;

    const ranked = rankCandidates(raw, options);
    if (!ranked.length) return;

    const best = ranked[0];
    const second = ranked[1];
    if (!best.numbersMatch) return;

    let shouldFix = false;

    // 1. Apenas diferenca de acento/maiuscula/espaco (ex: "tridimensional" -> "Tridimensional")
    if (best.kind === "exact") {
      shouldFix = true;
    }
    // 2. Prefixo unico e claro (ex: "Tridim" ou "tri di" -> "Tridimensional")
    else if (best.kind === "prefix" && compact(raw).length >= 4) {
      const otherPrefix = ranked.slice(1).some((r) => r.kind === "prefix" && r.numbersMatch);
      if (!otherPrefix) shouldFix = true;
    }
    // 3. Erro de digitacao claro (ex: "Tridimencional" -> "Tridimensional")
    else if (best.kind === "fuzzy" && compact(raw).length >= 5) {
      const gap = second ? best.score - second.score : 999;
      if (best.sim >= 0.76 && gap >= 50) shouldFix = true;
    }

    if (shouldFix && best.val !== raw) {
      setInputVal(inp, best.val);
      showUndoToast(inp, raw, best.val);
    }
  };

  /* -------------------- IDENTIFICACAO DOS CAMPOS DE FORMULARIO -------------------- */
  const classifyField = (inp) => {
    if (!inp || inp.tagName !== "INPUT") return null;
    const tp = String(inp.type || "text").toLowerCase();
    if (!["text", "search", ""].includes(tp)) return null;
    if (inp.disabled || inp.readOnly) return null;
    if (inp.closest("#vu-img-modal") || inp.closest("#vu-adm-inner") || inp.closest("#vu-dl-voith")) return null;

    const hint = getFieldHint(inp);
    if (/(codigo|code|patrimonio|faixa|data|valid|calibr|centro|custo|senha|login|busca|pesquis|filtrar)/.test(hint)) {
      return null;
    }

    const hasList = Boolean(inp.getAttribute("list") || inp.dataset.vuOrigList);
    if (/(localiz|local|armario|devolv|posse)/.test(hint)) return "local";
    if (/(setor|sector|area|chapa)/.test(hint)) return "setor";
    if (/(respons|tecnic|colaborad|portador|holder)/.test(hint)) return "resp";
    if (/(descri|instrumento)/.test(hint) && inp.closest("[role=dialog], .fixed.inset-0, .modal, form")) return "desc";
    if (hasList) return "local";
    return null;
  };

  const bindSmartInputs = () => {
    document.querySelectorAll("input").forEach((inp) => {
      if (inp.dataset.vuAutoBound === "1") return;
      const fieldType = classifyField(inp);
      if (!fieldType) return;

      inp.dataset.vuAutoBound = "1";
      inp.dataset.vuFieldType = fieldType;

      // Salva o id do datalist nativo para lermos as opcoes oficiais sem conflitar com o menu nativo
      const listId = inp.getAttribute("list");
      if (listId) {
        inp.dataset.vuOrigList = listId;
        inp.removeAttribute("list");
      }
      inp.setAttribute("autocomplete", "off");

      inp.addEventListener("focus", () => {
        setTimeout(() => renderDd(inp, fieldType), 60);
      });

      inp.addEventListener("input", () => {
        delete inp.dataset.vuSkipCorrectVal;
        renderDd(inp, fieldType);
      });

      inp.addEventListener("keydown", (ev) => {
        if (!ddEl || ddEl.style.display === "none" || activeInp !== inp || !currentMatches.length) return;
        if (ev.key === "ArrowDown") {
          ev.preventDefault();
          selectedIdx = (selectedIdx + 1) % currentMatches.length;
          ddEl.querySelectorAll(".vu-ac-row").forEach((b, i) => {
            b.style.background = i === selectedIdx ? "#eff6ff" : "#ffffff";
            b.style.fontWeight = i === selectedIdx ? "800" : "600";
          });
        } else if (ev.key === "ArrowUp") {
          ev.preventDefault();
          selectedIdx = (selectedIdx - 1 + currentMatches.length) % currentMatches.length;
          ddEl.querySelectorAll(".vu-ac-row").forEach((b, i) => {
            b.style.background = i === selectedIdx ? "#eff6ff" : "#ffffff";
            b.style.fontWeight = i === selectedIdx ? "800" : "600";
          });
        } else if (ev.key === "Enter" || ev.key === "Tab") {
          if (currentMatches[selectedIdx]) {
            if (ev.key === "Enter") ev.preventDefault();
            pickOption(inp, currentMatches[selectedIdx].val);
          }
        } else if (ev.key === "Escape") {
          closeDd();
        }
      });

      inp.addEventListener("blur", () => {
        setTimeout(() => {
          if (activeInp === inp) closeDd();
          tryAutoCorrect(inp, fieldType);
        }, 160);
      });
    });
  };

  // Garante autocorrecao tambem se clicar direto em "Salvar" sem sair do campo antes
  document.addEventListener("mousedown", (ev) => {
    const btn = ev.target && ev.target.closest ? ev.target.closest("button") : null;
    if (btn && /(salvar|confirmar|registrar)/.test(norm(btn.textContent))) {
      const focused = document.activeElement;
      if (focused && focused.dataset && focused.dataset.vuAutoBound === "1") {
        tryAutoCorrect(focused, focused.dataset.vuFieldType);
        closeDd();
      }
    }
    if (ddEl && ddEl.style.display !== "none" && !ddEl.contains(ev.target) && (!activeInp || !activeInp.contains(ev.target))) {
      closeDd();
    }
  }, true);

  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", () => {
      if (activeInp && ddEl && ddEl.style.display === "block") positionDd(activeInp);
    });
  }
  window.addEventListener("scroll", () => {
    if (activeInp && ddEl && ddEl.style.display === "block") positionDd(activeInp);
  }, true);

  let timer = null;
  const schedule = (delay = 160) => {
    if (timer) return;
    timer = setTimeout(() => { timer = null; bindSmartInputs(); }, delay);
  };

  const init = () => {
    schedule(220);
    document.addEventListener("click", () => schedule(120), true);
    const obs = new MutationObserver((muts) => {
      for (let i = 0; i < muts.length; i++) {
        const tgt = muts[i].target;
        if (tgt && tgt.id && tgt.id.startsWith("vu-")) continue;
        schedule(180);
        break;
      }
    });
    obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "hidden"] });
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
/* VOITH_AUTOCOMPLETE_AUTOCORRECT_V1_END */

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

    if (el.tagName === "SELECT") {
      if (!str) return false;
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
      if (String(el.type || "").toLowerCase() === "date" && str) {
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
    if (el.previousElementSibling && String(el.previousElementSibling.textContent || "").length < 80) {
      parts.push(el.previousElementSibling.textContent);
    }
    if (el.parentElement) {
      const sib = el.parentElement.querySelector("label, span, p");
      if (sib && sib !== el && String(sib.textContent || "").length < 80) {
        parts.push(sib.textContent);
      }
      if (el.parentElement.previousElementSibling && String(el.parentElement.previousElementSibling.textContent || "").length < 80) {
        parts.push(el.parentElement.previousElementSibling.textContent);
      }
    }
    return norm(parts.filter(Boolean).join(" "));
  };

  const getExistingCodesSet = () => {
    const set = new Set();
    [window.instruments, window.ITEMS, window.allInstruments, window.state && window.state.instruments].forEach((arr) => {
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
    if (s.includes("ferroviaria") && s.includes("redutor")) return "Voith Turbo (Ferrovi\u00e1ria Redutor)";
    if (s.includes("ferrovi")) return "Voith Turbo (Ferrovi\u00e1ria)";
    if (s.includes("assist") && s.includes("automot")) return "Assist\u00eancia T\u00e9cnica Automotive";
    if (s.includes("automot") || s.includes("engate")) return "Voith Turbo (Automotive)";
    if (s.includes("assist") && s.includes("industr")) return "Assist\u00eancia T\u00e9cnica Industrial";
    if (s.includes("industr")) return "Voith Turbo (Industrial)";
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

  const parseTrailingDetails = (restRaw) => {
    let rest = String(restRaw || "").trim();
    let cc = "", setor = "", responsavel = "", faixaIni = "", faixaFim = "";
    if (!rest) return { cc, setor, responsavel, faixaIni, faixaFim };

    const ccm = rest.match(/^(\d{4}\s*[A-Z]?)\b/i);
    if (ccm) {
      cc = ccm[1].trim().toUpperCase();
      rest = rest.slice(ccm[0].length).trim();
    }

    const fm = rest.match(/['"`.,:|]*(-?\d+(?:[.,]\d+)?)\s+['"`.,:|]*(-?\d+(?:[.,]\d+)?)\s*$/);
    if (fm) {
      faixaIni = fm[1];
      faixaFim = fm[2];
      rest = rest.slice(0, fm.index).trim();
    }

    const sm = rest.match(/(?:vo[ji]?ith\s*turbo\s*)?\(([^)]+)\)/i);
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
      .replace(/vo[ji]?ith\s*turbo/ig, "")
      .replace(/([a-z\u00e0-\u00ff])([A-Z\u00c0-\u00dd])/g, "$1 $2")
      .replace(/^[\s.,;:'"`()|:-]+|[\s.,;:'"`()|:-]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();

    return { cc, setor, responsavel, faixaIni, faixaFim };
  };

  const parseVoithLines = (rawText) => {
    const lines = String(rawText || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const items = [];
    const seen = new Set();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.includes("\t")) {
        const cols = line.split("\t").map((c) => c.trim());
        while (cols.length && !cols[0]) cols.shift();
        if (cols.length < 2) continue;

        const c0Norm = norm(cols[0]);
        if (/^(instrumento|codigo|cod|patrimonio|tag|informacoes|listagem|total)$/.test(c0Norm)) continue;

        const code = cols[0].toUpperCase().replace(/\s+/g, "");
        if (!code || code.length < 3 || code.length > 30 || !/[A-Z0-9]/.test(code)) continue;
        if (seen.has(code)) continue;
        seen.add(code);

        const desc = cols[1] || "";
        let validade = normalizeDateBR(cols[2] || "");
        let cc = cols[3] || "";
        let setor = mapSectorName(cols[4] || "");
        let responsavel = cols[5] || "";
        let faixaIni = cols[6] || "";
        let faixaFim = cols[7] || "";

        if (!validade) {
          for (let c = 1; c < cols.length; c++) {
            const d = normalizeDateBR(cols[c]);
            if (d) { validade = d; break; }
          }
        }

        items.push({ code, desc, validade, cc, setor, responsavel, faixaIni, faixaFim, faixa: formatRange(faixaIni, faixaFim) });
        continue;
      }

      const clean = line.replace(/[|\u00a6\[\]{}]/g, " ").replace(/[_\u2014\u2013]+/g, " ").replace(/\s+/g, " ").trim();
      const cm = clean.match(/\b([A-Z]{2,4}\s*[-]?\s*\d{4,7}[A-Z0-9-]*)\b/i);
      if (!cm) continue;

      const code = cm[1].replace(/\s+/g, "").toUpperCase();
      if (seen.has(code)) continue;
      seen.add(code);

      const afterCode = clean.slice(cm.index + cm[0].length).trim();
      const dm = afterCode.match(/\b(\d{2}[\/.-]\d{2}[\/.-]\d{4})\b/);

      let desc = "", validade = "", rest = "";
      if (dm) {
        desc = afterCode.slice(0, dm.index).replace(/^[\s.,;:'"`:-]+|[\s.,;:'"`:-]+$/g, "").trim();
        validade = normalizeDateBR(dm[1]);
        rest = afterCode.slice(dm.index + dm[0].length).trim();
      } else {
        desc = afterCode;
      }

      const det = parseTrailingDetails(rest);
      items.push({
        code, desc, validade, cc: det.cc, setor: det.setor, responsavel: det.responsavel,
        faixaIni: det.faixaIni, faixaFim: det.faixaFim, faixa: formatRange(det.faixaIni, det.faixaFim)
      });
    }

    if (!items.length && lines.length) {
      const joined = lines.join(" ").replace(/[|\u00a6\[\]{}]/g, " ").replace(/\s*:\s*/g, " ").replace(/\s+/g, " ").trim();
      const dm = joined.match(/\b(\d{2}[\/.-]\d{2}[\/.-]\d{4})\b/);
      if (dm) {
        const desc = joined.slice(0, dm.index).replace(/^[\s.,;:'"`:-]+|[\s.,;:'"`:-]+$/g, "").trim();
        const validade = normalizeDateBR(dm[1]);
        const rest = joined.slice(dm.index + dm[0].length).trim();
        const det = parseTrailingDetails(rest);
        items.push({
          code: "", desc, validade, cc: det.cc, setor: det.setor, responsavel: det.responsavel,
          faixaIni: det.faixaIni, faixaFim: det.faixaFim, faixa: formatRange(det.faixaIni, det.faixaFim), missingCode: true
        });
      }
    }
    return items;
  };

  const loadTesseract = () => {
    if (window.Tesseract && typeof window.Tesseract.recognize === "function") return Promise.resolve(window.Tesseract);
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
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Imagem inv\u00e1lida.")); };
      img.src = url;
    });
  };

  /* -------------------- DETECCAO BLINDADA DO DRAWER DE INSTRUMENTO (v2.2) -------------------- */
  const isOnLostView = () => {
    const hash = norm(window.location.hash || "");
    if (hash.includes("lab") || hash.includes("lost") || hash.includes("baixa")) return true;
    return Array.from(document.querySelectorAll("h1, h2, p, div")).some((el) => {
      if (!isVisible(el) || el.closest("#vu-img-modal")) return false;
      const t = String(el.textContent || "");
      return t.length < 160 && /desativados\/perdidos|equipamentos perdidos|lab & baixas/i.test(t);
    });
  };

  const findNewItemButton = () => {
    return Array.from(document.querySelectorAll("button")).find((b) => {
      if (!isVisible(b) || b.closest("#vu-img-modal") || b.closest("#vu-bulk-modal")) return false;
      const t = norm(b.textContent);
      if (t.includes("novo item") || t === "+ novo" || t.includes("novo instrumento")) return true;
      if (t === "+" && b.getBoundingClientRect().top < 90) return true;
      return false;
    }) || null;
  };

  const findSaveBtnIn = (root, requireEnabled = false) => {
    if (!root) return null;
    const btns = Array.from(root.querySelectorAll("button")).filter((b) => isVisible(b) && (!requireEnabled || !b.disabled));
    const exact = btns.find((b) => /^(salvar|cadastrar|criar|adicionar|gravar|confirmar)$/.test(norm(b.textContent)));
    if (exact) return exact;
    return btns.find((b) => {
      const t = norm(b.textContent);
      return /(salvar|cadastrar|criar|gravar)/.test(t) && !/(proximo|cancelar|fechar|novo item|imagem|limpar|atalho)/.test(t);
    }) || null;
  };

  // Encontra o painel do formulario de instrumento aberto (usado pela fila automatica)
  const findInstrumentFormDrawer = () => {
    const anchors = Array.from(document.querySelectorAll("label, span, p, div, h1, h2, h3")).filter((el) => {
      if (!isVisible(el) || el.closest("#vu-img-modal") || el.closest("#vu-img-progress") || el.closest("#vu-bulk-modal")) return false;
      if (el.children.length > 2) return false;
      const t = norm(el.textContent);
      return (
        t.length >= 5 &&
        t.length <= 50 &&
        /^(descricao do instrumento|localizacao fisica|status metrologico|faixa minima|novo instrumento|novo item)/.test(t)
      );
    });

    for (let i = anchors.length - 1; i >= 0; i--) {
      let cur = anchors[i].parentElement;
      for (let depth = 0; depth < 10 && cur && cur !== document.body; depth++) {
        if (cur.id && cur.id.startsWith("vu-")) break;
        const controls = Array.from(cur.querySelectorAll("input:not([type=hidden]):not([type=checkbox]), select, textarea")).filter(isVisible);
        const saveBtn = findSaveBtnIn(cur, false);
        const hasMainApp = Boolean(cur.querySelector("aside nav")) || String(cur.textContent || "").includes("Monitoramento de Frota");
        if (controls.length >= 4 && saveBtn && !hasMainApp) {
          return cur;
        }
        cur = cur.parentElement;
      }
    }
    return null;
  };

  const isDrawerInEditMode = (card) => {
    if (!card || !isVisible(card)) return true;
    const visBtns = Array.from(card.querySelectorAll("button")).filter(isVisible);
    const hasEditBtn = visBtns.some((b) => {
      const t = norm(b.textContent);
      return t === "excluir" || t.includes("mover p/ perdidos") || t === "cautela" || t === "copiar";
    });
    if (hasEditBtn) return true;

    const visHeads = Array.from(card.querySelectorAll("h1, h2, h3, h4, span, div")).filter((el) => {
      if (!isVisible(el) || el.children.length > 2) return false;
      const len = String(el.textContent || "").trim().length;
      return len > 0 && len <= 75;
    });
    if (visHeads.some((el) => /^novo (instrumento|item)/.test(norm(el.textContent)))) return false;
    return visHeads.some((el) => /\b[a-z]{2}\d{4,}\b/.test(norm(el.textContent)));
  };

  const closeNativeDrawer = (card) => {
    if (!card || !isVisible(card)) return;
    const cBtn = Array.from(card.querySelectorAll("button")).find((b) => {
      if (!isVisible(b)) return false;
      const raw = String(b.textContent || "").trim();
      const t = norm(b.textContent);
      return raw === "\u00d7" || raw === "x" || raw === "X" || raw === "\u2715" || t === "cancelar" || t === "fechar";
    });
    if (cBtn) cBtn.click();
  };

  /* -------------------- MOVER PARA PERDIDOS APOS CRIAR -------------------- */
  const clickVisibleMoveToLostBtn = async () => {
    const moveBtn = Array.from(document.querySelectorAll("button")).find((b) => {
      if (!isVisible(b) || b.closest("#vu-img-modal") || b.closest("#vu-img-progress")) return false;
      const t = norm(b.textContent);
      return t.includes("mover p/ perdidos") || t.includes("mover para perdidos");
    });
    if (!moveBtn) return false;

    const origConfirm = window.confirm;
    const origPrompt = window.prompt;
    try {
      window.confirm = () => true;
      window.prompt = (_msg, defVal) => defVal || "Cadastrado diretamente como perdido";
      moveBtn.click();
      await sleep(450);

      const confirmBtn = Array.from(document.querySelectorAll("button")).find((b) => {
        if (!isVisible(b) || b === moveBtn || b.closest("#vu-img-progress")) return false;
        const t = norm(b.textContent);
        return /^(confirmar|mover|sim|baixar|confirmar baixa)$/.test(t) || t.includes("confirmar perda");
      });
      if (confirmBtn) {
        const host = confirmBtn.closest("[role=dialog], .fixed.inset-0, .modal") || confirmBtn.parentElement;
        if (host) {
          const reasonInp = Array.from(host.querySelectorAll("input, textarea")).find((el) => isVisible(el) && !el.value);
          if (reasonInp) setControlValue(reasonInp, "Cadastrado diretamente como perdido");
        }
        confirmBtn.click();
        await sleep(550);
      }
      return true;
    } finally {
      window.confirm = origConfirm;
      window.prompt = origPrompt;
    }
  };

  const moveCreatedItemToLost = async (code) => {
    if (await clickVisibleMoveToLostBtn()) return true;

    const invNav = Array.from(document.querySelectorAll("aside button, aside a, nav button, nav a, button")).find((b) => {
      if (!isVisible(b) || b.closest("#vu-img-progress")) return false;
      return norm(b.textContent).startsWith("inventario");
    });
    if (invNav) {
      invNav.click();
      await sleep(420);
    }

    const searchInp = Array.from(document.querySelectorAll("input")).find((el) => {
      if (!isVisible(el) || el.closest("#vu-img-progress")) return false;
      const tp = String(el.type || "text").toLowerCase();
      if (!["text", "search", ""].includes(tp)) return false;
      const sig = norm([el.placeholder, el.id, el.name].filter(Boolean).join(" "));
      return /buscar|pesquis|codigo|filtrar|ac4|9981/.test(sig) && !String((el.parentElement && el.parentElement.textContent) || "").includes("Ctrl K");
    });

    if (searchInp) {
      setControlValue(searchInp, code);
      await sleep(500);
    }

    const codeTarget = Array.from(document.querySelectorAll("table tbody tr button, table tbody tr a, table tbody tr td, table tbody tr")).find((el) => {
      if (!isVisible(el)) return false;
      const t = String(el.textContent || "").trim().toUpperCase();
      return t === code || (el.tagName === "TD" && t.includes(code));
    });

    if (codeTarget) {
      codeTarget.click();
      for (let w = 0; w < 18; w++) {
        await sleep(140);
        if (await clickVisibleMoveToLostBtn()) {
          if (searchInp) setControlValue(searchInp, "");
          return true;
        }
      }
    }

    if (searchInp) setControlValue(searchInp, "");
    return false;
  };

  /* -------------------- FILA DE CRIACAO AUTOMATICA -------------------- */
  const createInstrumentsQueue = async (rows, options = {}) => {
    const asLost = Boolean(options.asLost);
    const impModal = document.getElementById("vu-img-modal");
    if (impModal) impModal.remove();

    let prog = document.getElementById("vu-img-progress");
    if (prog) prog.remove();
    prog = document.createElement("div");
    prog.id = "vu-img-progress";
    prog.style.cssText = "position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:2147483050;width:min(470px,92vw);background:#0b1f44;color:#ffffff;border:1px solid #38bdf8;border-radius:14px;padding:14px 16px;box-shadow:0 20px 50px rgba(0,0,0,.45);font-family:system-ui,-apple-system,sans-serif;";
    document.body.appendChild(prog);

    const ok = [];
    const fail = [];

    const drawProg = (idx, code, msg) => {
      const pct = Math.round((idx / rows.length) * 100);
      prog.innerHTML =
        `<div style="display:flex;justify-content:space-between;font-size:13px;font-weight:800;">` +
          `<span>${asLost ? "Cadastrando Perdidos" : "Criando Instrumentos"} (${idx}/${rows.length})</span>` +
          `<span style="color:#7dd3fc;">${pct}%</span>` +
        `</div>` +
        `<div style="font-size:12px;color:#cbd5e1;margin:6px 0 8px;">${msg}${code ? " \u2014 <strong>" + code + "</strong>" : ""}</div>` +
        `<div style="height:7px;background:rgba(255,255,255,.15);border-radius:999px;overflow:hidden;"><div style="height:100%;width:${pct}%;background:#22c55e;transition:width .2s;"></div></div>`;
    };

    for (let i = 0; i < rows.length; i++) {
      const it = rows[i];
      drawProg(i, it.code, "Abrindo cadastro e preenchendo dados");

      // Se houver um drawer de EDICAO aberto, fecha antes de abrir um NOVO
      let card = findInstrumentFormDrawer();
      if (card && isDrawerInEditMode(card)) {
        closeNativeDrawer(card);
        await sleep(250);
        card = null;
      }

      if (!card) {
        const newBtn = findNewItemButton();
        if (!newBtn) {
          fail.push(`${it.code} (bot\u00e3o + Novo Item n\u00e3o encontrado)`);
          continue;
        }
        newBtn.click();
        for (let t = 0; t < 30; t++) {
          await sleep(100);
          card = findInstrumentFormDrawer();
          if (card) break;
        }
      }

      if (!card) {
        fail.push(`${it.code} (janela de cadastro n\u00e3o abriu)`);
        continue;
      }

      const controls = Array.from(card.querySelectorAll("input, select, textarea")).filter((el) => {
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

      const filledCode = fillBy(it.code, /(codigo|code|patrimonio|tag|identif|ac4)/, /(setor|centro|custo)/);
      if (!filledCode && controls[0]) {
        setControlValue(controls[0], it.code);
        used.add(controls[0]);
      }

      if (it.cc) {
        const filledCc = fillBy(it.cc, /(centro|custo|cc)/, /(obs)/);
        if (!filledCc) fillBy(`CC: ${it.cc}`, /(obs|nota|coment|detalh)/, null);
      }

      fillBy(it.desc, /(descri|instrument|nome|equip|modelo|tipo)/, /(codigo|code|setor|respons|faixa|obs|centro)/);

      const filledIni = fillBy(it.faixaIni, /(faixa\s*min|minima|min|inicial)/, /(final|max)/);
      const filledFim = fillBy(it.faixaFim, /(faixa\s*max|maxima|max|final)/, /(inic|min)/);
      if (!filledIni && !filledFim) {
        fillBy(it.faixa, /(faixa|capac|range|medicao|escala)/, /(setor|data|valid)/);
      }

      fillBy(it.setor, /(setor|sector|area|chapa|divis|depart)/, /(local|armario|respons)/);
      fillBy(it.responsavel, /(respons|tecnic|colaborad|gestor|owner|holder)/, /(setor|local|armario)/);

      const filledDate =
        fillBy(it.validade, /(valid|proxim|prox|venc|calibr|data)/, /(ultima|emiss|aquis|compra|cadast)/, (el) => el.type === "date") ||
        fillBy(it.validade, /(valid|proxim|prox|venc|calibr|data)/, /(ultima|emiss|aquis|compra|cadast|period|meses)/);
      if (!filledDate && it.validade) {
        const anyDate = controls.find((el) => !used.has(el) && el.type === "date");
        if (anyDate && setControlValue(anyDate, it.validade)) used.add(anyDate);
      }

      let markedLostViaSelect = false;
      if (asLost) {
        const statusSel = controls.find((el) => el.tagName === "SELECT" && /(status|situac|metrolog)/.test(getFieldHint(el)));
        if (statusSel) {
          const lostOpt = Array.from(statusSel.options || []).find((o) => /(perdido|baixad|desativad|extraviad|inativ)/.test(norm(o.textContent + " " + o.value)));
          if (lostOpt) {
            statusSel.value = lostOpt.value;
            statusSel.dispatchEvent(new Event("change", { bubbles: true }));
            markedLostViaSelect = true;
          }
        }
      }

      await sleep(220);

      const saveBtn = findSaveBtnIn(card, true) || findSaveBtnIn(card, false);
      if (!saveBtn) {
        fail.push(`${it.code} (bot\u00e3o salvar n\u00e3o encontrado)`);
        closeNativeDrawer(card);
        continue;
      }

      saveBtn.click();
      await sleep(1050);

      if (asLost && !markedLostViaSelect) {
        drawProg(i, it.code, "Movendo rec\u00e9m-criado para Perdidos");
        await moveCreatedItemToLost(it.code);
      }

      const stillOpen = findInstrumentFormDrawer();
      if (stillOpen) {
        closeNativeDrawer(stillOpen);
        await sleep(260);
      }

      ok.push(it.code);
      drawProg(i + 1, it.code, asLost ? "Cadastrado em Perdidos" : "Cadastrado com sucesso");
    }

    prog.innerHTML =
      `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">` +
        `<div style="font-size:13.5px;font-weight:800;color:${fail.length ? "#fde047" : "#86efac"};">Conclu\u00eddo: ${ok.length} de ${rows.length} instrumento(s) criado(s)</div>` +
        `<button type="button" id="vu-img-prog-close" style="padding:4px 10px;border-radius:6px;border:1px solid rgba(255,255,255,.35);background:transparent;color:#fff;font-weight:700;font-size:11.5px;cursor:pointer;">Fechar</button>` +
      `</div>` +
      (fail.length
        ? `<div style="margin-top:6px;font-size:11.5px;color:#fecaca;">N\u00e3o criados: ${fail.join(", ")}</div>`
        : `<div style="margin-top:6px;font-size:11.5px;color:#cbd5e1;">${asLost ? "Itens criados e encaminhados para Perdidos/Baixas." : "Verifique os novos itens no Invent\u00e1rio e aguarde sincronizar."}</div>`);

    prog.querySelector("#vu-img-prog-close").onclick = () => prog.remove();
    setTimeout(() => { if (prog && prog.isConnected && !fail.length) prog.remove(); }, 7000);
  };

  /* -------------------- MODAL DE IMPORTACAO DE IMAGEM / EXCEL (v2.2) -------------------- */
  const openImageImportModal = () => {
    const old = document.getElementById("vu-img-modal");
    if (old) old.remove();

    let parsedRows = [];
    const existingCodes = getExistingCodesSet();
    const defaultAsLost = isOnLostView();

    const overlay = document.createElement("div");
    overlay.id = "vu-img-modal";
    overlay.style.cssText = "position:fixed;inset:0;z-index:10900;background:rgba(15,23,42,.66);display:flex;align-items:center;justify-content:center;padding:14px;font-family:system-ui,-apple-system,sans-serif;";
    overlay.innerHTML =
      `<div style="width:min(980px,96vw);max-height:92vh;background:#ffffff;color:#0f172a;border-radius:16px;overflow:hidden;box-shadow:0 28px 70px rgba(0,0,0,.45);display:flex;flex-direction:column;">` +
        `<div style="background:linear-gradient(90deg,#002466,#0055b8);color:#ffffff;padding:15px 20px;display:flex;justify-content:space-between;align-items:center;gap:12px;">` +
          `<div>` +
            `<div style="font-size:16px;font-weight:800;">Importar Instrumentos por Imagem ou Excel (v2.2)</div>` +
            `<div style="font-size:12px;color:#bfdbfe;">Cole linhas direto do Excel (Ctrl+C &rarr; Ctrl+V) ou envie um print/foto da Listagem Voith.</div>` +
          `</div>` +
          `<button type="button" id="vu-img-close" style="width:34px;height:34px;border-radius:8px;border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.15);color:#fff;font-size:19px;line-height:1;cursor:pointer;">&times;</button>` +
        `</div>` +
        `<div style="padding:16px 20px;overflow-y:auto;display:grid;gap:14px;">` +
          `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;">` +
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
          `<label id="vu-img-lost-box" style="display:flex;align-items:center;gap:9px;padding:9px 12px;border-radius:10px;border:1px solid ${defaultAsLost ? "#f59e0b" : "#cbd5e1"};background:${defaultAsLost ? "#fffbeb" : "#f8fafc"};cursor:pointer;font-size:12.5px;color:#0f172a;">` +
            `<input type="checkbox" id="vu-img-as-lost" ${defaultAsLost ? "checked" : ""} style="width:16px;height:16px;accent-color:#d97706;cursor:pointer;">` +
            `<span><strong>Cadastrar j\u00e1 como Perdido / Baixado</strong> <span style="color:#475569;">(move automaticamente para Perdidos logo ap\u00f3s criar)</span></span>` +
          `</label>` +
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
            `<button type="button" id="vu-img-create" disabled style="padding:9px 18px;border-radius:9px;border:none;background:${defaultAsLost ? "#d97706" : "#16a34a"};color:#fff;font-weight:800;font-size:12.5px;cursor:pointer;opacity:.55;">${defaultAsLost ? "Criar como Perdido" : "Criar Instrumentos"} (0)</button>` +
          `</div>` +
        `</div>` +
      `</div>`;

    document.body.appendChild(overlay);

    const fileInp = overlay.querySelector("#vu-img-file");
    const dropZone = overlay.querySelector("#vu-img-drop");
    const rawTxt = overlay.querySelector("#vu-img-raw");
    const asLostChk = overlay.querySelector("#vu-img-as-lost");
    const lostBox = overlay.querySelector("#vu-img-lost-box");
    const statusEl = overlay.querySelector("#vu-img-status");
    const prevWrap = overlay.querySelector("#vu-img-preview-wrap");
    const tbody = overlay.querySelector("#vu-img-tbody");
    const countEl = overlay.querySelector("#vu-img-count");
    const createBtn = overlay.querySelector("#vu-img-create");
    const chkAll = overlay.querySelector("#vu-img-chk-all");

    const updateCreateCount = () => {
      const n = tbody.querySelectorAll(".vu-row-chk:checked").length;
      const lost = asLostChk.checked;
      createBtn.textContent = `${lost ? "Criar como Perdido" : "Criar Instrumentos"} (${n})`;
      createBtn.style.background = lost ? "#d97706" : "#16a34a";
      lostBox.style.borderColor = lost ? "#f59e0b" : "#cbd5e1";
      lostBox.style.background = lost ? "#fffbeb" : "#f8fafc";
      createBtn.disabled = n === 0;
      createBtn.style.opacity = n === 0 ? ".55" : "1";
    };

    asLostChk.onchange = updateCreateCount;

    const renderTable = () => {
      prevWrap.style.display = parsedRows.length ? "grid" : "none";
      countEl.textContent = `Itens detectados (${parsedRows.length})`;
      tbody.innerHTML = parsedRows.map((r, idx) => {
        const exists = r.code && existingCodes.has(String(r.code).toUpperCase());
        const needsCode = !r.code;
        const inpCss = "width:100%;padding:5px 7px;border:1px solid #cbd5e1;border-radius:6px;font-size:12px;color:#0f172a;background:#fff;";
        return (
          `<tr data-idx="${idx}" style="border-top:1px solid #e2e8f0;background:${exists ? "#fffbeb" : (needsCode ? "#fef2f2" : "#ffffff")};">` +
            `<td style="padding:6px 8px;"><input type="checkbox" class="vu-row-chk" ${exists ? "" : "checked"}></td>` +
            `<td style="padding:6px;"><input class="vu-c-code" value="${r.code || ""}" placeholder="Digite c\u00f3digo" style="${inpCss}font-weight:800;${needsCode ? "border-color:#dc2626;" : ""}">${exists ? '<div style="font-size:10px;color:#b45309;font-weight:700;margin-top:2px;">J\u00e1 cadastrado</div>' : (needsCode ? '<div style="font-size:10px;color:#dc2626;font-weight:700;margin-top:2px;">Preencher c\u00f3digo</div>' : "")}</td>` +
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
        if (parsedRows.length && !parsedRows[0].missingCode) {
          statusEl.style.color = "#15803d";
          statusEl.textContent = `${parsedRows.length} instrumento(s) lido(s) da imagem! Confira e clique para criar.`;
        } else if (parsedRows.length && parsedRows[0].missingCode) {
          statusEl.style.color = "#b45309";
          statusEl.textContent = "Dados lidos, mas o c\u00f3digo ficou borrado. Digite o c\u00f3digo na tabela abaixo.";
        } else {
          statusEl.style.color = "#b45309";
          statusEl.textContent = "Texto lido, mas nenhum c\u00f3digo foi encontrado. Ajuste o texto acima e clique em Ler Texto.";
        }
        renderTable();
      } catch (err) {
        statusEl.style.color = "#dc2626";
        statusEl.textContent = "Erro ao ler imagem: " + (err && err.message ? err.message : err);
      }
    };

    fileInp.onchange = () => { const f = fileInp.files && fileInp.files[0]; if (f) runOcrOnBlob(f); };
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
      const cb = ev.clipboardData;
      if (!cb) return;

      const plainText = String(cb.getData("text/plain") || "").trim();
      if (plainText) {
        if (document.activeElement !== rawTxt) {
          ev.preventDefault();
          rawTxt.value = plainText;
        }
        setTimeout(() => {
          parsedRows = parseVoithLines(rawTxt.value);
          if (parsedRows.length && !parsedRows[0].missingCode) {
            statusEl.style.color = "#15803d";
            statusEl.textContent = `${parsedRows.length} instrumento(s) lido(s) direto do Excel/texto!`;
          } else if (parsedRows.length) {
            statusEl.style.color = "#b45309";
            statusEl.textContent = "Linha lida, mas confirme o c\u00f3digo na tabela abaixo antes de criar.";
          } else {
            statusEl.style.color = "#b45309";
            statusEl.textContent = "Texto colado, mas nenhuma linha v\u00e1lida foi identificada.";
          }
          renderTable();
        }, 40);
        return;
      }

      const items = cb.items;
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
    };
    document.addEventListener("paste", onPaste);

    overlay.querySelector("#vu-img-parse-txt").onclick = () => {
      parsedRows = parseVoithLines(rawTxt.value);
      statusEl.style.color = parsedRows.length ? "#15803d" : "#b45309";
      statusEl.textContent = parsedRows.length ? `${parsedRows.length} instrumento(s) detectado(s).` : "Nenhuma linha v\u00e1lida encontrada.";
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

    const closeModal = () => { document.removeEventListener("paste", onPaste); overlay.remove(); };
    overlay.querySelector("#vu-img-close").onclick = closeModal;
    overlay.querySelector("#vu-img-cancel").onclick = closeModal;

    createBtn.onclick = () => {
      const selected = [];
      let missingCodeCount = 0;
      tbody.querySelectorAll("tr").forEach((tr) => {
        const chk = tr.querySelector(".vu-row-chk");
        if (!chk || !chk.checked) return;
        const code = String(tr.querySelector(".vu-c-code").value || "").trim().toUpperCase();
        if (!code) { missingCodeCount++; return; }
        const faixa = String(tr.querySelector(".vu-c-faixa").value || "").trim();
        const parts = faixa.split(/[~a\-]/).map((x) => x.trim()).filter(Boolean);
        selected.push({
          code,
          desc: String(tr.querySelector(".vu-c-desc").value || "").trim(),
          validade: String(tr.querySelector(".vu-c-val").value || "").trim(),
          setor: String(tr.querySelector(".vu-c-setor").value || "").trim(),
          responsavel: String(tr.querySelector(".vu-c-resp").value || "").trim(),
          faixa, faixaIni: parts[0] || "", faixaFim: parts[1] || "",
          cc: String(tr.querySelector(".vu-c-cc").value || "").trim()
        });
      });
      if (missingCodeCount > 0 && !selected.length) {
        statusEl.style.color = "#dc2626";
        statusEl.textContent = "Preencha o campo C\u00f3digo na tabela antes de criar.";
        return;
      }
      if (!selected.length) return;
      document.removeEventListener("paste", onPaste);
      createInstrumentsQueue(selected, { asLost: asLostChk.checked });
    };
  };

  /* -------------------- INJECAO DOS BOTOES -------------------- */
  const injectImageImportButtons = () => {
    document.querySelectorAll("#vu-modal-img-wrap, #vu-modal-img-btn").forEach((el) => {
      const card = findInstrumentFormDrawer();
      if (!card || isDrawerInEditMode(card)) el.remove();
    });

    const existingTop = document.getElementById("vu-open-img-import");
    if (window.innerWidth <= 768 && existingTop) {
      existingTop.remove();
    } else if (window.innerWidth > 768) {
      if (existingTop) {
        existingTop.onclick = openImageImportModal;
      } else {
        const newBtn = Array.from(document.querySelectorAll("button")).find((b) => {
          if (!isVisible(b) || b.closest("#vu-img-modal")) return false;
          const t = norm(b.textContent);
          return t.includes("novo item") || t.includes("novo instrumento");
        });
        if (newBtn && newBtn.parentElement) {
          const b = document.createElement("button");
          b.id = "vu-open-img-import";
          b.type = "button";
          b.textContent = "Ler Imagem";
          b.title = "Importar instrumentos colando do Excel ou lendo print/imagem";
          b.style.cssText = "padding:7px 11px;border-radius:10px;border:1px solid #0284c7;background:#f0f9ff;color:#0369a1;font-weight:800;font-size:12px;cursor:pointer;white-space:nowrap;";
          b.onclick = openImageImportModal;
          newBtn.insertAdjacentElement("afterend", b);
        }
      }
    }

    const drawer = findInstrumentFormDrawer();
    if (drawer && !isDrawerInEditMode(drawer) && !drawer.querySelector("#vu-modal-img-wrap")) {
      const firstInput = Array.from(drawer.querySelectorAll("input:not([type=hidden]):not([type=checkbox]), select, textarea")).find(isVisible);
      const formBody = (firstInput && (firstInput.closest("form") || (firstInput.parentElement && firstInput.parentElement.parentElement))) || drawer;

      const wrap = document.createElement("div");
      wrap.id = "vu-modal-img-wrap";
      wrap.style.cssText = "width:100%;margin-bottom:12px;box-sizing:border-box;";
      wrap.innerHTML =
        `<button type="button" id="vu-modal-img-btn" style="width:100%;padding:9px 12px;border-radius:10px;border:1px dashed #0284c7;background:#eff6ff;color:#004899;font-weight:800;font-size:12.5px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;">` +
          `<span>Importar v\u00e1rios por Imagem / Excel</span>` +
        `</button>`;

      wrap.querySelector("#vu-modal-img-btn").onclick = () => {
        closeNativeDrawer(drawer);
        setTimeout(openImageImportModal, 120);
      };

      if (formBody.firstChild) formBody.insertBefore(wrap, formBody.firstChild);
      else formBody.appendChild(wrap);
    }
  };

  let t = null;
  const schedule = (delay = 160) => {
    if (t) return;
    t = setTimeout(() => { t = null; injectImageImportButtons(); }, delay);
  };

  const init = () => {
    schedule(120);
    document.addEventListener("click", () => schedule(120), true);
    window.addEventListener("resize", () => schedule(150));
    const obs = new MutationObserver((muts) => {
      for (let i = 0; i < muts.length; i++) {
        const tgt = muts[i].target;
        if (tgt && tgt.id && tgt.id.startsWith("vu-")) continue;
        schedule(180);
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
