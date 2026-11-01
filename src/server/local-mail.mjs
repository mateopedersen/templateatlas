import {
  ApiError,
  digest,
  hex,
  json,
  object,
  requireValue,
  sign,
  unix,
  uuid,
  verify,
} from './common.mjs';
const loopbacks = new Set(['localhost', '127.0.0.1', '[::1]']);
const parseHex = (s) => Uint8Array.from(s.match(/../g), (b) => parseInt(b, 16));
export function localMailEnabled(env) {
  if (
    env.DEPLOY_STAGE !== 'local' ||
    env.LOCAL_MAILBOX_ENABLED !== 'true' ||
    typeof env.LOCAL_MAILBOX_SECRET !== 'string' ||
    env.LOCAL_MAILBOX_SECRET.length < 32
  )
    return false;
  try {
    const url = new URL(env.PUBLIC_SITE_URL);
    return (
      loopbacks.has(url.hostname) &&
      url.origin === env.PUBLIC_SITE_URL &&
      ['http:', 'https:'].includes(url.protocol)
    );
  } catch {
    return false;
  }
}
async function encryptionKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    parseHex(await digest('templateatlas-local-mail|' + secret)),
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );
}
export async function captureLocalMail(env, to, subject, text) {
  requireValue(localMailEnabled(env), 'DEPENDENCY_UNAVAILABLE');
  requireValue(/^[^@\s]{1,64}@example\.test$/i.test(to), 'VALIDATION_ERROR');
  const id = crypto.randomUUID(),
    iv = crypto.getRandomValues(new Uint8Array(12)),
    now = unix();
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(id) },
    await encryptionKey(env.LOCAL_MAILBOX_SECRET),
    new TextEncoder().encode(JSON.stringify({ to, subject, text })),
  );
  await env.DB.batch([
    env.DB.prepare('DELETE FROM local_test_messages WHERE expires<=?').bind(
      now,
    ),
    env.DB.prepare('INSERT INTO local_test_messages VALUES(?,?,?,?,?)').bind(
      id,
      now,
      now + 3600,
      hex(iv),
      hex(encrypted),
    ),
  ]);
}
async function inboxSession(request, env) {
  const cookie = /(?:^|;\s*)__Host-atlas-local-inbox=([\w.-]+)/.exec(
    request.headers.get('cookie') || '',
  )?.[1];
  if (!cookie) return false;
  const [time, nonce, sig] = cookie.split('.');
  return (
    uuid(nonce) &&
    Number(time) > unix() &&
    Number(time) <= unix() + 600 &&
    (await verify(
      env.LOCAL_MAILBOX_SECRET,
      'session|' + time + '|' + nonce,
      sig,
    ))
  );
}
const page = `<!doctype html><html lang="en-US"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>TemplateAtlas local test inbox</title><style>
body{max-width:48rem;margin:3rem auto;padding:0 1rem;background:#faf8f3;color:#32252b;font:1rem/1.5 system-ui}section{background:white;border:1px solid #d4c9ce;padding:1rem;margin:1rem 0}a{color:#671432}button{padding:.65rem 1rem}pre{white-space:pre-wrap;overflow-wrap:anywhere}
</style><main><p>TemplateAtlas · Local development</p><h1>Test inbox</h1><p>Test messages stay on this computer for one hour. Only addresses ending in @example.test are accepted. No email is delivered externally.</p><button id="refresh">Refresh inbox</button><p role="status" id="status"></p><div id="messages"></div></main>
<script nonce="__NONCE__">
const stat=document.getElementById('status'),list=document.getElementById('messages');
async function inbox(){
 const token=location.hash.slice(1);if(token)history.replaceState(null,'',location.pathname);
 try{
  if(token){const u=await fetch(location.pathname+'/unlock',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});if(!u.ok)throw Error('The owner link expired or was already used. Launch a new local inbox link.');}
  const r=await fetch(location.pathname+'/messages');if(!r.ok)throw Error('Open this inbox with the local owner launcher.');
  const {messages}=await r.json();list.replaceChildren();stat.textContent=messages.length+' captured test messages.';
  for(const m of messages){const section=document.createElement('section'),h=document.createElement('h2'),who=document.createElement('p'),body=document.createElement('p');h.textContent=m.subject;who.textContent=m.to;body.textContent=m.text.split('\\n\\n')[0];section.append(h,who,body);
   const action=document.createElement('button');action.textContent='Open the test email link';action.onclick=async()=>{const r=await fetch(location.pathname+'/open',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:m.id})});if(!r.ok){stat.textContent='This action expired or was already opened.';return;}const next=await r.json();location.assign(next.redirect);};section.append(action);
   list.append(section);}
 }catch(e){stat.textContent=e.message;}
}
document.getElementById('refresh').onclick=inbox;inbox();
</script></html>`;
export async function localMailbox(request, env, path) {
  requireValue(
    localMailEnabled(env) &&
      new URL(request.url).origin === env.PUBLIC_SITE_URL,
    'NOT_FOUND',
  );
  if (path === '/api/dev/mailbox' && request.method === 'GET') {
    const nonce = crypto.randomUUID();
    return new Response(page.replace('__NONCE__', nonce), {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'private, no-store',
        'Referrer-Policy': 'no-referrer',
        'X-Robots-Tag': 'noindex',
        'Content-Security-Policy':
          "default-src 'none'; script-src 'nonce-" +
          nonce +
          "'; connect-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
      },
    });
  }
  if (path === '/api/dev/mailbox/unlock' && request.method === 'POST') {
    const { token } = await object(request);
    requireValue(
      typeof token === 'string' && token.length < 300,
      'ACCESS_REVOKED',
    );
    const [expires, nonce, sig] = token.split('.');
    requireValue(
      uuid(nonce) &&
        /^\d{10}$/.test(expires) &&
        Number(expires) >= unix() &&
        Number(expires) <= unix() + 120 &&
        (await verify(
          env.LOCAL_MAILBOX_SECRET,
          'unlock|' + expires + '|' + nonce,
          sig,
        )),
      'ACCESS_REVOKED',
    );
    const [_, used] = await env.DB.batch([
      env.DB.prepare('DELETE FROM local_inbox_nonces WHERE expires<?').bind(
        unix(),
      ),
      env.DB.prepare(
        'INSERT OR IGNORE INTO local_inbox_nonces VALUES(?,?)',
      ).bind(nonce, Number(expires)),
    ]);
    requireValue(used.meta.changes === 1, 'ACCESS_REVOKED');
    const until = unix() + 600,
      s = await sign(
        env.LOCAL_MAILBOX_SECRET,
        'session|' + until + '|' + nonce,
      );
    const r = json({ unlocked: true });
    r.headers.append(
      'Set-Cookie',
      '__Host-atlas-local-inbox=' +
        until +
        '.' +
        nonce +
        '.' +
        s +
        '; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=600',
    );
    return r;
  }
  if (path === '/api/dev/mailbox/open' && request.method === 'POST') {
    requireValue(await inboxSession(request, env), 'ACCESS_REVOKED');
    const { id } = await object(request);
    requireValue(uuid(id));
    const row = await env.DB.prepare(
      'DELETE FROM local_test_messages WHERE id=? AND expires>? RETURNING iv,ciphertext',
    )
      .bind(id, unix())
      .first();
    requireValue(row, 'TICKET_EXPIRED');
    const decoded = JSON.parse(
      new TextDecoder().decode(
        await crypto.subtle.decrypt(
          {
            name: 'AES-GCM',
            iv: parseHex(row.iv),
            additionalData: new TextEncoder().encode(id),
          },
          await encryptionKey(env.LOCAL_MAILBOX_SECRET),
          parseHex(row.ciphertext),
        ),
      ),
    );
    const target = new URL(decoded.text.trim().split('\n').at(-1));
    requireValue(
      target.origin === env.PUBLIC_SITE_URL &&
        (target.pathname === '/api/auth/verify-email' ||
          target.pathname.startsWith('/api/auth/reset-password/')),
      'ACCESS_REVOKED',
    );
    const { authResponse } = await import('./identity.mjs');
    const authResult = await authResponse(
      env,
      new Request(target, { headers: request.headers }),
    );
    requireValue(
      authResult.status >= 200 && authResult.status < 400,
      'TICKET_EXPIRED',
    );
    const next = new URL(
      authResult.headers.get('location') || '/account/',
      env.PUBLIC_SITE_URL,
    );
    requireValue(next.origin === env.PUBLIC_SITE_URL, 'ACCESS_REVOKED');
    if (
      next.pathname === '/reset-password/' &&
      next.searchParams.has('token')
    ) {
      next.hash = new URLSearchParams({
        token: next.searchParams.get('token'),
      });
      next.searchParams.delete('token');
    }
    const out = json({ redirect: next.pathname + next.search + next.hash });
    for (const cookie of authResult.headers.getSetCookie())
      out.headers.append('Set-Cookie', cookie);
    return out;
  }
  if (path === '/api/dev/mailbox/messages' && request.method === 'GET') {
    requireValue(await inboxSession(request, env), 'ACCESS_REVOKED');
    const now = unix();
    await env.DB.prepare('DELETE FROM local_test_messages WHERE expires<=?')
      .bind(now)
      .run();
    const records = (
      await env.DB.prepare(
        'SELECT id,iv,ciphertext FROM local_test_messages WHERE expires>? ORDER BY delivered DESC,id DESC LIMIT 20',
      )
        .bind(now)
        .all()
    ).results;
    const key = await encryptionKey(env.LOCAL_MAILBOX_SECRET),
      messages = [];
    for (const row of records) {
      const bytes = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: parseHex(row.iv),
          additionalData: new TextEncoder().encode(row.id),
        },
        key,
        parseHex(row.ciphertext),
      );
      const msg = JSON.parse(new TextDecoder().decode(bytes));
      messages.push({
        id: row.id,
        to: msg.to,
        subject: msg.subject,
        text: msg.text.split('\n\n')[0],
      });
    }
    return json({ messages, delivery: 'local_capture' });
  }
  throw new ApiError('NOT_FOUND');
}
