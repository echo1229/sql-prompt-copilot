import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, X, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { showToast } from "@/components/Toast";

interface SendToFeishuDialogProps {
  open: boolean;
  onClose: () => void;
  prompt: string;
  sql?: string;
}

export function SendToFeishuDialog({ open, onClose, prompt, sql }: SendToFeishuDialogProps) {
  const [editedPrompt, setEditedPrompt] = useState(prompt);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<"success" | "error" | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  // 当 dialog 打开时同步 prompt
  const handleOpen = useCallback(() => {
    setEditedPrompt(prompt);
    setResult(null);
    setErrorMsg("");
  }, [prompt]);

  const handleSend = useCallback(async () => {
    if (!editedPrompt.trim()) {
      showToast("error", "提示词不能为空");
      return;
    }

    setSending(true);
    setResult(null);

    try {
      const response = await fetch("http://localhost:8000/copilot/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: editedPrompt,
          sql: sql || "",
        }),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        throw new Error(`服务器返回 ${response.status}: ${errText}`);
      }

      await response.json();
      setResult("success");
      showToast("success", "已发送至飞书 Agent");
      setTimeout(() => onClose(), 1500);
    } catch (err) {
      setResult("error");
      setErrorMsg(err instanceof Error ? err.message : "发送失败");
      showToast("error", "发送失败，请确认飞书 Agent 服务已启动");
    } finally {
      setSending(false);
    }
  }, [editedPrompt, sql, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
          onAnimationStart={handleOpen}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="w-full max-w-lg mx-4 rounded-xl bg-background border border-border/50 shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
              <div className="flex items-center gap-2">
                <Send className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-medium">发送至飞书 Agent</h3>
              </div>
              <button
                onClick={onClose}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                以下是生成的任务提示词，你可以编辑后再发送到飞书 Agent 执行。
              </p>

              <textarea
                value={editedPrompt}
                onChange={(e) => setEditedPrompt(e.target.value)}
                className="w-full h-48 p-3 text-sm font-mono bg-background/50 border border-border/30 rounded-lg resize-y focus:outline-none focus:ring-1 focus:ring-primary/50 selectable"
                placeholder="任务提示词..."
              />

              {/* Result feedback */}
              {result === "success" && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-green-500/10 border border-green-500/20">
                  <CheckCircle className="h-4 w-4 text-green-400" />
                  <span className="text-xs text-green-400">发送成功！飞书 Agent 正在处理...</span>
                </div>
              )}
              {result === "error" && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20">
                  <AlertCircle className="h-4 w-4 text-red-400" />
                  <span className="text-xs text-red-400">{errorMsg}</span>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border/30">
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="text-xs"
              >
                取消
              </Button>
              <Button
                size="sm"
                onClick={handleSend}
                disabled={sending || !editedPrompt.trim()}
                className="text-xs gap-1.5"
              >
                {sending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    发送中...
                  </>
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5" />
                    发送
                  </>
                )}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
