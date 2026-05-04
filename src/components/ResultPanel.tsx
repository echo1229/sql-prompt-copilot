import { motion, AnimatePresence } from "framer-motion";
import { Copy, FileText, GitBranch, ListChecks, AlertTriangle } from "lucide-react";
import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { DAGVisualization } from "@/components/DAGVisualization";
import { showToast } from "@/components/Toast";
import type { AIResponse, Modification, DAGNode, DAGEdge } from "@/types";
import type { ValidationResult } from "@/lib/sqlValidator";
import type { AnalysisWarning } from "@/lib/sqlParser";
import { useClipboard } from "@/hooks/useTauri";

interface ResultPanelProps {
  result: AIResponse | null;
  visible: boolean;
  validation?: ValidationResult | null;
  astNodes?: DAGNode[];
  astEdges?: DAGEdge[];
  analysis?: AnalysisWarning[];
}

function CopyButton({ text }: { text: string }) {
  const copy = useClipboard();

  const handleCopy = useCallback(async () => {
    await copy(text);
    showToast("success", "已复制到剪贴板");
  }, [text, copy]);

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleCopy}
      className="h-8 px-3 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
    >
      <Copy className="h-3.5 w-3.5" />
      复制
    </Button>
  );
}

function ModificationItem({ mod }: { mod: Modification }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/30 border border-border/30">
      <div className="mt-0.5 shrink-0 w-1.5 h-1.5 rounded-full bg-primary" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground line-through">{mod.original}</span>
          <span className="text-muted-foreground">→</span>
          <span className="text-foreground font-medium">{mod.modified}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">{mod.reason}</p>
      </div>
    </div>
  );
}

const panelVariants = {
  hidden: { opacity: 0, height: 0, marginTop: 0 },
  visible: {
    opacity: 1,
    height: "auto",
    marginTop: 16,
    transition: {
      duration: 0.4,
      ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number],
      staggerChildren: 0.1,
    },
  },
  exit: {
    opacity: 0,
    height: 0,
    marginTop: 0,
    transition: { duration: 0.3 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0 },
};

export function ResultPanel({ result, visible, validation, astNodes, astEdges, analysis }: ResultPanelProps) {
  if (!result) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          variants={panelVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="w-full overflow-hidden space-y-4"
        >
          {/* Validation Warnings */}
          {validation && validation.warnings.length > 0 && (
            <motion.div
              variants={itemVariants}
              className="rounded-xl bg-yellow-500/10 border border-yellow-500/20 p-3"
            >
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-3.5 w-3.5 text-yellow-400" />
                <span className="text-xs font-medium text-yellow-400">校验警告</span>
              </div>
              <div className="space-y-1">
                {validation.warnings.map((w, i) => (
                  <p key={i} className="text-xs text-yellow-400/80">{w}</p>
                ))}
              </div>
            </motion.div>
          )}

          {/* Optimized Prompt Panel */}
          <motion.div
            variants={itemVariants}
            className="rounded-xl bg-secondary/20 border border-border/30 p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-medium text-foreground">
                  优化后的 Prompt
                </h3>
              </div>
              <CopyButton text={result.optimized_prompt} />
            </div>
            <pre className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap font-mono bg-background/50 rounded-lg p-3 max-h-40 overflow-y-auto selectable">
              {result.optimized_prompt}
            </pre>
          </motion.div>

          {/* Modifications Panel */}
          {result.modifications.length > 0 && (
            <motion.div
              variants={itemVariants}
              className="rounded-xl bg-secondary/20 border border-border/30 p-4"
            >
              <div className="flex items-center gap-2 mb-3">
                <ListChecks className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-medium text-foreground">
                  修改记录
                </h3>
              </div>
              <div className="space-y-2">
                {result.modifications.map((mod, i) => (
                  <ModificationItem key={i} mod={mod} />
                ))}
              </div>
            </motion.div>
          )}

          {/* DAG Panel (AST-based) */}
          <motion.div
            variants={itemVariants}
            className="rounded-xl bg-secondary/20 border border-border/30 p-4"
          >
            <div className="flex items-center gap-2 mb-3">
              <GitBranch className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-medium text-foreground">
                SQL 执行逻辑可视化
              </h3>
              {astNodes && astNodes.length > 0 && astNodes !== result.dag_nodes && (
                <span className="text-[10px] text-primary/60 bg-primary/10 px-1.5 py-0.5 rounded">
                  AST 解析
                </span>
              )}
            </div>
            <DAGVisualization
              nodes={astNodes || result.dag_nodes}
              edges={astEdges || result.dag_edges}
              analysis={analysis}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
