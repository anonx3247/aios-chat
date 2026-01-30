import { ProviderSettingsPage } from "./pages/ProviderSettingsPage";
import { KeysSettingsPage } from "./pages/KeysSettingsPage";
import { EmailSettingsPage } from "./pages/EmailSettingsPage";

interface SettingsPageRendererProps {
  pageId: string;
  subFilter?: string | undefined;
}

export function SettingsPageRenderer({ pageId, subFilter }: SettingsPageRendererProps) {
  switch (pageId) {
    case "settings.provider":
      return <ProviderSettingsPage />;
    case "settings.keys":
      return <KeysSettingsPage subFilter={subFilter} />;
    case "settings.email":
      return <EmailSettingsPage subFilter={subFilter} />;
    default:
      return <ProviderSettingsPage />;
  }
}
