// Records genuine app frames through CDP. No response or route data is replaced.
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('C:/Users/youse/AppData/Local/OpenAI/Codex/runtimes/cua_node/bbc9141fe9f920ac/bin/node_modules/playwright-core');
const work = path.resolve('docs/video/work');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const css = `
html,body{font-size:19px!important} .logo,#langBtn,.tour{display:none!important}
.layout{height:calc(100% - 202px)!important}.panel{width:500px;min-width:500px;scroll-behavior:auto!important}
.card h2{font-size:23px}.stats{font-size:20px;gap:9px 12px}.safety{font-size:27px}.reasons{font-size:18px}
.toggle{font-size:20px}.legend{font-size:16px}.select{font-size:18px}.help,.buddy{font-size:17px}
.chat{max-height:600px}.bubble{font-size:23px;line-height:1.4}.bubble .meta{font-size:16px}.ask-status{font-size:19px}
.leaflet-popup-content{width:450px!important;font-size:19px}.leaflet-popup-scrolled{max-height:700px!important}
.hud-top{top:75px}.hud-box b{font-size:30px}.hud-box small{font-size:17px}
#videoCaption{position:fixed;inset:auto 0 0;height:142px;background:rgba(7,10,28,.94);color:white;z-index:99999;
display:flex;align-items:center;justify-content:center;text-align:center;padding:12px 90px;font:600 42px/1.25 'Segoe UI',sans-serif;white-space:pre-line}
#videoAI{position:fixed;right:22px;top:72px;padding:10px 15px;background:rgba(7,10,28,.93);border:1px solid #8fd3ff;
border-radius:7px;color:white;z-index:99999;font:23px 'Segoe UI',sans-serif}
#videoTitle{position:fixed;left:calc(50% + 180px);top:42%;transform:translate(-50%,-50%);padding:36px 48px;
background:rgba(7,10,28,.86);border:1px solid #8fd3ff;border-radius:12px;z-index:9998;text-align:center;color:white;font:600 52px/1.3 'Segoe UI',sans-serif}
#videoTitle small{display:block;font-size:29px;color:#b8e1ff;margin-top:16px}
`;
async function main(){
 const scenes=JSON.parse(fs.readFileSync(path.join(work,'timing.json'),'utf8'));
 const browser=await chromium.launch({headless:true,executablePath:'C:/Users/youse/AppData/Local/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-win64/chrome-headless-shell.exe'});
 const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:8000');await page.waitForFunction(()=>window.Darb?.grid);
 await page.addStyleTag({content:css});
 await page.evaluate(()=>{
  for(const [id,text] of [['videoCaption',''],['videoAI','AI-assisted video · AI voice (TTS)'],['videoTitle','']]){
   const d=document.createElement('div');d.id=id;d.textContent=text;document.body.appendChild(d);
  }
  document.querySelector('#videoTitle').innerHTML='Team Darb · Ramallah<small>Challenge: the Martian Map</small>';
  Darb.map.invalidateSize();DarbTour.show(4);
 });
 await page.evaluate(()=>Darb.askQuestion('Is this route safe?'));
 if(!await page.evaluate(()=>AskDarb.state.online&&Darb.aiLog.length>0))throw Error('Ask Darb did not run: recording aborted');
 // Repeat the same genuine question to warm the exact prompt cache.
 await page.evaluate(()=>Darb.askQuestion('Is this route safe?'));
 fs.writeFileSync(path.join(work,'warmup.json'),JSON.stringify(await page.evaluate(()=>({log:Darb.aiLog,chat:document.querySelector('#chat').innerText})),null,2));
 await page.evaluate(()=>{document.querySelector('#chat').replaceChildren();DarbTour.show(0);document.querySelector('#panel').scrollTop=0});
 await sleep(900);
 const cdp=await page.context().newCDPSession(page);let frames=[],capture=false,index=0;
 fs.mkdirSync(path.join(work,'frames'),{recursive:true});
 cdp.on('Page.screencastFrame',async e=>{
  if(capture){const file=`frames/frame-${String(index++).padStart(5,'0')}.jpg`;fs.writeFileSync(path.join(work,file),Buffer.from(e.data,'base64'));frames.push({file,time:e.metadata.timestamp});}
  await cdp.send('Page.screencastFrameAck',{sessionId:e.sessionId}).catch(()=>{});
 });
 const takes=[];
 for(let i=0;i<scenes.length;i++){
  const s=scenes[i];
  await page.evaluate(({i,caption})=>{
   document.querySelector('#videoCaption').textContent=caption;
   document.querySelector('#videoTitle').style.display=i===0?'block':'none';
   const step=[0,0,1,4,5,7,8][i];DarbTour.show(step);
   if(i===3)document.querySelector('#routeCard').closest('.card').scrollIntoView({block:'start',behavior:'instant'});
   if(i===6){document.querySelector('.card.ask').scrollIntoView({block:'start',behavior:'instant'});}
   if(i<3)document.querySelector('#panel').scrollTop=0;
  },{i,caption:s.caption});
  // Map transitions settle before each take. Ask Darb is recorded as it streams.
  if(i!==6)await sleep(650);else await sleep(50);
  capture=true;await cdp.send('Page.startScreencast',{format:'jpeg',quality:92,maxWidth:1920,maxHeight:1080,everyNthFrame:1});
  const start=Date.now()/1000;
  if(i===2){await sleep(s.duration*1000/3);await page.evaluate(()=>DarbTour.show(2));await sleep(s.duration*1000/3);await page.evaluate(()=>DarbTour.show(3));await sleep(s.duration*1000/3);}
  else await sleep(s.duration*1000);
  capture=false;await cdp.send('Page.stopScreencast');
  const end=Date.now()/1000;
  takes.push({scene:i+1,start,end,duration:s.duration,frames});frames=[];
  console.log('Captured scene',i+1,'frames',takes.at(-1).frames.length);
  if(i===6){await page.waitForFunction(()=>!Darb.aiBusy);fs.writeFileSync(path.join(work,'answer.json'),JSON.stringify(await page.evaluate(()=>({log:Darb.aiLog,answer:document.querySelector('#chat').innerText})),null,2));}
 }
 fs.writeFileSync(path.join(work,'capture.json'),JSON.stringify({takes,errors},null,2));
 await browser.close();if(errors.length)throw Error(errors.join('\n'));
}
main().catch(e=>{console.error(e);process.exit(1)});
