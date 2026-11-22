/* Lenny's Daily Kickoff: the game engine. Every day's game supplies only its content (window.GAME, window.SCENES,
   window.TOYS); this file draws the pages and runs the rules: players and shirts, the 14 pages, read-aloud,
   the penalty shootout, goals, leagues, streaks, badges, the vault and the helper.
   Adapted from The Daily Wow kit (https://github.com/raphacoh/daily-wow-kit), MIT License, (c) 2026 Raphael Cohen. */
(function(){
'use strict';
const G=window.GAME, SCENES=window.SCENES||{}, TOYS=window.TOYS||{}, L=window.LDK;
if(!G||!L){ document.body.textContent='This game did not load. Go back and try again.'; return; }
const esc=L.esc, fmt=L.fmt, ICON=L.ICON, nino=L.nino, shirt=L.shirt, leagueFor=L.leagueFor;
const $ = id => document.getElementById(id);
const HOME='../../', PAGES=14, TODAY=L.today();
const LATE = TODAY>G.date;                       // an old game played on a later day: a replay
const EARLY = TODAY<G.date && !L.preview();      // not open yet
const IN_CLAUDE = !!(window.claude && typeof window.claude.use==='function');
const DB = L.db(), P = () => DB.players[S.pid];

/* text helpers: [[...]] = math, **...** = bold, {word|meaning} = a tappable tricky word */
function rich(t){ return esc(t).replace(/\[\[(.+?)\]\]/g,'<span class="math">$1</span>').replace(/\*\*(.+?)\*\*/g,'<b>$1</b>'); }
function storyHtml(t){
  return esc(t).replace(/\{([^|{}]+)\|([^{}]+)\}([.,!?;:]?)/g,(m,w,d,p)=>'<span class="nb"><button class="word" data-def="'+d+'">'+w+'</button>'+p+'</span>')
    .replace(/\*\*(.+?)\*\*/g,'<span class="big">$1</span>');
}
function ninoSay(html){ return '<span class="ninoSay"><span class="av">'+nino(36)+'</span><span>'+html+'</span></span>'; }
function toast(msg){ const t=$('toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2400); }
function readNum(id){ const v=$(id).value.replace(/[^0-9]/g,''); return v===''?NaN:parseInt(v,10); }

/* ---------- state ---------- */
const S = { pid:null, step:0, guess:null, riddle:{tries:0,done:false,ok:false}, quick:{}, toyDone:{}, toyInit:{},
  shots:{}, order:[], coach:{graded:false,stars:0,text:'',offTopic:0}, golden:{tries:0,done:false,ok:false}, game:null };
const EX = (G.shots && G.shots.extra) || [];      // extra-time shots: [{kind:'num'|'tap', ...}], numbered 6, 7
const NSHOTS = 5 + EX.length, NWORD = ['Five','Six','Seven'][EX.length] || String(NSHOTS);
const pageNo = i => i<5 ? i+2 : i+3;             // story page index (0..9) -> page number (2..6, 8..12)
const halfName = n => n<7 ? 'First half' : 'Second half';

/* ---------- build the page ---------- */
function head(n, half){ return '<div class="ch"><span>Page '+n+' of '+PAGES+'</span><span class="half">'+half+'</span></div>'; }
function numField(id, label, btnId){ return '<input class="numin" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6" id="'+id+'" placeholder="?" aria-label="'+esc(label)+'" data-enter="'+btnId+'">'; }
function storyPage(pg, i){
  const n=pageNo(i), toy=pg.toy&&TOYS[pg.toy], gated=!!(toy||pg.quick);
  let h='<section class="step" data-step="'+n+'">'+head(n, halfName(n), true);
  if(pg.scene) h+='<div class="pic" data-scene="'+esc(pg.scene)+'"></div>';
  h+='<p class="story">'+storyHtml(pg.text)+'</p><div class="defbox"></div>';
  if(toy) h+='<div class="panel instrument"><h3>'+esc(toy.title)+'</h3><p class="cap">'+esc(toy.cap||'')+'</p><div class="toybox" id="toy-'+n+'"></div></div>';
  if(pg.guessBack) h+='<p class="aha" id="guessBack" hidden></p>';
  if(pg.quick){ const q=pg.quick;
    h+='<div class="q"><div class="qc-label">Quick check · type it</div><div class="qt">'+rich(q.q)+'</div><div class="controls" style="margin-top:0">'
      +(q.expr?'<span class="math" style="font-size:1.5rem">'+esc(q.expr)+'</span>':'')+numField('qcIn-'+n,q.q,'qcBtn-'+n)
      +'<button class="btn small" id="qcBtn-'+n+'" onclick="K.checkQuick('+n+')">Check</button></div><div class="fb" id="qcFb-'+n+'"></div></div>';
  }
  if(pg.bonus) h+='<div class="panel"><p class="story" style="margin:0;font-size:1.25rem">'+storyHtml(pg.bonus)+'</p></div>';
  const nextLabel = n===12 ? 'To the penalty shootout' : 'Next';
  const hint = toy ? (toy.hint||'Try the toy first.') : pg.quick ? 'Answer the quick check first.' : '';
  h+='<div class="next"><button class="btn ghost small" onclick="K.back()">Back</button><button class="btn" id="next-'+n+'"'+(gated?' disabled':'')+' onclick="K.next()">'+nextLabel+'</button>'+(gated?'<span class="hintline" id="hint-'+n+'">'+esc(hint)+'</span>':'')+'</div></section>';
  return h;
}
function build(){
  const sh=G.shots, pretty=L.prettyDate(G.date);
  let h='<header class="topbar"><div class="topbar-in"><a class="brand" href="'+HOME+'" aria-label="All games">'+ICON.ball+'<span class="t">Lenny\'s Daily Kickoff</span></a><div class="progress" id="progress" aria-hidden="true"></div><div class="who" id="who"></div></div></header><main>';

  if(EARLY){
    h+='<section class="step hero shown" data-step="0"><div class="eyebrow"><span class="tag">Game '+G.n+'</span></div><h1>Not yet!</h1><p class="lede">This game opens on '+esc(pretty)+'.</p><div class="next"><a class="btn" href="'+HOME+'">Back to today</a></div></section></main>';
    $('app').innerHTML=h; return false;
  }

  /* 0 · locker room */
  h+='<section class="step hero shown" data-step="0"><div class="eyebrow"><span class="tag">Game '+G.n+'</span><span class="tag">'+esc(pretty)+'</span><span class="tag">About '+(EX.length?12:10)+' minutes</span>'+(LATE?'<span class="tag replay">Replay</span>':'')+'</div>'
    +'<h1>Lenny\'s Daily Kickoff</h1><p class="lede">Welcome to the locker room of the <b>Futbol Rebels</b>. Who is playing today?</p>'
    +(LATE?'<p class="notice">This is a replay of an older game. Your goals still count, and it counts for the weekend passcode. The daily passcode is only for the day itself.</p>':'')
    +'<div id="playerBox" hidden><div class="tracks" id="playerList"></div><button class="btn ghost small" id="addBtn" onclick="K.showNewPlayer()">Add a new player</button></div>'
    +'<div class="panel instrument" id="newPlayer" hidden><h3>New player</h3><div class="controls" style="margin-top:0"><label>Type your name<input type="text" id="pName" maxlength="14" autocomplete="off" autocapitalize="words" spellcheck="false" placeholder="Your name" data-enter="joinBtn"></label></div>'
    +'<h3 style="margin-top:20px">Design your shirt</h3><div class="kitlab"><div class="kitprev" id="kitPrev"></div><div><div class="swlabel">Shirt color</div><div class="swatches" id="swA"></div><div class="swlabel">Stripe color <span class="swhint" id="swBHint"></span></div><div class="swatches" id="swB"></div></div></div>'
    +'<div class="next" style="margin-bottom:0"><button class="btn" id="joinBtn" onclick="K.createPlayer()">Join the Futbol Rebels</button><span class="hintline" id="joinMsg"></span></div></div>'
    +'<div class="next"><button class="btn" id="startBtn" disabled onclick="K.startGame()">Kick off</button><a class="btn ghost small" href="https://lennyland.games/">&larr; Back to Lennyland</a></div></section>';

  /* 1 · kickoff */
  h+='<section class="step" data-step="1">'+head(1,'Kickoff',true)+'<h1>'+esc(G.title)+'</h1><p class="lede story">'+storyHtml(G.lede)+'</p>'
    +'<div class="panel instrument"><h3>Before we start: take a guess!</h3><p class="cap">'+esc(G.guess.q)+'</p><div class="controls">'+numField('guessIn','My guess','guessBtn')
    +'<button class="btn small" id="guessBtn" onclick="K.lockGuess()">Lock in my guess</button></div><p class="cap" id="guessMsg" style="margin-top:12px"></p></div>'
    +'<div class="next"><button class="btn" id="next-1" disabled onclick="K.next()">Next</button></div></section>';

  /* 2-6 and 8-12 · story; 7 · halftime riddle */
  G.pages.slice(0,5).forEach((pg,i)=>{ h+=storyPage(pg,i); });
  h+='<section class="step" data-step="7">'+head(7,'Halftime riddle',true)+'<div class="panel instrument"><div class="ninoSay"><span class="av">'+nino(72)+'</span><div><h3>Halftime! El Niño has a riddle for you.</h3><p class="story" style="margin-top:8px">'+esc(G.riddle.q)+'</p></div></div>'
    +'<div class="controls"><label>Type your answer<input type="text" id="riddleIn" maxlength="30" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="It is..." data-enter="riddleBtn"></label><button class="btn small" id="riddleBtn" onclick="K.checkRiddle()">Check</button></div><div class="fb" id="riddleFb"></div></div>'
    +'<div class="next"><button class="btn ghost small" onclick="K.back()">Back</button><button class="btn" id="next-7" disabled onclick="K.next()">Second half</button><span class="hintline" id="hint-7">Try the riddle first.</span></div></section>';
  G.pages.slice(5,10).forEach((pg,i)=>{ h+=storyPage(pg,i+5); });

  /* 13 · penalty shootout */
  h+='<section class="step" data-step="13"><div class="ch"><span>Page 13 of 14</span><span class="half">Penalty shootout</span></div><h2>'+NWORD+' shots. Take your time.</h2><p>Miss one? You get a hint and one rebound. '+(EX.length?'After shot 5 comes extra time. ':'')+'Then there is a Golden Goal for extra brave players.</p><div class="board" id="board" aria-label="Scoreboard"></div>'
    +'<div class="q" id="shot1"></div><div class="q" id="shot2"></div>'
    +'<div class="q" id="shot3"><div class="qc-label">Shot 3 of '+NSHOTS+' · tap in order</div><div class="qt">'+rich(sh.order.q)+' (Tap a card again to undo.)</div><div class="order" id="order"></div><div class="controls" style="margin-top:12px"><button class="btn small" id="orderCheck" onclick="K.checkOrder()" disabled>Shoot!</button><button class="btn small ghost" id="orderReset" onclick="K.resetOrder()">Start over</button></div><div class="fb" id="orderFb"></div></div>'
    +'<div class="q" id="shot4"><div class="qc-label">Shot 4 of '+NSHOTS+' · type it</div><div class="qt">'+rich(sh.math.q)+'</div><div class="controls" style="margin-top:0">'
      +(sh.math.stack?'<span class="stack" aria-hidden="true">'+sh.math.stack.map(x=>'<span>'+esc(x)+'</span>').join('')+'<span class="bar"></span></span>':'')
      +(sh.math.expr?'<span class="math" style="font-size:1.6rem">'+esc(sh.math.expr)+'</span>':'')
      +numField('mathIn',sh.math.q,'mathBtn')+'<button class="btn small" id="mathBtn" onclick="K.checkMath()">Shoot!</button></div><div class="fb" id="mathFb"></div></div>'
    +'<div class="q" id="shot5"><div class="qc-label">Shot 5 of '+NSHOTS+' · type or talk</div><div class="qt">'+rich(sh.coach.q)+'</div><textarea id="coachIn" placeholder="'+esc(sh.coach.starter||'I think...')+'" autocapitalize="sentences"></textarea><p class="small" style="margin:8px 0 0">Tip: want to talk instead of type? Tap the microphone on the iPad keyboard.</p><div class="controls"><button class="btn small" id="coachBtn" onclick="K.gradeCoach()">Send it to El Niño</button></div><div class="fb" id="coachFb"></div></div>'
    +(EX.length?'<h3 class="xt">Extra time! '+(EX.length===1?'One more shot.':'Two more shots.')+'</h3>'+EX.map((x,j)=>'<div class="q" id="shot'+(6+j)+'"></div>').join(''):'')
    +'<div class="q golden" id="golden"><div class="qc-label">Golden Goal · extra hard · you can skip it</div><div class="qt">'+rich(sh.golden.q)+'</div><div class="controls" style="margin-top:0">'+(sh.golden.expr?'<span class="math" style="font-size:1.6rem">'+esc(sh.golden.expr)+'</span>':'')+numField('goldIn',sh.golden.q,'goldBtn')+'<button class="btn small" id="goldBtn" onclick="K.checkGolden()">Shoot!</button></div><div class="fb" id="goldFb"></div></div>'
    +'<div class="next"><button class="btn ghost small" onclick="K.back()">Back to the story</button><button class="btn" id="finishBtn" onclick="K.finish()">Final whistle</button></div></section>';

  /* 14 · final whistle */
  h+='<section class="step" data-step="14"><div class="ch"><span>Page 14 of 14</span><span class="half">Final whistle</span></div><h2 id="resTitle">Full time!</h2>'
    +'<div class="panel"><div class="score"><div class="ring" id="ring" style="--p:0"><b><span class="num" id="ringTxt">0</span><small>goals today</small></b></div><div style="flex:1;min-width:220px"><p id="resLine" style="font-size:1.2rem;font-weight:800;margin-bottom:.4em"></p><p class="small" id="resDetail" style="margin:0"></p></div></div></div>'
    +'<div class="vault" id="vault"><div class="lock" id="vaultLock" aria-hidden="true">'+ICON.lockShut+'</div><h3 id="vaultTitle">Today\'s secret passcode</h3><div id="vaultBody"></div></div><div class="panel" id="rate" hidden></div>'
    +'<div class="twocol"><div class="panel"><h3>My league</h3><p style="margin:0;font-weight:800" id="leagueLine"></p><div class="xpbar"><i id="leagueBar"></i></div><p class="small" id="leagueNext" style="margin:6px 0 0"></p></div>'
    +'<div class="panel"><h3>My streak</h3><p style="margin:0;font-weight:800" id="streakLine"></p><p class="small" id="streakNext" style="margin:6px 0 0"></p></div></div>'
    +'<div class="panel"><h3>Badges I won today</h3><div class="badges" id="badges"></div><p class="small" id="badgeNone" style="margin:8px 0 0"></p></div>'
    +'<div class="panel"><h3>My guess and the real number</h3><p id="resGuess" style="margin:0;font-weight:700"></p></div>'
    +'<div class="panel"><h3>3 things to tell at dinner</h3><p style="margin:0;font-weight:700">'+G.dinner.map((d,i)=>(i+1)+'. '+esc(d)).join('<br>')+'</p></div>'
    +'<div class="panel" id="sendPanel"><h3>Tell your grown-ups</h3><p class="cap" id="sendCap">Send them your result by email. Rate the game first!</p>'
      +'<div class="controls"><button class="btn" id="sendBtn" onclick="K.sendResult()">Send my result to my grown-ups</button><button class="btn ghost small" onclick="K.copyResults()">Copy it instead</button></div>'
      +'<div id="grownBox" hidden><p style="margin:14px 0 6px;font-weight:800">Ask a grown-up to type their email. For two grown-ups, put a comma between them.</p><div class="controls" style="margin-top:0"><input type="text" id="grownIn" inputmode="email" autocapitalize="off" autocomplete="off" spellcheck="false" placeholder="grownup@example.com" data-enter="grownSave"><button class="btn small" id="grownSave" onclick="K.saveGrownups()">Save</button></div><p class="small" id="grownMsg" style="margin:8px 0 0">It is saved only on this device.</p></div>'
      +'<p class="small" id="grownLine" style="margin:10px 0 0" hidden></p></div>'
    +'<div class="controls"><button class="btn ghost small" onclick="K.goTo(13)">Back to the shootout</button><a class="btn ghost small" href="'+HOME+'">All games</a></div>'
    +'<details class="src"><summary>For grown-ups: sources and accuracy</summary>'+(G.notes||[]).map(n=>'<p style="margin-top:10px">'+esc(n)+'</p>').join('')
    +'<p>Sources: '+(G.sources||[]).map(s=>'<a href="'+esc(s.u)+'" target="_blank" rel="noopener">'+esc(s.t)+'</a>').join('; ')+'.</p><p>Progress (players, goals, streaks) is saved in this browser on this device.</p></details></section>';

  h+='</main><button class="fab" id="fab" hidden onclick="K.openChat()" aria-label="Ask El Niño"><span class="av">'+nino(38)+'</span><span class="lbl">Stuck? Ask El Niño</span></button>'
    +'<section class="chat" id="chat" aria-label="Chat with El Niño"><header><span class="av">'+nino(44)+'</span><div><b>El Niño</b><small>Number-one helper of the Futbol Rebels</small></div><button class="x" onclick="K.closeChat()" aria-label="Close">&times;</button></header><div class="msgs" id="msgs"></div><div class="chips" id="chips"></div><div class="composer"><textarea id="chatIn" rows="1" placeholder="Ask me anything about today\'s story"></textarea><button class="send" id="chatSend" onclick="K.sendChat()" aria-label="Send">'+ICON.send+'</button></div></section>';
  $('app').innerHTML=h;
  document.querySelectorAll('[data-scene]').forEach(el=>{ const f=SCENES[el.dataset.scene]; el.innerHTML = f ? f() : ''; });
  return true;
}

/* ---------- progress / navigation (one page at a time) ---------- */
function paintProgress(){ [...$('progress').children].forEach((s,i)=>{ const k=i+1; s.className = k<S.step?'done':(k===S.step?'cur':''); }); }
function next(){ goTo(S.step+1); }
function back(){ if(S.step>1) goTo(S.step-1); }
function goTo(n){
  const sec = document.querySelector('.step[data-step="'+n+'"]'); if(!sec) return;
  try{ const ae=document.activeElement; if(ae && ae!==document.body && ae.blur) ae.blur(); }catch(e){}
  $('fab').style.visibility='';
  document.querySelectorAll('.step.shown').forEach(s=>s.classList.remove('shown'));
  S.step = n; sec.classList.add('shown'); paintProgress();
  try{ window.scrollTo(0,0); }catch(e){}
  $('fab').hidden = n===0;
  const i = n>=2&&n<=6 ? n-2 : n>=8&&n<=12 ? n-3 : -1, pg = i>=0 ? G.pages[i] : null;
  if(pg && pg.toy && TOYS[pg.toy] && !S.toyInit[n]){ S.toyInit[n]=true; try{ TOYS[pg.toy].init($('toy-'+n), { done:()=>{ S.toyDone[n]=true; gate(n); }, fmt, esc }); }catch(e){ S.toyDone[n]=true; gate(n); } }
  if(pg && pg.guessBack) showGuessBack();
  if(n===13) buildShootout();
}
/* a page with a toy or a quick check keeps Next locked until they are done */
function gate(n){
  const i = n<7 ? n-2 : n-3, pg=G.pages[i]; if(!pg) return;
  const ok = (!pg.toy || !TOYS[pg.toy] || S.toyDone[n]) && (!pg.quick || (S.quick[n]&&S.quick[n].done));
  const b=$('next-'+n), hnt=$('hint-'+n); if(b) b.disabled=!ok; if(hnt) hnt.hidden=ok;
}

/* ---------- locker room: players and shirts ---------- */
/* no stripe color picked = a one-color shirt; tap a stripe color to add stripes, tap it again to take them off */
let kitDraft = { style:'solid', c1:'#1F9D6B', c2:'' };
function renderSwatches(){
  const sw=(which,p)=>{ const on=kitDraft[which]===p[1], same=which==='c2'&&p[1]===kitDraft.c1;
    return '<button class="sw'+(on?' on':'')+'" style="background:'+p[1]+'" title="'+p[0]+'" aria-label="'+p[0]+(which==='c2'?' stripes':'')+'" aria-pressed="'+on+'"'+(same?' disabled':'')+' onclick="K.setKitColor(\''+which+'\',\''+p[1]+'\')"></button>'; };
  $('swA').innerHTML = L.PALETTE.map(p=>sw('c1',p)).join(''); $('swB').innerHTML = L.PALETTE.map(p=>sw('c2',p)).join('');
  $('swBHint').textContent = kitDraft.c2 ? '(tap it again for one color)' : '(tap one to add stripes)';
  $('kitPrev').innerHTML = shirt(kitDraft, 150);
}
function setKitColor(which, c){
  if(which==='c2') kitDraft.c2 = kitDraft.c2===c ? '' : c;
  else { kitDraft.c1=c; if(kitDraft.c2===c) kitDraft.c2=''; }
  kitDraft.style = kitDraft.c2 ? 'stripes' : 'solid';
  renderSwatches();
}
function renderLocker(){
  const has = DB.order.length>0;
  $('playerBox').hidden = !has;
  $('playerList').innerHTML = DB.order.map(id=>{ const p=DB.players[id]; return '<button class="track'+(S.pid===id?' on':'')+'" onclick="K.pickPlayer(\''+id+'\')"><span class="kit">'+shirt(p.kit,56)+'</span><span><b>'+esc(p.name)+'</b><small>'+leagueFor(p.goals).name+' · '+p.goals+' goals</small></span></button>'; }).join('');
  if(!has) showNewPlayer();
}
function showNewPlayer(){ $('newPlayer').hidden=false; $('addBtn').hidden=true; renderSwatches(); }
function createPlayer(){
  const name = $('pName').value.trim().replace(/\s+/g,' ');
  if(name.length<1){ $('joinMsg').textContent='Type your name first!'; $('pName').focus(); return; }
  const id='p'+Date.now().toString(36);
  DB.players[id] = { name, kit:{...kitDraft}, goals:0, streak:0, best:0, lastN:0, subWeek:'', badges:[], history:{} };
  DB.order.push(id); L.save();
  $('pName').value=''; $('joinMsg').textContent=''; $('newPlayer').hidden=true; $('addBtn').hidden=false;
  pickPlayer(id);
}
function pickPlayer(id){
  if(!DB.players[id]) return;
  S.pid=id; DB.last=id; L.save(); renderLocker(); paintWho();
  $('startBtn').disabled=false; $('startBtn').textContent='Kick off, '+P().name+'!';
}
function paintWho(){
  const p=P(); if(!p){ $('who').textContent='Game '+G.n; return; }
  $('who').innerHTML='<span class="kit">'+shirt(p.kit,30)+'</span><b>'+esc(p.name)+'</b><span class="statpill" title="Total goals">'+ICON.ball+'<span class="num">'+p.goals+'</span></span>';
}
function startGame(){ if(!S.pid) return; goTo(1); }

/* ---------- page 1: the guess ---------- */
function lockGuess(){
  const v=readNum('guessIn');
  if(isNaN(v)){ $('guessMsg').textContent='Type a number first!'; return; }
  S.guess=v; $('guessIn').blur(); $('guessIn').disabled=true; $('guessBtn').disabled=true;
  $('guessMsg').innerHTML='Locked in: <b class="num">'+fmt(v)+'</b>. We will find out soon!';
  $('next-1').disabled=false;
}
function guessClose(){ return S.guess!==null && Math.abs(S.guess-G.guess.answer)<=(G.guess.close||0); }
function guessLine(){
  if(S.guess===null) return '';
  const a=G.guess.answer;
  return 'You guessed <b class="num">'+fmt(S.guess)+'</b>. The real number: <b class="num">'+fmt(a)+'</b>. '+(S.guess===a?'Exactly right. Wow!':guessClose()?'So close!':S.guess<a?'Even more than you thought!':'Not quite that many.');
}
function showGuessBack(){ const el=$('guessBack'); if(!el) return; el.innerHTML=guessLine(); el.hidden = S.guess===null; }

/* ---------- page 7: halftime riddle ---------- */
function checkRiddle(){
  const r=S.riddle, d=G.riddle; if(r.done) return;
  const v=$('riddleIn').value.trim().toLowerCase(), fb=$('riddleFb'); fb.classList.add('show');
  if(!v){ fb.innerHTML='Type your answer first!'; return; }
  r.tries++;
  const ok = d.accept.some(a=>v.indexOf(String(a).toLowerCase())>=0);
  if(ok){ r.done=true; r.ok=true; fb.innerHTML='<span class="pill-ok">Yes! </span>'+rich(d.explain); }
  else if(r.tries===1){ fb.innerHTML=ninoSay('Not yet! Hint: '+rich(d.hint)); }
  else { r.done=true; fb.innerHTML='<span class="pill-bad">Good try! </span>The answer is: <b>'+esc(d.answer)+'</b>. '+rich(d.explain); }
  if(r.done){ $('riddleIn').blur(); $('riddleIn').disabled=true; $('riddleBtn').disabled=true; $('next-7').disabled=false; $('hint-7').hidden=true; }
}

/* ---------- quick check on a story page ---------- */
function checkQuick(n){
  const i = n<7 ? n-2 : n-3, d=G.pages[i].quick, q=S.quick[n]||(S.quick[n]={tries:0,done:false}); if(q.done) return;
  const v=readNum('qcIn-'+n), fb=$('qcFb-'+n); fb.classList.add('show');
  if(isNaN(v)){ fb.innerHTML='Type a number first!'; return; }
  q.tries++;
  if(v===d.answer){ q.done=true; fb.innerHTML='<span class="pill-ok">Yes! </span>'+rich(d.fb); }
  else if(q.tries===1){ fb.innerHTML=ninoSay('Almost! '+rich(d.hint)); }
  else { q.done=true; fb.innerHTML='<span class="pill-bad">Good try! </span>'+rich(d.fb); }
  if(q.done){ $('qcIn-'+n).blur(); $('qcIn-'+n).disabled=true; $('qcBtn-'+n).disabled=true; gate(n); }
}

/* ---------- page 13: the penalty shootout ---------- */
function shot(k){ return S.shots[k] || (S.shots[k]={tries:0,done:false,first:false}); }
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
const goalWord = st => '<span class="pill-ok">'+(st.first?'GOAL! ':'Scored on the rebound! ')+'</span>';
let shootoutBuilt=false;
function buildShootout(){ if(shootoutBuilt){ paintBoard(); return; } shootoutBuilt=true; renderShot(1); renderShot(2); buildOrder(); EX.forEach((x,j)=>{ if(x.kind==='num') renderNum(6+j); else renderShot(6+j); }); paintBoard(); }
const shotData = k => k>=6 ? EX[k-6] : G.shots[k];
function renderNum(k){
  const d=shotData(k), el=$('shot'+k); shot(k);
  el.innerHTML='<div class="qc-label">Shot '+k+' of '+NSHOTS+' · '+esc(d.label||'hard numbers')+' · type it</div><div class="qt">'+rich(d.q)+'</div><div class="controls" style="margin-top:0">'
    +(d.stack?'<span class="stack" aria-hidden="true">'+d.stack.map(x=>'<span>'+esc(x)+'</span>').join('')+'<span class="bar"></span></span>':'')
    +(d.expr?'<span class="math" style="font-size:1.6rem">'+esc(d.expr)+'</span>':'')
    +numField('xIn-'+k,d.q,'xBtn-'+k)+'<button class="btn small" id="xBtn-'+k+'" onclick="K.checkExtra('+k+')">Shoot!</button></div><div class="fb" id="xFb-'+k+'"></div>';
}
function checkExtra(k){
  const st=shot(k), d=shotData(k); if(st.done) return;
  const v=readNum('xIn-'+k), fb=$('xFb-'+k); fb.classList.add('show');
  if(isNaN(v)){ fb.innerHTML='Type a number first!'; return; }
  st.tries++;
  if(v===d.answer){ st.done=true; st.first=st.tries===1; fb.innerHTML=goalWord(st)+rich(d.fb); }
  else if(st.tries===1){ fb.innerHTML=ninoSay('Off the post! Take the rebound. Hint: '+rich(d.hint)); }
  else { st.done=true; fb.innerHTML='<span class="pill-bad">Saved by the keeper. </span>'+rich(d.fb); }
  if(st.done){ $('xIn-'+k).blur(); $('xIn-'+k).disabled=true; $('xBtn-'+k).disabled=true; }
  paintBoard();
}
function renderShot(k){
  const d=shotData(k), el=$('shot'+k); shot(k);
  el.innerHTML='<div class="qc-label">Shot '+k+' of '+NSHOTS+' · '+(k>=6?esc(d.label||'brain teaser')+' · ':'')+'tap</div><div class="qt">'+rich(d.q)+'</div><div class="opts">'+d.opts.map((o,i)=>'<button class="opt" data-i="'+i+'"><span class="k">'+'ABCD'[i]+'</span><span>'+rich(o)+'</span></button>').join('')+'</div><div class="fb"></div>';
  el.querySelectorAll('.opt').forEach(b=>b.onclick=()=>{
    const st=shot(k); if(st.done||b.disabled) return;
    st.tries++; const ok=(+b.dataset.i)===d.a, fb=el.querySelector('.fb');
    if(ok){ b.classList.add('right'); st.done=true; st.first=st.tries===1; fb.innerHTML=goalWord(st)+rich(d.fb); }
    else if(st.tries===1){ b.classList.add('wrong'); b.disabled=true; fb.innerHTML=ninoSay('Off the post! Take the rebound. Hint: '+rich(d.hint)); }
    else { b.classList.add('wrong'); el.querySelector('.opt[data-i="'+d.a+'"]').classList.add('right'); st.done=true; fb.innerHTML='<span class="pill-bad">Saved by the keeper. </span>'+rich(d.fb); }
    if(st.done) el.classList.add('locked');
    fb.classList.add('show'); paintBoard();
  });
}
const orderKey = () => G.shots.order.cards.map((c,i)=>i).join(',');
function buildOrder(){
  const n=G.shots.order.cards.length; let ids=shuffle(G.shots.order.cards.map((c,i)=>i));
  if(ids.join(',')===orderKey()) ids=ids.slice(1).concat(ids[0]);
  const box=$('order'); box.innerHTML='';
  ids.forEach(id=>{ const el=document.createElement('button'); el.className='card'; el.dataset.id=id; el.innerHTML='<span class="n"></span><span>'+rich(G.shots.order.cards[id])+'</span>'; el.onclick=()=>pickOrder(id); box.appendChild(el); });
}
function paintOrder(){ document.querySelectorAll('#order .card').forEach(c=>{ const k=S.order.indexOf(+c.dataset.id); c.classList.toggle('picked',k>=0); c.classList.remove('ok','ko'); c.querySelector('.n').textContent=k>=0?k+1:''; }); $('orderCheck').disabled = S.order.length!==G.shots.order.cards.length; }
function pickOrder(id){ if(shot(3).done) return; const i=S.order.indexOf(id); if(i>=0) S.order.splice(i,1); else S.order.push(id); paintOrder(); }
function resetOrder(){ if(shot(3).done) return; S.order=[]; paintOrder(); }
function checkOrder(){
  const st=shot(3), d=G.shots.order; if(st.done||S.order.length!==d.cards.length) return;
  st.tries++; const ok=S.order.join(',')===orderKey(), fb=$('orderFb'); fb.classList.add('show');
  if(ok){ st.done=true; st.first=st.tries===1; document.querySelectorAll('#order .card').forEach(c=>c.classList.add('ok')); fb.innerHTML=goalWord(st)+rich(d.fb); }
  else if(st.tries===1){ fb.innerHTML=ninoSay('Off the post! Take the rebound. Hint: '+rich(d.hint)); S.order=[]; paintOrder(); }
  else { st.done=true; document.querySelectorAll('#order .card').forEach(c=>{ const right=+c.dataset.id; c.classList.remove('picked'); c.classList.add(S.order.indexOf(right)===right?'ok':'ko'); c.querySelector('.n').textContent=right+1; }); fb.innerHTML='<span class="pill-bad">Saved by the keeper. </span>The numbers now show the right order. '+rich(d.fb); }
  if(st.done){ $('orderCheck').disabled=true; $('orderReset').disabled=true; }
  paintBoard();
}
function checkMath(){
  const st=shot(4), d=G.shots.math; if(st.done) return;
  const v=readNum('mathIn'), fb=$('mathFb'); fb.classList.add('show');
  if(isNaN(v)){ fb.innerHTML='Type a number first!'; return; }
  st.tries++;
  if(v===d.answer){ st.done=true; st.first=st.tries===1; fb.innerHTML=goalWord(st)+rich(d.fb); }
  else if(st.tries===1){ fb.innerHTML=ninoSay('Off the post! Take the rebound. Hint: '+rich(d.hint)); }
  else { st.done=true; fb.innerHTML='<span class="pill-bad">Saved by the keeper. </span>'+rich(d.fb); }
  if(st.done){ $('mathIn').blur(); $('mathIn').disabled=true; $('mathBtn').disabled=true; }
  paintBoard();
}
function checkGolden(){
  const g=S.golden, d=G.shots.golden; if(g.done) return;
  const v=readNum('goldIn'), fb=$('goldFb'); fb.classList.add('show');
  if(isNaN(v)){ fb.innerHTML='Type a number first!'; return; }
  g.tries++;
  if(v===d.answer){ g.done=true; g.ok=true; fb.innerHTML='<span class="pill-ok">GOLDEN GOAL! </span>'+rich(d.fb); }
  else if(g.tries===1){ fb.innerHTML=ninoSay('So close! Hint: '+rich(d.hint)); }
  else { g.done=true; fb.innerHTML='<span class="pill-bad">Just wide! </span>'+rich(d.fb); }
  if(g.done){ $('goldIn').blur(); $('goldIn').disabled=true; $('goldBtn').disabled=true; }
  paintBoard();
}
function shotState(k){ if(k===5) return !S.coach.graded ? '' : (S.coach.stars>=2?'goal':'miss'); const st=shot(k); return !st.done ? '' : (st.first?'goal':'miss'); }
function paintBoard(){
  let h='<span class="lbl">Shots</span>';
  for(let k=1;k<=NSHOTS;k++){ const s=shotState(k); h+='<span class="dot '+s+'" title="Shot '+k+'">'+(s==='goal'?'&#10003;':s==='miss'?'&times;':k)+'</span>'; }
  h+='<span class="dot star '+(S.golden.ok?'goal':'')+'" title="Golden Goal">&#9733;</span>';
  $('board').innerHTML=h;
}

/* ---------- AI backend (from the kit): Claude's `sample` capability when the page is opened inside Claude, else none.
   The kit's proxy client for a public site plugs in here later. Without it, the self-check and ready-made answers are used. ---------- */
let samplePromise = IN_CLAUDE ? Promise.resolve().then(()=>window.claude.use('sample')).catch(()=>null) : Promise.resolve(null);
const AI = {
  mode:null,
  async init(){ if(this.mode) return this.mode; const s=await samplePromise; this.mode = s?'sample':'none'; return this.mode; },
  async chat(system, history, onText){
    const m=await this.init();
    if(m==='sample'){ const s=await samplePromise; const turns=[{role:'user', content: system+'\n\n(Answer the child\'s question below.)\n\n'+history[0].content}, ...history.slice(1)]; const r=await s(turns,{modelTier:'default', cache:false, onText:({text})=>onText&&onText(text)}); return r.text; }
    const e=new Error('no_ai'); e.code='no_ai'; throw e;
  },
  async json(prompt){
    const m=await this.init();
    if(m==='sample'){ const s=await samplePromise; return await s.json(prompt,{modelTier:'quick', cache:false}); }
    const e=new Error('no_ai'); e.code='no_ai'; throw e;
  }
};
function withTimeout(p, ms){ return Promise.race([p, new Promise((_,rej)=>setTimeout(()=>{ const e=new Error('timeout'); e.code='timeout'; rej(e); }, ms))]); }

/* ---------- shot 5: you are the coach (explain it back; self-check fallback as in the kit) ---------- */
function starsHtml(n){ return '<div class="stars">'+'&#9733;'.repeat(n)+'<span class="off">'+'&#9733;'.repeat(3-n)+'</span></div>'; }
function coachDone(){ $('coachBtn').textContent='Checked'; $('coachIn').blur(); $('coachIn').readOnly=true; $('fab').style.visibility=''; paintBoard(); }
const modelBox = () => '<details style="margin-top:10px"><summary>How El Niño would say it</summary><p style="margin:8px 0 0">'+esc(G.shots.coach.model)+'</p></details>';
async function gradeCoach(){
  const d=G.shots.coach, txt=$('coachIn').value.trim(); S.coach.text=txt; const fb=$('coachFb'); fb.classList.add('show');
  if(S.coach.graded) return;
  if(txt.length<15 || txt.split(/\s+/).length<4){ fb.innerHTML=ninoSay('Coaches use full sentences! Write or say a little more. You know this.'); return; }
  $('coachBtn').disabled=true; fb.innerHTML=ninoSay('Let me read that...');
  const mode = await AI.init();
  if(mode!=='none'){
    try{
      const prompt = 'You are El Niño, a friendly young soccer player who helps a second grader (about 7 years old) named '+P().name+' in a learning game.\n'+G.lesson+'\n\nThe child was asked: "'+d.q+'"\nThe two key ideas of a full answer: (1) '+d.ideas[0]+'; (2) '+d.ideas[1]+'.\nThe child\'s answer:\n"""'+txt+'"""\n\nReply with JSON only, no other text: {"on_topic": true or false, "stars": 1, 2 or 3, "praise": "one short sentence naming something specific the child got right", "tip": "one short, kind sentence about what to add next time"}.\non_topic is false only if the answer is gibberish or is not about today\'s story at all. stars: 3 if the answer has BOTH key ideas; 2 if it has one of them; 1 for a real try that has neither. Ignore spelling and grammar mistakes. Use very simple words a 7-year-old can read. No emoji.';
      const r = await withTimeout(AI.json(prompt), 30000);
      if(r && r.on_topic===false && S.coach.offTopic<1){ S.coach.offTopic++; $('coachBtn').disabled=false; fb.innerHTML=ninoSay('Hmm, I need to hear about today\'s story! Try again, coach.'); return; }
      const stars=Math.max(1,Math.min(3,+r.stars||1)); S.coach.stars=stars; S.coach.graded=true;
      fb.innerHTML=starsHtml(stars)+ninoSay('<b>'+esc(r.praise||'Nice work, coach!')+'</b>')+'<p class="small" style="margin:8px 0 0">'+esc(r.tip||'')+'</p>'+modelBox();
      coachDone(); return;
    }catch(e){ /* fall through to the self-check */ }
  }
  S.coach.graded=true; S.coach.stars=0;
  fb.innerHTML='<p style="margin:0 0 8px">Read your answer again. Tap each thing you said:</p>'+d.rubric.map((r,i)=>'<label class="chk"><input type="checkbox" data-r="'+i+'" onchange="K.rubricChange()"><span>'+esc(r)+'</span></label>').join('')+'<div id="rubStars">'+starsHtml(0)+'</div>'+modelBox();
  coachDone();
}
function rubricChange(){ const n=[...document.querySelectorAll('#coachFb input:checked')].length; S.coach.stars=Math.min(3,n); $('rubStars').innerHTML=starsHtml(S.coach.stars); paintBoard(); }

/* ---------- final whistle (adapted from the kit's finish()) ---------- */
function finish(){
  const first=k=>{ const st=shot(k); return st.done&&st.first?1:0; };
  const xk = EX.map((x,j)=>6+j);
  const shotGoals = first(1)+first(2)+first(3)+first(4)+(S.coach.graded&&S.coach.stars>=2?1:0)+xk.reduce((a,k)=>a+first(k),0);
  const todo = [
    [shot(1).done, 'Finish shot 1'], [shot(2).done, 'Finish shot 2'], [shot(3).done, 'Finish shot 3 (the order)'],
    [shot(4).done, 'Finish shot 4 (the math)'], [S.coach.graded, 'Send your coach talk to El Niño (shot 5)']
  ].concat(xk.map(k=>[shot(k).done, 'Finish shot '+k+' (extra time)']));
  const complete = todo.every(t=>t[0]);
  const p=P(); const rec=p.history[G.code];
  let game;
  if(rec && rec.complete){ game={...rec, already:true}; }
  else if(complete){
    const golden=S.golden.ok?2:0, badges=[];
    let streakAfter=p.streak, sub=false, bonus=0;
    if(!LATE){
      /* streak counts games played on their own day; one substitute a week covers one missed game */
      if(p.lastN===G.n-1 && p.lastN>0) streakAfter=p.streak+1;
      else if(p.lastN===G.n-2 && p.lastN>0 && p.subWeek!==G.week){ streakAfter=p.streak+1; sub=true; }
      else streakAfter=1;
      bonus = streakAfter>=3?1:0;
    }
    const today=shotGoals+1+golden+bonus;
    if(Object.keys(p.history).length===0) badges.push(['1','Kickoff']);
    if(guessClose()) badges.push(['&#9678;','Sharp Shooter']);
    if(shotGoals===NSHOTS) badges.push(['&#10003;','Clean Sheet']);
    if(S.coach.stars===3) badges.push(['&#9733;','Playmaker']);
    if(S.golden.ok) badges.push(['G','Golden Boot']);
    if(LATE) badges.push(['S','Super Sub']);
    if(!LATE && L.STREAK_BADGES[streakAfter]) badges.push([String(streakAfter),L.STREAK_BADGES[streakAfter]]);
    p.goals+=today;
    if(!LATE){ p.streak=streakAfter; p.best=Math.max(p.best||0,streakAfter); p.lastN=G.n; if(sub) p.subWeek=G.week; }
    badges.forEach(b=>{ if(!p.badges.includes(b[1])) p.badges.push(b[1]); });
    game={ complete:true, late:LATE, today, shotGoals, golden, bonus, streakAfter, sub, stars:S.coach.stars, badges, guess:S.guess, at:new Date().toISOString(),
      detail:{ firsts:[1,2,3,4].concat(xk).map(first).join(''), riddle:S.riddle.ok?1:0, golden:S.golden.done?(S.golden.ok?'1':'0'):'s' } };
    p.history[G.code]=game; L.save(); paintWho();
  } else {
    game={ complete:false, late:LATE, today:shotGoals+(S.golden.ok?2:0), shotGoals, golden:S.golden.ok?2:0, bonus:0, streakAfter:p.streak, stars:S.coach.stars, badges:[] };
  }
  S.game=game;
  goTo(14);
  $('ringTxt').textContent=game.today; const ring=$('ring'); ring.style.setProperty('--p',0); setTimeout(()=>ring.style.setProperty('--p',Math.min(100,Math.round(game.today/(NSHOTS+3)*100))),60);
  $('resTitle').textContent = !game.complete ? 'Not full time yet, '+p.name+'!' : game.shotGoals===NSHOTS ? 'Full time, '+p.name+'! A perfect shootout!' : game.shotGoals>=3 ? 'Full time, '+p.name+'! Great match!' : 'Full time, '+p.name+'! You played it all the way through!';
  $('resLine').innerHTML = game.complete ? '<span class="num">'+game.today+'</span> goal'+(game.today===1?'':'s')+' banked'+(game.late?' from this replay':' today')+(game.already?' (you already banked this game)':'')+'.' : 'Finish every shot to bank your goals.';
  $('resDetail').innerHTML = 'Shots: <span class="math">'+game.shotGoals+' of '+NSHOTS+'</span>'+(game.complete?' · Finished the game: <span class="math">+1</span>':'')+(game.golden?' · Golden Goal: <span class="math">+2</span>':'')+(game.bonus?' · Streak bonus: <span class="math">+1</span>':'');

  /* the vault */
  const vault=$('vault');
  if(game.complete && !game.late){
    vault.classList.add('open'); $('vaultLock').innerHTML=ICON.lockOpen;
    $('vaultTitle').textContent='Today\'s secret passcode is:';
    $('vaultBody').innerHTML='<div class="pw">'+esc(L.decode(G.pw))+'</div><p class="small" style="margin:0">Tell it to a grown-up at home. They know what it unlocks. The passcode changes every day.</p>';
  } else if(game.complete){
    vault.classList.add('open'); $('vaultLock').innerHTML=ICON.lockOpen;
    $('vaultTitle').textContent='Replay finished!';
    $('vaultBody').innerHTML='<p style="margin:0;font-weight:700">This game now counts for the weekend passcode. The daily passcode was only for the day itself.</p><div style="margin-top:12px"><a class="btn small" href="'+HOME+'">See my week</a></div>';
  } else {
    vault.classList.remove('open'); $('vaultLock').innerHTML=ICON.lockShut;
    $('vaultTitle').textContent='The vault is still locked';
    $('vaultBody').innerHTML='<p style="margin:0 0 6px;font-weight:700">To open it, finish the whole shootout:</p><div class="todo">'+todo.map(t=>'<span class="'+(t[0]?'ok':'no')+'">'+(t[0]?'&#10003; ':'&#9675; ')+t[1]+'</span>').join('')+'</div><div style="margin-top:12px"><button class="btn small" onclick="K.goTo(13)">Back to the shootout</button></div>';
  }

  /* league, streak, badges */
  const lg=leagueFor(p.goals);
  $('leagueLine').innerHTML='<span class="num">'+p.goals+'</span> total goal'+(p.goals===1?'':'s')+' · '+lg.name;
  const span = lg.next ? lg.next[0]-lg.at : 1, into = lg.next ? p.goals-lg.at : 1;
  setTimeout(()=>{ $('leagueBar').style.width=Math.max(4,Math.round(into/span*100))+'%'; },200);
  $('leagueNext').textContent = lg.next ? (lg.next[0]-p.goals)+' more goals to reach the '+lg.next[1]+'.' : 'The top league. Legend!';
  const st=p.streak;
  $('streakLine').innerHTML = game.late ? 'Your streak: <span class="num">'+st+'</span>. Replays do not change it.' : game.complete ? '<span class="num">'+st+'</span> school day'+(st===1?'':'s')+' in a row'+(st===1?'. A great start!':'!')+(game.sub?' Your substitute kept the streak alive.':'') : 'Your streak: <span class="num">'+st+'</span>. Today does not count until you finish.';
  const nextM=[3,7,14,30].find(m=>m>st);
  $('streakNext').textContent = game.complete && !game.late && nextM ? (nextM-st)+' more day'+(nextM-st===1?'':'s')+' to the '+L.STREAK_BADGES[nextM]+' badge.' : '';
  $('badges').innerHTML = game.badges.map(b=>'<span class="badge new"><span class="dot">'+b[0]+'</span>'+b[1]+'</span>').join('');
  $('badgeNone').textContent = game.badges.length ? '' : (game.complete ? 'None this time. Badges go to players with no misses, a three-star coach talk, a Golden Goal, or a streak.' : 'Finish the shootout to win badges.');
  $('resGuess').innerHTML = guessLine() || 'No guess this time.';
  renderRate(); paintGrownups();
}
/* ---------- rate the game: 5 stars, then one follow-up question. Saved with the player's result. ---------- */
const RATE = {
  liked:  [['story','The story'],['toys','The things I got to play with'],['riddle','The riddle'],['math','The math'],['right','It was just right for me'],['wild','I learned something wild']],
  better: [['easy','It was too easy. Make it harder!'],['hardmath','The math was too hard'],['reading','There was too much reading'],['boring','The story was boring'],['long','It was too long'],['broken','Something did not work']]
};
function renderRate(){
  const box=$('rate'), p=P(), rec=p&&p.history[G.code];
  if(!rec||!rec.complete){ box.hidden=true; return; }
  const r=rec.rating||{}; box.hidden=false;
  let h='<h3>How was this game?</h3><p class="cap">Tap the stars.</p><div class="rate-stars" role="group" aria-label="Rate this game">'+[1,2,3,4,5].map(n=>'<button class="'+(r.stars>=n?'on':'')+'" aria-label="'+n+(n>1?' stars':' star')+'" aria-pressed="'+(r.stars===n)+'" onclick="K.rate('+n+')">&#9733;</button>').join('')+'</div>';
  if(r.stars){
    const kind = r.stars>=4 ? 'liked' : 'better';
    h+='<p class="rate-q">'+(kind==='liked'?'What did you like best?':'What could be better?')+'</p><div class="picks">'+RATE[kind].map(o=>'<button class="pick'+(r.why===o[0]?' on':'')+'" onclick="K.rateWhy(\''+o[0]+'\')">'+o[1]+'</button>').join('')+'</div>';
    if(r.why) h+='<p class="small" id="rateThanks" style="margin:12px 0 0">Thanks, coach! That helps make the next games better.</p>';
  }
  box.innerHTML=h;
}
function rate(n){
  const rec=P().history[G.code]; if(!rec) return;
  const old=rec.rating||{}, sameKind = old.stars && ((old.stars>=4)===(n>=4));
  rec.rating={ stars:n, why: sameKind ? (old.why||'') : '', at:new Date().toISOString() }; L.save(); renderRate();
}
function rateWhy(id){ const rec=P().history[G.code]; if(!rec||!rec.rating) return; rec.rating.why=id; rec.rating.at=new Date().toISOString(); L.save(); renderRate(); }

function summaryText(){
  const p=P(), g=S.game||{};
  return 'Lenny\'s Daily Kickoff #'+G.n+' · '+G.title+'\n'+p.name+': '+(g.today||0)+' goals (shots '+(g.shotGoals||0)+' of '+NSHOTS+(g.golden?', Golden Goal scored':'')+')'+(g.complete?(g.late?' · replay finished':' · finished'):' · not finished yet')+'\nTotal: '+p.goals+' goals · '+leagueFor(p.goals).name+' · streak '+p.streak+(g.badges&&g.badges.length?'\nBadges: '+g.badges.map(b=>b[1]).join(', '):'')+(S.coach.text?'\nMy coach talk: '+S.coach.text:'')+(function(){ const r=(p.history[G.code]||{}).rating; if(!r||!r.stars) return ''; const o=RATE[r.stars>=4?'liked':'better'].find(x=>x[0]===r.why); return '\nMy rating: '+r.stars+' of 5'+(o?' ('+o[1]+')':''); })();
}
/* ---------- send the result to the player's grown-ups by email (the kit's "send to Dad", with addresses kept on the device) ---------- */
function machineLine(){
  const p=P(), g=p.history[G.code]||{}, d=g.detail||{}, r=g.rating||{};
  return ['KICKOFF', G.code, G.date, p.name.replace(/[|\n]/g,' '), 'goals='+(g.today||0), 'shots='+(g.shotGoals||0), 'firsts='+(d.firsts||''), 'coach='+(g.stars||0), 'golden='+(d.golden||''), 'riddle='+(d.riddle==null?'':d.riddle), 'late='+(g.late?1:0), 'rating='+(r.stars||''), 'why='+(r.why||''), 'streak='+p.streak, 'total='+p.goals].join('|');
}
function mailtoUrl(){
  const p=P();
  const subject='Daily Kickoff result: '+p.name+', Game '+G.n;
  const body='Hi! I finished a game of Lenny\'s Daily Kickoff.\n\n'+summaryText()+'\n\n(The next line is for the game builder. Please leave it in.)\n'+machineLine()+'\n';
  return 'mailto:'+(p.grownups||[]).join(',')+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);
}
function paintGrownups(){
  const p=P(), has=!!(p&&p.grownups&&p.grownups.length), line=$('grownLine');
  line.hidden=!has;
  if(has) line.innerHTML='Goes to: '+esc(p.grownups.join(', '))+' · <button class="word" style="border-bottom-style:solid" onclick="K.editGrownups()">change</button>';
}
function editGrownups(){ const p=P(); $('grownBox').hidden=false; $('grownIn').value=(p.grownups||[]).join(', '); $('grownIn').focus(); }
function saveGrownups(){
  const list=$('grownIn').value.split(/[\s,;]+/).map(x=>x.trim()).filter(Boolean), msg=$('grownMsg');
  if(!list.length){ msg.textContent='Type an email address first.'; return false; }
  if(list.length>3 || !list.every(x=>/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(x))){ msg.textContent='That does not look like an email address. Try again, up to three.'; return false; }
  const p=P(); p.grownups=list; L.save(); $('grownBox').hidden=true; msg.textContent='It is saved only on this device.'; paintGrownups(); toast('Saved!'); return true;
}
function sendResult(){
  const p=P(), g=p.history[G.code];
  if(!g||!g.complete){ toast('Finish the shootout first!'); return; }
  if(!p.grownups||!p.grownups.length){ editGrownups(); return; }
  const url=mailtoUrl(); K.lastMailto=url;
  $('sendCap').textContent='Your email is ready. Tap Send in the email!';
  if(!K.noNav){ try{ window.location.href=url; }catch(e){} }
}
async function copyResults(){
  try{ await navigator.clipboard.writeText(summaryText()); toast('Copied! Paste it in a message.'); }
  catch(e){ toast('Could not copy here. Show this page instead!'); }
}

/* ---------- El Nino, the helper (adapted from the kit's assistant chat) ---------- */
const CHAT_MAX = 12;
let chatHistory=[], chatBusy=false, chatInit=false, chatCount=0;
function personaPrompt(){
  const p=P();
  return 'You are El Niño, a cheerful young soccer player who is the helper in "Lenny\'s Daily Kickoff", a daily learning game for kids. You are talking with '+(p?p.name:'a child')+', a second grader (about 7 years old) in Brooklyn, New York.\n'+G.lesson+'\n\nRules: Use very simple words and short sentences a 7-year-old can read. Answer in 2 or 3 short sentences. Use examples from a kid\'s life (soccer, the playground, pizza, the subway). If the child asks about a question from the quiz, do not give the answer: give a hint or a guiding question. If they ask about something beyond the story (animals, space, soccer, how things work), answer happily and accurately, and link it back to the story if you can. Only talk about things that are right for young children. If something is not right for kids, or is about personal or private things, gently say a grown-up is the best person to ask and go back to the story. Never ask for personal information. No emoji. Do not make up facts. If you are not sure, say so.';
}
function openChat(){ $('chat').classList.add('open'); $('fab').style.display='none'; if(!chatInit){ chatInit=true; initChat(); } }
function closeChat(){ $('chat').classList.remove('open'); $('fab').style.display=''; }
function addMsg(kind, html){ const m=document.createElement('div'); m.className='msg '+kind; m.innerHTML=html; $('msgs').appendChild(m); $('msgs').scrollTop=$('msgs').scrollHeight; return m; }
function renderChips(){ $('chips').innerHTML=(G.chips||[]).map(c=>'<button onclick="K.askChip(this)">'+esc(c)+'</button>').join(''); }
function askChip(b){ $('chatIn').value=b.textContent; sendChat(); }
function fmtBot(t){ return esc(t).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/\n/g,'<br>'); }
function chatOff(placeholder){ $('chatIn').disabled=true; $('chatSend').disabled=true; $('chatIn').placeholder=placeholder||'El Niño is not here right now'; $('chips').innerHTML=''; }
function helperError(e){
  const c=e&&e.code;
  if(c==='rate_limited') return 'El Niño needs a quick water break. Try again in a minute.';
  if(c==='timeout') return 'That took too long. Try again!';
  if(c==='not_granted'||c==='no_ai') return 'El Niño cannot answer questions here.';
  return 'Something went wrong. Try again!';
}
async function initChat(){
  const name = P()?P().name:'';
  const mode = await AI.init();
  if(mode==='none'){
    addMsg('bot','Hi'+(name?' '+esc(name):'')+'! I am El Niño. I cannot answer new questions here, but here are two quick ones:');
    addMsg('bot',(G.helperQA||[]).map(x=>'<b>'+esc(x.q)+'</b> '+esc(x.a)).join('<br><br>'));
    chatOff('El Niño cannot answer here'); return;
  }
  addMsg('bot','Hi'+(name?' '+esc(name):'')+'! I am El Niño. Stuck on something? Curious about something? Ask me!');
  renderChips();
}
async function sendChat(){
  const txt=$('chatIn').value.trim(); if(!txt||chatBusy||$('chatIn').disabled) return;
  $('chatIn').value=''; chatBusy=true; $('chatSend').disabled=true; $('chips').innerHTML='';
  addMsg('me', esc(txt));
  chatHistory.push({role:'user', content: txt});
  const bubble=addMsg('bot','<span class="typing"><i></i><i></i><i></i></span>');
  try{
    const text = await withTimeout(AI.chat(personaPrompt(), chatHistory.slice(), t=>{ bubble.innerHTML=fmtBot(t); $('msgs').scrollTop=$('msgs').scrollHeight; }), 45000);
    bubble.innerHTML=fmtBot(text); chatHistory.push({role:'assistant', content:text}); chatCount++;
  }catch(e){
    bubble.className='msg sys'; bubble.textContent=helperError(e); chatHistory.pop();
    if(e&&(e.code==='not_granted'||e.code==='no_ai')) chatOff();
  }
  chatBusy=false;
  if(chatCount>=CHAT_MAX){ addMsg('sys','That is a lot of great questions! El Niño is resting now. See you tomorrow.'); chatOff('El Niño is resting'); }
  if(!$('chatIn').disabled){ $('chatSend').disabled=false; renderChips(); }
  $('msgs').scrollTop=$('msgs').scrollHeight;
}

/* ---------- start ---------- */
window.K = { checkExtra, sendResult, saveGrownups, editGrownups, mailtoUrl, rate, rateWhy, next, back, goTo, lockGuess, checkRiddle, checkQuick, checkOrder, resetOrder, checkMath, checkGolden, gradeCoach, rubricChange, finish, copyResults,
  showNewPlayer, createPlayer, pickPlayer, setKitColor, startGame, openChat, closeChat, sendChat, askChip, state:S };
if(build()){
  const prog=$('progress'); for(let i=0;i<PAGES;i++){ prog.appendChild(document.createElement('span')); }
  document.addEventListener('click', e=>{ const w=e.target.closest('.word'); if(!w) return; const box=w.closest('.step').querySelector('.defbox'); if(!box) return; box.innerHTML='<b>'+esc(w.textContent)+':</b> '+esc(w.dataset.def); box.classList.add('show'); });
  document.addEventListener('keydown', e=>{ if(e.key!=='Enter') return; const t=e.target; if(t&&t.dataset&&t.dataset.enter){ e.preventDefault(); const b=$(t.dataset.enter); if(b&&!b.disabled) b.click(); } });
  $('pName').addEventListener('input', ()=>{ $('joinMsg').textContent=''; });
  $('chatIn').addEventListener('keydown', e=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); sendChat(); } });
  /* hide the helper button while a field is being typed in, so it never covers a button (from the kit) */
  document.addEventListener('focusin', e=>{ if(e.target.matches('input, textarea') && !$('chat').contains(e.target)) $('fab').style.visibility='hidden'; });
  document.addEventListener('focusout', e=>{ if(e.target.matches('input, textarea')) setTimeout(()=>{ if(!document.activeElement || !document.activeElement.matches('input, textarea')) $('fab').style.visibility=''; },150); });
  renderLocker(); paintProgress(); paintWho();
  if(DB.last && DB.players[DB.last]) pickPlayer(DB.last);
}
})();
