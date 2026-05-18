import type { ReactNode } from "react";
import { X } from "lucide-react";
import { useMountTransition, useDismissable } from "@/hooks/useMountTransition";
import { cn } from "@/lib/utils";

export function Modal({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const { mounted, show } = useMountTransition(open, 200);
  useDismissable(open, onClose);
  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className={cn(
          "absolute inset-0 bg-black/65 backdrop-blur-sm transition-opacity duration-200",
          show ? "opacity-100" : "opacity-0",
        )}
        onClick={onClose}
      />
      <div
        className={cn(
          "relative w-full max-w-md rounded-2xl border border-line bg-panel shadow-pop transition-all duration-200 ease-out",
          show ? "scale-100 opacity-100" : "scale-95 opacity-0",
          className,
        )}
      >
        {title && (
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div className="text-sm font-semibold text-ink">{title}</div>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-surface"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
