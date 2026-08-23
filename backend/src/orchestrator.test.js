import test from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldBypassDirectMeetingWorkflow,
  shouldPreferPlannerForMessage,
} from './orchestrator.js';

test('bypasses direct meeting workflow for compound meeting and email request', () => {
  const message = "set up a meeting with Mahmoud today at 7 PM for 30 mins with title (ATHINA ROADMAP) and email him 2 emails, one email with the invitation of the meeting and the other email is to confirm on him about today's lunch at 6PM as me and my wife are coming so we cant wait to see him and his wife!";

  assert.equal(shouldBypassDirectMeetingWorkflow(message), true);
});

test('does not bypass direct meeting workflow for meeting-only request', () => {
  const message = 'set up a meeting with Mahmoud today at 7 PM for 30 mins with title ATHINA ROADMAP';

  assert.equal(shouldBypassDirectMeetingWorkflow(message), false);
});

test('does not bypass direct meeting workflow for email-only request', () => {
  const message = 'email him to confirm lunch at 6PM today';

  assert.equal(shouldBypassDirectMeetingWorkflow(message), false);
});

test('prefers planner for complex multi-intent requests', () => {
  const message = 'email Mahmoud the agenda and then schedule a meeting tomorrow at 10 and also check traffic from Marina to DIFC';

  assert.equal(shouldPreferPlannerForMessage(message), true);
});

test('does not force planner for simple single-intent requests', () => {
  const message = 'show Dubai Mall on the map';

  assert.equal(shouldPreferPlannerForMessage(message), false);
});
