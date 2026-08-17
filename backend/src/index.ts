import "dotenv/config";
import express, { Request, Response } from "express";
import cors from "cors";
import OpenAI from "openai";

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

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
        {
          role: "system",
          content: "You are a helpful AI assistant.",
        },
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

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Compass backend listening on port ${PORT}`);
});
