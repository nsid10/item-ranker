document.addEventListener("DOMContentLoaded", () => {
    // --- DOM Elements ---
    const gridContainer = document.getElementById("grid-container");
    const themeToggleBtn = document.getElementById("theme-toggle");
    const downloadBtn = document.getElementById("download-btn");
    const clearAllBtn = document.getElementById("clear-all-btn");

    // --- State & Constants ---
    const totalCells = 30;
    let gridState = Array(totalCells).fill(null);
    let draggedImageSrc = null;

    // --- Theme Management ---
    function applyTheme(theme) {
        if (theme === "dark") {
            document.body.classList.add("dark-mode");
            // When it's dark, show the sun icon to switch back to light
            themeToggleBtn.innerHTML = `<i class="uil uil-sun"></i>`;
        } else {
            document.body.classList.remove("dark-mode");
            // When it's light, show the moon icon to switch to dark
            themeToggleBtn.innerHTML = `<i class="uil uil-moon"></i>`;
        }
    }

    // On page load, check for saved theme and apply it
    const savedTheme = localStorage.getItem("theme") || "light";
    applyTheme(savedTheme);

    // --- Clear All Functionality ---
    clearAllBtn.addEventListener("click", () => {
        if (confirm("Are you sure you want to clear the entire grid?")) {
            gridState = Array(totalCells).fill(null);
            renderGrid();
        }
    });

    // Event listener for the toggle button
    themeToggleBtn.addEventListener("click", () => {
        // Check what the NEW theme should be
        const newTheme = document.body.classList.contains("dark-mode") ? "light" : "dark";
        localStorage.setItem("theme", newTheme);
        applyTheme(newTheme);
    });

    // --- Download Functionality ---
    downloadBtn.addEventListener("click", () => {
            const isDarkMode = document.body.classList.contains("dark-mode");
            const cells = Array.from(gridContainer.children);

            // 1. Hide empty cells before capturing
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
                // 2. Show cells again after capture is done
                cells.forEach(cell => cell.classList.remove("hidden-for-export"));

                const link = document.createElement("a");
                link.download = "grid-preview.png";
                link.href = canvas.toDataURL("image/png");
                link.click();
            });
        });

    // --- Core Grid Logic (Render, Drop Handling, Listeners) ---

    function renderGrid() {
        const cells = gridContainer.children;
        gridState.forEach((imgSrc, index) => {
            const cell = cells[index];
            const numberSpan = cell.querySelector(".cell-number");

            // Clear cell but keep the number span if it exists
            cell.innerHTML = "";
            if (numberSpan) cell.appendChild(numberSpan);

            if (imgSrc) {
                // Create Image
                const img = document.createElement("img");
                img.src = imgSrc;
                img.draggable = true;

                img.addEventListener("dragstart", (e) => {
                    draggedImageSrc = img.src;
                    setTimeout(() => img.classList.add("dragging"), 0);
                });

                img.addEventListener("dragend", () => {
                    img.classList.remove("dragging");
                    draggedImageSrc = null;
                });

                // Create Remove Button
                const removeBtn = document.createElement("button");
                removeBtn.classList.add("remove-btn");
                removeBtn.innerHTML = `<i class="uil uil-times"></i>`;
                removeBtn.title = "Remove Image";

                removeBtn.addEventListener("click", (e) => {
                    e.stopPropagation(); // Prevent drag events
                    removeImage(index);
                });

                cell.appendChild(img);
                cell.appendChild(removeBtn);
            }
        });
    }

    // New helper function to remove image and shift the list
    function removeImage(index) {
        // Filter out the image at the specific index and shift others up
        const newState = gridState.filter((_, i) => i !== index);
        newState.push(null); // Maintain the total cell count
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

    // --- Initialization ---
    for (let i = 0; i < totalCells; i++) {
        const cell = document.createElement("div");
        cell.classList.add("grid-cell");

        const cellNumber = document.createElement("span");
        cellNumber.classList.add("cell-number");
        cellNumber.textContent = i + 1;
        cell.appendChild(cellNumber);

        gridContainer.appendChild(cell);

        cell.addEventListener("dragover", (e) => e.preventDefault());
        cell.addEventListener("drop", (e) => {
            e.preventDefault();
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
    }
});
