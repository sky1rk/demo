import { Outlet } from "react-router-dom";

import AppSidebar from "./AppSidebar.tsx";
import Topbar, { AppMobileNav } from "./AppTopbar.tsx";

/**
 * Authenticated app chrome: maroon sidebar (desktop), mobile nav strip and
 * top bar, with page content in the center. Rendered by RequireAuth routes.
 */
export default function AppLayout() {
  return (
    <div className="flex min-h-screen bg-theme-light-gray">
      <AppSidebar />

      <div className="flex min-h-screen flex-1 flex-col">
        <Topbar />
        <AppMobileNav />
        <main className="flex-1">
          <div className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8 md:py-10">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
