import { TrueForge } from "@truefoundry/trueforge-sdk";

const client = new TrueForge({
  baseUrl: "http://localhost:8791",
});

/**
 * OSS Issue Code Finder — Agent 2 (RPM-optimized, revised)
 *
 * Purpose:
 * Find the files relevant to a GitHub issue and suggest a few possible
 * approaches to solve it. Nothing more.
 *
 * WHY THIS VERSION IS DIFFERENT FROM THE PRIOR ONE:
 * The Cerebras free tier caps this agent's model at 5 requests/minute. Each
 * tool call is a separate LLM turn = a separate request. The prior version
 * capped the worst case at 6 turns (issue_read(1) + search_code(2) +
 * get_file_contents(2) + final(1)) — which sits AT or ABOVE the 5rpm
 * ceiling, and a real run hit exactly that worst case and got a 429.
 *
 * This version:
 * - Reads the issue (and its triage/comment thread, if the tool supports
 *   it — auto-triage bots often already name the exact file + root cause,
 *   which can skip search entirely)
 * - Searches for relevant source code with EXACTLY ONE call, using a real
 *   keyword (not a bare path: filter, which reliably returns 0 results
 *   and burns a call for nothing)
 * - Uses search_code's own text_matches fragments as primary evidence
 *   instead of defaulting to a full file fetch
 * - Only escalates to get_file_contents (at most ONCE) if the fragment
 *   truly isn't enough
 * - Reports relevant files + a few possible approaches to fix it
 *
 * New worst case: issue_read(1) + search_code(1) + get_file_contents(1) +
 * final JSON turn(1) = 4 LLM turns. iterationLimit is set to 5, one turn
 * of margin above that true worst case — matching the safety margin that
 * makes the sibling developer-profile-agent reliable on the same rate
 * limit.
 *
 * It does NOT:
 * - Diagnose the root cause in depth
 * - Write code
 * - Modify code
 * - Run tests
 * - Create PRs
 * - Produce a full architecture map (no subsystem chains, no dependency
 *   graphs, no test inventories — see prior version if that's needed again)
 */

async function createAgent() {
  const { data: agent } = await client.agents.create({
    name: "oss-issue-code-explorer",

    manifest: {
      model: {
        name: "gemma-4-31b/gemma-4-31b",
        params: {
          max_tokens: 4096,
          frequency_penalty: 0.2,
          presence_penalty: 0.1,
        },
      },

      instructions: `
You are OSS Issue Code Finder.

Your job has exactly two parts:
1. Find the files relevant to this GitHub issue.
2. Suggest a few possible approaches to solve it.

You are NOT writing code, NOT creating a PR, and NOT picking a single
"correct" fix. You're giving a developer a starting point: where to look
and a few directions they could take.

INPUT FORMAT:

owner/repo#issue_number

Optionally followed by:

CONTEXT FROM AGENT 1:
{
  "whatIsTheIssue": "...",
  "whatIsHappeningNow": "...",
  "whereInTheProject": "...",
  "technicalConcepts": [...]
}

If Agent 1 context exists, use it to make your search more specific.
Agent 1 context is only a hint — verify findings against the repository.

RATE BUDGET — HARD CONSTRAINT:
The model provider allows very few requests per minute. Every tool call you
make is a separate request. Stay within the call budget below. Treat these
as hard caps, not targets — always prefer the fewer call path.

TOOL EXECUTION PLAN — FOLLOW THIS EXACT ORDER, DO NOT SKIP STEPS:

1. issue_read
   - Call exactly ONCE, FIRST.
   - Use method="get".
   - If a comments-inclusive method or a separate comments tool is
     available and enabled, prefer getting the comment thread too. Auto-
     triage bots and maintainers often post the exact file(s), root cause,
     and even a linked fix PR directly in the comments — if that evidence
     is already present and specific, it IS your answer. Skip straight to
     OUTPUT and do NOT call search_code or get_file_contents at all.

2. search_code
   - Only reached if step 1 did not already give you a named file plus
     enough context to describe the bug and approaches.
   - Call EXACTLY ONCE. No retries under any circumstance, even if the
     first query returns nothing usable — report what you found instead.
   - Query construction rule: build the query around a literal, distinctive
     SYMBOL or STRING pulled from the issue (a function/class/variable
     name, a unique error message fragment, an identifier quoted in a code
     block). NEVER submit a query built only from a path: filter with no
     search keyword — GitHub's code search requires an actual keyword, and
     a path-only query reliably returns zero results, wasting the call.
   - Treat the returned text_matches[].fragment content as your primary
     evidence. In most cases this fragment already shows the relevant
     function or logic and is enough to identify the file and describe
     approaches without reading the full file.
   - Do NOT use tavily_search or read_wiki_structure — repository context
     from issue_read and search_code should be sufficient.

3. get_file_contents
   - Treat this as a LAST-RESORT escalation, not a default step.
   - Call it ONLY if the search_code fragment is clearly insufficient —
     e.g. it's truncated mid-logic, cuts off before the relevant branch or
     condition, or doesn't actually show the code path the issue describes.
   - AT MOST ONE call, on the single most relevant file identified via
     search_code.
   - If the fragment was already sufficient, skip this step entirely.

4. tavily_search / read_wiki_structure
   - DO NOT USE. Repository context should be sufficient for this agent.

IMPORTANT TOOL DISCIPLINE:

- Follow the steps above IN ORDER. Do not reorder or skip a step.
- Never repeat a successful tool call.
- Never call a tool just to "double check" something already established.
- Stop using tools as soon as you have enough to answer — even if that
  means using fewer calls than your budget allows.
- Do not invent files, functions, or approaches not grounded in what you
  actually found.
- Do not perform exploratory loops.
- If unsure whether another call is worth it, err on the side of NOT
  calling — a slightly less complete answer beats exceeding the rate
  budget and returning nothing.

After the required investigation is complete, immediately produce the final JSON.

OUTPUT:

Return valid JSON only.

Do not return markdown.
Do not return explanations outside JSON.
Do not return thinking.
Do not wrap JSON in code fences.

Use exactly this structure:

{
  "repository": "owner/repo",
  "issueNumber": 0,
  "relevantFiles": [
    "string"
  ],
  "approaches": [
    "string"
  ],
  "summary": "string"
}

FIELD RULES:

repository:
- Repository in owner/repo format.

issueNumber:
- Numeric GitHub issue number.

relevantFiles:
- Plain strings only.
- Only include files actually found via search_code / get_file_contents /
  a comment thread that named them explicitly.
- Include file path and a short reason it's relevant.

Example:
"packages/core/src/memory/memory.ts — handles semantic memory operations, likely where the dimension mismatch originates"

approaches:
- 2-4 short, distinct possible ways to solve the issue.
- High-level direction only — describe the idea, do NOT write code or a diff.
- Each approach should be a single sentence.

Example:
"Add a null check before accessing embedder.dimension in getEmbeddingDimension() so it falls back to a default instead of throwing"

summary:
- 1-2 plain-language sentences: what the issue is and roughly where it lives.
- No jargon dump, no restating the full issue body.

SCOPE BOUNDARY:

You MAY:
- identify relevant files
- briefly explain why each file is relevant
- describe 2-4 possible approaches at a high level

You MUST NOT:
- write replacement code or diffs
- modify code
- run tests
- create a PR
- pick and commit to a single "correct" fix
- produce a deep architecture / dependency / test map

STOP after returning the JSON.
`,

      mcpServers: [
        {
          name: "github",
          enableTools: ["issue_read", "search_code", "get_file_contents"],
          // preload=true + explicit preloadTools avoids per-call tool
          // discovery ("Listing tools" + "get_tool_info" round-trips).
          // Without this, every call_tool is preceded by two extra
          // provider requests, which is what was burning through the
          // per-minute rate limit and causing 429s after only a few
          // real tool calls.
          //
          // If your GitHub MCP server exposes a separate comments tool
          // (e.g. "issue_comments" / "list_issue_comments"), add it here
          // and to preloadTools below — reading the comment thread can
          // let step 1 short-circuit steps 2-3 entirely on repos that run
          // auto-triage bots.
          preload: true,
          preloadTools: ["issue_read", "search_code", "get_file_contents"],
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

        // New worst case: issue_read(1) + search_code(1) +
        // get_file_contents(1) + final JSON turn(1) = 4. iterationLimit is
        // set to 5 — one turn of margin above the true worst case, the
        // same safety margin that keeps the sibling
        // developer-profile-agent (iterationLimit: 5, real max 4 turns)
        // from ever hitting 429s. This is a hard stop enforced by the
        // runtime — it does not rely on the model obeying the "exactly
        // once" instructions above.
        iterationLimit: 5,

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
 * Response parsing
 */

export interface CodeFinderResult {
  repository: string;
  issueNumber: number;
  relevantFiles: string[];
  approaches: string[];
  summary: string;
}

function extractFirstJsonObject(raw: string): string | null {
  const start = raw.indexOf("{");

  if (start === -1) {
    return null;
  }

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

function extractPartialFields(raw: string): CodeFinderResult | null {
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

    if (!m) {
      return [];
    }

    const items = m[1].match(/"((?:[^"\\]|\\.)*)"/g) ?? [];

    return items
      .map((s) => s.slice(1, -1))
      .filter((s) => s.length > 0 && !/^[\s,+:()]*$/.test(s));
  };

  const repository = str("repository");

  if (!repository) {
    return null;
  }

  return {
    repository,
    issueNumber: num("issueNumber"),
    relevantFiles: arr("relevantFiles"),
    approaches: arr("approaches"),
    summary: str("summary"),
  };
}

export function parseCodeFinderResponse(raw: string): CodeFinderResult | null {
  const candidate = extractFirstJsonObject(raw);

  if (candidate) {
    try {
      return JSON.parse(candidate) as CodeFinderResult;
    } catch {
      // Fall through to partial extraction.
    }
  }

  return extractPartialFields(raw);
}

/**
 * Retry helper for callers that execute agent turns.
 *
 * Widened to fit a 5 req/min ceiling: on 429, wait a full minute (plus
 * jitter) rather than a shorter backoff, since the limit resets on a
 * rolling ~60s window. This does NOT reduce how many requests the agent
 * makes — it only stops a single transient 429 from failing the whole run.
 * The real fix is the call-budget reduction (iterationLimit + tightened
 * tool-execution plan) above, which keeps the true worst case at 4 turns
 * instead of 6.
 */
export async function withAgentRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelayMs?: number;
  } = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 65_000; // > 60s rolling window

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      const message = err instanceof Error ? err.message : String(err);

      const is429 =
        message.includes("429") ||
        message.includes("Too Many Requests") ||
        message.includes("request_quota_exceeded");

      if (!is429 || attempt === maxRetries) {
        throw err;
      }

      const delay = baseDelayMs + Math.floor(Math.random() * 5_000);

      console.warn(
        `429 from model provider. Waiting ${Math.round(
          delay / 1000,
        )}s before retry ${attempt + 1}/${maxRetries}...`,
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

createAgent().catch(console.error);
