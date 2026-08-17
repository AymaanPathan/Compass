import { Router, Response } from "express";
import axios from "axios";
import User from "../models/User";
import { requireAuth, AuthRequest } from "../middleware/auth";

const router = Router();

router.get("/profile", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    const headers = { Authorization: `Bearer ${user.accessToken}` };

    // core profile
    const profileRes = await axios.get("https://api.github.com/user", {
      headers,
    });

    // repos (owned, most recently pushed first)
    const reposRes = await axios.get(
      "https://api.github.com/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator",
      { headers },
    );

    const repos = reposRes.data;

    // language breakdown across repos (cheap version: repo.language field, not per-repo language stats API)
    const languageCounts: Record<string, number> = {};
    repos.forEach((repo: any) => {
      if (repo.language) {
        languageCounts[repo.language] =
          (languageCounts[repo.language] || 0) + 1;
      }
    });

    const topLanguages = Object.entries(languageCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([lang, count]) => ({ language: lang, repoCount: count }));

    const totalStars = repos.reduce(
      (sum: number, r: any) => sum + r.stargazers_count,
      0,
    );
    const originalRepos = repos.filter((r: any) => !r.fork);

    const profile = profileRes.data;

    res.json({
      success: true,
      profile: {
        githubId: String(profile.id),
        username: profile.login,
        displayName: profile.name,
        avatarUrl: profile.avatar_url,
        bio: profile.bio,
        company: profile.company,
        location: profile.location,
        publicRepos: profile.public_repos,
        followers: profile.followers,
        following: profile.following,
        createdAt: profile.created_at,
      },
      stack: {
        topLanguages,
        totalRepos: repos.length,
        originalRepos: originalRepos.length,
        forkedRepos: repos.length - originalRepos.length,
        totalStars,
      },
      repos: repos.slice(0, 20).map((r: any) => ({
        name: r.name,
        fullName: r.full_name,
        description: r.description,
        language: r.language,
        stars: r.stargazers_count,
        forks: r.forks_count,
        isFork: r.fork,
        updatedAt: r.updated_at,
        url: r.html_url,
      })),
    });
  } catch (error: any) {
    console.error(
      "GitHub profile fetch error:",
      error.response?.data || error.message,
    );

    // access token expired/revoked
    if (error.response?.status === 401) {
      return res
        .status(401)
        .json({
          success: false,
          error: "GitHub token invalid, please log in again",
        });
    }

    res
      .status(500)
      .json({ success: false, error: "Failed to fetch GitHub profile" });
  }
});

export default router;
