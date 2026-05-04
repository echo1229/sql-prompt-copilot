import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Search, Loader2, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export type QueryMode = "generate" | "optimize" | "explain";

const MODES: { value: QueryMode; label: string }[] = [
  { value: "generate", label: "生成 SQL 提示词" },
  { value: "optimize", label: "优化已有 SQL" },
  { value: "explain", label: "解释 SQL 语句" },
];

interface SearchInputProps {
  onSubmit: (query: string, mode: QueryMode) => void;
  isLoading: boolean;
}

export function SearchInput({ onSubmit, isLoading }: SearchInputProps) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<QueryMode>("generate");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSubmit = () => {
    if (query.trim() && !isLoading) {
      onSubmit(query.trim(), mode);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSubmit();
    }
  };

  const currentMode = MODES.find((m) => m.value === mode)!;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="w-full"
    >
      <div className="relative flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              mode === "generate"
                ? "描述你需要的 SQL 查询..."
                : mode === "optimize"
                ? "粘贴需要优化的 SQL..."
                : "粘贴需要解释的 SQL..."
            }
            className="h-14 pl-12 pr-4 text-base bg-secondary/50 border-border/50 rounded-xl focus-visible:ring-primary/30 focus-visible:border-primary/50 transition-all duration-200"
            disabled={isLoading}
          />
        </div>

        {/* Split Button */}
        <div ref={dropdownRef} className="relative flex">
          <Button
            onClick={handleSubmit}
            disabled={!query.trim() || isLoading}
            className="h-14 pl-5 pr-3 rounded-l-xl rounded-r-none bg-primary hover:bg-primary/90 text-primary-foreground font-medium transition-all duration-200 gap-2 border-r border-primary-foreground/20"
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Sparkles className="h-5 w-5" />
            )}
            {isLoading ? "生成中..." : currentMode.label}
          </Button>
          <Button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            disabled={isLoading}
            className="h-14 px-2 rounded-r-xl rounded-l-none bg-primary hover:bg-primary/90 text-primary-foreground transition-all duration-200"
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform duration-200 ${
                dropdownOpen ? "rotate-180" : ""
              }`}
            />
          </Button>

          {/* Dropdown */}
          <AnimatePresence>
            {dropdownOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.98 }}
                transition={{ duration: 0.15 }}
                className="absolute top-full right-0 mt-2 w-48 rounded-lg bg-secondary/90 backdrop-blur-md border border-border/50 shadow-lg overflow-hidden z-50"
              >
                {MODES.map((m) => (
                  <button
                    key={m.value}
                    onClick={() => {
                      setMode(m.value);
                      setDropdownOpen(false);
                    }}
                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                      mode === m.value
                        ? "bg-primary/20 text-primary"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
