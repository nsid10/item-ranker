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

        // Phase 2
        this.p2Round = 0;

        // Phase 3 — populated at phase-2 snapshot
        this.phase2Top12 = [];
        this.phase3Pool  = [];
        this.p3MaxRounds = 0;
        this.p3Round     = 0;

        // Phase 4: bottom-up merge sort
        this.mergeIndices    = [];
        this.mergeN          = 0;
        this.mergeWidth      = 1;
        this.mergeBlockStart = 0;
        this.mergeLeft       = [];
        this.mergeRight      = [];
        this.mergeLi         = 0;
        this.mergeRi         = 0;
        this.mergeAccum      = [];
        this.phase4Indices   = []; // final phase-4 sorted top-N; top 6 may be updated by phase 5

        // Phase 5
        this.phase5Top6 = [];

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
        if (this.phase === 5) {
            const mergeSet = new Set(this.phase4Indices);
            const bottom   = this._sortedIndices().filter(i => !mergeSet.has(i));
            return [...this.phase4Indices, ...bottom].map(i => this.items[i]);
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
            for (let i = 0; i < ranked.length; i += 10)
                groups.push(ranked.slice(i, i + 10));
        } else {
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
            for (let i = 0; i < tiers.length; i += 2) {
                const g = [...(tierMap.get(tiers[i]) || [])];
                if (i + 1 < tiers.length) g.push(...(tierMap.get(tiers[i + 1]) || []));
                if (g.length > 1) groups.push(g);
            }
        } else {
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

    // Snapshot top 12 and the phase-3 pool at the end of phase 2.
    _snapshotPhase2() {
        const ranked     = this._sortedIndices();
        this.phase2Top12 = ranked.slice(0, Math.min(12, this.n));
        this.phase3Pool  = ranked.slice(12);
        const bb         = this.phase3Pool.length;
        this.p3MaxRounds = bb >= 2 ? Math.max(1, Math.floor(Math.cbrt(bb))) : 0;
    }

    // ── Phase 3: Swiss rounds on items ranked 13+ ────────────────────

    _buildPhase3Round() {
        this.p3Round++;
        this.matchQueue = this._swissPairs(this.phase3Pool);
        this.queuePos   = 0;
    }

    // ── Phase 4: Bottom-up merge sort on top 12 + top 8 of phase-3 pool ──

    _initPhase4() {
        const phase3Sorted = [...this.phase3Pool]
            .sort((a, b) => this._winRate(b) - this._winRate(a) || a - b);
        const top8 = phase3Sorted.slice(0, Math.min(8, phase3Sorted.length));

        // Sort combined 20 by win rate so the merge sort starts mostly ordered.
        this.mergeIndices = [...this.phase2Top12, ...top8]
            .sort((a, b) => this._winRate(b) - this._winRate(a) || a - b);
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

            while (this.mergeLi < this.mergeLeft.length)  this.mergeAccum.push(this.mergeLeft[this.mergeLi++]);
            while (this.mergeRi < this.mergeRight.length) this.mergeAccum.push(this.mergeRight[this.mergeRi++]);

            for (let i = 0; i < this.mergeAccum.length; i++)
                this.mergeIndices[this.mergeBlockStart + i] = this.mergeAccum[i];

            this.mergeBlockStart += this.mergeWidth * 2;
            if (this.mergeBlockStart >= this.mergeN) {
                this.mergeWidth *= 2;
                this.mergeBlockStart = 0;
                if (this.mergeWidth >= this.mergeN) return this._finalizePhase4();
            }
            this._startNextMerge();
        }
    }

    _pickWinnerMerge(side) {
        this.matchCount++;
        const { a, b }        = this.currentMatch;
        const [winner, loser] = side === "A" ? [a, b] : [b, a];
        this._record(winner, loser, a, b);
        if (winner === a) { this.mergeAccum.push(a); this.mergeLi++; }
        else              { this.mergeAccum.push(b); this.mergeRi++; }
        return this._advanceMerge();
    }

    _finalizePhase4() {
        this.phase4Indices = [...this.mergeIndices];
        const top6         = this.phase4Indices.slice(0, Math.min(6, this.phase4Indices.length));
        this.phase5Top6    = top6;
        const pairs        = this._buildPhase5Pairs(top6);
        if (pairs.length > 0) {
            this.phase      = 5;
            this.matchQueue = pairs;
            this.queuePos   = 0;
            return this._advance();
        }
        return this._buildFinalResult();
    }

    // ── Phase 5: Tiebreak / rematch for top 6 ───────────────────────

    _buildPhase5Pairs(top6) {
        const pairs = [];
        for (let i = 0; i < top6.length; i++) {
            for (let j = i + 1; j < top6.length; j++) {
                const a = top6[i], b = top6[j];
                if (this._sameWinRate(a, b) || !this.playedPairs.has(this._pairKey(a, b)))
                    pairs.push({ a, b });
            }
        }
        return pairs;
    }

    // After all phase-5 matches: sync bottom-up merge sort on top 6.
    // Every pair has now been played, so this is fully cache-resolved.
    _completePhase5() {
        const arr = [...this.phase5Top6];
        const n   = arr.length;
        for (let width = 1; width < n; width *= 2) {
            for (let s = 0; s < n; s += width * 2) {
                const m     = Math.min(s + width, n);
                const e     = Math.min(s + width * 2, n);
                const left  = arr.slice(s, m);
                const right = arr.slice(m, e);
                let li = 0, ri = 0, acc = [];
                while (li < left.length && ri < right.length) {
                    const a      = left[li], b = right[ri];
                    const winner = this.matchCache.get(this._pairKey(a, b));
                    // Uncached is theoretically impossible here; preserve existing order if so.
                    if (winner === a || winner === undefined) { acc.push(a); li++; }
                    else { acc.push(b); ri++; }
                }
                while (li < left.length)  acc.push(left[li++]);
                while (ri < right.length) acc.push(right[ri++]);
                for (let i = 0; i < acc.length; i++) arr[s + i] = acc[i];
            }
        }
        for (let i = 0; i < arr.length; i++) this.phase4Indices[i] = arr[i];
        return this._buildFinalResult();
    }

    _buildFinalResult() {
        const mergeSet = new Set(this.phase4Indices);
        const bottom   = this._sortedIndices().filter(i => !mergeSet.has(i));
        return { type: "done", result: [...this.phase4Indices, ...bottom].map(i => this.items[i]) };
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
                this._snapshotPhase2();
                if (this.phase3Pool.length >= 2) { this.phase = 3; this._buildPhase3Round(); continue; }
                this.phase = 4;
                this._initPhase4();
                return this._advanceMerge();
            }

            if (this.phase === 3) {
                if (this.queuePos < this.matchQueue.length) {
                    this.currentMatch = this.matchQueue[this.queuePos++];
                    const { a, b } = this.currentMatch;
                    return { type: "comparison", itemA: this.items[a], itemB: this.items[b],
                             phase: `Refinement — Round ${this.p3Round} / ${this.p3MaxRounds}` };
                }
                if (this.p3Round < this.p3MaxRounds) { this._buildPhase3Round(); continue; }
                this.phase = 4;
                this._initPhase4();
                return this._advanceMerge();
            }

            if (this.phase === 5) {
                if (this.queuePos < this.matchQueue.length) {
                    this.currentMatch = this.matchQueue[this.queuePos++];
                    const { a, b } = this.currentMatch;
                    return { type: "comparison", itemA: this.items[a], itemB: this.items[b],
                             phase: "Top 6 Tiebreak" };
                }
                return this._completePhase5();
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

    _sameWinRate(i, j) {
        const wi = this.wins[i], li = this.losses[i];
        const wj = this.wins[j], lj = this.losses[j];
        const ti = wi + li, tj = wj + lj;
        if (ti === 0 && tj === 0) return true;
        if (ti === 0 || tj === 0) return false;
        return wi * tj === wj * ti;
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
        const n  = this.n;
        const bb = Math.max(0, n - 12);
        const p2 = Math.ceil(n * 2);
        const p3 = bb >= 2 ? Math.ceil(Math.max(1, Math.floor(Math.cbrt(bb))) * bb / 2) : 0;
        const p4 = Math.ceil(20 * Math.log2(20) * 0.5);
        const p5 = 15;
        return p2 + p3 + p4 + p5;
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
