/* eslint-disable @typescript-eslint/no-explicit-any */
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import api from "../api/axios";
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

interface OssState {
  repositories: RepoRecommendation[];
  bestMatch: BestMatch | null;
  selectedRepo: RepoRecommendation | null;
  columns: Record<OssColumnId, string[]>; // repo.url[]
  parseFailed: boolean;
  raw: string | null;
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
  status: "idle",
  error: null,
};

export const findOssProjects = createAsyncThunk(
  "oss/discover",
  async (_, { getState, rejectWithValue }) => {
    try {
      const state = getState() as RootState;
      const { stack, repos } = state.github;

      if (!stack) {
        return rejectWithValue("GitHub stack not loaded yet");
      }

      const res = await api.post("/api/oss/discover", { stack, repos });
      return res.data as {
        repositories: RepoRecommendation[];
        bestMatch: BestMatch | null;
        raw: string;
        parseFailed: boolean;
      };
    } catch (err: any) {
      return rejectWithValue(
        err.response?.data?.error || "Failed to get OSS recommendation",
      );
    }
  },
);

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
  },
  extraReducers: (builder) => {
    builder
      .addCase(findOssProjects.pending, (state) => {
        state.status = "loading";
        state.error = null;
        state.selectedRepo = null;
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
} = ossSlice.actions;
export default ossSlice.reducer;
