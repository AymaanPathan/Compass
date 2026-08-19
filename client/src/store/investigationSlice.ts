/* eslint-disable @typescript-eslint/no-explicit-any */
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import api from "../api/axios";

export interface RelevantFunction {
  name: string;
  purpose: string;
  relevanceToIssue: string;
}

export interface RelevantFile {
  path: string;
  reason: string;
  relevantFunctions: RelevantFunction[];
}

export interface FlowStep {
  step: number;
  file: string;
  function: string;
  description: string;
}

export interface RecommendedStep {
  step: number;
  action: string;
  details: string;
}

export interface SuggestedTest {
  scenario: string;
  whatToTest: string;
  expectedResult: string;
}

export interface IssueInvestigation {
  issueSummary: {
    title: string;
    simpleExplanation: string;
  };
  currentBehavior: {
    summary: string;
    technicalDetails: string[];
  };
  expectedBehavior: {
    summary: string;
    differenceFromCurrentBehavior: string;
  };
  relevantFiles: RelevantFile[];
  howCodeCurrentlyWorks: FlowStep[];
  currentCodeExplanation: string;
  likelyRootCause: {
    summary: string;
    detailedExplanation: string;
    evidence: string[];
    isConfirmed: boolean;
  };
  recommendedApproach: RecommendedStep[];
  suggestedTests: SuggestedTest[];
  investigationLimitations: string[];
  confidence: number;
}

interface InvestigationState {
  data: IssueInvestigation | null;
  issueNumber: number | null;
  repoFullName: string | null;
  parseFailed: boolean;
  raw: string | null;
  status: "idle" | "loading" | "succeeded" | "failed";
  error: string | null;
}

const initialState: InvestigationState = {
  data: null,
  issueNumber: null,
  repoFullName: null,
  parseFailed: false,
  raw: null,
  status: "idle",
  error: null,
};

export const investigateIssue = createAsyncThunk(
  "investigation/run",
  async (
    payload: { repoFullName: string; issueNumber: number },
    { rejectWithValue },
  ) => {
    try {
      const res = await api.post("/api/investigate", payload);
      return { ...res.data, ...payload } as {
        investigation: IssueInvestigation | null;
        raw: string;
        parseFailed: boolean;
        repoFullName: string;
        issueNumber: number;
      };
    } catch (err: any) {
      return rejectWithValue(
        err.response?.data?.error || "Failed to investigate issue",
      );
    }
  },
);

const investigationSlice = createSlice({
  name: "investigation",
  initialState,
  reducers: {
    resetInvestigation: () => initialState,
  },
  extraReducers: (builder) => {
    builder
      .addCase(investigateIssue.pending, (state) => {
        state.status = "loading";
        state.error = null;
        state.data = null;
      })
      .addCase(investigateIssue.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.data = action.payload.investigation;
        state.raw = action.payload.raw;
        state.parseFailed = action.payload.parseFailed;
        state.repoFullName = action.payload.repoFullName;
        state.issueNumber = action.payload.issueNumber;
      })
      .addCase(investigateIssue.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload as string;
      });
  },
});

export const { resetInvestigation } = investigationSlice.actions;
export default investigationSlice.reducer;
