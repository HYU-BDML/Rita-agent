// Keep dependency/build churn outside synced folders; retain local user data in source/data.
import {cp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(Number(process.versions.node.split('.')[0])<22)throw new Error('Node.js 22.13 이상이 필요합니다.');
const runtime=path.join(tmpdir(),'cora-local-'+createHash('sha256').update(source).digest('hex').slice(0,12));
await mkdir(runtime,{recursive:true});
const excluded=new Set(['node_modules','.next','data','.git','.env.local']);
await cp(source,runtime,{recursive:true,filter:p=>!path.relative(source,p).split(path.sep).some(x=>excluded.has(x))});
const fingerprint=createHash('sha256').update(await readFile(path.join(source,'package-lock.json'))).digest('hex');
const stamp=path.join(runtime,'.dependency-fingerprint');
async function run(command,args,env=process.env){await new Promise((resolve,reject)=>{const p=spawn(command,args,{cwd:runtime,stdio:'inherit',env});p.on('error',reject);p.on('exit',code=>code===0?resolve():reject(new Error(`${command}: ${code}`)));});}
if(!existsSync(stamp)||(await readFile(stamp,'utf8'))!==fingerprint||!existsSync(path.join(runtime,'node_modules'))){await run('npm',['ci','--ignore-scripts','--no-audit','--no-fund']);await writeFile(stamp,fingerprint);}
// External service credentials live outside Git and Drive-synced source: ~/.config/cora/secrets.env (KEY=VALUE lines).
// YouTube and Apify keys already kept for llmgw are passed through by name only. Values are never printed.
async function readEnv(file,only){try{const out={};for(const line of (await readFile(file,'utf8')).split(/\r?\n/)){const m=/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);if(!m||(only&&!only.includes(m[1])))continue;out[m[1]]=m[2].replace(/^(['"])(.*)\1$/,'$2');}return out;}catch{return {};}}
const home=process.env.HOME||'';const secrets={...(await readEnv(path.join(home,'.config','llmgw','.env'),['YOUTUBE_API_KEY','APIFY_API_TOKEN'])),...(await readEnv(path.join(home,'.config','cora','secrets.env')))};
console.log(`외부 연결 설정 ${Object.keys(secrets).length}개를 읽었습니다(값은 표시하지 않음).`);
const port=process.env.CORA_PORT||'3210';
console.log(`\nCora: http://127.0.0.1:${port}/studio\n이 컴퓨터에서만 열리는 개발용 작업실입니다.\n`);
await run(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port',port],{...secrets,...process.env,CORA_DATA_DIR:process.env.CORA_DATA_DIR||path.join(source,'data','cora'),CORA_ORIGIN:`http://127.0.0.1:${port}`});
