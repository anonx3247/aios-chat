import { useEffect, useState, useCallback } from "react";
import { X, Key, Shield, Search, Server, Bot, Wrench, Mail } from "lucide-react";
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
  getPerplexityApiKey,
  setPerplexityApiKey,
  setEmailCredential,
  testEmailConnection,
  type AIProvider,
} from "@app/lib/ai";
import { getAllCredentialsWithFallback } from "@app/lib/credentials";
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

  // Email settings
  const [emailAddress, setEmailAddress] = useState("");
  const [emailUsername, setEmailUsername] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailImapHost, setEmailImapHost] = useState("");
  const [emailImapPort, setEmailImapPort] = useState("");
  const [emailImapSecurity, setEmailImapSecurity] = useState("ssl");
  const [emailSmtpHost, setEmailSmtpHost] = useState("");
  const [emailSmtpPort, setEmailSmtpPort] = useState("");
  const [emailSmtpSecurity, setEmailSmtpSecurity] = useState("ssl");
  const [emailSslVerify, setEmailSslVerify] = useState(true);

  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [emailTestError, setEmailTestError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Load settings asynchronously
  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      // Load non-sensitive settings synchronously
      setSelectedProvider(getProvider());
      setOllamaUrl(getOllamaBaseUrl());
      setOllamaModelName(getOllamaModel());
      setToolsEnabled(getEnableTools());

      // Load sensitive credentials asynchronously
      const [anthropic, perplexity, allCreds] = await Promise.all([
        getApiKey(),
        getPerplexityApiKey(),
        getAllCredentialsWithFallback(),
      ]);

      setAnthropicKey(anthropic ?? "");
      setPerplexityKey(perplexity ?? "");
      setEmailAddress(allCreds.email_address ?? "");
      setEmailUsername(allCreds.email_username ?? "");
      setEmailPassword(allCreds.email_password ?? "");
      setEmailImapHost(allCreds.email_imap_host ?? "");
      setEmailImapPort(allCreds.email_imap_port ?? "");
      setEmailImapSecurity(allCreds.email_imap_security ?? "ssl");
      setEmailSmtpHost(allCreds.email_smtp_host ?? "");
      setEmailSmtpPort(allCreds.email_smtp_port ?? "");
      setEmailSmtpSecurity(allCreds.email_smtp_security ?? "ssl");
      setEmailSslVerify(allCreds.email_ssl_verify !== "false");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setSaved(false);
      void loadSettings();
    }
  }, [isOpen, loadSettings]);

  const handleSave = async () => {
    setSaving(true);
    setEmailTestError(null);

    // Save non-sensitive settings synchronously
    setProvider(selectedProvider);
    setOllamaBaseUrl(ollamaUrl);
    setOllamaModel(ollamaModelName);
    setEnableTools(toolsEnabled);

    // Save sensitive credentials asynchronously
    await Promise.all([
      setApiKey(anthropicKey),
      setPerplexityApiKey(perplexityKey),
      emailAddress ? setEmailCredential("email_address", emailAddress) : Promise.resolve(),
      emailUsername ? setEmailCredential("email_username", emailUsername) : Promise.resolve(),
      emailPassword ? setEmailCredential("email_password", emailPassword) : Promise.resolve(),
      emailImapHost ? setEmailCredential("email_imap_host", emailImapHost) : Promise.resolve(),
      emailImapPort ? setEmailCredential("email_imap_port", emailImapPort) : Promise.resolve(),
      setEmailCredential("email_imap_security", emailImapSecurity),
      emailSmtpHost ? setEmailCredential("email_smtp_host", emailSmtpHost) : Promise.resolve(),
      emailSmtpPort ? setEmailCredential("email_smtp_port", emailSmtpPort) : Promise.resolve(),
      setEmailCredential("email_smtp_security", emailSmtpSecurity),
      setEmailCredential("email_ssl_verify", emailSslVerify ? "true" : "false"),
    ]);

    // Test email connection if email is configured
    if (emailAddress && emailPassword) {
      const result = await testEmailConnection({
        emailAddress,
        emailUsername: emailUsername || undefined,
        emailPassword,
        emailImapHost: emailImapHost || undefined,
        emailImapPort: emailImapPort || undefined,
        emailImapSecurity: emailImapSecurity || undefined,
        emailSmtpHost: emailSmtpHost || undefined,
        emailSmtpPort: emailSmtpPort || undefined,
        emailSmtpSecurity: emailSmtpSecurity || undefined,
        emailSslVerify: emailSslVerify ? "true" : "false",
      });
      if (!result.success) {
        setEmailTestError(result.error ?? "Connection failed");
        setSaving(false);
        return;
      }
    }

    setSaving(false);
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

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div
              className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
              style={{ borderColor: "var(--fg-muted)", borderTopColor: "transparent" }}
            />
          </div>
        ) : (
          <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
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

            {/* Email Settings Section */}
            <div className="border-t pt-6" style={{ borderColor: "var(--border-secondary)" }}>
              <div className="mb-4 flex items-center gap-2">
                <Mail className="h-4 w-4" style={{ color: "var(--fg-accent)" }} />
                <h3 className="text-sm font-medium" style={{ color: "var(--fg-secondary)" }}>
                  Email Settings
                </h3>
                <span className="text-xs" style={{ color: "var(--fg-muted)" }}>(optional)</span>
              </div>

              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="email-address"
                    className="mb-1 block text-xs font-medium"
                    style={{ color: "var(--fg-muted)" }}
                  >
                    Email Address
                  </label>
                  <input
                    id="email-address"
                    type="email"
                    value={emailAddress}
                    onChange={(e) => { setEmailAddress(e.target.value); }}
                    placeholder="you@example.com"
                    className="w-full rounded-xl border px-4 py-2.5 text-sm transition-colors focus:outline-none focus:ring-2"
                    style={{
                      background: "var(--bg-input)",
                      borderColor: "var(--border-secondary)",
                      color: "var(--fg-primary)",
                    }}
                  />
                </div>

                <div>
                  <label
                    htmlFor="email-username"
                    className="mb-1 block text-xs font-medium"
                    style={{ color: "var(--fg-muted)" }}
                  >
                    Username
                    <span className="ml-1 opacity-60">(if different from email)</span>
                  </label>
                  <input
                    id="email-username"
                    type="text"
                    value={emailUsername}
                    onChange={(e) => { setEmailUsername(e.target.value); }}
                    placeholder={emailAddress || "you@example.com"}
                    className="w-full rounded-xl border px-4 py-2.5 text-sm transition-colors focus:outline-none focus:ring-2"
                    style={{
                      background: "var(--bg-input)",
                      borderColor: "var(--border-secondary)",
                      color: "var(--fg-primary)",
                    }}
                  />
                </div>

                <div>
                  <label
                    htmlFor="email-password"
                    className="mb-1 block text-xs font-medium"
                    style={{ color: "var(--fg-muted)" }}
                  >
                    Password / App Password
                  </label>
                  <input
                    id="email-password"
                    type="password"
                    value={emailPassword}
                    onChange={(e) => { setEmailPassword(e.target.value); }}
                    placeholder="App-specific password"
                    className="w-full rounded-xl border px-4 py-2.5 text-sm transition-colors focus:outline-none focus:ring-2"
                    style={{
                      background: "var(--bg-input)",
                      borderColor: "var(--border-secondary)",
                      color: "var(--fg-primary)",
                    }}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="email-imap"
                      className="mb-1 block text-xs font-medium"
                      style={{ color: "var(--fg-muted)" }}
                    >
                      IMAP Host
                    </label>
                    <input
                      id="email-imap"
                      type="text"
                      value={emailImapHost}
                      onChange={(e) => { setEmailImapHost(e.target.value); }}
                      placeholder="imap.gmail.com"
                      className="w-full rounded-xl border px-3 py-2.5 text-sm transition-colors focus:outline-none focus:ring-2"
                      style={{
                        background: "var(--bg-input)",
                        borderColor: "var(--border-secondary)",
                        color: "var(--fg-primary)",
                      }}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="email-imap-port"
                      className="mb-1 block text-xs font-medium"
                      style={{ color: "var(--fg-muted)" }}
                    >
                      IMAP Port
                    </label>
                    <input
                      id="email-imap-port"
                      type="text"
                      value={emailImapPort}
                      onChange={(e) => { setEmailImapPort(e.target.value); }}
                      placeholder={emailImapSecurity === "ssl" ? "993" : "143"}
                      className="w-full rounded-xl border px-3 py-2.5 text-sm transition-colors focus:outline-none focus:ring-2"
                      style={{
                        background: "var(--bg-input)",
                        borderColor: "var(--border-secondary)",
                        color: "var(--fg-primary)",
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label
                    className="mb-1 block text-xs font-medium"
                    style={{ color: "var(--fg-muted)" }}
                  >
                    IMAP Security
                  </label>
                  <div className="flex gap-1.5">
                    {(["ssl", "starttls", "none"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => { setEmailImapSecurity(mode); }}
                        className="flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all"
                        style={{
                          background: emailImapSecurity === mode ? "var(--bg-accent)" : "var(--bg-input)",
                          borderColor: emailImapSecurity === mode ? "var(--bg-accent)" : "var(--border-secondary)",
                          color: emailImapSecurity === mode ? "white" : "var(--fg-secondary)",
                        }}
                      >
                        {mode === "ssl" ? "SSL/TLS (993)" : mode === "starttls" ? "STARTTLS (143)" : "None (143)"}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="email-smtp"
                      className="mb-1 block text-xs font-medium"
                      style={{ color: "var(--fg-muted)" }}
                    >
                      SMTP Host
                    </label>
                    <input
                      id="email-smtp"
                      type="text"
                      value={emailSmtpHost}
                      onChange={(e) => { setEmailSmtpHost(e.target.value); }}
                      placeholder="smtp.gmail.com"
                      className="w-full rounded-xl border px-3 py-2.5 text-sm transition-colors focus:outline-none focus:ring-2"
                      style={{
                        background: "var(--bg-input)",
                        borderColor: "var(--border-secondary)",
                        color: "var(--fg-primary)",
                      }}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="email-smtp-port"
                      className="mb-1 block text-xs font-medium"
                      style={{ color: "var(--fg-muted)" }}
                    >
                      SMTP Port
                    </label>
                    <input
                      id="email-smtp-port"
                      type="text"
                      value={emailSmtpPort}
                      onChange={(e) => { setEmailSmtpPort(e.target.value); }}
                      placeholder={emailSmtpSecurity === "starttls" ? "587" : emailSmtpSecurity === "none" ? "25" : "465"}
                      className="w-full rounded-xl border px-3 py-2.5 text-sm transition-colors focus:outline-none focus:ring-2"
                      style={{
                        background: "var(--bg-input)",
                        borderColor: "var(--border-secondary)",
                        color: "var(--fg-primary)",
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label
                    className="mb-1 block text-xs font-medium"
                    style={{ color: "var(--fg-muted)" }}
                  >
                    SMTP Security
                  </label>
                  <div className="flex gap-1.5">
                    {(["ssl", "starttls", "none"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => { setEmailSmtpSecurity(mode); }}
                        className="flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all"
                        style={{
                          background: emailSmtpSecurity === mode ? "var(--bg-accent)" : "var(--bg-input)",
                          borderColor: emailSmtpSecurity === mode ? "var(--bg-accent)" : "var(--border-secondary)",
                          color: emailSmtpSecurity === mode ? "white" : "var(--fg-secondary)",
                        }}
                      >
                        {mode === "ssl" ? "SSL/TLS (465)" : mode === "starttls" ? "STARTTLS (587)" : "None (25)"}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium" style={{ color: "var(--fg-muted)" }}>
                      Verify SSL Certificates
                    </p>
                    <p className="text-xs" style={{ color: "var(--fg-muted)", opacity: 0.7 }}>
                      Disable for self-signed certs (e.g. ProtonMail Bridge)
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setEmailSslVerify(!emailSslVerify); }}
                    className="relative h-6 w-11 rounded-full transition-colors"
                    style={{
                      background: emailSslVerify ? "var(--bg-accent)" : "var(--bg-tertiary)",
                    }}
                  >
                    <span
                      className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform"
                      style={{
                        transform: emailSslVerify ? "translateX(20px)" : "translateX(0)",
                      }}
                    />
                  </button>
                </div>
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
                  ? "Ollama runs locally on your machine. API keys and passwords are stored securely in your system's keychain."
                  : "Your credentials are stored securely in your system's keychain (Keychain Access on macOS, Credential Manager on Windows). They are sent directly to their respective servers and never shared with third parties."}
              </p>
            </div>

            {emailTestError !== null && (
              <div
                className="flex items-start gap-2 rounded-lg p-3"
                style={{ background: "rgba(239, 68, 68, 0.1)" }}
              >
                <span className="text-xs" style={{ color: "var(--error)" }}>
                  Email connection failed: {emailTestError}
                </span>
              </div>
            )}

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
                onClick={() => void handleSave()}
                disabled={saved || saving}
                className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium text-white transition-all"
                style={{ background: saved ? "var(--success)" : "var(--bg-accent)", opacity: saving ? 0.7 : 1 }}
              >
                {saved ? (
                  <>
                    <span className="inline-block">&#10003;</span>
                    Saved
                  </>
                ) : saving ? (
                  <>
                    <div
                      className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-t-transparent"
                      style={{ borderColor: "white", borderTopColor: "transparent" }}
                    />
                    Verifying...
                  </>
                ) : (
                  "Save"
                )}
              </button>
            </div>
          </div>
        )}
    </Modal>
  );
}
