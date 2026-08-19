import { useNavigate } from "react-router-dom";
import { useDispatch } from "react-redux";
import type { AppDispatch } from "../store/store";
import type { RepoRecommendation } from "../store/ossSlice";
import { selectRepository, type OssColumnId } from "../store/ossSlice";

interface RepoCardProps {
  repo: RepoRecommendation;
  isBestMatch: boolean;
  column: OssColumnId;
  onDragStart: (e: React.DragEvent, repoUrl: string) => void;
}

const scoreColor: Record<number, string> = {
  5: "text-emerald-400 bg-emerald-950/40",
  4: "text-sky-400 bg-sky-950/40",
  3: "text-amber-400 bg-amber-950/40",
  2: "text-neutral-400 bg-neutral-800",
  1: "text-neutral-500 bg-neutral-800",
};

function RepoCard({ repo, isBestMatch, column, onDragStart }: RepoCardProps) {
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();

  const handleExplore = () => {
    dispatch(selectRepository(repo));
    const path = repo.url.replace("https://github.com/", "");
    navigate(`/repo/${path}`);
  };

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, repo.url)}
      className="cursor-grab active:cursor-grabbing rounded-lg border border-neutral-800 bg-neutral-950 p-3.5 hover:border-neutral-700 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[10px] font-mono text-neutral-600">
            #{repo.rank}
          </span>
          <span className="text-sm font-semibold text-white truncate">
            {repo.name}
          </span>
        </div>
        <span
          className={`shrink-0 text-[10px] font-medium rounded-full px-1.5 py-0.5 ${
            scoreColor[repo.matchScore] || "text-neutral-400 bg-neutral-800"
          }`}
        >
          {repo.matchScore}/5
        </span>
      </div>

      {isBestMatch && (
        <span className="mt-1.5 inline-block rounded-full bg-emerald-900/40 text-emerald-400 text-[10px] px-2 py-0.5 font-medium">
          Best Match
        </span>
      )}

      <p className="mt-2 text-xs text-neutral-400 leading-relaxed line-clamp-2">
        {repo.description}
      </p>

      <div className="mt-2.5 flex flex-wrap gap-1">
        {repo.matchingTechnologies.slice(0, 4).map((tech) => (
          <span
            key={tech}
            className="rounded-full bg-neutral-900 border border-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-400"
          >
            {tech}
          </span>
        ))}
      </div>

      {column === "selected" && (
        <button
          onClick={handleExplore}
          className="mt-3 w-full rounded-lg bg-white py-1.5 text-xs font-medium text-black hover:bg-neutral-200 transition-colors"
        >
          Explore repository →
        </button>
      )}
    </div>
  );
}

export default RepoCard;
