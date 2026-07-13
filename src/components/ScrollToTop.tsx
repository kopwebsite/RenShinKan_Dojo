import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export function ScrollToTop() {
  const { hash, pathname } = useLocation();

  useEffect(() => {
    const previousScrollRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";

    return () => {
      window.history.scrollRestoration = previousScrollRestoration;
    };
  }, []);

  useEffect(() => {
    if (hash) {
      const targetId = decodeURIComponent(hash.slice(1));
      let frameId = 0;
      let attempts = 0;

      const scrollToTarget = () => {
        const target = document.getElementById(targetId);

        if (target) {
          target.scrollIntoView({ block: "start" });
          return;
        }

        // Lazy route chunks can mount after this effect first runs. Retry for
        // roughly two seconds so copied section links remain dependable.
        if (attempts < 120) {
          attempts += 1;
          frameId = window.requestAnimationFrame(scrollToTarget);
        }
      };

      frameId = window.requestAnimationFrame(scrollToTarget);
      return () => window.cancelAnimationFrame(frameId);
    }

    window.scrollTo({ top: 0, left: 0 });
  }, [hash, pathname]);

  return null;
}
