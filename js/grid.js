document.addEventListener("DOMContentLoaded", async () => {
    // --- DOM ---
    const gridContainer = document.getElementById("grid-container");
    const unrankedPool  = document.getElementById("unranked-pool");
    const uploadArea    = document.getElementById("grid-upload-area");
    const fileInput     = document.getElementById("grid-file-input");
    const downloadBtn   = document.getElementById("download-btn");
    const clearAllBtn   = document.getElementById("clear-all-btn");
    const addRowBtn     = document.getElementById("add-row-btn");
    const removeRowBtn  = document.getElementById("remove-row-btn");
    const rankBtn       = document.getElementById("rank-btn");

    // --- Constants ---
    const COLS     = 10;
    const MIN_ROWS = 1;
    const MAX_ROWS = 10;

    // --- State ---
    let numRows    = 1;
    let totalCells = COLS;
    let gridState  = Array(totalCells).fill(null); // {id, src} | null
    let unranked   = []; // {id, src}[]
    let itemIdCounter = 1;
    let dragging   = null; // { item: {id, src}, fromCell: number | null }

    function makeItem(src, name = "") { return { id: itemIdCounter++, src, name }; }

    // --- Upload ---
    function addImages(files) {
        Array.from(files)
            .filter(f => f.type.startsWith("image/"))
            .forEach(file => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    unranked.push(makeItem(e.target.result, file.name));
                    renderUnranked();
                };
                reader.readAsDataURL(file);
            });
    }

    uploadArea.addEventListener("click", (e) => { if (e.target !== fileInput) fileInput.click(); });
    fileInput.addEventListener("change", () => { addImages(fileInput.files); fileInput.value = ""; });
    uploadArea.addEventListener("dragover",  (e) => { e.preventDefault(); uploadArea.classList.add("drag-over"); });
    uploadArea.addEventListener("dragleave", (e) => { if (!uploadArea.contains(e.relatedTarget)) uploadArea.classList.remove("drag-over"); });
    uploadArea.addEventListener("drop", (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadArea.classList.remove("drag-over");
        if (e.dataTransfer.files.length > 0) addImages(e.dataTransfer.files);
    });

    // --- Build a grid item element ---
    function buildGridItem(item, cellIndex) {
        const wrapper = document.createElement("div");
        wrapper.classList.add("grid-item");
        wrapper.draggable = true;

        const img = document.createElement("img");
        img.src = item.src;

        const removeBtn = document.createElement("button");
        removeBtn.classList.add("remove-btn");
        removeBtn.innerHTML = '<i class="uil uil-times"></i>';
        removeBtn.title = "Remove Image";
        removeBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            gridState[cellIndex] = null;
            unranked.push(item);
            renderGrid();
            renderUnranked();
        });

        wrapper.appendChild(img);
        wrapper.appendChild(removeBtn);

        wrapper.addEventListener("dragstart", () => {
            dragging = { item, fromCell: cellIndex };
            setTimeout(() => wrapper.classList.add("dragging"), 0);
        });
        wrapper.addEventListener("dragend", () => {
            wrapper.classList.remove("dragging");
            dragging = null;
        });

        return wrapper;
    }

    // --- Build an unranked item element ---
    function buildUnrankedItem(item) {
        const wrapper = document.createElement("div");
        wrapper.classList.add("unranked-item");
        wrapper.draggable = true;

        const img = document.createElement("img");
        img.src = item.src;

        const removeBtn = document.createElement("button");
        removeBtn.classList.add("item-remove-btn");
        removeBtn.innerHTML = '<i class="uil uil-times"></i>';
        removeBtn.title = "Remove";
        removeBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            unranked = unranked.filter(u => u.id !== item.id);
            renderUnranked();
        });

        wrapper.appendChild(img);
        wrapper.appendChild(removeBtn);

        wrapper.addEventListener("dragstart", () => {
            dragging = { item, fromCell: null };
            setTimeout(() => wrapper.classList.add("dragging"), 0);
        });
        wrapper.addEventListener("dragend", () => {
            wrapper.classList.remove("dragging");
            dragging = null;
        });

        return wrapper;
    }

    // --- Place a dragged item into a grid cell ---
    function placeItemInCell(item, fromCell, targetIndex) {
        if (fromCell === targetIndex) return;

        const targetItem = gridState[targetIndex];

        if (fromCell !== null) {
            gridState[fromCell] = null;
        } else {
            unranked = unranked.filter(u => u.id !== item.id);
        }

        let compact = gridState.filter(Boolean);

        if (targetItem !== null) {
            const idx = compact.findIndex(i => i.id === targetItem.id);
            compact.splice(idx !== -1 ? idx : compact.length, 0, item);
        } else {
            compact.push(item);
        }

        expandRowsIfNeeded(compact.length);

        gridState = Array(totalCells).fill(null);
        compact.slice(0, totalCells).forEach((it, i) => { gridState[i] = it; });

        renderGrid();
        renderUnranked();
        updateRowButtons();
    }

    // --- Expand grid rows to fit count items ---
    function expandRowsIfNeeded(count) {
        while (count > totalCells && numRows < MAX_ROWS) {
            numRows++;
            totalCells = numRows * COLS;
            gridState.push(...Array(COLS).fill(null));
            for (let i = totalCells - COLS; i < totalCells; i++) {
                gridContainer.appendChild(createCell(i));
            }
        }
    }

    // --- Drop a file directly into a grid cell ---
    function dropFileInCell(file, targetIndex) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const item = makeItem(e.target.result, file.name);
            const targetItem = gridState[targetIndex];
            let compact = gridState.filter(Boolean);
            if (targetItem) {
                const idx = compact.findIndex(i => i.id === targetItem.id);
                compact.splice(idx !== -1 ? idx : compact.length, 0, item);
            } else {
                compact.push(item);
            }
            expandRowsIfNeeded(compact.length);
            gridState = Array(totalCells).fill(null);
            compact.slice(0, totalCells).forEach((it, i) => { gridState[i] = it; });
            renderGrid();
            updateRowButtons();
        };
        reader.readAsDataURL(file);
    }

    // --- Create a persistent grid cell element ---
    function createCell(index) {
        const cell = document.createElement("div");
        cell.classList.add("grid-cell");

        const numberSpan = document.createElement("span");
        numberSpan.classList.add("cell-number");
        numberSpan.textContent = index + 1;
        cell.appendChild(numberSpan);

        cell.addEventListener("dragover", (e) => { e.preventDefault(); e.stopPropagation(); });
        cell.addEventListener("dragenter", (e) => {
            e.preventDefault();
            if (dragging || e.dataTransfer.types.includes("Files")) cell.classList.add("drag-over");
        });
        cell.addEventListener("dragleave", (e) => {
            if (!cell.contains(e.relatedTarget)) cell.classList.remove("drag-over");
        });
        cell.addEventListener("drop", (e) => {
            e.preventDefault();
            e.stopPropagation();
            cell.classList.remove("drag-over");
            const targetIndex = Array.from(gridContainer.children).indexOf(cell);
            if (e.dataTransfer.files.length > 0) {
                const file = e.dataTransfer.files[0];
                if (file.type.startsWith("image/")) dropFileInCell(file, targetIndex);
            } else if (dragging) {
                placeItemInCell(dragging.item, dragging.fromCell, targetIndex);
            }
        });

        return cell;
    }

    // --- Render grid ---
    function renderGrid() {
        const cells = Array.from(gridContainer.children);
        gridState.forEach((item, index) => {
            const cell = cells[index];
            cell.innerHTML = "";
            const numberSpan = document.createElement("span");
            numberSpan.classList.add("cell-number");
            numberSpan.textContent = index + 1;
            cell.appendChild(numberSpan);
            if (item) cell.appendChild(buildGridItem(item, index));
        });
    }

    // --- Render unranked pool ---
    function renderUnranked() {
        unrankedPool.innerHTML = "";
        unranked.forEach(item => unrankedPool.appendChild(buildUnrankedItem(item)));
    }

    // --- Unranked pool as drop target (grid items dragged here) ---
    unrankedPool.addEventListener("dragover",  (e) => { e.preventDefault(); unrankedPool.classList.add("drag-over"); });
    unrankedPool.addEventListener("dragleave", (e) => { if (!unrankedPool.contains(e.relatedTarget)) unrankedPool.classList.remove("drag-over"); });
    unrankedPool.addEventListener("drop", (e) => {
        e.preventDefault();
        unrankedPool.classList.remove("drag-over");
        if (dragging && dragging.fromCell !== null) {
            gridState[dragging.fromCell] = null;
            unranked.push(dragging.item);
            renderGrid();
            renderUnranked();
        }
    });

    // --- Row management ---
    function updateRowButtons() {
        addRowBtn.disabled    = numRows >= MAX_ROWS;
        removeRowBtn.disabled = numRows <= MIN_ROWS;
    }

    addRowBtn.addEventListener("click", () => {
        if (numRows >= MAX_ROWS) return;
        const startIndex = totalCells;
        numRows++;
        totalCells = numRows * COLS;
        gridState.push(...Array(COLS).fill(null));
        for (let i = startIndex; i < totalCells; i++) gridContainer.appendChild(createCell(i));
        updateRowButtons();
    });

    removeRowBtn.addEventListener("click", () => {
        if (numRows <= MIN_ROWS) return;
        const lastRowStart = totalCells - COLS;
        for (let i = lastRowStart; i < totalCells; i++) {
            if (gridState[i]) unranked.push(gridState[i]);
        }
        numRows--;
        totalCells = numRows * COLS;
        gridState = gridState.slice(0, totalCells);
        for (let i = 0; i < COLS; i++) gridContainer.removeChild(gridContainer.lastElementChild);
        updateRowButtons();
        renderUnranked();
    });

    // --- Clear grid (moves items to unranked) ---
    clearAllBtn.addEventListener("click", () => {
        if (confirm("Move all grid items to unranked?")) {
            gridState.forEach(item => { if (item) unranked.push(item); });
            gridState = Array(totalCells).fill(null);
            renderGrid();
            renderUnranked();
        }
    });

    // --- Download ---
    downloadBtn.addEventListener("click", () => {
        const isDarkMode = document.body.classList.contains("dark-mode");
        const cells = Array.from(gridContainer.children);
        cells.forEach((cell, index) => { if (!gridState[index]) cell.classList.add("hidden-for-export"); });
        html2canvas(gridContainer, {
            scale: 2,
            backgroundColor: isDarkMode ? "#121212" : "#f4f5f7",
            useCORS: true,
        }).then(canvas => {
            cells.forEach(cell => cell.classList.remove("hidden-for-export"));
            const link = document.createElement("a");
            link.download = "grid-preview.png";
            link.href = canvas.toDataURL("image/png");
            link.click();
        });
    });

    // --- Ranking ---
    rankBtn.addEventListener("click", () => {
        const items = gridState.filter(Boolean);
        const n = items.length;
        const seeded = items.map((item, i) => ({ ...item, startElo: 1000 + (n - 1 - i) * 20 }));
        if (seeded.length < 2) {
            alert("Add at least 2 images to the grid to start ranking.");
            return;
        }
        showRankingConfirm(seeded.length, async () => {
            await State.largeSet("rankingSeeds", seeded);
            window.location.href = "./pages/ranking.html";
        });
    });

    // --- Fallback container drop (gaps between cells) ---
    gridContainer.addEventListener("dragover", (e) => e.preventDefault());
    gridContainer.addEventListener("drop", (e) => {
        e.preventDefault();
        if (e.dataTransfer.files.length > 0) {
            addImages(e.dataTransfer.files);
            return;
        }
        if (dragging && dragging.fromCell === null) {
            const emptyIndex = gridState.indexOf(null);
            if (emptyIndex !== -1) placeItemInCell(dragging.item, null, emptyIndex);
        }
    });

    // --- Init ---
    for (let i = 0; i < totalCells; i++) gridContainer.appendChild(createCell(i));

    // --- Load ranking result ---
    try {
        const ranked = await State.largeGet("rankingResult");
        if (Array.isArray(ranked) && ranked.length > 0) {
            await State.largeRemove("rankingResult");
            expandRowsIfNeeded(ranked.length);
            gridState = Array(totalCells).fill(null);
            ranked.slice(0, totalCells).forEach((src, i) => { gridState[i] = makeItem(src); });
            renderGrid();
        }
    } catch (_) {}

    updateRowButtons();
});
