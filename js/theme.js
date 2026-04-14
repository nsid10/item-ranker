// Shared theme management for all pages.
// Call this script at the end of <body> — the DOM is available, no DOMContentLoaded needed.

(function () {
    function applyTheme(theme) {
        document.body.classList.toggle("dark-mode", theme === "dark");
        const btn = document.getElementById("theme-toggle");
        if (btn) {
            btn.innerHTML = theme === "dark"
                ? '<i class="uil uil-sun"></i>'
                : '<i class="uil uil-moon"></i>';
        }
    }

    // Apply saved theme immediately.
    var saved = localStorage.getItem("theme") || "light";
    applyTheme(saved);

    // Wire up the toggle button.
    var btn = document.getElementById("theme-toggle");
    if (btn) {
        btn.addEventListener("click", function () {
            var next = document.body.classList.contains("dark-mode") ? "light" : "dark";
            localStorage.setItem("theme", next);
            applyTheme(next);
        });
    }

    // Sync across open tabs when another tab changes the theme.
    window.addEventListener("storage", function (e) {
        if (e.key === "theme") {
            applyTheme(e.newValue || "light");
        }
    });
})();
