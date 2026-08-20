// frontend/src/store/ossSlice.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import type { RootState } from "./store";

export interface KeyComponent {
  name: string;
  description: string;
}

export interface OssRepository {
  owner: string;
  name: string;
  fullName: string;
  url: string;
  description: string;
  primaryTechnology: string;
  fitScore: number;
  whyItMatches: string;
  whatItDoes: string;
  keyComponents: KeyComponent[];
  recommendedStartingPoint: string;
  difficulty: string;
}

interface DiscoverResult {
  repository: OssRepository | null;
  raw: string;
  parseFailed: boolean;
}

interface OssState {
  repository: OssRepository | null;
  parseFailed: boolean;
  raw: string | null;
  thinking: string; // streamed reasoning_content, accumulated live
  liveOutput: string; // streamed final-answer content, accumulated live
  sessionId: string | null;
  status: "idle" | "loading" | "succeeded" | "failed";
  error: string | null;
}

const initialState: OssState = {
  repository: null,
  parseFailed: false,
  raw: null,
  thinking: "",
  liveOutput: "",
  sessionId: localStorage.getItem("oss_session_id") ?? null,
  status: "idle",
  error: null,
};

export const findOssRepository = createAsyncThunk<
  DiscoverResult,
  void,
  { state: RootState; rejectValue: string }
>(
  "oss/discover",
  async (_, { getState, dispatch, rejectWithValue, signal }) => {
    const state = getState();
    const { profile } = state.devProfile;
    const { sessionId } = state.oss;

    if (!profile) {
      return rejectWithValue("Developer profile not loaded yet");
    }

    console.log("[findOssRepository] starting fetch");
    signal.addEventListener("abort", () => {
      console.log(
        "[findOssRepository] thunk signal ABORTED, reason:",
        signal.reason,
      );
    });

     let res: Response;
     try {
       res = await fetch(
         `${import.meta.env.VITE_API_URL || "http://localhost:5000"}/api/oss/discover`,
         {
           method: "POST",
           headers: { "Content-Type": "application/json" },
           credentials: "include",
           body: JSON.stringify({ developerProfile: profile, sessionId }),
           signal, // <-- important: without this, RTK's cancellation was never wired to the request
         },
       );
     } catch (err) {
       console.log("[findOssRepository] fetch threw:", err);
       return rejectWithValue("Couldn't reach the agent service");
     }

    if (!res.ok || !res.body) {
      return rejectWithValue(`Discover request failed (${res.status})`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let result: DiscoverResult | null = null;
    let streamError: string | null = null;

    const handleEvent = (rawEvent: string) => {
      const lines = rawEvent.split("\n");
      const eventLine = lines.find((l) => l.startsWith("event:"));
      const dataLine = lines.find((l) => l.startsWith("data:"));
      if (!eventLine || !dataLine) return;

      const event = eventLine.replace("event:", "").trim();
      let data: any;
      try {
        data = JSON.parse(dataLine.replace("data:", "").trim());
      } catch {
        return;
      }

      if (event === "session") {
        dispatch(streamSession(data.sessionId ?? null));
      } else if (event === "thinking") {
        dispatch(streamThinking(data.content ?? ""));
      } else if (event === "chunk") {
        dispatch(streamChunk(data.content ?? ""));
      } else if (event === "error") {
        streamError = data.error || "Agent session failed";
      } else if (event === "done") {
        result = data as DiscoverResult;
      }
    };

    while (true) {
      let readResult: ReadableStreamReadResult<Uint8Array>;
      try {
        readResult = await reader.read();
      } catch {
        return rejectWithValue("Connection to agent lost mid-stream");
      }
      const { value, done } = readResult;
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() || "";
      for (const rawEvent of events) handleEvent(rawEvent);
    }

    if (buffer.trim()) handleEvent(buffer);

    if (streamError) return rejectWithValue(streamError);
    if (!result) return rejectWithValue("Agent stream ended without a result");
    return result;
  },
);

const ossSlice = createSlice({
  name: "oss",
  initialState,
  reducers: {
    resetOssRecommendation: (state) => {
      state.repository = null;
      state.parseFailed = false;
      state.raw = null;
      state.thinking = "";
      state.liveOutput = "";
      state.sessionId = null;
      state.status = "idle";
      state.error = null;
      localStorage.removeItem("oss_session_id");
    },
    streamSession: (state, action: { payload: string | null }) => {
      state.sessionId = action.payload;
      if (action.payload)
        localStorage.setItem("oss_session_id", action.payload);
      else localStorage.removeItem("oss_session_id");
    },
    streamThinking: (state, action: { payload: string }) => {
      state.thinking += action.payload;
    },
    streamChunk: (state, action: { payload: string }) => {
      state.liveOutput += action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(findOssRepository.pending, (state) => {
        state.status = "loading";
        state.error = null;
        state.repository = null;
        state.thinking = "";
        state.liveOutput = "";
      })
      .addCase(findOssRepository.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.repository = action.payload.repository;
        state.raw = action.payload.raw;
        state.parseFailed = action.payload.parseFailed;
      })
      .addCase(findOssRepository.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload as string;
      });
  },
});

export const {
  resetOssRecommendation,
  streamSession,
  streamThinking,
  streamChunk,
} = ossSlice.actions;
export default ossSlice.reducer;
