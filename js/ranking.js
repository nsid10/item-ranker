document.addEventListener("DOMContentLoaded", async () => {
    const seeds = await State.largeGet("rankingSeeds").catch(() => null);
    if (!seeds || seeds.length < 2) {
        window.location.href = "../index.html";
        return;
    }
    await State.largeRemove("rankingSeeds");

    const phaseEl          = document.getElementById("match-phase");
    const matchNum         = document.getElementById("match-num");
    const matchEst         = document.getElementById("match-est");
    const imgA             = document.getElementById("img-a");
    const imgB             = document.getElementById("img-b");
    const sideA            = document.getElementById("side-a");
    const sideB            = document.getElementById("side-b");
    const endEarlyBtn      = document.getElementById("end-early-btn");
    const confidenceUpper  = document.getElementById("confidence-upper-fill");
    const confidenceLower  = document.getElementById("confidence-lower-fill");
    const confidenceLabel  = document.getElementById("confidence-label");

    const ranker = new TournamentRanker(seeds);

    async function finish(ranked) {
        await State.largeSet("rankingResult", ranked.map(item => item.src));
        window.location.href = "../index.html";
    }

    // Compute a confidence interval over the current Elo ranking.
    // For each adjacent pair (rank i, rank i+1), compute p = P(higher-rated wins).
    // p ∈ [0.5, 1.0]; normalise to [0, 1] so bars start empty and fill as ratings diverge.
    // Lower bound = min normalised p  (confidence in the weakest adjacent pairing).
    // Upper bound = mean normalised p (average confidence across all adjacent pairings).
    function computeConfidence() {
        const n = ranker.n;
        if (n < 2) return { lower: 100, upper: 100 };

        const sorted = Array.from({ length: n }, (_, i) => i)
            .sort((a, b) => ranker.ratings[b] - ranker.ratings[a]);

        let sum = 0, min = Infinity;
        for (let i = 0; i < sorted.length - 1; i++) {
            const rHi = ranker.ratings[sorted[i]];
            const rLo = ranker.ratings[sorted[i + 1]];
            // p ∈ [0.5, 1]; normalised to [0, 1]
            const p = (1 / (1 + Math.pow(10, (rLo - rHi) / 400)) - 0.5) * 2;
            sum += p;
            if (p < min) min = p;
        }

        const upper = Math.round((sum / (sorted.length - 1)) * 100);
        const lower = Math.round(min * 100);
        return { lower: Math.max(0, lower), upper: Math.max(0, upper) };
    }

    function updateConfidence() {
        const { lower, upper } = computeConfidence();
        confidenceLower.style.width = lower + "%";
        confidenceUpper.style.width = upper + "%";
        confidenceLabel.textContent = `Confidence: ${lower}% – ${upper}%`;
    }

    function applyStep(step) {
        if (step.type === "done") { finish(step.result); return; }
        phaseEl.textContent  = step.phase;
        matchNum.textContent = ranker.matchCount + 1;
        matchEst.textContent = ranker.estimatedTotal;
        imgA.src = step.itemA.src;
        imgB.src = step.itemB.src;
        updateConfidence();
    }

    function pickAndAdvance(side) {
        const el = side === "A" ? sideA : sideB;
        el.classList.add("winner-flash");
        setTimeout(() => {
            el.classList.remove("winner-flash");
            applyStep(ranker.pickWinner(side));
        }, 150);
    }

    sideA.addEventListener("click", () => pickAndAdvance("A"));
    sideB.addEventListener("click", () => pickAndAdvance("B"));

    endEarlyBtn.addEventListener("click", () => {
        if (confirm("End ranking early? Results will be based on matches completed so far.")) {
            finish(ranker.getPartialResult());
        }
    });

    applyStep(ranker.start());
});
