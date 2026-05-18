import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "subtle";
type Size = "sm" | "md" | "lg";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  block?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-brand text-white hover:brightness-110 shadow-glow disabled:shadow-none",
  secondary:
    "border border-line-strong bg-surface text-ink hover:bg-surface-hover",
  ghost: "text-ink-muted hover:bg-surface hover:text-ink",
  danger: "bg-danger text-white hover:brightness-110",
  subtle: "bg-brand-soft text-brand hover:bg-brand/20",
};

const SIZES: Record<Size, string> = {
  sm: "h-9 px-3 text-sm rounded-lg gap-1.5",
  md: "min-h-[44px] px-4 text-sm rounded-xl gap-2",
  lg: "min-h-[52px] px-5 text-base rounded-2xl gap-2",
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "primary", size = "md", loading, block, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center font-semibold transition active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-55",
        VARIANTS[variant],
        SIZES[size],
        block && "w-full",
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
});
