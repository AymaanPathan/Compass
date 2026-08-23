import { Router, Request, Response } from "express";
import {
  agentClient,
  OSS_ISSUES_AGENT_NAME,
  OSS_ISSUE_DEEP_DIVE_AGENT_NAME,
} from "../services/agentClient";
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

interface IssuesResult {
  repository: string;
  issues: GithubIssue[];
}

export interface IssueDeepDiveResult {
  repository: string;
  issueNumber: number;
  title: string;
  author: string;
  state: string;
  whatIsTheIssue: string;
  whatIsHappeningNow: string;
  whatShouldHappen: string;
  whyItMatters: string;
  whoWhatIsAffected: string;
  whereInTheProject: string;
  technicalConcepts: string[];
  backgroundContext: string;
}

// ---------------------------------------------------------------------------
// In-flight de-dupe + short-lived success cache (repo-level issue lists).
//
// Two problems this solves:
// 1. React StrictMode (and any accidental double-mount/double-click on the
//    frontend) can fire two requests for the same repo within milliseconds.
//    Without de-duping, that's two full agent sessions hitting the LLM
//    provider's per-minute rate limit at once — exactly what caused the
//    429s in the logs.
// 2. Repeatedly opening the same repo's detail page shouldn't re-run the
//    agent every time. A short TTL cache means a second visit within a few
//    minutes is instant and costs zero agent calls.
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const inFlightRequests = new Map<string, Promise<IssuesResult>>();
const resultCache = new Map<
  string,
  { result: IssuesResult; expiresAt: number }
>();

function getCached(repoFullName: string): IssuesResult | null {
  const entry = resultCache.get(repoFullName);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    resultCache.delete(repoFullName);
    return null;
  }

  return entry.result;
}

function setCached(repoFullName: string, result: IssuesResult) {
  resultCache.set(repoFullName, {
    result,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

// ---------------------------------------------------------------------------
// In-flight de-dupe + short-lived success cache (single-issue deep dives).
// Same pattern as above, keyed at the issue level instead of the repo
// level, since a deep dive is scoped to one specific issue.
// ---------------------------------------------------------------------------

const DEEPDIVE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const deepDiveInFlight = new Map<string, Promise<IssueDeepDiveResult>>();
const deepDiveCache = new Map<
  string,
  { result: IssueDeepDiveResult; expiresAt: number }
>();

function deepDiveKey(repoFullName: string, issueNumber: number): string {
  return `${repoFullName}#${issueNumber}`;
}

function getCachedDeepDive(key: string): IssueDeepDiveResult | null {
  const entry = deepDiveCache.get(key);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    deepDiveCache.delete(key);
    return null;
  }

  return entry.result;
}

function setCachedDeepDive(key: string, result: IssueDeepDiveResult) {
  deepDiveCache.set(key, {
    result,
    expiresAt: Date.now() + DEEPDIVE_CACHE_TTL_MS,
  });
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

function parseIssuesResponse(text: string): IssuesResult | null {
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

    // The model can legitimately return {} when the underlying tool
    // response was too large to work with. Treat that as "zero issues
    // found" rather than a hard parse failure, so the user sees an empty
    // state instead of an error.
    if (!("issues" in parsed)) {
      console.warn(
        "[issues/fetch] response had no issues array (likely a truncated tool result) — treating as empty",
      );
      return { repository: String(parsed.repository || ""), issues: [] };
    }

    if (!Array.isArray(parsed.issues)) {
      console.error("[issues/fetch] issues field is not an array");
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

function parseDeepDiveResponse(text: string): IssueDeepDiveResult | null {
  try {
    const cleaned = stripMarkdownFences(text);
    const jsonStr = extractBalancedJson(cleaned);

    if (!jsonStr) {
      console.error(
        "[issues/deep-dive] no balanced JSON object found (output may be truncated)",
      );
      return null;
    }

    const parsed = JSON.parse(jsonStr);

    if (!parsed.repository) {
      console.error("[issues/deep-dive] response missing repository field");
      return null;
    }

    return {
      repository: String(parsed.repository || ""),
      issueNumber: Number(parsed.issueNumber) || 0,
      title: String(parsed.title || ""),
      author: String(parsed.author || ""),
      state: String(parsed.state || "unknown"),
      whatIsTheIssue: String(parsed.whatIsTheIssue || ""),
      whatIsHappeningNow: String(parsed.whatIsHappeningNow || ""),
      whatShouldHappen: String(parsed.whatShouldHappen || ""),
      whyItMatters: String(parsed.whyItMatters || ""),
      whoWhatIsAffected: String(parsed.whoWhatIsAffected || ""),
      whereInTheProject: String(parsed.whereInTheProject || ""),
      technicalConcepts: Array.isArray(parsed.technicalConcepts)
        ? parsed.technicalConcepts.map(String)
        : [],
      backgroundContext: String(parsed.backgroundContext || ""),
    };
  } catch (error) {
    console.error("[issues/deep-dive] failed to parse agent output:", error);
    console.error("[issues/deep-dive] raw output:", text);
    return null;
  }
}

function isRateLimitError(error: any): boolean {
  return String(error?.message || error || "").includes("429");
}

async function runIssuesAgent(prompt: string): Promise<string> {
  return withAgentRetry(
    async () => {
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
            throw new Error(
              (event.state as any)?.message || "Agent turn failed",
            );
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
    },
    // The provider's rate limit is per-minute (retry-after ~50-60s in the
    // logs) — burning through several fast retries inside one HTTP request
    // just wastes time and still fails. Fail fast instead; the in-flight
    // de-dupe + cache above do the real work of keeping request volume down.
    { maxAttempts: 2, baseDelayMs: 1500 },
  );
}

async function runDeepDiveAgent(prompt: string): Promise<string> {
  return withAgentRetry(
    async () => {
      const { data: session } = await agentClient.sessions.create({
        agent: { name: OSS_ISSUE_DEEP_DIVE_AGENT_NAME },
      });

      const stream = await agentClient.sessions.createTurnStream(session.id, {
        input: [{ type: "user.message", content: prompt }],
      });

      let finalText = "";

      for await (const { data: event } of stream.withMetadata()) {
        if (DEBUG_AGENT_EVENTS) {
          console.log(
            `[deep-dive agent event] ${event?.type}`,
            JSON.stringify(event),
          );
        }

        if (event.type === "model.message.delta" && event.threadId === "main") {
          finalText += event.content ?? "";
        }

        if (event.type === "turn.done") {
          if (event.state?.status === "error") {
            throw new Error(
              (event.state as any)?.message || "Agent turn failed",
            );
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
    },
    { maxAttempts: 2, baseDelayMs: 1500 },
  );
}

async function getIssuesForRepo(repoFullName: string): Promise<IssuesResult> {
  const cached = getCached(repoFullName);
  if (cached) {
    console.log(`[issues/fetch] cache hit for ${repoFullName}`);
    return cached;
  }

  const inFlight = inFlightRequests.get(repoFullName);
  if (inFlight) {
    console.log(`[issues/fetch] joining in-flight request for ${repoFullName}`);
    return inFlight;
  }

  const promise = (async () => {
    console.log("[issues/fetch] running agent for", repoFullName);

    const prompt = `Repository: ${repoFullName}`;
    const finalText = await runIssuesAgent(prompt);
    const parsed = parseIssuesResponse(finalText);

    if (!parsed) {
      const err: any = new Error(
        "Issue discovery agent returned an invalid response",
      );
      err.raw = finalText;
      throw err;
    }

    const result: IssuesResult = {
      repository: parsed.repository || repoFullName,
      issues: parsed.issues,
    };

    setCached(repoFullName, result);
    return result;
  })();

  inFlightRequests.set(repoFullName, promise);

  try {
    return await promise;
  } finally {
    inFlightRequests.delete(repoFullName);
  }
}

async function getDeepDiveForIssue(
  repoFullName: string,
  issueNumber: number,
): Promise<IssueDeepDiveResult> {
  const key = deepDiveKey(repoFullName, issueNumber);

  const cached = getCachedDeepDive(key);
  if (cached) {
    console.log(`[issues/deep-dive] cache hit for ${key}`);
    return cached;
  }

  const inFlight = deepDiveInFlight.get(key);
  if (inFlight) {
    console.log(`[issues/deep-dive] joining in-flight request for ${key}`);
    return inFlight;
  }

  const promise = (async () => {
    console.log("[issues/deep-dive] running agent for", key);

    const prompt = `${repoFullName}#${issueNumber}`;
    const finalText = await runDeepDiveAgent(prompt);
    const parsed = parseDeepDiveResponse(finalText);

    if (!parsed) {
      const err: any = new Error(
        "Issue deep-dive agent returned an invalid response",
      );
      err.raw = finalText;
      throw err;
    }

    setCachedDeepDive(key, parsed);
    return parsed;
  })();

  deepDiveInFlight.set(key, promise);

  try {
    return await promise;
  } finally {
    deepDiveInFlight.delete(key);
  }
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

    const result = await getIssuesForRepo(repoFullName);

    return res.json({
      success: true,
      repository: result.repository,
      issues: result.issues,
    });
  } catch (error: any) {
    console.error("[issues/fetch] error:", error);

    if (isRateLimitError(error)) {
      return res.status(429).json({
        success: false,
        error:
          "The issue-discovery agent is rate-limited right now. Please wait about a minute and try again.",
      });
    }

    return res.status(502).json({
      success: false,
      error: error.message || "Failed to fetch issues",
      raw: error.raw,
    });
  }
});

router.post("/deep-dive", async (req: Request, res: Response) => {
  try {
    const { repoFullName, issueNumber } = req.body;

    if (!repoFullName || issueNumber === undefined || issueNumber === null) {
      return res.status(400).json({
        success: false,
        error: "repoFullName and issueNumber are required",
      });
    }

    const parsedIssueNumber = Number(issueNumber);
    if (!Number.isFinite(parsedIssueNumber)) {
      return res.status(400).json({
        success: false,
        error: "issueNumber must be a number",
      });
    }

    const result = await getDeepDiveForIssue(repoFullName, parsedIssueNumber);

    return res.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error("[issues/deep-dive] error:", error);

    if (isRateLimitError(error)) {
      return res.status(429).json({
        success: false,
        error:
          "The issue deep-dive agent is rate-limited right now. Please wait about a minute and try again.",
      });
    }

    return res.status(502).json({
      success: false,
      error: error.message || "Failed to run deep dive",
      raw: error.raw,
    });
  }
});

export default router;
