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

const OFFERS = [
  { name: "Daily Mini 600 MB", price: "$0.60", recovery: "62%", status: "Recommended" },
  { name: "Monthly Mini 2 GB", price: "$1.80", recovery: "41%", status: "Runner-up" },
  { name: "Price-match offer", price: "", recovery: "", status: "Needs a pricing approval outside the pilot" },
  { name: "Call-centre bridge", price: "", recovery: "", status: "Needs a reported network fault" },
];

const REASONS = [
  { label: "Network quality", count: 10 },
  { label: "Affordability", count: 7 },
  { label: "Reduced need", count: 4 },
  { label: "Activation difficulty", count: 1 },
  { label: "Competitor", count: 1 },
];
const REASONS_TOTAL = REASONS.reduce((s, r) => s + r.count, 0);

const RULES = [
  {
    title: "The numbers come from rules.",
    body: "Scores, offers and outcomes are calculated the same way every time. The language model only sorts free-text replies into six fixed reasons and rewords answers it is handed. If it's unavailable, a keyword matcher takes over.",
  },
  {
    title: "Resolve AI never messages customers.",
    body: "Questions and offers go to channels Orange already runs: SMS, USSD, call centre, field agents. In this pilot those channels are simulated.",
  },
  {
    title: "Someone signs off on every offer.",
    body: "No approval, no hand-off. Analysts can also overrule any reason the model suggests.",
  },
  {
    title: "Only unknown reasons get a question.",
    body: "If the data already explains the drop, such as failed activations or an outage in the area, nobody is asked anything.",
  },
  {
    title: "It's a priority score.",
    body: "It ranks who to look at first. It doesn't claim to predict churn, and small samples are shown with their uncertainty.",
  },
  {
    title: "Everything here is synthetic.",
    body: "45 made-up cases, masked numbers, prices in USD and LRD. No real subscriber data is used anywhere.",
  },
];

export default function LandingPage() {
  return (
    <main id="main">
      {/* Hero ------------------------------------------------------------ */}
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

      {/* The case -------------------------------------------------------- */}
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
            {/* 01 Detect */}
            <li className="lp-step">
              <div className="lp-step-name">
                <span className="lp-step-n">01</span>
                <h3>Detect</h3>
              </div>
              <div className="lp-step-text">
                <p>
                  The drop is measured against the customer&apos;s own history. Then
                  five factors add up to a priority score, and each one shows its points.
                </p>
                <p>LR-20417 scores 87, the highest of the 45 cases in review.</p>
              </div>
              <div className="lp-artifact">
                <table className="lp-ledger">
                  <caption>Priority score</caption>
                  <tbody>
                    {SCORE.map((s) => (
                      <tr key={s.label}>
                        <th scope="row">{s.label}</th>
                        <td>{s.value}</td>
                        <td className="lp-pts">
                          {s.points}
                          <small>/{s.max}</small>
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

            {/* 02 Understand */}
            <li className="lp-step">
              <div className="lp-step-name">
                <span className="lp-step-n">02</span>
                <h3>Understand</h3>
              </div>
              <div className="lp-step-text">
                <p>
                  There were no failed activations and no outage in Sinkor, so the data couldn&apos;t explain
                  the drop. Resolve AI drafted one question and passed it to Orange&apos;s SMS channel.
                </p>
                <p>The reply is informal. The model maps it to one of six reasons, and an analyst confirmed it.</p>
              </div>
              <div className="lp-artifact">
                <div className="lp-sms">
                  <p className="lp-sms-out">
                    Orange: We noticed your bundle use dropped. Reply with one number: 1 Price 2 Network 3 Not
                    using much 4 Using another line 5 Something else
                  </p>
                  <p className="lp-sms-in">Money hard this month. Buy small weekly.</p>
                </div>
                <dl className="lp-result">
                  <div>
                    <dt>Reason</dt>
                    <dd>Affordability</dd>
                  </div>
                  <div>
                    <dt>Confidence</dt>
                    <dd>0.86</dd>
                  </div>
                  <div>
                    <dt>Checked by</dt>
                    <dd>analyst.hui</dd>
                  </div>
                </dl>
              </div>
            </li>

            {/* 03 Recommend */}
            <li className="lp-step">
              <div className="lp-step-name">
                <span className="lp-step-n">03</span>
                <h3>Recommend</h3>
              </div>
              <div className="lp-step-text">
                <p>
                  Money is the problem, so the suggestion is a smaller bundle the customer can buy day by day.
                  Every candidate goes through eligibility checks, and past campaigns give each one an
                  estimated recovery rate.
                </p>
                <p>Offers that don&apos;t fit are listed with the reason they were ruled out.</p>
              </div>
              <div className="lp-artifact">
                <table className="lp-offers">
                  <caption>Offers considered</caption>
                  <thead>
                    <tr>
                      <th scope="col">Offer</th>
                      <th scope="col">Price</th>
                      <th scope="col">Est. recovery</th>
                    </tr>
                  </thead>
                  <tbody>
                    {OFFERS.map((o) => (
                      <tr key={o.name} data-status={o.status === "Recommended" ? "pick" : o.price ? "alt" : "out"}>
                        <th scope="row">
                          {o.name}
                          <small>{o.status}</small>
                        </th>
                        <td>{o.price || "–"}</td>
                        <td>{o.recovery || "–"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </li>

            {/* 04 Act */}
            <li className="lp-step">
              <div className="lp-step-name">
                <span className="lp-step-n">04</span>
                <h3>Act</h3>
              </div>
              <div className="lp-step-text">
                <p>
                  Nothing goes to Orange&apos;s systems until a manager approves it. Approvals and rejections are
                  both kept, with the name, the time and a note.
                </p>
              </div>
              <div className="lp-artifact">
                <div className="lp-approval">
                  <p className="lp-approval-title">Approval</p>
                  <dl>
                    <div>
                      <dt>Offer</dt>
                      <dd>Daily Mini 600 MB, $0.60</dd>
                    </div>
                    <div>
                      <dt>Channel</dt>
                      <dd>Orange SMS</dd>
                    </div>
                    <div>
                      <dt>Reviewer</dt>
                      <dd className="lp-blank" aria-label="empty" />
                    </div>
                    <div>
                      <dt>Note</dt>
                      <dd className="lp-blank" aria-label="empty" />
                    </div>
                  </dl>
                  <div className="lp-approval-actions" aria-hidden="true">
                    <span data-kind="approve">Approve</span>
                    <span data-kind="reject">Reject</span>
                  </div>
                </div>
              </div>
            </li>

            {/* 05 Measure */}
            <li className="lp-step">
              <div className="lp-step-name">
                <span className="lp-step-n">05</span>
                <h3>Measure</h3>
              </div>
              <div className="lp-step-text">
                <p>
                  After the offer, usage is compared with the customer&apos;s baseline. LR-20417 hasn&apos;t
                  reached that point in the pilot data yet, so here&apos;s a case that has.
                </p>
                <p>
                  LR-10168 reported slow network and got a call-centre bridge. Thirty days later they were still
                  67% below baseline. It&apos;s recorded as not recovered, and that counts in the results.
                </p>
              </div>
              <div className="lp-artifact">
                <div className="lp-outcome">
                  <p className="lp-outcome-id">LR-10168 · 30-day window</p>
                  <div className="lp-outcome-row">
                    <span>Activations / month before</span>
                    <b>9</b>
                  </div>
                  <div className="lp-outcome-row">
                    <span>Activations / month after</span>
                    <b>3</b>
                  </div>
                  <p className="lp-stamp">Not recovered</p>
                </div>
              </div>
            </li>

            {/* 06 Report */}
            <li className="lp-step">
              <div className="lp-step-name">
                <span className="lp-step-n">06</span>
                <h3>Report</h3>
              </div>
              <div className="lp-step-text">
                <p>
                  The report pulls the pilot together: why customers drifted, who was contacted, what was
                  offered and what came of it.
                </p>
                <p>
                  Treated and control groups recovered at similar rates, and the confidence intervals overlap.
                  The pilot is too small to show the offers work, and the report says so.
                </p>
              </div>
              <div className="lp-artifact">
                <div className="lp-report">
                  <p className="lp-report-title">Reasons, {REASONS_TOTAL} classified cases</p>
                  <ul className="lp-reasons">
                    {REASONS.map((r) => (
                      <li key={r.label} data-hl={r.label === "Affordability"}>
                        <span>{r.label}</span>
                        <span className="lp-reason-bar">
                          <span style={{ width: `${(r.count / REASONS[0].count) * 100}%` }} />
                        </span>
                        <b>{r.count}</b>
                      </li>
                    ))}
                  </ul>
                  <div className="lp-groups">
                    <div>
                      <span>Treated</span>
                      <b>2 of 6</b>
                      <small>95% CI 10–70%</small>
                    </div>
                    <div>
                      <span>Control</span>
                      <b>2 of 8</b>
                      <small>95% CI 7–59%</small>
                    </div>
                  </div>
                </div>
              </div>
            </li>
          </ol>
        </div>
      </section>

      {/* Ground rules ---------------------------------------------------- */}
      <section id="rules" className="lp-rules">
        <div className="lp-container">
          <h2 className="lp-h2">Ground rules</h2>
          <ol className="lp-rule-list">
            {RULES.map((r, i) => (
              <li key={r.title}>
                <span className="lp-rule-n">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <h3>{r.title}</h3>
                  <p>{r.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Closing --------------------------------------------------------- */}
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
