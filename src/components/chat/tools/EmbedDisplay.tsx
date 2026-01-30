/**
 * EmbedDisplay - Display component for embedded web content
 *
 * Renders YouTube, Spotify, Google Maps, and social media embeds.
 */
import { ExternalLink, Play, Music, MapPin, MessageCircle, Loader2 } from "lucide-react";
import type { ToolInvocation } from "@app/types/message";

interface EmbedDisplayProps {
  toolInvocation: ToolInvocation;
}

interface EmbedResult {
  url: string;
  title?: string;
  provider: string;
  type: string;
  embed_url?: string;
  id?: string;
  oembed_url?: string;
}

export function EmbedDisplay({ toolInvocation }: EmbedDisplayProps) {
  const { state, result } = toolInvocation;

  // Loading state
  if (state === "call" || state === "partial-call") {
    return (
      <div
        className="flex items-center gap-3 rounded-xl px-4 py-3"
        style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-secondary)" }}
      >
        <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--fg-accent)" }} />
        <span className="text-sm" style={{ color: "var(--fg-muted)" }}>
          Loading embed...
        </span>
      </div>
    );
  }

  const embedResult = result as EmbedResult | undefined;
  if (embedResult === undefined) {
    return null;
  }

  const { provider, embed_url, url, title } = embedResult;

  // Provider-specific icon
  const getProviderIcon = () => {
    switch (provider) {
      case "youtube":
        return <Play className="h-4 w-4" />;
      case "spotify":
        return <Music className="h-4 w-4" />;
      case "google_maps":
        return <MapPin className="h-4 w-4" />;
      case "twitter":
      case "instagram":
      case "tiktok":
      case "facebook":
      case "linkedin":
        return <MessageCircle className="h-4 w-4" />;
      default:
        return <ExternalLink className="h-4 w-4" />;
    }
  };

  // Provider-specific height
  const getEmbedHeight = () => {
    switch (provider) {
      case "youtube":
        return "315px";
      case "spotify":
        return embedResult.type === "track" ? "152px" : "380px";
      case "google_maps":
        return "300px";
      default:
        return "400px";
    }
  };

  // Render iframe for providers with embed_url
  if (embed_url !== undefined) {
    return (
      <div
        className="overflow-hidden rounded-xl"
        style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-secondary)" }}
      >
        {title !== undefined && (
          <div
            className="flex items-center gap-2 border-b px-4 py-2"
            style={{ borderColor: "var(--border-secondary)" }}
          >
            <span style={{ color: "var(--fg-accent)" }}>{getProviderIcon()}</span>
            <span className="text-sm font-medium" style={{ color: "var(--fg-primary)" }}>
              {title}
            </span>
          </div>
        )}
        <iframe
          src={embed_url}
          width="100%"
          height={getEmbedHeight()}
          style={{ border: "none" }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  // Fallback: link card for unsupported providers
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 rounded-xl px-4 py-3 transition-colors hover:opacity-80"
      style={{
        background: "var(--bg-secondary)",
        border: "1px solid var(--border-secondary)",
        textDecoration: "none",
      }}
    >
      <span style={{ color: "var(--fg-accent)" }}>{getProviderIcon()}</span>
      <div className="flex flex-col">
        <span className="text-sm font-medium" style={{ color: "var(--fg-primary)" }}>
          {title ?? provider}
        </span>
        <span className="text-xs" style={{ color: "var(--fg-muted)" }}>
          {url.slice(0, 50)}{url.length > 50 ? "..." : ""}
        </span>
      </div>
      <ExternalLink className="ml-auto h-4 w-4" style={{ color: "var(--fg-muted)" }} />
    </a>
  );
}
