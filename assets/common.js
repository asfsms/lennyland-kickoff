/* Lenny's Daily Kickoff: helpers shared by the home page and every game.
   Built on The Daily Wow kit (https://github.com/raphacoh/daily-wow-kit), MIT License, (c) 2026 Raphael Cohen. */
window.LDK = (function(){
  'use strict';
  const LEAGUES = [[0,'Bed-Stuy Block League'],[25,'Brooklyn League'],[75,'New York City League'],[150,'New York State League'],[300,'USA League'],[500,'World League'],[800,'Legends League']];
  const STREAK_BADGES = {3:'Hat Trick',7:'Captain',14:'Unbeaten Run',30:'MVP'};
  const PALETTE = [['Red','#D7263D'],['Orange','#F46036'],['Yellow','#F9C80E'],['Green','#1F9D6B'],['Sky blue','#3FA7D6'],['Blue','#1D4ED8'],['Navy','#1B2A6B'],['Purple','#7B2CBF'],['Pink','#EF5DA8'],['Maroon','#8C1C3A'],['Black','#1E1E24'],['White','#FFFFFF']];

  /* saved players: this browser, this device */
  const Store = { mem:{},
    get(k){ try{ const v=localStorage.getItem(k); if(v) return JSON.parse(v); }catch(e){} return this.mem[k]||null; },
    set(k,v){ this.mem[k]=v; try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} } };
  let DB = Store.get('ldk-v1') || { players:{}, order:[], last:null };
  if(!DB.players || !DB.order) DB = { players:{}, order:[], last:null };
  function db(){ return DB; }
  function save(){ Store.set('ldk-v1', DB); }
  function currentPlayer(){ return DB.players[DB.last] || DB.players[DB.order[0]] || null; }

  /* dates. On a test machine only (localhost or a file), ?today=YYYY-MM-DD pretends it is another day. */
  const LOCAL = location.protocol==='file:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const Q = new URLSearchParams(location.search);
  function today(){
    const o = LOCAL && Q.get('today'); if(o && /^\d{4}-\d\d-\d\d$/.test(o)) return o;
    const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }
  function preview(){ return LOCAL && Q.get('preview')==='1'; }
  function isoWeek(ds){
    const d=new Date(ds+'T12:00:00Z'); const day=(d.getUTCDay()+6)%7; d.setUTCDate(d.getUTCDate()-day+3);
    const y=d.getUTCFullYear(), jan4=new Date(Date.UTC(y,0,4,12));
    const w=1+Math.round(((d-jan4)/864e5-3+((jan4.getUTCDay()+6)%7))/7);
    return y+'-W'+String(w).padStart(2,'0');
  }
  function dayOfWeek(ds){ return new Date(ds+'T12:00:00').getDay(); }   // 0 = Sunday
  function prettyDate(ds){ return new Date(ds+'T12:00:00').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'}); }
  function dayName(ds){ return new Date(ds+'T12:00:00').toLocaleDateString('en-US',{weekday:'long'}); }

  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
  function fmt(n){ return Math.round(n).toLocaleString('en-US'); }
  /* passcodes are stored as base64 of the reversed text (same scheme as the kit): a deterrent, not a lock */
  function decode(enc){ try{ return decodeURIComponent(escape(atob(enc))).split('').reverse().join(''); }catch(e){ return ''; } }
  function leagueFor(goals){ let i=0; LEAGUES.forEach((l,k)=>{ if(goals>=l[0]) i=k; }); return { i, name:LEAGUES[i][1], at:LEAGUES[i][0], next: LEAGUES[i+1]||null }; }

  let uid=0;
  function shirt(kit, size){
    const id='sh'+(++uid), path='M38 12 L20 20 L4 42 L22 56 L30 46 L30 110 L90 110 L90 46 L98 56 L116 42 L100 20 L82 12 Q60 28 38 12 Z';
    const stripes = kit.style==='stripes' && kit.c2 ? [6,30,54,78,102].map(x=>'<rect x="'+x+'" y="0" width="12" height="120" fill="'+kit.c2+'"/>').join('') : '';
    return '<svg viewBox="0 0 120 120" width="'+size+'" height="'+size+'" aria-hidden="true"><defs><clipPath id="'+id+'"><path d="'+path+'"/></clipPath></defs><g clip-path="url(#'+id+')"><rect width="120" height="120" fill="'+kit.c1+'"/>'+stripes+'</g><path d="'+path+'" fill="none" stroke="#1E2140" stroke-width="3" stroke-linejoin="round"/><text x="60" y="86" text-anchor="middle" font-family="Fredoka,Arial,sans-serif" font-weight="700" font-size="38" fill="#fff" stroke="#1E2140" stroke-width="6" paint-order="stroke" stroke-linejoin="round">10</text></svg>';
  }
  /* El Nino: an original helper character */
  function nino(size){
    return '<svg viewBox="0 0 64 64" width="'+size+'" height="'+size+'" aria-hidden="true"><circle cx="32" cy="32" r="31" fill="#CDEFD9"/><path d="M11 64c0-12 9-18 21-18s21 6 21 18z" fill="#F9C80E"/><path d="M26 47l6 7 6-7" fill="none" stroke="#1E2140" stroke-width="2" stroke-linejoin="round"/><circle cx="32" cy="29" r="15" fill="#E9B48A"/><path d="M17 27c-1-11 6-18 15-18s16 7 15 18l-4-6-4 4-4-5-3 5-4-5-4 5-3-4z" fill="#2B2B33"/><rect x="16.5" y="24" width="31" height="5" rx="2.5" fill="#E4572E"/><circle cx="26.5" cy="33.5" r="1.9" fill="#1E2140"/><circle cx="37.5" cy="33.5" r="1.9" fill="#1E2140"/><path d="M26 38.5q6 5 12 0" fill="none" stroke="#1E2140" stroke-width="2" stroke-linecap="round"/></svg>';
  }
  const ICON = {
    ball:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10.5" fill="#fff" stroke="#1E2140" stroke-width="1.6"/><path d="M12 7.2l4.3 3.1-1.6 5h-5.4l-1.6-5z" fill="#1E2140"/><path d="M12 7.2V2M16.3 10.3l5-1.6M14.7 15.3l3.1 4.2M9.3 15.3l-3.1 4.2M7.7 10.3l-5-1.6" stroke="#1E2140" stroke-width="1.4"/></svg>',
    speaker:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h3l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg>',
    lockShut:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
    lockOpen:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/></svg>',
    send:'<svg viewBox="0 0 24 24" fill="none" stroke="#1E2140" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h15M13 6l6 6-6 6"/></svg>'
  };
  return { LEAGUES, STREAK_BADGES, PALETTE, db, save, currentPlayer, today, preview, isoWeek, dayOfWeek, prettyDate, dayName, esc, fmt, decode, leagueFor, shirt, nino, ICON, LOCAL };
})();

/* Drawing helpers for each game's pictures. Every picture is an original drawing made of simple shapes,
   in a 640 x 300 frame. */
window.ART = (function(){
  let uid=0;
  const FONT = 'font-family="Nunito,Arial,sans-serif" font-weight="800"';
  function frame(inner, night){
    const id='sky'+(++uid), c = night ? ['#0E1838','#2A3A74'] : ['#BFE3FA','#EEF8FF'];
    return '<svg viewBox="0 0 640 300" role="img"><defs><linearGradient id="'+id+'" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="'+c[0]+'"/><stop offset="1" stop-color="'+c[1]+'"/></linearGradient></defs><rect width="640" height="300" fill="url(#'+id+')"/>'+inner+'</svg>';
  }
  function nightSky(){ return [[40,30],[100,74],[150,24],[250,46],[310,22],[372,58],[500,34],[604,80],[280,96],[470,100],[30,110]].map(p=>'<circle cx="'+p[0]+'" cy="'+p[1]+'" r="1.9" fill="#FFF6C9"/>').join('')+'<circle cx="566" cy="50" r="22" fill="#FFF3B8"/>'; }
  function sun(x, y){ return '<circle cx="'+(x||570)+'" cy="'+(y||52)+'" r="26" fill="#FFD34D"/>'; }
  /* a simple person standing with feet at (x, y); up = arms raised; q = a question mark above */
  function person(x, y, color, up, q){
    return '<g><rect x="'+(x-7)+'" y="'+(y-22)+'" width="14" height="22" rx="5" fill="'+color+'"/><circle cx="'+x+'" cy="'+(y-30)+'" r="8" fill="#F1C9A5"/>'
      +(up?'<path d="M'+(x-6)+' '+(y-18)+'l-8 -14M'+(x+6)+' '+(y-18)+'l8 -14" stroke="'+color+'" stroke-width="4" stroke-linecap="round"/>':'')
      +(q?'<text x="'+(x+12)+'" y="'+(y-42)+'" font-size="22" fill="#C8452D" '+FONT+'>?</text>':'')+'</g>';
  }
  /* a row of plain buildings standing on the line y = base */
  function skyline(x0, heights, color, base){ let s='', x=x0; const b=base||222; heights.forEach(h=>{ s+='<rect x="'+x+'" y="'+(b-h)+'" width="20" height="'+h+'" fill="'+color+'"/>'; x+=23; }); return s; }
  /* a dark label; w = width in px */
  function tag(x, y, w, text){ return '<g transform="translate('+x+','+y+')"><rect width="'+w+'" height="28" rx="8" fill="#1E2140"/><text x="'+(w/2)+'" y="20" text-anchor="middle" font-size="16" fill="#fff" '+FONT+'>'+text+'</text></g>'; }
  /* plain text; size in px, anchor = start | middle | end */
  function text(x, y, size, str, fill, anchor){ return '<text x="'+x+'" y="'+y+'" text-anchor="'+(anchor||'middle')+'" font-size="'+size+'" fill="'+(fill||'#1E2140')+'" '+FONT+'>'+str+'</text>'; }
  return { FONT, frame, nightSky, sun, person, skyline, tag, text };
})();
