document.addEventListener("DOMContentLoaded", () => {
    // --- DOM Elements ---
    const gridContainer = document.getElementById("grid-container");
    const themeToggleBtn = document.getElementById("theme-toggle");
    const downloadBtn = document.getElementById("download-btn");
    const clearAllBtn = document.getElementById("clear-all-btn");
    const addRowBtn = document.getElementById("add-row-btn");
    const removeRowBtn = document.getElementById("remove-row-btn");

    // --- State & Constants ---
    const COLS = 10;
    const MIN_ROWS = 1;
    const MAX_ROWS = 10;
    let numRows = 1;
    let totalCells = numRows * COLS;
    let gridState = Array(totalCells).fill(null);
    let draggedImageSrc = null;

    // --- Theme Management ---
    function applyTheme(theme) {
        if (theme === "dark") {
            document.body.classList.add("dark-mode");
            themeToggleBtn.innerHTML = `<i class="uil uil-sun"></i>`;
        } else {
            document.body.classList.remove("dark-mode");
            themeToggleBtn.innerHTML = `<i class="uil uil-moon"></i>`;
        }
    }

    const savedTheme = localStorage.getItem("theme") || "light";
    applyTheme(savedTheme);

    themeToggleBtn.addEventListener("click", () => {
        const newTheme = document.body.classList.contains("dark-mode") ? "light" : "dark";
        localStorage.setItem("theme", newTheme);
        applyTheme(newTheme);
    });

    // --- Clear All Functionality ---
    clearAllBtn.addEventListener("click", () => {
        if (confirm("Are you sure you want to clear the entire grid?")) {
            gridState = Array(totalCells).fill(null);
            renderGrid();
        }
    });

    // --- Download Functionality ---
    downloadBtn.addEventListener("click", () => {
        const isDarkMode = document.body.classList.contains("dark-mode");
        const cells = Array.from(gridContainer.children);

        cells.forEach((cell, index) => {
            if (!gridState[index]) {
                cell.classList.add("hidden-for-export");
            }
        });

        html2canvas(gridContainer, {
            scale: 2,
            backgroundColor: isDarkMode ? "#121212" : "#f4f5f7",
            useCORS: true
        }).then(canvas => {
            cells.forEach(cell => cell.classList.remove("hidden-for-export"));

            const link = document.createElement("a");
            link.download = "grid-preview.png";
            link.href = canvas.toDataURL("image/png");
            link.click();
        });
    });

    // --- Row Management ---
    function updateRowButtons() {
        addRowBtn.disabled = numRows >= MAX_ROWS;
        removeRowBtn.disabled = numRows <= MIN_ROWS;
    }

    function createCell(index) {
        const cell = document.createElement("div");
        cell.classList.add("grid-cell");

        const cellNumber = document.createElement("span");
        cellNumber.classList.add("cell-number");
        cellNumber.textContent = index + 1;
        cell.appendChild(cellNumber);

        cell.addEventListener("dragover", (e) => e.preventDefault());
        cell.addEventListener("dragenter", (e) => {
            e.preventDefault();
            cell.classList.add("drag-over");
        });
        cell.addEventListener("dragleave", (e) => {
            if (!cell.contains(e.relatedTarget)) {
                cell.classList.remove("drag-over");
            }
        });
        cell.addEventListener("drop", (e) => {
            e.preventDefault();
            e.stopPropagation();
            cell.classList.remove("drag-over");
            const targetIndex = Array.from(gridContainer.children).indexOf(cell);

            if (e.dataTransfer.files.length > 0) {
                const file = e.dataTransfer.files[0];
                if (file.type.startsWith("image/")) {
                    const reader = new FileReader();
                    reader.onload = (event) => handleDrop(targetIndex, event.target.result);
                    reader.readAsDataURL(file);
                }
            } else if (draggedImageSrc) {
                handleDrop(targetIndex, draggedImageSrc);
            }
        });

        return cell;
    }

    addRowBtn.addEventListener("click", () => {
        if (numRows >= MAX_ROWS) return;
        const startIndex = totalCells;
        numRows++;
        totalCells = numRows * COLS;
        gridState.push(...Array(COLS).fill(null));

        for (let i = startIndex; i < totalCells; i++) {
            gridContainer.appendChild(createCell(i));
        }

        updateRowButtons();
    });

    removeRowBtn.addEventListener("click", () => {
        if (numRows <= MIN_ROWS) return;
        numRows--;
        totalCells = numRows * COLS;

        for (let i = 0; i < COLS; i++) {
            gridContainer.removeChild(gridContainer.lastElementChild);
        }

        gridState = gridState.slice(0, totalCells);
        updateRowButtons();
    });

    // --- Core Grid Logic ---

    function renderGrid() {
        const cells = gridContainer.children;
        gridState.forEach((imgSrc, index) => {
            const cell = cells[index];
            const numberSpan = cell.querySelector(".cell-number");

            cell.innerHTML = "";
            if (numberSpan) cell.appendChild(numberSpan);

            if (imgSrc) {
                const img = document.createElement("img");
                img.src = imgSrc;
                img.draggable = true;

                img.addEventListener("dragstart", () => {
                    draggedImageSrc = img.src;
                    setTimeout(() => img.classList.add("dragging"), 0);
                });

                img.addEventListener("dragend", () => {
                    img.classList.remove("dragging");
                    draggedImageSrc = null;
                });

                const removeBtn = document.createElement("button");
                removeBtn.classList.add("remove-btn");
                removeBtn.innerHTML = `<i class="uil uil-times"></i>`;
                removeBtn.title = "Remove Image";

                removeBtn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    removeImage(index);
                });

                cell.appendChild(img);
                cell.appendChild(removeBtn);
            }
        });
    }

    function removeImage(index) {
        const newState = gridState.filter((_, i) => i !== index);
        newState.push(null);
        gridState = newState;
        renderGrid();
    }

    function handleDrop(targetIndex, imageSrc) {
        let tempState = gridState.filter((src) => src && src !== imageSrc);
        const targetIsPopulated = gridState[targetIndex] !== null;

        if (targetIsPopulated) {
            const itemAtTarget = gridState[targetIndex];
            const insertAtIndex = tempState.indexOf(itemAtTarget);
            if (insertAtIndex !== -1) {
                tempState.splice(insertAtIndex, 0, imageSrc);
            } else {
                tempState.push(imageSrc);
            }
        } else {
            tempState.push(imageSrc);
        }

        if (tempState.length > totalCells) {
            tempState = tempState.slice(0, totalCells);
        }

        const newState = Array(totalCells).fill(null);
        tempState.forEach((src, index) => {
            newState[index] = src;
        });

        gridState = newState;
        renderGrid();
    }

    // --- Grid Container Fallback Drop (gaps/padding between cells) ---
    gridContainer.addEventListener("dragover", (e) => e.preventDefault());
    gridContainer.addEventListener("drop", (e) => {
        e.preventDefault();
        const emptyIndex = gridState.indexOf(null);
        if (emptyIndex === -1) return;

        if (e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            if (file.type.startsWith("image/")) {
                const reader = new FileReader();
                reader.onload = (event) => handleDrop(emptyIndex, event.target.result);
                reader.readAsDataURL(file);
            }
        } else if (draggedImageSrc) {
            handleDrop(emptyIndex, draggedImageSrc);
        }
    });

    // --- Initialization ---
    for (let i = 0; i < totalCells; i++) {
        gridContainer.appendChild(createCell(i));
    }
    updateRowButtons();
});
