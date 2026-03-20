import { cn } from "@/lib/utils";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "purple" | "orange" | "blue" | "zinc" | "emerald" | "teal";
  className?: string;
}

export default function Badge({ children, variant = "default", className }: BadgeProps) {
  const variants = {
    default: "bg-white/10 text-zinc-300",
    purple: "bg-purple/20 text-purple border border-purple/20",
    orange: "bg-orange/20 text-orange border border-orange/20",
    blue: "bg-blue-500/20 text-blue-400 border border-blue-500/20",
    zinc: "bg-zinc-500/20 text-zinc-400 border border-zinc-500/20",
    emerald: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/20",
    teal: "bg-teal-500/20 text-teal-400 border border-teal-500/20",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium leading-none",
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
