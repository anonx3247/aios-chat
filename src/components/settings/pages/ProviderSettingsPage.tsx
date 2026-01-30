import { Bot, Server, Wrench } from "lucide-react";
import {
  getProvider,
  setProvider,
  getOllamaBaseUrl,
  setOllamaBaseUrl,
  getOllamaModel,
  setOllamaModel,
  getEnableTools,
  setEnableTools,
  getApiKey,
  setApiKey,
  getRedpillApiKey,
  setRedpillApiKey,
  type AIProvider,
} from "@app/lib/ai";
import { useState, useEffect } from "react";

export function ProviderSettingsPage() {
  const [selectedProvider, setSelectedProvider] = useState<AIProvider>("redpill");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [redpillKey, setRedpillKey] = useState("");
  const [ollamaUrl, setOllamaUrl] = useState("http://localhost:11434");
  const [ollamaModelName, setOllamaModelName] = useState("qwen3-vl:latest");
  const [toolsEnabled, setToolsEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setSelectedProvider(getProvider());
      setOllamaUrl(getOllamaBaseUrl());
      setOllamaModelName(getOllamaModel());
      setToolsEnabled(getEnableTools());
      const [ak, rk] = await Promise.all([getApiKey(), getRedpillApiKey()]);
      setAnthropicKey(ak ?? "");
      setRedpillKey(rk ?? "");
      setLoading(false);
    })();
  }, []);

  const save = () => {
    setProvider(selectedProvider);
    setOllamaBaseUrl(ollamaUrl);
    setOllamaModel(ollamaModelName);
    setEnableTools(toolsEnabled);
    void setApiKey(anthropicKey);
    void setRedpillApiKey(redpillKey);
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      {/* Provider Selection */}
      <div>
        <label className="mb-2 flex items-center gap-2 text-sm font-medium" style={{ color: "var(--fg-secondary)" }}>
          <Bot className="h-4 w-4" style={{ color: "var(--fg-accent)" }} />
          AI Provider
        </label>
        <div className="flex gap-2">
          {(["redpill", "ollama", "anthropic"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => { setSelectedProvider(p); }}
              className="flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all"
              style={{
                background: selectedProvider === p ? "var(--bg-accent)" : "var(--bg-input)",
                borderColor: selectedProvider === p ? "var(--bg-accent)" : "var(--border-secondary)",
                color: selectedProvider === p ? "white" : "var(--fg-secondary)",
              }}
            >
              {p === "redpill" ? "RedPill" : p === "ollama" ? "Ollama (Local)" : "Anthropic"}
            </button>
          ))}
        </div>
      </div>

      {/* Ollama Settings */}
      {selectedProvider === "ollama" && (
        <>
          <div>
            <label htmlFor="sp-ollama-url" className="mb-2 flex items-center gap-2 text-sm font-medium" style={{ color: "var(--fg-secondary)" }}>
              <Server className="h-4 w-4" style={{ color: "var(--fg-accent)" }} />
              Ollama URL
            </label>
            <input
              id="sp-ollama-url"
              type="text"
              value={ollamaUrl}
              onChange={(e) => { setOllamaUrl(e.target.value); }}
              placeholder="http://localhost:11434"
              className="w-full rounded-xl border px-4 py-3 transition-colors focus:outline-none focus:ring-2"
              style={{ background: "var(--bg-input)", borderColor: "var(--border-secondary)", color: "var(--fg-primary)" }}
            />
          </div>
          <div>
            <label htmlFor="sp-ollama-model" className="mb-2 flex items-center gap-2 text-sm font-medium" style={{ color: "var(--fg-secondary)" }}>
              <Bot className="h-4 w-4" style={{ color: "var(--fg-accent)" }} />
              Model
            </label>
            <input
              id="sp-ollama-model"
              type="text"
              value={ollamaModelName}
              onChange={(e) => { setOllamaModelName(e.target.value); }}
              placeholder="qwen3-vl:latest"
              className="w-full rounded-xl border px-4 py-3 transition-colors focus:outline-none focus:ring-2"
              style={{ background: "var(--bg-input)", borderColor: "var(--border-secondary)", color: "var(--fg-primary)" }}
            />
            <p className="mt-1 text-xs" style={{ color: "var(--fg-muted)" }}>
              Recommended: qwen3-vl:latest (vision + tools)
            </p>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wrench className="h-4 w-4" style={{ color: "var(--fg-accent)" }} />
              <div>
                <p className="text-sm font-medium" style={{ color: "var(--fg-secondary)" }}>Enable Tools</p>
                <p className="text-xs" style={{ color: "var(--fg-muted)" }}>Requires qwen3-vl or tool-capable model</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => { setToolsEnabled(!toolsEnabled); }}
              className="relative h-6 w-11 rounded-full transition-colors"
              style={{ background: toolsEnabled ? "var(--bg-accent)" : "var(--bg-tertiary)" }}
            >
              <span
                className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform"
                style={{ transform: toolsEnabled ? "translateX(20px)" : "translateX(0)" }}
              />
            </button>
          </div>
        </>
      )}

      {/* RedPill API Key */}
      {selectedProvider === "redpill" && (
        <div>
          <label htmlFor="sp-redpill-key" className="mb-2 flex items-center gap-2 text-sm font-medium" style={{ color: "var(--fg-secondary)" }}>
            <Bot className="h-4 w-4" style={{ color: "var(--fg-accent)" }} />
            RedPill API Key
          </label>
          <input
            id="sp-redpill-key"
            type="password"
            value={redpillKey}
            onChange={(e) => { setRedpillKey(e.target.value); }}
            placeholder="sk-..."
            className="w-full rounded-xl border px-4 py-3 transition-colors focus:outline-none focus:ring-2"
            style={{ background: "var(--bg-input)", borderColor: "var(--border-secondary)", color: "var(--fg-primary)" }}
          />
          <p className="mt-1 text-xs" style={{ color: "var(--fg-muted)" }}>
            Default model: moonshotai/kimi-k2.5 (GPU TEE)
          </p>
        </div>
      )}

      {/* Anthropic API Key (when provider is anthropic) */}
      {selectedProvider === "anthropic" && (
        <div>
          <label htmlFor="sp-anthropic-key" className="mb-2 flex items-center gap-2 text-sm font-medium" style={{ color: "var(--fg-secondary)" }}>
            <Bot className="h-4 w-4" style={{ color: "var(--fg-accent)" }} />
            Anthropic API Key
          </label>
          <input
            id="sp-anthropic-key"
            type="password"
            value={anthropicKey}
            onChange={(e) => { setAnthropicKey(e.target.value); }}
            placeholder="sk-ant-api03-..."
            className="w-full rounded-xl border px-4 py-3 transition-colors focus:outline-none focus:ring-2"
            style={{ background: "var(--bg-input)", borderColor: "var(--border-secondary)", color: "var(--fg-primary)" }}
          />
        </div>
      )}

      <SaveButton onSave={save} />
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
        style={{ borderColor: "var(--fg-muted)", borderTopColor: "transparent" }}
      />
    </div>
  );
}

function SaveButton({ onSave }: { onSave: () => void }) {
  const [saved, setSaved] = useState(false);

  const handleClick = () => {
    onSave();
    setSaved(true);
    setTimeout(() => { setSaved(false); }, 1500);
  };

  return (
    <div className="flex justify-end pt-2">
      <button
        type="button"
        onClick={handleClick}
        className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium text-white transition-all"
        style={{ background: saved ? "var(--success)" : "var(--bg-accent)" }}
      >
        {saved ? <><span>&#10003;</span> Saved</> : "Save"}
      </button>
    </div>
  );
}
