/* eslint-disable @typescript-eslint/no-explicit-any */
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import type { RootState } from "./store";

export interface RepoRecommendation {
  rank: number;
  name: string;
  url: string;
  description: string;
  whyItMatches: string;
  matchingTechnologies: string[];
  matchScore: number;
}

export interface BestMatch {
  name: string;
  reason: string;
}

export type OssColumnId = "suggested" | "shortlisted" | "selected";

export const OSS_COLUMNS: { id: OssColumnId; title: string; hint: string }[] = [
  { id: "suggested", title: "Suggested", hint: "Agent recommendations" },
  { id: "shortlisted", title: "Shortlisted", hint: "Worth a closer look" },
  { id: "selected", title: "Selected", hint: "Your pick" },
];

interface DiscoverResult {
  repositories: RepoRecommendation[];
  bestMatch: BestMatch | null;
  raw: string;
  parseFailed: boolean;
}

interface OssState {
  repositories: RepoRecommendation[];
  bestMatch: BestMatch | null;
  selectedRepo: RepoRecommendation | null;
  columns: Record<OssColumnId, string[]>; // repo.url[]
  parseFailed: boolean;
  raw: string | null;
  liveOutput: string; // streamed text from the agent, accumulated live
  sessionId: string | null;
  status: "idle" | "loading" | "succeeded" | "failed";
  error: string | null;
}

const emptyColumns: Record<OssColumnId, string[]> = {
  suggested: [],
  shortlisted: [],
  selected: [],
};

const initialState: OssState = {
  repositories: [],
  bestMatch: null,
  selectedRepo: null,
  columns: emptyColumns,
  parseFailed: false,
  raw: null,
  liveOutput: "",
  sessionId: null,
  status: "idle",
  error: null,
};

// Reads the /api/oss/discover SSE stream and dispatches liveOutput/session
// updates as they arrive, resolving once the "done" event lands (or
// rejecting on "error" / a network failure / a stream that never sends
// "done").
export const findOssProjects = createAsyncThunk<
  DiscoverResult,
  void,
  { state: RootState; rejectValue: string }
>("oss/discover", async (_, { getState, dispatch, rejectWithValue }) => {
  const state = getState();
  const { stack, repos } = state.github;

  if (!stack) {
    return rejectWithValue("GitHub stack not loaded yet");
  }

  let res: Response;
  try {
    res = await fetch(
      `${import.meta.env.VITE_API_URL || "http://localhost:5000"}/api/oss/discover`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ stack, repos }),
      },
    );
  } catch {
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

  // Flush any trailing event left in the buffer without a final \n\n.
  if (buffer.trim()) handleEvent(buffer);

  if (streamError) return rejectWithValue(streamError);
  if (!result) return rejectWithValue("Agent stream ended without a result");
  return result;
});

const ossSlice = createSlice({
  name: "oss",
  initialState,
  reducers: {
    resetOssRecommendation: (state) => {
      state.repositories = [];
      state.bestMatch = null;
      state.selectedRepo = null;
      state.columns = emptyColumns;
      state.parseFailed = false;
      state.raw = null;
      state.liveOutput = "";
      state.sessionId = null;
      state.status = "idle";
      state.error = null;
    },
    selectRepository: (state, action: { payload: RepoRecommendation }) => {
      state.selectedRepo = action.payload;
    },
    clearSelectedRepository: (state) => {
      state.selectedRepo = null;
    },
    moveRepoToColumn: (
      state,
      action: { payload: { repoUrl: string; toColumn: OssColumnId } },
    ) => {
      const { repoUrl, toColumn } = action.payload;
      (Object.keys(state.columns) as OssColumnId[]).forEach((col) => {
        state.columns[col] = state.columns[col].filter((u) => u !== repoUrl);
      });
      state.columns[toColumn].push(repoUrl);

      if (toColumn === "selected") {
        const repo = state.repositories.find((r) => r.url === repoUrl);
        if (repo) state.selectedRepo = repo;
      }
    },
    streamSession: (state, action: { payload: string | null }) => {
      state.sessionId = action.payload;
    },
    streamChunk: (state, action: { payload: string }) => {
      state.liveOutput += action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(findOssProjects.pending, (state) => {
        state.status = "loading";
        state.error = null;
        state.selectedRepo = null;
        state.liveOutput = "";
        state.sessionId = null;
      })
      .addCase(findOssProjects.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.repositories = action.payload.repositories;
        state.bestMatch = action.payload.bestMatch;
        state.raw = action.payload.raw;
        state.parseFailed = action.payload.parseFailed;
        state.columns = {
          suggested: action.payload.repositories.map((r) => r.url),
          shortlisted: [],
          selected: [],
        };
      })
      .addCase(findOssProjects.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload as string;
      });
  },
});

export const {
  resetOssRecommendation,
  selectRepository,
  clearSelectedRepository,
  moveRepoToColumn,
  streamSession,
  streamChunk,
} = ossSlice.actions;
export default ossSlice.reducer;