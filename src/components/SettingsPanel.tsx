import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Eye, EyeOff, Save, Database, Cpu } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DatabasePanel } from "@/components/DatabasePanel";
import { loadConfig, saveConfig, applyPreset, type AIConfig } from "@/data/config";
import { PROVIDER_PRESETS, getPreset } from "@/data/providers";
import { useDatabase } from "@/hooks/useDatabase";
import type { DbConnectionConfig } from "@/types";

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

type TabId = "api" | "db";

export function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const [tab, setTab] = useState<TabId>("api");
  const [config, setConfig] = useState<AIConfig>(loadConfig);
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);

  const db = useDatabase();

  useEffect(() => {
    if (open) {
      setConfig(loadConfig());
      setSaved(false);
    }
  }, [open]);

  const handleSave = () => {
    saveConfig(config);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const handleProviderChange = (providerId: string) => {
    const patch = applyPreset(providerId);
    setConfig((c) => ({ ...c, ...patch }));
  };

  const currentPreset = getPreset(config.provider);
  const models = currentPreset.models;
  const isCustom = config.provider === "custom";

  if (!open) return null;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95 }}
        animate={{ scale: 1 }}
        className="w-full max-w-md mx-4 rounded-xl bg-secondary/40 border border-border/40 p-6 space-y-5 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Tabs */}
        <div className="flex gap-1 bg-background/30 rounded-lg p-1">
          <button
            onClick={() => setTab("api")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-medium transition-colors ${
              tab === "api" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Cpu className="h-3.5 w-3.5" />
            AI 模型
          </button>
          <button
            onClick={() => setTab("db")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-medium transition-colors ${
              tab === "db" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Database className="h-3.5 w-3.5" />
            数据库
          </button>
        </div>

        {/* API Tab */}
        {tab === "api" && (
          <div className="space-y-4">
            {/* Provider selector */}
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">模型提供商</label>
              <div className="grid grid-cols-4 gap-1.5">
                {PROVIDER_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleProviderChange(p.id)}
                    className={`py-2 px-2 rounded-lg text-[11px] font-medium transition-colors border truncate ${
                      config.provider === p.id
                        ? "bg-primary/20 border-primary/50 text-primary"
                        : "bg-background/50 border-border/30 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Model selector */}
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">模型</label>
              {isCustom ? (
                <Input
                  value={config.model}
                  onChange={(e) => setConfig((c) => ({ ...c, model: e.target.value }))}
                  placeholder="model-name"
                  className="h-9 bg-background/50"
                />
              ) : (
                <select
                  value={config.model}
                  onChange={(e) => setConfig((c) => ({ ...c, model: e.target.value }))}
                  className="w-full h-9 rounded-lg bg-background/50 border border-border/50 px-3 text-sm text-foreground"
                >
                  {models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* API URL (custom only) */}
            {isCustom && (
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">API 地址</label>
                <Input
                  value={config.apiUrl}
                  onChange={(e) => setConfig((c) => ({ ...c, apiUrl: e.target.value }))}
                  placeholder="https://api.example.com/v1/chat/completions"
                  className="h-9 bg-background/50"
                />
              </div>
            )}

            {/* API Key */}
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">API Key</label>
              <div className="relative">
                <Input
                  type={showKey ? "text" : "password"}
                  value={config.apiKey}
                  onChange={(e) => setConfig((c) => ({ ...c, apiKey: e.target.value }))}
                  placeholder="sk-..."
                  className="h-9 bg-background/50 pr-10"
                />
                <button
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Format badge */}
            <div className="text-[11px] text-muted-foreground/50">
              API 格式: <span className="text-muted-foreground/70 font-mono">{currentPreset.format}</span>
              {!isCustom && (
                <span className="ml-2 text-muted-foreground/40 truncate inline-block max-w-[200px] align-bottom">
                  {config.apiUrl}
                </span>
              )}
            </div>
          </div>
        )}

        {/* DB Tab */}
        {tab === "db" && (
          <DatabasePanel
            connected={db.connected}
            schema={db.schema}
            loading={db.loading}
            error={db.error}
            onConnect={(cfg: DbConnectionConfig) => db.connect(cfg)}
            onDisconnect={() => db.disconnect()}
            onTest={(cfg: DbConnectionConfig) => db.testConnection(cfg)}
          />
        )}

        {/* Footer */}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-muted-foreground">
            关闭
          </Button>
          {tab === "api" && (
            <Button size="sm" onClick={handleSave} className="gap-1.5">
              <Save className="h-3.5 w-3.5" />
              {saved ? "已保存" : "保存"}
            </Button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
