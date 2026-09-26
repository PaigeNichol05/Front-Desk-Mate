import http from 'node:http';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Railway's default service runs only this read-only, fictional-data demo.
// It has no database, login, upload endpoint, POST route, or server-side storage.
const root=resolve(import.meta.dirname,'..');
const files={'/':['demo/index.html','text/html; charset=utf-8'],'/app.js':['demo/app.js','text/javascript; charset=utf-8'],'/style.css':['public/style.css','text/css; charset=utf-8']};
const server=http.createServer((req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405,{'Allow':'GET, HEAD'});return res.end()}
  if(path==='/health'){res.writeHead(200,{'Content-Type':'text/plain','Cache-Control':'no-store'});return res.end('ok')}
  const file=files[path];if(!file){res.writeHead(404);return res.end()}
  const headers={'Content-Type':file[1],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"};
  res.writeHead(200,headers);if(req.method==='HEAD')return res.end();res.end(readFileSync(join(root,file[0])));
});
server.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('Fictional Front Desk Mate demo ready'));
