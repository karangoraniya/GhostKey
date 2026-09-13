"use client";
import { useState, type ReactNode } from "react";

export type Tone = "neutral" | "success" | "warning" | "danger" | "muted";
export function StatusBadge({ children, tone = "neutral", pulse = false }: { children: ReactNode; tone?: Tone; pulse?: boolean }) {
  return <span className={`badge badge-${tone}${pulse ? " badge-pulse" : ""}`}><span className="status-dot" />{children}</span>;
}
export function Card({ title, subtitle, icon, aside, children, className = "", id }: {
  title: string; subtitle?: string; icon?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string; id?: string;
}) {
  return <section id={id} className={`panel ${className}`} aria-label={title}>
    <header className="panel-heading"><div className="flex min-w-0 items-center gap-3">{icon && <span className="panel-icon">{icon}</span>}<div><h2>{title}</h2>{subtitle && <p className="caption mt-1">{subtitle}</p>}</div></div>{aside}</header>
    <div className="panel-body">{children}</div>
  </section>;
}
export function Icon({ name, size = 18 }: { name: "agent" | "shield" | "key" | "activity" | "github" | "arrow" | "copy" | "ledger"; size?: number }) {
  const paths = {
    agent: <><path d="M8 3H4v4m12-4h4v4M4 17v4h4m12-4v4h-4" /><circle cx="12" cy="10" r="3" /><path d="M7 18v-1a5 5 0 0 1 10 0v1" /></>,
    shield: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" /><path d="m8 12 3 3 5-6" /></>,
    key: <><circle cx="8" cy="9" r="5" /><path d="m12 13 8 8m-5-5 3-3m-1 5 3-3" /></>,
    activity: <path d="M2 12h5l3-7 4 14 3-7h5" />,
    github: <><path d="M9 20c-5 2-5-3-7-3m14 5v-4a3 3 0 0 0-1-2c4 0 6-2 6-6 0-2-1-3-2-4 0-1 0-3-1-3l-4 2h-4L6 3C5 3 5 5 5 6c-1 1-2 2-2 4 0 4 2 6 6 6-1 1-1 2-1 3v3" /></>,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    copy: <><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M16 8V3H3v13h5" /></>,
    ledger: <><path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6M9 8v8h7" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
export function Identifier({ value, label = "identifier" }: { value: string; label?: string }) {
  const [feedback, setFeedback] = useState("");
  return <div className="identifier"><code title={value}>{value}</code><button type="button" className="icon-button" aria-label={`Copy ${label}`} title={feedback || `Copy ${label}`} onClick={async () => {
    try { await navigator.clipboard.writeText(value); setFeedback("Copied"); } catch { setFeedback("Copy unavailable; select the text"); }
    setTimeout(() => setFeedback(""), 2500);
  }}><Icon name="copy" size={14} /></button><span className="sr-only" role="status">{feedback}</span></div>;
}
export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return <div className="empty-state"><span className="empty-cross" aria-hidden="true">+</span><div><h3>{title}</h3><p>{children}</p></div></div>;
}
export function durationLabel(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}
export function countdown(expiresAt: string, now: number) {
  if (!now) return "—";
  const seconds = Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 1000));
  return seconds ? `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}` : "Expired";
}
export function localTime(value: string) { return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
