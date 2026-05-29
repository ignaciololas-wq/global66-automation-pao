'use client';
import { useRouter } from 'next/navigation';
import type { ReactNode, KeyboardEvent } from 'react';

export function ClickableRow({ href, children, className = '' }: { href: string; children: ReactNode; className?: string }) {
  const router = useRouter();
  function onKey(e: KeyboardEvent<HTMLTableRowElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      router.push(href);
    }
  }
  return (
    <tr
      role="link"
      tabIndex={0}
      onClick={() => router.push(href)}
      onKeyDown={onKey}
      className={`cursor-pointer border-t border-border hover:bg-brand-50/50 transition ${className}`}
    >
      {children}
    </tr>
  );
}
