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

interface McpContentBlock {
  type: string;
  text?: string;
  resource?: {
    uri?: string;
    mimeType?: string;
    text?: string;
    blob?: string; // base64
  };
}

interface ParsedFileContent {
  content: string;
  isTruncated: boolean;
  isBinary: boolean;
  path: string;
}

function extractFileContent(result: any, path: string): ParsedFileContent {
  const blocks: McpContentBlock[] = result?.content || [];

  // The real file body comes back as a "resource" block, not a "text" block.
  // The "text" block is just a status message like
  // "successfully downloaded text file (SHA: ...)".
  const resourceBlock = blocks.find((b) => b.type === "resource" && b.resource);

  if (resourceBlock?.resource) {
    const { text, blob, mimeType } = resourceBlock.resource;

    if (typeof text === "string") {
      return { content: text, isTruncated: false, isBinary: false, path };
    }

    if (typeof blob === "string") {
      const isLikelyBinary =
        mimeType &&
        !mimeType.startsWith("text/") &&
        !mimeType.includes("json") &&
        !mimeType.includes("javascript") &&
        !mimeType.includes("xml");

      if (isLikelyBinary) {
        return { content: "", isTruncated: false, isBinary: true, path };
      }

      try {
        const decoded = Buffer.from(blob, "base64").toString("utf-8");
        return { content: decoded, isTruncated: false, isBinary: false, path };
      } catch {
        return { content: "", isTruncated: false, isBinary: true, path };
      }
    }
  }

  // Fallback: no resource block — use whatever text blocks exist.
  const rawText = blocks
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("\n");

  if (!rawText) {
    return { content: "", isTruncated: false, isBinary: false, path };
  }

  if (rawText.includes("too large to display")) {
    return { content: rawText, isTruncated: true, isBinary: false, path };
  }

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
    // Not JSON, and no resource block — this is a genuine status/error message.
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

    // The MCP server signals failure via result.isError, not via a thrown
    // exception — a wrong/nonexistent path returns isError: true with the
    // reason in a text block, not a resource block.
    if (result?.isError) {
      const contentBlocks: McpContentBlock[] = Array.isArray(result?.content)
        ? (result.content as McpContentBlock[])
        : [];

      const message =
        contentBlocks
          .filter((b) => b.type === "text" && typeof b.text === "string")
          .map((b) => b.text)
          .join("\n") || "File not found in repository.";

      return res.status(404).json({ success: false, error: message, path });
    }

    const file = extractFileContent(result, path);
    return res.json({ success: true, file });
  } catch (error: any) {
    console.error("get_file_contents error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
