"use client";

import { LoaderCircle, Lock } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, onUnlockRequest, setAdminKey } from "@/lib/api";
import { Button, Hint, Input, Label } from "./ui";

/**
 * Asks for the admin password when an action that changes data is refused (401),
 * then the request is retried. The password is kept in this browser only.
 */
export function UnlockDialog() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const settle = useRef<((ok: boolean) => void) | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    onUnlockRequest(
      () =>
        new Promise<boolean>((resolve) => {
          settle.current = resolve;
          setValue("");
          setError(null);
          setOpen(true);
        }),
    );
    return () => onUnlockRequest(null);
  }, []);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  function close(ok: boolean) {
    setOpen(false);
    settle.current?.(ok);
    settle.current = null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!value) return setError("Enter the password");
    setChecking(true);
    const ok = await api.checkAdminKey(value).catch(() => false);
    setChecking(false);
    if (!ok) return setError("Wrong password");
    setAdminKey(value);
    close(true);
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onMouseDown={() => close(false)}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="unlock-title"
        onSubmit={submit}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === "Escape" && close(false)}
        className="w-full max-w-sm rounded-lg border border-line bg-surface p-5 shadow-lg"
      >
        <div className="mb-3 flex items-center gap-2">
          <Lock className="size-4 text-ink-3" />
          <h2 id="unlock-title" className="text-[14px] font-semibold">
            Admin password needed
          </h2>
        </div>
        <p className="mb-4 text-[13px] leading-relaxed text-ink-2">
          Changing brands, verdicts or sources is limited to the team. Browsing, Quick check and scans stay open to everyone.
        </p>
        <Label htmlFor="admin-key">Password</Label>
        <Input
          ref={input}
          id="admin-key"
          type="password"
          autoComplete="current-password"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          invalid={!!error}
        />
        {error && <Hint error>{error}</Hint>}
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={checking}>
            {checking && <LoaderCircle className="animate-spin" />}
            Unlock
          </Button>
        </div>
      </form>
    </div>
  );
}
