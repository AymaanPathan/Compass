import { Router, Request, Response } from "express";
import { TrueForge } from "@truefoundry/trueforge-sdk";

const router = Router();

const client = new TrueForge({
  baseUrl: process.env.TRUEFORGE_BASE_URL || "http://localhost:8790",
  timeoutInSeconds: 600,
});

const OSS_AGENT_NAME = "oss-discover-agent";

export interface OssRepository {
  owner: string;
  name: string;
  fullName: string;
  url: string;
  description: string;
  primaryTechnology: string;
  fitScore: number;
  whyItMatches: string;
  difficulty: "intermediate";
}

const REQUIRED_FIELDS: (keyof OssRepository)[] = [
  "owner",
  "name",
  "fullName",
  "url",
  "description",
  "primaryTechnology",
  "fitScore",
  "whyItMatches",
  "difficulty",
];

/**
 * Extracts the first balanced {...} block from a string, starting at the
 * first "{". This protects against trailing garbage or explanatory text
 * the model sometimes appends after the JSON object.
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
      if (depth === 0) {
        return input.slice(start, i + 1);
      }
    }
  }

  // Reached end of string without closing — likely truncated output
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

/**
 * Validates that a parsed object looks like a usable OssRepository.
 * Returns null (not throw) so callers can decide whether to retry.
 */
function validateRepository(candidate: any): OssRepository | null {
  if (!candidate || typeof candidate !== "object") return null;

  for (const field of REQUIRED_FIELDS) {
    if (!(field in candidate)) {
      console.warn(
        `[oss/discover] missing field "${field}" in repository object`,
      );
      return null;
    }
  }

  if (typeof candidate.fitScore !== "number") {
    const coerced = Number(candidate.fitScore);
    if (Number.isNaN(coerced)) {
      console.warn("[oss/discover] fitScore is not a valid number");
      return null;
    }
    candidate.fitScore = coerced;
  }

  // Reject obvious placeholder/template output (e.g. "...", "*repository*")
  const suspiciousValues = ["...", "string", "n/a", ""];
  for (const field of ["owner", "name", "fullName", "url"] as const) {
    const value = String(candidate[field] ?? "")
      .trim()
      .toLowerCase();
    if (suspiciousValues.includes(value)) {
      console.warn(
        `[oss/discover] field "${field}" looks like a placeholder: "${candidate[field]}"`,
      );
      return null;
    }
  }

  return candidate as OssRepository;
}

/**
 * Parses the raw agent output into an OssRepository, or null if it
 * cannot be recovered. Handles markdown fences, trailing junk, an
 * explicit `{"repository": null}` response, and truncated output.
 */
function parseRepository(output: string): OssRepository | null {
  try {
    const cleaned = stripMarkdownFences(output);
    const jsonStr = extractBalancedJson(cleaned);

    if (!jsonStr) {
      console.error(
        "[oss/discover] no balanced JSON object found (output may be truncated)",
      );
      return null;
    }

    const parsed = JSON.parse(jsonStr);

    // Model may return { repository: {...} }, { repository: null }, or the bare object
    const candidate = "repository" in parsed ? parsed.repository : parsed;

    if (candidate === null) {
      console.log(
        "[oss/discover] agent explicitly returned no matching repository",
      );
      return null;
    }

    return validateRepository(candidate);
  } catch (error) {
    console.error("[oss/discover] failed to parse repository:", error);
    console.error("[oss/discover] raw output:", output);
    return null;
  }
}

/**
 * Runs a single agent turn against an existing session and collects the
 * final text output, mirroring the streaming logic from the original
 * implementation.
 */
async function runAgentTurn(
  sessionId: string,
  prompt: string,
): Promise<string> {
  const stream = await client.sessions.createTurnStream(sessionId, {
    input: [
      {
        type: "user.message",
        content: prompt,
      },
    ],
  });

  let finalOutput = "";

  for await (const { data: event } of stream.withMetadata()) {
    if (event.type === "model.message.delta" && event.threadId === "main") {
      finalOutput += event.content ?? "";
    }

    if (event.type === "turn.done") {
      console.log("[oss/discover] turn status:", event.state.status);

      if (event.state.status === "done" && event.state.output?.content) {
        const content = event.state.output.content;

        finalOutput =
          typeof content === "string"
            ? content
            : content
                .filter((item: any) => item.type === "text")
                .map((item: any) => item.text)
                .join("");
      }
    }
  }

  return finalOutput;
}

router.post("/discover", async (req: Request, res: Response) => {
  try {
    const { developerProfile } = req.body;

    if (!developerProfile) {
      return res.status(400).json({
        success: false,
        error: "developerProfile is required",
      });
    }

    console.log("[oss/discover] creating agent session");

    const { data: session } = await client.sessions.create({
      agent: {
        name: OSS_AGENT_NAME,
      },
    });

    console.log("[oss/discover] session:", session.id);

    const prompt = `
Developer Profile:

${JSON.stringify(developerProfile, null, 2)}

Find exactly one open-source repository that matches this developer profile.

Return the JSON exactly as instructed.
`;

    console.log("[oss/discover] running agent");

    let finalOutput = await runAgentTurn(session.id, prompt);
    console.log("[oss/discover] final output (attempt 1):");
    console.log(finalOutput);

    let repository = parseRepository(finalOutput);

    // One repair attempt: ask the same session to fix its own malformed output
    if (!repository) {
      console.warn(
        "[oss/discover] first attempt failed, retrying with repair prompt",
      );

      const repairPrompt = `
Your previous response was not valid, complete JSON matching the required schema.

Return ONLY the corrected JSON object for the repository. Use real values,
not placeholders like "..." or "string". No markdown, no commentary.

Required shape:
{"repository":{"owner":"...","name":"...","fullName":"owner/name","url":"...","description":"...","primaryTechnology":"...","fitScore":0,"whyItMatches":"...","difficulty":"intermediate"}}

Or, if no repository qualifies: {"repository":null}
`;

      finalOutput = await runAgentTurn(session.id, repairPrompt);
      console.log("[oss/discover] final output (attempt 2 - repair):");
      console.log(finalOutput);

      repository = parseRepository(finalOutput);
    }

    if (!repository) {
      console.warn(
        "[oss/discover] agent returned invalid repository data after retry",
      );

      return res.status(502).json({
        success: false,
        error: "Repository discovery agent returned an invalid response",
        raw: finalOutput,
        sessionId: session.id,
      });
    }

    return res.json({
      success: true,
      repository,
      raw: finalOutput,
      sessionId: session.id,
    });
  } catch (error: any) {
    console.error("[oss/discover] error:", error);

    return res.status(500).json({
      success: false,
      error: error.message || "Failed to discover repository",
    });
  }
});

export default router;
