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

Find one suitable open-source repository and one real open issue that matches this developer's skills.`;
}

// Pulls plain text out of a streamed agent event.
// NOTE: the SDK docs don't publish the exact event schema — log the raw
// `data.event` once in dev and adjust the field names below to match.
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

// Non-streaming — simplest to consume from Redux
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
      // Uncomment while debugging to see the real event shape:
      // console.log(JSON.stringify(data.event, null, 2));
    }

    return res.json({
      success: true,
      recommendation: finalText.trim(),
      status: turn?.state?.status,
    });
  } catch (error: any) {
    console.error("OSS discover error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Streaming (SSE) — use if you want live token-by-token output
router.post("/discover/stream", async (req: Request, res: Response) => {
  try {
    const { stack, repos } = req.body;
    if (!stack) {
      return res.status(400).json({ error: "stack is required" });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    (res as any).flushHeaders?.();

    const session = await agentClient.createSession({
      agentName: OSS_AGENT_NAME,
    });
    const turn = session.prepareTurn({
      input: [
        { type: "user.message", content: buildStackPrompt(stack, repos) },
      ],
    });

    for await (const data of turn.execute({ stream: true })) {
      const chunk = extractText(data.event);
      if (chunk) {
        res.write(
          `data: ${JSON.stringify({ type: "text", content: chunk })}\n\n`,
        );
      }
      if (DEBUG_AGENT_EVENTS) {
        console.log(
          `[agent event] ${data.event?.type}`,
          JSON.stringify(data.event),
        );
      }
    }
    res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    res.end();
  } catch (error: any) {
    console.error("OSS discover stream error:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    } else {
      res.write(
        `data: ${JSON.stringify({ type: "error", error: error.message })}\n\n`,
      );
      res.end();
    }
  }
});

export default router;
