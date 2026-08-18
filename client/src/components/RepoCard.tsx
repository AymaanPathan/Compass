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
            <a
              href={repo.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold text-white hover:underline"
            >
              {repo.name}
            </a>
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