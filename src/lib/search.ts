import { invoke } from "@tauri-apps/api/core";

export interface SearchMatch {
  path: string;
  line: number;
  column: number;
  line_content: string;
  match_start: number;
  match_end: number;
}

export interface ReplaceResult {
  files_changed: number;
  replacements: number;
}

export async function searchFiles(
  root: string,
  query: string,
  opts?: { caseSensitive?: boolean; useRegex?: boolean; wholeWord?: boolean }
): Promise<SearchMatch[]> {
  if (!query.trim()) return [];
  return invoke<SearchMatch[]>("search_files", {
    root,
    query,
    caseSensitive: opts?.caseSensitive ?? false,
    useRegex: opts?.useRegex ?? false,
    wholeWord: opts?.wholeWord ?? false,
  });
}

export async function replaceInFiles(
  root: string,
  query: string,
  replacement: string,
  opts?: { caseSensitive?: boolean; useRegex?: boolean; wholeWord?: boolean }
): Promise<ReplaceResult> {
  return invoke<ReplaceResult>("replace_in_files", {
    root,
    query,
    replacement,
    caseSensitive: opts?.caseSensitive ?? false,
    useRegex: opts?.useRegex ?? false,
    wholeWord: opts?.wholeWord ?? false,
  });
}
