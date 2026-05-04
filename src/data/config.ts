import { getPreset } from "./providers";

export interface AIConfig {
  provider: string;
  apiUrl: string;
  apiKey: string;
  model: string;
}

const STORAGE_KEY = "sql-copilot-ai-config";

const DEFAULT_CONFIG: AIConfig = {
  provider: "deepseek",
  apiUrl: "https://api.deepseek.com/v1/chat/completions",
  apiKey: "",
  model: "deepseek-chat",
};

export function loadConfig(): AIConfig {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
  } catch {
    // ignore
  }
  return { ...DEFAULT_CONFIG };
}

export function saveConfig(config: AIConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function applyPreset(presetId: string): Partial<AIConfig> {
  const preset = getPreset(presetId);
  return {
    provider: presetId,
    apiUrl: preset.apiUrl,
    model: preset.defaultModel,
  };
}
