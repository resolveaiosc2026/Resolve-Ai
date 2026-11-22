import Link from "next/link";
import { UsageChart } from "../../components/landing/UsageChart";
import { SIGN_IN_HREF, WORKBENCH_HREF } from "../../components/landing/links";

/*
 * Every figure on this page comes from the synthetic pilot dataset in frontend/data,
 * as computed by lib/analytics.ts (run RUN-2026-10-28-01).
 */

const SCORE = [
  { label: "Usage drop", value: "−69%", points: 40, max: 40 },
  { label: "Value tier", value: "High", points: 18, max: 18 },
  { label: "Tenure", value: "38 months", points: 13, max: 15 },
  { label: "Days inactive", value: "22", points: 10, max: 12 },
  { label: "Care contacts", value: "2", points: 6, max: 8 },
];

const RULES = [
  {
    title: "The numbers come from rules.",
    body: "Scores, offers and outcomes are calculated the same way every time. The language model only sorts free-text replies into six fixed reasons. If it is unavailable, a keyword matcher takes over.",
  },
  {
    title: "Resolve AI never messages customers.",
    body: "Questions and offers are handed to channels Orange already runs: SMS, USSD, call centre and field agents. In this pilot those channels are simulated.",
  },
  {
    title: "Someone signs off on every offer.",
    body: "No approval, no hand-off. Analysts can also overrule any reason the model suggests.",
  },
  {
    title: "Everything here is synthetic.",
    body: "45 made-up cases, masked numbers and prices in USD and LRD. No real subscriber data is used anywhere.",
  },
];

export default function LandingPage() {
  return (
    <main id="main">
      <section className="lp-hero">
        <div className="lp-container lp-hero-grid">
          <div className="lp-hero-copy">
            <p className="lp-kicker">Retention workbench for data bundles</p>
            <h1 className="lp-h1">
              This customer bought 18 bundles a month. <span>Now it&apos;s 6.</span>
            </h1>
            <p className="lp-lead">
              Resolve AI spots drops like this one, works out the reason, suggests an offer and later checks
              whether it helped. A person approves every offer before anything reaches the customer.
            </p>
            <div className="lp-actions">
              <Link href={WORKBENCH_HREF} className="lp-btn" data-variant="primary">
                Open the workbench
              </Link>
              <a href="#case" className="lp-link">
                Follow this case ↓
              </a>
            </div>
          </div>
          <UsageChart />
        </div>
      </section>

      <section id="case" className="lp-case">
        <div className="lp-container">
          <header className="lp-case-head">
            <h2 className="lp-h2">What happens next, step by step</h2>
            <p>
              Case LR-20417 is a high-value reseller in Sinkor. These are the six steps Resolve AI takes, with
              the real output from each one.
            </p>
          </header>

          <ol className="lp-steps">
            <li className="lp-step">
              <div className="lp-step-name">
                <span className="lp-step-n">01</span>
                <h3>Detect</h3>
              </div>
              <div className="lp-step-text">
                <p>
                  The drop is measured against the customer&apos;s own history. Five factors add up to the
                  priority score, and each shows its points.
                </p>
                <p>LR-20417 scores 87, the highest of the 45 cases in review.</p>
              </div>
              <div className="lp-artifact lp-score-card">
                <table className="lp-ledger">
                  <caption>Priority score</caption>
                  <tbody>
                    {SCORE.map((item) => (
                      <tr key={item.label}>
                        <th scope="row">{item.label}</th>
                        <td>{item.value}</td>
                        <td className="lp-pts">
                          {item.points}
                          <small>/{item.max}</small>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th scope="row">Total</th>
                      <td>high</td>
                      <td className="lp-pts">87</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </li>

            <li className="lp-step">
              <div className="lp-step-name">
                <span className="lp-step-n">02</span>
                <h3>Understand</h3>
              </div>
              <div className="lp-step-text">
                <p>
                  No failed activations or outage in Sinkor explain the drop, so Resolve AI handed a question to
                  Orange&apos;s SMS channel. The reply was, &ldquo;Money hard this month. Buy small weekly.&rdquo;
                </p>
                <p>
                  The model mapped it to affordability at 0.86 confidence, and analyst.hui confirmed the reason.
                </p>
              </div>
            </li>

            <li className="lp-step">
              <div className="lp-step-name">
                <span className="lp-step-n">03</span>
                <h3>Recommend</h3>
              </div>
              <div className="lp-step-text">
                <p>
                  For affordability, eligible daily_mini_600 ($0.60) is recommended, with an estimated 62%
                  recovery rate. monthly_mini_2g is the runner-up at 41%.
                </p>
                <p>Price-match and call-centre offers are ruled out because required evidence is missing.</p>
              </div>
            </li>

            <li className="lp-step">
              <div className="lp-step-name">
                <span className="lp-step-n">04</span>
                <h3>Act</h3>
              </div>
              <div className="lp-step-text">
                <p>
                  Nothing goes to Orange&apos;s systems until a manager approves it. Approvals and rejections are
                  both kept with the reviewer, time and a note.
                </p>
              </div>
              <div className="lp-approval-actions" aria-hidden="true">
                <span data-kind="approve">Approve</span>
                <span data-kind="reject">Reject</span>
              </div>
            </li>

            <li className="lp-step">
              <div className="lp-step-name">
                <span className="lp-step-n">05</span>
                <h3>Measure</h3>
              </div>
              <div className="lp-step-text">
                <p>
                  Usage is compared with the customer&apos;s baseline over a 30-day window. LR-20417 has not
                  reached that point yet, so the report also includes a case that has.
                </p>
                <p>
                  LR-10168 reported slow network and got a call-centre bridge. Thirty days later usage was still
                  67% below baseline: not recovered.
                </p>
              </div>
            </li>

            <li className="lp-step">
              <div className="lp-step-name">
                <span className="lp-step-n">06</span>
                <h3>Report</h3>
              </div>
              <div className="lp-step-text">
                <p>The report shows why customers drifted, who was contacted, what was offered and what came of it.</p>
                <p>
                  Two of six treated customers and two of eight controls recovered. Their confidence intervals
                  overlap, so this small pilot does not show that the offers work.
                </p>
              </div>
            </li>
          </ol>
        </div>
      </section>

      <section id="rules" className="lp-rules">
        <div className="lp-container">
          <h2 className="lp-h2">Ground rules</h2>
          <ol className="lp-rule-list">
            {RULES.map((rule, index) => (
              <li key={rule.title}>
                <span className="lp-rule-n">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <h3>{rule.title}</h3>
                  <p>{rule.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="lp-close">
        <div className="lp-container">
          <Link href={WORKBENCH_HREF} className="lp-close-link">
            Open the workbench <span aria-hidden="true">→</span>
          </Link>
          <p>
            LR-20417 is at the top of the queue. <Link href={SIGN_IN_HREF}>Sign in</Link> to pick up where the
            case left off.
          </p>
        </div>
      </section>
    </main>
  );
}
