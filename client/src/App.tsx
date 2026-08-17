import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "./store/store";
import { fetchCurrentUser, logoutUser } from "./store/authSlice";

function App() {
  const dispatch = useDispatch<AppDispatch>();
  const { user, status } = useSelector((state: RootState) => state.auth);

  useEffect(() => {
    dispatch(fetchCurrentUser());
  }, [dispatch]);

  const handleLogin = () => {
    window.location.href = `${import.meta.env.VITE_API_URL || "http://localhost:5000"}/api/auth/github`;
  };

  const handleLogout = () => {
    dispatch(logoutUser());
  };

  if (status === "loading" || status === "idle") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-950">
        <div className="h-6 w-6 rounded-full border-2 border-neutral-600 border-t-white animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-950 text-white">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900 p-8 text-center">
        {user ? (
          <>
            <img
              src={user.avatarUrl}
              alt={user.username}
              className="mx-auto h-16 w-16 rounded-full ring-2 ring-neutral-700"
            />
            <h1 className="mt-4 text-lg font-semibold">{user.displayName}</h1>
            <p className="text-sm text-neutral-400">@{user.username}</p>
            <button
              onClick={handleLogout}
              className="mt-6 w-full rounded-lg bg-neutral-800 py-2 text-sm font-medium hover:bg-neutral-700 transition-colors"
            >
              Log out
            </button>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold">Compass</h1>
            <p className="mt-1 text-sm text-neutral-400">
              Sign in to start contributing to open source.
            </p>
            <button
              onClick={handleLogin}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-white py-2 text-sm font-medium text-black hover:bg-neutral-200 transition-colors"
            >
              <svg
                viewBox="0 0 16 16"
                width="18"
                height="18"
                fill="currentColor"
              >
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
              </svg>
              Continue with GitHub
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default App;
