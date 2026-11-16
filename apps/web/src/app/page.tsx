import Link from 'next/link';
export default function Home() {
  return (
    <main className="landing">
      <header>
        <Link className="wordmark" href="/">
          zayqora<span>✳</span>
        </Link>
        <Link href="/login">Sign in ↗</Link>
      </header>
      <p className="eyebrow">A NEW FOUNDATION FOR HOSPITALITY</p>
      <h1>
        Good food brings
        <br />
        people together.
        <br />
        <em>We bring the rest.</em>
      </h1>
      <p className="muted">
        A thoughtful workspace for your restaurant, your team,
        <br />
        and everything you’re building together.
      </p>
      <Link className="primary" href="/register">
        Start your restaurant’s next chapter →
      </Link>
      <div className="landing-bottom">
        <span>YOUR PEOPLE. YOUR PLACES. YOUR POSSIBILITIES.</span>
        <span>✳</span>
      </div>
    </main>
  );
}
