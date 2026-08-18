import { Router, Request, Response } from "express";
import { agentClient, OSS_AGENT_NAME } from "../services/agentClient";

const DEBUG_AGENT_EVENTS = process.env.DEBUG_AGENT_EVENTS === "true";
const router = Router();

interface LanguageStat {
  language: string;
  repoCount: number;
}

interface Repo {
  fullName: string;
  description: string | null;
  language: string | null;
}

export interface RepoRecommendation {
  rank: number;
  name: string;
  url: string;
  description: string;
  whyItMatches: string;
  matchingTechnologies: string[];
  matchScore: number;
}

interface BestMatch {
  name: string;
  reason: string;
}

function buildStackPrompt(
  stack: {
    topLanguages: LanguageStat[];
    totalRepos: number;
    originalRepos: number;
    totalStars: number;
  },
  repos: Repo[] = [],
) {
  const topLangs =
    stack?.topLanguages
      ?.map((l) => `${l.language} (${l.repoCount} repos)`)
      .join(", ") || "Unknown";

  const sampleRepos = repos
    .slice(0, 5)
    .map(
      (r) =>
        `- ${r.fullName}: ${r.description || "no description"} [${r.language || "n/a"}]`,
    )
    .join("\n");

  return `Developer skill profile:
Top languages: ${topLangs}
Total repos: ${stack?.totalRepos ?? "unknown"}, Original: ${stack?.originalRepos ?? "unknown"}, Stars: ${stack?.totalStars ?? "unknown"}

Recent repositories:
${sampleRepos || "N/A"}

Find 5 suitable open-source repositories that match this developer's skills, ranked by contribution potential.`;
}

function extractText(event: any): string | null {
  if (!event) return null;
  if (
    (event.type === "model.message.delta" || event.type === "model.message") &&
    typeof event.content === "string" &&
    event.content.length > 0
  ) {
    return event.content;
  }
  return null;
}

// Parses the agent's fixed markdown format into structured repo objects.
// Expected per-repo block:
//   ## #1 — repo-name
//   **URL:** https://...
//   **Description:**
//   ...
//   **Why it matches:**
//   ...
//   **Matching technologies:**
//   ...
//   **Match Score:** 5/5
function parseRecommendations(text: string): {
  repositories: RepoRecommendation[];
  bestMatch: BestMatch | null;
} {
  const repositories: RepoRecommendation[] = [];

  const repoRegex =
    /##\s*#(\d+)\s*[—-]\s*(.+?)\s*\n+\*\*URL:\*\*\s*(\S+)\s*\n+\*\*Description:\*\*\s*\n?(.+?)\s*\n+\*\*Why it matches:\*\*\s*\n?(.+?)\s*\n+\*\*Matching technologies:\*\*\s*\n?(.+?)\s*\n+\*\*Match Score:\*\*\s*(\d+(?:\.\d+)?)\s*\/\s*5/gs;

  let match: RegExpExecArray | null;
  while ((match = repoRegex.exec(text)) !== null) {
    const [, rank, name, url, description, whyItMatches, techs, score] = match;
    repositories.push({
      rank: Number(rank),
      name: name.trim(),
      url: url.trim(),
      description: description.trim(),
      whyItMatches: whyItMatches.trim(),
      matchingTechnologies: techs
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      matchScore: Number(score),
    });
  }

  let bestMatch: BestMatch | null = null;
  const bestMatchRegex =
    /##\s*Best Match\s*\n+\*\*Repository:\*\*\s*(.+?)\s*\n+([\s\S]+?)$/;
  const bestMatchResult = bestMatchRegex.exec(text);
  if (bestMatchResult) {
    bestMatch = {
      name: bestMatchResult[1].trim(),
      reason: bestMatchResult[2].trim(),
    };
  }

  return { repositories, bestMatch };
}

router.post("/discover", async (req: Request, res: Response) => {
  try {
    const { stack, repos } = req.body;
    if (!stack) {
      return res
        .status(400)
        .json({ success: false, error: "stack is required" });
    }

    const session = await agentClient.createSession({
      agentName: OSS_AGENT_NAME,
    });
    const turn = session.prepareTurn({
      input: [
        { type: "user.message", content: buildStackPrompt(stack, repos) },
      ],
    });

    let finalText = "";
    for await (const data of turn.execute({ stream: true })) {
      const chunk = extractText(data.event);
      if (chunk) finalText += chunk;
      if (DEBUG_AGENT_EVENTS) {
        console.log(
          `[agent event] ${data.event?.type}`,
          JSON.stringify(data.event),
        );
      }
    }

    finalText = finalText.trim();
    const { repositories, bestMatch } = parseRecommendations(finalText);

    if (repositories.length === 0) {
      // Parsing failed — the agent didn't follow the format exactly.
      // Fall back to raw text so the frontend can still show *something*
      // instead of a blank screen, and flag it so we can debug the format.
      console.warn(
        "OSS discover: parsed 0 repositories from agent output, returning raw fallback",
      );
      return res.json({
        success: true,
        repositories: [],
        bestMatch: null,
        raw: finalText,
        parseFailed: true,
        status: turn?.state?.status,
      });
    }

    return res.json({
      success: true,
      repositories,
      bestMatch,
      raw: finalText,
      parseFailed: false,
      status: turn?.state?.status,
    });
  } catch (error: any) {
    console.error("OSS discover error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
