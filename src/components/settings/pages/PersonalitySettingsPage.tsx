import { useState, useEffect } from "react";
import { User } from "lucide-react";
import { getPersonality, setPersonality } from "@app/lib/ai";

export function PersonalitySettingsPage() {
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setText(getPersonality());
  }, []);

  const handleSave = () => {
    setPersonality(text);
    setSaved(true);
    setTimeout(() => { setSaved(false); }, 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ background: "var(--bg-hover)" }}
        >
          <User className="h-5 w-5" style={{ color: "var(--fg-accent)" }} />
        </div>
        <div>
          <h2 className="text-lg font-semibold" style={{ color: "var(--fg-primary)" }}>
            Personality
          </h2>
          <p className="text-sm" style={{ color: "var(--fg-muted)" }}>
            Customize how the AI assistant behaves and responds
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium" style={{ color: "var(--fg-secondary)" }}>
          Personality Prompt
        </label>
        <textarea
          value={text}
          onChange={(e) => { setText(e.target.value); }}
          rows={8}
          placeholder="e.g. You are a friendly assistant who loves using analogies. Keep responses casual and conversational."
          className="w-full resize-y rounded-lg p-3 text-sm"
          style={{
            background: "var(--bg-tertiary)",
            color: "var(--fg-primary)",
            border: "1px solid var(--border-secondary)",
          }}
        />
        <p className="text-xs" style={{ color: "var(--fg-muted)" }}>
          This text is prepended to the system prompt. It shapes the AI's tone, style, and behavior.
        </p>
      </div>

      <button
        type="button"
        onClick={handleSave}
        className="rounded-lg px-4 py-2 text-sm font-medium transition-colors"
        style={{
          background: saved ? "var(--success)" : "var(--fg-accent)",
          color: "white",
        }}
      >
        {saved ? "Saved" : "Save"}
      </button>
    </div>
  );
}
