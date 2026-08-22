/* eslint-disable @typescript-eslint/no-explicit-any */
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import api from "../api/axios";

export interface GithubIssue {
  number: number;
  title: string;
  state: string;
  url: string;
  author: string;
  labels: string[];
  createdAt: string;
}

interface IssuesState {
  repoFullName: string | null;
  issues: GithubIssue[];
  status: "idle" | "loading" | "succeeded" | "failed";
  error: string | null;
}

const initialState: IssuesState = {
  repoFullName: null,
  issues: [],
  status: "idle",
  error: null,
};

export const fetchIssuesForRepo = createAsyncThunk(
  "issues/fetch",
  async (repoFullName: string, { rejectWithValue }) => {
    try {
      const res = await api.post("/api/issues/fetch", { repoFullName });
      return { ...res.data, repoFullName } as {
        issues: GithubIssue[];
        repository: string;
        repoFullName: string;
      };
    } catch (err: any) {
      return rejectWithValue(
        err.response?.data?.error || "Failed to fetch issues",
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
      })
      .addCase(fetchIssuesForRepo.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload as string;
      });
  },
});

export const { resetIssues } = issuesSlice.actions;
export default issuesSlice.reducer;
