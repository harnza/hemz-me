// Single-key navigation + image lightbox, shared across all pages.
// h home · w who i am · d what i'm doing · l things i like
// e email · g github · i linkedin · b back · 1-7 open a "things i like" picture
(function () {
  const EMAIL = "hamzaasdairi15@gmail.com";
  const GITHUB = "https://github.com/harnza";
  const LINKEDIN = "https://www.linkedin.com/in/hvmza/";

  const routes = {
    h: "index.html",
    w: "who-i-am.html",
    d: "what-im-doing.html",
    l: "things-i-like.html",
  };

  // fade the page out, then run the navigation action
  function fadeThen(action) {
    document.body.classList.add("leaving");
    let done = false;
    const finish = function () {
      if (done) return;
      done = true;
      action();
    };
    document.body.addEventListener("transitionend", finish, { once: true });
    setTimeout(finish, 400); // fallback if transitionend doesn't fire
  }
  function go(url) {
    fadeThen(function () { window.location.href = url; });
  }
  function goBack() {
    fadeThen(function () {
      if (window.history.length > 1) window.history.back();
      else window.location.href = "index.html";
    });
  }

  // reset fade state on arrival (covers back/forward cache restores)
  window.addEventListener("pageshow", function () {
    document.body.classList.remove("leaving");
  });

  // ---- lightbox helpers (only active on pages that have #lightbox) ----
  function box() {
    return document.getElementById("lightbox");
  }
  function lightboxOpen(tile) {
    const lb = box();
    if (!lb) return false;
    const full = tile.getAttribute("data-full");
    if (!full) return false;
    const label = tile.querySelector(".label");
    const phrase = tile.querySelector(".phrase");
    lb.querySelector("img").src = full;
    lb.querySelector(".lb-title").textContent = label ? label.textContent : "";
    lb.querySelector(".lb-phrase").textContent = phrase ? phrase.textContent : "";
    lb.classList.add("open");
    lb.setAttribute("aria-hidden", "false");
    return true;
  }
  function lightboxClose() {
    const lb = box();
    if (!lb) return;
    lb.classList.remove("open");
    lb.setAttribute("aria-hidden", "true");
  }
  function lightboxIsOpen() {
    const lb = box();
    return !!(lb && lb.classList.contains("open"));
  }

  document.addEventListener("DOMContentLoaded", function () {
    // clicking a tile opens the picture instead of navigating
    document.querySelectorAll(".thing[data-full]").forEach(function (tile) {
      tile.addEventListener("click", function (e) {
        if (lightboxOpen(tile)) e.preventDefault();
      });
    });
    // clicking the dark backdrop closes it
    const lb = box();
    if (lb) lb.addEventListener("click", lightboxClose);

    // fade out before following an internal page link
    document.querySelectorAll("a[href]").forEach(function (a) {
      if (a.hasAttribute("data-full")) return;          // tiles open the lightbox
      if (a.target === "_blank") return;                // new-tab links
      const href = a.getAttribute("href");
      if (!href || /^(mailto:|https?:|#)/i.test(href)) return; // external / mail / anchors
      a.addEventListener("click", function (e) {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        go(href);
      });
    });
  });

  document.addEventListener("keydown", function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    const tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || e.target.isContentEditable) return;

    // Escape always closes the lightbox if open
    if (e.key === "Escape") {
      if (lightboxIsOpen()) lightboxClose();
      return;
    }

    const k = e.key.toLowerCase();

    // while a picture is open, only "b" (close) is meaningful
    if (lightboxIsOpen()) {
      if (k === "b") lightboxClose();
      return;
    }

    // each page declares which nav keys are active via <body data-keys="...">
    const allowed = (document.body.getAttribute("data-keys") || "").toLowerCase().split(/\s+/);
    const can = function (key) { return allowed.indexOf(key) !== -1; };

    if (routes[k] && can(k)) {
      go(routes[k]);
      return;
    }
    if (k === "e" && can("e")) {
      window.location.href = "mailto:" + EMAIL;
      return;
    }
    if (k === "g" && can("g")) {
      window.open(GITHUB, "_blank", "noopener");
      return;
    }
    if (k === "i" && can("i")) {
      window.open(LINKEDIN, "_blank", "noopener");
      return;
    }
    if (k === "b" && can("b")) {
      goBack();
      return;
    }

    // number keys open the matching tile's picture (or follow its link)
    if (/^[1-9]$/.test(k)) {
      const tile = document.querySelector('[data-key="' + k + '"]');
      if (!tile) return;
      if (lightboxOpen(tile)) return;
      const href = tile.getAttribute("href");
      if (href && href !== "#") {
        if (tile.target === "_blank") window.open(href, "_blank", "noopener");
        else go(href);
      }
    }
  });
})();
