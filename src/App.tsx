import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Settings } from "lucide-react";
import { SearchInput, type QueryMode } from "@/components/SearchInput";
import { ResultPanel } from "@/components/ResultPanel";
import { SettingsPanel } from "@/components/SettingsPanel";
import { ToastContainer } from "@/components/Toast";
import { useGlobalShortcut, useToggleWindow } from "@/hooks/useTauri";
import { useAI } from "@/hooks/useAI";
import { useDatabase } from "@/hooks/useDatabase";
import { setExternalSchema } from "@/lib/schemaRAG";

function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { state, result, error, submit, clear } = useAI();
  const db = useDatabase();

  useEffect(() => {
    setExternalSchema(db.schema);
  }, [db.schema]);

  const toggleWindow = useToggleWindow();
  useGlobalShortcut("Alt+Space", toggleWindow);

  const handleSubmit = useCallback(
    (query: string, mode: QueryMode) => {
      submit(query, mode);
    },
    [submit]
  );

  const handleClear = useCallback(() => {
    clear();
  }, [clear]);

  return (
    <div
      data-tauri-drag-region
      onContextMenu={(e) => e.preventDefault()}
      className="h-screen w-screen flex items-center justify-center p-4 bg-background rounded-xl border border-white/10 shadow-2xl shadow-black/50"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-2xl"
      >
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          data-tauri-drag-region
          className="flex items-center justify-between mb-4"
        >
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="text-xs text-muted-foreground font-medium tracking-wide uppercase">
              SQL Prompt Copilot
            </span>
          </div>
          <div className="flex items-center gap-1">
            {state !== "idle" && (
              <button
                onClick={handleClear}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
              >
                清除
              </button>
            )}
            <button
              onClick={() => setSettingsOpen(true)}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>
        </motion.div>

        {/* Search Input */}
        <SearchInput onSubmit={handleSubmit} isLoading={state === "loading"} />

        {/* Error State */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Result Panels */}
        {result && (
          <ResultPanel
            result={result.response}
            visible={state === "result"}
            validation={result.validation}
            astNodes={result.astNodes}
            astEdges={result.astEdges}
            analysis={result.analysis}
          />
        )}

        {/* Footer Hint */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-6 text-center"
        >
          <p className="text-[11px] text-muted-foreground/50">
            按{" "}
            <kbd className="px-1.5 py-0.5 rounded bg-secondary/50 text-muted-foreground/70 text-[10px] font-mono">
              Alt+Space
            </kbd>{" "}
            呼出窗口
          </p>
        </motion.div>
      </motion.div>

      {/* Settings Panel */}
      <AnimatePresence>
        {settingsOpen && (
          <SettingsPanel
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Toast Notifications */}
      <ToastContainer />
    </div>
  );
}

export default App;
