import { awaitExport } from '../lib/export-state.mjs';
import { savedInputs } from './saved-inputs.mjs';
import { api, download } from '../lib/client.mjs';

const root = () => document.querySelector('[data-account-path]');
const node = (tag, text, cls) => {
  const e = document.createElement(tag);
  if (text != null) e.textContent = text;
  if (cls) e.className = cls;
  return e;
};
function link(text, href) {
  const a = node('a', text);
  a.href = href;
  return a;
}
function section(parent, title, copy) {
  const box = node('section', null, 'panel');
  box.append(node('h2', title));
  if (copy) box.append(node('p', copy));
  parent.append(box);
  return box;
}
function status(s) {
  root().querySelector('[data-account-status]').textContent = s;
}
function error(e) {
  status(e.message || 'Please try again.');
}
function button(text, fn, cls = '') {
  const b = node('button', text, cls);
  b.type = 'button';
  b.onclick = async () => {
    b.disabled = true;
    status('');
    try {
      await fn(b);
    } catch (e) {
      error(e);
    } finally {
      b.disabled = false;
    }
  };
  return b;
}
function field(
  form,
  label,
  {
    name,
    type = 'text',
    value = '',
    minLength = 0,
    required = true,
    autocomplete,
  },
) {
  const l = node('label', label),
    i = node('input');
  Object.assign(i, { name, type, value, required, minLength });
  if (autocomplete) i.autocomplete = autocomplete;
  l.append(i);
  form.append(l);
  return i;
}
function form(parent, fields, submit, fn) {
  const f = node('form');
  parent.append(f);
  for (const [label, opts] of fields) field(f, label, opts);
  const b = node('button', submit);
  b.type = 'submit';
  f.append(b);
  f.onsubmit = async (ev) => {
    ev.preventDefault();
    b.disabled = true;
    status('');
    try {
      await fn(Object.fromEntries(new FormData(f)), f);
    } catch (e) {
      error(e);
    } finally {
      b.disabled = false;
    }
  };
  return f;
}
function safeReturn() {
  const query = new URLSearchParams(location.search).get('returnTo');
  if (!query) return '/account/';
  try {
    const u = new URL(query, location.origin);
    if (
      u.origin === location.origin &&
      /^\/(account|create|templates|tools)(\/|$)/.test(u.pathname)
    )
      return u.pathname + u.search;
  } catch {}
  return '/account/';
}
function signInRequired(parent) {
  const s = section(
    parent,
    'Sign in to continue',
    'Use your verified account to access this page.',
  );
  s.append(
    link(
      'Sign in',
      '/signin/?returnTo=' + encodeURIComponent(location.pathname),
    ),
    document.createTextNode(' · '),
    link('Create an account', '/signup/'),
  );
}
async function authPage(path) {
  const f = root().querySelector('[data-auth-form]');
  if (!f) return;
  api('/api/session')
    .then((s) => {
      if (s.localTestInbox)
        f.prepend(
          node(
            'p',
            'Local test inbox is active. Use an address ending in @example.test. Messages stay on this computer.',
            'notice',
          ),
        );
    })
    .catch(() => {});
  f.onsubmit = async (e) => {
    e.preventDefault();
    const b = f.querySelector('button'),
      d = Object.fromEntries(new FormData(f));
    b.disabled = true;
    status('');
    try {
      if (path === '/signup/') {
        await api('/api/session');
        await api('/api/auth/sign-up/email', {
          ...d,
          callbackURL: location.origin + safeReturn(),
        });
        status('Check your inbox for the verification link.');
        f.reset();
      } else if (path === '/signin/') {
        await api('/api/auth/sign-in/email', {
          ...d,
          callbackURL: location.origin + safeReturn(),
        });
        location.assign(safeReturn());
      } else if (path === '/verify-email/') {
        await api('/api/auth/send-verification-email', {
          email: d.email,
          callbackURL: location.origin + '/account/',
        });
        status(
          'If your account needs verification, a new link will arrive by email.',
        );
      } else if (path === '/forgot-password/') {
        await api('/api/auth/request-password-reset', {
          email: d.email,
          redirectTo: location.origin + '/reset-password/',
        });
        status(
          'If the address matches an account, check your inbox for a password reset link.',
        );
      } else {
        const token =
          new URLSearchParams(location.hash.slice(1)).get('token') ||
          new URLSearchParams(location.search).get('token');
        if (!token)
          throw Error(
            'Open the reset link from your email or request another one.',
          );
        await api('/api/auth/reset-password', {
          token,
          newPassword: d.password,
        });
        history.replaceState(null, '', location.pathname);
        f.reset();
        f.hidden = true;
        status('Password updated. Sign in using your new password.');
        root()
          .querySelector('[data-account-content]')
          .append(link('Sign in', '/signin/'));
      }
    } catch (err) {
      error(err);
    } finally {
      b.disabled = false;
    }
  };
}
const when = (n, tz) =>
  new Intl.DateTimeFormat('en-US', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: tz || undefined,
  }).format(new Date(n * 1000));
async function pricing(parent, session) {
  const s = section(
    parent,
    'Paid membership',
    'A paid plan starts when you purchase it, including during a trial. Review the price and renewal terms before confirming in Checkout.',
  );
  const { plans, testMode } = await api('/api/billing/plans');
  if (!plans.length) {
    s.append(node('p', 'Paid plans are currently unavailable.'));
    return;
  }
  if (testMode)
    s.append(
      node(
        'p',
        'Test checkout. These plans do not create a live subscription.',
        'notice',
      ),
    );
  for (const p of plans) {
    const price = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(p.amountCents / 100);
    if (session?.user)
      s.append(
        button('Subscribe · ' + price + ' per ' + p.interval, async () => {
          const { url } = await api('/api/billing/checkout', { plan: p.key });
          stripeRedirect(url, 'checkout.stripe.com');
        }),
      );
    else
      s.append(
        node('p', price + ' per ' + p.interval),
        link(
          'Sign in to choose this plan',
          '/signin/?returnTo=/account/billing/',
        ),
      );
  }
}
function stripeRedirect(url, host) {
  const u = new URL(url);
  if (u.protocol !== 'https:' || u.hostname !== host)
    throw Error('The billing provider returned an invalid link.');
  location.assign(u.href);
}
function membership(parent, s) {
  const p = section(parent, 'Your access');
  const active =
    s.billingStatus === 'active' && s.premium
      ? 'Paid membership'
      : s.premium
        ? 'Trial active'
        : s.user
          ? 'No active membership'
          : 'Guest access';
  p.append(
    node('strong', active),
    node(
      'p',
      s.freeUsed + ' of ' + s.freeLimit + ' permanent free selections used.',
    ),
  );
  if (s.trialEndsAt)
    p.append(node('p', 'Trial end · ' + when(s.trialEndsAt, s.timeZone)));
  if (s.cancelAtPeriodEnd)
    p.append(
      node(
        'p',
        'Your subscription is scheduled to end at the close of the paid period.',
      ),
    );
  if (s.paidThrough)
    p.append(node('p', 'Paid through · ' + when(s.paidThrough, s.timeZone)));
  if (s.billingStatus !== 'none')
    p.append(
      node('p', 'Billing status · ' + s.billingStatus.replaceAll('_', ' ')),
    );
}
function editable(parent, d) {
  const box = section(
    parent,
    d.title,
    'Revision ' + d.revision + ' · ' + d.kind.replaceAll('-', ' '),
  );
  if (d.kind === 'form')
    box.append(
      link(
        'Open form builder',
        '/create/form/?document=' + encodeURIComponent(d.id),
      ),
    );
  if (d.kind === 'chart')
    box.append(
      link(
        'Open in Chart Studio',
        '/create/chart/?document=' + encodeURIComponent(d.id),
      ),
    );
  if (d.kind === 'template' && /^ta-[a-z0-9-]+-001$/.test(d.templateId))
    box.append(
      link(
        'Open template editor',
        '/templates/' +
          d.templateId.slice(3, -4) +
          '/?document=' +
          encodeURIComponent(d.id),
      ),
    );
  const editor = node('div');
  box.append(editor);
  const read = savedInputs(editor, d);
  if (read) {
    const revisionLabel = box.querySelector('p');
    box.append(
      button('Save revision', async () => {
        const data = read(),
          saved = await api(
            '/api/documents/' + d.id,
            { data, expectedRevision: d.revision },
            'PATCH',
          );
        d.data = data;
        d.revision = saved.revision;
        revisionLabel.textContent =
          'Revision ' + d.revision + ' · ' + d.kind.replaceAll('-', ' ');
        status('Saved revision ' + d.revision + '.');
      }),
    );
  }
  const formats = d.formats || [];
  for (const format of formats)
    box.append(
      button(
        'Download ' + format.toUpperCase(),
        async () => {
          const out = await api(
            '/api/exports',
            { documentId: d.id, documentRevision: d.revision, format },
            'POST',
            d.id + '-' + d.revision + '-' + format,
          );
          await download((await awaitExport(out, status)).intent);
        },
        'secondary',
      ),
    );
}
async function showDocs(parent) {
  const [{ documents }, { saved }] = await Promise.all([
    api('/api/documents'),
    api('/api/account/saved'),
  ]);
  const library = section(
    parent,
    'Saved templates',
    saved.length
      ? 'Organized by collection.'
      : 'Save a template from its collection page to find it here.',
  );
  const groups = new Map();
  for (const item of saved) {
    if (!groups.has(item.collection))
      groups.set(item.collection, section(library, item.collection));
    const row = node('p');
    row.append(
      item.path ? link(item.title, item.path) : node('span', item.title),
      document.createTextNode(' '),
      button(
        'Remove',
        async () => {
          await api(
            '/api/account/saved',
            { templateId: item.templateId, collection: item.collection },
            'DELETE',
          );
          row.remove();
          status('Removed from ' + item.collection + '.');
        },
        'secondary',
      ),
    );
    groups.get(item.collection).append(row);
  }
  if (!documents.length) {
    section(
      parent,
      'No saved documents yet',
      'Create a document in a builder to see it here.',
    ).append(link('Browse templates', '/templates/'));
    return;
  }
  for (const d of documents) {
    const s = section(
      parent,
      d.title,
      'Revision ' + d.revision + ' · Updated ' + when(d.updated),
    );
    s.append(
      button(
        'Open document',
        async (b) => {
          const doc = await api('/api/documents/' + d.id);
          b.hidden = true;
          editable(s, doc);
        },
        'secondary',
      ),
      button(
        'Duplicate document',
        async () => {
          await api('/api/documents/' + d.id + '/duplicate', {});
          parent.replaceChildren();
          await showDocs(parent);
          status('A separate copy of your document was saved.');
        },
        'secondary',
      ),
      button(
        'Move to trash',
        async () => {
          if (
            !window.confirm(
              'Move this document to trash? Its private files will be scheduled for removal.',
            )
          )
            return;
          await api('/api/documents/' + d.id, undefined, 'DELETE');
          s.remove();
          status('Document moved to trash.');
        },
        'secondary',
      ),
    );
  }
}
function dataPage(parent) {
  const archive = section(
    parent,
    'Download your personal data',
    'Your archive contains your profile, membership status, and current document inputs. Each file contains up to ten documents.',
  );
  let cursor = null,
    page = 1;
  form(
    archive,
    [
      [
        'Current password',
        {
          name: 'password',
          type: 'password',
          autocomplete: 'current-password',
        },
      ],
    ],
    'Download data',
    async ({ password }, f) => {
      const data = await api('/api/account/data-export', {
        password,
        after: cursor,
      });
      const url = URL.createObjectURL(
          new Blob([JSON.stringify(data, null, 2)], {
            type: 'application/json',
          }),
        ),
        a = link('Download', url);
      a.download = 'templateatlas-account-' + page + '.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 15000);
      cursor = data.nextCursor;
      page = cursor ? page + 1 : 1;
      f.reset();
      f.querySelector('button').textContent = cursor
        ? 'Download next page'
        : 'Download data';
      status(
        cursor
          ? 'Archive page downloaded. Enter your password to download the next page.'
          : 'Your personal data was exported.',
      );
    },
  );
  const close = section(
    parent,
    'Close account',
    'This signs you out and schedules your documents for permanent removal. Paid renewals are stopped during account closure.',
  );
  form(
    close,
    [
      [
        'Current password',
        {
          name: 'password',
          type: 'password',
          autocomplete: 'current-password',
        },
      ],
      ['Type DELETE to confirm', { name: 'confirm' }],
    ],
    'Request permanent closure',
    async (d) => {
      if (d.confirm !== 'DELETE') throw Error('Type DELETE to confirm.');
      await api('/api/account', d, 'DELETE');
      parent.replaceChildren();
      status('Your session has ended. Your deletion request is pending.');
    },
  );
}
async function settings(parent, s) {
  const profile = section(parent, 'Profile');
  form(
    profile,
    [
      ['Your name', { name: 'name', value: s.user.name, autocomplete: 'name' }],
      [
        'Time zone (IANA name)',
        {
          name: 'timeZone',
          value: s.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      ],
    ],
    'Save profile',
    async (d) => {
      await api('/api/account/preferences', {
        name: d.name,
        timeZone: d.timeZone,
      });
      status('Profile saved.');
    },
  );
  const change = section(
    parent,
    'Change email address',
    'Approve the request in your current inbox, then verify the new address. Your existing trial dates are preserved.',
  );
  form(
    change,
    [
      [
        'New email address',
        { name: 'newEmail', type: 'email', autocomplete: 'email' },
      ],
    ],
    'Request email change',
    async (d) => {
      await api('/api/auth/change-email', {
        newEmail: d.newEmail,
        callbackURL: location.origin + '/account/settings/',
      });
      status('Check your current inbox for the approval request.');
    },
  );
  const devices = section(
    parent,
    'Signed-in devices',
    'Sign out a device you no longer use.',
  );
  const { sessions } = await api('/api/account/sessions');
  for (const session of sessions) {
    const row = node(
      'p',
      session.device +
        ' · Started ' +
        new Intl.DateTimeFormat('en-US', {
          dateStyle: 'medium',
          timeStyle: 'short',
          timeZone: s.timeZone || undefined,
        }).format(new Date(session.startedAt)) +
        (session.current ? ' · This session' : ''),
    );
    if (!session.current)
      row.append(
        document.createTextNode(' '),
        button(
          'Sign out this device',
          async () => {
            await api('/api/account/sessions/revoke', { id: session.id });
            row.remove();
            status('This device was signed out.');
          },
          'secondary',
        ),
      );
    devices.append(row);
  }
  const sec = section(
    parent,
    'Change password',
    'Other sessions will be signed out.',
  );
  form(
    sec,
    [
      [
        'Current password',
        {
          name: 'currentPassword',
          type: 'password',
          autocomplete: 'current-password',
        },
      ],
      [
        'New password',
        {
          name: 'newPassword',
          type: 'password',
          minLength: 12,
          autocomplete: 'new-password',
        },
      ],
    ],
    'Update password',
    async (d, f) => {
      await api('/api/auth/change-password', {
        ...d,
        revokeOtherSessions: true,
      });
      f.reset();
      status('Password updated.');
    },
  );
  sec.append(
    button(
      'Sign out of other sessions',
      async () => {
        await api('/api/auth/revoke-other-sessions', {});
        status('Other sessions were signed out.');
      },
      'secondary',
    ),
  );
}
export async function startAccount() {
  const r = root();
  if (!r) return;
  const p = r.dataset.accountPath,
    parent = r.querySelector('[data-account-content]');
  try {
    if (r.querySelector('[data-auth-form]')) {
      await authPage(p);
      return;
    }
    if (p.startsWith('/admin/')) {
      const { showAdmin } = await import('./admin-ui.mjs');
      await showAdmin(parent, p, {
        api,
        section,
        form,
        button,
        status,
        link,
        node,
      });
      return;
    }
    if (p === '/checkout/cancel/') return;
    const s = await api('/api/session');
    if (p === '/pricing/') {
      await pricing(parent, s);
      return;
    }
    if (!s.user) {
      signInRequired(parent);
      return;
    }
    if (p === '/account/documents/') await showDocs(parent);
    else if (p === '/account/settings/') await settings(parent, s);
    else if (p === '/account/data/') dataPage(parent);
    else if (p === '/account/billing/') {
      membership(parent, s);
      if (s.billingStatus !== 'none')
        parent.append(
          button('Manage billing', async () =>
            stripeRedirect(
              (await api('/api/billing/portal', {})).url,
              'billing.stripe.com',
            ),
          ),
        );
      await pricing(parent, s);
    } else {
      membership(parent, s);
      const box = section(
        parent,
        p === '/checkout/success/'
          ? 'Subscription confirmation'
          : 'Your workspace',
      );
      if (p === '/checkout/success/')
        box.append(
          node(
            'p',
            s.billingStatus === 'active'
              ? 'Your paid membership is active.'
              : 'No active paid subscription has been confirmed. Refresh after a moment.',
          ),
          button('Refresh status', () => location.reload()),
        );
      box.append(
        link('Open my documents', '/account/documents/'),
        document.createTextNode(' · '),
        link('Membership and billing', '/account/billing/'),
      );
      box.append(
        node('p', s.user.email),
        button(
          'Sign out',
          async () => {
            await api('/api/auth/sign-out', {});
            location.assign('/signin/');
          },
          'secondary',
        ),
      );
    }
  } catch (e) {
    error(e);
  }
}
