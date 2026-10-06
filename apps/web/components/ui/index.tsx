import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const buttonStyles: Record<ButtonVariant, string> = {
  primary: "bg-indigo-600 text-white hover:bg-indigo-500",
  secondary: "border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50",
  ghost: "text-neutral-600 hover:bg-neutral-100",
  danger: "text-red-700 hover:bg-red-50",
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: "sm" | "md" }) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        "inline-flex items-center justify-center rounded-lg font-medium transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600",
        "disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "px-2.5 py-1 text-sm" : "px-4 py-2 text-sm",
        buttonStyles[variant],
        className,
      )}
    />
  );
}

const fieldStyle =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 " +
  "focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(fieldStyle, className)} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className={cx(fieldStyle, className)} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(fieldStyle, className)} />;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-neutral-700">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-neutral-500">{hint}</span> : null}
    </label>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("rounded-xl border border-neutral-200 bg-white p-5", className)}>{children}</div>;
}

export function ProgressBar({ percent, label }: { percent: number; label: string }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className="h-2 w-full overflow-hidden rounded-full bg-neutral-100"
    >
      <div className="h-full rounded-full bg-indigo-500 transition-[width] duration-500" style={{ width: `${percent}%` }} />
    </div>
  );
}

const badgeTones = {
  neutral: "bg-neutral-100 text-neutral-700",
  indigo: "bg-indigo-50 text-indigo-700",
  amber: "bg-amber-50 text-amber-800",
  red: "bg-red-50 text-red-700",
  green: "bg-emerald-50 text-emerald-700",
};

export function Badge({ tone = "neutral", children }: { tone?: keyof typeof badgeTones; children: ReactNode }) {
  return (
    <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", badgeTones[tone])}>
      {children}
    </span>
  );
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
      {message}
    </p>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-neutral-300 px-6 py-10 text-center">
      <p className="font-medium text-neutral-800">{title}</p>
      {children ? <div className="mt-2 text-sm text-neutral-500">{children}</div> : null}
    </div>
  );
}
