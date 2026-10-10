import clsx from "clsx";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

const buttonBase =
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--radius-control)] font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0";

const buttonVariant: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-ink hover:bg-accent/85",
  secondary: "border border-line-strong bg-surface text-ink hover:bg-surface-2",
  ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink",
  danger: "border border-line-strong bg-surface text-crit hover:bg-crit-bg",
};

const buttonSize: Record<ButtonSize, string> = {
  sm: "h-7 px-3 text-[12.5px]",
  md: "h-9 px-4 text-[13px]",
};

export function buttonClass(variant: ButtonVariant = "secondary", size: ButtonSize = "md", className?: string) {
  return clsx(buttonBase, buttonVariant[variant], buttonSize[size], className);
}

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

export function Card({ className, ...props }: ComponentProps<"section">) {
  // min-w-0: inside a grid, a wide table scrolls within the card instead of widening the page.
  return <section className={clsx("card-surface min-w-0 rounded-lg border bg-surface", className)} {...props} />;
}

export function CardHeader({
  title,
  description,
  actions,
  icon,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Shown in an orb before the title. */
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <header className={clsx("flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-4 py-3", className)}>
      <div className="flex min-w-0 flex-1 basis-56 items-center gap-3">
        {icon && <Orb size="sm">{icon}</Orb>}
        <div className="min-w-0">
          <h2 className="card-title text-[13.5px] font-semibold text-ink">{title}</h2>
          {description && <p className="mt-0.5 text-[12.5px] leading-snug text-ink-3">{description}</p>}
        </div>
      </div>
      {actions && <div className="ml-auto flex max-w-full shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

// ---------- rfentity-style icon pieces ----------

const ORB_SIZE = { sm: "size-9 text-[12px] [&_svg]:size-4", md: "size-11 text-[14px] [&_svg]:size-[18px]", lg: "size-14 text-[17px] [&_svg]:size-6" };

/** Round, sphere-shaded badge holding an icon or a step number ("01"). */
export function Orb({
  children,
  size = "md",
  tone,
  className,
}: {
  children: ReactNode;
  size?: keyof typeof ORB_SIZE;
  /** Colour of the icon; the brand colour by default. */
  tone?: "crit" | "high" | "med" | "ok" | "ink";
  className?: string;
}) {
  const color = tone ? { crit: "text-crit", high: "text-high", med: "text-med", ok: "text-ok", ink: "text-ink" }[tone] : undefined;
  return (
    <span aria-hidden className={clsx("orb", ORB_SIZE[size], color, className)}>
      {children}
    </span>
  );
}

/** Two-digit step number in an orb, as in "01 Choose your car". */
export const StepOrb = ({ n, size = "md" }: { n: number; size?: keyof typeof ORB_SIZE }) => (
  <Orb size={size}>{String(n).padStart(2, "0")}</Orb>
);

/** Floating round button for a card corner; an arrow unless children say otherwise. */
export function FloatLink({ href, label, children, className }: { href: string; label: string; children?: ReactNode; className?: string }) {
  return (
    <Link href={href} aria-label={label} title={label} className={clsx("float-btn size-9 [&_svg]:size-4", className)}>
      {children ?? <ArrowRight />}
    </Link>
  );
}

/** "• 13 Critical": status pill with a dot, in the given colour. */
export function DotPill({ children, tone = "brand", className }: { children: ReactNode; tone?: "brand" | "crit" | "high" | "ok" | "ink"; className?: string }) {
  const color = { brand: "text-[var(--brand)]", crit: "text-crit", high: "text-high", ok: "text-ok", ink: "text-ink-2" }[tone];
  return <span className={clsx("dot-pill", color, className)}>{children}</span>;
}

/** Glass stat card: icon orb, figure, label and an optional arrow to the detail. */
export function StatCard({
  icon,
  tone,
  label,
  value,
  sub,
  href,
  hrefLabel,
}: {
  icon: ReactNode;
  tone?: "crit" | "high" | "med" | "ok" | "ink";
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  href?: string;
  hrefLabel?: string;
}) {
  return (
    <Card className="relative flex flex-col gap-3 p-5">
      <div className="flex items-start justify-between gap-3">
        <Orb tone={tone}>{icon}</Orb>
        {href && <FloatLink href={href} label={hrefLabel ?? `Open ${typeof label === "string" ? label : "details"}`} />}
      </div>
      <div>
        <div className="eyebrow text-[12px]">{label}</div>
        <div className="tabular mt-1 font-[family-name:var(--font-heading)] text-[30px] font-bold leading-none tracking-[-0.02em] text-ink">{value}</div>
        {sub && <div className="mt-2 text-[12.5px] leading-snug text-ink-3">{sub}</div>}
      </div>
    </Card>
  );
}

/** "Brand profile" -> "Brand <em>profile</em>": the last word takes the theme's brand colour. */
function accentLast(title: ReactNode): ReactNode {
  if (typeof title !== "string") return title;
  const i = title.trim().lastIndexOf(" ");
  if (i < 0) return title;
  return (
    <>
      {title.slice(0, i + 1)}
      <em>{title.slice(i + 1)}</em>
    </>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 flex-1 basis-72">
        {eyebrow && <div className="eyebrow mb-2 text-[12.5px]">{eyebrow}</div>}
        <h1 className="page-title text-ink">{accentLast(title)}</h1>
        {description && <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:pt-0.5">{actions}</div>}
    </div>
  );
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={clsx("mb-1.5 block text-[12.5px] font-medium text-ink", className)} {...props} />;
}

export function Hint({ error, children }: { error?: boolean; children: ReactNode }) {
  return <p className={clsx("mt-1.5 text-[12px]", error ? "text-crit" : "text-ink-3")}>{children}</p>;
}

const fieldBase =
  "h-8 rounded-md border bg-surface px-2.5 text-[13px] text-ink placeholder:text-ink-3 outline-none transition-colors focus:border-accent";

/** Fields fill their container unless the caller sets a width. */
const widthOf = (className?: string) => (/(^|\s)(w-|min-w-)/.test(className ?? "") ? undefined : "w-full");

export function Input({ className, invalid, ...props }: ComponentProps<"input"> & { invalid?: boolean }) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={clsx(fieldBase, widthOf(className), invalid ? "border-crit" : "border-line-strong", className)}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={clsx(fieldBase, "h-auto min-h-20 w-full py-2 leading-relaxed border-line-strong", className)}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={clsx(
        fieldBase,
        widthOf(className),
        "appearance-none border-line-strong bg-[length:12px] bg-[right_8px_center] bg-no-repeat pr-7",
        "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12' fill='none' stroke='%2385857e' stroke-width='1.5'%3E%3Cpath d='M3 4.5l3 3 3-3'/%3E%3C/svg%3E\")]",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; count?: number }[];
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex h-9 max-w-full items-center overflow-x-auto rounded-[var(--radius-control)] border border-line-strong bg-surface-2 p-0.5 [scrollbar-width:none]"
    >
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            "flex h-full shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-control)] px-3 text-[12.5px] font-medium transition-colors",
            value === o.value ? "bg-surface text-ink shadow-[0_0_0_1px_var(--border)]" : "text-ink-2 hover:text-ink",
          )}
        >
          {o.label}
          {o.count !== undefined && <span className="tabular text-ink-3">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={clsx(
        "chip inline-flex h-5 items-center rounded-[var(--radius-control)] border border-line bg-surface-2 px-2 text-[11.5px] font-medium text-ink-2",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={clsx("font-mono text-[12px]", className)}>{children}</span>;
}

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <Orb size="lg" className="mb-4">
        {icon}
      </Orb>
      <p className="text-[13.5px] font-medium text-ink">{title}</p>
      {children && <div className="mt-1 max-w-sm text-[12.5px] text-ink-3">{children}</div>}
    </div>
  );
}

export function KeyValue({ items }: { items: { k: ReactNode; v: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-[minmax(110px,max-content)_1fr] gap-x-6 gap-y-2.5 text-[13px]">
      {items.map((it, i) => (
        <div key={i} className="contents">
          <dt className="text-ink-3">{it.k}</dt>
          <dd className="min-w-0 break-words text-ink">{it.v}</dd>
        </div>
      ))}
    </dl>
  );
}
