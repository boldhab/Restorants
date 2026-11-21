import Link from 'next/link';
import {
  MarketingFooter,
  MarketingHeader,
  MarketingInvitation,
} from '../features/marketing/site-shell';

const features = [
  {
    symbol: '◈',
    title: 'Your menu. Your identity.',
    text: 'Create your menu, shape your restaurant website and publish when you’re ready. Give guests a clear path from browsing to ordering.',
  },
  {
    symbol: '≋',
    title: 'Keep service moving.',
    text: 'Bring orders, kitchen preparation, tables and the POS into one workspace so your team can stay focused on the next guest.',
  },
  {
    symbol: '◎',
    title: 'See the whole picture.',
    text: 'Manage stock, staff access and operational reports alongside your daily service. Keep the details close to the decisions.',
  },
];

export default function Home() {
  return (
    <div className="marketing-site">
      <MarketingHeader page="home" />
      <main id="main-content">
        <section className="marketing-hero" aria-labelledby="landing-title">
          <img
            className="marketing-hero-photo"
            src="/images/restaurant-atmosphere.webp"
            alt=""
            width={1536}
            height={1024}
            fetchPriority="high"
          />
          <div className="marketing-hero-content">
            <p className="eyebrow">A NEW FOUNDATION FOR HOSPITALITY</p>
            <h1 id="landing-title">
              Good food brings
              <br />
              people together.
              <br />
              <em>We bring the rest.</em>
            </h1>
            <p>
              A thoughtful workspace for your restaurant, your team,
              <br className="desktop-break" /> and everything you’re building together.
            </p>
            <div className="marketing-hero-actions">
              <Link className="primary" href="/register">
                Start your restaurant’s next chapter
              </Link>
              <Link className="marketing-light-link" href="/#features">
                Explore the workspace
              </Link>
            </div>
          </div>
          <div className="marketing-hero-caption">
            <span>YOUR RESTAURANT. CONNECTED.</span>
            <span>From the first menu to the last table.</span>
          </div>
        </section>
        <section className="marketing-introduction" id="features">
          <div>
            <p className="eyebrow">BUILT AROUND YOUR DAY</p>
            <h2>
              Less switching.
              <br />
              <em>More hospitality.</em>
            </h2>
          </div>
          <p>
            A restaurant is more than its menu. It’s the people, the pace and the small details that
            make every visit feel right. ZAYQORA brings those moving parts into one place, so you
            can give your attention to what matters.
          </p>
        </section>
        <section className="marketing-features" aria-label="Inside your workspace">
          {features.map((feature) => (
            <article key={feature.title}>
              <span className="marketing-feature-symbol" aria-hidden="true">
                {feature.symbol}
              </span>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </article>
          ))}
        </section>
        <section className="marketing-story-preview">
          <img
            src="/images/restaurant-atmosphere.webp"
            alt="Illustrative dining room with thoughtfully set tables and warm window light"
            width={1536}
            height={1024}
            loading="lazy"
          />
          <div>
            <p className="eyebrow">THE PEOPLE BEHIND THE PLATES</p>
            <h2>
              Built for the space
              <br />
              behind your restaurant.
            </h2>
            <p>
              Great hospitality starts long before a guest takes a seat. We’re building a clearer,
              calmer home for the work that makes it possible.
            </p>
            <Link className="button-outline" href="/about">
              Get to know ZAYQORA
            </Link>
          </div>
        </section>
        <MarketingInvitation />
      </main>
      <MarketingFooter />
    </div>
  );
}
