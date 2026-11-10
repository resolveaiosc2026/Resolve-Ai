/**
 * The single registry of every API endpoint. The OpenAPI spec AND the Postman collection
 * are generated from it, and request schemas come from the same Zod validators the routes use,
 * so the docs cannot drift from the API.
 */
import type { z } from 'zod';

import { chatBodySchema, conversationParamSchema } from '../modules/copilot/copilot.routes.js';
import {
  bandParamSchema,
  caseQuerySchema,
  customerIdParamSchema,
  pagingSchema,
  runDetectionBodySchema,
} from '../modules/detect/detect.schemas.js';
import {
  advanceBodySchema,
  approveBodySchema,
  classificationIdParamSchema,
  handOffBodySchema,
  inboundBodySchema,
  interventionParamSchema,
  interventionQuerySchema,
  outcomeBodySchema,
  overrideBodySchema,
  persistRecommendationBodySchema,
  recommendationIdParamSchema,
  recommendationQuerySchema,
  rejectBodySchema,
  replyBodySchema,
  simulatedReplyBodySchema,
  uuidParamSchema,
} from '../modules/loop.schemas.js';
import {
  feedbackQuerySchema,
  reviewerBodySchema,
} from '../modules/understand/understand.schemas.js';

export type Tag =
  | 'System'
  | 'Detect'
  | 'Understand'
  | 'Recommend'
  | 'Act'
  | 'Measure'
  | 'Report'
  | 'Copilot'
  | 'Simulation';

export const TAGS: { name: Tag; description: string }[] = [
  { name: 'System', description: 'Service info, health and these docs.' },
  {
    name: 'Detect',
    description:
      "Step 1. Compare each customer's recent bundle activity with their own baseline, flag meaningful change and score priority (the frontend's priorityQueue / detectSummary).",
  },
  {
    name: 'Understand',
    description:
      "Step 2. Find the likely reason: behavioural evidence first; otherwise hand a feedback request to an existing Orange channel and normalize the customer's reply (AI with keyword fallback). Resolve AI never contacts customers itself.",
  },
  {
    name: 'Recommend',
    description:
      'Step 3. Next-best action from the change and the reason (eligibility rules, campaign history).',
  },
  {
    name: 'Act',
    description:
      "Step 4. A human approves, changes or rejects. Approval creates an intervention handed off to Orange's workflow.",
  },
  {
    name: 'Measure',
    description: "Step 5. Outcome after the 30-day window, against the customer's own baseline.",
  },
  {
    name: 'Report',
    description: 'Step 6. Treated vs control, reasons, coverage, action funnel, trends.',
  },
  {
    name: 'Copilot',
    description:
      "Plain-language questions answered only from the backend's aggregates. The LLM may route off-script questions to a fixed intent and rephrase answers under a numeric grounding guard.",
  },
  {
    name: 'Simulation',
    description:
      "DEMO ONLY. Plays Orange's channel returning a reply and the customer's post-intervention month. Mounted only when ENABLE_SIMULATION is on (default off in production).",
  },
];

export type Endpoint = {
  operationId: string;
  method: 'get' | 'post' | 'patch';
  /** Express-style path relative to /api/v1 (":param"). */
  path: string;
  tag: Tag;
  summary: string;
  description?: string;
  params?: z.ZodObject;
  query?: z.ZodObject;
  body?: z.ZodType;
  bodyExample?: unknown;
  success: {
    status: number;
    schema: string;
    list?: boolean;
    description: string;
    contentType?: string;
  };
  errors: number[];
  ai?: boolean;
  postman: {
    /** Path with Postman variables, e.g. /risk/{{customerId}}. */
    path: string;
    query?: Record<string, string>;
    body?: unknown;
    /** Accepted status codes in the reference folder (state-dependent writes accept 409). */
    accept?: number[];
    /** Extra test lines (Postman sandbox JS). */
    tests?: string[];
  };
};

const reviewer = 'analyst.hui';

export const ENDPOINTS: Endpoint[] = [
  /* ------------------------------- System ------------------------------- */
  {
    operationId: 'getServiceInfo',
    method: 'get',
    path: '/',
    tag: 'System',
    summary: 'Service info and documentation links',
    success: { status: 200, schema: 'ServiceInfo', description: 'Service info' },
    errors: [],
    postman: { path: '' },
  },
  {
    operationId: 'getHealth',
    method: 'get',
    path: '/health',
    tag: 'System',
    summary: 'Liveness, database reachability and simulation flag',
    description:
      'Returns 503 with `status: "degraded"` (same shape) when the database is unreachable.',
    success: { status: 200, schema: 'Health', description: 'API and database are up' },
    errors: [503],
    postman: {
      path: '/health',
      tests: [
        "pm.test('database is up', () => pm.expect(pm.response.json().data.database.status).to.eql('up'));",
      ],
    },
  },
  {
    operationId: 'getOpenApi',
    method: 'get',
    path: '/openapi.json',
    tag: 'System',
    summary: 'This OpenAPI 3.1 document',
    success: { status: 200, schema: '', description: 'OpenAPI document (JSON)' },
    errors: [],
    postman: { path: '/openapi.json' },
  },
  {
    operationId: 'getDocs',
    method: 'get',
    path: '/docs',
    tag: 'System',
    summary: 'Interactive API reference (HTML)',
    success: { status: 200, schema: '', description: 'HTML page', contentType: 'text/html' },
    errors: [],
    postman: { path: '/docs' },
  },

  /* ------------------------------- Detect ------------------------------- */
  {
    operationId: 'getRiskQueue',
    method: 'get',
    path: '/risk',
    tag: 'Detect',
    summary: 'Priority queue (frontend priorityQueue())',
    description:
      'Open cases sorted by priority descending, then customer id. Filters and paging via query.',
    query: caseQuerySchema,
    success: { status: 200, schema: 'QueueRow', list: true, description: 'Queue rows' },
    errors: [400],
    postman: {
      path: '/risk',
      query: { pageSize: '5' },
      tests: [
        "pm.test('has rows', () => pm.expect(pm.response.json().data.length).to.be.above(0));",
      ],
    },
  },
  {
    operationId: 'getRiskSummary',
    method: 'get',
    path: '/risk/summary',
    tag: 'Detect',
    summary: 'Detect KPIs and risk distribution (frontend detectSummary())',
    description:
      'Top-level figures come from the synthetic population (`simulated: true`); `pilot` has live counts for the 45-case sample.',
    success: { status: 200, schema: 'DetectSummary', description: 'Summary' },
    errors: [],
    postman: { path: '/risk/summary' },
  },
  {
    operationId: 'getRiskRow',
    method: 'get',
    path: '/risk/:customerId',
    tag: 'Detect',
    summary: 'One queue row',
    params: customerIdParamSchema,
    success: { status: 200, schema: 'QueueRow', description: 'Queue row' },
    errors: [400, 404],
    postman: { path: '/risk/{{customerId}}' },
  },
  {
    operationId: 'listCustomers',
    method: 'get',
    path: '/customers',
    tag: 'Detect',
    summary: 'Customer list (sorted by id)',
    query: caseQuerySchema,
    success: { status: 200, schema: 'CustomerListItem', list: true, description: 'Customers' },
    errors: [400],
    postman: { path: '/customers', query: { pageSize: '5' } },
  },
  {
    operationId: 'getCustomer',
    method: 'get',
    path: '/customers/:customerId',
    tag: 'Detect',
    summary: 'Customer 360 (usage, priority, monthly metrics)',
    params: customerIdParamSchema,
    success: { status: 200, schema: 'CustomerDetail', description: 'Customer detail' },
    errors: [400, 404],
    postman: { path: '/customers/{{customerId}}' },
  },
  {
    operationId: 'getSegments',
    method: 'get',
    path: '/segments',
    tag: 'Detect',
    summary: 'Priority bands and breakdown by customer segment',
    success: { status: 200, schema: 'Segments', description: 'Segments' },
    errors: [],
    postman: { path: '/segments' },
  },
  {
    operationId: 'getSegmentRows',
    method: 'get',
    path: '/segments/:band',
    tag: 'Detect',
    summary: 'Queue rows for one band',
    params: bandParamSchema,
    query: pagingSchema,
    success: { status: 200, schema: 'QueueRow', list: true, description: 'Queue rows' },
    errors: [400],
    postman: { path: '/segments/high' },
  },
  {
    operationId: 'getLatestDetectionRun',
    method: 'get',
    path: '/detection-runs/latest',
    tag: 'Detect',
    summary: 'Latest detection run',
    success: { status: 200, schema: 'DetectionRun', description: 'Run' },
    errors: [404],
    postman: { path: '/detection-runs/latest' },
  },
  {
    operationId: 'runDetection',
    method: 'post',
    path: '/detection-runs',
    tag: 'Detect',
    summary: 'Re-run detection from stored behaviour',
    description:
      "Default `asOf` = the latest run's date (dataset snapshot). Updates open cases' scores without changing their queue status.",
    body: runDetectionBodySchema,
    bodyExample: {},
    success: { status: 201, schema: 'RunSummary', description: 'Run summary' },
    errors: [400, 409],
    postman: { path: '/detection-runs', body: {} },
  },

  /* ----------------------------- Understand ----------------------------- */
  {
    operationId: 'getReasons',
    method: 'get',
    path: '/customers/:customerId/reasons',
    tag: 'Understand',
    summary: "The case's reason + evidence assessment (frontend classifyReason())",
    params: customerIdParamSchema,
    success: { status: 200, schema: 'ClassificationView', description: 'Reason view' },
    errors: [400, 404],
    postman: { path: '/customers/{{customerId}}/reasons' },
  },
  {
    operationId: 'acceptEvidence',
    method: 'post',
    path: '/customers/:customerId/reasons/evidence',
    tag: 'Understand',
    summary: 'Accept strong behavioural evidence as the reason (human-confirmed)',
    description: 'Needs evidence strength ≥ 0.80. Case moves to `ready`.',
    params: customerIdParamSchema,
    body: reviewerBodySchema,
    bodyExample: { reviewerName: reviewer },
    success: { status: 201, schema: 'ClassificationView', description: 'Updated reason view' },
    errors: [400, 404, 409],
    postman: {
      path: '/customers/LR-14806/reasons/evidence',
      body: { reviewerName: reviewer },
      accept: [201, 409],
    },
  },
  {
    operationId: 'listFeedbackRequests',
    method: 'get',
    path: '/feedback-requests',
    tag: 'Understand',
    summary: 'Feedback queue (requests handed off to Orange channels)',
    query: feedbackQuerySchema,
    success: { status: 200, schema: 'FeedbackRequestRow', list: true, description: 'Requests' },
    errors: [400],
    postman: { path: '/feedback-requests', query: { status: 'handed_off', pageSize: '5' } },
  },
  {
    operationId: 'getFeedbackSuggestions',
    method: 'get',
    path: '/feedback-requests/suggestions',
    tag: 'Understand',
    summary: 'Cases that should get a feedback request',
    description: 'Empty on the seeded data (every pilot case already has a request).',
    success: { status: 200, schema: 'FeedbackSuggestion', list: true, description: 'Suggestions' },
    errors: [],
    postman: { path: '/feedback-requests/suggestions' },
  },
  {
    operationId: 'handOffFeedbackRequest',
    method: 'post',
    path: '/customers/:customerId/feedback-requests',
    tag: 'Understand',
    summary: 'Hand an ask to an Orange channel (Resolve AI does not contact the customer)',
    description:
      'An unanswered ask older than 7 days becomes `no_response` and a follow-up is allowed.',
    params: customerIdParamSchema,
    body: handOffBodySchema,
    bodyExample: { channel: 'voice_call', reviewerName: reviewer },
    success: { status: 201, schema: 'HandOffResult', description: 'Handed off' },
    errors: [400, 404, 409],
    postman: {
      path: '/customers/{{journeyCustomerId}}/feedback-requests',
      body: { channel: 'sms', reviewerName: reviewer },
      accept: [201, 409],
    },
  },
  {
    operationId: 'ingestReply',
    method: 'post',
    path: '/feedback-requests/:id/responses',
    tag: 'Understand',
    summary: 'Ingest a reply returned by the Orange channel (AI + keyword fallback)',
    description:
      'Case → `ready` when confidence ≥ 0.80, otherwise `unclassified` (needs a human read). Rate limit: 20/min.',
    params: uuidParamSchema,
    body: replyBodySchema,
    bodyExample: { text: 'Money hard this month. I buy only small small bundle now.' },
    success: { status: 201, schema: 'ReplyResult', description: 'Reply stored and classified' },
    errors: [400, 404, 409],
    ai: true,
    postman: {
      path: '/feedback-requests/{{requestId}}/responses',
      body: { text: 'Money hard this month. I buy only small small bundle now.' },
      accept: [201, 409],
    },
  },
  {
    operationId: 'recordInboundFeedback',
    method: 'post',
    path: '/feedback',
    tag: 'Understand',
    summary: 'Inbound feedback (customer service, Facebook): classification preview only',
    params: undefined,
    body: inboundBodySchema,
    bodyExample: {
      channel: 'facebook_comment',
      text: 'Orange network too slow in Ganta since last week.',
      region: 'Ganta',
    },
    success: { status: 201, schema: 'InboundResult', description: 'Stored with preview' },
    errors: [400, 404],
    ai: true,
    postman: {
      path: '/feedback',
      body: {
        channel: 'facebook_comment',
        text: 'Orange network too slow in Ganta since last week, data no load.',
        region: 'Ganta',
      },
    },
  },
  {
    operationId: 'overrideReason',
    method: 'patch',
    path: '/reasons/:classificationId',
    tag: 'Understand',
    summary: 'Human confirms or corrects a reason',
    description:
      'Correcting adds a `human` reason that the queue, recommendation and report then use.',
    params: classificationIdParamSchema,
    body: overrideBodySchema,
    bodyExample: {
      reasonId: 'affordability',
      reviewerName: reviewer,
      note: 'Confirmed on a care call.',
    },
    success: { status: 200, schema: 'ClassificationView', description: 'Updated reason view' },
    errors: [400, 404],
    postman: {
      path: '/reasons/{{classificationId}}',
      body: {
        reasonId: 'affordability',
        reviewerName: reviewer,
        note: 'Confirmed on a care call.',
      },
    },
  },

  /* ------------------------------ Recommend ------------------------------ */
  {
    operationId: 'getRecommendationView',
    method: 'get',
    path: '/customers/:customerId/recommendation',
    tag: 'Recommend',
    summary: 'Live next-best action (frontend recommendAction())',
    params: customerIdParamSchema,
    success: { status: 200, schema: 'RecommendationView', description: 'Recommendation view' },
    errors: [400, 404],
    postman: { path: '/customers/{{customerId}}/recommendation' },
  },
  {
    operationId: 'persistRecommendation',
    method: 'post',
    path: '/customers/:customerId/recommendations',
    tag: 'Recommend',
    summary: 'Persist the best action as a pending recommendation',
    params: customerIdParamSchema,
    body: persistRecommendationBodySchema,
    bodyExample: {},
    success: { status: 201, schema: 'Recommendation', description: 'Pending recommendation' },
    errors: [400, 404, 409],
    postman: { path: '/customers/{{customerId}}/recommendations', body: {}, accept: [201, 409] },
  },
  {
    operationId: 'listRecommendations',
    method: 'get',
    path: '/recommendations',
    tag: 'Recommend',
    summary: 'Recommendations',
    query: recommendationQuerySchema,
    success: { status: 200, schema: 'Recommendation', list: true, description: 'Recommendations' },
    errors: [400],
    postman: { path: '/recommendations', query: { pageSize: '5' } },
  },
  {
    operationId: 'getRecommendation',
    method: 'get',
    path: '/recommendations/:id',
    tag: 'Recommend',
    summary: 'One recommendation',
    params: uuidParamSchema,
    success: { status: 200, schema: 'Recommendation', description: 'Recommendation' },
    errors: [400, 404],
    postman: { path: '/recommendations/{{recommendationId}}' },
  },

  /* --------------------------------- Act --------------------------------- */
  {
    operationId: 'approveRecommendation',
    method: 'post',
    path: '/actions/:recommendationId/approve',
    tag: 'Act',
    summary: 'Approve (or change to an eligible alternative) → intervention handed off',
    params: recommendationIdParamSchema,
    body: approveBodySchema,
    bodyExample: {
      reviewerName: reviewer,
      window: 'Today 16:00–18:00',
      note: 'Customer says the big bundle is too dear.',
    },
    success: { status: 201, schema: 'ApproveResult', description: 'Intervention created' },
    errors: [400, 404, 409],
    postman: {
      path: '/actions/{{recommendationId}}/approve',
      body: { reviewerName: reviewer },
      accept: [201, 409],
    },
  },
  {
    operationId: 'rejectRecommendation',
    method: 'post',
    path: '/actions/:recommendationId/reject',
    tag: 'Act',
    summary: '"Send to human review": reject a pending recommendation',
    params: recommendationIdParamSchema,
    body: rejectBodySchema,
    bodyExample: { reviewerName: reviewer, note: 'Prior discount was recent; check manually.' },
    success: { status: 200, schema: 'RejectResult', description: 'Rejected' },
    errors: [400, 404, 409],
    postman: {
      path: '/actions/{{rejectRecommendationId}}/reject',
      body: { reviewerName: reviewer, note: 'Prior discount was recent; check manually.' },
      accept: [200, 409],
    },
  },
  {
    operationId: 'listInterventions',
    method: 'get',
    path: '/interventions',
    tag: 'Act',
    summary: 'Interventions',
    query: interventionQuerySchema,
    success: { status: 200, schema: 'Intervention', list: true, description: 'Interventions' },
    errors: [400],
    postman: { path: '/interventions', query: { pageSize: '5' } },
  },
  {
    operationId: 'getIntervention',
    method: 'get',
    path: '/interventions/:id',
    tag: 'Act',
    summary: 'One intervention (uuid or INT-1234)',
    params: interventionParamSchema,
    success: { status: 200, schema: 'Intervention', description: 'Intervention' },
    errors: [400, 404],
    postman: { path: '/interventions/{{interventionRef}}' },
  },

  /* ------------------------------- Measure ------------------------------- */
  {
    operationId: 'recordOutcome',
    method: 'post',
    path: '/interventions/:id/outcome',
    tag: 'Measure',
    summary: 'Measure the outcome after the 30-day window',
    description:
      '409 while the window is open (unless simulated) or when an outcome already exists.',
    params: interventionParamSchema,
    body: outcomeBodySchema,
    bodyExample: { reviewerName: reviewer },
    success: { status: 201, schema: 'Outcome', description: 'Outcome' },
    errors: [400, 404, 409],
    postman: {
      path: '/interventions/{{interventionRef}}/outcome',
      body: { reviewerName: reviewer },
      accept: [201, 409],
    },
  },
  {
    operationId: 'getMeasureView',
    method: 'get',
    path: '/customers/:customerId/measure',
    tag: 'Measure',
    summary: 'Timeline, verdict and control summary (frontend measureView())',
    params: customerIdParamSchema,
    success: { status: 200, schema: 'MeasureView', description: 'Measure view' },
    errors: [400, 404],
    postman: { path: '/customers/LR-10168/measure' },
  },

  /* -------------------------------- Report ------------------------------- */
  {
    operationId: 'getReportSummary',
    method: 'get',
    path: '/reports/summary',
    tag: 'Report',
    summary: 'Treated vs control (Wilson 95% CI), reasons, agreement (frontend reportView())',
    success: { status: 200, schema: 'ReportSummary', description: 'Report' },
    errors: [],
    postman: { path: '/reports/summary' },
  },
  {
    operationId: 'getDrivers',
    method: 'get',
    path: '/reports/drivers',
    tag: 'Report',
    summary: 'Reasons by source and feedback coverage',
    success: { status: 200, schema: 'Drivers', description: 'Drivers' },
    errors: [],
    postman: { path: '/reports/drivers' },
  },
  {
    operationId: 'getActionsReport',
    method: 'get',
    path: '/reports/actions',
    tag: 'Report',
    summary: 'Action funnel and campaign history',
    success: { status: 200, schema: 'ActionsReport', description: 'Actions report' },
    errors: [],
    postman: { path: '/reports/actions' },
  },
  {
    operationId: 'getTrends',
    method: 'get',
    path: '/dashboard/trends',
    tag: 'Report',
    summary: 'Average weekly GB across open cases (12 weeks)',
    success: { status: 200, schema: 'Trends', description: 'Trends' },
    errors: [],
    postman: { path: '/dashboard/trends' },
  },

  /* ------------------------------- Copilot ------------------------------- */
  {
    operationId: 'copilotChat',
    method: 'post',
    path: '/copilot/chat',
    tag: 'Copilot',
    summary: 'Ask the Executive Copilot',
    description:
      '`style: "template"` skips AI phrasing. Pass `conversationId` to continue a thread. Rate limit: 20/min.',
    body: chatBodySchema,
    bodyExample: { question: 'Is the pilot working?' },
    success: { status: 201, schema: 'CopilotAnswer', description: 'Answer' },
    errors: [400, 404],
    ai: true,
    postman: {
      path: '/copilot/chat',
      body: { question: 'Is the pilot working?' },
      tests: [
        "pm.collectionVariables.set('conversationId', pm.response.json().data.conversationId);",
      ],
    },
  },
  {
    operationId: 'getCopilotSuggestions',
    method: 'get',
    path: '/copilot/suggestions',
    tag: 'Copilot',
    summary: 'Suggested questions',
    success: { status: 200, schema: '', description: 'Questions (strings)' },
    errors: [],
    postman: { path: '/copilot/suggestions' },
  },
  {
    operationId: 'getConversation',
    method: 'get',
    path: '/copilot/conversations/:conversationId',
    tag: 'Copilot',
    summary: 'A stored conversation thread',
    params: conversationParamSchema,
    success: { status: 200, schema: 'Conversation', description: 'Thread' },
    errors: [400, 404],
    postman: { path: '/copilot/conversations/{{conversationId}}' },
  },

  /* ------------------------------ Simulation ----------------------------- */
  {
    operationId: 'simulateReply',
    method: 'post',
    path: '/simulation/feedback-requests/:id/reply',
    tag: 'Simulation',
    summary: "DEMO: Orange's channel returns a reply (same ingestion as a real reply)",
    params: uuidParamSchema,
    body: simulatedReplyBodySchema,
    bodyExample: { text: 'Money hard this month o. I buy only small small bundle now.' },
    success: { status: 201, schema: 'ReplyResult', description: 'Reply stored and classified' },
    errors: [400, 404, 409],
    ai: true,
    postman: {
      path: '/simulation/feedback-requests/{{requestId}}/reply',
      body: {},
      accept: [201, 404, 409],
    },
  },
  {
    operationId: 'simulateWindow',
    method: 'post',
    path: '/simulation/interventions/:id/advance',
    tag: 'Simulation',
    summary: "DEMO: deliver the intervention and simulate the customer's next 30 days",
    params: interventionParamSchema,
    body: advanceBodySchema,
    bodyExample: { scenario: 'recover' },
    success: { status: 200, schema: 'SimulationAdvance', description: 'Window simulated' },
    errors: [400, 404, 409],
    postman: {
      path: '/simulation/interventions/{{interventionRef}}/advance',
      body: {},
      accept: [200, 404, 409],
    },
  },
];
