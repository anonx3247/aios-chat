import { useEffect, useState } from "react";
import { X, Key, Shield, Search, Server, Bot, Wrench } from "lucide-react";
import {
  getApiKey,
  setApiKey,
  getPerplexityApiKey,
  setPerplexityApiKey,
  getProvider,
  setProvider,
  getOllamaBaseUrl,
  setOllamaBaseUrl,
  getOllamaModel,
  setOllamaModel,
  getEnableTools,
  setEnableTools,
  type AIProvider,
} from "@app/lib/ai";
import { Modal } from "@app/components/ui/Modal";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [selectedProvider, setSelectedProvider] = useState<AIProvider>("ollama");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [perplexityKey, setPerplexityKey] = useState("");
  const [ollamaUrl, setOllamaUrl] = useState("http://localhost:11434");
  const [ollamaModelName, setOllamaModelName] = useState("qwen3-vl:latest");
  const [toolsEnabled, setToolsEnabled] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSelectedProvider(getProvider());
      setAnthropicKey(getApiKey() ?? "");
      setPerplexityKey(getPerplexityApiKey() ?? "");
      setOllamaUrl(getOllamaBaseUrl());
      setOllamaModelName(getOllamaModel());
      setToolsEnabled(getEnableTools());
      setSaved(false);
    }
  }, [isOpen]);

  const handleSave = () => {
    setProvider(selectedProvider);
    setApiKey(anthropicKey);
    setPerplexityApiKey(perplexityKey);
    setOllamaBaseUrl(ollamaUrl);
    setOllamaModel(ollamaModelName);
    setEnableTools(toolsEnabled);
    setSaved(true);
    setTimeout(() => {
      onClose();
    }, 500);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="w-full max-w-md p-6">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ background: "var(--bg-tertiary)" }}
            >
              <Key className="h-5 w-5" style={{ color: "var(--fg-accent)" }} />
            </div>
            <h2 id="settings-title" className="text-lg font-semibold" style={{ color: "var(--fg-primary)" }}>
              Settings
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 transition-colors"
            style={{ color: "var(--fg-muted)" }}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6">
          {/* Provider Selection */}
          <div>
            <label
              className="mb-2 flex items-center gap-2 text-sm font-medium"
              style={{ color: "var(--fg-secondary)" }}
            >
              <Bot className="h-4 w-4" style={{ color: "var(--fg-accent)" }} />
              AI Provider
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setSelectedProvider("ollama"); }}
                className="flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all"
                style={{
                  background: selectedProvider === "ollama" ? "var(--bg-accent)" : "var(--bg-input)",
                  borderColor: selectedProvider === "ollama" ? "var(--bg-accent)" : "var(--border-secondary)",
                  color: selectedProvider === "ollama" ? "white" : "var(--fg-secondary)",
                }}
              >
                Ollama (Local)
              </button>
              <button
                type="button"
                onClick={() => { setSelectedProvider("anthropic"); }}
                className="flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all"
                style={{
                  background: selectedProvider === "anthropic" ? "var(--bg-accent)" : "var(--bg-input)",
                  borderColor: selectedProvider === "anthropic" ? "var(--bg-accent)" : "var(--border-secondary)",
                  color: selectedProvider === "anthropic" ? "white" : "var(--fg-secondary)",
                }}
              >
                Anthropic
              </button>
            </div>
          </div>

          {/* Ollama Settings */}
          {selectedProvider === "ollama" && (
            <>
              <div>
                <label
                  htmlFor="ollama-url"
                  className="mb-2 flex items-center gap-2 text-sm font-medium"
                  style={{ color: "var(--fg-secondary)" }}
                >
                  <Server className="h-4 w-4" style={{ color: "var(--fg-accent)" }} />
                  Ollama URL
                </label>
                <input
                  id="ollama-url"
                  type="text"
                  value={ollamaUrl}
                  onChange={(e) => { setOllamaUrl(e.target.value); }}
                  placeholder="http://localhost:11434"
                  className="w-full rounded-xl border px-4 py-3 transition-colors focus:outline-none focus:ring-2"
                  style={{
                    background: "var(--bg-input)",
                    borderColor: "var(--border-secondary)",
                    color: "var(--fg-primary)",
                  }}
                />
              </div>

              <div>
                <label
                  htmlFor="ollama-model"
                  className="mb-2 flex items-center gap-2 text-sm font-medium"
                  style={{ color: "var(--fg-secondary)" }}
                >
                  <Bot className="h-4 w-4" style={{ color: "var(--fg-accent)" }} />
                  Model
                </label>
                <input
                  id="ollama-model"
                  type="text"
                  value={ollamaModelName}
                  onChange={(e) => { setOllamaModelName(e.target.value); }}
                  placeholder="qwen3-vl:latest"
                  className="w-full rounded-xl border px-4 py-3 transition-colors focus:outline-none focus:ring-2"
                  style={{
                    background: "var(--bg-input)",
                    borderColor: "var(--border-secondary)",
                    color: "var(--fg-primary)",
                  }}
                />
                <p className="mt-1 text-xs" style={{ color: "var(--fg-muted)" }}>
                  Recommended: qwen3-vl:latest (vision + tools)
                </p>
              </div>

              {/* Enable Tools Toggle */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wrench className="h-4 w-4" style={{ color: "var(--fg-accent)" }} />
                  <div>
                    <p className="text-sm font-medium" style={{ color: "var(--fg-secondary)" }}>
                      Enable Tools
                    </p>
                    <p className="text-xs" style={{ color: "var(--fg-muted)" }}>
                      Requires qwen3-vl or tool-capable model
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { setToolsEnabled(!toolsEnabled); }}
                  className="relative h-6 w-11 rounded-full transition-colors"
                  style={{
                    background: toolsEnabled ? "var(--bg-accent)" : "var(--bg-tertiary)",
                  }}
                >
                  <span
                    className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform"
                    style={{
                      transform: toolsEnabled ? "translateX(20px)" : "translateX(0)",
                    }}
                  />
                </button>
              </div>
            </>
          )}

          {/* Anthropic API Key */}
          {selectedProvider === "anthropic" && (
            <div>
              <label
                htmlFor="anthropic-key"
                className="mb-2 flex items-center gap-2 text-sm font-medium"
                style={{ color: "var(--fg-secondary)" }}
              >
                <Key className="h-4 w-4" style={{ color: "var(--fg-accent)" }} />
                Anthropic API Key
              </label>
              <div className="relative">
                <input
                  id="anthropic-key"
                  type="password"
                  value={anthropicKey}
                  onChange={(e) => { setAnthropicKey(e.target.value); }}
                  placeholder="sk-ant-api03-..."
                  className="w-full rounded-xl border px-4 py-3 transition-colors focus:outline-none focus:ring-2"
                  style={{
                    background: "var(--bg-input)",
                    borderColor: "var(--border-secondary)",
                    color: "var(--fg-primary)",
                  }}
                />
              </div>
            </div>
          )}

          {/* Perplexity API Key */}
          <div>
            <label
              htmlFor="perplexity-key"
              className="mb-2 flex items-center gap-2 text-sm font-medium"
              style={{ color: "var(--fg-secondary)" }}
            >
              <Search className="h-4 w-4" style={{ color: "var(--fg-accent)" }} />
              Perplexity API Key
              <span className="text-xs" style={{ color: "var(--fg-muted)" }}>(optional, for web search)</span>
            </label>
            <div className="relative">
              <input
                id="perplexity-key"
                type="password"
                value={perplexityKey}
                onChange={(e) => { setPerplexityKey(e.target.value); }}
                placeholder="pplx-..."
                className="w-full rounded-xl border px-4 py-3 transition-colors focus:outline-none focus:ring-2"
                style={{
                  background: "var(--bg-input)",
                  borderColor: "var(--border-secondary)",
                  color: "var(--fg-primary)",
                }}
              />
            </div>
          </div>

          {/* Security note */}
          <div
            className="flex items-start gap-2 rounded-lg p-3"
            style={{ background: "var(--bg-tertiary)" }}
          >
            <Shield className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--success)" }} />
            <p className="text-xs" style={{ color: "var(--fg-muted)" }}>
              {selectedProvider === "ollama"
                ? "Ollama runs locally on your machine. No data is sent to external servers."
                : "Your API keys are stored locally and sent directly to their servers. Never shared with third parties."}
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2.5 text-sm font-medium transition-colors"
              style={{ color: "var(--fg-muted)" }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saved}
              className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium text-white transition-all"
              style={{ background: saved ? "var(--success)" : "var(--bg-accent)" }}
            >
              {saved ? (
                <>
                  <span className="inline-block">✓</span>
                  Saved
                </>
              ) : (
                "Save"
              )}
            </button>
          </div>
        </div>
    </Modal>
  );
}
