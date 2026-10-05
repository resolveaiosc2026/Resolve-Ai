# ADR-001: Resolve AI Application Approach

## Status

Accepted for the OSC MVP.

## Context

Resolve AI requires:

- customer prioritization;
- evidence review;
- Customer 360 views;
- AI-classified feedback;
- next-best-action review;
- human approval workflows;
- intervention tracking;
- reporting dashboards.

The team considered three technical approaches.

## Option 1 — Responsive Internal Web Application

**Cost:** Low to moderate for the MVP.

**Reach:** Accessible from modern desktop and mobile browsers.

**Build time:** Fastest because it matches the team's existing Next.js, React, and TypeScript experience.

**User fit:** Strong fit for dashboards, tables, evidence review, approval workflows, and reporting.

## Option 2 — Native Mobile Application

**Cost:** Higher because of mobile development, testing, deployment, and maintenance.

**Reach:** Strong on supported smartphones.

**Build time:** Slower within the OSC timeline.

**User fit:** Useful for mobility but less suitable for dense analyst workflows and large reporting interfaces.

## Option 3 — Chat / WhatsApp-Style Operational Assistant

**Cost:** Potentially low for a simple prototype, although real channel integration introduces additional complexity.

**Reach:** Familiar conversational interface.

**Build time:** Moderate when simulated and higher when connected to real communication platforms.

**User fit:** Suitable for quick queries but weaker for evidence-heavy investigation, approvals, tables, and detailed reports.

## Decision

Resolve AI will use a **responsive internal web application** for the MVP.

## Rationale

The web application:

- best matches the required internal workflow;
- aligns with the team's existing skills;
- supports data-heavy dashboards and reporting;
- can be delivered faster within the OSC timeline;
- does not require Orange customers to install another application.

Orange's existing SMS, USSD, call, and messaging platforms remain communication channels rather than becoming the Resolve AI interface.

## Trade-Off

The solution requires internal users to have browser and network access, but this trade-off is preferable to the additional development complexity of a native application or the interface limitations of a chat-based system.