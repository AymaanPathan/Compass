import { TrueForge } from "@truefoundry/trueforge-sdk";

const client = new TrueForge({
  baseUrl: "http://localhost:8791",
});

/**
 * oss-issue-code-explorer (Agent 2)
 *
 * Purpose: "Show me where this issue lives in the codebase and help me
 * understand the relevant code." Nothing more.
 *
 * This agent is a MAP, not a SOLVER:
 *   - It locates and explains relevant files, functions, tests, and flow.
 *   - It does NOT diagnose root cause, propose fixes, write code, modify
 *     code, run tests, or decide a solution.
 *
 * Same reliability pattern as Agent 1 (oss-issue-deep-dive):
 *   - responseFormat: "text", not "json_object"
 *   - every tool called a small, fixed number of times — no open-ended loops
 *   - flat output: arrays of plain strings, no nested objects
 *   - no compaction, no context-management extras
 */
async function createAgent() {
  const { data: agent } = await client.agents.create({
    name: "oss-issue-code-explorer",

    manifest: {
      model: {
        name: "gpt-oss-120b/gpt-oss-120b",
        params: {
          max_tokens: 2600,
          frequency_penalty: 0.4,
          presence_penalty: 0.2,
        },
      },

      instructions: `
You are OSS Issue Code Explorer. Your only job is to help a developer find
and understand the code relevant to a GitHub issue — where it lives, what
it does, and how it flows. You are a MAP, not a SOLVER.

INPUT: "owner/repo#issue_number", optionally followed by prior context from
Agent 1 (the issue-understanding agent), formatted like:

owner/repo#issue_number

CONTEXT FROM AGENT 1:
{ "whatIsTheIssue": "...", "whatIsHappeningNow": "...", "whereInTheProject": "...", "technicalConcepts": [...] }

If this context block is present, use it to work SMARTER, not to skip work:
- Use "whatIsHappeningNow" and "technicalConcepts" to pick better, more
  specific search_code query terms than you'd guess from the raw issue
  alone (e.g. if it mentions "dimension probe," search for that concept's
  likely code terms — probe, dimension, embed — rather than generic words).
- Use "whereInTheProject" as a strong starting hint for which package/
  subsystem to expect, so your wiki lookup and file search converge faster.
- Still perform every tool call in the sequence below. The Agent 1 context
  is a hint to aim your searches well, not a replacement for verifying
  against the actual code and wiki. Agent 1 deliberately does not name
  exact files or functions, so you still need issue_read and search_code
  to find the real, concrete answers — the context just helps you find
  them faster and more accurately.
- If no CONTEXT FROM AGENT 1 block is present, proceed exactly as normal
  using only the issue itself.

Do these tool calls, in this order, respecting the call limits below:

1. issue_read with method="get" — exactly once. Get the issue title and
   body so you know what functionality to look for.
2. read_wiki_structure (deepwiki) — exactly once. Get the repo's
   architecture map to identify the relevant package and subsystem.
3. search_code — up to 2 times. First call: search for source code related
   to the issue's subject (use specific terms from the issue title/body,
   e.g. function or concept names actually mentioned). Second call
   (optional, only if useful): search for existing tests covering that
   same functionality (e.g. add "test" to the query or search a test
   directory pattern).
4. get_file_contents — up to 5 times. Read the actual content of the most
   relevant files found via search_code, so you can describe what each
   file does and identify relevant functions/classes and the code flow
   between them.
5. tavily_search — at most 1 time, and ONLY if you encounter an interface,
   pattern, or concept that the repo's own context doesn't explain well
   enough to describe accurately. Skip this call entirely if not needed.

Then immediately return the result. Do not exceed any call limit above.
Do not call any other tools.

Return valid JSON only. No markdown, no explanation, no thinking out loud.
Stop immediately after the final }.

SCOPE BOUNDARY — this is important:

Do NOT:
- diagnose the root cause of the bug
- propose a fix or code change
- write or modify any code
- decide a final solution
- create a PR
- run tests
- tell the developer "change X to Y"
- go deeper than identifying and describing relevant functions/classes —
  do not explain WHY they cause the bug, only WHAT they do and how they
  relate to the issue's subject matter

You MAY:
- identify the package, subsystem, files, functions/classes, tests, and
  code flow relevant to the issue
- describe what each piece does in plain terms
- describe how the pieces interact at a high level

Use exactly this shape. Every array item must be a plain string (never a
nested object) — fold any sub-detail (like a file's purpose) into that same
string as plain text:

{
  "repository": "owner/repo",
  "issueNumber": 0,
  "relevantPackage": "string — which package/directory owns this functionality",
  "relevantSubsystem": "string — the module chain, e.g. 'Memory → Semantic Recall → Vector Storage → Embedders'",
  "relevantFiles": ["string, e.g. 'packages/core/src/memory/memory.ts — handles semantic memory operations'"],
  "relevantFunctionsOrClasses": ["string, e.g. 'getEmbeddingDimension() — determines the embedder's output vector dimension'"],
  "codeFlow": "string — high-level flow using arrows, e.g. 'Memory → determine embedding dimension → generate vector index name → store/search vectors'",
  "relevantTests": ["string, e.g. 'packages/core/src/memory/memory.test.ts — covers embedding dimension logic' — empty array if none found"],
  "architectureContext": "string — how these files/modules fit into the larger project",
  "dependenciesAndInterfaces": ["string, e.g. 'Embedder interface — contract implemented by all embedding providers'"],
  "externalContext": "string — only if genuinely necessary to understand the architecture; empty string otherwise"
}

Rules:
- relevantFunctionsOrClasses: identify them, do not explain the bug through
  them — just what each one does.
- codeFlow: one short arrow-chain string, not a paragraph.
- If a category has nothing relevant, use an empty array or empty string —
  do not invent files, functions, or tests that were not actually found.
`,

      mcpServers: [
        {
          name: "github",
          enableTools: ["issue_read", "search_code", "get_file_contents"],
          preload: true,
          preloadTools: ["issue_read", "search_code", "get_file_contents"],
        },
        {
          name: "deepwiki",
          enableTools: ["read_wiki_structure"],
          preload: true,
          preloadTools: ["read_wiki_structure"],
        },
        {
          name: "tavily",
          enableTools: ["tavily_search"],
          preload: true,
          preloadTools: ["tavily_search"],
        },
      ],

      config: {
        askUserQuestions: {
          enabled: false,
        },
        dynamicSubAgents: {
          enabled: false,
        },
        generativeUi: {
          enabled: false,
        },
        iterationLimit: 12,
        sandbox: {
          enabled: false,
        },
      },

      responseFormat: {
        type: "text",
      },
    },
  });

  console.log("Agent created successfully:");
  console.log(agent);
}

/**
 * ── Response parsing ────────────────────────────────────────────────────
 * Same defensive pattern as Agent 1: extract the first complete, balanced
 * JSON object and ignore anything after it; fall back to regex field
 * extraction if the object never closes cleanly.
 */

export interface CodeExplorerResult {
  repository: string;
  issueNumber: number;
  relevantPackage: string;
  relevantSubsystem: string;
  relevantFiles: string[];
  relevantFunctionsOrClasses: string[];
  codeFlow: string;
  relevantTests: string[];
  architectureContext: string;
  dependenciesAndInterfaces: string[];
  externalContext: string;
}

function extractFirstJsonObject(raw: string): string | null {
  const start = raw.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < raw.length; i++) {
    const char = raw[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth++;
    } else if (char === "}") {
      depth--;
      if (depth === 0) {
        return raw.slice(start, i + 1);
      }
    }
  }

  return null;
}

function extractPartialFields(raw: string): CodeExplorerResult | null {
  const str = (key: string): string => {
    const m = raw.match(new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
    return m ? m[1] : "";
  };

  const num = (key: string): number => {
    const m = raw.match(new RegExp(`"${key}"\\s*:\\s*(\\d+)`));
    return m ? parseInt(m[1], 10) : 0;
  };

  const arr = (key: string): string[] => {
    const m = raw.match(new RegExp(`"${key}"\\s*:\\s*\\[([^\\]]*)\\]`));
    if (!m) return [];
    const items = m[1].match(/"((?:[^"\\]|\\.)*)"/g) ?? [];
    return items
      .map((s) => s.slice(1, -1))
      .filter((s) => s.length > 0 && !/^[\s,+:()]*$/.test(s));
  };

  const repository = str("repository");
  if (!repository) return null;

  return {
    repository,
    issueNumber: num("issueNumber"),
    relevantPackage: str("relevantPackage"),
    relevantSubsystem: str("relevantSubsystem"),
    relevantFiles: arr("relevantFiles"),
    relevantFunctionsOrClasses: arr("relevantFunctionsOrClasses"),
    codeFlow: str("codeFlow"),
    relevantTests: arr("relevantTests"),
    architectureContext: str("architectureContext"),
    dependenciesAndInterfaces: arr("dependenciesAndInterfaces"),
    externalContext: str("externalContext"),
  };
}

export function parseCodeExplorerResponse(
  raw: string,
): CodeExplorerResult | null {
  const candidate = extractFirstJsonObject(raw);
  if (candidate) {
    try {
      return JSON.parse(candidate) as CodeExplorerResult;
    } catch {
      // fall through
    }
  }
  return extractPartialFields(raw);
}

/**
 * withAgentRetry
 *
 * Wraps a call to this (or any) agent with exponential backoff on 429s.
 * The provider serving gemma-4-31b appears to have a fairly tight
 * requests-per-minute ceiling, and if multiple agents share the same
 * underlying key/quota, rapid back-to-back calls (e.g. Agent 1 → Agent 2
 * in the same pipeline, or running tests quickly) can trip it even when
 * each individual agent's tool-call budget looks reasonable.
 *
 * Usage:
 *   const result = await withAgentRetry(() =>
 *     client.sessions.createTurn(sessionId, { message: input })
 *   );
 */
export async function withAgentRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; baseDelayMs?: number } = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? 4;
  const baseDelayMs = options.baseDelayMs ?? 2000;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const is429 =
        err instanceof Error &&
        (err.message.includes("429") ||
          err.message.includes("Too Many Requests"));

      if (!is429 || attempt === maxRetries) {
        throw err;
      }

      // Exponential backoff with jitter: 2s, 4s, 8s, 16s (+/- up to 500ms)
      const delay = baseDelayMs * 2 ** attempt + Math.random() * 500;
      console.warn(
        `429 from agent provider — retrying in ${Math.round(
          delay,
        )}ms (attempt ${attempt + 1}/${maxRetries})`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

createAgent().catch(console.error);
