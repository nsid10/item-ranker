document.addEventListener("DOMContentLoaded", () => {
    // --- DOM Elements ---
    const tierContainer = document.getElementById("tier-container");
    const addTopBtn = document.getElementById("add-top-btn");
    const addBottomBtn = document.getElementById("add-bottom-btn");
    const unrankedPool = document.getElementById("unranked-pool");
    const fileInput = document.getElementById("file-input");
    const uploadBtn = document.getElementById("upload-btn");
    const downloadBtn = document.getElementById("download-btn");
    const clearBtn = document.getElementById("clear-btn");

    // --- Constants ---
    const MIN_TIERS = 4;
    const MAX_TIERS = 10;

    // Colors assigned by position index (top tier = index 0)
    const TIER_COLORS = [
        "#FF7F7F", // warm red
        "#FFBF7F", // orange
        "#FFDF7F", // yellow
        "#BFFF7F", // yellow-green
        "#7FFF7F", // green
        "#7FBFFF", // sky blue
        "#7F7FFF", // blue-purple
        "#BF7FFF", // purple
        "#FF7FBF", // pink
        "#BFBFBF", // gray
    ];

    // Label suggestions when adding tiers beyond the default set
    const TOP_LABELS    = ["S", "SS", "X", "EX", "Z"];
    const BOTTOM_LABELS = ["F", "G", "H", "I", "J"];

    // --- State ---
    let itemIdCounter = 1;
    let tierIdCounter = 6; // default tiers use ids 1–5

    // Each image is { id, src } so duplicates are handled safely
    function makeItem(src) { return { id: itemIdCounter++, src }; }

    let tiers = [
        { id: 1, label: "A", items: [] },
        { id: 2, label: "B", items: [] },
        { id: 3, label: "C", items: [] },
        { id: 4, label: "D", items: [] },
        { id: 5, label: "E", items: [] },
    ];
    let unranked = []; // array of items { id, src }

    // Current drag payload — set on dragstart, cleared after any drop or dragend
    let dragging = null; // { item: {id,src}, fromTierId: number|null }

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
        tiers.forEach((tier, index) => {
            tierContainer.appendChild(buildTierRow(tier, index));
        });
    }

    function buildTierRow(tier, index) {
        const row = document.createElement("div");
        row.classList.add("tier-row");

        // ── Label box ──
        const labelBox = document.createElement("div");
        labelBox.classList.add("tier-label");
        labelBox.style.backgroundColor = TIER_COLORS[index % TIER_COLORS.length];

        const labelText = document.createElement("span");
        labelText.classList.add("tier-label-text");
        labelText.contentEditable = "true";
        labelText.spellcheck = false;
        labelText.textContent = tier.label;

        // Sync label state while typing — no re-render needed
        labelText.addEventListener("input", () => {
            tier.label = labelText.textContent;
        });
        labelText.addEventListener("keydown", (e) => {
            if (e.key === "Enter") { e.preventDefault(); labelText.blur(); }
        });
        labelText.addEventListener("blur", () => {
            const clean = labelText.textContent.trim();
            if (clean) {
                tier.label = clean;
                labelText.textContent = clean;
            } else {
                labelText.textContent = tier.label || "?";
            }
        });
        // Prevent the browser from starting a drag on the editable text
        labelText.addEventListener("dragstart", (e) => e.preventDefault());

        const deleteBtn = document.createElement("button");
        deleteBtn.classList.add("tier-delete-btn");
        deleteBtn.innerHTML = '<i class="uil uil-times"></i>';
        deleteBtn.title = "Remove tier";
        deleteBtn.disabled = tiers.length <= MIN_TIERS;
        deleteBtn.addEventListener("click", () => deleteTier(tier.id));

        labelBox.appendChild(labelText);
        labelBox.appendChild(deleteBtn);

        // ── Items drop zone ──
        const itemsArea = document.createElement("div");
        itemsArea.classList.add("tier-items");

        tier.items.forEach(item => itemsArea.appendChild(buildItemEl(item, tier.id)));

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

    function buildItemEl(item, fromTierId) {
        const wrapper = document.createElement("div");
        wrapper.classList.add("tier-item");

        const img = document.createElement("img");
        img.src = item.src;
        img.draggable = true;
        img.addEventListener("dragstart", () => {
            dragging = { item, fromTierId };
            setTimeout(() => wrapper.classList.add("dragging"), 0);
        });
        img.addEventListener("dragend", () => {
            wrapper.classList.remove("dragging");
            dragging = null;
        });

        const removeBtn = document.createElement("button");
        removeBtn.classList.add("item-remove-btn");
        removeBtn.innerHTML = '<i class="uil uil-times"></i>';
        removeBtn.title = fromTierId !== null ? "Return to unranked" : "Remove";
        removeBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            removeItem(item, fromTierId);
        });

        wrapper.appendChild(img);
        wrapper.appendChild(removeBtn);
        return wrapper;
    }

    function renderUnranked() {
        unrankedPool.innerHTML = "";
        unranked.forEach(item => unrankedPool.appendChild(buildItemEl(item, null)));
    }

    function updateControls() {
        addTopBtn.disabled = tiers.length >= MAX_TIERS;
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
        if (position === "top") tiers.unshift(tier);
        else tiers.push(tier);
        render();
    }

    function deleteTier(id) {
        if (tiers.length <= MIN_TIERS) return;
        const tier = tiers.find(t => t.id === id);
        if (tier) {
            unranked.push(...tier.items); // return items to pool
            tiers = tiers.filter(t => t.id !== id);
        }
        render();
    }

    function moveItem(item, fromTierId, toTierId) {
        if (fromTierId === toTierId) { dragging = null; return; }
        // Remove from source
        if (fromTierId === null) {
            unranked = unranked.filter(i => i.id !== item.id);
        } else {
            const src = tiers.find(t => t.id === fromTierId);
            if (src) src.items = src.items.filter(i => i.id !== item.id);
        }
        // Add to target
        if (toTierId === null) {
            unranked.push(item);
        } else {
            const dst = tiers.find(t => t.id === toTierId);
            if (dst) dst.items.push(item);
        }
        dragging = null;
        render();
    }

    function removeItem(item, fromTierId) {
        if (fromTierId === null) {
            // Already in unranked — delete it entirely
            unranked = unranked.filter(i => i.id !== item.id);
            renderUnranked();
        } else {
            // Move from tier back to unranked pool
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

    // --- Upload / file reading ---

    function readFiles(files, callback) {
        Array.from(files)
            .filter(f => f.type.startsWith("image/"))
            .forEach(file => {
                const reader = new FileReader();
                reader.onload = (e) => callback(makeItem(e.target.result));
                reader.readAsDataURL(file);
            });
    }

    uploadBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => {
        readFiles(fileInput.files, item => {
            unranked.push(item);
            renderUnranked();
        });
        fileInput.value = "";
    });

    // File drop directly onto the unranked pool
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
            readFiles(e.dataTransfer.files, item => {
                unranked.push(item);
                renderUnranked();
            });
        } else if (dragging && dragging.fromTierId !== null) {
            // Drag from a tier back to unranked
            moveItem(dragging.item, dragging.fromTierId, null);
        }
    });

    // --- Tier buttons ---
    addTopBtn.addEventListener("click", () => addTier("top"));
    addBottomBtn.addEventListener("click", () => addTier("bottom"));

    // --- Download (captures only the tier rows, not the unranked pool) ---
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

    // --- Clear (move all tier items back to unranked) ---
    clearBtn.addEventListener("click", () => {
        if (confirm("Move all items back to unranked?")) {
            tiers.forEach(t => { unranked.push(...t.items); t.items = []; });
            render();
        }
    });

    // --- Init ---
    render();
});
