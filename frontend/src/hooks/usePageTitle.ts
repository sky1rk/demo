import { useEffect } from "react";

/** Sets the document tab title for the mounted page and restores on unmount. */
export function usePageTitle(title: string | null) {
  useEffect(() => {
    const previous = "Pal.se";
    document.title = title == null ? previous : `${title} — Pal.se`;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
