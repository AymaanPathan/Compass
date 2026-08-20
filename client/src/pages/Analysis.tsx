import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "../store/store";
import { fetchGithubProfile } from "../store/githubSlice";
import { fetchDeveloperProfile } from "../store/devProfileSlice";

const FONT_DISPLAY = "'Fraunces', ui-serif, Georgia, serif";
const FONT_MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, monospace";

function Analysis() {
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();

  const { user, status } = useSelector((s: RootState) => s.auth);
  const { stack, status: githubStatus } = useSelector(
    (s: RootState) => s.github,
  );
  const {
    profile,
    parseFailed,
    raw,
    status: profileStatus,
    error: profileError,
  } = useSelector((s: RootState) => s.devProfile);

  // bounce unauthenticated users back to landing
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

  useEffect(() => {
    if (githubStatus === "succeeded" && profileStatus === "idle") {
      dispatch(fetchDeveloperProfile());
    }
  }, [githubStatus, profileStatus, dispatch]);

  const handleFindRepos = () => {
    sessionStorage.setItem("compass_auto_find", "1");
    navigate("/agent");
  };

  if (status === "loading" || status === "idle" || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="h-6 w-6 rounded-full border-2 border-neutral-800 border-t-white animate-spin" />
      </div>
    );
  }

  const isAnalyzing =
    githubStatus === "loading" ||
    githubStatus === "idle" ||
    profileStatus === "loading" ||
    profileStatus === "idle";

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="mx-auto w-full max-w-4xl px-6 py-6 flex items-center justify-between border-b border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <MarkGlyph />
          <span
            className="text-xs tracking-[0.2em] uppercase text-white"
            style={{ fontFamily: FONT_MONO }}
          >
            Compass
          </span>
        </div>
        <span
          className="text-[11px] text-neutral-600"
          style={{ fontFamily: FONT_MONO }}
        >
          @{user.username}
        </span>
      </header>

      <main className="mx-auto w-full max-w-4xl px-6 py-16">
        {isAnalyzing && (
          <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
            <div className="h-6 w-6 rounded-full border-2 border-neutral-800 border-t-white animate-spin" />
            <p className="text-sm text-neutral-400">
              Reading through your repositories…
            </p>
            <p
              className="text-[11px] text-neutral-600"
              style={{ fontFamily: FONT_MONO }}
            >
              this takes a moment — it's actually looking, not guessing
            </p>
          </div>
        )}

        {profileStatus === "failed" && (
          <div className="text-sm text-red-400 bg-red-950/20 border border-red-900 rounded-xl p-5">
            {profileError || "Couldn't analyze your profile."}
            <button
              onClick={() => dispatch(fetchDeveloperProfile())}
              className="mt-3 block text-xs text-red-300 underline underline-offset-2 hover:text-red-200"
            >
              Try again
            </button>
          </div>
        )}

        {profileStatus === "succeeded" && parseFailed && (
          <div className="text-xs text-amber-400 bg-amber-950/20 border border-amber-900 rounded-xl p-4">
            Couldn't parse the analysis — showing raw output instead.
            <pre className="mt-3 whitespace-pre-wrap text-neutral-300">
              {raw}
            </pre>
          </div>
        )}

        {profileStatus === "succeeded" && !parseFailed && profile && (
          <>
            {/* Hero */}
            <p
              className="text-[11px] tracking-[0.22em] uppercase mb-4 text-neutral-500"
              style={{ fontFamily: FONT_MONO }}
            >
              {profile.experienceLevel}
            </p>
            <h1
              className="text-[2.25rem] sm:text-[3rem] leading-[1.1] font-medium tracking-tight"
              style={{ fontFamily: FONT_DISPLAY }}
            >
              {profile.builderArchetype}
            </h1>
            <p className="mt-2 text-sm text-neutral-500">
              {profile.developerType}
            </p>

            <p className="mt-8 text-[15px] leading-relaxed text-neutral-300 max-w-2xl">
              {profile.summary}
            </p>

            <p
              className="mt-6 text-sm italic text-neutral-400 border-l-2 border-white/20 pl-4 max-w-xl"
              style={{ fontFamily: FONT_DISPLAY }}
            >
              "{profile.githubVibe}"
            </p>

            {/* Technologies */}
            <Section title="Strongest technologies">
              <div className="space-y-2.5 max-w-xl">
                {profile.strongestTechnologies.map((t) => (
                  <div key={t.name} className="flex items-center gap-3">
                    <span className="w-32 text-xs text-neutral-400 shrink-0 truncate">
                      {t.name}
                    </span>
                    <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                      <div
                        className="h-full bg-white/70"
                        style={{ width: `${t.confidence}%` }}
                      />
                    </div>
                    <span
                      className="w-8 text-right text-[11px] text-neutral-600"
                      style={{ fontFamily: FONT_MONO }}
                    >
                      {t.confidence}
                    </span>
                  </div>
                ))}
              </div>
            </Section>

            {/* Strengths + contribution areas */}
            <div className="mt-12 grid sm:grid-cols-2 gap-10">
              <Section title="Engineering strengths">
                <div className="flex flex-wrap gap-1.5">
                  {profile.strengths.map((s) => (
                    <Tag key={s}>{s}</Tag>
                  ))}
                </div>
              </Section>
              <Section title="Realistic contribution areas">
                <div className="flex flex-wrap gap-1.5">
                  {profile.contributionAreas.map((c) => (
                    <Tag key={c}>{c}</Tag>
                  ))}
                </div>
              </Section>
            </div>

            {/* Builder patterns */}
            <Section title="Builder patterns">
              <ul className="space-y-2.5 max-w-2xl">
                {profile.engineeringPatterns.map((p) => (
                  <li
                    key={p}
                    className="text-[14px] leading-relaxed text-neutral-300 flex gap-3"
                  >
                    <span className="text-neutral-600 shrink-0">→</span>
                    {p}
                  </li>
                ))}
              </ul>
            </Section>

            {/* Fun insights */}
            <Section title="Things we noticed">
              <div className="grid sm:grid-cols-3 gap-3">
                {profile.funInsights.map((f, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-white/[0.08] p-4 text-[13px] leading-relaxed text-neutral-300"
                  >
                    {f}
                  </div>
                ))}
              </div>
            </Section>

            {stack && (
              <p
                className="mt-10 text-[11px] text-neutral-600"
                style={{ fontFamily: FONT_MONO }}
              >
                based on {stack.totalRepos} repos · {stack.totalStars} stars ·{" "}
                {stack.originalRepos} original
              </p>
            )}

            <button
              onClick={handleFindRepos}
              className="mt-10 inline-flex items-center gap-2.5 rounded-lg bg-white px-6 py-3 text-sm font-medium text-black hover:bg-neutral-200 transition-colors"
            >
              Find me repos →
            </button>
          </>
        )}
      </main>

      <footer
        className="mx-auto w-full max-w-4xl px-6 py-8 text-[11px] text-neutral-600 border-t border-white/[0.06] mt-8"
        style={{ fontFamily: FONT_MONO }}
      >
        compass · analysis is generated, not audited
      </footer>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-12">
      <h2
        className="text-[11px] tracking-[0.16em] uppercase text-neutral-500 mb-4"
        style={{ fontFamily: FONT_MONO }}
      >
        {title}
      </h2>
      {children}
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-white/[0.06] px-3 py-1.5 text-[12px] text-neutral-300">
      {children}
    </span>
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

export default Analysis;
