import { useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import Editor from "@monaco-editor/react";
import type { AppDispatch, RootState } from "../store/store";
import { closeFileViewer } from "../store/fileContentSlice";

// Maps a file extension to the Monaco language id so syntax highlighting
// matches the actual file type.
const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  go: "go",
  py: "python",
  rb: "ruby",
  java: "java",
  c: "c",
  h: "c",
  cpp: "cpp",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  rs: "rust",
  swift: "swift",
  kt: "kotlin",
  sql: "sql",
  sh: "shell",
  bash: "shell",
  yml: "yaml",
  yaml: "yaml",
  toml: "toml",
  md: "markdown",
  html: "html",
  css: "css",
  scss: "scss",
  less: "less",
  xml: "xml",
  dockerfile: "dockerfile",
  graphql: "graphql",
  proto: "protobuf",
};

function getLanguageFromPath(path: string | null): string {
  if (!path) return "plaintext";
  const filename = path.split("/").pop() || path;
  if (filename.toLowerCase() === "dockerfile") return "dockerfile";
  const ext = filename.includes(".")
    ? filename.split(".").pop()?.toLowerCase()
    : undefined;
  return (ext && EXTENSION_TO_LANGUAGE[ext]) || "plaintext";
}

function CodeViewerModal() {
  const dispatch = useDispatch<AppDispatch>();
  const { isOpen, path, content, status, error, isTruncated, isBinary } =
    useSelector((state: RootState) => state.fileContent);

  const language = useMemo(() => getLanguageFromPath(path), [path]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={() => dispatch(closeFileViewer())}
    >
      <div
        className="w-full max-w-5xl h-[85vh] flex flex-col rounded-2xl border border-neutral-800 bg-[#1e1e1e] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3 shrink-0 bg-neutral-950">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-mono text-neutral-300 truncate">
              {path}
            </span>
            {status === "succeeded" && !isBinary && (
              <span className="shrink-0 text-[10px] font-medium rounded-full px-2 py-0.5 text-neutral-400 bg-neutral-800">
                {language}
              </span>
            )}
          </div>
          <button
            onClick={() => dispatch(closeFileViewer())}
            className="text-neutral-500 hover:text-neutral-300 text-sm shrink-0 ml-3"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 min-h-0">
          {status === "loading" && (
            <div className="flex items-center justify-center gap-2 text-xs text-neutral-500 h-full">
              <div className="h-3 w-3 rounded-full border-2 border-neutral-700 border-t-white animate-spin" />
              Fetching file…
            </div>
          )}

          {status === "failed" && (
            <p className="text-xs text-red-400 p-4">{error}</p>
          )}

          {status === "succeeded" && isBinary && (
            <p className="text-xs text-neutral-500 p-4">
              Binary file — cannot display content.
            </p>
          )}

          {status === "succeeded" && !isBinary && (
            <>
              {isTruncated && (
                <p className="text-xs text-amber-400 px-4 pt-3">
                  File is too large to display in full — showing partial
                  content.
                </p>
              )}
              {content ? (
                <Editor
                  height="100%"
                  language={language}
                  value={content}
                  theme="vs-dark"
                  options={{
                    readOnly: true,
                    domReadOnly: true,
                    minimap: { enabled: true },
                    fontSize: 13,
                    lineNumbers: "on",
                    scrollBeyondLastLine: false,
                    wordWrap: "on",
                    automaticLayout: true,
                    padding: { top: 12 },
                    renderLineHighlight: "none",
                    contextmenu: false,
                  }}
                />
              ) : (
                <p className="text-xs text-neutral-500 p-4">
                  No content returned for this file.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default CodeViewerModal;
