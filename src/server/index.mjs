import { documentPreview } from '../native/preview.mjs';
import {
  requireValue,
  actorCall,
  failure,
  json,
  object,
  ApiError,
  isId,
} from './common.mjs';
import { authResponse, identify, resumeTransfers } from './identity.mjs';
import { accountEmailConfigured, reserveEmailBudget } from './email.mjs';
import { intent, deliver } from './delivery.mjs';
import {
  documents,
  duplicateDocument,
  createExport,
  getExport,
} from './documents.mjs';
import { rendererAvailable } from '../native/renderer.mjs';
import { types } from '../charts/model.mjs';
import { chartFormats } from '../charts/capabilities.mjs';
import { nativeFields } from '../native/service.mjs';
import { recoverJobs } from './export-jobs.mjs';
import { savedTemplates } from './collections.mjs';
import { validateReturn, accountSessions } from './account-security.mjs';
import { localOperatorLogin } from './local-admin.mjs';
import { createSupport } from './support.mjs';
import { localMailbox, localMailEnabled } from './local-mail.mjs';
import { adminApi } from './admin.mjs';
export { guardAdminPage } from './admin.mjs';
import {
  prices,
  startBilling,
  receiveWebhook,
  retryBilling,
} from './billing.mjs';
import { closeAccount, privateArchive, retention } from './privacy.mjs';
export { DownloadActor } from './actor.mjs';

const authPaths = new Set([
  'sign-up/email',
  'sign-in/email',
  'sign-out',
  'verify-email',
  'send-verification-email',
  'request-password-reset',
  'reset-password',
  'change-email',
  'change-password',
  'update-user',
  'revoke-other-sessions',
]);
function method(request, allowed) {
  requireValue(allowed.includes(request.method), 'METHOD_NOT_ALLOWED');
}
function idem(request) {
  const v = request.headers.get('idempotency-key');
  requireValue(isId(v) && v.length >= 8 && v.length <= 128);
  return v;
}
export async function handleApi(request, env, ctx, options = {}) {
  try {
    const url = new URL(request.url),
      path = url.pathname.replace(/\/$/, '');
    if (path === '/api/webhooks/stripe') {
      method(request, ['POST']);
      return json(await receiveWebhook(request, env));
    }
    if (!['GET', 'HEAD'].includes(request.method)) {
      requireValue(
        request.headers.get('origin') === env.PUBLIC_SITE_URL &&
          url.origin === env.PUBLIC_SITE_URL,
        'ORIGIN_DENIED',
      );
    }
    if (path === '/api/dev/operator')
      return await localOperatorLogin(request, env);
    if (path === '/api/dev/mailbox' || path.startsWith('/api/dev/mailbox/'))
      return await localMailbox(request, env, path);
    if (path.startsWith('/api/admin/'))
      return await adminApi(request, env, path, resumePending);
    if (path.startsWith('/api/auth/')) {
      const route = path.slice(10);
      requireValue(
        authPaths.has(route) || /^reset-password\/[\w.-]+$/.test(route),
        'NOT_FOUND',
      );
      if (
        [
          'sign-up/email',
          'request-password-reset',
          'send-verification-email',
          'change-email',
        ].includes(route)
      ) {
        requireValue(accountEmailConfigured(env), 'EMAIL_DELIVERY_UNAVAILABLE');
      }
      validateReturn(url.searchParams.get('callbackURL'), env.PUBLIC_SITE_URL);
      if (request.method === 'POST') {
        const payload = await object(request.clone());
        for (const key of [
          'callbackURL',
          'redirectTo',
          'newUserCallbackURL',
          'errorCallbackURL',
        ])
          validateReturn(payload[key], env.PUBLIC_SITE_URL);
        if (
          [
            'sign-up/email',
            'send-verification-email',
            'request-password-reset',
            'change-email',
          ].includes(route)
        ) {
          const email =
            route === 'change-email' ? payload.newEmail : payload.email;
          requireValue(
            typeof email === 'string' &&
              email.length <= 254 &&
              /^[^@\s]+@[^@\s]+$/.test(email),
          );
          if (localMailEnabled(env))
            requireValue(/^[^@\s]{1,64}@example\.test$/i.test(email));
          await reserveEmailBudget(env, email, 'request.' + route);
        }
      }
      const r = await authResponse(env, request);
      const secured = new Response(r.body, r);
      secured.headers.set('Cache-Control', 'private, no-store');
      secured.headers.set('Referrer-Policy', 'no-referrer');
      return secured;
    }
    if (path === '/api/chart-capabilities') {
      method(request, ['GET']);
      return json({
        formats: Object.fromEntries(
          Object.keys(types).map((t) => [
            t,
            chartFormats(t, rendererAvailable(env)),
          ]),
        ),
      });
    }
    if (path === '/api/billing/plans') {
      method(request, ['GET']);
      return json(await prices(env));
    }
    const identity = await identify(
      env,
      request,
      path === '/api/session' && request.method === 'GET',
    );
    let response;
    if (path.startsWith('/api/template-fields/')) {
      method(request, ['GET']);
      response = json(
        await nativeFields(env, path.slice('/api/template-fields/'.length)),
      );
    } else if (path === '/api/session') {
      method(request, ['GET']);
      response = json({
        localTestInbox: localMailEnabled(env),
        accountEmailConfigured: accountEmailConfigured(env),
        user: identity.user
          ? {
              name: identity.user.name,
              email: identity.user.email,
              verified: identity.user.emailVerified,
            }
          : null,
        timeZone: identity.user
          ? await env.DB.prepare(
              'SELECT time_zone FROM member_preferences WHERE user_id=?',
            )
              .bind(identity.user.id)
              .first('time_zone')
          : null,
        ...(await actorCall(env, identity.actor, 'summary')),
      });
    } else if (path === '/api/contact') {
      method(request, ['POST']);
      response = json(
        await createSupport(
          env,
          request,
          identity,
          await object(request),
          idem(request),
        ),
        201,
      );
    } else if (path === '/api/download-intents') {
      method(request, ['POST']);
      response = json(
        await intent(env, identity, await object(request), idem(request)),
      );
    } else if (path.startsWith('/api/downloads/')) {
      method(request, ['GET']);
      response = await deliver(env, identity, path.slice(15), request);
    } else if (/^\/api\/documents\/[a-f0-9-]{36}\/preview$/i.test(path)) {
      method(request, ['POST']);
      response = await documentPreview(
        env,
        identity.actor,
        path.split('/')[3],
        await object(request),
      );
    } else if (/^\/api\/documents\/[a-f0-9-]{36}\/duplicate$/.test(path)) {
      method(request, ['POST']);
      response = json(
        await duplicateDocument(env, identity.actor, path.split('/')[3]),
        201,
      );
    } else if (
      path === '/api/documents' ||
      path.startsWith('/api/documents/')
    ) {
      method(request, ['GET', 'POST', 'PATCH', 'DELETE']);
      response = json(
        await documents(
          env,
          identity.actor,
          path.slice(15),
          request.method,
          ['POST', 'PATCH'].includes(request.method)
            ? await object(request)
            : {},
        ),
      );
    } else if (path === '/api/exports') {
      method(request, ['POST']);
      const job = await createExport(
        env,
        identity.actor,
        await object(request),
        idem(request),
        options,
        ctx,
      );
      response = json(job, job.state === 'succeeded' ? 200 : 202);
    } else if (path.startsWith('/api/exports/')) {
      method(request, ['GET']);
      response = json(
        await getExport(env, identity.actor, path.slice(13), options, ctx),
      );
    } else if (path === '/api/account/sessions') {
      method(request, ['GET']);
      response = json(await accountSessions(env, request, identity));
    } else if (path === '/api/account/sessions/revoke') {
      method(request, ['POST']);
      const input = await object(request);
      requireValue(typeof input.id === 'string');
      response = json(await accountSessions(env, request, identity, input.id));
    } else if (path === '/api/account/saved') {
      method(request, ['GET', 'POST', 'DELETE']);
      requireValue(identity.user?.emailVerified, 'UNAUTHENTICATED');
      response = json(
        await savedTemplates(
          env,
          identity.user.id,
          request.method,
          request.method === 'GET' ? {} : await object(request),
        ),
      );
    } else if (path === '/api/account/preferences') {
      method(request, ['POST']);
      requireValue(identity.user?.emailVerified, 'UNAUTHENTICATED');
      const { name, timeZone } = await object(request);
      requireValue(
        typeof name === 'string' &&
          name.trim().length > 0 &&
          name.length <= 100 &&
          typeof timeZone === 'string' &&
          timeZone.length <= 80,
      );
      try {
        new Intl.DateTimeFormat('en-US', { timeZone });
      } catch {
        throw new ApiError('VALIDATION_ERROR');
      }
      await env.DB.batch([
        env.DB.prepare('UPDATE user SET name=?,updatedAt=? WHERE id=?').bind(
          name.trim(),
          new Date().toISOString(),
          identity.user.id,
        ),
        env.DB.prepare(
          'INSERT INTO member_preferences VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET time_zone=excluded.time_zone',
        ).bind(identity.user.id, timeZone),
      ]);
      response = json({ saved: true });
    } else if (path === '/api/account/data-export') {
      method(request, ['POST']);
      response = json(
        await privateArchive(request, env, identity, await object(request)),
      );
      response.headers.set(
        'Content-Disposition',
        'attachment; filename="templateatlas-personal-data.json"',
      );
    } else if (path === '/api/account') {
      method(request, ['DELETE']);
      response = json(
        await closeAccount(request, env, identity, await object(request)),
        202,
      );
    } else if (
      path === '/api/billing/checkout' ||
      path === '/api/billing/portal'
    ) {
      method(request, ['POST']);
      response = json(
        await startBilling(
          env,
          identity,
          path.endsWith('/portal') ? 'portal' : 'checkout',
          await object(request),
        ),
      );
    } else throw new ApiError('NOT_FOUND');
    if (identity.cookie) response.headers.append('Set-Cookie', identity.cookie);
    return response;
  } catch (error) {
    return failure(error);
  }
}
export async function resumePending(env, options = {}) {
  const results = await Promise.allSettled([
    resumeTransfers(env),
    retryBilling(env),
    retention(env),
    recoverJobs(env, options),
  ]);
  if (results.some((r) => r.status === 'rejected'))
    throw new Error('A maintenance job needs a retry.');
}
