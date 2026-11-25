(() => {
  const fixAdminHierarchyTab = () => {
    const styleId = 'vu-fix-admin-tabs-style';
    if (!document.getElementById(styleId)) {
      const st = document.createElement('style');
      st.id = styleId;
      st.textContent = `
        [role="tablist"], .vu-tabs, .admin-tabs {
          display: flex !important;
          flex-wrap: wrap !important;
          gap: 6px !important;
          overflow-x: auto !important;
          max-width: 100% !important;
        }
        [role="tab"], .vu-tab, .admin-tab {
          white-space: normal !important;
          text-align: center !important;
          line-height: 1.2 !important;
          min-width: 72px !important;
          flex: 1 1 auto !important;
        }
      `;
      document.head.appendChild(st);
    }

    const tabs = Array.from(document.querySelectorAll('button, [role="tab"], a')).filter((el) => {
      const t = String(el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      return t.includes('hierarqu') || t.includes('tipos de login');
    });

    tabs.forEach((tab) => {
      if (tab.dataset.vuHierBound) return;
      tab.dataset.vuHierBound = '1';
      tab.addEventListener('click', (ev) => {
        setTimeout(() => {
          const modal = tab.closest('[role="dialog"], .modal, .vu-modal, .admin-panel') || document.body;
          const bodyArea = modal.querySelector('.modal-body, .vu-panel-body, .admin-content') || modal;
          const alreadyRendered = bodyArea.querySelector('#vu-hierarchy-box');
          if (alreadyRendered) return;

          const box = document.createElement('div');
          box.id = 'vu-hierarchy-box';
          box.style.cssText = 'margin-top:16px;padding:14px;border-radius:12px;border:1px solid #cbd5e1;background:#f8fafc;color:#0f172a;font-size:13px;';
          box.innerHTML = `
            <div style="font-weight:800;font-size:14px;margin-bottom:8px;color:#0f172a;">Hierarquia de Acessos &amp; Perfis</div>
            <div style="display:grid;gap:8px;">
              <div style="padding:8px 10px;border-radius:8px;background:#fff;border:1px solid #e2e8f0;"><strong>ADMIN</strong> — Controle total, usuários, configurações globais e auditoria.</div>
              <div style="padding:8px 10px;border-radius:8px;background:#fff;border:1px solid #e2e8f0;"><strong>GESTOR / LÍDER</strong> — Aprovação de lotes/romaneios, alertas de vencimento e pendências da equipe.</div>
              <div style="padding:8px 10px;border-radius:8px;background:#fff;border:1px solid #e2e8f0;"><strong>METROLOGISTA / TÉCNICO</strong> — Execução de calibrações, registro de certificados e movimentação de instrumentos.</div>
              <div style="padding:8px 10px;border-radius:8px;background:#fff;border:1px solid #e2e8f0;"><strong>OPERADOR / CONSULTA</strong> — Consulta de status, cautela e leitura do painel.</div>
            </div>
          `;
          bodyArea.appendChild(box);
        }, 80);
      });
    });
  };

  const obs = new MutationObserver(fixAdminHierarchyTab);
  if (document.body) {
    obs.observe(document.body, { childList: true, subtree: true });
    fixAdminHierarchyTab();
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      obs.observe(document.body, { childList: true, subtree: true });
      fixAdminHierarchyTab();
    });
  }
})();