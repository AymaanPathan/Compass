import { Router, Request, Response } from "express";
import { agentClient, OSS_AGENT_NAME } from "../services/agentClient";
import { isEventDelta, mergeEventDelta } from "truefoundry-gateway-sdk/agents";

const DEBUG_AGENT_EVENTS = process.env.DEBUG_AGENT_EVENTS === "true";
console.log("DEBUG_AGENT_EVENTS is:", DEBUG_AGENT_EVENTS);

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

function buildProfilePrompt(developerProfile: unknown) {
  return `Developer Profile (JSON):
${JSON.stringify(developerProfile, null, 2)}

Find exactly one repository for this developer, following your instructions exactly. Return JSON only.`;
}

// Strips ```json fences if the model wraps output despite instructions,
// then parses. Throws if the result still isn't a valid repository object.
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

// Streams the oss-discover-agent turn live over SSE.
// Event types sent:
//   session  -> { sessionId }
//   thinking -> { content }   reasoningContent deltas
//   chunk    -> { content }   final-answer content deltas
//   done     -> { repository, raw, parseFailed }
//   error    -> { error }
router.post("/discover", async (req: Request, res: Response) => {
  const { developerProfile, sessionId: clientSessionId } = req.body as {
    developerProfile: unknown;
    sessionId?: string;
  };

  if (!developerProfile) {
    return res
      .status(400)
      .json({ success: false, error: "developerProfile is required" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  let clientGone = false;

  req.on("aborted", () => {
    clientGone = true;
    console.log("[oss/discover] request aborted");
  });

  res.on("close", () => {
    if (!res.writableEnded) {
      clientGone = true;
      console.log("[oss/discover] response connection closed");
    }
  });

  // Heartbeat so idle SSE connections don't get killed while the agent
  // is still working (e.g. slow GitHub MCP tool calls) with no output yet.
  const heartbeat = setInterval(() => {
    if (!clientGone) {
      res.write(": ping\n\n");
    }
  }, 15000);

  try {
    const startedAt = Date.now();
    console.log("[oss/discover] creating/resuming session...");
    const session = clientSessionId
      ? await agentClient.getSession({ sessionId: clientSessionId })
      : await agentClient.createSession({ agentName: OSS_AGENT_NAME });

    console.log(
      `[oss/discover] createSession settled after ${Date.now() - startedAt}ms (clientGone=${clientGone})`,
    );

    if (clientGone) {
      clearInterval(heartbeat);
      return;
    }
    console.log("[oss/discover] session ready:", (session as any).id);
    send("session", { sessionId: (session as any).id ?? null });

    const turn = session.prepareTurn({
      input: [
        { type: "user.message", content: buildProfilePrompt(developerProfile) },
      ],
    });

    // Not pinned to the SDK's exported TurnEvent union — that union doesn't
    // structurally cover every event variant turn.execute() can yield
    // (e.g. TurnCreatedEvent vs ThreadDoneEvent both required "title").
    // We only ever feed this map into mergeEventDelta, so `any` here is a
    // deliberate, contained escape hatch rather than fighting the SDK types.
    const events = new Map<string, any>();
    let finalText = "";

    console.log("[oss/discover] starting turn.execute...");
    for await (const { event } of turn.execute({ stream: true })) {
      if (clientGone) {
        clearInterval(heartbeat);
        return;
      }

      if (isEventDelta(event)) {
        const base = events.get(event.id);
        if (base) mergeEventDelta(base, event);

        // ✅ ADD: log reasoning chunks
        if (
          typeof event.reasoningContent === "string" &&
          event.reasoningContent
        ) {
          process.stdout.write(
            `\x1b[90m[thinking] ${event.reasoningContent}\x1b[0m`,
          ); // grey
          send("thinking", { content: event.reasoningContent });
        }

        // ✅ ADD: log answer chunks inline (no newline = live streaming feel)
        if (typeof event.content === "string" && event.content) {
          finalText += event.content;
          process.stdout.write(event.content); // streams character-by-character
          send("chunk", { content: event.content });
        }

        // ✅ ADD: log tool calls as the agent decides to call them
        if (event.toolCalls?.length) {
          for (const tc of event.toolCalls) {
            if (tc.toolInfo?.name && tc.function?.name) {
              // First chunk for this tool call index carries tool_info
              console.log(
                `\n\x1b[33m[tool call] ${tc.toolInfo.name}(${tc.function.name})\x1b[0m`,
              );
            }
          }
        }
      } else {
        events.set(event.id, event);

        // ✅ ADD: log complete tool results
        if (event.type === "tool.response") {
          const preview = (event.content ?? "").slice(0, 300);
          console.log(
            `\x1b[36m[tool.response] tool_call_id=${event.toolCallId}\x1b[0m`,
          );
          console.log(
            `  └─ ${preview}${event.content?.length > 300 ? "…" : ""}`,
          );
        }

        // ✅ ADD: log turn terminal state
        if (event.type === "turn.done") {
          console.log(
            `\n\x1b[32m[turn.done] status=${event.state?.status}\x1b[0m`,
          );
        }
      }

      console.log(`[agent event] ${event.type}`);
      if (DEBUG_AGENT_EVENTS) {
        console.log(`[agent event full] ${event.type}`, JSON.stringify(event));
      }
    }
    console.log(); // newline after streaming is done

    console.log("[oss/discover] turn.execute loop finished");
    clearInterval(heartbeat);

    if (clientGone) return;

    try {
      const repository = parseRepository(finalText);
      send("done", { repository, raw: finalText, parseFailed: false });
    } catch (parseErr) {
      console.warn("OSS discover: failed to parse repository JSON", parseErr);
      send("done", { repository: null, raw: finalText, parseFailed: true });
    }
    res.end();
  } catch (error: any) {
    clearInterval(heartbeat);
    console.error("OSS discover error:", error);
    if (!clientGone) {
      send("error", { error: error.message || "Agent session failed" });
      res.end();
    }
  }
});

export default router;
