import {
  MarketingFooter,
  MarketingHeader,
  MarketingInvitation,
} from '../../features/marketing/site-shell';

export const metadata = {
  title: 'About ZAYQORA',
  description: 'A thoughtful workspace for the people behind great hospitality.',
};

export default function About() {
  return (
    <div className="marketing-site">
      <MarketingHeader page="about" />
      <main id="main-content">
        <section className="marketing-about-hero">
          <div>
            <p className="eyebrow">ABOUT ZAYQORA</p>
            <h1>
              Hospitality at heart.
              <br />
              <em>Clarity at work.</em>
            </h1>
            <p>For the people who turn a place to eat into a place to belong.</p>
          </div>
          <img
            src="/images/restaurant-atmosphere.webp"
            alt="Illustrative restaurant interior with warm lighting and tables ready to welcome guests"
            width={1536}
            height={1024}
            fetchPriority="high"
          />
        </section>
        <section className="marketing-about-story">
          <p className="eyebrow">WHY WE’RE BUILDING THIS</p>
          <h2>
            Good service takes
            <br />
            more than good food.
          </h2>
          <div>
            <p>
              Behind every restaurant is a team balancing menus, orders, tables, stock and the next
              service. That work deserves a workspace that feels connected and clear.
            </p>
            <p>
              ZAYQORA brings your restaurant website and daily operations together: a place to
              prepare your menu, manage service and keep the details in view. Our focus is
              practical: help the people behind hospitality spend less time piecing things together.
            </p>
          </div>
        </section>
        <section className="marketing-principles" aria-label="Our approach">
          <article>
            <h3>People come first.</h3>
            <p>
              Tools should support the team doing the work, with clear information and a
              straightforward path to the next task.
            </p>
          </article>
          <article>
            <h3>Make room for your identity.</h3>
            <p>
              Your restaurant has its own story. Its menu, website and guest experience should have
              space to reflect it.
            </p>
          </article>
          <article>
            <h3>Keep the work connected.</h3>
            <p>
              From a published dish to a kitchen order, the details belong together. One workspace
              helps keep that context close.
            </p>
          </article>
        </section>
        <MarketingInvitation />
      </main>
      <MarketingFooter />
    </div>
  );
}
