import { invoke } from "@tauri-apps/api/core";

export interface SearchMatch {
  path: string;
  line: number;
  column: number;
  line_content: string;
  match_start: number;
  match_end: number;
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
