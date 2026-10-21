import { Navigate, Routes, Route } from "react-router-dom";

import Signin from "./pages/Signin.tsx";
import Signup from "./pages/Signup.tsx";
import Dashboard from "./pages/Dashboard.tsx";
import NotFound from "./pages/NotFound.tsx";

function App() {
  return (
    <Routes>
      <Route path="/signin" element={<Signin />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default App;
