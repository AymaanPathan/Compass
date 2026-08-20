import "dotenv/config";
import express, { Request, Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import OpenAI from "openai";
import { connectDB } from "./config/db";
import authRoutes from "./routes/auth";
import githubRoutes from "./routes/github";
import mcpRoutes from "./routes/mcp";
import ossRoutes from "./routes/oss";
import issuesRoutes from "./routes/issues";
import investigateRoutes from "./routes/investigate";



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
console.log("investigate routes mounted"); 

const openai = new OpenAI({
  apiKey: process.env.TFY_API_KEY,
  baseURL: process.env.TFY_BASE_URL,
  defaultHeaders: {
    "X-TFY-METADATA": "{}",
    "X-TFY-LOGGING-CONFIG": '{"enabled": true}',
  },
});

app.get("/", (req: Request, res: Response) => {
  res.json({ message: "Compass backend is running" });
});

app.get("/health", (req: Request, res: Response) => {
  res.json({ status: "ok" });
});

app.post("/api/test-agent", async (req: Request, res: Response) => {
  try {
    const { message } = req.body;
    const response = await openai.chat.completions.create({
      model: "groq/openai-gpt-oss-20b",
      messages: [
        { role: "system", content: "You are a helpful AI assistant." },
        {
          role: "user",
          content: message || "Say exactly: TrueFoundry connected successfully",
        },
      ],
      max_tokens: 500,
    });
    return res.json({
      success: true,
      response: response.choices[0]?.message?.content,
    });
  } catch (error: any) {
    console.error("TrueFoundry error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Compass backend listening on port ${PORT}`);
});
