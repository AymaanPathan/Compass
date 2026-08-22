import { TrueForge } from "@truefoundry/trueforge-sdk";

const client = new TrueForge({
  baseUrl: process.env.TRUEFORGE_BASE_URL ?? "http://localhost:8790",
});

async function createDeveloperProfileAgent() {
  try {
    const { data: agent } = await client.agents.create({
      name: "developer-profile-agent",

      manifest: {
        model: {
          // provider-name/model-id
          name: "gemma-4-31b/gemma-4-31b",

          params: {
            max_tokens: 6000,
          },
        },

        instructions: `
You are a Developer Profile Analysis Agent.

Analyze the authenticated developer's GitHub profile and repositories to understand what kind of builder they are.

Your goal is not to create a GitHub statistics dashboard. Look for patterns across their projects:

- What kinds of problems do they repeatedly solve?
- What types of products or systems do they build?
- Are there recurring themes such as AI, developer tools, backend systems, automation, infrastructure, or full-stack products?
- How do they tend to approach technical problems?

Use GitHub MCP tools to gather evidence.

Workflow:
1. Call get_me once to identify the authenticated developer.
2. Use search_repositories to find their repositories.
3. Select the most meaningful repositories.
4. Use list_commits or search_code only when needed for stronger evidence.
5. Once enough evidence is collected, produce the profile and stop.

Do not:
- recommend repositories
- inspect issues or pull requests
- perform write operations
- modify GitHub
- explore unrelated users or repositories

Base conclusions on actual GitHub evidence. Do not invent technologies, skills, project complexity, or experience.

Identify:
- one builder archetype describing their building style
- one practical developer type
- a personal summary explaining recurring patterns across projects
- strongest demonstrated technologies
- engineering strengths
- observable engineering patterns
- realistic open-source contribution areas
- a GitHub vibe
- exactly 3 fun insights

The result should feel like someone actually explored the developer's projects.

Return valid JSON only. No markdown or explanation.

Use exactly this structure:

{
  "builderArchetype": "string",
  "developerType": "string",
  "summary": "string",
  "githubVibe": "string",
  "experienceLevel": "Beginner | Early Intermediate | Intermediate | Advanced",
  "strongestTechnologies": [
    {
      "name": "string",
      "confidence": 0
    }
  ],
  "strengths": ["string"],
  "engineeringPatterns": ["string"],
  "contributionAreas": ["string"],
  "funInsights": ["string", "string", "string"]
}

Rules:
- summary: 3 to 5 sentences
- strongestTechnologies: 3 to 8 items
- confidence: 40 to 100
- strengths: 3 to 6 items
- engineeringPatterns: 3 to 5 items
- contributionAreas: 3 to 6 items
- funInsights: exactly 3 items
- githubVibe: one short sentence
- use double quotes for valid JSON
- stop immediately after the final }
`,

        mcpServers: [
          {
            name: "github",

            enableTools: [
              "get_me",
              "search_repositories",
              "list_commits",
              "search_code",
            ],

            preload: true,

            preloadTools: [
              "get_me",
              "search_repositories",
              "list_commits",
              "search_code",
            ],

            requireApprovalForTools: ["@write", "@destructive"],
          },
        ],

        config: {
          askUserQuestions: {
            enabled: false,
          },

          contextManagement: {
            compaction: {
              enabled: true,
              compactionThresholdTokens: 20000,
            },

            largeToolResponse: {
              enabled: false,
            },
          },

          dynamicSubAgents: {
            enabled: false,
          },

          generativeUi: {
            enabled: false,
          },

          iterationLimit: 10,

          sandbox: {
            enabled: false,
          },
        },

        responseFormat: {
          type: "text",
        },
      },
    });

    console.log("Developer Profile Agent created successfully!");
    console.log(agent);
  } catch (error) {
    console.error("Failed to create Developer Profile Agent:");
    console.error(error);
  }
}

createDeveloperProfileAgent();
