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
    // Seed order (original position) is always used as the tiebreaker, so
    // ending immediately returns the original seed order unchanged.
    getPartialResult() {
        if (this.phase === "swiss") {
            // Sort by wins desc; ties broken by original seed position (lower = better).
            return Array.from({ length: this.n }, (_, i) => i)
                .sort((a, b) => this.scores[b] - this.scores[a] || a - b)
                .map(i => this.items[i]);
        }
        // Merge sort: flatten what we know in order.
        // Each sublist in the queue is internally sorted; seed-order tiebreaking was
        // applied when building the initial queue from Swiss results.
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

// Shows a confirmation popup before starting a ranking session.
// itemCount: number of items to be ranked
// onConfirm: called when the user clicks Start
function showRankingConfirm(itemCount, onConfirm) {
    const overlay = document.createElement("div");
    overlay.id = "rank-confirm-overlay";
    overlay.innerHTML = `
        <div id="rank-confirm-modal">
            <h2>Start Ranking</h2>
            <p>Run a head-to-head tournament to rank all ${itemCount} items.<br>
               You can end early at any time and keep the results up to that point.</p>
            <div id="rank-confirm-buttons">
                <button id="rank-confirm-cancel">Cancel</button>
                <button id="rank-confirm-start">Start</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector("#rank-confirm-cancel").addEventListener("click", () => overlay.remove());
    overlay.querySelector("#rank-confirm-start").addEventListener("click", () => {
        overlay.remove();
        onConfirm();
    });
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
}
