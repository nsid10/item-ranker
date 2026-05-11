// Shared aspect-ratio control. Applies --img-aspect via a popover and persists
// the choice in localStorage. Call this script at the end of <body>.

(function () {
    const RATIOS = [
        { label: "17:24", value: "17 / 24" },
        { label: "3:4",   value: "3 / 4"   },
        { label: "1:1",   value: "1 / 1"   },
        { label: "4:3",   value: "4 / 3"   },
    ];
    const DEFAULT = RATIOS[0].value;

    function apply(value) {
        document.documentElement.style.setProperty("--img-aspect", value);
    }

    apply(localStorage.getItem("aspect") || DEFAULT);

    const btn = document.getElementById("aspect-toggle");
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

    function openPopover() {
        popover = document.createElement("div");
        popover.className = "aspect-popover";
        const rect = btn.getBoundingClientRect();
        popover.style.top  = `${rect.bottom + 8}px`;
        // Anchor to right edge of button so it expands left into the viewport.
        const current = localStorage.getItem("aspect") || DEFAULT;
        RATIOS.forEach(r => {
            const opt = document.createElement("button");
            opt.className = "aspect-option";
            if (r.value === current) opt.classList.add("active");
            opt.textContent = r.label;
            opt.addEventListener("click", () => {
                localStorage.setItem("aspect", r.value);
                apply(r.value);
                closePopover();
            });
            popover.appendChild(opt);
        });
        document.body.appendChild(popover);
        // Position after appending so we know width.
        popover.style.left = `${rect.right - popover.offsetWidth}px`;
        setTimeout(() => document.addEventListener("click", onDocClick), 0);
    }

    btn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (popover) closePopover();
        else openPopover();
    });

    window.addEventListener("storage", (e) => {
        if (e.key === "aspect") apply(e.newValue || DEFAULT);
    });
})();
