import { useState, useEffect, useCallback, memo } from "react";
import type { StatusEntry, CommitEntry, BranchEntry } from "../types";
import { getStatus, getLog, getBranches, stageFiles, unstageFiles, discardFiles, diffFile, commit, push, pull, checkout } from "../lib/git";

interface GitPanelProps {
  repoPath: string | null;
}

export const GitPanel = memo(function GitPanel({ repoPath }: GitPanelProps) {
  const [status, setStatus] = useState<StatusEntry[]>([]);
  const [branches, setBranches] = useState<BranchEntry[]>([]);
  const [commits, setCommits] = useState<CommitEntry[]>([]);
  const [commitMsg, setCommitMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState<"changes" | "history" | "branches">("changes");
  const [diff, setDiff] = useState<{ path: string; staged: boolean; text: string } | null>(null);

  const refresh = useCallback(async () => {
    if (!repoPath) return;
    setLoading(true);
    try {
      const [s, l, b] = await Promise.all([
        getStatus(repoPath),
        getLog(repoPath, 10),
        getBranches(repoPath),
      ]);
      setStatus(s);
      setCommits(l);
      setBranches(b);
    } catch (e) {
      console.error("Git error:", e);
    }
    setLoading(false);
  }, [repoPath]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleStage = useCallback(
    async (paths: string[]) => {
      if (!repoPath) return;
      try {
        await stageFiles(repoPath, paths);
        refresh();
      } catch (e) {
        setMessage(`Erro: ${e}`);
      }
    },
    [repoPath, refresh]
  );

  const handleUnstage = useCallback(
    async (paths: string[]) => {
      if (!repoPath) return;
      try {
        await unstageFiles(repoPath, paths);
        refresh();
      } catch (e) {
        setMessage(`Erro: ${e}`);
      }
    },
    [repoPath, refresh]
  );

  const handleDiscard = useCallback(
    async (path: string) => {
      if (!repoPath) return;
      const { ask } = await import("@tauri-apps/plugin-dialog");
      const ok = await ask(`Descartar as alterações de "${path}"? Esta ação não pode ser desfeita.`, {
        title: "Descartar alterações", kind: "warning",
      });
      if (!ok) return;
      try {
        await discardFiles(repoPath, [path]);
        setMessage(`Alterações descartadas: ${path}`);
        refresh();
      } catch (e) {
        setMessage(`Erro: ${e}`);
      }
    },
    [repoPath, refresh]
  );

  const handleShowDiff = useCallback(
    async (path: string, staged: boolean) => {
      if (!repoPath) return;
      try {
        const text = await diffFile(repoPath, path, staged);
        setDiff({ path, staged, text });
      } catch (e) {
        setMessage(`Erro: ${e}`);
      }
    },
    [repoPath]
  );

  const handleCommit = useCallback(async () => {
    if (!repoPath || !commitMsg.trim()) return;
    try {
      await commit(repoPath, commitMsg.trim());
      setCommitMsg("");
      setMessage("Commit realizado!");
      refresh();
    } catch (e) {
      setMessage(`Erro: ${e}`);
    }
  }, [repoPath, commitMsg, refresh]);

  const handlePush = useCallback(async () => {
    if (!repoPath) return;
    try {
      await push(repoPath);
      setMessage("Push realizado!");
    } catch (e) {
      setMessage(`Erro: ${e}`);
    }
  }, [repoPath]);

  const handlePull = useCallback(async () => {
    if (!repoPath) return;
    try {
      const msg = await pull(repoPath);
      setMessage(msg);
      refresh();
    } catch (e) {
      setMessage(`Erro: ${e}`);
    }
  }, [repoPath, refresh]);

  const handleCheckout = useCallback(async (branch: string) => {
    if (!repoPath) return;
    try {
      await checkout(repoPath, branch);
      setMessage(`Branch alterado para ${branch}`);
      refresh();
    } catch (e) {
      setMessage(`Erro: ${e}`);
    }
  }, [repoPath, refresh]);

  if (!repoPath) {
    return (
      <div className="git-panel">
        <div className="git-header">
          <span>Git</span>
        </div>
        <div className="git-empty-state">
          <p>Nenhum repositório</p>
          <p className="git-hint">Abra uma pasta com repositório Git</p>
        </div>
      </div>
    );
  }

  const stagedItems = status.filter((s) => s.staged);
  const unstagedItems = status.filter((s) => !s.staged);

  return (
    <div className="git-panel" style={{ position: "relative" }}>
      <div className="git-header">
        <span>Git</span>
        <div className="git-actions">
          <button className="git-action-btn" onClick={handlePull} title="Pull">
            ↓
          </button>
          <button className="git-action-btn" onClick={handlePush} title="Push">
            ↑
          </button>
          <button className="git-action-btn" onClick={refresh} title="Atualizar">
            ↻
          </button>
        </div>
      </div>

      <div className="git-tabs">
        <button
          className={`git-tab ${tab === "changes" ? "active" : ""}`}
          onClick={() => setTab("changes")}
        >
          Alterações
        </button>
        <button
          className={`git-tab ${tab === "history" ? "active" : ""}`}
          onClick={() => setTab("history")}
        >
          Histórico
        </button>
        <button
          className={`git-tab ${tab === "branches" ? "active" : ""}`}
          onClick={() => setTab("branches")}
        >
          Branches
        </button>
      </div>

      {tab === "changes" && (
        <div className="git-changes">
          {stagedItems.length > 0 && (
            <div className="git-section">
              <div className="git-section-title">Staged ({stagedItems.length})</div>
              {stagedItems.map((s) => (
                <div key={s.path} className="git-status-item staged">
                  <span
                    className={`git-status-badge ${s.status}`}
                    onClick={() => handleShowDiff(s.path, true)}
                    style={{ cursor: "pointer" }}
                    title="Ver diff (staged)"
                  >
                    {s.status}
                  </span>
                  <span
                    className="git-status-path"
                    onClick={() => handleShowDiff(s.path, true)}
                    style={{ cursor: "pointer" }}
                  >
                    {s.path}
                  </span>
                  <button
                    className="git-action-btn"
                    onClick={() => handleUnstage([s.path])}
                    title="Remover do stage"
                    style={{ marginLeft: "auto" }}
                  >
                    −
                  </button>
                </div>
              ))}
            </div>
          )}

          {unstagedItems.length > 0 && (
            <div className="git-section">
              <div className="git-section-title">Alterações ({unstagedItems.length})</div>
              {unstagedItems.map((s) => (
                <div key={s.path} className="git-status-item">
                  <span
                    className={`git-status-badge ${s.status}`}
                    onClick={() => handleShowDiff(s.path, false)}
                    style={{ cursor: "pointer" }}
                    title="Ver diff"
                  >
                    {s.status}
                  </span>
                  <span
                    className="git-status-path"
                    onClick={() => handleShowDiff(s.path, false)}
                    style={{ cursor: "pointer" }}
                  >
                    {s.path}
                  </span>
                  <div style={{ marginLeft: "auto", display: "flex", gap: 2 }}>
                    {s.status !== "untracked" && (
                      <button
                        className="git-action-btn"
                        onClick={() => handleDiscard(s.path)}
                        title="Descartar alterações"
                      >
                        ↺
                      </button>
                    )}
                    <button
                      className="git-action-btn"
                      onClick={() => handleStage([s.path])}
                      title="Adicionar ao stage"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {status.length === 0 && !loading && (
            <div className="git-empty-state">Nenhuma alteração</div>
          )}

          <div className="git-commit-area">
            <textarea
              className="git-commit-input"
              placeholder="Mensagem do commit..."
              value={commitMsg}
              onChange={(e) => setCommitMsg(e.target.value)}
              rows={2}
            />
            <button
              className="git-commit-btn"
              onClick={handleCommit}
              disabled={!commitMsg.trim()}
            >
              Commit
            </button>
          </div>
        </div>
      )}

      {tab === "history" && (
        <div className="git-history">
          {loading && <div className="git-loading">Carregando...</div>}
          {commits.map((c) => (
            <div key={c.hash} className="git-commit-item">
              <span className="git-commit-hash">{c.hash}</span>
              <span className="git-commit-msg">{c.message}</span>
              <span className="git-commit-author">{c.author}</span>
            </div>
          ))}
          {commits.length === 0 && !loading && (
            <div className="git-empty-state">Nenhum commit</div>
          )}
        </div>
      )}

      {tab === "branches" && (
        <div className="git-branches">
          {branches.map((b) => (
            <div
              key={b.name}
              className={`git-branch-item ${b.current ? "current" : ""}`}
              onClick={() => !b.current && handleCheckout(b.name)}
            >
              <span className="git-branch-icon">{b.current ? "✓" : "○"}</span>
              <span className="git-branch-name">{b.name}</span>
            </div>
          ))}
          {branches.length === 0 && !loading && (
            <div className="git-empty-state">Nenhum branch</div>
          )}
        </div>
      )}

      {message && <div className="git-message">{message}</div>}

      {diff && (
        <div
          className="git-diff-overlay"
          onClick={() => setDiff(null)}
          style={{
            position: "absolute", inset: 0, zIndex: 20,
            background: "var(--bg-primary, #1e1e1e)", display: "flex", flexDirection: "column",
          }}
        >
          <div
            className="git-diff-header"
            onClick={(e) => e.stopPropagation()}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderBottom: "1px solid var(--border, #333)" }}
          >
            <span style={{ fontSize: 11, color: "var(--text-secondary, #999)" }}>
              {diff.staged ? "STAGED" : "WORKDIR"}
            </span>
            <span style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {diff.path}
            </span>
            <button className="git-action-btn" style={{ marginLeft: "auto" }} onClick={() => setDiff(null)} title="Fechar">✕</button>
          </div>
          <pre
            onClick={(e) => e.stopPropagation()}
            style={{
              margin: 0, padding: 10, overflow: "auto", flex: 1,
              fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace", fontSize: 12, lineHeight: 1.5,
            }}
          >
            {diff.text.split("\n").map((line, i) => {
              let color = "var(--text-primary, #d4d4d4)";
              if (line.startsWith("+")) color = "#4ec9b0";
              else if (line.startsWith("-")) color = "#f14c4c";
              else if (line.startsWith("@@")) color = "#569cd6";
              return (
                <div key={i} style={{ color, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                  {line || " "}
                </div>
              );
            })}
          </pre>
        </div>
      )}
    </div>
  );
});
