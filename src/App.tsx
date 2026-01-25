import { MainLayout } from "@app/components/layout/MainLayout";
import { ThemeProvider } from "@app/contexts/ThemeContext";
import { ModalProvider } from "@app/contexts/ModalContext";

export default function App() {
  return (
    <ThemeProvider>
      <ModalProvider>
        <MainLayout />
      </ModalProvider>
    </ThemeProvider>
  );
}
