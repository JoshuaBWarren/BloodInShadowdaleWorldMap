// Local-only development server. GitHub Pages publishes index.html and locations.json, not this process.
const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const host='127.0.0.1';
const port=Number(process.env.PORT||4173);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml'};
function respond(res,code,msg,type='text/plain; charset=utf-8'){res.writeHead(code,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(msg)}
function validate(data){
 if(!data||!Array.isArray(data.locations)||data.locations.length>60)throw Error('Expected up to 60 locations');
 const nums=new Set(),ids=new Set();
 for(const p of data.locations){
  if(!p||typeof p.id!=='string'||p.id.length>100||ids.has(p.id))throw Error('Invalid/duplicate ID');
  if(!Number.isInteger(p.number)||p.number<1||p.number>60||nums.has(p.number))throw Error('Invalid/duplicate marker number');
  if(typeof p.title!=='string'||!p.title.trim()||p.title.length>120)throw Error('Invalid title');
  if(typeof p.description!=='string'||p.description.length>20000)throw Error('Invalid description');
  if(typeof p.photo!=='string'||p.photo.length>2000)throw Error('Invalid image URL');
  if(!Number.isFinite(p.u)||p.u<0||p.u>1||!Number.isFinite(p.v)||p.v<0||p.v>1)throw Error('Invalid map coordinates');
  nums.add(p.number);ids.add(p.id);
 }
 return {locations:data.locations.map(({id,number,title,description,photo,u,v})=>({id,number,title,description,photo,u,v}))};
}
http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,`http://${host}:${port}`);
  if(req.method==='POST'&&url.pathname==='/api/locations'){
   const origin=req.headers.origin;
   if(origin!==`http://${host}:${port}`)return respond(res,403,'Local editor origin required');
   let body='',length=0;
   for await(const chunk of req){length+=chunk.length;if(length>1_000_000)return respond(res,413,'Data too large');body+=chunk.toString('utf8')}
   let data;try{data=validate(JSON.parse(body))}catch(e){return respond(res,400,e.message)}
   const file=path.join(root,'locations.json');const temp=file+'.tmp';
   await fs.writeFile(temp,JSON.stringify(data,null,2)+'\n');await fs.rename(temp,file);
   return respond(res,200,JSON.stringify({ok:true}),'application/json');
  }
  if(req.method!=='GET'&&req.method!=='HEAD')return respond(res,405,'Method not allowed');
  if(url.pathname==='/editor'){
   const template=await fs.readFile(path.join(root,'index.html'),'utf8');
   const html=template.replace('<script src="js/app.js"></script>','<script>window.__SHADOWDALE_EDITOR__=true</script><script src="js/app.js"></script>');
   return respond(res,200,req.method==='HEAD'?'':html,mime['.html']);
  }
  let requestPath;
  try{requestPath=decodeURIComponent(url.pathname)}catch{return respond(res,400,'Bad path')}
  if(requestPath==='/' )requestPath='/index.html';
  const file=path.resolve(root,'.'+requestPath);
  if(!(file.startsWith(root+path.sep))||file.includes(path.sep+'tools'+path.sep)||file===path.join(root,'package.json')||file.includes('/.git'))return respond(res,403,'Forbidden');
  let stat;try{stat=await fs.stat(file)}catch{return respond(res,404,'Not found')}
  if(!stat.isFile())return respond(res,404,'Not found');
  const content=await fs.readFile(file);return respond(res,200,req.method==='HEAD'?'':content,mime[path.extname(file)]||'application/octet-stream');
 }catch(err){console.error(err);respond(res,500,'Server error')}
}).listen(port,host,()=>console.log(`\nBlood in Shadowdale DM editor: http://${host}:${port}/editor\nPlayer preview: http://${host}:${port}/\nPress Ctrl+C to stop.\n`));
