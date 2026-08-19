/* eslint-disable @typescript-eslint/no-explicit-any */
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import api from "../api/axios";
import type { RootState } from "./store";

export interface GithubIssue {
  number: number;
  title: string;
  labels: string[];
  url: string;
}

interface IssuesState {
  repoFullName: string | null;
  issues: GithubIssue[];
  nextCursor: string;
  hasMore: boolean;
  status: "idle" | "loading" | "loadingMore" | "succeeded" | "failed";
  error: string | null;
  parseFailed: boolean;
  raw: string | null;
}

const initialState: IssuesState = {
  repoFullName: null,
  issues: [],
  nextCursor: "",
  hasMore: false,
  status: "idle",
  error: null,
  parseFailed: false,
  raw: null,
};

export const fetchIssuesForRepo = createAsyncThunk(
  "issues/fetch",
  async (repoFullName: string, { rejectWithValue }) => {
    try {
      const res = await api.post("/api/issues/fetch", { repoFullName });
      return { ...res.data, repoFullName } as {
        issues: GithubIssue[];
        nextCursor: string;
        raw: string;
        parseFailed: boolean;
        repoFullName: string;
      };
    } catch (err: any) {
      return rejectWithValue(
        err.response?.data?.error || "Failed to fetch issues",
      );
    }
  },
);

export const fetchMoreIssues = createAsyncThunk(
  "issues/fetchMore",
  async (_, { getState, rejectWithValue }) => {
    const state = getState() as RootState;
    const { repoFullName, nextCursor } = state.issues;
    if (!repoFullName || !nextCursor) return rejectWithValue("No more issues");
    try {
      const res = await api.post("/api/issues/fetch", {
        repoFullName,
        after: nextCursor,
      });
      return res.data as {
        issues: GithubIssue[];
        nextCursor: string;
        raw: string;
        parseFailed: boolean;
      };
    } catch (err: any) {
      return rejectWithValue(
        err.response?.data?.error || "Failed to fetch more issues",
      );
    }
  },
);

const issuesSlice = createSlice({
  name: "issues",
  initialState,
  reducers: {
    resetIssues: () => initialState,
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchIssuesForRepo.pending, (state) => {
        state.status = "loading";
        state.error = null;
        state.issues = [];
      })
      .addCase(fetchIssuesForRepo.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.repoFullName = action.payload.repoFullName;
        state.issues = action.payload.issues;
        state.nextCursor = action.payload.nextCursor;
        state.hasMore = Boolean(action.payload.nextCursor);
        state.parseFailed = action.payload.parseFailed;
        state.raw = action.payload.raw;
      })
      .addCase(fetchIssuesForRepo.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload as string;
      })
      .addCase(fetchMoreIssues.pending, (state) => {
        state.status = "loadingMore";
      })
      .addCase(fetchMoreIssues.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.issues = [...state.issues, ...action.payload.issues];
        state.nextCursor = action.payload.nextCursor;
        state.hasMore = Boolean(action.payload.nextCursor);
      })
      .addCase(fetchMoreIssues.rejected, (state, action) => {
        state.status = "succeeded";
        state.error = action.payload as string;
      });
  },
});

export const { resetIssues } = issuesSlice.actions;
export default issuesSlice.reducer;
