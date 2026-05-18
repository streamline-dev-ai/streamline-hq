import { useEffect, useRef, useState } from "react";

/**
 * Keeps a component mounted through its exit transition.
 * `mounted` controls render; `show` toggles the active (visible) classes.
 */
export function useMountTransition(open: boolean, duration = 240) {
  const [mounted, setMounted] = useState(open);
  const [show, setShow] = useState(open);
  const raf = useRef<number | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (raf.current) cancelAnimationFrame(raf.current);
    if (timer.current) window.clearTimeout(timer.current);

    if (open) {
      setMounted(true);
      raf.current = requestAnimationFrame(() =>
        requestAnimationFrame(() => setShow(true)),
      );
    } else {
      setShow(false);
      timer.current = window.setTimeout(() => setMounted(false), duration);
    }
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [open, duration]);

  return { mounted, show };
}

/** Esc to close + body scroll lock while open. */
export function useDismissable(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
}
