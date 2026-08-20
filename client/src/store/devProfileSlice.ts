/* eslint-disable @typescript-eslint/no-explicit-any */
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import api from "../api/axios";

interface TechConfidence {
  name: string;
  confidence: number;
}

export interface DeveloperProfile {
  builderArchetype: string;
  developerType: string;
  summary: string;
  githubVibe: string;
  experienceLevel:
    | "Beginner"
    | "Early Intermediate"
    | "Intermediate"
    | "Advanced";
  strongestTechnologies: TechConfidence[];
  strengths: string[];
  engineeringPatterns: string[];
  contributionAreas: string[];
  funInsights: string[];
}

interface DevProfileState {
  profile: DeveloperProfile | null;
  parseFailed: boolean;
  raw: string | null;
  status: "idle" | "loading" | "succeeded" | "failed";
  error: string | null;
}

const initialState: DevProfileState = {
  profile: null,
  parseFailed: false,
  raw: null,
  status: "idle",
  error: null,
};

export const fetchDeveloperProfile = createAsyncThunk(
  "devProfile/fetch",
  async (_, { rejectWithValue }) => {
    try {
      const res = await api.get("/api/investigate/profile");
      return res.data;
    } catch (err: any) {
      return rejectWithValue(
        err.response?.data?.error || "Failed to analyze GitHub profile",
      );
    }
  },
);

const devProfileSlice = createSlice({
  name: "devProfile",
  initialState,
  reducers: {
    resetDevProfile: (state) => {
      state.profile = null;
      state.parseFailed = false;
      state.raw = null;
      state.status = "idle";
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchDeveloperProfile.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchDeveloperProfile.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.profile = action.payload.profile;
        state.parseFailed = action.payload.parseFailed;
        state.raw = action.payload.raw ?? null;
      })
      .addCase(fetchDeveloperProfile.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload as string;
      });
  },
});

export const { resetDevProfile } = devProfileSlice.actions;
export default devProfileSlice.reducer;
