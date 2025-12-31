// ==UserScript==
// @name         雀渣 CHAGA 牌谱分析
// @version      1.0
// @description  适用于雀渣平台的 CHAGA 牌谱分析工具
// @author       Choimoe
// @match        https://tziakcha.net/record/*
// @icon         https://tziakcha.net/favicon.ico
// @grant        none
// @run-at       document-start
// @license      MIT
// @namespace https://greasyfork.org/users/1543716
// ==/UserScript==
 
(function() {
    'use strict';
 
    let tzInstance = null;
    const originalDefineProperty = Object.defineProperty;
    
    const interceptTZ = () => {
        const descriptor = {
            configurable: true,
            enumerable: true,
            get: function() {
                return this._TZ;
            },
            set: function(value) {
                if (typeof value === 'function' && !this._TZ_intercepted) {
                    console.log('[Reviewer] Intercepting TZ constructor');
                    this._TZ_intercepted = true;
                    const OriginalTZ = value;
                    this._TZ = function(...args) {
                        const instance = new OriginalTZ(...args);
                        tzInstance = instance;
                        console.log('[Reviewer] Captured TZ instance:', instance);
                        console.log('[Reviewer] Current step:', instance.stp);
                        return instance;
                    };
                    this._TZ.prototype = OriginalTZ.prototype;
                    Object.setPrototypeOf(this._TZ, OriginalTZ);
                    for (let key in OriginalTZ) {
                        if (OriginalTZ.hasOwnProperty(key)) {
                            this._TZ[key] = OriginalTZ[key];
                        }
                    }
                } else {
                    this._TZ = value;
                }
            }
        };
        
        try {
            originalDefineProperty(window, 'TZ', descriptor);
            console.log('[Reviewer] TZ interceptor installed');
        } catch (e) {
            console.error('[Reviewer] Failed to install TZ interceptor:', e);
        }
    };
    
    interceptTZ();
    
    const initReviewer = () => {
        if (typeof WIND === 'undefined' || typeof TILE === 'undefined') {
            console.log('[Reviewer] Waiting for game constants...');
            setTimeout(initReviewer, 100);
            return;
        }
        
        const style = document.createElement('style');
        style.textContent = `
            .highlight-first-tile {
                box-shadow: 0 0 0 3px red, inset 0 0 0 3px red !important;
            }
            .tile-weight-bar {
                position: absolute;
                bottom: 100%;
                left: 50%;
                transform: translateX(-50%);
                width: 10px;
                height: 0;
                max-height: 50px;
                background: #ff4444;
                transition: height 0.3s ease;
                z-index: 10;
                pointer-events: none;
            }
        `;
        document.head.appendChild(style);
        
        console.log('[Reviewer] Initializing reviewer...');
        
        const bz2tc = (s) => {
            const type = s[0];
            const num = parseInt(s.slice(1)) - 1;
            if (type === "W") return num + 0;
            else if (type === "T") return num + 9;
            else if (type === "B") return num + 18;
            else if (type === "F") return num + 27;
            else if (type === "J") return num + 31;
            else if (type === "H") return num + 34;
            else {
                console.log("Unknown tile:", s);
                return -1;
            }
        };
 
        const act2str = (act) => {
            act = act.trim();
            if (act.startsWith("Chi")) {
                const components = act.split(/\s+/);
                const tile = tc2tile(bz2tc(components.at(-1)));
                const chi = `${+tile[0] - 1}${tile[0]}${+tile[0] + 1}${tile[1]}`;
                return [...components.slice(0, -1), chi].join(" ");
            } else if ("1" <= act.at(-1) && act.at(-1) <= "9") {
                const components = act.split(/\s+/);
                return [
                    ...components.slice(0, -1),
                    tc2tile(bz2tc(components.at(-1))),
                ].join(" ");
            } else return act;
        };
 
        const tc2tile = (i) => TILE[i * 4];
        
        const fmtLoad = (i) => {
            switch (i) {
                case 0: return "✗";
                case 1: return "·";
                case 2: return "✓";
                default: return "_";
            }
        };
 
        const parseRound = (roundStr) => {
            roundStr = roundStr.trim();
            
            if (/^\d/.test(roundStr)) {
                const num = parseInt(roundStr);
                return num - 1;
            }
            
            if (WIND.some(w => roundStr.startsWith(w + " "))) {
                const wind = WIND.find(w => roundStr.startsWith(w + " "));
                const num = parseInt(roundStr.slice(wind.length).trim()) - 1;
                return WIND.findIndex((x) => x === wind) * 4 + num;
            }
            
            if (roundStr.length === 3 && roundStr[1] === "风") {
                return WIND.findIndex((x) => x === roundStr[0]) * 4 +
                       WIND.findIndex((x) => x === roundStr[2]);
            }
            
            console.warn("Unknown round format:", roundStr);
            return WIND.findIndex((x) => x === roundStr[0]) * 4 +
                   WIND.findIndex((x) => x === roundStr[2]);
        };
 
        window.__reviews = {};
        window.__reviews_filled = {};
        window.__reviews_seats = [undefined, undefined, undefined, undefined];
        let highlightFirstTile = true;
        let showWeightBars = true;
        
        const getPlayerStep = () => {
            if (tzInstance && typeof tzInstance.stp === 'number') {
                return tzInstance.stp - 18;
            }
            return -18;
        };
 
        const softmax = (weights) => {
            const maxWeight = Math.max(...weights);
            const expWeights = weights.map(w => Math.exp(w - maxWeight));
            const sumExp = expWeights.reduce((a, b) => a + b, 0);
            return expWeights.map(w => w / sumExp);
        };
 
        const clearWeightBars = () => {
            document.querySelectorAll('.tile-weight-bar').forEach(el => el.remove());
        };
 
        const showWeightVisualization = (candidates, playerIndex) => {
            if (playerIndex !== 0 || !showWeightBars) return;
            const handContainers = document.querySelectorAll('.hand');
            if (handContainers.length === 0) return;
            const currentHand = handContainers[0];
            const tiles = Array.from(currentHand.querySelectorAll('.tl'));
            const tileWeightMap = new Map();
            const weights = candidates.map(([w, _]) => w);
            const probs = softmax(weights);
            candidates.forEach(([weight, act], idx) => {
                const actStr = act.trim();
                if (!actStr.startsWith('Play ')) return;
                const tileCode = actStr.slice(5);
                const tileIndex = bz2tc(tileCode);
                if (tileIndex >= 0 && tileIndex < 136) {
                    if (!tileWeightMap.has(tileIndex)) {
                        tileWeightMap.set(tileIndex, probs[idx]);
                    }
                }
            });
            tiles.forEach(tileEl => {
                const tileVal = parseInt(tileEl.dataset.val);
                const tileIndex = Math.floor(tileVal / 4);
                const prob = tileWeightMap.get(tileIndex);
                if (prob !== undefined) {
                    const computedStyle = window.getComputedStyle(tileEl);
                    const currentPosition = computedStyle.position;
                    if (currentPosition === 'static') {
                        tileEl.style.position = 'relative';
                    }
                    const bar = document.createElement('div');
                    bar.className = 'tile-weight-bar';
                    bar.style.height = `${prob * 50}px`;
                    tileEl.appendChild(bar);
                }
            });
        };
 
        const show_cands = () => {
            const roundEl = document.getElementById("round");
            const reviewLogEl = document.getElementById("review-log");
            const reviewEl = document.getElementById("review");
            
            if (!roundEl || !reviewLogEl || !reviewEl) return;
            
            const roundStr = roundEl.innerHTML;
            const round = parseRound(roundStr);
            const ri = getPlayerStep();
            
            reviewLogEl.innerHTML = `CHAGA Reviewer [Step ${ri}] [Load ${window.__reviews_seats.map(fmtLoad).join(" ")}]`;
            
            const key = `${round}-${ri}`;
            const resp = window.__reviews_filled[key] || window.__reviews[key];
            document.querySelectorAll('.tl.highlight-first-tile').forEach(el => {
                el.classList.remove('highlight-first-tile');
            });
            clearWeightBars();
            if (resp?.extra?.candidates?.length) {
                reviewEl.innerHTML = resp.extra.candidates
                    .map(([weight, act]) =>
                        `${act2str(act)}&nbsp;&nbsp;-&nbsp;&nbsp;${weight.toFixed(2)}`
                    )
                    .join("<br>");
                const allPlays = resp.extra.candidates.every(([_, act]) => 
                    act.trim().startsWith("Play ")
                );
                if (allPlays && tzInstance) {
                    const currentStat = tzInstance.stat?.[tzInstance.stp];
                    const playerIndex = currentStat?.k ?? 0;
                    showWeightVisualization(resp.extra.candidates, playerIndex);
                }
                if (allPlays && highlightFirstTile && tzInstance) {
                    const firstCand = resp.extra.candidates[0];
                    if (firstCand && firstCand[1]) {
                        const act = firstCand[1].trim();
                        const tileCode = act.slice(5);
                        const tileIndex = bz2tc(tileCode);
                        if (tileIndex >= 0 && tileIndex < 136 && tzInstance.stat && tzInstance.stat[tzInstance.stp]) {
                            const currentStat = tzInstance.stat[tzInstance.stp];
                            let playerIndex = currentStat.k;
                            if (typeof playerIndex === 'undefined') {
                                playerIndex = 0;
                            }
                            const handContainers = document.querySelectorAll('.hand');
                            if (handContainers.length > playerIndex) {
                                const targetHand = handContainers[playerIndex];
                                const tiles = targetHand.querySelectorAll('.tl');
                                let highlighted = false;
                                tiles.forEach(tileEl => {
                                    if (!highlighted) {
                                        const tileVal = parseInt(tileEl.dataset.val);
                                        if (Math.floor(tileVal / 4) === tileIndex) {
                                            tileEl.classList.add('highlight-first-tile');
                                            console.log(`[Reviewer] Highlighted tile DOM for player ${playerIndex}: ${tileCode}`);
                                            highlighted = true;
                                        }
                                    }
                                });
                            }
                        }
                    }
                }
            }
        };
 
        const createUI = () => {
            const ctrl = document.getElementById("ctrl");
            if (!ctrl) {
                setTimeout(createUI, 100);
                return;
            }
            const ctrlRtDiv = document.createElement("div");
            ctrlRtDiv.classList.add("ctrl-rt");
            const checkboxDiv = document.createElement("div");
            checkboxDiv.classList.add("fs-sm");
            const checkboxLabel = document.createElement("label");
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.id = "cb-highlight-first-tile";
            checkbox.checked = highlightFirstTile;
            checkbox.onchange = function(e) {
                highlightFirstTile = e.target.checked;
                show_cands();
            };
            const labelText = document.createElement("span");
            labelText.classList.add("ml-02em");
            labelText.innerText = "高亮首选牌";
            checkboxLabel.appendChild(checkbox);
            checkboxLabel.appendChild(labelText);
            checkboxDiv.appendChild(checkboxLabel);
            ctrlRtDiv.appendChild(checkboxDiv);
            const weightCheckboxDiv = document.createElement("div");
            weightCheckboxDiv.classList.add("fs-sm");
            const weightCheckboxLabel = document.createElement("label");
            const weightCheckbox = document.createElement("input");
            weightCheckbox.type = "checkbox";
            weightCheckbox.id = "cb-show-weight-bars";
            weightCheckbox.checked = showWeightBars;
            weightCheckbox.onchange = function(e) {
                showWeightBars = e.target.checked;
                show_cands();
            };
            const weightLabelText = document.createElement("span");
            weightLabelText.classList.add("ml-02em");
            weightLabelText.innerText = "显示权重条";
            weightCheckboxLabel.appendChild(weightCheckbox);
            weightCheckboxLabel.appendChild(weightLabelText);
            weightCheckboxDiv.appendChild(weightCheckboxLabel);
            ctrlRtDiv.appendChild(weightCheckboxDiv);
            const logDiv = document.createElement("div");
            logDiv.classList.add("fs-sm");
            const logSpan = document.createElement("span");
            logSpan.id = "review-log";
            logDiv.appendChild(logSpan);
            ctrlRtDiv.appendChild(logDiv);
            const reviewDiv = document.createElement("div");
            reviewDiv.classList.add("fs-sm");
            const reviewSpan = document.createElement("span");
            reviewSpan.id = "review";
            reviewDiv.appendChild(reviewSpan);
            ctrlRtDiv.appendChild(reviewDiv);
            ctrl.appendChild(ctrlRtDiv);
            
            console.log('[Reviewer] UI elements created');
            const hookButtons = () => {
                const buttons = ['nextstp', 'prevstp', 'ffstp', 'frstp', 'next', 'prev'];
                buttons.forEach(id => {
                    const btn = document.getElementById(id);
                    if (btn && btn.onclick) {
                        const original = btn.onclick;
                        btn.onclick = function(e) {
                            const result = original.call(this, e);
                            setTimeout(show_cands, 50);
                            return result;
                        };
                    }
                });
                
                console.log('[Reviewer] Button hooks installed');
            };
            
            setTimeout(hookButtons, 500);
        };
 
        const loadReviewData = () => {
            const tiEl = document.getElementById("ti");
            if (!tiEl || !tiEl.children[0]) {
                setTimeout(loadReviewData, 100);
                return;
            }
            const gameId = tiEl.children[0].href.split("=").at(-1);
            const roundEl = document.getElementById("round");
            if (!roundEl) {
                setTimeout(loadReviewData, 100);
                return;
            }
            const roundStr = roundEl.innerHTML;
            const round = parseRound(roundStr);
            console.log('[Reviewer] Loading review data for game:', gameId, 'round:', round);
            let loadedCount = 0;
            
            for (let is = 0; is <= 3; is++) {
                if (window.__reviews_seats[is]) continue;
                window.__reviews_seats[is] = 1;
                
                fetch(`https://tc-api.pesiu.org/review/?id=${gameId}&seat=${is}`)
                    .then((r) => r.json())
                    .then((r) => {
                        if (r.code) {
                            window.__reviews_seats[is] = 0;
                            console.error(`[Reviewer] Error fetching review data for seat ${is}:`, r.message);
                            return;
                        }
                        (Array.isArray(r) ? r : r.data).forEach((d) => {
                            if (d.ri) window.__reviews[`${d.rr}-${d.ri}`] = d;
                        });
                        window.__reviews_seats[is] = 2;
                        console.log(`[Reviewer] Download finish for seat ${is}`);
                        loadedCount++;
                        if (loadedCount === 4) {
                            fillEmptyValues();
                            show_cands();
                        } else {
                            show_cands();
                        }
                    })
                    .catch((e) => {
                        window.__reviews_seats[is] = 0;
                        console.error(`[Reviewer] Download failed for seat ${is}:`, e);
                    });
            }
            
            show_cands();
        };
        
        const fillEmptyValues = () => {
            for (const key in window.__reviews) {
                window.__reviews_filled[key] = window.__reviews[key];
            }
            const byRound = {};
            for (const key in window.__reviews) {
                const [rr, ri] = key.split('-').map(Number);
                if (!byRound[rr]) {
                    byRound[rr] = {};
                }
                byRound[rr][ri] = window.__reviews[key];
            }
            for (const round in byRound) {
                const steps = byRound[round];
                const riValues = Object.keys(steps).map(Number).sort((a, b) => a - b);
                const maxRi = Math.max(...riValues);
                let lastValue = null;
                for (let ri = Math.min(...riValues); ri <= maxRi; ri++) {
                    if (steps[ri]) {
                        lastValue = steps[ri];
                    } else if (lastValue) {
                        window.__reviews_filled[`${round}-${ri}`] = lastValue;
                        lastValue = null;
                    }
                }
            }
            
            console.log('[Reviewer] Empty values filled');
        };
 
        createUI();
        loadReviewData();
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(initReviewer, 500);
        });
    } else {
        setTimeout(initReviewer, 500);
    }
})();