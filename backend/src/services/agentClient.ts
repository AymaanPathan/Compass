import { AgentSessionClient } from "truefoundry-gateway-sdk/agents";

export const agentClient = new AgentSessionClient({
  apiKey: process.env.TFY_API_KEY!,
  baseUrl: process.env.TFY_GATEWAY_URL || process.env.TFY_BASE_URL!,
});

export const OSS_AGENT_NAME = "oss-discover-agent";
export const OSS_ISSUE_AGENT_NAME = "oss-issue-discover-agent";
