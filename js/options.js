// Shared Options popover. Bundles aspect-ratio and grid-size controls behind
// a single "options" button. Persists both choices in localStorage and applies
// them by setting CSS custom properties on :root. Call at the end of <body>.

(function () {
    const RATIOS = [
        { label: "17:24", value: "17 / 24" },
        { label: "3:4",   value: "3 / 4"   },
        { label: "1:1",   value: "1 / 1"   },
        { label: "4:3",   value: "4 / 3"   },
    ];
    const DEFAULT_ASPECT = RATIOS[0].value;

    const SIZES = [
        { label: "Small",  value: "small"  },
        { label: "Medium", value: "medium" },
        { label: "Large",  value: "large"  },
    ];
    const DEFAULT_SIZE = "medium";

    function applyAspect(value) {
        document.documentElement.style.setProperty("--img-aspect", value);
    }
    function applySize(value) {
        document.documentElement.setAttribute("data-size", value);
    }

    applyAspect(localStorage.getItem("aspect") || DEFAULT_ASPECT);
    applySize(localStorage.getItem("gridSize") || DEFAULT_SIZE);

    const btn = document.getElementById("options-toggle");
    if (!btn) return;

    let popover = null;

    function closePopover() {
        if (!popover) return;
        popover.remove();
        popover = null;
        document.removeEventListener("click", onDocClick);
    }

    function onDocClick(e) {
        if (popover && !popover.contains(e.target) && !btn.contains(e.target)) {
            closePopover();
        }
    }

    function buildGroup(title, options, currentValue, onPick) {
        const group = document.createElement("div");
        group.className = "options-group";
        const heading = document.createElement("p");
        heading.className = "options-heading";
        heading.textContent = title;
        group.appendChild(heading);

        const row = document.createElement("div");
        row.className = "options-row";
        options.forEach(o => {
            const opt = document.createElement("button");
            opt.className = "options-option";
            if (o.value === currentValue) opt.classList.add("active");
            opt.textContent = o.label;
            opt.addEventListener("click", () => onPick(o.value, opt));
            row.appendChild(opt);
        });
        group.appendChild(row);
        return group;
    }

    function setActive(row, btn) {
        row.querySelectorAll(".options-option").forEach(b => b.classList.remove("active"));
        btn.classList.add("options-option-just-set");
        btn.classList.add("active");
        setTimeout(() => btn.classList.remove("options-option-just-set"), 200);
    }

    function openPopover() {
        popover = document.createElement("div");
        popover.className = "options-popover";

        const currentAspect = localStorage.getItem("aspect") || DEFAULT_ASPECT;
        const currentSize   = localStorage.getItem("gridSize") || DEFAULT_SIZE;

        const aspectGroup = buildGroup("Aspect Ratio", RATIOS, currentAspect, (value, optBtn) => {
            localStorage.setItem("aspect", value);
            applyAspect(value);
            setActive(optBtn.parentElement, optBtn);
        });
        const sizeGroup = buildGroup("Size", SIZES, currentSize, (value, optBtn) => {
            localStorage.setItem("gridSize", value);
            applySize(value);
            setActive(optBtn.parentElement, optBtn);
        });

        popover.appendChild(aspectGroup);
        popover.appendChild(sizeGroup);

        document.body.appendChild(popover);

        const rect = btn.getBoundingClientRect();
        popover.style.top  = `${rect.bottom + 8}px`;
        popover.style.left = `${rect.right - popover.offsetWidth}px`;

        setTimeout(() => document.addEventListener("click", onDocClick), 0);
    }

    btn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (popover) closePopover();
        else openPopover();
    });

    window.addEventListener("storage", (e) => {
        if (e.key === "aspect")   applyAspect(e.newValue || DEFAULT_ASPECT);
        if (e.key === "gridSize") applySize(e.newValue || DEFAULT_SIZE);
    });
})();
