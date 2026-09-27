// ========================================================
// 核心業務層：相機、物理碰撞、發扣判定、Slot 控制器解耦、WebRTC 雙向通訊
// ========================================================
let ironWallTracking = false; // 銅牆鐵壁追焦開關
let ironWallExecution = null; // V74-9: contact snapshot -> frozen world -> ball-only execution

const camera = {
  x: WORLD.NET_X - (VIEW_W / 2),
  y: WORLD.FLOOR_Y - 450,
  targetX: WORLD.NET_X - (VIEW_W / 2),
  targetY: WORLD.FLOOR_Y - 450,
  zoom: 1.0,
  targetZoom: 1.0,

  update(ball) {
    // 平滑變焦
    this.zoom += (this.targetZoom - this.zoom) * 0.08;

    if (isNaN(ball.x) || isNaN(ball.y)) return;

    // 🌟 銅牆鐵壁特寫模式：鏡頭緊咬球心下墜！
    if (ironWallTracking) {
      this.targetX = ball.x - (VIEW_W / 2);
      this.targetY = ball.y - (VIEW_H / 2);
      this.x += (this.targetX - this.x) * 0.35;
      this.y += (this.targetY - this.y) * 0.35;
      return;
    }

    const defaultX = WORLD.NET_X - (VIEW_W / 2);
    const defaultY = WORLD.FLOOR_Y - 450;
    let targetX = defaultX, targetY = defaultY;

    if (ball.x < WORLD.NET_X - 150) {
      targetX = defaultX - (((WORLD.NET_X - 150) - ball.x) * 0.85);
    } else if (ball.x > WORLD.NET_X + 150) {
      targetX = defaultX + ((ball.x - (WORLD.NET_X + 150)) * 0.85);
    }

    if (ball.y < 280) {
      targetY = defaultY - Math.pow(280 - ball.y, 1.08) * 0.9;
    }

    this.targetX = Math.max(0, Math.min(WORLD.WIDTH - VIEW_W, targetX));
    this.targetY = Math.max(0, Math.min(WORLD.HEIGHT - VIEW_H, targetY));
    this.x += (this.targetX - this.x) * 0.065;
    this.y += (this.targetY - this.y) * 0.065;
  }
};

function resetIronWallCamera(reason='safety') {
  ironWallTracking = false;
  if (typeof hitStopFrames !== 'undefined') hitStopFrames = 0;
  if (typeof ball !== 'undefined') ball.isIronWallSlam = false;
  ironWallExecution = null;
  camera.targetZoom = 1.0;
  // V74-8: recover smoothly after the rebound instead of snapping back.
  const _dx = WORLD.NET_X - (VIEW_W / 2), _dy = WORLD.FLOOR_Y - 450;
  camera.targetX = _dx; camera.targetY = _dy;
  if (typeof ironWallWatchdog !== 'undefined') ironWallWatchdog = 0;
}
let ironWallWatchdog = 0;

// V62 multiplayer instrumentation: distinguish network latency from prediction divergence.
const NET_DEBUG = { rtt:0, syncCount:0, syncRate:0, txCount:0, txRate:0, eventRxCount:0, eventRxRate:0, inputTxCount:0, inputTxRate:0, stateSkipCount:0, stateSkipRate:0, staleStateDrops:0, lastRateAt:performance.now(), correctionSum:0, correctionCount:0, correctionMax:0, lastPingAt:0, lastSyncAt:0, lastAnyRxAt:0, syncAge:0, anyRxAge:0, hardReconciles:0, mediumReconciles:0, sanitizeCount:0, sendErrors:0, packetSeq:0, lastRecvSeq:0, lastAppliedSeq:0, packetGaps:0, freezeWatchdog:0, duplicateEvents:0, lastConnError:'-', remoteStateRx:0, remoteStateAge:0, remoteRtt:0, adaptiveStateHz:60, adaptiveReason:'HEALTHY', adaptiveLastChangeAt:0, lastHealthSentAt:0 };

// V75-2.6 MATCH NETWORK DIAGNOSTIC RECORDER
// Observation only: records render/simulation/transport health without changing gameplay or sync policy.
const NET_DIAG = {
  version:'V76-3.4.2', matchId:'-', startedAt:0, endedAt:0, finalized:false,
  role:'OFFLINE', rafCount:0, renderCount:0, simCount:0, lastRafAt:0, lastStateRxAt:0, lastStateTxAt:0,
  frameSum:0, frameCount:0, frameMax:0, long25:0, long50:0, long100:0,
  simTickMsSum:0, simTickMsCount:0, simTickMsMax:0, catchupFrames:0, catchupTicks:0,
  stateRxGapSum:0, stateRxGapCount:0, stateRxGapMax:0, stateTxGapSum:0, stateTxGapCount:0, stateTxGapMax:0,
  inputRxCount:0, inputRxRate:0, stateBytesSample:0, stateBytesSamples:0,
  hiddenChanges:0, focusChanges:0, anomalies:[], samples:[], lastSampleAt:0,
  totals:{tx:0,rx:0,inputTx:0,inputRx:0,skip:0,gaps:0,stale:0,dup:0,err:0,hard:0,med:0},
  extrema:{fpsMin:999,simMin:999,txMin:999,rxMin:999,ageMax:0,ctrlBufMax:0,stateBufMax:0,corrMax:0},
  prev:{fps:null,sim:null,tx:null,rx:null,age:null,ctrlBuf:0,stateBuf:0}, finalText:''
};
function netDiagNewMatchId(){ return 'NSF-'+Date.now().toString(36).toUpperCase()+'-'+Math.random().toString(36).slice(2,6).toUpperCase(); }
const NET_DIAG_STORAGE_KEY='NSF_NET_DIAG_LAST_V1';
function netDiagSnapshotRecord(status='INCOMPLETE'){
  if(!NET_DIAG.startedAt) return null;
  const role=(typeof NET!=='undefined'&&NET.isMultiplayer)?(NET.isHost?'HOST':'GUEST'):NET_DIAG.role;
  let text='';
  try{text=NET_DIAG.finalText||netDiagBuildText();}catch(e){text=`=== NSF VOLLEYBALL NETWORK DIAGNOSTIC ===\nBUILD: V76-3.4.2 · CRASH-SAFE MATCH DIAGNOSTIC\nROLE: ${role}\nMATCH ID: ${NET_DIAG.matchId||'-'}\nTERMINATION: ${status}\nRECOVERY NOTE: partial checkpoint; full text build failed: ${e?.message||e}`;}
  return {schema:1,build:'V76-3.4.2',status,role,matchId:NET_DIAG.matchId||'-',venue:(typeof currentVenueId!=='undefined'?currentVenueId:'?'),savedAt:Date.now(),durationMs:Math.max(0,(NET_DIAG.endedAt||performance.now())-NET_DIAG.startedAt),text};
}
function persistNetDiagCheckpoint(status='INCOMPLETE'){
  if(!NET_DIAG.startedAt) return;
  try{const rec=netDiagSnapshotRecord(status); if(rec)localStorage.setItem(NET_DIAG_STORAGE_KEY,JSON.stringify(rec));}catch(e){}
  updateRecoveredNetDiagMenu();
}
function loadRecoveredNetDiag(){
  try{const raw=localStorage.getItem(NET_DIAG_STORAGE_KEY);if(!raw)return null;const rec=JSON.parse(raw);return rec&&rec.text?rec:null;}catch(e){return null;}
}
function updateRecoveredNetDiagMenu(){
  const wrap=document.getElementById('last-net-diag-box'), meta=document.getElementById('last-net-diag-meta'); if(!wrap)return;
  const rec=loadRecoveredNetDiag(); if(!rec){wrap.style.display='none';return;}
  wrap.style.display='block';
  const incomplete=rec.status!=='COMPLETE';
  wrap.style.borderColor=incomplete?'#f59e0b':'#334155';
  if(meta){const when=new Date(rec.savedAt||Date.now()).toLocaleString();meta.textContent=`${incomplete?'⚠ 未正常結束':'✓ 已完成'} · ${rec.role||'?'} · MATCH ${rec.matchId||'-'} · ${rec.venue||'?'} · ${when}`;meta.style.color=incomplete?'#fbbf24':'#94a3b8';}
}
async function copyRecoveredNetDiagnostic(){
  const rec=loadRecoveredNetDiag();if(!rec){alert('沒有可用的上一場診斷資料。');return;}
  try{await navigator.clipboard.writeText(rec.text);alert(`已複製上一場 ${rec.role||''} 診斷資料！`);}catch(e){const ta=document.createElement('textarea');ta.value=rec.text;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();alert('已複製上一場診斷資料！');}
}
function downloadRecoveredNetDiagnostic(){
  const rec=loadRecoveredNetDiag();if(!rec){alert('沒有可用的上一場診斷資料。');return;}
  const blob=new Blob([rec.text],{type:'text/plain;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`NSF_NET_RECOVERED_${rec.role||'UNKNOWN'}_${rec.matchId||'-'}.txt`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function resetNetDiag(preserveMatchId=false){
  const id=preserveMatchId?NET_DIAG.matchId:'-';
  Object.assign(NET_DIAG,{matchId:id,startedAt:performance.now(),endedAt:0,finalized:false,role:(typeof NET!=='undefined'&&NET.isMultiplayer?(NET.isHost?'HOST':'GUEST'):'OFFLINE'),rafCount:0,renderCount:0,simCount:0,lastRafAt:0,lastStateRxAt:0,lastStateTxAt:0,frameSum:0,frameCount:0,frameMax:0,long25:0,long50:0,long100:0,simTickMsSum:0,simTickMsCount:0,simTickMsMax:0,catchupFrames:0,catchupTicks:0,stateRxGapSum:0,stateRxGapCount:0,stateRxGapMax:0,stateTxGapSum:0,stateTxGapCount:0,stateTxGapMax:0,inputRxCount:0,inputRxRate:0,stateBytesSample:0,stateBytesSamples:0,hiddenChanges:0,focusChanges:0,anomalies:[],samples:[],lastSampleAt:performance.now(),totals:{tx:0,rx:0,inputTx:0,inputRx:0,skip:0,gaps:0,stale:0,dup:0,err:0,hard:0,med:0},extrema:{fpsMin:999,simMin:999,txMin:999,rxMin:999,ageMax:0,ctrlBufMax:0,stateBufMax:0,corrMax:0},prev:{fps:null,sim:null,tx:null,rx:null,age:null,ctrlBuf:0,stateBuf:0},finalText:''});
}
function netDiagEvent(type, detail=''){
  if(!NET_DIAG.startedAt) return;
  const t=Math.max(0,performance.now()-NET_DIAG.startedAt), item={t:Math.round(t),type,detail:String(detail||'')};
  const last=NET_DIAG.anomalies[NET_DIAG.anomalies.length-1];
  if(last && last.type===item.type && last.detail===item.detail && item.t-last.t<2000) return;
  NET_DIAG.anomalies.push(item); if(NET_DIAG.anomalies.length>180) NET_DIAG.anomalies.shift(); persistNetDiagCheckpoint('INCOMPLETE');
}
function netDiagRecordRaf(now){
  if(!NET_DIAG.startedAt||NET_DIAG.finalized) return; NET_DIAG.rafCount++;
  if(NET_DIAG.lastRafAt){ const d=now-NET_DIAG.lastRafAt; NET_DIAG.frameSum+=d; NET_DIAG.frameCount++; NET_DIAG.frameMax=Math.max(NET_DIAG.frameMax,d); if(d>25)NET_DIAG.long25++; if(d>50)NET_DIAG.long50++; if(d>100)NET_DIAG.long100++; }
  NET_DIAG.lastRafAt=now;
}
function netDiagRecordStateRx(){ const n=performance.now(); if(NET_DIAG.lastStateRxAt){const d=n-NET_DIAG.lastStateRxAt;NET_DIAG.stateRxGapSum+=d;NET_DIAG.stateRxGapCount++;NET_DIAG.stateRxGapMax=Math.max(NET_DIAG.stateRxGapMax,d);} NET_DIAG.lastStateRxAt=n; }
function netDiagRecordStateTx(){ const n=performance.now(); if(NET_DIAG.lastStateTxAt){const d=n-NET_DIAG.lastStateTxAt;NET_DIAG.stateTxGapSum+=d;NET_DIAG.stateTxGapCount++;NET_DIAG.stateTxGapMax=Math.max(NET_DIAG.stateTxGapMax,d);} NET_DIAG.lastStateTxAt=n; }
function netDiagSample(now=performance.now()){
  if(!NET_DIAG.startedAt||NET_DIAG.finalized||typeof NET==='undefined'||!NET.isMultiplayer) return;
  const dt=Math.max(0.25,(now-NET_DIAG.lastSampleAt)/1000), fps=Math.round(NET_DIAG.rafCount/dt), sim=Math.round(NET_DIAG.simCount/dt), irx=Math.round(NET_DIAG.inputRxCount/dt);
  let cb=0,sb=0,cq=0,sq=0; try{cb=NET.conn?.dataChannel?.bufferedAmount||0;cq=NET.conn?.bufferSize||0;}catch(e){} try{sb=NET.stateConn?.dataChannel?.bufferedAmount||0;sq=NET.stateConn?.bufferSize||0;}catch(e){}
  const tx=NET_DEBUG.txRate||0, rx=NET_DEBUG.syncRate||0, age=NET_DEBUG.syncAge||0, corr=NET_DEBUG.correctionMax||0;
  const sample={t:Math.round((now-NET_DIAG.startedAt)/1000),fps,sim,tx,rx,inputTx:NET_DEBUG.inputTxRate||0,inputRx:irx,rtt:Math.round(NET_DEBUG.rtt||0),age:Math.round(age),any:Math.round(NET_DEBUG.anyRxAge||0),hz:NET_DEBUG.adaptiveStateHz||0,reason:NET_DEBUG.adaptiveReason||'-',ctrlKB:Math.round(cb/1024),stateKB:Math.round(sb/1024),ctrlQ:cq,stateQ:sq,skip:NET_DEBUG.stateSkipRate||0,corr:+corr.toFixed(1),hidden:document.hidden?1:0,focus:document.hasFocus()?1:0};
  NET_DIAG.samples.push(sample); if(NET_DIAG.samples.length>600)NET_DIAG.samples.shift();
  const ex=NET_DIAG.extrema; ex.fpsMin=Math.min(ex.fpsMin,fps);ex.simMin=Math.min(ex.simMin,sim);if(tx)ex.txMin=Math.min(ex.txMin,tx);if(rx)ex.rxMin=Math.min(ex.rxMin,rx);ex.ageMax=Math.max(ex.ageMax,age);ex.ctrlBufMax=Math.max(ex.ctrlBufMax,cb);ex.stateBufMax=Math.max(ex.stateBufMax,sb);ex.corrMax=Math.max(ex.corrMax,corr);
  const pr=NET_DIAG.prev;
  if(fps<45 && (pr.fps==null||pr.fps>=45))netDiagEvent('FPS_DROP',`${pr.fps??'?'}→${fps}`);
  if(sim<50 && (pr.sim==null||pr.sim>=50))netDiagEvent('SIM_RATE_DROP',`${pr.sim??'?'}→${sim}`);
  if(NET.isHost && tx>0 && tx<45 && (pr.tx==null||pr.tx>=45))netDiagEvent('TX_RATE_DROP',`${pr.tx??'?'}→${tx}`);
  if(!NET.isHost && rx>0 && rx<45 && (pr.rx==null||pr.rx>=45))netDiagEvent('RX_RATE_LOW',`${pr.rx??'?'}→${rx}`);
  if(age>180 && (pr.age==null||pr.age<=180))netDiagEvent('STATE_STALE',`${Math.round(age)}ms`);
  if(cb>64*1024 && pr.ctrlBuf<=64*1024)netDiagEvent('CTRL_BACKPRESSURE',`${Math.round(cb/1024)}KB`);
  if(sb>48*1024 && pr.stateBuf<=48*1024)netDiagEvent('STATE_BACKPRESSURE',`${Math.round(sb/1024)}KB`);
  if(fps<45 && sim>=55)netDiagEvent('RENDER_LOW_SIM_OK',`FPS ${fps} / SIM ${sim}`);
  if(!NET.isHost && age>180 && (NET_DEBUG.inputTxRate||0)>0)netDiagEvent('INPUT_HEALTHY_WHILE_STATE_STALE',`INPUT ${NET_DEBUG.inputTxRate}/s AGE ${Math.round(age)}ms`);
  Object.assign(pr,{fps,sim,tx,rx,age,ctrlBuf:cb,stateBuf:sb});
  NET_DIAG.totals.tx+=tx;NET_DIAG.totals.rx+=rx;NET_DIAG.totals.inputTx+=(NET_DEBUG.inputTxRate||0);NET_DIAG.totals.inputRx+=irx;NET_DIAG.totals.skip+=(NET_DEBUG.stateSkipRate||0);
  NET_DIAG.rafCount=0;NET_DIAG.simCount=0;NET_DIAG.inputRxCount=0;NET_DIAG.lastSampleAt=now; persistNetDiagCheckpoint('INCOMPLETE');
}
function netDiagFmtMs(ms){return Number.isFinite(ms)?ms.toFixed(1):'0.0';}
function netDiagBuildText(){
  const role=(typeof NET!=='undefined'&&NET.isMultiplayer)?(NET.isHost?'HOST':'GUEST'):NET_DIAG.role, dur=Math.max(0,(NET_DIAG.endedAt||performance.now())-NET_DIAG.startedAt), ss=NET_DIAG.samples, avg=k=>ss.length?ss.reduce((a,x)=>a+(Number(x[k])||0),0)/ss.length:0, min=k=>ss.length?Math.min(...ss.map(x=>Number(x[k])||0)):0, max=k=>ss.length?Math.max(...ss.map(x=>Number(x[k])||0)):0;
  const frameAvg=NET_DIAG.frameCount?NET_DIAG.frameSum/NET_DIAG.frameCount:0, rxGap=NET_DIAG.stateRxGapCount?NET_DIAG.stateRxGapSum/NET_DIAG.stateRxGapCount:0, txGap=NET_DIAG.stateTxGapCount?NET_DIAG.stateTxGapSum/NET_DIAG.stateTxGapCount:0;
  const lines=[`=== NSF VOLLEYBALL NETWORK DIAGNOSTIC ===`,`BUILD: V76-3.4.2 · CRASH-SAFE MATCH DIAGNOSTIC`,`ROLE: ${role}`,`MATCH ID: ${NET_DIAG.matchId||'-'}`,`DURATION: ${(dur/1000).toFixed(1)}s`,`VENUE: ${typeof currentVenueId!=='undefined'?currentVenueId:'?'}`,`TERMINATION: ${NET_DIAG.finalized?'COMPLETE':'INCOMPLETE / LAST CHECKPOINT'}`,'',`[PERFORMANCE]`,`FPS AVG ${avg('fps').toFixed(1)} / MIN ${min('fps')} / MAX ${max('fps')}`,`FRAME AVG ${netDiagFmtMs(frameAvg)}ms / MAX ${netDiagFmtMs(NET_DIAG.frameMax)}ms`,`LONG >25ms ${NET_DIAG.long25} / >50ms ${NET_DIAG.long50} / >100ms ${NET_DIAG.long100}`,`VISIBILITY CHANGES ${NET_DIAG.hiddenChanges} / FOCUS CHANGES ${NET_DIAG.focusChanges}`,'',`[SIMULATION]`,`SIM AVG ${avg('sim').toFixed(1)}/s / MIN ${min('sim')} / MAX ${max('sim')}`,`CATCHUP FRAMES ${NET_DIAG.catchupFrames} / EXTRA TICKS ${NET_DIAG.catchupTicks}`,'',`[NETWORK — ${role}]`,`RTT AVG ${avg('rtt').toFixed(1)}ms / MAX ${max('rtt')}ms`,`STATE ${role==='HOST'?'TX':'RX'} AVG ${(role==='HOST'?avg('tx'):avg('rx')).toFixed(1)}/s / MIN ${(role==='HOST'?min('tx'):min('rx'))}`,`${role==='HOST'?'SEND':'ARRIVAL'} GAP AVG ${netDiagFmtMs(role==='HOST'?txGap:rxGap)}ms / MAX ${netDiagFmtMs(role==='HOST'?NET_DIAG.stateTxGapMax:NET_DIAG.stateRxGapMax)}ms`,`STATE AGE AVG ${avg('age').toFixed(1)}ms / MAX ${max('age')}ms`,`ADAPT LAST ${NET_DEBUG.adaptiveReason||'-'} @${NET_DEBUG.adaptiveStateHz||0}Hz`,`CTRL BUF MAX ${Math.round(NET_DIAG.extrema.ctrlBufMax/1024)}KB / STATE BUF MAX ${Math.round(NET_DIAG.extrema.stateBufMax/1024)}KB`,`PACKET GAPS ${NET_DEBUG.packetGaps||0} / STALE ${NET_DEBUG.staleStateDrops||0} / DUP ${NET_DEBUG.duplicateEvents||0} / ERR ${NET_DEBUG.sendErrors||0}`,`CORRECTION MAX ${Math.max(NET_DIAG.extrema.corrMax,NET_DEBUG.correctionMax||0).toFixed(1)}`,'',`[INPUT]`,`INPUT TX AVG ${avg('inputTx').toFixed(1)}/s`,`INPUT RX AVG ${avg('inputRx').toFixed(1)}/s`,'',`[ENVIRONMENT]`,`hidden=${document.hidden} focus=${document.hasFocus()} DPR=${window.devicePixelRatio||1} viewport=${innerWidth}x${innerHeight}`,`canvas=${(typeof canvas!=='undefined'&&canvas)?canvas.width+'x'+canvas.height:'?'}`,'',`[ANOMALIES ${NET_DIAG.anomalies.length}]`];
  if(!NET_DIAG.anomalies.length)lines.push('NONE'); else NET_DIAG.anomalies.forEach(a=>lines.push(`${(a.t/1000).toFixed(3)}s ${a.type}${a.detail?' — '+a.detail:''}`));
  lines.push('','[TIMELINE — 1s samples]','t  fps sim tx rx inTX inRX rtt age hz reason ctrlKB stateKB skip corr');
  ss.forEach(x=>lines.push(`${String(x.t).padStart(3)} ${String(x.fps).padStart(3)} ${String(x.sim).padStart(3)} ${String(x.tx).padStart(2)} ${String(x.rx).padStart(2)} ${String(x.inputTx).padStart(4)} ${String(x.inputRx).padStart(4)} ${String(x.rtt).padStart(3)} ${String(x.age).padStart(3)} ${String(x.hz).padStart(2)} ${x.reason} ${x.ctrlKB} ${x.stateKB} ${x.skip} ${x.corr}`));
  return lines.join('\n');
}
function finalizeNetDiag(){ if(NET_DIAG.finalized)return; NET_DIAG.endedAt=performance.now(); NET_DIAG.finalized=true; NET_DIAG.role=(typeof NET!=='undefined'&&NET.isMultiplayer?(NET.isHost?'HOST':'GUEST'):NET_DIAG.role); NET_DIAG.finalText=netDiagBuildText(); persistNetDiagCheckpoint('COMPLETE'); updateNetDiagSettlementUI(); }
function ensureNetDiagSettlementUI(){
  let box=document.getElementById('settle-net-diag');
  if(box) return box;
  const modal=document.getElementById('settlement-modal');
  if(!modal) return null;
  const panel=modal.firstElementChild;
  if(!panel) return null;
  box=document.createElement('div');
  box.id='settle-net-diag';
  box.style.cssText='display:none;margin-top:16px;padding:12px 14px;border:1px solid #38bdf8;border-radius:12px;background:#02061799;text-align:left;';
  box.innerHTML='<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap"><div><span style="color:#94a3b8;font-size:11px">連線診斷</span> <b id="settle-net-role" style="color:#38bdf8;font-size:13px">HOST</b><div id="settle-net-summary" style="color:#cbd5e1;font:11px monospace;margin-top:4px">等待資料...</div></div><div style="display:flex;gap:8px"><button class="btn-action" style="padding:7px 14px;font-size:12px" onclick="copyNetDiagnostic()">📋 複製本機診斷</button><button class="btn-home" style="padding:7px 14px;font-size:12px" onclick="downloadNetDiagnostic()">💾 下載完整診斷</button></div></div>';
  const actionRow=panel.lastElementChild;
  if(actionRow) panel.insertBefore(box,actionRow); else panel.appendChild(box);
  return box;
}
function updateNetDiagSettlementUI(){
  const box=ensureNetDiagSettlementUI(); if(!box)return;
  const multi=typeof NET!=='undefined'&&NET.isMultiplayer;
  box.style.display=multi?'block':'none'; if(!multi)return;
  const role=NET.isHost?'HOST':'GUEST', badge=document.getElementById('settle-net-role'), sum=document.getElementById('settle-net-summary');
  if(badge){badge.textContent=role;badge.style.color=role==='HOST'?'#fbbf24':'#38bdf8';}
  const ss=NET_DIAG.samples, avg=k=>ss.length?ss.reduce((a,x)=>a+(Number(x[k])||0),0)/ss.length:0;
  if(sum)sum.textContent=`MATCH ${NET_DIAG.matchId} · ${role} · FPS ${avg('fps').toFixed(0)} · SIM ${avg('sim').toFixed(0)}/s · STATE ${role==='HOST'?'TX '+avg('tx').toFixed(0):'RX '+avg('rx').toFixed(0)}/s · 異常 ${NET_DIAG.anomalies.length}`;
}
async function copyNetDiagnostic(){ if(!NET_DIAG.finalized)finalizeNetDiag(); const txt=NET_DIAG.finalText||netDiagBuildText(); try{await navigator.clipboard.writeText(txt); alert(`已複製 ${NET_DIAG.role} 診斷資料！`);}catch(e){const ta=document.createElement('textarea');ta.value=txt;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();alert(`已複製 ${NET_DIAG.role} 診斷資料！`);} }
function downloadNetDiagnostic(){ if(!NET_DIAG.finalized)finalizeNetDiag(); const txt=NET_DIAG.finalText||netDiagBuildText(), blob=new Blob([txt],{type:'text/plain;charset=utf-8'}), a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`NSF_NET_${NET_DIAG.role}_${NET_DIAG.matchId}.txt`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000); }
document.addEventListener('visibilitychange',()=>{ if(NET_DIAG.startedAt&&!NET_DIAG.finalized){NET_DIAG.hiddenChanges++;netDiagEvent('VISIBILITY_CHANGE',document.hidden?'HIDDEN':'VISIBLE');} });
window.addEventListener('focus',()=>{if(NET_DIAG.startedAt&&!NET_DIAG.finalized){NET_DIAG.focusChanges++;netDiagEvent('FOCUS','ON');}}); window.addEventListener('blur',()=>{if(NET_DIAG.startedAt&&!NET_DIAG.finalized){NET_DIAG.focusChanges++;netDiagEvent('FOCUS','OFF');}});
window.addEventListener('pagehide',()=>{if(NET_DIAG.startedAt&&!NET_DIAG.finalized)persistNetDiagCheckpoint('INCOMPLETE');});
window.addEventListener('beforeunload',()=>{if(NET_DIAG.startedAt&&!NET_DIAG.finalized)persistNetDiagCheckpoint('INCOMPLETE');});
document.addEventListener('DOMContentLoaded',()=>setTimeout(updateRecoveredNetDiagMenu,0));

const NET_EVENT_SEEN = new Map();
function resetNetDebugForSession(){
  NET_EVENT_SEEN.clear();
  Object.assign(NET_DEBUG,{rtt:0,syncCount:0,syncRate:0,txCount:0,txRate:0,eventRxCount:0,eventRxRate:0,inputTxCount:0,inputTxRate:0,stateSkipCount:0,stateSkipRate:0,staleStateDrops:0,correctionSum:0,correctionCount:0,correctionMax:0,lastPingAt:0,lastSyncAt:0,lastAnyRxAt:0,syncAge:0,anyRxAge:0,hardReconciles:0,mediumReconciles:0,sanitizeCount:0,sendErrors:0,packetSeq:0,lastRecvSeq:0,lastAppliedSeq:0,packetGaps:0,freezeWatchdog:0,duplicateEvents:0,lastConnError:'-',remoteStateRx:0,remoteStateAge:0,remoteRtt:0,adaptiveStateHz:60,adaptiveReason:'HEALTHY',adaptiveLastChangeAt:0,lastHealthSentAt:0});
  NET_DEBUG.lastRateAt=performance.now();
  _lastNetInputSig=''; _lastNetInputSentAt=0;
  resetNetDiag(false);
  if (typeof NET!=='undefined' && NET.isHost) NET_DIAG.matchId=netDiagNewMatchId();
  persistNetDiagCheckpoint('INCOMPLETE');
}
function consumeNetEvent(eventId, ttl=12000){
  if(!eventId) return true;
  const now=performance.now(), prev=NET_EVENT_SEEN.get(eventId);
  if(prev && now-prev<ttl){ if(typeof NET_DEBUG!=='undefined') NET_DEBUG.duplicateEvents++; return false; }
  NET_EVENT_SEEN.set(eventId,now);
  if(NET_EVENT_SEEN.size>256){ for(const [k,t] of NET_EVENT_SEEN){ if(now-t>ttl) NET_EVENT_SEEN.delete(k); } }
  return true;
}
function tickNetDebug() {
  if (typeof NET==='undefined' || !NET.isMultiplayer) return;
  const now=performance.now();
  if (!NET.isHost && NET.conn && NET.conn.open && now-NET_DEBUG.lastPingAt>1000) {
    NET_DEBUG.lastPingAt=now; NET.conn.send({type:'PING',t:now});
  }
  // V75-2.5: Guest reports receive health over the reliable control lane. This lets the Host
  // detect one-way Host->Guest congestion even when the lossy STATE sender itself shows 0 KB.
  if (!NET.isHost && NET.conn && NET.conn.open && now-NET_DEBUG.lastHealthSentAt>1000) {
    NET_DEBUG.lastHealthSentAt=now;
    try { NET.conn.send({type:'NET_HEALTH', stateRx:NET_DEBUG.syncRate||0, stateAge:NET_DEBUG.syncAge||0, rtt:NET_DEBUG.rtt||0}); } catch(e) {}
  }
  if (now-NET_DEBUG.lastRateAt>=1000) {
    NET_DEBUG.syncRate=NET_DEBUG.syncCount; NET_DEBUG.syncCount=0; NET_DEBUG.txRate=NET_DEBUG.txCount; NET_DEBUG.txCount=0; NET_DEBUG.eventRxRate=NET_DEBUG.eventRxCount; NET_DEBUG.eventRxCount=0; NET_DEBUG.inputTxRate=NET_DEBUG.inputTxCount; NET_DEBUG.inputTxCount=0; NET_DEBUG.stateSkipRate=NET_DEBUG.stateSkipCount; NET_DEBUG.stateSkipCount=0; NET_DEBUG.lastRateAt=now;
    if(typeof netDiagSample==='function') netDiagSample(now);
    // Keep correction telemetry readable: one-second window instead of lifetime average.
    NET_DEBUG.correctionSum=0; NET_DEBUG.correctionCount=0; NET_DEBUG.correctionMax=0;
    NET_DEBUG.hardReconciles=0; NET_DEBUG.mediumReconciles=0;
  }
  let el=document.getElementById('net-debug-overlay');
  if (!el) { el=document.createElement('div'); el.id='net-debug-overlay'; el.style.cssText='position:fixed;left:8px;bottom:8px;z-index:99999;background:#020617cc;color:#a7f3d0;border:1px solid #334155;border-radius:6px;padding:5px 7px;font:11px monospace;pointer-events:none;white-space:pre'; document.body.appendChild(el); }
  const avg=NET_DEBUG.correctionCount?NET_DEBUG.correctionSum/NET_DEBUG.correctionCount:0;
  NET_DEBUG.syncAge = (!NET.isHost && NET_DEBUG.lastSyncAt) ? Math.max(0, now-NET_DEBUG.lastSyncAt) : 0;
  NET_DEBUG.anyRxAge = (!NET.isHost && NET_DEBUG.lastAnyRxAt) ? Math.max(0, now-NET_DEBUG.lastAnyRxAt) : 0;
  let ctrlBuf=0,stateBuf=0,ctrlQ=0,stateQ=0;
  try{ ctrlBuf=NET.conn?.dataChannel?.bufferedAmount||0; ctrlQ=NET.conn?.bufferSize||0; }catch(e){}
  try{ stateBuf=NET.stateConn?.dataChannel?.bufferedAmount||0; stateQ=NET.stateConn?.bufferSize||0; }catch(e){}
  const connState=(NET.conn&&NET.conn.open)?'OPEN':'CLOSED';
  const stateState=(NET.stateConn&&NET.stateConn.open)?'S-OPEN':'S-FALLBACK';
  el.textContent=`NET ${NET.isHost?'HOST':'GUEST'} RTT ${NET_DEBUG.rtt.toFixed(0)}ms ${connState}/${stateState}\nSTATE ${NET.isHost?'TX '+NET_DEBUG.txRate+'/s SKIP '+NET_DEBUG.stateSkipRate+'/s @'+NET_DEBUG.adaptiveStateHz+'Hz':'RX '+NET_DEBUG.syncRate+'/s'} AGE ${NET_DEBUG.syncAge.toFixed(0)}ms ANY ${NET_DEBUG.anyRxAge.toFixed(0)}ms\nCTRL ${Math.round(ctrlBuf/1024)}KB Q${ctrlQ}  STATE ${Math.round(stateBuf/1024)}KB Q${stateQ}  IN ${NET_DEBUG.inputTxRate}/s\nADAPT ${NET_DEBUG.adaptiveReason}${NET.isHost?' PEER '+NET_DEBUG.remoteStateRx+'/s '+NET_DEBUG.remoteRtt.toFixed(0)+'ms':''}\nEVRX ${NET_DEBUG.eventRxRate}/s ERR ${NET_DEBUG.sendErrors} DUP ${NET_DEBUG.duplicateEvents} STALE ${NET_DEBUG.staleStateDrops}\nCORR ${avg.toFixed(1)} max ${NET_DEBUG.correctionMax.toFixed(1)} MED ${NET_DEBUG.mediumReconciles} HARD ${NET_DEBUG.hardReconciles}\nGAPS ${NET_DEBUG.packetGaps} SAN ${NET_DEBUG.sanitizeCount} FREEZE ${NET_DEBUG.freezeWatchdog} VENUE ${(typeof currentVenueId!=='undefined'?currentVenueId:'?')}`;
}
let debugHitbox = false, maxRecordedSpeed = 0, maxRecordedSpin = 0;
let lastCastSkillName = 'None', lastCastFrame = -999, lastCastSkillCasterSlot = 0;
let lastBlockDebug = { effectiveRigidity: 0, incomingSpeed: 0, ap: 0, isBroken: false };
// V14：AI 決策偵錯。只記錄資訊，不參與任何 AI 判斷或數值。
let aiDebugEvents = [];
let aiDebugState = {};
// V75-0 AI FOUNDATION: persistent team intent + anomaly trace. Observation only; it does not alter ball physics.
let aiBrainTrace = [];
let aiBugFlags = [];
// V75-3.7 structured decision audit. Observation only; never feeds back into gameplay.
let aiIntentAudit = [];
let aiTeamIntentState = {
  LEFT:  { phase:'IDLE', ownerKey:null, ownerName:'-', secondaryKey:null, secondaryName:'-', secondaryTask:'-', targetX:null, reason:'-', frame:-1, touchFrame:-1, hits:0 },
  RIGHT: { phase:'IDLE', ownerKey:null, ownerName:'-', secondaryKey:null, secondaryName:'-', secondaryTask:'-', targetX:null, reason:'-', frame:-1, touchFrame:-1, hits:0 }
};
function aiSlotKey(player){ return player ? (player.slotKey || `slot${player.slotIndex}`) : null; }
function pushAIBrainTrace(side, event, detail='') {
  aiBrainTrace.unshift({ side, event, detail, frame:gameFrame });
  if (aiBrainTrace.length > 20) aiBrainTrace.length = 20;
}
function flagAIBug(side, code, detail='') {
  const last = aiBugFlags[0];
  if (last && last.code===code && last.side===side && gameFrame-last.frame<15) return;
  aiBugFlags.unshift({ side, code, detail, frame:gameFrame });
  if (aiBugFlags.length > 12) aiBugFlags.length = 12;
  pushAIBrainTrace(side, `BUG? ${code}`, detail);
}
function pushAIIntentAudit(player, phase, payload={}) {
  if (!player) return null;
  const side = player.isLeft ? 'LEFT' : 'RIGHT';
  const rec = {
    side,
    slot: aiSlotKey(player),
    name: player.name || '-',
    phase: phase || 'UNKNOWN',
    frame: gameFrame,
    touchFrame: (typeof match!=='undefined' ? match.lastTouchFrame : -1),
    ...payload
  };
  aiIntentAudit.unshift(rec);
  if (aiIntentAudit.length > 60) aiIntentAudit.length = 60;
  return rec;
}
function setAITeamIntent(side, phase, owner, secondary, targetX, reason, hits, secondaryTask='-') {
  const state = aiTeamIntentState[side];
  const ownerKey = aiSlotKey(owner), secondaryKey = aiSlotKey(secondary);
  const changed = state.phase!==phase || state.ownerKey!==ownerKey || state.touchFrame!==match.lastTouchFrame;
  state.phase=phase; state.ownerKey=ownerKey; state.ownerName=owner?owner.name:'-';
  state.secondaryKey=secondaryKey; state.secondaryName=secondary?secondary.name:'-'; state.secondaryTask=secondaryTask||'-';
  state.targetX=Number.isFinite(targetX)?targetX:null; state.reason=reason||'-'; state.frame=gameFrame;
  state.touchFrame=match.lastTouchFrame; state.hits=hits;
  if (changed) pushAIBrainTrace(side, `${phase} -> ${state.ownerName}`, `${reason||'-'} | hits=${hits} | touch=${match.lastTouchFrame}`);
}
// V17：真人接球診斷快照。只觀測，不改任何 K/L 判定或物理。
let receiveDebugSeq = 0;
let lastReceiveDebug = null;
function estimateFramesToFloor(b = ball) {
  if (!b || !Number.isFinite(b.y) || !Number.isFinite(b.vy)) return null;
  const floorY = WORLD.FLOOR_Y - (b.radius || 0);
  if (b.y >= floorY) return 0;
  const g = WORLD.GRAVITY * 0.72;
  if (g <= 0) return null;
  const c = b.y - floorY;
  const disc = b.vy * b.vy - 2 * g * c;
  if (disc < 0) return null;
  const t = (-b.vy + Math.sqrt(disc)) / g;
  return Number.isFinite(t) && t >= 0 ? t : null;
}
function snapshotReceiveInput(actor, input) {
  if (!actor) return;
  const d = getDist(actor);
  const standReach = Math.max(70, actor.stats.reach || 70);
  const diveReach = Math.max(85, standReach);
  const eta = estimateFramesToFloor();
  const cooldown = Math.max(0, 18 - (gameFrame - match.lastTouchFrame));
  lastReceiveDebug = {
    seq: ++receiveDebugSeq, frame: gameFrame, input, dist: d, standReach, diveReach, eta,
    speed: Math.hypot(ball.vx, ball.vy), vx: ball.vx, vy: ball.vy,
    int: actor.stats.intellect || 0, dex: actor.card ? (actor.card.dex || 0) : 0,
    broken: !!ball.isBrokenSpike, float: !!ball.isFloat, sineFloat: !!ball.isSineFloat,
    serveRally: !!match.inServeRally, cooldown,
    result: input === 'K' ? (cooldown > 0 ? 'BLOCKED — TOUCH COOLDOWN' : (d <= standReach ? 'INPUT — IN K RANGE' : 'INPUT — OUT OF K RANGE')) : (d <= standReach ? 'DIVE — K RANGE WAS ENOUGH' : (d <= diveReach ? 'DIVE — EXTRA RANGE NEEDED' : 'DIVE — BALL STILL OUT OF RANGE'))
  };
}
function markReceiveDebugContact(actor, input, result) {
  if (!lastReceiveDebug || !actor) return;
  if (gameFrame - lastReceiveDebug.frame > 45) return;
  if (lastReceiveDebug.input !== input) return;
  lastReceiveDebug.contactFrame = gameFrame;
  lastReceiveDebug.result = result;
}
function pushAIDebug(player, action, detail = '') {
  if (!player) return;
  const key = player.slotKey || `slot${player.slotIndex}`;
  aiDebugState[key] = { name: player.name, action, detail, frame: gameFrame };
  aiDebugEvents.unshift({ name: player.name, action, detail, frame: gameFrame });
  if (aiDebugEvents.length > 7) aiDebugEvents.length = 7;
}


const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const userUltFill = document.getElementById('user-ult-fill');
const mateUltFill = document.getElementById('mate-ult-fill');
const userUltText = document.getElementById('user-ult-text');
const mateUltText = document.getElementById('mate-ult-text');
const mainPillarFrame = document.getElementById('main-pillar-frame');
const subPillarFrame = document.getElementById('sub-pillar-frame');
const staminaFill = document.getElementById('stamina-fill');
const scoreDisplay = document.getElementById('score-display');
const statusSubtext = document.getElementById('status-subtext');

let isGameStarted = false, isPaused = true, isLockerOpen = false, isSettlementOpen = false;
let score = { player: 0, enemy: 0 }, gameFrame = 0;
let screenShakeTimer = 0, screenShakeIntensity = 0, visualEffects = [];
let calloutPopups = [], coinPopups = [], haloEffects = [];

let timeSlowTimer = 0, chronoCasterSide = 'player', chronoAnimTimer = 0;
const CHRONO_RELEASE_FADE_FRAMES = 20;
function releaseChronoBulletTime(reason='receive') {
  if (timeSlowTimer <= 0) return false;
  timeSlowTimer = 0; // gameplay/AI return to 1.0x immediately
  chronoAnimTimer = Math.max(chronoAnimTimer || 0, CHRONO_RELEASE_FADE_FRAMES); // visuals feather out separately
  return true;
}
let hitStopFrames = 0;
let cinematicDuckActive = false;

const banner = { active: false, timer: 0, mainText: '', subText: '', color: '#38bdf8', winnerTeam: 'LEFT' };
let pendingCoinReward = 0, pendingCoinReason = '';

let proMatchStats = {
  user: { totalSpikes: 0, spikeKills: 0, toolOutKills: 0, serviceAces: 0, maxSpeed: 0, totalReceives: 0, perfectAbsorbs: 0, normalBumps: 0, deflects: 0, coverSaves: 0, totalBlocks: 0, roofKills: 0 },
  mate: { totalSpikes: 0, spikeKills: 0, toolOutKills: 0, serviceAces: 0, maxSpeed: 0, totalReceives: 0, perfectAbsorbs: 0, normalBumps: 0, deflects: 0, coverSaves: 0, totalBlocks: 0, roofKills: 0 },
  enemyFront: { totalSpikes: 0, spikeKills: 0, toolOutKills: 0, serviceAces: 0, maxSpeed: 0, totalReceives: 0, perfectAbsorbs: 0, normalBumps: 0, deflects: 0, coverSaves: 0, totalBlocks: 0, roofKills: 0 },
  enemyBack: { totalSpikes: 0, spikeKills: 0, toolOutKills: 0, serviceAces: 0, maxSpeed: 0, totalReceives: 0, perfectAbsorbs: 0, normalBumps: 0, deflects: 0, coverSaves: 0, totalBlocks: 0, roofKills: 0 }
};

class Player {
  constructor(slotKey, x, isLeft, slotIndex) {
    this.slotKey = slotKey;
    this.slotIndex = slotIndex;
    this.x = x; this.y = WORLD.FLOOR_Y; this.vx = 0; this.vy = 0;
    this.spawnX = x; this.ledgeRespawnTimer = 0; this.respawnBlinkTimer = 0;
    this.radius = 24; this.isLeft = isLeft; this.isGrounded = true;
    this.isDiving = false; this.diveTimer = 0; this.diveTouched = false;
    this.isBlocking = false; this.wantsToBlock = false; this.blockTimer = 0;
    this.blockPressFrame = -99999; this.blockPressDistance = 999; this.blockPressApproaching = false;
    this.blockPressSideGap = 999; this.blockTimingTier = 'NONE'; this.blockTimingFactor = 1.0;
    this.facing = isLeft ? 1 : -1; this.squashX = 1; this.squashY = 1;
    this.jumpStartX = x; this.swingTimer = 0; this.thrustTimer = 0;
    this.thrustTargetX = 0; this.thrustTargetY = 0;
    this.hasBlockSelfHitPrivilege = false; this.runMomentum = 0; this.runMomentumDir = 0;
    this.reactionTimer = 0; this.despairTimer = 0; this.recheckDelay = 0;
    this.jumpExhaustion = 1.0; this.energy = 0; this.hasPlayedFullSound = false; this.energyReadyFlash = 0;
    this.depressedRallies = 0; this.excitedRallies = 0; this.roarMoodRallies = 0;
    this.mudDebuffTimer = 0; this.mudDebuffRallies = 0; this.softWallRallies = 0; this.softWallVfxAlpha = 0;
    this.godspeedCharges = 0; this.greaseDebuffRallies = 0; this.flowAbsorbRallies = 0;
    this.ghostTrail = [];
    this._nextFootstepFrame = 0;
this.stunTimer = 0; // 🌟 接收重扣後的地面僵直時間 (幀)
    this.venueDizzyTimer = 0; this.venueDizzyTotal = 0;
    this.venueShockTimer = 0; this.venueShockRecoveryTimer = 0; this.venueShockRecoveryTotal = 0;
    this.rebind(false);
  }
  get isLocallyControlled() {
    return (typeof NET !== 'undefined') ? (this.slotIndex === NET.mySlot) : (this.slotIndex === 0);
  }

  get effectiveSpeed() {
    let spd = this.stats.speed;
    if (this.depressedRallies > 0) spd *= 0.88;
    if (this.excitedRallies > 0) spd *= 1.08;
    if (this.mudDebuffRallies > 0) spd *= 0.60;
    return spd;
  }

  addEnergy(amount) {
    const maxCost = this.stats.skill.cost, oldEnergy = this.energy;
    const gainMult = (this.stats && Number.isFinite(this.stats.bonusEnergyGain)) ? this.stats.bonusEnergyGain : 1.0;
    const finalAmount = amount > 0 ? amount * gainMult : amount;
    this.energy = Math.min(maxCost, this.energy + finalAmount);
    if (oldEnergy < maxCost && this.energy >= maxCost && !this.hasPlayedFullSound) {
      this.hasPlayedFullSound = true;
      this.energyReadyFlash = 52; // V63: READY 只在跨滿能量瞬間竄一次金光，不持續暴露狀態
      if (this.isLocallyControlled) playSound('p1_full');
      else if (this.slotIndex === NET.mateSlot) playSound('p2_full');
      // V65: 滿能量金光是公開世界演出。由 Host 權威廣播一次，Guest 不靠本機 energy setter 猜事件。
      if (typeof NET !== 'undefined' && NET.isMultiplayer && NET.isHost && NET.conn && NET.conn.open) {
        NET.conn.send({ type: 'ENERGY_FULL_SYNC', slotIndex: this.slotIndex, eventId: `energy:${gameFrame}:${this.slotIndex}` });
      }
    }
    updateSideUltHUD();
  }

  consumeSkill(requiredType = null) {
    // V75-3 Balance Lab can disable skills so five-stat tests are not contaminated by ultimates.
    if (typeof BALANCE_DISABLE_SKILLS !== 'undefined' && BALANCE_DISABLE_SKILLS) return false;
    const sk = this.stats.skill;
    if (requiredType && sk.type !== requiredType) return false;
    if (this.energy >= sk.cost) {
      this.energy = 0; this.hasPlayedFullSound = false;
      lastCastSkillName = sk.name; lastCastFrame = gameFrame; lastCastSkillCasterSlot = this.slotIndex;
      // V64: 技能 Cut-in 是一次性 presentation event；Guest 不再靠 STATE_SYNC 猜施放時機。
      if (typeof NET !== 'undefined' && NET.isMultiplayer && NET.isHost && NET.conn && NET.conn.open) {
        NET.conn.send({ type: 'SKILL_CAST_SYNC', skillName: sk.name, casterSlot: this.slotIndex, eventId: `skill:${gameFrame}:${this.slotIndex}:${sk.id}` });
      }
      if (typeof playSound === 'function') playSound(`skill:${sk.id}`);
      updateSideUltHUD();
      return true;
    }
    return false;
  }

  refundEnergy(percent = 0.5) {
    const refund = Math.floor(this.stats.skill.cost * percent);
    this.addEnergy(refund);
    if (this.isLocallyControlled) pushCallout(this.x, this.y - 45, `+${refund} 能量返還!`, '#38bdf8');
  }

  forceGrounded(x = null) {
    if (x !== null) this.x = x;
    this.y = WORLD.FLOOR_Y; this.vx = 0; this.vy = 0;
    this.isGrounded = true; this.isDiving = false; this.diveTimer = 0; this.diveTouched = false;
    this.isBlocking = false; this.wantsToBlock = false; this.blockTimer = 0;
    this.blockPressFrame = -99999; this.blockPressDistance = 999; this.blockPressApproaching = false;
    this.blockPressSideGap = 999; this.blockTimingTier = 'NONE'; this.blockTimingFactor = 1.0;
    this._aiBlockPlan = null; this._thirdAttackPlan = null;
    this.swingTimer = 0; this.thrustTimer = 0; this.jumpStartX = this.x;
    this.runMomentum = 0; this.runMomentumDir = 0; this.reactionTimer = 0; this.despairTimer = 0; this.recheckDelay = 0;
    this.ghostTrail = [];
  }

rebind(triggerHUD = true) {
    this.card = ACTIVE_ROSTER[this.slotKey];
    this.color = this.card.color; this.name = this.card.name;
    this.stats = deriveStats(this.card);
this.highestRank3Tier = (this.card && this.card.highestRank3Tier) ? this.card.highestRank3Tier : null;

    // 🌟 角色身分 ID 綁定：本機主控帶入 Firebase 帳號，其他格帶入角色卡名
    const cloudName = (typeof currentCloudUser !== 'undefined' && currentCloudUser) ? currentCloudUser : '我方主控';
    if (this.slotIndex === NET.mySlot) {
      this.playerName = cloudName;
    } else {
      this.playerName = this.card.name;
    }

    if (triggerHUD) updateSideUltHUD();
  }
  jump(power = null) {
    if (this.isGrounded && !this.isDiving) {
      this.jumpStartX = this.x;
      const baseJump = power !== null ? power : this.stats.jump;
      let exhMult = this.jumpExhaustion;
      if (this.depressedRallies > 0) exhMult *= 0.90;
      if (this.excitedRallies > 0) exhMult *= 1.05;
      if (this.mudDebuffRallies > 0) exhMult *= 0.70;
      this.vy = baseJump * exhMult * (typeof venueJumpFactor==='function'?venueJumpFactor(this):1);
      if (typeof playFoley === 'function') playFoley('jump', this.vy);
      const pPerks = (this.stats && this.stats.perks) ? this.stats.perks : {};
      const exFactor = pPerks.exhaustionResist ? 0.89 : 0.78;
      this.jumpExhaustion = Math.max(0.35, this.jumpExhaustion * exFactor);
      this.isGrounded = false; this.squashX = 0.75; this.squashY = 1.3;
    }
  }

dive() {
    if (this.isGrounded && !this.isDiving) {
      this.isDiving = true; this.diveTimer = 35 ; this.diveTouched = false;
      // 🌟 強化撲跳感：蹬地大幅向前噴射，垂直拋起離地
      const diveBase = (this.stats && Number.isFinite(this.stats.diveSpeed)) ? this.stats.diveSpeed : (this.effectiveSpeed * 2);
      const liveSpeedRatio = (this.stats && this.stats.speed > 0) ? (this.effectiveSpeed / this.stats.speed) : 1.0;
      this.vx = this.facing * diveBase * liveSpeedRatio;
      this.vy = -3.8;
      this.isGrounded = false; this.runMomentum = 0; this.runMomentumDir = 0; if(typeof playFoley==='function')playFoley('dive',Math.hypot(this.vx,this.vy));
    }
  }

  triggerBlock() {
    if (match.inServeRally) return false;
    if (Math.abs(this.x - WORLD.NET_X) < 110) {
      if (this.consumeSkill('BLOCK_STANCE')) {
        this.softWallRallies = 3;
        pushCallout(this.x, this.y - 45, '引力柔網 (SOFT WALL)!!', '#2dd4bf');
      }

      // V75-3.11 BLOCK PRESS：Jump 與 Block 完全分離。
      // 記錄「按下/壓手」當下球與手的幾何，真正碰球時才判 SAFE / PERFECT / LATE。
      const handX = this.x;
      const handY = this.y - this.radius * 2 - 20;
      const bx = (typeof ball !== 'undefined' && ball) ? ball.x : handX;
      const by = (typeof ball !== 'undefined' && ball) ? ball.y : handY;
      const incomingTowardMe = (typeof ball !== 'undefined' && ball)
        ? ((this.isLeft && ball.vx < 0) || (!this.isLeft && ball.vx > 0))
        : false;
      // sideGap > 0：球還在網對側/手前；sideGap < 0：球已穿過手面，屬晚壓風險。
      const sideGap = this.isLeft ? (bx - handX) : (handX - bx);

      this.blockPressFrame = (typeof gameFrame !== 'undefined') ? gameFrame : 0;
      this.blockPressDistance = Math.hypot(bx - handX, by - handY);
      this.blockPressApproaching = !!incomingTowardMe;
      this.blockPressSideGap = sideGap;

      // V76-3.7 practice-only block timing coach. It reads the exact same press geometry as the real block judge; no physics/stat bonus.
      if (typeof isPracticeMode!=='undefined' && isPracticeMode && this.isLocallyControlled &&
          typeof practiceBlockCoachEnabled!=='undefined' && practiceBlockCoachEnabled && !match.inServeRally) {
        let coachTier = 'EARLY';
        let coachColor = '#93c5fd';
        if (sideGap < -6) { coachTier='LATE'; coachColor='#fb7185'; }
        else if (incomingTowardMe && this.blockPressDistance <= 105 && sideGap >= -6) { coachTier='PERFECT'; coachColor='#fde68a'; }
        if (!Number.isFinite(this._lastBlockCoachFrame) || this.blockPressFrame - this._lastBlockCoachFrame > 5) {
          this._lastBlockCoachFrame = this.blockPressFrame;
          pushCallout(this.x, this.y - this.radius * 2 - 8, coachTier, coachColor, null, {type:'trainer'});
          if (coachTier==='PERFECT' && typeof triggerHalo==='function') triggerHalo(this, '#fde68a', true);
        }
      }
      this.blockTimingTier = 'PENDING';
      this.blockTimingFactor = 1.0;
      this.wantsToBlock = true;
      this.blockTimer = 30;
      return true;
    }
    return false;
  }

  update() {
    const wasGroundedAtFrameStart = this.isGrounded;
    // V74-16 CHRONO: true per-player time integration. Do not weaken jump/gravity stats;
    // the victim simply advances only 30% of a physics frame while Bullet Time is active.
    const chronoVictim = timeSlowTimer > 0 && ((chronoCasterSide === 'player' && !this.isLeft) || (chronoCasterSide === 'enemy' && this.isLeft));
    const chronoDt = chronoVictim ? 0.30 : 1.0;
    this.x += this.vx * chronoDt; this.y += this.vy * chronoDt;
    const venueNow = (typeof getCurrentVenue === 'function') ? getCurrentVenue() : null;
    const isLedgeVenue = !!(venueNow && venueNow.arena === 'ledge');
    const iceHoleOpen = !!(venueIncidentState && venueIncidentState.active==='ICE_CRACK' && venueIncidentState.hole && venueIncidentState.hole.phase==='open' && Math.abs(this.x-venueIncidentState.hole.x)<venueIncidentState.hole.w/2);
    const onLedgePlatform = (!isLedgeVenue || (this.x >= venueNow.platformLeft && this.x <= venueNow.platformRight)) && !iceHoleOpen;
    const localFloorY = (typeof venueFloorYAt==='function') ? venueFloorYAt(this.x) : WORLD.FLOOR_Y;
    // V49 貨輪：站地角色每幀貼合當前斜甲板。甲板下降時不能留在上一幀的空中。
    if (venueNow && venueNow.fixed==='ship_sway' && this.isGrounded && onLedgePlatform) { this.y = localFloorY; this.vy = 0; }
    if (this.respawnBlinkTimer > 0) this.respawnBlinkTimer--;
    if (this.energyReadyFlash > 0) this.energyReadyFlash--;
    if (isLedgeVenue && !onLedgePlatform && this.isGrounded) { this.isGrounded = false; this.vy = Math.max(this.vy, 0.8); }
    if (isLedgeVenue && this.y > WORLD.FLOOR_Y + 250) {
      this.forceGrounded(this.spawnX);
      this.respawnBlinkTimer = 90;
      this.stunTimer = 18;
      if (typeof playSound === 'function') playSound('teleport');
      if (typeof createShockwave === 'function') createShockwave(this.x, WORLD.FLOOR_Y - 18, '#a78bfa');
    }
    if (this.reactionTimer > 0) this.reactionTimer--;
    if (this.despairTimer > 0) this.despairTimer--;
    if (this.recheckDelay > 0) this.recheckDelay--;
    if (this.mudDebuffTimer > 0) this.mudDebuffTimer--; // legacy visual timer only; V27 gameplay uses mudDebuffRallies
    // V74-19 Gravity Soft Wall presentation: gameplay toggles immediately, field feathers in/out independently.
    const softWallTargetAlpha = this.softWallRallies > 0 ? 1 : 0;
    this.softWallVfxAlpha += (softWallTargetAlpha - this.softWallVfxAlpha) * (softWallTargetAlpha ? 0.14 : 0.09);
    if (this.softWallVfxAlpha < 0.004) this.softWallVfxAlpha = 0;

// 🌟 處理被重扣震退時的硬直與地板滑行摩擦力
    if (this.stunTimer > 0) {
      this.stunTimer--;
      this.vx *= 0.82; // 每幀迅速衰減，向後滑行 20~30 像素後平穩煞車
    }

    if (this.isGrounded) {
      if (this._moveIntentFrame !== gameFrame) {
        // V53: 回復判定看移動指令，不看滑行中的 vx。
        // V21: 大腿疲勞回復統一吃裝備副詞條 + 站立回氣 perk。
        // 這不是 Stamina 系統；jumpExhaustion 就是現有的大腿疲勞值。
        const recMult = (this.stats && Number.isFinite(this.stats.bonusStaminaRec)) ? this.stats.bonusStaminaRec : 1.0;
        const idleBonus = (this.stats && this.stats.perks && Number.isFinite(this.stats.perks.staminaIdleRate)) ? this.stats.perks.staminaIdleRate : 0;
        this.jumpExhaustion = Math.min(1.0, this.jumpExhaustion + 0.0035 * recMult * (1 + idleBonus) * (typeof venueExhaustionRecoveryFactor==='function'?venueExhaustionRecoveryFactor():1));
      }
      // V76-1 Momentum Direction Integrity: momentum belongs to actual ground travel, not facing.
      // Reversing real vx clears stored approach momentum; stopping decays normally. Airborne
      // frames freeze both magnitude and direction, preserving physical inertia without magic reversal.
      const momentumMoveDir = this.vx > 0.5 ? 1 : (this.vx < -0.5 ? -1 : 0);
      if (momentumMoveDir) {
        if (this.runMomentum > 0 && this.runMomentumDir && momentumMoveDir !== this.runMomentumDir) {
          this.runMomentum = 0;
          this.runMomentumDir = momentumMoveDir;
        } else {
          if (!this.runMomentumDir) this.runMomentumDir = momentumMoveDir;
          this.runMomentum = Math.min(25, this.runMomentum + 1.4);
        }
      } else {
        this.runMomentum = Math.max(0, this.runMomentum - 2.0);
        if (this.runMomentum <= 0.001) { this.runMomentum = 0; this.runMomentumDir = 0; }
      }
      // V74 footsteps: cadence and timbre change by discrete speed band, not a single gain curve.
      const stepSpeed=Math.abs(this.vx);
      if(this._moveIntentFrame===gameFrame && stepSpeed>1.15 && gameFrame>=(this._nextFootstepFrame||0)){
        if(typeof playFoley==='function')playFoley('step',stepSpeed);
        const cadence=stepSpeed<2.8?22:(stepSpeed<5.4?15:11);
        this._nextFootstepFrame=gameFrame+cadence;
      }
    } else {
      let g = WORLD.GRAVITY * ((typeof getCurrentVenue === 'function') ? getCurrentVenue().gravityMult : 1.0) * (typeof venueGravityFactor==='function'?venueGravityFactor():1);
      // Advance velocity by the same local dt as position. This keeps the original jump arc
      // intact in simulated time and prevents leftover upward vy when Chrono ends.
      this.vy += g * chronoDt;
    }

    this.squashX += (1 - this.squashX) * 0.15;
    this.squashY += (1 - this.squashY) * 0.15;
    if (this.swingTimer > 0) this.swingTimer--;
    if (this.thrustTimer > 0) this.thrustTimer--;

    // V75-3.11：所有角色共用同一套 Block Stance。Jump 本身不再自動生成攔網碰撞。
    // 真人按 Space、AI 做 BLOCK_PRESS 都只會打開 wantsToBlock；人在空中且手高於網後才形成 isBlocking。
    if (this.wantsToBlock) {
      this.blockTimer--;
      const isAttacking = this.swingTimer > 0 || this.thrustTimer > 0;
      this.isBlocking = (!this.isGrounded && this.y < WORLD.NET_TOP_Y + 50 && !isAttacking);
      if (this.blockTimer <= 0 || this.isGrounded) {
        this.wantsToBlock = false;
        this.isBlocking = false;
        this.blockTimingTier = 'NONE';
        this.blockTimingFactor = 1.0;
      }
    } else {
      this.isBlocking = false;
    }

    if (this.isDiving) {
      this.diveTimer--; this.vx *= 0.90;
      if (this.y >= localFloorY && onLedgePlatform) { this.y = localFloorY; this.vy = 0; }
      if (this.diveTimer <= 0 && onLedgePlatform) { this.isDiving = false; this.diveTouched = false; this.y = localFloorY; this.isGrounded = true; }
    } else if (this.y >= localFloorY && onLedgePlatform) {
      const landingVy = this.vy; // V74: capture signed downward speed before collision zeroes it.
      if (serveState.active && serveState.currentServer === this) {
        const isLandedInCourt = this.isLeft ? (this.x >= WORLD.LEFT) : (this.x <= WORLD.RIGHT);
        if (isLandedInCourt) triggerFault(this.isLeft ? 'RIGHT' : 'LEFT', 'FOOT FAULT!!', '發球未擊球前落地踩線進場');
      }
      this.y = localFloorY; this.vy = 0; this.isGrounded = true;
      if (!wasGroundedAtFrameStart && typeof playFoley === 'function') playFoley('land', landingVy);
      this.wantsToBlock = false; this.isBlocking = false; this.jumpStartX = this.x;
    }

if (serveState.active) {
      // 🌟 發球期：改用 slotIndex 比對
      const isServer = (serveState.currentServer && serveState.currentServer.slotIndex === this.slotIndex);

      if (isServer) {
        // 發球員：底線外自由走動與退後助跑
        if (this.isLeft) {
          if (this.x < 50) this.x = 50;
          if (this.x > WORLD.LEFT - 10 && this.isGrounded && !serveState.tossed) {
            this.x = WORLD.LEFT - 10;
          }
        } else {
          if (this.x > WORLD.WIDTH - 50) this.x = WORLD.WIDTH - 50;
          if (this.x < WORLD.RIGHT + 10 && this.isGrounded && !serveState.tossed) {
            this.x = WORLD.RIGHT + 10;
          }
        }

        if (this.isGrounded && serveState.tossed) {
          const isSteppedIn = this.isLeft ? (this.x >= WORLD.LEFT) : (this.x <= WORLD.RIGHT);
          if (isSteppedIn) triggerFault(this.isLeft ? 'RIGHT' : 'LEFT', 'FOOT FAULT!!', '發球未擊球前落地踩線進場');
        }
      } else {
        // 非發球員留守場內
        if (this.isLeft) {
          if (this.x < WORLD.LEFT + this.radius) this.x = WORLD.LEFT + this.radius;
          if (this.x > WORLD.NET_X - this.radius - 8) this.x = WORLD.NET_X - this.radius - 8;
        } else {
          if (this.x < WORLD.NET_X + this.radius + 8) this.x = WORLD.NET_X + this.radius + 8;
          if (this.x > WORLD.RIGHT - this.radius) this.x = WORLD.RIGHT - this.radius;
        }
      }
    } else {
      // 🌟🌟🌟 補回遺失的「常規對戰期球網剛體與邊界空氣牆」！
      if (this.isLeft) {
        if (this.x < 50) this.x = 50;
        // 左隊絕對禁止穿過球網中線：
        if (this.x > WORLD.NET_X - this.radius - 8) this.x = WORLD.NET_X - this.radius - 8;
      } else {
        // 右隊絕對禁止穿過球網中線：
        if (this.x < WORLD.NET_X + this.radius + 8) this.x = WORLD.NET_X + this.radius + 8;
        if (!isLedgeVenue && this.x > WORLD.WIDTH - 50) this.x = WORLD.WIDTH - 50;
        if (isLedgeVenue && this.x > WORLD.WIDTH + 180) this.x = WORLD.WIDTH + 180;
      }
    }
  }

  draw(targetCtx) {
    drawPlayerEntity(this, targetCtx);
  }
}

// 🌟 客觀物理 4 大格子實例化 (Slot 0 ~ 3)
const userPlayer = new Player('user', WORLD.LEFT - 100, true, 0);
const mateAI     = new Player('mate', WORLD.LEFT + 240, true, 1);
const enemyA     = new Player('enemyFront', WORLD.RIGHT - 240, false, 2);
const enemyB     = new Player('enemyBack', WORLD.RIGHT + 100, false, 3);
const allPlayers = [userPlayer, mateAI, enemyA, enemyB];

// V33：工業倉庫屋頂其實由 20 片等寬鐵皮組成；視覺不畫格線，但每片有獨立 HP。
const WAREHOUSE_ROOF_PANEL_COUNT = 20;
let warehouseRoofPanels = [];
let warehouseRoofDebris = [];
function resetWarehouseRoofState() {
  warehouseRoofPanels = Array.from({length: WAREHOUSE_ROOF_PANEL_COUNT}, (_, i) => ({ index:i, hp:100, maxHp:100, broken:false }));
  warehouseRoofDebris = [];
}
function damageWarehouseRoofPanel(panel, impactSpeed, hitX, hitY) {
  if (!panel || panel.broken) return;
  let damage = Math.max(3, (impactSpeed - 7) * 1.65);
  if (ball && (ball.isSkyComet || ball.isSineFloat || ball.isUltimate)) damage += 16;
  panel.hp = Math.max(0, panel.hp - damage);
  if (panel.hp <= 0) {
    panel.broken = true;
    for (let i=0;i<9;i++) warehouseRoofDebris.push({x:hitX+(Math.random()-.5)*18,y:hitY,vx:(Math.random()-.5)*7,vy:-2-Math.random()*6,rot:Math.random()*6.28,vr:(Math.random()-.5)*.35,life:38+Math.random()*22,maxLife:60});
    playSound('roof_break'); if(typeof venueSfx==='function')venueSfx('roof_break');
    triggerScreenShake(5, 7);
    if (typeof awardWarehouseRoofBreakAchievement === 'function' && ball && ball.lastHitter) awardWarehouseRoofBreakAchievement(ball.lastHitter);
  } else {
    playSound('block_roof');
  }
}
resetWarehouseRoofState();

function resetMatchState() {
  resetWarehouseRoofState();
  
  score.player = 0; score.enemy = 0;
  scoreDisplay.innerText = '0 : 0';
  match.leftHits = 0; match.rightHits = 0;
  match.isBlockedBack = false;
  timeSlowTimer = 0; chronoAnimTimer = 0; hitStopFrames = 0;
  
  proMatchStats = {
    user: { totalSpikes: 0, spikeKills: 0, toolOutKills: 0, serviceAces: 0, maxSpeed: 0, totalReceives: 0, perfectAbsorbs: 0, normalBumps: 0, deflects: 0, coverSaves: 0, totalBlocks: 0, roofKills: 0 },
    mate: { totalSpikes: 0, spikeKills: 0, toolOutKills: 0, serviceAces: 0, maxSpeed: 0, totalReceives: 0, perfectAbsorbs: 0, normalBumps: 0, deflects: 0, coverSaves: 0, totalBlocks: 0, roofKills: 0 },
    enemyFront: { totalSpikes: 0, spikeKills: 0, toolOutKills: 0, serviceAces: 0, maxSpeed: 0, totalReceives: 0, perfectAbsorbs: 0, normalBumps: 0, deflects: 0, coverSaves: 0, totalBlocks: 0, roofKills: 0 },
    enemyBack: { totalSpikes: 0, spikeKills: 0, toolOutKills: 0, serviceAces: 0, maxSpeed: 0, totalReceives: 0, perfectAbsorbs: 0, normalBumps: 0, deflects: 0, coverSaves: 0, totalBlocks: 0, roofKills: 0 }
  };

  allPlayers.forEach(p => {
    p.energy = 0;
    p.jumpExhaustion = 1.0;
    p.depressedRallies = 0;
    p.excitedRallies = 0;
    p.roarMoodRallies = 0;
    p.mudDebuffTimer = 0;
    p.mudDebuffRallies = 0;
    p.softWallRallies = 0;
    p.godspeedCharges = 0;
    p.greaseDebuffRallies = 0;
    p._birdKillsThisMatch = 0;
    p.hasPlayedFullSound = false;
    p.forceGrounded();
  });
  updateSideUltHUD();
}

function updateSideUltHUD() {
  const p1Actor = allPlayers[NET.mySlot] || userPlayer;
  const p2Actor = allPlayers[NET.mateSlot] || mateAI;

  if (p1Actor && p1Actor.stats && p1Actor.stats.skill) {
    const uSk = p1Actor.stats.skill;
    const uRatio = Math.min(1.0, p1Actor.energy / uSk.cost);
    userUltFill.style.width = (uRatio * 100) + '%';
    userUltText.innerText = `P1 ${Math.floor(uRatio * 100)}%`;

    if (uRatio >= 1.0) {
      userUltFill.style.background = 'linear-gradient(180deg, #fef08a 0%, #f59e0b 60%, #b45309 100%)';
      mainPillarFrame.style.borderColor = '#facc15';
      mainPillarFrame.style.boxShadow = '0 0 15px rgba(250, 204, 21, 0.8)';
    } else {
      userUltFill.style.background = 'linear-gradient(180deg, #ef4444 0%, #b91c1c 65%, #4c0519 100%)';
      mainPillarFrame.style.borderColor = '#cbd5e1';
      mainPillarFrame.style.boxShadow = 'inset 0 0 4px #000';
    }
  }

  if (p2Actor && p2Actor.stats && p2Actor.stats.skill) {
    const mSk = p2Actor.stats.skill;
    const mRatio = Math.min(1.0, p2Actor.energy / mSk.cost);
    mateUltFill.style.width = (mRatio * 100) + '%';
    mateUltText.innerText = `P2 ${Math.floor(mRatio * 100)}%`;

    if (mRatio >= 1.0) {
      mateUltFill.style.background = 'linear-gradient(180deg, #a7f3d0 0%, #10b981 60%, #064e3b 100%)';
      subPillarFrame.style.borderColor = '#34d399';
      subPillarFrame.style.boxShadow = '0 0 15px rgba(52, 211, 153, 0.8)';
    } else {
      mateUltFill.style.background = 'linear-gradient(180deg, #38bdf8 0%, #1d4ed8 70%, #0f172a 100%)';
      subPillarFrame.style.borderColor = '#94a3b8';
      subPillarFrame.style.boxShadow = 'inset 0 0 4px #000';
    }
  }
}

const ball = {
  x: WORLD.LEFT - 100, y: WORLD.FLOOR_Y - 40, vx: 0, vy: 0, radius: 13, rotation: 0,
  isSpiked: false, isPerfectSpike: false, isFloat: false, isTacticalThrust: false, attackStyle: null,
  isBrokenSpike: false, isUltimate: false, isTopspin: false, topspinRating: 0.5, armorPiercing: 0, lastHitter: null,
  // V19: rally responsibility context. Physics contacts may change lastHitter; scoring attribution must not guess from it.
  lastAttackHitter: null, serveOriginServer: null, pointContext: null,
  opacity: 1.0, activeSkillTag: '', isSineFloat: false, sineTargetX: null, sineStartX: null, sineElapsed: 0, sineDuration: 0, sineAmplitude: 0, sineCycles: 0, isSkyComet: false, isPhantomDrop: false, glowColor: null,
  isBungeeGum: false, bungeeTetherFrames: 0, bungeeTetherSlot: null, isGravityDrop: false, gravityDropTargetX: null, gravityDropTriggered: false, greaseCharges: 0, greaseSourceIsLeft: null, phantomRestoreFrames: 0, phantomWipeSourceIsLeft: null, kineticTrailFrames: 0, kineticIntensity: 0, kineticSourceIsLeft: null, mudContaminationAvailable: false, mudCharges: 0, mudSourceIsLeft: null, breakerSourceIsLeft: null, breakerImpactDone: false, breakerTrailFrames: 0, skySourceIsLeft: null, skyImpactDone: false, skyImpactFadeFrames: 0, skySonicSpawn: 0, softWallGlowFrames: 0, softWallGlowSideIsLeft: null, steepexecCutAvailable: false, hasTossedFromGodspeed: false, skillOutcomeSfxPlayed: {},
  phantomGhostFrames: 0, timeLagFrames: 0, timeLagStoredVx: 0, timeLagStoredVy: 0, ironWallBounceFrames: 0, deepWaterActive: false, stormTrailFrames: 0,
  floatPhase: 0, floatDrift: 0, ufoNeutralRelease: false,

  resetForServe(winnerSide) {
    serveState.active = true; serveState.tossed = false; serveState.charging = false; serveState.chargePower = 0; resetServeRuleClock();
    this.isSpiked = false; this.isPerfectSpike = false; this.isFloat = false; this.isTacticalThrust = false; this.attackStyle = null;
    this.isBrokenSpike = false; this.isUltimate = false; this.isTopspin = false; this.topspinRating = 0.5;
    this.armorPiercing = 0; this.lastHitter = null; this.lastAttackHitter = null; this.venueNeutralLive = false; this.serveOriginServer = null; this.pointContext = null;
    // V75-3.7: attack-audit identity belongs to one rally only. A fresh serve must never inherit the previous attack chain.
    this._aiAttackIntentId = null; this._aiAttackIntentFrame = null; this._aiAttackIntentStyle = null; this._aiAttackSourceSlot = null;
    this.opacity = 1.0; this.activeSkillTag = ''; this.isSineFloat = false; this.sineTargetX = null; this.sineStartX = null; this.sineElapsed = 0; this.sineDuration = 0; this.sineAmplitude = 0; this.sineCycles = 0; this.isSkyComet = false; this.isPhantomDrop = false; this.glowColor = null;
    this.isBungeeGum = false; this.bungeeTetherFrames = 0; this.bungeeTetherSlot = null; this.isGravityDrop = false; this.gravityDropTargetX = null; this.gravityDropTriggered = false; this.greaseCharges = 0; this.greaseSourceIsLeft = null; this.phantomRestoreFrames = 0; this.phantomWipeSourceIsLeft = null; this.kineticTrailFrames = 0; this.kineticIntensity = 0; this.kineticSourceIsLeft = null; this.mudContaminationAvailable = false; this.mudCharges = 0; this.mudSourceIsLeft = null; this.breakerSourceIsLeft = null; this.breakerImpactDone = false; this.breakerTrailFrames = 0; this.skySourceIsLeft = null; this.skyImpactDone = false; this.skyImpactFadeFrames = 0; this.skySonicSpawn = 0; this.softWallGlowFrames = 0; this.softWallGlowSideIsLeft = null; this.steepexecCutAvailable = false; this.hasTossedFromGodspeed = false; this.skillOutcomeSfxPlayed = {};
    this.phantomGhostFrames = 0; this.timeLagFrames = 0; this.timeLagStoredVx = 0; this.timeLagStoredVy = 0; this.ironWallBounceFrames = 0; this.deepWaterActive=false; this.stormTrailFrames=0;
    this.floatPhase = 0; this.floatDrift = 0; this.ufoNeutralRelease = false;
    this.vx = 0; this.vy = 0; match.leftHits = 0; match.rightHits = 0; match.isBlockedBack = false;
    // V75-3.7: clear stale second-attack plans at rally boundary. Serve legality is defined by serve state, not by hit count.
    allPlayers.forEach(p => { p._secondAttackEpoch = null; p._secondAttackCommit = false; p._secondAttackPlan = null; p._thirdAttackPlan = null; p._aiBlockPlan = null; p._lastTouchPossessionOrigin = null; });
    match.inServeRally = true;
    match.serveAceEligible = true;
    match.serveReceiverTouches = 0;
    timeSlowTimer = 0; chronoAnimTimer = 0; hitStopFrames = 0; if(cinematicDuckActive) setCinematicDuck(false);
    pendingCoinReward = 0; pendingCoinReason = '';

    const servingTeam = (winnerSide === 'LEFT') ? 'player' : 'enemy';
    if (servingTeam !== match.currentServingTeam) {
      match.currentServingTeam = servingTeam;
      if (servingTeam === 'player') match.playerServerIdx = (match.playerServerIdx + 1) % 2;
      else match.enemyServerIdx = (match.enemyServerIdx + 1) % 2;
    }

    setTimeout(() => { if (!isPaused && !isSettlementOpen && isGameStarted) playWhistle(false); }, 200);

    if (match.currentServingTeam === 'player') {
      serveState.currentServer = (match.playerServerIdx === 0) ? userPlayer : mateAI;
      userPlayer.forceGrounded(serveState.currentServer === userPlayer ? WORLD.LEFT - 100 : WORLD.LEFT + 180);
      mateAI.forceGrounded(serveState.currentServer === mateAI ? WORLD.LEFT - 100 : WORLD.LEFT + 320);
      enemyA.forceGrounded(WORLD.RIGHT - 320); enemyB.forceGrounded(WORLD.RIGHT - 180);
      this.x = serveState.currentServer.x + 15; this.y = ((typeof venueFloorYAt==='function') ? venueFloorYAt(this.x) : WORLD.FLOOR_Y) - 35;
    } else {
      serveState.currentServer = (match.enemyServerIdx === 0) ? enemyB : enemyA;
      userPlayer.forceGrounded(WORLD.LEFT + 180); mateAI.forceGrounded(WORLD.LEFT + 320);
      enemyA.forceGrounded(serveState.currentServer === enemyA ? WORLD.RIGHT + 100 : WORLD.RIGHT - 320);
      enemyB.forceGrounded(serveState.currentServer === enemyB ? WORLD.RIGHT + 100 : WORLD.RIGHT - 180);
      this.x = serveState.currentServer.x - 15; this.y = ((typeof venueFloorYAt==='function') ? venueFloorYAt(this.x) : WORLD.FLOOR_Y) - 35;
    }

    const myPlayer = allPlayers[NET.mySlot] || userPlayer;
    if (serveState.currentServer === myPlayer) {
      statusSubtext.innerText = '★ 我方發球：長按 [K] 高拋 ➔ [W+J] 跳發或 [W+L] 跳飄！';
    } else if (serveState.currentServer.isLeft === myPlayer.isLeft) {
      statusSubtext.innerText = `★ 隊友 (${serveState.currentServer.name}) 發球中...`;
    } else {
      statusSubtext.innerText = `▲ 敵方 (${serveState.currentServer.name}) 發球中...`;
    }

    const isHumanServer = (typeof isSlotHumanControlled === 'function')
      ? isSlotHumanControlled(serveState.currentServer)
      : serveState.currentServer.isLocallyControlled;

    serveState.aiServeTimer = !isHumanServer ? 75 : 0;
// 🌟🌟🌟 就貼在這裡！房主決定發球員後，立刻發封包通知訪客「換誰發球」
    if (typeof NET !== 'undefined' && NET.isMultiplayer && NET.isHost && NET.conn && NET.conn.open) {
      NET.conn.send({
        type: 'SERVE_START_SYNC',
        serverSlot: serveState.currentServer.slotIndex,
        servingTeam: match.currentServingTeam
      });
    }
  }
};

const serveState = { active: true, currentServer: userPlayer, tossed: false, charging: false, chargePower: 0, aiServeTimer: 0, ruleFramesRemaining: 480, ruleGraceFrames: 12, ruleLastBeep: 4 };

// V74-1: official-style 8-second serve clock. The 0.2s grace aligns the clock with the delayed whistle.
function resetServeRuleClock(){ serveState.ruleFramesRemaining = 480; serveState.ruleGraceFrames = 12; serveState.ruleLastBeep=4; }
function updateServeRuleClock(){
  if (!serveState.active || banner.active || isSettlementOpen) return;
  if (serveState.ruleGraceFrames > 0) { serveState.ruleGraceFrames--; return; }
  if (serveState.ruleFramesRemaining > 0) serveState.ruleFramesRemaining--;
  const sec=Math.max(0,Math.ceil(serveState.ruleFramesRemaining/60));
  if(sec<=3 && sec>=1 && sec!==serveState.ruleLastBeep){ serveState.ruleLastBeep=sec; playSound('serve_count_beep'); }
  if (serveState.ruleFramesRemaining <= 0) {
    if(serveState.ruleLastBeep!==0){serveState.ruleLastBeep=0;playSound('serve_zero_beep');}
    const s=serveState.currentServer; if(!s) return;
    serveState.ruleFramesRemaining=0;
    triggerFault(s.isLeft ? 'RIGHT' : 'LEFT', '8 SECOND FAULT!!', '發球員超過 8 秒未將球發出');
    serveState.active=false;
  }
}
const match = { currentServingTeam: 'player', playerServerIdx: 0, enemyServerIdx: 0, leftHits: 0, rightHits: 0, lastTouchFrame: -100, isBlockedBack: false, inServeRally: true, serveAceEligible: true, serveReceiverTouches: 0, assistCandidate: null, assistAttackActor: null };

// V76-3.7 CALLOUT HIERARCHY: the game can stay expressive without every message shouting at 24px/900.
const CALLOUT_STYLE_PRESETS = {
  speech_court:   { priority:34, lane:'speech',   font:'850 20px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', alpha:.92, stroke:3.0, life:78, rise:.24, xOffset:28, yOffset:2 },
  speech_emotion: { priority:30, lane:'speech',   font:'800 19px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', alpha:.88, stroke:2.8, life:82, rise:.22, xOffset:28, yOffset:6 },
  feedback:       { priority:55, lane:'primary',  font:'850 19px -apple-system, sans-serif',        alpha:.90, stroke:3.0, life:38, rise:.48, xOffset:0,  yOffset:0 },
  reward:         { priority:22, lane:'reward',   font:'750 14px -apple-system, sans-serif',        alpha:.66, stroke:2.0, life:44, rise:.28, xOffset:24, yOffset:16 },
  skill:          { priority:78, lane:'primary',  font:'900 22px -apple-system, sans-serif',        alpha:.96, stroke:3.8, life:48, rise:.50, xOffset:0,  yOffset:0 },
  major:          { priority:90, lane:'primary',  font:'950 26px -apple-system, sans-serif',        alpha:1.00, stroke:4.5, life:42, rise:.54, xOffset:0,  yOffset:-3 },
  fault:          { priority:84, lane:'primary',  font:'900 21px -apple-system, sans-serif',        alpha:.96, stroke:3.8, life:46, rise:.44, xOffset:0,  yOffset:0 },
  trainer:        { priority:96, lane:'trainer',  font:'900 16px -apple-system, sans-serif',        alpha:.92, stroke:2.7, life:34, rise:.24, xOffset:40, yOffset:0 },
  ambient:        { priority:18, lane:'ambient',  font:'800 17px -apple-system, sans-serif',        alpha:.72, stroke:2.5, life:50, rise:.34, xOffset:0,  yOffset:0 }
};

function inferCalloutType(text='') {
  const t=String(text).trim();
  if (/^(ONE TOUCH!?|OUT!|Inside!|INSIDE!|CHANCE!|NICE!|COVER!|LINE!|CROSS!|SHORT!|BACK!|MINE!|我來！)$/i.test(t)) return 'speech_court';
  if (/^(接不到！|來不及了！|啊！|糟了！|太遠了！|X！)$/.test(t)) return 'speech_emotion';
  if (/能量|ENERGY/i.test(t)) return 'reward';
  if (/FAULT|OUT BALL/i.test(t)) return 'fault';
  if (/MONSTER BLOCK|ROOF BLOCK|PERFECT JUMP SERVE|MAX MOMENTUM SERVE|SUPER DIVE SAVE/i.test(t)) return 'major';
  if (/CHRONO|GODSPEED|IRON WALL|SKY COMET|SOLAR SINE|ROLLING THUNDER|SAVAGE ROAR|SOFT WALL|PHANTOM|MUD |幽靈吊球|伸縮自在|銅牆鐵壁|動能反噬|引力柔網|暴風反彈|心流化勁|野蠻怒吼|天際墜石|落日正弦|油滑沾染|神速二傳/.test(t)) return 'skill';
  if (/DEEP SPIKE|PERFECT SPIKE|STEEP CUT|SAFE PUSH|PUSH DEEP|TOOL OUT|SOFT ROLL|DEFLECT|BROKEN|THROUGH BLOCK|FLOAT SERVE|STANDING SERVE/i.test(t)) return 'feedback';
  return 'feedback';
}

// 🌟 pushCallout：若為房主，廣播給訪客同步繪製。meta 僅控制呈現，不碰任何 gameplay。
function pushCallout(x, y, text, color = '#facc15', netEventId = null, meta = null) {
  const inferredType = (meta && meta.type) || inferCalloutType(text);
  const preset = CALLOUT_STYLE_PRESETS[inferredType] || CALLOUT_STYLE_PRESETS.feedback;
  const style = Object.assign({}, preset, meta || {});
  const priority = Number.isFinite(style.priority) ? style.priority : preset.priority;
  const lane = style.lane || preset.lane || 'primary';
  const outward = (typeof WORLD!=='undefined' && Number.isFinite(WORLD.NET_X)) ? (x < WORLD.NET_X ? -1 : 1) : 1;
  const baseY = y - 28 + (style.yOffset || 0);
  const drawX = x + outward * (style.xOffset || 0);

  // Identical callouts in the same tiny window are presentation duplicates, not extra gameplay events.
  const dup = calloutPopups.some(p => p.timer > Math.max(16,(p.maxTimer||45)*.72) && p.text===text && Math.abs(p.anchorX-x)<80 && Math.abs(p.baseY-baseY)<90);
  if (dup) return;

  // One voice at a time. Primary feedback may replace a lower-priority primary instead of stacking another billboard.
  const sameLane = calloutPopups.filter(p => p.timer > 10 && p.lane===lane && Math.abs(p.anchorX-x)<105 && Math.abs(p.baseY-baseY)<125);
  if (lane==='speech') {
    // V76-3.7.1: speech must stay readable. Cross-fade the previous line instead of deleting it almost instantly.
    sameLane.forEach(p => { p.timer = Math.min(p.timer, 18); p.maxAlpha = Math.min(Number(p.maxAlpha||1), .58); });
  } else if (lane==='trainer') {
    sameLane.forEach(p => { p.timer = Math.min(p.timer, 9); });
  } else if (lane==='primary') {
    sameLane.forEach(p => { if(priority >= (p.priority||0)) p.timer=Math.min(p.timer,10); });
  }

  // Keep secondary/reward information, but make it occupy a quieter lane instead of climbing into a 4-line stack.
  const lanePeers = calloutPopups.filter(p => p.timer > 16 && p.lane===lane && Math.abs(p.anchorX-x)<120).length;
  const laneStep = lane==='reward' ? 16 : (lane==='speech' ? 14 : 22);
  const stack = Math.min(lanePeers, lane==='primary'?1:2);
  const life = Math.max(18, Number(style.life)||45);
  calloutPopups.push({
    x:drawX, anchorX:x, baseY, y:baseY-stack*laneStep, text, color, type:inferredType, lane, priority,
    timer:life, maxTimer:life, font:style.font||preset.font, maxAlpha:Number(style.alpha ?? preset.alpha ?? 1),
    strokeWidth:Number(style.stroke ?? preset.stroke ?? 3), rise:Number(style.rise ?? preset.rise ?? .5),
    pulse:inferredType==='major'
  });
  if (typeof NET !== 'undefined' && NET.isMultiplayer && NET.isHost && NET.conn && NET.conn.open) {
    const eventId=netEventId||`callout:${gameFrame}:${Math.round(x)}:${text}`;
    try{NET.conn.send({ type: 'CALLOUT_SYNC', x, y, text, color, eventId, calloutMeta:{type:inferredType,priority,lane} });}catch(e){}
  }
}
// 🌟 漫畫播報同步廣播給訪客
function broadcastMangaShout(speaker, text, sub = '', color = '#facc15') {
  if (typeof triggerMangaShout === 'function') {
    triggerMangaShout(speaker, text, sub, color);
  }
  if (typeof NET !== 'undefined' && NET.isMultiplayer && NET.isHost && NET.conn && NET.conn.open) {
    NET.conn.send({ type: 'MANGA_SHOUT_SYNC', speaker, text, sub, color });
  }
}


function triggerCoinPopup(x, y, amount) {
  playSound('coin');
  // V60: 同一位置短時間多筆金幣合併顯示，避免 +1/+2/+3 疊成一坨。
  const existing = coinPopups.find(p => p.timer > 22 && Math.abs(p.x-x)<100 && Math.abs(p.y-(y-35))<100);
  if(existing){ existing.amount += amount; existing.timer=50; existing.maxTimer=50; existing.y=Math.min(existing.y,y-35); }
  else coinPopups.push({ x, y: y - 35, amount, timer: 50, maxTimer: 50 });
}
function triggerHalo(player, color, isTimingThreeState = false) {
  if (!player) return;
  haloEffects.push({
    player, color, r: player.radius * 0.8,
    maxR: player.radius * (isTimingThreeState ? 2.4 : 1.8),
    alpha: 1.0, isTimingThreeState, life: isTimingThreeState ? 20 : 16, maxLife: isTimingThreeState ? 20 : 16
  });

  if (typeof NET !== 'undefined' && NET.isMultiplayer && NET.isHost && NET.conn && NET.conn.open) {
    NET.conn.send({
      type: 'HALO_SYNC',
      slotIndex: player.slotIndex,
      color: color,
      isTimingThreeState: isTimingThreeState
    });
  }
}

function receiveEnergyReward(player, ballSpeed, isPerfect){
  const opponent=player._receiveIncomingOpponent===true;
  const neutral=player._receiveIncomingNeutral===true;
  const dive=!!player.isDiving;
  // 己方組織球不能再靠 K/L Perfect 農能量；場地中立球給少量基本回饋。
  if(!opponent){
    if(neutral) return isPerfect ? (dive?5:7) : (dive?3:4);
    return isPerfect ? (dive?2:3) : (dive?1:2);
  }
  // 區間制而非線性：低階慢球不肥，高強度來球才提高漂亮防守的回饋，且最高 Tier 封頂。
  const tier=ballSpeed<10?0:ballSpeed<17?1:ballSpeed<24?2:3;
  const kPerfect=[8,14,22,28], kNormal=[4,7,11,14];
  const lPerfect=[5,8,12,16], lNormal=[3,5,7,9];
  return dive ? (isPerfect?lPerfect[tier]:lNormal[tier]) : (isPerfect?kPerfect[tier]:kNormal[tier]);
}

function executePlayerTimingReceive(player, isCover = false, receiveSource = 'K') {
  if (ball.isIronWallSlam) return;
  // V74-21 Phantom Wipe: a receive/dive can commit to the decoy. The fake reacts, but never enters volleyball rules.
  if (typeof phantomDecoys !== 'undefined' && phantomDecoys.length) {
    const py=player.y-player.radius;
    let best=null,bestDist=Infinity;
    for(const d of phantomDecoys){if(d.fade>0||d.sourceIsLeft===player.isLeft)continue;const dd=Math.hypot(player.x-d.x,py-d.y);if(dd<bestDist){best=d;bestDist=dd;}}
    const realDist=Math.hypot(player.x-ball.x,py-ball.y);
    if(best && bestDist<76 && (realDist>76 || bestDist<realDist)){best.fade=12;visualEffects.push({type:'phantom_dissolve',x:best.x,y:best.y,life:14,maxLife:14});playSound('bump');pushCallout(player.x,player.y-45,'PHANTOM!!','#a78bfa');return;}
  } // 🌟 必殺下釘不可接起
  if (isNaN(ball.x) || isNaN(ball.y)) return;
  if (isNaN(ball.x) || isNaN(ball.y)) return;
  const shoulderX = player.x, shoulderY = player.y - player.radius;
  const dist = Math.hypot(shoulderX - ball.x, shoulderY - ball.y);
  let ballSpeed = Math.hypot(ball.vx, ball.vy);

  let extraDefPenalty = 0;
  if (ball.isSkyComet) extraDefPenalty += 20.0; 
  // V27 落日正弦的難度來自誇張滯空/漂移，不再靠隱形 Pressure 懲罰接球。
  if (ball.isPhantomDrop) extraDefPenalty += 16.0; 
  if (player.greaseDebuffRallies > 0) { playSkillAsset('SFX/skills/油滑脫手.wav',1.0); }

// 🌟 修正：因為 recordTouch 剛把 lastHitter 改成自己，所以只要前一擊或不是自接，就是對手的來球！
  const isOpponentBall = player._receiveIncomingOpponent === true;

  // V74-18 CHRONO RELIABLE RELEASE:
  // executePlayerTimingReceive() is only entered after an actual recorded ball touch.
  // Do NOT depend on _receiveIncomingOpponent here: recordTouch()/cover/AI paths can refresh
  // that transient flag in different orders, which made first-pass release intermittent.
  // During Chrono, side ownership is authoritative: the first receive touch by the victim
  // team ends gameplay slow-time immediately; visuals still feather out separately.
  const chronoVictimReceive = timeSlowTimer > 0 &&
    ((chronoCasterSide === 'player' && !player.isLeft) || (chronoCasterSide === 'enemy' && player.isLeft));
  if (chronoVictimReceive) releaseChronoBulletTime('first-receive');

  if(ball.activeSkillTag==='深海重砲' && !ball.skillOutcomeSfxPlayed?.deep){ ball.skillOutcomeSfxPlayed=ball.skillOutcomeSfxPlayed||{}; ball.skillOutcomeSfxPlayed.deep=true; ball.deepWaterActive=false; createWaterBurst(ball.x,ball.y); playSkillAsset('SFX/skills/deep_2.wav',1.0,{start:.04}); }
  if(isOpponentBall && ball.activeSkillTag==='時流差' && !ball.skillOutcomeSfxPlayed?.timeBurst){ ball.skillOutcomeSfxPlayed=ball.skillOutcomeSfxPlayed||{}; ball.skillOutcomeSfxPlayed.timeBurst=true; createTimeBurst(ball.x,ball.y); triggerScreenShake(7,8); }
  if (isOpponentBall && ball.activeSkillTag === '斷頭台下釘' && ball.steepexecCutAvailable) {
    ball.steepexecCutAvailable = false;
    visualEffects.push({type:'blade_slash',x:ball.x,y:ball.y,angle:-0.62,life:14,maxLife:14,scale:1.28});
    playSkillAsset('SFX/skills/steepexec_receive.wav',1.0,{start:.02});
    triggerScreenShake(8,9);
  }

  // V74-21 Greased Ball: only a TARGET-SIDE first-pass style receive bursts the oil membrane.
  // Blocks never consume it; a block-back received by the caster side is explicitly ignored.
  if (ball.greaseCharges > 0 && ball.greaseSourceIsLeft !== null && player.isLeft !== ball.greaseSourceIsLeft) {
    triggerGreaseBurst(ball.x, ball.y, ball.greaseSourceIsLeft);
  }

  // V74-19 Mud contamination is handled centrally by processSkillContactPayload().


let baseDef = player.stats.defense;
  // V75-1 airborne cover is legal but less controlled than a planted K receive.
  // This avoids the old all-or-nothing 'airborne receive forbidden' fix while preventing machine-perfect midair covers.
  if (receiveSource === 'AIR_COVER') baseDef *= 0.82;
  const pPerks = (player.stats && player.stats.perks) ? player.stats.perks : {};
  const diveRatio = Math.min(0.85, 0.70 + (pPerks.diveDefBuff || 0));
  if (player.isDiving) baseDef *= diveRatio;

  const greaseDefMult = player.greaseDebuffRallies > 0 ? 0.75 : 1.0;
  const effectiveDef = Math.max(0, (baseDef * greaseDefMult) - extraDefPenalty);
  proMatchStats[player.slotKey].totalReceives++;

// 🌟 只有「站立接球 (K 鍵)」且「對方打過來的球」才計算震退，L 魚躍 (isDiving) 嚴格排除！
  if (!player.isDiving && isOpponentBall) {
    // 🌟 跳發暴扣額外帶有下墜衝擊力，彌補長途飛行造成的球速衰減
    let extraServePressure = (ball.isSpiked && match.inServeRally) ? 3.5 : 0;
    const pressure = Math.max(0, (ballSpeed * 1.15 + extraServePressure) - effectiveDef);
    
    // 🌟 門檻由 2.5 下調至 0.5，讓有助跑的優質重扣與跳發能穩定打出震退！
    if (pressure > 0.5) {
      const kbReduction = (typeof player.hasKnockbackResist !== 'undefined' && player.hasKnockbackResist) ? 0.75 : 1.0;
      const pushDir = ball.vx > 0 ? 1 : -1;
      
      // 初速度與硬直時間隨壓迫值平滑漸進 (微震退 ~ 大震退)
      player.vx = pushDir * Math.min(7.5, 2.5 + pressure * 0.5) * kbReduction;
      player.stunTimer = Math.floor(Math.min(50, 24 + pressure * 3.0) * kbReduction);

      createImpactSparks(player.x, WORLD.FLOOR_Y, 6, '#f97316');
      triggerScreenShake(3, 4);
    }
  }

  if (isCover) {
    proMatchStats[player.slotKey].coverSaves++;
    player.addEnergy(15);
    pushCallout(player.x, player.y - 45, 'COVER +15 能量!', '#38bdf8');
  }

  const isShockReturn = (player.stats.skill.id === 'sk_shock_return') && player.consumeSkill('DEF_SAVE');
  if (isShockReturn) {
    triggerScreenShake(12, 12);
    createStormBurst(ball.x, ball.y);
    createImpactSparks(ball.x, ball.y, 18, '#bae6fd');
    pushCallout(player.x, player.y - player.radius * 2, '暴風反彈 (SHOCK RETURN)!!', '#0ea5e9');

    // V27: 真正以落點反解彈道；落點限制在對方場內約1m~9m區間（半場10%~90%）。
    const halfSpan = WORLD.RIGHT - WORLD.NET_X;
    const targetX = player.isLeft
      ? WORLD.NET_X + halfSpan * (0.10 + Math.random() * 0.80)
      : WORLD.NET_X - halfSpan * (0.10 + Math.random() * 0.80);
    // V28: 暴風反彈不是固定高度。成功接住後高倍率放大 incoming speed；
    // 普通球也有明顯最低升空，真正重砲則會被炸到很高，再由 solver 落回合法場區。
    const incomingSpeed = Math.max(0, ballSpeed);
    const launchUpSpeed = Math.min(32.0, Math.max(18.5, 10.0 + incomingSpeed * 0.82));
    const effGravity = WORLD.GRAVITY * 0.72, reqVy = -launchUpSpeed;
    const targetY = WORLD.FLOOR_Y - ball.radius;
    const dyTarget = targetY - ball.y;
    const flightT = (-reqVy + Math.sqrt(Math.max(1, reqVy * reqVy + 2 * effGravity * dyTarget))) / effGravity;
    ball.vx = (targetX - ball.x) / Math.max(1, flightT); ball.vy = reqVy;
    ball.isSpiked = true; ball.isUltimate = true; ball.armorPiercing = 8.0; ball.glowColor = '#0ea5e9'; ball.stormTrailFrames = 30;
    ball.lastHitter = player;
    match.isBlockedBack = false;
    return;
  }

  // V74-13 Solar Sine resolves on the FIRST opponent receive: photon burst, then restore a normal readable ball.
  if (isOpponentBall && ball.activeSkillTag === '落日正弦' && !ball.skillOutcomeSfxPlayed?.solarResolved) {
    ball.skillOutcomeSfxPlayed = ball.skillOutcomeSfxPlayed || {}; ball.skillOutcomeSfxPlayed.solarResolved = true;
    visualEffects.push({type:'solar_burst',x:ball.x,y:ball.y,life:18,maxLife:18});
    ball.activeSkillTag = ''; ball.glowColor = null; ball.isSineFloat = false; ball.isFloat = false; ball.sineTargetX = null;
  }

  if (ball.isBungeeGum) {
    playSkillAsset('SFX/skills/bungee_2.wav',1.0);
    // V74-13: receiver stays visually tethered to the gum shell for a short, capped stretch.
    ball.bungeeTetherFrames = 26; ball.bungeeTetherSlot = player.slotKey;
    ball.vx = (player.isLeft ? 1 : -1) * 2.5;
    ball.vy = -4.6;
    ball.isSpiked = false; ball.isPerfectSpike = false; ball.isBungeeGum = false;
    pushCallout(player.x, player.y - player.radius * 2, '黏稠軟墜 (BUNGEE)!!', '#f472b6');
    match.isBlockedBack = false;
    return;
  }

  // V29 心流化勁：不是買一顆 Perfect。首次成功進入接球流程時啟動，維持本 Rally + 後續2 Rally。
  const flowCanActivate = player.stats.skill.id === 'sk_flow_absorb' && player.flowAbsorbRallies <= 0 && player.energy >= player.stats.skill.cost;
  if (flowCanActivate && player.consumeSkill('DEF_SAVE')) {
    playSkillAsset('SFX/skills/flow_1.wav',.45); const _f2=setTimeout(()=>playSkillAsset('SFX/skills/flow_2.wav',.45),420);
    player.flowAbsorbRallies = 3;
    pushCallout(player.x, player.y - player.radius * 2 - 28, '心流化勁・3 RALLY!!', '#14b8a6');
  }
  const flowActive = player.stats.skill.id === 'sk_flow_absorb' && player.flowAbsorbRallies > 0;
  const flowPerfect = flowActive && (!player.isDiving || Math.random() < 0.70);
  if(flowActive && !flowCanActivate && isOpponentBall) playSkillAsset('SFX/skills/flow_1.wav',.42);

  if ((dist < player.stats.sweetWindow && extraDefPenalty < 15.0) || flowPerfect) {
    playSound('pia'); triggerHalo(player, '#10b981', true);
createImpactSparks(ball.x, ball.y, 16, '#10b981');
    distributeCoins(player, 1, 'PERFECT ABSORB', player.x, player.y - player.radius * 2);
    pushCallout(player.x, player.y - player.radius * 2 - 15, 'PERFECT ABSORB!!', '#10b981');

if (!player.isDiving && isOpponentBall) {
      // 只要對面球速超過 16.0，即使完美吸震也享有真實後座力位移
      if (ballSpeed > 16.0) {
        const kbReduction = (typeof player.hasKnockbackResist !== 'undefined' && player.hasKnockbackResist) ? 0.75 : 1.0;
        const pushDir = -player.facing; // 朝身後方向倒退
        
        // 完美吸震受力較穩：後退初速 3.0 ~ 5.5 px/f，硬直僅 18 ~ 26 幀 (約 0.3~0.4 秒)
        const perfPressure = (ballSpeed - 16.0) * 0.45;
        player.vx = pushDir * Math.min(5.5, 2.5 + perfPressure) * kbReduction;
        player.stunTimer = Math.floor(Math.min(26, 18 + perfPressure * 1.5) * kbReduction);

        createImpactSparks(player.x, WORLD.FLOOR_Y, 8, '#10b981'); // 腳底噴發綠色卸力摩擦火花
        triggerScreenShake(3, 4); // 扎實手感震顫
      }
    }

// 🌟 接球高潮閾值：球速必須突破 25 且通過機率檢定，才算神級吸震
    if (typeof triggerMangaShout === 'function' && ballSpeed > 25.0 && Math.random() < 0.5) {
      triggerMangaShout(player.playerName, `${player.playerName} 完美卸力接起！！`, '神級一傳吸震！反擊機會來了！', '#10b981');
    }

    player.jumpExhaustion = 1.0; player.depressedRallies = 0; player.addEnergy(receiveEnergyReward(player, ballSpeed, true));    proMatchStats[player.slotKey].perfectAbsorbs++;
    if(receiveSource==='K' && getCurrentVenue().id==='moon' && venueIncidentState.active==='GRAVITY_ANOMALY') awardAchievementForActor(player,'ach_moon_perfect');

    const finalTargetX = player.isLeft ? (WORLD.NET_X - 120) : (WORLD.NET_X + 120);
    const targetVy = -14.2;
    const timeInAir = (2 * Math.abs(targetVy)) / (WORLD.GRAVITY * 0.72);
    ball.vx = (finalTargetX - ball.x) / timeInAir; ball.vy = targetVy;
    ball.isSpiked = false; ball.isPerfectSpike = false; ball.isFloat = false; ball.isTacticalThrust = false;
    ball.isBrokenSpike = false; ball.isUltimate = false; ball.isTopspin = false; ball.armorPiercing = 0;
    ball.opacity = 1.0; ball.isSineFloat = false; ball.sineTargetX = null; ball.isSkyComet = false; ball.isPhantomDrop = false; ball.glowColor = null;
    match.isBlockedBack = false;
    if (player.isLeft && !player.isLocallyControlled) pushCallout(player.x, player.y - player.radius * 2, 'CHANCE!', '#facc15');
    return;
  }

  // V5：接球執行距離與角色實際 reach 對齊。
  // AI 原本可在 reach>64 時觸發接球，但這裡只接受 64，會讓 65~reach 的合法觸球直接掉進固定 DEFLECT。
  const standingReceiveReach = Math.max(64, player.stats.reach || 64);
  // V6：Dive 的物理碰球範圍本來就是 85；接球公式也承認這次合法接觸，
  // 但 64~85 的邊緣觸球會轉成 timing/接觸品質壓力，而不是免費得到完整接球品質。
  const receiveReach = player.isDiving ? Math.max(85, standingReceiveReach) : standingReceiveReach;
  if (dist <= receiveReach) {
    const floatBonus = ball.isFloat ? 6.0 : 0;
    const diveEdgeSeverity = player.isDiving
      ? Math.max(0, (dist - standingReceiveReach) / Math.max(1, receiveReach - standingReceiveReach))
      : 0;
    let pressure = (typeof computeReceivePressureFormula==='function')
      ? computeReceivePressureFormula(player.stats, ballSpeed, floatBonus, effectiveDef)
      : Math.max(0, (ballSpeed + floatBonus) * 0.95 - effectiveDef);
    // 邊緣魚躍代表 Timing 差：增加接球偏差，但不創造固定初速。
    pressure += diveEdgeSeverity * (2.2 + Math.max(0, ballSpeed - 10) * 0.08);
    
    // V4：真正的「接爆」留給極端壓力／特殊重球。
    // 普通不完美接球不再因 pressure 稍高就 65% 直接變死亡球。
    const catastrophicPressure = Math.max(0, pressure - 10.5);
    const catastrophicChance = ball.isBrokenSpike ? 0.68
      : ball.isSkyComet ? 0.58
      : Math.min(0.42, catastrophicPressure * 0.055);
    if (catastrophicChance > 0 && Math.random() < catastrophicChance) {
      playSound('dong'); triggerHalo(player, '#ef4444', true);
      pushCallout(player.x, player.y - player.radius * 2 - 15, 'DEFLECT!', '#ef4444');
      ball.vx = (player.isLeft ? -1 : 1) * (10.0 + Math.random() * 4.0);
      ball.vy = -11.5;
      ball.isSpiked = false; ball.isPerfectSpike = false; ball.isBrokenSpike = false; ball.isTopspin = false;
      ball.opacity = 1.0; ball.isSineFloat = false; ball.sineTargetX = null; ball.isSkyComet = false; ball.isPhantomDrop = false; ball.glowColor = null;
      match.isBlockedBack = false;
      proMatchStats[player.slotKey].deflects++;
      return;
    }

    playSound('bump'); triggerHalo(player, '#f97316', true);
    player.addEnergy(receiveEnergyReward(player, ballSpeed, false));
    proMatchStats[player.slotKey].normalBumps++;

const baseTargetX = player.isLeft ? (WORLD.NET_X - 120) : (WORLD.NET_X + 120);

// V4 接噴曲線：保留高低遠近的隨機感，但把「普通偏差」和「直接噴爛」拉開。
let deflection = 0;
const forwardDir = player.isLeft ? 1 : -1;
const excessPressure = Math.max(0, pressure - 3.2);

if (excessPressure > 0) {
  // 壓力越高越可能 Overpass，但上限控制在 32%；不再固定 50% 抽死亡樂透。
  const overpassChance = Math.min(0.32, 0.06 + excessPressure * 0.028);
  const isOverpass = Math.random() < overpassChance;

  if (isOverpass) {
    const magnitude = Math.min(175, 32 + Math.pow(excessPressure, 1.22) * (5.0 + Math.random() * 5.0));
    deflection = forwardDir * magnitude;
  } else {
    // 大多數非完美一傳只是偏離二傳點，不應直接飛半個球場。
    const magnitude = Math.min(135, 24 + Math.pow(excessPressure, 1.16) * (4.0 + Math.random() * 4.5));
    deflection = (Math.random() < 0.62 ? -forwardDir : forwardDir) * magnitude;
  }
}

// 壓迫會讓弧線變差，但限制垂直速度漂移，避免每顆普通接球都變超扁或超高。
const targetVy = -13.8 + Math.min(4.2, pressure * (0.12 + Math.random() * 0.20));
const timeInAir = (2 * Math.abs(targetVy)) / (WORLD.GRAVITY * 0.72);

ball.vx = (baseTargetX + deflection - ball.x) / timeInAir; 
ball.vy = targetVy;    ball.isSpiked = false; ball.isPerfectSpike = false; ball.isFloat = false; ball.isTacticalThrust = false;
    ball.isBrokenSpike = false; ball.isUltimate = false; ball.isTopspin = false; ball.armorPiercing = 0;
    ball.opacity = 1.0; ball.isSineFloat = false; ball.sineTargetX = null; ball.isSkyComet = false; ball.isPhantomDrop = false; ball.glowColor = null;
    match.isBlockedBack = false;
    if (player === mateAI) pushCallout(mateAI.x, mateAI.y - mateAI.radius * 2, 'NICE!', '#38bdf8');
    return;
  }

  playSound('dong'); triggerHalo(player, '#ef4444', true);
  pushCallout(player.x, player.y - player.radius * 2 - 15, 'DEFLECT!', '#ef4444');
  if (player.isDiving) {
    // V6：魚躍接歪時繼承來球動能。慢球不再被固定 vx 10~15 / vy -12 憑空加速；
    // 高速重球仍然能因 Timing 差而大幅噴飛。
    const outwardDir = player.isLeft ? -1 : 1;
    const inheritedSpeed = Math.max(3.5, ballSpeed * (0.48 + Math.random() * 0.20));
    ball.vx = outwardDir * inheritedSpeed * (0.65 + Math.random() * 0.25);
    ball.vy = -Math.max(3.0, inheritedSpeed * (0.45 + Math.random() * 0.20));
  } else {
    ball.vx = (player.isLeft ? -1 : 1) * (10.0 + Math.random() * 5.0); ball.vy = -12.0;
  }
  ball.isSpiked = false; ball.isPerfectSpike = false; ball.isFloat = false; ball.isTacticalThrust = false;
  ball.isBrokenSpike = false; ball.isUltimate = false; ball.isTopspin = false; ball.armorPiercing = 0;
  ball.opacity = 1.0; ball.isSineFloat = false; ball.sineTargetX = null; ball.isSkyComet = false; ball.isPhantomDrop = false; ball.glowColor = null;
  match.isBlockedBack = false;
  proMatchStats[player.slotKey].deflects++;
}

function executeSetterPass(setter) {
  if (isNaN(ball.x) || isNaN(ball.y)) return;
  const isLeft = setter.isLeft;
  if (isLeft && !setter.isLocallyControlled) triggerHalo(setter, '#38bdf8', false);

  // V4：O 舉球不再是萬能接球鍵。仍允許任何觸球順位使用，但來球越重、接觸越勉強、
  // 越接近地面或處於 Cover，舉球誤差就越大。只使用現有 INT / technique / sweetWindow。
  const setContactDist = getDist(setter);
  const incomingSetSpeed = Math.hypot(ball.vx, ball.vy);
  const setSweet = setter.stats.sweetWindow || 34;
  const lowBallSeverity = Math.max(0, (ball.y - (WORLD.FLOOR_Y - 95)) / 55);
  let specialSetPressure = 0;
  if (ball.isBrokenSpike) specialSetPressure += 2.2;
  if (ball.isSkyComet) specialSetPressure += 1.8;
  if (ball.isSineFloat) specialSetPressure += 0.8;
  if (ball.isPhantomDrop) specialSetPressure += 1.0;
  if (match.isBlockedBack) specialSetPressure += 1.2;
  const setFormula = (typeof computeSetFormula==='function')
    ? computeSetFormula(setter.stats,{incomingSpeed:incomingSetSpeed,contactDist:setContactDist,lowBallSeverity,specialPressure:specialSetPressure})
    : null;
  const speedExcess = setFormula ? setFormula.speedExcess : Math.max(0, incomingSetSpeed - 15.0);
  const distanceExcess = setFormula ? setFormula.distanceExcess : Math.max(0, setContactDist - setSweet);
  const rawSetPressure = setFormula ? setFormula.rawPressure : (speedExcess*.12)+(distanceExcess*.025)+(lowBallSeverity*1.15)+specialSetPressure;
  const setControlMitigation = setFormula ? setFormula.controlMitigation : Math.max(.45,1-(setter.stats.intellect*.005)-(setter.stats.technique*.12));
  const setContactSeverity = setFormula ? setFormula.contactSeverity : rawSetPressure*setControlMitigation;
  const setErrorMultiplier = setFormula ? setFormula.errorMultiplier : Math.min(4.5,1+setContactSeverity);

  let godspeedJustActivated = false;
  if (setter.stats.skill.id === 'sk_godspeed_toss' && setter.consumeSkill('SET_TACTIC')) {
    setter.godspeedCharges = 3; godspeedJustActivated = true;
    pushCallout(setter.x, setter.y - 45, '神速二傳 (GODSPEED)!!', '#eab308');
  }

  if (setter.godspeedCharges > 0) {
    if(!godspeedJustActivated) playSkillAsset('SFX/skills/godspeed_toss.wav',1.0);
    ball.hasTossedFromGodspeed = true;
    setter.godspeedCharges--;
    createImpactSparks(setter.x, setter.y - setter.radius, 14, '#eab308');
  } else {
    ball.hasTossedFromGodspeed = false;
  }

  const minNetDist = 65, maxNetDist = WORLD.ATTACK_LINE_DIST - 10;
  const targetOffset = minNetDist + Math.random() * (maxNetDist - minNetDist);
  const idealTargetX = isLeft ? (WORLD.NET_X - targetOffset) : (WORLD.NET_X + targetOffset);

  const distToTarget = Math.abs(setter.x - idealTargetX);
  const distFactor = distToTarget / 240;
  const randomSpread = (Math.random() - 0.5) * 2;
  const errAmplitude = setFormula ? setFormula.errorAmplitude : Math.max(20, (55 - setter.stats.intellect) * 2.8 + (1.0 - setter.stats.technique) * 55);
  const naturalError = randomSpread * errAmplitude * distFactor * setErrorMultiplier;
  const requestedTargetX = idealTargetX + naturalError;

  // V6：恢復「力量不足時，深後場二傳無法憑空送回三米線」。
  // V5/原 0917 的 executeSetterPass 直接反算任意 vx，因此實際上沒有二傳距離上限；
  // 現在只使用既有 power 限制單次可控制的水平傳球距離，準度仍由 INT/technique 的 naturalError 負責。
  const setPower = setter.stats.power || 18.5;
  const maxSetTravel = setFormula ? setFormula.maxTravel : Math.max(250, Math.min(410, 250 + Math.max(0, setPower - 18.5) * 10.0));

  // V76-3.4 TRUE PRE-SET QUICK:
  // Only an AI tactical plan may request this branch. The attacker has already committed and
  // left the floor before release. The setter then aims the real ball at a future airborne
  // contact envelope. TEC/pressure still inject ordinary set error; if the live precommit is
  // no longer valid we fall back to the untouched normal-set physics below.
  const quickPlan=setter._aiQuickSetPlan;
  const quickAttacker=quickPlan && typeof allPlayers!=='undefined'
    ? allPlayers.find(p=>p&&(p.slotKey===quickPlan.attackerSlot||`slot${p.slotIndex}`===quickPlan.attackerSlot))
    : null;
  const quickLive=!!(quickPlan&&quickAttacker&&!quickAttacker.isGrounded&&!quickAttacker.isDiving&&quickAttacker.isLeft===setter.isLeft&&gameFrame<=quickPlan.expiresFrame);
  let quickExecuted=false;
  if(quickLive){
    // V76-3.4.1 LIVE QUICK FEED ENVELOPE:
    // Do not force the pre-set prediction to land on one exact frame/point. At release, search
    // the attacker's live airborne future for any legal AI-quality contact inside a short quick
    // feed family, then use the easiest feed. TEC/pressure error is applied after that choice.
    const playerG=WORLD.GRAVITY*((typeof getCurrentVenue==='function')?getCurrentVenue().gravityMult:1.0)*(typeof venueGravityFactor==='function'?venueGravityFactor():1);
    const gBall=WORLD.GRAVITY*0.72*((typeof getCurrentVenue==='function')?(Number(getCurrentVenue().gravityMult)||1):1)*(typeof venueGravityFactor==='function'?(Number(venueGravityFactor())||1):1);
    const facing=setter.isLeft?1:-1;
    let py=quickAttacker.y,pvy=quickAttacker.vy;
    const futureY=[];
    for(let f=1;f<=26;f++){py+=pvy;pvy+=playerG;futureY[f]=py;}
    let bestQuick=null;
    for(let n=7;n<=26;n++){
      const shoulderY=futureY[n]-quickAttacker.radius*1.5;
      for(let dx=16;dx<=58;dx+=7){
        for(let dy=-28;dy<=42;dy+=10){
          if(Math.hypot(dx,dy)>68)continue;
          const cleanTargetX=quickAttacker.x+facing*dx;
          const cleanTargetY=shoulderY-dy;
          if(cleanTargetY<=WORLD.NET_TOP_Y-275||cleanTargetY>=WORLD.FLOOR_Y-45)continue;
          if(Math.abs(cleanTargetX-ball.x)>maxSetTravel)continue;
          const quickVx=(cleanTargetX-ball.x)/n;
          const quickVy=(cleanTargetY-ball.y-gBall*n*(n-1)/2)/n;
          if(Math.abs(quickVx)>16||quickVy<-13.5||quickVy>8.5)continue;
          const launchEase=Math.abs(quickVx)/16+Math.abs(quickVy+2.5)/16;
          const contactEase=Math.hypot(dx-35,dy-6)/70;
          const timingEase=Math.abs(n-14)/24;
          const score=launchEase*0.50+contactEase*0.30+timingEase*0.20;
          if(!bestQuick||score<bestQuick.score)bestQuick={score,n,cleanTargetX,cleanTargetY,quickVx,quickVy};
        }
      }
    }
    if(bestQuick){
      const quickDistFactor=Math.abs(bestQuick.cleanTargetX-setter.x)/240;
      const quickErr=randomSpread*errAmplitude*quickDistFactor*setErrorMultiplier;
      const requestedQuickX=bestQuick.cleanTargetX+quickErr*0.45;
      const requestedQuickY=bestQuick.cleanTargetY+quickErr*0.12;
      const finalQuickX=ball.x+Math.max(-maxSetTravel,Math.min(maxSetTravel,requestedQuickX-ball.x));
      const quickVx=(finalQuickX-ball.x)/bestQuick.n;
      const quickVy=(requestedQuickY-ball.y-gBall*bestQuick.n*(bestQuick.n-1)/2)/bestQuick.n;
      const quickPhysicsOK=Math.abs(quickVx)<=16&&quickVy>=-13.5&&quickVy<=8.5;
      if(quickPhysicsOK){
        ball.vx=quickVx;ball.vy=quickVy;
        ball._aiQuickTempo='PRECOMMIT';
        ball._aiQuickTempoEpoch=quickPlan.epoch;
        quickExecuted=true;
      }
    }
  }
  setter._aiQuickSetPlan=null;

  if(!quickExecuted){
    const requestedDelta = requestedTargetX - ball.x;
    const limitedDelta = Math.max(-maxSetTravel, Math.min(maxSetTravel, requestedDelta));
    const finalTargetX = ball.x + limitedDelta;
    // 高壓 O 仍可能把球救起來，但弧度會變扁／不穩；好球則幾乎維持原本手感。
    const targetVy = -13.8 + Math.min(4.0, setContactSeverity * (0.45 + Math.random() * 0.45));
    const timeInAir = (2 * Math.abs(targetVy)) / (WORLD.GRAVITY * 0.72);
    ball.vx = (finalTargetX - ball.x) / timeInAir; ball.vy = targetVy;
    ball._aiQuickTempo=null;ball._aiQuickTempoEpoch=null;
  }
  ball.isSpiked = false; ball.isPerfectSpike = false; ball.isFloat = false; 
  ball.isTacticalThrust = false; ball.isBrokenSpike = false; ball.isUltimate = false; ball.isTopspin = false; ball.armorPiercing = 0;
  ball.opacity = 1.0; ball.glowColor = null;
  playSound('set');
  setter.addEnergy(6);
  match.assistCandidate=setter;
  match.assistAttackActor=null;
  if (setter === mateAI) pushCallout(ball.x, ball.y - 15, 'CHANCE!', '#facc15');
}

// 🌟 依照觸發者身分，精確給予本機或通知遠端訪客領錢
function distributeCoins(actor, amount, desc, x, y) {
  // V75-3 Balance Lab never mutates progression/currency during instrumentation matches.
  if (typeof BALANCE_TEST_ACTIVE !== 'undefined' && BALANCE_TEST_ACTIVE) return;
  if (!actor) return;
  const targetSlot = (typeof actor === 'number') ? actor : (actor.slotIndex !== undefined ? actor.slotIndex : NET.mySlot);

  if (typeof NET === 'undefined' || !NET.isMultiplayer) {
    addCoins(amount, desc, x, y);
    return;
  }

  // 若觸發者是本機玩家，直接本地加錢
  if (targetSlot === NET.mySlot) {
    addCoins(amount, desc, x, y);
  } else if (NET.isHost && NET.conn && NET.conn.open) {
    // 若房主判定這是訪客的得分，透過網路發送封包請訪客端領錢
    NET.conn.send({
      type: 'COIN_REWARD_SYNC',
      targetSlot: targetSlot,
      amount: amount,
      desc: desc,
      x: x,
      y: y
    });
  }
}

function addCoins(amount, desc = '', spawnX = null, spawnY = null) {
  userCoins += amount;
  const cd = document.getElementById('coin-display');
  if (cd) cd.innerText = userCoins;
  saveGameData();
  if (spawnX !== null && spawnY !== null) triggerCoinPopup(spawnX, spawnY, amount);
  if (desc && !isPaused) statusSubtext.innerText = `🪙 +${amount} 幣 (${desc})!`;
}

// V74-19 unified skill-contact payloads. This runs only after recordTouch has accepted a legal volleyball touch.
function processSkillContactPayload(hitter) {
  if (!hitter) return;

  // Mud Spike: exactly two enemy legal touches may carry contamination. Same player may consume both.
  // Source-team touches never consume a charge, preventing the old block-back self-infection bug.
  if (ball.mudCharges > 0 && ball.mudSourceIsLeft !== null && hitter.isLeft !== ball.mudSourceIsLeft) {
    ball.mudCharges--;
    ball.mudContaminationAvailable = ball.mudCharges > 0;
    hitter.mudDebuffRallies = Math.max(hitter.mudDebuffRallies || 0, 3);
    hitter.mudDebuffTimer = 45;
    createMudSplash(ball.x, ball.y, ball.mudCharges > 0 ? 30 : 40);
    visualEffects.push({type:'mud_burst',x:ball.x,y:ball.y,life:30,maxLife:30,heavy:ball.mudCharges===0});
    playSkillAsset('SFX/skills/mud_hit.wav',1.0);
    pushCallout(hitter.x, hitter.y - hitter.radius * 2, `MUD ${ball.mudCharges > 0 ? 'x1' : 'BREAK'}!!`, '#78350f');
    if (ball.mudCharges <= 0) { ball.mudContaminationAvailable = false; ball.mudSourceIsLeft = null; }
  }

  // Time Lag: any legal opponent touch (receive / dive / cover / block) resolves the touch burst once.
  if (ball.activeSkillTag === '時流差' && !ball.skillOutcomeSfxPlayed?.timeBurst && ball.lastAttackHitter && hitter.isLeft !== ball.lastAttackHitter.isLeft) {
    ball.skillOutcomeSfxPlayed = ball.skillOutcomeSfxPlayed || {};
    ball.skillOutcomeSfxPlayed.timeBurst = true;
    createTimeBurst(ball.x, ball.y); triggerScreenShake(7,8);
  }

  // Siege Breaker: first enemy legal touch consumes only the attack presentation; physics already owns AP/speed.
  if (ball.activeSkillTag === '破城重槌' && !ball.breakerImpactDone && ball.breakerSourceIsLeft !== null && hitter.isLeft !== ball.breakerSourceIsLeft) {
    ball.breakerImpactDone = true; ball.breakerTrailFrames = 0;
    visualEffects.push({type:'breaker_impact',x:ball.x,y:ball.y,life:16,maxLife:16,angle:Math.atan2(ball.vy,ball.vx)});
    triggerScreenShake(6,7);
  }

  // Sky Comet: a successful defender touch is still a full meteor impact. SFX2/VFX are not downgraded.
  if (ball.activeSkillTag === '天際墜石' && !ball.skyImpactDone && ball.skySourceIsLeft !== null && hitter.isLeft !== ball.skySourceIsLeft) {
    triggerSkyCometImpact(ball.x, ball.y);
  }

  // V74-23 Phantom Wipe lifecycle: if the original attack reaches the target team without being blocked,
  // the paid skill is over. It must never survive into the opponent's return attack and trigger on our later block.
  if (ball.activeSkillTag === '幻影抹手' && ball.phantomWipeSourceIsLeft !== null && hitter.isLeft !== ball.phantomWipeSourceIsLeft) {
    ball.activeSkillTag = '';
    ball.phantomWipeSourceIsLeft = null;
  }

  // V74-23 Kinetic Counter: the borrowed-energy payload is consumed by the first legal opponent touch.
  // The same impact VFX used on ground is emitted at the actual receive/contact point; ground remains fallback.
  if (ball.activeSkillTag === '動能反噬' && ball.kineticSourceIsLeft !== null && hitter.isLeft !== ball.kineticSourceIsLeft) {
    const I = ball.kineticIntensity || .3;
    visualEffects.push({type:'kinetic_impact',x:ball.x,y:ball.y,life:28,maxLife:28,intensity:I});
    createImpactSparks(ball.x,ball.y,16+Math.floor(I*24),'#fde68a');
    triggerScreenShake(5+Math.floor(I*7),9);
    ball.kineticTrailFrames=0; ball.kineticIntensity=0; ball.kineticSourceIsLeft=null; ball.activeSkillTag=''; ball.glowColor=null;
  }

  // Gravity Soft Wall one-touch leaves a white charged ball; the next teammate legal touch starts the fade.
  if (ball.softWallGlowFrames > 12 && ball.softWallGlowSideIsLeft !== null && hitter.isLeft === ball.softWallGlowSideIsLeft) {
    ball.softWallGlowFrames = 12;
  }
}

function triggerSkyCometImpact(x,y){
  if(ball.skyImpactDone) return;
  ball.skyImpactDone=true;
  stopSkillAsset('sky_comet_flight',.10);
  playSkillAsset('SFX/skills/sky_2.wav',1.0,{start:.02});
  visualEffects.push({type:'meteor_impact',x,y,life:24,maxLife:24});
  visualEffects.push({type:'sonic_ring',x,y,life:18,maxLife:18,angle:Math.atan2(ball.vy,ball.vx),scale:1.45});
  createImpactSparks(x,y,34,'#fff7d6');
  triggerScreenShake(14,12);
  ball.skyImpactFadeFrames=12;
  ball.isSkyComet=false; // stop comet gravity immediately; renderer uses fade frames for the visual tail.
}

function recordTouch(hitter, isBlockTouch = false) {
  // V29 時流差：時間鎖定期間球不屬於可觸碰物件。Human / AI / Block 共用此閘門。
  if (ball.timeLagFrames > 0) return false;
  // 發球球權：發球擊出後，在接發方第一次合法觸球之前，發球方不得再次碰球。
  // 放在共用觸球規則層，玩家 / AI / 連線都使用同一條規則。
  if (match.inServeRally && !serveState.active && serveState.currentServer && ball.lastHitter) {
    const servingSideIsLeft = serveState.currentServer.isLeft;
    const lastTouchWasServingSide = (ball.lastHitter.isLeft === servingSideIsLeft);
    const hitterIsServingSide = (hitter.isLeft === servingSideIsLeft);
    if (lastTouchWasServingSide && hitterIsServingSide) {
      triggerFault(servingSideIsLeft ? 'RIGHT' : 'LEFT', 'ILLEGAL SERVE TOUCH!!', '發球方在接發方觸球前再次碰球違例');
      return false;
    }
  }

  if (ball.isPhantomDrop && ball.lastHitter && ball.lastHitter.isLeft !== hitter.isLeft) {
    ball.isPhantomDrop = false; ball.phantomRestoreFrames = 20; visualEffects.push({type:'ghost_reform',x:ball.x,y:ball.y,life:24,maxLife:24});
  }

  // V18: ACE eligibility is independent from the old inServeRally pressure flag.
  // Direct ace or a failed first reception remains an ACE; once the receiving team
  // makes a second legal touch (or sends the ball back), the serve is no longer ACE-eligible.
  if (match.serveAceEligible && !serveState.active && serveState.currentServer) {
    const receiverIsLeft = !serveState.currentServer.isLeft;
    if (hitter.isLeft === receiverIsLeft) {
      match.serveReceiverTouches++;
      if (match.serveReceiverTouches >= 2) match.serveAceEligible = false;
    } else if (match.serveReceiverTouches > 0 && ball.lastHitter && ball.lastHitter.isLeft === receiverIsLeft) {
      match.serveAceEligible = false;
    }
  }

  if (match.inServeRally && !serveState.active && hitter.isLeft !== serveState.currentServer.isLeft) {
    match.inServeRally = false;
  }

  // V68: UFO 放出的中立球只維持到第一個合法玩家觸球；之後恢復正常責任歸屬。
  ball.ufoNeutralRelease = false;

  // V57 Energy/接球語意：在 lastHitter 被本次觸球覆蓋前，記住這顆球原本從哪裡來。
  const incomingWasNeutral = !!ball.venueNeutralLive;
  const incomingWasOpponent = !!(ball.lastHitter && ball.lastHitter.isLeft !== hitter.isLeft);
  hitter._receiveIncomingNeutral = incomingWasNeutral;
  hitter._receiveIncomingOpponent = incomingWasOpponent;
  // V75-3.7 audit-only origin tag for THIS legal touch. This is refreshed on every touch so it cannot leak
  // from an older possession. Receiving an opponent serve is a normal receive; the forbidden case is the serving
  // side trying to plan another action before the receiver has legally touched the serve.
  hitter._lastTouchPossessionOrigin = match.isBlockedBack
    ? 'FROM_BLOCK_COVER'
    : (incomingWasOpponent || incomingWasNeutral)
      ? 'FROM_RECEIVE'
      : 'FROM_TEAM_TOUCH';

  // V54 第一個合法碰到場地中立球的人，正式取得新的球權；此前雙方 AI 都可依落點追球。
  if (ball.venueNeutralLive) ball.venueNeutralLive = false;

  if (ball.lastHitter && ball.lastHitter.isLeft !== hitter.isLeft) {
    if (hitter.isLeft) match.leftHits = 0;
    else match.rightHits = 0;
    allPlayers.forEach(p => p.hasBlockSelfHitPrivilege = false);
  }

  const isAttacking = hitter.swingTimer > 0 || hitter.thrustTimer > 0;
  // V75-1: remember the actual attack-contact frame. AI may still make an airborne emergency cover later,
  // but never with zero-frame post-spike precision. This is observational state only; it does not alter ball physics.
  if (isAttacking) hitter._lastAttackContactFrame = gameFrame;
  const isOpponentBall = (ball.lastHitter && ball.lastHitter.isLeft !== hitter.isLeft);

  const isHuman = (typeof isSlotHumanControlled === 'function') ? isSlotHumanControlled(hitter) : hitter.isLocallyControlled;
  let isLegitBlock = false;
  if (!match.inServeRally && isOpponentBall && !isAttacking && !hitter.isGrounded && ball.y < WORLD.NET_TOP_Y + 50) {
    isLegitBlock = isHuman ? (hitter.isBlocking && Math.abs(hitter.x - WORLD.NET_X) < 110) : (Math.abs(hitter.jumpStartX - WORLD.NET_X) < 95 || isBlockTouch);
  }

  if (isLegitBlock) {
    ball.lastHitter = hitter;
    match.lastTouchFrame = gameFrame;
    hitter.hasBlockSelfHitPrivilege = true;
    hitter.addEnergy(25);
    proMatchStats[hitter.slotKey].totalBlocks++;
    processSkillContactPayload(hitter);
    return true; 
  }

  const isSelfConsecutive = (ball.lastHitter === hitter);
  if (isSelfConsecutive) {
    if (hitter.hasBlockSelfHitPrivilege) {
      // Block -> self receive is the explicit volleyball privilege and consumes itself once.
      hitter.hasBlockSelfHitPrivilege = false;
    } else if (gameFrame - match.lastTouchFrame < 18) {
      // V21 Touch Authority: the same physical action can overlap the ball for several frames.
      // Treat those repeated collision frames as the already-consumed action, not a new volleyball touch.
      // If another player/opponent touched in between, ball.lastHitter would differ and this guard would not apply.
      return false;
    } else {
      triggerFault(hitter.isLeft ? 'RIGHT' : 'LEFT', 'DOUBLE HIT!!', '同一球員連續觸球違例');
      return false;
    }
  }

  hitter.hasBlockSelfHitPrivilege = false;

  if (hitter.isLeft) {
    match.leftHits++;
    if (match.leftHits > 3) { triggerFault('RIGHT', 'FOUR HITS!!', '左隊超過 3 次擊球違例'); return false; }
  } else {
    match.rightHits++;
    if (match.rightHits > 3) { triggerFault('LEFT', 'FOUR HITS!!', '右隊超過 3 次擊球違例'); return false; }
  }

  // V57 Assist 只追蹤 O 後『下一次己方進攻直接造成的結果』。對手完成第二次合法觸球即視為成功化解。
  if(match.assistAttackActor && ball.lastHitter && ball.lastHitter.isLeft!==match.assistAttackActor.isLeft && hitter.isLeft===ball.lastHitter.isLeft){
    match.assistCandidate=null; match.assistAttackActor=null;
  }

  processSkillContactPayload(hitter);

  // V19: remember the real server independently from later receive/block touches.
  if (match.inServeRally && serveState.currentServer === hitter && !ball.serveOriginServer) ball.serveOriginServer = hitter;
  ball.lastHitter = hitter;
  match.lastTouchFrame = gameFrame;
  return true;
}

// 🌟 客觀勝負陣營判定：winnerTeam 為 'LEFT' 或 'RIGHT'
function triggerFault(winnerTeam, title, desc) {
  if (banner.active || isSettlementOpen) return;
  playWhistle(true);

  // V19 Rally Responsibility: determine point ownership once, then Banner/Shout/Stats/Energy consume the same truth.
  const rawContext = ball.pointContext || null;
  const titleAce = title.includes('ACE');
  const descTouchOut = desc.includes('TOUCH OUT');
  const descRoof = desc.includes('ROOF') || desc.includes('攔死');
  let pointType = 'GENERIC';
  let pointActor = null;
  let pointVictim = null;

  if (titleAce) {
    pointType = 'ACE';
    pointActor = ball.serveOriginServer || serveState.currentServer || null;
    pointVictim = ball.lastHitter && ball.lastHitter !== pointActor ? ball.lastHitter : null;
  } else if ((rawContext && rawContext.type === 'ROOF') || descRoof) {
    pointType = 'ROOF';
    pointActor = rawContext && rawContext.actor ? rawContext.actor : ball.lastHitter;
    pointVictim = rawContext && rawContext.victim ? rawContext.victim : ball.lastAttackHitter;
  } else if (descTouchOut) {
    pointType = 'TOUCH_OUT';
    pointActor = (rawContext && rawContext.type === 'TOOL_OUT' && rawContext.actor) ? rawContext.actor : ball.lastAttackHitter;
    pointVictim = (rawContext && rawContext.victim) ? rawContext.victim : ball.lastHitter;
  } else if (title.includes('SPIKE') || title.includes('IN')) {
    pointType = 'ATTACK_KILL';
    pointActor = ball.lastAttackHitter || ball.lastHitter;
  } else if (desc.includes('出界') || title.includes('OUT')) {
    pointType = 'OUT_ERROR';
    pointActor = ball.lastHitter;
  } else {
    pointActor = ball.lastHitter;
  }
  // Never credit a normal kill to the losing side merely because it made the final failed receive touch.
  const actorWon = pointActor && ((winnerTeam === 'LEFT' && pointActor.isLeft) || (winnerTeam === 'RIGHT' && !pointActor.isLeft));
  if ((pointType === 'ATTACK_KILL' || pointType === 'TOUCH_OUT' || pointType === 'ACE' || pointType === 'ROOF') && !actorWon) {
    const winnerPlayers = winnerTeam === 'LEFT' ? allPlayers.filter(p => p.isLeft) : allPlayers.filter(p => !p.isLeft);
    if (pointType === 'ATTACK_KILL' || pointType === 'TOUCH_OUT') pointActor = winnerPlayers.find(p => p === ball.lastAttackHitter) || pointActor;
  }
  const pointEvent = { type: pointType, actor: pointActor, victim: pointVictim, winnerTeam, title, desc };
  match.lastPointEvent = pointEvent;

  if (typeof broadcastMangaShout === 'function') {
    const actorName = pointActor ? (pointActor.playerName || pointActor.name) : '球員';
    const victimName = pointVictim ? (pointVictim.playerName || pointVictim.name) : '對手';
    const isDouble = desc.includes('DOUBLE');
    const isNetFault = desc.includes('NET') || desc.includes('觸網') || desc.includes('踩線');
    if (isDouble) {
      const offender = ball.lastHitter; const n = offender ? (offender.playerName || offender.name) : actorName;
      broadcastMangaShout(n, `${n} 連觸違例自爆 ...！`, '致命二次觸球！痛失球權！', '#f43f5e');
    } else if (isNetFault) {
      const offender = ball.lastHitter; const n = offender ? (offender.playerName || offender.name) : actorName;
      broadcastMangaShout(n, `${n} 嚴重違例失誤！`, '痛失寶貴比分！', '#f43f5e');
    } else if (pointType === 'ROOF') {
      broadcastMangaShout(actorName, `${actorName} 像一道牆直接封死 ${victimName}！！`, 'ROOF BLOCK！球被原地蓋回去！', '#facc15');
    } else if (pointType === 'ACE') {
      broadcastMangaShout(actorName, `${actorName} 破壞性發球得分 (ACE)！！`, '一傳直接被炸開！', '#facc15');
    } else if (pointType === 'TOUCH_OUT') {
      broadcastMangaShout(actorName, `${actorName} 打手出界得分 (TOUCH OUT)！！`, `${victimName} 最後一碰飛出場！`, '#10b981');
    } else if (pointType === 'ATTACK_KILL') {
      broadcastMangaShout(actorName, `${actorName} 強力暴扣直接落地得分！！`, '勢不可擋！乾淨俐落釘地板！', '#38bdf8');
    } else if (pointType === 'OUT_ERROR') {
      broadcastMangaShout(actorName, `${actorName} 把球打出界了啊啊啊！`, '用力過猛！球直接飛出場外！', '#f59e0b');
    }
  }

  banner.winnerTeam = winnerTeam;
  if (timeSlowTimer > 0) releaseChronoBulletTime('dead-ball');
  else timeSlowTimer = 0;
  hitStopFrames = 15;

  allPlayers.forEach(p => {
    if (p.depressedRallies > 0) p.depressedRallies--;
    if (p.excitedRallies > 0) p.excitedRallies--;
    if (p.softWallRallies > 0) p.softWallRallies--;
    if (p.greaseDebuffRallies > 0) p.greaseDebuffRallies--;
    if (p.mudDebuffRallies > 0) p.mudDebuffRallies--;
    if (p.flowAbsorbRallies > 0) p.flowAbsorbRallies--;
    if (p.roarMoodRallies > 0) p.roarMoodRallies--;
  });

  const isSevereMistake = desc.includes('ROOF') || desc.includes('出界') || desc.includes('FAULT') || desc.includes('違例');
  const baseDepressChance = isSevereMistake ? 0.50 : 0.18;

  allPlayers.forEach(p => {
    const isWinnerSide = (winnerTeam === 'LEFT' && p.isLeft) || (winnerTeam === 'RIGHT' && !p.isLeft);
    const intVal = (p.stats && Number.isFinite(p.stats.intellect)) ? p.stats.intellect : 20;
    const depressResist = Math.min(0.70, intVal * 0.015);

    if (p.roarMoodRallies > 0) return;
    if (isWinnerSide) {
      if (p.depressedRallies <= 0) {
        if (Math.random() < 0.35) { const wasExcited=p.excitedRallies>0; p.excitedRallies = Math.max(p.excitedRallies, 2); if(!wasExcited) playMoodSound('excited'); }
      }
    } else {
      if (p.excitedRallies <= 0) {
        const finalChance = baseDepressChance * (1.0 - depressResist);
        if (Math.random() < finalChance) {p.depressedRallies = Math.max(p.depressedRallies, 1); playMoodSound('depressed');}
      }
    }
  });

// V57 O 助攻：O → 隊友下一次進攻，若該次進攻直接造成 ATTACK_KILL / TOUCH_OUT，才給組織者獎勵。
  const assistSetter=match.assistCandidate;
  const assistDirectKill=assistSetter && match.assistAttackActor && pointEvent.actor===match.assistAttackActor && (pointEvent.type==='ATTACK_KILL'||pointEvent.type==='TOUCH_OUT') && ((winnerTeam==='LEFT')===assistSetter.isLeft);
  if(assistDirectKill){assistSetter.addEnergy(15);pushCallout(assistSetter.x,assistSetter.y-assistSetter.radius*2-15,'ASSIST +15 能量!','#38bdf8');}
  match.assistCandidate=null; match.assistAttackActor=null;

const isTouchOut = pointEvent.type === 'TOUCH_OUT', isAce = pointEvent.type === 'ACE';
  const scoringPlayer = pointEvent.actor || ball.lastHitter || (winnerTeam === 'LEFT' ? userPlayer : enemyA);
  // V60: 只認正式 Rally Event 的攻擊得分，不把發球 ACE / 對手自爆算進環境成就。
  if(scoringPlayer && isAttackPointEvent(pointEvent)){
    if(venueIncidentState.active==='BLACKOUT') awardAchievementForActor(scoringPlayer,'ach_blackout_attack');
    if(getCurrentVenue().fixed==='ship_sway' && (venueIncidentState.active==='GIANT_WAVE'||Math.abs(venueIncidentState.shipTilt||0)>.012)) awardAchievementForActor(scoringPlayer,'ach_ship_attack');
    if(getCurrentVenue().id==='rooftop' && (scoringPlayer.venueShockRecoveryTimer||0)>0) awardAchievementForActor(scoringPlayer,'ach_shock_kill');
  }
  if(Number.isInteger(ball._birdHitActorSlot)){
    const birdActor=allPlayers[ball._birdHitActorSlot]; if(birdActor&&((winnerTeam==='LEFT')===birdActor.isLeft)) awardAchievementForActor(birdActor,'ach_feather_finish');
  }
  if(Number.isInteger(venueIncidentState.ufoResponsibleSlot)&&venueIncidentState.ufoResponsibleSlot>=0){
    const ufoActor=allPlayers[venueIncidentState.ufoResponsibleSlot]; if(ufoActor&&((winnerTeam==='LEFT')===ufoActor.isLeft)) awardAchievementForActor(ufoActor,'ach_ufo_survivor');
    venueIncidentState.ufoResponsibleSlot=-1;
  }
  ball._birdHitActorSlot=undefined;

  if (winnerTeam === 'LEFT') { 
    score.player++;
    allPlayers.filter(p => p.isLeft).forEach(p => p.addEnergy(20));
    if (pendingCoinReward > 0) {
      const rewardActor = ball.lastHitter || userPlayer;
      if (isTouchOut) distributeCoins(rewardActor, pendingCoinReward + 2, 'TOUCH OUT 打手出界加權', rewardActor.x, rewardActor.y - rewardActor.radius * 2);
      else distributeCoins(rewardActor, pendingCoinReward, pendingCoinReason, rewardActor.x, rewardActor.y - rewardActor.radius * 2);
    } else if (scoringPlayer && scoringPlayer.isLeft) {
      if (isAce) distributeCoins(scoringPlayer, 3, 'SERVICE ACE!! 發球得分', scoringPlayer.x, scoringPlayer.y - scoringPlayer.radius * 2);
      else distributeCoins(scoringPlayer, 1, '進攻得分', scoringPlayer.x, scoringPlayer.y - scoringPlayer.radius * 2);
    }

    if (scoringPlayer && scoringPlayer.isLeft) {
      if (isAce) proMatchStats[scoringPlayer.slotKey].serviceAces++;
      else if (pointEvent.type === 'ROOF') { /* roofKills is awarded at contact, do not double count */ }
      else if (isTouchOut) proMatchStats[scoringPlayer.slotKey].toolOutKills++;
      else if (pointEvent.type === 'ATTACK_KILL') proMatchStats[scoringPlayer.slotKey].spikeKills++;
    }
  } else { 
    score.enemy++;
    allPlayers.filter(p => !p.isLeft).forEach(p => p.addEnergy(20));
    // 右隊得分時也為右隊攻手（例如訪客在 PVP 時）結算金幣
    if (scoringPlayer && !scoringPlayer.isLeft) {
      if (isAce) distributeCoins(scoringPlayer, 3, 'SERVICE ACE!! 發球得分', scoringPlayer.x, scoringPlayer.y - scoringPlayer.radius * 2);
      else distributeCoins(scoringPlayer, 1, '進攻得分', scoringPlayer.x, scoringPlayer.y - scoringPlayer.radius * 2);
    }
    pendingCoinReward = 0; pendingCoinReason = '';
    if (scoringPlayer && !scoringPlayer.isLeft) {
      if (isAce) proMatchStats[scoringPlayer.slotKey].serviceAces++;
      else if (pointEvent.type === 'ROOF') { /* roofKills is awarded at contact, do not double count */ }
      else if (isTouchOut) proMatchStats[scoringPlayer.slotKey].toolOutKills++;
      else if (pointEvent.type === 'ATTACK_KILL') proMatchStats[scoringPlayer.slotKey].spikeKills++;
    }
  }

  scoreDisplay.innerText = `${score.player} : ${score.enemy}`;
banner.active = true; banner.timer = 85; banner.mainText = title; banner.subText = desc;

  // 🌟 自主色彩判定：依本機陣營判斷藍字/紅字
  const myIsLeft = (typeof NET === 'undefined' || !NET.isMultiplayer) ? true : (NET.mySlot === 0 || NET.mySlot === 1);
  const amIWinner = (winnerTeam === 'LEFT' && myIsLeft) || (winnerTeam === 'RIGHT' && !myIsLeft);
  banner.color = amIWinner ? '#38bdf8' : '#f43f5e';

  ball.vy = -Math.max(6.5, Math.abs(ball.vy) * 0.65);
  ball.vx *= 0.85;

  if (typeof checkMatchWin === 'function') checkMatchWin();
}

// 🌟 房主檢查比賽結束，並透過 MATCH_SETTLEMENT 同步給訪客
function checkMatchWin() {
  if ((score.player >= 15 || score.enemy >= 15) && Math.abs(score.player - score.enemy) >= 2) {
    const winnerSide = (score.player > score.enemy) ? 'LEFT' : 'RIGHT';
    if(getCurrentVenue().id==='moon'&&venueIncidentState.seenUfo&&venueIncidentState.seenGravity){
      allPlayers.filter(p=>((winnerSide==='LEFT')===p.isLeft)).forEach(p=>awardAchievementForActor(p,'ach_space_leak'));
    }
    openSettlement(winnerSide);

    if (typeof NET !== 'undefined' && NET.isMultiplayer && NET.isHost && NET.conn && NET.conn.open) {
      NET.conn.send({
        type: 'MATCH_SETTLEMENT',
        stats: proMatchStats,
        winnerSide: winnerSide,
        score: score
      });
    }
  }
}

// 🌟 結算面板：依 winnerSide 與本機陣營展示 VICTORY 或 DEFEAT
function openSettlement(winnerSide = 'LEFT') {
  if(typeof finalizeNetDiag==='function' && typeof NET!=='undefined' && NET.isMultiplayer) finalizeNetDiag();
  isSettlementOpen = true; isPaused = true;
  document.getElementById('settlement-modal').style.display = 'flex';
  if(typeof updateNetDiagSettlementUI==='function') updateNetDiagSettlementUI();
  requestAnimationFrame(()=>{ if(typeof updateNetDiagSettlementUI==='function') updateNetDiagSettlementUI(); });
  if (typeof NET !== 'undefined' && NET.isMultiplayer) {
    NET.rematchRequested = false;
    NET.remoteRematchRequested = false;
  }
  const rematchBtn = document.getElementById('btn-settle-rematch');
  if (rematchBtn) { rematchBtn.disabled = false; rematchBtn.innerText = '開始下一局比賽 [Enter]'; rematchBtn.style.display = isCareerMode ? 'none' : ''; }

  const myIsLeft = (typeof NET !== 'undefined') ? (NET.mySlot === 0 || NET.mySlot === 1) : true;
  const playerWon = (winnerSide === 'LEFT' && myIsLeft) || (winnerSide === 'RIGHT' && !myIsLeft);

  document.getElementById('settle-title').innerText = playerWon ? 'MATCH VICTORY!!' : 'MATCH DEFEAT...';
  document.getElementById('settle-title').style.color = playerWon ? '#facc15' : '#f43f5e';
  document.getElementById('settle-desc').innerText = playerWon ? '率先拿下 15 分局勝利！' : '惜敗，再接再厲！';

  // V75-3 Balance Lab settlement is telemetry-only: no coins, EXP, ladder/career progress, or save mutation.
  if (typeof BALANCE_TEST_ACTIVE !== 'undefined' && BALANCE_TEST_ACTIVE && typeof BALANCE_LAB !== 'undefined' && BALANCE_LAB && typeof BALANCE_LAB.onSettlement === 'function') {
    if (BALANCE_LAB.onSettlement(winnerSide)) return;
  }
  
// 🌟 天梯模式專屬數據累加與經驗值結算
  if (isLadderMode && ladderCurrentRun.active) {
    // 1. 將本局個人表現數據累加至天梯總戰績池
    if (!ladderCurrentRun.summaryStats) {
      ladderCurrentRun.summaryStats = {
        user: { spikes: 0, spikeKills: 0, receives: 0, perfectAbsorbs: 0, blocks: 0, roofKills: 0, maxSpeed: 0, totalExp: 0 },
        mate: { spikes: 0, spikeKills: 0, receives: 0, perfectAbsorbs: 0, blocks: 0, roofKills: 0, maxSpeed: 0, totalExp: 0 }
      };
    }

    // 計算本局個人表現經驗加成
    const baseExp = playerWon ? 160 : 70;
    ['user', 'mate'].forEach(slotKey => {
      const s = proMatchStats[slotKey];
      const personalBonus = ((s.spikeKills + s.toolOutKills) * 20) + ((s.serviceAces || 0) * 20) + (s.roofKills * 25) + (s.perfectAbsorbs * 15);
      const earnedExp = baseExp + personalBonus;

      // 累加進天梯結算池
      const sum = ladderCurrentRun.summaryStats[slotKey];
      sum.spikes += s.totalSpikes;
      sum.spikeKills += (s.spikeKills + s.toolOutKills);
      sum.receives += s.totalReceives;
      sum.perfectAbsorbs += s.perfectAbsorbs;
      sum.blocks += s.totalBlocks;
      sum.roofKills += s.roofKills;
      sum.maxSpeed = Math.max(sum.maxSpeed, s.maxSpeed);
      sum.totalExp += earnedExp;

      // 🌟 直接將經驗值寫入本機角色背包存檔 (即時升級加點)
      const actorCard = ACTIVE_ROSTER[slotKey];
      if (actorCard) {
        const localInvCard = INVENTORY.find(c => c.id === actorCard.id);
        if (localInvCard) {
          localInvCard.exp += earnedExp;
          let reqExp = getRequiredExp(localInvCard.level);
          while (localInvCard.exp >= reqExp && localInvCard.level < 20) {
            localInvCard.exp -= reqExp;
            localInvCard.level++;
            localInvCard.freePts += 5;
            reqExp = getRequiredExp(localInvCard.level);
          }
        }
      }
    });
    saveGameData();

    document.getElementById('settlement-modal').style.display = 'none';

    if (playerWon) {
      const curFloor = ladderCurrentRun.currentFloor;
      const baseMult = LADDER_BASE_FLOOR_MULT[curFloor] || 1.2;
      const finalMult = Math.max(0.5, baseMult + ladderCurrentRun.mateBonusMult);
      ladderCurrentRun.currentPot = Math.round(ladderCurrentRun.betAmount * finalMult);

      if (curFloor >= 5) {
        // 第 5 階通關大滿貫：彈出天梯總戰績綜合看板！
        addCoins(ladderCurrentRun.currentPot, '天梯登頂大滿貫', 800, 250);
        showLadderRunSummaryModal(true);
        return;
      }

      // 1 ~ 4 階：播放階梯跳躍動畫
      playLadderClimbAnimation(curFloor, curFloor + 1, ladderCurrentRun.currentPot);
      return;
    } else {
      // 輸球爆倉：尚未提款的獎池全部沒收。EXP 保留。
      ladderCurrentRun.currentPot = 0;
      showLadderRunSummaryModal(false);
      return;
    }
  }

  // 常規單人/聯賽結算
  if (playerWon) {
    addCoins(40, '15 分勝場大獎', 800, 250);
    document.getElementById('settle-coins-reward').innerText = '🪙 +40 排球金幣存入存檔！';
  } else {
    document.getElementById('settle-coins-reward').innerText = '🪙 惜敗無勝場金幣';
  }

  let bestRating = -1, mvpSlot = 'user';
  for (let slot in ACTIVE_ROSTER) {
    const s = proMatchStats[slot];
    const aces = s.serviceAces || 0;
    const rating = ((s.spikeKills + s.toolOutKills) * 25) + (aces * 25) + (s.roofKills * 30) + (s.perfectAbsorbs * 15);
    if (rating > bestRating) { bestRating = rating; mvpSlot = slot; }
  }

  const baseExp = playerWon ? 150 : 60;
  const tbody = document.getElementById('settle-table-body');
  tbody.innerHTML = '';

  for (let slot in ACTIVE_ROSTER) {
    const card = ACTIVE_ROSTER[slot], s = proMatchStats[slot], isMvp = (slot === mvpSlot);
    const aces = s.serviceAces || 0;
    const personalBonus = ((s.spikeKills + s.toolOutKills) * 20) + (aces * 20) + (s.roofKills * 25) + (s.perfectAbsorbs * 15) + (isMvp ? 50 : 0);
    const finalExp = baseExp + personalBonus;

    // 只有本機背包裡的角色才累加 EXP 存檔；電腦臨時物件結算完不寫入存檔
// 🌟 連線模式防串存檔：只有「本機玩家自己出戰操控的角色 (NET.mySlot)」才享有存檔升級加點！
    let shouldUpdateLocalExp = true;
    if (typeof NET !== 'undefined' && NET.isMultiplayer) {
      const mySlotKey = allPlayers[NET.mySlot] ? allPlayers[NET.mySlot].slotKey : 'user';
      if (slot !== mySlotKey) {
        shouldUpdateLocalExp = false; // 對手或隊友出的角色，本機背包不存檔、不升級
      }
    }

    const localInvCard = shouldUpdateLocalExp ? INVENTORY.find(c => c.id === card.id || c.name === card.name) : null;
    let levelUp = false;
    if (localInvCard) {
      localInvCard.exp += finalExp;
      let reqExp = getRequiredExp(localInvCard.level);
      while (localInvCard.exp >= reqExp && localInvCard.level < 20) {
        localInvCard.exp -= reqExp; localInvCard.level++; localInvCard.freePts += 5; levelUp = true;
        reqExp = getRequiredExp(localInvCard.level);
      }
    }
// 🌟 結算身分判定：如果是真人操控的格子，優先冠上玩家 ID
    const slotIdxMap = { user: 0, mate: 1, enemyFront: 2, enemyBack: 3 };
    const actorPlayer = allPlayers[slotIdxMap[slot]];
    let ownerName = '';
    if (actorPlayer && actorPlayer.playerName && actorPlayer.playerName !== card.name) {
      ownerName = `[${actorPlayer.playerName}] `;
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="color: ${card.color}; font-weight: bold; font-size: 11px;">${ownerName}${card.name} ${isMvp ? '👑MVP' : ''} (Lv.${card.level}${levelUp ? '⬆️' : ''})</td>
      <td>${s.totalSpikes}</td>
      <td style="color: #ef4444; font-weight: bold;">${s.spikeKills}</td>
      <td style="color: #10b981; font-weight: bold;">${s.toolOutKills}</td>
      <td style="color: #facc15; font-weight: bold;">${aces}</td>
      <td style="color: #facc15;">${s.maxSpeed.toFixed(1)}</td>
      <td>${s.totalReceives}</td>
      <td style="color: #10b981;">${s.perfectAbsorbs}</td>
      <td style="color: #f97316;">${s.normalBumps}</td>
      <td style="color: #ef4444;">${s.deflects}</td>
      <td style="color: #38bdf8;">${s.coverSaves}</td>
      <td>${s.totalBlocks}</td>
      <td style="color: #facc15; font-weight: bold;">${s.roofKills}</td>
      <td style="color: #38bdf8; font-weight: bold;">+${finalExp} EXP</td>
    `;
    tbody.appendChild(tr);  }
  
  if (isCareerMode && playerWon) {
    const stage = CAREER_STAGES.find(s => s.id === currentCareerStage);
    if (stage) {
      addCoins(stage.rewardCoins, `通過 STAGE 0${stage.id} 關卡大獎`, 800, 220);
      let rewardText = `🏆 擊破【${stage.name}】！🪙 +${stage.rewardCoins} 幣`;
      if (!UNLOCKED_COSMETICS.effects) UNLOCKED_COSMETICS.effects = ['fx_none'];
      if (stage.rewardSkin && !UNLOCKED_COSMETICS.effects.includes(stage.rewardSkin)) {
        UNLOCKED_COSMETICS.effects.push(stage.rewardSkin);
        const skObj = COSMETICS_DB.effects.find(e => e.id === stage.rewardSkin);
        rewardText += ` ＋ 🎽 解鎖限定光效【${skObj ? skObj.name : ''}】！`;
      }
      document.getElementById('settle-coins-reward').innerText = rewardText;
      if (currentCareerStage === careerProgress && careerProgress < CAREER_STAGES.length) {
        careerProgress++;
      }
    }
  }

  saveGameData();
}

// V25：連線再戰改成雙方握手。任何一方單獨按「下一局」都不能自行離開結算畫面。
function handleSettlementRematch() {
  if (typeof NET !== 'undefined' && NET.isMultiplayer) {
    if (!NET.conn || !NET.conn.open) return;
    if (NET.rematchRequested) return;

    NET.rematchRequested = true;
    const btn = document.getElementById('btn-settle-rematch');
    if (btn) { btn.disabled = true; btn.innerText = '等待對方再戰確認...'; }
    NET.conn.send({ type: 'REMATCH_REQUEST' });
    tryStartNetRematch();
    return;
  }

  document.getElementById('settlement-modal').style.display = 'none';
  isSettlementOpen = false;
  closeSettlementAndNextMatch();
}

function tryStartNetRematch() {
  if (!NET.isMultiplayer || !NET.rematchRequested || !NET.remoteRematchRequested) return;
  NET.rematchRequested = false;
  NET.remoteRematchRequested = false;
  document.getElementById('settlement-modal').style.display = 'none';
  isSettlementOpen = false;
  startNetPreparation();
}

function closeSettlementAndNextMatch() {
  document.getElementById('settlement-modal').style.display = 'none';
  isSettlementOpen = false; isPaused = false;

  // V76-4.0.2: 無盡練習若選「隨機場地」，每一場 rematch 都重新抽一次。
  // venueChoice 保留 random，venueId 則更新成這一局實際抽到的場地。
  let practiceVenueRerolled = false;
  if (typeof isPracticeMode !== 'undefined' && isPracticeMode &&
      typeof NET !== 'undefined' && NET.venueChoice === 'random' &&
      typeof resolveVenueChoice === 'function') {
    const nextVenueId = resolveVenueChoice('random');
    NET.venueId = nextVenueId;
    if (typeof setCurrentVenue === 'function') setCurrentVenue(nextVenueId);
    practiceVenueRerolled = true;
  }

  resetMatchState();
  ball.resetForServe('LEFT');
  if (practiceVenueRerolled && typeof showVenueRevealCurtain === 'function') showVenueRevealCurtain();
}

function returnToStartMenu() {
  if (confirm('確定要結束目前比賽並返回主選單嗎？目前比分將會重置。')) {
    saveGameData(); isGameStarted = false; isPaused = true; if(typeof _stopVenueAmbience==='function')_stopVenueAmbience();
    isPracticeMode = false; isCareerMode = false; isLadderMode = false;
    if (typeof resetNetworkSessionIdentity === 'function') resetNetworkSessionIdentity(true);
    restoreActiveRosterFromSaved(true);
    resetMatchState();
    document.getElementById('start-menu-modal').style.display = 'flex';
    if(typeof updateRecoveredNetDiagMenu==='function')updateRecoveredNetDiagMenu();
  }
}

function returnToStartMenuFromSettle() {
  // V25：結算畫面離開連線賽，必須通知另一端；否則對方會永遠停在結算／再戰等待。
  if (typeof NET !== 'undefined' && NET.isMultiplayer) {
    NET.intentionalDisconnect = true;
    if (NET.conn && NET.conn.open) NET.conn.send({ type: 'PEER_QUIT' });
    if (NET.peer) { NET.peer.destroy(); NET.peer = null; }
    NET.conn = null; NET.isMultiplayer = false; NET.remoteKeys = {};
    NET.rematchRequested = false; NET.remoteRematchRequested = false;
  }
  if (typeof resetNetworkSessionIdentity === 'function') resetNetworkSessionIdentity(false);
  document.getElementById('settlement-modal').style.display = 'none';
  isSettlementOpen = false; isGameStarted = false; isPaused = true;
  if(typeof _stopVenueAmbience==='function')_stopVenueAmbience();
  saveGameData();
  isPracticeMode = false; isCareerMode = false; isLadderMode = false;
  restoreActiveRosterFromSaved(true);
  resetMatchState();
  document.getElementById('start-menu-modal').style.display = 'flex';
  if(typeof updateRecoveredNetDiagMenu==='function')updateRecoveredNetDiagMenu();
}

// UI navigation ownership lives in game_ui.js. Keep compatibility wrappers here only.
function closeLockerToMenu() {
  if (typeof lockerReturnContext !== 'undefined') lockerReturnContext = 'MENU';
  if (typeof closeLockerByContext === 'function') return closeLockerByContext();
  isLockerOpen=false; document.getElementById('locker-modal').style.display='none'; document.getElementById('start-menu-modal').style.display='flex';
}
function toggleLocker() {
  if (isSettlementOpen) return;
  if (typeof closeLockerByContext === 'function' && isLockerOpen) return closeLockerByContext();
  if (typeof lockerReturnContext !== 'undefined') lockerReturnContext = isGameStarted ? 'PAUSE' : 'MENU';
  isLockerOpen=true; isPaused=!!isGameStarted; document.getElementById('locker-modal').style.display='flex'; initStagedCard(); renderLocker();
}

function startGameFromMenu() {
  document.getElementById('start-menu-modal').style.display = 'none';
  isGameStarted = true; isPaused = false;
  resetMatchState();
  ball.resetForServe('LEFT');
}

// 🌟 全域鍵位配置（支援自定義，預設兼顧習慣）
let KEY_BINDS = {
  left: 'a',
  right: 'd',
  jump: 'w',
  jumpAlt: ' ', // 支援空白鍵跳躍
  spike: 'j',
  receive: 'k',
  thrust: 'l',
  set: 'o',
  block: ' '
};

function loadCustomKeybinds() {
  try {
    const saved = localStorage.getItem('VOLLEY_CUSTOM_KEYS');
    if (saved) KEY_BINDS = Object.assign(KEY_BINDS, JSON.parse(saved));
  } catch(e) {}
}
loadCustomKeybinds();

const keys = {};
let receiveInputBuffer = 0; // 🌟 3 幀輸入緩衝，防止連打時剛好在抬起幀漏球

window.addEventListener('keydown', (e) => {
  // V74-7: never steal gameplay/debug hotkeys while the player is typing a room code or any form field.
  const target=e.target;
  const typing=target && (target.tagName==='INPUT'||target.tagName==='TEXTAREA'||target.tagName==='SELECT'||target.isContentEditable);
  if(typing) return;
  const k = e.key.toLowerCase();
  const code = e.code;
  keys[k] = true;
  if (code === 'Space') keys['space'] = true;

  if (['Space', 'ArrowUp', 'ArrowDown'].includes(code)) {
    e.preventDefault(); // 阻止網頁捲動
  }
  
if (e.key === 'Escape') {
    e.preventDefault();

    // V76-4.0.2 UI NAV STACK: ESC 必須由最上層 modal 往回退，不能跨層關閉。
    // 裝備流程：Slot Picker -> Detail -> Bag -> Locker -> 原來源(Menu/Pause)。
    const gachaNoticeModal = document.getElementById('gacha-notice-modal');
    if (gachaNoticeModal && gachaNoticeModal.style.display === 'flex') {
      if (typeof window.closeGachaNotice === 'function') window.closeGachaNotice();
      return;
    }
    const itemGachaResultModal = document.getElementById('item-gacha-result-modal');
    if (itemGachaResultModal && itemGachaResultModal.style.display === 'flex') {
      if (typeof closeItemGachaResults === 'function') closeItemGachaResults();
      return;
    }
    const confirmGachaModal = document.getElementById('confirm-gacha-modal');
    if (confirmGachaModal && confirmGachaModal.style.display === 'flex') {
      if (typeof window.closeConfirmGacha === 'function') window.closeConfirmGacha();
      return;
    }
    const tenGachaModal = document.getElementById('gacha-ten-modal');
    if (tenGachaModal && tenGachaModal.style.display === 'flex') {
      if (typeof closeTenGachaModal === 'function') closeTenGachaModal();
      return;
    }
    const singleGachaModal = document.getElementById('gacha-anim-modal');
    if (singleGachaModal && singleGachaModal.style.display === 'flex') {
      if (typeof closeGachaAnim === 'function') closeGachaAnim();
      return;
    }
    const slotPickerModal = document.getElementById('equip-slot-picker-modal');
    if (slotPickerModal && slotPickerModal.style.display === 'flex') {
      if (typeof cancelEquipSlotPick === 'function') cancelEquipSlotPick();
      return;
    }
    const equipDetailModal = document.getElementById('equip-detail-modal');
    if (equipDetailModal && equipDetailModal.style.display === 'flex') {
      if (typeof closeEquipDetail === 'function') closeEquipDetail();
      return;
    }
    const reforgeModal = document.getElementById('reforge-modal');
    if (reforgeModal && reforgeModal.style.display === 'flex') {
      if (typeof closeReforgeModal === 'function') closeReforgeModal();
      return;
    }
    const breakthroughModal = document.getElementById('breakthrough-modal');
    if (breakthroughModal && breakthroughModal.style.display === 'flex') {
      if (typeof closeBreakthroughModal === 'function') closeBreakthroughModal();
      return;
    }

    // 設定 / 改鍵。
    if (typeof isKeybindModalOpen !== 'undefined' && isKeybindModalOpen) {
      closeKeybindModal();
      return;
    }
    if (typeof isSettingsOpen !== 'undefined' && isSettingsOpen) {
      closeSettingsModal();
      return;
    }

    // 主選單子頁：取消按鈕與 ESC 使用同一條離開路徑。
    const practiceVenueModal = document.getElementById('practice-venue-modal');
    if (practiceVenueModal && practiceVenueModal.style.display === 'flex') {
      if (typeof closePracticeVenueModal === 'function') closePracticeVenueModal();
      return;
    }
    const multiplayerModal = document.getElementById('multiplayer-modal');
    if (multiplayerModal && multiplayerModal.style.display === 'flex') {
      if (typeof closeMultiplayerModal === 'function') closeMultiplayerModal();
      return;
    }
    const ladderPrepModal = document.getElementById('ladder-prep-modal');
    if (ladderPrepModal && ladderPrepModal.style.display === 'flex') {
      if (typeof closeLadderPrepModal === 'function') closeLadderPrepModal();
      return;
    }

    const wardrobeModal = document.getElementById('wardrobe-modal');
    if (wardrobeModal && wardrobeModal.style.display === 'flex') {
      closeWardrobeModal();
      return;
    }
    const gachaArcadeModal = document.getElementById('gacha-arcade-modal');
    if (gachaArcadeModal && gachaArcadeModal.style.display === 'flex') {
      closeGachaArcade();
      return;
    }
    const careerModal = document.getElementById('career-modal');
    if (careerModal && careerModal.style.display === 'flex') {
      closeCareerMenu();
      return;
    }

    // Locker 自身最後才退：先 Bag，再 Locker。
    if (isLockerOpen) {
      if (typeof isEquipBagOpen !== 'undefined' && isEquipBagOpen && typeof closeEquipBag === 'function') {
        closeEquipBag();
        return;
      }
      if (typeof closeLockerByContext === 'function') closeLockerByContext();
      else toggleLocker();
      return;
    }

    if (isSettlementOpen) {
      handleSettlementRematch();
      return;
    }
    if (isGameStarted) {
      togglePauseMenu();
      return;
    }
  }

if (e.key === 'Enter') {
    const stairModal = document.getElementById('ladder-stage-anim-modal');
    if (stairModal && stairModal.style.display === 'flex') {
      ladderProceedNextFloor(); // 🌟 天梯按 Enter 自動挑戰下一階
      return;
    } else if (isSettlementOpen) {
      if (!isCareerMode) handleSettlementRematch();
    }
  }
    // V74-7: Shift+B = collision/debug overlay. Plain B venue-event test shortcut is intentionally disabled (code retained below for future reuse).
    if (k === 'b' && e.shiftKey) {
      debugHitbox = !debugHitbox;
      e.preventDefault();
      return;
    }
    // [disabled] if (k === 'b' && !e.repeat && typeof toggleVenueIncidentDebugPanel === 'function') toggleVenueIncidentDebugPanel();

  const myActor = allPlayers[NET.mySlot] || userPlayer;
  const myActorIsHuman = (typeof isSlotHumanControlled === 'function') ? isSlotHumanControlled(myActor) : myActor.isLocallyControlled;

  // V75-3.3: in 4-AI scrimmage the local slot is an AI too. Keyboard input must not
  // inject actions into that slot while the shared AI brain owns it.
  if (!myActorIsHuman && typeof BALANCE_FORCE_AI_ALL !== 'undefined' && BALANCE_FORCE_AI_ALL) {
    if (['a','d','w','j','k','l','o'].includes(k) || code === 'Space') {
      keys[k] = false;
      if (code === 'Space') keys['space'] = false;
      e.preventDefault();
      return;
    }
  }

  if (myActorIsHuman && !isPaused && !isLockerOpen && !banner.active && !isSettlementOpen && isGameStarted && !isPauseMenuOpen) {
    const isReceiveKey = (k === KEY_BINDS.receive);
    const isSpikeKey = (k === KEY_BINDS.spike);
    const isThrustKey = (k === KEY_BINDS.thrust);
    const isSetKey = (k === KEY_BINDS.set);
    const isBlockKey = (code === 'Space' || k === KEY_BINDS.block);

    if (serveState.active && serveState.currentServer === myActor) {
      const isRemoteGuestServe = (typeof NET !== 'undefined' && NET.isMultiplayer && !NET.isHost);
      // V23: Guest only sends canonical serve intent. Host alone resolves toss / J / L,
      // preventing duplicate callouts, sounds, energy use and divergent serve physics.
      if (!isRemoteGuestServe) {
        if (isReceiveKey && !serveState.tossed) serveState.charging = true;
        if (isSpikeKey && serveState.tossed) handleServeSpike(myActor);
        if (isThrustKey && serveState.tossed) handleServeFloat(myActor);
      }
} else if (!serveState.active) {
      // 🌟 判定：是否為連線訪客端
      const isRemoteGuest = (typeof NET !== 'undefined' && NET.isMultiplayer && !NET.isHost);

      if (!isRemoteGuest) {
        // 👑 房主端 / 單人模式：本地直接執行擊球與違例結算
        if (isBlockKey && Math.abs(myActor.x - WORLD.NET_X) < 110) myActor.triggerBlock();
        if (isSpikeKey) handleUserAttack(myActor);
        if (isThrustKey) {
          if (!myActor.isGrounded) handleUserThrust(myActor);
          else { snapshotReceiveInput(myActor, 'L'); myActor.dive(); }
        }
        if (isReceiveKey) {
          snapshotReceiveInput(myActor, 'K');
          receiveInputBuffer = 3; // 啟動緩衝
          handleUserBump(myActor);
        }
        if (isSetKey) handleUserSet(myActor);
      } else {
        // 🎮 連線訪客端：擊球全交由房主判定（防止本地誤判二觸）；本地只響應純地面魚躍動作
        if (isThrustKey && myActor.isGrounded && !myActor.isDiving) myActor.dive();
      }
    }  }
});

window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  keys[k] = false;
  if (e.code === 'Space') keys['space'] = false;

  const myActor = allPlayers[NET.mySlot] || userPlayer;
  const myActorIsHuman = (typeof isSlotHumanControlled === 'function') ? isSlotHumanControlled(myActor) : myActor.isLocallyControlled;
  const isReceiveKey = (k === KEY_BINDS.receive);
  const isRemoteGuestServe = (typeof NET !== 'undefined' && NET.isMultiplayer && !NET.isHost);
  if (myActorIsHuman && !isRemoteGuestServe && serveState.active && serveState.currentServer === myActor && isReceiveKey && serveState.charging && !serveState.tossed) {
    serveState.charging = false; serveState.tossed = true;
    const pRatio = Math.max(0.35, serveState.chargePower / 100);
    ball.vx = myActor.isLeft ? 1.0 : -1.0;
    ball.vy = myActor.stats.jump * (0.80 + pRatio * 0.65);
    playSound('set');
    statusSubtext.innerText = '高拋完成！助跑 ➔ 跳發暴扣 或 跳飄！';
  }
});

// 🌟 記錄訪客上一幀的按鍵狀態（過濾邊緣觸發，杜絕連擊二觸）
let lastRemoteKeys = {};

// 🌟 通用真人動作執行器 (支援房主本地與遠端訪客按鍵呼叫)
function executePlayerAction(actor, inputKeys) {
  if (!actor || !inputKeys) return;
  if (serveState.active && serveState.currentServer === actor) {
    if (inputKeys['k'] && !serveState.tossed) serveState.charging = true;
    if (inputKeys['j'] && serveState.tossed) handleServeSpike(actor);
    if (inputKeys['l'] && serveState.tossed) handleServeFloat(actor);
  } else if (!serveState.active) {
    if (inputKeys['space']) actor.triggerBlock();
    if (inputKeys['j']) handleUserAttack(actor);
    if (inputKeys['l']) { if (!actor.isGrounded) handleUserThrust(actor); else actor.dive(); }
    if (inputKeys['k']) handleUserBump(actor);
    if (inputKeys['o']) handleUserSet(actor);
  }
}

// 🌟 專用訪客動作分流器：補齊放開 K 拋球，並只在「剛按下一瞬間」觸發擊球動作
function executeGuestActionWithEdge(guestPlayer, currentKeys) {
  if (!guestPlayer || !currentKeys) return;

const justPressed = {};
  const justReleased = {};
  // 🌟 補齊空白鍵的三種瀏覽器標準鍵名（' '、'space'、'spacebar'）
  const checkKeys = ['w', 'a', 's', 'd', 'j', 'k', 'l', 'o', 'space', ' ', 'spacebar'];
  
  for (let k of checkKeys) {
    if (currentKeys[k] && !lastRemoteKeys[k]) justPressed[k] = true;
    if (!currentKeys[k] && lastRemoteKeys[k]) justReleased[k] = true;
  }
  lastRemoteKeys = { ...currentKeys };

  // 🌟 空白鍵相容整合：只要任何一種空白鍵有按，就認定 space 觸發
  const isSpacePressed = justPressed['space'] || justPressed[' '] || justPressed['spacebar'];
  // 發球階段
  if (serveState.active && serveState.currentServer === guestPlayer) {
    if (justPressed['k'] && !serveState.tossed) {
      serveState.charging = true; // 開始蓄力
    }
    // 🌟 解決訪客 K 丟不出去：只要訪客放開 K，房主立刻結算拋球！
    if (justReleased['k'] && serveState.charging && !serveState.tossed) {
      serveState.charging = false;
      serveState.tossed = true;
      const pRatio = Math.max(0.35, serveState.chargePower / 100);
      ball.vx = guestPlayer.isLeft ? 1.0 : -1.0;
      ball.vy = guestPlayer.stats.jump * (0.80 + pRatio * 0.65);
      playSound('set');
      statusSubtext.innerText = '高拋完成！助跑 ➔ [W+J] 跳發暴扣 或 [W+L] 跳飄！';
    }
    if (justPressed['j'] && serveState.tossed) handleServeSpike(guestPlayer);
    if (justPressed['l'] && serveState.tossed) handleServeFloat(guestPlayer);
  } 
// 常規攻防階段：嚴格只在剛按下的那一幀 (justPressed) 觸發一次，徹底消滅二觸！
  else if (!serveState.active) {
    if (isSpacePressed) guestPlayer.triggerBlock();
    if (justPressed['j']) handleUserAttack(guestPlayer);
    if (justPressed['l']) { 
      if (!guestPlayer.isGrounded) handleUserThrust(guestPlayer); 
      else guestPlayer.dive(); 
    }
    if (justPressed['k']) handleUserBump(guestPlayer);
    if (justPressed['o']) handleUserSet(guestPlayer);
  }
}
function getDist(p, b = ball) {
  if (isNaN(b.x) || isNaN(b.y)) return 99999;
  const px = p.isDiving ? p.x + p.facing * 18 : p.x;
  const py = p.isDiving ? WORLD.FLOOR_Y - 8 : p.y - p.radius;
  return Math.hypot(px - b.x, py - b.y);
}

function handleServeSpike(actor) {
  if (getDist(actor) > 95) return;
  const isFootFault = actor.isLeft ? (actor.jumpStartX >= WORLD.LEFT) : (actor.jumpStartX <= WORLD.RIGHT);
  if (isFootFault) {
    triggerFault(actor.isLeft ? 'RIGHT' : 'LEFT', 'FOOT FAULT!!', '發球起跳踩線違例');
    serveState.active = false; return;
  }
  actor.swingTimer = 12; serveState.active = false; recordTouch(actor);

  const isCometSkill = actor.consumeSkill('SERVE_SPIKE');
  // V75-3: runMomentum contributes exactly once to jump serve power (the +4.0 branch below).
  const rawSpikeSpeed = actor.stats.power * 0.98;
  const facingDir = actor.isLeft ? 1 : -1;

  if (isCometSkill) {
    ball.isSkyComet = true; ball.activeSkillTag = '天際墜石'; ball.armorPiercing = 7.5; ball.glowColor = '#facc15';
    ball.skySourceIsLeft=actor.isLeft; ball.skyImpactDone=false; ball.skyImpactFadeFrames=0; ball.skySonicSpawn=3;
    const courtMin = actor.isLeft ? WORLD.NET_X + 125 : WORLD.LEFT + 90;
    const courtMax = actor.isLeft ? WORLD.RIGHT - 90 : WORLD.NET_X - 125;
    const rawTarget = actor.isLeft ? (WORLD.NET_X + 150 + Math.random() * 235) : (WORLD.NET_X - 150 - Math.random() * 235);
    const targetX = Math.max(Math.min(courtMin,courtMax), Math.min(Math.max(courtMin,courtMax), rawTarget));
    const effGravity = WORLD.GRAVITY * 1.55, launchUp = 27.5;
    const rise = (launchUp*launchUp)/(2*effGravity), apexY = ball.y - rise, targetY = WORLD.FLOOR_Y - ball.radius;
    const tUp = launchUp/effGravity, tDown = Math.sqrt(Math.max(1,2*(targetY-apexY)/effGravity));
    ball.vx = (targetX - ball.x) / Math.max(1,tUp+tDown); ball.vy = -launchUp;
    hitStopFrames = Math.max(hitStopFrames,3);
    visualEffects.push({type:'sonic_ring',x:ball.x,y:ball.y,life:18,maxLife:18,angle:Math.atan2(ball.vy,ball.vx),scale:1.0});
    playSound('perfect_spike'); triggerScreenShake(12, 12); createImpactSparks(ball.x, ball.y, 24, '#fff7d6');
    pushCallout(actor.x, actor.y - actor.radius * 2 - 15, '天際墜石 (SKY COMET)!!', '#facc15');
    pendingCoinReward = 3; pendingCoinReason = 'SKY COMET';
  } else if (!actor.isGrounded) {
    // 🌟 計算助跑動能加成 (0 ~ 25 幀換算，最高加成約 +4.0 球威)
const serveMomentum = actor.runMomentum || 0;
const serveMomentumRatio = Math.min(1.0, serveMomentum / 25.0);
const bonusServePower = serveMomentumRatio * 4.0;
const actualSpikeSpeed = rawSpikeSpeed + bonusServePower;
const contactDy = ball.y - (actor.y - actor.radius * 1.5);
if (ball.y < WORLD.NET_TOP_Y - 60 && ball.y > WORLD.NET_TOP_Y - 240 && getDist(actor) < 80) {
  // 🌟 1. 改用含有助跑動量的 actualSpikeSpeed
  ball.vx = facingDir * actualSpikeSpeed; 
  ball.vy = (contactDy * 0.08) - 1.5;
  ball.isSpiked = true; 
  ball.isPerfectSpike = true; 
  ball.isTopspin = true;
  
  // 🌟 2. 技巧上旋配合跑動加成，強化下墜咬地力
  ball.topspinRating = actor.stats.technique + (serveMomentumRatio * 0.15);
  
  playSound('perfect_spike'); 
  triggerScreenShake(8, 9); 
  createImpactSparks(ball.x, ball.y, 16, '#ef4444');
  
  // 🌟 3. 助跑累積滿時顯示特殊標語 (可選)
  const serveBanner = serveMomentumRatio > 0.8 ? 'MAX MOMENTUM SERVE!!' : 'PERFECT JUMP SERVE!!';
  pushCallout(actor.x, actor.y - actor.radius * 2 - 15, serveBanner, '#ef4444');
  
  pendingCoinReward = 2; 
  pendingCoinReason = 'PERFECT ACE';
  
  // 🌟 4. 擊出後清空助跑動能
  actor.runMomentum = 0;
} else if (ball.y <= WORLD.NET_TOP_Y - 240) {
  ball.vx = facingDir * actualSpikeSpeed * 1.18; 
  ball.vy = -5.0; 
  ball.isSpiked = true;
  playSound('spike'); 
  pushCallout(actor.x, actor.y - actor.radius * 2 - 15, 'OUT BALL!!', '#eab308');
  actor.runMomentum = 0;
} else {
  ball.vx = facingDir * actualSpikeSpeed * 0.65; 
  ball.vy = 4.0;
  playSound('bump'); 
  pushCallout(actor.x, actor.y - actor.radius * 2 - 15, 'NET FAULT!!', '#f97316');
  actor.runMomentum = 0;
}  } else {
    // V63: standing J is a real fallback serve, especially when movement/jump is venue-limited.
    // Solve a minimum-clearance ballistic arc at the net instead of using a fixed -4 vy,
    // which made low-power characters mathematically incapable of clearing the tape.
    const standingVx = Math.max(14.5, rawSpikeSpeed * 0.70);
    ball.vx = facingDir * standingVx;
    const netTravelFrames = Math.max(1, Math.abs(WORLD.NET_X - ball.x) / standingVx);
    const netClearY = WORLD.NET_TOP_Y - 42;
    const solvedVy = (netClearY - ball.y - 0.5 * WORLD.GRAVITY * netTravelFrames * netTravelFrames) / netTravelFrames;
    ball.vy = Math.min(-3.8, solvedVy);
    ball.isSpiked = true; ball.isPerfectSpike = false; ball.isTopspin = true;
    ball.topspinRating = actor.stats.technique * 0.55;
    playSound('spike'); pushCallout(actor.x, actor.y - actor.radius * 2 - 15, 'STANDING SERVE', '#94a3b8');
  }
  statusSubtext.innerText = '';
}

function handleServeFloat(actor) {
  if (getDist(actor) > 95) return;
  const isFootFault = actor.isLeft ? (actor.jumpStartX >= WORLD.LEFT) : (actor.jumpStartX <= WORLD.RIGHT);
  if (isFootFault) {
    triggerFault(actor.isLeft ? 'RIGHT' : 'LEFT', 'FOOT FAULT!!', '發球起跳踩線違例');
    serveState.active = false; return;
  }
  actor.thrustTimer = 12; actor.thrustTargetX = ball.x; actor.thrustTargetY = ball.y;
  serveState.active = false; recordTouch(actor);
  const facingDir = actor.isLeft ? 1 : -1;

  const isSineSkill = actor.consumeSkill('SERVE_FLOAT');
  if (isSineSkill) {
    ball.isFloat = true; ball.isSineFloat = true; ball.activeSkillTag = '落日正弦'; ball.glowColor = '#f59e0b';
    ball.floatPhase = Math.random() * Math.PI * 2; ball.floatDrift = 0;
    // V28: 落日正弦的強度來自「長滯空 + 誇張漂移」，不是大量自殺 Outball。
    // 先抽對方場內約 1m~9m 的合法落點，再依正弦專用低重力反解基礎水平速度；
    // 後續正弦仍會讓實際路徑非常不協調，但中心軌跡不再天然飛向觀眾席。
    const sineHalfSpan = WORLD.RIGHT - WORLD.NET_X;
    ball.sineTargetX = actor.isLeft
      ? WORLD.NET_X + sineHalfSpan * (0.10 + Math.random() * 0.80)
      : WORLD.NET_X - sineHalfSpan * (0.10 + Math.random() * 0.80);
    ball.vy = -9.2;
    const sineG = WORLD.GRAVITY * 0.72 * 0.45;
    const sineDy = (WORLD.FLOOR_Y - ball.radius) - ball.y;
    const sineT = (-ball.vy + Math.sqrt(Math.max(1, ball.vy * ball.vy + 2 * sineG * sineDy))) / sineG;
    ball.vx = (ball.sineTargetX - ball.x) / Math.max(1, sineT);
    // V32：記住打點與總飛行時間，之後用參數式巨大 S 路徑前進；不再用回正力把球煞死。
    ball.sineStartX = ball.x;
    ball.sineElapsed = 0;
    ball.sineDuration = Math.max(48, sineT);
    ball.sineAmplitude = 115 + Math.random() * 75;
    ball.sineCycles = 2.15 + Math.random() * 0.65;
    ball.floatPhase = (Math.random() < 0.5 ? 0 : Math.PI);
    playSound('set');
    pushCallout(actor.x, actor.y - actor.radius * 2 - 15, '落日正弦 (SOLAR SINE)!!', '#f59e0b');
  } else {
    ball.isFloat = true; ball.isTacticalThrust = false; ball.isTopspin = false; playSound('set');
    // V10：普通跳飄的氣動相位在擊球時固定；之後只由實際球速與時間演化，不做每幀亂數瞬移。
    ball.floatPhase = Math.random() * Math.PI * 2;
    ball.floatDrift = 0;
    const floatSpeed = 17.5 + (actor.stats.technique * 2.0);
    const launchVx = !actor.isGrounded ? floatSpeed : 15.0;
    ball.vx = facingDir * launchVx;
    if (!actor.isGrounded) {
      ball.vy = -1.5;
    } else {
      // V63: standing L also solves a safe net-clearance arc; float identity remains slower/softer than J.
      const netTravelFrames = Math.max(1, Math.abs(WORLD.NET_X - ball.x) / launchVx);
      const netClearY = WORLD.NET_TOP_Y - 58;
      const solvedVy = (netClearY - ball.y - 0.5 * WORLD.GRAVITY * netTravelFrames * netTravelFrames) / netTravelFrames;
      ball.vy = Math.min(-4.2, solvedVy);
    }
    pushCallout(actor.x, actor.y - actor.radius * 2 - 15, 'FLOAT SERVE!', '#10b981');
  }
  statusSubtext.innerText = '';
}

// V75-2.1: shared standing-J safety send for Human + AI.
// Ground J is a rally-preservation action, not an attack. It must always aim toward the
// opponent court even when the actor is facing outward after chasing a sprayed ball.
// The arc is solved from the REAL ball position and current venue gravity; no STR/DEX gate
// is allowed to turn a legal standing touch into an unavoidable dead ball.
function executeStandingJSafeSend(actor, options = {}) {
  if (!actor || !ball) return false;

  const dir = actor.isLeft ? 1 : -1; // team side is authoritative; actor.facing may point out of court.
  const halfSpan = WORLD.RIGHT - WORLD.NET_X;
  const targetDepth = Math.max(0.24, Math.min(0.42, options.targetDepth ?? 0.32));
  const targetX = WORLD.NET_X + dir * halfSpan * targetDepth;
  const venueGravity = (typeof getCurrentVenue === 'function') ? (getCurrentVenue().gravityMult || 1) : 1;
  const anomalyGravity = (typeof venueGravityFactor === 'function') ? venueGravityFactor() : 1;
  const g = Math.max(0.05, WORLD.GRAVITY * 0.72 * venueGravity * anomalyGravity);

  // Start with a soft high arc. If the ball is extremely deep, increase hang time instead of
  // turning the fallback into a flat/high-speed attack. Then verify net clearance analytically.
  const distanceToNet = Math.abs(WORLD.NET_X - ball.x);
  const deepExtra = Math.max(0, distanceToNet - halfSpan);
  let launchUp = Math.min(17.5, 10.8 + deepExtra / 95);
  const targetY = WORLD.FLOOR_Y - ball.radius;

  function solve(up) {
    const vy = -up;
    const dy = targetY - ball.y;
    const disc = Math.max(0.01, vy * vy + 2 * g * dy);
    const flightT = Math.max(1, (-vy + Math.sqrt(disc)) / g);
    const vx = (targetX - ball.x) / flightT;
    const tNet = (WORLD.NET_X - ball.x) / vx;
    const netY = (tNet > 0 && tNet < flightT)
      ? ball.y + vy * tNet + 0.5 * g * tNet * tNet
      : -Infinity;
    return { vx, vy, flightT, netY };
  }

  let shot = solve(launchUp);
  const safeNetY = WORLD.NET_TOP_Y - 34;
  // Rare venue/deep-ball fallback: raise the arc until it clears the tape with margin.
  for (let i = 0; i < 8 && shot.netY > safeNetY; i++) {
    launchUp = Math.min(21.0, launchUp + 1.25);
    shot = solve(launchUp);
  }

  ball.vx = shot.vx;
  ball.vy = shot.vy;
  ball.isSpiked = false;
  ball.isPerfectSpike = false;
  ball.isUltimate = false;
  ball.armorPiercing = 0;
  ball.isTopspin = false;
  ball.isFloat = false;
  ball.isTacticalThrust = false;
  ball.glowColor = null;

  if (options.debugActor && typeof pushAIDebug === 'function') {
    pushAIDebug(options.debugActor, '3RD TOUCH: SAFE J',
      `GROUND_J_SAFE_SEND net=${Math.round(distanceToNet)}px vx=${shot.vx.toFixed(1)} vy=${shot.vy.toFixed(1)}`);
  }
  return true;
}

function handleUserAttack(actor) {
  const shoulderX = actor.x, shoulderY = actor.y - actor.radius * 1.5;
  const dx = (ball.x - shoulderX) * actor.facing, dy = -(ball.y - shoulderY);
  if (dx < -10 || dx > 80 || Math.abs(dy) > 80) return;
  actor.swingTimer = 12;
  if (!recordTouch(actor)) return;

  proMatchStats[actor.slotKey].totalSpikes++;
  ball.lastAttackHitter = actor; ball.pointContext = null;
  if(match.assistCandidate && match.assistCandidate!==actor && match.assistCandidate.isLeft===actor.isLeft){match.assistAttackActor=actor;}else if(match.assistCandidate===actor|| (match.assistCandidate&&match.assistCandidate.isLeft!==actor.isLeft)){match.assistCandidate=null;match.assistAttackActor=null;}
  ball.isTacticalThrust = false; ball.isTopspin = true;
  ball.topspinRating = actor.stats.technique + ((actor.stats.perks && actor.stats.perks.topspinBonus) || 0);

  const currentSkill = actor.stats.skill;
  // V27: SPIKE 只有真正進入空中扣球分支才可扣能量。
  let isSkillActivated = false;

  if (!actor.isGrounded) {
    isSkillActivated = actor.consumeSkill('SPIKE');
    const angle = Math.atan2(dy, dx);
    const spikeFormula = (typeof computeSpikeFormula==='function') ? computeSpikeFormula(actor.stats,actor.runMomentum) : null;
    const momentumRatio = spikeFormula ? spikeFormula.momentumRatio : (actor.runMomentum / 25);
    const bonusPower = spikeFormula ? spikeFormula.bonusPower : (momentumRatio * 4.2);
    const techFactor = spikeFormula ? spikeFormula.techFactor : (0.85 + actor.stats.technique * 0.25);
    let effectivePower = spikeFormula ? spikeFormula.effectivePower : ((actor.stats.power + bonusPower) * techFactor);

    if (ball.hasTossedFromGodspeed) {
      effectivePower += 4.0;
      ball.hasTossedFromGodspeed = false;
      createImpactSparks(ball.x, ball.y, 14, '#eab308');
      pushCallout(actor.x, actor.y - 45, 'GODSPEED SPIKE +4.0!!', '#eab308');
    }

    if (isSkillActivated) {
      effectivePower *= (currentSkill.speedMult || 1.10);
      ball.vx = actor.facing * (effectivePower + 4.0); ball.vy = 14.5;
      ball.isSpiked = true; ball.isPerfectSpike = true; ball.isUltimate = true; ball.attackStyle = 'SKILL';
      ball.armorPiercing = (currentSkill.armorPiercing || 0) + (actor.stats.bonusAP || 0);
      ball.topspinRating += (currentSkill.extraDown || 0);
      ball.activeSkillTag = currentSkill.name; ball.glowColor = currentSkill.glowColor || '#ef4444';

      if (currentSkill.id === 'sk_breaker') { ball.vx *= 1.03; ball.vy = 10.5; ball.armorPiercing += 5.0; ball.breakerSourceIsLeft=actor.isLeft; ball.breakerImpactDone=false; ball.breakerTrailFrames=90; }
      if (currentSkill.id === 'sk_deep_impact') { ball.vx *= 1.16; ball.vy = 4.8; ball.deepWaterActive = true; }
      if (currentSkill.id === 'sk_steepexec') { ball.vx *= 0.82; ball.vy = 18.5; ball.steepexecCutAvailable = true; visualEffects.push({type:'blade_slash',x:ball.x,y:ball.y,angle:Math.atan2(ball.vy,ball.vx),life:12,maxLife:12,scale:1.0}); }
      if (currentSkill.id === 'sk_bungee_gum') ball.isBungeeGum = true;
      if (currentSkill.id === 'sk_gravity_drop') {
        ball.isGravityDrop = true; ball.gravityDropTriggered = false; ball.vy = 0; ball.isTopspin = false;
        const halfSpan = WORLD.RIGHT - WORLD.NET_X;
        ball.gravityDropTargetX = actor.isLeft ? WORLD.NET_X + halfSpan * (0.10 + Math.random() * 0.80) : WORLD.NET_X - halfSpan * (0.10 + Math.random() * 0.80);
      }
      if (currentSkill.id === 'sk_greased_ball') { ball.greaseCharges = 1; ball.greaseSourceIsLeft = actor.isLeft; }
      if (currentSkill.id === 'sk_mud_spike') { ball.mudContaminationAvailable = true; ball.mudCharges = 2; ball.mudSourceIsLeft = actor.isLeft; }
      if (currentSkill.id === 'sk_time_lag') {
        // V29：擊球瞬間即完成 Touch，但 Ball Launch 延後。鎖定期間完全不可觸球。
        ball.timeLagStoredVx = ball.vx; ball.timeLagStoredVy = ball.vy;
        ball.timeLagFrames = 24; ball.vx = 0; ball.vy = 0; ball.timeLagVfxSeed = Math.random()*1000; playSkillAsset('SFX/skills/time_1.wav',1.0,{key:'time_lag_hold'});
      }

      if(!SKILL_ASSET[currentSkill.id]) playSound('perfect_spike'); triggerScreenShake(12, 12); createImpactSparks(ball.x, ball.y, 20, ball.glowColor);
      pushCallout(actor.x, actor.y - actor.radius * 2 - 15, `${currentSkill.name}!!`, ball.glowColor);
      pendingCoinReward = 2; pendingCoinReason = currentSkill.name;
    } else if (angle > 0.6) {
      ball.vx = actor.facing * (effectivePower * 1.15); ball.vy = 6.8;
      ball.isSpiked = true; ball.isPerfectSpike = false; ball.isUltimate = false; ball.attackStyle = 'DEEP'; ball.armorPiercing = (actor.stats.bonusAP || 0); ball.glowColor = null;
      playSound('spike'); triggerScreenShake(5, 6); createImpactSparks(ball.x, ball.y, 8, '#38bdf8');
      pushCallout(actor.x, actor.y - actor.radius * 2 - 15, 'DEEP SPIKE!', '#38bdf8');
    } else if (angle >= 0.1 && angle <= 0.6) {
      ball.vx = actor.facing * effectivePower; ball.vy = 12.0;
      ball.isSpiked = true; ball.isPerfectSpike = true; ball.isUltimate = false; ball.attackStyle = 'POWER'; ball.armorPiercing = (actor.stats.bonusAP || 0); ball.glowColor = null;
      playSound('perfect_spike'); triggerScreenShake(8, 9); createImpactSparks(ball.x, ball.y, 14, '#ef4444');
      pushCallout(actor.x, actor.y - actor.radius * 2 - 15, 'PERFECT SPIKE!!', '#ef4444');
      pendingCoinReward = 1; pendingCoinReason = 'PERFECT SPIKE';
// 🌟 扣球高潮閾值：只有發動技能或速度超過 30 的下釘球才准叫！
      if (typeof triggerMangaShout === 'function' && (isSkillActivated || effectivePower > 30)) {
        triggerMangaShout(actor.playerName, `${actor.playerName} 狂暴下釘暴扣！！`, '勢不可擋的雷霆重槌！防線崩塌！', '#ef4444');
      }    } else {
      ball.vx = actor.facing * (effectivePower * 0.72); ball.vy = 16.5;
      ball.isSpiked = true; ball.isPerfectSpike = true; ball.isUltimate = false; ball.attackStyle = 'STEEP'; ball.armorPiercing = (actor.stats.bonusAP || 0); ball.glowColor = null;
      playSound('perfect_spike'); triggerScreenShake(9, 10); createImpactSparks(ball.x, ball.y, 16, '#facc15');
      pushCallout(actor.x, actor.y - actor.radius * 2 - 15, 'STEEP CUT!', '#facc15');
      pendingCoinReward = 1; pendingCoinReason = 'STEEP CUT';
    }
    // V73 沙灘球翻滾：接球判定不受影響；若玩家硬是在翻滾中扣球，出球角度依當下旋轉相位偏掉。
    if((actor.venueSpinTimer||0)>0 && (Math.abs(ball.vx)+Math.abs(ball.vy)>0.01)){const total=actor.venueSpinTotal||48,phase=(1-actor.venueSpinTimer/total)*Math.PI*2,offset=Math.sin(phase)*0.22,sp=Math.hypot(ball.vx,ball.vy),a0=Math.atan2(ball.vy,ball.vx)+offset;ball.vx=Math.cos(a0)*sp;ball.vy=Math.sin(a0)*sp;}
  } else {
    // V75-2.1: standing J always has a low-threat rally-preservation arc, including from
    // behind the baseline. Direction comes from team side, never stale actor.facing.
    executeStandingJSafeSend(actor);
    playSound('bump');
    pushCallout(actor.x, actor.y - actor.radius * 2 - 15, 'SAFE PUSH', '#38bdf8');
  }

  const curSpd = Math.hypot(ball.vx, ball.vy);
  if (curSpd > proMatchStats[actor.slotKey].maxSpeed) proMatchStats[actor.slotKey].maxSpeed = curSpd;
}

function handleUserThrust(actor) {
  const shoulderX = actor.x, shoulderY = actor.y - actor.radius * 1.5;
  const forwardDist = (ball.x - shoulderX) * actor.facing;
  const verticalDelta = ball.y - shoulderY;
  if (forwardDist < 0 || forwardDist > 85 || Math.abs(verticalDelta) > 65) return;
  actor.thrustTimer = 12; actor.thrustTargetX = ball.x; actor.thrustTargetY = ball.y;
  if (!recordTouch(actor)) return;

  proMatchStats[actor.slotKey].totalSpikes++;
  ball.lastAttackHitter = actor; ball.pointContext = null;
  if(match.assistCandidate && match.assistCandidate!==actor && match.assistCandidate.isLeft===actor.isLeft){match.assistAttackActor=actor;}else if(match.assistCandidate===actor|| (match.assistCandidate&&match.assistCandidate.isLeft!==actor.isLeft)){match.assistCandidate=null;match.assistAttackActor=null;}
  const currentSkill = actor.stats.skill;
  const isPhantomThrust = actor.consumeSkill('THRUST');
  const isBungeeThrust = (currentSkill.id === 'sk_bungee_gum') && actor.consumeSkill('SPIKE');
  const hits = actor.isLeft ? match.leftHits : match.rightHits;
  const isPhantomDrop = (hits === 2) && actor.consumeSkill('SET_ATTACK');

  if (isPhantomDrop) {
    ball.isPhantomDrop = true; ball.phantomGhostFrames = 16; ball.phantomRestoreFrames = 0; ball.opacity = 0.05; ball.activeSkillTag = '幽靈吊球'; ball.glowColor = null; visualEffects.push({type:'phantom_shell',x:ball.x,y:ball.y,life:16,maxLife:16,radius:ball.radius});
    const targetX = WORLD.NET_X + (actor.facing * 130), effGravity = WORLD.GRAVITY * 0.72, apexY = WORLD.NET_TOP_Y - 30;
    const deltaY = Math.max(10, ball.y - apexY), reqVy = -Math.sqrt(2 * effGravity * deltaY);
    const tUp = Math.abs(reqVy) / effGravity, tDown = Math.sqrt((2 * (WORLD.FLOOR_Y - apexY)) / effGravity);
    ball.vx = (targetX - ball.x) / (tUp + tDown); ball.vy = reqVy;
    pushCallout(actor.x, actor.y - actor.radius * 2 - 15, '幽靈吊球!!', '#c084fc');
    return;
  }

  const baseSpeed = isPhantomThrust ? 15.0 : 12.5;
  ball.vx = actor.facing * baseSpeed; ball.isTacticalThrust = true; ball.isTopspin = false;

  if (isBungeeThrust) {
    ball.isBungeeGum = true;
    ball.vy = 0.5; ball.activeSkillTag = '伸縮自在的愛'; ball.glowColor = '#f472b6';
    pushCallout(actor.x, actor.y - actor.radius * 2 - 15, '伸縮自在的愛!!', '#f472b6');
  } else if (isPhantomThrust) {
    ball.vy = 0.2; ball.activeSkillTag = '幻影抹手'; ball.phantomWipeSourceIsLeft = actor.isLeft; ball.glowColor = null;
    pushCallout(actor.x, actor.y - actor.radius * 2 - 15, `${currentSkill.name}!!`, '#a78bfa');
  } else if (verticalDelta < -15) {
    ball.vy = -3.2; pushCallout(actor.x, actor.y - actor.radius * 2 - 15, 'PUSH DEEP!', '#38bdf8');
  } else if (verticalDelta >= -15 && verticalDelta <= 15) {
    ball.vy = 0.5; pushCallout(actor.x, actor.y - actor.radius * 2 - 15, 'TOOL OUT!', '#10b981');
  } else {
    ball.vy = 4.8; pushCallout(actor.x, actor.y - actor.radius * 2 - 15, 'SOFT ROLL!', '#facc15');
  }
  ball.isSpiked = false; ball.isPerfectSpike = false; ball.isFloat = false; ball.isUltimate = (isPhantomThrust || isBungeeThrust); ball.armorPiercing = 0;
  if(!(isPhantomThrust || isBungeeThrust)) playSound('set');
  const curSpd = Math.hypot(ball.vx, ball.vy);
  if (curSpd > proMatchStats[actor.slotKey].maxSpeed) proMatchStats[actor.slotKey].maxSpeed = curSpd;
}

function canExecuteRollingThunder(actor) {
  if (typeof BALANCE_DISABLE_SKILLS !== 'undefined' && BALANCE_DISABLE_SKILLS) return false;
  if (!actor || !actor.stats || !actor.stats.skill) return false;
  const sk = actor.stats.skill;
  if (sk.id !== 'sk_rolling_thunder' || sk.type !== 'DEF_SAVE' || actor.energy < sk.cost) return false;

  // Physical eligibility is shared by Human + AI. X may be outside the sideline/baseline,
  // but the ball must still be on this team's side of the net. Y prevents teleporting into the sky.
  const isBallOnMySide = actor.isLeft ? (ball.x <= WORLD.NET_X - 10) : (ball.x >= WORLD.NET_X + 10);
  const isBallEligibleHeight = ball.y > 260 && ball.y < WORLD.FLOOR_Y - 15;
  return isBallOnMySide && isBallEligibleHeight && !serveState.active;
}

function executeRollingThunder(actor) {
  if (!canExecuteRollingThunder(actor)) return false;

  // Volleyball legality remains authoritative. Thunder breaks movement limits, NOT touch ownership.
  // Check the touch before spending energy / teleporting, so an illegal double/fourth touch cannot
  // become a free teleport or consume the ultimate.
  if (!recordTouch(actor)) return false;

  const thunderFrom = { x: actor.x, y: actor.y, facing: actor.facing, squashX: actor.squashX, squashY: actor.squashY, isDiving: actor.isDiving };
  actor.consumeSkill('DEF_SAVE');
  actor.ghostTrail.push({ ...thunderFrom, alpha: 1.0, teleport: true });
  actor.ghostTrail.push({ ...thunderFrom, alpha: 0.78, teleport: true, flickerOffset: 2 });
  createImpactSparks(actor.x, actor.y - actor.radius, 14, '#38bdf8');

  actor.x = ball.x - (actor.facing * 8);
  actor.y = Math.min(WORLD.FLOOR_Y, Math.max(260 + actor.radius, ball.y + actor.radius * 1.2));
  actor.isGrounded = actor.y >= WORLD.FLOOR_Y - 1;
  actor.vx = 0; actor.vy = 0;

  playSound('teleport');
  createImpactSparks(actor.x, actor.y - actor.radius, 18, '#10b981');
  createShockwave(actor.x, actor.y - actor.radius, '#38bdf8');
  visualEffects.push({type:'thunder_arc',x1:thunderFrom.x,y1:thunderFrom.y-thunderFrom.squashY*8,x2:actor.x,y2:actor.y-actor.radius,life:20,maxLife:20,seed:Math.random()*1000});
  pushCallout(actor.x, actor.y - actor.radius * 2 - 15, 'ROLLING THUNDER!!', '#38bdf8');

  if (typeof NET !== 'undefined' && NET.isMultiplayer && NET.isHost && NET.conn && NET.conn.open) {
    NET.conn.send({ type: 'ROLLING_THUNDER_FX_SYNC', slotIndex: actor.slotIndex, from: thunderFrom, to: { x: actor.x, y: actor.y } });
  }

  // Same real K receive resolver for Human + AI; incoming ball position/velocity/Pressure is preserved.
  executePlayerTimingReceive(actor, false);
  return true;
}

function handleUserBump(actor) {
  const sk = actor.stats.skill;

  // DEF_SAVE ultimates get first chance to activate. This intentionally bypasses the generic 18f
  // input debounce, while recordTouch() still enforces real double-hit / team-hit legality.
  if (sk.id === 'sk_rolling_thunder' && canExecuteRollingThunder(actor)) {
    executeRollingThunder(actor);
    return;
  }

  // V21: 不再用全場 lastTouchFrame 阻擋 K。真正的同動作重複觸球由 recordTouch 的 Touch Authority 處理；
  // 若中間已有對手/隊友合法觸球，新的 K 不應被舊 18f 時間窗誤擋。

  if (sk.id === 'sk_savage_roar' && actor.energy >= sk.cost && actor.consumeSkill('DEF_SAVE')) {
    triggerScreenShake(12, 18);
    actor.roarVfxTimer = 24;
    createRoarWave(actor.x, actor.y - actor.radius);
    if (typeof NET!=='undefined' && NET.isMultiplayer && NET.isHost && NET.conn && NET.conn.open) {
      try { NET.conn.send({type:'SAVAGE_ROAR_FX_SYNC',slotIndex:actor.slotIndex,x:actor.x,y:actor.y-actor.radius,eventId:`roarfx:${gameFrame}:${actor.slotIndex}`}); } catch(e) {}
    }
    pushCallout(actor.x, actor.y - 45, '野蠻怒吼 (SAVAGE ROAR)!!', '#dc2626');
    playMoodSound('excited'); setTimeout(()=>playMoodSound('depressed'),90);
    allPlayers.forEach(p => {
      p.roarMoodRallies = 4; // 當下不算，後續3 Rally；期間普通情緒不得覆蓋
      if (p.isLeft === actor.isLeft) { p.excitedRallies = 4; p.depressedRallies = 0; }
      else { p.depressedRallies = 4; p.excitedRallies = 0; }
    });
    return;
  }

  const d = getDist(actor);
  const reach = Math.max(70, (actor.stats.reach || 70));
  if (d > reach) return;
  const wasBlocked = match.isBlockedBack;
  if (!recordTouch(actor)) return;
  if (typeof NET !== 'undefined' && actor.slotIndex === NET.mySlot) markReceiveDebugContact(actor, 'K', 'CONTACT — K RECEIVED');
  executePlayerTimingReceive(actor, wasBlocked);
}

function handleUserSet(actor) {
  if (getDist(actor) > 85) return;
  if (!recordTouch(actor)) return;

  const isChrono = (actor.stats.skill.id === 'sk_chrono_spike') && actor.consumeSkill('SET_TACTIC');
  if (isChrono) {
    timeSlowTimer = 180; chronoCasterSide = actor.isLeft ? 'player' : 'enemy'; chronoAnimTimer = 28;
    triggerScreenShake(6, 12);
    pushCallout(actor.x, actor.y - actor.radius * 2 - 15, 'CHRONO SPIKE!!', '#ec4899');
  }
  executeSetterPass(actor);
}

function moveTowards(char, targetX, speed) {
  // V75-3 controlled scenario: freeze autonomous actors; only the local tester may move.
  if (typeof BALANCE_SCENARIO_ACTIVE !== 'undefined' && BALANCE_SCENARIO_ACTIVE) {
    const localBalancePlayer = allPlayers[NET.mySlot] || userPlayer;
    if (char !== localBalancePlayer) { char.vx = 0; return; }
  }
  const fr = (typeof venueGroundFriction==='function') ? venueGroundFriction() : 0;
  let desired = 0;
  if (char.x < targetX - 6) { desired = speed; char.facing = 1; char._moveIntentFrame = gameFrame; }
  else if (char.x > targetX + 6) { desired = -speed; char.facing = -1; char._moveIntentFrame = gameFrame; }
  if (fr && char.isGrounded) {
    if (desired) char.vx += (desired-char.vx) * (fr>.96?.10:.22);
    else char.vx *= fr;
  } else char.vx = desired;
}

// 🌟 專供訪客客戶端獨立運行的微粒動畫與銷毀器
function updateVisualEffectsOnly() {
  for (let i = visualEffects.length - 1; i >= 0; i--) {
    const fx = visualEffects[i];
    if (fx.type === 'shockwave') {
      fx.radius += 5.5; fx.alpha -= 0.08; if (fx.alpha <= 0) visualEffects.splice(i, 1);
    } else if (fx.type === 'spark') {
      fx.x += fx.vx; fx.y += fx.vy; fx.life--; if (fx.life <= 0) visualEffects.splice(i, 1);
    } else if (fx.type === 'mud_drop') {
      fx.x += fx.vx; fx.y += fx.vy; fx.vy += 0.25; fx.life--;
      if (fx.life <= 0 || fx.y >= WORLD.FLOOR_Y) visualEffects.splice(i, 1);
    } else if (fx.type === 'skin_mote') {
      fx.x += fx.vx; fx.y += fx.vy; fx.life--;
      if (fx.life <= 0) visualEffects.splice(i, 1);
    } else if (fx.type==='water_drop') {fx.x+=fx.vx;fx.y+=fx.vy;fx.vy+=.08;fx.life--;if(fx.life<=0)visualEffects.splice(i,1); } else if (fx.type==='wind_trail') {fx.life--;if(fx.life<=0)visualEffects.splice(i,1); } else if (fx.type==='solar_filament') {fx.x+=fx.vx;fx.y+=fx.vy;fx.vy+=.025;fx.life--;if(fx.life<=0)visualEffects.splice(i,1); } else if (['water_burst','storm_burst','roar_wave','time_burst','time_collapse','blade_slash','thunder_arc','gravity_arc','solar_burst','gum_snap','mud_burst','breaker_wake','breaker_impact','sonic_ring','meteor_trail','meteor_impact','soft_wall_touch','grease_burst','phantom_shell','ghost_reform','phantom_split','phantom_dissolve','kinetic_absorb','kinetic_release','kinetic_impact','kinetic_trail','grease_splatter'].includes(fx.type)) { fx.life--; if(fx.life<=0) visualEffects.splice(i,1); }
  }
}

function handlePhysics() {
  updatePhantomDecoys();
  if(ball.kineticTrailFrames>0 && ball.activeSkillTag==='動能反噬'){ball.kineticTrailFrames--;if(gameFrame%2===0)visualEffects.push({type:'kinetic_trail',x:ball.x,y:ball.y,vx:ball.vx,vy:ball.vy,life:12,maxLife:12,intensity:ball.kineticIntensity||.3});}
  if(ball.phantomRestoreFrames>0){const total=20;ball.phantomRestoreFrames--;ball.opacity=0.05+0.95*(1-ball.phantomRestoreFrames/total);if(ball.phantomRestoreFrames<=0)ball.opacity=1;}
  if (banner.active || isSettlementOpen) {
    if (banner.active) {
      banner.timer--;
      if (banner.timer <= 0) { banner.active = false; ball.resetForServe(banner.winnerTeam); }
    }
    if (hitStopFrames === 1 && ball.isIronWallSlam) {
      ironWallTracking = true; // 啟動跟隨
    }
    if (hitStopFrames <= 0) {
      ball.x += ball.vx; ball.y += ball.vy; ball.vy += WORLD.GRAVITY;
      ball.rotation += ball.vx * 0.06;
      const bannerVenue = (typeof getCurrentVenue === 'function') ? getCurrentVenue() : null;
      const bannerVoid = !!(bannerVenue && bannerVenue.arena === 'ledge' && (ball.x < bannerVenue.platformLeft || ball.x > bannerVenue.platformRight));
      // V39 天台：死球 Banner 期間也不能憑空生成地板。洞外的球持續墜樓，不反彈。
      if (!bannerVoid && ball.y >= WORLD.FLOOR_Y) {
        ball.y = WORLD.FLOOR_Y;
        ball.vy = -Math.abs(ball.vy) * 0.55;
        ball.vx *= 0.85;
      }
    } else {
      hitStopFrames--;
    }
    return;
  }

  if (hitStopFrames > 0) {
    hitStopFrames--;
    // V74-9: preserve the exact hand/ball contact frame. Only when the 1.5s freeze ends
    // do we arm the execution velocity; the rest of the world remains frozen below.
    if (hitStopFrames === 0 && ball.isIronWallSlam && ironWallExecution && ironWallExecution.phase === 'freeze') {
      ironWallExecution.phase = 'execute';
      ball.x = ironWallExecution.x; ball.y = ironWallExecution.y;
      ball.vx = ironWallExecution.execVx; ball.vy = ironWallExecution.execVy;
      playSkillAsset('SFX/skills/iron_wall_metal_2.wav',skillGain('sk_iron_wall'),{start:.01,duration:1.15,fadeOut:.20,fadeAfter:.72});
    }
    return;
  }

  // V74-9 IRON WALL EXECUTION: players, particles, timers and ambient simulation stay frozen.
  // Only the execution ball advances until its first ground rebound.
  if (ball.isIronWallSlam && ironWallExecution && ironWallExecution.phase === 'execute') {
    ball.x += ball.vx; ball.y += ball.vy; ball.rotation += ball.vx * .035 + .11;
    const fy=(typeof venueFloorYAt==='function')?venueFloorYAt(ball.x):WORLD.FLOOR_Y;
    if (ball.y + ball.radius >= fy) {
      ball.y = fy - ball.radius;
      // V74-11: impact is allowed to speak through the frozen world, then hold the exact floor-contact frame briefly.
      playSkillAsset('SFX/skills/iron_wall_ground.wav',1.0,{start:.02}); createShockwave(ball.x,fy,'#fbbf24'); createImpactSparks(ball.x,ball.y,32,'#fde68a'); triggerScreenShake(20,16);
      ball.vx = 0; ball.vy = 0;
      ironWallExecution.phase = 'impactFreeze';
      ironWallExecution.impactFreezeFrames = 15;
    }
    return;
  }

  // V74-11: short landing hit-freeze. The whistle / score / world resume happen on the rebound frame, not on impact.
  if (ball.isIronWallSlam && ironWallExecution && ironWallExecution.phase === 'impactFreeze') {
    ironWallExecution.impactFreezeFrames--;
    if (ironWallExecution.impactFreezeFrames <= 0) {
      const reboundVx = ironWallExecution.reboundVx;
      const ironWinner = ironWallExecution.ironWinner;
      ball.vx = reboundVx; ball.vy = -40;
      ball.isIronWallSlam = false; ironWallExecution = null;
      triggerFault(ironWinner, 'IRON WALL KILL!!', '銅牆鐵壁必殺反彈落地');
      // triggerFault normally adds a generic 15f scoring hit-stop. Iron Wall already used its dedicated 9f landing freeze,
      // so release immediately here: the -36 rebound, whistle and resumed world all begin on this same frame.
      hitStopFrames = 0;
      resetIronWallCamera('rebound-release'); setCinematicDuck(false);
      if (typeof NET!=='undefined' && NET.isMultiplayer && NET.isHost && NET.conn && NET.conn.open) NET.conn.send({type:'IRON_WALL_END'});
    }
    return;
  }

  if (timeSlowTimer > 0) timeSlowTimer--;
  if (chronoAnimTimer > 0) chronoAnimTimer--;

  if (serveState.active && !serveState.tossed) {
    const s = serveState.currentServer;
    const heldDx=(s.isLeft?20:-12), heldDy=(s.radius||30)-10; if((s.venueSpinTimer||0)>0){const total=s.venueSpinTotal||48,ang=(1-s.venueSpinTimer/total)*Math.PI*2,ca=Math.cos(ang),sa=Math.sin(ang);ball.x=s.x+heldDx*ca-heldDy*sa;ball.y=(s.y-(s.radius||30))+heldDx*sa+heldDy*ca;}else{ball.x=s.x+heldDx;ball.y=s.y-10;}
    const isHumanServer = (typeof isSlotHumanControlled === 'function')
      ? isSlotHumanControlled(s)
      : s.isLocallyControlled;
    if (isHumanServer && serveState.charging) {
      serveState.chargePower = Math.min(100, serveState.chargePower + 2.4);
    }
    return;
  }

  if (serveState.active && serveState.tossed) {
    ball.x += ball.vx; ball.y += ball.vy; ball.vy += WORLD.GRAVITY * 0.72 * ((typeof getCurrentVenue === 'function') ? getCurrentVenue().gravityMult : 1.0);
    const serveLocalFloorY = (typeof venueFloorYAt==='function') ? venueFloorYAt(ball.x) : WORLD.FLOOR_Y;
    if (ball.y + ball.radius >= serveLocalFloorY) {
      triggerFault(serveState.currentServer.isLeft ? 'RIGHT' : 'LEFT', 'FAULT!!', '發球拋球落地未擊中');
    }
    return;
  }

  // V29 時流差：打點時間停止。鎖定期間位置、重力、網、攔網、接球碰撞全部停止。
  // Touch 已在揮擊當下由 recordTouch() 記錄；倒數結束才真正 Ball Launch。
  if (ball.timeLagFrames > 0) {
    ball.timeLagFrames--;
    ball.rotation += 0.02;
    if (ball.timeLagFrames === 0) {
      ball.vx = ball.timeLagStoredVx; ball.vy = ball.timeLagStoredVy;
      visualEffects.push({type:'time_collapse',x:ball.x,y:ball.y,life:14,maxLife:14});
      stopSkillAsset('time_lag_hold',.035); playSkillAsset('SFX/skills/time_2.wav',1.0,{start:.03});
    }
    return;
  }

  if (ball.ironWallBounceFrames > 0) {
    ball.ironWallBounceFrames--; ball.y += ball.vy; ball.vy += WORLD.GRAVITY; ball.rotation += .12;
    if (ball.ironWallBounceFrames <= 0) { ball.isIronWallSlam=false; resetIronWallCamera('host-rebound'); setCinematicDuck(false); ball.y=(typeof venueFloorYAt==='function'?venueFloorYAt(ball.x):WORLD.FLOOR_Y)-ball.radius; ball.vy=1; }
    return;
  }

  const prevBallX = ball.x, prevBallY = ball.y;
  ball.x += ball.vx; ball.y += ball.vy;
  if ((ball.bungeeTetherFrames||0) > 0) {
    ball.bungeeTetherFrames--;
    const tp = allPlayers.find(p => p.slotKey === ball.bungeeTetherSlot);
    if (!tp || Math.hypot(ball.x-tp.x, ball.y-(tp.y-tp.radius)) > 165) {
      if (tp) visualEffects.push({type:'gum_snap',x:(ball.x+tp.x)*.5,y:(ball.y+tp.y-tp.radius)*.5,life:10,maxLife:10});
      ball.bungeeTetherFrames=0; ball.bungeeTetherSlot=null;
    }
  }
  let effGravity = WORLD.GRAVITY * 0.72 * ((typeof getCurrentVenue === 'function') ? getCurrentVenue().gravityMult : 1.0) * (typeof venueGravityFactor==='function'?venueGravityFactor():1);
  if (typeof venueBallAcceleration==='function') ball.vx += venueBallAcceleration();

  if (ball.isGravityDrop && !ball.gravityDropTriggered && Number.isFinite(ball.gravityDropTargetX)) {
    const reachedCliff = ball.vx > 0 ? ball.x >= ball.gravityDropTargetX : ball.x <= ball.gravityDropTargetX;
    if (reachedCliff) {
      ball.gravityDropTriggered = true;
      ball.vx = 0;
      ball.vy = 18.0;
      createShockwave(ball.x, ball.y, '#7e22ce');
    }
  }
  if (ball.isGravityDrop && ball.gravityDropTriggered) effGravity = WORLD.GRAVITY * 12.0;

  if (ball.isGravityDrop && gameFrame % 3 === 0) {
    visualEffects.push({type:'gravity_arc',x:ball.x-ball.vx*.55,y:ball.y-ball.vy*.35,life:16,maxLife:16,phase:Math.random()*Math.PI*2});
  }
  if (ball.activeSkillTag === '落日正弦' && gameFrame % 2 === 0) {
    visualEffects.push({type:'solar_filament',x:ball.x-ball.vx*.35,y:ball.y-ball.vy*.25,vx:-ball.vx*.035+(Math.random()-.5)*.4,vy:.35+Math.random()*.55,life:24,maxLife:24,size:1.5+Math.random()*2.5});
  }

  if (ball.mudCharges > 0 && gameFrame % 2 === 0) {
    visualEffects.push({
      type: 'mud_drop', x: ball.x, y: ball.y,
      vx: -ball.vx * 0.15 + (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2,
      size: Math.random() * 3 + 2, life: 20, maxLife: 20, color: '#78350f'
    });
  }

  // V74-19 authored attack trails.
  if (ball.activeSkillTag === '破城重槌' && (ball.breakerTrailFrames||0)>0 && !ball.breakerImpactDone) {
    ball.breakerTrailFrames--;
    if(gameFrame%2===0) visualEffects.push({type:'breaker_wake',x:ball.x,y:ball.y,vx:ball.vx,vy:ball.vy,life:12,maxLife:12});
  }
  if ((ball.isSkyComet || (ball.skyImpactFadeFrames||0)>0) && !ball.skyImpactDone) {
    if(gameFrame%2===0) visualEffects.push({type:'meteor_trail',x:ball.x,y:ball.y,vx:ball.vx,vy:ball.vy,life:16,maxLife:16});
    if((ball.skySonicSpawn||0)>0 && gameFrame%3===0){
      visualEffects.push({type:'sonic_ring',x:ball.x-ball.vx*.55,y:ball.y-ball.vy*.55,life:16,maxLife:16,angle:Math.atan2(ball.vy,ball.vx),scale:1+(3-ball.skySonicSpawn)*.16});
      ball.skySonicSpawn--;
    }
  }
  if((ball.skyImpactFadeFrames||0)>0){ball.skyImpactFadeFrames--; if(ball.skyImpactFadeFrames<=0 && ball.activeSkillTag==='天際墜石'){ball.activeSkillTag='';ball.glowColor=null;}}
  if((ball.softWallGlowFrames||0)>0 && ball.softWallGlowFrames<900) ball.softWallGlowFrames--;

  if (ball.isSineFloat) effGravity *= 0.45;

  if (ball.isSkyComet) {
    effGravity = WORLD.GRAVITY * 1.55;
    if (ball.vy > 0) ball.vy = Math.min(39.5, ball.vy + 0.8);
  }

  if (ball.isTopspin) {
    const magnusLiftCoeff = 0.00032 + (ball.topspinRating * 0.00018);
    const downforce = (ball.vx * ball.vx) * magnusLiftCoeff;
    effGravity += downforce;
  }

  ball.vy += effGravity;
  ball.rotation += ball.vx * 0.05;

  if (ball.isSineFloat && Number.isFinite(ball.sineTargetX) && Number.isFinite(ball.sineStartX)) {
    // V32 落日正弦：參數式 S 軌跡。主進度保證深入敵場，巨大正弦偏移讓讀點反覆前後翻轉。
    ball.sineElapsed++;
    const p = Math.min(1, ball.sineElapsed / Math.max(1, ball.sineDuration));
    const smoothP = p * p * (3 - 2 * p);
    const centerX = ball.sineStartX + (ball.sineTargetX - ball.sineStartX) * smoothP;
    const envelope = Math.sin(Math.PI * p); // 起點/落點皆歸零，中段最大
    const wave = Math.sin((Math.PI * 2 * ball.sineCycles * p) + (ball.floatPhase || 0));
    const desiredX = centerX + wave * ball.sineAmplitude * envelope;
    const prevX = ball.x;
    ball.x = desiredX;
    ball.vx = ball.x - prevX; // 給旋轉、AI觀測與碰撞判斷一個真實瞬時速度
    if (p >= 1) { ball.x = ball.sineTargetX; }
  } else if (ball.isFloat && Math.abs(ball.vx) > 3) {
    // V10 普通跳飄：用速度平方近似無旋球的氣動擾動。
    // 兩個不同頻率的平滑波疊加，避免規律蛇行；高速球擾動較強，但設上限避免突然轉向。
    const speedSq = Math.min(625, ball.vx * ball.vx + ball.vy * ball.vy);
    const aero = Math.min(1.0, speedSq / 400);
    const phase = ball.floatPhase || 0;
    const gust = Math.sin(gameFrame * 0.19 + phase) * 0.62 + Math.sin(gameFrame * 0.071 + phase * 1.73) * 0.38;
    const dropGust = Math.sin(gameFrame * 0.137 + phase * 0.61) * 0.55 + Math.sin(gameFrame * 0.049 + phase * 2.11) * 0.45;
    const travelDir = ball.vx >= 0 ? 1 : -1;
    ball.floatDrift = (ball.floatDrift || 0) * 0.90 + gust * aero * 0.055;
    ball.vx += travelDir * ball.floatDrift;
    ball.vy += dropGust * aero * 0.045;
    // 過網後保留原本「尾段會墜」的特色，但稍微提高到可被肉眼/落點預測感受到。
    if ((ball.vx > 0 && ball.x > WORLD.NET_X) || (ball.vx < 0 && ball.x < WORLD.NET_X)) ball.vy += 0.20 * aero;
  }

  if (ball.phantomGhostFrames > 0) ball.phantomGhostFrames--;
  if(ball.isPhantomDrop) ball.opacity=0.05; else if(ball.phantomRestoreFrames<=0) ball.opacity=1.0;

  const currentSpeed = Math.hypot(ball.vx, ball.vy);
  if (currentSpeed > maxRecordedSpeed) maxRecordedSpeed = currentSpeed;
  if (ball.topspinRating > maxRecordedSpin) maxRecordedSpin = ball.topspinRating;

  // V33 工業倉庫：20 片隱形分段鐵皮，各自有 HP / 裂痕 / 永久破洞。
  if (typeof getCurrentVenue === 'function' && getCurrentVenue().arena === 'triangle_roof' && ball.y < 285) {
    const roofPeakX = WORLD.NET_X, roofPeakY = 105, roofBaseY = 285, roofHalf = 500;
    const dx = ball.x - roofPeakX;
    if (Math.abs(dx) <= roofHalf) {
      const panelWidth = (roofHalf * 2) / WAREHOUSE_ROOF_PANEL_COUNT;
      const panelIndex = Math.max(0, Math.min(WAREHOUSE_ROOF_PANEL_COUNT-1, Math.floor((dx + roofHalf) / panelWidth)));
      const panel = warehouseRoofPanels[panelIndex];
      const roofY = roofPeakY + (Math.abs(dx) / roofHalf) * (roofBaseY - roofPeakY);
      // V34：只有球真的由屋內往上穿越鐵皮表面才算撞擊。
      // 不能只看「目前在屋頂上方」，否則落日正弦的參數式橫移會在遠處被吸到屋頂。
      const prevDx = prevBallX - roofPeakX;
      const prevRoofY = roofPeakY + (Math.abs(prevDx) / roofHalf) * (roofBaseY - roofPeakY);
      const crossedRoofFromBelow = (prevBallY - ball.radius > prevRoofY) && (ball.y - ball.radius <= roofY);
      if (panel && !panel.broken && crossedRoofFromBelow && ball.vy < 0) {
        const impactSpeed = Math.hypot(ball.vx, ball.vy);
        damageWarehouseRoofPanel(panel, impactSpeed, ball.x, roofY);
        // 這次撞擊仍由尚未完全破掉的鐵皮反射；若這一擊剛好打穿，球直接穿洞繼續走。
        if (!panel.broken) {
          ball.y = roofY + ball.radius + 1;
          const slope = (dx < 0 ? -1 : 1) * ((roofBaseY - roofPeakY) / roofHalf);
          let nx = slope, ny = -1; const nl = Math.hypot(nx, ny); nx/=nl; ny/=nl;
          const dot = ball.vx*nx + ball.vy*ny;
          ball.vx = (ball.vx - 2*dot*nx) * 0.88;
          ball.vy = (ball.vy - 2*dot*ny) * 0.88;
          ball.isSineFloat = false;
        }
        createShockwave(ball.x, ball.y, panel.broken ? '#f8fafc' : '#f59e0b');
      }
    }
  }

  // V10：角色/下方網柱仍使用 WORLD.NET_W=12；只有球碰網頂時使用較薄的 4px 帶。
  const postLeft = WORLD.NET_X - WORLD.NET_W / 2 - ball.radius;
  const postRight = WORLD.NET_X + WORLD.NET_W / 2 + ball.radius;
  const netTopBallWidth = 4;
  const topLeft = WORLD.NET_X - netTopBallWidth / 2 - ball.radius;
  const topRight = WORLD.NET_X + netTopBallWidth / 2 + ball.radius;

  if (ball.y + ball.radius >= WORLD.NET_TOP_Y && ball.y < WORLD.NET_TOP_Y + 14 &&
      ball.x > topLeft && ball.x < topRight) {
    if (ball.vy > 0) {
      ball.y = WORLD.NET_TOP_Y - ball.radius;
      ball.vy = -Math.abs(ball.vy) * 0.45; ball.vx *= 0.75; playSound('bump');
    }
  } else if (ball.y >= WORLD.NET_TOP_Y + 14 && ball.x > postLeft && ball.x < postRight) {
    const movingRight = ball.vx > 0;
    ball.vx *= -0.7; ball.x = movingRight ? postLeft : postRight; playSound('bump');
  }

  // V75-3.11：Block Timing 共用判定。幾何決定「碰不碰得到」；Timing 只改變接觸品質。
  // SAFE = 提早架手（安全牌，1.00）；PERFECT = 球接近手面時精準壓手（最高約 1.18）；
  // LATE = 球已接近/穿過手面才伸手（0.90，且有效接觸範圍略縮）。
  function getBlockTimingProfile(p) {
    if (!p || !p.wantsToBlock || !Number.isFinite(p.blockPressFrame)) {
      return {tier:'NONE', factor:1.0, reachMult:1.0, pressAge:999, pressDistance:999};
    }
    const pressAge = Math.max(0, gameFrame - p.blockPressFrame);
    const pressDistance = Number.isFinite(p.blockPressDistance) ? p.blockPressDistance : 999;
    const sideGap = Number.isFinite(p.blockPressSideGap) ? p.blockPressSideGap : 999;
    const approaching = !!p.blockPressApproaching;

    // 已穿過手面或球已不再朝手面前進：晚壓。保留碰球可能，但品質與有效範圍下降。
    if (sideGap < -6) {
      return {tier:'LATE', factor:0.90, reachMult:0.88, pressAge, pressDistance};
    }

    // 精準壓手：不是「按越晚越好」，而是 Press 當下球就在有效手面附近且仍朝手而來。
    // 55px 內達最高 1.18；到 105px 緩降至約 1.10。
    if (approaching && pressDistance <= 105 && sideGap >= -6) {
      const closeness = Math.max(0, Math.min(1, (105 - pressDistance) / 50));
      return {tier:'PERFECT', factor:1.10 + closeness * 0.08, reachMult:1.0, pressAge, pressDistance};
    }

    // 地面/起跳初期就先架手，或任何明顯提早的 Press：維持最寬、最穩的安全牌。
    return {tier:'SAFE', factor:1.00, reachMult:1.0, pressAge, pressDistance};
  }

  if (!match.inServeRally) {
    allPlayers.forEach(p => {
      const isAttacking = p.swingTimer > 0 || p.thrustTimer > 0;
      const isOpponentBall = (ball.lastHitter && ball.lastHitter.isLeft !== p.isLeft);
      let isEligibleBlock = false;

      // V75-3.11：AI 與真人完全共用同一個「必須先 Press 才有手」規則。
      // 單純網前起跳不再自動產生攔網碰撞。
      if (isOpponentBall && !isAttacking && !p.isGrounded && ball.y < WORLD.NET_TOP_Y + 50) {
        isEligibleBlock = p.isBlocking && Math.abs(p.x - WORLD.NET_X) < 110;
      }

      const timingProfile = getBlockTimingProfile(p);
      const baseBlockContactReach = 70 + ((p.stats && p.stats.perks && p.stats.perks.blockReachBonus) || 0);
      const blockContactReach = baseBlockContactReach * timingProfile.reachMult;
      const phantomEarlyGhost = ball.isPhantomDrop && ball.phantomGhostFrames > 0 && p.vy < 0;
      // V30 幽靈吊球：整段幽靈狀態都沒有「攔網手碰撞」。它仍會撞實體球網，落到後場也能被正常接球。
      // 這是技能本體的保證效果，不只騙提早起跳；因此不再讓已成形的 Block 把它蓋回來。
      if (isEligibleBlock && !ball.isPhantomDrop && !phantomEarlyGhost && getDist(p) < blockContactReach) {
        // 保留攔網前的原攻擊者；recordTouch(p, true) 會把 ball.lastHitter 改成攔網者。
        const attackingHitter = ball.lastHitter;
        const isPhantomWipeContact = ball.activeSkillTag === '幻影抹手' && ball.phantomWipeSourceIsLeft !== null && attackingHitter && attackingHitter.isLeft === ball.phantomWipeSourceIsLeft && p.isLeft !== ball.phantomWipeSourceIsLeft;
        recordTouch(p, true);
        p.isBlocking = false; p.wantsToBlock = false; match.isBlockedBack = true;
        if (p.isLeft) match.rightHits = 0; else match.leftHits = 0;

        const incomingSpeed = Math.hypot(ball.vx, ball.vy);
        const incomingVy = ball.vy, handTopY = p.y - p.radius * 2 - 20;
        // V76-3.6 BLOCK LOAD MODEL: rigidity resists penetration through the net plane.
        // Gravity/downward velocity still matters for rebound/roof trajectory, but must not be
        // double-counted as extra "breakthrough power" against a vertical blocking hand plane.
        // This also makes attack style matter naturally: DEEP/POWER carry more horizontal load,
        // while STEEP sacrifices horizontal penetration for downward angle.
        const blockImpactLoad = Math.abs(ball.vx);

        if (attackingHitter && attackingHitter.isLeft !== p.isLeft) {
          // 油滑脫手：攔網不消耗污染機會；只在真正 Receive 時觸發。
          // V74-19 Mud block contamination is handled by recordTouch/processSkillContactPayload.

        }

        let isFingertip = false, isToolOut = false;

const isIronWall = (p.stats.skill.id === 'sk_iron_wall') && p.consumeSkill('BLOCK');
        if (isIronWall) {
          hitStopFrames = 30; // user tuning: 0.5s exact-contact freeze
          ironWallTracking = true;
          setCinematicDuck(true);
          triggerScreenShake(14, 12);
          // Snapshot the REAL contact point and incoming horizontal direction before changing physics.
          const incomingVx = Number.isFinite(ball.vx) ? ball.vx : (p.isLeft ? 1 : -1);
          const reflectedVx = -incomingVx; // preserve the normal block reflection as the preferred angle
          // V74-11: readable but still vicious descent. Predict the constant-vy=28 landing and only trim horizontal speed
          // when necessary so the kill lands inside the attacker's 3m line (with a small net/line safety margin).
          const execVy = 40;
          const contactFloorY = (typeof venueFloorYAt==='function') ? venueFloorYAt(ball.x) : WORLD.FLOOR_Y;
          const travelFrames = Math.max(1, (contactFloorY - ball.radius - ball.y) / execVy);
          const attackerIsLeft = !p.isLeft;
          const safeNear = 28, safeLine = WORLD.ATTACK_LINE_DIST / 3; // V74-12: kill point stays within ~1m of the net (3m line = 186px)
          const minLandX = attackerIsLeft ? WORLD.NET_X - safeLine : WORLD.NET_X + safeNear;
          const maxLandX = attackerIsLeft ? WORLD.NET_X - safeNear : WORLD.NET_X + safeLine;
          const rawLandX = ball.x + reflectedVx * travelFrames;
          const clampedLandX = Math.max(Math.min(minLandX,maxLandX), Math.min(Math.max(minLandX,maxLandX), rawLandX));
          const execVx = (clampedLandX - ball.x) / travelFrames;
          // Rebound keeps the same reflected horizontal direction/angle cue; vertical rebound is deliberately faster at 36.
          const reboundVx = execVx;
          const ironWinner = p.isLeft ? 'LEFT' : 'RIGHT';
          ironWallExecution = {phase:'freeze',x:ball.x,y:ball.y,execVx,execVy,reboundVx,ironWinner,landingX:clampedLandX};
          ball.isIronWallSlam = true; ball.ironWallBounceFrames = 0;
          ball.vx = 0; ball.vy = 0;

          // Camera locks to the actual hand/ball impact instead of teleporting the ball to a canned point.
          camera.targetX = ball.x - (VIEW_W / 2); camera.targetY = ball.y - (VIEW_H / 2);
          camera.x = camera.targetX; camera.y = camera.targetY; camera.zoom = 1.62; camera.targetZoom = 1.62;

          // Do not overwrite player velocity/stun state: the world freeze itself suspends physics exactly.
          createImpactSparks(ball.x, ball.y, 35, '#fde68a');
          pushCallout(p.x, p.y - p.radius * 2 - 10, '銅牆鐵壁 (IRON WALL)!!', '#fbbf24');
 // 🌟 廣播給訪客端同步音效與震屏演出
          if (typeof NET !== 'undefined' && NET.isMultiplayer && NET.isHost && NET.conn && NET.conn.open) {
            NET.conn.send({
              type: 'IRON_WALL_SYNC',
              x: ball.x,
              y: ball.y
            });
          }
          return;
        }
        
        const isKineticCounter = (p.stats.skill.id === 'sk_kinetic_counter') && p.consumeSkill('BLOCK');
        if (isKineticCounter) {
          // V29 動能反噬＝攻擊型借力攔網：球必須送往「對方」上空，而不是丟回己方讓隊友擦屁股。
          // 來球越兇，先升得越高，之後下墜越有壓迫；輕吊則沒有多少動能可借。
          const borrowed = Math.max(0, incomingSpeed - 6);
          const opponentDir = p.isLeft ? 1 : -1;
          const halfSpan = WORLD.RIGHT - WORLD.NET_X;
          const targetX = p.isLeft
            ? WORLD.NET_X + halfSpan * (0.18 + Math.random() * 0.64)
            : WORLD.NET_X - halfSpan * (0.18 + Math.random() * 0.64);
          const launchUp = Math.min(31.0, Math.max(13.5, 8.5 + borrowed * 0.72));
          const g = WORLD.GRAVITY * 0.72;
          const targetY = WORLD.FLOOR_Y - ball.radius;
          const dy = targetY - ball.y;
          const flightT = (launchUp + Math.sqrt(Math.max(1, launchUp * launchUp + 2 * g * dy))) / g;
          ball.vx = (targetX - ball.x) / Math.max(1, flightT);
          if (Math.sign(ball.vx) !== opponentDir) ball.vx = opponentDir * Math.max(2.5, Math.abs(ball.vx));
          ball.vy = -launchUp;
          ball.isSpiked = true; ball.isPerfectSpike = false; ball.isUltimate = true; ball.isTopspin = false;
          ball.armorPiercing = Math.min(10, borrowed * 0.22); ball.activeSkillTag = '動能反噬'; ball.kineticSourceIsLeft = p.isLeft; ball.glowColor = '#f8fafc';
          ball.kineticTrailFrames = 180;
          const kineticIntensity = Math.max(0.18, Math.min(1, borrowed / 28));
          ball.kineticIntensity = kineticIntensity;
          visualEffects.push({type:'kinetic_absorb',x:ball.x,y:ball.y,life:18,maxLife:18,intensity:kineticIntensity,angle:Math.atan2(incomingVy, ball.vx)});
          visualEffects.push({type:'kinetic_release',x:ball.x,y:ball.y,life:24,maxLife:24,intensity:kineticIntensity});
          createShockwave(ball.x, ball.y, '#f8fafc'); createImpactSparks(ball.x,ball.y,18+Math.floor(kineticIntensity*24),'#fde68a');
          triggerScreenShake(Math.min(17, 6 + borrowed * 0.32), 11);
          pushCallout(p.x, p.y - p.radius * 2, '動能反噬・借力反攻!!', '#fde68a');
          return;
        }

        if (p.softWallRallies > 0) {
          playSkillAsset('SFX/skills/soft_wall.wav',1.0);
          ball.vx = (p.isLeft ? -1 : 1) * 3.5; ball.vy = -12.5;
          ball.isSpiked = false; ball.isPerfectSpike = false; ball.isUltimate = false; ball.isTopspin = false; ball.armorPiercing = 0;
          ball.softWallGlowFrames = 999; ball.softWallGlowSideIsLeft = p.isLeft;
          visualEffects.push({type:'soft_wall_touch',x:ball.x,y:ball.y,life:14,maxLife:14});
          pushCallout(p.x, p.y - p.radius * 2, '引力柔網!!', '#2dd4bf');
          return;
        }

        if (ball.isTacticalThrust) {
          if (isPhantomWipeContact) { isFingertip = true; }
          else { const rand = Math.random(); if (rand < 0.65) isFingertip = true; else if (rand < 0.85) isToolOut = true; }
        } else {
          isFingertip = (ball.y <= handTopY + 14);
          // V75-3.11 DEEP intent：只有真的擦到高位薄接觸區，才有自然 Touch Out 機會。
          // 不是「選 DEEP = 必定打手出界」；擦得不夠薄會 One Touch，力量夠仍可能直接打穿。
          const attackStyle = ball.attackStyle || ball._aiAttackIntentStyle || null;
          if (attackStyle === 'DEEP' && isFingertip && attackingHitter) {
            const edgeQuality = Math.max(0, Math.min(1, ((handTopY + 14) - ball.y) / 28));
            const attackerTec = Number(attackingHitter.stats?.effectiveTec ?? attackingHitter.stats?.dex ?? 30);
            const tecQuality = Math.max(0, Math.min(1, attackerTec / 60));
            const timingResistance = Math.max(-0.08, Math.min(0.16, (timingProfile.factor - 1.0) * 0.70));
            const toolChance = Math.max(0.08, Math.min(0.72, 0.18 + edgeQuality * 0.34 + tecQuality * 0.16 - timingResistance));
            isToolOut = Math.random() < toolChance;
          }
        }

        const rigidityNoise = (Math.random() - 0.5) * 4.0;
        // 指尖/高位薄接觸的結構剛性本來就低於完整手掌；Timing 再作乘數，而不是無敵判定。
        const contactZone = isFingertip ? 'FINGERTIP' : 'PALM';
        const zoneRigidityFactor = isFingertip ? 0.78 : 1.00;
        let effectiveRigidity = (p.stats.blockRigidity + rigidityNoise) * zoneRigidityFactor * timingProfile.factor;
        if (ball.armorPiercing) effectiveRigidity = Math.max(0, effectiveRigidity - ball.armorPiercing);

        p.blockTimingTier = timingProfile.tier;
        p.blockTimingFactor = timingProfile.factor;
        p.blockContactZone = contactZone;
        p.blockEffectiveRigidity = effectiveRigidity;
        const isBreakThrough = ball.isSpiked && (blockImpactLoad > effectiveRigidity);
        p.blockImpactLoad = blockImpactLoad;
        p.blockLoadMargin = effectiveRigidity - blockImpactLoad;
        p.blockOutcome = null;
        lastBlockDebug = {
          effectiveRigidity, incomingSpeed, blockImpactLoad, loadMargin:p.blockLoadMargin, ap: ball.armorPiercing || 0, isBroken: isBreakThrough,
          contactZone, timingTier:timingProfile.tier, timingFactor:timingProfile.factor,
          pressDistance:timingProfile.pressDistance, pressAge:timingProfile.pressAge
        };

        allPlayers.forEach(mate => {
          if (mate.isLeft !== p.isLeft) mate.reactionTimer = Math.max(mate.reactionTimer, mate.stats.reactionDelay);
        });

if (isBreakThrough) {
          // V5：BROKEN 不再固定保留 84% 速度。
          // 剛性越接近來球速度，攔網即使被突破也能卸掉更多力量；完全碾壓剛性時才接近原本高速穿網。
          const hitterPerks = (ball.lastHitter && ball.lastHitter.stats && ball.lastHitter.stats.perks) ? ball.lastHitter.stats.perks : {};
          const dampBonus = hitterPerks.pierceDampBonus || 0;
          const safeRigidity = Math.max(1.0, effectiveRigidity);
          const breakRatio = blockImpactLoad / safeRigidity;
          p.blockOutcome = 'BREAK_THROUGH';
          // 1.0x 剛突破≈58%，1.5x≈76%，2.0x 以上≈88%；裝備可小幅提高穿網保速。
          const baseRetain = Math.min(0.88, 0.58 + Math.max(0, breakRatio - 1.0) * 0.36);
          const retainRatio = Math.min(0.96, baseRetain * (1.0 + dampBonus));
          const verticalRetain = Math.min(0.90, 0.62 + Math.max(0, breakRatio - 1.0) * 0.24);

          ball.vx *= retainRatio; ball.vy *= verticalRetain;
          ball.isSpiked = true; ball.isPerfectSpike = false; ball.isBrokenSpike = true;
          ball.isUltimate = false; ball.isTopspin = false; ball.armorPiercing = 0;
          playSound('block_break'); triggerScreenShake(10, 10);
          createImpactSparks(ball.x, ball.y, 18, '#ef4444');
pushCallout(p.x, p.y - p.radius * 2, 'BROKEN!!', '#ef4444');
          if (ball.lastHitter) {
            distributeCoins(ball.lastHitter, 2, 'SPIKE THROUGH BLOCK', ball.lastHitter.x, ball.lastHitter.y - ball.lastHitter.radius * 2);
            pushCallout(ball.lastHitter.x, ball.lastHitter.y - ball.lastHitter.radius * 2 - 15, 'THROUGH BLOCK!!', '#facc15');
          }
          } else if (isToolOut) {
          p.blockOutcome = 'TOOL_OUT';
          const hitterPerks = (attackingHitter && attackingHitter.stats && attackingHitter.stats.perks) ? attackingHitter.stats.perks : {};
          const toolAngleBonus = hitterPerks.toolOutAngleBonus || 0;
          const outDir = p.isLeft ? 1 : -1;

          // Tool Out 是借手偏折，不應憑空增加球速。
          // 保留來球 82% 合速度；裝備的 toolOutAngleBonus 只改「彈出角度」，不再錯當速度倍率。
          const toolOutSpeed = Math.max(0.5, incomingSpeed * 0.82);
          const toolOutAngle = Math.min(1.05, 0.38 + toolAngleBonus);
          ball.vx = outDir * toolOutSpeed * Math.cos(toolOutAngle);
          ball.vy = -toolOutSpeed * Math.sin(toolOutAngle);
          ball.isSpiked = false; ball.isPerfectSpike = false; ball.isUltimate = false; ball.isTopspin = false; ball.armorPiercing = 0;
          ball.pointContext = { type: 'TOOL_OUT', actor: attackingHitter, victim: p };
          playSound('bump'); pushCallout(p.x, p.y - p.radius * 2 - 15, 'TOOL OUT SUCCESS!!', '#10b981');
        
        } else if (isFingertip) {
          p.blockOutcome = 'ONE_TOUCH';
          
          // V75-3: oneTouchAbsorb is now the single authoritative One Touch damping stat.
          const absorbPct = Math.max(0, Math.min(75, p.stats.oneTouchAbsorb || 0));
          const timingDamp = timingProfile.tier === 'PERFECT' ? 0.04 : (timingProfile.tier === 'LATE' ? -0.05 : 0);
          const retainRatio = Math.max(0.22, Math.min(0.80, 0.70 - absorbPct * 0.006 - timingDamp));
          // V5：普通 ONE TOUCH 只能卸力／改向，不得替慢球注入最低速度。
          // 水平與垂直都只保留來球的一部分；極慢球會真的變成緩球。
          ball.vx *= retainRatio;
          ball.vy = -Math.abs(incomingVy) * Math.min(0.75, retainRatio + 0.12);
          ball.isSpiked = false; ball.isPerfectSpike = false; ball.isUltimate = false; ball.isTopspin = false; ball.armorPiercing = 0;
          playSound('bump'); pushCallout(p.x, p.y - p.radius * 2 - 15, 'ONE TOUCH!', '#38bdf8', null, {type:'speech_court'});
        } else {
          p.blockOutcome = 'ROOF';
          p.addEnergy(20); proMatchStats[p.slotKey].roofKills++;
          pushCallout(p.x, p.y - 45, 'ROOF +20 能量!', '#facc15');
          
          if (ball.isPhantomDrop) { ball.isPhantomDrop = false; ball.phantomRestoreFrames = 20; visualEffects.push({type:'ghost_reform',x:ball.x,y:ball.y,life:24,maxLife:24}); }

          const strVal = (p.stats && Number.isFinite(p.stats.str)) ? p.stats.str : 20;
          const timingPress = timingProfile.tier === 'PERFECT' ? 1.08 : (timingProfile.tier === 'LATE' ? 0.94 : 1.00);
          const reboundRatio = (0.65 + (strVal * 0.006)) * timingPress;
          const reboundDir = p.isLeft ? 1 : -1;

          ball.x = WORLD.NET_X + (reboundDir * (WORLD.NET_W/2 + ball.radius + 24));
          ball.vx = reboundDir * Math.max(4.0, Math.abs(ball.vx) * (timingProfile.tier === 'PERFECT' ? 0.58 : 0.55));
          ball.vy = Math.max(5.5, incomingSpeed * reboundRatio);
          ball.isSpiked = true; ball.isPerfectSpike = (incomingSpeed > 20); ball.isUltimate = false; ball.isTopspin = false; ball.armorPiercing = 0;
          ball.pointContext = { type: 'ROOF', actor: p, victim: attackingHitter };
          playSound('block_roof'); triggerScreenShake(9, 10);
          createImpactSparks(ball.x, ball.y, 16, '#facc15');
          const perfectPress = timingProfile.tier === 'PERFECT';
          distributeCoins(p, 3, perfectPress ? 'MONSTER BLOCK' : 'ROOF BLOCK', p.x, p.y - p.radius * 2);
          pushCallout(p.x, p.y - p.radius * 2 - 15, perfectPress ? 'MONSTER BLOCK!!' : (timingProfile.tier === 'LATE' ? 'LATE ROOF!!' : 'ROOF BLOCK!!'), perfectPress ? '#fde68a' : '#facc15');
        }
        // V74-23 Phantom Wipe: the illusion is born only AFTER a real block-hand contact.
        // Real/fake balls leave the same contact point at different reflection angles, compressing back-row reaction time.
        if (isPhantomWipeContact) {
          spawnPhantomDecoyFromBlock(ball, attackingHitter, p, incomingSpeed);
          ball.activeSkillTag = ''; ball.phantomWipeSourceIsLeft = null;
        }
      }
    });
  }

  allPlayers.forEach(p => {
    if (ball.isIronWallSlam) return; // 🌟 必殺下釘不可魚躍撈起
    if (p.isDiving && !p.diveTouched && getDist(p) < 85) {
      if (recordTouch(p)) {
if (typeof NET !== 'undefined' && p.slotIndex === NET.mySlot) markReceiveDebugContact(p, 'L', 'CONTACT — DIVE RECEIVED');
p.diveTouched = true;
        executePlayerTimingReceive(p, match.isBlockedBack, 'L'); playSound('dive');
        distributeCoins(p, 2, 'DIVE SAVE', p.x, p.y - p.radius * 2);
        pushCallout(p.x, p.y - p.radius * 2 - 15, 'SUPER DIVE SAVE!!', '#38bdf8');
// 🌟 魚躍高潮閾值：地板救球永遠值得大叫！
        if (typeof triggerMangaShout === 'function') {
          triggerMangaShout(p.playerName, `${p.playerName} 魚躍極限起球！！`, '不可思議的地面撲救！球還活著！', '#38bdf8');
        }
        }
      }
    
  });
// 🌟 修復發球掛網落地二次觸發暴扣：若裁判已吹哨亮起 Banner，地面不再重判定！
  if (banner.active) {
    const bannerVenue = (typeof getCurrentVenue === 'function') ? getCurrentVenue() : null;
    const bannerRooftopVoid = !!(bannerVenue && bannerVenue.arena === 'ledge' && (ball.x < bannerVenue.platformLeft || ball.x > bannerVenue.platformRight));
    // 天台洞外得分後也不要讓球撞到隱形地板；讓它繼續掉出畫面。
    if (!bannerRooftopVoid && ball.y + ball.radius >= WORLD.FLOOR_Y) {
      ball.y = WORLD.FLOOR_Y - ball.radius;
      ball.vy = -Math.abs(ball.vy) * 0.45;
      ball.vx *= 0.85;
    } else if (bannerRooftopVoid) {
      ball.y += ball.vy; ball.vy += WORLD.GRAVITY * 0.72;
    }
    return;
  }

  const venueFloor = (typeof getCurrentVenue === 'function') ? getCurrentVenue() : null;
  const rooftopVoid = !!(venueFloor && venueFloor.arena === 'ledge' && (ball.x < venueFloor.platformLeft || ball.x > venueFloor.platformRight));
  // V38 天台：平台外是真空洞。球不會撞到隱形地板；球心一旦低於屋頂地平線才判死球。
  const _ballFloorY=(typeof venueFloorYAt==='function')?venueFloorYAt(ball.x):WORLD.FLOOR_Y;
  const _iceBallHole=!!(venueIncidentState.active==='ICE_CRACK'&&venueIncidentState.hole&&venueIncidentState.hole.phase==='open'&&Math.abs(ball.x-venueIncidentState.hole.x)<venueIncidentState.hole.w/2);
  const reachedGroundOrVoidHorizon = rooftopVoid ? (ball.y - ball.radius > WORLD.HEIGHT + 24) : (!_iceBallHole && ball.y + ball.radius >= _ballFloorY);
  if(_iceBallHole && ball.y>=WORLD.FLOOR_Y+20){ triggerFault(ball.x<WORLD.NET_X?'RIGHT':'LEFT','ICE HOLE!!','球掉進冰洞觸地'); return; }
  if (reachedGroundOrVoidHorizon) {
      if (ironWallTracking && !ball.isIronWallSlam) {
        resetIronWallCamera('host-rebound'); setCinematicDuck(false);
        if (typeof NET!=='undefined' && NET.isMultiplayer && NET.isHost && NET.conn && NET.conn.open) NET.conn.send({type:'IRON_WALL_END'});
      }
    if (ball.isPerfectSpike || ball.isSkyComet) { 
      triggerScreenShake(10, 12); createShockwave(ball.x, WORLD.FLOOR_Y, '#ef4444'); 
    }
    if(ball.isPhantomDrop){ball.isPhantomDrop=false;ball.phantomRestoreFrames=20;visualEffects.push({type:'ghost_reform',x:ball.x,y:_ballFloorY-ball.radius,life:24,maxLife:24});}
    if(ball.greaseCharges>0 && ball.greaseSourceIsLeft!==null){triggerGreaseBurst(ball.x,_ballFloorY-ball.radius,ball.greaseSourceIsLeft);}
        if(ball.mudCharges>0){createMudSplash(ball.x,_ballFloorY-ball.radius,36);visualEffects.push({type:'mud_burst',x:ball.x,y:_ballFloorY-ball.radius,life:32,maxLife:32,heavy:true});ball.mudCharges=0;ball.mudContaminationAvailable=false;ball.mudSourceIsLeft=null;playSkillAsset('SFX/skills/mud_hit.wav',1.0);}
    if(ball.activeSkillTag==='天際墜石' && !ball.skyImpactDone){triggerSkyCometImpact(ball.x,_ballFloorY-ball.radius);}
    if(ball.activeSkillTag==='動能反噬'){visualEffects.push({type:'kinetic_impact',x:ball.x,y:_ballFloorY-ball.radius,life:28,maxLife:28,intensity:ball.kineticIntensity||.3});createImpactSparks(ball.x,_ballFloorY-ball.radius,16+Math.floor((ball.kineticIntensity||.3)*24),'#fde68a');triggerScreenShake(5+Math.floor((ball.kineticIntensity||.3)*7),9);ball.kineticTrailFrames=0;ball.kineticIntensity=0;ball.kineticSourceIsLeft=null;ball.activeSkillTag='';ball.glowColor=null;}
    if(ball.activeSkillTag==='幻影抹手'){ball.activeSkillTag='';ball.phantomWipeSourceIsLeft=null;}
    if(ball.activeSkillTag==='深海重砲' && !ball.skillOutcomeSfxPlayed?.deep){ ball.skillOutcomeSfxPlayed=ball.skillOutcomeSfxPlayed||{}; ball.skillOutcomeSfxPlayed.deep=true; ball.deepWaterActive=false; createWaterBurst(ball.x,ball.y); playSkillAsset('SFX/skills/deep_2.wav',1.0,{start:.04}); }
    if(ball.activeSkillTag==='落日正弦' && !ball.skillOutcomeSfxPlayed?.solarResolved){ ball.skillOutcomeSfxPlayed=ball.skillOutcomeSfxPlayed||{}; ball.skillOutcomeSfxPlayed.solarResolved=true; visualEffects.push({type:'solar_burst',x:ball.x,y:_ballFloorY-ball.radius,life:18,maxLife:18}); ball.activeSkillTag=''; ball.glowColor=null; ball.isSineFloat=false; ball.isFloat=false; ball.sineTargetX=null; }
    if(ball.activeSkillTag==='時流差' && !ball.skillOutcomeSfxPlayed?.timeBurst){ball.skillOutcomeSfxPlayed=ball.skillOutcomeSfxPlayed||{};ball.skillOutcomeSfxPlayed.timeBurst=true;createTimeBurst(ball.x,_ballFloorY-ball.radius);triggerScreenShake(7,8);}
    if(ball.activeSkillTag==='閃電速攻') playSkillAsset('SFX/skills/flash_2.wav',1.0);
    const isOut = rooftopVoid || (ball.x < WORLD.LEFT || ball.x > WORLD.RIGHT);
    const serverSide = serveState.currentServer ? (serveState.currentServer.isLeft ? 'LEFT' : 'RIGHT') : 'LEFT';
    const receiverSide = (serverSide === 'LEFT') ? 'RIGHT' : 'LEFT';
    const receiverTouches = (serverSide === 'LEFT') ? match.rightHits : match.leftHits;
// 🌟 新 Ace 規則：發球過網後，敵方觸球不超過 2 次（最多碰 2 下，未碰第 3 下即死球）均判定為 Service ACE！
    const isAceRally = !!match.serveAceEligible && (match.serveReceiverTouches <= 1);

    if (isOut) {
      // V68 UFO 彩蛋：UFO 放出的中立球在任何玩家觸球前直接出界，不歸責任何一隊。
      if (ball.ufoNeutralRelease && !ball.lastHitter) {
        triggerUfoFairReplay();
        return;
      }
      if (ball.lastHitter) {
        const hitterSide = ball.lastHitter.isLeft ? 'LEFT' : 'RIGHT';
        const winSide = (hitterSide === 'LEFT') ? 'RIGHT' : 'LEFT';
        if (isAceRally && hitterSide === receiverSide) {
          triggerFault(serverSide, 'SERVICE ACE!!', '發球強力破壞一傳直接得分!');
        } else {
          triggerFault(winSide, 'OUT BALL!!', hitterSide === 'LEFT' ? 'TOUCH OUT / 左隊出界' : 'TOUCH OUT / 右隊出界');
        }
      } else { 
        triggerFault('RIGHT', 'OUT BALL!!', '出界'); 
      }
    } else {
      if (ball.x < WORLD.NET_X) {
        if (isAceRally && serverSide === 'RIGHT') {
          triggerFault('RIGHT', 'SERVICE ACE!!', '右隊發球直接落地得分!');
        } else {
          triggerFault('RIGHT', 'BALL IN!!', '左半場失守 (右隊得分)');
        }
      } else {
        if (isAceRally && serverSide === 'LEFT') {
          triggerFault('LEFT', 'SERVICE ACE!!', '發球無解直接落地得分 (ACE)!');
        } else {
          triggerFault('LEFT', (ball.isPerfectSpike || ball.isSkyComet) ? 'SUPER SPIKE KILL!!' : 'BALL IN!!', '右半場失守 (左隊得分!)');
        }
      }
    }
  }
}

function triggerUfoFairReplay() {
  if (banner.active || isSettlementOpen) return;
  const servingSide = (match.currentServingTeam === 'player') ? 'LEFT' : 'RIGHT';
  banner.active = true;
  banner.timer = 105;
  banner.mainText = '公正';
  banner.subText = '大家都辛苦了 🍵';
  banner.winnerTeam = servingSide; // 不加分；Banner 結束後由原發球方重發。
  banner.color = '#facc15';
  ball.ufoNeutralRelease = false;
  ball.vx *= 0.45;
  ball.vy = Math.min(ball.vy, 2.5);
  if (typeof pushCallout === 'function') pushCallout(WORLD.NET_X, 205, '🍵 公正判決', '#facc15');
  // 「大家都有的」：只頒給本場實際真人，AI 不領成就。
  allPlayers.forEach(p => {
    const human = (typeof isSlotHumanControlled==='function') ? isSlotHumanControlled(p) : p.isLocallyControlled;
    if (human && typeof awardAchievementForActor==='function') awardAchievementForActor(p, 'ach_everyone_gets_one');
  });
}

function triggerScreenShake(intensity, frames) { screenShakeIntensity = intensity; screenShakeTimer = frames; }
function createShockwave(x, y, color = '#ef4444') { 
  const fx = { type: 'shockwave', x, y, radius: 10, alpha: 1.0, color };
  visualEffects.push(fx); 
  if (typeof NET !== 'undefined' && NET.isMultiplayer && NET.isHost && NET.conn && NET.conn.open) {
    NET.conn.send({ type: 'VFX_SYNC', effect: fx });
  }
}

function createWaterBurst(x,y){ visualEffects.push({type:'water_burst',x,y,life:24,maxLife:24}); createImpactSparks(x,y,22,'#7dd3fc'); triggerScreenShake(7,8); }
function createStormBurst(x,y){ visualEffects.push({type:'storm_burst',x,y,life:20,maxLife:20}); }
function createRoarWave(x,y){ visualEffects.push({type:'roar_wave',x,y,life:28,maxLife:28}); }
function createTimeBurst(x,y){ visualEffects.push({type:'time_burst',x,y,life:28,maxLife:28}); createImpactSparks(x,y,26,'#c4b5fd'); }

function createImpactSparks(x, y, count = 8, color = '#facc15') {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2, speed = Math.random() * 8 + 3;
    const fx = { type: 'spark', x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 20, maxLife: 20, color };
    visualEffects.push(fx);
    if (typeof NET !== 'undefined' && NET.isMultiplayer && NET.isHost && NET.conn && NET.conn.open && i === 0) {
      // 網路端傳輸時壓縮封包，只傳一組通知遠端本機生成
      NET.conn.send({ type: 'VFX_SYNC', effect: fx });
    }
  }
}

// V74-21 oil membrane burst: one-shot area contamination. Only the original target team can be stained.
function triggerGreaseBurst(x,y,sourceIsLeft){
  if(ball.greaseCharges<=0 || sourceIsLeft===null || sourceIsLeft===undefined) return false;
  const splashRadius=150;
  const targetIsLeft=!sourceIsLeft;
  ball.greaseCharges=0;
  // VFX radius == gameplay radius. The outer amber ring is the actual contamination boundary.
  visualEffects.push({type:'grease_burst',x,y,life:42,maxLife:42,radius:splashRadius});
  createImpactSparks(x,y,18,'#d97706');
  let hitCount=0;
  for(const p of allPlayers){
    if(p.isLeft!==targetIsLeft) continue;
    // Measure from burst center to the player's visible body center, matching what the player sees.
    const bodyY=p.y-p.radius;
    const dist=Math.hypot(p.x-x,bodyY-y);
    if(dist<=splashRadius){
      p.greaseDebuffRallies=Math.max(p.greaseDebuffRallies||0,3);
      visualEffects.push({type:'grease_splatter',x:p.x,y:bodyY,life:30,maxLife:30});
      pushCallout(p.x,p.y-45,'油滑沾染 (DEF-25%)!!','#d97706');
      hitCount++;
    }
  }
  playSkillAsset('SFX/skills/油滑脫手.wav',1.0);
  triggerScreenShake(3,5);
  ball.greaseSourceIsLeft=null;
  ball.glowColor=null;
  return hitCount>0;
}

const phantomDecoys=[];
function spawnPhantomDecoyFromBlock(src,actor,blocker,incomingSpeed){
  if(!actor) return;
  const speed=Math.max(7.5,Math.hypot(src.vx,src.vy));
  const realAngle=Math.atan2(src.vy,src.vx);
  // Randomize which side the fake peels toward; never encode a fixed 'high fake / low real' tell.
  const side=Math.random()<.5?-1:1;
  const splitAngle=side*(0.20+Math.random()*0.24);
  const fakeAngle=realAngle+splitAngle;
  const fakeSpeed=speed*(0.94+Math.random()*0.10);
  phantomDecoys.push({x:src.x,y:src.y,vx:Math.cos(fakeAngle)*fakeSpeed,vy:Math.sin(fakeAngle)*fakeSpeed,radius:src.radius,rotation:src.rotation,life:240,fade:0,active:true,sourceIsLeft:actor.isLeft,phase:Math.random()*6.28});
  visualEffects.push({type:'phantom_split',x:src.x,y:src.y,life:18,maxLife:18,angle:realAngle});
}
function updatePhantomDecoys(){
  for(let i=phantomDecoys.length-1;i>=0;i--){const d=phantomDecoys[i];
    if(d.fade>0){d.fade--;if(d.fade<=0){phantomDecoys.splice(i,1);continue;}}
    else{
      d.x+=d.vx;d.y+=d.vy;d.vy+=WORLD.GRAVITY*.72;d.rotation+=d.vx*.06;d.life--;
      // A player can genuinely commit to the fake ball; it reacts visually but never calls recordTouch or changes rally state.
      for(const p of allPlayers){if(p.isLeft===d.sourceIsLeft)continue;const dist=Math.hypot(p.x-d.x,(p.y-p.radius)-d.y);if(dist<58 && (p.isDiving||(!p.isBlocking&&Math.abs(p.vx)>0.2))){d.fade=12;visualEffects.push({type:'phantom_dissolve',x:d.x,y:d.y,life:14,maxLife:14});break;}}
      const fy=(typeof venueFloorYAt==='function')?venueFloorYAt(d.x):WORLD.FLOOR_Y;
      if(!d.fade && d.y+d.radius>=fy){d.y=fy-d.radius;d.fade=16;visualEffects.push({type:'phantom_dissolve',x:d.x,y:d.y,life:16,maxLife:16});}
      if(d.life<=0)d.fade=12;
    }
  }
}

function createMudSplash(x, y, count = 10) {
  for (let i = 0; i < count; i++) {
    const angle = -Math.PI * 0.5 + (Math.random() - 0.5) * 1.5;
    const speed = Math.random() * 5 + 2;
    visualEffects.push({
      type: 'mud_drop', x: x + (Math.random() - 0.5) * 28, y: y,
      vx: Math.cos(angle) * (speed * 1.35), vy: Math.sin(angle) * (speed * 1.25),
      size: Math.random() * 6 + 4, life: 46, maxLife: 46, color: '#78350f'
    });
  }
}

// 🌟 套用網路同步封包 (包含狀態機、Banner 與浮動文字)
function buildCanonicalNetworkInput() {
  const down = (bind, fallback) => !!keys[bind || fallback];
  return {
    a: down(KEY_BINDS.left, 'a'), d: down(KEY_BINDS.right, 'd'),
    w: down(KEY_BINDS.jump, 'w') || !!(KEY_BINDS.jumpAlt && keys[KEY_BINDS.jumpAlt]),
    j: down(KEY_BINDS.spike, 'j'), k: down(KEY_BINDS.receive, 'k'),
    l: down(KEY_BINDS.thrust, 'l'), o: down(KEY_BINDS.set, 'o'),
    space: !!keys['space'] || down(KEY_BINDS.block, 'space')
  };
}

function applyWorldSync(data) {
  const seq = Number(data?.netSeq) || 0;
  if (typeof NET_DEBUG!=='undefined') {
    // V75-2.4: the snapshot channel is intentionally unreliable/unordered.
    // Never rewind the world when an older snapshot arrives after a newer one.
    if (seq>0 && NET_DEBUG.lastAppliedSeq>0 && seq<=NET_DEBUG.lastAppliedSeq) {
      NET_DEBUG.staleStateDrops++;
      return;
    }
    NET_DEBUG.syncCount++; NET_DEBUG.lastSyncAt=performance.now(); if(typeof netDiagRecordStateRx==='function') netDiagRecordStateRx();
    if (seq>0) {
      if (NET_DEBUG.lastRecvSeq>0 && seq>NET_DEBUG.lastRecvSeq+1) NET_DEBUG.packetGaps += (seq-NET_DEBUG.lastRecvSeq-1);
      NET_DEBUG.lastRecvSeq=Math.max(NET_DEBUG.lastRecvSeq,seq);
      NET_DEBUG.lastAppliedSeq=seq;
    }
  }
  // 1. 同步發球狀態與發球員身分
  if (data.serveInfo) {
    serveState.active = data.serveInfo.active;
    serveState.tossed = data.serveInfo.tossed;
    serveState.charging = data.serveInfo.charging;
    if (Number.isFinite(data.serveInfo.ruleFramesRemaining)) serveState.ruleFramesRemaining = data.serveInfo.ruleFramesRemaining;
    if (Number.isFinite(data.serveInfo.ruleGraceFrames)) serveState.ruleGraceFrames = data.serveInfo.ruleGraceFrames;
    if (allPlayers[data.serveInfo.serverSlot]) {
      serveState.currentServer = allPlayers[data.serveInfo.serverSlot];
    }
  }

  // 2. 球體平滑
  const snapDist = Math.hypot(ball.x - data.ball.x, ball.y - data.ball.y);
  if (snapDist > 250 || serveState.active) {
    Object.assign(ball, data.ball);
  } else {
    ball.x += (data.ball.x - ball.x) * 0.85;
    ball.y += (data.ball.y - ball.y) * 0.85;
    ball.vx = data.ball.vx;
    ball.vy = data.ball.vy;
    ball.rotation = data.ball.rotation;
    ball.opacity = data.ball.opacity;
    ball.glowColor = data.ball.glowColor;
    ball.isSpiked = data.ball.isSpiked;
    ball.isPerfectSpike = data.ball.isPerfectSpike;
    ball.isFloat = data.ball.isFloat;
    ball.activeSkillTag = data.ball.activeSkillTag;
    ball.isUltimate = !!data.ball.isUltimate;
    ball.isTopspin = !!data.ball.isTopspin;
    ball.topspinRating = data.ball.topspinRating ?? ball.topspinRating;
    ball.armorPiercing = data.ball.armorPiercing ?? 0;
    ball.isSineFloat = !!data.ball.isSineFloat; ball.sineTargetX = data.ball.sineTargetX ?? null;
    ball.isSkyComet = !!data.ball.isSkyComet;
    ball.isPhantomDrop = !!data.ball.isPhantomDrop;
    ball.isBungeeGum = !!data.ball.isBungeeGum;
    ball.isGravityDrop = !!data.ball.isGravityDrop;
    ball.gravityDropTargetX = data.ball.gravityDropTargetX ?? null; ball.gravityDropTriggered = !!data.ball.gravityDropTriggered;
    ball.greaseCharges = data.ball.greaseCharges ?? 0; ball.greaseSourceIsLeft = data.ball.greaseSourceIsLeft ?? null; ball.phantomWipeSourceIsLeft=data.ball.phantomWipeSourceIsLeft??null; ball.kineticTrailFrames=data.ball.kineticTrailFrames??0; ball.kineticIntensity=data.ball.kineticIntensity??0; ball.kineticSourceIsLeft=data.ball.kineticSourceIsLeft??null; ball.mudContaminationAvailable = !!data.ball.mudContaminationAvailable; ball.mudCharges=data.ball.mudCharges??0; ball.mudSourceIsLeft=data.ball.mudSourceIsLeft??null; ball.breakerSourceIsLeft=data.ball.breakerSourceIsLeft??null; ball.breakerImpactDone=!!data.ball.breakerImpactDone; ball.breakerTrailFrames=data.ball.breakerTrailFrames??0; ball.skySourceIsLeft=data.ball.skySourceIsLeft??null; ball.skyImpactDone=!!data.ball.skyImpactDone; ball.skyImpactFadeFrames=data.ball.skyImpactFadeFrames??0; ball.skySonicSpawn=data.ball.skySonicSpawn??0; ball.softWallGlowFrames=data.ball.softWallGlowFrames??0; ball.softWallGlowSideIsLeft=data.ball.softWallGlowSideIsLeft??null; ball.steepexecCutAvailable = !!data.ball.steepexecCutAvailable; ball.skillOutcomeSfxPlayed = ball.skillOutcomeSfxPlayed || {};
    ball.phantomGhostFrames = data.ball.phantomGhostFrames ?? 0; ball.timeLagFrames = data.ball.timeLagFrames ?? 0; ball.timeLagStoredVx = data.ball.timeLagStoredVx ?? 0; ball.timeLagStoredVy = data.ball.timeLagStoredVy ?? 0;
    ball.isIronWallSlam = !!data.ball.isIronWallSlam;
  }

  // V22: ownership and non-kinematic ball flags must also match on the guest.
  if (data.ball) {
    ball.isTacticalThrust = !!data.ball.isTacticalThrust;
    ball.isBrokenSpike = !!data.ball.isBrokenSpike;
    ball.floatPhase = data.ball.floatPhase ?? 0;
    ball.floatDrift = data.ball.floatDrift ?? 0;
    ball.hasTossedFromGodspeed = !!data.ball.hasTossedFromGodspeed;
    ball.lastHitter = (data.ball.lastHitterSlot >= 0) ? allPlayers[data.ball.lastHitterSlot] : null;
    ball.lastAttackHitter = (data.ball.lastAttackHitterSlot >= 0) ? allPlayers[data.ball.lastAttackHitterSlot] : null;
  }
  if (data.rally) Object.assign(match, data.rally);
  if (data.venueIncident && typeof venueIncidentState!=='undefined') Object.assign(venueIncidentState, data.venueIncident);
  if (Array.isArray(data.roofPanels) && typeof warehouseRoofPanels !== 'undefined') {
    data.roofPanels.forEach((hp, i) => { if (warehouseRoofPanels[i]) { warehouseRoofPanels[i].hp = hp; warehouseRoofPanels[i].broken = hp <= 0; } });
  }

  score.player = data.score.player;
  score.enemy = data.score.enemy;
  scoreDisplay.innerText = `${score.player} : ${score.enemy}`;

  if (data.chrono) {
    timeSlowTimer = data.chrono.timeSlowTimer;
    chronoAnimTimer = data.chrono.chronoAnimTimer;
    chronoCasterSide = data.chrono.chronoCasterSide;
  }

  if (data.banner) {
    Object.assign(banner, data.banner);
    const myIsLeft = (NET.mySlot === 0 || NET.mySlot === 1);
    const amIWinner = (banner.winnerTeam === 'LEFT' && myIsLeft) || (banner.winnerTeam === 'RIGHT' && !myIsLeft);
    banner.color = amIWinner ? '#38bdf8' : '#f43f5e';
  }

  data.players.forEach((pData, idx) => {
    if (allPlayers[idx]) {
      // V58: 對手沒有 Energy UI，但若剛好看到 READY 瞬間金光就能取得一次性情報。
      const prevEnergyForReadyFx = allPlayers[idx].energy || 0;
      const readyCostForFx = (allPlayers[idx].stats && allPlayers[idx].stats.skill) ? allPlayers[idx].stats.skill.cost : Infinity;
      const crossedReadyForFx = prevEnergyForReadyFx < readyCostForFx && pData.energy >= readyCostForFx;
      if (idx !== NET.mySlot && pData.playerName) {
        allPlayers[idx].playerName = pData.playerName;
      }

      if (idx === NET.mySlot) {
        // Keep only predicted kinematics local; every gameplay state/timer comes from Host.
        // V66: presentation flash is monotonic locally so a late STATE_SYNC cannot erase a just-received ENERGY_FULL event.
        const localKinematics = { x: allPlayers[idx].x, y: allPlayers[idx].y, vx: allPlayers[idx].vx, vy: allPlayers[idx].vy };
        const localEnergyReadyFlash = allPlayers[idx].energyReadyFlash || 0;
        Object.assign(allPlayers[idx], pData);
        Object.assign(allPlayers[idx], localKinematics);
        allPlayers[idx].energyReadyFlash = Math.max(localEnergyReadyFlash, pData.energyReadyFlash || 0);

        // 🌟 只在靜止待命且玩家未按移動鍵時對齊，助跑與跳發不干擾
        const isStationaryPrep = (serveState.active && !serveState.tossed && !serveState.charging);
        const isPressingMove = keys[KEY_BINDS.left] || keys[KEY_BINDS.right] || keys['a'] || keys['d'];

        if (isStationaryPrep && !isPressingMove) {
          allPlayers[idx].x = pData.x;
          allPlayers[idx].y = pData.y;
          allPlayers[idx].vx = 0;
          allPlayers[idx].vy = 0;
        } else {
          const correctionDist = Math.hypot(allPlayers[idx].x - pData.x, allPlayers[idx].y - pData.y);
          if (typeof NET_DEBUG!=='undefined') { NET_DEBUG.correctionSum += correctionDist; NET_DEBUG.correctionCount++; NET_DEBUG.correctionMax=Math.max(NET_DEBUG.correctionMax,correctionDist); }
          // V64 reconciliation: 小誤差忽略，中誤差柔和收斂，只有真正脫軌才快速校正。
          // 避免 60Hz STATE_SYNC 每包都把 Guest 自己角色拉一下造成「黏」。
          // V75-2.2: adaptive reconciliation. The old 28px dead-zone + 10% correction
          // could build a saw-tooth drift until a 180px emergency pull. Keep tiny network
          // prediction error invisible, but converge medium divergence before it becomes a snap.
          let reconcileGain=0;
          if (correctionDist > 120) { reconcileGain=0.65; if (typeof NET_DEBUG!=='undefined') NET_DEBUG.hardReconciles++; }
          else if (correctionDist > 40) { reconcileGain=0.32; if (typeof NET_DEBUG!=='undefined') NET_DEBUG.mediumReconciles++; }
          else if (correctionDist > 10) { reconcileGain=0.16; if (typeof NET_DEBUG!=='undefined') NET_DEBUG.mediumReconciles++; }
          if (reconcileGain>0) {
            allPlayers[idx].x += (pData.x - allPlayers[idx].x) * reconcileGain;
            allPlayers[idx].y += (pData.y - allPlayers[idx].y) * reconcileGain;
          }
          // Velocity convergence follows positional severity; do not hard-overwrite ice inertia.
          const dvx = pData.vx - allPlayers[idx].vx;
          const velGain = correctionDist>120 ? 0.35 : correctionDist>40 ? 0.22 : 0.12;
          if (Math.abs(dvx) > 1.0) allPlayers[idx].vx += dvx * velGain;
        }
      } else {
        Object.assign(allPlayers[idx], pData);
      }
      if (crossedReadyForFx) allPlayers[idx].energyReadyFlash = 52;
    }
  });

  updateSideUltHUD();
}
function updateGuestGhostTrailsOnly() {
  // Guest exits before the authoritative allPlayers update loop, so explicit network FX
  // (notably Rolling Thunder afterimages) need their own visual-only lifetime tick.
  allPlayers.forEach(p => {
    if (!p || !p.ghostTrail) return;
    for (let i = p.ghostTrail.length - 1; i >= 0; i--) {
      p.ghostTrail[i].alpha -= 0.07;
      if (p.ghostTrail[i].alpha <= 0) p.ghostTrail.splice(i, 1);
    }
  });
}

// V61 NETWORK HOTFIX: PeerJS BinaryPack throws on non-finite numeric values (e.g. Infinity/NaN).
// Sanitize authoritative sync payloads so one bad venue/runtime value can never freeze the Host loop.
function makeNetworkSafe(value, path='root') {
  if (value === undefined) return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      if (typeof NET_DEBUG!=='undefined') NET_DEBUG.sanitizeCount++;
      // Log only the first few occurrences; repeated 60Hz warnings can stall DevTools itself.
      if (typeof NET_DEBUG==='undefined' || NET_DEBUG.sanitizeCount<=5) console.warn(`[NET SANITIZE] ${path}:`, value, '-> null');
      return null;
    }
    return value;
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map((v,i)=>makeNetworkSafe(v, `${path}[${i}]`));
  if (typeof value === 'object') {
    const out={};
    for (const [k,v] of Object.entries(value)) {
      if (typeof v === 'function') continue;
      out[k]=makeNetworkSafe(v, `${path}.${k}`);
    }
    return out;
  }
  return null;
}

// V75-2.5 ADAPTIVE STATE TRANSPORT
// Snapshots are disposable. Sender queue pressure AND Guest receive-health can lower the send rate.
// Recovery is deliberately gradual so a weak path cannot oscillate 60<->15 Hz every second.
const NET_STATE_FALLBACK_INTERVAL = 6; // 10 Hz while dedicated state channel is unavailable
const NET_STATE_BUFFER_STOP = 48 * 1024;
const NET_STATE_BUFFER_FALLBACK_HIGH = 24 * 1024;
function getPeerBufferedBytes(conn){ try{return conn?.dataChannel?.bufferedAmount||0;}catch(e){return 0;} }
function getPeerQueuedMessages(conn){ try{return conn?.bufferSize||0;}catch(e){return 0;} }
function getStateTxConnection(){
  if (typeof NET==='undefined') return null;
  if (NET.stateConn && NET.stateConn.open) return NET.stateConn;
  return (NET.conn && NET.conn.open) ? NET.conn : null;
}
function updateAdaptiveStateRate(buffered, queued){
  if(typeof NET_DEBUG==='undefined') return 60;
  const now=performance.now(), cur=NET_DEBUG.adaptiveStateHz||60;
  let target=60, reason='HEALTHY';
  if(buffered>=NET_STATE_BUFFER_STOP || queued>0){ target=10; reason='LOCAL_QUEUE'; }
  else if(buffered>=24*1024){ target=15; reason='LOCAL_BUF'; }
  else if(buffered>=12*1024){ target=30; reason='LOCAL_BUF'; }
  const rr=NET_DEBUG.remoteStateRx||0, rtt=NET_DEBUG.remoteRtt||0, age=NET_DEBUG.remoteStateAge||0;
  // Only judge RX after feedback exists. Compare against the CURRENT requested rate so an intentional
  // 30 Hz mode does not falsely diagnose itself as packet loss.
  if(rtt>2000 || age>900){ target=Math.min(target,10); reason='PEER_STALL'; }
  else if(rtt>700 || age>350){ target=Math.min(target,15); reason='PEER_CONGEST'; }
  else if(rtt>250 || age>180){ target=Math.min(target,30); reason='PEER_SLOW'; }
  else if(rr>0 && rr < Math.max(8,cur*0.55)){ target=Math.min(target, Math.max(15, cur===60?30:cur)); reason='PEER_RX_DROP'; }
  if(target < cur){ NET_DEBUG.adaptiveStateHz=target; NET_DEBUG.adaptiveReason=reason; NET_DEBUG.adaptiveLastChangeAt=now; return target; }
  if(target > cur && now-(NET_DEBUG.adaptiveLastChangeAt||0)>3000){
    const up = cur<=10?15:cur<=15?30:60;
    NET_DEBUG.adaptiveStateHz=Math.min(target,up); NET_DEBUG.adaptiveReason='RECOVER'; NET_DEBUG.adaptiveLastChangeAt=now;
    return NET_DEBUG.adaptiveStateHz;
  }
  NET_DEBUG.adaptiveReason = target<60 ? reason : (cur<60?'RECOVER_WAIT':'HEALTHY');
  return cur;
}
function shouldSendWorldSnapshot(conn){
  if(!conn || !conn.open) return false;
  const dedicated = (typeof NET!=='undefined' && NET.stateConn===conn && NET.stateConn?.open);
  const buffered=getPeerBufferedBytes(conn), queued=getPeerQueuedMessages(conn);
  if(!dedicated){
    if(gameFrame % NET_STATE_FALLBACK_INTERVAL !== 0) return false;
    if(buffered>=NET_STATE_BUFFER_FALLBACK_HIGH || queued>0){ if(typeof NET_DEBUG!=='undefined') NET_DEBUG.stateSkipCount++; return false; }
    return true;
  }
  const hz=updateAdaptiveStateRate(buffered,queued);
  if(buffered>=NET_STATE_BUFFER_STOP || queued>0){ if(typeof NET_DEBUG!=='undefined') NET_DEBUG.stateSkipCount++; return false; }
  const interval = hz>=60?1:hz>=30?2:hz>=20?3:hz>=15?4:6;
  if(gameFrame % interval !== 0) return false;
  return true;
}
let _lastNetInputSig='', _lastNetInputSentAt=0;
function sendGuestInputSmart(){
  if(typeof NET==='undefined'||!NET.conn||!NET.conn.open) return;
  const payload=buildCanonicalNetworkInput();
  const sig=`${+payload.a}${+payload.d}${+payload.w}${+payload.j}${+payload.k}${+payload.l}${+payload.o}${+payload.space}`;
  const now=performance.now();
  // Send edges immediately; while held, a 100 ms heartbeat is enough because Host keeps the last state.
  if(sig===_lastNetInputSig && now-_lastNetInputSentAt<100) return;
  // When the control channel is under pressure, drop redundant heartbeats but never suppress a key edge.
  const changed=sig!==_lastNetInputSig;
  if(!changed && getPeerBufferedBytes(NET.conn)>32*1024) return;
  try{
    NET.conn.send({type:'INPUT',keys:payload});
    _lastNetInputSig=sig; _lastNetInputSentAt=now;
    if(typeof NET_DEBUG!=='undefined') NET_DEBUG.inputTxCount++;
  }catch(e){ if(typeof NET_DEBUG!=='undefined'){NET_DEBUG.sendErrors++;NET_DEBUG.lastConnError=String(e?.message||e);} }
}

function fixedUpdate() {
  if(typeof NET_DIAG!=='undefined' && NET_DIAG.startedAt && !NET_DIAG.finalized) NET_DIAG.simCount++;
  gameFrame++;
  // V75-3 controlled scenario feed: setup happens inside the real 60 Hz game loop.
  if (typeof BALANCE_LAB !== 'undefined' && BALANCE_LAB && typeof BALANCE_LAB.tickScenario === 'function') BALANCE_LAB.tickScenario();
  // V74-10 TRUE WORLD FREEZE: while Iron Wall owns the rally, absolutely no player/AI/particle/venue simulation advances.
  // handlePhysics itself advances only the cinematic timer, then only the intangible execution ball.
  if (ball.isIronWallSlam && ironWallExecution) {
    // V75-2.3: this early-return used to bypass both NET telemetry and the Iron Wall watchdog.
    // If the cinematic lifecycle ever got stuck, Host STATE_SYNC could stop forever while the Peer connection itself stayed alive.
    if (typeof tickNetDebug==='function') tickNetDebug();
    ironWallWatchdog++;
    if (typeof NET_DEBUG!=='undefined') NET_DEBUG.freezeWatchdog=ironWallWatchdog;
    if (ironWallWatchdog > 240) {
      console.warn('[NET/CINEMATIC WATCHDOG] Iron Wall freeze exceeded 240f; forcing recovery.');
      resetIronWallCamera('freeze-watchdog');
      ironWallWatchdog=0;
      if (typeof NET_DEBUG!=='undefined') NET_DEBUG.freezeWatchdog=0;
    } else {
      handlePhysics();
      camera.update(ball);
      return;
    }
  } else if (typeof NET_DEBUG!=='undefined') NET_DEBUG.freezeWatchdog=0;
  if ((typeof NET==='undefined' || !NET.isMultiplayer || NET.isHost) && typeof updateServeRuleClock==='function') updateServeRuleClock();
  if (typeof tickNetDebug==='function') tickNetDebug();
  if (typeof updateVenueIncidents === 'function') updateVenueIncidents();

  if (typeof NET !== 'undefined' && NET.isMultiplayer) {
    if (NET.isHost) {
      const stateTxConn = getStateTxConnection();
      if (shouldSendWorldSnapshot(stateTxConn)) {
try { stateTxConn.send(makeNetworkSafe({
          type: 'STATE_SYNC',
          netSeq: (typeof NET_DEBUG!=='undefined' ? ++NET_DEBUG.packetSeq : gameFrame),
          hostFrame: gameFrame,
          serveInfo: {
            active: serveState.active,
            serverSlot: serveState.currentServer ? serveState.currentServer.slotIndex : 0,
            tossed: serveState.tossed,
            charging: serveState.charging,
            ruleFramesRemaining: serveState.ruleFramesRemaining,
            ruleGraceFrames: serveState.ruleGraceFrames
          },
          ball: {
            x: ball.x, y: ball.y, vx: ball.vx, vy: ball.vy, rotation: ball.rotation,
            opacity: ball.opacity, glowColor: ball.glowColor, isSpiked: ball.isSpiked,
            isPerfectSpike: ball.isPerfectSpike, isFloat: ball.isFloat, activeSkillTag: ball.activeSkillTag,
            isUltimate: ball.isUltimate, isTopspin: ball.isTopspin, topspinRating: ball.topspinRating, armorPiercing: ball.armorPiercing,
            isSineFloat: ball.isSineFloat, sineTargetX: ball.sineTargetX, isSkyComet: ball.isSkyComet, isPhantomDrop: ball.isPhantomDrop,
            isBungeeGum: ball.isBungeeGum, isGravityDrop: ball.isGravityDrop, gravityDropTargetX: ball.gravityDropTargetX, gravityDropTriggered: ball.gravityDropTriggered, greaseCharges: ball.greaseCharges, greaseSourceIsLeft: ball.greaseSourceIsLeft, phantomWipeSourceIsLeft: ball.phantomWipeSourceIsLeft, kineticTrailFrames: ball.kineticTrailFrames, kineticIntensity: ball.kineticIntensity, kineticSourceIsLeft: ball.kineticSourceIsLeft, mudContaminationAvailable: ball.mudContaminationAvailable, mudCharges: ball.mudCharges, mudSourceIsLeft: ball.mudSourceIsLeft, breakerSourceIsLeft: ball.breakerSourceIsLeft, breakerImpactDone: ball.breakerImpactDone, breakerTrailFrames: ball.breakerTrailFrames, skySourceIsLeft: ball.skySourceIsLeft, skyImpactDone: ball.skyImpactDone, skyImpactFadeFrames: ball.skyImpactFadeFrames, skySonicSpawn: ball.skySonicSpawn, softWallGlowFrames: ball.softWallGlowFrames, softWallGlowSideIsLeft: ball.softWallGlowSideIsLeft, steepexecCutAvailable: ball.steepexecCutAvailable, phantomGhostFrames: ball.phantomGhostFrames, timeLagFrames: ball.timeLagFrames, timeLagStoredVx: ball.timeLagStoredVx, timeLagStoredVy: ball.timeLagStoredVy,
            isIronWallSlam: !!ball.isIronWallSlam, isTacticalThrust: !!ball.isTacticalThrust,
            isBrokenSpike: !!ball.isBrokenSpike, floatPhase: ball.floatPhase, floatDrift: ball.floatDrift,
            hasTossedFromGodspeed: !!ball.hasTossedFromGodspeed,
            lastHitterSlot: ball.lastHitter ? ball.lastHitter.slotIndex : -1,
            lastAttackHitterSlot: ball.lastAttackHitter ? ball.lastAttackHitter.slotIndex : -1
          },
          rally: { leftHits: match.leftHits, rightHits: match.rightHits, lastTouchFrame: match.lastTouchFrame,
            isBlockedBack: !!match.isBlockedBack, inServeRally: !!match.inServeRally,
            currentServingTeam: match.currentServingTeam, serveAceEligible: !!match.serveAceEligible,
            serveReceiverTouches: match.serveReceiverTouches },
          roofPanels: (typeof warehouseRoofPanels !== 'undefined') ? warehouseRoofPanels.map(p => Math.max(0, Math.round(p.hp))) : [],
          venueIncident: (typeof venueIncidentState!=='undefined') ? {...venueIncidentState} : null,
          score: score,
          banner: { active: banner.active, timer: banner.timer, mainText: banner.mainText, subText: banner.subText, color: banner.color, winnerTeam: banner.winnerTeam },
          chrono: { timeSlowTimer, chronoAnimTimer, chronoCasterSide },
          players: allPlayers.map(p => ({
            x: p.x, y: p.y, vx: p.vx, vy: p.vy, facing: p.facing,
            playerName: p.playerName || p.name,
            squashX: p.squashX, squashY: p.squashY, isDiving: p.isDiving,
            isBlocking: p.isBlocking, swingTimer: p.swingTimer, thrustTimer: p.thrustTimer,
            energy: p.energy, energyReadyFlash: p.energyReadyFlash || 0, jumpExhaustion: p.jumpExhaustion,
            depressedRallies: p.depressedRallies, excitedRallies: p.excitedRallies,
            mudDebuffTimer: p.mudDebuffTimer, mudDebuffRallies: p.mudDebuffRallies, softWallRallies: p.softWallRallies, roarMoodRallies: p.roarMoodRallies, flowAbsorbRallies: p.flowAbsorbRallies,
            godspeedCharges: p.godspeedCharges, greaseDebuffRallies: p.greaseDebuffRallies,
            isGrounded: p.isGrounded, wantsToBlock: p.wantsToBlock,
            diveTimer: p.diveTimer, diveTouched: p.diveTouched, blockTimer: p.blockTimer,
            stunTimer: p.stunTimer, reactionTimer: p.reactionTimer,
            venueDizzyTimer: p.venueDizzyTimer||0, venueDizzyTotal: p.venueDizzyTotal||0,
            venueShockTimer: p.venueShockTimer||0, venueShockRecoveryTimer: p.venueShockRecoveryTimer||0, venueShockRecoveryTotal: p.venueShockRecoveryTotal||0,
            despairTimer: p.despairTimer, recheckDelay: p.recheckDelay, runMomentum: p.runMomentum
          }))
        }, 'STATE_SYNC')); if(typeof NET_DEBUG!=='undefined') NET_DEBUG.txCount++; if(typeof netDiagRecordStateTx==='function') netDiagRecordStateTx(); } catch(e) { if(typeof NET_DEBUG!=='undefined'){NET_DEBUG.sendErrors++;NET_DEBUG.lastConnError=String(e?.message||e);} console.warn('[NET STATE_SYNC SEND]',e); }
      }

      // 🌟 房主為遠端訪客執行動作分流
      const rk = NET.remoteKeys || {};
      const guestSlot = (NET.mode === 'COOP') ? 1 : 2;
      const guestPlayer = allPlayers[guestSlot];
      const forwardDir = (NET.mode === 'COOP') ? 1 : -1;

      const guestFr=(typeof venueGroundFriction==='function'?venueGroundFriction():0), guestOldVx=guestPlayer.vx;
      if (guestFr) {
        if (guestPlayer.isGrounded) { guestPlayer.vx=guestOldVx*guestFr; guestPlayer.venueAirCarryVx=guestPlayer.vx; }
        else { if(!Number.isFinite(guestPlayer.venueAirCarryVx)) guestPlayer.venueAirCarryVx=guestOldVx; guestPlayer.vx=guestPlayer.venueAirCarryVx; }
      } else { guestPlayer.vx=0; guestPlayer.venueAirCarryVx=0; }
      if (rk['a']) { guestPlayer._moveIntentFrame=gameFrame; const t=-forwardDir*guestPlayer.effectiveSpeed*(typeof venuePlayerSpeedFactor==='function'?venuePlayerSpeedFactor(guestPlayer):1); guestPlayer.vx=guestFr?guestPlayer.vx+(t-guestPlayer.vx)*(guestFr>.96?.10:.22):t; guestPlayer.facing=-forwardDir; }
      if (rk['d']) { guestPlayer._moveIntentFrame=gameFrame; const t=forwardDir*guestPlayer.effectiveSpeed*(typeof venuePlayerSpeedFactor==='function'?venuePlayerSpeedFactor(guestPlayer):1); guestPlayer.vx=guestFr?guestPlayer.vx+(t-guestPlayer.vx)*(guestFr>.96?.10:.22):t; guestPlayer.facing=forwardDir; }
      if (rk['w']) guestPlayer.jump();
      
// 🌟 訪客按鍵呼叫防二觸與邊緣判定分流器
      executeGuestActionWithEdge(guestPlayer, rk);
    } else {
      sendGuestInputSmart();

      // 🌟 訪客客戶端預測 (0ms 本機先動)：自己的角色按下 A/D/W 立即位移，告別笨重感
      const myHero = allPlayers[NET.mySlot];
      if (myHero && !isPaused && !isSettlementOpen) {
        const forwardDir = (NET.mode === 'COOP') ? 1 : -1;
        const fr=(typeof venueGroundFriction==='function'?venueGroundFriction():0), oldVx=myHero.vx;
        if (fr) {
          if (myHero.isGrounded) { myHero.vx=oldVx*fr; myHero.venueAirCarryVx=myHero.vx; }
          else { if(!Number.isFinite(myHero.venueAirCarryVx)) myHero.venueAirCarryVx=oldVx; myHero.vx=myHero.venueAirCarryVx; }
        } else { myHero.vx=0; myHero.venueAirCarryVx=0; }
        if (keys[KEY_BINDS.left]) { const t=-forwardDir*myHero.effectiveSpeed*(typeof venuePlayerSpeedFactor==='function'?venuePlayerSpeedFactor(myHero):1); myHero.vx=fr?myHero.vx+(t-myHero.vx)*(fr>.96?.10:.22):t; myHero.facing=-forwardDir; }
        if (keys[KEY_BINDS.right]) { const t=forwardDir*myHero.effectiveSpeed*(typeof venuePlayerSpeedFactor==='function'?venuePlayerSpeedFactor(myHero):1); myHero.vx=fr?myHero.vx+(t-myHero.vx)*(fr>.96?.10:.22):t; myHero.facing=forwardDir; }
        if (keys[KEY_BINDS.jump] || (KEY_BINDS.jumpAlt && keys[KEY_BINDS.jumpAlt])) myHero.jump();
        // V64: Dive 是有離地/速度/Timer 的離散動作，不能 Guest 與 Host 各自啟動一次。
        // 只送 INPUT，由 Host 啟動並同步 isDiving/vx/vy；否則原地 L 會因雙重 launch/reconcile 抽動。
        myHero.update();
      }

// 🌟 訪客端復刻房主鏡頭運鏡週期（每 fixed tick 僅更新一次）
      if (ball.isIronWallSlam || ironWallTracking || hitStopFrames>0) ironWallWatchdog++; else ironWallWatchdog=0;
      if (ironWallWatchdog > 240) resetIronWallCamera('watchdog');
      if (hitStopFrames > 0) {
        hitStopFrames--;
        if (hitStopFrames === 1 && ball.isIronWallSlam) {
          ironWallTracking = true; // 1. 定格結束，鏡頭咬住球高速俯衝
        }
      }

      // V24：Iron Wall 的結束條件不能只靠 Guest「看見球落地」。
      // Host 是 Rally 權威，Host 落地後會先清掉 isIronWallSlam；若下一包同步時球已進入
      // Banner / resetForServe，Guest 可能永遠錯過「球在地板」那一幀，ironWallTracking 就會卡死。
      // 因此 Guest 同時接受兩種合法的結束訊號：
      // 1) 自己確實看見 Iron Wall 球落地；2) Host STATE_SYNC 已明確清除 isIronWallSlam。
      const guestSawIronWallLand = ball.y + ball.radius >= WORLD.FLOOR_Y - 5;
      const hostEndedIronWall = ironWallTracking && hitStopFrames <= 0 && !ball.isIronWallSlam;
      if ((ball.isIronWallSlam || ironWallTracking) && (guestSawIronWallLand || hostEndedIronWall)) {
        resetIronWallCamera('guest-state-end');
      }

      camera.update(ball);
      // 🌟 訪客維持視覺特效與角色殘影生命週期倒數
      updateVisualEffectsOnly();
      updateGuestGhostTrailsOnly();
      return;
        }
  }

// 🌟 本機玩家移動（支援自定義鍵與 Space/W 雙跳躍）
  const myPlayer = allPlayers[NET.mySlot] || userPlayer;

  const myPlayerIsHuman = (typeof isSlotHumanControlled === 'function') ? isSlotHumanControlled(myPlayer) : myPlayer.isLocallyControlled;

  // 🌟 核心約束：只要還在接重扣硬直中 (stunTimer > 0)，禁止任何按鍵操控，讓後退滑行完整跑完！
  // V75-3.3: local-slot movement is gated by ownership, not by slot identity. This is
  // essential for 4-AI scrimmage: otherwise the human movement block zeroes the AI's vx
  // before Player.update() every frame, creating the old "fake AI" that could touch but not move.
  if (myPlayerIsHuman && myPlayer.stunTimer <= 0) {
    const _oldVenueVx=myPlayer.vx, _fr=(typeof venueGroundFriction==='function'?venueGroundFriction():0);
    // V52：普通場地維持原手感；只有冰面／濕地在離地後繼承起跳瞬間的水平慣性。
    // 關鍵是不要在空中每幀把 vx 歸零後重新加速，否則會像每跳一次都重新起步。
    if (_fr) {
      if (myPlayer.isGrounded) {
        myPlayer.vx = _oldVenueVx * _fr;
        myPlayer.venueAirCarryVx = myPlayer.vx;
      } else {
        if (!Number.isFinite(myPlayer.venueAirCarryVx)) myPlayer.venueAirCarryVx = _oldVenueVx;
        myPlayer.vx = myPlayer.venueAirCarryVx;
      }
    } else {
      myPlayer.vx = 0;
      myPlayer.venueAirCarryVx = 0;
    }
    const isLeftPress = keys[KEY_BINDS.left];
    const isRightPress = keys[KEY_BINDS.right];
    const isJumpPress = keys[KEY_BINDS.jump] || (KEY_BINDS.jumpAlt && keys[KEY_BINDS.jumpAlt]) || keys['w'];

    if (isLeftPress) { myPlayer._moveIntentFrame=gameFrame; const t=-myPlayer.effectiveSpeed*(typeof venuePlayerSpeedFactor==='function'?venuePlayerSpeedFactor(myPlayer):1); myPlayer.vx=_fr?myPlayer.vx+(t-myPlayer.vx)*(_fr>.96?.10:.22):t; myPlayer.facing=-1; }
    if (isRightPress) { myPlayer._moveIntentFrame=gameFrame; const t=myPlayer.effectiveSpeed*(typeof venuePlayerSpeedFactor==='function'?venuePlayerSpeedFactor(myPlayer):1); myPlayer.vx=_fr?myPlayer.vx+(t-myPlayer.vx)*(_fr>.96?.10:.22):t; myPlayer.facing=1; }
    if (isJumpPress) myPlayer.jump();
  }
  // 處理 K 鍵緩衝檢定。AI owns the local slot during Balance scrimmage, so stale human
  // K buffers must never fire into the AI rally.
  if (!myPlayerIsHuman) receiveInputBuffer = 0;
  if (myPlayerIsHuman && receiveInputBuffer > 0) {
    receiveInputBuffer--;
    if (getDist(myPlayer) <= Math.max(70, (myPlayer.stats.reach || 70))) {
      handleUserBump(myPlayer);
      receiveInputBuffer = 0;
    }
  }

  allPlayers.forEach(p => {
    p.update();
    const cosmetics = (p.card && p.card.cosmetics) ? p.card.cosmetics : { effect: 'fx_none' };
    const effectObj = (typeof COSMETICS_DB !== 'undefined') ? COSMETICS_DB.effects.find(e => e.id === cosmetics.effect) : null;
    const isMoving = Math.abs(p.vx) > 1.2 || !p.isGrounded;

    if (gameFrame % 3 === 0) {
      if (isMoving) {
        p.ghostTrail.push({ x: p.x, y: p.y, facing: p.facing, squashX: p.squashX, squashY: p.squashY, isDiving: p.isDiving, alpha: 0.55 });
      }
      if (effectObj && effectObj.glow && (isMoving || Math.random() < 0.3)) {
        visualEffects.push({
          type: 'skin_mote',
          color: effectObj.glow,
          x: p.x + (Math.random() - 0.5) * 16,
          y: p.y - p.radius + (Math.random() - 0.5) * 16,
          vx: -p.vx * 0.15 + (Math.random() - 0.5) * 0.8,
          vy: -Math.random() * 1.5 - 0.4,
          size: 2.5,
          life: 20,
          maxLife: 20
        });
      }
    }

    for (let i = p.ghostTrail.length - 1; i >= 0; i--) {
      p.ghostTrail[i].alpha -= 0.07;
      if (p.ghostTrail[i].alpha <= 0) p.ghostTrail.splice(i, 1);
    }
  });

  if (serveState.active) {
    const isServerHuman = (typeof isSlotHumanControlled === 'function')
      ? isSlotHumanControlled(serveState.currentServer)
      : serveState.currentServer.isLocallyControlled;

    // V75-3.3: the local slot may legitimately be AI-owned in scrimmage. Server identity
    // must not be used as a proxy for human ownership.
    if (!isServerHuman && serveState.aiServeTimer > -120) {
      serveState.aiServeTimer--;
      const server = serveState.currentServer, isLeft = server.isLeft;
      const facingDir = isLeft ? 1 : -1;

      // V9：AI Controller 只模擬玩家 K / A-D / W / J-L。
      // K：直接使用玩家放開 K 的同一條拋球公式，不再使用舊 AI 1.15 倍超高拋。
      if (!serveState.tossed && serveState.aiServeTimer === 40) {
        serveState.tossed = true;
        const aiTossRatio = (getCurrentVenue().id === 'moon') ? 0.18 : 0.34; // 月面用較低拋球，避免低重力讓等待時間拖過起跳窗。
        ball.vx = isLeft ? 1.0 : -1.0;
        ball.vy = server.stats.jump * (0.80 + aiTossRatio * 0.65);
        playSound('set');
      }

      if (serveState.tossed) {
        // A/D：像玩家助跑一樣追自己的拋球；保持在線外起跳，避免踩線。
        const safeLineX = isLeft ? WORLD.LEFT - 12 : WORLD.RIGHT + 12;
        const desiredX = ball.x - facingDir * 24;
        const legalDesiredX = isLeft ? Math.min(desiredX, safeLineX) : Math.max(desiredX, safeLineX);
        if (server.isGrounded) {
          // V13：發球助跑不能直接用 full-speed moveTowards 追一個只以 1px/f 移動的拋球點。
          // 高 AGI 角色以前會跨過 ±6px 停車窗來回震盪，並在 full vx 狀態按 W，
          // 起跳後空中又不會煞車，因此神威這類高速角色會整個飛過底線甚至衝向球柱。
          // 這裡仍然只模擬 A/D：距離夠遠才按方向鍵；進入「一幀可跨過」的煞車區就放開。
          const serveDeltaX = legalDesiredX - server.x;
          const brakeZone = Math.max(8, server.effectiveSpeed + 6);
          if (Math.abs(serveDeltaX) > brakeZone) {
            moveTowards(server, legalDesiredX, server.effectiveSpeed);
          } else {
            server.vx = 0; // 放開 A/D；runMomentum 仍由既有角色 update 保存/衰減。
            server.facing = facingDir;
          }
        } else {
          // 空中只保留起跳時的既有水平速度，不額外瞬移追球。
          server.facing = facingDir;
        }

        const distNow = getDist(server);
        const ballDescending = ball.vy > 0;
        const ballHeightAboveFloor = WORLD.FLOOR_Y - ball.y;
        const takeoffTargetX = ball.x - facingDir * 24;
        const takeoffGap = Math.abs(takeoffTargetX - server.x);

        // W：除了高度/下降條件，還必須真的完成腳步對位並先放開 A/D 才起跳。
        // 這修的是 AI 操作時機，不改 jump()、AGI、JUMP、發球力量或玩家控制。
        if (server.isGrounded && ballDescending &&
            ball.y > WORLD.NET_TOP_Y - 220 &&
            ball.y < WORLD.NET_TOP_Y - 45 &&
            takeoffGap <= Math.max(30, server.effectiveSpeed + 16) &&
            Math.abs(server.vx) < 0.1) {
          server.jump();
        } else if (server.isGrounded && ballDescending && ballHeightAboveFloor < 205 &&
                   takeoffGap <= Math.max(52, server.effectiveSpeed * 2.2)) {
          // V34 保底：已經下降到最後起跳窗就直接 W，不准 AI 站著目送自己的拋球落地。
          server.vx = 0; server.facing = facingDir; server.jump();
        }

        // J / L：只有真的進玩家函式能接受的接觸距離才「按鍵」。
        // handler 內仍會再次 getDist、腳誤、擊球高度與技能判定。
        if (!server.isGrounded && distNow <= 78 &&
            ball.y < WORLD.NET_TOP_Y - 60 &&
            ball.y > WORLD.NET_TOP_Y - 235) {
          const prefersFloat = server.stats.technique > 0.85 && Math.random() < 0.60;
          if (prefersFloat) {
            pushAIDebug(server, 'SERVE: FLOAT', `contact=${distNow.toFixed(1)} toss=34%`);
            handleServeFloat(server);
          } else {
            pushAIDebug(server, 'SERVE: SPIKE', `contact=${distNow.toFixed(1)} toss=34%`);
            handleServeSpike(server);
          }
        }
      }
    }
  } else if (!serveState.active && !banner.active && !isSettlementOpen) {
    if (ball.x < WORLD.NET_X) {
      runTeamBrain(userPlayer, mateAI, match.leftHits, WORLD.NET_X - 120, true);
      updateBlockAI();
    } else {
      // V65: mateAI 這個物件在 COOP 連線時其實可能是遠端真人 Slot 1。
      // 回位 AI 不得替 HUMAN_REMOTE 下方向指令。
      if (!(typeof isSlotHumanControlled === 'function' && isSlotHumanControlled(mateAI))) {
        moveTowards(mateAI, WORLD.LEFT + 220, mateAI.effectiveSpeed);
      }
    }
    if (ball.x > WORLD.NET_X) {
      runTeamBrain(enemyA, enemyB, match.rightHits, WORLD.NET_X + 120, false);
      updateBlockAI();
    } else { 
      const distA = Math.abs(enemyA.x - WORLD.NET_X);
      const backEnemy = (distA < Math.abs(enemyB.x - WORLD.NET_X)) ? enemyB : enemyA;
      // V65: PVP 的 Guest 是右側 HUMAN_REMOTE；不能因為物件名 enemyA/enemyB 就讓 AI 回位接管。
      if (!(typeof isSlotHumanControlled === 'function' && isSlotHumanControlled(backEnemy))) {
        moveTowards(backEnemy, WORLD.RIGHT - 220, backEnemy.effectiveSpeed);
      }
      updateBlockAI();
    }
  }

  handlePhysics();
  camera.update(ball);

  for (let i = visualEffects.length - 1; i >= 0; i--) {
    const fx = visualEffects[i];
    if (fx.type === 'shockwave') {
      fx.radius += 5.5; fx.alpha -= 0.08; if (fx.alpha <= 0) visualEffects.splice(i, 1);
    } else if (fx.type === 'spark') {
      fx.x += fx.vx; fx.y += fx.vy; fx.life--; if (fx.life <= 0) visualEffects.splice(i, 1);
    } else if (fx.type === 'mud_drop') {
      fx.x += fx.vx; fx.y += fx.vy; fx.vy += 0.25; fx.life--;
      if (fx.life <= 0 || fx.y >= WORLD.FLOOR_Y) visualEffects.splice(i, 1);
    } else if (fx.type === 'skin_mote') {
      fx.x += fx.vx; fx.y += fx.vy; fx.life--;
      if (fx.life <= 0) visualEffects.splice(i, 1);
    } else if (fx.type==='water_drop') {fx.x+=fx.vx;fx.y+=fx.vy;fx.vy+=.08;fx.life--;if(fx.life<=0)visualEffects.splice(i,1); } else if (fx.type==='wind_trail') {fx.life--;if(fx.life<=0)visualEffects.splice(i,1); } else if (fx.type==='solar_filament') {fx.x+=fx.vx;fx.y+=fx.vy;fx.vy+=.025;fx.life--;if(fx.life<=0)visualEffects.splice(i,1); } else if (['water_burst','storm_burst','roar_wave','time_burst','time_collapse','blade_slash','thunder_arc','gravity_arc','solar_burst','gum_snap','mud_burst','breaker_wake','breaker_impact','sonic_ring','meteor_trail','meteor_impact','soft_wall_touch','grease_burst','phantom_shell','ghost_reform','phantom_split','phantom_dissolve','kinetic_absorb','kinetic_release','kinetic_impact','kinetic_trail','grease_splatter'].includes(fx.type)) { fx.life--; if(fx.life<=0) visualEffects.splice(i,1); }
  }
}

let lastFrameTime = performance.now(), accumulator = 0;
const TIME_STEP = 1000 / 60;
function mainLoop(currentTime) {
  if(typeof netDiagRecordRaf==='function' && isGameStarted && !isSettlementOpen) netDiagRecordRaf(currentTime);
  if (!isPaused && !isSettlementOpen && isGameStarted) {
    let delta = currentTime - lastFrameTime;
    if (delta > 250) delta = 250;
    const balanceScale = (typeof BALANCE_TEST_ACTIVE!=='undefined' && BALANCE_TEST_ACTIVE && typeof BALANCE_SIM_SPEED!=='undefined') ? Math.max(1,Math.min(10,BALANCE_SIM_SPEED||1)) : 1;
    const balanceDelta = balanceScale>4 ? Math.min(delta,100) : delta;
    lastFrameTime = currentTime; accumulator += balanceDelta * balanceScale;
    let _diagTicks=0; const _balanceTickCap = balanceScale>4 ? 60 : Infinity; while (accumulator >= TIME_STEP && _diagTicks < _balanceTickCap) { fixedUpdate(); accumulator -= TIME_STEP; _diagTicks++; }
    if(_diagTicks>=_balanceTickCap && accumulator>=TIME_STEP) accumulator = accumulator % TIME_STEP;
    if(typeof NET_DIAG!=='undefined' && _diagTicks>1){ NET_DIAG.catchupFrames++; NET_DIAG.catchupTicks+=(_diagTicks-1); }
    render(); if(typeof NET_DIAG!=='undefined' && NET_DIAG.startedAt&&!NET_DIAG.finalized) NET_DIAG.renderCount++;
  } else { 
    lastFrameTime = currentTime; 
    if (!isGameStarted) render();
  }
  requestAnimationFrame(mainLoop);
}

loadGameData();
allPlayers.forEach(p => p.rebind(true));
updateSideUltHUD();
requestAnimationFrame(mainLoop);

// 🌟 解決切視窗/分頁時間凍結：使用不受背景降頻限制的 Web Worker 維持 60FPS 連線心跳
const bgHeartbeatBlob = new Blob([`
  let bgTimer = null;
  self.onmessage = function(e) {
    if (e.data === 'start') {
      if (!bgTimer) bgTimer = setInterval(() => self.postMessage('tick'), 1000 / 60);
    } else if (e.data === 'stop') {
      clearInterval(bgTimer);
      bgTimer = null;
    }
  };
`], { type: 'application/javascript' });

const bgHeartbeat = new Worker(URL.createObjectURL(bgHeartbeatBlob));

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    bgHeartbeat.postMessage('start');
  } else {
    bgHeartbeat.postMessage('stop');
  }
});

bgHeartbeat.onmessage = function(e) {
  if (e.data === 'tick' && document.hidden) {
    if (!isPaused && !isSettlementOpen && isGameStarted) {
      fixedUpdate();
    }
  }
};
// V60 Achievement runtime flags. Host is gameplay authority; each client only writes its own save.
function awardAchievementForActor(actor, achievementId){
  if(!actor || !achievementId) return false;
  const human=(typeof isSlotHumanControlled==='function')?isSlotHumanControlled(actor):actor.isLocallyControlled;
  if(!human) return false;
  const mySlot=(typeof NET!=='undefined'&&NET.isMultiplayer)?NET.mySlot:0;
  if(actor.slotIndex===mySlot){ return (typeof unlockAchievementLocal==='function') ? unlockAchievementLocal(achievementId) : false; }
  if(typeof NET!=='undefined'&&NET.isMultiplayer&&NET.isHost&&NET.conn&&NET.conn.open){
    NET.conn.send({type:'ACHIEVEMENT_UNLOCK',targetSlot:actor.slotIndex,achievementId});
    return true;
  }
  return false;
}
function isAttackPointEvent(ev){ return !!ev && (ev.type==='ATTACK_KILL'||ev.type==='TOUCH_OUT'); }

// ========================================================
// V46 STAGE MECHANICS — Venue 固有效果 + 可讀、可玩的 Incident
// ========================================================
const VENUE_INCIDENTS = {
  NONE:{name:'無事發生',dur:0,color:'#94a3b8'}, BLACKOUT:{name:'停電',dur:480,color:'#e2e8f0'},
  BIRDS:{name:'鳥群通過',dur:420,color:'#f8fafc'}, PIPE_LEAK:{name:'高壓管線洩漏',dur:420,color:'#e2e8f0'},
  GRAVITY_ANOMALY:{name:'重力異常',dur:420,color:'#c4b5fd'}, UFO:{name:'UFO 綁架球',dur:360,color:'#86efac'},
  WIND_GUST:{name:'強陣風',dur:600,color:'#7dd3fc'}, THUNDER_STRIKE:{name:'雷擊倒楣鬼',dur:1800,color:'#fde047'},
  LIGHTNING:{name:'連續雷光',dur:240,color:'#fff7ed'}, RAIN_SURGE:{name:'豪雨',dur:540,color:'#60a5fa'},
  BLIZZARD:{name:'暴風雪・失溫',dur:600,color:'#e0f2fe'}, ICE_CRACK:{name:'冰面崩裂',dur:600,color:'#bae6fd'},
  GIANT_WAVE:{name:'巨浪',dur:300,color:'#38bdf8'}, GIANT_BEACH_BALL:{name:'巨大沙灘球亂入',dur:480,color:'#fef08a'},
  OVERHEAT:{name:'爐心過熱',dur:660,color:'#fb7185'}, CROWD_THROW:{name:'觀眾投擲',dur:840,color:'#f472b6'}
};
const WAREHOUSE_STEAM_PIPE_XS=[760,900,1040,1190,1350,1510,1670,1830,1990,2160,2320];
let venueIncidentState={active:null,timer:0,total:0,nextDraw:900,draws:0,maxDraws:Number.MAX_SAFE_INTEGER,wind:0,windTarget:0,windChange:0,flash:0,flashSeq:[],targetSlot:-1,strikeCooldown:0,strikeWarn:0,strikePending:-1,birds:[],hole:null,beachBall:null,crowdObjects:[],crowdProjectile:null,crowdThrows:0,ufoPhase:0,ufoX:1500,ufoHold:false,shipTilt:0,shipTargetTilt:0,heatPulse:0,pipeX:0,pipeXs:[],lastIncident:null,overheatAlpha:0,beachBallCooldown:30,seenUfo:false,seenGravity:false,ufoResponsibleSlot:-1};
function resetVenueIncidents(){
  // V55: 無盡模式不是『最多抽兩次』的有限比賽。事件結束後持續冷卻→再抽，直到玩家離場。
  const endlessIncidentLoop = (typeof isPracticeMode !== 'undefined' && isPracticeMode);
  venueIncidentState={active:null,timer:0,total:0,nextDraw:360+Math.floor(Math.random()*300),draws:0,maxDraws:Number.MAX_SAFE_INTEGER,wind:0,windTarget:0,windChange:0,flash:0,flashSeq:[],targetSlot:-1,strikeCooldown:0,strikeWarn:0,strikePending:-1,birds:[],hole:null,beachBall:null,crowdObjects:[],crowdProjectile:null,crowdThrows:0,ufoPhase:0,ufoX:1500,ufoHold:false,shipTilt:0,shipTargetTilt:0,heatPulse:0,pipeX:0,pipeXs:[],lastIncident:null,overheatAlpha:0,beachBallCooldown:30,seenUfo:false,seenGravity:false,ufoResponsibleSlot:-1};
}
// V71 HYBRID AUDIO ASSET PASS：真實素材負責質感，Web Audio/程式層負責底床、音量與事件控制。
const VENUE_AUDIO_ASSETS={
  stadium:{path:'SFX/ambience/gym.ogg',vol:.24},
  warehouse:{path:'SFX/ambience/warehouse.ogg',vol:.22},
  factory:{path:'SFX/ambience/furnace.ogg',vol:.30,xfade:6.0},
  rain:{path:'SFX/ambience/rain_gentle.ogg',vol:.30},
  ice:{path:'SFX/ambience/ice_wind.ogg',vol:.48,xfade:1.8},
  rooftop:{path:'SFX/ambience/rooftop_wind.ogg',vol:1.18,xfade:1.8},
  ship:{path:'SFX/ambience/ferry_sea.ogg',vol:.18,xfade:1.8},
  moon:{path:'SFX/ambience/moon.ogg',vol:.22},
  underground:{path:'SFX/ambience/underground_crowd.ogg',vol:.13,xfade:1.8},
  beach:{path:'SFX/ambience/beach_waves.ogg',vol:.34,xfade:2.2}
};
let _cinematicDuckFactor=1;
function setCinematicDuck(active){ cinematicDuckActive=!!active; _cinematicDuckFactor=active?.025:1; _syncVenueMediaVolume(); const ctx=(typeof audioCtx!=='undefined'&&audioCtx)?audioCtx:null; if(ctx&&_venueAmbience.master){try{_venueAmbience.master.gain.setTargetAtTime((_venueAmbience.baseGain||.025)*_sfxVol()*_cinematicDuckFactor,ctx.currentTime,active?.025:.18);}catch(e){}} }
let _venueAmbience={id:null,nodes:[],master:null,media:[]}, _incidentAudio=[], _lastShipCreakFrame=-9999, _lastBeachBallThumpFrame=-9999, _lastBirdChirpFrame=-9999, _lastGymDetailFrame=-9999, _lastUndergroundBooFrame=-9999, _nextShipHornFrame=900+Math.floor(Math.random()*900);
function _venueAudioCtx(){
  if(typeof audioCtx==='undefined'||!audioCtx){try{audioCtx=new (window.AudioContext||window.webkitAudioContext)();}catch(e){return null;}}
  try{if(audioCtx.state==='suspended')audioCtx.resume();}catch(e){}
  return audioCtx;
}
function _noiseBuffer(ctx,seconds=2){const n=Math.max(1,Math.floor(ctx.sampleRate*seconds)),b=ctx.createBuffer(1,n,ctx.sampleRate),d=b.getChannelData(0);for(let i=0;i<n;i++)d[i]=Math.random()*2-1;return b;}
function _sfxVol(){return typeof globalSfxVolume!=='undefined'?globalSfxVolume:.85;}
function _makeMedia(path,baseVol=.2,loop=false,rate=1){try{const a=new Audio(path);a.preload='auto';a.loop=loop;a.playbackRate=rate;a._baseVol=baseVol;a._gainFactor=1;a.volume=Math.max(0,Math.min(1,baseVol*_sfxVol()));return a;}catch(e){return null;}}
// V73: 所有常駐 loop 使用雙 deck cross-dissolve，避免檔尾/檔頭硬接；長尾自帶 fade 的熔爐可用較長 overlap。
function _startCrossfadeLoop(path,baseVol=.2,xfade=1.4,start=0){const a=_makeMedia(path,baseVol,false),b=_makeMedia(path,baseVol,false);if(!a||!b)return [];const decks=[a,b];for(const d of decks){d._loopStart=start;d._xfadeBusy=false;}const arm=(cur,next)=>{cur.addEventListener('timeupdate',()=>{if(cur.paused||cur._xfadeBusy||!Number.isFinite(cur.duration)||cur.duration<=start+xfade+.2)return;const rem=cur.duration-cur.currentTime;if(rem>xfade)return;cur._xfadeBusy=true;try{next.currentTime=start;}catch(e){}next._gainFactor=0;next.volume=0;next.play().catch(()=>{});const t0=performance.now(),ms=Math.max(180,xfade*1000);const tick=()=>{const p=Math.min(1,(performance.now()-t0)/ms),smooth=p*p*(3-2*p);cur._gainFactor=1-smooth;next._gainFactor=smooth;_syncVenueMediaVolume();if(p<1)requestAnimationFrame(tick);else{try{cur.pause();cur.currentTime=start;}catch(e){}cur._gainFactor=0;cur._xfadeBusy=false;next._gainFactor=1;_syncVenueMediaVolume();}};requestAnimationFrame(tick);});};arm(a,b);arm(b,a);try{a.currentTime=start;}catch(e){}a._gainFactor=1;b._gainFactor=0;a.play().catch(()=>{});return decks;}
function _fadeMedia(a,to,dur=.8,stopAfter=false){if(!a)return;const base=Math.max(.0001,(a._baseVol||1)*_sfxVol()),from=(a.volume||0)/base,targetFactor=Math.max(0,Math.min(1,to/base)),t0=performance.now(),ms=Math.max(60,dur*1000);const tick=()=>{const p=Math.min(1,(performance.now()-t0)/ms);a._gainFactor=from+(targetFactor-from)*p;a.volume=Math.max(0,Math.min(1,(a._baseVol||0)*_sfxVol()*a._gainFactor));if(p<1)requestAnimationFrame(tick);else if(stopAfter){try{a.pause();a.currentTime=0;}catch(e){}}};requestAnimationFrame(tick);}
function _playAsset(path,baseVol=.25,{loop=false,fadeIn=0,start=0,duration=0,rate=1}={}){const a=_makeMedia(path,baseVol,loop,rate);if(!a)return null;try{a.currentTime=start;}catch(e){};if(fadeIn>0){a._gainFactor=0;a.volume=0;}const pr=a.play();if(pr&&pr.catch)pr.catch(()=>{});if(fadeIn>0)_fadeMedia(a,baseVol*_sfxVol(),fadeIn,false);if(duration>0)setTimeout(()=>_fadeMedia(a,0,.12,true),duration*1000);return a;}
function _trackIncidentAudio(a){if(a){_incidentAudio.push(a);a.addEventListener?.('ended',()=>{_incidentAudio=_incidentAudio.filter(x=>x!==a);},{once:true});}return a;}
function _stopIncidentAudio(fade=.8){for(const a of _incidentAudio)_fadeMedia(a,0,fade,true);_incidentAudio=[];}
function _stopVenueAmbience(){for(const a of _venueAmbience.media||[]){try{a.pause();a.currentTime=0;}catch(e){}}for(const n of _venueAmbience.nodes||[]){try{if(n.stop)n.stop();}catch(e){}try{n.disconnect();}catch(e){}}_venueAmbience={id:null,nodes:[],master:null,media:[]};_stopIncidentAudio(.35);}
function _syncVenueMediaVolume(){const vol=_sfxVol();for(const a of _venueAmbience.media||[])a.volume=Math.max(0,Math.min(1,(a._baseVol||0)*vol*(a._gainFactor??1)*_cinematicDuckFactor));for(const a of _incidentAudio||[])if(a&&!a.paused)a.volume=Math.max(0,Math.min(1,(a._baseVol||0)*vol*(a._gainFactor??1)*_cinematicDuckFactor));}
function ensureVenueAmbience(){
  const ctx=_venueAudioCtx();
  if(!ctx||!isGameStarted){if(_venueAmbience.id)_stopVenueAmbience();return;}
  const id=(getCurrentVenue()?.id)||'stadium';
  if(_venueAmbience.id===id){_syncVenueMediaVolume();if(_venueAmbience.master)_venueAmbience.master.gain.setTargetAtTime((_venueAmbience.baseGain||.025)*_sfxVol()*_cinematicDuckFactor,ctx.currentTime,.10);return;}
  _stopVenueAmbience();const master=ctx.createGain();
  // 共用底噪床：沿用熔爐那種質感但壓低，真正場地個性由素材層負責。
  const bedIds=new Set(['stadium','underground','warehouse','factory','beach','ship','rain']);
  const venueBase=bedIds.has(id)?.026:.012;master.gain.value=venueBase*_sfxVol();master.connect(ctx.destination);_venueAmbience={id,nodes:[master],master,media:[],baseGain:venueBase};
  const noise=(type,freq,q,gain)=>{const src=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain();src.buffer=_noiseBuffer(ctx,3);src.loop=true;f.type=type;f.frequency.value=freq;f.Q.value=q;g.gain.value=gain;src.connect(f);f.connect(g);g.connect(master);src.start();_venueAmbience.nodes.push(src,f,g);};
  if(bedIds.has(id))noise('lowpass',id==='factory'?720:560,.45,id==='factory'?.34:.20);else noise('bandpass',id==='ice'?1600:900,.5,.10);
  const cfg=VENUE_AUDIO_ASSETS[id];if(cfg){const decks=_startCrossfadeLoop(cfg.path,cfg.vol,cfg.xfade||1.6,cfg.start||0);_venueAmbience.media.push(...decks);}
  if(id==='rooftop'){
    // 樓下交通只當悶遠景；主 Key 是屋頂低風。
    for(const [path,vol] of [['SFX/ambience/rooftop_traffic_a.ogg',.045],['SFX/ambience/rooftop_traffic_b.ogg',.035]]){const decks=_startCrossfadeLoop(path,vol,1.8,0);for(const a of decks)a.playbackRate=.96+Math.random()*.05;_venueAmbience.media.push(...decks);}
  }
  if(id==='rain'){const decks=_startCrossfadeLoop('SFX/ambience/rooftop_traffic_b.ogg',.026,1.8,0);_venueAmbience.media.push(...decks);}
}
function venueSfx(kind,fromNetwork=false){
  const ctx=_venueAudioCtx();if(!ctx)return;
  if(!fromNetwork&&typeof NET!=='undefined'&&NET.isMultiplayer&&NET.isHost&&NET.conn&&NET.conn.open){try{NET.conn.send({type:'VENUE_SFX_SYNC',kind,eventId:`${gameFrame||0}:${kind}`});}catch(e){}}
  const pick=(arr)=>arr[Math.floor(Math.random()*arr.length)];
  if(kind==='bird'){_playAsset('SFX/venue/seagulls.ogg',.28,{start:Math.random()*8,duration:1.8+Math.random()*1.2,rate:.96+Math.random()*.08});return;}
  if(kind==='ship_creak'){_playAsset('SFX/venue/ferry_wood_creaks.ogg',.28,{start:Math.random()*14,duration:1.1+Math.random()*1.6,rate:.96+Math.random()*.07});return;}
  if(kind==='ship_horn'){_playAsset(Math.random()<.5?'SFX/venue/ship_horn_a.wav':'SFX/venue/ship_horn_b.wav',.20,{rate:.96+Math.random()*.05,fadeIn:.08});return;}
  if(kind==='wind_gust'){_trackIncidentAudio(_playAsset('SFX/incidents/wind_gust.ogg',.32,{fadeIn:.25}));return;}
  if(kind==='thunder'){_trackIncidentAudio(_playAsset(pick(['SFX/incidents/thunder_01.ogg','SFX/incidents/thunder_02.ogg','SFX/incidents/thunder_03.ogg','SFX/incidents/thunder_04.ogg']),.42,{rate:.96+Math.random()*.06}));return;}
  if(kind==='spark_warn'){_trackIncidentAudio(_playAsset('SFX/incidents/electric_sparkles.ogg',.28,{duration:2.2}));return;}
  if(kind==='roof_break'){_playAsset('SFX/incidents/roof_crash.ogg',.48);_playAsset('SFX/incidents/roof_debris.ogg',.18,{start:.15});return;}
  if(kind==='crowd_boo'){_trackIncidentAudio(_playAsset('SFX/venue/underground_boo.ogg',.34,{start:Math.random()*10,duration:2.6+Math.random()*1.4}));return;}
  if(kind==='gas_leak'){_trackIncidentAudio(_playAsset('SFX/incidents/gas_leak_long.ogg',.095,{fadeIn:.45}));_incidentAudio.push(..._startCrossfadeLoop('SFX/incidents/gas_leak_loop.ogg',.065,.8,0));return;}
  if(kind==='gas_leak_soft'){_trackIncidentAudio(_playAsset('SFX/incidents/gas_leak_long.ogg',.045,{fadeIn:.65}));_incidentAudio.push(..._startCrossfadeLoop('SFX/incidents/gas_leak_loop.ogg',.032,.8,0));return;}
  if(kind==='ufo_enter'){_playAsset('SFX/venue/ufo_enter.ogg',.34);return;}
  if(kind==='ufo_exit'){_playAsset('SFX/venue/ufo_exit.ogg',.34);return;}
  if(kind==='wave_start'){_trackIncidentAudio(_playAsset('SFX/incidents/giant_wave.ogg',.40,{fadeIn:.12}));return;}
  if(kind==='wave_impact'){_trackIncidentAudio(_playAsset('SFX/incidents/giant_wave_impact.ogg',.48));return;}
  if(kind==='blizzard'){_trackIncidentAudio(_playAsset('SFX/incidents/blizzard.ogg',.38,{fadeIn:1.0}));return;}
  if(kind==='rain_surge'){_trackIncidentAudio(_playAsset('SFX/incidents/rain_surge.ogg',.38,{fadeIn:1.8,start:6.0}));return;}
  if(kind==='storm_intro'){_trackIncidentAudio(_playAsset('SFX/incidents/thunderstorm_intro.ogg',.28,{fadeIn:.45}));return;}
  try{const now=ctx.currentTime,vol=_sfxVol();
    const burst=(freq,dur,type='sawtooth',gain=.16,delay=0,endFreq=null)=>{const o=ctx.createOscillator(),g=ctx.createGain();o.type=type;o.frequency.setValueAtTime(freq,now+delay);if(endFreq)o.frequency.exponentialRampToValueAtTime(Math.max(1,endFreq),now+delay+dur);g.gain.setValueAtTime(Math.max(.0001,gain*vol),now+delay);g.gain.exponentialRampToValueAtTime(.001,now+delay+dur);o.connect(g);g.connect(ctx.destination);o.start(now+delay);o.stop(now+delay+dur)};
    const noise=(dur,gain=.15,filter='bandpass',freq=900,delay=0)=>{const src=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain();src.buffer=_noiseBuffer(ctx,Math.max(.12,dur));f.type=filter;f.frequency.value=freq;g.gain.setValueAtTime(gain*vol,now+delay);g.gain.exponentialRampToValueAtTime(.001,now+delay+dur);src.connect(f);f.connect(g);g.connect(ctx.destination);src.start(now+delay);src.stop(now+delay+dur)};
    if(kind==='warning'){burst(880,.08,'square',.18);burst(660,.08,'square',.18,.14);burst(880,.08,'square',.18,.28)}
    else if(kind==='electric'){noise(.18,.10,'highpass',1800);burst(180,.22,'square',.16);burst(520,.16,'sawtooth',.12,.08)}
    else if(kind==='whoosh'){noise(.42,.12,'bandpass',650);burst(120,.42,'sawtooth',.07,0,55)}
    else if(kind==='crack'||kind==='ice_crack'){noise(.16,.25,'highpass',1700);burst(720,.045,'square',.18);burst(190,.24,'sawtooth',.20,.035,55);if(kind==='ice_crack')burst(980,.08,'triangle',.10,.07,300)}
    else if(kind==='power'){burst(55,.22,'square',.25);burst(95,.12,'triangle',.18,.18)}
    else if(kind==='bird_dead'){burst(560,.20,'sawtooth',.22,0,170)}
    else if(kind==='beach_ball'){burst(118,.09,'sine',.13,0,72);burst(205,.055,'triangle',.055,.015,115)}
    else if(kind==='steam'){noise(.55,.18,'highpass',1500);}
  }catch(e){}
}

function beginVenueIncident(id){
  const def=VENUE_INCIDENTS[id]; if(!def||id==='NONE')return;
  venueIncidentState.active=id;venueIncidentState.timer=def.dur;venueIncidentState.total=def.dur;venueIncidentState.flash=0;venueIncidentState.wind=0;venueIncidentState.targetSlot=-1;
  if(id==='UFO') venueIncidentState.seenUfo=true; if(id==='GRAVITY_ANOMALY') venueIncidentState.seenGravity=true;
  venueIncidentState.hole=null;if(getCurrentVenue().fixed!=='sand_floor')venueIncidentState.beachBall=null;venueIncidentState.crowdProjectile=null;venueIncidentState.crowdObjects=[];venueIncidentState.crowdThrows=0;venueIncidentState.ufoPhase=0;venueIncidentState.ufoHold=false;
  if(id==='WIND_GUST'){venueIncidentState.windTarget=(Math.random()<.5?-1:1)*(0.045+Math.random()*.055);venueIncidentState.windChange=100;venueSfx('wind_gust');}
  if(id==='LIGHTNING'){const n=3+Math.floor(Math.random()*2),times=[];let t=28;for(let i=0;i<n;i++){times.push(t);t+=32+Math.floor(Math.random()*48);}venueIncidentState.flashSeq=times.map(t=>({t,power:.35+Math.random()*.65}));venueSfx('storm_intro');}
  if(id==='BIRDS'){const dir=Math.random()<.5?1:-1,count=5+Math.floor(Math.random()*2);for(let i=0;i<count;i++)venueIncidentState.birds.push({x:dir>0?-260-i*165:WORLD.WIDTH+260+i*165,y:150+(i%3)*62+Math.random()*18,vx:dir*(6.2+Math.random()*2.8),r:24,dir});venueSfx('bird');}
  if(id==='ICE_CRACK'){venueIncidentState.hole={x:WORLD.LEFT+250+Math.random()*(WORLD.RIGHT-WORLD.LEFT-500),w:180,phase:'warn',t:150};venueSfx('warning');}
  if(id==='GIANT_BEACH_BALL'){const fromLeft=Math.random()<.5;venueIncidentState.beachBall={x:fromLeft?-90:WORLD.WIDTH+90,y:WORLD.FLOOR_Y-43,vx:fromLeft?5.6:-5.6,vy:0,r:43,dir:fromLeft?1:-1,hitSlots:[]};venueSfx('beach_ball');}
  if(id==='PIPE_LEAK'){venueSfx('gas_leak');const pipes=[...(typeof WAREHOUSE_STEAM_PIPE_XS!=='undefined'?WAREHOUSE_STEAM_PIPE_XS:[])];const count=Math.min(pipes.length,2+Math.floor(Math.random()*2));venueIncidentState.pipeXs=[];while(pipes.length&&venueIncidentState.pipeXs.length<count){venueIncidentState.pipeXs.push(pipes.splice(Math.floor(Math.random()*pipes.length),1)[0]);}venueIncidentState.pipeX=venueIncidentState.pipeXs[0]||WORLD.NET_X;venueSfx('warning');}
  if(id==='OVERHEAT'){venueSfx('warning');venueSfx('gas_leak_soft');}
  if(id==='RAIN_SURGE')venueSfx('rain_surge');
  if(id==='BLIZZARD')venueSfx('blizzard');
  if(id==='BLACKOUT'){venueSfx('electric');}
  if(id==='THUNDER_STRIKE'){venueIncidentState.strikeCooldown=45;venueIncidentState.strikeWarn=0;venueIncidentState.strikePending=-1;}
  if(id==='CROWD_THROW'){venueSfx('warning');venueSfx('crowd_boo');}
  if(id==='UFO'){venueIncidentState.ufoX=-180;venueIncidentState.ufoPhase=0;venueSfx('ufo_enter');}
  if(id==='GIANT_WAVE'){venueIncidentState.shipTargetTilt=0;venueIncidentState.waveTiltDir=(Math.random()<.5?-1:1);venueIncidentState.waveImpactTriggered=false;venueSfx('wave_start');}
  pushCallout(WORLD.NET_X,WORLD.NET_TOP_Y-115,`⚠ ${def.name} ⚠`,def.color);playSound('venue_reveal');
}
function drawVenueIncident(){
  if(!venueEventsEnabled||venueIncidentState.draws>=venueIncidentState.maxDraws)return;
  const v=getCurrentVenue(), legal=[...new Set((v.eventDeck||[]).filter(id=>id!=='NONE'&&VENUE_INCIDENTS[id]))];
  venueIncidentState.draws++;
  // V57: 事件是整場節奏，不再被大量 NONE 稀釋。約 15% 空窗；有事件時避免連續抽到同一個。
  let id='NONE';
  if(legal.length&&Math.random()>=0.15){
    let pool=legal.filter(x=>x!==venueIncidentState.lastIncident);
    if(!pool.length)pool=legal;
    id=pool[Math.floor(Math.random()*pool.length)]||'NONE';
  }
  venueIncidentState.nextDraw=300+Math.floor(Math.random()*360); // 約 5~11 秒冷卻
  if(id!=='NONE'){venueIncidentState.lastIncident=id;beginVenueIncident(id);}
}
function endVenueIncident(){if(venueIncidentState.active==='BLACKOUT')venueSfx('power');_stopIncidentAudio(1.35);venueIncidentState.active=null;venueIncidentState.timer=0;venueIncidentState.wind=0;venueIncidentState.windTarget=0;venueIncidentState.ufoHold=false;venueIncidentState.shipTargetTilt=0;}
function respawnVenueVictim(p){if(!p)return;p.forceGrounded(p.spawnX);p.respawnBlinkTimer=75;p.stunTimer=20;}
function updateVenueIncidents(){
  if(!isGameStarted||banner.active||isSettlementOpen)return;
  ensureVenueAmbience();
  const st=venueIncidentState,id=st.active;if(st.flash>0)st.flash--;
  // 貨輪固有效果：非常慢的甲板搖擺；巨浪只把傾角瞬間放大，重力仍朝下。
  if(getCurrentVenue().fixed==='ship_sway'){const base=Math.sin(gameFrame*.008)*0.022;const target=(id==='GIANT_WAVE'&&st.waveImpactTriggered)?st.shipTargetTilt:base;st.shipTilt+=(target-st.shipTilt)*.035;}else st.shipTilt*=.9;
  if(getCurrentVenue().fixed==='ship_sway'&&Math.abs(st.shipTilt)>.010&&gameFrame-_lastShipCreakFrame>150){_lastShipCreakFrame=gameFrame+Math.floor(Math.random()*70);venueSfx('ship_creak');}
  if(getCurrentVenue().fixed==='ship_sway'&&gameFrame>=_nextShipHornFrame){venueSfx('ship_horn');_nextShipHornFrame=gameFrame+1800+Math.floor(Math.random()*1800);}
  const venueId=getCurrentVenue().id;if(venueId==='stadium'&&gameFrame-_lastGymDetailFrame>420){_lastGymDetailFrame=gameFrame+Math.floor(Math.random()*360);_playAsset(Math.random()<.5?'SFX/venue/gym_basketball_a.ogg':'SFX/venue/gym_basketball_b.ogg',.105,{start:Math.random()*8,duration:2.4+Math.random()*2.4});}if(venueId==='underground'&&gameFrame-_lastUndergroundBooFrame>1200&&Math.random()<.006){_lastUndergroundBooFrame=gameFrame;_playAsset('SFX/venue/underground_boo.ogg',.16,{start:Math.random()*12,duration:1.8+Math.random()*1.5});}
  // V49 沙灘固有特色：全場永遠最多一顆沙灘球。WORLD 3000px、5.6px/f 約 9.2 秒滾完全場；離場後短暫間隔再換邊進場。
  if(getCurrentVenue().fixed==='sand_floor'){
    if(!st.beachBall){ st.beachBallCooldown=(st.beachBallCooldown??30)-1; if(st.beachBallCooldown<=0){const fromLeft=Math.random()<.5;st.beachBall={x:fromLeft?-70:WORLD.WIDTH+70,y:WORLD.FLOOR_Y-34,vx:fromLeft?5.6:-5.6,vy:0,r:34,dir:fromLeft?1:-1,hitSlots:[]};} }
    if(st.beachBall){const b=st.beachBall;b.x+=b.vx;b.y=WORLD.FLOOR_Y-b.r;if(gameFrame-_lastBeachBallThumpFrame>30){_lastBeachBallThumpFrame=gameFrame;venueSfx('beach_ball');}for(const p of allPlayers){const d=Math.hypot(p.x-b.x,(p.y-p.radius)-b.y);if(d<b.r+p.radius&&(p._beachBallHit||0)<=0){const continuing=(p._beachBounceChain||0)>0&&!p.isGrounded;p._beachBounceChain=continuing?p._beachBounceChain+1:1;p._beachBounceAirborne=true;
          // V73-2: 沙灘球是 external launch。保留 24f debounce 讓同一顆球可再次有效彈跳，
          // 但先終止魚躍/地面動作，避免 isDiving 卡住 airborne physics 造成持續上飄、按 W 才恢復重力。
          p.isDiving=false;p.diveTimer=0;p.diveTouched=false;p.isGrounded=false;p.vy=-11.5;p.vx+=b.dir*4.5;p.stunTimer=Math.max(p.stunTimer,18);p.venueSpinTimer=48;p.venueSpinTotal=48;p._beachBallHit=24;venueSfx('whoosh');if(p._beachBounceChain>=3)awardAchievementForActor(p,'ach_beach_triple_bounce');}}for(const p of allPlayers)if(p._beachBallHit>0)p._beachBallHit--;if((b.dir>0&&b.x>WORLD.WIDTH+b.r+20)||(b.dir<0&&b.x<-b.r-20)){st.beachBall=null;st.beachBallCooldown=90;}}
  }else if(id!=='GIANT_BEACH_BALL'){st.beachBall=null;st.beachBallCooldown=30;}
  // V49 暴風雪失溫必須每幀更新，不能綁在『有人按方向鍵』才呼叫的 speedFactor。
  for(const p of allPlayers){if(id==='BLIZZARD'){p.venueHeat=p.venueHeat??1;const activelyMoving=Math.abs(p.vx)>1.15&&!p.isDiving;p.venueHeat=Math.max(0,Math.min(1,p.venueHeat+(activelyMoving?.018:-.055)));}else p.venueHeat=Math.min(1,(p.venueHeat??1)+.025);}
  if(id){st.timer--;const elapsed=st.total-st.timer;
    if(id==='GIANT_WAVE'&&!st.waveImpactTriggered&&elapsed>=125){st.waveImpactTriggered=true;st.shipTargetTilt=(st.waveTiltDir||1)*0.065;venueSfx('wave_impact');}
    if(id==='WIND_GUST'){if(--st.windChange<=0){st.windTarget=(Math.random()<.5?-1:1)*(0.035+Math.random()*.075);st.windChange=90+Math.floor(Math.random()*120);}st.wind+=(st.windTarget-st.wind)*.035;}
    if(id==='LIGHTNING'){for(const q of st.flashSeq){if(!q.done&&elapsed>=q.t){q.done=true;st.flash=Math.round(28+q.power*55);venueSfx('thunder');}}}
    if(id==='THUNDER_STRIKE'){if(st.strikeWarn>0){st.strikeWarn--;if(st.strikeWarn===0){const p=allPlayers[st.strikePending];if(p){p.stunTimer=Math.max(p.stunTimer,120);p.venueShockTimer=105;p.venueShockRecoveryTimer=Math.max(p.venueShockRecoveryTimer||0,240);p.venueShockRecoveryTotal=240;st.flash=34;pushCallout(p.x,p.y-80,'⚡ 雷擊！','#fde047');venueSfx('thunder');}st.strikePending=-1;st.strikeCooldown=600+Math.floor(Math.random()*301);}}else if(st.strikeCooldown<=0){st.strikePending=Math.floor(Math.random()*allPlayers.length);st.targetSlot=st.strikePending;st.strikeWarn=60;venueSfx('spark_warn');}else st.strikeCooldown--;}
    // V59: 鳥群的飛行生命週期在事件計時之外更新，避免事件結束時半空消失。
    if(id==='ICE_CRACK'&&st.hole){st.hole.t--;if(st.hole.phase==='warn'&&st.hole.t<=0){st.hole.phase='crack';st.hole.t=90;venueSfx('ice_crack');}else if(st.hole.phase==='crack'&&st.hole.t<=0){st.hole.phase='open';st.hole.t=240;venueSfx('ice_crack');}else if(st.hole.phase==='open'){for(const p of allPlayers){const dx=st.hole.x-p.x;const feetY=p.y;const nearIceSurface=Math.abs(feetY-WORLD.FLOOR_Y)<28;if(Math.abs(dx)<st.hole.w*.62&&nearIceSurface){p.stunTimer=Math.max(p.stunTimer,34);p.vx=dx*.16;p.vy=Math.max(p.vy,4.8);p.isGrounded=false;p.y+=3.5;}if(p.y>WORLD.FLOOR_Y+150)respawnVenueVictim(p);}}}
    if(id==='GIANT_BEACH_BALL'&&st.beachBall&&getCurrentVenue().fixed!=='sand_floor'){const b=st.beachBall;b.x+=b.vx;b.y=WORLD.FLOOR_Y-b.r;for(const p of allPlayers){const d=Math.hypot(p.x-b.x,(p.y-p.radius)-b.y);if(d<b.r+p.radius&&(p._beachBallHit||0)<=0){const continuing=(p._beachBounceChain||0)>0&&!p.isGrounded;p._beachBounceChain=continuing?p._beachBounceChain+1:1;p._beachBounceAirborne=true;
          // V73-2: 沙灘球是 external launch。保留 24f debounce 讓同一顆球可再次有效彈跳，
          // 但先終止魚躍/地面動作，避免 isDiving 卡住 airborne physics 造成持續上飄、按 W 才恢復重力。
          p.isDiving=false;p.diveTimer=0;p.diveTouched=false;p.isGrounded=false;p.vy=-11.5;p.vx+=b.dir*4.5;p.stunTimer=Math.max(p.stunTimer,18);p.venueSpinTimer=48;p.venueSpinTotal=48;p._beachBallHit=24;venueSfx('whoosh');if(p._beachBounceChain>=3)awardAchievementForActor(p,'ach_beach_triple_bounce');}}for(const p of allPlayers)if(p._beachBallHit>0)p._beachBallHit--; }
    if(id==='PIPE_LEAK'){
      // V57: 同一次洩壓由 2~3 支既有地板管口共同噴發；每支都有自己的實際力場。
      const activePipes=(st.pipeXs&&st.pipeXs.length)?st.pipeXs:[st.pipeX];
      for(const pipeX of activePipes){
        const bdx=Math.abs(ball.x-pipeX), by=ball.y;
        if(bdx<150&&by>WORLD.FLOOR_Y-500){const k=1-bdx/150;ball.vy-=.42*k;ball.vx+=(ball.x<pipeX?-0.065:0.065)*k;}
        for(const p of allPlayers){const dx=Math.abs(p.x-pipeX);if(dx<120&&p.y>WORLD.FLOOR_Y-420){const k=1-dx/120;p.vx+=(p.x<pipeX?-0.12:0.12)*k;if(!p.isGrounded)p.vy-=.055*k;}}
      }
    }
    if(id==='OVERHEAT'){
      // V47: 1 秒長浮力 / 1 秒休息；推力更柔，但不是短促抽一下。
      const pulseFrames=60, restFrames=60, cycle=(elapsed%(pulseFrames+restFrames));
      st.heatPulse=cycle<pulseFrames ? Math.sin((cycle/pulseFrames)*Math.PI) : 0;
      if(st.heatPulse>0) ball.vy-=.155*(.50+.50*st.heatPulse);
    }
    if(id==='CROWD_THROW'){
      // V47: 觀眾從鏡頭外朝場內拋物。落地後變成真正有質量/重心/碰撞的硬體。
      if(!st.crowdProjectile&&st.crowdThrows<3&&(elapsed>55+st.crowdThrows*155)){
        const target=allPlayers[Math.floor(Math.random()*allPlayers.length)], types=[
          {type:'🩴',mass:.65,w:54,h:22,rest:.38},{type:'🥫',mass:1.0,w:34,h:48,rest:.22},
          {type:'🧴',mass:.8,w:38,h:58,rest:.18},{type:'🪑',mass:2.2,w:70,h:66,rest:.10}
        ],spec=types[Math.floor(Math.random()*types.length)], fromLeft=Math.random()<.5;
        const tx=Math.max(WORLD.LEFT+70,Math.min(WORLD.RIGHT-70,target.x+(Math.random()-.5)*90));
        const sx=fromLeft?WORLD.LEFT-150:WORLD.RIGHT+150, sy=WORLD.FLOOR_Y-95, flight=78, g=.34, ty=WORLD.FLOOR_Y-spec.h/2;
        st.crowdProjectile={...spec,x:sx,y:sy,vx:(tx-sx)/flight,vy:(ty-sy-.5*g*flight*flight)/flight,rot:Math.random()*Math.PI*2,vr:(fromLeft?1:-1)*(.12+Math.random()*.10),targetX:tx,targetY:ty,t:flight+8};
        st.crowdThrows++;venueSfx('warning');venueSfx('crowd_boo');
      }
      if(st.crowdProjectile){
        const q=st.crowdProjectile;q.t--;q.x+=q.vx;q.y+=q.vy;q.vy+=.34;q.rot+=q.vr;
        // V48：純彈道，準星就是實際落點；不再中途導向造成軌跡與準星分家。
        if(q.y>=q.targetY&&q.vy>0){
          q.y=q.targetY;let hit=null;for(const p of allPlayers)if(Math.abs(p.x-q.x)<(q.w/2+p.radius*.75)){hit=p;break;}
          if(hit){hit.stunTimer=0;hit.venueDizzyTimer=Math.max(hit.venueDizzyTimer||0,300);hit.venueDizzyTotal=300;venueSfx('crack');awardAchievementForActor(hit,'ach_trash_hit');}
          else st.crowdObjects.push({...q,x:q.x,y:q.targetY,vx:q.vx*.22,vy:-Math.abs(q.vy)*q.rest,angle:q.rot,av:q.vr*.45,life:360,fade:0,physical:true,grounded:false});
          st.crowdProjectile=null;
        }
      }
      for(const o of st.crowdObjects){
        if(o.physical){o.life--;
          if(!o.grounded){o.vy+=.34;o.x+=o.vx;o.y+=o.vy;o.angle+=o.av;if(o.y>=WORLD.FLOOR_Y-o.h/2){o.y=WORLD.FLOOR_Y-o.h/2;o.vy=-Math.abs(o.vy)*o.rest;o.vx*=.72;o.av*=.65;if(Math.abs(o.vy)<.7){o.vy=0;o.grounded=true;}}}
          else {o.vx*=.90;o.av*=.90;o.x+=o.vx;o.angle+=o.av;}
          for(const p of allPlayers){
            const dx=p.x-o.x, hitX=(o.w/2+p.radius*.72);
            if(p.isGrounded&&Math.abs(dx)<hitX){
              // V60: 真正做水平分離 + 雙向動量交換，避免角色穿過落地垃圾。
              const dir=Math.sign(dx||1), overlap=hitX-Math.abs(dx), pm=Math.max(.75,p.stats?.power?1.15:1), om=Math.max(.55,o.mass);
              p.x += dir*overlap*.42; o.x -= dir*overlap*.58;
              const rel=p.vx-o.vx; const impulse=rel*(pm/(pm+om))*.55;
              o.vx += impulse/om; p.vx -= impulse*.45;
              if(Math.abs(p.vx)<.12&&Math.abs(o.vx)<.12) o.vx -= dir*.18;
            }
          }
          if(o.life<=0){o.physical=false;o.fade=75;}
        }else o.fade--;
      }
    }
    if(id==='UFO'){if(elapsed<90){st.ufoPhase=elapsed/90;st.ufoX=-180+(WORLD.NET_X+180)*st.ufoPhase;}else if(elapsed<235){st.ufoPhase=1;st.ufoX=WORLD.NET_X;const d=Math.hypot(ball.x-st.ufoX,ball.y-150),ufoCanCapture=!match.inServeRally;if(ufoCanCapture&&(d<760||st.ufoHold)){if(!st.ufoHold){
      // UFO 一旦正式接管球，視為場地中立事件：清空球權與本回合擊球計數。
      venueIncidentState.ufoResponsibleSlot=ball.lastHitter?ball.lastHitter.slotIndex:-1;
      ball.lastHitter=null; ball.lastAttackHitter=null; ball.venueNeutralLive=true;
      match.leftHits=0; match.rightHits=0; match.lastTouchFrame=-100;
      match.serveAceEligible=false; match.serveReceiverTouches=0;
      allPlayers.forEach(p=>p.hasBlockSelfHitPrivilege=false);
    }st.ufoHold=true;ball.x+=(st.ufoX-ball.x)*.10;ball.y+=(165-ball.y)*.10;ball.vx=0;ball.vy=0;}}else if(elapsed<285&&st.ufoHold){st.ufoHold=false;venueSfx('ufo_exit');const tx=WORLD.LEFT+120+Math.random()*(WORLD.RIGHT-WORLD.LEFT-240),flight=78,g=.42;ball.x=st.ufoX;ball.y=170;ball.vx=(tx-ball.x)/flight;ball.vy=(WORLD.FLOOR_Y-ball.radius-ball.y-.5*g*flight*flight)/flight;ball.ufoNeutralRelease=true;ball.venuePortalTimer=42;venueSfx('whoosh');}else if(elapsed>=285){const t=Math.min(1,(elapsed-285)/75);st.ufoPhase=1-t;st.ufoX=WORLD.NET_X+(WORLD.WIDTH+220-WORLD.NET_X)*t;}}
    if(st.timer<=0)endVenueIncident();
  }else if(venueEventsEnabled&&st.draws<st.maxDraws){st.nextDraw--;if(st.nextDraw<=0)drawVenueIncident();}
  // V59: BIRDS 事件只決定何時不再生成；已出場的鳥會繼續飛到畫面外才銷毀，期間仍維持球碰撞。
  if(st.birds&&st.birds.length){
    if(gameFrame-_lastBirdChirpFrame>95){_lastBirdChirpFrame=gameFrame+Math.floor(Math.random()*85);venueSfx('bird');}
    for(const b of st.birds){
      b.x+=b.vx;
      const dx=ball.x-b.x,dy=ball.y-b.y;
      if(!b.dead&&dx*dx+dy*dy<(b.r+ball.radius)*(b.r+ball.radius)){
        const d=Math.hypot(dx,dy)||1,nx=dx/d,ny=dy/d,dot=ball.vx*nx+ball.vy*ny;ball.vx-=2*dot*nx;ball.vy-=2*dot*ny;ball.vx*=.86;ball.vy*=.86;
        b.dead=true; createImpactSparks(b.x,b.y,18,'#ef4444'); createImpactSparks(b.x,b.y,10,'#fca5a5'); playSkillAsset('SFX/incidents/bird_dead_voice.wav',.34); playSkillAsset('SFX/incidents/bird_blood.wav',.31); if(typeof NET!=='undefined'&&NET.isMultiplayer&&NET.isHost&&NET.conn&&NET.conn.open)NET.conn.send({type:'BIRD_KILL_FX',x:b.x,y:b.y});
        const hitter=ball.lastHitter; if(hitter){ hitter._birdKillsThisMatch=(hitter._birdKillsThisMatch||0)+1; ball._birdHitActorSlot=hitter.slotIndex; awardAchievementForActor(hitter,'ach_bird_perch'); if(hitter._birdKillsThisMatch>=3)awardAchievementForActor(hitter,'ach_bird_triple'); }
      }
    }
    st.birds=st.birds.filter(b=>!b.dead&&((b.dir||1)>0?b.x<WORLD.WIDTH+260:b.x>-260));
  }
  for(const p of allPlayers){
    if(p.isGrounded&&(p._beachBallHit||0)<=0){p._beachBounceChain=0;p._beachBounceAirborne=false;}
    if(p.venueShockTimer>0)p.venueShockTimer--;
    if(p.venueShockRecoveryTimer>0){if((p.stunTimer||0)<=0)p.venueShockRecoveryTimer--;}else p.venueShockRecoveryTotal=0;
    if(p.venueDizzyTimer>0)p.venueDizzyTimer--;else p.venueDizzyTotal=0;
    if(p.venueSpinTimer>0)p.venueSpinTimer--;
  }
}
function venueBallAcceleration(){const v=getCurrentVenue();let ax=0;if(v.fixed==='micro_wind')ax+=Math.sin(gameFrame*.009)*.008;if(venueIncidentState.active==='WIND_GUST')ax+=venueIncidentState.wind;return ax;}
function venueGravityFactor(){if(venueIncidentState.active!=='GRAVITY_ANOMALY')return 1;const elapsed=venueIncidentState.total-venueIncidentState.timer;if(elapsed<90)return 1;return .48+.16*Math.sin(gameFrame*.025);}
function venueRecoveryCurve(timer,total){const remain=Math.max(0,Math.min(1,(timer||0)/(total||1))),r=1-remain;return r*r*(3-2*r);}
function venuePlayerSpeedFactor(p){
  const f=getCurrentVenue().fixed;let k=f==='sand_floor'?.82:1;
  if(venueIncidentState.active==='BLIZZARD'){const heat=p.venueHeat??1;k*=.30+.70*heat;}
  if(p.venueDizzyTimer>0){const r=venueRecoveryCurve(p.venueDizzyTimer,p.venueDizzyTotal||300);k*=.10+.90*r;}
  if(p.venueShockRecoveryTimer>0){const r=venueRecoveryCurve(p.venueShockRecoveryTimer,p.venueShockRecoveryTotal||240);k*=.08+.92*r;}
  return k;
}
function venueJumpFactor(p){
  let k=getCurrentVenue().fixed==='sand_floor'?.86:1;
  // V59: 地下場暈眩不只拖慢跑速，也壓低起跳；恢復沿用同一條平滑曲線。跳躍保留 40% 下限，避免完全失去操作。
  if(p&&p.venueDizzyTimer>0){const r=venueRecoveryCurve(p.venueDizzyTimer,p.venueDizzyTotal||300);k*=.40+.60*r;}
  // 雷擊：硬直結束後動能與跳躍仍逐步恢復，不會下一幀突然滿速。
  if(p&&p.venueShockRecoveryTimer>0){const r=venueRecoveryCurve(p.venueShockRecoveryTimer,p.venueShockRecoveryTotal||240);k*=.45+.55*r;}
  return k;
}
function venueExhaustionRecoveryFactor(){return getCurrentVenue().fixed==='heat'?.68:1;}
function venueGroundFriction(){const f=getCurrentVenue().fixed;if(f==='ice_floor')return .975;if(f==='wet_floor')return venueIncidentState.active==='RAIN_SURGE'?.94:.90;return 0;}
function venueFloorYAt(x){if(getCurrentVenue().fixed!=='ship_sway')return WORLD.FLOOR_Y;return WORLD.FLOOR_Y+Math.tan(venueIncidentState.shipTilt)*(x-WORLD.NET_X);}
// ========================================================
// V45 VENUE INCIDENT TESTER — 開發版 B 鍵手動觸發
// 不消耗正式隨機抽牌次數；即使該模式 venueEventsEnabled=false 仍可測試。
// 連線時只允許 Host 觸發，避免 Guest 製造不同步的世界狀態。
// ========================================================
let venueIncidentDebugOpen = false;
function forceVenueIncidentForTest(id){
  if(!VENUE_INCIDENTS[id] || id==='NONE') return;
  if(typeof NET!=='undefined' && NET.isMultiplayer && !NET.isHost){
    if(typeof pushCallout==='function') pushCallout(WORLD.NET_X, WORLD.NET_TOP_Y-115, '⚠ 僅 Host 可觸發測試事件', '#fb7185');
    return;
  }
  const def=VENUE_INCIDENTS[id];
  beginVenueIncident(id);
  if(typeof pushCallout==='function') pushCallout(WORLD.NET_X, WORLD.NET_TOP_Y-115, `🧪 ${def.name}`, def.color);
  renderVenueIncidentDebugPanel();
}
function stopVenueIncidentForTest(){
  endVenueIncident(); venueIncidentState.flash=0;
  renderVenueIncidentDebugPanel();
}
function ensureVenueIncidentDebugPanel(){
  let el=document.getElementById('venue-incident-debug-panel');
  if(el) return el;
  el=document.createElement('div');
  el.id='venue-incident-debug-panel';
  el.style.cssText='display:none;position:fixed;right:18px;top:70px;width:330px;max-height:78vh;overflow:auto;z-index:120000;background:rgba(8,12,24,.96);border:2px solid #38bdf8;border-radius:14px;padding:14px;color:#e2e8f0;font-family:inherit;box-shadow:0 16px 50px rgba(0,0,0,.55);';
  document.body.appendChild(el);
  return el;
}
function renderVenueIncidentDebugPanel(){
  const el=ensureVenueIncidentDebugPanel();
  const v=getCurrentVenue();
  const legal=[...new Set((v.eventDeck||[]).filter(id=>id!=='NONE' && VENUE_INCIDENTS[id]))];
  const active=venueIncidentState.active ? (VENUE_INCIDENTS[venueIncidentState.active]?.name||venueIncidentState.active) : '無';
  const hostLocked=(typeof NET!=='undefined' && NET.isMultiplayer && !NET.isHost);
  el.innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px;">
      <div><b style="color:#38bdf8;font-size:16px;">🧪 場地突襲測試器</b><div style="font-size:11px;color:#94a3b8;margin-top:2px;">Shift+B 碰撞箱 · B 事件快捷鍵暫停使用</div></div>
      <button onclick="toggleVenueIncidentDebugPanel(false)" style="background:#1e293b;color:white;border:0;border-radius:8px;padding:6px 9px;cursor:pointer;">✕</button>
    </div>
    <div style="font-size:12px;background:#111827;border-radius:9px;padding:9px;margin-bottom:10px;line-height:1.6;">
      場地：<b>${v.icon||''} ${v.name||v.id}</b><br>
      正式突襲：<b style="color:${venueEventsEnabled?'#4ade80':'#f87171'}">${venueEventsEnabled?'ON':'OFF'}</b>　目前事件：<b>${active}</b>
      ${hostLocked?'<br><span style="color:#fb7185">連線 Guest 僅能觀看；請由 Host 觸發。</span>':''}
    </div>
    <div style="font-size:11px;color:#94a3b8;margin-bottom:7px;">只列出這張場地合法事件。按一次立即觸發一次，不計入正式抽牌次數。</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:7px;">
      ${legal.length?legal.map(id=>`<button ${hostLocked?'disabled':''} onclick="forceVenueIncidentForTest('${id}')" style="padding:9px 7px;border:1px solid #334155;border-radius:9px;background:#172033;color:${VENUE_INCIDENTS[id].color};font-weight:800;cursor:${hostLocked?'not-allowed':'pointer'};opacity:${hostLocked?'.45':'1'};">${VENUE_INCIDENTS[id].name}</button>`).join(''):'<div style="grid-column:1/-1;color:#facc15;padding:10px;text-align:center;">此場地沒有突襲事件</div>'}
    </div>
    <button ${hostLocked?'disabled':''} onclick="stopVenueIncidentForTest()" style="width:100%;margin-top:10px;padding:9px;border:1px solid #ef4444;border-radius:9px;background:#3f151b;color:#fecaca;font-weight:800;cursor:${hostLocked?'not-allowed':'pointer'};opacity:${hostLocked?'.45':'1'};">■ 停止目前事件</button>
  `;
}
function toggleVenueIncidentDebugPanel(force){
  if(!isGameStarted) return;
  const el=ensureVenueIncidentDebugPanel();
  venueIncidentDebugOpen=(typeof force==='boolean')?force:!venueIncidentDebugOpen;
  el.style.display=venueIncidentDebugOpen?'block':'none';
  if(venueIncidentDebugOpen) renderVenueIncidentDebugPanel();
}

