import { useEffect, useState } from "react";
import { AuthScreen } from "./components/auth-screen";
import { DashboardShell } from "./components/dashboard-shell";
import { LegalDialog } from "./components/legal-dialog";

export function App() {
  const [startupError, setStartupError] = useState("");

  useEffect(() => {
    let isMounted = true;

    import("../app.js").catch(() => {
      if (isMounted)
        setStartupError("The workspace interface could not be initialized. Reload to try again.");
    });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <>
      <AuthScreen />
      <DashboardShell />
      <LegalDialog />
      <p className="sr-only" role="status" aria-live="polite">
        {startupError}
      </p>
    </>
  );
}
