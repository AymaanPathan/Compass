import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "../store/store";
import { fetchFileContent } from "../store/fileContentSlice";

function InvestigationPanel() {
  const dispatch = useDispatch<AppDispatch>();
  const { data, status, error, parseFailed, raw, issueNumber, repoFullName } =
    useSelector((state: RootState) => state.investigation);

  if (status === "idle") return null;

  if (status === "loading") {
    return (
      <div className="mt-4 flex items-center justify-center gap-2 text-xs text-neutral-500 py-8 rounded-xl border border-neutral-800 bg-neutral-900">
        <div className="h-3 w-3 rounded-full border-2 border-neutral-700 border-t-white animate-spin" />
        Investigating issue #{issueNumber}…
      </div>
    );
  }

  if (status === "failed") {
    return <p className="mt-4 text-xs text-red-400">{error}</p>;
  }

  if (parseFailed || !data) {
    return (
      <div className="mt-4 text-left text-xs text-amber-400 bg-amber-950/30 border border-amber-900 rounded-xl p-4">
        Couldn't parse investigation output — showing raw output instead.
        <pre className="mt-2 whitespace-pre-wrap text-neutral-300">{raw}</pre>
      </div>
    );
  }

  const handleViewCode = (path: string) => {
    if (!repoFullName) return;
    const [owner, repo] = repoFullName.split("/");
    dispatch(fetchFileContent({ owner, repo, path }));
  };

  return (
    <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-900 p-6 space-y-6">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-white">
          {data.issueSummary.title || `Issue #${issueNumber}`}
        </h3>
        <ConfidenceBadge
          value={data.confidence}
          isConfirmed={data.likelyRootCause.isConfirmed}
        />
      </div>

      <Section title="What this issue is about">
        <p className="text-sm text-neutral-300 leading-relaxed">
          {data.issueSummary.simpleExplanation}
        </p>
      </Section>

      <Section title="Current vs expected behavior">
        <p className="text-xs text-neutral-400 mb-2">
          {data.currentBehavior.summary}
        </p>
        <BulletList items={data.currentBehavior.technicalDetails} />
        <div className="mt-3 rounded-lg bg-neutral-950 border border-neutral-800 p-3">
          <p className="text-xs text-neutral-400">
            <span className="text-neutral-300 font-medium">Expected: </span>
            {data.expectedBehavior.summary}
          </p>
          {data.expectedBehavior.differenceFromCurrentBehavior && (
            <p className="mt-1.5 text-[11px] text-neutral-500">
              {data.expectedBehavior.differenceFromCurrentBehavior}
            </p>
          )}
        </div>
      </Section>

      <Section title="Relevant files">
        <div className="flex flex-col gap-2.5">
          {data.relevantFiles.map((f) => (
            <div
              key={f.path}
              className="rounded-lg border border-neutral-800 bg-neutral-950 p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="font-mono text-xs text-neutral-300 break-all">
                    {f.path}
                  </span>
                  <p className="text-[11px] text-neutral-500 mt-0.5">
                    {f.reason}
                  </p>
                </div>
                <button
                  onClick={() => handleViewCode(f.path)}
                  className="shrink-0 rounded-md bg-neutral-800 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-neutral-700 transition-colors"
                >
                  View Code
                </button>
              </div>

              {f.relevantFunctions?.length > 0 && (
                <div className="mt-2.5 flex flex-col gap-1.5 pl-1 border-l border-neutral-800">
                  {f.relevantFunctions.map((fn) => (
                    <div key={fn.name} className="pl-2.5">
                      <span className="font-mono text-[11px] text-neutral-300">
                        {fn.name}
                      </span>
                      <p className="text-[11px] text-neutral-500">
                        {fn.purpose}
                      </p>
                      <p className="text-[11px] text-neutral-600 italic">
                        {fn.relevanceToIssue}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>

      <Section title="How the code currently works">
        <div className="flex flex-col gap-2">
          {data.howCodeCurrentlyWorks.map((s) => (
            <div key={s.step} className="flex gap-2.5 text-xs">
              <span className="text-neutral-600 font-mono shrink-0">
                {s.step}.
              </span>
              <div>
                <span className="font-mono text-neutral-400">
                  {s.file}
                  {s.function ? ` → ${s.function}` : ""}
                </span>
                <p className="text-neutral-400 mt-0.5">{s.description}</p>
              </div>
            </div>
          ))}
        </div>
        {data.currentCodeExplanation && (
          <p className="mt-3 text-xs text-neutral-400 leading-relaxed border-t border-neutral-800 pt-3">
            {data.currentCodeExplanation}
          </p>
        )}
      </Section>

      <Section title="Likely root cause">
        <p className="text-sm text-neutral-300 leading-relaxed">
          {data.likelyRootCause.summary}
        </p>
        <p className="mt-2 text-xs text-neutral-400 leading-relaxed">
          {data.likelyRootCause.detailedExplanation}
        </p>
        {data.likelyRootCause.evidence?.length > 0 && (
          <div className="mt-2">
            <p className="text-[11px] text-neutral-500 font-medium mb-1">
              Evidence
            </p>
            <BulletList items={data.likelyRootCause.evidence} />
          </div>
        )}
        <span
          className={`mt-2 inline-block text-[10px] font-medium rounded-full px-2 py-0.5 ${
            data.likelyRootCause.isConfirmed
              ? "text-emerald-400 bg-emerald-950/40"
              : "text-amber-400 bg-amber-950/40"
          }`}
        >
          {data.likelyRootCause.isConfirmed
            ? "Confirmed by code"
            : "Hypothesis"}
        </span>
      </Section>

      <Section title="Recommended approach">
        <div className="flex flex-col gap-2">
          {data.recommendedApproach.map((s) => (
            <div key={s.step} className="flex gap-2.5 text-xs">
              <span className="text-neutral-600 font-mono shrink-0">
                {s.step}.
              </span>
              <div>
                <p className="text-neutral-300 font-medium">{s.action}</p>
                <p className="text-neutral-500 mt-0.5">{s.details}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Suggested tests">
        <div className="flex flex-col gap-2">
          {data.suggestedTests.map((t, i) => (
            <div
              key={i}
              className="rounded-lg bg-neutral-950 border border-neutral-800 p-3 text-xs"
            >
              <p className="text-neutral-300 font-medium">{t.scenario}</p>
              <p className="text-neutral-500 mt-1">{t.whatToTest}</p>
              <p className="text-neutral-600 mt-1">
                <span className="text-neutral-500">Expected: </span>
                {t.expectedResult}
              </p>
            </div>
          ))}
        </div>
      </Section>

      {data.investigationLimitations?.length > 0 && (
        <Section title="Investigation limitations">
          <BulletList items={data.investigationLimitations} />
        </Section>
      )}
    </div>
  );
}

function ConfidenceBadge({
  value,
  isConfirmed,
}: {
  value: number;
  isConfirmed: boolean;
}) {
  const pct = Math.round(value * 100);
  const color = isConfirmed
    ? "text-emerald-400 bg-emerald-950/40"
    : pct >= 60
      ? "text-sky-400 bg-sky-950/40"
      : "text-amber-400 bg-amber-950/40";
  return (
    <span
      className={`shrink-0 text-[11px] font-medium rounded-full px-2 py-0.5 ${color}`}
    >
      {pct}% confidence
    </span>
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
    <div>
      <h4 className="text-xs font-medium uppercase tracking-wide text-neutral-500 mb-2">
        {title}
      </h4>
      {children}
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
  if (!items?.length) return <p className="text-xs text-neutral-600">—</p>;
  return (
    <ul className="space-y-1">
      {items.map((item, i) => (
        <li key={i} className="text-xs text-neutral-400 flex gap-2">
          <span className="text-neutral-600">•</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default InvestigationPanel;
