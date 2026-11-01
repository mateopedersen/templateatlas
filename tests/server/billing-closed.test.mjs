import test from 'node:test';
import assert from 'node:assert/strict';
import { prices, startBilling } from '../../src/server/billing.mjs';

test('a production billing pause hides test and live plans and rejects checkout before external calls', async () => {
  const env = {
    DEPLOY_STAGE: 'production',
    BILLING_LIVE_ENABLED: 'false',
    STRIPE_SECRET_KEY: 'sk_test_offline_fixture',
    STRIPE_PRICE_ID_MONTHLY: 'price_fixture',
  };
  assert.deepEqual(await prices(env), { plans: [], testMode: false });
  for (const mode of ['checkout', 'portal']) {
    await assert.rejects(
      startBilling(env, { user: { emailVerified: true } }, mode, {
        plan: 'monthly',
      }),
      /DEPENDENCY_UNAVAILABLE/,
    );
  }
});
