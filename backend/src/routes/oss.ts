import { Router, Request, Response } from "express";
import { agentClient, OSS_AGENT_NAME } from "../services/agentClient";
import { isEventDelta, mergeEventDelta } from "truefoundry-gateway-sdk/agents";
import { withAgentRetry } from "../utils/retryAgentTurn";

const DEBUG_AGENT_EVENTS = process.env.DEBUG_AGENT_EVENTS === "true";

const router = Router();

export interface KeyComponent {
  name: string;
  description: string;
}

export interface OssRepository {
  owner: string;
  name: string;
  fullName: string;
  url: string;
  description: string;
  primaryTechnology: string;
  fitScore: number;
  whyItMatches: string;
  whatItDoes: string;
  keyComponents: KeyComponent[];
  recommendedStartingPoint: string;
  difficulty: string;
}

function buildProfilePrompt(developerProfile: unknown, strict: boolean) {
  const base = `Developer Profile (JSON):
${JSON.stringify(developerProfile, null, 2)}

Find exactly one repository for this developer, following your instructions exactly. Return JSON only.`;

  if (!strict) return base;

  return `${base}

IMPORTANT: Respond with ONLY the JSON object for the repository. Do not include any prose, explanation, markdown fences, or summary of any kind — JSON only, nothing else.`;
}

function parseRepository(text: string): OssRepository {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  const parsed = JSON.parse(cleaned);
  const repo = parsed.repository ?? parsed;

  if (!repo || !repo.fullName || !repo.url) {
    throw new Error("Parsed JSON missing required repository fields");
  }
  return repo as OssRepository;
}

router.post("/discover", async (req: Request, res: Response) => {
  const { developerProfile } = req.body as { developerProfile: unknown };

  if (!developerProfile) {
    return res
      .status(400)
      .json({ success: false, error: "developerProfile is required" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  let clientGone = false;
  req.on("aborted", () => (clientGone = true));
  res.on("close", () => {
    if (!res.writableEnded) clientGone = true;
  });

  const heartbeat = setInterval(() => {
    if (!clientGone) res.write(": ping\n\n");
  }, 15000);

  async function runTurn(strict: boolean): Promise<{
    text: string;
    bufferedEvents: Array<{ event: string; data: unknown }>;
  }> {
    const buffered: Array<{ event: string; data: unknown }> = [];

    return withAgentRetry(
      async () => {
        buffered.length = 0; // reset on each internal retry attempt

        console.log(`\n[oss/discover] starting turn (strict=${strict})...`);

        const session = await agentClient.createSession({
          agentName: OSS_AGENT_NAME,
        });
        console.log("[oss/discover] session ready:", (session as any).id);
        buffered.push({
          event: "session",
          data: { sessionId: (session as any).id ?? null },
        });

        const turn = session.prepareTurn({
          input: [
            {
              type: "user.message",
              content: buildProfilePrompt(developerProfile, strict),
            },
          ],
        });

        const events = new Map<string, any>();
        let finalText = "";

        for await (const { event } of turn.execute({ stream: true })) {
          if (clientGone) throw new Error("client_gone");

          if (isEventDelta(event)) {
            const base = events.get(event.id);
            if (base) mergeEventDelta(base, event);

            if (
              typeof event.reasoningContent === "string" &&
              event.reasoningContent
            ) {
              process.stdout.write(`\x1b[90m${event.reasoningContent}\x1b[0m`); // grey = thinking
              buffered.push({
                event: "thinking",
                data: { content: event.reasoningContent },
              });
            }
            if (typeof event.content === "string" && event.content) {
              finalText += event.content;
              process.stdout.write(event.content); // live final-answer text
              buffered.push({
                event: "chunk",
                data: { content: event.content },
              });
            }

            if (event.toolCalls?.length) {
              for (const tc of event.toolCalls) {
                if (tc.toolInfo?.name && tc.function?.name) {
                  console.log(
                    `\n\x1b[33m[tool call] ${tc.toolInfo.name}(${tc.function.name})\x1b[0m`,
                  );
                }
              }
            }
          } else {
            events.set(event.id, event);

            if (event.type === "tool.response") {
              const preview = (event.content ?? "").slice(0, 300);
              console.log(
                `\n\x1b[36m[tool.response] tool_call_id=${event.toolCallId}\x1b[0m`,
              );
              console.log(
                `  └─ ${preview}${event.content?.length > 300 ? "…" : ""}`,
              );
            }

            if (event.type === "turn.done") {
              console.log(
                `\n\x1b[32m[turn.done] status=${event.state?.status}\x1b[0m`,
              );
            }
          }

          if (DEBUG_AGENT_EVENTS) {
            console.log(
              `[agent event full] ${event.type}`,
              JSON.stringify(event),
            );
          }
        }

        console.log(); // newline after streaming finishes
        console.log(
          `[oss/discover] turn finished, ${finalText.length} chars accumulated`,
        );

        return { text: finalText, bufferedEvents: buffered };
      },
      { retries: 2, baseDelayMs: 1200 },
    );
  }

  try {
    let result = await runTurn(false);
    if (clientGone) {
      clearInterval(heartbeat);
      return;
    }

    let repository: OssRepository | null = null;
    let parseFailed = false;

    try {
      repository = parseRepository(result.text);
      console.log("[oss/discover] parsed repository:", repository.fullName);
    } catch {
      console.warn(
        "[oss/discover] attempt 1 failed to parse, retrying with strict prompt",
      );
      send("retry", { reason: "format" });
      result = await runTurn(true);
      if (clientGone) {
        clearInterval(heartbeat);
        return;
      }
      try {
        repository = parseRepository(result.text);
        console.log(
          "[oss/discover] parsed repository (strict retry):",
          repository.fullName,
        );
      } catch (err) {
        console.warn("[oss/discover] strict retry also failed to parse", err);
        parseFailed = true;
      }
    }

    for (const { event, data } of result.bufferedEvents) send(event, data);

    clearInterval(heartbeat);
    send("done", { repository, raw: result.text, parseFailed });
    res.end();
  } catch (error: any) {
    clearInterval(heartbeat);
    console.error("[oss/discover] error:", error);
    if (!clientGone) {
      send("error", { error: error.message || "Agent session failed" });
      res.end();
    }
  }
});

export default router;
