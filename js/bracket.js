// --- Bracket engine ---

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

class Tournament {
    constructor(items) {
        const shuffled = shuffle([...items]);
        const size = 1 << Math.ceil(Math.log2(Math.max(shuffled.length, 2)));

        this.size = size;
        this.allMatches = {};
        // Distribute byes so each item gets at most one, and no null-vs-null match exists.
        this.rounds = this._build(this._buildSlots(shuffled, size));
        this._resolveByes();
        this.currentMatchId = this._nextPending();
        this.champion = null;
    }

    // Place bye matches at the front (one real item + one null each).
    // Remaining slots are filled with two real items per match.
    // This guarantees no null-vs-null pair and no item gets more than one bye.
    _buildSlots(items, size) {
        const byes = size - items.length;
        const slots = [];
        let ii = 0;
        for (let pair = 0; pair < size / 2; pair++) {
            if (pair < byes) slots.push(items[ii++], null);
            else             slots.push(items[ii++], items[ii++]);
        }
        return slots;
    }

    _build(slots) {
        const rounds = [];
        let id = 0;

        const r0 = [];
        for (let i = 0; i < slots.length; i += 2) {
            const m = { id: id++, round: 0, slot: i / 2, itemA: slots[i], itemB: slots[i + 1], winner: null, feederA: null, feederB: null };
            r0.push(m);
            this.allMatches[m.id] = m;
        }
        rounds.push(r0);

        let prev = r0;
        while (prev.length > 1) {
            const round = [];
            for (let i = 0; i + 1 < prev.length; i += 2) {
                const m = { id: id++, round: rounds.length, slot: i / 2, itemA: null, itemB: null, winner: null, feederA: prev[i].id, feederB: prev[i + 1].id };
                round.push(m);
                this.allMatches[m.id] = m;
            }
            rounds.push(round);
            prev = round;
        }
        return rounds;
    }

    // Only round-0 byes are resolved here. _win() does NOT cascade further,
    // so a bye in round 0 can never cascade into a second bye in round 1.
    _resolveByes() {
        this.rounds[0].forEach(m => {
            if (m.itemA && !m.itemB) this._win(m, m.itemA);
            else if (!m.itemA && m.itemB) this._win(m, m.itemB);
        });
    }

    _win(match, winner) {
        match.winner = winner;
        const parent = Object.values(this.allMatches)
            .find(m => m.feederA === match.id || m.feederB === match.id);
        if (!parent) { this.champion = winner; return; }
        if (parent.feederA === match.id) parent.itemA = winner;
        else parent.itemB = winner;
        // Do NOT auto-cascade: a null slot in the parent means the other feeder
        // hasn't been played yet, not that it's a permanent bye.
    }

    pickWinner(matchId, winner) {
        const m = this.allMatches[matchId];
        if (!m || m.winner) return;
        this._win(m, winner);
        this.currentMatchId = this._nextPending();
    }

    _nextPending() {
        for (const round of this.rounds)
            for (const m of round)
                if (!m.winner && m.itemA && m.itemB) return m.id;
        return null;
    }

    get currentMatch() {
        return this.currentMatchId != null ? this.allMatches[this.currentMatchId] : null;
    }
}

// --- Bracket rendering ---

const ENTRY_H  = 44;
const ENTRY_GAP = 2;
const MATCH_PAD = 6;
const MATCH_H  = 2 * ENTRY_H + ENTRY_GAP + 2 * MATCH_PAD; // 102px
const MATCH_W  = 150;
const ROUND_GAP = 52;
const SLOT_H   = 64;

function matchCenterY(match, tournament) {
    const n = tournament.rounds[match.round].length;
    const slotsPerMatch = tournament.size / n;
    return (match.slot * slotsPerMatch + slotsPerMatch / 2) * SLOT_H;
}

// Resolve CSS custom properties to actual color values so SVG attributes work
// correctly (SVG stroke= attributes don't support var(--...) syntax).
function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function renderBracket(tournament, container, currentMatchId) {
    container.innerHTML = "";

    const colorActive  = cssVar("--drag-over-outline-color");
    const colorBorder  = cssVar("--button-border-color");

    const champion  = tournament.champion;
    const numRounds = tournament.rounds.length;
    const totalW = numRounds * (MATCH_W + ROUND_GAP) - ROUND_GAP;
    const totalH = tournament.size * SLOT_H;

    const wrap = document.createElement("div");
    wrap.style.cssText = `position:relative;width:${totalW}px;height:${totalH}px;flex-shrink:0;`;

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", totalW);
    svg.setAttribute("height", totalH);
    svg.style.cssText = "position:absolute;inset:0;pointer-events:none;overflow:visible;";

    tournament.rounds.forEach((round, ri) => {
        const isFinalRound = ri === numRounds - 1;
        round.forEach(match => {
            const cy   = matchCenterY(match, tournament);
            const top  = cy - MATCH_H / 2;
            const left = ri * (MATCH_W + ROUND_GAP);

            const card = document.createElement("div");
            card.classList.add("b-match");
            if (match.id === currentMatchId) card.classList.add("b-match--current");
            card.style.cssText = `position:absolute;top:${top}px;left:${left}px;width:${MATCH_W}px;`;

            const isChampA = isFinalRound && champion && match.itemA === champion;
            const isChampB = isFinalRound && champion && match.itemB === champion;
            card.appendChild(makeEntry(match.itemA, match.winner === match.itemA && match.winner != null, isChampA));
            card.appendChild(makeEntry(match.itemB, match.winner === match.itemB && match.winner != null, isChampB));
            wrap.appendChild(card);

            // Connector line from this match to its parent match
            if (ri < numRounds - 1) {
                const parent = Object.values(tournament.allMatches)
                    .find(m => m.feederA === match.id || m.feederB === match.id);
                if (parent) {
                    const parentCY = matchCenterY(parent, tournament);
                    const x1   = left + MATCH_W;
                    const xMid = x1 + ROUND_GAP / 2;
                    const x2   = (ri + 1) * (MATCH_W + ROUND_GAP);
                    const color = match.winner ? colorActive : colorBorder;
                    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
                    path.setAttribute("d", `M${x1},${cy} H${xMid} V${parentCY} H${x2}`);
                    path.setAttribute("fill", "none");
                    path.setAttribute("stroke", color);
                    path.setAttribute("stroke-width", "2");
                    svg.appendChild(path);
                }
            }
        });
    });

    wrap.appendChild(svg);
    container.appendChild(wrap);
}

function makeEntry(item, isWinner, isChampion) {
    const el = document.createElement("div");
    el.classList.add("b-entry");
    if (isChampion) el.classList.add("b-entry--champion");
    else if (isWinner) el.classList.add("b-entry--winner");
    if (!item) { el.classList.add("b-entry--bye"); el.textContent = "bye"; return el; }
    const img = document.createElement("img");
    img.src = item.src;
    img.draggable = false;
    el.appendChild(img);
    return el;
}

// --- Page logic ---

document.addEventListener("DOMContentLoaded", () => {
    const MAX_IMAGES = 512;
    const MIN_IMAGES = 8;
    let uploadedItems = [];
    let tournament    = null;

    const uploadPhase  = document.getElementById("upload-phase");
    const matchPhase   = document.getElementById("match-phase");
    const vsUi         = document.getElementById("vs-ui");
    const doneBanner   = document.getElementById("done-banner");
    const uploadArea   = document.getElementById("upload-area");
    const fileInput    = document.getElementById("file-input");
    const previewGrid  = document.getElementById("preview-grid");
    const uploadCountEl = document.getElementById("upload-count");
    const startBtn     = document.getElementById("start-btn");
    const downloadBtn  = document.getElementById("download-btn");
    const clearBtn     = document.getElementById("clear-btn");

    const roundLabel   = document.getElementById("round-label");
    const matchLabel   = document.getElementById("match-label");
    const imgA         = document.getElementById("img-a");
    const imgB         = document.getElementById("img-b");
    const sideA        = document.getElementById("side-a");
    const sideB        = document.getElementById("side-b");

    const newBracketBtn = document.getElementById("new-bracket-btn");
    const bracketView   = document.getElementById("bracket-view");

    // --- Upload ---
    function updateUploadUI() {
        const n = uploadedItems.length;
        uploadCountEl.textContent = `${n} / ${MAX_IMAGES} images`;
        uploadCountEl.classList.toggle("hidden", n === 0);
        startBtn.disabled = n < MIN_IMAGES;
    }

    function addImages(files) {
        const slots = MAX_IMAGES - uploadedItems.length;
        if (slots <= 0) return;
        Array.from(files)
            .filter(f => f.type.startsWith("image/"))
            .slice(0, slots)
            .forEach(file => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const item = { src: e.target.result };
                    uploadedItems.push(item);
                    renderThumb(item, uploadedItems.length - 1);
                    updateUploadUI();
                };
                reader.readAsDataURL(file);
            });
    }

    function renderThumb(item, index) {
        const thumb = document.createElement("div");
        thumb.classList.add("preview-thumb");
        const img = document.createElement("img");
        img.src = item.src;
        const btn = document.createElement("button");
        btn.classList.add("preview-remove-btn");
        btn.innerHTML = '<i class="uil uil-times"></i>';
        btn.addEventListener("click", () => {
            uploadedItems.splice(index, 1);
            previewGrid.innerHTML = "";
            uploadedItems.forEach((it, i) => renderThumb(it, i));
            updateUploadUI();
        });
        thumb.appendChild(img);
        thumb.appendChild(btn);
        previewGrid.appendChild(thumb);
    }

    uploadArea.addEventListener("click",    (e) => { if (e.target !== fileInput) fileInput.click(); });
    fileInput.addEventListener("change",    ()  => { addImages(fileInput.files); fileInput.value = ""; });
    uploadArea.addEventListener("dragover", (e) => { e.preventDefault(); uploadArea.classList.add("drag-over"); });
    uploadArea.addEventListener("dragleave",(e) => { if (!uploadArea.contains(e.relatedTarget)) uploadArea.classList.remove("drag-over"); });
    uploadArea.addEventListener("drop",     (e) => { e.preventDefault(); uploadArea.classList.remove("drag-over"); addImages(e.dataTransfer.files); });

    startBtn.addEventListener("click", () => {
        tournament = new Tournament(uploadedItems);
        uploadPhase.classList.add("hidden");
        matchPhase.classList.remove("hidden");
        downloadBtn.disabled = false;
        clearBtn.disabled    = false;
        updateBracket();
        showCurrentMatch();
    });

    // --- Match UI ---
    function showCurrentMatch() {
        const match = tournament.currentMatch;
        if (!match) { showDone(); return; }

        const r            = match.round;
        const numRounds    = tournament.rounds.length;
        const roundMatches = tournament.rounds[r].filter(m => m.itemA && m.itemB);
        const doneInRound  = roundMatches.filter(m => m.winner).length;
        const totalInRound = roundMatches.length;

        roundLabel.textContent = r === numRounds - 1 ? "Final"
            : r === numRounds - 2 ? "Semi-Final"
            : `Round ${r + 1} of ${numRounds}`;

        matchLabel.textContent = totalInRound > 1
            ? `Match ${doneInRound + 1} of ${totalInRound}` : "";

        imgA.src = match.itemA.src;
        imgB.src = match.itemB.src;
    }

    function pickAndAdvance(side) {
        const match = tournament.currentMatch;
        if (!match) return;
        const winner = side === "A" ? match.itemA : match.itemB;
        const el = side === "A" ? sideA : sideB;
        el.classList.add("winner-flash");
        setTimeout(() => {
            el.classList.remove("winner-flash");
            tournament.pickWinner(match.id, winner);
            updateBracket();
            showCurrentMatch();
        }, 150);
    }

    sideA.addEventListener("click", () => pickAndAdvance("A"));
    sideB.addEventListener("click", () => pickAndAdvance("B"));

    // --- Bracket ---
    function updateBracket() {
        renderBracket(tournament, bracketView, tournament.currentMatchId);
    }

    // --- Done state ---
    function showDone() {
        vsUi.classList.add("hidden");
        doneBanner.classList.remove("hidden");
        updateBracket();
    }

    // --- Reset ---
    function resetToUpload() {
        tournament = null;
        uploadedItems = [];
        previewGrid.innerHTML = "";
        bracketView.innerHTML = "";
        updateUploadUI();
        vsUi.classList.remove("hidden");
        doneBanner.classList.add("hidden");
        matchPhase.classList.add("hidden");
        uploadPhase.classList.remove("hidden");
        downloadBtn.disabled = true;
        clearBtn.disabled    = true;
    }

    newBracketBtn.addEventListener("click", () => resetToUpload());

    clearBtn.addEventListener("click", () => {
        const msg = tournament && tournament.currentMatchId !== null
            ? "Clear the bracket? All progress will be lost."
            : "Clear the bracket?";
        if (confirm(msg)) resetToUpload();
    });

    // --- Download bracket as image ---
    downloadBtn.addEventListener("click", () => {
        const offscreen = document.createElement("div");
        offscreen.style.cssText = "position:fixed;left:-99999px;top:0;padding:20px;background:var(--bg-color);";
        document.body.appendChild(offscreen);
        renderBracket(tournament, offscreen, tournament.currentMatchId);
        const el = offscreen.firstElementChild;
        if (!el) { offscreen.remove(); return; }
        const isDark = document.body.classList.contains("dark-mode");
        html2canvas(offscreen, {
            scale: 2,
            backgroundColor: isDark ? "#121212" : "#f4f5f7",
            useCORS: true,
        }).then(canvas => {
            offscreen.remove();
            const link = document.createElement("a");
            link.download = "bracket.png";
            link.href = canvas.toDataURL("image/png");
            link.click();
        });
    });

    updateUploadUI();
});
