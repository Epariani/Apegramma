/* =========================================================
   Apegramma · Tabellone
   Tutto gira nel browser: nessun server, nessuna dipendenza.
   Lo stato viene salvato in localStorage a ogni modifica.
   ========================================================= */
(() => {
  "use strict";

  const STORAGE_KEY = "apegramma-tabellone-v1";
  const UNDO_LIMIT = 60;

  const PALETTE = [
    "#ff6b6b", "#4dabf7", "#51cf66", "#fcc419", "#cc5de8", "#ff922b",
    "#22b8cf", "#f06595", "#94d82d", "#845ef7", "#20c997", "#ffa8a8",
    "#74c0fc", "#e599f7", "#ffd43b", "#63e6be", "#ff8787", "#91a7ff",
    "#c0eb75", "#faa2c1"
  ];

  const VOWELS = { a: 12, e: 12, i: 11, o: 10, u: 4 };
  const CONSONANTS = { r: 10, n: 10, t: 10, l: 9, s: 9, c: 8, d: 6, m: 6, p: 5, v: 4, g: 4, b: 3, f: 3, z: 2 };

  const DEFAULT_SETTINGS = {
    title: "Apegramma",
    numTables: 8,
    targetScore: 0,
    maxManches: 0,
    fontScale: 1,
    letterCount: 7,
    minLength: 4,
    requireCentral: true,
    usedScope: "game",
    autoNextSet: false,
    scoring: "length",          // "length" = punti pari alle lettere · "fixed" = punti fissi
    fixedPoints: 1,
    pangramMode: "double",      // "double" = apegramma vale doppio · "bonus" · "none"
    pangramBonus: 5,
    closedChance: 25,           // % di probabilità che una manche sia «al chiuso»
    closedPangramPriority: "tie", // "tie" = l'apegramma decide solo i pareggi · "always" = vince sempre
    penalty: 0,
    showBids: true,
    enforceBid: false,
    timerSeconds: 60,
    timerSound: true
  };

  // ---------------------------------------------------------------
  // Stato
  // ---------------------------------------------------------------
  let state = null;
  const undoStack = [];
  let lastCheck = null;      // ultimo esito della verifica
  let timer = { remaining: 60, running: false, handle: null, lastTick: 0 };
  let audioCtx = null;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function makeTeam(i) {
    return {
      id: "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + i,
      name: "Tavolo " + (i + 1),
      color: PALETTE[i % PALETTE.length],
      total: 0,
      manche: 0,
      bid: 0,
      bidAt: 0
    };
  }

  function freshState(settings = DEFAULT_SETTINGS, keepTeams = null) {
    const s = { ...DEFAULT_SETTINGS, ...settings };
    const teams = keepTeams
      ? keepTeams.map(t => ({ ...t, total: 0, manche: 0, bid: 0, bidAt: 0 }))
      : Array.from({ length: s.numTables }, (_, i) => makeTeam(i));
    const L = randomLetters(s.letterCount);
    return {
      version: 2,
      settings: s,
      teams,
      central: L.central,
      outer: L.outer,
      lettersHidden: false,
      presets: [],
      presetIndex: 0,
      used: [],
      manche: 1,
      history: [],
      selectedTeam: null,
      mancheType: "asta",
      closed: { entries: {}, revealed: false }
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return sanitize(JSON.parse(raw));
    } catch (e) { /* storage non disponibile o dati corrotti */ }
    return freshState();
  }

  function sanitize(obj) {
    const base = freshState();
    if (!obj || typeof obj !== "object" || !Array.isArray(obj.teams)) return base;
    const s = { ...base, ...obj };
    s.settings = { ...DEFAULT_SETTINGS, ...(obj.settings || {}) };
    s.teams = obj.teams.map((t, i) => ({ ...makeTeam(i), ...t }));
    s.settings.numTables = s.teams.length;
    s.outer = Array.isArray(obj.outer) ? obj.outer : base.outer;
    s.used = Array.isArray(obj.used) ? obj.used : [];
    s.history = Array.isArray(obj.history) ? obj.history : [];
    s.presets = Array.isArray(obj.presets) ? obj.presets : [];
    s.mancheType = obj.mancheType === "chiuso" ? "chiuso" : "asta";
    s.closed = obj.closed && typeof obj.closed === "object"
      ? { entries: obj.closed.entries || {}, revealed: !!obj.closed.revealed }
      : { entries: {}, revealed: false };
    if (!obj.version || obj.version < 2) {          // nuove regole di punteggio
      s.settings.scoring = "length";
      s.settings.pangramMode = "double";
    }
    s.version = 2;
    return s;
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* ignora */ }
  }

  function pushUndo(label) {
    undoStack.push({ label, snap: JSON.stringify(state) });
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  }

  function commit() { save(); render(); }

  // ---------------------------------------------------------------
  // Lettere
  // ---------------------------------------------------------------
  function weightedPick(weights, exclude) {
    const entries = Object.entries(weights).filter(([l]) => !exclude.has(l));
    const tot = entries.reduce((a, [, w]) => a + w, 0);
    let r = Math.random() * tot;
    for (const [l, w] of entries) { if ((r -= w) <= 0) return l; }
    return entries[entries.length - 1][0];
  }

  function randomLetters(count) {
    count = Math.max(3, Math.min(10, count | 0));
    const nV = Math.max(2, Math.round(count * 0.4));
    const chosen = new Set();
    while (chosen.size < nV) chosen.add(weightedPick(VOWELS, chosen));
    while (chosen.size < count) chosen.add(weightedPick(CONSONANTS, chosen));
    const arr = shuffleArray([...chosen]);
    return { central: arr[0], outer: arr.slice(1) };
  }

  function shuffleArray(a) {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /** "nodsita:n" -> { central:"n", outer:[...] } ; null se non valido */
  function parseLetterSpec(spec) {
    if (!spec) return null;
    const [lettersPart, centralPart] = spec.split(":");
    const letters = [];
    for (const ch of normalize(lettersPart)) if (!letters.includes(ch)) letters.push(ch);
    if (letters.length < 3) return null;
    let central = normalize(centralPart || "")[0] || letters[0];
    if (!letters.includes(central)) letters.unshift(central);
    return { central, outer: letters.filter(l => l !== central) };
  }

  function letterSpec(central, outer) { return [central, ...outer].join("") + ":" + central; }
  function allLetters() { return [state.central, ...state.outer]; }

  function setLetters(L, label, skipUndo = false) {
    if (!skipUndo) pushUndo(label);
    state.central = L.central;
    state.outer = L.outer;
    state.lettersHidden = false;
    clearResult();
    commit();
    renderHive(true);
  }

  // ---------------------------------------------------------------
  // Verifica parola
  // ---------------------------------------------------------------
  function normalize(s) {
    return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");
  }

  function leaderTeam() {
    let best = null;
    for (const t of state.teams) {
      if (t.bid > 0 && (!best || t.bid > best.bid || (t.bid === best.bid && t.bidAt < best.bidAt))) best = t;
    }
    return best;
  }

  function findUsed(word) {
    return state.used.find(u => u.word === word && u.status !== "rejected" &&
      (state.settings.usedScope === "game" || u.manche === state.manche));
  }

  function teamById(id) { return state.teams.find(t => t.id === id) || null; }

  function isPangram(word) { return allLetters().every(l => word.includes(l)); }

  /** Punti di una parola: lunghezza (o fissi), raddoppiati se è un apegramma. */
  function calcPoints(word, pangram = isPangram(word)) {
    const s = state.settings;
    let pts = s.scoring === "fixed" ? Number(s.fixedPoints) || 0 : word.length;
    if (pangram) {
      if (s.pangramMode === "double") pts *= 2;
      else if (s.pangramMode === "bonus") pts += Number(s.pangramBonus) || 0;
    }
    return pts;
  }

  function checkWord(raw, opts = {}) {
    const s = state.settings;
    const word = normalize(raw);
    const set = new Set(allLetters());
    const errors = [];
    const warnings = [];
    if (!word) return null;

    const badLetters = [...new Set([...word].filter(ch => !set.has(ch)))];
    if (badLetters.length) errors.push("Lettere non disponibili: " + badLetters.map(l => l.toUpperCase()).join(", "));
    if (word.length < s.minLength) errors.push(`Troppo corta: servono almeno ${s.minLength} lettere`);
    if (s.requireCentral && !word.includes(state.central)) errors.push(`Manca la lettera centrale «${state.central.toUpperCase()}»`);

    const dup = findUsed(word);
    if (dup) {
      const who = teamById(dup.teamId);
      errors.push(`Già usata${who ? " da " + who.name : ""}${dup.manche !== state.manche ? " (manche " + dup.manche + ")" : ""}`);
    }

    const leader = opts.closed ? null : leaderTeam();
    if (leader && word.length < leader.bid) {
      const msg = `Più corta dell'offerta di ${leader.name} (${leader.bid} lettere)`;
      (s.enforceBid ? errors : warnings).push(msg);
    }

    const pangram = isPangram(word);
    const points = calcPoints(word, pangram);

    return { word, valid: errors.length === 0, errors, warnings, pangram, points, badLetters, duplicate: !!dup };
  }

  function defaultTargetTeam() {
    return state.selectedTeam && teamById(state.selectedTeam) ? state.selectedTeam : (leaderTeam()?.id || "");
  }

  function showResult(res) {
    const box = $("#result");
    lastCheck = res;
    if (!res) { box.hidden = true; return; }

    const central = state.central;
    const wordHtml = [...res.word].map(ch => {
      if (res.badLetters.includes(ch)) return `<mark>${ch}</mark>`;
      if (ch === central) return `<span class="c">${ch}</span>`;
      return ch;
    }).join("");

    const target = defaultTargetTeam();
    const options = [`<option value="">— tavolo —</option>`]
      .concat(state.teams.map(t => `<option value="${t.id}" ${t.id === target ? "selected" : ""}>${esc(t.name)}</option>`))
      .join("");
    const dict = encodeURIComponent(res.word);
    const status = res.valid ? (res.warnings.length ? "warn" : "ok") : "bad";

    box.className = "result " + status;
    box.innerHTML = `
      <div class="result-main">
        <span class="result-word">${res.valid ? "✅" : "❌"} ${wordHtml}</span>
        <span class="result-meta">${res.word.length} lettere${res.valid ? ` · vale <b>${res.points}</b> ${res.points === 1 ? "punto" : "punti"}` : ""}</span>
        ${res.pangram && res.valid ? `<span class="badge-pangram">🐝 APEGRAMMA!</span>` : ""}
      </div>
      <div class="result-actions operator-only">
        <select id="assignTo" title="Tavolo a cui assegnare">${options}</select>
        ${res.valid
          ? `<button class="assign" data-action="assignWord" title="Somma i punti alla manche del tavolo (Invio)">✔ Assegna +${res.points}</button>
             <button data-action="noteWord" title="Segna la parola come usata, senza punti">Solo registra</button>`
          : `<button class="reject" data-action="rejectWord" title="Registra la parola come bocciata${state.settings.penalty ? " e applica la penalità" : ""}">✖ Bocciata${state.settings.penalty ? " −" + state.settings.penalty : ""}</button>
             ${res.duplicate ? "" : `<button data-action="forceWord" title="Il conduttore accetta la parola anche se non rispetta le regole">Accetta comunque</button>`}`}
        <a href="https://it.wiktionary.org/wiki/${dict}" target="_blank" rel="noopener">Wikizionario ↗</a>
        <a href="https://www.google.com/search?q=${dict}+significato" target="_blank" rel="noopener">Google ↗</a>
      </div>
      ${res.errors.length ? `<ul class="result-reasons">${res.errors.map(e => `<li>${esc(e)}</li>`).join("")}</ul>` : ""}
      ${res.warnings.length ? `<ul class="result-reasons warn">${res.warnings.map(e => `<li>${esc(e)}</li>`).join("")}</ul>` : ""}
    `;
    box.hidden = false;
  }

  function clearResult() {
    lastCheck = null;
    $("#wordInput").value = "";
    if (isClosed()) renderClosedPanel(); else $("#result").hidden = true;
  }

  function selectedAssignTeam() {
    const sel = $("#assignTo");
    return sel && sel.value ? teamById(sel.value) : null;
  }

  function registerWord(status, { requireTeam = false, points = 0 } = {}) {
    if (!lastCheck) return;
    const team = selectedAssignTeam();
    if (requireTeam && !team) { toast("Scegli prima il tavolo"); $("#assignTo")?.focus(); return; }
    pushUndo("parola " + lastCheck.word);
    state.used.push({
      word: lastCheck.word,
      teamId: team ? team.id : null,
      points,
      manche: state.manche,
      status,
      pangram: lastCheck.pangram && status === "ok"
    });
    if (team && points) {
      team.manche += points;
      flashTeam(team.id);
    }
    const word = lastCheck.word.toUpperCase();
    const pangram = lastCheck.pangram;
    clearResult();
    commit();
    return { team, word, points, pangram };
  }

  // ---------------------------------------------------------------
  // Manche «al chiuso»: ogni tavolo scrive la parola su un foglio,
  // vince la parola valida più lunga.
  // ---------------------------------------------------------------
  function isClosed() { return state.mancheType === "chiuso"; }

  function closedResults() {
    const s = state.settings;
    const rows = state.teams
      .filter(t => state.closed.entries[t.id] && state.closed.entries[t.id].word)
      .map(t => {
        const e = state.closed.entries[t.id];
        const res = checkWord(e.word, { closed: true });
        const valid = e.override === "ok" ? true : e.override === "bad" ? false : res.valid;
        return { team: t, entry: e, res, valid, pangram: res.pangram, len: res.word.length, points: 0, winner: false };
      });
    const valid = rows.filter(r => r.valid);
    if (valid.length) {
      let pool = valid;
      if (s.closedPangramPriority === "always" && valid.some(r => r.pangram)) pool = valid.filter(r => r.pangram);
      const maxLen = Math.max(...pool.map(r => r.len));
      let winners = pool.filter(r => r.len === maxLen);
      if (winners.some(r => r.pangram)) winners = winners.filter(r => r.pangram);   // pareggio: decide l'apegramma
      winners.forEach(r => { r.winner = true; r.points = calcPoints(r.res.word, r.pangram); });
    }
    const pen = Number(s.penalty) || 0;
    rows.forEach(r => { if (!r.valid && pen) r.points = -pen; });
    rows.sort((a, b) => (b.winner - a.winner) || (b.valid - a.valid) || (b.len - a.len));
    return rows;
  }

  /** Nella manche al chiuso i punti manche dipendono solo dalle parole consegnate. */
  function applyClosedPoints() {
    const rows = state.closed.revealed ? closedResults() : [];
    for (const t of state.teams) t.manche = 0;
    rows.forEach(r => { r.team.manche = r.points; });
    return rows;
  }

  function nextTeamWithoutEntry(afterId) {
    const teams = state.teams;
    const start = Math.max(0, teams.findIndex(t => t.id === afterId));
    for (let k = 1; k <= teams.length; k++) {
      const t = teams[(start + k) % teams.length];
      if (!state.closed.entries[t.id]) return t.id;
    }
    return null;
  }

  function submitClosedEntry() {
    const teamId = $("#closedTeam").value;
    const word = normalize($("#wordInput").value);
    const team = teamById(teamId);
    if (!team) { toast("Scegli il tavolo"); return; }
    if (!word) { toast("Scrivi la parola del foglio"); return; }
    pushUndo("parola di " + team.name);
    state.closed.entries[teamId] = { word, override: null };
    if (state.closed.revealed) applyClosedPoints();
    state.selectedTeam = nextTeamWithoutEntry(teamId);
    $("#wordInput").value = "";
    commit();
    toast(state.closed.revealed ? `${team.name}: ${word.toUpperCase()}` : `📝 Parola di ${team.name} registrata`);
  }

  function revealClosed() {
    const n = Object.keys(state.closed.entries).length;
    if (!n) { toast("Nessuna parola registrata"); return; }
    pushUndo("rivela parole");
    state.closed.revealed = true;
    const rows = applyClosedPoints();
    commit();
    const winners = rows.filter(r => r.winner);
    winners.forEach(r => flashTeam(r.team.id));
    if (winners.length) {
      confetti(winners.map(r => r.team.color), winners.some(r => r.pangram) ? 140 : 80);
      toast("🏆 " + winners.map(r => `${r.team.name} +${r.points}`).join(" · "));
    } else toast("Nessuna parola valida");
  }

  function setOverride(teamId) {
    const e = state.closed.entries[teamId];
    if (!e) return;
    const t = teamById(teamId);
    const auto = checkWord(e.word, { closed: true }).valid;
    pushUndo("giudizio " + (t ? t.name : ""));
    const now = e.override === "ok" ? true : e.override === "bad" ? false : auto;
    const next = !now;
    e.override = next === auto ? null : (next ? "ok" : "bad");
    applyClosedPoints();
    commit();
  }

  function removeEntry(teamId) {
    if (!state.closed.entries[teamId]) return;
    pushUndo("rimuovi parola");
    delete state.closed.entries[teamId];
    applyClosedPoints();
    commit();
  }

  async function setMancheType(type, { announce = true, force = false } = {}) {
    if (type === state.mancheType) return;
    if (!force) {
      if (type === "chiuso" && (state.teams.some(t => t.manche) || state.used.some(u => u.manche === state.manche))) {
        toast("In questa manche sono già state assegnate parole: usa ↩️ Annulla o chiudi la manche");
        return;
      }
      if (type === "asta" && Object.keys(state.closed.entries).length &&
          !await confirmDlg("Tornare all'asta?", "Le parole già registrate per la manche al chiuso verranno scartate.", "Torna all'asta")) return;
      pushUndo("tipo manche");
    }
    state.mancheType = type;
    state.closed = { entries: {}, revealed: false };
    for (const t of state.teams) { t.bid = 0; t.bidAt = 0; if (!force) t.manche = 0; }
    lastCheck = null;
    $("#wordInput").value = "";
    if (type === "chiuso") state.selectedTeam = state.teams[0]?.id || null;
    commit();
    if (announce) announceType();
  }

  function drawMancheType() {
    const chance = Math.max(0, Math.min(100, Number(state.settings.closedChance) || 0));
    return Math.random() * 100 < chance ? "chiuso" : "asta";
  }

  function announceType() {
    const el = $("#announce");
    el.innerHTML = isClosed()
      ? `<div class="announce-card closed"><span class="big">🔒</span><b>Manche al chiuso!</b><span>Ogni tavolo scrive la sua parola su un foglio.<br>Vince la parola valida più lunga.</span></div>`
      : `<div class="announce-card"><span class="big">🔨</span><b>Manche all'asta</b><span>Rilanciate: chi offre più lettere sfida l'alveare.</span></div>`;
    el.hidden = false;
    clearTimeout(announceType._h);
    announceType._h = setTimeout(() => { el.hidden = true; }, 3200);
  }

  // ---------------------------------------------------------------
  // Fine manche
  // ---------------------------------------------------------------
  async function endManche() {
    if (isClosed() && !state.closed.revealed && Object.keys(state.closed.entries).length) {
      if (await confirmDlg("Parole non ancora rivelate", "Vuoi rivelare adesso le parole dei tavoli?", "🔓 Rivela")) revealClosed();
      return;
    }
    const awarded = state.teams.filter(t => t.manche !== 0);
    if (!awarded.length) {
      const ok = await confirmDlg("Fine manche", "Nessun tavolo ha punti in questa manche.\nChiudere comunque e passare alla successiva?", "Chiudi manche");
      if (!ok) return;
    }
    pushUndo("fine manche");
    const wasClosed = isClosed();
    if (wasClosed) {
      // le parole consegnate entrano nell'elenco delle parole usate
      for (const r of closedResults()) {
        state.used.push({
          word: r.res.word, teamId: r.team.id, points: r.points, manche: state.manche,
          status: r.winner ? "ok" : r.valid ? "noted" : "rejected", pangram: r.winner && r.pangram
        });
      }
    }
    const wordsThis = state.used.filter(u => u.manche === state.manche);
    const summary = awarded.map(t => `${t.name} ${t.manche > 0 ? "+" : ""}${t.manche}`).join(" · ");
    state.history.push({
      manche: state.manche,
      central: state.central,
      outer: state.outer.slice(),
      ts: Date.now(),
      type: state.mancheType,
      awards: awarded.map(t => ({
        teamId: t.id, name: t.name, color: t.color, points: t.manche,
        words: wordsThis.filter(u => u.teamId === t.id && u.status === "ok").map(u => u.word)
      }))
    });
    for (const t of state.teams) { t.total += t.manche; t.manche = 0; t.bid = 0; t.bidAt = 0; }
    state.manche += 1;
    state.selectedTeam = null;
    const nextType = drawMancheType();
    state.mancheType = "asta";
    state.closed = { entries: {}, revealed: false };
    if (nextType === "chiuso") setMancheType("chiuso", { announce: false, force: true });
    clearResult();
    timerReset();

    if (state.settings.autoNextSet) {
      const next = takeNextPreset();
      const L = next || randomLetters(state.settings.letterCount);
      state.central = L.central; state.outer = L.outer; state.lettersHidden = false;
    }
    commit();
    renderHive(state.settings.autoNextSet);
    if (nextType === "chiuso" || wasClosed) setTimeout(announceType, awarded.length ? 1600 : 200);

    if (awarded.length) {
      awarded.forEach(t => flashTeam(t.id));
      confetti(awarded.map(t => t.color));
      toast("🏁 " + summary);
    } else {
      toast("Manche chiusa");
    }
    checkGameOver();
  }

  function checkGameOver() {
    const s = state.settings;
    const target = Number(s.targetScore) || 0;
    const maxM = Number(s.maxManches) || 0;
    const reachedTarget = target > 0 && state.teams.some(t => t.total >= target);
    const reachedManches = maxM > 0 && state.manche > maxM;
    if (reachedTarget || reachedManches) {
      setTimeout(() => { showRanking(true); confetti(PALETTE, 160); }, 700);
    }
  }

  // ---------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------
  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function render() {
    const s = state.settings;
    document.documentElement.style.setProperty("--scale", s.fontScale);
    document.title = `${s.title} · Tabellone`;
    $("#gameTitle").textContent = s.title;
    $("#mancheNum").textContent = state.manche + (Number(s.maxManches) ? " / " + s.maxManches : "");
    $('[data-action="toggleHide"]').innerHTML = state.lettersHidden ? '👁️ <span class="tb-label">Rivela</span>' : '🙈 <span class="tb-label">Nascondi</span>';
    $('[data-action="toggleHide"]').classList.toggle("active", state.lettersHidden);
    const remaining = state.presets.length - state.presetIndex;
    $('[data-action="nextPreset"]').innerHTML = `📋 <span class="tb-label">Set successivo</span>${state.presets.length ? ` (${Math.max(0, remaining)})` : ""}`;
    renderTeams();
    renderHive(false);
    renderUsed();
    renderBidBanner();
    renderRulesHint();
    renderModeUi();
  }

  function renderModeUi() {
    const closed = isClosed();
    document.body.classList.toggle("mode-closed", closed);
    const tb = $('[data-action="toggleClosed"]');
    tb.classList.toggle("active", closed);
    $("#mancheType").textContent = closed ? "🔒 al chiuso" : "🔨 asta";
    $("#wordSubmit").textContent = closed ? "Registra" : "Verifica";
    $("#wordInput").placeholder = closed ? "Parola scritta sul foglio del tavolo…" : "Scrivi la parola da controllare…";
    const sel = $("#closedTeam");
    if (closed) {
      sel.innerHTML = state.teams.map(t =>
        `<option value="${t.id}">${state.closed.entries[t.id] ? "✔ " : ""}${esc(t.name)}</option>`).join("");
      sel.value = state.selectedTeam && teamById(state.selectedTeam) ? state.selectedTeam : (nextTeamWithoutEntry(null) || state.teams[0].id);
      renderClosedPanel();
    } else if (!lastCheck || $("#result").classList.contains("closed-panel")) {
      $("#result").hidden = true;
      $("#result").classList.remove("closed-panel");
    }
  }

  function renderClosedPanel() {
    const box = $("#result");
    const entries = state.closed.entries;
    const n = Object.keys(entries).length;
    box.className = "result closed-panel";
    box.hidden = false;
    if (!state.closed.revealed) {
      box.innerHTML = `
        <div class="closed-progress">
          <span>📝 Parole consegnate <b>${n}</b> / ${state.teams.length}</span>
          <span class="closed-dots">${state.teams.map(t => `<i style="--c:${t.color}" class="${entries[t.id] ? "in" : ""}" title="${esc(t.name)}"></i>`).join("")}</span>
          <button class="assign operator-only" data-action="revealClosed" ${n ? "" : "disabled"}>🔓 Rivela le parole</button>
        </div>`;
      return;
    }
    const rows = closedResults();
    box.innerHTML = `<div class="closed-table">${rows.map(r => {
      const reason = r.entry.override === "ok" ? "accettata dal conduttore"
        : r.entry.override === "bad" ? "bocciata dal conduttore"
        : r.res.errors.join(" · ");
      const dict = encodeURIComponent(r.res.word);
      return `<div class="closed-row ${r.winner ? "win" : r.valid ? "" : "bad"}" style="--c:${r.team.color}">
        <span class="cr-team">${r.winner ? "🏆 " : ""}${esc(r.team.name)}</span>
        <span class="cr-word">${r.pangram && r.valid ? "🐝 " : ""}${esc(r.res.word)}</span>
        <span class="cr-len">${r.len}</span>
        <span class="cr-status">${r.valid ? (r.winner ? `+${r.points}` : "✓") : "✗"} <small>${esc(reason)}</small></span>
        <span class="cr-actions operator-only">
          <button data-override="${r.team.id}" title="Inverti il giudizio">${r.valid ? "✖ Boccia" : "✔ Accetta"}</button>
          <button data-unentry="${r.team.id}" title="Elimina la parola">✕</button>
          <a href="https://it.wiktionary.org/wiki/${dict}" target="_blank" rel="noopener">Wiki ↗</a>
        </span>
      </div>`;
    }).join("")}</div>`;
  }

  /** Distribuisce i tavoli lungo il perimetro, in senso orario partendo in alto a sinistra. */
  function layoutTeams(n) {
    if (n <= 1) return { top: n, right: 0, bottom: 0, left: 0 };
    let side = Math.max(1, Math.round(n / 4));
    if (side * 2 > n) side = Math.floor(n / 2);
    const rest = n - side * 2;
    const top = Math.ceil(rest / 2);
    return { top, right: side, bottom: rest - top, left: side };
  }

  function renderTeams() {
    const teams = state.teams;
    const L = layoutTeams(teams.length);
    let i = 0;
    const take = k => teams.slice(i, (i += k));
    const top = take(L.top), right = take(L.right), bottom = take(L.bottom).reverse(), left = take(L.left).reverse();

    const leader = state.settings.showBids && !isClosed() ? leaderTeam() : null;
    const maxTotal = Math.max(...teams.map(t => t.total));

    const fill = (el, list) => {
      el.innerHTML = list.map(t => teamHtml(t, leader, maxTotal)).join("");
      el.classList.toggle("dense", list.length >= 4);
    };
    fill($("#stripTop"), top);
    fill($("#stripRight"), right);
    fill($("#stripBottom"), bottom);
    fill($("#stripLeft"), left);
    $("#board").classList.toggle("no-sides", L.left === 0 && L.right === 0);
  }

  function teamHtml(t, leader, maxTotal) {
    const s = state.settings;
    const closed = isClosed();
    const entry = closed ? state.closed.entries[t.id] : null;
    const closedRow = closed && state.closed.revealed && entry ? closedResults().find(r => r.team.id === t.id) : null;
    const words = state.used.filter(u => u.teamId === t.id && u.manche === state.manche && u.status === "ok").map(u => u.word.toUpperCase());
    const cls = ["team"];
    if (state.selectedTeam === t.id) cls.push("selected");
    if (leader && leader.id === t.id) cls.push("leader");
    if (closedRow && closedRow.winner) cls.push("leader");
    if (closedRow && !closedRow.valid) cls.push("lost");
    if (maxTotal > 0 && t.total === maxTotal) cls.push("first");
    const mCls = t.manche > 0 ? "pos" : t.manche < 0 ? "neg" : "";
    return `
      <div class="${cls.join(" ")}" data-team="${t.id}" style="--c:${t.color}" title="Clic: seleziona · Doppio clic: modifica">
        <div class="team-head">
          <span class="team-name">${esc(t.name)}</span>
          <button class="team-edit" data-edit="${t.id}" title="Modifica tavolo">✏️</button>
        </div>
        <div class="team-scores">
          <div class="team-total"><small>Totale</small>${t.total}</div>
          <div class="team-side">
            <span class="pill manche ${mCls}"><span class="lbl">Manche</span>${t.manche > 0 ? "+" : ""}${t.manche}</span>
            ${closed ? `<span class="pill sheet ${entry ? "has" : ""}">${entry ? (state.closed.revealed ? `${entry.word.length} lettere` : "📝 consegnata") : "⏳ foglio"}</span>` : ""}
            ${s.showBids && !closed ? `
            <span class="pill bid ${t.bid ? "has" : ""}">
              <button class="bid-btn" data-bid="-1" data-id="${t.id}" title="Abbassa offerta">−</button>
              <span class="lbl">Asta</span>${t.bid || "–"}
              <button class="bid-btn" data-bid="1" data-id="${t.id}" title="Alza offerta">+</button>
            </span>` : ""}
          </div>
        </div>
        ${closedRow ? `<div class="team-word">${closedRow.valid ? "✅" : "❌"} <b>${esc(closedRow.res.word.toUpperCase())}</b>${closedRow.pangram && closedRow.valid ? " 🐝" : ""}</div>`
          : words.length ? `<div class="team-word">Manche: <b>${words.map(esc).join(", ")}</b></div>` : ""}
      </div>`;
  }

  let hiveKey = "";
  function renderHive(animate) {
    const hive = $("#hive");
    const outer = state.outer;
    const n = outer.length;
    const key = [state.central, ...outer.slice().sort()].join("");

    // distanza dal centro (in unità di larghezza esagono)
    const d = n === 6 ? 1.07 : Math.max(1.22, (n * 1.12) / (2 * Math.PI));
    const start = n === 6 ? 0 : -90;
    const pos = outer.map((_, k) => {
      const a = (start + (360 / n) * k) * Math.PI / 180;
      return [Math.cos(a) * d, Math.sin(a) * d];
    });
    const maxX = Math.max(0, ...pos.map(p => Math.abs(p[0])));
    const maxY = Math.max(0, ...pos.map(p => Math.abs(p[1])));
    const unitsW = 2 * maxX + 1, unitsH = 2 * maxY + 1.1547;
    hive.style.width = `calc(var(--hex) * ${unitsW.toFixed(3)})`;
    hive.style.height = `calc(var(--hex) * ${unitsH.toFixed(3)})`;
    fitHive(unitsW, unitsH);

    if (key !== hiveKey || animate) {
      hive.innerHTML = "";
      const c = document.createElement("div");
      c.className = "hex central";
      c.dataset.letter = state.central;
      hive.appendChild(c);
      outer.forEach(l => {
        const h = document.createElement("div");
        h.className = "hex";
        h.dataset.letter = l;
        hive.appendChild(h);
      });
      hiveKey = key;
      if (animate) $$(".hex", hive).forEach((h, k) => {
        h.style.animationDelay = (k * 60) + "ms";
        h.classList.add("pop");
        setTimeout(() => h.classList.remove("pop"), 600 + k * 60);
      });
    }
    $$(".hex", hive).forEach(h => {
      const l = h.dataset.letter;
      h.textContent = l;
      h.classList.toggle("hidden-letter", state.lettersHidden);
      if (h.classList.contains("central")) { h.style.transform = "translate(0,0)"; return; }
      const k = outer.indexOf(l);
      const [x, y] = pos[k];
      h.style.transform = `translate(calc(var(--hex) * ${x.toFixed(4)}), calc(var(--hex) * ${y.toFixed(4)}))`;
    });
  }

  /** Calcola la grandezza degli esagoni in base allo spazio rimasto al centro. */
  let hiveUnits = [3.14, 3.0];
  function fitHive(unitsW, unitsH) {
    if (unitsW) hiveUnits = [unitsW, unitsH];
    const wrap = $(".hive-wrap");
    const h = wrap.clientHeight, w = wrap.clientWidth;
    if (!h || !w) return;
    const scale = Number(state.settings.fontScale) || 1;
    const size = Math.max(34, Math.min(h / hiveUnits[1], w / hiveUnits[0], 150 * scale));
    document.documentElement.style.setProperty("--hex", size.toFixed(1) + "px");
  }

  function renderUsed() {
    const filter = normalize($("#usedFilter").value);
    const scopeManche = state.settings.usedScope === "manche";
    const list = state.used
      .map((u, idx) => ({ ...u, idx }))
      .filter(u => !filter || u.word.includes(filter))
      .reverse();
    $("#usedCount").textContent = state.used.filter(u => u.status !== "rejected" && (!scopeManche || u.manche === state.manche)).length;
    $("#usedList").innerHTML = list.map(u => {
      const t = teamById(u.teamId);
      const cls = ["chip"];
      if (u.status === "rejected") cls.push("rejected");
      if (scopeManche && u.manche !== state.manche) cls.push("old");
      const title = `${t ? t.name : "nessun tavolo"} · manche ${u.manche}${u.status === "rejected" ? " · bocciata" : u.status === "noted" ? " · senza punti" : u.points ? " · +" + u.points : ""}`;
      return `<span class="${cls.join(" ")}" style="--c:${t ? t.color : "#9aa3c2"}" title="${esc(title)}">
        ${u.pangram ? "🐝 " : ""}${esc(u.word)}<span class="len">${u.word.length}</span>
        <button class="x" data-remove="${u.idx}" title="Rimuovi dall'elenco">✕</button></span>`;
    }).join("");
  }

  function renderBidBanner() {
    const el = $("#bidBanner");
    if (isClosed()) {
      const n = Object.keys(state.closed.entries).length;
      el.innerHTML = state.closed.revealed ? "🔓 Parole rivelate" : `🔒 Manche al chiuso · ${n}/${state.teams.length} fogli`;
      return;
    }
    const leader = state.settings.showBids && !isClosed() ? leaderTeam() : null;
    el.innerHTML = leader ? `🔨 ${esc(leader.name)} offre <b>${leader.bid}</b> lettere` : "";
  }

  function renderRulesHint() {
    const s = state.settings;
    const parts = [`almeno ${s.minLength} lettere`];
    if (s.requireCentral) parts.push(`sempre con la «${state.central.toUpperCase()}»`);
    parts.push("le lettere si possono ripetere");
    parts.push(s.scoring === "fixed" ? `${s.fixedPoints} punt${Number(s.fixedPoints) === 1 ? "o" : "i"} a parola` : "punti = lettere");
    if (s.pangramMode === "double") parts.push("apegramma ×2");
    else if (s.pangramMode === "bonus" && Number(s.pangramBonus)) parts.push(`apegramma +${s.pangramBonus}`);
    $("#rulesHint").textContent = parts.join(" · ");
  }

  function flashTeam(id) {
    requestAnimationFrame(() => {
      const el = $(`.team[data-team="${id}"]`);
      if (!el) return;
      el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
    });
  }

  // ---------------------------------------------------------------
  // Timer
  // ---------------------------------------------------------------
  function fmtTime(sec) {
    sec = Math.max(0, Math.ceil(sec));
    return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0");
  }

  function renderTimer() {
    const el = $("#timer");
    $("#timerText").textContent = fmtTime(timer.remaining);
    el.classList.toggle("running", timer.running);
    el.classList.toggle("low", timer.running && timer.remaining <= 10 && timer.remaining > 0);
    el.classList.toggle("done", timer.remaining <= 0);
  }

  function timerToggle() {
    if (timer.remaining <= 0) timerReset();
    timer.running = !timer.running;
    if (timer.running) {
      ensureAudio();
      timer.lastTick = performance.now();
      let lastWhole = Math.ceil(timer.remaining);
      timer.handle = setInterval(() => {
        const now = performance.now();
        timer.remaining -= (now - timer.lastTick) / 1000;
        timer.lastTick = now;
        const whole = Math.ceil(timer.remaining);
        if (whole !== lastWhole) {
          lastWhole = whole;
          if (state.settings.timerSound && whole <= 5 && whole > 0) beep(660, 0.12);
        }
        if (timer.remaining <= 0) {
          timer.remaining = 0;
          timer.running = false;
          clearInterval(timer.handle);
          if (state.settings.timerSound) { beep(440, 0.6); }
          toast("⏰ Tempo scaduto!");
        }
        renderTimer();
      }, 100);
    } else {
      clearInterval(timer.handle);
    }
    renderTimer();
  }

  function timerReset() {
    clearInterval(timer.handle);
    timer.running = false;
    timer.remaining = Number(state.settings.timerSeconds) || 60;
    renderTimer();
  }

  function ensureAudio() {
    try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audioCtx = null; }
  }

  function beep(freq, dur) {
    if (!audioCtx) return;
    try {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = freq; o.type = "sine";
      g.gain.setValueAtTime(0.25, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.connect(g).connect(audioCtx.destination);
      o.start(); o.stop(audioCtx.currentTime + dur);
    } catch (e) { /* ignora */ }
  }

  // ---------------------------------------------------------------
  // Dialoghi
  // ---------------------------------------------------------------
  function confirmDlg(title, text, yesLabel = "Conferma") {
    const dlg = $("#dlgConfirm");
    $("#confirmTitle").textContent = title;
    $("#confirmText").textContent = text;
    $("#confirmYes").textContent = yesLabel;
    dlg.returnValue = "";
    dlg.showModal();
    return new Promise(res => dlg.addEventListener("close", () => res(dlg.returnValue === "yes"), { once: true }));
  }

  function showRanking(final = false) {
    const dlg = $("#dlgRanking");
    const sorted = state.teams.slice().sort((a, b) => (b.total + b.manche) - (a.total + a.manche));
    let pos = 0, prev = null;
    $("#rankingList").innerHTML = sorted.map((t, i) => {
      const score = t.total + t.manche;
      if (score !== prev) { pos = i + 1; prev = score; }
      return `<li style="--c:${t.color}"><span class="pos">${pos}°</span><span>${esc(t.name)}</span>
        <span class="pts">${t.total}${t.manche ? `<small>${t.manche > 0 ? "+" : ""}${t.manche} in manche</small>` : ""}</span></li>`;
    }).join("");
    $("#rankingTitle").textContent = final ? `🏆 Vince ${sorted[0]?.name || ""}!` : "🏆 Classifica";
    dlg.classList.toggle("big", final);
    if (!dlg.open) dlg.showModal();
  }

  function showHistory() {
    const items = state.history.slice().reverse();
    $("#historyList").innerHTML = items.length ? items.map(h => {
      const letters = `<b>${esc(h.central)}</b>${h.outer.map(esc).join("")}`;
      const awards = h.awards.length
        ? h.awards.map(a => `<span class="chip" style="--c:${a.color}">${esc(a.name)} ${a.points > 0 ? "+" : ""}${a.points}${a.words.length ? " · " + a.words.map(esc).join(", ") : ""}</span>`).join(" ")
        : `<span class="history-empty">nessun punto</span>`;
      return `<div class="history-item">
        <header><span>Manche ${h.manche}${h.type === "chiuso" ? " · 🔒 al chiuso" : ""}</span><span>${new Date(h.ts).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</span></header>
        <div class="letters">${letters}</div>
        <div>${awards}</div>
      </div>`;
    }).join("") : `<p class="history-empty">Nessuna manche conclusa finora.</p>`;
    $("#dlgHistory").showModal();
  }

  function openEditTeam(id) {
    const t = teamById(id);
    if (!t) return;
    const f = $("#editTeamForm");
    f.name.value = t.name; f.color.value = t.color; f.total.value = t.total; f.manche.value = t.manche; f.bid.value = t.bid;
    const dlg = $("#dlgEditTeam");
    dlg.returnValue = "";
    dlg.showModal();
    dlg.addEventListener("close", () => {
      if (dlg.returnValue !== "ok") return;
      pushUndo("modifica " + t.name);
      t.name = f.name.value.trim() || t.name;
      t.color = f.color.value;
      t.total = parseInt(f.total.value, 10) || 0;
      t.manche = parseInt(f.manche.value, 10) || 0;
      const nb = Math.max(0, parseInt(f.bid.value, 10) || 0);
      if (nb !== t.bid) { t.bid = nb; t.bidAt = Date.now(); }
      commit();
    }, { once: true });
  }

  // --- Impostazioni ---
  function openSettings() {
    const f = $("#settingsForm");
    const s = state.settings;
    for (const [k, v] of Object.entries(s)) {
      const el = f.elements[k];
      if (!el) continue;
      if (el.type === "checkbox") el.checked = !!v; else el.value = v;
    }
    f.presets.value = state.presets.join("\n");
    f.currentLetters.value = letterSpec(state.central, state.outer);
    buildTeamNames(s.numTables);
    $("#dlgSettings").showModal();
  }

  function buildTeamNames(n) {
    const box = $("#teamNames");
    const current = $$(".tn", box).map(row => ({ name: $("input[type=text]", row).value, color: $("input[type=color]", row).value }));
    const rows = [];
    for (let i = 0; i < n; i++) {
      const t = state.teams[i];
      const prev = current[i];
      const name = prev ? prev.name : t ? t.name : "Tavolo " + (i + 1);
      const color = prev ? prev.color : t ? t.color : PALETTE[i % PALETTE.length];
      rows.push(`<div class="tn"><input type="color" value="${color}"><input type="text" value="${esc(name)}"></div>`);
    }
    box.innerHTML = rows.join("");
  }

  async function applySettings() {
    const f = $("#settingsForm");
    const s = { ...state.settings };
    for (const k of Object.keys(DEFAULT_SETTINGS)) {
      const el = f.elements[k];
      if (!el) continue;
      if (el.type === "checkbox") s[k] = el.checked;
      else if (el.type === "number" || el.type === "range") s[k] = Number(el.value);
      else s[k] = el.value;
    }
    s.numTables = Math.max(2, Math.min(20, s.numTables | 0));
    s.letterCount = Math.max(5, Math.min(10, s.letterCount | 0));
    s.minLength = Math.max(2, s.minLength | 0);
    s.title = (s.title || "").trim() || "Apegramma";

    const removing = state.teams.slice(s.numTables);
    if (removing.some(t => t.total || t.manche)) {
      const ok = await confirmDlg("Ridurre i tavoli?", `Verranno eliminati: ${removing.map(t => t.name).join(", ")}, che hanno dei punti.`, "Elimina");
      if (!ok) return false;
    }

    pushUndo("impostazioni");
    const names = $$("#teamNames .tn").map(row => ({ name: $("input[type=text]", row).value.trim(), color: $("input[type=color]", row).value }));
    const teams = [];
    for (let i = 0; i < s.numTables; i++) {
      const t = state.teams[i] || makeTeam(i);
      if (names[i]) { t.name = names[i].name || t.name; t.color = names[i].color; }
      teams.push(t);
    }
    state.teams = teams;

    const presets = f.presets.value.split(/\n+/).map(x => x.trim()).filter(Boolean);
    if (presets.join("|") !== state.presets.join("|")) { state.presets = presets; state.presetIndex = 0; }

    const cur = parseLetterSpec(f.currentLetters.value);
    const lettersChanged = cur && letterSpec(cur.central, cur.outer) !== letterSpec(state.central, state.outer);
    if (lettersChanged) { state.central = cur.central; state.outer = cur.outer; }
    else if (s.letterCount !== state.settings.letterCount) {
      const L = randomLetters(s.letterCount);
      state.central = L.central; state.outer = L.outer;
    }

    const timerChanged = s.timerSeconds !== state.settings.timerSeconds;
    state.settings = s;
    if (timerChanged && !timer.running) timerReset();
    commit();
    return true;
  }

  // --- Preset ---
  function takeNextPreset() {
    while (state.presetIndex < state.presets.length) {
      const L = parseLetterSpec(state.presets[state.presetIndex++]);
      if (L) return L;
    }
    return null;
  }

  // --- File ---
  function download(name, content, type) {
    const blob = new Blob([content], { type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function stamp() {
    const d = new Date();
    const p = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
  }

  function exportCsv() {
    const manches = state.history.map(h => h.manche);
    const rows = [["Tavolo", ...manches.map(m => "Manche " + m), "In corso", "Totale"]];
    for (const t of state.teams) {
      const per = state.history.map(h => (h.awards.find(a => a.teamId === t.id) || { points: 0 }).points);
      rows.push([t.name, ...per, t.manche, t.total + t.manche]);
    }
    rows.push([]);
    rows.push(["Parola", "Tavolo", "Manche", "Punti", "Stato"]);
    for (const u of state.used) {
      rows.push([u.word, teamById(u.teamId)?.name || "", u.manche, u.points, { ok: "assegnata", noted: "registrata", rejected: "bocciata" }[u.status] || u.status]);
    }
    const csv = rows.map(r => r.map(c => {
      const v = String(c ?? "");
      return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    }).join(";")).join("\r\n");
    download(`apegramma_risultati_${stamp()}.csv`, "﻿" + csv, "text/csv;charset=utf-8");
  }

  // --- Coriandoli esagonali ---
  function confetti(colors, count = 70) {
    const box = $("#celebrate");
    const all = colors.concat(["#ffc53d", "#ffdc80"]);
    for (let i = 0; i < count; i++) {
      const c = document.createElement("div");
      c.className = "confetti";
      c.style.left = Math.random() * 100 + "vw";
      c.style.background = all[i % all.length];
      c.style.animationDuration = (1.8 + Math.random() * 1.8) + "s";
      c.style.animationDelay = (Math.random() * 0.5) + "s";
      const sz = 8 + Math.random() * 12;
      c.style.width = sz + "px"; c.style.height = sz * 1.15 + "px";
      box.appendChild(c);
      setTimeout(() => c.remove(), 4500);
    }
  }

  let toastHandle = null;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastHandle);
    toastHandle = setTimeout(() => el.classList.remove("show"), 2600);
  }

  // ---------------------------------------------------------------
  // Azioni
  // ---------------------------------------------------------------
  const actions = {
    newLetters: () => setLetters(randomLetters(state.settings.letterCount), "nuove lettere"),
    nextPreset: () => {
      if (!state.presets.length) { toast("Nessun set preparato: aggiungili nelle Impostazioni"); return; }
      const before = JSON.stringify(state);
      const L = takeNextPreset();
      if (!L) { save(); render(); toast("Set preparati finiti"); return; }
      undoStack.push({ label: "set successivo", snap: before });
      setLetters(L, "set successivo", true);
    },
    shuffle: () => { state.outer = shuffleArray(state.outer); save(); renderHive(false); },
    toggleHide: () => {
      state.lettersHidden = !state.lettersHidden;
      commit();
      if (!state.lettersHidden) renderHive(true);
    },
    undo: () => {
      const u = undoStack.pop();
      if (!u) { toast("Niente da annullare"); return; }
      state = sanitize(JSON.parse(u.snap));
      lastCheck = null;
      $("#wordInput").value = "";
      $("#result").hidden = true;
      commit();
      toast("↩️ Annullato: " + u.label);
    },
    history: showHistory,
    ranking: () => showRanking(false),
    settings: openSettings,
    presentation: () => {
      document.body.classList.toggle("presentation");
      toast(document.body.classList.contains("presentation") ? "Modalità presentazione · H per i comandi" : "Comandi visibili");
    },
    fullscreen: () => {
      if (document.fullscreenElement) document.exitFullscreen?.();
      else document.documentElement.requestFullscreen?.().catch(() => {});
    },
    timerToggle,
    timerReset,
    endManche,
    revealClosed,
    toggleClosed: () => setMancheType(isClosed() ? "asta" : "chiuso"),
    assignWord: () => {
      if (!lastCheck) return;
      const r = registerWord("ok", { requireTeam: true, points: lastCheck.points });
      if (r) { toast(`${r.word} → ${r.team.name} +${r.points}`); if (r.pangram) confetti([r.team.color], 90); }
    },
    noteWord: () => {
      const r = registerWord("noted");
      if (r) toast(`${r.word} registrata`);
    },
    rejectWord: () => {
      const pen = Number(state.settings.penalty) || 0;
      const r = registerWord("rejected", { points: pen ? -pen : 0 });
      if (r) toast(`${r.word} bocciata${r.team && pen ? ` · ${r.team.name} −${pen}` : ""}`);
    },
    forceWord: () => {
      if (!lastCheck) return;
      const pts = calcPoints(lastCheck.word, lastCheck.pangram);
      const r = registerWord("ok", { requireTeam: true, points: pts });
      if (r) toast(`${r.word} accettata → ${r.team.name} +${pts}`);
    },
    exportJson: () => download(`apegramma_partita_${stamp()}.json`, JSON.stringify(state, null, 2), "application/json"),
    importJson: () => $("#importFile").click(),
    exportCsv,
    resetScores: async () => {
      if (!await confirmDlg("Azzera punteggi", "Totali, punti manche e offerte di tutti i tavoli tornano a zero. Parole e storico restano.", "Azzera")) return;
      pushUndo("azzera punteggi");
      state.teams.forEach(t => { t.total = 0; t.manche = 0; t.bid = 0; t.bidAt = 0; });
      commit();
      $("#dlgSettings").close();
      toast("Punteggi azzerati");
    },
    newGame: async () => {
      if (!await confirmDlg("Nuova partita", "Si riparte dalla manche 1: punteggi, parole usate e storico vengono cancellati.\nImpostazioni, nomi dei tavoli e set preparati restano.", "Nuova partita")) return;
      pushUndo("nuova partita");
      const presets = state.presets;
      state = freshState(state.settings, state.teams);
      state.presets = presets;
      const L = takeNextPreset();
      if (L) { state.central = L.central; state.outer = L.outer; }
      if (drawMancheType() === "chiuso") setMancheType("chiuso", { announce: false, force: true });
      $("#dlgSettings").close();
      clearResult();
      timerReset();
      commit();
      renderHive(true);
      if (isClosed()) setTimeout(announceType, 400);
    }
  };

  // ---------------------------------------------------------------
  // Eventi
  // ---------------------------------------------------------------
  function bindEvents() {
    document.addEventListener("click", e => {
      const closeBtn = e.target.closest("[data-close]");
      if (closeBtn) { closeBtn.closest("dialog")?.close(); return; }

      const bidBtn = e.target.closest("[data-bid]");
      if (bidBtn) { e.stopPropagation(); changeBid(bidBtn.dataset.id, Number(bidBtn.dataset.bid)); return; }

      const edit = e.target.closest("[data-edit]");
      if (edit) { openEditTeam(edit.dataset.edit); return; }

      const ov = e.target.closest("[data-override]");
      if (ov) { setOverride(ov.dataset.override); return; }
      const un = e.target.closest("[data-unentry]");
      if (un) { removeEntry(un.dataset.unentry); return; }
      if (e.target.closest("#announce")) { $("#announce").hidden = true; return; }

      const rm = e.target.closest("[data-remove]");
      if (rm) { removeUsed(Number(rm.dataset.remove)); return; }

      const act = e.target.closest("[data-action]");
      if (act && actions[act.dataset.action]) { e.preventDefault(); actions[act.dataset.action](); return; }

      const team = e.target.closest(".team");
      if (team) { selectTeam(team.dataset.team); return; }
    });

    document.addEventListener("dblclick", e => {
      const team = e.target.closest(".team");
      if (team && !e.target.closest("button")) openEditTeam(team.dataset.team);
      if (e.target.closest("#timer")) timerReset();
    });

    $("#timer").addEventListener("click", () => timerToggle());

    $("#wordForm").addEventListener("submit", e => {
      e.preventDefault();
      if (isClosed()) { submitClosedEntry(); return; }
      const raw = $("#wordInput").value;
      // Invio su una parola già verificata e valida = assegna
      if (lastCheck && lastCheck.valid && normalize(raw) === lastCheck.word && selectedAssignTeam()) {
        actions.assignWord();
        return;
      }
      const res = checkWord(raw);
      if (!res) { showResult(null); return; }
      showResult(res);
    });
    $("#closedTeam").addEventListener("change", e => { state.selectedTeam = e.target.value; save(); renderTeams(); });
    $("#wordInput").addEventListener("input", () => {
      if (isClosed()) return;
      if (lastCheck && normalize($("#wordInput").value) !== lastCheck.word) { $("#result").hidden = true; lastCheck = null; }
    });

    $("#usedFilter").addEventListener("input", renderUsed);

    $("#saveSettings").addEventListener("click", async e => {
      e.preventDefault();
      if (await applySettings()) { $("#dlgSettings").close(); toast("Impostazioni salvate"); }
    });
    $("#settingsForm").elements.numTables.addEventListener("input", e => {
      const n = Math.max(2, Math.min(20, Number(e.target.value) || 2));
      buildTeamNames(n);
    });

    $("#importFile").addEventListener("change", async e => {
      const file = e.target.files[0];
      e.target.value = "";
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        if (!Array.isArray(data.teams)) throw new Error("formato");
        pushUndo("carica partita");
        state = sanitize(data);
        $("#dlgSettings").close();
        clearResult(); timerReset(); commit(); renderHive(true);
        toast("Partita caricata");
      } catch (err) {
        toast("File non valido");
      }
    });

    document.addEventListener("keydown", onKey);
    if ("ResizeObserver" in window) new ResizeObserver(() => fitHive()).observe($(".hive-wrap"));
    else window.addEventListener("resize", () => fitHive());
  }

  function onKey(e) {
    const tag = (e.target.tagName || "").toLowerCase();
    const typing = tag === "input" || tag === "textarea" || tag === "select";
    const dialogOpen = !!document.querySelector("dialog[open]");

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !typing && !dialogOpen) {
      e.preventDefault(); actions.undo(); return;
    }
    if (e.key === "Escape" && !dialogOpen) {
      if (typing) e.target.blur();
      clearResult(); selectTeam(null); return;
    }
    if (typing || dialogOpen || e.ctrlKey || e.metaKey || e.altKey) return;

    const k = e.key.toLowerCase();
    const map = { n: "newLetters", p: "nextPreset", m: "shuffle", r: "toggleHide", c: "ranking", f: "fullscreen", h: "presentation", k: "toggleClosed" };
    if (e.key === " ") { e.preventDefault(); timerToggle(); return; }
    if (e.key === "/" || e.key === "Enter") { e.preventDefault(); $("#wordInput").focus(); return; }
    if (map[k]) { e.preventDefault(); actions[map[k]](); return; }
    if (/^[0-9]$/.test(e.key)) {
      const idx = e.key === "0" ? 9 : Number(e.key) - 1;
      const t = state.teams[idx];
      if (t) selectTeam(t.id);
    }
    if ((e.key === "+" || e.key === "-") && state.selectedTeam && !isClosed()) changeBid(state.selectedTeam, e.key === "+" ? 1 : -1);
  }

  function selectTeam(id) {
    if (isClosed()) {
      state.selectedTeam = id || null;
      save();
      renderTeams();
      if (id) { $("#closedTeam").value = id; $("#wordInput").focus(); }
      return;
    }
    state.selectedTeam = state.selectedTeam === id ? null : id;
    save();
    renderTeams();
    const sel = $("#assignTo");
    if (sel) sel.value = state.selectedTeam || leaderTeam()?.id || "";
  }

  function changeBid(id, delta) {
    const t = teamById(id);
    if (!t) return;
    pushUndo("offerta " + t.name);
    const min = state.settings.minLength;
    if (delta > 0) {
      const maxOther = Math.max(0, ...state.teams.filter(x => x.id !== t.id).map(x => x.bid));
      t.bid = t.bid ? t.bid + 1 : Math.max(min, maxOther + 1);
    } else {
      t.bid = t.bid - 1 < min ? 0 : t.bid - 1;
    }
    t.bidAt = Date.now();
    commit();
    if (lastCheck) showResult(checkWord(lastCheck.word));
  }

  function removeUsed(idx) {
    const u = state.used[idx];
    if (!u) return;
    pushUndo("rimuovi " + u.word);
    const t = teamById(u.teamId);
    if (t && u.points && u.manche === state.manche) t.manche -= u.points;   // restituisce i punti se la manche è ancora aperta
    state.used.splice(idx, 1);
    commit();
    toast(`${u.word.toUpperCase()} rimossa`);
  }

  // ---------------------------------------------------------------
  // Avvio
  // ---------------------------------------------------------------
  state = load();
  save();
  bindEvents();
  timerReset();
  render();
  renderHive(true);
})();
