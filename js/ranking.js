document.addEventListener("DOMContentLoaded", () => {
    // --- DOM Elements ---
    const fileInput = document.getElementById("file-input");
    const uploadArea = document.getElementById("upload-area");
    const uploadCount = document.getElementById("upload-count");
    const previewGrid = document.getElementById("preview-grid");
    const startBtn = document.getElementById("start-ranking-btn");

    const uploadPhase = document.getElementById("upload-phase");
    const rankingPhase = document.getElementById("ranking-phase");

    const imgA = document.getElementById("img-a");
    const imgB = document.getElementById("img-b");
    const sideA = document.getElementById("side-a");
    const sideB = document.getElementById("side-b");
    const matchNum = document.getElementById("match-num");
    const matchEst = document.getElementById("match-est");

    // --- Upload ---
    const MAX_IMAGES = 100;
    let uploadedImages = []; // array of base64 src strings

    function updateUploadUI() {
        const n = uploadedImages.length;
        uploadCount.textContent = `${n} / ${MAX_IMAGES} images`;
        uploadCount.classList.toggle("hidden", n === 0);
        startBtn.disabled = n < 2;
    }

    function addImages(files) {
        const slots = MAX_IMAGES - uploadedImages.length;
        if (slots <= 0) return;
        Array.from(files)
            .filter(f => f.type.startsWith("image/"))
            .slice(0, slots)
            .forEach(file => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    uploadedImages.push(e.target.result);
                    renderThumb(e.target.result, uploadedImages.length - 1);
                    updateUploadUI();
                };
                reader.readAsDataURL(file);
            });
    }

    function renderThumb(src, index) {
        const thumb = document.createElement("div");
        thumb.classList.add("preview-thumb");

        const img = document.createElement("img");
        img.src = src;

        const btn = document.createElement("button");
        btn.classList.add("preview-remove-btn");
        btn.innerHTML = `<i class="uil uil-times"></i>`;
        btn.title = "Remove";
        btn.addEventListener("click", () => {
            uploadedImages.splice(index, 1);
            previewGrid.innerHTML = "";
            uploadedImages.forEach((s, i) => renderThumb(s, i));
            updateUploadUI();
        });

        thumb.appendChild(img);
        thumb.appendChild(btn);
        previewGrid.appendChild(thumb);
    }

    uploadArea.addEventListener("click", (e) => {
        if (e.target !== fileInput) fileInput.click();
    });
    fileInput.addEventListener("change", () => {
        addImages(fileInput.files);
        fileInput.value = "";
    });
    uploadArea.addEventListener("dragover", (e) => {
        e.preventDefault();
        uploadArea.classList.add("drag-over");
    });
    uploadArea.addEventListener("dragleave", (e) => {
        if (!uploadArea.contains(e.relatedTarget)) uploadArea.classList.remove("drag-over");
    });
    uploadArea.addEventListener("drop", (e) => {
        e.preventDefault();
        uploadArea.classList.remove("drag-over");
        addImages(e.dataTransfer.files);
    });

    // --- Ranking Engine (Merge Sort) ---
    // Produces a full ordering in O(n log n) comparisons.
    // Each merge compares the "current best" from two already-sorted sublists;
    // the winner goes first (rank 1 = best). When one list is exhausted the
    // remainder of the other is appended without further comparisons.

    function shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    class MergeSortRanker {
        constructor(items) {
            this.items = shuffle([...items]);
            this.queue = this.items.map((_, i) => [i]);
            this.currentMerge = null;
            this.matchCount = 0;
            this.estimatedTotal = items.length <= 1
                ? 0
                : Math.ceil(items.length * Math.log2(items.length));
        }

        start() {
            return this._startNextMerge();
        }

        pickWinner(side) {
            this.matchCount++;
            const m = this.currentMerge;
            if (side === "A") {
                m.merged.push(m.listA[m.iA++]);
            } else {
                m.merged.push(m.listB[m.iB++]);
            }
            return this._step();
        }

        _startNextMerge() {
            if (this.queue.length <= 1) {
                const result = (this.queue[0] || []).map(i => this.items[i]);
                return { type: "done", result };
            }
            const listA = this.queue.shift();
            const listB = this.queue.shift();
            this.currentMerge = { listA, listB, iA: 0, iB: 0, merged: [] };
            return this._step();
        }

        _step() {
            const m = this.currentMerge;
            if (m.iA >= m.listA.length) {
                m.merged.push(...m.listB.slice(m.iB));
                return this._finishMerge();
            }
            if (m.iB >= m.listB.length) {
                m.merged.push(...m.listA.slice(m.iA));
                return this._finishMerge();
            }
            return {
                type: "comparison",
                itemA: this.items[m.listA[m.iA]],
                itemB: this.items[m.listB[m.iB]],
            };
        }

        _finishMerge() {
            this.queue.push(this.currentMerge.merged);
            this.currentMerge = null;
            return this._startNextMerge();
        }
    }

    // --- Match UI ---
    let ranker = null;

    async function applyStep(step) {
        if (step.type === "done") {
            // Store via IndexedDB — no size limit, unlike localStorage
            await State.largeSet("rankingResult", step.result);
            window.location.href = "../index.html";
            return;
        }
        imgA.src = step.itemA;
        imgB.src = step.itemB;
        matchNum.textContent = ranker.matchCount + 1;
        matchEst.textContent = ranker.estimatedTotal;
    }

    startBtn.addEventListener("click", () => {
        uploadPhase.classList.add("hidden");
        rankingPhase.classList.remove("hidden");
        ranker = new MergeSortRanker(uploadedImages);
        matchEst.textContent = ranker.estimatedTotal;
        applyStep(ranker.start());
    });

    function pickAndAdvance(side) {
        if (!ranker) return;
        const el = side === "A" ? sideA : sideB;
        el.classList.add("winner-flash");
        setTimeout(() => {
            el.classList.remove("winner-flash");
            applyStep(ranker.pickWinner(side));
        }, 150);
    }

    sideA.addEventListener("click", () => pickAndAdvance("A"));
    sideB.addEventListener("click", () => pickAndAdvance("B"));
});
