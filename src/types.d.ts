export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
}

export interface StatusEntry {
  path: string;
  status: string;
  staged: boolean;
}

export interface CommitEntry {
  hash: string;
  author: string;
  message: string;
  time: string;
}

export interface BranchEntry {
  name: string;
  current: boolean;
}

export interface RepoEntry {
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  url: string;
}

export interface GithubPrResult {
  url: string;
  number: number;
}

export interface Tab {
  id: string;
  title: string;
  path: string | null;
  language: string;
  dirty: boolean;
  content: string;
}
