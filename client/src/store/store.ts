import { configureStore } from "@reduxjs/toolkit";
import authReducer from "./authSlice";
import githubReducer from "./githubSlice";
import ossReducer from "./ossSlice";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    github: githubReducer,
    oss: ossReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
