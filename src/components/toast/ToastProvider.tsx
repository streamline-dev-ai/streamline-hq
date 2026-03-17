import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastType = "success" | "error" | "info";

type ToastItem = {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
};

type ToastInput = Omit<ToastItem, "id">;

type ToastContextValue = {
  pushToast: (toast: ToastInput) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

function iconFor(type: ToastType) {
  if (type === "success") return CheckCircle2;
  if (type === "error") return AlertTriangle;
  return Info;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const pushToast = useCallback((toast: ToastInput) => {
    const id = crypto.randomUUID();
    const item: ToastItem = { ...toast, id };
    setToasts((prev) => [item, ...prev].slice(0, 4));
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  }, []);

  const value = useMemo<ToastContextValue>(() => ({ pushToast }), [pushToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed top-16 z-50 w-full px-4 sm:right-4 sm:top-4 sm:w-auto sm:max-w-sm sm:px-0">
        <div className="mx-auto flex max-w-md flex-col gap-2 sm:mx-0 sm:max-w-sm">
          {toasts.map((t) => {
            const Icon = iconFor(t.type);
            return (
              <div
                key={t.id}
                className={cn(
                  "pointer-events-auto rounded-2xl border border-border bg-panel/95 p-3 shadow-lg backdrop-blur",
                  t.type === "success" && "border-emerald-500/30",
                  t.type === "error" && "border-orange/40",
                  t.type === "info" && "border-purple/30",
                )}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl",
                      t.type === "success" && "bg-emerald-500/15 text-emerald-300",
                      t.type === "error" && "bg-orange/15 text-orange",
                      t.type === "info" && "bg-purple/15 text-purple",
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    {t.title ? <div className="text-sm font-semibold">{t.title}</div> : null}
                    <div className="mt-0.5 text-sm text-zinc-300">{t.message}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

