import { useState, useEffect } from "react";
import { X, Key, Shield } from "lucide-react";
import { Modal } from "@app/components/ui/Modal";
import { SettingsNav } from "@app/components/settings/SettingsNav";
import { SettingsPageRenderer } from "@app/components/settings/SettingsPageRenderer";
import { resolveSettingsPath } from "@app/lib/settings-registry";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialPage?: string;
}

export function SettingsModal({ isOpen, onClose, initialPage }: SettingsModalProps) {
  const resolved = initialPage !== undefined && initialPage !== "" ? resolveSettingsPath(initialPage) : { pageId: "settings.provider" };
  const [activePage, setActivePage] = useState(resolved.pageId);
  const [subFilter, setSubFilter] = useState<string | undefined>(resolved.subFilter);

  useEffect(() => {
    if (isOpen && initialPage !== undefined && initialPage !== "") {
      const r = resolveSettingsPath(initialPage);
      setActivePage(r.pageId);
      setSubFilter(r.subFilter);
    } else if (isOpen) {
      setActivePage("settings.provider");
      setSubFilter(undefined);
    }
  }, [isOpen, initialPage]);

  const handleNavigate = (pageId: string) => {
    setActivePage(pageId);
    setSubFilter(undefined);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="w-full max-w-2xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ background: "var(--bg-tertiary)" }}
          >
            <Key className="h-5 w-5" style={{ color: "var(--fg-accent)" }} />
          </div>
          <h2 className="text-lg font-semibold" style={{ color: "var(--fg-primary)" }}>
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

      <div className="flex min-h-[400px]">
        <SettingsNav activePage={activePage} onNavigate={handleNavigate} />
        <div className="flex-1 overflow-y-auto pl-6" style={{ maxHeight: "60vh" }}>
          <SettingsPageRenderer pageId={activePage} subFilter={subFilter} />
        </div>
      </div>

      {/* Security note */}
      <div className="mt-6 flex items-start gap-2 rounded-lg p-3" style={{ background: "var(--bg-tertiary)" }}>
        <Shield className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--success)" }} />
        <p className="text-xs" style={{ color: "var(--fg-muted)" }}>
          Your credentials are stored securely in your system's keychain. They are sent directly to their respective servers and never shared with third parties.
        </p>
      </div>
    </Modal>
  );
}
