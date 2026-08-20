import { githubClient } from "./githubClient";

export async function fetchGithubStackData(accessToken: string) {
  const gh = githubClient(accessToken);

  const profileRes = await gh.get("/user");
  const reposRes = await gh.get(
    "/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator",
  );
  const repos = reposRes.data;

  const languageCounts: Record<string, number> = {};
  repos.forEach((repo: any) => {
    if (repo.language) {
      languageCounts[repo.language] = (languageCounts[repo.language] || 0) + 1;
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

  return {
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
    // richer slice for the agent — descriptions/topics matter for "pattern" detection
    repos: repos.slice(0, 40).map((r: any) => ({
      name: r.name,
      fullName: r.full_name,
      description: r.description,
      language: r.language,
      stars: r.stargazers_count,
      forks: r.forks_count,
      isFork: r.fork,
      topics: r.topics,
      size: r.size,
      updatedAt: r.updated_at,
      url: r.html_url,
    })),
  };
}
