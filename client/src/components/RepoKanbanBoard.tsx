import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "../store/store";
import {
  OSS_COLUMNS,
  moveRepoToColumn,
  type OssColumnId,
} from "../store/ossSlice";
import RepoCard from "./RepoCard";

function RepoKanbanBoard() {
  const dispatch = useDispatch<AppDispatch>();
  const { repositories, bestMatch, columns } = useSelector(
    (state: RootState) => state.oss,
  );

  const repoByUrl = Object.fromEntries(repositories.map((r) => [r.url, r]));

  const handleDragStart = (e: React.DragEvent, repoUrl: string) => {
    e.dataTransfer.setData("text/plain", repoUrl);
  };

  const handleDrop = (e: React.DragEvent, toColumn: OssColumnId) => {
    e.preventDefault();
    const repoUrl = e.dataTransfer.getData("text/plain");
    if (repoUrl) dispatch(moveRepoToColumn({ repoUrl, toColumn }));
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {OSS_COLUMNS.map((col) => (
        <div
          key={col.id}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => handleDrop(e, col.id)}
          className="rounded-xl border border-neutral-800 bg-neutral-900 p-3 min-h-[320px]"
        >
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-300">
              {col.title}
            </h3>
            <span className="text-[10px] text-neutral-600 bg-neutral-800 rounded-full px-2 py-0.5">
              {columns[col.id].length}
            </span>
          </div>
          <p className="text-[11px] text-neutral-600 mb-3">{col.hint}</p>

          <div className="flex flex-col gap-2.5">
            {columns[col.id].map((url) => {
              const repo = repoByUrl[url];
              if (!repo) return null;
              return (
                <RepoCard
                  key={url}
                  repo={repo}
                  isBestMatch={bestMatch?.name === repo.name}
                  column={col.id}
                  onDragStart={handleDragStart}
                />
              );
            })}
            {columns[col.id].length === 0 && (
              <p className="text-[11px] text-neutral-700 italic py-8 text-center">
                Drag a repo here
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default RepoKanbanBoard;
