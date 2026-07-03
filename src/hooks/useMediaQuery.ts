import { useEffect, useState } from "react";

/**
 * Subscribe to a CSS media query and return whether it currently matches.
 *
 * Safe outside a browser (SSR) and under jsdom, where `window.matchMedia` is
 * undefined: in both cases it returns `false` and never subscribes, so callers
 * fall back to the desktop/wide layout. That keeps unit tests (which don't mock
 * matchMedia) rendering the same DOM they did before.
 *
 *   const isNarrow = useMediaQuery("(max-width: 639px)"); // < Tailwind `sm`
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange(); // sync in case the query changed between render and effect
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
