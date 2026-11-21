'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Children, useEffect, useId, useRef, useState, type ReactNode } from 'react';

export function NavigationLink({ href, children }: { href: string; children: ReactNode }) {
  const pathname = usePathname();
  return (
    <Link href={href} aria-current={!href.includes('#') && pathname === href ? 'page' : undefined}>
      {children}
    </Link>
  );
}

export function NavigationBar({
  children,
  context,
  actions,
  brand,
  label = 'Page navigation',
  className = '',
}: {
  children: ReactNode;
  context?: ReactNode;
  actions?: ReactNode;
  brand?: ReactNode;
  label?: string;
  className?: string;
}) {
  const pathname = usePathname();
  const [expandedPath, setExpandedPath] = useState<string | null>(null);
  const open = expandedPath === pathname;
  const navigationId = useId();
  const toggle = useRef<HTMLButtonElement>(null);
  function close() {
    setExpandedPath(null);
  }
  return (
    <header
      className={`navigation-bar ${className}`}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          close();
          toggle.current?.focus();
        }
      }}
    >
      <div className="navigation-identity">
        {brand || (
          <Link className="wordmark" href="/">
            zayqora<span aria-hidden="true">✳</span>
          </Link>
        )}
        {context && <span className="navigation-context">{context}</span>}
      </div>
      <nav
        id={navigationId}
        aria-label={label}
        data-open={open}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('a')) close();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            close();
            toggle.current?.focus();
          }
        }}
      >
        {children}
      </nav>
      {actions && <div className="navigation-actions">{actions}</div>}
      <button
        ref={toggle}
        className="navigation-toggle"
        aria-label={open ? 'Close navigation' : 'Open navigation'}
        aria-expanded={open}
        aria-controls={navigationId}
        onClick={() => setExpandedPath(open ? null : pathname)}
      >
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          aria-hidden="true"
        >
          {open ? <path d="m6 6 12 12M6 18 18 6" /> : <path d="M4 6h16M4 12h16M4 18h16" />}
        </svg>
        <span>Menu</span>
      </button>
    </header>
  );
}

// These routes have no contextual page header of their own.
export function UtilityNavigation() {
  const pathname = usePathname();
  const auth = [
    '/login',
    '/register',
    '/forgot-password',
    '/reset-password',
    '/verify-email',
  ].includes(pathname);
  const context =
    pathname === '/onboarding'
      ? 'Restaurant setup'
      : pathname === '/customer/history'
        ? 'Customer history'
        : pathname === '/platform'
          ? 'Platform controls'
          : pathname === '/staff-invitation'
            ? 'Staff invitation'
            : pathname.startsWith('/table/')
              ? 'Table service'
              : pathname.startsWith('/review/')
                ? 'Your review'
                : null;
  if (!auth && !context) return null;
  return (
    <NavigationBar
      className="utility-navigation"
      context={context}
      label="ZAYQORA navigation"
      actions={
        auth ? (
          <Link className="primary" href={pathname === '/register' ? '/login' : '/register'}>
            {pathname === '/register' ? 'Sign in' : 'Create account'}
          </Link>
        ) : undefined
      }
    >
      <NavigationLink href="/">Home</NavigationLink>
      <NavigationLink href="/about">About us</NavigationLink>
      {!auth && <NavigationLink href="/restaurants">Workspaces</NavigationLink>}
    </NavigationBar>
  );
}

export function SectionNavigation({
  children,
  label,
  current,
}: {
  children: ReactNode;
  label: string;
  current: string;
}) {
  const navigation = useRef<HTMLElement>(null);
  const count = Children.count(children);
  useEffect(() => {
    const element = navigation.current;
    const active = element?.querySelector<HTMLElement>(
      '[aria-current="page"], [aria-pressed="true"]'
    );
    if (!element || !active) return;
    const position = () => {
      const target = active.getBoundingClientRect(),
        container = element.getBoundingClientRect();
      element.scrollLeft += target.left - container.left - (element.clientWidth - target.width) / 2;
    };
    const observer = new ResizeObserver(position);
    observer.observe(element);
    return () => observer.disconnect();
  }, [current, count]);
  return (
    <nav ref={navigation} className="editor-tabs section-navigation" aria-label={label}>
      {children}
    </nav>
  );
}
