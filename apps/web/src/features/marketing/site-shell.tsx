import Link from 'next/link';
import { NavigationBar } from '../navigation/navigation-bar';

export function MarketingHeader({ page }: { page: 'home' | 'about' }) {
  return (
    <>
      <a className="site-skip-link" href="#main-content">
        Skip to content
      </a>
      <NavigationBar
        className="marketing-header"
        label="Main navigation"
        brand={
          <Link className="wordmark" href="/" aria-label="ZAYQORA home">
            zayqora<span aria-hidden="true">✳</span>
          </Link>
        }
        actions={
          <div className="marketing-header-actions">
            <Link href="/login">Sign in</Link>
            <Link className="primary" href="/register">
              Get started
            </Link>
          </div>
        }
      >
        <Link href="/" aria-current={page === 'home' ? 'page' : undefined}>
          Home
        </Link>
        <Link href="/#features">The workspace</Link>
        <Link href="/about" aria-current={page === 'about' ? 'page' : undefined}>
          About us
        </Link>
      </NavigationBar>
    </>
  );
}

export function MarketingFooter() {
  return (
    <footer className="marketing-footer">
      <div className="marketing-footer-main">
        <div>
          <Link className="wordmark" href="/">
            zayqora<span aria-hidden="true">✳</span>
          </Link>
          <p>
            A thoughtful workspace for the people
            <br />
            behind great hospitality.
          </p>
        </div>
        <nav aria-label="Explore ZAYQORA">
          <h2>Explore</h2>
          <Link href="/">Home</Link>
          <Link href="/#features">The workspace</Link>
          <Link href="/about">About us</Link>
        </nav>
        <nav aria-label="Your workspace">
          <h2>Your next chapter</h2>
          <Link href="/register">Create your restaurant</Link>
          <Link href="/login">Sign in to your workspace</Link>
        </nav>
      </div>
      <div className="marketing-footer-bottom">
        <small>© {new Date().getFullYear()} ZAYQORA</small>
        <small>YOUR PEOPLE. YOUR PLACES. YOUR POSSIBILITIES.</small>
      </div>
    </footer>
  );
}

export function MarketingInvitation() {
  return (
    <section className="marketing-invitation">
      <div>
        <p className="eyebrow">LET’S BUILD WHAT’S NEXT</p>
        <h2>
          Your next chapter
          <br />
          starts here.
        </h2>
        <p>Bring your restaurant, your team and your ideas together.</p>
      </div>
      <Link className="primary" href="/register">
        Create your restaurant
      </Link>
    </section>
  );
}
