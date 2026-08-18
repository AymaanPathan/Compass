import type { RepoRecommendation } from "../store/ossSlice";

interface RepoCardProps {
  repo: RepoRecommendation;
  isBestMatch: boolean;
  isSelected: boolean;
  onSelect: (repo: RepoRecommendation) => void;
}

function RepoCard({ repo, isBestMatch, isSelected, onSelect }: RepoCardProps) {
  return (
    <div
      className={`rounded-xl border p-4 text-left transition-colors ${
        isSelected
          ? "border-white bg-neutral-800"
          : "border-neutral-800 bg-neutral-950 hover:border-neutral-700"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-neutral-500">
              #{repo.rank}
            </span>
            <span className="text-sm font-semibold text-white">
              {repo.name}
            </span>
            {isBestMatch && (
              <span className="rounded-full bg-emerald-900/50 text-emerald-400 text-[10px] px-2 py-0.5 font-medium">
                Best Match
              </span>
            )}
          </div>
        </div>
        <span className="shrink-0 text-xs font-medium text-neutral-300 bg-neutral-800 rounded-full px-2 py-1">
          {repo.matchScore}/5
        </span>
      </div>

      <a
        href={repo.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 hover:underline break-all"
      >
        <svg
          className="shrink-0"
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="currentColor"
        >
          <path d="M7.775 3.275a.75.75 0 0 0 1.06 1.06l1.25-1.25a2 2 0 1 1 2.83 2.83l-2.5 2.5a2 2 0 0 1-2.83 0 .75.75 0 0 0-1.06 1.06 3.5 3.5 0 0 0 4.95 0l2.5-2.5a3.5 3.5 0 0 0-4.95-4.95l-1.25 1.25Zm-4.69 9.64a2 2 0 0 1 0-2.83l2.5-2.5a2 2 0 0 1 2.83 0 .75.75 0 0 0 1.06-1.06 3.5 3.5 0 0 0-4.95 0l-2.5 2.5a3.5 3.5 0 0 0 4.95 4.95l1.25-1.25a.75.75 0 0 0-1.06-1.06l-1.25 1.25a2 2 0 0 1-2.83 0Z" />
        </svg>
        {repo.url.replace("https://github.com/", "")}
      </a>

      <p className="mt-2 text-xs text-neutral-400">{repo.description}</p>

      <p className="mt-2 text-xs text-neutral-500">
        <span className="text-neutral-400 font-medium">Why it matches: </span>
        {repo.whyItMatches}
      </p>

      <div className="mt-3 flex flex-wrap gap-1">
        {repo.matchingTechnologies.map((tech) => (
          <span
            key={tech}
            className="rounded-full bg-neutral-900 border border-neutral-800 px-2 py-0.5 text-[10px] text-neutral-400"
          >
            {tech}
          </span>
        ))}
      </div>

      <button
        onClick={() => onSelect(repo)}
        className={`mt-4 w-full rounded-lg py-1.5 text-xs font-medium transition-colors ${
          isSelected
            ? "bg-white text-black"
            : "bg-neutral-800 text-white hover:bg-neutral-700"
        }`}
      >
        {isSelected ? "Selected" : "Select Repository"}
      </button>
    </div>
  );
}

export default RepoCard;