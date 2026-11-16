import Link from 'next/link';
export default function NotFound() {
  return (
    <main className="center">
      <h1>A little off the menu.</h1>
      <p>This page could not be found.</p>
      <Link href="/restaurants">Back to your restaurants →</Link>
    </main>
  );
}
