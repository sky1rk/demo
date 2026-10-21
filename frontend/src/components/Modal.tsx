import { useEffect } from "react";
import type { ReactNode } from "react";

import CloseIcon from "../assets/icons/close.svg";

/** Centered dialog with overlay; Escape closes. */
export default function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-theme-ink/40 p-4 backdrop-blur-[2px]"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-xl border border-theme-line bg-white p-6 shadow-2xl md:p-7">
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 className="text-lg font-bold text-theme-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-md p-1 transition-colors hover:bg-theme-light-gray focus-visible:outline-2 focus-visible:outline-theme-maroon"
          >
            <img src={CloseIcon} alt="" className="h-5 w-5" aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
