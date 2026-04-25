document.addEventListener("DOMContentLoaded", () => {
    // --- DOM Elements ---
    const tierContainer  = document.getElementById("tier-container");
    const addTopBtn      = document.getElementById("add-top-btn");
    const addBottomBtn   = document.getElementById("add-bottom-btn");
    const unrankedPool   = document.getElementById("unranked-pool");
    const uploadArea     = document.getElementById("upload-area");
    const fileInput      = document.getElementById("file-input");
    const downloadBtn    = document.getElementById("download-btn");
    const clearBtn       = document.getElementById("clear-btn");

    // --- Constants ---
    const MIN_TIERS = 4;
    const MAX_TIERS = 10;

    const TOP_LABELS    = ["S", "SS", "X", "EX", "Z"];
    const BOTTOM_LABELS = ["F", "G", "H", "I", "J"];

    // --- State ---
    let itemIdCounter = 1;
    let tierIdCounter = 6;
    function makeItem(src) { return { id: itemIdCounter++, src }; }

    let tiers = [
        { id: 1, label: "A", items: [] },
        { id: 2, label: "B", items: [] },
        { id: 3, label: "C", items: [] },
        { id: 4, label: "D", items: [] },
        { id: 5, label: "E", items: [] },
    ];
    let unranked = [];

    // { item: {id,src}, fromTierId: number|null }  (null = unranked pool)
    let dragging = null;

    // --- Label helpers ---
    function pickLabel(pool) {
        return pool.find(l => !tiers.some(t => t.label === l)) || "New";
    }

    // --- Rendering ---
    function render() {
        renderTiers();
        renderUnranked();
        updateControls();
    }

    function renderTiers() {
        tierContainer.innerHTML = "";
        tiers.forEach(tier => tierContainer.appendChild(buildTierRow(tier)));
    }

    function buildTierRow(tier) {
        const row = document.createElement("div");
        row.classList.add("tier-row");

        // ── Label ──
        const labelBox = document.createElement("div");
        labelBox.classList.add("tier-label");

        const labelText = document.createElement("span");
        labelText.classList.add("tier-label-text");
        labelText.contentEditable = "true";
        labelText.spellcheck = false;
        labelText.textContent = tier.label;
        labelText.addEventListener("input",   () => { tier.label = labelText.textContent; });
        labelText.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); labelText.blur(); } });
        labelText.addEventListener("blur",    () => {
            const clean = labelText.textContent.trim();
            labelText.textContent = clean || tier.label;
            if (clean) tier.label = clean;
        });
        labelText.addEventListener("dragstart", (e) => e.preventDefault());

        const deleteBtn = document.createElement("button");
        deleteBtn.classList.add("tier-delete-btn");
        deleteBtn.innerHTML = '<i class="uil uil-times"></i>';
        deleteBtn.title = "Remove tier";
        deleteBtn.disabled = tiers.length <= MIN_TIERS;
        deleteBtn.addEventListener("click", () => deleteTier(tier.id));

        labelBox.appendChild(labelText);
        labelBox.appendChild(deleteBtn);

        // ── Items area ──
        const itemsArea = document.createElement("div");
        itemsArea.classList.add("tier-items");

        tier.items.forEach(item => itemsArea.appendChild(buildItemEl(item, tier.id)));

        // Show drag-over only when hovering over empty space (items stop-prop their dragover)
        itemsArea.addEventListener("dragover", (e) => {
            e.preventDefault();
            itemsArea.classList.add("drag-over");
        });
        itemsArea.addEventListener("dragleave", (e) => {
            if (!itemsArea.contains(e.relatedTarget)) itemsArea.classList.remove("drag-over");
        });
        itemsArea.addEventListener("drop", (e) => {
            e.preventDefault();
            itemsArea.classList.remove("drag-over");
            if (e.dataTransfer.files.length > 0) {
                readFiles(e.dataTransfer.files, item => addItemToTier(item, tier.id));
            } else if (dragging) {
                moveItem(dragging.item, dragging.fromTierId, tier.id);
            }
        });

        row.appendChild(labelBox);
        row.appendChild(itemsArea);
        return row;
    }

    // Build a draggable item element.
    // The WRAPPER div is the drag source — not the img — because img has pointer-events:none.
    function buildItemEl(item, fromTierId) {
        const wrapper = document.createElement("div");
        wrapper.classList.add("tier-item");
        wrapper.draggable = true;

        // ── Drag source ──
        wrapper.addEventListener("dragstart", (e) => {
            dragging = { item, fromTierId };
            e.dataTransfer.effectAllowed = "move";
            setTimeout(() => wrapper.classList.add("dragging"), 0);
        });
        wrapper.addEventListener("dragend", () => {
            wrapper.classList.remove("dragging", "insert-before", "insert-after");
            dragging = null;
        });

        // ── Drop target: position-aware insertion ──
        wrapper.addEventListener("dragover", (e) => {
            if (!dragging || dragging.item.id === item.id) return;
            e.preventDefault();
            e.stopPropagation(); // keep the parent items-area from showing its own drag-over
            const mid = wrapper.getBoundingClientRect().left + wrapper.offsetWidth / 2;
            wrapper.classList.toggle("insert-before", e.clientX < mid);
            wrapper.classList.toggle("insert-after",  e.clientX >= mid);
        });
        wrapper.addEventListener("dragleave", (e) => {
            if (!wrapper.contains(e.relatedTarget)) {
                wrapper.classList.remove("insert-before", "insert-after");
            }
        });
        wrapper.addEventListener("drop", (e) => {
            e.preventDefault();
            e.stopPropagation();
            const before = wrapper.classList.contains("insert-before");
            wrapper.classList.remove("insert-before", "insert-after");
            if (!dragging || dragging.item.id === item.id) return;
            insertAtItem(dragging.item, dragging.fromTierId, fromTierId, item.id, before);
        });

        const img = document.createElement("img");
        img.src = item.src;

        const removeBtn = document.createElement("button");
        removeBtn.classList.add("item-remove-btn");
        removeBtn.innerHTML = '<i class="uil uil-times"></i>';
        removeBtn.title = fromTierId !== null ? "Return to unranked" : "Remove";
        removeBtn.addEventListener("click", (e) => { e.stopPropagation(); removeItem(item, fromTierId); });

        wrapper.appendChild(img);
        wrapper.appendChild(removeBtn);
        return wrapper;
    }

    function renderUnranked() {
        unrankedPool.innerHTML = "";
        unranked.forEach(item => unrankedPool.appendChild(buildItemEl(item, null)));
    }

    function updateControls() {
        addTopBtn.disabled    = tiers.length >= MAX_TIERS;
        addBottomBtn.disabled = tiers.length >= MAX_TIERS;
        document.querySelectorAll(".tier-delete-btn").forEach(btn => {
            btn.disabled = tiers.length <= MIN_TIERS;
        });
    }

    // --- State mutations ---

    function addTier(position) {
        if (tiers.length >= MAX_TIERS) return;
        const label = position === "top" ? pickLabel(TOP_LABELS) : pickLabel(BOTTOM_LABELS);
        const tier = { id: tierIdCounter++, label, items: [] };
        if (position === "top") tiers.unshift(tier); else tiers.push(tier);
        render();
    }

    function deleteTier(id) {
        if (tiers.length <= MIN_TIERS) return;
        const tier = tiers.find(t => t.id === id);
        if (tier) { unranked.push(...tier.items); tiers = tiers.filter(t => t.id !== id); }
        render();
    }

    // Move item to end of a target tier/pool
    function moveItem(item, fromTierId, toTierId) {
        if (fromTierId === toTierId) { dragging = null; return; }
        _removeFromSource(item, fromTierId);
        _addToTarget(item, toTierId);
        dragging = null;
        render();
    }

    // Insert item before/after a specific target item
    function insertAtItem(item, fromTierId, toTierId, targetItemId, insertBefore) {
        _removeFromSource(item, fromTierId);
        const arr = toTierId === null ? unranked : tiers.find(t => t.id === toTierId)?.items;
        if (arr) {
            const idx = arr.findIndex(i => i.id === targetItemId);
            arr.splice(idx === -1 ? arr.length : insertBefore ? idx : idx + 1, 0, item);
        }
        dragging = null;
        render();
    }

    function _removeFromSource(item, fromTierId) {
        if (fromTierId === null) {
            unranked = unranked.filter(i => i.id !== item.id);
        } else {
            const src = tiers.find(t => t.id === fromTierId);
            if (src) src.items = src.items.filter(i => i.id !== item.id);
        }
    }

    function _addToTarget(item, toTierId) {
        if (toTierId === null) {
            unranked.push(item);
        } else {
            const dst = tiers.find(t => t.id === toTierId);
            if (dst) dst.items.push(item);
        }
    }

    function removeItem(item, fromTierId) {
        if (fromTierId === null) {
            // In unranked → delete entirely
            unranked = unranked.filter(i => i.id !== item.id);
            renderUnranked();
        } else {
            // In tier → return to unranked
            const tier = tiers.find(t => t.id === fromTierId);
            if (tier) tier.items = tier.items.filter(i => i.id !== item.id);
            unranked.push(item);
            render();
        }
    }

    function addItemToTier(item, tierId) {
        const tier = tiers.find(t => t.id === tierId);
        if (tier) tier.items.push(item);
        render();
    }

    // --- File reading ---

    function readFiles(files, callback) {
        Array.from(files)
            .filter(f => f.type.startsWith("image/"))
            .forEach(file => {
                const reader = new FileReader();
                reader.onload = (e) => callback(makeItem(e.target.result));
                reader.readAsDataURL(file);
            });
    }

    // --- Upload area (below unranked pool) ---

    uploadArea.addEventListener("click", (e) => {
        if (e.target !== fileInput) fileInput.click();
    });
    fileInput.addEventListener("change", () => {
        readFiles(fileInput.files, item => { unranked.push(item); renderUnranked(); });
        fileInput.value = "";
    });
    uploadArea.addEventListener("dragover", (e) => {
        // Only react to actual files, not item re-ordering drags
        if (dragging) return;
        e.preventDefault();
        uploadArea.classList.add("drag-over");
    });
    uploadArea.addEventListener("dragleave", (e) => {
        if (!uploadArea.contains(e.relatedTarget)) uploadArea.classList.remove("drag-over");
    });
    uploadArea.addEventListener("drop", (e) => {
        e.preventDefault();
        uploadArea.classList.remove("drag-over");
        if (e.dataTransfer.files.length > 0) {
            readFiles(e.dataTransfer.files, item => { unranked.push(item); renderUnranked(); });
        }
    });

    // --- Unranked pool: accepts item moves from tiers + file drops ---

    unrankedPool.addEventListener("dragover", (e) => {
        e.preventDefault();
        unrankedPool.classList.add("drag-over");
    });
    unrankedPool.addEventListener("dragleave", (e) => {
        if (!unrankedPool.contains(e.relatedTarget)) unrankedPool.classList.remove("drag-over");
    });
    unrankedPool.addEventListener("drop", (e) => {
        e.preventDefault();
        unrankedPool.classList.remove("drag-over");
        if (e.dataTransfer.files.length > 0) {
            readFiles(e.dataTransfer.files, item => { unranked.push(item); renderUnranked(); });
        } else if (dragging && dragging.fromTierId !== null) {
            moveItem(dragging.item, dragging.fromTierId, null);
        }
    });

    // --- Tier buttons ---
    addTopBtn.addEventListener("click",    () => addTier("top"));
    addBottomBtn.addEventListener("click", () => addTier("bottom"));

    // --- Ranking ---
    document.getElementById("rank-btn").addEventListener("click", () => {
        // Assign starting Elo by tier position; unranked items get 950.
        const TIER_ELO = [1200, 1100, 1000, 900, 800, 700, 600, 500, 400, 300];
        const seeded = [
            ...tiers.flatMap((t, ti) =>
                t.items.map(item => ({ ...item, startElo: TIER_ELO[ti] ?? 300 }))
            ),
            ...unranked.map(item => ({ ...item, startElo: 950 })),
        ];
        if (seeded.length < 2) {
            alert("Add at least 2 images to start ranking.");
            return;
        }
        showRankingConfirm(seeded.length, async () => {
            await State.largeSet("rankingSeeds", seeded);
            window.location.href = "./ranking.html";
        });
    });

    // --- Download (tier rows only, not unranked pool) ---
    downloadBtn.addEventListener("click", () => {
        const isDarkMode = document.body.classList.contains("dark-mode");
        html2canvas(tierContainer, {
            scale: 2,
            backgroundColor: isDarkMode ? "#121212" : "#f4f5f7",
            useCORS: true,
        }).then(canvas => {
            const link = document.createElement("a");
            link.download = "tierlist.png";
            link.href = canvas.toDataURL("image/png");
            link.click();
        });
    });

    // --- Clear ---
    clearBtn.addEventListener("click", () => {
        if (confirm("Move all items back to unranked?")) {
            tiers.forEach(t => { unranked.push(...t.items); t.items = []; });
            render();
        }
    });

    // --- Init ---
    render();
});
