// backend/src/test-agent.ts
import "dotenv/config";
import { agentClient, OSS_AGENT_NAME } from "./services/agentClient";

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT:", err);
  process.exit(1);
});
process.on("unhandledRejection", (err) => {
  console.error("UNHANDLED REJECTION:", err);
  process.exit(1);
});

async function main() {
  console.log("Creating session...");
  const session = await agentClient.createSession({
    agentName: OSS_AGENT_NAME,
  });
  console.log("Session created:", (session as any).id);

  const turn = session.prepareTurn({
    input: [
      {
        type: "user.message",
        content: 'Say hello in JSON: {"hello": "world"}',
      },
    ],
  });

  console.log("Starting turn.execute...");
  for await (const { event } of turn.execute({ stream: true })) {
    console.log("EVENT:", event.type);
  }
  console.log("Done.");
}

main().catch((err) => console.error("MAIN CAUGHT:", err));
