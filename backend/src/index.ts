import "dotenv/config";
import express, { Request, Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { connectDB } from "./config/db";
import authRoutes from "./routes/auth";
import githubRoutes from "./routes/github";
import mcpRoutes from "./routes/mcp";
import ossRoutes from "./routes/oss";
import issuesRoutes from "./routes/issues";
import investigateRoutes from "./routes/investigate";

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
});
process.on("unhandledRejection", (err) => {
  console.error("UNHANDLED REJECTION:", err);
});

const app = express();
const PORT = process.env.PORT || 5000;

connectDB();

app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser());

app.use("/api/auth", authRoutes);
app.use("/api/github", githubRoutes);
app.use("/api/mcp", mcpRoutes);
app.use("/api/oss", ossRoutes);
app.use("/api/issues", issuesRoutes);
app.use("/api/investigate-issue", investigateRoutes);

app.get("/", (_req: Request, res: Response) => {
  res.json({ message: "Compass backend is running" });
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Compass backend listening on port ${PORT}`);
});
