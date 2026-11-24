<!-- Integração Voith Upgrade Suite v4.4 -->
    <script defer src="./modules/voith-upgrade-suite.js?v=16.25.4"></script>
    <script defer>
        (function () {
            var retries = 0;

            function findCollection(names) {
                for (var i = 0; i < names.length; i++) {
                    var parts = names[i].split(".");
                    var cur = window;
                    for (var j = 0; j < parts.length; j++) {
                        cur = cur ? cur[parts[j]] : undefined;
                    }
                    if (Array.isArray(cur)) return cur;
                }
                return [];
            }

            function findSessionToken() {
                var priorityKeys = [
                    "voith_session_token",
                    "voith_editor_token",
                    "voith_auth_token",
                    "voith_token_v169",
                    "voith_session_v169",
                    "voith_auth_v169",
                    "voith_token"
                ];

                function extractToken(raw) {
                    if (!raw) return "";
                    raw = String(raw).trim();
                    if (raw.charAt(0) === "{") {
                        try {
                            var obj = JSON.parse(raw);
                            if (obj && typeof obj === "object") {
                                return obj.token || obj.session_token || obj.sessionToken || obj.access_token || "";
                            }
                        } catch (_) {}
                    }
                    if (raw.length >= 16 && raw.indexOf(" ") === -1 && raw.charAt(0) !== "[") {
                        return raw;
                    }
                    return "";
                }

                var stores = [window.localStorage, window.sessionStorage];
                for (var s = 0; s < stores.length; s++) {
                    var st = stores[s];
                    if (!st) continue;
                    for (var i = 0; i < priorityKeys.length; i++) {
                        var hit = extractToken(st.getItem(priorityKeys[i]));
                        if (hit) return hit;
                    }
                    for (var k = 0; k < st.length; k++) {
                        var keyName = st.key(k) || "";
                        if (/voith.*(token|sess|auth|user|editor)/i.test(keyName)) {
                            var hit2 = extractToken(st.getItem(keyName));
                            if (hit2) return hit2;
                        }
                    }
                }
                if (window.authSession && window.authSession.token) return window.authSession.token;
                if (window.currentUser && window.currentUser.token) return window.currentUser.token;
                return "";
            }

            function bootUpgrade() {
                retries++;
                if (!window.VoithUpgrade) {
                    if (retries < 40) setTimeout(bootUpgrade, 150);
                    return;
                }

                var cfg = window.VOITH_CONFIG || {};
                window.VoithUpgrade.init({
                    supabaseUrl: cfg.SUPABASE_URL || "",
                    supabaseAnonKey: cfg.SUPABASE_KEY || "",
                    appVersion: cfg.APP_VERSION || "16.25.0",
                    getSessionToken: findSessionToken,
                    getInstruments: function () {
                        return findCollection([
                            "VoithDB.state.instruments",
                            "VoithDB.instruments",
                            "instruments",
                            "db.instruments",
                            "state.instruments",
                            "appState.instruments"
                        ]);
                    },
                    getCalibrationHistory: function () {
                        return findCollection([
                            "VoithDB.state.externalHistory",
                            "VoithDB.state.calibrationHistory",
                            "calibrationHistory",
                            "externalHistory",
                            "db.calibrationHistory",
                            "db.externalHistory"
                        ]);
                    },
                    getCurrentScreen: function () {
                        var active = document.querySelector(".vp-view:not([data-hidden=\"true\"]):not(.hidden)");
                        return (active && active.id) || window.currentView || "view-command";
                    },
                    onSelectInstrument: function (inst) {
                        var code = inst.code || inst.tag || inst.codigo || inst.Instrumento || inst.id;
                        if (typeof window.openInspectorByCode === "function" && code) {
                            window.openInspectorByCode(code);
                            return;
                        }
                        var list = findCollection(["VoithDB.state.instruments", "instruments", "db.instruments"]);
                        if (list.length && typeof window.openInspectorModal === "function") {
                            var idx = list.findIndex(function (x) { return String(x.code || x.tag || x.id) === String(code); });
                            if (idx >= 0) { window.openInspectorModal(idx); return; }
                        }
                        if (typeof window.navigateTo === "function") {
                            window.navigateTo("inventory");
                            var inp = document.getElementById("invSearchInput");
                            if (inp && code) { inp.value = code; inp.dispatchEvent(new Event("input")); }
                        }
                    },
                    onCautelaCreated: function (cautela) {
                        if (typeof window.showToast === "function") {
                            window.showToast(
                                "Cautela " + cautela.status + ": " + cautela.requester_name + " (Mat. " + cautela.requester_matricula + ") • " + cautela.instrument_tag,
                                "success"
                            );
                        }
                        if (typeof window.loadFromCloud === "function") {
                            window.loadFromCloud(false, false, false);
                        }
                    }
                });

                var lastTok = findSessionToken();
                setInterval(function () {
                    var curTok = findSessionToken();
                    if (curTok && curTok !== lastTok) {
                        lastTok = curTok;
                        window.VoithUpgrade.loadSessionProfile();
                    }
                }, 2000);

                var bannerEl = document.getElementById("offlineQueueBanner");
                var bannerTextEl = document.getElementById("offlineQueueText");
                if (bannerEl && bannerTextEl && typeof MutationObserver !== "undefined") {
                    var syncBanner = function () {
                        var isVisible = !bannerEl.hidden && !bannerEl.classList.contains("hidden") && bannerEl.style.display !== "none";
                        if (!isVisible) {
                            window.VoithUpgrade.setPendingMutations(0, false);
                            return;
                        }
                        var txt = bannerTextEl.textContent || "";
                        var match = txt.match(/(\d+)\s+alteraç/i);
                        var count = match ? parseInt(match[1], 10) : 0;
                        window.VoithUpgrade.setPendingMutations(count, /sincronizando/i.test(txt));
                    };
                    syncBanner();
                    new MutationObserver(syncBanner).observe(bannerEl, { attributes: true, attributeFilter: ["class", "style", "hidden"] });
                    new MutationObserver(syncBanner).observe(bannerTextEl, { childList: true, characterData: true, subtree: true });
                }
            }

            if (document.readyState === "loading") {
                document.addEventListener("DOMContentLoaded", bootUpgrade);
            } else {
                bootUpgrade();
            }
        })();
    </script>
