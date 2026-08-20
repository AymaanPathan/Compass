import { useEffect } from "react";
import { useDispatch } from "react-redux";
import { Routes, Route } from "react-router-dom";
import type { AppDispatch } from "./store/store";
import { fetchCurrentUser } from "./store/authSlice";
import Landing from "./pages/Landing";
import Analysis from "./pages/Analysis";
import Course from "./pages/Course";
import RepoDetailPage from "./pages/RepoDetailPage";

function App() {
  const dispatch = useDispatch<AppDispatch>();

  useEffect(() => {
    dispatch(fetchCurrentUser());
  }, [dispatch]);

  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/analysis" element={<Analysis />} />
      <Route path="/course" element={<Course />} />
      <Route path="/repo/:owner/:repo" element={<RepoDetailPage />} />
    </Routes>
  );
}

export default App;
