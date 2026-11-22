import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('Deep Dive Workspace Option A UX: Sticky Action Bar, Checkout Pop-up Modal, 01–09 Quick-Jump, Collapsible Results & Re-run Visual Feedback', () => {
  const viewPath = path.resolve(process.cwd(), 'src/components/DeepDiveWorkspaceView.tsx');
  const src = fs.readFileSync(viewPath, 'utf8');

  // 1. Strict Phase 9.1 / 9.3 / 9.3.1 / 9.4 / 9.5 guardrails remain intact
  assert.equal(src.includes('fetch('), false, 'DeepDiveWorkspaceView must never call fetch()');
  assert.equal(src.includes('/api/'), false, 'DeepDiveWorkspaceView must never contain /api/');
  assert.ok(src.includes('data-testid="deep-dive-pre-run-confirmation"'));
  assert.ok(src.includes('data-testid="deep-dive-confirm-limit-alert"'));
  assert.ok(src.includes('data-testid="deep-dive-budget-storage-unavailable"'));
  assert.ok(src.includes('data-testid="deep-dive-post-run-summary"'));
  assert.ok(src.includes('data-testid="deep-dive-final-report"'));
  assert.ok(src.includes('data-testid="deep-dive-analysis-history"'));

  // 2. Option A: Sticky Bottom Action Bar
  assert.ok(src.includes('data-testid="deep-dive-sticky-bar"'));
  assert.ok(src.includes('data-testid="deep-dive-sticky-run-btn"'));
  assert.ok(src.includes('data-testid="deep-dive-open-budget-modal-btn"'));

  // 3. Option A: Centered Checkout & Budget Pop-up Modal (with dialog semantics & Escape close)
  assert.ok(src.includes('role="dialog"'));
  assert.ok(src.includes('aria-modal="true"'));
  assert.ok(src.includes("event.key === 'Escape'"));

  // 4. Option A: 01–09 Quick-Jump Bar & Global/Per-Card Result Collapse
  assert.ok(src.includes('data-testid="deep-dive-quick-jump-bar"'));
  assert.ok(src.includes('data-testid="deep-dive-toggle-all-results"'));
  assert.ok(src.includes('handleJumpToCard'));
  assert.ok(src.includes('handleToggleAllResultsCollapse'));
  assert.ok(src.includes('handleToggleSingleResultCollapse'));
  assert.ok(src.includes('Collapse All Results'));
  assert.ok(src.includes('Expand All Results'));
  assert.ok(src.includes('Show Result'));
  assert.ok(src.includes('Hide Result'));

  // 5. Unmistakable Re-run Visual Feedback (even for 0ms Cache/Local re-runs)
  assert.ok(src.includes('triggerVisualRunFeedback'));
  assert.ok(src.includes('finalizeVisualFeedback'));
  assert.ok(src.includes('data-testid="deep-dive-run-toast"'));
  assert.ok(src.includes('deep-dive-rerun-feedback-'));
  assert.ok(src.includes('Updated just now'));
  assert.ok(src.includes('includeSeconds'));
});
