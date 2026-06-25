import { useEffect, useRef } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import "xterm/css/xterm.css";
import { spawnTerminal, writeTerminal, killTerminal, onTerminalOutput, onTerminalExit } from "../lib/terminal";

interface TerminalPanelProps {
  onClose: () => void;
}

export function TerminalPanel({ onClose }: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const spawnedRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current || spawnedRef.current) return;
    spawnedRef.current = true;

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: "block",
      fontSize: 13,
      fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, monospace",
      theme: {
        background: "#1e1e1e",
        foreground: "#d4d4d4",
        cursor: "#d4d4d4",
        selectionBackground: "#264f78",
        black: "#000000", red: "#cd3131", green: "#0dbc79", yellow: "#e5e510",
        blue: "#2472c8", magenta: "#bc3fbc", cyan: "#11b8bd", white: "#e5e5e5",
        brightBlack: "#666666", brightRed: "#f14c4c", brightGreen: "#23d18b",
        brightYellow: "#f5f543", brightBlue: "#3b8eea", brightMagenta: "#d670d6",
        brightCyan: "#29b8db", brightWhite: "#e5e5e5",
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(containerRef.current);
    fitAddon.fit();

    terminalRef.current = term;

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      const dims = fitAddon.proposeDimensions();
      if (dims) {
        const { rows, cols } = dims;
        import("../lib/terminal").then((m) =>
          m.resizeTerminal(rows, cols).catch(() => {})
        );
      }
    });
    resizeObserver.observe(containerRef.current);

    let unlistenOutput: (() => void) | undefined;
    let unlistenExit: (() => void) | undefined;

    // Spawn PTY and connect
    spawnTerminal()
      .then(() => {
        term.focus();

        unlistenOutput = onTerminalOutput((data) => {
          term.write(data);
        });

        unlistenExit = onTerminalExit(() => {
          term.write("\r\n\x1b[31mProcesso encerrado\x1b[0m\r\n");
        });

        term.onData((data) => {
          writeTerminal(data).catch(() => {});
        });
      })
      .catch((e) => {
        term.write(`\r\n\x1b[31mErro: ${e}\x1b[0m\r\n`);
      });

    return () => {
      resizeObserver.disconnect();
      unlistenOutput?.();
      unlistenExit?.();
      killTerminal().catch(() => {});
      term.dispose();
      terminalRef.current = null;
      spawnedRef.current = false;
    };
  }, []);

  return (
    <div className="terminal-panel">
      <div className="terminal-header">
        <span>Terminal</span>
        <button className="terminal-close-btn" onClick={onClose}>✕</button>
      </div>
      <div ref={containerRef} className="terminal-container" />
    </div>
  );
}
