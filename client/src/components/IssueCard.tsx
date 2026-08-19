import type { GithubIssue } from "../store/issuesSlice";

function IssueCard({ issue }: { issue: GithubIssue }) {
  return (
    <a
      href={issue.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-lg border border-neutral-800 bg-neutral-900 p-3.5 hover:border-neutral-700 transition-colors"
    >
      <div className="flex items-start gap-2">
        <span className="text-xs font-mono text-neutral-600 shrink-0 mt-0.5">
          #{issue.number}
        </span>
        <span className="text-sm text-white leading-snug">{issue.title}</span>
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
    </a>
  );
}

export default IssueCard;