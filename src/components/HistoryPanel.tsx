import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  getHistory,
  toggleFavorite,
  deleteHistory,
  clearHistory,
  type QueryHistoryRecord,
} from "@/lib/historyService";
import { Search, Star, Trash2, Copy, X, Clock } from "lucide-react";

interface HistoryPanelProps {
  onSelect: (sql: string) => void;
  onClose: () => void;
}

export function HistoryPanel({ onSelect, onClose }: HistoryPanelProps) {
  const [records, setRecords] = useState<QueryHistoryRecord[]>([]);
  const [search, setSearch] = useState("");
  const [favOnly, setFavOnly] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getHistory({ search: search || undefined, favoritesOnly: favOnly, limit: 100 });
      setRecords(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [search, favOnly]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleToggleFav = async (id: number) => {
    await toggleFavorite(id);
    refresh();
  };

  const handleDelete = async (id: number) => {
    await deleteHistory(id);
    refresh();
  };

  const handleClear = async () => {
    await clearHistory(true);
    refresh();
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="flex flex-col h-full bg-zinc-900 border-l border-zinc-800 w-80"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-zinc-400" />
          <span className="text-sm font-medium text-zinc-200">查询历史</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleClear}
            className="p-1 text-zinc-500 hover:text-red-400 transition-colors"
            title="清空历史"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={onClose} className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Search + Filter */}
      <div className="flex items-center gap-2 p-2 border-b border-zinc-800">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索 SQL..."
            className="w-full pl-7 pr-2 py-1.5 text-xs bg-zinc-800 text-zinc-200 rounded border border-zinc-700 focus:border-blue-500 outline-none"
          />
        </div>
        <button
          onClick={() => setFavOnly(!favOnly)}
          className={`p-1.5 rounded transition-colors ${favOnly ? "text-yellow-400 bg-yellow-400/10" : "text-zinc-500 hover:text-yellow-400"}`}
          title="仅收藏"
        >
          <Star className="w-3.5 h-3.5" fill={favOnly ? "currentColor" : "none"} />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-zinc-500 text-xs">加载中...</div>
        ) : records.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-zinc-600 text-xs">
            {search ? "无匹配结果" : "暂无历史记录"}
          </div>
        ) : (
          <AnimatePresence>
            {records.map((r) => (
              <motion.div
                key={r.id}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="group border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors"
              >
                <div className="p-2.5">
                  <div className="flex items-start justify-between gap-1">
                    <pre
                      className="text-xs text-zinc-300 font-mono whitespace-pre-wrap break-all line-clamp-3 cursor-pointer flex-1"
                      onClick={() => onSelect(r.sql_text)}
                    >
                      {r.sql_text}
                    </pre>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        onClick={() => handleToggleFav(r.id)}
                        className={`p-0.5 ${r.is_favorite ? "text-yellow-400" : "text-zinc-600 hover:text-yellow-400"}`}
                      >
                        <Star className="w-3 h-3" fill={r.is_favorite ? "currentColor" : "none"} />
                      </button>
                      <button
                        onClick={() => navigator.clipboard.writeText(r.sql_text)}
                        className="p-0.5 text-zinc-600 hover:text-blue-400"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => handleDelete(r.id)}
                        className="p-0.5 text-zinc-600 hover:text-red-400"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 text-[10px] text-zinc-600">
                    <span>{r.created_at}</span>
                    {r.connection_name && <span>| {r.connection_name}</span>}
                    {r.duration_ms != null && <span>| {r.duration_ms}ms</span>}
                    <span className="capitalize">| {r.mode}</span>
                    {r.status !== "success" && <span className="text-red-400">| {r.status}</span>}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </motion.div>
  );
}
