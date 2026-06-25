import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface TerminalOutput {
  data: string;
}

let sessionId: string | null = null;

export async function spawnTerminal(): Promise<string> {
  const id = await invoke<string>("terminal_spawn");
  sessionId = id;
  return id;
}

export async function writeTerminal(data: string): Promise<void> {
  if (!sessionId) return;
  await invoke("terminal_write", { sessionId, data });
}

export async function resizeTerminal(rows: number, cols: number): Promise<void> {
  if (!sessionId) return;
  await invoke("terminal_resize", { sessionId, rows, cols });
}

export async function killTerminal(): Promise<void> {
  if (!sessionId) return;
  await invoke("terminal_kill", { sessionId });
  sessionId = null;
}

export function onTerminalOutput(callback: (data: string) => void): () => void {
  let unlisten: (() => void) | undefined;
  listen<TerminalOutput>("terminal-output", (event) => {
    callback(event.payload.data);
  }).then((fn) => { unlisten = fn; });
  return () => { unlisten?.(); };
}

export function onTerminalExit(callback: (sessionId: string) => void): () => void {
  let unlisten: (() => void) | undefined;
  listen<string>("terminal-exit", (event) => {
    callback(event.payload);
  }).then((fn) => { unlisten = fn; });
  return () => { unlisten?.(); };
}
