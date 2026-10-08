// Local, fictional-data-only product launcher. Never listen on a public interface.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
const root=resolve(import.meta.dirname,'..');
if(Number(process.versions.node.split('.')[0])<24){console.error('Front Desk Mate requires Node.js 24 or newer. Install it from https://nodejs.org/ and reopen the launcher.');process.exit(1)}
const child=spawn(process.execPath,['src/server.js'],{
  cwd:root,
  env:{...process.env,NODE_ENV:'development',SEED_DEMO:'true',FICTIONAL_AUDIO_DEMO:'true',FICTIONAL_CLEARINGHOUSE_DEMO:'true',SESSION_SECRET:randomBytes(48).toString('hex'),HOST:'127.0.0.1',PORT:'0',DATABASE_PATH:resolve(root,'data/clinic.db'),UPLOAD_DIR:resolve(root,'uploads'),AUDIO_DIR:resolve(root,'data/private-audio')},
  stdio:['inherit','pipe','inherit']
});
console.log('Front Desk Mate · completed fictional demonstration');
console.log('Keep this window open while using the app. Ctrl+C stops it.');
console.log('Accounts: doctor@example.test, patient@example.test, biller@example.test');
console.log('Password for these fictional accounts: DemoOnly!ChangeMe123');
console.log('No real patient data, microphone recording, transcription, or payer transmission.');
let output='',opened=false;
child.stdout.on('data',chunk=>{
  process.stdout.write(chunk);output=(output+chunk.toString()).slice(-4000);
  const match=/http:\/\/127\.0\.0\.1:\d+/.exec(output);
  if(match&&!opened){
    opened=true;
    console.log('Open '+match[0]+' in your browser.');
    if(process.env.DEMO_NO_OPEN!=='true'){
      const command=process.platform==='darwin'?'open':process.platform==='win32'?'rundll32':'xdg-open';
      const args=process.platform==='win32'?['url.dll,FileProtocolHandler',match[0]]:[match[0]];
      const browser=spawn(command,args,{stdio:'ignore'});browser.on('error',()=>console.log('Open the address above manually.'));
    }
  }
});
child.on('error',error=>{console.error('Could not start: '+error.message);process.exitCode=1});
child.on('exit',code=>{process.exitCode=code??0});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
