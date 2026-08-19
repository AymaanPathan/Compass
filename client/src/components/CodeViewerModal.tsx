import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "../store/store";
import { closeFileViewer } from "../store/fileContentSlice";

function CodeViewerModal() {
  const dispatch = useDispatch<AppDispatch>();
  const { isOpen, path, content, status, error, isTruncated, isBinary } =
    useSelector((state: RootState) => state.fileContent);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={() => dispatch(closeFileViewer())}
    >
      <div
        className="w-full max-w-3xl max-h-[80vh] flex flex-col rounded-2xl border border-neutral-800 bg-neutral-950 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3 shrink-0">
          <span className="text-xs font-mono text-neutral-300 truncate">
            {path}
          </span>
          <button
            onClick={() => dispatch(closeFileViewer())}
            className="text-neutral-500 hover:text-neutral-300 text-sm shrink-0 ml-3"
          >
            ✕
          </button>
        </div>

        <div className="overflow-auto flex-1 p-4">
          {status === "loading" && (
            <div className="flex items-center justify-center gap-2 text-xs text-neutral-500 py-12">
              <div className="h-3 w-3 rounded-full border-2 border-neutral-700 border-t-white animate-spin" />
              Fetching file…
            </div>
          )}

          {status === "failed" && (
            <p className="text-xs text-red-400">{error}</p>
          )}

          {status === "succeeded" && isBinary && (
            <p className="text-xs text-neutral-500">
              Binary file — cannot display content.
            </p>
          )}

          {status === "succeeded" && !isBinary && isTruncated && (
            <p className="text-xs text-amber-400 whitespace-pre-wrap">
              {content}
            </p>
          )}

          {status === "succeeded" &&
            !isBinary &&
            !isTruncated &&
            (content ? (
              <pre className="text-xs text-neutral-300 font-mono leading-relaxed whitespace-pre-wrap break-words">
                {content}
              </pre>
            ) : (
              <p className="text-xs text-neutral-500">
                No content returned for this file.
              </p>
            ))}
        </div>
      </div>
    </div>
  );
}

export default CodeViewerModal;
