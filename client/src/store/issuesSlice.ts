/* eslint-disable @typescript-eslint/no-explicit-any */
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import api from "../api/axios";

export interface GithubIssue {
  id: number;
  number: number;
  title: string;
  html_url: string;
  state: string;
  labels?: { name: string; color?: string }[];
  user?: { login: string; avatar_url?: string };
  created_at?: string;
  comments?: number;
}

export type KanbanColumnId = "toExplore" | "inProgress" | "inReview" | "done";

export const KANBAN_COLUMNS: { id: KanbanColumnId; title: string }[] = [
  { id: "toExplore", title: "To Explore" },
  { id: "inProgress", title: "In Progress" },
  { id: "inReview", title: "In Review" },
  { id: "done", title: "Done" },
];

interface IssuesState {
  issuesById: Record<number, GithubIssue>;
  columns: Record<KanbanColumnId, number[]>; // issue ids per column
  repoFullName: string | null;
  raw: string | null;
  parseFailed: boolean;
  status: "idle" | "loading" | "succeeded" | "failed";
  error: string | null;
}

const initialState: IssuesState = {
  issuesById: {},
  columns: { toExplore: [], inProgress: [], inReview: [], done: [] },
  repoFullName: null,
  raw: null,
  parseFailed: false,
  status: "idle",
  error: null,
};

export const fetchIssuesForRepo = createAsyncThunk(
  "issues/discover",
  async (repoFullName: string, { rejectWithValue }) => {
    try {
      const res = await api.post("/api/issues/discover", { repoFullName });
      return {
        repoFullName,
        ...(res.data as {
          issues: GithubIssue[];
          raw: string;
          parseFailed: boolean;
        }),
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
    moveIssue: (
      state,
      action: { payload: { issueId: number; toColumn: KanbanColumnId } },
    ) => {
      const { issueId, toColumn } = action.payload;
      (Object.keys(state.columns) as KanbanColumnId[]).forEach((col) => {
        state.columns[col] = state.columns[col].filter((id) => id !== issueId);
      });
      state.columns[toColumn].push(issueId);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchIssuesForRepo.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchIssuesForRepo.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.repoFullName = action.payload.repoFullName;
        state.raw = action.payload.raw;
        state.parseFailed = action.payload.parseFailed;

        state.issuesById = {};
        state.columns = {
          toExplore: [],
          inProgress: [],
          inReview: [],
          done: [],
        };

        action.payload.issues.forEach((issue) => {
          state.issuesById[issue.id] = issue;
          state.columns.toExplore.push(issue.id);
        });
      })
      .addCase(fetchIssuesForRepo.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload as string;
      });
  },
});

export const { resetIssues, moveIssue } = issuesSlice.actions;
export default issuesSlice.reducer;
