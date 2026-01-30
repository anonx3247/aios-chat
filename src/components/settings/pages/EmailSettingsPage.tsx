import { Mail, Key } from "lucide-react";
import { useState, useEffect } from "react";
import { setEmailCredential, testEmailConnection } from "@app/lib/ai";
import { getAllCredentialsWithFallback } from "@app/lib/credentials";

interface EmailSettingsPageProps {
  subFilter?: string | undefined;
}

export function EmailSettingsPage({ subFilter }: EmailSettingsPageProps) {
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

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
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
      setLoading(false);
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await Promise.all([
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
          setError(result.error ?? "Connection failed");
          setSaving(false);
          return;
        }
      }
      setSaved(true);
      setTimeout(() => { setSaved(false); }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: "var(--fg-muted)", borderTopColor: "transparent" }} />
      </div>
    );
  }

  const showPassword = subFilter === undefined || subFilter === "password";
  const showImap = subFilter === undefined || subFilter === "imap";
  const showSmtp = subFilter === undefined || subFilter === "smtp";
  const showBasic = subFilter === undefined;

  return (
    <div className="space-y-4">
      {showBasic && (
        <>
          <div>
            <label htmlFor="email-addr" className="mb-1 flex items-center gap-1.5 text-xs font-medium" style={{ color: "var(--fg-muted)" }}>
              <Mail className="h-3.5 w-3.5" /> Email Address
            </label>
            <input id="email-addr" type="email" value={emailAddress} onChange={(e) => { setEmailAddress(e.target.value); }} placeholder="you@example.com"
              className="w-full rounded-xl border px-4 py-2.5 text-sm transition-colors focus:outline-none focus:ring-2"
              style={{ background: "var(--bg-input)", borderColor: "var(--border-secondary)", color: "var(--fg-primary)" }} />
          </div>
          <div>
            <label htmlFor="email-user" className="mb-1 flex items-center gap-1.5 text-xs font-medium" style={{ color: "var(--fg-muted)" }}>
              <Key className="h-3.5 w-3.5" /> Username <span className="opacity-60">(if different from email)</span>
            </label>
            <input id="email-user" type="text" value={emailUsername} onChange={(e) => { setEmailUsername(e.target.value); }} placeholder={emailAddress || "you@example.com"}
              className="w-full rounded-xl border px-4 py-2.5 text-sm transition-colors focus:outline-none focus:ring-2"
              style={{ background: "var(--bg-input)", borderColor: "var(--border-secondary)", color: "var(--fg-primary)" }} />
          </div>
        </>
      )}

      {showPassword && (
        <div>
          <label htmlFor="email-pass" className="mb-1 flex items-center gap-1.5 text-xs font-medium" style={{ color: "var(--fg-muted)" }}>
            <Key className="h-3.5 w-3.5" /> Password / App Password
          </label>
          <input id="email-pass" type="password" value={emailPassword} onChange={(e) => { setEmailPassword(e.target.value); }} placeholder="App-specific password"
            className="w-full rounded-xl border px-4 py-2.5 text-sm transition-colors focus:outline-none focus:ring-2"
            style={{ background: "var(--bg-input)", borderColor: "var(--border-secondary)", color: "var(--fg-primary)" }} />
        </div>
      )}

      {showImap && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="email-imap-h" className="mb-1 block text-xs font-medium" style={{ color: "var(--fg-muted)" }}>IMAP Host</label>
              <input id="email-imap-h" type="text" value={emailImapHost} onChange={(e) => { setEmailImapHost(e.target.value); }} placeholder="imap.gmail.com"
                className="w-full rounded-xl border px-3 py-2.5 text-sm transition-colors focus:outline-none focus:ring-2"
                style={{ background: "var(--bg-input)", borderColor: "var(--border-secondary)", color: "var(--fg-primary)" }} />
            </div>
            <div>
              <label htmlFor="email-imap-p" className="mb-1 block text-xs font-medium" style={{ color: "var(--fg-muted)" }}>IMAP Port</label>
              <input id="email-imap-p" type="text" value={emailImapPort} onChange={(e) => { setEmailImapPort(e.target.value); }} placeholder={emailImapSecurity === "ssl" ? "993" : "143"}
                className="w-full rounded-xl border px-3 py-2.5 text-sm transition-colors focus:outline-none focus:ring-2"
                style={{ background: "var(--bg-input)", borderColor: "var(--border-secondary)", color: "var(--fg-primary)" }} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: "var(--fg-muted)" }}>IMAP Security</label>
            <div className="flex gap-1.5">
              {(["ssl", "starttls", "none"] as const).map((mode) => (
                <button key={mode} type="button" onClick={() => { setEmailImapSecurity(mode); }}
                  className="flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all"
                  style={{
                    background: emailImapSecurity === mode ? "var(--bg-accent)" : "var(--bg-input)",
                    borderColor: emailImapSecurity === mode ? "var(--bg-accent)" : "var(--border-secondary)",
                    color: emailImapSecurity === mode ? "white" : "var(--fg-secondary)",
                  }}>
                  {mode === "ssl" ? "SSL/TLS (993)" : mode === "starttls" ? "STARTTLS (143)" : "None (143)"}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {showSmtp && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="email-smtp-h" className="mb-1 block text-xs font-medium" style={{ color: "var(--fg-muted)" }}>SMTP Host</label>
              <input id="email-smtp-h" type="text" value={emailSmtpHost} onChange={(e) => { setEmailSmtpHost(e.target.value); }} placeholder="smtp.gmail.com"
                className="w-full rounded-xl border px-3 py-2.5 text-sm transition-colors focus:outline-none focus:ring-2"
                style={{ background: "var(--bg-input)", borderColor: "var(--border-secondary)", color: "var(--fg-primary)" }} />
            </div>
            <div>
              <label htmlFor="email-smtp-p" className="mb-1 block text-xs font-medium" style={{ color: "var(--fg-muted)" }}>SMTP Port</label>
              <input id="email-smtp-p" type="text" value={emailSmtpPort} onChange={(e) => { setEmailSmtpPort(e.target.value); }} placeholder={emailSmtpSecurity === "starttls" ? "587" : emailSmtpSecurity === "none" ? "25" : "465"}
                className="w-full rounded-xl border px-3 py-2.5 text-sm transition-colors focus:outline-none focus:ring-2"
                style={{ background: "var(--bg-input)", borderColor: "var(--border-secondary)", color: "var(--fg-primary)" }} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: "var(--fg-muted)" }}>SMTP Security</label>
            <div className="flex gap-1.5">
              {(["ssl", "starttls", "none"] as const).map((mode) => (
                <button key={mode} type="button" onClick={() => { setEmailSmtpSecurity(mode); }}
                  className="flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all"
                  style={{
                    background: emailSmtpSecurity === mode ? "var(--bg-accent)" : "var(--bg-input)",
                    borderColor: emailSmtpSecurity === mode ? "var(--bg-accent)" : "var(--border-secondary)",
                    color: emailSmtpSecurity === mode ? "white" : "var(--fg-secondary)",
                  }}>
                  {mode === "ssl" ? "SSL/TLS (465)" : mode === "starttls" ? "STARTTLS (587)" : "None (25)"}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {showBasic && (
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium" style={{ color: "var(--fg-muted)" }}>Verify SSL Certificates</p>
            <p className="text-xs" style={{ color: "var(--fg-muted)", opacity: 0.7 }}>Disable for self-signed certs (e.g. ProtonMail Bridge)</p>
          </div>
          <button type="button" onClick={() => { setEmailSslVerify(!emailSslVerify); }}
            className="relative h-6 w-11 rounded-full transition-colors"
            style={{ background: emailSslVerify ? "var(--bg-accent)" : "var(--bg-tertiary)" }}>
            <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform"
              style={{ transform: emailSslVerify ? "translateX(20px)" : "translateX(0)" }} />
          </button>
        </div>
      )}

      {error !== null && (
        <div className="flex items-start gap-2 rounded-lg p-3" style={{ background: "rgba(239, 68, 68, 0.1)" }}>
          <span className="text-xs" style={{ color: "var(--error)" }}>Email connection failed: {error}</span>
        </div>
      )}

      <div className="flex justify-end pt-2">
        <button type="button" onClick={() => void handleSave()} disabled={saving}
          className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium text-white transition-all"
          style={{ background: saved ? "var(--success)" : "var(--bg-accent)", opacity: saving ? 0.7 : 1 }}>
          {saved ? <><span>&#10003;</span> Saved</> : saving ? (
            <><div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: "white", borderTopColor: "transparent" }} /> Verifying...</>
          ) : "Save"}
        </button>
      </div>
    </div>
  );
}
