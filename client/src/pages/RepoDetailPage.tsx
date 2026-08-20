import { useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "../store/store";
import { fetchIssuesForRepo, resetIssues } from "../store/issuesSlice";
import { resetInvestigation } from "../store/investigationSlice";
import IssuesPanel from "../components/IssuesPanel";
import InvestigationPanel from "../components/InvestigationPanel";
import CodeViewerModal from "../components/CodeViewerModal";

function RepoDetailPage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const { selectedRepo } = useSelector((state: RootState) => state.oss);

  const repoFullName = `${owner}/${repo}`;

  // Guards against React StrictMode's double-invoke in dev, and against
  // any accidental double-mount, which was firing two parallel agent
  // sessions for the same repo and triggering 429s.
  const firedForRef = useRef<string | null>(null);

  useEffect(() => {
    if (firedForRef.current === repoFullName) return;
    firedForRef.current = repoFullName;

    dispatch(fetchIssuesForRepo(repoFullName));

    return () => {
      dispatch(resetIssues());
      dispatch(resetInvestigation());
      firedForRef.current = null;
    };
  }, [repoFullName, dispatch]);

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <header className="sticky top-0 z-10 border-b border-neutral-800/80 bg-neutral-950/90 backdrop-blur">
        <div className="mx-auto max-w-4xl px-6 py-3.5">
          <button
            onClick={() => navigate("/")}
            className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
          >
            ← Back to analysis
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10">
        <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-lg font-semibold">{repoFullName}</h1>
            {selectedRepo && (
              <span className="shrink-0 text-[11px] font-medium rounded-full px-2 py-0.5 text-emerald-400 bg-emerald-950/40">
                {selectedRepo.matchScore}/5
              </span>
            )}
          </div>

          <a
            href={`https://github.com/${repoFullName}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-block text-xs text-blue-400 hover:text-blue-300 hover:underline"
          >
            github.com/{repoFullName}
          </a>

          {selectedRepo ? (
            <>
              <p className="mt-4 text-sm text-neutral-300 leading-relaxed">
                {selectedRepo.description}
              </p>
              <p className="mt-3 text-xs text-neutral-500">
                <span className="text-neutral-400 font-medium">Why it matches: </span>
                {selectedRepo.whyItMatches}
              </p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {selectedRepo.matchingTechnologies.map((tech) => (
                  <span
                    key={tech}
                    className="rounded-full bg-neutral-950 border border-neutral-800 px-2.5 py-1 text-[11px] text-neutral-400"
                  >
                    {tech}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <p className="mt-4 text-sm text-neutral-500">
              No cached details for this repo — open it from the analysis to
              see the full match summary.
            </p>
          )}
        </section>

        <section className="mt-8">
          <h2 className="text-sm font-medium text-neutral-400 mb-4">
            Open issues
          </h2>
          <IssuesPanel />
          <InvestigationPanel />
        </section>
      </main>

      <CodeViewerModal />
    </div>
  );
}

export default RepoDetailPage;