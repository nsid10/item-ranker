class TournamentRanker {
    constructor(seededItems) {
        this.items   = seededItems;
        this.n       = seededItems.length;
        this.wins    = new Array(this.n).fill(0);
        this.losses  = new Array(this.n).fill(0);
        this.matchCache  = new Map();   // pairKey → winner index
        this.playedPairs = new Set();

        this.seedType = seededItems[0]?.seedPosition !== undefined ? "grid"
                      : seededItems[0]?.seedTier    !== undefined ? "tier"
                      : "none";

        this.phase        = 0;
        this.currentMatch = null;
        this.matchCount   = 0;
        this.matchQueue   = [];
        this.queuePos     = 0;

        this.p2Round = 0;
        this.p3Round = 0;

        // Phase 4: bottom-up merge sort state
        this.mergeIndices    = [];
        this.mergeN          = 0;
        this.mergeWidth      = 1;
        this.mergeBlockStart = 0;
        this.mergeLeft       = [];
        this.mergeRight      = [];
        this.mergeLi         = 0;
        this.mergeRi         = 0;
        this.mergeAccum      = [];

        this.estimatedTotal = this._estimateTotal();
    }

    start() {
        if (this.n < 2) return { type: "done", result: this.items };
        this._runPhase1();
        this.phase = 2;
        return this._advance();
    }

    pickWinner(side) {
        if (this.phase === 4) return this._pickWinnerMerge(side);
        this.matchCount++;
        const { a, b } = this.currentMatch;
        const [winner, loser] = side === "A" ? [a, b] : [b, a];
        this._record(winner, loser, a, b);
        return this._advance();
    }

    getPartialResult() {
        if (this.phase === 4) {
            const mergeSet = new Set(this.mergeIndices);
            const bottom   = this._sortedIndices().filter(i => !mergeSet.has(i));
            return [...this.mergeIndices, ...bottom].map(i => this.items[i]);
        }
        return this._sortedIndices().map(i => this.items[i]);
    }

    // ── Phase 1: Auto-wins from seed ────────────────────────────────

    _runPhase1() {
        if (this.seedType === "grid") {
            for (let i = 0; i < this.n; i++)
                for (let j = i + 1; j < this.n; j++)
                    if (j - i >= 5) this._autoWin(i, j);
        } else if (this.seedType === "tier") {
            for (let i = 0; i < this.n; i++) {
                for (let j = i + 1; j < this.n; j++) {
                    const ti = this.items[i].seedTier ?? Infinity;
                    const tj = this.items[j].seedTier ?? Infinity;
                    if (tj - ti >= 2) this._autoWin(i, j);
                    else if (ti - tj >= 2) this._autoWin(j, i);
                }
            }
        }
    }

    _autoWin(winner, loser) {
        const key = this._pairKey(winner, loser);
        if (!this.playedPairs.has(key)) {
            this.wins[winner]++;
            this.losses[loser]++;
            this.matchCache.set(key, winner);
            this.playedPairs.add(key);
        }
    }

    // ── Phase 2: 4 Swiss rounds with shifting groups ─────────────────

    _buildPhase2Round() {
        this.p2Round++;
        const ranked = this._sortedIndices();
        const groups = this.seedType === "tier"
            ? this._tierGroups(this.p2Round)
            : this._gridGroups(ranked, this.p2Round);
        this.matchQueue = groups.flatMap(g => this._swissPairs(g));
        this.queuePos   = 0;
    }

    _gridGroups(ranked, round) {
        const groups = [];
        if (round <= 2) {
            // Groups of 10
            for (let i = 0; i < ranked.length; i += 10)
                groups.push(ranked.slice(i, i + 10));
        } else {
            // First group of 15, then groups of 10
            if (ranked.length > 0) groups.push(ranked.slice(0, 15));
            for (let i = 15; i < ranked.length; i += 10)
                groups.push(ranked.slice(i, i + 10));
        }
        return groups;
    }

    _tierGroups(round) {
        const tierMap = new Map();
        for (let i = 0; i < this.n; i++) {
            const t = this.items[i].seedTier ?? 999;
            if (!tierMap.has(t)) tierMap.set(t, []);
            tierMap.get(t).push(i);
        }
        const tiers  = [...tierMap.keys()].sort((a, b) => a - b);
        const groups = [];

        if (round <= 2) {
            // Pair tiers: (0+1), (2+3), …
            for (let i = 0; i < tiers.length; i += 2) {
                const g = [...(tierMap.get(tiers[i]) || [])];
                if (i + 1 < tiers.length) g.push(...(tierMap.get(tiers[i + 1]) || []));
                if (g.length > 1) groups.push(g);
            }
        } else {
            // Shifted: (0 alone), (1+2), (3+4), …
            if (tiers.length > 0) {
                const g0 = tierMap.get(tiers[0]) || [];
                if (g0.length > 1) groups.push(g0);
            }
            for (let i = 1; i < tiers.length; i += 2) {
                const g = [...(tierMap.get(tiers[i]) || [])];
                if (i + 1 < tiers.length) g.push(...(tierMap.get(tiers[i + 1]) || []));
                if (g.length > 1) groups.push(g);
            }
        }
        return groups;
    }

    // ── Phase 3: 2 Swiss rounds on bottom 60% as a single pool ──────

    _buildPhase3Round() {
        this.p3Round++;
        const ranked      = this._sortedIndices();
        const bottomStart = Math.ceil(ranked.length * 0.4);
        this.matchQueue   = this._swissPairs(ranked.slice(bottomStart));
        this.queuePos     = 0;
    }

    // ── Phase 4: Bottom-up merge sort on top 60% or top 20 ──────────

    _initPhase4() {
        const ranked       = this._sortedIndices();
        const topCount     = Math.min(this.n, Math.max(20, Math.ceil(this.n * 0.6)));
        this.mergeIndices    = ranked.slice(0, topCount);
        this.mergeN          = this.mergeIndices.length;
        this.mergeWidth      = 1;
        this.mergeBlockStart = 0;
        this._startNextMerge();
    }

    _startNextMerge() {
        const s = this.mergeBlockStart;
        const m = Math.min(s + this.mergeWidth,     this.mergeN);
        const e = Math.min(s + this.mergeWidth * 2, this.mergeN);
        this.mergeLeft  = this.mergeIndices.slice(s, m);
        this.mergeRight = this.mergeIndices.slice(m, e);
        this.mergeLi    = 0;
        this.mergeRi    = 0;
        this.mergeAccum = [];
    }

    _advanceMerge() {
        while (true) {
            // Drain cache-resolved comparisons
            while (this.mergeLi < this.mergeLeft.length && this.mergeRi < this.mergeRight.length) {
                const a   = this.mergeLeft[this.mergeLi];
                const b   = this.mergeRight[this.mergeRi];
                const key = this._pairKey(a, b);
                if (!this.matchCache.has(key)) {
                    this.currentMatch = { a, b };
                    return { type: "comparison", itemA: this.items[a], itemB: this.items[b], phase: "Final Sort" };
                }
                const winner = this.matchCache.get(key);
                if (winner === a) { this.mergeAccum.push(a); this.mergeLi++; }
                else              { this.mergeAccum.push(b); this.mergeRi++; }
            }

            // Flush remaining side
            while (this.mergeLi < this.mergeLeft.length)  this.mergeAccum.push(this.mergeLeft[this.mergeLi++]);
            while (this.mergeRi < this.mergeRight.length) this.mergeAccum.push(this.mergeRight[this.mergeRi++]);

            // Write merged block back into mergeIndices
            for (let i = 0; i < this.mergeAccum.length; i++)
                this.mergeIndices[this.mergeBlockStart + i] = this.mergeAccum[i];

            // Advance to next block
            this.mergeBlockStart += this.mergeWidth * 2;
            if (this.mergeBlockStart >= this.mergeN) {
                this.mergeWidth *= 2;
                this.mergeBlockStart = 0;
                if (this.mergeWidth >= this.mergeN) return this._finalize();
            }
            this._startNextMerge();
        }
    }

    _pickWinnerMerge(side) {
        this.matchCount++;
        const { a, b }     = this.currentMatch;
        const [winner, loser] = side === "A" ? [a, b] : [b, a];
        this._record(winner, loser, a, b);
        if (winner === a) { this.mergeAccum.push(a); this.mergeLi++; }
        else              { this.mergeAccum.push(b); this.mergeRi++; }
        return this._advanceMerge();
    }

    _finalize() {
        const mergeSet = new Set(this.mergeIndices);
        const bottom   = this._sortedIndices().filter(i => !mergeSet.has(i));
        return { type: "done", result: [...this.mergeIndices, ...bottom].map(i => this.items[i]) };
    }

    // ── Main advance loop ────────────────────────────────────────────

    _advance() {
        while (true) {
            if (this.phase === 2) {
                if (this.queuePos < this.matchQueue.length) {
                    this.currentMatch = this.matchQueue[this.queuePos++];
                    const { a, b } = this.currentMatch;
                    return { type: "comparison", itemA: this.items[a], itemB: this.items[b],
                             phase: `Swiss — Round ${this.p2Round} / 4` };
                }
                if (this.p2Round < 4) { this._buildPhase2Round(); continue; }
                if (this.n >= 21) { this.phase = 3; this._buildPhase3Round(); continue; }
                this.phase = 4;
                this._initPhase4();
                return this._advanceMerge();
            }

            if (this.phase === 3) {
                if (this.queuePos < this.matchQueue.length) {
                    this.currentMatch = this.matchQueue[this.queuePos++];
                    const { a, b } = this.currentMatch;
                    return { type: "comparison", itemA: this.items[a], itemB: this.items[b],
                             phase: `Refinement — Round ${this.p3Round} / 2` };
                }
                if (this.p3Round < 2) { this._buildPhase3Round(); continue; }
                this.phase = 4;
                this._initPhase4();
                return this._advanceMerge();
            }

            return { type: "done", result: this._sortedIndices().map(i => this.items[i]) };
        }
    }

    // ── Shared helpers ───────────────────────────────────────────────

    _record(winner, loser, a, b) {
        this.wins[winner]++;
        this.losses[loser]++;
        const key = this._pairKey(a, b);
        this.matchCache.set(key, winner);
        this.playedPairs.add(key);
    }

    _sortedIndices() {
        return Array.from({ length: this.n }, (_, i) => i)
            .sort((a, b) => this._winRate(b) - this._winRate(a) || a - b);
    }

    _winRate(i) {
        const total = this.wins[i] + this.losses[i];
        return total === 0 ? 0.5 : this.wins[i] / total;
    }

    _swissPairs(pool) {
        const sorted = [...pool].sort((a, b) => this._winRate(b) - this._winRate(a) || a - b);
        const pairs  = [];
        const used   = new Set();
        for (let i = 0; i < sorted.length; i++) {
            const a = sorted[i];
            if (used.has(a)) continue;
            for (let j = i + 1; j < sorted.length; j++) {
                const b = sorted[j];
                if (!used.has(b) && !this.playedPairs.has(this._pairKey(a, b))) {
                    pairs.push({ a, b });
                    used.add(a);
                    used.add(b);
                    break;
                }
            }
        }
        return pairs;
    }

    _pairKey(i, j) { return i < j ? `${i}|||${j}` : `${j}|||${i}`; }

    _estimateTotal() {
        const n      = this.n;
        const mergeN = Math.min(n, Math.max(20, Math.ceil(n * 0.6)));
        const p2     = Math.ceil(n * 2);
        const p3     = n >= 21 ? Math.ceil(n * 0.6) : 0;
        const p4     = Math.ceil(mergeN * Math.log2(Math.max(mergeN, 2)) * 0.5);
        return p2 + p3 + p4;
    }
}

// Shows a confirmation popup before starting a ranking session.
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
