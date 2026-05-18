import { useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import { useMountTransition, useDismissable } from "@/hooks/useMountTransition";
import { cn } from "@/lib/utils";

/**
 * Responsive panel: bottom-sheet on mobile (touch swipe-down to dismiss),
 * right-side drawer on desktop. CSS transitions only — no animation deps.
 */
export function Sheet({
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
  const desktop = useIsDesktop();
  const { mounted, show } = useMountTransition(open);
  useDismissable(open, onClose);
  const [drag, setDrag] = useState(0);
  const startY = useRef<number | null>(null);

  if (!mounted) return null;

  const hidden = desktop ? "translate-x-full" : "translate-y-full";

  return (
    <div
      className="fixed inset-0 z-50 flex"
      style={{ justifyContent: desktop ? "flex-end" : "center", alignItems: desktop ? "stretch" : "flex-end" }}
    >
      <div
        className={cn(
          "absolute inset-0 bg-black/65 backdrop-blur-sm transition-opacity duration-200",
          show ? "opacity-100" : "opacity-0",
        )}
        onClick={onClose}
      />
      <div
        className={cn(
          "relative flex flex-col border-line bg-panel shadow-pop transition-transform duration-300 ease-out",
          desktop
            ? "h-full w-full max-w-md border-l"
            : "max-h-[90dvh] w-full max-w-lg rounded-t-3xl border-t",
          show && drag === 0 ? "translate-x-0 translate-y-0" : !show ? hidden : "",
          className,
        )}
        style={drag ? { transform: `translateY(${drag}px)` } : undefined}
        onTouchStart={
          desktop
            ? undefined
            : (e) => {
                startY.current = e.touches[0].clientY;
              }
        }
        onTouchMove={
          desktop
            ? undefined
            : (e) => {
                if (startY.current == null) return;
                const d = e.touches[0].clientY - startY.current;
                if (d > 0) setDrag(d);
              }
        }
        onTouchEnd={
          desktop
            ? undefined
            : () => {
                if (drag > 130) onClose();
                setDrag(0);
                startY.current = null;
              }
        }
      >
        <div className="relative flex items-center justify-between gap-3 border-b border-line px-4 py-3 safe-top">
          {!desktop && (
            <div className="absolute left-1/2 top-1.5 h-1 w-10 -translate-x-1/2 rounded-full bg-white/15" />
          )}
          <div className="min-w-0 truncate text-sm font-semibold text-ink">{title}</div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted hover:bg-surface"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="scroll-touch flex-1 overflow-y-auto p-4 pb-[max(env(safe-area-inset-bottom),16px)]">
          {children}
        </div>
      </div>
    </div>
  );
}
