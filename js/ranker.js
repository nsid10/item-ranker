// Two-phase tournament: 2 Swiss rounds → Merge Sort finisher.
// seededItems: [{id?, src}, ...] in seed order (best seed first).
class TournamentRanker {
    constructor(seededItems) {
        this.items = seededItems;
        this.n    = seededItems.length;

        this.scores = new Array(this.n).fill(0);
        this.order  = Array.from({ length: this.n }, (_, i) => i);

        this.phase            = "swiss";
        this.swissRound       = 0;
        this.MAX_SWISS_ROUNDS = 2;
        this.currentMatches   = [];
        this.matchIndex       = 0;
        this.matchCount       = 0;

        this.mergeQueue         = null;
        this.mergeCurrentMerge  = null;

        const swissMatches = this.MAX_SWISS_ROUNDS * Math.ceil(this.n / 2);
        const mergeMatches = this.n <= 1 ? 0 : Math.ceil(this.n * Math.log2(this.n));
        this.estimatedTotal = swissMatches + mergeMatches;
    }

    start() {
        if (this.n < 2) return { type: "done", result: this.items };
        return this._prepareSwissRound();
    }

    pickWinner(side) {
        this.matchCount++;
        return this.phase === "swiss"
            ? this._swissPickWinner(side)
            : this._mergePickWinner(side);
    }

    // Best-effort ordered result from current state (used for End Early).
    getPartialResult() {
        if (this.phase === "swiss") {
            return Array.from({ length: this.n }, (_, i) => i)
                .sort((a, b) => this.scores[b] - this.scores[a] || a - b)
                .map(i => this.items[i]);
        }
        // Merge sort: flatten what we know in order.
        const out = [];
        if (this.mergeCurrentMerge) {
            const m = this.mergeCurrentMerge;
            out.push(...m.merged, ...m.listA.slice(m.iA), ...m.listB.slice(m.iB));
        }
        for (const list of this.mergeQueue) out.push(...list);
        return out.map(i => this.items[i]);
    }

    // --- Swiss phase ---

    _sortByScore() {
        this.order.sort((a, b) => this.scores[b] - this.scores[a] || a - b);
    }

    _prepareSwissRound() {
        this._sortByScore();
        this.currentMatches = [];
        for (let i = 0; i + 1 < this.order.length; i += 2) {
            this.currentMatches.push({ a: this.order[i], b: this.order[i + 1] });
        }
        // Odd item out gets a bye (free win).
        if (this.order.length % 2 === 1) {
            this.scores[this.order[this.order.length - 1]]++;
        }
        this.matchIndex = 0;
        return this._swissNext();
    }

    _swissNext() {
        if (this.matchIndex >= this.currentMatches.length) {
            this.swissRound++;
            if (this.swissRound < this.MAX_SWISS_ROUNDS) return this._prepareSwissRound();
            this.phase = "mergesort";
            return this._startMergeSort();
        }
        const { a, b } = this.currentMatches[this.matchIndex];
        return {
            type:  "comparison",
            itemA: this.items[a],
            itemB: this.items[b],
            phase: `Swiss Round ${this.swissRound + 1} of ${this.MAX_SWISS_ROUNDS}`,
        };
    }

    _swissPickWinner(side) {
        const { a, b } = this.currentMatches[this.matchIndex];
        this.scores[side === "A" ? a : b]++;
        this.matchIndex++;
        return this._swissNext();
    }

    // --- Merge sort phase ---

    _startMergeSort() {
        this._sortByScore();
        this.mergeQueue = this.order.map(i => [i]);
        return this._startNextMerge();
    }

    _startNextMerge() {
        if (this.mergeQueue.length <= 1) {
            return { type: "done", result: (this.mergeQueue[0] || []).map(i => this.items[i]) };
        }
        const listA = this.mergeQueue.shift();
        const listB = this.mergeQueue.shift();
        this.mergeCurrentMerge = { listA, listB, iA: 0, iB: 0, merged: [] };
        return this._mergeStep();
    }

    _mergeStep() {
        const m = this.mergeCurrentMerge;
        if (m.iA >= m.listA.length) { m.merged.push(...m.listB.slice(m.iB)); return this._finishMerge(); }
        if (m.iB >= m.listB.length) { m.merged.push(...m.listA.slice(m.iA)); return this._finishMerge(); }
        return {
            type:  "comparison",
            itemA: this.items[m.listA[m.iA]],
            itemB: this.items[m.listB[m.iB]],
            phase: "Final Ranking",
        };
    }

    _finishMerge() {
        this.mergeQueue.push(this.mergeCurrentMerge.merged);
        this.mergeCurrentMerge = null;
        return this._startNextMerge();
    }

    _mergePickWinner(side) {
        const m = this.mergeCurrentMerge;
        m.merged.push(side === "A" ? m.listA[m.iA++] : m.listB[m.iB++]);
        return this._mergeStep();
    }
}

// Injects a full-screen ranking overlay and runs the tournament.
// items:  [{src, ...}] in seed order (best seed first)
// onDone: function(rankedItems) called with final or partial result
function startRankingSession(items, onDone) {
    const overlay = document.createElement("div");
    overlay.id = "ranking-overlay";
    overlay.innerHTML = `
        <div id="ranking-modal">
            <div id="ranking-phase-label"></div>
            <p id="ranking-progress"></p>
            <p id="ranking-hint">Click the better item</p>
            <div id="ranking-match">
                <div class="ranking-side" id="rank-side-a">
                    <img id="rank-img-a" draggable="false" />
                </div>
                <div id="ranking-vs">VS</div>
                <div class="ranking-side" id="rank-side-b">
                    <img id="rank-img-b" draggable="false" />
                </div>
            </div>
            <button id="ranking-end-early">End Early &amp; Use Current Rankings</button>
        </div>
    `;
    document.body.appendChild(overlay);

    const phaseLabel  = overlay.querySelector("#ranking-phase-label");
    const progressEl  = overlay.querySelector("#ranking-progress");
    const imgA        = overlay.querySelector("#rank-img-a");
    const imgB        = overlay.querySelector("#rank-img-b");
    const sideA       = overlay.querySelector("#rank-side-a");
    const sideB       = overlay.querySelector("#rank-side-b");
    const endEarlyBtn = overlay.querySelector("#ranking-end-early");

    const ranker = new TournamentRanker(items);

    function applyStep(step) {
        if (step.type === "done") {
            overlay.remove();
            onDone(step.result);
            return;
        }
        phaseLabel.textContent  = step.phase;
        progressEl.textContent  = `Match ${ranker.matchCount + 1} / ~${ranker.estimatedTotal}`;
        imgA.src = step.itemA.src;
        imgB.src = step.itemB.src;
    }

    function pickAndAdvance(side) {
        const el = side === "A" ? sideA : sideB;
        el.classList.add("ranking-winner-flash");
        setTimeout(() => {
            el.classList.remove("ranking-winner-flash");
            applyStep(ranker.pickWinner(side));
        }, 150);
    }

    sideA.addEventListener("click", () => pickAndAdvance("A"));
    sideB.addEventListener("click", () => pickAndAdvance("B"));

    endEarlyBtn.addEventListener("click", () => {
        if (confirm("End ranking early? Results will be based on matches completed so far.")) {
            overlay.remove();
            onDone(ranker.getPartialResult());
        }
    });

    applyStep(ranker.start());
}
