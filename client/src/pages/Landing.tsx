import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import type { RootState } from "../store/store";

function Landing() {
  const navigate = useNavigate();
  const { user, status } = useSelector((state: RootState) => state.auth);

  useEffect(() => {
    if (status !== "loading" && status !== "idle" && user) {
      navigate("/dashboard", { replace: true });
    }
  }, [status, user, navigate]);

  const handleFindFirstContribution = () => {
    // Read by Dashboard once the GitHub stack loads, so the user doesn't
    // land on an empty board and have to click "Find OSS Projects" again.
    sessionStorage.setItem("compass_auto_find", "1");
    window.location.href = `${
      import.meta.env.VITE_API_URL || "http://localhost:5000"
    }/api/auth/github`;
  };

  if (status === "loading" || status === "idle") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-950">
        <div className="h-6 w-6 rounded-full border-2 border-neutral-700 border-t-white animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col">
      <header className="mx-auto w-full max-w-6xl px-6 py-6">
        <span className="text-sm font-semibold tracking-tight">Compass</span>
      </header>

      <main className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-lg text-center">
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
            Your first open source contribution, found for you.
          </h1>
          <p className="mt-4 text-sm text-neutral-400 leading-relaxed">
            Compass looks at your GitHub stack, then matches you with real
            issues in repos you're already qualified to help with — no digging
            through hundreds of repos yourself.
          </p>

          <button
            onClick={handleFindFirstContribution}
            className="mt-8 inline-flex items-center justify-center gap-2 rounded-lg bg-white px-6 py-3 text-sm font-medium text-black hover:bg-neutral-200 transition-colors"
          >
            <svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
            </svg>
            Find my first contribution
          </button>

          <p className="mt-3 text-[11px] text-neutral-600">
            Connects with GitHub · read-only access
          </p>
        </div>
      </main>
    </div>
  );
}

export default Landing;
