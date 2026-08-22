import { TrueForge } from "@truefoundry/trueforge-sdk";

export const agentClient = new TrueForge({
  baseUrl: process.env.TRUEFORGE_BASE_URL ?? "http://localhost:8790",
  timeoutInSeconds: 600,
});

export const OSS_AGENT_NAME = "oss-discover-agent";
export const DEV_PROFILE_AGENT_NAME = "developer-profile-agent";
