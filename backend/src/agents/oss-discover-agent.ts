import { TrueForge } from "@truefoundry/trueforge-sdk";

const client = new TrueForge({
  baseUrl: "http://localhost:8790",
});

async function createAgent() {
  const { data: agent } = await client.agents.create({
    name: "oss-discover-agent",

    manifest: {
      model: {
        name: "gemma-4-31b/gemma-4-31b",
        params: {
          max_tokens: 500,
        },
      },

      instructions: `
You are OSS Discover.

Output ONLY valid JSON.

The user provides a developerProfile object.

Your goal is to find exactly ONE high-quality open-source repository
that matches the developer's product-building identity.

AVAILABLE TOOLS:

- search_repositories

REQUIRED TOOL SEQUENCE:

1. Call search_repositories exactly once.
2. After that tool call, immediately return the final JSON.

HARD RULES:

- Never call search_repositories more than once.
- Never retry a tool.
- Never call any other tool.
- Do not perform additional verification.
- Do not make any tool call after search_repositories.

Read the developer profile and prioritize:

- developerType
- builderArchetype
- summary
- strengths
- engineeringPatterns
- contributionAreas

Use strongestTechnologies only as a secondary signal.

Create ONE short repository search query.

The query MUST describe the developer's strongest PRODUCT DOMAIN.

Never put technology names like TypeScript, React, Node.js,
Python, Docker, or PostgreSQL in the search query.

The query should be approximately 2 to 5 words.

After search_repositories returns results, select ONE repository.

The repository must:

- Have at least 500 GitHub stars
- Have at least 50 open issues
- Be owned by an organization or well-known open-source project
- Be a real product, SaaS, self-hosted tool, or developer platform
- Have multiple contributors

Avoid:

- personal projects
- toy projects
- demos
- libraries
- SDKs
- API clients
- boilerplates
- starter templates
- obvious mega-projects

If no repository meets the criteria, return:

{
  "repository": null
}

Return exactly:

{
  "repository": {
    "owner": "string",
    "name": "string",
    "fullName": "owner/repository",
    "url": "string",
    "description": "string",
    "primaryTechnology": "string",
    "fitScore": 0,
    "whyItMatches": "string",
    "difficulty": "intermediate"
  }
}

FINAL RULES:

- Return exactly one repository or repository: null.
- Never return alternatives.
- Never invent repository information.
- fitScore must be an integer from 0 to 100.
- difficulty must always be "intermediate".
- Never add extra fields.
- Never output markdown.
- Never ask questions.
- Return valid JSON only.
`,

      mcpServers: [
        {
          name: "github",
          enableTools: ["search_repositories"],
          preload: false,
          preloadTools: ["search_repositories"],
        },
      ],

      config: {
        askUserQuestions: {
          enabled: false,
        },

        dynamicSubAgents: {
          enabled: false,
        },

        generativeUi: {
          enabled: false,
        },

        iterationLimit: 7,

        sandbox: {
          enabled: false,
        },
      },

      responseFormat: {
        type: "json_object",
      },
    },
  });

  console.log("Agent created successfully:");
  console.log(agent);
}

createAgent().catch(console.error);
