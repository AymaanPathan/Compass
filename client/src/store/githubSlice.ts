/* eslint-disable @typescript-eslint/no-explicit-any */
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import api from "../api/axios";

interface Repo {
  name: string;
  fullName: string;
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
  isFork: boolean;
  updatedAt: string;
  url: string;
}

interface LanguageStat {
  language: string;
  repoCount: number;
}

interface GithubProfileState {
  profile: any | null;
  stack: {
    topLanguages: LanguageStat[];
    totalRepos: number;
    originalRepos: number;
    forkedRepos: number;
    totalStars: number;
  } | null;
  repos: Repo[];
  status: "idle" | "loading" | "succeeded" | "failed";
  error: string | null;
}

const initialState: GithubProfileState = {
  profile: null,
  stack: null,
  repos: [],
  status: "idle",
  error: null,
};

export const fetchGithubProfile = createAsyncThunk(
  "github/fetchProfile",
  async (_, { rejectWithValue }) => {
    try {
      const res = await api.get("/api/github/profile");
      return res.data;
    } catch (err: any) {
      return rejectWithValue(
        err.response?.data?.error || "Failed to fetch GitHub profile",
      );
    }
  },
);

const githubSlice = createSlice({
  name: "github",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchGithubProfile.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchGithubProfile.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.profile = action.payload.profile;
        state.stack = action.payload.stack;
        state.repos = action.payload.repos;
      })
      .addCase(fetchGithubProfile.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload as string;
      });
  },
});

export default githubSlice.reducer;
