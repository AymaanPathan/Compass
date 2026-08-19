import { Router, Request, Response } from "express";
import {
  agentClient,
  OSS_ISSUE_UNDERSTANDING_AGENT_NAME,
} from "../services/agentClient";
import { withAgentRetry } from "../utils/retryAgentTurn";

const DEBUG_AGENT_EVENTS = process.env.DEBUG_AGENT_EVENTS === "true";
const router = Router();

export interface RelevantFunction {
  name: string;
  purpose: string;
  relevanceToIssue: string;
}

export interface RelevantFile {
  path: string;
  reason: string;
  relevantFunctions: RelevantFunction[];
}

export interface FlowStep {
  step: number;
  file: string;
  function: string;
  description: string;
}

export interface RecommendedStep {
  step: number;
  action: string;
  details: string;
}

export interface SuggestedTest {
  scenario: string;
  whatToTest: string;
  expectedResult: string;
}

export interface IssueInvestigation {
  issueSummary: {
    title: string;
    simpleExplanation: string;
  };
  currentBehavior: {
    summary: string;
    technicalDetails: string[];
  };
  expectedBehavior: {
    summary: string;
    differenceFromCurrentBehavior: string;
  };
  relevantFiles: RelevantFile[];
  howCodeCurrentlyWorks: FlowStep[];
  currentCodeExplanation: string;
  likelyRootCause: {
    summary: string;
    detailedExplanation: string;
    evidence: string[];
    isConfirmed: boolean;
  };
  recommendedApproach: RecommendedStep[];
  suggestedTests: SuggestedTest[];
  investigationLimitations: string[];
  confidence: number;
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

function parseInvestigation(text: string): IssueInvestigation | null {
  try {
    const cleaned = text.trim().replace(/^```json\s*|\s*```$/g, "");
    const parsed = JSON.parse(cleaned);

    if (
      !parsed.issueSummary ||
      typeof parsed.issueSummary.simpleExplanation !== "string" ||
      !Array.isArray(parsed.relevantFiles)
    ) {
      return null;
    }

    return {
      issueSummary: {
        title: parsed.issueSummary?.title || "",
        simpleExplanation: parsed.issueSummary?.simpleExplanation || "",
      },
      currentBehavior: {
        summary: parsed.currentBehavior?.summary || "",
        technicalDetails: parsed.currentBehavior?.technicalDetails || [],
      },
      expectedBehavior: {
        summary: parsed.expectedBehavior?.summary || "",
        differenceFromCurrentBehavior:
          parsed.expectedBehavior?.differenceFromCurrentBehavior || "",
      },
      relevantFiles: (parsed.relevantFiles || []).map((f: any) => ({
        path: f?.path || "",
        reason: f?.reason || "",
        relevantFunctions: f?.relevantFunctions || [],
      })),
      howCodeCurrentlyWorks: parsed.howCodeCurrentlyWorks || [],
      currentCodeExplanation: parsed.currentCodeExplanation || "",
      likelyRootCause: {
        summary: parsed.likelyRootCause?.summary || "",
        detailedExplanation: parsed.likelyRootCause?.detailedExplanation || "",
        evidence: parsed.likelyRootCause?.evidence || [],
        isConfirmed: Boolean(parsed.likelyRootCause?.isConfirmed),
      },
      recommendedApproach: parsed.recommendedApproach || [],
      suggestedTests: parsed.suggestedTests || [],
      investigationLimitations: parsed.investigationLimitations || [],
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
    };
  } catch {
    return null;
  }
}

async function runInvestigationAgent(prompt: string): Promise<string> {
  return withAgentRetry(async () => {
    const session = await agentClient.createSession({
      agentName: OSS_ISSUE_UNDERSTANDING_AGENT_NAME,
    });

    const turn = session.prepareTurn({
      input: [{ type: "user.message", content: prompt }],
    });

    let finalText = "";
    for await (const data of turn.execute({ stream: true })) {
      const chunk = extractText(data.event);
      if (chunk) finalText += chunk;
      if (DEBUG_AGENT_EVENTS) {
        console.log(
          `[investigate agent event] ${data.event?.type}`,
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

router.post("/", async (req: Request, res: Response) => {
  try {
    const { repoFullName, issueNumber, issueUrl } = req.body;

    if (!repoFullName || (!issueNumber && !issueUrl)) {
      return res.status(400).json({
        success: false,
        error: "repoFullName and (issueNumber or issueUrl) are required",
      });
    }

    const prompt = issueUrl
      ? `Repository: ${repoFullName}\nIssue URL: ${issueUrl}`
      : `Repository: ${repoFullName}\nIssue number: ${issueNumber}`;

    const finalText = await runInvestigationAgent(prompt);
    const investigation = parseInvestigation(finalText);

    if (!investigation) {
      console.warn("Investigate: failed to parse JSON, returning raw fallback");
      return res.json({
        success: true,
        investigation: null,
        raw: finalText,
        parseFailed: true,
      });
    }

    return res.json({
      success: true,
      investigation,
      raw: finalText,
      parseFailed: false,
    });
  } catch (error: any) {
    console.error("Investigate error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
