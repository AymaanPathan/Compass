import { Router, Request, Response } from "express";
import { agentClient, OSS_ISSUES_AGENT_NAME } from "../services/agentClient";
import { withAgentRetry } from "../utils/retryAgentTurn";

const DEBUG_AGENT_EVENTS = process.env.DEBUG_AGENT_EVENTS === "true";
const router = Router();

export interface GithubIssue {
  number: number;
  title: string;
  state: string;
  url: string;
  author: string;
  labels: string[];
  createdAt: string;
}

/**
 * Extracts the first balanced {...} block from a string. Protects
 * against trailing commentary or explanatory text the model sometimes
 * appends after the JSON object.
 */
function extractBalancedJson(input: string): string | null {
  const start = input.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = start; i < input.length; i++) {
    const ch = input[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (ch === "\\") {
      escapeNext = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) return input.slice(start, i + 1);
    }
  }

  // Reached end of string without closing brace — likely truncated output
  return null;
}

function stripMarkdownFences(input: string): string {
  return input
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function parseIssuesResponse(
  text: string,
): { repository: string; issues: GithubIssue[] } | null {
  try {
    const cleaned = stripMarkdownFences(text);
    const jsonStr = extractBalancedJson(cleaned);

    if (!jsonStr) {
      console.error(
        "[issues/fetch] no balanced JSON object found (output may be truncated)",
      );
      return null;
    }

    const parsed = JSON.parse(jsonStr);

    if (!Array.isArray(parsed.issues)) {
      console.error("[issues/fetch] response missing an issues array");
      return null;
    }

    const issues: GithubIssue[] = parsed.issues
      .filter((issue: any) => issue && typeof issue === "object")
      .map((issue: any) => ({
        number: Number(issue.number) || 0,
        title: String(issue.title || "Untitled issue"),
        state: String(issue.state || "open"),
        url: String(issue.url || ""),
        author: String(issue.author || "unknown"),
        labels: Array.isArray(issue.labels) ? issue.labels.map(String) : [],
        createdAt: String(issue.createdAt || ""),
      }))
      // An issue without a real URL is useless to the user and usually
      // means the model invented it — drop it rather than show a dead link.
      .filter((issue: GithubIssue) => issue.url.length > 0);

    return {
      repository: String(parsed.repository || ""),
      issues,
    };
  } catch (error) {
    console.error("[issues/fetch] failed to parse agent output:", error);
    console.error("[issues/fetch] raw output:", text);
    return null;
  }
}

async function runIssuesAgent(prompt: string): Promise<string> {
  return withAgentRetry(async () => {
    const { data: session } = await agentClient.sessions.create({
      agent: { name: OSS_ISSUES_AGENT_NAME },
    });

    const stream = await agentClient.sessions.createTurnStream(session.id, {
      input: [{ type: "user.message", content: prompt }],
    });

    let finalText = "";

    for await (const { data: event } of stream.withMetadata()) {
      if (DEBUG_AGENT_EVENTS) {
        console.log(
          `[issues agent event] ${event?.type}`,
          JSON.stringify(event),
        );
      }

      if (event.type === "model.message.delta" && event.threadId === "main") {
        finalText += event.content ?? "";
      }

      if (event.type === "turn.done") {
        if (event.state?.status === "error") {
          throw new Error((event.state as any)?.message || "Agent turn failed");
        }

        if (event.state?.status === "done" && event.state?.output?.content) {
          const content = event.state.output.content;

          finalText =
            typeof content === "string"
              ? content
              : content
                  .filter((item: any) => item.type === "text")
                  .map((item: any) => item.text)
                  .join("");
        }
      }
    }

    return finalText.trim();
  });
}

router.post("/fetch", async (req: Request, res: Response) => {
  try {
    const { repoFullName } = req.body;

    if (!repoFullName) {
      return res.status(400).json({
        success: false,
        error: "repoFullName is required",
      });
    }

    console.log("[issues/fetch] running agent for", repoFullName);

    const prompt = `Repository: ${repoFullName}`;
    const finalText = await runIssuesAgent(prompt);
    const parsed = parseIssuesResponse(finalText);

    if (!parsed) {
      console.warn("[issues/fetch] agent returned invalid issue data");

      return res.status(502).json({
        success: false,
        error: "Issue discovery agent returned an invalid response",
        raw: finalText,
      });
    }

    return res.json({
      success: true,
      repository: parsed.repository || repoFullName,
      issues: parsed.issues,
    });
  } catch (error: any) {
    console.error("[issues/fetch] error:", error);

    return res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch issues",
    });
  }
});

export default router;
