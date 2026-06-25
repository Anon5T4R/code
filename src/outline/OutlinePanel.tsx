import { useEffect, useState, useRef } from "react";
import { getDocumentSymbols } from "../lib/lsp";
import type { LspSymbol } from "../lib/lsp";

interface OutlinePanelProps {
  language: string | null;
  filePath: string | null;
  onSelect: (line: number) => void;
}

export function OutlinePanel({ language, filePath, onSelect }: OutlinePanelProps) {
  const [symbols, setSymbols] = useState<LspSymbol[]>([]);
  const [loading, setLoading] = useState(false);
  const lspLangRef = useRef<string | null>(null);

  useEffect(() => {
    if (!language || !filePath) { setSymbols([]); return; }

    const ext = filePath.split(".").pop() || "";
    const langMap: Record<string, string> = {
      rs: "rust", py: "python", go: "go", ts: "typescript", tsx: "typescript",
      js: "javascript", jsx: "javascript", html: "html", css: "css",
      json: "json", yaml: "yaml", yml: "yaml",
    };
    const lspLang = langMap[ext] || null;
    lspLangRef.current = lspLang;
    if (!lspLang) { setSymbols([]); return; }

    setLoading(true);
    getDocumentSymbols(lspLang, filePath)
      .then(setSymbols)
      .catch(() => setSymbols([]))
      .finally(() => setLoading(false));
  }, [language, filePath]);

  const renderSymbols = (items: LspSymbol[], depth: number): any[] =>
    items.flatMap((s) => [
      <div
        key={`${s.name}-${s.range[0]}-${s.range[1]}`}
        className="outline-item"
        style={{ paddingLeft: 8 + depth * 12 }}
        onClick={() => onSelect(s.selection_range[0])}
        title={s.detail || s.name}
      >
        <span className="outline-item-icon">{symbolIcon(s.kind)}</span>
        <span className="outline-item-name">{s.name}</span>
      </div>,
      ...(s.children?.length ? renderSymbols(s.children, depth + 1) : []),
    ]);

  return (
    <div className="outline-panel">
      <div className="outline-header">
        <span className="outline-title">Estrutura</span>
        {loading && <span className="outline-loading">⋯</span>}
      </div>
      <div className="outline-body">
        {symbols.length === 0 && !loading && (
          <div className="outline-empty">Nenhum símbolo</div>
        )}
        {renderSymbols(symbols, 0)}
      </div>
    </div>
  );
}

function symbolIcon(kind: string): string {
  const icons: Record<string, string> = {
    File: "📄", Module: "📦", Namespace: "⊡", Package: "📦",
    Class: "C", Method: "ƒ", Property: "⚙", Field: "⚙",
    Constructor: "C", Enum: "E", Interface: "I", Function: "ƒ",
    Variable: "x", Constant: "C", String: "S", Number: "#",
    Boolean: "✓", Array: "[]", Object: "{}", Key: "🔑",
    Null: "∅", EnumMember: "◈", Struct: "S", Event: "⚡",
    Operator: "⊕", TypeParameter: "T",
  };
  return icons[kind] || "?";
}
