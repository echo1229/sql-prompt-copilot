import { useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { register, unregister } from "@tauri-apps/plugin-global-shortcut";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";

export function useGlobalShortcut(
  shortcut: string,
  callback: () => void
) {
  useEffect(() => {
    let cancelled = false;

    const reg = async () => {
      try {
        await unregister(shortcut);
      } catch {
        // ignore - shortcut may not be registered yet
      }
      if (cancelled) return;
      try {
        await register(shortcut, (event) => {
          if (event.state === "Pressed") {
            callback();
          }
        });
      } catch {
        // ignore - hotkey may already be registered (HMR)
      }
    };
    reg();
    return () => {
      cancelled = true;
      unregister(shortcut).catch(() => {});
    };
  }, [shortcut, callback]);
}

export function useClipboard() {
  return useCallback(async (text: string) => {
    await writeText(text);
  }, []);
}

export function useToggleWindow() {
  return useCallback(async () => {
    await invoke("toggle_window");
  }, []);
}

export function useHideWindow() {
  return useCallback(async () => {
    await invoke("hide_window");
  }, []);
}
