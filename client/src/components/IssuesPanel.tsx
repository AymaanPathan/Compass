import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "../store/store";
import { fetchMoreIssues } from "../store/issuesSlice";
import IssueCard from "./IssueCard";

function IssuesPanel() {
  const dispatch = useDispatch<AppDispatch>();
  const { issues, status, error, parseFailed, raw, hasMore } = useSelector(
    (state: RootState) => state.issues,
  );

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center gap-2 text-xs text-neutral-500 py-12">
        <div className="h-3 w-3 rounded-full border-2 border-neutral-700 border-t-white animate-spin" />
        Fetching issues…
      </div>
    );
  }

  if (status === "failed") {
    return <p className="text-xs text-red-400 py-4">{error}</p>;
  }

  if (parseFailed) {
    return (
      <div className="text-left text-xs text-amber-400 bg-amber-950/30 border border-amber-900 rounded-xl p-4">
        Couldn't parse issue data — showing raw output instead.
        <pre className="mt-2 whitespace-pre-wrap text-neutral-300">{raw}</pre>
      </div>
    );
  }

  if (issues.length === 0) {
    return (
      <p className="text-xs text-neutral-600 py-8 text-center">
        No open issues found for this repository.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {issues.map((issue) => (
        <IssueCard key={issue.number} issue={issue} />
      ))}

      {hasMore && (
        <button
          onClick={() => dispatch(fetchMoreIssues())}
          disabled={status === "loadingMore"}
          className="mt-2 rounded-lg border border-neutral-800 py-2 text-xs font-medium text-neutral-300 hover:bg-neutral-900 transition-colors disabled:opacity-50"
        >
          {status === "loadingMore" ? "Loading…" : "Load more issues"}
        </button>
      )}
    </div>
  );
}

export default IssuesPanel;
