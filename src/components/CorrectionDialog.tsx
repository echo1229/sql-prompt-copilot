import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, X, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { showToast } from "@/components/Toast";
import { addCorrection, deleteCorrection, getAllCorrections, type Correction } from "@/lib/correctionKB";

interface CorrectionDialogProps {
  open: boolean;
  onClose: () => void;
  currentQuery?: string;
}

export function CorrectionDialog({ open, onClose, currentQuery }: CorrectionDialogProps) {
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [query, setQuery] = useState(currentQuery || "");
  const [errorDesc, setErrorDesc] = useState("");
  const [correctionDesc, setCorrectionDesc] = useState("");

  const refresh = useCallback(() => {
    setCorrections(getAllCorrections());
  }, []);

  useEffect(() => {
    if (open) {
      refresh();
      setQuery(currentQuery || "");
    }
  }, [open, currentQuery, refresh]);

  const handleAdd = useCallback(() => {
    if (!query.trim() || !errorDesc.trim() || !correctionDesc.trim()) {
      showToast("error", "请填写所有字段");
      return;
    }
    addCorrection(query, errorDesc, correctionDesc);
    showToast("success", "已添加纠错记录");
    setQuery("");
    setErrorDesc("");
    setCorrectionDesc("");
    setShowAdd(false);
    refresh();
  }, [query, errorDesc, correctionDesc, refresh]);

  const handleDelete = useCallback((id: string) => {
    deleteCorrection(id);
    refresh();
  }, [refresh]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="w-full max-w-lg mx-4 rounded-xl bg-background border border-border/50 shadow-2xl overflow-hidden max-h-[80vh] flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/30 shrink-0">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-medium">纠错知识库</h3>
                <span className="text-[10px] text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
                  {corrections.length} 条
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setShowAdd(!showAdd)}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
                  title="添加纠错"
                >
                  <Plus className="h-4 w-4" />
                </button>
                <button
                  onClick={onClose}
                  className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {/* Add form */}
              {showAdd && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-2 p-3 rounded-lg bg-secondary/20 border border-border/30"
                >
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="w-full p-2 text-xs bg-background/50 border border-border/30 rounded focus:outline-none focus:ring-1 focus:ring-primary/50"
                    placeholder="用户输入（如：查询所有用户的数量）"
                  />
                  <input
                    value={errorDesc}
                    onChange={(e) => setErrorDesc(e.target.value)}
                    className="w-full p-2 text-xs bg-background/50 border border-border/30 rounded focus:outline-none focus:ring-1 focus:ring-primary/50"
                    placeholder="错误描述（如：使用了 users 表，但实际是 customer 表）"
                  />
                  <input
                    value={correctionDesc}
                    onChange={(e) => setCorrectionDesc(e.target.value)}
                    className="w-full p-2 text-xs bg-background/50 border border-border/30 rounded focus:outline-none focus:ring-1 focus:ring-primary/50"
                    placeholder="正确做法（如：应该使用 customer 表）"
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setShowAdd(false)} className="text-xs">
                      取消
                    </Button>
                    <Button size="sm" onClick={handleAdd} className="text-xs">
                      添加
                    </Button>
                  </div>
                </motion.div>
              )}

              {/* Corrections list */}
              {corrections.length === 0 ? (
                <div className="text-center py-8 text-xs text-muted-foreground">
                  暂无纠错记录。点击右上角 + 添加。
                </div>
              ) : (
                corrections.map((c) => (
                  <div
                    key={c.id}
                    className="p-3 rounded-lg bg-secondary/20 border border-border/30 space-y-1"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-foreground font-medium truncate">{c.query}</p>
                        <p className="text-[11px] text-red-400 mt-1">错误：{c.error}</p>
                        <p className="text-[11px] text-green-400">正确：{c.correction}</p>
                      </div>
                      <button
                        onClick={() => handleDelete(c.id)}
                        className="p-1 rounded text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-colors shrink-0"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <p className="text-[10px] text-muted-foreground">{new Date(c.date).toLocaleString()}</p>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
