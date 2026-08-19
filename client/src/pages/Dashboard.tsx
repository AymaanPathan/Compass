import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "../store/store";
import { logoutUser } from "../store/authSlice";
import { fetchGithubProfile } from "../store/githubSlice";
import { findOssProjects } from "../store/ossSlice";
import RepoKanbanBoard from "../components/RepoKanbanBoard";

function Dashboard() {
  const dispatch = useDispatch<AppDispatch>();
  const { user, status } = useSelector((state: RootState) => state.auth);
  const { stack, status: githubStatus } = useSelector(
    (state: RootState) => state.github,
  );
  const {
    repositories,
    parseFailed,
    raw,
    status: ossStatus,
    error: ossError,
  } = useSelector((state: RootState) => state.oss);

  useEffect(() => {
    if (status === "authenticated") {
      dispatch(fetchGithubProfile());
    }
  }, [status, dispatch]);

  const handleLogin = () => {
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

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-950 text-white p-4">
        <div className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900 p-8 text-center">
          <h1 className="text-xl font-semibold tracking-tight">Compass</h1>
          <p className="mt-1.5 text-sm text-neutral-400">
            Sign in to start contributing to open source.
          </p>
          <button
            onClick={handleLogin}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-white py-2.5 text-sm font-medium text-black hover:bg-neutral-200 transition-colors"
          >
            <svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
            </svg>
            Continue with GitHub
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      {/* Topbar */}
      <header className="sticky top-0 z-10 border-b border-neutral-800/80 bg-neutral-950/90 backdrop-blur">
        <div className="mx-auto max-w-6xl px-6 py-3.5 flex items-center justify-between">
          <span className="text-sm font-semibold tracking-tight">Compass</span>
          <div className="flex items-center gap-3">
            <img
              src={user.avatarUrl}
              alt={user.username}
              className="h-7 w-7 rounded-full ring-1 ring-neutral-700"
            />
            <span className="text-sm text-neutral-300 hidden sm:inline">
              @{user.username}
            </span>
            <button
              onClick={() => dispatch(logoutUser())}
              className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        {/* Profile summary */}
        <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-6">
            <img
              src={user.avatarUrl}
              alt={user.username}
              className="h-16 w-16 rounded-full ring-2 ring-neutral-700 shrink-0"
            />
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-semibold">{user.displayName}</h1>
              <p className="text-sm text-neutral-500">@{user.username}</p>

              {githubStatus === "loading" && (
                <p className="mt-2 text-xs text-neutral-500">
                  Analyzing your GitHub stack…
                </p>
              )}

              {stack && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {stack.topLanguages.map((l) => (
                    <span
                      key={l.language}
                      className="rounded-full bg-neutral-800 px-2.5 py-1 text-[11px] text-neutral-300"
                    >
                      {l.language} · {l.repoCount}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {stack && (
              <div className="flex gap-6 sm:gap-8 shrink-0">
                <Stat label="Repos" value={stack.totalRepos} />
                <Stat label="Original" value={stack.originalRepos} />
                <Stat label="Stars" value={stack.totalStars} />
              </div>
            )}
          </div>

          {stack && (
            <button
              onClick={() => dispatch(findOssProjects())}
              disabled={ossStatus === "loading"}
              className="mt-6 rounded-lg bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200 transition-colors disabled:opacity-50"
            >
              {ossStatus === "loading"
                ? "Finding projects…"
                : "Find OSS Projects"}
            </button>
          )}

          {ossError && <p className="mt-3 text-xs text-red-400">{ossError}</p>}
        </section>

        {/* Results */}
        {ossStatus === "loading" && (
          <div className="mt-8 flex items-center justify-center gap-2 text-xs text-neutral-500 py-16">
            <div className="h-3 w-3 rounded-full border-2 border-neutral-700 border-t-white animate-spin" />
            Agent is searching GitHub…
          </div>
        )}

        {ossStatus === "succeeded" && parseFailed && (
          <div className="mt-8 text-left text-xs text-amber-400 bg-amber-950/30 border border-amber-900 rounded-xl p-4">
            Couldn't parse structured recommendations — showing raw output
            instead.
            <pre className="mt-2 whitespace-pre-wrap text-neutral-300">
              {raw}
            </pre>
          </div>
        )}

        {ossStatus === "succeeded" &&
          !parseFailed &&
          repositories.length > 0 && (
            <section className="mt-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-medium text-neutral-400">
                  Recommended repositories
                </h2>
                <p className="text-[11px] text-neutral-600">
                  Drag cards across columns · drop in Selected to unlock explore
                </p>
              </div>
              <RepoKanbanBoard />
            </section>
          )}
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-[11px] text-neutral-500">{label}</p>
    </div>
  );
}

export default Dashboard;
