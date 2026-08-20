// backend/src/routes/oss.ts
import { Router, Request, Response } from "express";
import { agentClient, OSS_AGENT_NAME } from "../services/agentClient";
import {
  isEventDelta,
  mergeEventDelta,
  type TurnEvent,
} from "truefoundry-gateway-sdk/agents";

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
//   thinking -> { content }   reasoning_content deltas
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
  req.on("close", () => {
    clientGone = true;
  });

  try {
    const session = clientSessionId
      ? await agentClient.getSession({ sessionId: clientSessionId })
      : await agentClient.createSession({ agentName: OSS_AGENT_NAME });

    if (clientGone) return;
    send("session", { sessionId: (session as any).id ?? null });

    const turn = session.prepareTurn({
      input: [
        { type: "user.message", content: buildProfilePrompt(developerProfile) },
      ],
    });

    const events = new Map<string, TurnEvent>();
    let finalText = "";

    for await (const { event } of turn.execute({ stream: true })) {
      if (clientGone) return;

      if (isEventDelta(event)) {
        const base = events.get(event.id);
        if (base) mergeEventDelta(base, event);

        if (
          typeof event.reasoning_content === "string" &&
          event.reasoning_content
        ) {
          send("thinking", { content: event.reasoning_content });
        }
        if (typeof event.content === "string" && event.content) {
          finalText += event.content;
          send("chunk", { content: event.content });
        }
      } else {
        events.set(event.id, event);
      }

      if (DEBUG_AGENT_EVENTS) {
        console.log(`[agent event] ${event.type}`, JSON.stringify(event));
      }
    }

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
    console.error("OSS discover error:", error);
    if (!clientGone) {
      send("error", { error: error.message || "Agent session failed" });
      res.end();
    }
  }
});

export default router;
