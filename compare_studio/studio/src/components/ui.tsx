// shadcn-flavoured primitives, hand-written so the app carries no component
// framework beyond Radix Tabs (which is here for real keyboard semantics).
import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "../lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "accent" | "outline";
  size?: "sm" | "md" | "lg";
};

const VARIANTS: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-terra text-surface-2 hover:bg-terra-bright shadow-2xs hover:shadow-xs disabled:bg-line-strong",
  secondary: "bg-surface-2 text-ink border border-line-strong hover:bg-surface hover:border-ink-dim shadow-2xs",
  ghost: "text-ink-soft hover:bg-surface-2 hover:text-ink",
  danger: "bg-surface-2 text-terra border border-terra/40 hover:bg-terra hover:text-surface-2",
  accent: "bg-gold text-ink font-black border border-gold/70 hover:bg-gold/90 shadow-xs",
  outline: "bg-transparent text-ink border border-line-strong hover:bg-surface-2 hover:border-ink-dim",
};

export function Button({ className, variant = "secondary", size = "md", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl font-bold transition-all duration-150 active:scale-[0.98]",
        "disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100",
        size === "lg" ? "h-12 px-5 text-sm" : size === "md" ? "h-10 px-4 text-xs" : "h-8 px-3 text-[11.5px]",
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Card({
  className,
  glass = false,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { glass?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-line transition-all duration-150",
        glass ? "glass-surface shadow-xs" : "bg-surface shadow-2xs",
        className,
      )}
      {...props}
    />
  );
}

export function Badge({
  tone = "neutral",
  dot = false,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "sage" | "gold" | "terra";
  dot?: boolean;
}) {
  const tones = {
    neutral: "bg-surface-2 text-ink-soft border-line-strong",
    sage: "bg-sage-bright/20 text-sage border-sage/40",
    gold: "bg-gold/25 text-ink-soft border-gold/60",
    terra: "bg-terra-bright/20 text-terra border-terra/40",
  } as const;

  const dotColors = {
    neutral: "bg-ink-dim",
    sage: "bg-sage pulse-emerald",
    gold: "bg-amber-500",
    terra: "bg-terra",
  } as const;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[11px] font-bold tracking-wide uppercase",
        tones[tone],
        className,
      )}
      {...props}
    >
      {dot && <span className={cn("size-1.5 rounded-full shrink-0", dotColors[tone])} />}
      {children}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-line/70", className)} />;
}

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn("inline-flex items-center gap-1 rounded-lg border border-line bg-surface-2 p-1", className)}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "cursor-pointer rounded-md px-3 py-1.5 text-sm font-semibold text-ink-dim transition-colors duration-150",
        "hover:text-ink data-[state=active]:bg-terra data-[state=active]:text-surface-2",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn("mt-4 focus-visible:outline-none", className)} {...props} />;
}
