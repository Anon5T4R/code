import { invoke } from "@tauri-apps/api/core";
import type { FileEntry } from "../types";

export async function readFile(path: string): Promise<string> {
  return invoke<string>("read_text_file", { path });
}

export async function writeFile(path: string, contents: string): Promise<void> {
  return invoke("write_text_file", { path, contents });
}

export async function listDir(path: string): Promise<FileEntry[]> {
  return invoke<FileEntry[]>("list_dir", { path });
}

export async function createDir(path: string): Promise<void> {
  return invoke("create_dir", { path });
}

export async function deleteEntry(path: string): Promise<void> {
  return invoke("delete_file", { path });
}

export async function renameEntry(oldPath: string, newPath: string): Promise<void> {
  return invoke("rename_file", { oldPath, newPath });
}

export function extToLanguage(ext: string): string {
  const map: Record<string, string> = {
    js: "javascript",
    ts: "typescript",
    tsx: "typescript",
    jsx: "javascript",
    rs: "rust",
    py: "python",
    json: "json",
    md: "markdown",
    html: "html",
    css: "css",
    toml: "toml",
    yaml: "yaml",
    yml: "yaml",
    xml: "xml",
    sh: "shell",
    bash: "shell",
    go: "go",
    java: "java",
    cpp: "cpp",
    c: "c",
    h: "c",
    hpp: "cpp",
    sql: "sql",
    graphql: "graphql",
    svg: "xml",
    txt: "plaintext",
  };
  return map[ext] || "plaintext";
}
