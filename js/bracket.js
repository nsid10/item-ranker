// --- Tournament engine ---

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
        // Pad to the next power of 2 with nulls (byes).
        const size = 1 << Math.ceil(Math.log2(Math.max(shuffled.length, 2)));
        while (shuffled.length < size) shuffled.push(null);

        this.size = size;
        this.allMatches = {};
        this.rounds = this._build(shuffled);
        this._resolveByes();
        this.currentMatchId = this._nextPending();
        this.champion = null;
    }

    _build(items) {
        const rounds = [];
        let id = 0;

        const r0 = [];
        for (let i = 0; i < items.length; i += 2) {
            const m = { id: id++, round: 0, slot: i / 2, itemA: items[i], itemB: items[i + 1], winner: null, feederA: null, feederB: null };
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
        if (!parent) {
            this.champion = winner;
            return;
        }
        if (parent.feederA === match.id) parent.itemA = winner;
        else parent.itemB = winner;
        // Auto-advance byes that cascade
        if (parent.itemA && !parent.itemB) this._win(parent, parent.itemA);
        else if (!parent.itemA && parent.itemB) this._win(parent, parent.itemB);
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
const SLOT_H   = 64; // must be > MATCH_H/2 so matches don't overlap

function matchCenterY(match, tournament) {
    const n = tournament.rounds[match.round].length;
    const slotsPerMatch = tournament.size / n;
    return (match.slot * slotsPerMatch + slotsPerMatch / 2) * SLOT_H;
}

function renderBracket(tournament, container, currentMatchId) {
    container.innerHTML = "";

    const numRounds = tournament.rounds.length;
    const totalW = numRounds * (MATCH_W + ROUND_GAP) - ROUND_GAP;
    const totalH = tournament.size * SLOT_H;

    const wrap = document.createElement("div");
    wrap.style.cssText = `position:relative;width:${totalW}px;height:${totalH}px;flex-shrink:0;`;

    // SVG for connecting lines
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", totalW);
    svg.setAttribute("height", totalH);
    svg.style.cssText = "position:absolute;inset:0;pointer-events:none;overflow:visible;";

    // Render matches as DOM elements
    tournament.rounds.forEach((round, ri) => {
        round.forEach(match => {
            const cy = matchCenterY(match, tournament);
            const top = cy - MATCH_H / 2;
            const left = ri * (MATCH_W + ROUND_GAP);

            const card = document.createElement("div");
            card.classList.add("b-match");
            if (match.id === currentMatchId) card.classList.add("b-match--current");
            if (match.winner) card.classList.add("b-match--done");
            card.style.cssText = `position:absolute;top:${top}px;left:${left}px;width:${MATCH_W}px;`;

            card.appendChild(makeEntry(match.itemA, match.winner === match.itemA && match.winner != null));
            card.appendChild(makeEntry(match.itemB, match.winner === match.itemB && match.winner != null));
            wrap.appendChild(card);

            // Draw connector from this match to its parent
            if (ri < numRounds - 1) {
                const parent = Object.values(tournament.allMatches)
                    .find(m => m.feederA === match.id || m.feederB === match.id);
                if (parent) {
                    const parentCY = matchCenterY(parent, tournament);
                    const x1 = left + MATCH_W;
                    const xMid = x1 + ROUND_GAP / 2;
                    const x2 = (ri + 1) * (MATCH_W + ROUND_GAP);
                    const color = match.winner ? "var(--drag-over-outline-color)" : "var(--button-border-color)";
                    drawConnector(svg, x1, cy, xMid, cy, xMid, parentCY, x2, parentCY, color);
                }
            }
        });
    });

    wrap.appendChild(svg);
    container.appendChild(wrap);
}

function makeEntry(item, isWinner) {
    const el = document.createElement("div");
    el.classList.add("b-entry");
    if (isWinner) el.classList.add("b-entry--winner");
    if (!item) { el.classList.add("b-entry--bye"); el.textContent = "bye"; return el; }
    const img = document.createElement("img");
    img.src = item.src;
    img.draggable = false;
    el.appendChild(img);
    return el;
}

function drawConnector(svg, x1, y1, xMid, yMid1, xMid2, yMid2, x2, y2, color) {
    // Draws: right from match → mid column → vertical → to parent
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const d = `M${x1},${y1} H${xMid} V${y2} H${x2}`;
    path.setAttribute("d", d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", color);
    path.setAttribute("stroke-width", "2");
    svg.appendChild(path);
}

// --- Page logic ---

document.addEventListener("DOMContentLoaded", () => {
    const MAX_IMAGES = 64;
    let uploadedItems = [];
    let tournament = null;

    // DOM references
    const uploadPhase      = document.getElementById("upload-phase");
    const matchPhase       = document.getElementById("match-phase");
    const championSection  = document.getElementById("champion-section");
    const uploadArea       = document.getElementById("upload-area");
    const fileInput        = document.getElementById("file-input");
    const previewGrid      = document.getElementById("preview-grid");
    const uploadCountEl    = document.getElementById("upload-count");
    const startBtn         = document.getElementById("start-btn");

    const roundLabel       = document.getElementById("round-label");
    const matchLabel       = document.getElementById("match-label");
    const imgA             = document.getElementById("img-a");
    const imgB             = document.getElementById("img-b");
    const sideA            = document.getElementById("side-a");
    const sideB            = document.getElementById("side-b");
    const viewBracketBtn   = document.getElementById("view-bracket-btn");

    const championImg      = document.getElementById("champion-img");
    const viewFinalBtn     = document.getElementById("view-final-bracket-btn");
    const newTournamentBtn = document.getElementById("new-tournament-btn");

    const bracketModal     = document.getElementById("bracket-modal");
    const closeBracketBtn  = document.getElementById("close-bracket-btn");
    const bracketView      = document.getElementById("bracket-view");
    const bracketFooter    = document.getElementById("bracket-modal-footer");
    const resumeBtn        = document.getElementById("resume-btn");

    // --- Upload ---
    function updateUploadUI() {
        const n = uploadedItems.length;
        uploadCountEl.textContent = `${n} / ${MAX_IMAGES} images`;
        uploadCountEl.classList.toggle("hidden", n === 0);
        startBtn.disabled = n < 2;
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

    uploadArea.addEventListener("click", (e) => { if (e.target !== fileInput) fileInput.click(); });
    fileInput.addEventListener("change", () => { addImages(fileInput.files); fileInput.value = ""; });
    uploadArea.addEventListener("dragover", (e) => { e.preventDefault(); uploadArea.classList.add("drag-over"); });
    uploadArea.addEventListener("dragleave", (e) => { if (!uploadArea.contains(e.relatedTarget)) uploadArea.classList.remove("drag-over"); });
    uploadArea.addEventListener("drop", (e) => { e.preventDefault(); uploadArea.classList.remove("drag-over"); addImages(e.dataTransfer.files); });

    startBtn.addEventListener("click", () => {
        tournament = new Tournament(uploadedItems);
        uploadPhase.classList.add("hidden");
        matchPhase.classList.remove("hidden");
        showCurrentMatch();
    });

    // --- Match UI ---
    function showCurrentMatch() {
        const match = tournament.currentMatch;
        if (!match) { showChampion(); return; }

        const r          = match.round;
        const numRounds  = tournament.rounds.length;
        const roundMatches = tournament.rounds[r].filter(m => m.itemA && m.itemB);
        const doneInRound  = roundMatches.filter(m => m.winner).length;
        const totalInRound = roundMatches.length;

        if (r === numRounds - 1) {
            roundLabel.textContent = "Final";
        } else if (r === numRounds - 2) {
            roundLabel.textContent = "Semi-Final";
        } else {
            roundLabel.textContent = `Round ${r + 1} of ${numRounds}`;
        }

        matchLabel.textContent = totalInRound > 1
            ? `Match ${doneInRound + 1} of ${totalInRound}`
            : "";

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
            showCurrentMatch();
        }, 150);
    }

    sideA.addEventListener("click", () => pickAndAdvance("A"));
    sideB.addEventListener("click", () => pickAndAdvance("B"));

    // --- Champion ---
    function showChampion() {
        matchPhase.classList.add("hidden");
        championSection.classList.remove("hidden");
        if (tournament.champion) championImg.src = tournament.champion.src;
    }

    newTournamentBtn.addEventListener("click", () => {
        tournament = null;
        uploadedItems = [];
        previewGrid.innerHTML = "";
        uploadCountEl.classList.add("hidden");
        startBtn.disabled = true;
        championSection.classList.add("hidden");
        uploadPhase.classList.remove("hidden");
    });

    // --- Bracket modal ---
    function openBracket(showResume) {
        renderBracket(tournament, bracketView, tournament.currentMatchId);
        bracketFooter.classList.toggle("hidden", !showResume);
        bracketModal.classList.remove("hidden");
    }

    viewBracketBtn.addEventListener("click",    () => openBracket(true));
    viewFinalBtn.addEventListener("click",      () => openBracket(false));
    closeBracketBtn.addEventListener("click",   () => bracketModal.classList.add("hidden"));
    resumeBtn.addEventListener("click",         () => bracketModal.classList.add("hidden"));
    bracketModal.addEventListener("click", (e) => { if (e.target === bracketModal) bracketModal.classList.add("hidden"); });

    updateUploadUI();
});
