// frontend/src/pages/AgentPage.tsx
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "../store/store";
import { findOssRepository, resetOssRecommendation } from "../store/ossSlice";

const FONT_DISPLAY = "'Fraunces', ui-serif, Georgia, serif";
const FONT_MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, monospace";

function AgentPage() {
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const thinkingRef = useRef<HTMLPreElement>(null);

  // Guards the auto-find dispatch against StrictMode double-invoke and
  // HMR remounts within the same tab session. sessionStorage alone isn't
  // enough because the read-then-remove isn't atomic against re-renders
  // that happen before the removal is committed.
  const autoFindTriggered = useRef(false);

  const { user } = useSelector((s: RootState) => s.auth);
  const { profile } = useSelector((s: RootState) => s.devProfile);
  const { repository, thinking, liveOutput, status, error, parseFailed, raw } =
    useSelector((s: RootState) => s.oss);

  useEffect(() => {
    console.log("[AgentPage effect]", {
      user: !!user,
      profile: !!profile,
      status,
    });

    if (!user) {
      navigate("/", { replace: true });
      return;
    }
    if (!profile) {
      navigate("/analysis", { replace: true });
      return;
    }

    const shouldAutoFind = sessionStorage.getItem("compass_auto_find") === "1";
    if (shouldAutoFind && status === "idle" && !autoFindTriggered.current) {
      autoFindTriggered.current = true;
      sessionStorage.removeItem("compass_auto_find");
      dispatch(findOssRepository());
    }
    // Intentionally omitting `status` here: this effect only needs to run
    // when identity/profile change or on mount. Including status caused it
    // to re-fire on every loading -> succeeded/failed transition, which
    // just re-ran the nav guards and auto-find check for no reason.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, profile, dispatch, navigate]);

  useEffect(() => {
    console.log("[AgentPage] MOUNTED");
    return () => {
      console.log("[AgentPage] UNMOUNTED");
    };
  }, []);

  useEffect(() => {
    thinkingRef.current?.scrollTo({ top: thinkingRef.current.scrollHeight });
  }, [thinking]);

  const handleRetry = () => {
    dispatch(resetOssRecommendation());
    dispatch(findOssRepository());
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="mx-auto w-full max-w-3xl px-6 py-6 flex items-center justify-between border-b border-white/[0.06]">
        <span
          className="text-xs tracking-[0.2em] uppercase text-white"
          style={{ fontFamily: FONT_MONO }}
        >
          Compass
        </span>
        <span
          className="text-[11px] text-neutral-600"
          style={{ fontFamily: FONT_MONO }}
        >
          plotting a course
        </span>
      </header>

      <main className="mx-auto w-full max-w-3xl px-6 py-14">
        {status === "idle" && (
          <button
            onClick={() => dispatch(findOssRepository())}
            className="inline-flex items-center gap-2.5 rounded-lg bg-white px-6 py-3 text-sm font-medium text-black hover:bg-neutral-200 transition-colors"
          >
            Find my repo →
          </button>
        )}

        {(status === "loading" || thinking) && (
          <div className="mb-8">
            <p
              className="text-[11px] tracking-[0.16em] uppercase text-neutral-500 mb-3"
              style={{ fontFamily: FONT_MONO }}
            >
              thinking{status === "loading" ? "…" : ""}
            </p>
            <pre
              ref={thinkingRef}
              className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 text-[12px] leading-relaxed text-neutral-400"
              style={{ fontFamily: FONT_MONO }}
            >
              {thinking || "…"}
            </pre>
          </div>
        )}

        {status === "loading" && liveOutput && (
          <div className="mb-8">
            <p
              className="text-[11px] tracking-[0.16em] uppercase text-neutral-500 mb-3"
              style={{ fontFamily: FONT_MONO }}
            >
              answer
            </p>
            <pre
              className="whitespace-pre-wrap rounded-xl border border-white/[0.08] p-4 text-[12px] leading-relaxed text-neutral-300"
              style={{ fontFamily: FONT_MONO }}
            >
              {liveOutput}
            </pre>
          </div>
        )}

        {status === "failed" && (
          <div className="text-sm text-red-400 bg-red-950/20 border border-red-900 rounded-xl p-5">
            {error || "Couldn't find a repository."}
            <button
              onClick={handleRetry}
              className="mt-3 block text-xs text-red-300 underline underline-offset-2 hover:text-red-200"
            >
              Try again
            </button>
          </div>
        )}

        {status === "succeeded" && parseFailed && (
          <div className="text-xs text-amber-400 bg-amber-950/20 border border-amber-900 rounded-xl p-4">
            Couldn't parse the agent's output — showing raw response instead.
            <pre className="mt-3 whitespace-pre-wrap text-neutral-300">
              {raw}
            </pre>
          </div>
        )}

        {status === "succeeded" && !parseFailed && repository && (
          <div className="rounded-2xl border border-white/[0.08] p-8">
            <p
              className="text-[11px] tracking-[0.22em] uppercase mb-3 text-neutral-500"
              style={{ fontFamily: FONT_MONO }}
            >
              {repository.primaryTechnology} · {repository.difficulty} · fit{" "}
              {repository.fitScore}
            </p>
            <h1
              className="text-[1.75rem] leading-tight font-medium tracking-tight"
              style={{ fontFamily: FONT_DISPLAY }}
            >
              {repository.fullName}
            </h1>
            <p className="mt-3 text-sm text-neutral-400">
              {repository.description}
            </p>

            <p className="mt-6 text-[14px] leading-relaxed text-neutral-300">
              {repository.whatItDoes}
            </p>

            <p className="mt-4 text-[13px] leading-relaxed text-neutral-400 italic border-l-2 border-white/20 pl-4">
              {repository.whyItMatches}
            </p>

            {repository.keyComponents?.length > 0 && (
              <div className="mt-8">
                <p
                  className="text-[11px] tracking-[0.16em] uppercase text-neutral-500 mb-3"
                  style={{ fontFamily: FONT_MONO }}
                >
                  key components
                </p>
                <ul className="space-y-2">
                  {repository.keyComponents.map((c) => (
                    <li key={c.name} className="text-[13px] text-neutral-300">
                      <span className="text-white">{c.name}</span> —{" "}
                      {c.description}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="mt-6 text-[13px] text-neutral-400">
              Start with:{" "}
              <span className="text-white">
                {repository.recommendedStartingPoint}
              </span>
            </p>

            <a
              href={repository.url}
              target="_blank"
              rel="noreferrer"
              className="mt-8 inline-flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-black hover:bg-neutral-200 transition-colors"
            >
              Open on GitHub →
            </a>
          </div>
        )}
      </main>
    </div>
  );
}

export default AgentPage;
