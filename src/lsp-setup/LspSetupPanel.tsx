import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface LspServerStatus {
  name: string;
  installed: boolean;
  install_hint: string;
}

export function LspSetupPanel() {
  const [servers, setServers] = useState<LspServerStatus[]>([]);
  const [installing, setInstalling] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    try {
      const list = await invoke<LspServerStatus[]>("check_lsp_servers");
      setServers(list);
    } catch (e) {
      setLog((prev) => [...prev, `Erro: ${e}`]);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleInstall = useCallback(async (name: string) => {
    setInstalling(name);
    setLog((prev) => [...prev, `Instalando ${name}...`]);
    try {
      const result = await invoke<string>("install_lsp_server", { name });
      setLog((prev) => [...prev, `✅ ${name} instalado: ${result}`]);
      await refresh();
    } catch (e: any) {
      setLog((prev) => [...prev, `❌ Falha ao instalar ${name}: ${e.message || e}`]);
    }
    setInstalling(null);
  }, [refresh]);

  const allInstalled = servers.length > 0 && servers.every((s) => s.installed);

  return (
    <div className="lsp-setup-panel">
      <div className="lsp-setup-header">
        <span>LSP Servers</span>
        <button className="lsp-refresh-btn" onClick={refresh}>↻</button>
      </div>

      {allInstalled ? (
        <div className="lsp-all-ok">
          ✅ Todos os language servers estão instalados!
        </div>
      ) : (
        <div className="lsp-setup-info">
          Language servers fornecem autocomplete, diagnósticos, hover, etc.
          Instale os que faltam:
        </div>
      )}

      <div className="lsp-server-list">
        {servers.map((s) => (
          <div key={s.name} className={`lsp-server-item ${s.installed ? "installed" : "missing"}`}>
            <div className="lsp-server-info">
              <span className="lsp-server-name">{s.name}</span>
              <span className={`lsp-server-badge ${s.installed ? "ok" : "missing"}`}>
                {s.installed ? "✅" : "❌"}
              </span>
            </div>
            {!s.installed && (
              <div className="lsp-server-actions">
                <code className="lsp-install-hint">{s.install_hint}</code>
                <button
                  className="lsp-install-btn"
                  onClick={() => handleInstall(s.name)}
                  disabled={installing === s.name}
                >
                  {installing === s.name ? "Instalando..." : "Instalar"}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {log.length > 0 && (
        <div className="lsp-log">
          <h4>Log:</h4>
          {log.map((line, i) => (
            <pre key={i} className="lsp-log-line">{line}</pre>
          ))}
        </div>
      )}
    </div>
  );
}
