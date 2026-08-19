import { Router, Request, Response } from "express";
import { agentClient, OSS_ISSUES_AGENT_NAME } from "../services/agentClient";
import { withAgentRetry } from "../utils/retryAgentTurn";

const DEBUG_AGENT_EVENTS = process.env.DEBUG_AGENT_EVENTS === "true";
const router = Router();

export interface GithubIssue {
  number: number;
  title: string;
  labels: string[];
  url: string;
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

function parseIssuesResponse(
  text: string,
): { issues: GithubIssue[]; nextCursor: string } | null {
  try {
    const cleaned = text.trim().replace(/^```json\s*|\s*```$/g, "");
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed.issues)) return null;
    return { issues: parsed.issues, nextCursor: parsed.nextCursor || "" };
  } catch {
    return null;
  }
}

async function runIssuesAgent(prompt: string): Promise<string> {
  return withAgentRetry(async () => {
    const session = await agentClient.createSession({
      agentName: OSS_ISSUES_AGENT_NAME,
    });

    const turn = session.prepareTurn({
      input: [{ type: "user.message", content: prompt }],
    });

    let finalText = "";
    for await (const data of turn.execute({ stream: true })) {
      const chunk = extractText(data.event);
      if (chunk) finalText += chunk;
      if (DEBUG_AGENT_EVENTS) {
        console.log(
          `[issues agent event] ${data.event?.type}`,
          JSON.stringify(data.event),
        );
      }
      // Surface turn-level errors (like the 429 you saw) as a real throw
      // so withAgentRetry can catch and retry them.
      if (
        data.event?.type === "turn.done" &&
        data.event?.state?.status === "error"
      ) {
        throw new Error(data.event.state.message || "Agent turn failed");
      }
    }

    return finalText.trim();
  });
}

router.post("/fetch", async (req: Request, res: Response) => {
  try {
    const { repoFullName, after } = req.body;
    if (!repoFullName) {
      return res
        .status(400)
        .json({ success: false, error: "repoFullName is required" });
    }

    const prompt = after
      ? `Repository: ${repoFullName}\nAfter cursor: ${after}`
      : `Repository: ${repoFullName}`;

    const finalText = await runIssuesAgent(prompt);
    const parsed = parseIssuesResponse(finalText);

    if (!parsed) {
      console.warn(
        "Issues agent: failed to parse JSON, returning raw fallback",
      );
      return res.json({
        success: true,
        issues: [],
        nextCursor: "",
        raw: finalText,
        parseFailed: true,
      });
    }

    return res.json({
      success: true,
      issues: parsed.issues,
      nextCursor: parsed.nextCursor,
      raw: finalText,
      parseFailed: false,
    });
  } catch (error: any) {
    console.error("Issues fetch error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
