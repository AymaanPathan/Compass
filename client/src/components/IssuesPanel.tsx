import { useSelector } from "react-redux";
import type { RootState } from "../store/store";
import IssueCard from "./IssueCard";

function IssuesPanel() {
  const { issues, status, error } = useSelector(
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
    </div>
  );
}

export default IssuesPanel;
