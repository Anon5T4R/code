import { useState, useCallback } from "react";
import { loadSettings, saveSettings, type Settings } from "../lib/settings";

interface SettingsPanelProps {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [settings, setSettings] = useState<Settings>(loadSettings());

  const update = useCallback((patch: Partial<Settings>) => {
    const next = saveSettings(patch);
    setSettings(next);
  }, []);

  return (
    <div className="side-panel">
      <div className="settings-panel">
        <div className="git-header">
          <span>Configurações</span>
          <button className="git-action-btn" onClick={onClose}>✕</button>
        </div>

        <div className="git-section">
          <div className="git-section-title">IA Local</div>

          <label className="settings-label">Pasta de modelos (.gguf)</label>
          <input
            className="github-input"
            value={settings.modelsDir}
            onChange={(e) => update({ modelsDir: e.target.value })}
          />

          <label className="settings-label">GPU Layers (ngl)</label>
          <input
            className="github-input"
            type="number"
            value={settings.ngl}
            onChange={(e) => update({ ngl: parseInt(e.target.value) || 0 })}
          />

          <label className="settings-label">Context size (ctx)</label>
          <input
            className="github-input"
            type="number"
            value={settings.ctx}
            onChange={(e) => update({ ctx: parseInt(e.target.value) || 4096 })}
          />
        </div>

        <div className="git-section">
          <div className="git-section-title">Editor</div>

          <label className="settings-label">Idioma</label>
          <select
            className="github-input"
            value={settings.locale}
            onChange={(e) => update({ locale: e.target.value as any })}
          >
            <option value="pt">Português</option>
            <option value="en">English</option>
          </select>
        </div>
      </div>
    </div>
  );
}
