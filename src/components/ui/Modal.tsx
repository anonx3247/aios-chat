import { useEffect, useCallback, type ReactNode } from "react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  /** Position the modal (default: center) */
  position?: "center" | "top";
  /** Whether clicking the backdrop closes the modal (default: true) */
  closeOnBackdropClick?: boolean;
  /** Whether pressing Escape closes the modal (default: true) */
  closeOnEscape?: boolean;
}

export function Modal({
  isOpen,
  onClose,
  children,
  className = "",
  position = "center",
  closeOnBackdropClick = true,
  closeOnEscape = true,
}: ModalProps) {
  // Handle Escape key
  useEffect(() => {
    if (!isOpen || !closeOnEscape) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => { window.removeEventListener("keydown", handleKeyDown, true); };
  }, [isOpen, closeOnEscape, onClose]);

  const handleBackdropClick = useCallback(() => {
    if (closeOnBackdropClick) {
      onClose();
    }
  }, [closeOnBackdropClick, onClose]);

  if (!isOpen) return null;

  const positionClass = position === "top" ? "items-start pt-[15vh]" : "items-center";

  return (
    <div
      className={`fixed inset-0 z-50 flex justify-center backdrop-blur-sm ${positionClass}`}
      style={{ background: "rgba(0, 0, 0, 0.6)" }}
      onClick={handleBackdropClick}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`rounded-2xl shadow-2xl ${className}`}
        style={{
          background: "var(--bg-primary)",
          boxShadow: "0 0 0 1px var(--border-primary)",
        }}
        onClick={(e) => { e.stopPropagation(); }}
        onKeyDown={(e) => { e.stopPropagation(); }}
        role="document"
      >
        {children}
      </div>
    </div>
  );
}
