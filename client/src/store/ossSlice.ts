/* eslint-disable @typescript-eslint/no-explicit-any */
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import api from "../api/axios";
import type { RootState } from "./store";

interface OssState {
  recommendation: string | null;
  status: "idle" | "loading" | "succeeded" | "failed";
  error: string | null;
}

const initialState: OssState = {
  recommendation: null,
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
      return res.data.recommendation as string;
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
      state.recommendation = null;
      state.status = "idle";
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(findOssProjects.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(findOssProjects.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.recommendation = action.payload;
      })
      .addCase(findOssProjects.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload as string;
      });
  },
});

export const { resetOssRecommendation } = ossSlice.actions;
export default ossSlice.reducer;
