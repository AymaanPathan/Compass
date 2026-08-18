import type { GithubIssue } from "../store/issuesSlice";

interface IssueCardProps {
  issue: GithubIssue;
  onDragStart: (e: React.DragEvent, issueId: number) => void;
}

function IssueCard({ issue, onDragStart }: IssueCardProps) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, issue.id)}
      className="cursor-grab active:cursor-grabbing rounded-lg border border-neutral-800 bg-neutral-950 p-3 text-left hover:border-neutral-700 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-mono text-neutral-500">#{issue.number}</span>
        {issue.comments !== undefined && (
          <span className="text-[10px] text-neutral-500">💬 {issue.comments}</span>
        )}
      </div>

      <a
        href={issue.html_url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 block text-sm font-medium text-white hover:text-blue-400 hover:underline"
      >
        {issue.title}
      </a>

      {issue.labels && issue.labels.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {issue.labels.slice(0, 3).map((label) => (
            <span
              key={label.name}
              className="rounded-full bg-neutral-900 border border-neutral-800 px-2 py-0.5 text-[10px] text-neutral-400"
            >
              {label.name}
            </span>
          ))}
        </div>
      )}

      {issue.user && (
        <div className="mt-2 flex items-center gap-1.5">
          {issue.user.avatar_url && (
            <img
              src={issue.user.avatar_url}
              alt={issue.user.login}
              className="h-4 w-4 rounded-full"
            />
          )}
          <span className="text-[10px] text-neutral-500">{issue.user.login}</span>
        </div>
      )}
    </div>
  );
}

export default IssueCard;