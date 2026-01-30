import { Key, Search, Globe, Zap } from "lucide-react";
import { useState, useEffect } from "react";
import { getApiKey, setApiKey, getPerplexityApiKey, setPerplexityApiKey, getFirecrawlApiKey, setFirecrawlApiKey, getRedpillApiKey, setRedpillApiKey } from "@app/lib/ai";

interface KeysSettingsPageProps {
  subFilter?: string | undefined;
}

export function KeysSettingsPage({ subFilter }: KeysSettingsPageProps) {
  const [anthropicKey, setAnthropicKey] = useState("");
  const [redpillKey, setRedpillKey] = useState("");
  const [perplexityKey, setPerplexityKey] = useState("");
  const [firecrawlKey, setFirecrawlKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void (async () => {
      const [ak, rk, pk, fk] = await Promise.all([getApiKey(), getRedpillApiKey(), getPerplexityApiKey(), getFirecrawlApiKey()]);
      setAnthropicKey(ak ?? "");
      setRedpillKey(rk ?? "");
      setPerplexityKey(pk ?? "");
      setFirecrawlKey(fk ?? "");
      setLoading(false);
    })();
  }, []);

  const handleSave = async () => {
    if (subFilter === undefined || subFilter === "anthropic") await setApiKey(anthropicKey);
    if (subFilter === undefined || subFilter === "redpill") await setRedpillApiKey(redpillKey);
    if (subFilter === undefined || subFilter === "perplexity") await setPerplexityApiKey(perplexityKey);
    if (subFilter === undefined || subFilter === "firecrawl") await setFirecrawlApiKey(firecrawlKey);
    setSaved(true);
    setTimeout(() => { setSaved(false); }, 1500);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: "var(--fg-muted)", borderTopColor: "transparent" }} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {(subFilter === undefined || subFilter === "redpill") && (
        <div>
          <label htmlFor="keys-redpill" className="mb-2 flex items-center gap-2 text-sm font-medium" style={{ color: "var(--fg-secondary)" }}>
            <Zap className="h-4 w-4" style={{ color: "var(--fg-accent)" }} />
            RedPill API Key
          </label>
          <input
            id="keys-redpill"
            type="password"
            value={redpillKey}
            onChange={(e) => { setRedpillKey(e.target.value); }}
            placeholder="sk-..."
            className="w-full rounded-xl border px-4 py-3 transition-colors focus:outline-none focus:ring-2"
            style={{ background: "var(--bg-input)", borderColor: "var(--border-secondary)", color: "var(--fg-primary)" }}
          />
          <p className="mt-1 text-xs" style={{ color: "var(--fg-muted)" }}>
            Get your API key from{" "}
            <a href="https://api.redpill.ai" target="_blank" rel="noopener noreferrer" style={{ color: "var(--fg-accent)" }}>
              redpill.ai
            </a>
          </p>
        </div>
      )}

      {(subFilter === undefined || subFilter === "anthropic") && (
        <div>
          <label htmlFor="keys-anthropic" className="mb-2 flex items-center gap-2 text-sm font-medium" style={{ color: "var(--fg-secondary)" }}>
            <Key className="h-4 w-4" style={{ color: "var(--fg-accent)" }} />
            Anthropic API Key
          </label>
          <input
            id="keys-anthropic"
            type="password"
            value={anthropicKey}
            onChange={(e) => { setAnthropicKey(e.target.value); }}
            placeholder="sk-ant-api03-..."
            className="w-full rounded-xl border px-4 py-3 transition-colors focus:outline-none focus:ring-2"
            style={{ background: "var(--bg-input)", borderColor: "var(--border-secondary)", color: "var(--fg-primary)" }}
          />
          <p className="mt-1 text-xs" style={{ color: "var(--fg-muted)" }}>
            Get your API key from{" "}
            <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" style={{ color: "var(--fg-accent)" }}>
              console.anthropic.com
            </a>
          </p>
        </div>
      )}

      {(subFilter === undefined || subFilter === "perplexity") && (
        <div>
          <label htmlFor="keys-perplexity" className="mb-2 flex items-center gap-2 text-sm font-medium" style={{ color: "var(--fg-secondary)" }}>
            <Search className="h-4 w-4" style={{ color: "var(--fg-accent)" }} />
            Perplexity API Key
            {subFilter === undefined && <span className="text-xs" style={{ color: "var(--fg-muted)" }}>(optional, for web search)</span>}
          </label>
          <input
            id="keys-perplexity"
            type="password"
            value={perplexityKey}
            onChange={(e) => { setPerplexityKey(e.target.value); }}
            placeholder="pplx-..."
            className="w-full rounded-xl border px-4 py-3 transition-colors focus:outline-none focus:ring-2"
            style={{ background: "var(--bg-input)", borderColor: "var(--border-secondary)", color: "var(--fg-primary)" }}
          />
          <p className="mt-1 text-xs" style={{ color: "var(--fg-muted)" }}>
            Get your API key from{" "}
            <a href="https://www.perplexity.ai/settings/api" target="_blank" rel="noopener noreferrer" style={{ color: "var(--fg-accent)" }}>
              perplexity.ai/settings/api
            </a>
          </p>
        </div>
      )}

      {(subFilter === undefined || subFilter === "firecrawl") && (
        <div>
          <label htmlFor="keys-firecrawl" className="mb-2 flex items-center gap-2 text-sm font-medium" style={{ color: "var(--fg-secondary)" }}>
            <Globe className="h-4 w-4" style={{ color: "var(--fg-accent)" }} />
            Firecrawl API Key
            {subFilter === undefined && <span className="text-xs" style={{ color: "var(--fg-muted)" }}>(optional, for web fetching &amp; search)</span>}
          </label>
          <input
            id="keys-firecrawl"
            type="password"
            value={firecrawlKey}
            onChange={(e) => { setFirecrawlKey(e.target.value); }}
            placeholder="fc-..."
            className="w-full rounded-xl border px-4 py-3 transition-colors focus:outline-none focus:ring-2"
            style={{ background: "var(--bg-input)", borderColor: "var(--border-secondary)", color: "var(--fg-primary)" }}
          />
          <p className="mt-1 text-xs" style={{ color: "var(--fg-muted)" }}>
            Get your API key from{" "}
            <a href="https://www.firecrawl.dev/app/api-keys" target="_blank" rel="noopener noreferrer" style={{ color: "var(--fg-accent)" }}>
              firecrawl.dev/app/api-keys
            </a>
          </p>
        </div>
      )}

      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={() => void handleSave()}
          className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium text-white transition-all"
          style={{ background: saved ? "var(--success)" : "var(--bg-accent)" }}
        >
          {saved ? <><span>&#10003;</span> Saved</> : "Save"}
        </button>
      </div>
    </div>
  );
}
