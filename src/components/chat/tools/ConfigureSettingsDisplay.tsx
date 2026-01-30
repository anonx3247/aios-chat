/**
 * ConfigureSettingsDisplay - Embeddable settings form for inline configuration
 *
 * Renders settings forms directly in the chat when the AI needs credentials
 * to proceed with a task. Supports email, perplexity, anthropic, and ollama settings.
 */
import { useState, useEffect, useCallback } from "react";
import { Settings, CheckCircle2, AlertCircle, Key, Mail, Server, Bot, Search } from "lucide-react";
import type { ToolInvocation } from "@app/types/message";
import {
  setApiKey,
  setPerplexityApiKey,
  setEmailCredential,
  setOllamaBaseUrl,
  setOllamaModel,
  testEmailConnection,
} from "@app/lib/ai";
import { getAllCredentialsWithFallback } from "@app/lib/credentials";

interface ConfigureSettingsDisplayProps {
  toolInvocation: ToolInvocation;
}

interface ConfigureSettingsArgs {
  settings_key: "email" | "perplexity" | "anthropic" | "ollama";
  reason: string;
}

interface ConfigureSettingsResult {
  settings_key: string;
  reason: string;
  awaiting_user_input: boolean;
  configured?: boolean;
}

type SettingsKey = ConfigureSettingsArgs["settings_key"];

export function ConfigureSettingsDisplay({ toolInvocation }: ConfigureSettingsDisplayProps) {
  const { state, args, result } = toolInvocation;
  const settingsArgs = args as unknown as ConfigureSettingsArgs;

  // Form states for each settings type
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
  const [perplexityKey, setPerplexityKeyState] = useState("");
  const [anthropicKey, setAnthropicKeyState] = useState("");
  const [ollamaUrl, setOllamaUrlState] = useState("http://localhost:11434");
  const [ollamaModelName, setOllamaModelState] = useState("qwen3-vl:latest");

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Load existing credentials
  const loadCredentials = useCallback(async () => {
    try {
      const creds = await getAllCredentialsWithFallback();
      setEmailAddress(creds.email_address ?? "");
      setEmailUsername(creds.email_username ?? "");
      setEmailPassword(creds.email_password ?? "");
      setEmailImapHost(creds.email_imap_host ?? "");
      setEmailImapPort(creds.email_imap_port ?? "");
      setEmailImapSecurity(creds.email_imap_security ?? "ssl");
      setEmailSmtpHost(creds.email_smtp_host ?? "");
      setEmailSmtpPort(creds.email_smtp_port ?? "");
      setEmailSmtpSecurity(creds.email_smtp_security ?? "ssl");
      setEmailSslVerify(creds.email_ssl_verify !== "false");
      setPerplexityKeyState(creds.perplexity_api_key ?? "");
      setAnthropicKeyState(creds.anthropic_api_key ?? "");

      // Load localStorage settings
      setOllamaUrlState(localStorage.getItem("ollama_base_url") ?? "http://localhost:11434");
      setOllamaModelState(localStorage.getItem("ollama_model") ?? "qwen3-vl:latest");

      setLoaded(true);
    } catch (err) {
      console.error("Failed to load credentials:", err);
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (state === "call" || state === "partial-call") {
      void loadCredentials();
    }
  }, [state, loadCredentials]);

  // Check if the result indicates settings were already configured
  let parsedResult = result;
  if (typeof parsedResult === "string") {
    try {
      parsedResult = JSON.parse(parsedResult);
    } catch {
      // Not JSON, keep as is
    }
  }
  const settingsResult = parsedResult as ConfigureSettingsResult | undefined;
  const wasConfigured = settingsResult?.configured === true;

  const handleSave = async (settingsKey: SettingsKey) => {
    setSaving(true);
    setError(null);

    try {
      switch (settingsKey) {
        case "email":
          if (!emailAddress || !emailPassword) {
            throw new Error("Email address and password are required");
          }
          await Promise.all([
            setEmailCredential("email_address", emailAddress),
            emailUsername ? setEmailCredential("email_username", emailUsername) : Promise.resolve(),
            setEmailCredential("email_password", emailPassword),
            emailImapHost ? setEmailCredential("email_imap_host", emailImapHost) : Promise.resolve(),
            emailImapPort ? setEmailCredential("email_imap_port", emailImapPort) : Promise.resolve(),
            setEmailCredential("email_imap_security", emailImapSecurity),
            emailSmtpHost ? setEmailCredential("email_smtp_host", emailSmtpHost) : Promise.resolve(),
            emailSmtpPort ? setEmailCredential("email_smtp_port", emailSmtpPort) : Promise.resolve(),
            setEmailCredential("email_smtp_security", emailSmtpSecurity),
            setEmailCredential("email_ssl_verify", emailSslVerify ? "true" : "false"),
          ]);
          // Verify email connection
          const testResult = await testEmailConnection({
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
          if (!testResult.success) {
            throw new Error(testResult.error ?? "Email connection failed");
          }
          break;

        case "perplexity":
          if (!perplexityKey) {
            throw new Error("Perplexity API key is required");
          }
          await setPerplexityApiKey(perplexityKey);
          break;

        case "anthropic":
          if (!anthropicKey) {
            throw new Error("Anthropic API key is required");
          }
          await setApiKey(anthropicKey);
          break;

        case "ollama":
          if (!ollamaUrl) {
            throw new Error("Ollama URL is required");
          }
          setOllamaBaseUrl(ollamaUrl);
          setOllamaModel(ollamaModelName);
          break;
      }

      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  // Compact display when already completed
  if (state === "result" && wasConfigured) {
    return (
      <div
        className="flex items-center gap-2.5 rounded-xl px-3 py-2"
        style={{ background: "var(--bg-hover)" }}
      >
        <CheckCircle2 className="h-4 w-4" style={{ color: "var(--success)" }} />
        <span className="text-sm" style={{ color: "var(--fg-secondary)" }}>
          {getSettingsLabel(settingsArgs.settings_key)} configured
        </span>
      </div>
    );
  }

  // Loading state
  if ((state === "call" || state === "partial-call") && !loaded) {
    return (
      <div
        className="flex items-center gap-2.5 rounded-xl px-3 py-2"
        style={{ background: "var(--bg-hover)" }}
      >
        <div
          className="h-4 w-4 animate-spin rounded-full border-2 border-t-transparent"
          style={{ borderColor: "var(--fg-muted)", borderTopColor: "transparent" }}
        />
        <span className="text-sm" style={{ color: "var(--fg-muted)" }}>
          Loading settings...
        </span>
      </div>
    );
  }

  // Saved state
  if (saved) {
    return (
      <div
        className="flex items-center gap-2.5 rounded-xl px-3 py-2"
        style={{ background: "var(--bg-hover)" }}
      >
        <CheckCircle2 className="h-4 w-4" style={{ color: "var(--success)" }} />
        <span className="text-sm" style={{ color: "var(--fg-secondary)" }}>
          {getSettingsLabel(settingsArgs.settings_key)} saved! You can now retry your request.
        </span>
      </div>
    );
  }

  // Interactive form
  return (
    <div
      className="rounded-xl border p-4"
      style={{ background: "var(--bg-secondary)", borderColor: "var(--border-secondary)" }}
    >
      {/* Header */}
      <div className="mb-4 flex items-start gap-3">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-lg"
          style={{ background: "var(--bg-tertiary)" }}
        >
          <Settings className="h-4 w-4" style={{ color: "var(--fg-accent)" }} />
        </div>
        <div>
          <h3 className="text-sm font-medium" style={{ color: "var(--fg-primary)" }}>
            Configure {getSettingsLabel(settingsArgs.settings_key)}
          </h3>
          <p className="mt-0.5 text-xs" style={{ color: "var(--fg-muted)" }}>
            {settingsArgs.reason}
          </p>
        </div>
      </div>

      {/* Form based on settings_key */}
      <div className="space-y-3">
        {settingsArgs.settings_key === "email" && (
          <EmailSettingsForm
            emailAddress={emailAddress}
            setEmailAddress={setEmailAddress}
            emailUsername={emailUsername}
            setEmailUsername={setEmailUsername}
            emailPassword={emailPassword}
            setEmailPassword={setEmailPassword}
            emailImapHost={emailImapHost}
            setEmailImapHost={setEmailImapHost}
            emailImapPort={emailImapPort}
            setEmailImapPort={setEmailImapPort}
            emailImapSecurity={emailImapSecurity}
            setEmailImapSecurity={setEmailImapSecurity}
            emailSmtpHost={emailSmtpHost}
            setEmailSmtpHost={setEmailSmtpHost}
            emailSmtpPort={emailSmtpPort}
            setEmailSmtpPort={setEmailSmtpPort}
            emailSmtpSecurity={emailSmtpSecurity}
            setEmailSmtpSecurity={setEmailSmtpSecurity}
            emailSslVerify={emailSslVerify}
            setEmailSslVerify={setEmailSslVerify}
          />
        )}

        {settingsArgs.settings_key === "perplexity" && (
          <PerplexitySettingsForm
            perplexityKey={perplexityKey}
            setPerplexityKey={setPerplexityKeyState}
          />
        )}

        {settingsArgs.settings_key === "anthropic" && (
          <AnthropicSettingsForm
            anthropicKey={anthropicKey}
            setAnthropicKey={setAnthropicKeyState}
          />
        )}

        {settingsArgs.settings_key === "ollama" && (
          <OllamaSettingsForm
            ollamaUrl={ollamaUrl}
            setOllamaUrl={setOllamaUrlState}
            ollamaModel={ollamaModelName}
            setOllamaModel={setOllamaModelState}
          />
        )}
      </div>

      {/* Error message */}
      {error !== null && error !== "" && (
        <div
          className="mt-3 flex items-center gap-2 rounded-lg px-3 py-2"
          style={{ background: "rgba(239, 68, 68, 0.1)" }}
        >
          <AlertCircle className="h-4 w-4" style={{ color: "var(--error)" }} />
          <span className="text-xs" style={{ color: "var(--error)" }}>
            {error}
          </span>
        </div>
      )}

      {/* Save button */}
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={() => void handleSave(settingsArgs.settings_key)}
          disabled={saving}
          className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-white transition-all"
          style={{ background: "var(--bg-accent)", opacity: saving ? 0.7 : 1 }}
        >
          {saving ? (
            <>
              <div
                className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-t-transparent"
                style={{ borderColor: "white", borderTopColor: "transparent" }}
              />
              {settingsArgs.settings_key === "email" ? "Verifying..." : "Saving..."}
            </>
          ) : (
            "Save & Continue"
          )}
        </button>
      </div>
    </div>
  );
}

function getSettingsLabel(key: SettingsKey): string {
  switch (key) {
    case "email":
      return "Email";
    case "perplexity":
      return "Perplexity";
    case "anthropic":
      return "Anthropic";
    case "ollama":
      return "Ollama";
    default:
      return "Settings";
  }
}

// Sub-form components

interface EmailSettingsFormProps {
  emailAddress: string;
  setEmailAddress: (v: string) => void;
  emailUsername: string;
  setEmailUsername: (v: string) => void;
  emailPassword: string;
  setEmailPassword: (v: string) => void;
  emailImapHost: string;
  setEmailImapHost: (v: string) => void;
  emailImapPort: string;
  setEmailImapPort: (v: string) => void;
  emailImapSecurity: string;
  setEmailImapSecurity: (v: string) => void;
  emailSmtpHost: string;
  setEmailSmtpHost: (v: string) => void;
  emailSmtpPort: string;
  setEmailSmtpPort: (v: string) => void;
  emailSmtpSecurity: string;
  setEmailSmtpSecurity: (v: string) => void;
  emailSslVerify: boolean;
  setEmailSslVerify: (v: boolean) => void;
}

function EmailSettingsForm({
  emailAddress,
  setEmailAddress,
  emailUsername,
  setEmailUsername,
  emailPassword,
  setEmailPassword,
  emailImapHost,
  setEmailImapHost,
  emailImapPort,
  setEmailImapPort,
  emailImapSecurity,
  setEmailImapSecurity,
  emailSmtpHost,
  setEmailSmtpHost,
  emailSmtpPort,
  setEmailSmtpPort,
  emailSmtpSecurity,
  setEmailSmtpSecurity,
  emailSslVerify,
  setEmailSslVerify,
}: EmailSettingsFormProps) {
  return (
    <>
      <div>
        <label
          htmlFor="inline-email-address"
          className="mb-1 flex items-center gap-1.5 text-xs font-medium"
          style={{ color: "var(--fg-muted)" }}
        >
          <Mail className="h-3 w-3" />
          Email Address
        </label>
        <input
          id="inline-email-address"
          type="email"
          value={emailAddress}
          onChange={(e) => { setEmailAddress(e.target.value); }}
          placeholder="you@example.com"
          className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2"
          style={{
            background: "var(--bg-input)",
            borderColor: "var(--border-secondary)",
            color: "var(--fg-primary)",
          }}
        />
      </div>
      <div>
        <label
          htmlFor="inline-email-username"
          className="mb-1 flex items-center gap-1.5 text-xs font-medium"
          style={{ color: "var(--fg-muted)" }}
        >
          <Key className="h-3 w-3" />
          Username
          <span className="opacity-60">(if different from email)</span>
        </label>
        <input
          id="inline-email-username"
          type="text"
          value={emailUsername}
          onChange={(e) => { setEmailUsername(e.target.value); }}
          placeholder={emailAddress || "you@example.com"}
          className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2"
          style={{
            background: "var(--bg-input)",
            borderColor: "var(--border-secondary)",
            color: "var(--fg-primary)",
          }}
        />
      </div>
      <div>
        <label
          htmlFor="inline-email-password"
          className="mb-1 flex items-center gap-1.5 text-xs font-medium"
          style={{ color: "var(--fg-muted)" }}
        >
          <Key className="h-3 w-3" />
          Password / App Password
        </label>
        <input
          id="inline-email-password"
          type="password"
          value={emailPassword}
          onChange={(e) => { setEmailPassword(e.target.value); }}
          placeholder="App-specific password"
          className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2"
          style={{
            background: "var(--bg-input)",
            borderColor: "var(--border-secondary)",
            color: "var(--fg-primary)",
          }}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label
            htmlFor="inline-email-imap"
            className="mb-1 block text-xs font-medium"
            style={{ color: "var(--fg-muted)" }}
          >
            IMAP Host
          </label>
          <input
            id="inline-email-imap"
            type="text"
            value={emailImapHost}
            onChange={(e) => { setEmailImapHost(e.target.value); }}
            placeholder="imap.gmail.com"
            className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2"
            style={{
              background: "var(--bg-input)",
              borderColor: "var(--border-secondary)",
              color: "var(--fg-primary)",
            }}
          />
        </div>
        <div>
          <label
            htmlFor="inline-email-imap-port"
            className="mb-1 block text-xs font-medium"
            style={{ color: "var(--fg-muted)" }}
          >
            IMAP Port
          </label>
          <input
            id="inline-email-imap-port"
            type="text"
            value={emailImapPort}
            onChange={(e) => { setEmailImapPort(e.target.value); }}
            placeholder={emailImapSecurity === "ssl" ? "993" : "143"}
            className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2"
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
              className="flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-all"
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
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label
            htmlFor="inline-email-smtp"
            className="mb-1 block text-xs font-medium"
            style={{ color: "var(--fg-muted)" }}
          >
            SMTP Host
          </label>
          <input
            id="inline-email-smtp"
            type="text"
            value={emailSmtpHost}
            onChange={(e) => { setEmailSmtpHost(e.target.value); }}
            placeholder="smtp.gmail.com"
            className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2"
            style={{
              background: "var(--bg-input)",
              borderColor: "var(--border-secondary)",
              color: "var(--fg-primary)",
            }}
          />
        </div>
        <div>
          <label
            htmlFor="inline-email-smtp-port"
            className="mb-1 block text-xs font-medium"
            style={{ color: "var(--fg-muted)" }}
          >
            SMTP Port
          </label>
          <input
            id="inline-email-smtp-port"
            type="text"
            value={emailSmtpPort}
            onChange={(e) => { setEmailSmtpPort(e.target.value); }}
            placeholder={emailSmtpSecurity === "starttls" ? "587" : emailSmtpSecurity === "none" ? "25" : "465"}
            className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2"
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
              className="flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-all"
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
        <p className="text-xs font-medium" style={{ color: "var(--fg-muted)" }}>
          Verify SSL Certificates
        </p>
        <button
          type="button"
          onClick={() => { setEmailSslVerify(!emailSslVerify); }}
          className="relative h-5 w-9 rounded-full transition-colors"
          style={{
            background: emailSslVerify ? "var(--bg-accent)" : "var(--bg-tertiary)",
          }}
        >
          <span
            className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform"
            style={{
              transform: emailSslVerify ? "translateX(16px)" : "translateX(0)",
            }}
          />
        </button>
      </div>
    </>
  );
}

interface PerplexitySettingsFormProps {
  perplexityKey: string;
  setPerplexityKey: (v: string) => void;
}

function PerplexitySettingsForm({ perplexityKey, setPerplexityKey }: PerplexitySettingsFormProps) {
  return (
    <div>
      <label
        htmlFor="inline-perplexity-key"
        className="mb-1 flex items-center gap-1.5 text-xs font-medium"
        style={{ color: "var(--fg-muted)" }}
      >
        <Search className="h-3 w-3" />
        Perplexity API Key
      </label>
      <input
        id="inline-perplexity-key"
        type="password"
        value={perplexityKey}
        onChange={(e) => { setPerplexityKey(e.target.value); }}
        placeholder="pplx-..."
        className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2"
        style={{
          background: "var(--bg-input)",
          borderColor: "var(--border-secondary)",
          color: "var(--fg-primary)",
        }}
      />
      <p className="mt-1 text-xs" style={{ color: "var(--fg-muted)" }}>
        Get your API key from{" "}
        <a
          href="https://www.perplexity.ai/settings/api"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "var(--fg-accent)" }}
        >
          perplexity.ai/settings/api
        </a>
      </p>
    </div>
  );
}

interface AnthropicSettingsFormProps {
  anthropicKey: string;
  setAnthropicKey: (v: string) => void;
}

function AnthropicSettingsForm({ anthropicKey, setAnthropicKey }: AnthropicSettingsFormProps) {
  return (
    <div>
      <label
        htmlFor="inline-anthropic-key"
        className="mb-1 flex items-center gap-1.5 text-xs font-medium"
        style={{ color: "var(--fg-muted)" }}
      >
        <Key className="h-3 w-3" />
        Anthropic API Key
      </label>
      <input
        id="inline-anthropic-key"
        type="password"
        value={anthropicKey}
        onChange={(e) => { setAnthropicKey(e.target.value); }}
        placeholder="sk-ant-api03-..."
        className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2"
        style={{
          background: "var(--bg-input)",
          borderColor: "var(--border-secondary)",
          color: "var(--fg-primary)",
        }}
      />
      <p className="mt-1 text-xs" style={{ color: "var(--fg-muted)" }}>
        Get your API key from{" "}
        <a
          href="https://console.anthropic.com/settings/keys"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "var(--fg-accent)" }}
        >
          console.anthropic.com
        </a>
      </p>
    </div>
  );
}

interface OllamaSettingsFormProps {
  ollamaUrl: string;
  setOllamaUrl: (v: string) => void;
  ollamaModel: string;
  setOllamaModel: (v: string) => void;
}

function OllamaSettingsForm({
  ollamaUrl,
  setOllamaUrl,
  ollamaModel,
  setOllamaModel,
}: OllamaSettingsFormProps) {
  return (
    <>
      <div>
        <label
          htmlFor="inline-ollama-url"
          className="mb-1 flex items-center gap-1.5 text-xs font-medium"
          style={{ color: "var(--fg-muted)" }}
        >
          <Server className="h-3 w-3" />
          Ollama URL
        </label>
        <input
          id="inline-ollama-url"
          type="text"
          value={ollamaUrl}
          onChange={(e) => { setOllamaUrl(e.target.value); }}
          placeholder="http://localhost:11434"
          className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2"
          style={{
            background: "var(--bg-input)",
            borderColor: "var(--border-secondary)",
            color: "var(--fg-primary)",
          }}
        />
      </div>
      <div>
        <label
          htmlFor="inline-ollama-model"
          className="mb-1 flex items-center gap-1.5 text-xs font-medium"
          style={{ color: "var(--fg-muted)" }}
        >
          <Bot className="h-3 w-3" />
          Model
        </label>
        <input
          id="inline-ollama-model"
          type="text"
          value={ollamaModel}
          onChange={(e) => { setOllamaModel(e.target.value); }}
          placeholder="qwen3-vl:latest"
          className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2"
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
    </>
  );
}
