const SHEET_ID='1ELAjjDmGoAAaRJ_UiL4by5RZVNC7_bsp3yoEU9IW8oE';
const SCHEDULE_TAB='Weekly Schedule', LIVE_TAB='Live', PINS_TAB='Pins';
const $=id=>document.getElementById(id), HOST=new URLSearchParams(location.search).has('host');
const S={rows:[],cur:null,liveTitle:'',pins:[],clock:null,override:false};

/* --- sheet loading via <script> (works from a local file, no CORS) --- */
function load(tab){return new Promise((res,rej)=>{
  const cb='cb'+Math.random().toString(36).slice(2),s=document.createElement('script');
  const done=()=>{clearTimeout(t);delete window[cb];s.remove()};
  const t=setTimeout(()=>{done();rej(new Error('timeout'))},15000);
  window[cb]=d=>{done();d.status==='error'?rej(new Error('sheet')):res(d.table)};
  s.onerror=()=>{done();rej(new Error('network'))};
  s.src=`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?sheet=${encodeURIComponent(tab)}&headers=1&tqx=out:json;responseHandler:${cb}`;
  document.head.appendChild(s)})}
const cell=c=>c?String(c.f??c.v??'').replace(/\u200b/g,'').trim():'';
const el=(t,txt,cls)=>{const e=document.createElement(t);if(txt!=null)e.textContent=txt;if(cls)e.className=cls;return e};
const safe=u=>/^https?:\/\//i.test(u);

/* --- schedule --- */
function parseSchedule(t){
  const L=t.cols.map(c=>(c.label||'').toLowerCase());
  const col=k=>L.map((l,i)=>l.includes(k)?i:-1).filter(i=>i>=0);
  // columns are found by their heading (so you can add or reorder columns); the old positions are only a fallback
  const at=(k,def=-1)=>{const i=L.findIndex(l=>l.includes(k));return i>=0?i:def};
  const iDate=at('date',0),iTitle=at('title',1),iYear=at('year'),iDur=at('duration'),iDesc=at('description'),
        iCats=at('categor'),iTags=at('tag'),iMore=at('follow',at('recommend'));
  const free=col('free'),open=col('open'),stream=col('streaming'),imgI=(col('poster')[0]??col('image')[0]??-1),tmdbI=(col('tmdb')[0]??col('tmbd')[0]??col('film link')[0]??-1);
  return t.rows.filter(r=>r.c&&cell(r.c[iTitle])).map(r=>{
    const c=r.c,d=c[iDate]&&String(c[iDate].v).startsWith('Date(')?new Date(...c[iDate].v.slice(5,-1).split(',').map(Number)):null;
    const list=idx=>idx.flatMap(i=>cell(c[i]).split(/[,;\n]+/)).map(x=>x.trim()).filter(Boolean);
    // a TMDB link is recognised by what it looks like, wherever it sits (so a mislabelled column still works)
    const isTm=v=>/themoviedb\.org\/(movie|tv)\/\d+|themoviedb\.org\/search/.test(v);
    const tmdbVal=(tmdbI>=0&&isTm(cell(c[tmdbI]))?cell(c[tmdbI]):'')||c.map(cell).find(isTm)||'';
    const yr=cell(c[iYear]);
    return{date:d,dateLabel:cell(c[iDate]),title:cell(c[iTitle]),year:/^\d{4}$/.test(yr)?yr:'',dur:cell(c[iDur]),desc:cell(c[iDesc]),cats:cell(c[iCats]),tags:cell(c[iTags]),
      free:list(free),open:list(open),stream:list(stream),more:cell(c[iMore]),img:imgI>=0?cell(c[imgI]):'',tmdb:tmdbVal}});
}
const DAY=864e5;
const midnight=()=>{const t=new Date();t.setHours(0,0,0,0);return t};
// 'now' = this week's screening (its date was within the last 7 days, or today); 'soon' = still ahead; 'past' = older.
// If the host types a title in Live!B2, that film is 'now' and the date rules only sort the others.
function when(r){
  const t=midnight(),lt=(S.liveTitle||'').toLowerCase();
  if(lt&&S.rows.some(x=>x.title.toLowerCase()===lt))return r.title.toLowerCase()===lt?'now':(r.date&&r.date<t?'past':'soon');
  if(!r.date)return'soon';
  const d=Math.round((t-r.date)/DAY);
  return d<0?'soon':d<7?'now':'past';
}
function autoPick(){
  const want=new URLSearchParams(location.search).get('show');
  if(want){const m=S.rows.find(r=>r.title===want);if(m)return m}
  const now=S.rows.find(r=>when(r)==='now');if(now)return now;
  const soon=S.rows.filter(r=>when(r)==='soon').sort((a,b)=>(a.date||1e15)-(b.date||1e15))[0];
  return soon||S.rows[S.rows.length-1];
}
const isImg=u=>/^(https?:\/\/\S+|[\w\-.\/]+\.(png|jpe?g|webp|gif|avif))$/i.test(u||'');
const FN='/.netlify/functions/film';
async function enrich(r){
  if(r.tried)return;
  if(isImg(r.img)&&r.desc&&r.year&&r.dur&&(r.free.length||r.open.length||r.stream.length)){r.status='skipped: the sheet already has a poster, description and platforms';return}
  r.tried=true;
  try{
    const m=(r.tmdb||'').match(/(movie|tv)\/(\d+)/);
    const sq=(r.tmdb||'').match(/[?&]query=([^&#]+)/);
    let name=r.title;if(sq){try{name=decodeURIComponent(sq[1].replace(/\+/g,' '))}catch(e){}}
    const res=await fetch(m?`${FN}?type=${m[1]}&id=${m[2]}`:`${FN}?title=${encodeURIComponent(name)}&year=${encodeURIComponent(r.year)}`);
    if(res.status===404){r.status='the lookup function was not found (404): check the file is at netlify/functions/film.js and the site has redeployed';return}
    const d=await res.json();
    if(d.error){r.status='error from the function: '+d.error+(d.detail?' ('+d.detail+')':'');return}
    if(!d.found){r.status='TMDB returned no match'+(m?'':' (no TMDB link in the sheet, so it searched by title)');return}
    r.status='ok'+(m?' (used the TMDB link)':' (searched by title)');
    let changed=false;const np=!r.free.length&&!r.open.length&&!r.stream.length;r.api=r.api||{};
    if(!isImg(r.img)&&d.poster){r.img=d.poster;changed=true}
    if(!r.desc&&d.overview){r.desc=d.overview;changed=true}
    if(!r.year&&d.year){r.year=d.year;changed=true}
    if(!r.cats&&d.genres&&d.genres.length){r.cats=d.genres.join(', ');changed=true}
    if(!r.dur&&d.runtime){r.dur=Math.floor(d.runtime/60)+'H '+d.runtime%60+'M';changed=true}
    if(np)['free','open','stream'].forEach(k=>{if(d[k]&&d[k].length){r[k]=d[k];r.api[k]=1;changed=true}});
    if(changed&&window.onEnriched)onEnriched(r)
  }catch(e){r.status='the lookup could not be reached or did not return data (is this the Netlify site, and has it redeployed?)'}
  finally{if(window.onStatus)onStatus(r)}
}
function ph(r){const p=el('span',r.title,'ph');p.setAttribute('aria-hidden','true');return p}
function cover(r){
  if(!isImg(r.img))return ph(r);
  const i=new Image();i.loading='lazy';i.alt='';i.className='cover';i.src=r.img;
  i.onerror=()=>i.replaceWith(ph(r));return i}

function linkify(parent,text){
  String(text).split(/(https?:\/\/[^\s]+)/g).forEach(part=>{
    if(/^https?:\/\//.test(part)){const a=el('a','View link');a.href=part;a.target='_blank';a.rel='noopener noreferrer';parent.append(a)}
    else if(part)parent.append(document.createTextNode(part))})}
