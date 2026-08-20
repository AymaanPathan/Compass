// src/pages/Course.tsx
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "../store/store";
import { logoutUser } from "../store/authSlice";
import { fetchGithubProfile } from "../store/githubSlice";
import { findOssProjects, resetOssRecommendation } from "../store/ossSlice";
import RepoKanbanBoard from "../components/RepoKanbanBoard";

const FONT_DISPLAY = "'Fraunces', ui-serif, Georgia, serif";
const FONT_MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, monospace";

function Course() {
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const { user, status } = useSelector((state: RootState) => state.auth);
  const { stack, status: githubStatus } = useSelector(
    (state: RootState) => state.github,
  );
  const {
    repositories,
    bestMatch,
    parseFailed,
    raw,
    status: ossStatus,
    error: ossError,
  } = useSelector((state: RootState) => state.oss);

  useEffect(() => {
    if (status !== "loading" && status !== "idle" && !user) {
      navigate("/", { replace: true });
    }
  }, [status, user, navigate]);

  useEffect(() => {
    if (status === "authenticated" && githubStatus === "idle") {
      dispatch(fetchGithubProfile());
    }
  }, [status, githubStatus, dispatch]);

  // Entry point from either Landing (skip-analysis) or Analysis ("Find me
  // repos →") — both set this flag, so kick the agent off as soon as the
  // stack is ready instead of showing an empty board.
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

  const handleRerun = () => {
    dispatch(resetOssRecommendation());
    dispatch(findOssProjects());
  };

  if (status === "loading" || status === "idle" || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="h-6 w-6 rounded-full border-2 border-neutral-800 border-t-white animate-spin" />
      </div>
    );
  }

  const bearingLabel =
    ossStatus === "loading"
      ? "Bearing — plotting"
      : ossStatus === "succeeded"
        ? "Bearing — set"
        : ossStatus === "failed"
          ? "Bearing — lost"
          : "Bearing — unset";

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Topbar — mirrors Landing/Analysis chrome so the flow reads as one product */}
      <header className="sticky top-0 z-10 border-b border-white/[0.06] bg-black/90 backdrop-blur">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <MarkGlyph />
            <span
              className="text-xs tracking-[0.2em] uppercase text-white"
              style={{ fontFamily: FONT_MONO }}
            >
              Compass
            </span>
            <span
              className="hidden sm:inline text-[11px] text-neutral-600 ml-2"
              style={{ fontFamily: FONT_MONO }}
            >
              · course
            </span>
          </div>
          <div className="flex items-center gap-4">
            <img
              src={user.avatarUrl}
              alt={user.username}
              className="h-7 w-7 rounded-full ring-1 ring-white/10"
            />
            <span className="text-sm text-neutral-400 hidden sm:inline">
              @{user.username}
            </span>
            <button
              onClick={() => dispatch(logoutUser())}
              className="text-xs text-neutral-600 hover:text-neutral-300 transition-colors"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12">
        <p
          className="text-[11px] tracking-[0.22em] uppercase mb-3 text-neutral-500"
          style={{ fontFamily: FONT_MONO }}
        >
          {bearingLabel}
        </p>
        <h1
          className="text-[2rem] sm:text-[2.5rem] leading-[1.1] font-medium tracking-tight"
          style={{ fontFamily: FONT_DISPLAY }}
        >
          Charting your course
        </h1>

        {stack && (
          <p className="mt-3 text-sm text-neutral-500">
            For @{user.username} ·{" "}
            {stack.topLanguages
              .slice(0, 3)
              .map((l) => l.language)
              .join(", ")}
          </p>
        )}

        {/* Agent status */}
        {ossStatus === "loading" && (
          <div className="mt-14 flex flex-col items-center justify-center gap-3 text-center py-16 border border-white/[0.06] rounded-2xl">
            <div className="h-5 w-5 rounded-full border-2 border-neutral-800 border-t-white animate-spin" />
            <p className="text-sm text-neutral-300">
              Agent is searching GitHub for a match…
            </p>
            <p
              className="text-[11px] text-neutral-600"
              style={{ fontFamily: FONT_MONO }}
            >
              one search, evaluated against activity, maturity, and fit — this
              can take a moment
            </p>
          </div>
        )}

        {ossStatus === "failed" && (
          <div className="mt-10 text-sm text-red-400 bg-red-950/20 border border-red-900 rounded-xl p-5">
            {ossError || "Couldn't complete the search."}
            <button
              onClick={handleRerun}
              className="mt-3 block text-xs text-red-300 underline underline-offset-2 hover:text-red-200"
            >
              Try again
            </button>
          </div>
        )}

        {ossStatus === "succeeded" && parseFailed && (
          <div className="mt-10 text-xs text-amber-400 bg-amber-950/20 border border-amber-900 rounded-xl p-4">
            Couldn't parse structured recommendations — showing raw output
            instead.
            <pre className="mt-3 whitespace-pre-wrap text-neutral-300">
              {raw}
            </pre>
          </div>
        )}

        {/* Best match callout */}
        {ossStatus === "succeeded" && !parseFailed && bestMatch && (
          <div className="mt-10 rounded-2xl border border-white/[0.08] p-6 max-w-2xl">
            <p
              className="text-[11px] tracking-[0.16em] uppercase text-neutral-500 mb-3"
              style={{ fontFamily: FONT_MONO }}
            >
              Recommended heading
            </p>
            <h2
              className="text-lg font-medium"
              style={{ fontFamily: FONT_DISPLAY }}
            >
              {bestMatch.name}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-neutral-400">
              {bestMatch.reason}
            </p>
          </div>
        )}

        {/* Board */}
        {ossStatus === "succeeded" &&
          !parseFailed &&
          repositories.length > 0 && (
            <section className="mt-10">
              <div className="flex items-center justify-between mb-4">
                <h2
                  className="text-[11px] tracking-[0.16em] uppercase text-neutral-500"
                  style={{ fontFamily: FONT_MONO }}
                >
                  Candidates
                </h2>
                <div className="flex items-center gap-4">
                  <p
                    className="text-[11px] text-neutral-600"
                    style={{ fontFamily: FONT_MONO }}
                  >
                    drag cards · drop in Selected to lock your course
                  </p>
                  <button
                    onClick={handleRerun}
                    className="text-[11px] text-neutral-500 hover:text-neutral-300 underline underline-offset-2 transition-colors"
                  >
                    Search again
                  </button>
                </div>
              </div>
              <RepoKanbanBoard />
            </section>
          )}
      </main>
    </div>
  );
}

function MarkGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle
        cx="8"
        cy="8"
        r="7"
        stroke="white"
        strokeOpacity="0.8"
        strokeWidth="1"
      />
      <line x1="8" y1="1" x2="8" y2="3.4" stroke="white" strokeWidth="1" />
      <circle cx="8" cy="8" r="1" fill="white" />
    </svg>
  );
}

export default Course;
