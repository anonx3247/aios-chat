import { useEffect, useState } from "react";
import { X, Key, Shield } from "lucide-react";
import { getApiKey, setApiKey } from "@app/lib/ai";
import { Modal } from "@app/components/ui/Modal";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [key, setKey] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setKey(getApiKey() ?? "");
      setSaved(false);
    }
  }, [isOpen]);

  const handleSave = () => {
    setApiKey(key);
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
          <div>
            <label
              htmlFor="api-key"
              className="mb-2 block text-sm font-medium"
              style={{ color: "var(--fg-secondary)" }}
            >
              Anthropic API Key
            </label>
            <div className="relative">
              <input
                id="api-key"
                type="password"
                value={key}
                onChange={(e) => { setKey(e.target.value); }}
                placeholder="sk-ant-api03-..."
                className="w-full rounded-xl border px-4 py-3 transition-colors focus:outline-none focus:ring-2"
                style={{
                  background: "var(--bg-input)",
                  borderColor: "var(--border-secondary)",
                  color: "var(--fg-primary)",
                }}
              />
            </div>
            <div
              className="mt-3 flex items-start gap-2 rounded-lg p-3"
              style={{ background: "var(--bg-tertiary)" }}
            >
              <Shield className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--success)" }} />
              <p className="text-xs" style={{ color: "var(--fg-muted)" }}>
                Your API key is stored locally on your device and is only sent
                directly to Anthropic's servers. It is never shared with any
                third parties.
              </p>
            </div>
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
