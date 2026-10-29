// Separate launcher: the public concept and existing local demo keep their commands.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { resolve, join } from 'node:path';
const root=resolve(import.meta.dirname,'..'),hosted=process.env.PREVIEW_HOSTED==='true';
if(Number(process.versions.node.split('.')[0])<24)throw Error('Use Node.js 24 or newer');
if(hosted&&process.argv.includes('--fresh'))throw Error('Hosted preview uses its explicitly configured private volume');
let dir=hosted?process.env.PREVIEW_DATA_DIR:resolve(process.env.PREVIEW_DATA_DIR||join(root,'.preview','current'));
if(!hosted&&process.argv.includes('--fresh')){const parent=join(root,'.preview');mkdirSync(parent,{recursive:true,mode:0o700});dir=mkdtempSync(join(parent,'session-'))}
if(!dir)throw Error('Hosted preview requires an absolute PREVIEW_DATA_DIR on a dedicated volume');
// Do not pass inherited production credentials, NODE_OPTIONS, or connector settings.
const env=Object.fromEntries(['PATH','SystemRoot','WINDIR','TEMP','TMP','TMPDIR','LANG','TERM','PORT','PREVIEW_ACCESS_USER','PREVIEW_ACCESS_PASSWORD'].filter(k=>process.env[k]!==undefined).map(k=>[k,process.env[k]]));
Object.assign(env,{NODE_ENV:'development',FICTIONAL_PREVIEW:'true',PREVIEW_HOSTED:String(hosted),PREVIEW_DATA_DIR:dir,SEED_DEMO:'true',FICTIONAL_AUDIO_DEMO:'false',FICTIONAL_CLEARINGHOUSE_DEMO:'true',LIVE_CLEARINGHOUSE_ENABLED:'false',PAYER_ADAPTER:'none',COOKIE_SECURE:String(hosted),SESSION_SECRET:hosted?(process.env.SESSION_SECRET||''):randomBytes(48).toString('hex'),HOST:hosted?'0.0.0.0':'127.0.0.1',PORT:hosted?(process.env.PORT||'3000'):'0',DATABASE_PATH:join(dir,'clinic.db'),UPLOAD_DIR:join(dir,'uploads'),AUDIO_DIR:join(dir,'private-audio')});
const child=spawn(process.execPath,['src/server.js'],{cwd:root,env,stdio:['inherit','pipe','inherit']});
console.log('Front Desk Mate · authenticated fictional preview');
console.log('Sample logins: doctor@example.test / patient@example.test / biller@example.test');
console.log('Sample account password: DemoOnly!ChangeMe123');
console.log('Fictional records only. Keep this terminal open. Ctrl+C stops the preview.');
let output='',opened=false;
child.stdout.on('data',chunk=>{process.stdout.write(chunk);output=(output+chunk).slice(-4000);const match=/http:\/\/127\.0\.0\.1:\d+/.exec(output);if(match&&!opened){opened=true;if(process.env.DEMO_NO_OPEN!=='true'){const cmd=process.platform==='darwin'?'open':process.platform==='win32'?'rundll32':'xdg-open',args=process.platform==='win32'?['url.dll,FileProtocolHandler',match[0]]:[match[0]];const browser=spawn(cmd,args,{stdio:'ignore'});browser.on('error',()=>console.log('Open '+match[0]+' in your browser.'))}}});
child.on('error',e=>{console.error(e.message);process.exitCode=1});
child.on('exit',code=>{process.exitCode=code??1});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
