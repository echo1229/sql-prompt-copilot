import { useState } from "react";
import { Database, Plug, Unplug, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { DbConnectionConfig, DbDbType, SchemaTable } from "@/types";

const DB_TYPES: { value: DbDbType; label: string; defaultPort: number }[] = [
  { value: "mysql", label: "MySQL", defaultPort: 3306 },
  { value: "postgres", label: "PostgreSQL", defaultPort: 5432 },
  { value: "sqlite", label: "SQLite", defaultPort: 0 },
];

const DB_CONFIG_KEY = "sql-copilot-db-config";

function loadSavedConfig(): DbConnectionConfig {
  try {
    const saved = localStorage.getItem(DB_CONFIG_KEY);
    if (saved) return JSON.parse(saved);
  } catch { /* ignore */ }
  return { dbType: "mysql", host: "localhost", port: 3306, user: "root", password: "", database: "" };
}

interface DatabasePanelProps {
  connected: boolean;
  schema: SchemaTable[] | null;
  loading: boolean;
  error: string | null;
  onConnect: (config: DbConnectionConfig) => void;
  onDisconnect: () => void;
  onTest: (config: DbConnectionConfig) => Promise<string>;
}

export function DatabasePanel({
  connected,
  schema,
  loading,
  error,
  onConnect,
  onDisconnect,
  onTest,
}: DatabasePanelProps) {
  const [config, setConfig] = useState<DbConnectionConfig>(loadSavedConfig);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const isSqlite = config.dbType === "sqlite";

  const updateConfig = (patch: Partial<DbConnectionConfig>) => {
    setConfig((c) => {
      const next = { ...c, ...patch };
      if (patch.dbType) {
        const dbType = DB_TYPES.find((d) => d.value === patch.dbType);
        if (dbType) next.port = dbType.defaultPort;
      }
      return next;
    });
    setTestResult(null);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const msg = await onTest(config);
      setTestResult({ ok: true, msg });
    } catch (err) {
      setTestResult({ ok: false, msg: err instanceof Error ? err.message : String(err) });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* DB Type */}
      <div>
        <label className="text-xs text-muted-foreground mb-1.5 block">数据库类型</label>
        <div className="flex gap-2">
          {DB_TYPES.map((dt) => (
            <button
              key={dt.value}
              onClick={() => updateConfig({ dbType: dt.value })}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-colors border ${
                config.dbType === dt.value
                  ? "bg-primary/20 border-primary/50 text-primary"
                  : "bg-background/50 border-border/30 text-muted-foreground hover:text-foreground"
              }`}
            >
              {dt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Connection fields */}
      {!isSqlite && (
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2">
            <label className="text-xs text-muted-foreground mb-1.5 block">主机</label>
            <Input
              value={config.host}
              onChange={(e) => updateConfig({ host: e.target.value })}
              placeholder="localhost"
              className="h-9 bg-background/50"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">端口</label>
            <Input
              type="number"
              value={config.port}
              onChange={(e) => updateConfig({ port: parseInt(e.target.value) || 0 })}
              placeholder="3306"
              className="h-9 bg-background/50"
            />
          </div>
        </div>
      )}

      {isSqlite ? (
        <div>
          <label className="text-xs text-muted-foreground mb-1.5 block">数据库文件路径</label>
          <Input
            value={config.database}
            onChange={(e) => updateConfig({ database: e.target.value })}
            placeholder="/path/to/database.db"
            className="h-9 bg-background/50"
          />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">用户名</label>
              <Input
                value={config.user}
                onChange={(e) => updateConfig({ user: e.target.value })}
                placeholder="root"
                className="h-9 bg-background/50"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">密码</label>
              <Input
                type="password"
                value={config.password}
                onChange={(e) => updateConfig({ password: e.target.value })}
                placeholder="••••••"
                className="h-9 bg-background/50"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">数据库名</label>
            <Input
              value={config.database}
              onChange={(e) => updateConfig({ database: e.target.value })}
              placeholder="my_database"
              className="h-9 bg-background/50"
            />
          </div>
        </>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleTest}
          disabled={testing || connected}
          className="flex-1 gap-1.5"
        >
          {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plug className="h-3.5 w-3.5" />}
          测试连接
        </Button>
        {connected ? (
          <Button variant="destructive" size="sm" onClick={onDisconnect} className="flex-1 gap-1.5">
            <Unplug className="h-3.5 w-3.5" />
            断开
          </Button>
        ) : (
          <Button size="sm" onClick={() => onConnect(config)} disabled={loading} className="flex-1 gap-1.5">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Database className="h-3.5 w-3.5" />}
            连接
          </Button>
        )}
      </div>

      {/* Test result */}
      {testResult && (
        <div
          className={`flex items-center gap-2 p-2.5 rounded-lg text-xs ${
            testResult.ok
              ? "bg-green-500/10 border border-green-500/20 text-green-400"
              : "bg-destructive/10 border border-destructive/20 text-destructive"
          }`}
        >
          {testResult.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
          {testResult.msg}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
        </div>
      )}

      {/* Schema preview */}
      {connected && schema && (
        <div className="p-3 rounded-lg bg-background/50 border border-border/30">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
            <span className="text-xs text-green-400 font-medium">
              已获取 {schema.length} 张表的结构
            </span>
          </div>
          <div className="max-h-32 overflow-y-auto space-y-1">
            {schema.map((t) => (
              <div key={t.name} className="text-xs text-muted-foreground">
                <span className="text-foreground font-mono">{t.name}</span>
                <span className="text-muted-foreground/50 ml-2">({t.columns.length} 列)</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
