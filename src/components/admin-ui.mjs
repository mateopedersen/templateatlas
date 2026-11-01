export async function showAdmin(parent, path, h) {
  const { api, section, form, button, status, node } = h;
  const session = await api('/api/admin/session');
  if (!session.unlocked) {
    const s = section(
      parent,
      'Authenticator verification',
      'Enter the current code from your operator authenticator.',
    );
    form(
      s,
      [['Six-digit code', { name: 'code', autocomplete: 'one-time-code' }]],
      'Unlock for 10 minutes',
      async (d) => {
        await api('/api/admin/unlock', d);
        location.reload();
      },
    );
    return;
  }
  if (path === '/admin/audit/') {
    const { events } = await api('/api/admin/audit');
    if (!events.length) section(parent, 'No administrative actions recorded');
    for (const e of events)
      section(parent, e.action.replaceAll('_', ' '), e.reason).append(
        node(
          'small',
          new Date(e.created * 1000).toISOString() +
            ' · ' +
            e.operator +
            ' · ' +
            e.target,
        ),
      );
  } else if (path === '/admin/members/') {
    const s = section(
      parent,
      'Find a member',
      'Lookups are recorded in the audit history.',
    );
    form(
      s,
      [
        ['Member email', { name: 'email', type: 'email' }],
        ['Reason for this lookup', { name: 'reason', minLength: 6 }],
      ],
      'Look up member',
      async (d) => {
        const m = await api('/api/admin/members', d);
        status(
          m.name +
            ' · ' +
            m.email +
            ' · ' +
            (m.verified ? 'Verified' : 'Unverified'),
        );
      },
    );
  } else if (path === '/admin/catalog/') {
    const s = section(parent, 'Catalog search'),
      list = node('div');
    parent.append(list);
    async function search(q) {
      const { templates } = await api(
        '/api/admin/catalog?q=' + encodeURIComponent(q),
      );
      list.replaceChildren();
      if (!templates.length)
        list.append(node('p', 'No matching published records.'));
      for (const row of templates) {
        const c = section(
          list,
          row.id,
          row.files +
            ' published formats · ' +
            (row.held ? 'Delivery suspended' : 'Delivery enabled'),
        );
        c.append(
          button(
            'Inspect release',
            async (b) => {
              const release = await api(
                '/api/admin/catalog?id=' + encodeURIComponent(row.id),
              );
              b.remove();
              for (const f of release.files)
                c.append(
                  node(
                    'p',
                    f.format.toUpperCase() +
                      ' · ' +
                      f.bytes.toLocaleString('en-US') +
                      ' bytes · Version ' +
                      f.version,
                  ),
                );
              form(
                c,
                [['Reason for change', { name: 'reason', minLength: 6 }]],
                release.held
                  ? 'Verify and restore delivery'
                  : 'Suspend delivery',
                async (d) => {
                  await api(
                    '/api/admin/templates/' +
                      encodeURIComponent(row.id) +
                      '/' +
                      (release.held ? 'publish' : 'unpublish'),
                    { reason: d.reason, expected: release.fingerprint },
                  );
                  await search(q);
                  status('Delivery setting updated.');
                },
              );
            },
            'secondary',
          ),
        );
      }
    }
    form(
      s,
      [['Template ID contains', { name: 'query', required: false }]],
      'Search',
      async (d) => search(d.query),
    );
    await search('');
  } else {
    const stats = await api('/api/admin/overview');
    const labels = {
      catalogTemplates: 'Published templates',
      deliveryHolds: 'Delivery holds',
      pendingTransfers: 'Pending guest transfers',
      pendingBillingEvents: 'Unreconciled billing events',
      pendingClosures: 'Pending account closures',
    };
    for (const [key, value] of Object.entries(stats))
      section(parent, labels[key] || key, String(value));
    if (path === '/admin/jobs/') {
      const inbox = section(
        parent,
        'Support inbox',
        'The oldest open requests appear first.',
      );
      const { requests } = await api('/api/admin/support');
      if (!requests.length) inbox.append(node('p', 'No open requests.'));
      for (const r of requests) {
        const card = section(inbox, r.subject, r.message);
        card.append(node('p', r.id + ' · ' + r.email));
        form(
          card,
          [['Resolution note', { name: 'reason', minLength: 6 }]],
          'Close request',
          async (d) => {
            await api('/api/admin/support/close', { id: r.id, ...d });
            card.remove();
            status('Support request closed.');
          },
        );
      }
      const s = section(
        parent,
        'Run pending maintenance',
        'Retries unfinished guest transfers, reconciles billing events, and processes eligible deletions.',
      );
      form(
        s,
        [['Reason for retry', { name: 'reason', minLength: 6 }]],
        'Retry pending work',
        async (d) => {
          await api('/api/admin/jobs/retry', d);
          location.reload();
        },
      );
    }
  }
}
