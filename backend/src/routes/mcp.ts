import { Router, Request, Response } from "express";
import {
  listGithubMcpTools,
  callGithubMcpTool,
} from "../services/githubMcpClient";

const router = Router();

// Verify auth — lists all tools the gateway exposes for this integration
router.get("/github/tools", async (_req: Request, res: Response) => {
  try {
    const tools = await listGithubMcpTools();
    res.json({ success: true, tools: tools.tools.map((t) => t.name) });
  } catch (error: any) {
    console.error("MCP tools error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Test search_repositories
router.get(
  "/github/search-repositories",
  async (req: Request, res: Response) => {
    try {
      const query =
        (req.query.q as string) || "language:typescript stars:>1000";
      const result = await callGithubMcpTool("search_repositories", { query });
      res.json({ success: true, result });
    } catch (error: any) {
      console.error("search_repositories error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  },
);

// Test list_issues
router.get("/github/list-issues", async (req: Request, res: Response) => {
  try {
    const { owner, repo } = req.query as { owner: string; repo: string };
    if (!owner || !repo) {
      return res.status(400).json({
        success: false,
        error: "owner and repo query params required",
      });
    }
    const result = await callGithubMcpTool("list_issues", {
      owner,
      repo,
      state: "OPEN",
    });
    res.json({ success: true, result });
  } catch (error: any) {
    console.error("list_issues error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Test issue_read
router.get("/github/issue", async (req: Request, res: Response) => {
  try {
    const { owner, repo, issue_number } = req.query as {
      owner: string;
      repo: string;
      issue_number: string;
    };
    if (!owner || !repo || !issue_number) {
      return res
        .status(400)
        .json({ success: false, error: "owner, repo, issue_number required" });
    }
    const result = await callGithubMcpTool("issue_read", {
      method: "get",
      owner,
      repo,
      issue_number: Number(issue_number),
    });
    res.json({ success: true, result });
  } catch (error: any) {
    console.error("issue_read error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// --------------------------------------------------
// Direct file fetch — no agent, straight MCP call.
// Used by "View Code" on investigation relevantFiles.
// --------------------------------------------------

interface McpTextBlock {
  type: string;
  text?: string;
}

interface ParsedFileContent {
  content: string;
  isTruncated: boolean;
  isBinary: boolean;
  path: string;
}

function extractFileContent(result: any, path: string): ParsedFileContent {
  const blocks: McpTextBlock[] = result?.content || [];
  const rawText = blocks
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("\n");

  if (!rawText) {
    return { content: "", isTruncated: false, isBinary: false, path };
  }

  // "too large" message case from GitHub MCP server
  if (rawText.includes("too large to display")) {
    return { content: rawText, isTruncated: true, isBinary: false, path };
  }

  // Some gateways wrap the file in a JSON envelope: { content, encoding, size, ... }
  try {
    const parsed = JSON.parse(rawText);
    if (parsed && typeof parsed === "object" && "content" in parsed) {
      const encoding = parsed.encoding;
      const body =
        encoding === "base64"
          ? Buffer.from(parsed.content, "base64").toString("utf-8")
          : String(parsed.content);
      return { content: body, isTruncated: false, isBinary: false, path };
    }
  } catch {
    // Not JSON — the GitHub MCP server already returns decoded plain text
    // for text files under 1MB, so this is the normal path.
  }

  return { content: rawText, isTruncated: false, isBinary: false, path };
}

router.post("/github/file-contents", async (req: Request, res: Response) => {
  try {
    const { owner, repo, path, ref } = req.body as {
      owner: string;
      repo: string;
      path: string;
      ref?: string;
    };

    if (!owner || !repo || !path) {
      return res.status(400).json({
        success: false,
        error: "owner, repo, and path are required",
      });
    }

    const args: Record<string, unknown> = { owner, repo, path };
    if (ref) args.ref = ref;

    const result = await callGithubMcpTool("get_file_contents", args);
    const file = extractFileContent(result, path);

    return res.json({ success: true, file });
  } catch (error: any) {
    console.error("get_file_contents error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
