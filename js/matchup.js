document.addEventListener("DOMContentLoaded", async () => {
    const seeds = await State.largeGet("rankingSeeds").catch(() => null);
    if (!seeds || seeds.length < 2) {
        window.location.href = "../index.html";
        return;
    }
    await State.largeRemove("rankingSeeds");

    const phaseEl    = document.getElementById("match-phase");
    const matchNum   = document.getElementById("match-num");
    const matchEst   = document.getElementById("match-est");
    const imgA       = document.getElementById("img-a");
    const imgB       = document.getElementById("img-b");
    const sideA      = document.getElementById("side-a");
    const sideB      = document.getElementById("side-b");
    const endEarlyBtn = document.getElementById("end-early-btn");

    const ranker = new TournamentRanker(seeds);

    async function finish(ranked) {
        await State.largeSet("rankingResult", ranked.map(item => item.src));
        window.location.href = "../index.html";
    }

    function applyStep(step) {
        if (step.type === "done") { finish(step.result); return; }
        phaseEl.textContent  = step.phase;
        matchNum.textContent = ranker.matchCount + 1;
        matchEst.textContent = ranker.estimatedTotal;
        imgA.src = step.itemA.src;
        imgB.src = step.itemB.src;
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
