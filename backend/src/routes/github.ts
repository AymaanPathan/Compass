import { Router, Response } from "express";
import User from "../models/User";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { agentClient, DEV_PROFILE_AGENT_NAME } from "../services/agentClient";
import { withAgentRetry } from "../utils/retryAgentTurn";

const DEBUG_AGENT_EVENTS = process.env.DEBUG_AGENT_EVENTS === "true";
const router = Router();

interface TechConfidence {
  name: string;
  confidence: number;
}

export interface DeveloperProfile {
  builderArchetype: string;
  developerType: string;
  summary: string;
  githubVibe: string;
  experienceLevel:
    | "Beginner"
    | "Early Intermediate"
    | "Intermediate"
    | "Advanced";
  strongestTechnologies: TechConfidence[];
  strengths: string[];
  engineeringPatterns: string[];
  contributionAreas: string[];
  funInsights: string[];
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

function parseProfileResponse(text: string): DeveloperProfile | null {
  try {
    const cleaned = text.trim().replace(/^```json\s*|\s*```$/g, "");
    const parsed = JSON.parse(cleaned);
    if (
      !parsed.builderArchetype ||
      !Array.isArray(parsed.strongestTechnologies)
    ) {
      return null;
    }
    return parsed as DeveloperProfile;
  } catch {
    return null;
  }
}

// Agent Harness session, not the Gateway's stateless chat pattern.
// We persist session.id on the user doc and resume via getSession()
// instead of creating a new session (and losing context) on every call.
async function getOrCreateProfileSession(user: any) {
  if (user.developerProfileSessionId) {
    try {
      console.log("♻️ Reusing session:", user.developerProfileSessionId);

      return await agentClient.getSession({
        sessionId: user.developerProfileSessionId,
      });
    } catch (err) {
      console.warn("Session invalid, creating new one");
    }
  }

  const session = await agentClient.createSession({
    agentName: DEV_PROFILE_AGENT_NAME,
  });

  console.log("🆕 Created session:", session.id);

  user.developerProfileSessionId = session.id;
  await user.save();

  return session;
}

// The developer-profile-agent has its own GitHub MCP tools (get_me,
// search_repositories, list_commits, search_code) preloaded — it gathers
// evidence itself. We no longer fetch/pass stack data; we just trigger
// the analysis instruction and let the agent do its own GitHub exploration.
//
// ⚠️ This assumes the agent's GitHub MCP connection resolves to the
// correct per-request user. If it's a single shared connection, every
// call analyzes the same GitHub identity regardless of who's logged
// into Compass — verify this before relying on it in production.
async function runProfileAgent(user: any): Promise<string> {
  return withAgentRetry(async () => {
    const session = await getOrCreateProfileSession(user);

    const turn = session.prepareTurn({
      input: [
        {
          type: "user.message",
          content:
            "Analyze the authenticated developer's GitHub profile and repositories now, using the GitHub MCP tools available to you. Produce the developer profile exactly as specified in your instructions.",
        },
      ],
    });

    let finalText = "";
    for await (const data of turn.execute({ stream: true })) {
      const chunk = extractText(data.event);
      if (chunk) finalText += chunk;
      if (DEBUG_AGENT_EVENTS) {
        console.log(
          `[profile agent event] ${data.event?.type}`,
          JSON.stringify(data.event),
        );
      }
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

router.get("/profile", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    const forceRefresh = req.query.refresh === "true";

    // Serve cached profile unless caller explicitly wants a fresh one
    if (!forceRefresh && user.developerProfile) {
      return res.json({
        success: true,
        profile: user.developerProfile,
        raw: user.developerProfileRaw ?? null,
        parseFailed: user.developerProfileParseFailed ?? false,
        cached: true,
        generatedAt: user.developerProfileGeneratedAt,
      });
    }

    const finalText = await runProfileAgent(user);
    const profile = parseProfileResponse(finalText);

    if (!profile) {
      console.warn(
        "Developer profile agent: failed to parse JSON, returning raw fallback",
      );
      user.developerProfileRaw = finalText;
      user.developerProfileParseFailed = true;
      user.developerProfileGeneratedAt = new Date();
      await user.save();

      return res.json({
        success: true,
        profile: null,
        raw: finalText,
        parseFailed: true,
        cached: false,
      });
    }

    user.developerProfile = profile as any;
    user.developerProfileRaw = finalText;
    user.developerProfileParseFailed = false;
    user.developerProfileGeneratedAt = new Date();
    await user.save();

    return res.json({
      success: true,
      profile,
      raw: finalText,
      parseFailed: false,
      cached: false,
      generatedAt: user.developerProfileGeneratedAt,
    });
  } catch (error: any) {
    console.error(
      "Developer profile fetch error:",
      error.response?.data || error.message,
    );

    if (error.response?.status === 401) {
      return res.status(401).json({
        success: false,
        error: "GitHub token invalid, please log in again",
      });
    }

    res
      .status(500)
      .json({ success: false, error: "Failed to analyze GitHub profile" });
  }
});

export default router;
