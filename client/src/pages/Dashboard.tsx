import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "../store/store";
import { logoutUser } from "../store/authSlice";
import { fetchGithubProfile } from "../store/githubSlice";
import { findOssProjects } from "../store/ossSlice";
import RepoKanbanBoard from "../components/RepoKanbanBoard";

function Dashboard() {
  const navigate = useNavigate();
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

  // Bounce unauthenticated users back to the landing page instead of
  // showing a login card inside the dashboard shell.
  useEffect(() => {
    if (status !== "loading" && status !== "idle" && !user) {
      navigate("/", { replace: true });
    }
  }, [status, user, navigate]);

  useEffect(() => {
    if (status === "authenticated") {
      dispatch(fetchGithubProfile());
    }
  }, [status, dispatch]);

  // If the user clicked "Find my first contribution" on Landing, kick off
  // the search automatically as soon as the GitHub stack is ready, so they
  // never see a bare empty board.
  useEffect(() => {
    if (
      githubStatus === "succeeded" &&
      stack &&
      ossStatus === "idle" &&
      sessionStorage.getItem("compass_auto_find") === "1"
    ) {
      sessionStorage.removeItem("compass_auto_find");
      dispatch(findOssProjects());
    }
  }, [githubStatus, stack, ossStatus, dispatch]);

  if (status === "loading" || status === "idle" || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-950">
        <div className="h-6 w-6 rounded-full border-2 border-neutral-700 border-t-white animate-spin" />
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

          {stack && ossStatus !== "loading" && ossStatus !== "succeeded" && (
            <button
              onClick={() => dispatch(findOssProjects())}
              className="mt-6 rounded-lg bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200 transition-colors"
            >
              Find OSS Projects
            </button>
          )}

          {ossError && <p className="mt-3 text-xs text-red-400">{ossError}</p>}
        </section>

        {/* Results */}
        {ossStatus === "loading" && (
          <div className="mt-8 flex flex-col items-center justify-center gap-3 text-xs text-neutral-500 py-20">
            <div className="h-5 w-5 rounded-full border-2 border-neutral-700 border-t-white animate-spin" />
            <p>Finding your first contribution…</p>
            <p className="text-[11px] text-neutral-600">
              Matching your stack against real, open issues on GitHub
            </p>
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
