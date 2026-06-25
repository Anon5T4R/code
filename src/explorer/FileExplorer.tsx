import { useState, useEffect, useCallback } from "react";
import type { FileEntry } from "../types";

interface FileExplorerProps {
  rootPath: string | null;
  onOpenFile: (path: string) => void;
}

interface TreeNode {
  entry: FileEntry;
  children: TreeNode[];
  expanded: boolean;
}

function buildTree(entries: FileEntry[], expanded: Set<string>): TreeNode[] {
  const roots: TreeNode[] = [];
  for (const e of entries) {
    roots.push({
      entry: e,
      children: [],
      expanded: expanded.has(e.path),
    });
  }
  return roots;
}

export function FileExplorer({
  rootPath,
  onOpenFile,
}: FileExplorerProps) {
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [creating, setCreating] = useState<"file" | "folder" | null>(null);
  const [createParent, setCreateParent] = useState("");
  const [createValue, setCreateValue] = useState("");
  const ctxRef = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!rootPath) return;
    setLoading(true);
    try {
      const { listDir } = await import("../lib/fs");
      const items = await listDir(rootPath);
      setEntries(items);
    } catch (e) {
      console.error("Failed to list dir:", e);
    }
    setLoading(false);
  }, [rootPath]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleDoubleClick = useCallback(
    (entry: FileEntry) => {
      if (entry.is_dir) {
        setExpanded((prev) => {
          const next = new Set(prev);
          if (next.has(entry.path)) next.delete(entry.path);
          else next.add(entry.path);
          return next;
        });
      } else {
        onOpenFile(entry.path);
      }
    },
    [onOpenFile]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, path: string) => {
      e.preventDefault();
      ctxRef[1](path);
      // Close on click outside
      const close = () => {
        ctxRef[1](null);
        document.removeEventListener("click", close);
      };
      document.addEventListener("click", close);
    },
    [ctxRef]
  );

  const startRename = useCallback(
    (path: string) => {
      setRenaming(path);
      const name = entries.find((e) => e.path === path)?.name || path.split("\\").pop() || path.split("/").pop() || "";
      setRenameValue(name);
      setCreating(null);
    },
    [entries]
  );

  const doRename = useCallback(async () => {
    if (!renaming || !renameValue.trim()) {
      setRenaming(null);
      return;
    }
    const parent = renaming.substring(0, renaming.lastIndexOf("\\"));
    const newPath = parent + "\\" + renameValue.trim();
    try {
      const { renameEntry } = await import("../lib/fs");
      await renameEntry(renaming, newPath);
      setRenaming(null);
      refresh();
    } catch (e) {
      console.error("Rename failed:", e);
    }
  }, [renaming, renameValue, refresh]);

  const startCreate = useCallback(
    (type: "file" | "folder", parentPath: string) => {
      setCreating(type);
      setCreateParent(parentPath);
      setCreateValue("");
      setRenaming(null);
    },
    []
  );

  const doCreate = useCallback(async () => {
    if (!creating || !createValue.trim()) {
      setCreating(null);
      return;
    }
    const fullPath = createParent ? `${createParent}\\${createValue.trim()}` : createValue.trim();
    try {
      if (creating === "folder") {
        const { createDir } = await import("../lib/fs");
        await createDir(fullPath);
      } else {
        const { writeFile } = await import("../lib/fs");
        await writeFile(fullPath, "");
      }
      setCreating(null);
      refresh();
    } catch (e) {
      console.error("Create failed:", e);
    }
  }, [creating, createParent, createValue, refresh]);

  const handleDelete = useCallback(
    async (path: string) => {
      try {
        const { deleteEntry } = await import("../lib/fs");
        await deleteEntry(path);
        refresh();
      } catch (e) {
        console.error("Delete failed:", e);
      }
    },
    [refresh]
  );

  const tree = buildTree(entries, expanded);

  const renderTree = (nodes: TreeNode[], depth: number): React.ReactNode => {
    return nodes.map((node) => (
      <div key={node.entry.path}>
        <div
          className={`explorer-item ${node.entry.is_dir ? "dir" : "file"}`}
          style={{ paddingLeft: depth * 16 + 8 }}
          onDoubleClick={() => handleDoubleClick(node.entry)}
          onContextMenu={(e) => handleContextMenu(e, node.entry.path)}
        >
          <span className="explorer-icon">
            {node.entry.is_dir ? (node.expanded ? "▼" : "▶") : "📄"}
          </span>
          {renaming === node.entry.path ? (
            <input
              className="explorer-rename-input"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={doRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") doRename();
                if (e.key === "Escape") setRenaming(null);
              }}
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="explorer-name">{node.entry.name}</span>
          )}
        </div>
        {node.entry.is_dir && node.expanded && (
          <div className="explorer-children">
            {node.children.length === 0 && <div className="explorer-empty">vazio</div>}
            {renderTree(node.children, depth + 1)}
          </div>
        )}
      </div>
    ));
  };

  if (!rootPath) {
    return (
      <div className="explorer-panel">
        <div className="explorer-header">
          <span>Explorador</span>
        </div>
        <div className="explorer-empty-state">
          <p>Nenhuma pasta aberta</p>
          <p className="explorer-hint">Use Ctrl+K Ctrl+O para abrir</p>
        </div>
      </div>
    );
  }

  return (
    <div className="explorer-panel">
      <div className="explorer-header">
        <span>Explorador</span>
        <div className="explorer-actions">
          <button
            className="explorer-action-btn"
            title="Novo arquivo"
            onClick={() => startCreate("file", rootPath)}
          >
            +
          </button>
          <button
            className="explorer-action-btn"
            title="Nova pasta"
            onClick={() => startCreate("folder", rootPath)}
          >
            📁
          </button>
          <button className="explorer-action-btn" title="Atualizar" onClick={refresh}>
            ↻
          </button>
        </div>
      </div>

      {creating && (
        <div className="explorer-create-form">
          <input
            className="explorer-rename-input"
            placeholder={creating === "file" ? "arquivo.ts" : "pasta"}
            value={createValue}
            onChange={(e) => setCreateValue(e.target.value)}
            onBlur={doCreate}
            onKeyDown={(e) => {
              if (e.key === "Enter") doCreate();
              if (e.key === "Escape") setCreating(null);
            }}
            autoFocus
          />
        </div>
      )}

      {loading && <div className="explorer-loading">Carregando...</div>}
      {!loading && entries.length === 0 && (
        <div className="explorer-empty-state">Pasta vazia</div>
      )}

      {!loading && renderTree(tree, 0)}

      {ctxRef[0] && (
        <div className="explorer-context-menu" style={{ position: "fixed", left: 100, top: 100 }}>
          <button onClick={() => { startRename(ctxRef[0]!); ctxRef[1](null); }}>Renomear</button>
          <button onClick={() => { handleDelete(ctxRef[0]!); ctxRef[1](null); }}>Excluir</button>
        </div>
      )}
    </div>
  );
}
