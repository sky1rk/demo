import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";

import "./index.css";
import App from "./App.tsx";
import AuthProvider from "./context/AuthContext.tsx";

// Data router (React Router v7): enables useBlocker for the unsaved-changes
// guard on the update-patient page. App keeps its internal <Routes> tree, so
// all paths resolve exactly as before. AuthProvider lives inside the root
// route element — it calls useNavigate() (idle auto-logout, recovery
// redirect), so it must sit below the router context, not above it.
const router = createBrowserRouter([
  {
    path: "*",
    element: (
      <AuthProvider>
        <App />
      </AuthProvider>
    ),
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
