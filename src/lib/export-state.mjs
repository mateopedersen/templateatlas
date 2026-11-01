// A retry of the same saved revision joins the same server job.
export async function awaitExport(job,onProgress=()=>{}){
 const deadline=Date.now()+180000;
 while(job?.state==='queued'||job?.state==='running'){
  if(!/^exp-[a-f0-9]{64}$/.test(job.id)||Date.now()>=deadline)throw Error('Your export is still processing. Reopen this revision to check it again.');
  onProgress('Preparing your file…');
  await new Promise(resolve=>setTimeout(resolve,Math.min(2500,Math.max(350,Number(job.retryAfterMs)||800))));
  const r=await fetch('/api/exports/'+job.id,{credentials:'same-origin',cache:'no-store'});
  if(!r.ok)throw Error('This export did not finish. Open your saved revision and try again.');
  job=await r.json();
 }
 if(job?.state!=='succeeded'||!job.intent)throw Error('The export is unavailable. Your saved document can be reopened.');
 return job;
}
