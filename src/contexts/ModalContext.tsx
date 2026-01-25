import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export interface ModalRegistration {
  id: string;
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  keywords?: string[];
  /** Whether to show in command palette (default: true) */
  showInPalette?: boolean;
}

interface ModalContextValue {
  /** Currently open modal ID */
  openModalId: string | null;
  /** All registered modals */
  registrations: ModalRegistration[];
  /** Open a modal by ID */
  openModal: (id: string) => void;
  /** Close the current modal */
  closeModal: () => void;
  /** Register a modal (call in useEffect, returns unregister function) */
  registerModal: (registration: ModalRegistration) => () => void;
  /** Check if a specific modal is open */
  isModalOpen: (id: string) => boolean;
}

const ModalContext = createContext<ModalContextValue | null>(null);

export function ModalProvider({ children }: { children: ReactNode }) {
  const [openModalId, setOpenModalId] = useState<string | null>(null);
  const [registrations, setRegistrations] = useState<ModalRegistration[]>([]);

  const openModal = useCallback((id: string) => {
    setOpenModalId(id);
  }, []);

  const closeModal = useCallback(() => {
    setOpenModalId(null);
  }, []);

  const registerModal = useCallback((registration: ModalRegistration) => {
    setRegistrations((prev) => {
      // Don't add duplicates
      if (prev.some((r) => r.id === registration.id)) {
        return prev;
      }
      return [...prev, registration];
    });

    // Return unregister function
    return () => {
      setRegistrations((prev) => prev.filter((r) => r.id !== registration.id));
    };
  }, []);

  const isModalOpen = useCallback((id: string) => openModalId === id, [openModalId]);

  const value = useMemo(
    () => ({
      openModalId,
      registrations,
      openModal,
      closeModal,
      registerModal,
      isModalOpen,
    }),
    [openModalId, registrations, openModal, closeModal, registerModal, isModalOpen]
  );

  return (
    <ModalContext.Provider value={value}>
      {children}
    </ModalContext.Provider>
  );
}

export function useModals(): ModalContextValue {
  const context = useContext(ModalContext);
  if (context === null) {
    throw new Error("useModals must be used within a ModalProvider");
  }
  return context;
}

/** Hook for a specific modal - handles registration and open/close state */
export function useModal(registration: ModalRegistration): {
  isOpen: boolean;
  open: () => void;
  close: () => void;
} {
  const { registerModal, openModal, closeModal, isModalOpen } = useModals();

  // Register on mount
  useState(() => {
    const unregister = registerModal(registration);
    return unregister;
  });

  return {
    isOpen: isModalOpen(registration.id),
    open: () => { openModal(registration.id); },
    close: closeModal,
  };
}
