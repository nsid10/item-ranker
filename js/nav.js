// Adds a `.scrolled` class to the fixed top nav once the page is scrolled,
// so the nav can cast a shadow. Call at the end of <body>.

(function () {
    const nav = document.querySelector(".top-nav");
    if (!nav) return;

    function update() {
        nav.classList.toggle("scrolled", window.scrollY > 0);
    }

    update();
    window.addEventListener("scroll", update, { passive: true });
})();
