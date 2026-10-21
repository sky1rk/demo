import type { ReactNode } from "react";

import BrandMastHead from "./BrandMastHead.tsx";
import SideCover from "./SideCover.tsx";

/**
 * Two-column auth layout: branded side panel on the left, form content on the
 * right. The side cover is hidden on small screens, where a slim maroon bar
 * carries the brand instead (the masthead only ever sits on maroon).
 * Non-scrollable by design: auth screens fit the viewport without scrolling.
 */
export default function AuthFormShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-theme-white">
      {/* Brand bar only where the SideCover is hidden */}
      <div className="flex flex-col justify-center bg-theme-maroon px-8 py-5 lg:hidden">
        <BrandMastHead compact />
      </div>

      <div className="hidden h-full flex-1 lg:flex">
        <SideCover />
      </div>

      <div className="flex h-full flex-1 flex-col shadow-[inset_8px_0_6px_-6px_rgba(0,0,0,0.3)]">
        <div className="mx-auto flex w-full max-w-120 flex-1 flex-col justify-center px-10 py-10 text-theme-ink-gray">
          {children}
        </div>
      </div>
    </div>
  );
}
