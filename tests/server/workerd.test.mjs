import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {randomBytes,createHash,createHmac} from 'node:crypto';
import {build} from 'esbuild';
import {SignJWT,generateKeyPair,exportJWK} from 'jose';
import {createOTP} from '@better-auth/utils/otp';
import {base32} from '@better-auth/utils/base32';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {initial} from '../../src/charts/model.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url)), origin='https://atlas.example.test';
const secret=()=>randomBytes(32).toString('hex');
test('workerd HTTP, SQLite D1/DO and R2 with local email and Stripe service doubles',async t=>{
  const bundled=await build({stdin:{contents:`import {handleApi} from './src/server/index.mjs';
    export {DownloadActor} from './src/server/index.mjs';export default {fetch:handleApi};`,resolveDir:root},
    platform:'browser',bundle:true,format:'esm',write:false,conditions:['workerd','worker','browser'],external:['node:*']});
  const mail=[], signing=secret();
  let stripeSubscribed=true, conversions=0;
  const adminKeys=await generateKeyPair('RS256'), operatorSeed=randomBytes(20);
  const publicKey={...await exportJWK(adminKeys.publicKey),kid:'unit-key',alg:'RS256',use:'sig'};
  const issuer='https://atlas-tests.cloudflareaccess.com',operator='operator@example.test';
  const adminToken=aud=>new SignJWT({type:'app',email:operator}).setSubject('test-operator').setProtectedHeader({alg:'RS256',kid:'unit-key'}).setAudience(aud).setIssuer(issuer).setIssuedAt().setExpirationTime('10m').sign(adminKeys.privateKey);
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2026-10-01',compatibilityFlags:['nodejs_compat'],
    d1Databases:['DB'],r2Buckets:['ASSET_ORIGINALS','USER_DOCUMENTS'],durableObjects:{DOWNLOAD_ACTORS:{className:'DownloadActor',useSQLite:true}},
    serviceBindings:{PRIVATE_RENDERER:async r=>{conversions++;await r.arrayBuffer();await new Promise(done=>setTimeout(done,100));const pdf='%PDF-1.4\nTest renderer';return new Response(pdf,{headers:{'content-type':'application/pdf','content-length':String(pdf.length)}});}},
    bindings:{RENDER_SECRET:secret(),ACCESS_ISSUER:issuer,ACCESS_AUD:'unit-app',ADMIN_TOTP_KEYS:JSON.stringify({[operator]:base32.encode(operatorSeed,{padding:false})}),PUBLIC_SITE_URL:origin,GUEST_COOKIE_SIGNING_KEY:secret(),DOWNLOAD_TOKEN_SECRET:secret(),AUTH_SECRET:secret(),
      EMAIL_API_KEY:secret(),EMAIL_FROM:'TemplateAtlas <verify@example.test>',STRIPE_WEBHOOK_SECRET:signing,STRIPE_SECRET_KEY:'sk_test_'+secret(),STRIPE_PRICE_ID_MONTHLY:'price_demo'},
    outboundService:async request=>{
      const u=new URL(request.url);
      if(u.href===issuer+'/cdn-cgi/access/certs')return Response.json({keys:[publicKey]});
      if(u.origin==='https://api.resend.com') {mail.push(await request.json());return Response.json({id:'local-test'});}
      if(u.origin==='https://api.stripe.com' && u.pathname==='/v1/subscriptions') return Response.json({has_more:false,data:[{
        customer:'cus_demo',status:stripeSubscribed?'active':'past_due',livemode:false,latest_invoice:{status:'paid'},
        items:{data:[{price:{id:'price_demo'},current_period_end:Math.floor(Date.now()/1000)+86400}]}
      }]});
      throw Error('Unexpected external call');
    }}));
  t.after(()=>mf.dispose());
  const db=await mf.getD1Database('DB'),r2=await mf.getR2Bucket('ASSET_ORIGINALS');
  const sql=(await Promise.all((await readdir(root+'migrations')).filter(name=>name.endsWith('.sql')).sort().map(name=>readFile(root+'migrations/'+name,'utf8')))).join('\n');
  let statement='';
  for(const line of sql.split('\n')) {
    if(!line.trim()||line.trim().startsWith('--'))continue;
    statement+=line+'\n';
    if(!line.trim().endsWith(';') || (/^CREATE TRIGGER/i.test(statement) && !line.trim().startsWith('END;')))continue;
    await db.prepare(statement).run();statement='';
  }
  const bytes=Buffer.from('Private test payload'), hash=createHash('sha256').update(bytes).digest('hex');
  for(let i=0;i<7;i++){
    await db.prepare(`INSERT INTO downloadable_assets(id,template_id,version,format,object_key,sha256,size_bytes,filename,mime,published)
      VALUES(?,?,'v1','txt',?,?,?,?,?,1)`).bind('a'+i,'t'+i,'key'+i,hash,bytes.length,'template.txt','text/plain').run();
    if(i<6)await r2.put('key'+i,bytes,{...i>0?{sha256:hash}:{},customMetadata:{sha256:hash}});
  }
  const req=(path,{cookie='',method='GET',body,headers={}}={})=>mf.dispatchFetch(origin+path,{method,redirect:'manual',
    headers:{origin,cookie,'content-type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});
  const guest=async()=> (await req('/api/session')).headers.get('set-cookie').split(';')[0];
  const cookie=await guest(), stranger=await guest();
  const postIntent=(i,c=cookie,key=crypto.randomUUID())=>req('/api/download-intents',{method:'POST',cookie:c,headers:{'idempotency-key':key},body:{templateId:'t'+i,format:'txt'}});
  await t.test('missing R2 object spends nothing, CSRF rejected',async()=>{
    assert.equal((await postIntent(6)).status,409);
    assert.equal((await(await req('/api/session',{cookie})).json()).freeUsed,0);
    assert.equal((await req('/api/download-intents',{cookie,method:'POST',headers:{origin:'https://other.example'}})).status,403);
  });
  await t.test('same-size R2 replacement with stale uploader metadata does not spend a slot',async()=>{
    const prepared=await postIntent(0);const {url}=await prepared.json();
    const wrong=Buffer.from(bytes);wrong[0]^=1;
    await r2.put('key0',wrong,{customMetadata:{sha256:hash}});
    const unavailable=await req(url,{cookie});assert.equal(unavailable.status,409);
    assert.equal((await(await req('/api/session',{cookie})).json()).freeUsed,0);
    await r2.put('key0',bytes,{customMetadata:{sha256:hash}});
  });
  await t.test('50 concurrent intents honor the fifth slot, actor-bound Range and retry',async()=>{
    for(let i=0;i<4;i++){
      const r=await postIntent(i);assert.equal(r.status,200);const {url}=await r.json();
      assert.equal(await(await req(url,{cookie})).text(),bytes.toString());
    }
    const attempts=await Promise.all(Array.from({length:50},(_,i)=>postIntent(4+i%2)));
    const statuses=attempts.map(a=>a.status);assert.equal(statuses.filter(s=>s===200).length,25);assert.equal(statuses.filter(s=>s===403).length,25);
    const {url}=await attempts[statuses.indexOf(200)].json();
    assert.equal((await req(url,{cookie:stranger})).status,404);
    for(let i=0;i<2;i++){
      const range=await req(url,{cookie,headers:{range:'bytes=0-6'}});
      assert.equal(range.status,206);assert.equal(await range.text(),'Private');
    }
    assert.equal((await(await req('/api/session',{cookie})).json()).freeUsed,5);
  });
  await t.test('owned revision, private SVG export, idempotent retry and owner isolation',async()=>{
    const chart=initial('bar-graph');
    const draft=await req('/api/documents',{cookie:stranger,method:'POST',body:{kind:'chart',data:chart}});
    assert.equal(draft.status,200);const {id,revision}=await draft.json();
    assert.equal((await req('/api/documents/'+id,{cookie})).status,404);
    assert.equal((await req('/api/documents/'+id,{cookie:stranger,method:'PATCH',body:{expectedRevision:2,data:chart}})).status,409);
    const options={cookie:stranger,method:'POST',body:{documentId:id,documentRevision:revision,format:'svg'},headers:{'idempotency-key':'chart-export-one'}};
    const ex=await req('/api/exports',options);assert.equal(ex.status,200);const out=await ex.json();
    assert.equal((await(await req('/api/exports',options)).json()).id,out.id);
    const it=await req('/api/download-intents',{cookie:stranger,method:'POST',body:out.intent,headers:{'idempotency-key':'chart-intent-one'}});
    const url=(await it.json()).url;assert.match(await(await req(url,{cookie:stranger})).text(),/<svg/);
    assert.equal((await req('/api/exports/'+out.id,{cookie})).status,404);
    const native=await req('/api/exports',{...options,body:{...options.body,format:'xlsx'},headers:{'idempotency-key':'chart-native-one'}});
    assert.equal(native.status,200);const n=(await native.json()).intent;
    const nt=await req('/api/download-intents',{cookie:stranger,method:'POST',body:n,headers:{'idempotency-key':'native-intent-one'}});
    const nb=await(await req((await nt.json()).url,{cookie:stranger})).arrayBuffer();
    assert.equal(Buffer.from(nb).subarray(0,2).toString(),'PK');
    assert.equal((await(await req('/api/session',{cookie:stranger})).json()).freeUsed,1);
  });
  let authCookie; const password=secret();
  await t.test('Better Auth email signup, real token verification, transfer of five guest grants',async()=>{
    const signup=await req('/api/auth/sign-up/email',{cookie,method:'POST',body:{email:'reader@example.test',password,name:'Test Reader',callbackURL:origin+'/account/'}});
    const signed=await signup.text();assert.equal(signup.status,200,signed.slice(0,350));assert.equal(mail.length,1);
    assert.equal((await db.prepare('SELECT count(*) AS n FROM first_verifications').first()).n,0);
    const link=new URL(mail[0].text.split('\n').at(-1));assert.equal(link.origin,origin);
    const verified=await req(link.pathname+link.search,{cookie});assert.equal(verified.status,302);
    authCookie=verified.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
    const summary=await req('/api/session',{cookie:cookie+'; '+authCookie});const body=await summary.json();
    assert.equal(summary.status,200,JSON.stringify(body));
    assert.equal(body.user.verified,true);assert.equal(body.freeUsed,5);assert.equal(body.premium,true);
    assert.ok(Math.abs(body.trialEndsAt-Math.floor(Date.now()/1000)-30*86400)<=5);
    assert.equal((await(await req('/api/session',{cookie})).json()).signInRequired,true);
  });
  await t.test('signed webhook reconciles Stripe current state; stale values and forged signatures rejected',async()=>{
    const uid=await db.prepare('SELECT id FROM user WHERE email=?').bind('reader@example.test').first('id');
    await db.prepare('INSERT INTO billing_customers VALUES(?,?)').bind(uid,'cus_demo').run();
    const webhook=async(id,bad=false)=>{
      const event={id,livemode:false,type:'customer.subscription.updated',data:{object:{customer:'cus_demo',status:'active'}}};
      const ts=Math.floor(Date.now()/1000),mac=createHmac('sha256',signing).update(ts+'.'+JSON.stringify(event)).digest('hex');
      return req('/api/webhooks/stripe',{method:'POST',body:event,headers:{'stripe-signature':'t='+ts+',v1='+(bad?'0'.repeat(64):mac)}});
    };
    assert.equal((await webhook('evt_bad',true)).status,403);
    assert.equal((await webhook('evt_first')).status,200);
    assert.equal((await webhook('evt_first')).status,200);
    assert.equal((await(await req('/api/session',{cookie:authCookie})).json()).billingStatus,'active');
    stripeSubscribed=false;assert.equal((await webhook('evt_late')).status,200);
    const overdue=await(await req('/api/session',{cookie:authCookie})).json();
    assert.equal(overdue.billingStatus,'past_due');assert.equal(overdue.premium,false);
  });
  await t.test('admin JWT issuer/audience, second factor, replay protection and audited file holds',async()=>{
    assert.equal((await req('/api/admin/session')).status,403);
    assert.equal((await req('/api/admin/session',{headers:{'cf-access-jwt-assertion':await adminToken('wrong-audience')}})).status,403);
    const headers={'cf-access-jwt-assertion':await adminToken('unit-app')};
    assert.deepEqual(await(await req('/api/admin/session',{headers})).json(),{unlocked:false});
    assert.equal((await req('/api/admin/overview',{headers})).status,403);
    const code=await createOTP(operatorSeed).totp();
    const unlock=await req('/api/admin/unlock',{headers,method:'POST',body:{code}});
    assert.equal(unlock.status,200);const adminCookie=unlock.headers.get('set-cookie').split(';')[0];
    assert.equal((await req('/api/admin/unlock',{headers,method:'POST',body:{code}})).status,403);
    const admin=(path,body)=>req('/api/admin/'+path,{headers,cookie:adminCookie,method:body?'POST':'GET',body});
    let release=await(await admin('catalog?id=t0')).json();
    assert.equal(release.held,false);
    const before=await postIntent(0,stranger),ticket=(await before.json()).url;
    let update={reason:'Delivery safety test',expected:release.fingerprint};
    assert.equal((await admin('templates/t0/unpublish',update)).status,200);
    assert.equal((await req(ticket,{cookie:stranger})).status,404);
    assert.equal((await postIntent(0,stranger)).status,409);
    assert.equal((await admin('templates/t0/publish',update)).status,409);
    release=await(await admin('catalog?id=t0')).json();
    assert.equal(release.held,true);
    assert.equal((await admin('templates/t0/publish',{...update,expected:release.fingerprint})).status,200);
    assert.equal((await postIntent(0,stranger)).status,200);
    assert.equal((await(await admin('audit')).json()).events.length,2);
  });
  await t.test('reauthenticated archive excludes premium assets, closure revokes private session',async()=>{
    let r=await req('/api/account/data-export',{cookie:authCookie,method:'POST',body:{password:'wrong'}});
    assert.equal(r.status,401);
    assert.equal((await req('/api/account/saved',{cookie:authCookie,method:'POST',body:{templateId:'t0',collection:'Reports'}})).status,200);
    assert.equal((await req('/api/account/preferences',{cookie:authCookie,method:'POST',body:{name:'Test Reader',timeZone:'America/Chicago'}})).status,200);
    r=await req('/api/account/data-export',{cookie:authCookie,method:'POST',body:{password}});
    assert.equal(r.status,200);const a=await r.json();assert.equal(a.profile.email,'reader@example.test');assert.deepEqual(a.documents,[]);assert.equal(a.timeZone,'America/Chicago');assert.equal(a.savedTemplates[0].collection,'Reports');
    r=await req('/api/account',{cookie:authCookie,method:'DELETE',body:{confirm:'DELETE',password}});
    assert.equal(r.status,202);assert.equal((await r.json()).state,'pending_deletion');
    assert.equal(await db.prepare('SELECT count(*) FROM session').first('count(*)'),0);
    assert.equal((await(await req('/api/session',{cookie:authCookie})).json()).user,null);
  });
  await t.test('personalized native files retain the reviewed source, revision and logical download allowance',async()=>{
    const original=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><text x="20" y="30">Guest name</text></svg>');
    const checksum=createHash('sha256').update(original).digest('hex'),templateId='ta-native-card-001';
    await db.prepare("INSERT INTO downloadable_assets(id,template_id,version,format,object_key,sha256,size_bytes,filename,mime,published) VALUES(?,?,'v1','svg',?,?,?,'card.svg','image/svg+xml',1)")
      .bind('nativecard',templateId,'original-card',checksum,original.length).run();
    await r2.put('original-card',original,{customMetadata:{sha256:checksum}});
    const owner=await guest(),another=await guest(),input={cookie:owner};
    const response=await req('/api/template-fields/'+templateId,input);assert.equal(response.status,200);
    const schema=await response.json();assert.deepEqual(schema.fields.map(f=>f.label),['Guest name']);assert.ok(!JSON.stringify(schema).includes('original-card'));
    const data={title:'Wedding place card',sourceVersion:schema.sourceVersion,sourceHash:schema.sourceHash,edits:{f1:'Morgan'}};
    const create=await req('/api/documents',{cookie:owner,method:'POST',body:{kind:'template',templateId,data}});assert.equal(create.status,200);
    const doc=await create.json();assert.equal((await req('/api/documents/'+doc.id,{cookie:another})).status,404);
    const patch=await req('/api/documents/'+doc.id,{cookie:owner,method:'PATCH',body:{expectedRevision:1,data:{...data,edits:{f1:'Jordan'}}}});assert.equal(patch.status,200);
    const post=(url,body)=>req(url,{cookie:owner,method:'POST',body,headers:{'idempotency-key':crypto.randomUUID()}});
    for(const [rev,name] of [[1,'Morgan'],[2,'Jordan']]){
      const exportResponse=await post('/api/exports',{documentId:doc.id,documentRevision:rev,format:'svg'});assert.equal(exportResponse.status,200);
      const ticket=await post('/api/download-intents',(await exportResponse.json()).intent);
      const downloaded=await req((await ticket.json()).url,input);assert.equal(downloaded.status,200);assert.ok((await downloaded.text()).includes('>'+name+'</text>'));
    }
    assert.equal((await(await req('/api/session',input)).json()).freeUsed,1);
    assert.equal((await post('/api/documents',{kind:'template',templateId,data:{...data,sourceHash:'0'.repeat(64)}})).status,409);
    const newBytes=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><text>Last name</text></svg>');
    const newHash=createHash('sha256').update(newBytes).digest('hex');
    await r2.put('upgraded-card',newBytes,{customMetadata:{sha256:newHash}});
    await db.batch([db.prepare('UPDATE downloadable_assets SET published=0 WHERE template_id=?').bind(templateId),
      db.prepare("INSERT INTO downloadable_assets(id,template_id,version,format,object_key,sha256,size_bytes,filename,mime,published) VALUES(?,?,'v2','svg',?,?,?,'card.svg','image/svg+xml',1)").bind('newcard',templateId,'upgraded-card',newHash,newBytes.length)]);
    const reopened=await(await req('/api/documents/'+doc.id,input)).json();assert.equal(reopened.source.sourceVersion,'v1');assert.equal(reopened.source.fields[0].label,'Guest name');
    const current=await(await req('/api/template-fields/'+templateId,input)).json();assert.equal(current.sourceVersion,'v2');assert.equal(current.fields[0].label,'Last name');
    assert.equal((await post('/api/documents',{kind:'template',templateId,data})).status,409);
    const createdV2=await post('/api/documents',{kind:'template',templateId,data:{...data,sourceVersion:'v2',sourceHash:newHash}});assert.equal(createdV2.status,200);
    // Restore a pre-migration draft whose release ID was overwritten when only the PDF changed.
    const v2Doc=await createdV2.json(),legacyData={...data,sourceVersion:'legacy-companion-release',sourceHash:newHash},docsBucket=await mf.getR2Bucket('USER_DOCUMENTS');
    await docsBucket.put('drafts/'+v2Doc.id+'/legacy',JSON.stringify(legacyData));
    await db.batch([db.prepare('UPDATE member_documents SET source_version=?,current_key=? WHERE id=?').bind(legacyData.sourceVersion,'drafts/'+v2Doc.id+'/legacy',v2Doc.id),
      db.prepare('UPDATE member_revisions SET object_key=? WHERE document_id=? AND revision=1').bind('drafts/'+v2Doc.id+'/legacy',v2Doc.id)]);
    const old=await(await req('/api/documents/'+v2Doc.id,input)).json();assert.equal(old.source.sourceHash,newHash);assert.equal(old.source.sourceVersion,'legacy-companion-release');
    assert.equal(await db.prepare('SELECT COUNT(*) FROM catalog_version_files WHERE template_id=? AND version=? AND sha256=?').bind(templateId,'legacy-companion-release',newHash).first('COUNT(*)'),1);
    assert.equal((await post('/api/documents',{kind:'template',templateId,data:legacyData})).status,409);

    assert.equal((await req('/api/documents/'+doc.id,{cookie:owner,method:'PATCH',body:{expectedRevision:2,data:{...data,edits:{f1:'Casey'}}}})).status,200);
    const batch=await Promise.all(Array.from({length:12},()=>post('/api/exports',{documentId:doc.id,documentRevision:3,format:'pdf'})));
    const snapshots=await Promise.all(batch.map(r=>r.json()));assert.equal(new Set(snapshots.map(a=>a.id)).size,1);assert.ok(snapshots.every(a=>['queued','running','succeeded'].includes(a.state)));
    const jobId=snapshots[0].id;assert.equal((await req('/api/exports/'+jobId,{cookie:another})).status,404);
    let job=snapshots[0];for(let i=0;i<60&&job.state!=='succeeded';i++){await new Promise(done=>setTimeout(done,30));job=await(await req('/api/exports/'+jobId,input)).json();}
    assert.equal(job.state,'succeeded');assert.equal(conversions,1);
    // Simulate a process exiting after writing bytes, before the publication transaction.
    await db.batch([db.prepare('UPDATE export_receipts SET asset_id=NULL WHERE asset_id=?').bind(jobId),
      db.prepare('DELETE FROM downloadable_assets WHERE id=?').bind(jobId),
      db.prepare("UPDATE export_jobs SET state='running',lease_token='expired',next_attempt=0,attempts=3 WHERE id=?").bind(jobId)]);
    job=await(await req('/api/exports/'+jobId,input)).json();for(let i=0;i<60&&job.state!=='succeeded';i++){await new Promise(done=>setTimeout(done,30));job=await(await req('/api/exports/'+jobId,input)).json();}
    assert.equal(job.state,'succeeded');assert.equal(conversions,1);
    const uploaded=await(await mf.getR2Bucket('USER_DOCUMENTS')).list({prefix:'exports/'+doc.id+'/3/'});assert.equal(uploaded.objects.length,1);
    const pdfTicket=(await(await post('/api/download-intents',job.intent)).json()).url;assert.equal((await req(pdfTicket,input)).headers.get('content-type'),'application/pdf');
    // A global hold also applies to the historical version and tickets issued before the hold.
    await db.prepare("INSERT INTO operator_audit(id,operator,action,target,reason,created) VALUES('version-hold','operator','unpublish',?,'Testing hold',1)").bind(templateId).run();
    await db.prepare("INSERT INTO delivery_holds(template_id,audit_id) VALUES(?,'version-hold')").bind(templateId).run();
    const held=await(await req('/api/documents/'+doc.id,input)).json();assert.equal(held.source,undefined);assert.deepEqual(held.formats,[]);assert.equal((await req(pdfTicket,input)).status,404);

  });

  await t.test('form designer saves stable IDs, protects ownership and exports the requested revision as Word and fillable PDF',async()=>{
    const owner=await guest(),other=await guest(),data={title:'Volunteer sign-up',description:'Choose an available shift.',fields:[
      {id:'contact_name',type:'short',label:'Your name',required:true,options:[]},
      {id:'shift_choice',type:'choice',label:'Shift',required:true,options:['Morning','Evening']}]};
    const call=(path,body,method='POST',cookie=owner)=>req(path,{cookie,method,body,headers:{'idempotency-key':crypto.randomUUID()}});
    const saved=await call('/api/documents',{kind:'form',data});assert.equal(saved.status,200);const d=await saved.json();
    assert.equal((await req('/api/documents/'+d.id,{cookie:other})).status,404);
    const changed={...data,fields:[data.fields[1],data.fields[0]]};assert.equal((await call('/api/documents/'+d.id,{expectedRevision:1,data:changed},'PATCH')).status,200);
    assert.equal((await call('/api/documents/'+d.id,{expectedRevision:2,data},'PATCH',other)).status,404);
    assert.equal((await call('/api/documents',{kind:'form',templateId:'t1',data})).status,400);
    assert.equal((await call('/api/documents',{kind:'form',data:{...data,fields:[data.fields[0],data.fields[0]]}})).status,400);
    for(const [format,rev] of [['docx',1],['pdf',2]]){
      assert.equal((await call('/api/exports',{documentId:d.id,documentRevision:rev,format},'POST',other)).status,404);
      const r=await call('/api/exports',{documentId:d.id,documentRevision:rev,format});assert.equal(r.status,200);const e=await r.json();assert.equal(e.state,'succeeded');
      const u=(await(await call('/api/download-intents',e.intent)).json()).url;const file=await req(u,{cookie:owner});assert.equal(file.status,200);
      const bytes=new Uint8Array(await file.arrayBuffer());if(format==='docx'){const {unzipSync,strFromU8}=await import('fflate');const xml=strFromU8(unzipSync(bytes)['word/document.xml']);assert.ok(xml.indexOf('contact_name')<xml.indexOf('shift_choice'));}
      else{const {PDFDocument}=await import('pdf-lib');const form=(await PDFDocument.load(bytes)).getForm();assert.deepEqual(form.getFields().map(f=>f.getName()),['field_shift_choice','field_contact_name']);assert.ok(form.getTextField('field_contact_name').isRequired());}
    }
    assert.equal((await(await req('/api/session',{cookie:owner})).json()).freeUsed,1);
  });

});
