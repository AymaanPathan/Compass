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
      return res
        .status(400)
        .json({
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

export default router;
