const cleanPath = window.location.pathname.replace(/\/+$/, "");

if (cleanPath.startsWith("/admin")) {
  document.documentElement.classList.add("admin-route");
}

if (cleanPath === "") {
  const heroPreload = document.createElement("link");
  const smallViewport = window.matchMedia("(max-width: 639px)").matches;

  heroPreload.rel = "preload";
  heroPreload.as = "image";
  heroPreload.type = "image/avif";
  heroPreload.fetchPriority = "high";
  heroPreload.href = smallViewport
    ? "/optimized/dojo-photos/new-hero-poster-640.avif"
    : "/optimized/dojo-photos/new-hero-poster.avif";

  if (!smallViewport) {
    heroPreload.imageSrcset = [
      "/optimized/dojo-photos/new-hero-poster-640.avif 640w",
      "/optimized/dojo-photos/new-hero-poster-1280.avif 1280w",
      "/optimized/dojo-photos/new-hero-poster.avif 1672w",
    ].join(", ");
    heroPreload.imageSizes = "100vw";
  }

  document.head.appendChild(heroPreload);
}
