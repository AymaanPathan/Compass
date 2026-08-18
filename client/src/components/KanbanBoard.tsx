import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "../store/store";
import {
  KANBAN_COLUMNS,
  moveIssue,
  type KanbanColumnId,
} from "../store/issuesSlice";
import IssueCard from "./IssueCard";

function KanbanBoard() {
  const dispatch = useDispatch<AppDispatch>();
  const { issuesById, columns, repoFullName, status, error, parseFailed, raw } =
    useSelector((state: RootState) => state.issues);

  const handleDragStart = (e: React.DragEvent, issueId: number) => {
    e.dataTransfer.setData("text/plain", String(issueId));
  };

  const handleDrop = (e: React.DragEvent, columnId: KanbanColumnId) => {
    e.preventDefault();
    const issueId = Number(e.dataTransfer.getData("text/plain"));
    if (!Number.isNaN(issueId)) {
      dispatch(moveIssue({ issueId, toColumn: columnId }));
    }
  };

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center gap-2 text-xs text-neutral-500 py-8">
        <div className="h-3 w-3 rounded-full border-2 border-neutral-700 border-t-white animate-spin" />
        Fetching issues for {repoFullName}...
      </div>
    );
  }

  if (status === "failed") {
    return <p className="text-xs text-red-400 py-4">{error}</p>;
  }

  if (parseFailed) {
    return (
      <div className="text-left text-xs text-amber-400 bg-amber-950/30 border border-amber-900 rounded-lg p-3">
        Couldn't parse issue data — showing raw output instead.
        <pre className="mt-2 whitespace-pre-wrap text-neutral-300">{raw}</pre>
      </div>
    );
  }

  if (status !== "succeeded") return null;

  return (
    <div className="w-full">
      <p className="text-xs text-neutral-500 mb-3">
        Open issues for <span className="text-neutral-300">{repoFullName}</span>
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {KANBAN_COLUMNS.map((col) => (
          <div
            key={col.id}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => handleDrop(e, col.id)}
            className="rounded-xl border border-neutral-800 bg-neutral-900 p-3 min-h-[200px]"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                {col.title}
              </h3>
              <span className="text-[10px] text-neutral-600 bg-neutral-800 rounded-full px-2 py-0.5">
                {columns[col.id].length}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {columns[col.id].map((issueId) => (
                <IssueCard
                  key={issueId}
                  issue={issuesById[issueId]}
                  onDragStart={handleDragStart}
                />
              ))}
              {columns[col.id].length === 0 && (
                <p className="text-[11px] text-neutral-700 italic py-4 text-center">
                  Drop issues here
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default KanbanBoard;
