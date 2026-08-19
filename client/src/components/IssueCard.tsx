import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "../store/store";
import type { GithubIssue } from "../store/issuesSlice";
import { investigateIssue } from "../store/investigationSlice";

function IssueCard({ issue }: { issue: GithubIssue }) {
  const dispatch = useDispatch<AppDispatch>();
  const { repoFullName } = useSelector((state: RootState) => state.issues);
  const { status, issueNumber } = useSelector(
    (state: RootState) => state.investigation,
  );

  const isInvestigating =
    status === "loading" && issueNumber === issue.number;

  const handleInvestigate = () => {
    if (!repoFullName) return;
    dispatch(investigateIssue({ repoFullName, issueNumber: issue.number }));
  };

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3.5 hover:border-neutral-700 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <a
          href={issue.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-start gap-2 min-w-0"
        >
          <span className="text-xs font-mono text-neutral-600 shrink-0 mt-0.5">
            #{issue.number}
          </span>
          <span className="text-sm text-white leading-snug">{issue.title}</span>
        </a>
      </div>

      {issue.labels?.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1 pl-7">
          {issue.labels.slice(0, 4).map((label) => (
            <span
              key={label}
              className="rounded-full bg-neutral-950 border border-neutral-800 px-2 py-0.5 text-[10px] text-neutral-400"
            >
              {label}
            </span>
          ))}
        </div>
      )}

      <button
        onClick={handleInvestigate}
        disabled={isInvestigating}
        className="mt-3 w-full rounded-lg bg-neutral-800 py-1.5 text-xs font-medium text-white hover:bg-neutral-700 transition-colors disabled:opacity-50"
      >
        {isInvestigating ? "Investigating…" : "Explain this issue"}
      </button>
    </div>
  );
}

export default IssueCard;