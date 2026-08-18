import { Router, Request, Response } from "express";
import { agentClient, OSS_ISSUE_AGENT_NAME } from "../services/agentClient";

const DEBUG_AGENT_EVENTS = process.env.DEBUG_AGENT_EVENTS === "true";
const router = Router();

export interface GithubIssue {
  id: number;
  number: number;
  title: string;
  html_url: string;
  state: string;
  labels?: { name: string; color?: string }[];
  user?: { login: string; avatar_url?: string };
  created_at?: string;
  comments?: number;
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

// The agent is instructed to return raw JSON only, but models still
// occasionally wrap it in ```json fences or add stray whitespace/prose.
// This strips fences and tries a few reasonable shapes.
function parseIssuesJSON(text: string): GithubIssue[] {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```json\s*/i, "").replace(/```\s*$/, "");
  cleaned = cleaned.replace(/^```\s*/, "");

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Last resort: grab the first {...} or [...] block in the text
    const match = cleaned.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
    if (!match) throw new Error("Could not locate JSON in agent output");
    parsed = JSON.parse(match[0]);
  }

  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.issues)) return parsed.issues;
  if (Array.isArray(parsed.data)) return parsed.data;

  throw new Error("Parsed JSON did not contain an issues array");
}

router.post("/discover", async (req: Request, res: Response) => {
  try {
    const { repoFullName } = req.body as { repoFullName?: string };
    if (!repoFullName || !repoFullName.includes("/")) {
      return res.status(400).json({
        success: false,
        error: "repoFullName is required in 'owner/repo' format",
      });
    }

    const session = await agentClient.createSession({
      agentName: OSS_ISSUE_AGENT_NAME,
    });
    const turn = session.prepareTurn({
      input: [
        {
          type: "user.message",
          content: `Repository: ${repoFullName}\nFetch the open issues for this repository.`,
        },
      ],
    });

    let finalText = "";
    for await (const data of turn.execute({ stream: true })) {
      const chunk = extractText(data.event);
      if (chunk) finalText += chunk;
      if (DEBUG_AGENT_EVENTS) {
        console.log(
          `[issue agent event] ${data.event?.type}`,
          JSON.stringify(data.event),
        );
      }
    }

    finalText = finalText.trim();

    let issues: GithubIssue[];
    try {
      issues = parseIssuesJSON(finalText);
    } catch (parseErr: any) {
      console.warn("Issue discover: JSON parse failed", parseErr.message);
      return res.json({
        success: true,
        issues: [],
        raw: finalText,
        parseFailed: true,
      });
    }

    return res.json({
      success: true,
      issues,
      raw: finalText,
      parseFailed: false,
    });
  } catch (error: any) {
    console.error("Issue discover error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
