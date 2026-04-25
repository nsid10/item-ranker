// Elo-based ranking tournament.
//
// Seeding (startElo on each item):
//   - Grid (pre-ranked): 1000 + (N-1-i)*20  → top seed starts highest
//   - Tier list: tier 0→1200, 1→1100, 2→1000, 3→900, …; unranked→950
//   - No seed: 1000
//
// Phases:
//   1. Seeding rounds  (random shuffle pairing, seedRounds times, default 3)
//   2. Swiss rounds    (rating-sorted pairing, ceil(log₂N)+2 rounds)
//   3. Elite rounds    (top 30% only, same Swiss pairing, until no valid pairs)

class TournamentRanker {
    constructor(seededItems, seedRounds = 3) {
        this.items      = seededItems;
        this.n          = seededItems.length;
        this.seedRounds = Math.max(2, Math.min(4, seedRounds));
        this.swissTotal = Math.ceil(Math.log2(Math.max(this.n, 2))) + 2;

        // Elo ratings — use startElo if provided, else 1000
        this.ratings = seededItems.map(item =>
            item.startElo !== undefined ? item.startElo : 1000
        );

        // Dedup: every played pair stored as "min|||max" (by index)
        this.playedPairs = new Set();

        // Phase tracking
        this.phase             = "seeding"; // "seeding" | "swiss" | "elite"
        this.seedingRoundsDone = 0;
        this.swissRoundsDone   = 0;

        // Current round
        this.currentMatches = [];
        this.matchIndex     = 0;
        this.matchCount     = 0;

        // Estimate total matches (upper bound)
        const eliteSize = Math.max(4, Math.ceil(this.n * 0.3));
        const maxEliteMatches = Math.floor(eliteSize * (eliteSize - 1) / 2);
        this.estimatedTotal =
            Math.ceil((this.seedRounds + this.swissTotal) * this.n / 2) + maxEliteMatches;
    }

    start() {
        if (this.n < 2) return { type: "done", result: this.items };
        return this._advance();
    }

    pickWinner(side) {
        this.matchCount++;
        const { a, b } = this.currentMatches[this.matchIndex];
        const [winner, loser] = side === "A" ? [a, b] : [b, a];
        this._eloUpdate(winner, loser);
        this._markPlayed(a, b);
        this.matchIndex++;
        return this._advance();
    }

    // Best-effort result from current ratings; seed index breaks ties.
    getPartialResult() {
        return Array.from({ length: this.n }, (_, i) => i)
            .sort((a, b) => this.ratings[b] - this.ratings[a] || a - b)
            .map(i => this.items[i]);
    }

    // --- Internal ---

    // Keep consuming rounds until there is a match ready or the tournament ends.
    _advance() {
        while (this.matchIndex >= this.currentMatches.length) {
            const done = this._loadNextRound();
            if (done) return done;
        }
        return this._currentStep();
    }

    // Prepare the next round. Returns a done result or null.
    _loadNextRound() {
        if (this.phase === "seeding") {
            if (this.seedingRoundsDone < this.seedRounds) {
                this._buildSeedingRound();
                return null;
            }
            this.phase = "swiss";
        }

        if (this.phase === "swiss") {
            if (this.swissRoundsDone < this.swissTotal) {
                this._buildSwissRound();
                return null;
            }
            this.phase = "elite";
        }

        // Elite phase — may end the tournament
        this._buildEliteRound();
        if (this.currentMatches.length === 0) {
            return { type: "done", result: this.getPartialResult() };
        }
        return null;
    }

    _buildSeedingRound() {
        this.seedingRoundsDone++;
        const indices = this._shuffle(Array.from({ length: this.n }, (_, i) => i));
        this.currentMatches = [];
        for (let i = 0; i + 1 < indices.length; i += 2) {
            const [a, b] = [indices[i], indices[i + 1]];
            if (!this._hasPlayed(a, b)) this.currentMatches.push({ a, b });
        }
        this.matchIndex = 0;
    }

    _buildSwissRound() {
        this.swissRoundsDone++;
        this.currentMatches = this._swissPairs(
            Array.from({ length: this.n }, (_, i) => i)
        );
        this.matchIndex = 0;
    }

    _buildEliteRound() {
        const eliteSize = Math.max(4, Math.ceil(this.n * 0.3));
        const elite = Array.from({ length: this.n }, (_, i) => i)
            .sort((a, b) => this.ratings[b] - this.ratings[a])
            .slice(0, eliteSize);
        this.currentMatches = this._swissPairs(elite);
        this.matchIndex = 0;
    }

    // Rating-sorted forward-scan pairing with dedup.
    _swissPairs(pool) {
        const sorted = [...pool].sort((a, b) => this.ratings[b] - this.ratings[a]);
        const pairs  = [];
        const used   = new Set();
        for (let i = 0; i < sorted.length; i++) {
            const a = sorted[i];
            if (used.has(a)) continue;
            for (let j = i + 1; j < sorted.length; j++) {
                const b = sorted[j];
                if (!used.has(b) && !this._hasPlayed(a, b)) {
                    pairs.push({ a, b });
                    used.add(a);
                    used.add(b);
                    break;
                }
            }
        }
        return pairs;
    }

    _currentStep() {
        const { a, b } = this.currentMatches[this.matchIndex];
        let phase;
        if (this.phase === "seeding") {
            phase = `Seeding Round ${this.seedingRoundsDone} of ${this.seedRounds}`;
        } else if (this.phase === "swiss") {
            phase = `Swiss Round ${this.swissRoundsDone} of ${this.swissTotal}`;
        } else {
            phase = "Elite Refinement";
        }
        return { type: "comparison", itemA: this.items[a], itemB: this.items[b], phase };
    }

    _eloUpdate(winnerIdx, loserIdx) {
        const expected = 1 / (1 + Math.pow(10, (this.ratings[loserIdx] - this.ratings[winnerIdx]) / 400));
        const delta    = 32 * (1 - expected);
        this.ratings[winnerIdx] += delta;
        this.ratings[loserIdx]  -= delta;
    }

    _pairKey(i, j)    { return i < j ? `${i}|||${j}` : `${j}|||${i}`; }
    _hasPlayed(i, j)  { return this.playedPairs.has(this._pairKey(i, j)); }
    _markPlayed(i, j) { this.playedPairs.add(this._pairKey(i, j)); }

    _shuffle(arr) {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
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
