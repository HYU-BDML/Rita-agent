#!/usr/bin/env node
// Launches disposable local production servers with empty/invalid/labs modes. No credentials or external calls.
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
const dir=await mkdtemp(path.join(os.tmpdir(),'cora-mode-proof-'));
const app=process.env.CORA_RUNTIME_APP;if(!app)throw new Error('Set CORA_RUNTIME_APP to an isolated built app');
const out=process.env.CORA_PROOF_DIR;if(!out)throw new Error('Set CORA_PROOF_DIR');await mkdir(out,{recursive:true});
const results=[];
for(const [i,mode]of ['', 'invalid', 'labs'].entries()){
 const port=3213+i,root='http://127.0.0.1:'+port,env={...process.env,CORA_DATA_DIR:path.join(dir,String(i)),CORA_ORIGIN:root,CORA_SCHEDULER:'0'};
 delete env.CORA_PRODUCT_MODE;if(mode)env.CORA_PRODUCT_MODE=mode;
 const child=spawn(process.execPath,[path.join(app,'node_modules/next/dist/bin/next'),'start','-p',String(port)],{cwd:app,env,stdio:['ignore','pipe','pipe']});
 let log='';child.stdout.on('data',d=>log+=d);child.stderr.on('data',d=>log+=d);
 try{
  let ready=false;
  for(let n=0;n<80;n++){if(child.exitCode!==null)throw new Error(log);try{const r=await fetch(root+'/studio');if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
  assert.ok(ready,log);
  const video=(await fetch(root+'/api/cora/video/synthetic-id')).status;assert.equal(video,mode==='labs'?401:404);
  assert.equal((await fetch(root+'/api/cora/clients')).status,401);
  if(mode!=='labs')assert.equal((await fetch(root+'/api/cora/video/synthetic-id?mode=labs',{headers:{'x-cora-product-mode':'labs'}})).status,404);
  results.push({mode:mode||'missing',passed:true,video,clients:401});
 }finally{child.kill('SIGTERM');await new Promise(r=>{if(child.exitCode!==null)r();else child.once('exit',r);});}
}
await writeFile(path.join(out,'서버모드_재시작_결과.json'),JSON.stringify({results,actualAI:0,actualSNS:0},null,2));console.log(JSON.stringify({passed:true,results}));

