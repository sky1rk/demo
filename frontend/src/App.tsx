import { useEffect } from "react";
import { Navigate, Routes, Route, useNavigate } from "react-router-dom";

import { AuthSplash, GuestOnly, RequireAuth } from "./components/AuthGuard.tsx";
import { useAuth } from "./context/useAuth";
import Dashboard from "./pages/Dashboard.tsx";
import ForgotPassword from "./pages/ForgotPassword.tsx";
import NotFound from "./pages/NotFound.tsx";
import ResetPassword from "./pages/ResetPassword.tsx";
import Signin from "./pages/Signin.tsx";
import Signup from "./pages/Signup.tsx";

function App() {
  const { recovering, clearRecovery, idling, clearIdle } = useAuth();
  const navigate = useNavigate();

  // Password-recovery links land on the Site URL root; route into the reset
  // flow as soon as the recovery token is detected.
  useEffect(() => {
    if (recovering) {
      navigate("/reset-password", { replace: true });
      clearRecovery();
    }
  }, [recovering, clearRecovery, navigate]);

  return (
    <>
      {idling ? <IdleWarning onDismiss={clearIdle} /> : null}
      <Routes>
        <Route
          path="/signin"
          element={
            <GuestOnly>
              <Signin />
            </GuestOnly>
          }
        />
        <Route
          path="/signup"
          element={
            <GuestOnly>
              <Signup />
            </GuestOnly>
          }
        />
        <Route
          path="/forgot-password"
          element={
            <GuestOnly>
              <ForgotPassword />
            </GuestOnly>
          }
        />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route
          path="/dashboard"
          element={
            <RequireAuth>
              <Dashboard />
            </RequireAuth>
          }
        />
        <Route path="/" element={<HomeRedirect />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}

/** Visible during the 60 s before the idle auto sign-out fires. */
function IdleWarning({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      role="alert"
      className="fixed inset-x-0 bottom-6 z-50 mx-auto flex w-full max-w-md items-center justify-between gap-4 rounded-lg border border-risk-moderate-fg/30 bg-risk-moderate-bg px-4 py-3 text-sm text-risk-moderate-fg shadow-lg"
    >
      <span>You&apos;ll be signed out shortly due to inactivity.</span>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 text-xs font-semibold underline-offset-4 hover:underline"
      >
        Stay signed in
      </button>
    </div>
  );
}

/** Signed-in users go to the dashboard, everyone else to sign-in. */
function HomeRedirect() {
  const { session, loading } = useAuth();

  if (loading) return <AuthSplash />;
  return <Navigate replace to={session != null ? "/dashboard" : "/signin"} />;
}

export default App;
