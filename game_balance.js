// ========================================================
// NSF VolleyBall V76-4.0 — UI FOUNDATION / STAT-BALANCE LAB
// Permanent developer instrumentation; separate from network transport.
// The scenario layer is intentionally reusable for a future Training/Tutorial mode.
// ========================================================
var BALANCE_FORCE_AI_ALL = false;
var BALANCE_TEST_ACTIVE = false;
var BALANCE_SIM_SPEED = 1;
var BALANCE_SCENARIO_ACTIVE = false;
var BALANCE_DISABLE_SKILLS = false;

(function(){
  'use strict';
  const BUILD='V76-4.0';
  const LEGACY_STORAGE_KEY='NSF_BALANCE_LAST_SESSION_V7531';
  const META_PREFIX='NSF_BALANCE_META_V7533_';
  const RESCUE_PREFIX='NSF_BALANCE_RESCUE_V7533_';
  const ARCHIVE_DB='NSF_BALANCE_ARCHIVE_V1', ARCHIVE_STORE='sessions';
  const HISTORY_LIMIT=24, RESCUE_EVENTS=360, RESCUE_SAMPLES=90;
  const MAX_EVENTS=10000, MAX_SAMPLES=2400;
  const STAT_KEYS=['str','agi','jump','dex','int'];
  const STAT_LABEL={str:'STR',agi:'AGI',jump:'JUMP',dex:'TEC',int:'INT'};
  const SLOT_KEYS=['user','mate','enemyFront','enemyBack'];
  let session=null, sampleTimer=null, checkpointTimer=null, lastScore='0:0', lastAIDebug={};
  let lastFormulaText='', lastFormulaRows=[];
  let scenario={active:false,type:'receive24',cycle:0,nextSpawnFrame:0,lastSpawnFrame:0};
  let originalRandom=null;

  function nowIso(){return new Date().toISOString();}
  function makeId(){return 'BL-'+Date.now().toString(36).toUpperCase()+'-'+Math.random().toString(36).slice(2,6).toUpperCase();}
  function f(v,n=2){return Number.isFinite(Number(v))?Number(v).toFixed(n):'-';}
  function n(v,d=0){v=Number(v);return Number.isFinite(v)?v:d;}
  function clone(obj){try{return JSON.parse(JSON.stringify(obj));}catch(e){return obj;}}
  function avg(arr){return arr.length?arr.reduce((a,b)=>a+n(b),0)/arr.length:0;}
  function q95(arr){if(!arr.length)return 0;const a=arr.map(Number).filter(Number.isFinite).sort((x,y)=>x-y);return a[Math.min(a.length-1,Math.floor(a.length*.95))]||0;}
  function seeded(seed){let a=(Number(seed)||753)>>>0;return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
  function setSeed(seed){if(originalRandom===null)originalRandom=Math.random;Math.random=seeded(seed);}
  function restoreRandom(){if(originalRandom){Math.random=originalRandom;originalRandom=null;}}

  function playerSnapshot(p){
    if(!p||!p.stats)return null;
    return {
      slot:p.slotKey,name:p.name,team:p.isLeft?'LEFT':'RIGHT',x:+f(p.x,1),y:+f(p.y,1),vx:+f(p.vx,2),vy:+f(p.vy,2),grounded:!!p.isGrounded,dive:!!p.isDiving,block:!!p.isBlocking,
      raw:{str:p.stats.str,agi:p.stats.agi,jump:p.stats.jumpStat,tec:p.stats.tec??p.stats.dex,int:p.stats.int},
      effective:{str:p.stats.effectiveStr,agi:p.stats.effectiveAgi,jump:p.stats.effectiveJump,tec:p.stats.effectiveTec,int:p.stats.effectiveInt},
      derived:{speed:+f(p.stats.speed,3),power:+f(p.stats.power,3),defense:+f(p.stats.defense,3),rigidity:+f(p.stats.blockRigidity,3),sweet:p.stats.sweetWindow,reach:+f(p.stats.reach,2),reaction:+f(p.stats.reactionDelay,3),technique:+f(p.stats.technique,3),oneTouchAbsorb:p.stats.oneTouchAbsorb,diveSpeed:+f(p.stats.diveSpeed,3),outball:+f(p.stats.outballThreshold,3)}
    };
  }
  function rosterSnapshot(){return typeof allPlayers!=='undefined'?allPlayers.map(playerSnapshot).filter(Boolean):[];}
  function ballSnapshot(){
    if(typeof ball==='undefined'||!ball)return null;
    return {x:+f(ball.x,1),y:+f(ball.y,1),vx:+f(ball.vx,3),vy:+f(ball.vy,3),speed:+f(Math.hypot(ball.vx||0,ball.vy||0),3),spiked:!!ball.isSpiked,float:!!ball.isFloat,topspin:!!ball.isTopspin,topspinRating:+f(ball.topspinRating||0,3),skill:ball.activeSkillTag||'',lastHitter:ball.lastHitter?ball.lastHitter.slotKey:null,attackStyle:ball.attackStyle||null,aiAttackIntentId:ball._aiAttackIntentId||null,aiAttackIntentStyle:ball._aiAttackIntentStyle||null,aiAttackPlannedStyle:ball._aiAttackPlannedStyle||null,aiAttackSourceSlot:ball._aiAttackSourceSlot||null};
  }
  function event(type,data={}){
    if(!session||!session.active)return;
    const t=+((performance.now()-session.startedPerf)/1000).toFixed(3);
    session.events.push({t,frame:typeof gameFrame!=='undefined'?gameFrame:0,type,...data});
    if(session.events.length>MAX_EVENTS){session.events.splice(0,session.events.length-MAX_EVENTS);session.eventTrimmed=true;}
  }
  function sample(){
    if(!session||!session.active)return;
    const sc=(typeof score!=='undefined')?`${score.player}:${score.enemy}`:'-';
    session.samples.push({t:+((performance.now()-session.startedPerf)/1000).toFixed(2),frame:typeof gameFrame!=='undefined'?gameFrame:0,score:sc,ball:ballSnapshot(),players:rosterSnapshot()});
    if(session.samples.length>MAX_SAMPLES)session.samples.splice(0,session.samples.length-MAX_SAMPLES);
    if(sc!==lastScore){event('SCORE_CHANGE',{from:lastScore,to:sc,point:typeof match!=='undefined'?clone(match.lastPointEvent):null});lastScore=sc;}
    refreshRuntimeHUD();
  }
  // ---------- Cross-tab-safe Session History / Archive ----------
  // localStorage only keeps a small per-session rescue checkpoint + tiny metadata index.
  // Full completed sessions go to IndexedDB, avoiding the 5MB-ish localStorage ceiling and
  // preventing parallel tabs from overwriting one shared LAST_SESSION slot.
  function historyRead(){
    const out=[];
    try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(!k||!k.startsWith(META_PREFIX))continue;try{const x=JSON.parse(localStorage.getItem(k)||'null');if(x?.id)out.push(x);}catch(e){}}}catch(e){}
    return out.sort((a,b)=>(b.savedAt||0)-(a.savedAt||0));
  }
  function historyWriteMeta(meta){try{localStorage.setItem(META_PREFIX+meta.id,JSON.stringify(meta));}catch(e){}}
  function sessionLabel(src){
    if(!src)return '-'; const c=src.config||{};
    if(src.mode==='AI_SCRIMMAGE'){
      if(c.profile==='customAB'){const fmt=x=>x?`STR${x.str}/AGI${x.agi}/J${x.jump}/TEC${x.dex}/INT${x.int}`:'-';return `AI ${fmt(c.leftProfile)} vs ${fmt(c.rightProfile)}`;}
      if(c.profile==='baseline30')return 'AI ALL30';
      if(c.profile==='starter4')return 'AI STARTER4';
      return 'AI CURRENT';
    }
    if(src.mode==='HUMAN_TELEMETRY')return `HUMAN ${c.stat||'?'}${c.value??'?'} / base${c.baseline??'?'}`;
    if(src.mode==='ENGINE_SCENARIO')return `SCENARIO ${c.type||'?'} ${c.stat||'?'}${c.value??'?'}`;
    return src.mode||'BALANCE';
  }
  function historyUpsert(src,status,savedAt=Date.now(),archived=false){
    if(!src?.id)return;
    historyWriteMeta({id:src.id,mode:src.mode,status:status||src.status||'RUNNING',savedAt,startedAt:src.startedAt||'',endedAt:src.endedAt||'',label:sessionLabel(src),matches:src.matches?.length||0,matchesTarget:src.matchesTarget||src.config?.matchesTarget||0,archived:!!archived});
    const dropped=historyRead().slice(HISTORY_LIMIT);
    for(const x of dropped){try{localStorage.removeItem(META_PREFIX+x.id);localStorage.removeItem(RESCUE_PREFIX+x.id);}catch(e){} deleteArchive(x.id);}
    refreshHistoryUI();
  }
  function latestHistoryMeta(){return historyRead()[0]||null;}
  function rescueKey(id){return RESCUE_PREFIX+id;}
  function rescueRead(id){try{return JSON.parse(localStorage.getItem(rescueKey(id))||'null');}catch(e){return null;}}
  function recovered(){
    const latest=latestHistoryMeta(); if(latest){const r=rescueRead(latest.id);if(r)return r;}
    try{return JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY)||'null');}catch(e){return null;}
  }
  function openArchiveDB(){return new Promise((resolve,reject)=>{try{const req=indexedDB.open(ARCHIVE_DB,1);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(ARCHIVE_STORE))db.createObjectStore(ARCHIVE_STORE,{keyPath:'id'});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);}catch(e){reject(e);}});}
  async function archivePut(src,formulaText=''){
    if(!src?.id)return false;
    try{const db=await openArchiveDB();await new Promise((resolve,reject)=>{const tx=db.transaction(ARCHIVE_STORE,'readwrite');tx.objectStore(ARCHIVE_STORE).put({id:src.id,savedAt:Date.now(),session:clone(src),formulaText:formulaText||''});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});db.close();try{localStorage.removeItem(rescueKey(src.id));}catch(e){}historyUpsert(src,src.status||'COMPLETE',Date.parse(src.endedAt||'')||Date.now(),true);return true;}catch(e){console.warn('[BALANCE] archivePut failed',e);historyUpsert(src,src.status||'COMPLETE',Date.parse(src.endedAt||'')||Date.now(),false);return false;}
  }
  async function archiveGet(id){if(!id)return null;try{const db=await openArchiveDB();const out=await new Promise((resolve,reject)=>{const tx=db.transaction(ARCHIVE_STORE,'readonly');const q=tx.objectStore(ARCHIVE_STORE).get(id);q.onsuccess=()=>resolve(q.result||null);q.onerror=()=>reject(q.error);});db.close();return out;}catch(e){return null;}}
  async function deleteArchive(id){if(!id)return;try{const db=await openArchiveDB();await new Promise((resolve,reject)=>{const tx=db.transaction(ARCHIVE_STORE,'readwrite');tx.objectStore(ARCHIVE_STORE).delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();}catch(e){}}
  function checkpoint(status='INCOMPLETE / CHECKPOINT'){
    if(!session)return;
    const savedAt=Date.now();
    const pack={schema:3,build:BUILD,status,savedAt,session:{...session,active:false,status,events:session.events.slice(-RESCUE_EVENTS),samples:session.samples.slice(-RESCUE_SAMPLES)},formulaText:lastFormulaText,rescue:true};
    try{localStorage.setItem(rescueKey(session.id),JSON.stringify(pack));historyUpsert(session,status,savedAt,false);}catch(e){console.warn('[BALANCE] rescue checkpoint quota/IO failure',e);}
  }
  function stopTimers(){if(sampleTimer){clearInterval(sampleTimer);sampleTimer=null;}if(checkpointTimer){clearInterval(checkpointTimer);checkpointTimer=null;}}

  function beginSession(mode,config={}){
    stopTimers(); restoreRandom();
    if(typeof resetNetworkSessionIdentity==='function')resetNetworkSessionIdentity(true);
    BALANCE_TEST_ACTIVE=true;
    BALANCE_FORCE_AI_ALL=false; BALANCE_SCENARIO_ACTIVE=false; BALANCE_DISABLE_SKILLS=false; BALANCE_SIM_SPEED=1;
    const seed=Number(config.seed)||753;
    if(config.deterministic)setSeed(seed);
    session={schema:3,build:BUILD,id:makeId(),mode,active:true,status:'RUNNING',startedAt:nowIso(),startedPerf:performance.now(),endedAt:null,venue:typeof currentVenueId!=='undefined'?currentVenueId:'?',config:{...clone(config),seed},rosterStart:[],events:[],samples:[],matches:[],eventTrimmed:false,matchStartPerf:performance.now()};
    lastScore='0:0'; lastAIDebug={};
    sampleTimer=setInterval(sample,1000); checkpointTimer=setInterval(()=>checkpoint('RUNNING / CHECKPOINT'),1000);
    event('SESSION_START',{config:clone(session.config)}); historyUpsert(session,'RUNNING',Date.now(),false); checkpoint('RUNNING / CHECKPOINT'); refreshStatus(); return session;
  }
  function finishSession(status='COMPLETE'){
    if(!session)return;
    sample();event('SESSION_END',{status});
    session.active=false;session.status=status;session.endedAt=nowIso();session.durationSec=+((performance.now()-session.startedPerf)/1000).toFixed(2);
    checkpoint(status);stopTimers();
    // Full completed/manual/error log is archived independently by Session ID. Do not await gameplay cleanup.
    archivePut(session,lastFormulaText);
    BALANCE_TEST_ACTIVE=false;BALANCE_FORCE_AI_ALL=false;BALANCE_SCENARIO_ACTIVE=false;BALANCE_DISABLE_SKILLS=false;BALANCE_SIM_SPEED=1;scenario.active=false;restoreRandom();hideScenarioHUD();hideRuntimeHUD();refreshStatus();
  }
  function cleanReturnToMenu(){
    try{const m=document.getElementById('settlement-modal');if(m)m.style.display='none';}catch(e){}
    try{isSettlementOpen=false;isGameStarted=false;isPaused=true;isPracticeMode=false;isCareerMode=false;isLadderMode=false;}catch(e){}
    try{if(typeof _stopVenueAmbience==='function')_stopVenueAmbience();}catch(e){}
    try{restoreActiveRosterFromSaved(true);resetMatchState();}catch(e){}
    const sm=document.getElementById('start-menu-modal');if(sm)sm.style.display='flex';
  }

  // ---------- Runtime profile proof HUD ----------
  function buildRuntimeHUD(){
    let d=document.getElementById('balance-runtime-hud');
    if(d)return d;
    d=document.createElement('div');d.id='balance-runtime-hud';
    d.style.cssText='display:none;position:fixed;left:10px;top:10px;z-index:43950;max-width:760px;padding:8px 10px;background:rgba(2,6,23,.88);border:1px solid #22d3ee;border-radius:9px;color:#e2e8f0;font:11px/1.35 monospace;pointer-events:none;white-space:pre';
    document.body.appendChild(d);return d;
  }
  function refreshRuntimeHUD(){
    const d=buildRuntimeHUD();
    if(!session||!session.active){d.style.display='none';return;}
    const rows=rosterSnapshot();
    const aiLock=(session.mode==='AI_SCRIMMAGE');
    const controlled=!!session.config?.controlled || session.mode==='ENGINE_SCENARIO' || session.config?.profile==='baseline30';
    const head=`BALANCE LOCK · ${session.mode} · ${session.id}\nINPUT: ${aiLock?'4-AI / HUMAN INPUT LOCKED':'HUMAN'} · EQUIPMENT: ${controlled?'STRIPPED FOR CONTROLLED PROFILE':'AS CONFIGURED'}\nRuntime values below are the values actually used by gameplay:`;
    const body=rows.map(r=>`${String(r.slot).padEnd(10)} RAW STR${r.raw.str} AGI${r.raw.agi} JUMP${r.raw.jump} TEC${r.raw.tec} INT${r.raw.int} | EFF ${f(r.effective.str,1)}/${f(r.effective.agi,1)}/${f(r.effective.jump,1)}/${f(r.effective.tec,1)}/${f(r.effective.int,1)}`).join('\n');
    d.textContent=head+'\n'+body;d.style.display='block';
  }
  function hideRuntimeHUD(){const d=document.getElementById('balance-runtime-hud');if(d)d.style.display='none';}

  // ---------- Five-stat controlled profiles ----------
  function statProfile(stat,value,baseline=30){const p={str:baseline,agi:baseline,jump:baseline,dex:baseline,int:baseline};p[stat]=value;return p;}
  function applyProfileToPlayer(p,profile,{stripEquipment=true}={}){
    if(!p||!p.card||!profile)return;
    const fake={...p.card,stats:{...p.card.stats,...profile},equippedSkill:p.card.equippedSkill};
    if(stripEquipment){fake.equipSlotA=null;fake.equipSlotB=null;}
    p.stats=deriveStats(fake);p._balanceProfile={...profile,stripEquipment};p.energy=0;p.jumpExhaustion=1;
  }
  function applyAllBaseline(baseline=30){const prof={str:baseline,agi:baseline,jump:baseline,dex:baseline,int:baseline};allPlayers.forEach(p=>applyProfileToPlayer(p,prof,{stripEquipment:true}));updateSideUltHUD();return prof;}
  function applyControlledProfile(stat,value,baseline=30){
    const base=applyAllBaseline(baseline),local=allPlayers[NET.mySlot]||userPlayer,prof=statProfile(stat,value,baseline);applyProfileToPlayer(local,prof,{stripEquipment:true});
    if(session){session.rosterStart=rosterSnapshot();event('PROFILE_APPLIED',{mode:'CONTROLLED_ALL_BASELINE',local:local.slotKey,localProfile:prof,others:base,stripEquipment:true});}
    updateSideUltHUD();
  }

  function readAIProfile(prefix){
    const get=(k)=>Math.max(1,Math.min(60,n(document.getElementById(`balance-ai-${prefix}-${k}`)?.value,30)));
    return {str:get('str'),agi:get('agi'),jump:get('jump'),dex:get('tec'),int:get('int')};
  }
  function applyABTeamProfiles(leftProfile,rightProfile){
    allPlayers.forEach(p=>applyProfileToPlayer(p,p.isLeft?leftProfile:rightProfile,{stripEquipment:true}));
    updateSideUltHUD();
    if(session){session.rosterStart=rosterSnapshot();event('PROFILE_APPLIED',{mode:'AB_TEAM_OVERRIDE',left:leftProfile,right:rightProfile,stripEquipment:true});}
    return {left:leftProfile,right:rightProfile};
  }

  function starterClone(id){const c=INVENTORY.find(x=>x.id===id);if(!c)return null;return {...c,stats:{...(c.baseStats||c.stats)},equipSlotA:null,equipSlotB:null};}
  function applyStarterFourPreset(){
    const ids=['c1','c2','c3','c4'],slots=SLOT_KEYS;
    slots.forEach((slot,i)=>{const c=starterClone(ids[i]);if(c)ACTIVE_ROSTER[slot]=c;});
    allPlayers.forEach(p=>p.rebind(false));updateSideUltHUD();
    if(session){session.rosterStart=rosterSnapshot();event('PROFILE_APPLIED',{mode:'STARTER4_BASE_STATS',ids});}
  }

  // ---------- Formula Lab ----------
  function standardFormulaCase(stats){
    const spike0=computeSpikeFormula(stats,0),spike25=computeSpikeFormula(stats,25);
    const set=computeSetFormula(stats,{incomingSpeed:22,contactDist:55,lowBallSeverity:.5,specialPressure:0});
    return {spike0,spike25,recv18:computeReceivePressureFormula(stats,18),recv24:computeReceivePressureFormula(stats,24),recv30:computeReceivePressureFormula(stats,30),set,jump:computeJumpFormula(stats,WORLD.GRAVITY),ai:computeAITestFormula(stats,{distance:300})};
  }
  function formulaSweep(stat='dex',baseline=30){
    const values=[10,20,30,40,50,60],rows=[];
    for(const value of values){
      const fake={name:'BALANCE_DUMMY',stats:statProfile(stat,value,baseline),equippedSkill:'sk_breaker',equipSlotA:null,equipSlotB:null};
      const d=deriveStats(fake),x=standardFormulaCase(d),ek={str:'effectiveStr',agi:'effectiveAgi',jump:'effectiveJump',dex:'effectiveTec',int:'effectiveInt'}[stat];
      rows.push({stat:STAT_LABEL[stat],raw:value,effective:+f(d[ek],2),speed:+f(d.speed,3),power:+f(d.power,3),defense:+f(d.defense,3),rigidity:+f(d.blockRigidity,3),sweet:d.sweetWindow,reach:+f(d.reach,2),reaction:+f(d.reactionDelay,3),technique:+f(d.technique,3),oneTouch:d.oneTouchAbsorb,diveSpeed:+f(d.diveSpeed,3),outball:+f(d.outballThreshold,3),spike0:+f(x.spike0.effectivePower,3),spikeFull:+f(x.spike25.effectivePower,3),receive24:+f(x.recv24,3),setErr:+f(x.set.errorAmplitude,2),setMax:+f(x.set.maxTravel,1),jumpHeight:+f(x.jump.apexHeight,1),jumpApex:+f(x.jump.apexFrames,1),aiEta300:+f(x.ai.etaFrames,1),aiUncertainty:+f(x.ai.landingUncertainty,1)});
    }
    lastFormulaRows=rows;
    const cols=['raw','effective','speed','power','defense','rigidity','sweet','reach','reaction','technique','oneTouch','diveSpeed','outball','spike0','spikeFull','receive24','setErr','setMax','jumpHeight','jumpApex','aiEta300','aiUncertainty'];
    const lines=[`=== NSF ${BUILD} FORMULA LAB ===`,`STAT: ${STAT_LABEL[stat]} | BASELINE OTHERS: ${baseline}`,'TEC uses the legacy dex save-key; gameplay uses effective* values after the high-end marginal layer.','',cols.join('\t')];
    rows.forEach(r=>lines.push(cols.map(c=>r[c]).join('\t')));
    lines.push('',...marginalLines(rows));lastFormulaText=lines.join('\n');
    const out=document.getElementById('balance-formula-output');if(out)out.textContent=lastFormulaText;return rows;
  }
  function formulaSweepAll(baseline=30){
    const sections=[];
    for(const stat of STAT_KEYS){
      formulaSweep(stat,baseline);
      sections.push(lastFormulaText);
    }
    lastFormulaText=[`=== NSF ${BUILD} ALL FIVE-STAT FORMULA AUDIT ===`,`BASELINE OTHERS: ${baseline}`,'',...sections].join('\n\n');
    const out=document.getElementById('balance-formula-output');if(out)out.textContent=lastFormulaText;
    return lastFormulaText;
  }


  // ---------- Five-stat progression suite ----------
  const STAT_STAGE_LEVELS=[10,20,30,40,50,60];
  const STAT_STAGE_NAME={10:'FOUNDATION',20:'BASIC',30:'STANDARD',40:'ADVANCED',50:'ELITE',60:'CAP'};
  function almostSame(a,b,tol=1e-6){return Math.abs(n(a)-n(b))<=tol;}
  function monotonic(rows,key,dir='up'){
    for(let i=1;i<rows.length;i++){
      const d=n(rows[i][key])-n(rows[i-1][key]);
      if(dir==='up' && d < -1e-9)return false;
      if(dir==='down' && d > 1e-9)return false;
    }
    return true;
  }
  function changedAcross(rows,key,tol=1e-6){return !almostSame(rows[0]?.[key],rows[rows.length-1]?.[key],tol);}
  function stableAcross(rows,key,tol=1e-6){return rows.every(r=>almostSame(r[key],rows[0]?.[key],tol));}
  function progressionStatus(ok){return ok?'PASS':'FAIL';}
  function runStatProgressionSuite(baseline=30){
    baseline=Math.max(1,Math.min(60,n(baseline,30)));
    const sections=[],summary=[];
    const contracts={
      str:{up:['power','rigidity','spike0','spikeFull','setMax'],down:[],stable:['speed','defense','reaction','technique','jumpHeight','aiUncertainty']},
      agi:{up:['speed','diveSpeed'],down:['reaction','aiEta300'],stable:['power','defense','technique','jumpHeight','setErr','aiUncertainty']},
      jump:{up:['jumpHeight','rigidity'],down:[],stable:['speed','power','defense','reaction','technique','setErr','aiUncertainty']},
      dex:{up:['defense','sweet','reach','technique','oneTouch'],down:['receive24','setErr'],stable:['speed','power','reaction','jumpHeight','aiUncertainty']},
      int:{up:['reach'],down:['reaction','outball','setErr','aiUncertainty'],stable:['speed','power','defense','technique','jumpHeight']}
    };
    for(const stat of STAT_KEYS){
      const rows=formulaSweep(stat,baseline);
      const c=contracts[stat],checks=[];
      checks.push({name:'finite',ok:rows.every(r=>Object.entries(r).every(([k,v])=>k==='stat'||Number.isFinite(Number(v))))});
      for(const k of c.up)checks.push({name:`${k} ↑`,ok:monotonic(rows,k,'up')&&changedAcross(rows,k)});
      for(const k of c.down)checks.push({name:`${k} ↓`,ok:monotonic(rows,k,'down')&&changedAcross(rows,k)});
      for(const k of c.stable)checks.push({name:`${k} isolation`,ok:stableAcross(rows,k)});
      const fail=checks.filter(x=>!x.ok);
      summary.push({stat:STAT_LABEL[stat],status:fail.length?'FAIL':'PASS',failed:fail.map(x=>x.name)});
      sections.push(`\n[${STAT_LABEL[stat]} PROGRESSION] ${fail.length?'FAIL':'PASS'}`);
      sections.push('stage\traw\teffective\tspeed\tpower\tdefense\trigidity\treach\treaction\ttechnique\tsetErr\tjumpHeight\taiEta\taiUncertainty');
      for(const r of rows){
        sections.push(`${STAT_STAGE_NAME[r.raw]||r.raw}\t${r.raw}\t${r.effective}\t${r.speed}\t${r.power}\t${r.defense}\t${r.rigidity}\t${r.reach}\t${r.reaction}\t${r.technique}\t${r.setErr}\t${r.jumpHeight}\t${r.aiEta300}\t${r.aiUncertainty}`);
      }
      sections.push('[CONTRACTS] '+checks.map(x=>`${progressionStatus(x.ok)} ${x.name}`).join(' | '));
    }
    const pass=summary.filter(x=>x.status==='PASS').length;
    lastFormulaText=[
      `=== NSF ${BUILD} FIVE-STAT PROGRESSION SUITE ===`,
      `BASELINE OTHERS: ${baseline}`,
      'STAGES: 10 FOUNDATION → 20 BASIC → 30 STANDARD → 40 ADVANCED → 50 ELITE → 60 CAP',
      'Purpose: verify continuous progression + cross-stat isolation. High-end marginal compression is allowed; dead stages / reversed progression / unrelated stat leakage are not.',
      '',
      `RESULT: ${pass}/${summary.length} STAT CONTRACTS PASS`,
      ...summary.map(x=>`${x.status}\t${x.stat}${x.failed.length?'\t'+x.failed.join(', '):''}`),
      ...sections
    ].join('\n');
    const out=document.getElementById('balance-formula-output');if(out)out.textContent=lastFormulaText;
    return {baseline,summary,text:lastFormulaText};
  }

  function marginalLines(rows){
    if(rows.length<2)return[];const metrics=['speed','power','defense','reach','reaction','technique','spikeFull','receive24','setErr','jumpHeight','aiEta300','aiUncertainty'];
    const out=['[MARGINAL DELTAS — next minus previous; lower reaction/receive/setErr/ETA/uncertainty is better]'];
    for(let i=1;i<rows.length;i++){const a=rows[i-1],b=rows[i];out.push(`${a.raw}->${b.raw}: `+metrics.map(k=>`${k}=${f(n(b[k])-n(a[k]),2)}`).join(' | '));}return out;
  }
  function runSelfCheck(){
    const checks=[],assert=(name,ok,detail='')=>checks.push({name,ok:!!ok,detail});
    for(const stat of STAT_KEYS){const rows=formulaSweep(stat,30),inc=k=>rows.every((r,i)=>i===0||n(r[k])>=n(rows[i-1][k])-1e-9),dec=k=>rows.every((r,i)=>i===0||n(r[k])<=n(rows[i-1][k])+1e-9);
      assert(`${STAT_LABEL[stat]} finite`,rows.every(r=>Object.entries(r).every(([k,v])=>k==='stat'||Number.isFinite(Number(v)))),'10..60');
      if(stat==='str'){assert('STR power monotonic',inc('power'));assert('STR set range monotonic',inc('setMax'));}
      if(stat==='agi'){assert('AGI speed monotonic',inc('speed'));assert('AGI ETA improves',dec('aiEta300'));}
      if(stat==='jump')assert('JUMP apex height monotonic',inc('jumpHeight'));
      if(stat==='dex'){assert('TEC defense monotonic',inc('defense'));assert('TEC receive pressure improves',dec('receive24'));assert('TEC set error improves',dec('setErr'));}
      if(stat==='int'){assert('INT reaction improves',dec('reaction'));assert('INT uncertainty improves',dec('aiUncertainty'));assert('INT set error improves',dec('setErr'));}
    }
    const perks={};mergePerkStack(perks,{pushSpeedBonus:.4});mergePerkStack(perks,{pushSpeedBonus:1});assert('Perk same-key stacking additive',Math.abs(perks.pushSpeedBonus-1.4)<1e-9,`actual=${perks.pushSpeedBonus}`);
    const s30=deriveStats({stats:{str:30,agi:30,jump:30,dex:30,int:30},equippedSkill:'sk_breaker',equipSlotA:null,equipSlotB:null});
    assert('AGI not direct Defense contributor',Math.abs(s30.defense-(10+s30.effectiveTec*.25))<1e-9,`def=${s30.defense}`);
    assert('AI Capability API available',typeof aiCapabilitySnapshot==='function');
    if(typeof aiCapabilitySnapshot==='function'){
      const fakeLow={effectiveSpeed:7,stats:{effectiveStr:20,effectiveAgi:20,effectiveJump:20,effectiveTec:20,effectiveInt:20,speed:7,power:22,reach:60,reactionDelay:7,diveSpeed:14,blockRigidity:20,sweetWindow:40,technique:.8}};
      const fakeHigh={effectiveSpeed:11,stats:{effectiveStr:50,effectiveAgi:50,effectiveJump:50,effectiveTec:50,effectiveInt:50,speed:11,power:31,reach:75,reactionDelay:2.5,diveSpeed:22,blockRigidity:35,sweetWindow:53,technique:1.4}};
      const cLow=aiCapabilitySnapshot(fakeLow),cHigh=aiCapabilitySnapshot(fakeHigh);
      assert('Capability keeps sub-30 values (no baseline gate)',cLow.agi===20&&cLow.str===20,JSON.stringify({str:cLow.str,agi:cLow.agi}));
      assert('Capability keeps high values continuously',cHigh.agi===50&&cHigh.str===50,JSON.stringify({str:cHigh.str,agi:cHigh.agi}));
      assert('Capability ETA reflects real speed',(300-cHigh.reach)/cHigh.speed < (300-cLow.reach)/cLow.speed,`low=${f((300-cLow.reach)/cLow.speed,2)} high=${f((300-cHigh.reach)/cHigh.speed,2)}`);
    }
    assert('AI Utility chooser available',typeof aiChooseUtilityOption==='function');
    if(typeof aiChooseUtilityOption==='function'){
      const fake={slotIndex:0,stats:{effectiveInt:30,intellect:30}};
      const pick=aiChooseUtilityOption(fake,'SELF_CHECK',[{id:'BAD',feasible:false,utility:9},{id:'GOOD',feasible:true,utility:.5}]);
      assert('Utility chooser never selects infeasible option',pick.selected?.id==='GOOD',`selected=${pick.selected?.id}`);
    }
    assert('AI Intent audit sink available',typeof pushAIIntentAudit==='function');
    assert('Predictive second-attack evaluator available',typeof evaluateAISecondAttackOpportunity==='function');
    const txt=['=== BALANCE SELF CHECK ===',...checks.map(c=>`${c.ok?'PASS':'FAIL'}\t${c.name}${c.detail?'\t'+c.detail:''}`),`RESULT: ${checks.filter(c=>c.ok).length}/${checks.length} PASS`].join('\n');
    const out=document.getElementById('balance-formula-output');if(out)out.textContent=txt;lastFormulaText=txt;return checks;
  }

  // ---------- Controlled Scenario Harness ----------
  const SCENARIO_META={
    receive24:{label:'固定中強度接球',hint:'球固定飛向左後場。用 K；觀察到位、甜蜜點與接球品質。'},
    receive30:{label:'固定高速接球',hint:'高速來球。用 K，測 TEC/防守容錯。'},
    dive:{label:'固定魚躍救球',hint:'球會掉在你右側較遠處。向右移動並用 L 魚躍。'},
    set:{label:'固定二傳控制',hint:'球落到你附近。用 O 舉球，LOG 會記 contactDist / Set error。'},
    spike:{label:'固定攻擊 Timing',hint:'固定二傳球送到網前。自己助跑、W 起跳、J 扣球。'},
    block:{label:'固定攔網 Timing',hint:'固定攻擊球穿越網口。自行 W + Space 捏攔網時機；不會自動替你開盾。'}
  };
  function resetBallForScenario(){
    Object.assign(ball,{vx:0,vy:0,rotation:0,opacity:1,isSpiked:false,isPerfectSpike:false,isFloat:false,isTacticalThrust:false,isBrokenSpike:false,isUltimate:false,isTopspin:false,topspinRating:.5,armorPiercing:0,lastHitter:null,lastAttackHitter:null,serveOriginServer:null,pointContext:null,activeSkillTag:'',isSineFloat:false,isSkyComet:false,isPhantomDrop:false,isBungeeGum:false,isGravityDrop:false,greaseCharges:0,phantomWipeSourceIsLeft:null,mudContaminationAvailable:false,mudCharges:0,isIronWallSlam:false,hasTossedFromGodspeed:false,glowColor:null,_aiAttackIntentId:null,_aiAttackIntentFrame:null,_aiAttackIntentStyle:null,_aiAttackSourceSlot:null});
    serveState.active=false;serveState.tossed=false;serveState.charging=false;match.leftHits=0;match.rightHits=0;match.isBlockedBack=false;match.inServeRally=false;match.serveAceEligible=false;
    banner.active=false;isSettlementOpen=false;isPaused=false;
  }
  function scenarioLocal(){return allPlayers[NET.mySlot]||userPlayer;}
  function spawnScenario(reason='AUTO'){
    if(!scenario.active||!BALANCE_SCENARIO_ACTIVE)return;
    resetMatchState();resetBallForScenario();
    const p=scenarioLocal();
    userPlayer.forceGrounded(1120);mateAI.forceGrounded(1000);enemyA.forceGrounded(1900);enemyB.forceGrounded(2050);
    p.forceGrounded(1180);p.facing=1;p.energy=0;p.jumpExhaustion=1;
    const type=scenario.type;
    if(type==='receive24'){ball.x=1650;ball.y=500;ball.vx=-20;ball.vy=0;ball.isSpiked=true;ball.lastHitter=enemyA;}
    if(type==='receive30'){ball.x=1830;ball.y=492;ball.vx=-28;ball.vy=0;ball.isSpiked=true;ball.lastHitter=enemyA;}
    if(type==='dive'){p.forceGrounded(1080);p.facing=1;ball.x=1600;ball.y=495;ball.vx=-12;ball.vy=0;ball.isSpiked=true;ball.lastHitter=enemyA;}
    if(type==='set'){p.forceGrounded(1200);ball.x=1430;ball.y=500;ball.vx=-10;ball.vy=0;ball.lastHitter=mateAI;match.leftHits=1;}
    if(type==='spike'){p.forceGrounded(1280);p.facing=1;ball.x=1320;ball.y=405;ball.vx=3.2;ball.vy=-2.4;ball.lastHitter=mateAI;match.leftHits=2;}
    if(type==='block'){p.forceGrounded(WORLD.NET_X-58);p.facing=1;ball.x=WORLD.NET_X+260;ball.y=WORLD.NET_TOP_Y-92;ball.vx=-17;ball.vy=2.0;ball.isSpiked=true;ball.isPerfectSpike=true;ball.lastHitter=enemyA;match.rightHits=3;}
    scenario.cycle++;scenario.lastSpawnFrame=gameFrame;scenario.nextSpawnFrame=gameFrame+240;
    event('SCENARIO_SPAWN',{cycle:scenario.cycle,type,reason,hint:SCENARIO_META[type]?.hint,ball:ballSnapshot(),player:playerSnapshot(p)});updateScenarioHUD();
  }
  function tickScenario(){
    if(!scenario.active||!BALANCE_SCENARIO_ACTIVE||!BALANCE_TEST_ACTIVE)return;
    // Prevent autonomous non-user movement while still letting Player.update/physics/collision run normally.
    for(const p of allPlayers){if(p!==scenarioLocal()&&p.isGrounded){p.vx=0;p.runMomentum=0;}}
    if(gameFrame>=scenario.nextSpawnFrame||banner.active||ball.y>WORLD.FLOOR_Y+120||ball.x<WORLD.LEFT-250||ball.x>WORLD.RIGHT+250)spawnScenario('CYCLE');
  }
  function buildScenarioHUD(){
    if(document.getElementById('balance-scenario-hud'))return;
    const d=document.createElement('div');d.id='balance-scenario-hud';d.style.cssText='display:none;position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:44000;min-width:420px;max-width:72vw;padding:9px 14px;background:rgba(2,6,23,.9);border:1px solid #22d3ee;border-radius:10px;color:#e2e8f0;font:12px Arial;text-align:center;pointer-events:auto';
    d.innerHTML='<b id="balance-scenario-title" style="color:#facc15"></b><div id="balance-scenario-hint" style="margin:4px 0;color:#cbd5e1"></div><button onclick="BALANCE_LAB.resetScenario()">重新餵球 [R]</button> <button onclick="BALANCE_LAB.stopAndReturn()">結束測試</button>';
    document.body.appendChild(d);
  }
  function updateScenarioHUD(){buildScenarioHUD();const meta=SCENARIO_META[scenario.type]||{};const d=document.getElementById('balance-scenario-hud');if(d)d.style.display=scenario.active?'block':'none';const t=document.getElementById('balance-scenario-title');if(t)t.textContent=`${meta.label||scenario.type} · #${scenario.cycle}`;const h=document.getElementById('balance-scenario-hint');if(h)h.textContent=meta.hint||'';}
  function hideScenarioHUD(){const d=document.getElementById('balance-scenario-hud');if(d)d.style.display='none';}
  function startScenario(){
    const stat=document.getElementById('balance-scenario-stat').value,value=n(document.getElementById('balance-scenario-value').value,30),baseline=n(document.getElementById('balance-scenario-base').value,30),type=document.getElementById('balance-scenario-type').value;
    close();beginSession('ENGINE_SCENARIO',{stat:STAT_LABEL[stat],value,baseline,type,deterministic:true,seed:753,venue:'stadium',events:false,skills:false});BALANCE_SCENARIO_ACTIVE=true;BALANCE_DISABLE_SKILLS=true;scenario={active:true,type,cycle:0,nextSpawnFrame:0,lastSpawnFrame:0};
    startPracticeMode('stadium','stadium',false);
    requestAnimationFrame(()=>{applyControlledProfile(stat,value,baseline);session.venue=currentVenueId;spawnScenario('START');sample();refreshRuntimeHUD();});
  }
  function resetScenario(){if(scenario.active){scenario.nextSpawnFrame=0;spawnScenario('MANUAL');}}

  // ---------- Human free-play ----------
  function startHuman(){
    const stat=document.getElementById('balance-human-stat').value,value=n(document.getElementById('balance-human-value').value,30),baseline=n(document.getElementById('balance-human-base').value,30),controlled=document.getElementById('balance-human-controlled').checked,skills=document.getElementById('balance-human-skills').checked;
    close();beginSession('HUMAN_TELEMETRY',{stat:STAT_LABEL[stat],value,baseline,controlled,skills,deterministic:false,venue:'stadium',events:false});BALANCE_DISABLE_SKILLS=!skills;
    startPracticeMode('stadium','stadium',false);
    requestAnimationFrame(()=>{if(controlled)applyControlledProfile(stat,value,baseline);else{session.rosterStart=rosterSnapshot();event('PROFILE_CURRENT_ROSTER');}session.venue=currentVenueId;sample();refreshRuntimeHUD();});
  }

  function clearHumanInputState(){
    try{if(typeof keys!=='undefined')Object.keys(keys).forEach(k=>keys[k]=false);}catch(e){}
    try{if(typeof receiveInputBuffer!=='undefined')receiveInputBuffer=0;}catch(e){}
  }

  // ---------- 4-AI Scrimmage ----------
  function startAIScrimmage(){
    const profile=document.getElementById('balance-ai-profile').value,matches=Math.max(1,Math.min(20,n(document.getElementById('balance-ai-matches').value,3))),speed=Math.max(1,Math.min(10,n(document.getElementById('balance-ai-speed').value,4))),seed=n(document.getElementById('balance-ai-seed').value,753);
    const leftProfile=profile==='customAB'?readAIProfile('a'):null,rightProfile=profile==='customAB'?readAIProfile('b'):null;
    close();beginSession('AI_SCRIMMAGE',{profile,leftProfile,rightProfile,matchesTarget:matches,simSpeed:speed,seed,deterministic:true,venue:'stadium',events:false});BALANCE_FORCE_AI_ALL=true;BALANCE_SIM_SPEED=speed;BALANCE_DISABLE_SKILLS=profile!=='current';session.matchesTarget=matches;clearHumanInputState();
    startPracticeMode('stadium','stadium',false);
    requestAnimationFrame(()=>{if(profile==='customAB')applyABTeamProfiles(leftProfile,rightProfile);else if(profile==='baseline30')applyAllBaseline(30);else if(profile==='starter4')applyStarterFourPreset();else{session.rosterStart=rosterSnapshot();event('PROFILE_CURRENT_ROSTER');}session.venue=currentVenueId;session.matchStartPerf=performance.now();clearHumanInputState();sample();refreshRuntimeHUD();});
  }
  function onSettlement(winnerSide){
    if(!session||!session.active)return false;
    const matchDur=+((performance.now()-(session.matchStartPerf||session.startedPerf))/1000).toFixed(2);
    const summary={index:session.matches.length+1,winnerSide,score:clone(score),stats:clone(proMatchStats),durationSec:matchDur};session.matches.push(summary);event('MATCH_SETTLEMENT',summary);
    if(session.mode==='AI_SCRIMMAGE'&&session.matches.length<(session.matchesTarget||1)){
      try{const m=document.getElementById('settlement-modal');if(m)m.style.display='none';isSettlementOpen=false;isPaused=false;resetMatchState();const nextServe=(session.matches.length%2===1)?'RIGHT':'LEFT';ball.resetForServe(nextServe);session.matchStartPerf=performance.now();event('MATCH_NEXT',{index:session.matches.length+1,serve:nextServe});}catch(e){event('HARNESS_ERROR',{where:'next-match',message:String(e)});finishSession('ERROR');cleanReturnToMenu();}
    }else{finishSession('COMPLETE');cleanReturnToMenu();open();}
    return true;
  }
  function stopAndReturn(){if(session&&session.active)finishSession('MANUAL STOP');cleanReturnToMenu();open();}

  // ---------- Compact summary + TXT ----------
  function summarizeSession(src){
    const es=src?.events||[],out=[];const counts={};es.forEach(e=>counts[e.type]=(counts[e.type]||0)+1);
    out.push('[AUTO SUMMARY]',`EVENT COUNTS: ${Object.entries(counts).sort((a,b)=>b[1]-a[1]).map(([k,v])=>k+'='+v).join(' | ')||'NONE'}`);
    const recv=es.filter(e=>e.type==='RECEIVE');if(recv.length){const rs={};recv.forEach(e=>rs[e.result]=(rs[e.result]||0)+1);out.push(`RECEIVE n=${recv.length} result=${JSON.stringify(rs)} avgIncoming=${f(avg(recv.map(e=>e.incoming?.speed)),2)} avgDist=${f(avg(recv.map(e=>e.dist)),2)} avgExpectedPressure=${f(avg(recv.map(e=>e.expectedPressure)),2)}`);}
    const spikes=es.filter(e=>e.type==='SPIKE'&&e.success!==false);if(spikes.length){const byTouch=spikes.reduce((a,e)=>(a[e.touchNumber||'?']=(a[e.touchNumber||'?']||0)+1,a),{});out.push(`SPIKE n=${spikes.length} touch=${JSON.stringify(byTouch)} avgRunMomentum=${f(avg(spikes.map(e=>e.runMomentum)),2)} avgTheoryPower=${f(avg(spikes.map(e=>e.formula?.effectivePower)),2)} avgOutgoingSpeed=${f(avg(spikes.map(e=>e.outgoing?.speed)),2)} maxOutgoingSpeed=${f(Math.max(...spikes.map(e=>n(e.outgoing?.speed))),2)}`);}
    const sets=es.filter(e=>e.type==='SET'&&e.success!==false);if(sets.length)out.push(`SET n=${sets.length} avgContactDist=${f(avg(sets.map(e=>e.dist)),2)} avgRawPressure=${f(avg(sets.map(e=>e.formula?.rawPressure)),2)} avgErrorAmp=${f(avg(sets.map(e=>e.formula?.errorAmplitude)),2)} P95ContactDist=${f(q95(sets.map(e=>e.dist)),2)}`);
    const attempts=es.filter(e=>e.type==='INPUT_ATTEMPT');if(attempts.length){const ok=attempts.filter(e=>e.success).length;out.push(`HUMAN INPUT attempts=${attempts.length} contactSuccess=${ok} (${f(ok/attempts.length*100,1)}%) miss=${attempts.length-ok}`);}
    const dives=es.filter(e=>e.type==='DIVE');const blocks=es.filter(e=>e.type==='BLOCK_TOUCH');const arms=es.filter(e=>e.type==='BLOCK_ARM');if(dives.length||arms.length){out.push(`DIVE launches=${dives.length} | BLOCK armed=${arms.length} touches=${blocks.length}`);if(blocks.length){const tiers=blocks.reduce((a,e)=>(a[e.timingTier||'UNKNOWN']=(a[e.timingTier||'UNKNOWN']||0)+1,a),{});const zones=blocks.reduce((a,e)=>(a[e.contactZone||'UNKNOWN']=(a[e.contactZone||'UNKNOWN']||0)+1,a),{});const outcomes=blocks.reduce((a,e)=>(a[e.outcome||'UNKNOWN']=(a[e.outcome||'UNKNOWN']||0)+1,a),{});out.push(`BLOCK TIMING ${JSON.stringify(tiers)} zones=${JSON.stringify(zones)} outcomes=${JSON.stringify(outcomes)} avgEffectiveRigidity=${f(avg(blocks.map(e=>e.effectiveRigidity)),2)} avgImpactLoad=${f(avg(blocks.map(e=>e.impactLoad)),2)} avgLoadMargin=${f(avg(blocks.map(e=>e.loadMargin)),2)}`);}}
    const intents=es.filter(e=>e.type==='AI_INTENT');if(intents.length){
      const phases=intents.reduce((a,e)=>(a[e.phase]=(a[e.phase]||0)+1,a),{}),selected=intents.reduce((a,e)=>(a[e.selected||'?']=(a[e.selected||'?']||0)+1,a),{});
      const invalid=intents.filter(e=>e.selectedFeasible===false).length;
      const malformed=intents.filter(e=>!e.capability||!Array.isArray(e.options)||!e.selected).length;
      const margins=intents.map(e=>{const os=(e.options||[]).filter(o=>o&&o.feasible!==false&&Number.isFinite(Number(o.finalUtility))).sort((a,b)=>Number(b.finalUtility)-Number(a.finalUtility));return os.length>1?Number(os[0].finalUtility)-Number(os[1].finalUtility):null;}).filter(Number.isFinite);
      out.push(`AI INTENT AUDIT n=${intents.length} phases=${JSON.stringify(phases)} selected=${JSON.stringify(selected)} invalidSelection=${invalid} malformed=${malformed} avgTopMargin=${f(avg(margins),3)}`);
      for(const ph of ['FIRST_TOUCH_ACTION','SECOND_TOUCH','SECOND_TOUCH_UPDATE','ATTACK_TEMPO_PRECOMMIT','ATTACK_TRACK','THIRD_TOUCH','ATTACK_COMMIT','ATTACK_EXECUTION','THIRD_TOUCH_RECOVERY','THIRD_TOUCH_FALLBACK','THIRD_TOUCH_LIFECYCLE','DEFENSE','BLOCK']){const xs=intents.filter(e=>e.phase===ph);if(xs.length){const sel=xs.reduce((a,e)=>(a[e.selected||'?']=(a[e.selected||'?']||0)+1,a),{});out.push(`AI INTENT ${ph} n=${xs.length} selected=${JSON.stringify(sel)}`);}}
      const firstTouch=intents.filter(e=>e.phase==='FIRST_TOUCH_ACTION');
      if(firstTouch.length){
        const sel=firstTouch.reduce((a,e)=>(a[e.selected||'?']=(a[e.selected||'?']||0)+1,a),{});
        const vals=key=>firstTouch.map(e=>e.context?.[key]).filter(Number.isFinite);
        out.push(`AI FIRST TOUCH ACTION n=${firstTouch.length} selected=${JSON.stringify(sel)} avgAttackEV=${f(avg(vals('attackEV')),3)} avgControlEV=${f(avg(vals('controlEV')),3)} avgContactQuality=${f(avg(vals('contactQuality')),3)} avgAttackThreat=${f(avg(vals('attackThreat')),3)} avgExecP=${f(avg(vals('executionProbability')),3)} avgDefensePressure=${f(avg(vals('opponentDefensePressure')),3)} avgReceiveP=${f(avg(vals('receiveProbability')),3)} avgControlQuality=${f(avg(vals('expectedControlQuality')),3)}`);
      }
      const quickPre=intents.filter(e=>e.phase==='ATTACK_TEMPO_PRECOMMIT');
      if(quickPre.length){
        const sel=quickPre.reduce((a,e)=>(a[e.selected||'?']=(a[e.selected||'?']||0)+1,a),{});
        const quickWins=quickPre.filter(e=>e.selected==='QUICK').length;
        const waits=quickPre.filter(e=>e.selected==='WAIT').length;
        const avgContactP=avg(quickPre.map(e=>e.context?.contactProbability).filter(Number.isFinite));
        const avgWait=avg(quickPre.map(e=>e.context?.waitBase).filter(Number.isFinite));
        const avgFlex=avg(quickPre.map(e=>e.context?.feedFlexibility).filter(Number.isFinite));
        const avgCells=avg(quickPre.map(e=>e.context?.feasibleCells).filter(Number.isFinite));
        const avgQuickDefense=avg(quickPre.map(e=>e.context?.quickDefensePressure).filter(Number.isFinite));
        const avgQuickBlock=avg(quickPre.map(e=>e.context?.quickBlockPressure).filter(Number.isFinite));
        const avgQuickFloor=avg(quickPre.map(e=>e.context?.quickFloorPressure).filter(Number.isFinite));
        const avgNormalDefense=avg(quickPre.map(e=>e.context?.normalDefensePressure).filter(Number.isFinite));
        const avgHighDefense=avg(quickPre.map(e=>e.context?.highDefensePressure).filter(Number.isFinite));
        const avgTimingGain=avg(quickPre.map(e=>e.context?.defenseTimingGain).filter(Number.isFinite));
        const avgQuickNet=avg(quickPre.map(e=>e.context?.quickNet).filter(Number.isFinite));
        const avgQuickExpected=avg(quickPre.map(e=>e.context?.quickExpectedNet).filter(Number.isFinite));
        const avgFutureNet=avg(quickPre.map(e=>e.context?.futureBestNet).filter(Number.isFinite));
        const avgFutureExpected=avg(quickPre.map(e=>e.context?.futureExpectedNet).filter(Number.isFinite));
        const avgTempoAdvance=avg(quickPre.map(e=>e.context?.tempoAdvance).filter(Number.isFinite));
        const avgTransitionTimingGain=avg(quickPre.map(e=>e.context?.transitionTimingGain).filter(Number.isFinite));
        const avgBlockReadinessGain=avg(quickPre.map(e=>e.context?.blockReadinessGain).filter(Number.isFinite));
        const avgFloorCoverageGain=avg(quickPre.map(e=>e.context?.floorCoverageGain).filter(Number.isFinite));
        const avgDefensiveReadinessGain=avg(quickPre.map(e=>e.context?.defensiveReadinessGain).filter(Number.isFinite));
        const avgRequiredReadinessGain=avg(quickPre.map(e=>e.context?.requiredReadinessGain).filter(Number.isFinite));
        out.push(`AI QUICK PRECOMMIT n=${quickPre.length} selected=${JSON.stringify(sel)} quick=${quickWins} wait=${waits} avgContactProbability=${f(avgContactP,3)} avgFeedFlex=${f(avgFlex,3)} avgEnvelopeCells=${f(avgCells,1)} avgBlockReadinessGain=${f(avgBlockReadinessGain,3)} avgFloorCoverageGain=${f(avgFloorCoverageGain,3)} avgDefensiveReadinessGain=${f(avgDefensiveReadinessGain,3)} avgRequiredReadinessGain=${f(avgRequiredReadinessGain,3)} avgQuickDefense=${f(avgQuickDefense,3)} avgQuickBlock=${f(avgQuickBlock,3)} avgQuickFloor=${f(avgQuickFloor,3)} avgNormalDefense=${f(avgNormalDefense,3)} avgHighDefense=${f(avgHighDefense,3)} avgTempoAdvance=${f(avgTempoAdvance,3)} avgQuickNet=${f(avgQuickNet,3)} avgQuickExpected=${f(avgQuickExpected,3)} avgFutureNet=${f(avgFutureNet,3)} avgFutureExpected=${f(avgFutureExpected,3)}`);
      }
      const attackTrack=intents.filter(e=>e.phase==='ATTACK_TRACK');
      if(attackTrack.length){
        const stages=attackTrack.reduce((a,e)=>(a[e.stage||e.selected||'?']=(a[e.stage||e.selected||'?']||0)+1,a),{});
        const avgSlack=avg(attackTrack.map(e=>e.context?.arrivalSlack).filter(Number.isFinite));
        const avgUnc=avg(attackTrack.map(e=>e.context?.uncertaintyPx).filter(Number.isFinite));
        const avgConf=avg(attackTrack.map(e=>e.context?.confidence).filter(Number.isFinite));
        out.push(`AI ATTACK TRACK n=${attackTrack.length} stages=${JSON.stringify(stages)} avgArrivalSlack=${f(avgSlack,2)} avgUncertaintyPx=${f(avgUnc,1)} avgConfidence=${f(avgConf,3)}`);
      }
      const attackCommits=intents.filter(e=>e.phase==='ATTACK_COMMIT');
      const attackExec=intents.filter(e=>e.phase==='ATTACK_EXECUTION');
      if(attackCommits.length||attackExec.length){
        const commitSel=attackCommits.reduce((a,e)=>(a[e.selected||'?']=(a[e.selected||'?']||0)+1,a),{});
        const takeoffs=attackExec.filter(e=>e.stage==='TAKEOFF'||e.stage==='PRESET_QUICK_TAKEOFF');
        const contacts=attackExec.filter(e=>e.stage==='CONTACT_ATTEMPT');
        const preTakeoffReplans=attackExec.filter(e=>e.stage==='PRE_TAKEOFF_REPLAN');
        const reactiveCommits=attackCommits.filter(e=>e.stage==='REACTIVE_GROUND_COMMIT');
        const avgJumpDelay=avg(attackCommits.map(e=>e.context?.jumpDelay).filter(Number.isFinite));
        const avgXErr=avg(takeoffs.map(e=>e.context?.xError).filter(Number.isFinite));
        const avgFrameErr=avg(contacts.map(e=>e.context?.frameError).filter(Number.isFinite));
        const lateSafety=intents.filter(e=>e.phase==='THIRD_TOUCH'&&e.stage==='LATE_AIR_SAFETY').length;
        const tempos=attackCommits.reduce((a,e)=>(a[e.context?.tempo||'UNKNOWN']=(a[e.context?.tempo||'UNKNOWN']||0)+1,a),{});
        const landXs=attackCommits.map(e=>e.context?.targetLandX).filter(Number.isFinite);
        out.push(`AI ATTACK COMMIT n=${attackCommits.length} selected=${JSON.stringify(commitSel)} tempo=${JSON.stringify(tempos)} takeoff=${takeoffs.length} contactAttempt=${contacts.length} lateAirSafety=${lateSafety} preTakeoffReplan=${preTakeoffReplans.length} reactiveCommit=${reactiveCommits.length} avgJumpDelay=${f(avgJumpDelay,2)} avgTakeoffXError=${f(avgXErr,2)} avgContactFrameError=${f(avgFrameErr,2)} avgProjectedLandX=${f(avg(landXs),1)}`);
      }
      const secondOrigins={FROM_RECEIVE:0,FROM_BLOCK_COVER:0,FROM_TEAM_TOUCH:0,FROM_SERVE:0,UNKNOWN:0};
      for(const e of intents.filter(e=>e.phase==='SECOND_TOUCH')){const k=e.possessionOrigin||e.context?.possessionOrigin||'UNKNOWN';secondOrigins[k]=(secondOrigins[k]||0)+1;}
      if(Object.values(secondOrigins).some(v=>v>0)) out.push(`AI SECOND TOUCH ORIGIN ${JSON.stringify(secondOrigins)} | FROM_SERVE must=0`);
      // Third-touch attack chain audit: Intent -> actual spike -> block -> cover. This is observation only.
      const thirds=intents.filter(e=>e.phase==='THIRD_TOUCH'&&e.attackIntentId);
      if(thirds.length){
        const chains=thirds.map(i=>{
          const contact=es.find(e=>e.type==='TOUCH_RESULT'&&e.slot===i.slot&&e.frame>=i.frame&&e.outgoing?.spiked&&e.outgoing?.aiAttackIntentId===i.attackIntentId);
          const block=contact?es.find(e=>e.type==='BLOCK_TOUCH'&&e.frame>=contact.frame&&e.frame<=contact.frame+24&&e.incoming?.aiAttackIntentId===i.attackIntentId):null;
          const cover=block?es.find(e=>e.type==='RECEIVE'&&e.frame>=block.frame&&e.frame<=block.frame+45&&e.isCover&&e.incoming?.aiAttackIntentId===i.attackIntentId):null;
          return {style:i.selected||'?',actualStyle:contact?.outgoing?.attackStyle||null,contact:!!contact,blocked:!!block,covered:!!cover,outSpeed:contact?.outgoing?.speed||null,blockSpeed:block?.outgoing?.speed||null,coverResult:cover?.result||null};
        });
        const byStyle={};for(const c of chains){const x=byStyle[c.style]||(byStyle[c.style]={n:0,contact:0,blocked:0,covered:0,speeds:[]});x.n++;if(c.contact)x.contact++;if(c.blocked)x.blocked++;if(c.covered)x.covered++;if(Number.isFinite(Number(c.outSpeed)))x.speeds.push(Number(c.outSpeed));}
        const compact={};for(const [k,x] of Object.entries(byStyle))compact[k]={n:x.n,contact:x.contact,blocked:x.blocked,covered:x.covered,avgSpeed:+f(avg(x.speeds),2)};
        out.push(`AI ATTACK CHAIN ${JSON.stringify(compact)}`);
        const matrix={};for(const c of chains.filter(c=>c.contact)){const k=`${c.style}->${c.actualStyle||'?'}`;matrix[k]=(matrix[k]||0)+1;}
        if(Object.keys(matrix).length) out.push(`AI ATTACK PLAN->ACTUAL ${JSON.stringify(matrix)}`);

        // V75-3.20 third-touch lifecycle audit: possession cancellation, invalid-possession suppression, and second-attack suppression
        // are explicit terminals, not silent failures.
        const lifecycle=intents.filter(e=>e.phase==='THIRD_TOUCH_LIFECYCLE');
        if(lifecycle.length){
          const stages={},reasons={};
          for(const e of lifecycle){
            const st=e.stage||'?';stages[st]=(stages[st]||0)+1;
            const r=e.context?.reason||e.reason||e.selected||'?';reasons[r]=(reasons[r]||0)+1;
          }
          out.push(`AI THIRD LIFECYCLE n=${lifecycle.length} stages=${JSON.stringify(stages)} reasons=${JSON.stringify(reasons)}`);
        }
        // V75-3.15 third-touch fallback audit: distinguish plan, execution, legal touch, cancellation, and terminal miss.
        // This is intentionally separate from ATTACK CHAIN because TIP / SAFE_J are not spiked balls.
        const fallbackIds=new Set(['TIP','SAFE_J','HARD_J','FALLBACK_WAIT']);
        const fallbackPlans=thirds.filter(e=>fallbackIds.has(e.selected));
        const fallbackAudit=intents.filter(e=>e.phase==='THIRD_TOUCH_FALLBACK'&&e.attackIntentId);
        if(fallbackPlans.length||fallbackAudit.length){
          const planSelected={};fallbackPlans.forEach(e=>planSelected[e.selected]=(planSelected[e.selected]||0)+1);
          const executed={};fallbackAudit.filter(e=>e.stage==='EXECUTE').forEach(e=>executed[e.selected]=(executed[e.selected]||0)+1);
          const missCount=fallbackAudit.filter(e=>e.stage==='MISS').length;
          let touchOk=0,executeNoTouch=0,safeJWaitMiss=0;const paths={};
          for(const p of fallbackPlans){
            const audits=fallbackAudit.filter(e=>e.attackIntentId===p.attackIntentId&&e.frame>=p.frame);
            const exec=audits.find(e=>e.stage==='EXECUTE');
            const miss=intents.find(e=>e.phase==='THIRD_TOUCH_RECOVERY'&&e.attackIntentId===p.attackIntentId&&e.stage==='MISS'&&e.frame>=p.frame);
            const cancel=lifecycle.find(e=>e.attackIntentId===p.attackIntentId&&e.stage==='CANCEL'&&e.frame>=p.frame);
            const touch=es.find(e=>e.type==='TOUCH_RESULT'&&e.slot===p.slot&&e.frame>=p.frame&&e.outgoing?.aiAttackIntentId===p.attackIntentId);
            if(touch)touchOk++;
            if(exec&&!touch)executeNoTouch++;
            if(p.selected==='SAFE_J'&&miss&&!exec)safeJWaitMiss++;
            const scoreEnd=es.find(e=>e.type==='SCORE_CHANGE'&&e.frame>=p.frame&&e.frame<=p.frame+90);
            const terminal=exec?`${exec.selected}_EXECUTE${touch?'_TOUCH_OK':'_NO_TOUCH'}`:(miss?'MISS':(cancel?`CANCEL_${cancel.context?.reason||cancel.reason||'EXTERNAL'}`:(scoreEnd?'RALLY_END_SCORE':'NO_TERMINAL')));
            const key=`${p.selected}->${terminal}`;paths[key]=(paths[key]||0)+1;
          }
          const noTouchClass={PREDICTION_OR_CONTACT_WINDOW_MISS:0,EXECUTION_PATH_BUG:0,TOUCH_REGISTRATION_BUG:0,UNCLASSIFIED:0};
          const noTouchGeom={J:[],L:[]};
          for(const p of fallbackPlans){
            const exec=fallbackAudit.find(e=>e.attackIntentId===p.attackIntentId&&e.stage==='EXECUTE');
            if(!exec)continue;
            const touch=es.find(e=>e.type==='TOUCH_RESULT'&&e.slot===p.slot&&e.frame>=p.frame&&e.outgoing?.aiAttackIntentId===p.attackIntentId);
            if(touch)continue;
            const expectedAction=exec.selected==='TIP'?'L':'J';
            const attempt=es.find(e=>e.type==='INPUT_ATTEMPT'&&e.slot===p.slot&&e.action===expectedAction&&e.frame>=exec.frame&&e.frame<=exec.frame+1);
            if(!attempt){noTouchClass.EXECUTION_PATH_BUG++;continue;}
            if(attempt.success){noTouchClass.TOUCH_REGISTRATION_BUG++;continue;}
            noTouchClass.PREDICTION_OR_CONTACT_WINDOW_MISS++;
            noTouchGeom[expectedAction].push(expectedAction==='J'?{dx:attempt.dx,dy:attempt.dy,dist:attempt.dist,geometryEligible:attempt.geometryEligible}:{forwardDist:attempt.forwardDist,verticalDelta:attempt.verticalDelta,dist:attempt.dist,geometryEligible:attempt.geometryEligible});
          }
          out.push(`AI THIRD FALLBACK plan=${JSON.stringify(planSelected)} execute=${JSON.stringify(executed)} touchOK=${touchOk} executeNoTouch=${executeNoTouch} miss=${missCount} safeJWaitMiss=${safeJWaitMiss}`);
          out.push(`AI THIRD FALLBACK PATH ${JSON.stringify(paths)}`);
          if(executeNoTouch>0)out.push(`AI THIRD FALLBACK NO_TOUCH CLASS ${JSON.stringify(noTouchClass)} | miss=input attempted but contact window failed; path bug=no matching input attempt; registration bug=input success without TOUCH_RESULT`);
          if(noTouchGeom.J.length||noTouchGeom.L.length)out.push(`AI THIRD FALLBACK NO_TOUCH GEOMETRY ${JSON.stringify(noTouchGeom)}`);
          if(safeJWaitMiss>0)out.push(`AI THIRD FALLBACK DIAG SAFE_J_WAIT_MISS=${safeJWaitMiss} | SAFE_J future window was selected but no SAFE_J execute occurred before MISS`);
        }

        // V75-3.17 primary->recovery audit: expose exactly where a committed attack stopped being legal,
        // which peer recovery option won Utility, whether it executed, and whether a legal touch followed.
        const recoveries=intents.filter(e=>e.phase==='THIRD_TOUCH_RECOVERY'&&e.attackIntentId);
        if(recoveries.length){
          const invalid=recoveries.filter(e=>e.stage==='PRIMARY_INVALID');
          const selects=recoveries.filter(e=>e.stage==='SELECT');
          const misses=recoveries.filter(e=>e.stage==='MISS');
          const byFailure={};for(const e of invalid){const k=e.context?.failureReason||'?';byFailure[k]=(byFailure[k]||0)+1;}
          const winners={};for(const e of [...invalid,...selects]){if(e.selected)winners[e.selected]=(winners[e.selected]||0)+1;}
          const paths={};
          for(const i of thirds){
            const rs=recoveries.filter(e=>e.attackIntentId===i.attackIntentId&&e.frame>=i.frame);
            const inv=rs.find(e=>e.stage==='PRIMARY_INVALID');
            const sel=[...rs].reverse().find(e=>e.stage==='SELECT'||e.stage==='PRIMARY_INVALID');
            const exec=fallbackAudit.find(e=>e.attackIntentId===i.attackIntentId&&e.stage==='EXECUTE');
            const miss=rs.find(e=>e.stage==='MISS');
            const cancel=lifecycle.find(e=>e.attackIntentId===i.attackIntentId&&e.stage==='CANCEL'&&e.frame>=i.frame);
            const touch=es.find(e=>e.type==='TOUCH_RESULT'&&e.slot===i.slot&&e.frame>=i.frame&&e.outgoing?.aiAttackIntentId===i.attackIntentId);
            const scoreEnd=es.find(e=>e.type==='SCORE_CHANGE'&&e.frame>=i.frame&&e.frame<=i.frame+90);
            const terminal=exec?`${exec.selected}_EXECUTE_${touch?'TOUCH_OK':'NO_TOUCH'}`:(miss?'MISS':(cancel?`CANCEL_${cancel.context?.reason||cancel.reason||'EXTERNAL'}`:(scoreEnd?'RALLY_END_SCORE':(sel?.selected||'NO_TERMINAL'))));
            const key=inv?`${i.selected}->${inv.context?.failureReason||'INVALID'}->${terminal}`:(cancel?`${i.selected}->${terminal}`:`${i.selected}->NO_RECOVERY`);
            paths[key]=(paths[key]||0)+1;
          }
          const recoveryExecNoTouch=invalid.reduce((n0,i)=>{const exec=fallbackAudit.find(e=>e.attackIntentId===i.attackIntentId&&e.stage==='EXECUTE');if(!exec)return n0;const touch=es.find(e=>e.type==='TOUCH_RESULT'&&e.slot===i.slot&&e.frame>=i.frame&&e.outgoing?.aiAttackIntentId===i.attackIntentId);return n0+(!touch?1:0);},0);
          const recoveryNoTouchClass={PREDICTION_OR_CONTACT_WINDOW_MISS:0,EXECUTION_PATH_BUG:0,TOUCH_REGISTRATION_BUG:0,UNCLASSIFIED:0};
          for(const i of invalid){
            const exec=fallbackAudit.find(e=>e.attackIntentId===i.attackIntentId&&e.stage==='EXECUTE');if(!exec)continue;
            const touch=es.find(e=>e.type==='TOUCH_RESULT'&&e.slot===i.slot&&e.frame>=i.frame&&e.outgoing?.aiAttackIntentId===i.attackIntentId);if(touch)continue;
            const expectedAction=exec.selected==='TIP'?'L':'J';
            const attempt=es.find(e=>e.type==='INPUT_ATTEMPT'&&e.slot===i.slot&&e.action===expectedAction&&e.frame>=exec.frame&&e.frame<=exec.frame+1);
            if(!attempt)recoveryNoTouchClass.EXECUTION_PATH_BUG++;
            else if(attempt.success)recoveryNoTouchClass.TOUCH_REGISTRATION_BUG++;
            else recoveryNoTouchClass.PREDICTION_OR_CONTACT_WINDOW_MISS++;
          }
          out.push(`AI THIRD RECOVERY invalid=${invalid.length} select=${selects.length} miss=${misses.length} executeNoTouch=${recoveryExecNoTouch} failures=${JSON.stringify(byFailure)} winners=${JSON.stringify(winners)}`);
          out.push(`AI THIRD RECOVERY PATH ${JSON.stringify(paths)}`);
          if(recoveryExecNoTouch>0)out.push(`AI THIRD RECOVERY NO_TOUCH CLASS ${JSON.stringify(recoveryNoTouchClass)}`);
          const silent=thirds.filter(i=>{const touch=es.find(e=>e.type==='TOUCH_RESULT'&&e.slot===i.slot&&e.frame>=i.frame&&e.outgoing?.aiAttackIntentId===i.attackIntentId);const rs=recoveries.filter(e=>e.attackIntentId===i.attackIntentId);const cancel=lifecycle.find(e=>e.attackIntentId===i.attackIntentId&&e.stage==='CANCEL'&&e.frame>=i.frame);return !touch&&!cancel&&!rs.some(e=>e.stage==='MISS')&&!rs.some(e=>e.stage==='PRIMARY_INVALID')&&['POWER','DEEP','STEEP'].includes(i.selected);}).length;
          if(silent>0)out.push(`AI THIRD RECOVERY DIAG SILENT_PRIMARY_NO_TERMINAL=${silent} | committed primary ended without touch, recovery handoff, MISS audit, or lifecycle cancellation`);
        }
      }
    }
    const thirdMissOutcomes=es.filter(e=>e.type==='AI_INTENT'&&e.phase==='THIRD_TOUCH_RECOVERY'&&e.stage==='MISS');
    if(thirdMissOutcomes.length)out.push(`AI THIRD OUTCOME MISS=${thirdMissOutcomes.length} | exhausted legal contact options; tracked as outcome, not AI_BUG`);
    const bugs=es.filter(e=>e.type==='AI_BUG');const decisions=es.filter(e=>e.type==='AI_DECISION');if(decisions.length||bugs.length){
      out.push(`AI decisions=${decisions.length} bugs=${bugs.length}${bugs.length?' codes='+JSON.stringify(bugs.reduce((a,e)=>(a[e.code]=(a[e.code]||0)+1,a),{})):''}`);
      const secondYes=decisions.filter(e=>e.action==='2ND ATTACK: YES').length,secondNo=decisions.filter(e=>e.action==='2ND ATTACK: NO').length;
      const third={POWER:0,STEEP:0,DEEP:0,TIP:0,HARD_J:0,SAFE_J:0,FALLBACK_WAIT:0};
      decisions.forEach(e=>{if(e.action==='3RD TOUCH: POWER')third.POWER++;else if(e.action==='3RD TOUCH: STEEP')third.STEEP++;else if(e.action==='3RD TOUCH: DEEP')third.DEEP++;else if(e.action==='3RD TOUCH: SAFE J')third.SAFE_J++;else if(e.action==='3RD FALLBACK: TIP'||e.action==='3RD RECOVERY: TIP')third.TIP++;else if(e.action==='3RD FALLBACK: HARD J'||e.action==='3RD RECOVERY: HARD J')third.HARD_J++;else if(e.action==='3RD FALLBACK: SAFE J WAIT'||e.action==='3RD RECOVERY: SAFE J WAIT')third.SAFE_J++;});
      out.push(`AI ATTACK CHOICE 2ND yes=${secondYes} no=${secondNo} | 3RD=${JSON.stringify(third)}`);
    }
    if(src?.matches?.length){const left=src.matches.filter(m=>m.winnerSide==='LEFT').length,right=src.matches.length-left;const diffs=src.matches.map(m=>Math.abs(n(m.score?.player)-n(m.score?.enemy)));out.push(`MATCHES n=${src.matches.length} LEFT=${left} RIGHT=${right} avgScoreDiff=${f(avg(diffs),2)} avgDuration=${f(avg(src.matches.map(m=>m.durationSec)),2)}s`);}
    const scen=es.filter(e=>e.type==='SCENARIO_SPAWN');if(scen.length)out.push(`SCENARIO feeds=${scen.length} type=${scen[0].type}`);
    return out;
  }
  function sessionDuration(src){if(Number.isFinite(src?.durationSec))return src.durationSec;const tail=[...(src?.events||[]),...(src?.samples||[])].reduce((m,x)=>Math.max(m,n(x.t)),0);return +tail.toFixed(2);}
  function sessionText(src=session,formulaOverride=''){
    if(!src)return '=== NSF BALANCE TELEMETRY ===\nNO SESSION';
    const lines=['=== NSF VOLLEYBALL BALANCE TELEMETRY ===',`BUILD: ${src.build||BUILD} · STAT/BALANCE LAB`,`SESSION: ${src.id}`,`MODE: ${src.mode}`,`STATUS: ${src.status}`,`START: ${src.startedAt}`,`END: ${src.endedAt||'-'}`,`DURATION: ${sessionDuration(src)}s`,`VENUE: ${src.venue||'?'}`,`CONFIG: ${JSON.stringify(src.config||{})}`,'',...summarizeSession(src),'','[ROSTER START]'];
    (src.rosterStart||[]).forEach(p=>lines.push(JSON.stringify(p)));lines.push('',`[MATCHES ${src.matches?.length||0}]`);(src.matches||[]).forEach(m=>lines.push(JSON.stringify(m)));lines.push('',`[EVENTS ${src.events?.length||0}${src.eventTrimmed?' / TRIMMED':''}]`);(src.events||[]).forEach(e=>lines.push(JSON.stringify(e)));lines.push('',`[SAMPLES ${src.samples?.length||0}]`);(src.samples||[]).forEach(x=>lines.push(JSON.stringify(x)));if(formulaOverride||lastFormulaText)lines.push('',formulaOverride||lastFormulaText);return lines.join('\n');
  }
  function downloadText(text,name){const b=new Blob([text],{type:'text/plain;charset=utf-8'}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000);}
  async function loadHistoryRecord(id){
    if(!id)return null;
    if(session?.id===id)return {session,formulaText:lastFormulaText,live:true};
    const archived=await archiveGet(id);if(archived?.session)return archived;
    const rescue=rescueRead(id);if(rescue?.session)return rescue;
    return null;
  }
  async function resolveLogRecord(){if(session)return {session,formulaText:lastFormulaText,live:true};const meta=latestHistoryMeta();if(meta)return await loadHistoryRecord(meta.id);const r=recovered();return r?.session?r:null;}
  async function downloadLog(){const rec=await resolveLogRecord(),src=rec?.session;if(!src){alert('目前沒有 Balance LOG。');return;}downloadText(sessionText(src,rec?.formulaText||''),`NSF_BALANCE_${src.mode||'LOG'}_${src.id||Date.now()}.txt`);}
  async function copyLog(){const rec=await resolveLogRecord(),src=rec?.session;if(!src){alert('目前沒有 Balance LOG。');return;}const txt=sessionText(src,rec?.formulaText||'');try{await navigator.clipboard.writeText(txt);alert('Balance LOG 已複製。');}catch(e){const ta=document.createElement('textarea');ta.value=txt;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();alert('Balance LOG 已複製。');}}
  async function downloadHistory(id){const rec=await loadHistoryRecord(id),src=rec?.session;if(!src){alert('找不到這筆 Session；可能已超過 24 筆自動淘汰。');return;}downloadText(sessionText(src,rec?.formulaText||''),`NSF_BALANCE_${src.mode||'LOG'}_${src.id}.txt`);}
  async function copyHistory(id){const rec=await loadHistoryRecord(id),src=rec?.session;if(!src){alert('找不到這筆 Session。');return;}const txt=sessionText(src,rec?.formulaText||'');try{await navigator.clipboard.writeText(txt);alert(`已複製 ${id}`);}catch(e){const ta=document.createElement('textarea');ta.value=txt;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();alert(`已複製 ${id}`);}}
  async function clearHistory(){if(!confirm('清除 Balance Lab 歷史紀錄與封存 LOG？目前正在跑的 Session 不會被停止。'))return;const keep=session?.active?session.id:null;const items=historyRead();for(const x of items){if(x.id===keep)continue;try{localStorage.removeItem(rescueKey(x.id));}catch(e){}await deleteArchive(x.id);}for(const x of items){if(x.id===keep)continue;try{localStorage.removeItem(META_PREFIX+x.id);}catch(e){}}refreshHistoryUI();refreshStatus();}
  function downloadFormula(){if(!lastFormulaText){formulaSweep(document.getElementById('balance-formula-stat').value,n(document.getElementById('balance-formula-base').value,30));}downloadText(lastFormulaText,`NSF_FORMULA_${document.getElementById('balance-formula-stat').value.toUpperCase()}_${Date.now()}.txt`);}

  function refreshStatus(){const el=document.getElementById('balance-status');if(!el)return;const meta=latestHistoryMeta();if(session){el.textContent=`${session.active?'● RUNNING':'■ '+session.status} | ${session.mode} | ${session.id} | events=${session.events.length} | samples=${session.samples.length} | matches=${session.matches.length}`;el.style.color=session.active?'#34d399':'#facc15';}else if(meta){el.textContent=`最近：${meta.status} | ${meta.label||meta.mode} | ${meta.id}`;el.style.color='#facc15';}else{el.textContent='尚無 Balance Session';el.style.color='#94a3b8';}refreshHistoryUI();}
  function refreshHistoryUI(){
    const el=document.getElementById('balance-history-list');if(!el)return;const items=historyRead();
    if(!items.length){el.innerHTML='<div style="color:#64748b">尚無歷史 Session。</div>';return;}
    el.innerHTML=items.map(x=>{const st=String(x.status||'').toUpperCase(),c=st.includes('COMPLETE')?'#34d399':st.includes('RUNNING')?'#38bdf8':'#fbbf24';const prog=x.matchesTarget?` · ${x.matches||0}/${x.matchesTarget}場`:'';const full=x.archived?'FULL':'RESCUE';return `<div style="display:flex;gap:7px;align-items:center;flex-wrap:wrap;padding:6px 0;border-bottom:1px solid #1e293b"><span style="color:${c};font-weight:800">${st}</span><span style="color:#e2e8f0;min-width:250px">${x.label||x.mode}${prog}</span><code style="color:#94a3b8">${x.id}</code><span style="font-size:9px;color:${x.archived?'#34d399':'#f59e0b'}">${full}</span><button onclick="BALANCE_LAB.downloadHistory('${x.id}')">下載</button><button onclick="BALANCE_LAB.copyHistory('${x.id}')">複製</button></div>`;}).join('');
  }

  // ---------- UI ----------
  function buildModal(){
    if(document.getElementById('balance-lab-modal'))return;buildScenarioHUD();
    const m=document.createElement('div');m.id='balance-lab-modal';m.style.cssText='display:none;position:fixed;inset:0;z-index:45000;background:rgba(2,6,23,.94);align-items:center;justify-content:center;overflow:auto;padding:18px;box-sizing:border-box';
    m.innerHTML=`<div style="width:min(1220px,96vw);max-height:94vh;overflow:auto;background:#111827;border:2px solid #22d3ee;border-radius:18px;padding:20px;box-shadow:0 0 60px rgba(34,211,238,.22);color:#e5e7eb;font-family:Arial,sans-serif">
      <div style="display:flex;justify-content:space-between;gap:16px;align-items:center;border-bottom:1px solid #334155;padding-bottom:10px"><div><div style="font-size:11px;color:#67e8f9;letter-spacing:.18em;font-weight:900">DEVELOPER INSTRUMENTATION</div><div style="font-size:24px;font-weight:950;color:#facc15">🧪 V76-4.0 Balance Lab</div><div style="font-size:11px;color:#94a3b8;margin-top:4px">Formula → Controlled Engine Scenario → 4-AI → Human. 測試模式不結算金幣／EXP。</div></div><button onclick="BALANCE_LAB.close()" style="padding:8px 14px">✕ 關閉</button></div>
      <div id="balance-status" style="margin:10px 0;padding:8px 10px;border:1px solid #334155;border-radius:8px;background:#020617;font:12px monospace"></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:12px">
        <section style="border:1px solid #334155;border-radius:12px;padding:13px;background:#0f172a"><h3 style="margin:0 0 8px;color:#38bdf8">A. Formula Lab</h3><div style="font-size:11px;color:#94a3b8;margin-bottom:8px">不靠操作。固定其他四維，掃 10/20/30/40/50/60 與邊際差值。五維 Progression Suite 會一次驗證階段成長與跨維污染。</div><label>掃描 <select id="balance-formula-stat"><option value="str">STR</option><option value="agi">AGI</option><option value="jump">JUMP</option><option value="dex" selected>TEC</option><option value="int">INT</option></select></label> <label>其他 <input id="balance-formula-base" type="number" min="10" max="60" value="30" style="width:58px"></label><div style="display:flex;gap:6px;margin-top:9px;flex-wrap:wrap"><button onclick="BALANCE_LAB.formulaSweep(document.getElementById('balance-formula-stat').value,Number(document.getElementById('balance-formula-base').value)||30)">單項掃描</button><button onclick="BALANCE_LAB.formulaSweepAll(Number(document.getElementById('balance-formula-base').value)||30)">掃描全部五維</button><button onclick="BALANCE_LAB.runStatProgressionSuite(Number(document.getElementById('balance-formula-base').value)||30)">五維階段測驗</button><button onclick="BALANCE_LAB.runSelfCheck()">Self Check</button><button onclick="BALANCE_LAB.downloadFormula()">下載公式 LOG</button></div></section>
        <section style="border:1px solid #334155;border-radius:12px;padding:13px;background:#0f172a"><h3 style="margin:0 0 8px;color:#a78bfa">B. Controlled Scenario / Engine Harness</h3><div style="font-size:11px;color:#94a3b8;margin-bottom:8px">固定餵球、標準場、事件/技能/裝備 OFF；但走真正 60Hz physics / collision / input。</div><label>情境 <select id="balance-scenario-type"><option value="receive24">固定中強度接球</option><option value="receive30">固定高速接球</option><option value="dive">固定魚躍救球</option><option value="set">固定二傳</option><option value="spike">固定攻擊 Timing</option><option value="block">固定攔網 Timing</option></select></label><br><label>測試 <select id="balance-scenario-stat"><option value="str">STR</option><option value="agi">AGI</option><option value="jump">JUMP</option><option value="dex" selected>TEC</option><option value="int">INT</option></select> <input id="balance-scenario-value" type="number" min="10" max="60" value="30" style="width:52px"></label> <label>其他 <input id="balance-scenario-base" type="number" min="10" max="60" value="30" style="width:52px"></label><br><button style="margin-top:9px" onclick="BALANCE_LAB.startScenario()">開始固定情境</button></section>
        <section style="border:1px solid #334155;border-radius:12px;padding:13px;background:#0f172a"><h3 style="margin:0 0 8px;color:#f472b6">C. 4-AI Scrimmage</h3><div style="font-size:11px;color:#94a3b8;margin-bottom:8px">四格全部交給同一套 AI Brain；A=左隊、B=右隊。自訂 A/B 時會鎖死五維並移除裝備/技能。</div><label>Profile <select id="balance-ai-profile"><option value="starter4">四隻初始角色 baseStats、無裝備/技能</option><option value="baseline30">四人全 30、無裝備/技能</option><option value="customAB">A / B 隊自訂五維、無裝備/技能</option><option value="current">目前四格角色（含裝備/技能）</option></select></label><div style="margin-top:7px;padding:7px;border:1px dashed #475569;border-radius:8px;font:11px monospace"><b style="color:#67e8f9">A 左隊</b> STR <input id="balance-ai-a-str" type="number" min="1" max="60" value="30" style="width:42px"> AGI <input id="balance-ai-a-agi" type="number" min="1" max="60" value="30" style="width:42px"> JUMP <input id="balance-ai-a-jump" type="number" min="1" max="60" value="30" style="width:42px"> TEC <input id="balance-ai-a-tec" type="number" min="1" max="60" value="30" style="width:42px"> INT <input id="balance-ai-a-int" type="number" min="1" max="60" value="30" style="width:42px"><br><b style="color:#f9a8d4">B 右隊</b> STR <input id="balance-ai-b-str" type="number" min="1" max="60" value="30" style="width:42px"> AGI <input id="balance-ai-b-agi" type="number" min="1" max="60" value="30" style="width:42px"> JUMP <input id="balance-ai-b-jump" type="number" min="1" max="60" value="30" style="width:42px"> TEC <input id="balance-ai-b-tec" type="number" min="1" max="60" value="30" style="width:42px"> INT <input id="balance-ai-b-int" type="number" min="1" max="60" value="30" style="width:42px"></div><label>場數 <input id="balance-ai-matches" type="number" min="1" max="20" value="5" style="width:55px"></label> <label>速度 <select id="balance-ai-speed"><option value="1">1x</option><option value="2">2x</option><option value="4" selected>4x</option><option value="8">8x</option><option value="10">10x（壓力模式）</option></select></label> <label>Seed <input id="balance-ai-seed" type="number" value="753" style="width:70px"></label><br><span style="font-size:10px;color:#94a3b8">8x/10x 只加速模擬 tick；若裝置撐不住，實際完成時間只會變慢，不應改變五維設定。10x 有單幀安全上限避免卡死。</span><br><button style="margin-top:9px" onclick="BALANCE_LAB.startAIScrimmage()">開始 AI 對扁</button></section>
        <section style="border:1px solid #334155;border-radius:12px;padding:13px;background:#0f172a"><h3 style="margin:0 0 8px;color:#34d399">D. Human Free-play Telemetry</h3><div style="font-size:11px;color:#94a3b8;margin-bottom:8px">你正常打。用來量理論優勢經過真人 Timing / 預判 / 操作誤差後還剩多少。</div><label>測試 <select id="balance-human-stat"><option value="str">STR</option><option value="agi">AGI</option><option value="jump">JUMP</option><option value="dex" selected>TEC</option><option value="int">INT</option></select> <input id="balance-human-value" type="number" min="10" max="60" value="30" style="width:52px"></label> <label>其他 <input id="balance-human-base" type="number" min="10" max="60" value="30" style="width:52px"></label><div style="margin-top:7px"><label><input id="balance-human-controlled" type="checkbox" checked> 全場控制變因：其餘角色/四維=基準、移除裝備</label><br><label><input id="balance-human-skills" type="checkbox"> 技能啟用（五維測試建議 OFF）</label></div><button style="margin-top:9px" onclick="BALANCE_LAB.startHuman()">開始真人測試</button></section>
        <section style="border:1px solid #334155;border-radius:12px;padding:13px;background:#0f172a"><h3 style="margin:0 0 8px;color:#facc15">E. Black Box</h3><div style="font-size:11px;color:#94a3b8;margin-bottom:8px">每筆 Session 用獨立 ID 儲存；可多分頁並行。AI_INTENT 會記 Capability / Context / Options / Utility / Selected；invalidSelection 應為 0。二次進攻會記預測攻擊窗，第三觸會串接 Attack→Block→Cover，讓決策與結果可回溯。每 1 秒小型 rescue checkpoint，完成後完整 LOG 封存到 IndexedDB。最多保留 24 筆。</div><div style="display:flex;gap:6px;flex-wrap:wrap"><button onclick="BALANCE_LAB.copyLog()">📋 複製 LOG</button><button onclick="BALANCE_LAB.downloadLog()">💾 下載 LOG</button><button onclick="BALANCE_LAB.stopAndReturn()">⏹ 停止目前測試</button><button onclick="BALANCE_LAB.clearHistory()">🧹 清除歷史</button></div><div id="balance-history-list" style="margin-top:9px;max-height:220px;overflow:auto;background:#020617;border:1px solid #1e293b;border-radius:8px;padding:7px;font:10px/1.35 monospace"></div></section>
      </div>
      <pre id="balance-formula-output" style="margin-top:12px;max-height:340px;overflow:auto;background:#020617;border:1px solid #334155;border-radius:10px;padding:10px;font:11px/1.45 monospace;white-space:pre">先執行 Formula Sweep 或 Self Check。</pre>
      <div style="font-size:10px;color:#64748b;margin-top:8px">Controlled Scenario 的餵球骨架刻意做成 scenario API；未來可包 UI / 評分直接延伸 Training/Tutorial，但 V75-3.21 不做教學內容。</div>
    </div>`;
    document.body.appendChild(m);refreshStatus();
  }
  function open(){buildModal();const m=document.getElementById('balance-lab-modal');if(m)m.style.display='flex';refreshStatus();}
  function close(){const m=document.getElementById('balance-lab-modal');if(m)m.style.display='none';}

  // ---------- Runtime hooks ----------
  function installHooks(){
    if(typeof executePlayerTimingReceive==='function'&&!executePlayerTimingReceive._balanceWrapped){const orig=executePlayerTimingReceive;executePlayerTimingReceive=function(player,isCover=false,receiveSource='K'){const pre=ballSnapshot(),dist=typeof getDist==='function'?getDist(player):null,st=player?.stats,before=player&&proMatchStats?.[player.slotKey]?clone(proMatchStats[player.slotKey]):null,expected=st&&pre?computeReceivePressureFormula(st,pre.speed,ball.isFloat?6:0,null):null;const out=orig.apply(this,arguments);if(session?.active&&player){const after=proMatchStats[player.slotKey]||{},result=before?(after.perfectAbsorbs>before.perfectAbsorbs?'PERFECT':after.normalBumps>before.normalBumps?'BUMP':after.deflects>before.deflects?'DEFLECT':after.coverSaves>before.coverSaves?'COVER':'NO_STAT_CHANGE'):'UNKNOWN';event('RECEIVE',{slot:player.slotKey,source:receiveSource,isCover:!!isCover,isDive:!!player.isDiving,dist:+f(dist,2),incoming:pre,expectedPressure:+f(expected,3),defense:+f(st?.defense,3),sweet:st?.sweetWindow,reach:+f(st?.reach,2),technique:+f(st?.technique,3),result,outgoing:ballSnapshot()});}return out;};executePlayerTimingReceive._balanceWrapped=true;}
    if(typeof executeSetterPass==='function'&&!executeSetterPass._balanceWrapped){const orig=executeSetterPass;executeSetterPass=function(setter){const pre=ballSnapshot(),dist=getDist(setter),low=Math.max(0,(ball.y-(WORLD.FLOOR_Y-95))/55);let special=0;if(ball.isBrokenSpike)special+=2.2;if(ball.isSkyComet)special+=1.8;if(ball.isSineFloat)special+=.8;if(ball.isPhantomDrop)special+=1;if(match.isBlockedBack)special+=1.2;const calc=computeSetFormula(setter.stats,{incomingSpeed:pre.speed,contactDist:dist,lowBallSeverity:low,specialPressure:special}),out=orig.apply(this,arguments);if(session?.active)event('SET',{slot:setter.slotKey,dist:+f(dist,2),incoming:pre,formula:calc,outgoing:ballSnapshot(),success:true});return out;};executeSetterPass._balanceWrapped=true;}
    if(typeof handleUserBump==='function'&&!handleUserBump._balanceWrapped){const orig=handleUserBump;handleUserBump=function(actor){const preFrame=match.lastTouchFrame,dist=getDist(actor),reach=Math.max(70,actor.stats.reach||70),pre=ballSnapshot(),out=orig.apply(this,arguments),success=match.lastTouchFrame!==preFrame;if(session?.active&&actor.slotIndex===NET.mySlot)event('INPUT_ATTEMPT',{action:'K',slot:actor.slotKey,success,dist:+f(dist,2),reach:+f(reach,2),ball:pre});return out;};handleUserBump._balanceWrapped=true;}
    if(typeof handleUserSet==='function'&&!handleUserSet._balanceWrapped){const orig=handleUserSet;handleUserSet=function(actor){const preFrame=match.lastTouchFrame,dist=getDist(actor),pre=ballSnapshot(),out=orig.apply(this,arguments),success=match.lastTouchFrame!==preFrame;if(session?.active&&actor.slotIndex===NET.mySlot)event('INPUT_ATTEMPT',{action:'O',slot:actor.slotKey,success,dist:+f(dist,2),ball:pre});return out;};handleUserSet._balanceWrapped=true;}
    if(typeof handleUserAttack==='function'&&!handleUserAttack._balanceWrapped){const orig=handleUserAttack;handleUserAttack=function(actor){const pre=ballSnapshot(),rm=actor.runMomentum,calc=computeSpikeFormula(actor.stats,rm),before=match.lastTouchFrame,shoulderX=actor.x,shoulderY=actor.y-actor.radius*1.5,dx=(pre.x-shoulderX)*actor.facing,dy=-(pre.y-shoulderY),geometryEligible=dx>=-10&&dx<=80&&Math.abs(dy)<=80,preDist=getDist(actor),actorPre={x:+f(actor.x,2),y:+f(actor.y,2),vx:+f(actor.vx,3),vy:+f(actor.vy,3),facing:actor.facing,grounded:!!actor.isGrounded},out=orig.apply(this,arguments),success=match.lastTouchFrame!==before;if(session?.active){event('INPUT_ATTEMPT',{action:'J',slot:actor.slotKey,success,dist:+f(preDist,2),dx:+f(dx,2),dy:+f(dy,2),geometryEligible,window:{dxMin:-10,dxMax:80,absDyMax:80},actor:actorPre,ball:pre});if(success)event('SPIKE',{slot:actor.slotKey,human:typeof isSlotHumanControlled==='function'?isSlotHumanControlled(actor):actor.isLocallyControlled,success:true,touchNumber:actor.isLeft?match.leftHits:match.rightHits,runMomentum:+f(rm,2),formula:calc,incoming:pre,outgoing:ballSnapshot()});}return out;};handleUserAttack._balanceWrapped=true;}
    if(typeof handleUserThrust==='function'&&!handleUserThrust._balanceWrapped){const orig=handleUserThrust;handleUserThrust=function(actor){const pre=ballSnapshot(),before=match.lastTouchFrame,shoulderX=actor.x,shoulderY=actor.y-actor.radius*1.5,forwardDist=(pre.x-shoulderX)*actor.facing,verticalDelta=pre.y-shoulderY,geometryEligible=forwardDist>=0&&forwardDist<=85&&Math.abs(verticalDelta)<=65,preDist=getDist(actor),actorPre={x:+f(actor.x,2),y:+f(actor.y,2),vx:+f(actor.vx,3),vy:+f(actor.vy,3),facing:actor.facing,grounded:!!actor.isGrounded},out=orig.apply(this,arguments),success=match.lastTouchFrame!==before;if(session?.active)event('INPUT_ATTEMPT',{action:'L',slot:actor.slotKey,success,dist:+f(preDist,2),forwardDist:+f(forwardDist,2),verticalDelta:+f(verticalDelta,2),geometryEligible,window:{forwardMin:0,forwardMax:85,absVerticalMax:65},actor:actorPre,ball:pre});return out;};handleUserThrust._balanceWrapped=true;}
    for(const name of ['handleServeSpike','handleServeFloat']){const fn=window[name];if(typeof fn==='function'&&!fn._balanceWrapped){const orig=fn;window[name]=function(actor){const pre=ballSnapshot(),rm=actor.runMomentum,before=match.lastTouchFrame,out=orig.apply(this,arguments),success=match.lastTouchFrame!==before;if(session?.active)event(name==='handleServeSpike'?'SERVE_SPIKE':'SERVE_FLOAT',{slot:actor.slotKey,success,runMomentum:+f(rm,2),stats:playerSnapshot(actor),incoming:pre,outgoing:ballSnapshot()});return out;};window[name]._balanceWrapped=true;}}
    if(typeof recordTouch==='function'&&!recordTouch._balanceWrapped){const orig=recordTouch;recordTouch=function(actor,isBlockTouch=false){const pre=ballSnapshot(),action=isBlockTouch?'BLOCK':actor?.isDiving?'DIVE_TOUCH':actor?.swingTimer>0?'SWING_TOUCH':actor?.thrustTimer>0?'THRUST_TOUCH':'TOUCH',ok=orig.apply(this,arguments);if(session?.active&&ok&&actor){event('TOUCH_BEGIN',{slot:actor.slotKey,action,incoming:pre,teamHits:actor.isLeft?match.leftHits:match.rightHits,touchNumber:actor.isLeft?match.leftHits:match.rightHits});queueMicrotask(()=>{if(!session?.active)return;const payload={slot:actor.slotKey,action,incoming:pre,outgoing:ballSnapshot(),dist:typeof getDist==='function'?+f(getDist(actor),2):null};if(isBlockTouch)Object.assign(payload,{rigidity:+f(actor.stats.blockRigidity,3),effectiveRigidity:Number.isFinite(actor.blockEffectiveRigidity)?+f(actor.blockEffectiveRigidity,3):null,impactLoad:Number.isFinite(actor.blockImpactLoad)?+f(actor.blockImpactLoad,3):null,loadMargin:Number.isFinite(actor.blockLoadMargin)?+f(actor.blockLoadMargin,3):null,outcome:actor.blockOutcome||null,contactZone:actor.blockContactZone||null,timingTier:actor.blockTimingTier||null,timingFactor:Number.isFinite(actor.blockTimingFactor)?+f(actor.blockTimingFactor,3):null,pressDistance:Number.isFinite(actor.blockPressDistance)?+f(actor.blockPressDistance,1):null,oneTouchAbsorb:actor.stats.oneTouchAbsorb,technique:+f(actor.stats.technique,3),blockTimer:actor.blockTimer,jumpVy:+f(actor.vy,2),y:+f(actor.y,1)});event(isBlockTouch?'BLOCK_TOUCH':'TOUCH_RESULT',payload);});}return ok;};recordTouch._balanceWrapped=true;}
    if(typeof Player!=='undefined'&&Player.prototype){for(const name of ['jump','dive','triggerBlock']){const orig=Player.prototype[name];if(typeof orig==='function'&&!orig._balanceWrapped){Player.prototype[name]=function(){const wasGrounded=this.isGrounded,pre={x:this.x,y:this.y,vx:this.vx,vy:this.vy,runMomentum:this.runMomentum},out=orig.apply(this,arguments);if(session?.active){if(name==='jump'&&wasGrounded&&!this.isGrounded)event('JUMP',{slot:this.slotKey,pre,launchVy:+f(this.vy,3),jumpStat:this.stats.jumpStat,effectiveJump:this.stats.effectiveJump});if(name==='dive'&&wasGrounded&&this.isDiving)event('DIVE',{slot:this.slotKey,pre,launchVx:+f(this.vx,3),launchVy:+f(this.vy,3),diveSpeed:+f(this.stats.diveSpeed,3),agi:this.stats.agi,effectiveAgi:this.stats.effectiveAgi});if(name==='triggerBlock'&&out)event('BLOCK_ARM',{slot:this.slotKey,y:+f(this.y,1),vy:+f(this.vy,2),timer:this.blockTimer,jumpStat:this.stats.jumpStat,effectiveJump:this.stats.effectiveJump});}return out;};Player.prototype[name]._balanceWrapped=true;}}}
    if(typeof pushAIIntentAudit==='function'&&!pushAIIntentAudit._balanceWrapped){const orig=pushAIIntentAudit;pushAIIntentAudit=function(player,phase,payload={}){const out=orig.apply(this,arguments);if(session?.active&&out)event('AI_INTENT',clone(out));return out;};pushAIIntentAudit._balanceWrapped=true;}
    if(typeof pushAIDebug==='function'&&!pushAIDebug._balanceWrapped){const orig=pushAIDebug;pushAIDebug=function(player,action,detail=''){const out=orig.apply(this,arguments);if(session?.active){const k=(player?.slotKey||'?')+'|'+action+'|'+detail;if(lastAIDebug[player?.slotKey]!==k){lastAIDebug[player?.slotKey]=k;event('AI_DECISION',{slot:player?.slotKey,action,detail});}}return out;};pushAIDebug._balanceWrapped=true;}
    if(typeof pushAIBrainTrace==='function'&&!pushAIBrainTrace._balanceWrapped){const orig=pushAIBrainTrace;pushAIBrainTrace=function(side,ev,detail=''){const out=orig.apply(this,arguments);if(session?.active)event('AI_TRACE',{side,event:ev,detail});return out;};pushAIBrainTrace._balanceWrapped=true;}
    if(typeof flagAIBug==='function'&&!flagAIBug._balanceWrapped){const orig=flagAIBug;flagAIBug=function(side,code,detail=''){const out=orig.apply(this,arguments);if(session?.active)event('AI_BUG',{side,code,detail});return out;};flagAIBug._balanceWrapped=true;}
  }

  window.addEventListener('keydown',e=>{if(BALANCE_SCENARIO_ACTIVE&&scenario.active&&e.key.toLowerCase()==='r'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)){e.preventDefault();resetScenario();}});
  window.addEventListener('pagehide',()=>{if(session?.active)checkpoint('INCOMPLETE / PAGEHIDE');});
  window.addEventListener('beforeunload',()=>{if(session?.active)checkpoint('INCOMPLETE / BEFOREUNLOAD');});
  window.addEventListener('storage',e=>{if(String(e.key||'').startsWith(META_PREFIX)||String(e.key||'').startsWith(RESCUE_PREFIX)){refreshStatus();}});

  function init(){buildModal();installHooks();refreshStatus();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
  window.BALANCE_LAB={open,close,formulaSweep,formulaSweepAll,runStatProgressionSuite,runSelfCheck,downloadFormula,startScenario,resetScenario,tickScenario,startHuman,startAIScrimmage,onSettlement,stopAndReturn,downloadLog,copyLog,downloadHistory,copyHistory,clearHistory,event,sample,finishSession,isTestMode:()=>!!BALANCE_TEST_ACTIVE,getSession:()=>session,getRecovered:recovered,summarizeSession};
})();
