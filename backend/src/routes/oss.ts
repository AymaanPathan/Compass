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

function parseRepository(text: string): OssRepository | null {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  const parsed = JSON.parse(cleaned);

  if (!parsed.repository) {
    return null;
  }

  return parsed.repository;
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

    const stream = await client.sessions.createTurnStream(session.id, {
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
                  .filter((item) => item.type === "text")
                  .map((item) => item.text)
                  .join("");
        }
      }
    }

    console.log("[oss/discover] final output:");
    console.log(finalOutput);

    const repository = parseRepository(finalOutput);

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
