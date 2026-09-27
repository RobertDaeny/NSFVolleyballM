// ========================================================
// AI 戰術決策層：拋物線落點預判、三觸分配、智慧封網與新技能施放
// ========================================================

// 🌟 核心身分仲裁：精準判斷該格子是否為「真人玩家」（本機或遠端訪客）
const _aiLateChanceEpisodeKey = { LEFT:null, RIGHT:null };
const _aiOwnerLateEpisodeKey = { LEFT:null, RIGHT:null };

// V76-3.7.3 FIRST-TOUCH ACTION UTILITY / V76-3.7.2 UNIFIED FIRST-TOUCH ATTACK WINDOWS / V76-3.7.1 SPEECH READABILITY + FIRST-TOUCH ATTACK GATE / V76-3.7 CALLOUT HIERARCHY + BLOCK TIMING COACH / V76-3.6 BLOCK LOAD MODEL / V76-3.5 POSSESSION TURN ORDER REFACTOR + DEFENSIVE-READINESS QUICK / V76-3.4.3 QUICK TIMING / SECOND-TOUCH CONTACT QUALITY / V76-3.4.2 DYNAMIC WAIT + DEFENSE PRESSURE / V76-3.4.1 QUICK FEED ENVELOPE / V76-3.4 QUICK PRECOMMIT vs WAIT / V76-3.3.1 LATE-AIR TELEMETRY CRASH HOTFIX / V76-3.3 PHYSICAL WINDOW -> TEMPO SELECTION / V76-3.2 LONG-HORIZON THIRD-TOUCH TRACKING / V76-3.1 FACING SEMANTICS HOTFIX / V76-3 CONTACT QUALITY & TAKEOFF REVALIDATION / V76-2 ATTACK TEMPO & CONTACT REALISM / V76-1 ATTACK COMMIT ARCHITECTURE
// Stats -> Capability：AI 永遠讀自己的實際性能，不以 30 當開關或人格分界。
// Game State -> Options -> Utility：能力只改變「做不做得到 / 做得多好」，不直接綁定某種打法。
function aiClamp01(v) { return Math.max(0, Math.min(1, Number(v) || 0)); }
function aiNorm(v, lo=0, hi=60) { return aiClamp01(((Number(v) || 0) - lo) / Math.max(1e-6, hi - lo)); }
function aiCapabilitySnapshot(player) {
  const s = player?.stats || {};
  const eff = (key, fallback=30) => Number.isFinite(Number(s[key])) ? Number(s[key]) : fallback;
  return {
    str: eff('effectiveStr', eff('str', 30)),
    agi: eff('effectiveAgi', eff('agi', 30)),
    jump: eff('effectiveJump', eff('jumpStat', 30)),
    tec: eff('effectiveTec', eff('dex', 30)),
    int: eff('effectiveInt', eff('intellect', 30)),
    speed: Number(s.speed ?? player?.effectiveSpeed ?? 1) || 1,
    power: Number(s.power ?? 0) || 0,
    reach: Number(s.reach ?? 64) || 64,
    reaction: Number(s.reactionDelay ?? 8) || 8,
    diveSpeed: Number(s.diveSpeed ?? ((player?.effectiveSpeed || 1) * 2)) || 1,
    rigidity: Number(s.blockRigidity ?? 0) || 0,
    sweet: Number(s.sweetWindow ?? 0) || 0,
    technique: Number(s.technique ?? 0) || 0
  };
}

// 決策噪音不消耗 Math.random，避免 Balance Lab 不同配點因額外 RNG call 破壞可比性。
// INT 越高，選擇越穩定；仍保留少量戰術變異，避免 Utility AI 變成固定腳本。
function aiDecisionNoise(player, tag, optionId) {
  const cap = aiCapabilitySnapshot(player);
  const iq = aiNorm(cap.int);
  const seedText = `${tag}|${optionId}|${match?.lastTouchFrame ?? 0}|${player?.slotIndex ?? 0}`;
  let h = 2166136261;
  for (let i=0;i<seedText.length;i++) { h ^= seedText.charCodeAt(i); h = Math.imul(h, 16777619); }
  const unit = ((h >>> 0) % 10000) / 9999;
  return (unit * 2 - 1) * (0.055 - iq * 0.025);
}

function aiExecutionNoise(player, tag) {
  const cap=aiCapabilitySnapshot(player);
  const tq=aiNorm(cap.tec);
  const seedText=`EXEC|${tag}|${match?.lastTouchFrame??0}|${player?.slotIndex??0}`;
  let h=2166136261;
  for(let i=0;i<seedText.length;i++){h^=seedText.charCodeAt(i);h=Math.imul(h,16777619);}
  const unit=((h>>>0)%10000)/9999;
  return (unit*2-1)*(1.0-tq*0.65);
}

function aiChooseUtilityOption(player, tag, options) {
  const evaluated = (options || []).map(o => ({
    ...o,
    utility: Number(o.utility) || 0,
    feasible: o.feasible !== false,
    finalUtility: (Number(o.utility) || 0) + (o.feasible === false ? -999 : aiDecisionNoise(player, tag, o.id))
  }));
  const legal = evaluated.filter(o => o.feasible);
  const selected = legal.slice().sort((a,b)=>b.finalUtility-a.finalUtility)[0] || null;
  return { selected, options:evaluated };
}

function emitAIIntent(player, phase, payload={}) {
  if (typeof pushAIIntentAudit !== 'function' || !player) return null;
  return pushAIIntentAudit(player, phase, payload);
}

// V75-3.18 THIRD TOUCH LIFECYCLE:
// A third-touch plan is a possession-scoped object. It must be explicitly cancelled when
// an opponent touch supersedes it, and a successful second-touch attack must not spawn a
// phantom third-touch attacker. These helpers change state ownership only; they do not
// alter attack geometry, physics, Utility, or human input rules.
function aiCancelThirdTouchPlan(player, reason, context={}) {
  const plan=player?._thirdAttackPlan;
  if(!player) return false;
  // V76-3.2: long-horizon TRACK/STAGE is possession-scoped too. Even when no tactical
  // commit exists yet, a superseding touch must discard the old future-window read.
  player._thirdAttackTrack=null;
  if(!plan) return false;
  emitAIIntent(player,'THIRD_TOUCH_LIFECYCLE',{
    attackIntentId:plan.attackIntentId||null,stage:'CANCEL',capability:aiCapabilitySnapshot(player),personality:aiPersonalityId(player),
    context:{reason,fromIntent:plan.originalIntent||plan.intent||null,currentIntent:plan.intent||null,planTouchFrame:plan.touchKey??null,cancelTouchFrame:(typeof match!=='undefined'?match.lastTouchFrame:null),...context},
    options:[],selected:reason,selectedFeasible:true,reason
  });
  if(typeof pushAIBrainTrace==='function')pushAIBrainTrace(player.isLeft?'LEFT':'RIGHT','3RD PLAN CANCEL',`${reason} | ${plan.originalIntent||plan.intent||'-'}`);
  player._thirdAttackPlan=null;
  return true;
}

function aiOwnSecondAttackReleased(isLeft, teamHits) {
  if(teamHits!==2 || !ball?.lastHitter || ball.lastHitter.isLeft!==isLeft) return false;
  // lastAttackHitter is assigned only by real J/L attack handlers after recordTouch accepts the touch.
  if(ball.lastAttackHitter!==ball.lastHitter) return false;
  // Only close the third-touch gate when the launched ball is actually travelling toward the opponent.
  // A blocked-back ball is handled by the existing COVER_CHASE branch after the opponent block touch.
  return isLeft ? ball.vx>0.05 : ball.vx<-0.05;
}

// V75-3.20 THIRD TOUCH POSSESSION GATE:
// teamHits===2 is a touch-count fact, not proof that this side still owns the attacking ball.
// A legal third-touch plan requires the latest real touch to still belong to this team.
function aiThirdTouchReleasedAcrossNet(isLeft, teamHits) {
  if(teamHits!==2 || !ball?.lastHitter || ball.lastHitter.isLeft!==isLeft) return false;
  const facing=isLeft?1:-1;
  const crossed=(ball.x-WORLD.NET_X)*facing>8;
  const travellingAway=(ball.vx||0)*facing>0.05;
  return crossed && travellingAway;
}

function aiOwnThirdTouchPossession(isLeft, teamHits) {
  return teamHits===2 && !!ball?.lastHitter && ball.lastHitter.isLeft===isLeft && !aiThirdTouchReleasedAcrossNet(isLeft,teamHits);
}

// V76-3.5 POSSESSION TURN ORDER:
// In 2v2, once our side has made a non-block legal touch, the next legal teammate is deterministic:
// A -> B -> A. This function answers ONLY touch legality/ownership; it never chooses SET/ATTACK/SAVE.
// Block self-contact remains governed by recordTouch()/hasBlockSelfHitPrivilege and is intentionally not folded here.
function aiLegalNextTeamToucher(pA,pB,isLeft,teamHits){
  if(teamHits!==1 && teamHits!==2) return null;
  const last=ball?.lastHitter;
  if(!last || last.isLeft!==isLeft) return null;
  if(last===pA) return pB;
  if(last===pB) return pA;
  return null;
}

function aiTouchOwnerSlot(player){
  return player ? (player.slotKey||`slot${player.slotIndex}`) : null;
}

// V75-3.10 PERSONALITY HOOK：個性只修正「合法選項之間的偏好」，不改 Capability / Feasibility。
// 目前角色資料沒有強制 personality 欄位，因此預設 BALANCED = 0，先把架構留好而不污染數值測試。
function aiPersonalityId(player) {
  return String(player?.aiPersonality || player?.card?.aiPersonality || 'BALANCED').toUpperCase();
}
function aiPersonalityUtilityBias(player, phase, optionId, context={}) {
  const id = aiPersonalityId(player);
  if (id === 'BALANCED') return 0;
  if (phase === 'ATTACK') {
    if (id === 'AGGRESSIVE') return optionId==='POWER'||optionId==='STEEP' ? 0.045 : -0.01;
    if (id === 'PATIENT') return optionId==='DEEP' ? 0.025 : 0;
    if (id === 'GAMBLER') return optionId==='STEEP' ? 0.055 : 0;
  }
  if (phase === 'BLOCK') {
    if (id === 'PATIENT') return optionId==='SAFE' ? 0.05 : -0.01;
    if (id === 'AGGRESSIVE'||id === 'GAMBLER') return optionId==='PERFECT' ? 0.05 : -0.01;
  }
  // V76-3.4: personality lives after base Expected Utility for the pre-set quick decision.
  // It changes risk preference only; it can never create QUICK feasibility or alter physics.
  if (phase === 'QUICK_PRECOMMIT') {
    if (id === 'PATIENT') return optionId==='WAIT' ? 0.05 : -0.015;
    if (id === 'AGGRESSIVE') return optionId==='QUICK' ? 0.045 : -0.01;
    if (id === 'GAMBLER') return optionId==='QUICK' ? 0.055 : -0.015;
  }
  // V76-3.7.3: personality only changes the risk threshold between two ALREADY-feasible
  // first-touch actions. It never creates an attack/receive window and never changes physics.
  if (phase === 'FIRST_TOUCH_ACTION') {
    if (id === 'PATIENT') return optionId==='CONTROL' ? 0.050 : -0.020;
    if (id === 'AGGRESSIVE') return optionId==='ATTACK' ? 0.045 : -0.010;
    if (id === 'GAMBLER') return optionId==='ATTACK' ? 0.065 : -0.020;
  }
  return 0;
}

function aiAttackTeamFacing(player) {
  return player?.isLeft ? 1 : -1;
}

function aiAttackLiveFacing(player) {
  if (!player) return 1;
  return player.facing === -1 ? -1 : 1;
}

// V76-4: live attack geometry must use the SAME facing semantics as handleUserAttack().
// Predictors may explicitly pass a future/intended facing, but a live feasibility check may
// never assume "left team faces right / right team faces left" when the actor is actually
// looking the other way. That mismatch made grounded SAFE_J plans repeatedly swing behind
// the ball after a human set.
function aiAttackContactState(player, bx=ball.x, by=ball.y, px=player?.x, py=player?.y, facingOverride=null) {
  if (!player) return null;
  const facing = facingOverride === -1 || facingOverride === 1 ? facingOverride : aiAttackLiveFacing(player);
  const shoulderX = px, shoulderY = py - player.radius * 1.5;
  const dx = (bx - shoulderX) * facing, dy = -(by - shoulderY);
  if (dx < -10 || dx > 80 || Math.abs(dy) > 80) return null;
  const angle = Math.atan2(dy, dx);
  const style = angle > 0.6 ? 'DEEP' : (angle >= 0.1 ? 'POWER' : 'STEEP');
  return {dx,dy,angle,style,x:bx,y:by,facing};
}

// Grounded players are allowed to turn toward a live ball before a standing attack. This is
// orientation only: it does not move/teleport the actor or create reach. Airborne actors are
// deliberately excluded so recovery cannot gain an instant mid-air reversal cheat.
function aiOrientGroundAttackTowardBall(player, bx=ball.x) {
  if (!player || !player.isGrounded) return aiAttackLiveFacing(player);
  const gap = bx - player.x;
  if (gap > 1) player.facing = 1;
  else if (gap < -1) player.facing = -1;
  return aiAttackLiveFacing(player);
}

// V76-3: LEGAL J reach stays unchanged for the human/mechanics layer, but normal AI
// offense should not deliberately live on the outer edge of that rectangle. This is a
// quality envelope, not a second physics hitbox.
function aiPrimaryQualityContactState(player, bx=ball.x, by=ball.y, px=player?.x, py=player?.y) {
  const c=aiAttackContactState(player,bx,by,px,py);
  if(!c)return null;
  const shoulderDist=Math.hypot(c.dx,c.dy);
  if(c.dx<10||c.dx>60||Math.abs(c.dy)>58||shoulderDist>68)return null;
  return {...c,shoulderDist};
}

// Emergency J may be uglier than a planned swing, but AI should still avoid farming the
// absolute -10..80 / +/-80 corners. The truly extreme reach remains legal for a human and
// is reserved for a future stretched-contact mechanic rather than a full-quality AI spike.
function aiEmergencyJContactState(player, bx=ball.x, by=ball.y, px=player?.x, py=player?.y) {
  const c=aiAttackContactState(player,bx,by,px,py);
  if(!c)return null;
  const shoulderDist=Math.hypot(c.dx,c.dy);
  if(c.dx<-4||c.dx>68||Math.abs(c.dy)>70||shoulderDist>82)return null;
  return {...c,shoulderDist};
}

// V76-3 PRE-TAKEOFF VALIDATION. A ground plan is provisional until takeoff. At the jump
// frame, re-read the LIVE ball (no old set-read noise) and ask whether jumping now can still
// reach the committed style inside the AI quality envelope. This prevents perfect execution
// of a stale prediction from looking like a bizarre "jumped to the wrong place" error.
function aiLiveTakeoffWindow(player, desiredStyle=null, maxFrames=42, tempo='NORMAL') {
  if(!player||!player.isGrounded)return null;
  const facing=aiAttackTeamFacing(player);
  const startX=player.x, groundY=player.y;
  const airControl=Math.min(3.0,Math.max(1.2,(player.effectiveSpeed||player.stats?.speed||1)*0.34));
  const venueG=WORLD.GRAVITY*((typeof getCurrentVenue==='function')?getCurrentVenue().gravityMult:1.0)*(typeof venueGravityFactor==='function'?venueGravityFactor():1);
  const jumpVy=(Number(player.stats?.jump)||-12.8)*(Number(player.jumpExhaustion)||1)*(typeof venueJumpFactor==='function'?venueJumpFactor(player):1);
  const styleCenter={DEEP:0.90,POWER:0.35,STEEP:0.00};
  const minAttackX=player.isLeft ? WORLD.LEFT+70 : WORLD.NET_X+45;
  const maxAttackX=player.isLeft ? WORLD.NET_X-45 : WORLD.RIGHT-70;
  const formula=(typeof computeSpikeFormula==='function')?computeSpikeFormula(player.stats,player.runMomentum):null;
  const effectivePower=formula?.effectivePower||player.stats?.power||26;
  const tempoMode=['QUICK','NORMAL','HIGH'].includes(tempo)?tempo:null;
  const framesObserved=Math.max(0,gameFrame-match.lastTouchFrame);
  let bx=ball.x,by=ball.y,bvx=ball.vx,bvy=ball.vy;
  let py=groundY,pvy=jumpVy;
  let best=null;
  for(let f=1;f<=maxFrames;f++){
    py+=pvy;pvy+=venueG;
    bx+=bvx;by+=bvy;
    bvy+=aiBallGravityForPrediction(bvx,ball);
    if(by+(ball.radius||12)>=WORLD.FLOOR_Y)break;
    const shoulderY=py-player.radius*1.5;
    const dy=-(by-shoulderY);
    const contactAge=framesObserved+f;
    const tempoOK=tempoMode?aiThirdTempoWindowEligible(tempoMode,contactAge):true;
    if(!tempoOK||Math.abs(dy)>58)continue;
    const maxAirTravel=airControl*f+3;
    for(let dx=10;dx<=60;dx+=2){
      const shoulderDist=Math.hypot(dx,dy);
      if(shoulderDist>68)continue;
      const targetPx=bx-facing*dx;
      if(targetPx<minAttackX||targetPx>maxAttackX)continue;
      if(Math.abs(targetPx-startX)>maxAirTravel)continue;
      const angle=Math.atan2(dy,dx);
      const style=angle>0.6?'DEEP':(angle>=0.1?'POWER':'STEEP');
      if(desiredStyle&&style!==desiredStyle)continue;
      const plannerSafe=style==='DEEP'?angle>=0.64:(style==='POWER'?(angle>=0.14&&angle<=0.56):angle<=0.06);
      if(!plannerSafe)continue;
      const rec={frame:f,x:bx,y:by,angle,dx,dy,targetShoulderX:targetPx,shoulderDist};
      const traj=aiProjectedAttackTrajectory(player,style,rec,effectivePower);
      if(!traj.safe)continue;
      rec.trajectory=traj;rec.style=style;
      const score=Math.abs(angle-styleCenter[style]) + shoulderDist*0.002 + f*0.0008;
      if(!best||score<best.score)best={score,rec};
    }
  }
  return best?.rec||null;
}

// V76-3.7.2: first-touch ATTACK has no special height/range gate.
// The first/second/third-touch layer decides WHO may touch; this layer only asks whether the
// normal attack physics can produce a real quality/court-safe contact window. Low tape rollers,
// medium balls and high chance balls therefore all use the same attack geometry.
function aiSelectFirstTouchAttackPlan(player) {
  const windows=predictAIAttackCommitWindows(player,64,24,'ANY',{minJumpDelay:0,readKey:'ATTACK_FIRST_READ'});
  let best=null;
  for(const style of ['DEEP','POWER','STEEP']){
    const rec=windows?.[style];
    if(!rec)continue;
    if(!best || Number(rec._commitScore)<Number(best._commitScore)) best={...rec,style};
  }
  return best;
}

// V76-3.7.3 FIRST-TOUCH ACTION UTILITY
// Every quantity below is derived from live/predicted game state and is emitted to telemetry.
// No FutureAttackValue / TeamStructureValue / CoverRisk magic numbers are used here.
function aiEstimateFirstTouchReceiveOption(player, maxFrames=72) {
  if(!player||player.isDiving||!player.isGrounded) return {feasible:false,reason:'ACTOR_NOT_GROUNDED'};
  const cap=aiCapabilitySnapshot(player);
  const speed=Math.max(0.5,Number(player.effectiveSpeed||cap.speed)||1);
  const reach=Math.max(64,Number(player.stats?.reach||cap.reach)||64);
  const sweet=Math.max(0,Number(player.stats?.sweetWindow||cap.sweet)||0);
  const startX=player.x, groundY=player.y;
  const facingNoise=aiDecisionNoise(player,'FIRST_TOUCH_RECEIVE_READ','X')*90;
  const vyNoise=aiDecisionNoise(player,'FIRST_TOUCH_RECEIVE_READ','VY')*5;
  let bx=ball.x+facingNoise, by=ball.y, bvx=ball.vx, bvy=ball.vy+vyNoise;
  let best=null;
  for(let f=0;f<=maxFrames;f++){
    if(by+(ball.radius||12)>=WORLD.FLOOR_Y) break;
    const travel=speed*f;
    const targetPx=Math.max(startX-travel,Math.min(startX+travel,bx));
    const shoulderY=groundY-player.radius;
    const dist=Math.hypot(targetPx-bx,shoulderY-by);
    if(dist<=reach){best={frame:f,dist,targetX:targetPx,x:bx,y:by};break;}
    bx+=bvx;by+=bvy;bvy+=aiBallGravityForPrediction(bvx,ball);
  }
  if(!best) return {feasible:false,reason:'NO_PREDICTED_RECEIVE_WINDOW'};
  const incomingSpeed=Math.hypot(ball.vx,ball.vy);
  const floatBonus=ball.isFloat?6:0;
  const effectiveDef=Math.max(0,Number(player.stats?.defense)||0);
  const pressure=(typeof computeReceivePressureFormula==='function')
    ? computeReceivePressureFormula(player.stats,incomingSpeed,floatBonus,effectiveDef)
    : Math.max(0,(incomingSpeed+floatBonus)*0.95-effectiveDef);
  const perfect=best.dist<sweet;
  const catastrophicPressure=Math.max(0,pressure-10.5);
  const catastrophicChance=ball.isBrokenSpike?0.68:(ball.isSkyComet?0.58:Math.min(0.42,catastrophicPressure*0.055));
  const excessPressure=Math.max(0,pressure-3.2);
  const overpassChance=Math.min(0.32,excessPressure>0?(0.06+excessPressure*0.028):0);
  const receiveProbability=perfect?1:aiClamp01(1-catastrophicChance);
  // ExpectedControlQuality mirrors the actual receive system: sweet-window contacts are ideal;
  // normal bumps lose quality with pressure and expected overpass risk. This is an expectation,
  // not a fabricated future ball path.
  const pressureQuality=aiClamp01(1-pressure/16);
  const expectedControlQuality=perfect?1:aiClamp01(0.48+pressureQuality*0.30-overpassChance*0.22);
  return {feasible:true,reason:'PREDICTED_RECEIVE_WINDOW',frame:best.frame,dist:best.dist,targetX:best.targetX,
    incomingSpeed,pressure,perfect,catastrophicChance,overpassChance,receiveProbability,expectedControlQuality};
}

function aiEvaluateFirstTouchAction(player) {
  if(!player) return null;
  const attack=aiSelectFirstTouchAttackPlan(player);
  const receive=aiEstimateFirstTouchReceiveOption(player);
  const cap=aiCapabilitySnapshot(player);
  let attackEV=0, attackContext=null;
  if(attack){
    const contactQuality=aiClamp01(1-(Number(attack._commitScore)||0)/0.90);
    const estMomentum=Number(attack.estimatedTakeoffMomentum)||0;
    const formula=(typeof computeSpikeFormula==='function')?computeSpikeFormula(player.stats,estMomentum):null;
    const effectivePower=formula?.effectivePower||player.stats?.power||26;
    const outVx=attack.style==='DEEP'?effectivePower*1.15:(attack.style==='STEEP'?effectivePower*0.72:effectivePower);
    const outVy=attack.style==='DEEP'?6.8:(attack.style==='STEEP'?16.5:12.0);
    const outgoingSpeed=Math.hypot(outVx,outVy);
    const attackThreat=aiClamp01((outgoingSpeed-18)/(42-18));
    const tec=aiNorm(cap.tec), intel=aiNorm(cap.int);
    const runETA=Number(attack.approachDistance||0)/Math.max(0.5,Number(cap.speed)||1);
    const arrivalSlack=Number(attack.jumpDelay||0)-runETA;
    const slackQuality=aiClamp01((arrivalSlack+4)/12);
    const executionProbability=aiClamp01(0.46+tec*0.22+intel*0.12+contactQuality*0.12+slackQuality*0.08);
    const defense=aiProjectedDefensePressure(player,Number(attack.frame)||0,attack.x,attack.y);
    const opponentDefensePressure=aiClamp01(defense.total||0);
    // Multiplicative core, but defense is a modifier rather than an on/off kill switch.
    attackEV=aiClamp01(contactQuality*executionProbability*(0.55+attackThreat*0.45)*(0.65+(1-opponentDefensePressure)*0.35));
    attackContext={contactQuality,attackThreat,executionProbability,opponentDefensePressure,
      blockPressure:aiClamp01(defense.block?.pressure||0),floorPressure:aiClamp01(defense.floor?.pressure||0),
      outgoingSpeed,arrivalSlack,runETA,style:attack.style,contactFrame:attack.frame,jumpDelay:attack.jumpDelay,
      targetShoulderX:attack.targetShoulderX,landX:attack.trajectory?.landX??null};
  }
  const receiveProbability=receive?.feasible?aiClamp01(receive.receiveProbability):0;
  const expectedControlQuality=receive?.feasible?aiClamp01(receive.expectedControlQuality):0;
  const controlEV=aiClamp01(receiveProbability*expectedControlQuality);
  let attackU=attackEV+aiPersonalityUtilityBias(player,'FIRST_TOUCH_ACTION','ATTACK',{attack,receive});
  let controlU=controlEV+aiPersonalityUtilityBias(player,'FIRST_TOUCH_ACTION','CONTROL',{attack,receive});
  const options=[
    {id:'ATTACK',feasible:!!attack,utility:attackU,reason:attack?'COMMON_ATTACK_WINDOW':'NO_ATTACK_WINDOW'},
    {id:'CONTROL',feasible:!!receive?.feasible,utility:controlU,reason:receive?.feasible?'PREDICTED_RECEIVE_WINDOW':'NO_RECEIVE_WINDOW'}
  ];
  const choice=aiChooseUtilityOption(player,'FIRST_TOUCH_ACTION',options);
  const context={
    attackFeasible:!!attack,receiveFeasible:!!receive?.feasible,
    attackEV:+attackEV.toFixed(4),controlEV:+controlEV.toFixed(4),
    contactQuality:attackContext?+attackContext.contactQuality.toFixed(4):null,
    attackThreat:attackContext?+attackContext.attackThreat.toFixed(4):null,
    executionProbability:attackContext?+attackContext.executionProbability.toFixed(4):null,
    opponentDefensePressure:attackContext?+attackContext.opponentDefensePressure.toFixed(4):null,
    blockPressure:attackContext?+attackContext.blockPressure.toFixed(4):null,
    floorPressure:attackContext?+attackContext.floorPressure.toFixed(4):null,
    outgoingSpeed:attackContext?+attackContext.outgoingSpeed.toFixed(2):null,
    arrivalSlack:attackContext?+attackContext.arrivalSlack.toFixed(2):null,
    receiveProbability:receive?.feasible?+receiveProbability.toFixed(4):null,
    expectedControlQuality:receive?.feasible?+expectedControlQuality.toFixed(4):null,
    receivePressure:receive?.feasible?+Number(receive.pressure).toFixed(3):null,
    predictedReceiveDist:receive?.feasible?+Number(receive.dist).toFixed(2):null,
    predictedReceiveFrame:receive?.feasible?receive.frame:null,
    predictedPerfectReceive:receive?.feasible?!!receive.perfect:false,
    personality:aiPersonalityId(player)
  };
  emitAIIntent(player,'FIRST_TOUCH_ACTION',{stage:'SELECT',capability:cap,personality:aiPersonalityId(player),context,
    options:choice.options.map(o=>({id:o.id,feasible:o.feasible,utility:+o.utility.toFixed(4),finalUtility:+o.finalUtility.toFixed(4),reason:o.reason})),
    selected:choice.selected?.id||'NONE',selectedFeasible:!!choice.selected?.feasible,reason:choice.selected?.reason||'NO_FEASIBLE_ACTION'});
  return {choice,attack,receive,context};
}

// 預測「玩家同一套 J 規則下，且實際能跨網」的 contact window。
// V75-3.10：POWER 需要完整的中段 angle window；STEEP 若會先釘回自己場內，直接不是合法攻擊選項。

function aiTipContactState(player, bx=ball.x, by=ball.y, px=player?.x, py=player?.y) {
  if (!player) return null;
  const facing=player.isLeft?1:-1;
  const shoulderY=py-player.radius*1.5;
  const forwardDist=(bx-px)*facing;
  const verticalDelta=by-shoulderY;
  if(forwardDist<0||forwardDist>85||Math.abs(verticalDelta)>65) return null;
  return {forwardDist,verticalDelta,x:bx,y:by};
}

// V75-3.15: generic third-touch TIP feasibility uses the same non-skill L launch
// shape as handleUserThrust(). It only answers whether the current physical L touch
// can cross the net; it never creates contact or changes the ball.
function aiProjectedTipTrajectory(player, contact) {
  if(!player||!contact) return {safe:false,reason:'NO_TIP_CONTACT'};
  const dir=player.isLeft?1:-1;
  let vx=dir*12.5;
  let vy=contact.verticalDelta < -15 ? -3.2 : (contact.verticalDelta <= 15 ? 0.5 : 4.8);
  let x=contact.x,y=contact.y;
  const r=Number(ball.radius)||12;
  const towardsNet=(player.isLeft&&x<WORLD.NET_X&&vx>0)||(!player.isLeft&&x>WORLD.NET_X&&vx<0);
  if(!towardsNet) return {safe:false,reason:'WRONG_SIDE'};
  for(let f=1;f<=90;f++){
    const prevX=x,prevY=y;
    x+=vx;y+=vy;vy+=aiBallGravityForPrediction(vx,{...ball,isTopspin:false,topspinRating:0});
    const crossed=player.isLeft?(prevX<WORLD.NET_X&&x>=WORLD.NET_X):(prevX>WORLD.NET_X&&x<=WORLD.NET_X);
    if(crossed){
      const dxCross=x-prevX;if(Math.abs(dxCross)<0.0001)return {safe:false,reason:'NO_NET_CROSS'};
      const t=Math.max(0,Math.min(1,(WORLD.NET_X-prevX)/dxCross));
      const netY=prevY+(y-prevY)*t;
      const clears=(netY+r)<WORLD.NET_TOP_Y;
      return {safe:clears,reason:clears?'CLEARS_NET':'NET',netY:+netY.toFixed(2),frames:f};
    }
    if(y+r>=WORLD.FLOOR_Y)return {safe:false,reason:'OWN_SIDE_FLOOR',frames:f};
  }
  return {safe:false,reason:'NO_NET_CROSS'};
}

// V75-3.15: predicts a REAL future grounded J contact window. "Landing before the ball"
// alone is insufficient: after landing the actor must still be able to reach a shoulder
// position that satisfies the same J geometry before the ball dies. This is prediction only.
function predictAIStandingJSafeWindow(player,maxFrames=48){
  if(!player)return null;
  const facing=aiAttackTeamFacing(player);
  const speed=Math.max(0.5,player.effectiveSpeed||player.stats?.speed||1);
  const gPlayer=WORLD.GRAVITY*((typeof getCurrentVenue==='function')?getCurrentVenue().gravityMult:1.0)*(typeof venueGravityFactor==='function'?venueGravityFactor():1);
  let bx=ball.x,by=ball.y,bvx=ball.vx,bvy=ball.vy;
  let px=player.x,py=player.y,pvx=player.vx,pvy=player.vy;
  let grounded=!!player.isGrounded,landFrame=grounded?0:null,landingX=px;
  const minX=player.isLeft?WORLD.LEFT+40:WORLD.NET_X+25;
  const maxX=player.isLeft?WORLD.NET_X-25:WORLD.RIGHT-40;
  for(let f=0;f<=maxFrames;f++){
    if(grounded){
      const shoulderY=WORLD.FLOOR_Y-player.radius*1.5;
      const dy=-(by-shoulderY);
      if(Math.abs(dy)<=80){
        // Aim for the middle of the legal forward J window, then ask whether ground movement can reach it.
        const targetPx=Math.max(minX,Math.min(maxX,bx-facing*35));
        const groundFrames=Math.max(0,f-(landFrame??f));
        const maxTravel=speed*groundFrames+2;
        if(Math.abs(targetPx-landingX)<=maxTravel){
          const c=aiAttackContactState(player,bx,by,targetPx,WORLD.FLOOR_Y,facing);
          if(c)return {frame:f,targetShoulderX:targetPx,dx:c.dx,dy:c.dy,ballX:bx,ballY:by};
        }
      }
    }
    if(!grounded){
      px+=pvx;py+=pvy;pvy+=gPlayer;
      if(py>=WORLD.FLOOR_Y){py=WORLD.FLOOR_Y;pvy=0;grounded=true;landFrame=f+1;landingX=px;}
    }
    bx+=bvx;by+=bvy;
    bvy+=aiBallGravityForPrediction(bvx,ball);
    if(by+(ball.radius||12)>=WORLD.FLOOR_Y && f>0)break;
  }
  return null;
}
function aiProjectedAttackTrajectory(player, style, contact, effectivePower) {
  if(!player||!contact||!style) return {safe:false,reason:'NO_CONTACT'};
  const dir=player.isLeft?1:-1;
  let vx=0,vy=0;
  if(style==='DEEP'){vx=dir*(effectivePower*1.15);vy=6.8;}
  else if(style==='POWER'){vx=dir*effectivePower;vy=12.0;}
  else if(style==='STEEP'){vx=dir*(effectivePower*0.72);vy=16.5;}
  else return {safe:false,reason:'UNKNOWN_STYLE'};
  if(Math.abs(vx)<0.01) return {safe:false,reason:'NO_FORWARD_SPEED'};
  let x=contact.x,y=contact.y,cy=vy;
  const r=Number(ball.radius)||12;
  const towardsNet=(player.isLeft&&x<WORLD.NET_X&&vx>0)||(!player.isLeft&&x>WORLD.NET_X&&vx<0);
  if(!towardsNet) return {safe:false,reason:'WRONG_SIDE'};
  let crossedNet=false,netY=null,netFrame=null;
  for(let f=1;f<=140;f++){
    const prevX=x, prevY=y;
    x+=vx; y+=cy;
    const venueMult=(typeof getCurrentVenue==='function')?(Number(getCurrentVenue().gravityMult)||1):1;
    const anomalyMult=(typeof venueGravityFactor==='function')?(Number(venueGravityFactor())||1):1;
    let effG=WORLD.GRAVITY*0.72*venueMult*anomalyMult;
    const m=0.00032+(1.05*0.00018);
    effG+=(vx*vx)*m;
    cy+=effG;
    if(!crossedNet){
      const crossed=player.isLeft ? (prevX<WORLD.NET_X&&x>=WORLD.NET_X) : (prevX>WORLD.NET_X&&x<=WORLD.NET_X);
      if(crossed){
        const dxCross=x-prevX;
        if(Math.abs(dxCross)<0.0001) return {safe:false,reason:'NO_NET_CROSS'};
        const t=Math.max(0,Math.min(1,(WORLD.NET_X-prevX)/dxCross));
        netY=prevY+(y-prevY)*t;netFrame=f;
        if(!((netY+r)<WORLD.NET_TOP_Y)) return {safe:false,reason:'NET',netY:+netY.toFixed(2),frames:f};
        crossedNet=true;
      }
    }
    if(y+r>=WORLD.FLOOR_Y){
      const landX=x;
      if(!crossedNet) return {safe:false,reason:'OWN_SIDE_FLOOR',frames:f,landX:+landX.toFixed(1)};
      // V76-2: "clears the net" is not enough. A primary attack must also project to
      // a legal opponent-court landing. Keep a small boundary margin so the planner does
      // not intentionally live on an OUT line; actual Human-J physics remains unchanged.
      const courtMargin=18;
      const minLand=player.isLeft ? WORLD.NET_X+courtMargin : WORLD.LEFT+courtMargin;
      const maxLand=player.isLeft ? WORLD.RIGHT-courtMargin : WORLD.NET_X-courtMargin;
      const inCourt=landX>=minLand&&landX<=maxLand;
      return {safe:inCourt,reason:inCourt?'COURT_SAFE':'PROJECTED_OUT',netY:+Number(netY).toFixed(2),frames:f,netFrame,landX:+landX.toFixed(1),inCourt};
    }
    if(x<WORLD.LEFT-160||x>WORLD.RIGHT+160){
      return {safe:false,reason:'PROJECTED_OUT',netY:Number.isFinite(netY)?+netY.toFixed(2):null,frames:f,netFrame,landX:+x.toFixed(1),inCourt:false};
    }
  }
  return {safe:false,reason:crossedNet?'NO_FLOOR_PROJECTION':'NO_NET_CROSS',netY:Number.isFinite(netY)?+netY.toFixed(2):null};
}

function predictAIThirdContactWindows(player, maxFrames=40) {
  const windows={DEEP:null,POWER:null,STEEP:null,ANY:null,rejected:{DEEP:0,POWER:0,STEEP:0}};
  if (!player) return windows;
  let bx=ball.x, by=ball.y, bvx=ball.vx, bvy=ball.vy;
  let py=player.y, pvy=player.vy;
  const startX=player.x;
  const facing=player.isLeft?1:-1;
  const speed=Math.max(0.5, player.effectiveSpeed||player.stats?.speed||1);
  const g=WORLD.GRAVITY*((typeof getCurrentVenue==='function')?getCurrentVenue().gravityMult:1.0)*(typeof venueGravityFactor==='function'?venueGravityFactor():1);
  const formula=(typeof computeSpikeFormula==='function')?computeSpikeFormula(player.stats,player.runMomentum):null;
  const effectivePower=formula?.effectivePower||player.stats?.power||26;
  const minAttackX=player.isLeft ? WORLD.LEFT+70 : WORLD.NET_X+45;
  const maxAttackX=player.isLeft ? WORLD.NET_X-45 : WORLD.RIGHT-70;
  const styleCenter={DEEP:0.90,POWER:0.35,STEEP:0.00};

  // V75-3.12：不要用「一路追到球正下方」的單一路徑判定所有攻擊。
  // POWER 本來就需要球位在肩膀前方一段距離；若 predictor 永遠把 px 追到 bx，
  // angle 會從 DEEP 直接跨到 STEEP，實際上把中段 POWER window 吃掉。
  // 現在每個 future frame 都檢查「角色在現有速度下可到達的肩膀位置」，再找三種 style 的合法 dx。
  for(let f=0;f<=maxFrames;f++){
    const shoulderY=py-player.radius*1.5;
    const dy=-(by-shoulderY);
    // V76-2 Contact Realism: primary AI planning uses a comfortable subset of the
    // real Human-J rectangle. The full -10..80 / |dy|<=80 window remains available to
    // humans and emergency recovery, but primary plans may not farm its extreme corners.
    if(Math.abs(dy)<=58){
      const maxTravel=speed*f+2;
      const best={DEEP:null,POWER:null,STEEP:null};
      for(let dx=10;dx<=60;dx+=2){
        const targetPx=bx-facing*dx;
        if(targetPx<minAttackX||targetPx>maxAttackX) continue;
        if(Math.abs(targetPx-startX)>maxTravel) continue;
        // V75-3.14 Execution guard: once already airborne, a legal attack window may not
        // require an active retreat away from the net. Natural existing momentum is still
        // preserved by Player.update(), but the planner must not depend on a mid-air backstep
        // that only exists because moveTowards can instantly flip vx. Miss/re-plan instead.
        if(!player.isGrounded){
          const awayFromNet=(targetPx-startX)*facing < -6;
          if(awayFromNet) continue;
        }
        const angle=Math.atan2(dy,dx);
        const style=angle>0.6?'DEEP':(angle>=0.1?'POWER':'STEEP');
        // V75-3.13: planner safety margin. Actual player/J thresholds stay exactly
        // DEEP >0.6, POWER 0.1..0.6, STEEP <0.1. The planner deliberately
        // avoids razor-edge candidates because moveTowards has a ±6px dead-zone
        // and a predicted 0.58 POWER frequently arrived as 0.61 DEEP, causing
        // a correct intent to refuse the swing. This changes planning only, not physics.
        const plannerSafe = style==='DEEP' ? angle>=0.64 : (style==='POWER' ? (angle>=0.14 && angle<=0.56) : angle<=0.06);
        if(!plannerSafe) continue;
        const shoulderDist=Math.hypot(dx,dy);
        if(shoulderDist>68)continue;
        const score=Math.abs(angle-styleCenter[style]) + shoulderDist*0.0015;
        if(!best[style]||score<best[style].score){
          best[style]={score,rec:{frame:f,x:bx,y:by,angle,dx,dy,targetShoulderX:targetPx}};
        }
      }
      for(const style of ['DEEP','POWER','STEEP']){
        if(!best[style]||windows[style]) continue;
        const rec=best[style].rec;
        const traj=aiProjectedAttackTrajectory(player,style,rec,effectivePower);
        rec.trajectory=traj;
        if(traj.safe){
          windows[style]=rec;
          if(!windows.ANY) windows.ANY={...rec,style};
        }else windows.rejected[style]=(windows.rejected[style]||0)+1;
      }
    }
    if (!player.isGrounded || f>0) { py += pvy; pvy += g; }
    bx += bvx; by += bvy;
    const effG=aiBallGravityForPrediction(bvx,ball);
    bvy += effG;
  }
  return windows;
}


// V76-1 ATTACK COMMIT ARCHITECTURE:
// Grounded third-touch owners plan a legal contact window before takeoff. The predictor
// searches a small set of jump delays and includes limited airborne steering reach; it does
// not move the player or manufacture a contact. Real movement/jump/contact remain Execution.
function aiThirdTempoWindowEligible(tempoMode, contactAge) {
  // V76-3.3: tempo is objective attack timing, not a ball-speed feasibility gate.
  // Windows may overlap so Utility/Personality can express preference, but a late high ball
  // can never be relabeled QUICK merely because its downward velocity is large.
  if(tempoMode==='QUICK') return contactAge<=42;
  if(tempoMode==='HIGH') return contactAge>=72;
  return contactAge>=26 && contactAge<=96;
}

function predictAIAttackCommitWindows(player, maxFrames=64, maxJumpDelay=18, tempo='NORMAL', opts={}) {
  const merged={DEEP:null,POWER:null,STEEP:null,ANY:null,rejected:{DEEP:0,POWER:0,STEEP:0}};
  if(!player) return merged;
  if(!player.isGrounded) return predictAIThirdContactWindows(player,Math.min(maxFrames,40));

  const facing=player.isLeft?1:-1;
  const speed=Math.max(0.5,player.effectiveSpeed||player.stats?.speed||1);
  const startX=player.x, groundY=player.y;
  const minAttackX=player.isLeft ? WORLD.LEFT+70 : WORLD.NET_X+45;
  const maxAttackX=player.isLeft ? WORLD.NET_X-45 : WORLD.RIGHT-70;
  const styleCenter={DEEP:0.90,POWER:0.35,STEEP:0.00};
  const venueG=WORLD.GRAVITY*((typeof getCurrentVenue==='function')?getCurrentVenue().gravityMult:1.0)*(typeof venueGravityFactor==='function'?venueGravityFactor():1);
  const jumpVy=(Number(player.stats?.jump)||-12.8)*(Number(player.jumpExhaustion)||1)*(typeof venueJumpFactor==='function'?venueJumpFactor(player):1);
  const tempoMode=['QUICK','NORMAL','HIGH'].includes(tempo)?tempo:null;
  const defaultMinJumpDelay=tempoMode==='QUICK'?0:(tempoMode==='HIGH'?4:2);
  const minJumpDelay=Number.isFinite(opts?.minJumpDelay)?Math.max(0,Math.floor(opts.minJumpDelay)):defaultMinJumpDelay;
  const framesObserved=Math.max(0,gameFrame-match.lastTouchFrame);
  // V76-2 INT Prediction: commit planning starts from an observed/perceived set state.
  // The noise is deterministic per possession, small enough to preserve competence, and
  // shrinks with INT through aiDecisionNoise(). It affects prediction only, never physics.
  const readKey=opts?.readKey||'ATTACK_SET_READ';
  const readXNoise=aiDecisionNoise(player,readKey,'X')*120;
  const readVyNoise=aiDecisionNoise(player,readKey,'VY')*8;

  for(let jumpDelay=minJumpDelay;jumpDelay<=maxJumpDelay;jumpDelay+=2){
    let bx=ball.x+readXNoise,by=ball.y,bvx=ball.vx,bvy=ball.vy+readVyNoise;
    let py=groundY,pvy=0,airborne=false;
    for(let f=0;f<=maxFrames;f++){
      if(f===jumpDelay){airborne=true;pvy=jumpVy;}
      const shoulderY=py-player.radius*1.5;
      const dy=-(by-shoulderY);
      const contactAge=framesObserved+f;
      const tempoContactOK=tempoMode?aiThirdTempoWindowEligible(tempoMode,contactAge):true;
      if(airborne && f>=jumpDelay+2 && Math.abs(dy)<=58 && tempoContactOK){
        const groundFrames=Math.min(f,jumpDelay);
        const airFrames=Math.max(0,f-jumpDelay);
        // Ground approach owns full run speed. Air control is intentionally bounded to the
        // same ~34% scale used by steerAIThirdAttackWindow, so the planner cannot depend on
        // impossible mid-air relocation.
        const maxTravel=speed*groundFrames + Math.min(3.0,Math.max(1.2,speed*0.34))*airFrames + 2;
        const best={DEEP:null,POWER:null,STEEP:null};
        for(let dx=10;dx<=60;dx+=2){
          const targetPx=bx-facing*dx;
          if(targetPx<minAttackX||targetPx>maxAttackX) continue;
          const travel=Math.abs(targetPx-startX);
          if(travel>maxTravel) continue;
          const angle=Math.atan2(dy,dx);
          const style=angle>0.6?'DEEP':(angle>=0.1?'POWER':'STEEP');
          const plannerSafe=style==='DEEP'?angle>=0.64:(style==='POWER'?(angle>=0.14&&angle<=0.56):angle<=0.06);
          if(!plannerSafe) continue;
          // Prefer cleaner geometry and manageable approach. Do NOT globally reward the
          // earliest jump: tempo has already chosen whether this is QUICK/NORMAL/HIGH.
          const tempoCenter=tempoMode==='QUICK'?30:(tempoMode==='HIGH'?110:62);
          // ANY is used by first-touch action feasibility: same physical windows, no artificial
          // NORMAL/HIGH label. With no tempo selected, prefer an earlier equally-clean contact.
          const tempoFrameBias=tempoMode?Math.abs(contactAge-tempoCenter)*0.0012:(f*0.0015);
          const shoulderDist=Math.hypot(dx,dy);
          if(shoulderDist>68)continue;
          const edgePenalty=(Math.abs(dy)/58)*0.045 + (Math.abs(dx-35)/25)*0.035 + (shoulderDist/68)*0.035;
          const score=Math.abs(angle-styleCenter[style]) + travel*0.0009 + tempoFrameBias + edgePenalty;
          if(!best[style]||score<best[style].score){
            best[style]={score,rec:{frame:f,contactAge,jumpDelay,jumpFrame:gameFrame+jumpDelay,x:bx,y:by,vy:bvy,angle,dx,dy,targetShoulderX:targetPx,approachDistance:travel}};
          }
        }
        for(const style of ['DEEP','POWER','STEEP']){
          if(!best[style]) continue;
          const rec=best[style].rec;
          // Estimate momentum available at takeoff from the committed ground approach. A real
          // reversal still clears momentum in Player.update(); this estimate only evaluates the
          // candidate trajectory and never writes player state.
          const approachDir=rec.targetShoulderX>startX+6?1:(rec.targetShoulderX<startX-6?-1:0);
          let estMomentum=Number(player.runMomentum)||0;
          const storedDir=Number(player.runMomentumDir)||0;
          if(approachDir&&storedDir&&approachDir!==storedDir) estMomentum=0;
          if(approachDir) estMomentum=Math.min(25,estMomentum+1.4*jumpDelay);
          const formula=(typeof computeSpikeFormula==='function')?computeSpikeFormula(player.stats,estMomentum):null;
          const effectivePower=formula?.effectivePower||player.stats?.power||26;
          const traj=aiProjectedAttackTrajectory(player,style,rec,effectivePower);
          rec.trajectory=traj;rec.estimatedTakeoffMomentum=estMomentum;
          if(!traj.safe){merged.rejected[style]=(merged.rejected[style]||0)+1;continue;}
          const incumbent=merged[style];
          const recScore=best[style].score;
          if(!incumbent || recScore < incumbent._commitScore){
            rec._commitScore=recScore;merged[style]=rec;
          }
        }
      }
      if(airborne){py+=pvy;pvy+=venueG;}
      bx+=bvx;by+=bvy;
      bvy+=aiBallGravityForPrediction(bvx,ball);
    }
  }
  for(const style of ['DEEP','POWER','STEEP']){if(merged[style]&&!merged.ANY)merged.ANY={...merged[style],style};}
  return merged;
}

// Third-touch callers keep their existing semantics; only the shared physical planner was generalized.
function predictAIThirdCommitWindows(player, maxFrames=64, maxJumpDelay=18, tempo='NORMAL') {
  return predictAIAttackCommitWindows(player,maxFrames,maxJumpDelay,tempo,{readKey:'ATTACK_SET_READ'});
}


// V76-3.2 LONG-HORIZON TRACKING
// Physical truth stays in Game State / Capability. INT only perturbs the perceived future
// trajectory and controls how quickly that prediction becomes trustworthy. This is deliberately
// separate from tactical POWER/DEEP/STEEP selection: TRACK/STAGE finds WHEN/WHERE a normal
// airborne attack can become reachable; the existing near-term planner decides HOW to attack.
function aiBallGravityForPrediction(vx, state=ball) {
  let venueMult=(typeof getCurrentVenue==='function')?(Number(getCurrentVenue().gravityMult)||1):1;
  let anomalyMult=(typeof venueGravityFactor==='function')?(Number(venueGravityFactor())||1):1;
  let g=WORLD.GRAVITY*0.72*venueMult*anomalyMult;
  if(state?.isGravityDrop && state?.gravityDropTriggered) g=WORLD.GRAVITY*12.0;
  if(state?.isSineFloat) g*=0.45;
  if(state?.isSkyComet) g=WORLD.GRAVITY*1.55;
  if(state?.isTopspin){
    const m=0.00032+((Number(state.topspinRating)||0)*0.00018);
    g+=(vx*vx)*m;
  }
  return g;
}

function aiThirdLongTrack(spiker, maxFrames=240) {
  if(!spiker) return null;
  const cap=aiCapabilitySnapshot(spiker), intCap=aiNorm(cap.int);
  const facing=spiker.isLeft?1:-1;
  const speed=Math.max(0.5,spiker.effectiveSpeed||spiker.stats?.speed||1);
  const startX=spiker.x;
  const minAttackX=spiker.isLeft ? WORLD.LEFT+70 : WORLD.NET_X+45;
  const maxAttackX=spiker.isLeft ? WORLD.NET_X-45 : WORLD.RIGHT-70;

  // INT changes prediction uncertainty, never the real ball/player positions. Noise is possession-
  // deterministic so Balance Lab comparisons remain reproducible. Long reads are intentionally
  // noisier than near-term commit reads and are re-sampled only by the changing observed state.
  const xNoise=aiDecisionNoise(spiker,'ATTACK_LONG_READ','X')*(150-70*intCap);
  const vyNoise=aiDecisionNoise(spiker,'ATTACK_LONG_READ','VY')*(10-5*intCap);
  const gravityNoise=aiDecisionNoise(spiker,'ATTACK_LONG_READ','G')*(0.22-0.14*intCap);
  let bx=ball.x+xNoise, by=ball.y, bvx=ball.vx, bvy=ball.vy+vyNoise;
  const jumpLeadBase=Math.max(8,Math.min(24,Math.round(18-aiNorm(cap.jump,10,60)*5)));
  let best=null;

  for(let f=1;f<=maxFrames;f++){
    bx+=bvx; by+=bvy;
    const trueG=aiBallGravityForPrediction(bvx,ball);
    bvy+=trueG*(1+gravityNoise);
    // TRACK only looks for a broad descending/rally-safe attack band. Exact style/contact geometry
    // remains the job of predictAIThirdCommitWindows once the ball gets near enough.
    if(bvy<-2.5) continue;
    if(by < WORLD.NET_TOP_Y-245 || by > WORLD.FLOOR_Y-72) continue;
    for(let dx=18;dx<=56;dx+=6){
      const stagingX=bx-facing*dx;
      if(stagingX<minAttackX||stagingX>maxAttackX) continue;
      const spatialGap=Math.abs(stagingX-startX);
      const runETA=spatialGap/speed;
      const arrivalSlack=f-runETA-jumpLeadBase;
      if(arrivalSlack < -8) continue;
      const verticalCenter=WORLD.NET_TOP_Y-95;
      const verticalPenalty=Math.abs(by-verticalCenter)*0.002;
      const gapPenalty=Math.min(1,spatialGap/420)*0.16;
      const slackPenalty=arrivalSlack<0?Math.abs(arrivalSlack)*0.02:Math.min(80,arrivalSlack)*0.0015;
      const score=verticalPenalty+gapPenalty+slackPenalty+f*0.00035;
      if(!best||score<best.score){best={score,frame:f,x:bx,y:by,vy:bvy,stagingX,dx,spatialGap,runETA,arrivalSlack,jumpLead:jumpLeadBase};}
    }
  }
  if(!best) return null;
  const uncertaintyPx=Math.round(18+(1-intCap)*72 + Math.min(55,best.frame*(0.05+(1-intCap)*0.10)));
  const confidence=aiClamp01(1-uncertaintyPx/125);
  // Distance/reachability drives phase. Frame count is telemetry/timing, not the sole gate.
  const approachStartIn=best.arrivalSlack;
  const stageDistance=Math.max(42,speed*(4+cap.reaction*0.35));
  const needsPosition=Math.abs(best.stagingX-spiker.x)>stageDistance;
  const phase=(needsPosition || approachStartIn<=42)?'STAGE':'TRACK';
  const commitReady=(approachStartIn<=26 && best.spatialGap<=speed*Math.max(8,best.frame-best.jumpLead+4));
  return {...best,uncertaintyPx,confidence,phase,commitReady,predictedGravity:aiBallGravityForPrediction(ball.vx,ball)*(1+gravityNoise)};
}

function aiLikelyBlocker(attacker) {
  const opps=(typeof allPlayers!=='undefined')?allPlayers.filter(p=>p&&p.isLeft!==attacker.isLeft):[];
  if(!opps.length) return null;
  return opps.slice().sort((a,b)=>Math.abs(a.x-WORLD.NET_X)-Math.abs(b.x-WORLD.NET_X))[0]||null;
}


function aiEvaluateThirdRecovery(spiker, plan=null, maxSafeFrames=48) {
  const currentContact=aiEmergencyJContactState(spiker);
  const tipContact=aiTipContactState(spiker);
  const tipTrajectory=tipContact?aiProjectedTipTrajectory(spiker,tipContact):null;
  const safeJWindow=predictAIStandingJSafeWindow(spiker,maxSafeFrames);
  const formula=(typeof computeSpikeFormula==='function')?computeSpikeFormula(spiker.stats,spiker.runMomentum):null;
  const effectivePower=formula?.effectivePower||spiker.stats?.power||26;
  const hardTrajectory=currentContact?aiProjectedAttackTrajectory(spiker,currentContact.style,{x:ball.x,y:ball.y},effectivePower):null;
  const blocker=aiLikelyBlocker(spiker);
  const blockerReady=!!(blocker && Math.abs(blocker.x-WORLD.NET_X)<115 && (blocker.wantsToBlock||blocker.isBlocking||!blocker.isGrounded));
  const blockerRigidity=blocker?.stats?.blockRigidity||0;
  const penetrationMargin=effectivePower-blockerRigidity;
  const opps=(typeof allPlayers!=='undefined')?allPlayers.filter(p=>p&&p.isLeft!==spiker.isLeft):[];
  const backDefender=opps.slice().sort((a,b)=>Math.abs(b.x-WORLD.NET_X)-Math.abs(a.x-WORLD.NET_X))[0]||null;
  const backDepth=backDefender?aiClamp01(Math.abs(backDefender.x-WORLD.NET_X)/Math.max(1,(WORLD.RIGHT-WORLD.LEFT)/2)):0.5;
  const skill=spiker?.stats?.skill||null;
  const skillReady=!!(skill && (typeof BALANCE_DISABLE_SKILLS==='undefined'||!BALANCE_DISABLE_SKILLS) && spiker.energy>=skill.cost);
  const tipSkillReady=!!(skillReady && (skill.type==='THRUST'||skill.id==='sk_bungee_gum'));
  const spikeSkillReady=!!(skillReady && skill.type==='SPIKE');
  const momentumRatio=Math.max(0,Math.min(1,(Number(spiker.runMomentum)||0)/25));
  const powerCap=aiNorm(effectivePower,18,38);

  // TIP and HARD_J are peer offensive recovery options. Neither has a hard-coded priority.
  // SAFE_J is also allowed to win when waiting for a real grounded J window has higher expected value.
  let tipU=0.50 + backDepth*0.10 + (tipSkillReady?0.18:0) + (blockerReady?0.02:0);
  let hardU=0.50 + powerCap*0.12 + momentumRatio*0.08 + (hardTrajectory?.safe?0.08:-0.12) + (spikeSkillReady?0.18:0);
  if(blockerReady) hardU += penetrationMargin>0?Math.min(0.10,penetrationMargin*0.008):-0.07;
  let safeU=0.34 + (safeJWindow?Math.max(0,0.10-(safeJWindow.frame*0.0025)):0);

  // Re-plan cost preserves commitment without making any recovery action impossible.
  const fromPrimary=!!(plan&&['POWER','STEEP','DEEP'].includes(plan.originalIntent||plan.intent));
  if(fromPrimary){ tipU-=0.06; hardU-=0.03; safeU-=0.07; }
  if(currentContact) hardU += aiPersonalityUtilityBias(spiker,'ATTACK',currentContact.style,{blockerReady,penetrationMargin});

  const options=[
    {id:'TIP',feasible:!!(tipContact&&tipTrajectory?.safe),utility:tipU,reason:(tipContact&&tipTrajectory?.safe)?(tipSkillReady?'TIP_SKILL_READY':'CURRENT_L_CLEARS_NET'):'NO_CURRENT_SAFE_TIP'},
    {id:'HARD_J',feasible:!!currentContact,utility:hardU,reason:currentContact?(spikeSkillReady?'SPIKE_SKILL_READY':(hardTrajectory?.safe?'CURRENT_J_ATTACK':'CURRENT_J_RISKY')):'NO_CURRENT_J_CONTACT'},
    {id:'SAFE_J',feasible:!!safeJWindow,utility:safeU,reason:safeJWindow?`GROUND_J_WINDOW +${safeJWindow.frame}f`:'NO_FUTURE_GROUND_J'}
  ];
  const any=options.some(o=>o.feasible);
  options.push({id:'FALLBACK_WAIT',feasible:!any,utility:0.10,reason:'NO_RECOVERY_CONTACT_YET'});
  const choice=aiChooseUtilityOption(spiker,'THIRD_RECOVERY',options);
  return {choice,currentContact,hardTrajectory,tipContact,tipTrajectory,safeJWindow,skillReady,tipSkillReady,spikeSkillReady,blockerReady,penetrationMargin,backDepth};
}

function aiPrimaryFailureReason(plan,currentContact,currentTrajectory){
  if(!currentContact)return 'NO_CURRENT_J_CONTACT';
  if(currentContact.style!==plan.intent)return `STYLE_MISMATCH_${plan.intent}_TO_${currentContact.style}`;
  if(!currentTrajectory?.safe)return `TRAJECTORY_${currentTrajectory?.reason||'UNSAFE'}`;
  return 'UNKNOWN_PRIMARY_INVALID';
}


// V76-3.4 PRE-SET QUICK COMMIT
// A true pre-set quick is a deadline decision made before the setter releases the ball.
// QUICK competes against WAIT (the option value of keeping NORMAL/HIGH available). Capability
// and predicted geometry create feasibility; INT controls prediction confidence; Personality is
// applied only after base EU. No branch here changes human input or manufactures contact reach.
function aiPredictSecondTouchContact(setter,maxFrames=30){
  if(!setter||!setter.isGrounded) return null;
  const speed=Math.max(0.5,setter.effectiveSpeed||setter.stats?.speed||1);
  let bx=ball.x,by=ball.y,bvx=ball.vx,bvy=ball.vy;
  const sy=setter.y;
  for(let f=1;f<=maxFrames;f++){
    bx+=bvx;by+=bvy;bvy+=aiBallGravityForPrediction(bvx,ball);
    const maxRun=speed*f;
    const targetX=Math.max(setter.x-maxRun,Math.min(setter.x+maxRun,bx));
    const dist=Math.hypot(bx-targetX,by-sy);
    if(dist<=62){
      return {frame:f,x:bx,y:by,targetSetterX:targetX,dist,vy:bvy};
    }
    if(by>WORLD.FLOOR_Y+20) break;
  }
  return null;
}

function aiFindPresetQuickEnvelope(spiker,setter,setContact,isLeft){
  if(!spiker||!setter||!setContact)return null;
  const facing=isLeft?1:-1;
  const venueG=WORLD.GRAVITY*((typeof getCurrentVenue==='function')?getCurrentVenue().gravityMult:1.0)*(typeof venueGravityFactor==='function'?venueGravityFactor():1);
  const jumpVy=(Number(spiker.stats?.jump)||-12.8)*(Number(spiker.jumpExhaustion)||1)*(typeof venueJumpFactor==='function'?venueJumpFactor(spiker):1);
  const gBall=WORLD.GRAVITY*0.72*((typeof getCurrentVenue==='function')?(Number(getCurrentVenue().gravityMult)||1):1)*(typeof venueGravityFactor==='function'?(Number(venueGravityFactor())||1):1);
  const maxSetTravel=Math.max(250,Math.min(410,250+Math.max(0,(setter.stats?.power||18.5)-18.5)*10.0));
  let py=spiker.y,pvy=jumpVy;
  const playerY=[];
  const maxTotal=Math.min(44,setContact.frame+26);
  for(let f=1;f<=maxTotal;f++){py+=pvy;pvy+=venueG;playerY[f]=py;}

  // V76-3.4.1: PRESET QUICK is a family of legal feed/contact windows, not one pre-solved point.
  // The attacker only needs to know that a useful airborne envelope will exist after takeoff.
  // The setter chooses a live point inside this family at release time.
  let best=null, feasibleCells=0, feasibleFlights=new Set();
  for(let flightFrames=7;flightFrames<=26;flightFrames++){
    const totalToContact=setContact.frame+flightFrames;
    const bodyY=playerY[totalToContact];
    if(!Number.isFinite(bodyY))continue;
    const shoulderY=bodyY-spiker.radius*1.5;
    for(let dx=16;dx<=58;dx+=7){
      for(let dy=-28;dy<=42;dy+=10){
        if(Math.hypot(dx,dy)>68)continue;
        const targetX=spiker.x+facing*dx;
        const targetY=shoulderY-dy;
        if(targetY<=WORLD.NET_TOP_Y-275||targetY>=WORLD.FLOOR_Y-45)continue;
        const setTravel=Math.abs(targetX-setContact.x);
        if(setTravel>maxSetTravel)continue;
        const requiredVx=(targetX-setContact.x)/Math.max(1,flightFrames);
        const requiredVy=(targetY-setContact.y-gBall*flightFrames*(flightFrames-1)/2)/Math.max(1,flightFrames);
        if(Math.abs(requiredVx)>16||requiredVy<-13.5||requiredVy>8.5)continue;
        feasibleCells++; feasibleFlights.add(flightFrames);
        const launchEase=Math.abs(requiredVx)/16 + Math.abs(requiredVy+2.5)/16;
        const contactEase=Math.hypot(dx-35,dy-6)/70;
        const timingEase=Math.abs(flightFrames-14)/24;
        const score=launchEase*0.50+contactEase*0.30+timingEase*0.20;
        if(!best||score<best.score)best={score,flightFrames,targetX,targetY,requiredVx,requiredVy,dx,dy};
      }
    }
  }
  if(!best)return null;
  const feedFlexibility=aiClamp01((feasibleFlights.size/12)*0.55+(feasibleCells/50)*0.45);
  return {...best,feasibleCells,feasibleFlightCount:feasibleFlights.size,feedFlexibility};
}


function aiProjectedBlockPressure(attacker, contactInFrames, contactX, contactY, opts={}){
  const blocker=aiLikelyBlocker(attacker);
  if(!blocker||!Number.isFinite(contactInFrames))return {pressure:0,readiness:0,reachQuality:0,rigidityMatch:0,blocker:null};
  const cap=aiCapabilitySnapshot(blocker);
  const speed=Math.max(1,cap.speed||blocker.effectiveSpeed||1);
  const netTargetX=WORLD.NET_X+(blocker.isLeft?-42:42);
  const moveFrames=Math.max(0,Math.abs(blocker.x-netTargetX)-18)/speed;
  const reaction=Math.max(0,Number(cap.reaction)||0);
  const jumpLead=Math.max(7,Math.min(13,Math.round(11+(30-(Number(cap.jump)||30))*0.05)));
  const alreadyCommitted=!!(blocker.isBlocking||blocker.wantsToBlock||!blocker.isGrounded);
  // V76-3.4.3: a pre-set quick is visible, but the blocker still needs time to recognize that the
  // early jump is the actual attack route and align hands to the feed. This is an INT/reaction
  // latency, not a random QUICK nerf and not hidden future knowledge.
  const readLatency=(!alreadyCommitted&&opts.preSetQuick)?Math.max(2,Math.round(4+(1-aiNorm(cap.int))*6)):0;
  const setupNeed=alreadyCommitted?Math.max(0,reaction*0.35):moveFrames+reaction+jumpLead+readLatency;
  const timingMargin=contactInFrames-setupNeed;
  const readiness=alreadyCommitted?Math.max(0.78,aiClamp01((timingMargin+10)/20)):aiClamp01((timingMargin+7)/20);

  const jumpNorm=aiNorm(cap.jump,10,60);
  const contactHeight=Number.isFinite(contactY)?aiClamp01((WORLD.NET_TOP_Y-contactY+20)/210):0.5;
  const reachQuality=aiClamp01(0.58+jumpNorm*0.32-contactHeight*0.22);
  const attackerPower=Math.max(1,Number(aiCapabilitySnapshot(attacker).power)||26);
  const rigidityMatch=aiClamp01((Number(cap.rigidity)||0)/(attackerPower*1.25));
  const pressure=aiClamp01(readiness*(0.52+reachQuality*0.26+rigidityMatch*0.22));
  return {pressure,readiness,reachQuality,rigidityMatch,moveFrames,setupNeed,timingMargin,readLatency,blocker};
}

function aiProjectedFloorDefensePressure(attacker, contactInFrames, opts={}){
  const opps=(typeof allPlayers!=='undefined')?allPlayers.filter(p=>p&&p.isLeft!==attacker.isLeft):[];
  if(!opps.length||!Number.isFinite(contactInFrames))return {pressure:0,readiness:0,positioning:0,defender:null};
  const defender=opps.slice().sort((a,b)=>Math.abs(b.x-WORLD.NET_X)-Math.abs(a.x-WORLD.NET_X))[0]||null;
  if(!defender)return {pressure:0,readiness:0,positioning:0,defender:null};
  const cap=aiCapabilitySnapshot(defender);
  const homeX=defender.isLeft?WORLD.LEFT+180:WORLD.RIGHT-180;
  const speed=Math.max(1,cap.speed||defender.effectiveSpeed||1);
  const recoverFrames=Math.max(0,Math.abs(defender.x-homeX)-35)/speed;
  const reaction=Math.max(0,Number(cap.reaction)||0);
  // The floor defender can read an early attacker, but the exact feed/attack lane is unresolved
  // before setter release. QUICK therefore consumes part of the defender's setup horizon.
  const readLatency=opts.preSetQuick?Math.max(1,Math.round(2+(1-aiNorm(cap.int))*5)):0;
  const available=Math.max(0,contactInFrames-reaction-readLatency);
  const positioning=aiClamp01((available-recoverFrames+8)/24);
  const bodyReady=(defender.isGrounded&&!defender.isDiving&&!defender.isBlocking)?1:(defender.isDiving?0.34:0.58);
  const intRead=0.62+aiNorm(cap.int)*0.28;
  const agiReach=0.56+aiNorm(cap.agi)*0.30;
  const readiness=aiClamp01(positioning*bodyReady);
  const pressure=aiClamp01(readiness*(intRead*0.48+agiReach*0.52));
  return {pressure,readiness,positioning,recoverFrames,readLatency,defender};
}

function aiProjectedDefensePressure(attacker, contactInFrames, contactX, contactY, opts={}){
  const block=aiProjectedBlockPressure(attacker,contactInFrames,contactX,contactY,opts);
  const floor=aiProjectedFloorDefensePressure(attacker,contactInFrames,opts);
  const total=aiClamp01(block.pressure*0.62+floor.pressure*0.38);
  return {total,block,floor};
}

function aiEvaluateQuickPrecommit(spiker,setter,isLeft){
  if(!spiker||!setter||!spiker.isGrounded||spiker.isDiving||setter.isDiving) return null;
  const setContact=aiPredictSecondTouchContact(setter,30);
  if(!setContact) return null;
  // Not yet at the decision deadline: preserve the option to stage instead of committing early.
  if(setContact.frame>16) return {ready:false,setContact};
  if(setContact.frame<2) return {ready:true,setContact,choice:null,feasible:false,reason:'SET_CONTACT_TOO_IMMINENT'};

  const capA=aiCapabilitySnapshot(spiker), capS=aiCapabilitySnapshot(setter);
  const intA=aiNorm(capA.int), intS=aiNorm(capS.int), tecA=aiNorm(capA.tec), tecS=aiNorm(capS.tec);
  const jumpCap=aiNorm(capA.jump,10,60), powerCap=aiNorm(capA.power,18,36);
  const distToNet=Math.abs(spiker.x-WORLD.NET_X);
  const attackBand=distToNet>=55&&distToNet<=270;
  const envelope=attackBand?aiFindPresetQuickEnvelope(spiker,setter,setContact,isLeft):null;
  const quickFeasible=!!envelope;

  const blocker=aiLikelyBlocker(spiker);
  const blockerReady=!!(blocker&&Math.abs(blocker.x-WORLD.NET_X)<115&&(blocker.wantsToBlock||blocker.isBlocking||!blocker.isGrounded));
  const feedFlexibility=envelope?.feedFlexibility||0;
  const requiredVx=envelope?.requiredVx??0, requiredVy=envelope?.requiredVy??0;
  // Broad-window confidence: INT/TEC still matter, but a robust family of legal feeds reduces
  // the need for a frame-perfect prediction. This is the point of pre-set quick coordination.
  const contactProbability=aiClamp01(0.44+intA*0.10+intS*0.08+tecA*0.08+tecS*0.10
    +feedFlexibility*0.24-Math.abs(requiredVx)/16*0.05-Math.abs(requiredVy+2.5)/16*0.04
    -(setContact.frame/16)*(1-intA)*0.07);
  const contactHeight=envelope?aiClamp01((WORLD.NET_TOP_Y-envelope.targetY+20)/210):0;
  const attackValue=aiClamp01(0.48+powerCap*0.18+jumpCap*0.14+contactHeight*0.12);
  const predictionRisk=(1-intA)*0.065+(1-intS)*0.05+(setContact.frame/16)*(1-intA)*0.035;
  const missRisk=aiClamp01((1-feedFlexibility)*0.09+Math.abs(requiredVx)/20*0.025+Math.max(0,Math.abs(requiredVy)-8)/8*0.03+(1-tecS)*0.04);

  // V76-3.4.2: QUICK's timing value is no longer an abstract bonus. Project the opponent's
  // existing block + floor-defense capability into the QUICK contact horizon, then compare it
  // against the defensive pressure expected after preserving a later NORMAL/HIGH option.
  const quickContactIn=quickFeasible?setContact.frame+envelope.flightFrames:null;
  const quickDefense=quickFeasible?aiProjectedDefensePressure(spiker,quickContactIn,envelope.targetX,envelope.targetY,{preSetQuick:true}):{total:1,block:{pressure:1},floor:{pressure:1}};
  const normalContactIn=setContact.frame+46;
  const highContactIn=setContact.frame+74;
  const normalDefense=aiProjectedDefensePressure(spiker,normalContactIn,null,null);
  const highDefense=aiProjectedDefensePressure(spiker,highContactIn,null,null);

  // V76-3.5: QUICK is valuable for one reason only: it denies the defense setup time.
  // Do not make QUICK compete against a synthetic all-purpose NORMAL/HIGH expected-value stack.
  // Feasibility already answers "can we run the quick?"; this layer asks "does going early actually
  // catch the block/floor defense less ready than waiting for a normal tempo?"
  const normalBlockReadiness=aiClamp01(normalDefense.block?.readiness||0);
  const quickBlockReadiness=aiClamp01(quickDefense.block?.readiness||0);
  const normalFloorReadiness=aiClamp01(normalDefense.floor?.readiness||0);
  const quickFloorReadiness=aiClamp01(quickDefense.floor?.readiness||0);
  const blockReadinessGain=Math.max(0,normalBlockReadiness-quickBlockReadiness);
  const floorCoverageGain=Math.max(0,normalFloorReadiness-quickFloorReadiness);
  const defensiveReadinessGain=aiClamp01(blockReadinessGain*0.68+floorCoverageGain*0.32);

  // A robust feed lowers the amount of defensive advantage required before committing early.
  // NORMAL/HIGH remain the default stable continuation; QUICK must earn the commitment by stealing
  // enough opponent readiness. Personality is still applied only after this objective threshold.
  const requiredReadinessGain=aiClamp01(0.045+(1-contactProbability)*0.16+(1-feedFlexibility)*0.08);
  let quickU=0.5 + defensiveReadinessGain - requiredReadinessGain;
  let waitU=0.5;

  // Keep the old observability fields for comparison, but they are audit-only in V76-3.5.
  const futureReach=aiClamp01(1-Math.max(0,distToNet-210)/220);
  const setQuality=aiClamp01(0.48+tecS*0.24+intS*0.12);
  const normalAttackQuality=aiClamp01(0.54+powerCap*0.14+jumpCap*0.12+tecA*0.10+futureReach*0.10);
  const highAttackQuality=aiClamp01(0.50+powerCap*0.12+jumpCap*0.18+tecA*0.10+futureReach*0.08);
  const normalNet=normalAttackQuality*(1-normalDefense.total*0.34);
  const highNet=highAttackQuality*(1-highDefense.total*0.34);
  const normalContactProbability=aiClamp01(0.56+tecA*0.10+intA*0.08+setQuality*0.12+futureReach*0.08);
  const highContactProbability=aiClamp01(0.53+tecA*0.10+intA*0.07+setQuality*0.11+futureReach*0.07);
  const normalExpectedNet=normalNet*normalContactProbability;
  const highExpectedNet=highNet*highContactProbability;
  const futureBestNet=Math.max(normalNet,highNet);
  const futureExpectedNet=Math.max(normalExpectedNet,highExpectedNet);
  const futureDefensePressure=Math.min(normalDefense.total,highDefense.total);
  const defenseTimingGain=aiClamp01(Math.max(0,futureDefensePressure-quickDefense.total));
  const tempoAdvance=quickFeasible?aiClamp01((normalContactIn-quickContactIn)/Math.max(1,normalContactIn)):0;
  const transitionTimingGain=defensiveReadinessGain;
  const optionFlex=aiClamp01(0.46+futureReach*0.22+setQuality*0.18+tecA*0.08+intA*0.06);
  const waitBase=0.5;
  const telegraphCost=0;
  const commitmentCost=requiredReadinessGain;
  const quickNet=attackValue*(1-quickDefense.total*0.34);
  const quickExpectedNet=contactProbability*quickNet;
  const ctx={setContactFrame:setContact.frame,flightFrames:envelope?.flightFrames??null,contactProbability,normalContactProbability,highContactProbability,attackValue,blockerReady,predictionRisk,missRisk,commitmentCost,telegraphCost,waitBase,optionFlex,futureBestNet,futureExpectedNet,quickNet,quickExpectedNet,futureDefensePressure,defenseTimingGain,tempoAdvance,transitionTimingGain,blockReadinessGain,floorCoverageGain,defensiveReadinessGain,requiredReadinessGain,quickDefensePressure:quickDefense.total,quickBlockPressure:quickDefense.block.pressure,quickFloorPressure:quickDefense.floor.pressure,normalDefensePressure:normalDefense.total,highDefensePressure:highDefense.total,feedFlexibility,feasibleCells:envelope?.feasibleCells||0,feasibleFlightCount:envelope?.feasibleFlightCount||0};
  quickU+=aiPersonalityUtilityBias(spiker,'QUICK_PRECOMMIT','QUICK',ctx);
  waitU+=aiPersonalityUtilityBias(spiker,'QUICK_PRECOMMIT','WAIT',ctx);
  const options=[
    {id:'QUICK',feasible:quickFeasible,utility:quickU,reason:quickFeasible?'DEFENSIVE_READINESS_DENIAL':'NO_PRESET_QUICK_ENVELOPE'},
    {id:'WAIT',feasible:true,utility:waitU,reason:'STABLE_NORMAL_HIGH_CONTINUATION'}
  ];
  const choice=aiChooseUtilityOption(spiker,'QUICK_PRECOMMIT',options);
  return {ready:true,feasible:quickFeasible,choice,setContact,flightFrames:envelope?.flightFrames??null,targetX:envelope?.targetX??null,targetY:envelope?.targetY??null,requiredVx:envelope?.requiredVx??null,requiredVy:envelope?.requiredVy??null,envelope,ctx};
}

// V76-3.3 ATTACK TEMPO:
// Tempo is selected at COMMIT time from physically existing contact windows. It is an
// attack-timing preference, never a ball-speed gate. QUICK/NORMAL/HIGH therefore cannot
// manufacture a window or relabel a late high ball as a quick simply because vy is large.
function aiThirdBaseObserveFrames(spiker){
  const intCap=aiNorm(aiCapabilitySnapshot(spiker).int);
  return Math.max(3,Math.round(7-intCap*3));
}

function aiChooseThirdAttackTempo(spiker, distToNet, tempoWindows=null){
  const cap=aiCapabilitySnapshot(spiker),intCap=aiNorm(cap.int);
  const framesObserved=Math.max(0,gameFrame-match.lastTouchFrame);
  const near=aiClamp01(1-distToNet/300);
  const blocker=aiLikelyBlocker(spiker);
  const blockerReady=!!(blocker&&Math.abs(blocker.x-WORLD.NET_X)<115&&(blocker.wantsToBlock||blocker.isBlocking||!blocker.isGrounded));
  const anyFor=t=>!!(tempoWindows?.[t]?.ANY);
  const ageFor=t=>tempoWindows?.[t]?.ANY?.contactAge ?? (framesObserved+(tempoWindows?.[t]?.ANY?.frame||0));
  const qAge=ageFor('QUICK'), nAge=ageFor('NORMAL'), hAge=ageFor('HIGH');
  const ageFit=(age,center,spread)=>Number.isFinite(age)?Math.max(-0.18,0.18-Math.abs(age-center)/spread*0.18):0;
  const ctx={near,blockerReady,framesObserved,quickAge:qAge,normalAge:nAge,highAge:hAge};
  let quickU=0.44+near*0.18+intCap*0.05+ageFit(qAge,30,22)-(blockerReady?0.04:0);
  let normalU=0.60+intCap*0.07+ageFit(nAge,62,34)+(blockerReady?0.03:0);
  let highU=0.44+(1-near)*0.10+intCap*0.05+ageFit(hAge,110,60)+(blockerReady?0.07:0);
  quickU+=aiPersonalityUtilityBias(spiker,'ATTACK_TEMPO','QUICK',ctx);
  normalU+=aiPersonalityUtilityBias(spiker,'ATTACK_TEMPO','NORMAL',ctx);
  highU+=aiPersonalityUtilityBias(spiker,'ATTACK_TEMPO','HIGH',ctx);
  const options=[
    {id:'QUICK',feasible:anyFor('QUICK'),utility:quickU,reason:anyFor('QUICK')?'PHYSICAL_EARLY_WINDOW':'NO_PHYSICAL_QUICK_WINDOW'},
    {id:'NORMAL',feasible:anyFor('NORMAL'),utility:normalU,reason:anyFor('NORMAL')?'PHYSICAL_MID_WINDOW':'NO_PHYSICAL_NORMAL_WINDOW'},
    {id:'HIGH',feasible:anyFor('HIGH'),utility:highU,reason:anyFor('HIGH')?'PHYSICAL_LATE_WINDOW':'NO_PHYSICAL_HIGH_WINDOW'}
  ];
  const choice=aiChooseUtilityOption(spiker,'ATTACK_TEMPO',options);
  const tempo=choice.selected?.id||(anyFor('HIGH')?'HIGH':(anyFor('NORMAL')?'NORMAL':'QUICK'));
  return {tempo,choice,observeFrames:aiThirdBaseObserveFrames(spiker),framesObserved};
}

function aiChooseThirdAttackPlan(spiker, distToNet, opts={}) {
  const cap=aiCapabilitySnapshot(spiker);
  let tempoInfo=opts.tempoInfo||null;
  let windows;
  let tempoWindows=null;
  if(opts.preJump&&spiker.isGrounded){
    tempoWindows={
      QUICK:predictAIThirdCommitWindows(spiker,64,18,'QUICK'),
      NORMAL:predictAIThirdCommitWindows(spiker,64,18,'NORMAL'),
      HIGH:predictAIThirdCommitWindows(spiker,64,18,'HIGH')
    };
    tempoInfo=aiChooseThirdAttackTempo(spiker,distToNet,tempoWindows);
    windows=tempoWindows[tempoInfo.tempo]||tempoWindows.NORMAL;
  }else{
    tempoInfo=tempoInfo||{tempo:'NORMAL',choice:null,observeFrames:aiThirdBaseObserveFrames(spiker),framesObserved:Math.max(0,gameFrame-match.lastTouchFrame)};
    windows=predictAIThirdContactWindows(spiker,40);
  }
  const blocker=aiLikelyBlocker(spiker);
  const blockerReady=!!(blocker && Math.abs(blocker.x-WORLD.NET_X)<115 && (blocker.wantsToBlock||blocker.isBlocking||!blocker.isGrounded));
  const blockerHandY=blocker ? blocker.y-blocker.radius*2-20 : WORLD.NET_TOP_Y;
  const powerCap=aiNorm(cap.power,18,36), jumpCap=aiNorm(cap.jump,10,60), techCap=aiNorm(cap.tec), intCap=aiNorm(cap.int);
  const contactQuality=windows.ANY?aiClamp01(1-Math.hypot(windows.ANY.dx,windows.ANY.dy)/110):0.35;
  const nearNetQuality=aiClamp01(1-distToNet/280);
  const opps=(typeof allPlayers!=='undefined')?allPlayers.filter(p=>p&&p.isLeft!==spiker.isLeft):[];
  const deepDefender=opps.slice().sort((a,b)=>Math.abs(b.x-WORLD.NET_X)-Math.abs(a.x-WORLD.NET_X))[0]||null;
  const deepCoverage=deepDefender?aiClamp01(Math.abs(deepDefender.x-WORLD.NET_X)/Math.max(1,(WORLD.RIGHT-WORLD.LEFT)/2)):0.5;

  const powerWindow=windows.POWER, deepWindow=windows.DEEP, steepWindow=windows.STEEP;
  const estimatedPower=(typeof computeSpikeFormula==='function')?computeSpikeFormula(spiker.stats,spiker.runMomentum).effectivePower:cap.power;
  const blockerRigidity=blocker?.stats?.blockRigidity||0;
  const penetrationMargin=estimatedPower-blockerRigidity;

  const deepHighContact=!!(deepWindow && deepWindow.y < WORLD.NET_TOP_Y-28);
  const deepToolGeometry=!!(blockerReady && deepHighContact && (deepWindow.y <= blockerHandY+34));
  const blockerOffNet=!!(blocker && Math.abs(blocker.x-WORLD.NET_X)>82);
  const steepOverHands=!!(steepWindow && blocker && steepWindow.y < blockerHandY-10);

  let powerU=0.46+powerCap*0.27+contactQuality*0.18+nearNetQuality*0.10+techCap*0.05;
  let deepU =0.38+powerCap*0.10+techCap*0.18+(1-nearNetQuality)*0.10+(1-deepCoverage)*0.15+(deepHighContact?0.10:0);
  let steepU=0.34+jumpCap*0.22+techCap*0.14+nearNetQuality*0.16+(steepOverHands?0.18:0)+(blockerOffNet?0.12:0);

  if(blockerReady){
    powerU += penetrationMargin>0 ? Math.min(0.18,penetrationMargin*0.012) : -0.06;
    deepU += deepToolGeometry ? (0.18+techCap*0.06) : -0.16;
    steepU += (steepOverHands||blockerOffNet) ? 0.08 : -0.10;
  }
  const confidence=0.75+intCap*0.25;
  powerU*=confidence;deepU*=confidence;steepU*=confidence;
  const ctx={blockerReady,deepToolGeometry,steepOverHands,blockerOffNet,penetrationMargin};
  const hasAirWindow=!!(powerWindow||steepWindow||deepWindow);
  let options=[
    {id:'POWER',feasible:!!powerWindow,utility:powerU+aiPersonalityUtilityBias(spiker,'ATTACK','POWER',ctx),reason:powerWindow?(blockerReady?'PENETRATION_CHECK':'PACE_AND_CLEAN_CONTACT'):'NO_SAFE_POWER_WINDOW'},
    {id:'STEEP',feasible:!!steepWindow&&distToNet<280,utility:steepU+aiPersonalityUtilityBias(spiker,'ATTACK','STEEP',ctx),reason:steepWindow?((steepOverHands||blockerOffNet)?'ANGLE_WINDOW':'TIGHT_ANGLE'):'NO_SAFE_STEEP_WINDOW'},
    {id:'DEEP',feasible:!!deepWindow,utility:deepU+aiPersonalityUtilityBias(spiker,'ATTACK','DEEP',ctx),reason:deepWindow?(deepToolGeometry?'FINGERTIP_TOOL_WINDOW':(blockerReady?'BLOCK_INTERCEPT_RISK':'DEPTH_PRESSURE')):'NO_SAFE_DEEP_WINDOW'}
  ];
  let choice,intent,target=null,recovery=null;
  if(hasAirWindow){
    choice=aiChooseUtilityOption(spiker,'THIRD_TOUCH',options);
    intent=choice.selected?.id||'FALLBACK_WAIT';
    target=windows[intent]||null;
  }else{
    recovery=aiEvaluateThirdRecovery(spiker,null,48);
    choice=recovery.choice;
    intent=choice.selected?.id||'FALLBACK_WAIT';
    target=intent==='SAFE_J'?recovery.safeJWindow:null;
  }
  return {intent,target,windows,tempoWindows,choice,ctx:{...ctx,safeJFrame:recovery?.safeJWindow?.frame??null,tipNow:!!recovery?.tipContact,hardJNow:!!recovery?.currentContact},cap,blockerSlot:blocker?.slotKey||null,createdFrame:gameFrame,touchKey:match.lastTouchFrame,originalIntent:intent,preJumpCommit:!!(opts.preJump&&spiker.isGrounded),tempo:tempoInfo.tempo,tempoChoice:tempoInfo.choice,observeFrames:tempoInfo.observeFrames,jumpDelay:target?.jumpDelay??null,jumpFrame:target?.jumpFrame??null,expireFrame:gameFrame+Math.max(12,(target?.frame||32)+8)};
}

function aiBlockThreat(attacker, blocker) {
  if(!attacker||!blocker) return {threat:false};
  // 已經打出的攻擊：直接視為確定威脅。
  const incoming=ball.lastHitter && ball.lastHitter.isLeft===attacker.isLeft && ball.isSpiked &&
    ((blocker.isLeft&&ball.vx<0)||(!blocker.isLeft&&ball.vx>0));
  if(incoming) return {threat:true,direct:true,contactFrame:gameFrame+Math.max(1,Math.round(Math.abs(blocker.x-ball.x)/Math.max(1,Math.abs(ball.vx)))),uncertainty:0};

  // 單純站地/假動作不構成空中扣球威脅；AI 不能因「看到角色」就自動跟跳。
  if(attacker.isGrounded) return {threat:false,direct:false};

  const windows=predictAIThirdContactWindows(attacker,18);
  const first=windows.ANY;
  if(!first) return {threat:false,direct:false};
  const cap=aiCapabilitySnapshot(blocker), iq=aiNorm(cap.int);
  const uncertainty=Math.max(1,Math.round(6-iq*4));
  const jitter=Math.round(aiDecisionNoise(blocker,'BLOCK_READ',attacker.slotKey||'ATT')*70);
  return {threat:true,direct:false,contactFrame:gameFrame+first.frame+jitter,uncertainty,attackerWindow:first};
}

function aiChooseBlockMode(blocker, attacker, threat) {
  const cap=aiCapabilitySnapshot(blocker);
  const uncertainty=threat?.uncertainty??6;
  const attackerPower=attacker?.stats?.power||0;
  const rigidity=cap.rigidity||0;
  const needBonus=attackerPower>rigidity;
  let safeU=0.70+Math.min(0.16,uncertainty*0.025);
  let perfectU=0.70+Math.max(0,0.18-uncertainty*0.025)+(needBonus?0.08:0);
  safeU+=aiPersonalityUtilityBias(blocker,'BLOCK','SAFE',{uncertainty,needBonus});
  perfectU+=aiPersonalityUtilityBias(blocker,'BLOCK','PERFECT',{uncertainty,needBonus});
  return aiChooseUtilityOption(blocker,'BLOCK_MODE',[
    {id:'SAFE',feasible:true,utility:safeU,reason:'EARLY_STABLE_HANDS'},
    {id:'PERFECT',feasible:true,utility:perfectU,reason:'CONTACT_PRESS'}
  ]);
}

function isSlotHumanControlled(player) {
  if (!player) return false;
  // V75-3 Balance Lab: 4-AI scrimmage temporarily releases every slot to the shared AI brain.
  if (typeof BALANCE_FORCE_AI_ALL !== 'undefined' && BALANCE_FORCE_AI_ALL) return false;
  if (typeof NET !== 'undefined' && typeof NET.mySlot !== 'undefined') {
    // 1. 本機操控者必定是真人
    if (player.slotIndex === NET.mySlot) return true;
    // 2. 若本機是房主，連線進來的訪客也是真人，AI 絕對不可插手！
    if (NET.isMultiplayer && NET.isHost) {
      const guestSlot = (NET.mode === 'COOP') ? 1 : 2;
      if (player.slotIndex === guestSlot) return true;
    }
  } else {
    // 單人模式回歸基準判定
    if (player.isUser) return true;
  }
  return false;
}

// ========================================================
// AI 防守共用工具（左右隊完全共用，同一組權重 / 門檻）
// 目的：讓 AI 先理解「這顆球最後會去哪」，再決定 OUT / 跑接 / 緊急魚躍。
// 注意：這裡只做預測，不改動真實 ball 狀態。
// ========================================================
function predictBallLandingForAI(maxFrames = 240) {
  let x = ball.x, y = ball.y, vx = ball.vx, vy = ball.vy;
  let floatDrift = ball.floatDrift || 0;
  const radius = ball.radius || 13;
  const topHalfW = 4 / 2 + radius; // V10：球的網頂碰撞寬度
  const postHalfW = WORLD.NET_W / 2 + radius;

  for (let frame = 1; frame <= maxFrames; frame++) {
    x += vx; y += vy;
    let effGravity = WORLD.GRAVITY * 0.72;

    if (ball.isGravityDrop) {
      const crossedNet = (vx > 0 && x > WORLD.NET_X + 60) || (vx < 0 && x < WORLD.NET_X - 60);
      if (crossedNet) { effGravity = WORLD.GRAVITY * 12.0; vx *= 0.15; if (vy < 14.0) vy = 18.0; }
    }
    if (ball.isSkyComet) {
      effGravity = WORLD.GRAVITY * 1.8;
      if (vy > 0) vy = Math.min(39.5, vy + 0.8);
    }
    if (ball.isSineFloat) effGravity *= 0.45;
    if (ball.isTopspin) {
      const magnusLiftCoeff = 0.00032 + (ball.topspinRating * 0.00018);
      effGravity += (vx * vx) * magnusLiftCoeff;
    }
    vy += effGravity;

    if (ball.isSineFloat) {
      // V32：AI 不讀 sineTargetX。正弦球只用當下觀測到的瞬時速度推估，因此會被巨大 S 路徑反覆欺騙。
      vx += Math.sin((typeof gameFrame !== 'undefined' ? gameFrame : 0) * 0.17 + (ball.floatPhase || 0)) * 0.35;
    } else if (ball.isFloat && Math.abs(vx) > 3) {
      // V11：預測器使用 V10 普通跳飄同一套 deterministic 氣動公式。
      const speedSq = Math.min(625, vx * vx + vy * vy);
      const aero = Math.min(1.0, speedSq / 400);
      const phase = ball.floatPhase || 0;
      const futureFrame = gameFrame + frame;
      const gust = Math.sin(futureFrame * 0.19 + phase) * 0.62
                 + Math.sin(futureFrame * 0.071 + phase * 1.73) * 0.38;
      const dropGust = Math.sin(futureFrame * 0.137 + phase * 0.61) * 0.55
                     + Math.sin(futureFrame * 0.049 + phase * 2.11) * 0.45;
      const travelDir = vx >= 0 ? 1 : -1;
      floatDrift = floatDrift * 0.90 + gust * aero * 0.055;
      vx += travelDir * floatDrift;
      vy += dropGust * aero * 0.045;
      if ((vx > 0 && x > WORLD.NET_X) || (vx < 0 && x < WORLD.NET_X)) vy += 0.20 * aero;
    }

    // V10：網頂薄、下方網柱維持原 WORLD.NET_W。
    const dxNet = Math.abs(x - WORLD.NET_X);
    if (y + radius >= WORLD.NET_TOP_Y && y < WORLD.NET_TOP_Y + 14 && dxNet < topHalfW) {
      if (vy > 0) { y = WORLD.NET_TOP_Y - radius; vy = -Math.abs(vy) * 0.45; vx *= 0.75; }
    } else if (y >= WORLD.NET_TOP_Y + 14 && dxNet < postHalfW) {
      const movingRight = vx > 0; vx *= -0.7;
      x = movingRight ? WORLD.NET_X - postHalfW : WORLD.NET_X + postHalfW;
    }

    if (y + radius >= WORLD.FLOOR_Y) return { x, frames: frame };
  }
  return { x, frames: maxFrames };
}

// V11 Landing Read：同一套真實物理預測，INT 只決定角色「讀到多少」。
// 不新增角色能力值；誤差、圈大小、更新間隔全部由既有 INT/reactionDelay/outballThreshold 派生。
function getLandingRead(player) {
  if (!player || !player.stats) return predictBallLandingForAI();
  if (!player._landingRead) player._landingRead = { x: ball.x, frames: 0, nextUpdate: -1, touchKey: -99999 };

  const read = player._landingRead;
  const touchKey = match.lastTouchFrame;
  const intellect = Math.max(0, Math.min(60, player.stats.intellect || 0));
  const iq = intellect / 60;
  const baseDelay = Math.max(2, player.stats.reactionDelay || 8);
  // 高 INT 更新快；低 INT 保留舊判讀較久。Float 額外要求持續重讀。
  let updateEvery = Math.max(2, Math.round(baseDelay * (ball.isFloat ? 0.80 : 1.0)));
  const blackout = (typeof venueIncidentState!=='undefined' && venueIncidentState.active==='BLACKOUT');
  const brightInBlackout = blackout && [WORLD.LEFT+260,WORLD.RIGHT-260].some(x=>Math.abs(player.x-x)<210);
  if(blackout && !brightInBlackout) updateEvery=Math.max(updateEvery,Math.round(updateEvery*2.2));
  // V74-16 CHRONO: the victim AI's perception also runs in Bullet Time.
  const chronoVictimAI = (typeof timeSlowTimer !== 'undefined' && timeSlowTimer > 0) &&
    ((chronoCasterSide === 'player' && !player.isLeft) || (chronoCasterSide === 'enemy' && player.isLeft));
  if (chronoVictimAI) updateEvery = Math.max(updateEvery, Math.round(updateEvery * 3.0));

  if (read.touchKey !== touchKey || gameFrame >= read.nextUpdate) {
    let truth = predictBallLandingForAI();
    // V74-23 Phantom Wipe deception: AI is not omniscient. When a live fake ball exists on this team's side,
    // it can commit its landing read to the decoy. Higher INT is fooled less often, but never reads the fake flag perfectly.
    if (typeof phantomDecoys !== 'undefined') {
      const decoy = phantomDecoys.find(d => d && d.fade<=0 && d.sourceIsLeft !== player.isLeft);
      if (decoy) {
        const deceiveChance = 0.65 - iq * 0.35; // INT 0: 65%, INT 60: 30%
        const deceiveSeed = Math.sin((match.lastTouchFrame+31)*17.17 + (player.slotIndex+5)*43.73) * 43758.5453;
        const deceiveRoll = deceiveSeed - Math.floor(deceiveSeed);
        if (deceiveRoll < deceiveChance) {
          let dx=decoy.x, dy=decoy.y, dvx=decoy.vx, dvy=decoy.vy, frames=240;
          const rr=decoy.radius||13;
          for(let f=1;f<=240;f++){dx+=dvx;dy+=dvy;dvy+=WORLD.GRAVITY*.72;if(dy+rr>=WORLD.FLOOR_Y){frames=f;break;}}
          truth={x:dx,frames};
        }
      }
    }
    // 低 INT 的中心位置有較大的穩定判讀誤差；每次「重新讀球」才改變，不會每幀亂跳。
    let maxError = 8 + (1 - iq) * 82;
    if(blackout && !brightInBlackout) maxError*=2.35;
    const epoch = Math.floor(gameFrame / updateEvery);
    const seed = (touchKey + 17) * 12.9898 + (player.slotIndex + 3) * 78.233 + epoch * 19.19;
    const raw = Math.sin(seed) * 43758.5453;
    const noiseUnit = ((raw - Math.floor(raw)) * 2) - 1;
    read.x = truth.x + noiseUnit * maxError;
    read.frames = truth.frames;
    if (typeof pushAIDebug === 'function' && typeof isSlotHumanControlled === 'function' && !isSlotHumanControlled(player)) {
      pushAIDebug(player, 'LANDING READ', `x=${read.x.toFixed(0)} ±${(24 + (1 - iq) * 86).toFixed(0)} / ${updateEvery}f`);
    }
    read.nextUpdate = gameFrame + updateEvery;
    read.touchKey = touchKey;
  }

  const uncertaintyRadius = 24 + (1 - iq) * 86;
  return { x: read.x, frames: read.frames, radius: uncertaintyRadius };
}

// V75-1 DEFENSE RELIABILITY helpers. These only arbitrate AI responsibility; they do not change ball physics.
function estimateAIChaseFrames(player, targetX, reach = null) {
  if (!player) return 9999;
  const r = reach == null ? (player.stats.reach || 64) : reach;
  const gap = Math.max(0, Math.abs(targetX - player.x) - r);
  return gap / Math.max(1, player.effectiveSpeed || 1);
}

function aiCanActNow(player) {
  return !!player && player.reactionTimer <= 0 && !(typeof player.stunTimer !== 'undefined' && player.stunTimer > 0);
}

function steerAIToFreshBallIntent(player, targetX, speed, touchFrame, label='CHASE') {
  if (!player) return;
  // When a legal touch changes the ball path, a previous SUPPORT/FORMATION instruction must not keep pulling
  // the newly assigned handler the wrong way. We only damp stale locomotion once per touch transition;
  // this is braking, not teleportation or a speed buff.
  if (player._aiMoveIntentTouch !== touchFrame) {
    const desiredDir = targetX > player.x + 6 ? 1 : (targetX < player.x - 6 ? -1 : 0);
    if (player.isGrounded && desiredDir && player.vx * desiredDir < -0.25) {
      player.vx *= 0.45;
      if (typeof pushAIDebug === 'function') pushAIDebug(player, 'INTENT BRAKE', `${label} new path`);
    }
    player._aiMoveIntentTouch = touchFrame;
  }
  moveTowards(player, targetX, speed);
}

function steerAIThirdAttackWindow(player, targetX, speed) {
  if (!player) return;
  if (player.isGrounded) {
    moveTowards(player, targetX, speed);
    return;
  }

  // V75-3.14 Execution-only rule: third-touch attackers may trim forward drift in air,
  // but may not generate a full-speed reverse step away from the net to chase a planner target.
  // Existing airborne momentum remains physical truth; if the window is lost, attack logic
  // is allowed to miss/re-plan rather than manufacturing a new trajectory with instant vx reversal.
  const facing = player.isLeft ? 1 : -1;
  const gap = targetX - player.x;
  const desiredDir = gap > 6 ? 1 : (gap < -6 ? -1 : 0);
  const attackDir = facing;

  if (!desiredDir) {
    player.vx *= 0.78;
    return;
  }

  if (desiredDir !== attackDir) {
    // Brake any forward overshoot, but never accelerate into a visible airborne retreat.
    if (player.vx * attackDir > 0) player.vx *= 0.58;
    else if (player.vx * attackDir < 0) player.vx *= 0.72;
    return;
  }

  const airSpeed = Math.min(Math.max(1.2, speed * 0.34), 3.0);
  const desiredVx = attackDir * airSpeed;
  if (player.vx * attackDir < 0) player.vx *= 0.58;
  else player.vx += (desiredVx - player.vx) * 0.35;
}

function canAIAirborneCover(player, distance, aiReach) {
  if (!player || player.isGrounded || player.isDiving || player.isBlocking) return false;
  // Never recreate the old superhuman sequence: spike -> blocked -> zero-frame perfect self-cover.
  const sinceAttack = gameFrame - (player._lastAttackContactFrame ?? -9999);
  if (sinceAttack < 10 || player.swingTimer > 0 || player.thrustTimer > 0) return false;
  // Airborne cover is an emergency body-control action with a deliberately smaller contact envelope.
  const airReach = Math.min(aiReach * 0.72, 52);
  return distance < airReach;
}


// V75-2 DEFENSE ACTION SELECTION
// Responsibility is decided first; only the assigned owner chooses K / Dive / airborne Cover.
// This keeps the owner system stable while making the actual defensive action inspectable in debug.
function chooseAIDefenseAction(player, perceivedLandingX, framesToFloor, distance, aiReach, isCover) {
  const cap = aiCapabilitySnapshot(player);
  const speed = Math.max(1, cap.speed);
  const horizontalGap = Math.max(0, Math.abs(perceivedLandingX - player.x) - aiReach);
  const runFramesNeeded = horizontalGap / speed;
  const runSafetyFrames = 3;
  const runIsTooLate = framesToFloor <= (runFramesNeeded + runSafetyFrames);
  const kReachableNow = player.isGrounded && !player.isDiving && !player.isBlocking && distance < aiReach;
  const airCoverReachable = !!isCover && canAIAirborneCover(player, distance, aiReach);
  const diveWindowFrames = 18;
  const diveWindowOpen = framesToFloor <= diveWindowFrames && ball.y > WORLD.NET_TOP_Y - 40;
  const diveGap = Math.max(0, Math.abs(perceivedLandingX - player.x) - 85);
  const diveFramesNeeded = diveGap / Math.max(1, cap.diveSpeed);
  const diveExecutable = player.isGrounded && !player.isBlocking && distance > aiReach * 0.90 && runIsTooLate && diveWindowOpen;

  // V75-3.7：Options 就是 Action 的唯一來源。feasible 的意思是「此刻/此計畫可合法執行」，不是「一定成功」。
  // 這樣 Audit 不會再出現「記錄說不能做，舊 decision tree 卻做了」的雙軌真相。
  const options = [
    {id:'K', feasible:kReachableNow, utility:kReachableNow?1.00:0.05, reason:kReachableNow?'IN_RANGE':'OUT_OF_REACH'},
    {id:'AIR_COVER', feasible:airCoverReachable, utility:airCoverReachable?0.92:0.04, reason:airCoverReachable?'LEGAL_AIR_COVER':'NOT_LEGAL'},
    {id:'DIVE', feasible:diveExecutable, utility:diveExecutable?0.90:0.12, reason:diveExecutable?(diveFramesNeeded<=framesToFloor+2?`DIVE_ETA_OK ${diveFramesNeeded.toFixed(1)}f`:'LAST_CHANCE_DIVE'):(diveWindowOpen?'DIVE_NOT_NEEDED':'DIVE_WINDOW_CLOSED')},
    {id:'CHASE', feasible:!kReachableNow&&!airCoverReachable&&!diveExecutable, utility:runIsTooLate?0.58:0.82, reason:runIsTooLate?'WAIT_FOR_LEGAL_DIVE_WINDOW':'RUN_ETA_OK'}
  ];

  // 已經魚躍出去時只允許 follow-through，不重新選動作。
  if (player.isDiving) {
    return { action:'DIVE_ACTIVE', reason:'DIVE_ALREADY_COMMITTED', horizontalGap, runFramesNeeded, diveFramesNeeded, runIsTooLate, kReachableNow, airCoverReachable, diveWindowOpen, diveExecutable, options:[{id:'DIVE_ACTIVE',feasible:true,utility:1,reason:'ALREADY_COMMITTED'}] };
  }

  const choice = aiChooseUtilityOption(player, 'DEFENSE', options);
  const selected = choice.selected || options[options.length-1];
  let reason = selected.reason;
  if (selected.id==='DIVE') reason = diveFramesNeeded <= framesToFloor+2 ? 'RUN_LATE_DIVE_REACHABLE' : 'RUN_LATE_LAST_CHANCE';
  if (selected.id==='CHASE') reason = runIsTooLate ? 'TOO_EARLY_FOR_DIVE_WINDOW' : 'RUN_CAN_STILL_REACH';
  if (selected.id==='K') reason='K_IN_RANGE';
  if (selected.id==='AIR_COVER') reason='LEGAL_AIR_COVER';
  return { action:selected.id, reason, horizontalGap, runFramesNeeded, diveFramesNeeded, runIsTooLate, kReachableNow, airCoverReachable, diveWindowOpen, diveExecutable, options:choice.options };
}

function traceAIDefenseDecision(player, decision, framesToFloor, distance, aiReach) {
  if (!player || !decision || typeof pushAIDebug !== 'function') return;
  const key = `${match.lastTouchFrame}|${decision.action}|${decision.reason}`;
  if (player._aiDefenseDecisionKey === key) return;
  player._aiDefenseDecisionKey = key;
  const eta = Number.isFinite(decision.runFramesNeeded) ? decision.runFramesNeeded.toFixed(1) : '-';
  const diveEta = Number.isFinite(decision.diveFramesNeeded) ? ` diveETA=${decision.diveFramesNeeded.toFixed(1)}` : '';
  pushAIDebug(player, `DEFENSE -> ${decision.action}`, `${decision.reason} | d=${distance.toFixed(0)}/${aiReach.toFixed(0)} floor=${framesToFloor}f runETA=${eta}${diveEta}`);
  const cap = aiCapabilitySnapshot(player);
  const options = Array.isArray(decision.options) ? decision.options : [
    {id:decision.action, feasible:true, utility:1, finalUtility:1, reason:decision.reason}
  ];
  emitAIIntent(player,'DEFENSE',{
    capability:cap,
    context:{distance:+distance.toFixed(2),reach:+aiReach.toFixed(2),framesToFloor,runETA:+(decision.runFramesNeeded||0).toFixed(2),diveETA:Number.isFinite(decision.diveFramesNeeded)?+decision.diveFramesNeeded.toFixed(2):null,perceivedLandingX:+Number(player?._landingRead?.x ?? 0).toFixed(1),isCover:!!(match&&match.isBlockedBack)},
    options,
    selected:decision.action,
    selectedFeasible:options.some(o=>o.id===decision.action&&o.feasible),
    reason:decision.reason
  });
}

// V75-3.7 二次進攻可行性：不是看「現在這一幀球是否剛好能扣」，而是預測接下來是否會出現合法攻擊窗。
// 只讀真實 ball + 自身 capability；最後仍必須自己跑、跳，並通過原本 J contact window。
function evaluateAISecondAttackOpportunity(player, isLeft, maxFrames=40) {
  if (!player || player.isDiving || player.isBlocking) return {feasible:false, reason:'ACTOR_UNAVAILABLE', targetFrame:null, targetX:null, targetY:null, targetShoulderX:null, approachETA:999};
  const cap=aiCapabilitySnapshot(player), facing=isLeft?1:-1;
  let x=ball.x, y=ball.y, vx=ball.vx, vy=ball.vy;
  const rr=ball.radius||13;
  const netLimit=215;
  let best=null;
  for(let f=1;f<=maxFrames;f++){
    x+=vx; y+=vy;
    let g=WORLD.GRAVITY*0.72;
    if(ball.isTopspin){const magnus=0.00032+(ball.topspinRating*0.00018);g+=(vx*vx)*magnus;}
    vy+=g;
    if(y+rr>=WORLD.FLOOR_Y) break;
    const distNet=Math.abs(x-WORLD.NET_X);
    if(distNet>netLimit) continue;
    const jumpStat=aiNorm(cap.jump,10,60);
    const topY=WORLD.NET_TOP_Y-(205+jumpStat*70);
    const bottomY=WORLD.NET_TOP_Y-25;
    if(y<topY||y>bottomY||vy<-2.5) continue;
    const onCorrectSide=(x-WORLD.NET_X)*facing<0;
    if(!onCorrectSide) continue;

    // Plan a SHOULDER/takeoff corridor, not the ball's x coordinate. V76-3.4.3 steered the
    // attacker toward ball.x, then required dx>=10 for a quality swing; those two rules fought each other.
    for(let dx=18;dx<=52;dx+=4){
      const targetShoulderX=x-facing*dx;
      const minX=isLeft?WORLD.LEFT+70:WORLD.NET_X+45;
      const maxX=isLeft?WORLD.NET_X-45:WORLD.RIGHT-70;
      if(targetShoulderX<minX||targetShoulderX>maxX) continue;
      const gap=Math.max(0,Math.abs(targetShoulderX-player.x)-8);
      const eta=gap/Math.max(1,cap.speed);
      // Preserve real movement + jump setup time. This is a staging feasibility test only;
      // takeoff itself is revalidated later against the live airborne quality window.
      if(eta>Math.max(0,f-6)) continue;
      const contactQuality=aiClamp01(1-Math.abs(y-(WORLD.NET_TOP_Y-135))/155);
      const arrivalSlack=Math.max(0,f-eta);
      const centerDxQuality=aiClamp01(1-Math.abs(dx-34)/26);
      const score=contactQuality+aiClamp01(arrivalSlack/18)*0.32+centerDxQuality*0.18-aiClamp01(distNet/netLimit)*0.08;
      if(!best||score>best.score) best={score,frame:f,x,y,targetShoulderX,dx,eta,distNet,vy};
    }
  }
  if(!best) return {feasible:false,reason:'NO_PREDICTED_J_WINDOW',targetFrame:null,targetX:null,targetY:null,targetShoulderX:null,approachETA:999};
  return {feasible:true,reason:'PREDICTED_J_WINDOW',targetFrame:best.frame,targetX:best.x,targetY:best.y,targetShoulderX:best.targetShoulderX,plannedDx:best.dx,approachETA:best.eta,arrivalSlack:best.frame-best.eta,distToNet:best.distNet,ballVy:best.vy};
}

function runTeamBrain(pA, pB, teamHits, baseNetX, isLeft) {
  // V75-3 controlled Balance Scenario freezes autonomous teammates/opponents; Human input + real physics remain live.
  if (typeof BALANCE_SCENARIO_ACTIVE !== 'undefined' && BALANCE_SCENARIO_ACTIVE) return;
  const isCooldown = (gameFrame - match.lastTouchFrame) < 18;
  const landingPrediction = predictBallLandingForAI();
  const realLandingX = landingPrediction.x; // 僅供球路/Block Return 的物理歸屬，不直接給 AI 當答案。
  const framesToFloor = landingPrediction.frames;
  const readA = getLandingRead(pA);
  const readB = getLandingRead(pB);

  // V75-3.18: an opponent touch is a legal terminal for any waiting third-touch plan.
  // Record the cancellation before other team-brain early returns can hide it.
  if(ball.lastHitter && ball.lastHitter.isLeft!==isLeft){
    for(const p of [pA,pB]){
      const plan=p?._thirdAttackPlan;
      if(plan && plan.touchKey!==match.lastTouchFrame){
        aiCancelThirdTouchPlan(p,'CANCELLED_BY_OPPONENT_TOUCH',{cancellingSlot:ball.lastHitter.slotKey||null,ballX:+ball.x.toFixed(1),ballY:+ball.y.toFixed(1)});
      }
    }
  }

  // V4 接球責任：先用「預測落點 + 目前站位 + 實際接球範圍」分配責任，
  // 再讓被分配到的人決定跑接或 Dive。Dive 絕對不能反過來搶責任。
  // 這裡故意不以角色跑速直接決定誰搶球，避免高速 AI 從已站好位置的真人手上搶接發。
  const receiveReachA = isSlotHumanControlled(pA) ? Math.max(70, pA.stats.reach || 70) : (pA.stats.reach || 64);
  const receiveReachB = isSlotHumanControlled(pB) ? Math.max(70, pB.stats.reach || 70) : (pB.stats.reach || 64);
  const claimGapA = Math.max(0, Math.abs(pA.x - readA.x) - receiveReachA);
  const claimGapB = Math.max(0, Math.abs(pB.x - readB.x) - receiveReachB);

  let actor;
  if (Math.abs(claimGapA - claimGapB) > 8) {
    actor = (claimGapA <= claimGapB) ? pA : pB;
  } else {
    // 幾乎等距才用到達時間作為 tie-break；這樣保留速度差，但不讓速度凌駕站位責任。
    const timeA = claimGapA / Math.max(1, pA.effectiveSpeed);
    const timeB = claimGapB / Math.max(1, pB.effectiveSpeed);
    actor = (timeA <= timeB) ? pA : pB;
  }
  let partner = (actor === pA) ? pB : pA;

  // V76-3.7.2: an ACTIVE first-touch attack plan temporarily owns execution, but only while
  // that untouched opponent ball is still the same possession. A stale/aborted plan can never
  // keep receive ownership hostage. The touch-order layer and the action layer stay separate.
  for(const p of [pA,pB]){
    const fp=p?._firstTouchAttackPlan;
    const stale=!!fp && (fp.touchKey!==match.lastTouchFrame || !ball.lastHitter || ball.lastHitter.isLeft===isLeft || ball.lastHitter===p || match.isBlockedBack);
    if(stale){p._firstTouchAttackPlan=null;p._firstTouchAttackEpoch=null;}
  }
  const firstTouchAttackOwner=[pA,pB].find(p=>p?._firstTouchAttackPlan?.touchKey===match.lastTouchFrame);
  if(firstTouchAttackOwner && ball.lastHitter && ball.lastHitter.isLeft!==isLeft){
    actor=firstTouchAttackOwner;
    partner=(actor===pA)?pB:pA;
  }
  let hasActiveFirstTouchCommit=!!firstTouchAttackOwner && actor===firstTouchAttackOwner;

  // V75-0 FOUNDATION: one unavailable actor must never shut down the whole team brain.
  // If the claimed receiver is temporarily unavailable, transfer the live-ball responsibility to the teammate
  // when that teammate is AI-controlled and available. Humans are never commandeered here.
  const actorUnavailable = actor.reactionTimer > 0 || (typeof actor.stunTimer !== 'undefined' && actor.stunTimer > 0);
  const partnerUnavailable = partner.reactionTimer > 0 || (typeof partner.stunTimer !== 'undefined' && partner.stunTimer > 0);
  if (actorUnavailable && !partnerUnavailable && !isSlotHumanControlled(partner)) {
    if(hasActiveFirstTouchCommit){actor._firstTouchAttackPlan=null;actor._firstTouchAttackEpoch=null;hasActiveFirstTouchCommit=false;}
    const oldActor = actor; actor = partner; partner = oldActor;
    if (typeof pushAIBrainTrace === 'function') pushAIBrainTrace(isLeft?'LEFT':'RIGHT', 'OWNER FAILOVER', `${oldActor.name} unavailable -> ${actor.name}`);
  } else if (actorUnavailable && partnerUnavailable) {
    if (typeof flagAIBug === 'function') flagAIBug(isLeft?'LEFT':'RIGHT', 'BOTH_UNAVAILABLE', `${actor.name}/${partner.name}`);
    return;
  }

  // V75-1 live-ball reassignment: keep the original positional claimant unless it is clearly becoming unreachable.
  // This fixes rare chance-ball freezes without making both teammates chase every ball. A human teammate is never commandeered.
  const actorClaimRead = (actor === pA) ? readA : readB;
  const partnerClaimRead = (partner === pA) ? readA : readB;
  const actorReachForEta = actor.stats.reach || 64;
  const partnerReachForEta = partner.stats.reach || 64;
  const actorEta = estimateAIChaseFrames(actor, actorClaimRead.x, actorReachForEta);
  const partnerEta = estimateAIChaseFrames(partner, partnerClaimRead.x, partnerReachForEta);
  // Ownership 也只看真實 ETA；INT 的價值已經反映在角色自己的 Landing Read 品質。
  const lateSafety = 3;
  const betterMargin = 7;
  const actorLikelyLate = actorEta > Math.max(0, framesToFloor - lateSafety);
  const partnerClearlyBetter = partnerEta + betterMargin < actorEta && partnerEta <= Math.max(0, framesToFloor + 2);
  if (!hasActiveFirstTouchCommit && actorLikelyLate && partnerClearlyBetter && !isSlotHumanControlled(partner) && aiCanActNow(partner)) {
    const oldActor = actor; actor = partner; partner = oldActor;
    if (typeof pushAIBrainTrace === 'function') pushAIBrainTrace(isLeft?'LEFT':'RIGHT', 'LIVE REASSIGN', `${oldActor.name} ETA ${actorEta.toFixed(1)}f -> ${actor.name} ${partnerEta.toFixed(1)}f`);
  }

  let skillNoise = 0;
  if (ball.isSineFloat) skillNoise = Math.sin(gameFrame * 0.25) * 45;
  if (ball.isPhantomDrop && ball.opacity < 0.2) {
    skillNoise = Math.sin(gameFrame * 0.4) * 55;
    actor.reactionTimer = Math.max(actor.reactionTimer, 12);
  }

  // V11：AI 跑位與 OUT 判斷使用角色自己的 Landing Read，不直接讀真實落點。
  const actorRead = (actor === pA) ? readA : readB;
  const ownSideline = isLeft ? WORLD.LEFT : WORLD.RIGHT;
  const outballUncertainty = Math.max(8, actor.stats.outballThreshold || 8);
  const perceivedLandingX = actorRead.x + skillNoise;
  const signedOutDistance = isLeft ? (WORLD.LEFT - perceivedLandingX) : (perceivedLandingX - WORLD.RIGHT);
  const obviousOutMargin = Math.max(18, outballUncertainty * 1.25);
  const isClearlyOut = signedOutDistance > obviousOutMargin;
  const isPerceivedOut = isClearlyOut || (isLeft ? (perceivedLandingX < WORLD.LEFT) : (perceivedLandingX > WORLD.RIGHT));

  // 一般來球：最後觸球者是對手，而且球已經進入我方半場。
  // 攔網觸球則不能只看 lastHitter：ONE TOUCH / 卸力後最後觸球者雖然是我方攔網手，
  // 球仍可能落回我方後場，這時我方必須救；ROOF / TOOL OUT 則可能回到攻擊方。
  // 因此 Block Return 以「預測落點落在哪一側」決定哪一隊需要處理，且左右完全鏡像共用。
  const lastTouchFromOpponent = !!ball.lastHitter && (ball.lastHitter.isLeft !== isLeft);
  const ballOnOurHalf = isLeft ? (ball.x <= WORLD.NET_X) : (ball.x >= WORLD.NET_X);
  const blockedBallTargetsLeft = realLandingX < WORLD.NET_X;
  const blockedBallTargetsOurSide = isLeft ? blockedBallTargetsLeft : !blockedBallTargetsLeft;
  // V54 場地中立活球（目前 UFO 拋回）：沒有 lastHitter 仍然是必須處理的 Rally 球。
  // 雙方 AI 依自己的 Landing Read 判斷責任區，不把 UFO 假冒成任何一隊的最後擊球者。
  const neutralBallTargetsOurSide = !!ball.venueNeutralLive && (isLeft ? realLandingX < WORLD.NET_X : realLandingX >= WORLD.NET_X);
  const isBallThreat = match.isBlockedBack
    ? blockedBallTargetsOurSide
    : (ball.venueNeutralLive ? neutralBallTargetsOurSide : (lastTouchFromOpponent && ballOnOurHalf));

  // 🌟 真人檢查：若執行者是真人，AI 大腦立刻物理退出，完全交給鍵盤/連線！
  const actorIsHuman = isSlotHumanControlled(actor);
  const partnerIsHuman = isSlotHumanControlled(partner);

  // V75-0: incoming opponent/blocked-back ball ALWAYS overrides stale offensive hit-count state.
  // Before the first new touch, match.leftHits/rightHits can still contain the previous possession's 1/2 hits.
  // Gating defense on teamHits===0 caused rare chance balls (especially non-3rd-touch J returns) to be treated as SET/ATTACK phases.
  if (isBallThreat) {
    if (typeof setAITeamIntent === 'function') setAITeamIntent(isLeft?'LEFT':'RIGHT', match.isBlockedBack?'COVER_CHASE':'RECEIVE_CHASE', actor, partner, perceivedLandingX, match.isBlockedBack?'BLOCK_RETURN':'INCOMING_OPPONENT', teamHits, 'THIRD_BALL_SAFETY');
    if (!actorIsHuman) {
      // V12 COVER READ：攔網反彈不是 AI 瞬間知道答案。
      // 第一次辨識到 blocked-back 時，用既有 reactionDelay / INT 產生短暫辨識延遲；
      // 真人仍完全手動，AI 只是在延遲結束後才允許尋路/接球。
      if (match.isBlockedBack) {
        if (actor._coverReadTouch !== match.lastTouchFrame) {
          actor._coverReadTouch = match.lastTouchFrame;
          const intVal = Math.max(0, Math.min(60, actor.stats.intellect || 0));
          const baseReact = Math.max(3, actor.stats.reactionDelay || 8);
          const coverDelay = Math.max(2, Math.round(baseReact * (1.05 - intVal / 120)));
          actor._coverReadUntil = gameFrame + coverDelay;
          if (typeof pushAIDebug === 'function') pushAIDebug(actor, 'COVER READ', `WAIT ${coverDelay}f`);
        }
        if (gameFrame < actor._coverReadUntil) return;
      }
      // 🦁 AI 施放【野蠻怒吼】判定
      if (!(typeof BALANCE_DISABLE_SKILLS !== 'undefined' && BALANCE_DISABLE_SKILLS) && actor.stats.skill.id === 'sk_savage_roar' && actor.energy >= actor.stats.skill.cost) {
        actor.consumeSkill('DEF_SAVE');
        playSound('time_freeze'); triggerScreenShake(8, 12);
        actor.roarVfxTimer = 24;
        createRoarWave(actor.x, actor.y - actor.radius);
        if (typeof NET!=='undefined' && NET.isMultiplayer && NET.isHost && NET.conn && NET.conn.open) {
          try { NET.conn.send({type:'SAVAGE_ROAR_FX_SYNC',slotIndex:actor.slotIndex,x:actor.x,y:actor.y-actor.radius,eventId:`roarfx:${gameFrame}:${actor.slotIndex}`}); } catch(e) {}
        }
        pushCallout(actor.x, actor.y - 45, '野蠻怒吼 (SAVAGE ROAR)!!', '#dc2626');
        actor.excitedRallies = 4; actor.depressedRallies = 0; actor.roarMoodRallies = 4;
        partner.excitedRallies = 4; partner.depressedRallies = 0; partner.roarMoodRallies = 4;
        allPlayers.forEach(p => {
          if (p.isLeft !== isLeft) { p.depressedRallies = 4; p.excitedRallies = 0; p.roarMoodRallies = 4; }
        });
      }

      // OUT 不是單純看「會不會出界」，還要看最後觸球權。
      // 對手最後碰：OUT 可以放；我方攔網手最後碰：即使預測 OUT 仍必須追救。
      const canLetBallGoOut = lastTouchFromOpponent;

      // ⚡ V28 AI 雷霆瞬步：先做「值不值得救」判斷，再做技能判斷。
      // 對手最後碰且 AI 自己的 Landing Read 已判定明確 OUT 時，禁止為 Outball 浪費雷霆。
      // 這仍使用 AI 感知值 perceivedLandingX，不偷讀真實未來落點。
      const thunderWorthSaving = !(isPerceivedOut && canLetBallGoOut);
      if (!(typeof BALANCE_DISABLE_SKILLS !== 'undefined' && BALANCE_DISABLE_SKILLS) && thunderWorthSaving && typeof canExecuteRollingThunder === 'function' && canExecuteRollingThunder(actor)) {
        const dThunder = getDist(actor);
        const normalReach = Math.max(70, actor.stats.reach || 70);
        const floorEmergency = ball.vy > 0.1 && ball.y > WORLD.FLOOR_Y - 150;
        const cannotReachNormally = dThunder > normalReach;
        const coverEmergency = !!match.isBlockedBack;
        if ((cannotReachNormally && floorEmergency) || (coverEmergency && dThunder > normalReach * 0.8)) {
          if (executeRollingThunder(actor)) {
            if (typeof pushAIDebug === 'function') pushAIDebug(actor, 'ROLLING THUNDER', `SAVE d=${dThunder.toFixed(0)}`);
            return;
          }
        }
      }
      // V76-3.7.2 FIRST-CONTACT ATTACK: touch order decides WHO; normal attack physics decides WHAT.
      // There is no first-touch-only height band, slow-ball rule, or special J range. A low roller may
      // be attacked on ascent; a high ball waits/stages for its predicted takeoff instead of jumping early.
      const directFirstTouchContext=lastTouchFromOpponent && !match.isBlockedBack && !ball.venueNeutralLive && !isPerceivedOut;
      if(directFirstTouchContext && aiCanActNow(actor)){
        let fp=actor._firstTouchAttackPlan;

        if(fp?.touchKey===match.lastTouchFrame){
          // Existing commit lifecycle runs independently of the condition that originally created it.
          // Ground: approach/wait -> live takeoff revalidation. Air: execute only on real J geometry.
          if(actor.isGrounded && !actor.isDiving){
            const targetX=Number.isFinite(fp.targetShoulderX)?fp.targetShoulderX:actor.x;
            steerAIThirdAttackWindow(actor,targetX,actor.effectiveSpeed);
            const xReady=Math.abs(actor.x-targetX)<=Math.max(18,(actor.effectiveSpeed||1)*1.6);
            if(gameFrame>=fp.jumpFrame && xReady){
              const live=aiLiveTakeoffWindow(actor,fp.style,42,'ANY');
              if(live){
                fp={...fp,targetShoulderX:live.targetShoulderX,contactDueFrame:gameFrame+live.frame,actualTakeoffFrame:gameFrame};
                actor._firstTouchAttackPlan=fp;
                actor.facing=isLeft?1:-1;
                if(typeof pushAIDebug==='function')pushAIDebug(actor,'1ST TOUCH ATTACK: TAKEOFF',`${fp.style} +${live.frame}f y=${live.y.toFixed(0)}`);
                actor.jump();
                return;
              }

              // The planned window moved before takeoff. Replan from live physics instead of forcing
              // the old jump; if no normal attack window remains, release ownership THIS FRAME.
              const replanned=aiSelectFirstTouchAttackPlan(actor);
              if(replanned){
                fp={touchKey:match.lastTouchFrame,style:replanned.style,createdFrame:gameFrame,jumpFrame:gameFrame+replanned.jumpDelay,contactDueFrame:gameFrame+replanned.frame,targetShoulderX:replanned.targetShoulderX,target:replanned};
                actor._firstTouchAttackPlan=fp;
                actor._firstTouchAttackEpoch=match.lastTouchFrame;
                if(typeof pushAIDebug==='function')pushAIDebug(actor,'1ST TOUCH ATTACK: REPLAN',`${fp.style} jump +${replanned.jumpDelay}f`);
                steerAIThirdAttackWindow(actor,fp.targetShoulderX,actor.effectiveSpeed);
                return;
              }
              actor._firstTouchAttackPlan=null;
              actor._firstTouchAttackEpoch=null;
              if(typeof pushAIDebug==='function')pushAIDebug(actor,'1ST TOUCH ATTACK: ABORT','NO_LIVE_ATTACK_WINDOW');
            }else{
              // Valid future attack: stage on the ground. Do not enter receive-chase or jump early.
              return;
            }
          }else if(!actor.isGrounded&&!actor.isDiving&&ball.lastHitter!==actor){
            const firstTouchContact=(!isCooldown)?aiPrimaryQualityContactState(actor):null;
            if(firstTouchContact){
              const formula1=(typeof computeSpikeFormula==='function')?computeSpikeFormula(actor.stats,actor.runMomentum):null;
              const power1=formula1?.effectivePower||actor.stats?.power||26;
              const traj1=aiProjectedAttackTrajectory(actor,firstTouchContact.style,{x:ball.x,y:ball.y},power1);
              if(traj1?.safe){
                if(typeof pushAIDebug==='function')pushAIDebug(actor,'1ST TOUCH: ATTACK',`${firstTouchContact.style} direct`);
                actor._firstTouchAttackPlan=null;
                actor._firstTouchAttackEpoch=null;
                handleUserAttack(actor);
                return;
              }
            }
            if(Number.isFinite(fp.targetShoulderX))steerAIThirdAttackWindow(actor,fp.targetShoulderX,actor.effectiveSpeed);
            const expired=gameFrame>(Number(fp.contactDueFrame||fp.jumpFrame||gameFrame)+8);
            if(expired){
              actor._firstTouchAttackPlan=null;
              actor._firstTouchAttackEpoch=null;
              if(typeof pushAIDebug==='function')pushAIDebug(actor,'1ST TOUCH ATTACK: ABORT','CONTACT_WINDOW_EXPIRED');
              // No team touch happened: next frame the untouched ball returns to normal first-touch arbitration.
            }else{
              return;
            }
          }else if(actor.isDiving){
            actor._firstTouchAttackPlan=null;
            actor._firstTouchAttackEpoch=null;
          }
        }

        // No active plan: ATTACK is simply one physically feasible first-touch option.
        // If no common attack window exists, execution falls through to RECEIVE / CHASE / DIVE.
        if(!actor._firstTouchAttackPlan && actor.isGrounded && !actor.isDiving){
          // V76-3.7.3: feasibility is not a command. Compare a real ATTACK window against a
          // real predicted standing receive. CONTROL simply falls through to the existing
          // RECEIVE/CHASE/DIVE execution layer; only ATTACK creates an attack commit.
          const canReevaluate=!Number.isFinite(actor._firstTouchActionEvalFrame)||gameFrame>=actor._firstTouchActionEvalFrame;
          if(canReevaluate){
            const actionEval=aiEvaluateFirstTouchAction(actor);
            actor._firstTouchActionEvalFrame=gameFrame+4;
            const candidate=actionEval?.choice?.selected?.id==='ATTACK'?actionEval.attack:null;
            if(candidate){
              actor.facing=isLeft?1:-1;
              actor._firstTouchAttackEpoch=match.lastTouchFrame;
              actor._firstTouchAttackPlan={touchKey:match.lastTouchFrame,style:candidate.style,createdFrame:gameFrame,jumpFrame:gameFrame+candidate.jumpDelay,contactDueFrame:gameFrame+candidate.frame,targetShoulderX:candidate.targetShoulderX,target:candidate};
              if(typeof pushAIDebug==='function')pushAIDebug(actor,'1ST TOUCH ATTACK: COMMIT',`${candidate.style} A=${actionEval.context.attackEV.toFixed(2)} C=${actionEval.context.controlEV.toFixed(2)} jump +${candidate.jumpDelay}f`);
              // A 0f takeoff is still revalidated against the live generic attack window.
              if(candidate.jumpDelay<=0 && Math.abs(actor.x-candidate.targetShoulderX)<=Math.max(18,(actor.effectiveSpeed||1)*1.6)){
                const live=aiLiveTakeoffWindow(actor,candidate.style,42,'ANY');
                if(live){
                  actor._firstTouchAttackPlan.contactDueFrame=gameFrame+live.frame;
                  actor._firstTouchAttackPlan.targetShoulderX=live.targetShoulderX;
                  actor._firstTouchAttackPlan.actualTakeoffFrame=gameFrame;
                  actor.jump();
                  return;
                }
              }
              steerAIThirdAttackWindow(actor,candidate.targetShoulderX,actor.effectiveSpeed);
              return;
            }
          }
        }
      }

      if (isPerceivedOut && canLetBallGoOut) {
        moveTowards(actor, isLeft ? WORLD.LEFT + 180 : WORLD.RIGHT - 180, actor.effectiveSpeed*(typeof venuePlayerSpeedFactor==='function'?venuePlayerSpeedFactor(actor):1));
        if (actor.recheckDelay <= 0) {
          pushCallout(actor.x, actor.y - actor.radius * 2, 'OUT!', '#facc15');
          actor.recheckDelay = Math.max(8, Math.round(26 - actor.stats.intellect * 0.35));
        }
      } else {
        if (actor.recheckDelay > 0 && !isPerceivedOut) {
          pushCallout(actor.x, actor.y - actor.radius * 2, 'Inside!', '#10b981');
          actor.recheckDelay = 0;
        }

        steerAIToFreshBallIntent(actor, perceivedLandingX, actor.effectiveSpeed*(typeof venuePlayerSpeedFactor==='function'?venuePlayerSpeedFactor(actor):1), match.lastTouchFrame, match.isBlockedBack?'COVER_CHASE':'RECEIVE_CHASE');
        const d = getDist(actor);
        const aiReach = actor.stats.reach || 64;

        // V75-2: owner first, action second. K / Dive / airborne Cover are mutually exclusive decisions
        // from the same live ball read, so we can debug exactly why an AI did or did not dive.
        const defenseDecision = chooseAIDefenseAction(actor, perceivedLandingX, framesToFloor, d, aiReach, match.isBlockedBack);
        traceAIDefenseDecision(actor, defenseDecision, framesToFloor, d, aiReach);

        if (defenseDecision.action === 'DIVE') {
          actor.facing = (perceivedLandingX > actor.x) ? 1 : -1;
          actor.dive();
        }

        const canTouch = (!isCooldown) && (ball.lastHitter !== actor || actor.hasBlockSelfHitPrivilege);
        if ((defenseDecision.action === 'K' || defenseDecision.action === 'AIR_COVER') && canTouch) {
          const wasBlocked = match.isBlockedBack;
          if (recordTouch(actor)) executePlayerTimingReceive(actor, wasBlocked, defenseDecision.action === 'AIR_COVER' ? 'AIR_COVER' : 'K');
        } else if (d > 165 && ball.y > WORLD.FLOOR_Y - 50 && actor.despairTimer <= 0) {
          const phrases = ['接不到！', '來不及了！', '啊！'];
          pushCallout(actor.x, actor.y - actor.radius * 2, phrases[Math.floor(Math.random() * phrases.length)], '#f87171');
          actor.despairTimer = 90;
        }
      }
    }

    if (!partnerIsHuman && partner.reactionTimer <= 0) {
      // V6：第一觸責任已經屬於 actor，partner 不再跟著來球追後場。
      // 用既有的預測落點與 PERFECT RECEIVE 目標，提前站到下一觸的支援區。
      // 只移動 AI controller；真人同隊時絕不替玩家下移動指令。
      const idealReceiveTargetX = isLeft ? (WORLD.NET_X - 120) : (WORLD.NET_X + 120);
      const supportPrepareX = realLandingX * 0.35 + idealReceiveTargetX * 0.65;
      const minSupportX = isLeft ? WORLD.LEFT + 90 : WORLD.NET_X + 90;
      const maxSupportX = isLeft ? WORLD.NET_X - 90 : WORLD.RIGHT - 90;
      const clampedSupportX = Math.max(minSupportX, Math.min(maxSupportX, supportPrepareX));
      moveTowards(partner, clampedSupportX, partner.effectiveSpeed);
    }
  }

  // V75-3.7 SERVE POSSESSION LOCK:
  // The serving side is locked out until the receiving side makes its first legal touch.
  // This rule is derived from serve state / possession, never from teamHits. A serve happens to increment
  // the server's hit counter, but that counter is not permission to plan a second attack.
  const servingSideLocked = !!(match.inServeRally && serveState.currentServer && serveState.currentServer.isLeft === isLeft);
  if (servingSideLocked) {
    for (const p of [pA,pB]) {
      if (p._secondAttackCommit || p._secondAttackPlan) {
        p._secondAttackCommit = false;
        p._secondAttackPlan = null;
      }
    }
    return;
  }
  else if (teamHits === 1) {
    // V76-3.5: possession legality is deterministic in 2v2. After A's first legal team touch,
    // B owns the second touch. Availability changes whether B succeeds, never who is legally next.
    const handler = aiLegalNextTeamToucher(pA,pB,isLeft,teamHits);
    if(!handler) return;
    const spiker = (handler === pA) ? pB : pA;
    if (typeof setAITeamIntent === 'function') setAITeamIntent(isLeft?'LEFT':'RIGHT', 'SET_CHASE', handler, spiker, ball.x, 'TEAM_HIT_1', teamHits, 'THIRD_BALL_SAFETY');
    const handlerIsHuman = isSlotHumanControlled(handler);
    const spikerIsHuman = isSlotHumanControlled(spiker);

    if (!handlerIsHuman) {
      steerAIToFreshBallIntent(handler, ball.x, handler.effectiveSpeed, match.lastTouchFrame, 'SET_CHASE');

      // V15：二次進攻只看自己的球況 + 既有 INT/DEX，不讀對手防守站位。
      // 每次第一觸後只擲一次，避免逐幀重骰讓低機率變相成為必出。
      const secondTouchEpoch = match.lastTouchFrame;
      if (handler._secondAttackEpoch !== secondTouchEpoch) {
        handler._secondAttackEpoch = secondTouchEpoch;
        handler._secondAttackCommit = false;
        handler._secondTouchMode = 'SET';
        handler._aiQuickSetPlan = null;
        spiker._quickPrecommitPlan = null;
        spiker._quickPrecommitEpoch = null;

        const cap2 = aiCapabilitySnapshot(handler);
        const firstToucher2 = ball.lastHitter;
        const possessionOrigin2 = (match.inServeRally && serveState.currentServer && serveState.currentServer.isLeft === isLeft)
          ? 'FROM_SERVE'
          : (firstToucher2?._lastTouchPossessionOrigin || 'FROM_TEAM_TOUCH');
        const opp2 = evaluateAISecondAttackOpportunity(handler,isLeft,42);
        const distToNet2 = Math.abs(handler.x - WORLD.NET_X);
        const attackFeasible2 = !!opp2.feasible;
        // V76-3.4.3: SET is a future physical contact plan, not an unconditional fallback label.
        // If the assigned second-touch player cannot reach any real set contact window, SET must
        // become infeasible so the owner keeps the rally alive with the normal chase/K/dive tools.
        const setWindow2 = aiPredictSecondTouchContact(handler,48);
        const setFeasible2 = !!setWindow2 || (!handler.isDiving && getDist(handler) < 64);
        const saveFeasible2 = !attackFeasible2 && !setFeasible2;
        const approachETA2 = Number.isFinite(opp2.approachETA)?opp2.approachETA:999;
        const contactQuality2 = opp2.feasible ? aiClamp01(1-Math.abs(opp2.targetY-(WORLD.NET_TOP_Y-135))/155) : 0;
        const approachQuality2 = opp2.feasible ? aiClamp01((opp2.arrivalSlack||0)/18) : 0;
        const nearNetQuality2 = opp2.feasible ? aiClamp01(1-(opp2.distToNet||215)/215) : 0;
        const attackUtility2 = 0.28 + approachQuality2 * 0.32 + nearNetQuality2 * 0.18 + contactQuality2 * 0.18
          + aiNorm(cap2.power, 18, 36) * 0.18 + aiNorm(cap2.jump, 10, 60) * 0.12 + aiNorm(cap2.tec) * 0.10;
        const setUtility2 = 0.62 + aiNorm(cap2.tec) * 0.22 + aiClamp01(1 - getDist(handler) / Math.max(70, cap2.reach + 12)) * 0.18 - (handler.isDiving?0.10:0);
        const choice2 = aiChooseUtilityOption(handler, 'SECOND_TOUCH', [
          {id:'ATTACK', feasible:attackFeasible2, utility:attackUtility2, reason:opp2.reason},
          {id:'SET', feasible:setFeasible2, utility:setUtility2, reason:setFeasible2?'SET_WINDOW_REACHABLE':'NO_SET_CONTACT_WINDOW'},
          {id:'SAVE', feasible:saveFeasible2, utility:saveFeasible2?0.92:0.05, reason:saveFeasible2?'KEEP_SECOND_TOUCH_ALIVE':'SET_OR_ATTACK_AVAILABLE'}
        ]);
        handler._secondTouchMode = choice2.selected?.id || (setFeasible2?'SET':'SAVE');
        handler._secondAttackCommit = handler._secondTouchMode === 'ATTACK';
        handler._secondAttackPlan = handler._secondAttackCommit ? {touchFrame:secondTouchEpoch,targetFrame:gameFrame+(opp2.targetFrame||0),targetX:opp2.targetShoulderX,targetBallX:opp2.targetX,targetY:opp2.targetY,plannedDx:opp2.plannedDx,expires:gameFrame+(opp2.targetFrame||0)+8} : null;
        const reason2 = `${handler._secondTouchMode} U=${choice2.selected?.finalUtility?.toFixed(2) ?? '-'} runETA=${approachETA2.toFixed(1)}f`;
        emitAIIntent(handler,'SECOND_TOUCH',{
          capability:cap2,
          possessionOrigin:possessionOrigin2,
          context:{legalOwner:aiTouchOwnerSlot(handler),previousToucher:aiTouchOwnerSlot(firstToucher2),possessionOrigin:possessionOrigin2,distToNet:+distToNet2.toFixed(1),ballVy:+ball.vy.toFixed(2),approachETA:Number.isFinite(approachETA2)?+approachETA2.toFixed(2):null,predictedAttackFrame:opp2.targetFrame,predictedAttackX:Number.isFinite(opp2.targetX)?+opp2.targetX.toFixed(1):null,predictedTakeoffX:Number.isFinite(opp2.targetShoulderX)?+opp2.targetShoulderX.toFixed(1):null,plannedDx:Number.isFinite(opp2.plannedDx)?+opp2.plannedDx.toFixed(1):null,predictedAttackY:Number.isFinite(opp2.targetY)?+opp2.targetY.toFixed(1):null,arrivalSlack:Number.isFinite(opp2.arrivalSlack)?+opp2.arrivalSlack.toFixed(2):null,contactDist:+getDist(handler).toFixed(2)},
          options:choice2.options.map(o=>({id:o.id,feasible:o.feasible,utility:+o.utility.toFixed(3),finalUtility:+o.finalUtility.toFixed(3),reason:o.reason})),
          selected:choice2.selected?.id||handler._secondTouchMode,
          selectedFeasible:!!choice2.selected?.feasible,
          reason:reason2
        });
        if (typeof pushAIDebug === 'function') {
          pushAIDebug(handler, handler._secondAttackCommit ? '2ND ATTACK: YES' : (handler._secondTouchMode==='SAVE'?'2ND SAVE: YES':'2ND ATTACK: NO'),
            `${reason2} | A=${attackUtility2.toFixed(2)} S=${setUtility2.toFixed(2)}`);
        }
      }

      if (handler._secondTouchMode === 'SAVE' && !handler.isDiving) {
        const saveRead=getLandingRead(handler);
        const saveX=Number.isFinite(saveRead?.x)?saveRead.x:ball.x;
        steerAIToFreshBallIntent(handler,saveX,handler.effectiveSpeed*(typeof venuePlayerSpeedFactor==='function'?venuePlayerSpeedFactor(handler):1),match.lastTouchFrame,'SECOND_TOUCH_SAVE');
        const dSave=getDist(handler), reachSave=handler.stats.reach||64;
        const saveDecision=chooseAIDefenseAction(handler,saveX,framesToFloor,dSave,reachSave,false);
        traceAIDefenseDecision(handler,saveDecision,framesToFloor,dSave,reachSave);
        if(saveDecision.action==='DIVE'){
          handler.facing=(saveX>handler.x)?1:-1;
          handler.dive();
        }
        const canSaveTouch=aiCanActNow(handler)&&(!isCooldown)&&ball.lastHitter!==handler;
        if((saveDecision.action==='K'||saveDecision.action==='AIR_COVER')&&canSaveTouch){
          if(recordTouch(handler)) executePlayerTimingReceive(handler,false,'K');
        }
      }

      if (handler._secondAttackCommit) {
        // 決定偷二也不能作弊：自己跑、自己跳、自己進玩家 J 的實際擊球窗。
        handler.facing = isLeft ? 1 : -1;
        const plan2=handler._secondAttackPlan;
        if(plan2 && Number.isFinite(plan2.targetX)) steerAIToFreshBallIntent(handler,plan2.targetX,handler.effectiveSpeed,match.lastTouchFrame,'2ND_ATTACK_APPROACH');
        // 如果預測窗已經過期但還沒進攻，明確 ABORT 回 SET；記錄原因，避免「偷二計畫」直接把一球放掉。
        if(plan2 && gameFrame>plan2.expires && handler.isGrounded){
          handler._secondAttackCommit=false;handler._secondAttackPlan=null;
          const abortSetWindow=aiPredictSecondTouchContact(handler,28);
          handler._secondTouchMode=abortSetWindow?'SET':'SAVE';
          emitAIIntent(handler,'SECOND_TOUCH_UPDATE',{capability:aiCapabilitySnapshot(handler),context:{expiredAt:plan2.expires,ballX:+ball.x.toFixed(1),ballY:+ball.y.toFixed(1),legalOwner:aiTouchOwnerSlot(handler)},options:[{id:'ATTACK',feasible:false,utility:0,finalUtility:-999,reason:'PREDICTED_WINDOW_EXPIRED'},{id:'SET',feasible:!!abortSetWindow,utility:abortSetWindow?1:0.05,finalUtility:abortSetWindow?1:-998.95,reason:abortSetWindow?'LIVE_SET_WINDOW':'NO_LIVE_SET_WINDOW'},{id:'SAVE',feasible:!abortSetWindow,utility:!abortSetWindow?1:0.05,finalUtility:!abortSetWindow?1:-998.95,reason:!abortSetWindow?'LEGAL_OWNER_KEEP_BALL_ALIVE':'SET_AVAILABLE'}],selected:handler._secondTouchMode,selectedFeasible:true,reason:`ATTACK_PLAN_ABORT -> ${handler._secondTouchMode}`});
          if(typeof pushAIDebug==='function')pushAIDebug(handler,'2ND ATTACK: ABORT',`predicted J-window expired -> ${handler._secondTouchMode}`);
        }
        const distToNet2 = Math.abs(handler.x - WORLD.NET_X);
        // V76-3.5: do not jump because the ball is merely "near enough". Revalidate whether
        // jumping NOW produces a real AI-quality, court-safe airborne contact window. If not,
        // keep staging toward the planned shoulder/takeoff corridor instead of burning the jump.
        const liveTakeoff2 = handler._secondAttackCommit && handler.isGrounded
          ? aiLiveTakeoffWindow(handler,null,42,'ANY') : null;
        if (liveTakeoff2) {
          if(typeof pushAIDebug==='function')pushAIDebug(handler,'2ND TAKEOFF: VALID',`${liveTakeoff2.style} contact +${liveTakeoff2.frame}f shoulderX=${liveTakeoff2.targetShoulderX.toFixed(0)}`);
          handler.jump();
        }

        if (aiCanActNow(handler) && !handler.isGrounded && !handler.isDiving && ball.lastHitter !== handler && !isCooldown) {
          // V76-3.4.3: a normal SECOND_TOUCH attack is not an emergency swing. It must wait for
          // an AI-quality contact and a court-safe projected trajectory instead of firing on the
          // first outer-edge Human-J rectangle (the old path produced dy≈75 DEEP outballs).
          const live2=aiPrimaryQualityContactState(handler);
          if(live2){
            const formula2=(typeof computeSpikeFormula==='function')?computeSpikeFormula(handler.stats,handler.runMomentum):null;
            const power2=formula2?.effectivePower||handler.stats?.power||26;
            const traj2=aiProjectedAttackTrajectory(handler,live2.style,{x:ball.x,y:ball.y},power2);
            if(traj2?.safe){
              if (typeof pushAIDebug === 'function') {
                pushAIDebug(handler, '2ND TOUCH: ATTACK', `${live2.style} dx=${live2.dx.toFixed(0)} dy=${live2.dy.toFixed(0)} land=${traj2.landX??'-'}`);
              }
              if (!(typeof BALANCE_DISABLE_SKILLS !== 'undefined' && BALANCE_DISABLE_SKILLS) && handler.stats.skill.id === 'sk_phantom_drop' && handler.energy >= handler.stats.skill.cost) handleUserThrust(handler);
              else handleUserAttack(handler);
            } else if(typeof pushAIDebug==='function' && gameFrame%4===0){
              pushAIDebug(handler,'2ND ATTACK: HOLD',`${live2.style} ${traj2?.reason||'UNSAFE'} -> wait better contact`);
            }
          }
        }
      }
      if (aiCanActNow(handler) && !handler._secondAttackCommit && !handler.isDiving && getDist(handler) < 64 && ball.lastHitter !== handler && !isCooldown) {
        if (recordTouch(handler)) {
          if (!(typeof BALANCE_DISABLE_SKILLS !== 'undefined' && BALANCE_DISABLE_SKILLS) && handler.stats.skill.id === 'sk_chrono_spike' && handler.energy >= handler.stats.skill.cost) {
            handler.consumeSkill('SET_TACTIC');
            timeSlowTimer = 180; chronoCasterSide = isLeft ? 'player' : 'enemy'; chronoAnimTimer = 28;
            triggerScreenShake(6, 12); playSound('clock_tick');
            setTimeout(() => { playSound('time_freeze'); }, 180);
            pushCallout(handler.x, handler.y - handler.radius * 2, 'CHRONO SPIKE!!', '#ec4899');
          }
          if (!(typeof BALANCE_DISABLE_SKILLS !== 'undefined' && BALANCE_DISABLE_SKILLS) && handler.stats.skill.id === 'sk_godspeed_toss' && handler.energy >= handler.stats.skill.cost) {
            handler.consumeSkill('SET_TACTIC');
            handler.godspeedCharges = 3;
            pushCallout(handler.x, handler.y - 45, '神速二傳 (GODSPEED)!!', '#eab308');
          }
          if (typeof pushAIDebug === 'function') pushAIDebug(handler, '2ND TOUCH: SET', `dist=${getDist(handler).toFixed(1)}`);
          executeSetterPass(handler);
        }
      }
    }
    // V76-3.4: true pre-set quick. At the setter-contact deadline, QUICK competes against
    // WAIT (future NORMAL/HIGH option value). A QUICK win commits the attacker before release;
    // the setter later executes the coordinated low/fast set if the live state is still valid.
    if (!handlerIsHuman && !spikerIsHuman && !handler._secondAttackCommit && handler.reactionTimer<=0 && spiker.reactionTimer<=0) {
      const quickEpoch=match.lastTouchFrame;
      if (spiker._quickPrecommitEpoch!==quickEpoch && spiker.isGrounded && !spiker.isDiving) {
        const quickEval=aiEvaluateQuickPrecommit(spiker,handler,isLeft);
        if(quickEval?.ready){
          spiker._quickPrecommitEpoch=quickEpoch;
          const selected=quickEval.choice?.selected?.id||'WAIT';
          const qPlan=(selected==='QUICK'&&quickEval.feasible)?{
            epoch:quickEpoch,createdFrame:gameFrame,expiresFrame:gameFrame+quickEval.setContact.frame+12,
            attackerSlot:spiker.slotKey||`slot${spiker.slotIndex}`,setterSlot:handler.slotKey||`slot${handler.slotIndex}`,
            flightFrames:quickEval.flightFrames,predictedSetContactFrame:quickEval.setContact.frame,
            predictedSetX:quickEval.setContact.x,predictedSetY:quickEval.setContact.y,
            targetX:quickEval.targetX,targetY:quickEval.targetY,choice:quickEval.choice,context:quickEval.ctx
          }:null;
          spiker._quickPrecommitPlan=qPlan;
          handler._aiQuickSetPlan=qPlan;
          emitAIIntent(spiker,'ATTACK_TEMPO_PRECOMMIT',{
            stage:'PRESET_DEADLINE',capability:aiCapabilitySnapshot(spiker),personality:aiPersonalityId(spiker),
            context:{setterSlot:handler.slotKey||null,setContactIn:quickEval.setContact.frame,flightFrames:quickEval.flightFrames,
              targetX:Number.isFinite(quickEval.targetX)?+quickEval.targetX.toFixed(1):null,targetY:Number.isFinite(quickEval.targetY)?+quickEval.targetY.toFixed(1):null,
              requiredVx:Number.isFinite(quickEval.requiredVx)?+quickEval.requiredVx.toFixed(2):null,requiredVy:Number.isFinite(quickEval.requiredVy)?+quickEval.requiredVy.toFixed(2):null,
              contactProbability:+Number(quickEval.ctx?.contactProbability||0).toFixed(3),normalContactProbability:+Number(quickEval.ctx?.normalContactProbability||0).toFixed(3),highContactProbability:+Number(quickEval.ctx?.highContactProbability||0).toFixed(3),attackValue:+Number(quickEval.ctx?.attackValue||0).toFixed(3),
              quickNet:+Number(quickEval.ctx?.quickNet||0).toFixed(3),quickExpectedNet:+Number(quickEval.ctx?.quickExpectedNet||0).toFixed(3),futureBestNet:+Number(quickEval.ctx?.futureBestNet||0).toFixed(3),futureExpectedNet:+Number(quickEval.ctx?.futureExpectedNet||0).toFixed(3),optionFlex:+Number(quickEval.ctx?.optionFlex||0).toFixed(3),tempoAdvance:+Number(quickEval.ctx?.tempoAdvance||0).toFixed(3),transitionTimingGain:+Number(quickEval.ctx?.transitionTimingGain||0).toFixed(3),
              quickDefensePressure:+Number(quickEval.ctx?.quickDefensePressure||0).toFixed(3),quickBlockPressure:+Number(quickEval.ctx?.quickBlockPressure||0).toFixed(3),quickFloorPressure:+Number(quickEval.ctx?.quickFloorPressure||0).toFixed(3),
              normalDefensePressure:+Number(quickEval.ctx?.normalDefensePressure||0).toFixed(3),highDefensePressure:+Number(quickEval.ctx?.highDefensePressure||0).toFixed(3),defenseTimingGain:+Number(quickEval.ctx?.defenseTimingGain||0).toFixed(3),
              blockReadinessGain:+Number(quickEval.ctx?.blockReadinessGain||0).toFixed(3),floorCoverageGain:+Number(quickEval.ctx?.floorCoverageGain||0).toFixed(3),defensiveReadinessGain:+Number(quickEval.ctx?.defensiveReadinessGain||0).toFixed(3),requiredReadinessGain:+Number(quickEval.ctx?.requiredReadinessGain||0).toFixed(3),
              predictionRisk:+Number(quickEval.ctx?.predictionRisk||0).toFixed(3),missRisk:+Number(quickEval.ctx?.missRisk||0).toFixed(3),commitmentCost:+Number(quickEval.ctx?.commitmentCost||0).toFixed(3),telegraphCost:+Number(quickEval.ctx?.telegraphCost||0).toFixed(3),
              waitBase:+Number(quickEval.ctx?.waitBase||0).toFixed(3),feedFlexibility:+Number(quickEval.ctx?.feedFlexibility||0).toFixed(3),feasibleCells:Number(quickEval.ctx?.feasibleCells)||0,feasibleFlightCount:Number(quickEval.ctx?.feasibleFlightCount)||0},
            options:(quickEval.choice?.options||[]).map(o=>({id:o.id,feasible:o.feasible,utility:+o.utility.toFixed(3),finalUtility:+o.finalUtility.toFixed(3),reason:o.reason})),
            selected,selectedFeasible:!!quickEval.choice?.selected?.feasible,reason:selected==='QUICK'?'QUICK_DENIES_DEFENSIVE_READINESS':'WAIT_DEFENSE_ALREADY_READY_OR_GAIN_TOO_SMALL'
          });
          if(qPlan){
            spiker.facing=isLeft?1:-1;
            spiker.jump();
            emitAIIntent(spiker,'ATTACK_EXECUTION',{stage:'PRESET_QUICK_TAKEOFF',capability:aiCapabilitySnapshot(spiker),personality:aiPersonalityId(spiker),
              context:{tempo:'QUICK',setterSlot:handler.slotKey||null,setContactIn:quickEval.setContact.frame,flightFrames:quickEval.flightFrames,runMomentum:+Number(spiker.runMomentum||0).toFixed(1),runMomentumDir:Number(spiker.runMomentumDir)||0},
              options:[{id:'JUMP',feasible:true,utility:1,finalUtility:1,reason:'QUICK_PRECOMMIT_SELECTED'}],selected:'JUMP',selectedFeasible:true,reason:'PRESET_QUICK_COMMIT_TAKEOFF'});
            if(typeof pushAIDebug==='function')pushAIDebug(spiker,'QUICK PRECOMMIT','QUICK beat WAIT -> jump before set release');
          }
        }
      }
    }

    if (!spikerIsHuman && spiker.reactionTimer <= 0 && !spiker._quickPrecommitPlan) {
      // V6：第三觸準備。不要固定站死在底線/網前；依第二觸者「現有力量能送到哪裡」準備。
      // 這不是新軌跡預測：只重用二傳目標、handler 位置與既有 power。
      const idealAttackX = isLeft ? (WORLD.NET_X - 120) : (WORLD.NET_X + 120);
      const handlerPower = handler.stats.power || 18.5;
      const expectedSetTravel = Math.max(250, Math.min(410, 250 + Math.max(0, handlerPower - 18.5) * 10.0));
      const desiredDelta = idealAttackX - handler.x;
      const reachableDelta = Math.max(-expectedSetTravel, Math.min(expectedSetTravel, desiredDelta));
      const expectedSetX = handler.x + reachableDelta;
      const attackPrepareX = expectedSetX + (isLeft ? -35 : 35);
      const minAttackX = isLeft ? WORLD.LEFT + 90 : WORLD.NET_X + 75;
      const maxAttackX = isLeft ? WORLD.NET_X - 75 : WORLD.RIGHT - 90;
      moveTowards(spiker, Math.max(minAttackX, Math.min(maxAttackX, attackPrepareX)), spiker.effectiveSpeed);
    }
  } 
  else if (teamHits === 2 && aiOwnSecondAttackReleased(isLeft, teamHits)) {
    // V75-3.18: a real second-touch J/L attack already released toward the opponent.
    // Do NOT create a phantom third-touch attack plan. Preserve tactical body language as
    // ATTACK_TRANSITION / cover-ready movement; if the opponent blocks it back, COVER_CHASE
    // will take over on the opponent's touch.
    const attacker=ball.lastHitter;
    const supporter=(attacker===pA)?pB:pA;
    const side=isLeft?'LEFT':'RIGHT';
    if(typeof setAITeamIntent==='function')setAITeamIntent(side,'ATTACK_TRANSITION',attacker,supporter,ball.x,'SECOND_ATTACK_RELEASE',teamHits,'COVER_READY_NO_TOUCH');
    if(attacker && attacker._thirdLifecycleReleaseTouch!==match.lastTouchFrame){
      attacker._thirdLifecycleReleaseTouch=match.lastTouchFrame;
      emitAIIntent(attacker,'THIRD_TOUCH_LIFECYCLE',{
        stage:'SUPPRESS',capability:aiCapabilitySnapshot(attacker),personality:aiPersonalityId(attacker),
        context:{reason:'SECOND_ATTACK_ALREADY_RELEASED',touchFrame:match.lastTouchFrame,ballX:+ball.x.toFixed(1),ballY:+ball.y.toFixed(1),ballVx:+ball.vx.toFixed(2),ballVy:+ball.vy.toFixed(2),attackStyle:ball.attackStyle||null},
        options:[{id:'ATTACK_TRANSITION',feasible:true,utility:1,finalUtility:1,reason:'NO_THIRD_TOUCH_POSSESSION'}],
        selected:'ATTACK_TRANSITION',selectedFeasible:true,reason:'SECOND_ATTACK_CLOSES_THIRD_TOUCH_GATE'
      });
      if(typeof pushAIBrainTrace==='function')pushAIBrainTrace(side,'3RD TOUCH SUPPRESSED',`2ND attack by ${attacker.name||attacker.slotKey||'?'} already released`);
    }
    const minX=isLeft?WORLD.LEFT+90:WORLD.NET_X+90;
    const maxX=isLeft?WORLD.NET_X-90:WORLD.RIGHT-90;
    const coverX=Math.max(minX,Math.min(maxX,(attacker?.x??ball.x)+(isLeft?-115:115)));
    if(supporter && !isSlotHumanControlled(supporter) && supporter.reactionTimer<=0 && supporter.isGrounded)
      moveTowards(supporter,coverX,supporter.effectiveSpeed*0.78);
    const recoverX=isLeft?WORLD.NET_X-185:WORLD.NET_X+185;
    if(attacker && !isSlotHumanControlled(attacker) && attacker.reactionTimer<=0 && attacker.isGrounded)
      moveTowards(attacker,recoverX,attacker.effectiveSpeed*0.52);
    return;
  }
  else if (teamHits === 2 && aiThirdTouchReleasedAcrossNet(isLeft, teamHits)) {
    // V75-3.21: a legal second-touch set can itself cross the net before the attacker contacts it.
    // Once the ball has crossed the plane and is travelling away, the side no longer owns a third-touch
    // contact opportunity. Close any waiting third-touch plan explicitly instead of leaving NO_TERMINAL.
    const sideKey=isLeft?'LEFT':'RIGHT';
    let cancelled=false;
    for(const p of [pA,pB]) cancelled=aiCancelThirdTouchPlan(p,'CANCELLED_BY_SECOND_TOUCH_OVERPASS',{ballX:+ball.x.toFixed(1),ballY:+ball.y.toFixed(1),ballVx:+ball.vx.toFixed(2),ballVy:+ball.vy.toFixed(2)})||cancelled;
    runTeamBrain._thirdOverpassSuppressKey=runTeamBrain._thirdOverpassSuppressKey||{LEFT:null,RIGHT:null};
    const key=`${match.lastTouchFrame}:${ball.lastHitter?.slotKey||'none'}`;
    if(runTeamBrain._thirdOverpassSuppressKey[sideKey]!==key){
      runTeamBrain._thirdOverpassSuppressKey[sideKey]=key;
      const observer=(ball.lastHitter===pA)?pB:pA;
      emitAIIntent(observer,'THIRD_TOUCH_LIFECYCLE',{
        stage:'SUPPRESS',capability:aiCapabilitySnapshot(observer),personality:aiPersonalityId(observer),
        context:{reason:'SECOND_TOUCH_OVERPASS_RELEASED',touchFrame:match.lastTouchFrame,teamHits,ballX:+ball.x.toFixed(1),ballY:+ball.y.toFixed(1),ballVx:+ball.vx.toFixed(2)},
        options:[{id:'NO_THIRD_TOUCH',feasible:true,utility:1,finalUtility:1,reason:'BALL_ALREADY_CROSSED_NET'}],
        selected:'NO_THIRD_TOUCH',selectedFeasible:true,reason:'SECOND_TOUCH_OVERPASS_RELEASED'
      });
      if(typeof pushAIBrainTrace==='function')pushAIBrainTrace(sideKey,'3RD TOUCH SUPPRESSED',`2ND touch overpass released${cancelled?' / plan cancelled':''}`);
    }
    return;
  }
  else if (teamHits === 2 && aiOwnThirdTouchPossession(isLeft, teamHits)) {
    const sideKey=isLeft?'LEFT':'RIGHT';
    const spiker = aiLegalNextTeamToucher(pA,pB,isLeft,teamHits);
    if(!spiker) return;
    const supporter = (spiker === pA) ? pB : pA;
    if (typeof setAITeamIntent === 'function') setAITeamIntent(sideKey, 'THIRD_TOUCH', spiker, supporter, ball.x, 'TEAM_HIT_2', teamHits, 'COVER_SUPPORT');
    const spikerIsHuman = isSlotHumanControlled(spiker);
    const supporterIsHuman = isSlotHumanControlled(supporter);

    if (!supporterIsHuman && supporter.reactionTimer <= 0) {
      moveTowards(supporter, spiker.x + (isLeft ? 30 : -30), supporter.effectiveSpeed);
    }

    if (!spikerIsHuman && spiker.reactionTimer <= 0) {
      const cap3 = aiCapabilitySnapshot(spiker);
      const distToNet = Math.abs(spiker.x - WORLD.NET_X);
      const isNearNet = distToNet < 280;
      const isCommitRange = distToNet < 360;

      // V76-1: COMMIT happens while grounded. The plan owns the intended contact style,
      // target shoulder position and jump timing before takeoff. No ball launch happens here.
      let activeThirdPlan=(spiker._thirdAttackPlan && spiker._thirdAttackPlan.touchKey===match.lastTouchFrame)?spiker._thirdAttackPlan:null;
      const framesObserved=Math.max(0,gameFrame-match.lastTouchFrame);
      const baseObserveFrames=aiThirdBaseObserveFrames(spiker);
      const observationReady=framesObserved>=baseObserveFrames;

      // V76-3.2: a high/slow/low-gravity set is not a failed attack just because the normal
      // near-term solver cannot see its contact yet. Track the future physical attack band first.
      let longTrack=(spiker._thirdAttackTrack && spiker._thirdAttackTrack.touchKey===match.lastTouchFrame)?spiker._thirdAttackTrack:null;
      const trackRefresh=Math.max(2,Math.round(8-aiNorm(cap3.int)*4));
      if(spiker.isGrounded && !activeThirdPlan && observationReady && (!longTrack || gameFrame-(longTrack.updatedFrame||0)>=trackRefresh)){
        const read=aiThirdLongTrack(spiker,240);
        if(read){
          const priorPhase=longTrack?.phase||null;
          longTrack={...read,touchKey:match.lastTouchFrame,updatedFrame:gameFrame,createdFrame:longTrack?.createdFrame||gameFrame};
          spiker._thirdAttackTrack=longTrack;
          if(priorPhase!==read.phase || gameFrame===longTrack.createdFrame){
            emitAIIntent(spiker,'ATTACK_TRACK',{stage:read.phase,capability:cap3,personality:aiPersonalityId(spiker),context:{targetFrame:read.frame,stagingX:+read.stagingX.toFixed(1),spatialGap:+read.spatialGap.toFixed(1),runETA:+read.runETA.toFixed(1),arrivalSlack:+read.arrivalSlack.toFixed(1),uncertaintyPx:read.uncertaintyPx,confidence:+read.confidence.toFixed(3),predictedBallY:+read.y.toFixed(1),predictedBallVy:+read.vy.toFixed(2),predictedGravity:+read.predictedGravity.toFixed(4)},options:[{id:read.phase,feasible:true,utility:1,finalUtility:1,reason:read.phase==='TRACK'?'FUTURE_ATTACK_BAND_TRACKED':'APPROACH_DISTANCE_NOW_RELEVANT'}],selected:read.phase,selectedFeasible:true,reason:`LONG_HORIZON_${read.phase}`});
          }
        }else{ spiker._thirdAttackTrack=null; longTrack=null; }
      }

      // TRACK never chooses attack style. STAGE may move toward the coarse future contact area.
      // Exact POWER/DEEP/STEEP commit stays with the existing near-term physical solver.
      if(spiker.isGrounded && !activeThirdPlan && longTrack && longTrack.phase==='STAGE' && Number.isFinite(longTrack.stagingX)){
        moveTowards(spiker,longTrack.stagingX,spiker.effectiveSpeed);
      }

      const nearTermAllowed=!longTrack || longTrack.commitReady;
      if(spiker.isGrounded && isCommitRange && !activeThirdPlan && observationReady && nearTermAllowed){
        const plan=aiChooseThirdAttackPlan(spiker,distToNet,{preJump:true});
        // A grounded COMMIT is only a real primary POWER/DEEP/STEEP window. If no legal
        // airborne primary exists yet, keep observing instead of manufacturing a grounded
        // HARD_J/TIP recovery plan that cannot execute before takeoff.
        if(['POWER','STEEP','DEEP'].includes(plan.intent)){
          spiker._thirdAttackPlan=plan;activeThirdPlan=plan;spiker._thirdAttackTrack=null;longTrack=null;
          const attackIntentId=`${match.lastTouchFrame}:${spiker.slotKey}:${gameFrame}`;
          plan.attackIntentId=attackIntentId;plan.ownerSlot=spiker.slotKey||`slot${spiker.slotIndex}`;
          emitAIIntent(spiker,'THIRD_TOUCH',{
          attackIntentId,stage:'COMMIT_GROUND',capability:plan.cap,personality:aiPersonalityId(spiker),
          context:{distToNet:+distToNet.toFixed(1),preJumpCommit:true,tempo:plan.tempo,observeFrames:plan.observeFrames,framesObserved,blockerSlot:plan.blockerSlot,blockerReady:!!plan.ctx.blockerReady,deepToolGeometry:!!plan.ctx.deepToolGeometry,steepOverHands:!!plan.ctx.steepOverHands,blockerOffNet:!!plan.ctx.blockerOffNet,penetrationMargin:+Number(plan.ctx.penetrationMargin||0).toFixed(2),targetFrame:plan.target?.frame??null,jumpDelay:plan.target?.jumpDelay??null,jumpFrame:plan.target?.jumpFrame??null,targetShoulderX:Number.isFinite(plan.target?.targetShoulderX)?+plan.target.targetShoulderX.toFixed(1):null,targetAngle:Number.isFinite(plan.target?.angle)?+plan.target.angle.toFixed(3):null,targetNetY:plan.target?.trajectory?.netY??null,targetLandX:plan.target?.trajectory?.landX??null,estimatedTakeoffMomentum:plan.target?.estimatedTakeoffMomentum??null,rejectedWindows:plan.windows?.rejected||null},
          options:plan.choice.options.map(o=>({id:o.id,feasible:o.feasible,utility:+o.utility.toFixed(3),finalUtility:+o.finalUtility.toFixed(3),reason:o.reason})),
          selected:plan.intent,selectedFeasible:!!plan.choice.selected?.feasible,reason:`COMMIT_${plan.intent}_BEFORE_JUMP`
        });
        emitAIIntent(spiker,'ATTACK_COMMIT',{attackIntentId,stage:'GROUND_COMMIT',capability:plan.cap,personality:aiPersonalityId(spiker),context:{intent:plan.intent,tempo:plan.tempo,tempoOptions:plan.tempoChoice?.options?.map(o=>({id:o.id,feasible:o.feasible,utility:+o.utility.toFixed(3)}))||null,observeFrames:plan.observeFrames,targetFrame:plan.target?.frame??null,jumpDelay:plan.target?.jumpDelay??null,targetShoulderX:Number.isFinite(plan.target?.targetShoulderX)?+plan.target.targetShoulderX.toFixed(1):null},options:plan.choice.options.map(o=>({id:o.id,feasible:o.feasible,utility:+o.utility.toFixed(3),finalUtility:+o.finalUtility.toFixed(3),reason:o.reason})),selected:plan.intent,selectedFeasible:!!plan.choice.selected?.feasible,reason:'PRE_JUMP_COMMIT'});
          if(typeof pushAIDebug==='function')pushAIDebug(spiker,`ATTACK COMMIT: ${plan.intent}`,`${plan.tempo} / observe ${plan.observeFrames}f / jump +${plan.target?.jumpDelay??'-'}f / contact +${plan.target?.frame??'-'}f`);
        }
      }

      // V76-2: off-system / long rescue third balls may never enter the near-net primary
      // commit range. They still need a legal volleyball action. If no primary plan exists,
      // build a grounded SAFE_J recovery plan from the live ball instead of staring at it.
      const ballDyingSoon=ball.vy>4 && ball.y>WORLD.NET_TOP_Y-60;
      const offSystemGroundRescue=(!longTrack && !isCommitRange) || (!longTrack && ballDyingSoon);
      if(spiker.isGrounded && !activeThirdPlan && offSystemGroundRescue && ball.lastHitter!==spiker && !isCooldown){
        aiOrientGroundAttackTowardBall(spiker);
        const recovery=aiEvaluateThirdRecovery(spiker,null,64);
        if(recovery.safeJWindow){
          const attackIntentId=`${match.lastTouchFrame}:${spiker.slotKey}:${gameFrame}`;
          const recoveryPlan={intent:'SAFE_J',originalIntent:null,recoveryMode:true,target:recovery.safeJWindow,windows:{},choice:recovery.choice,ctx:{safeJFrame:recovery.safeJWindow.frame},cap:cap3,blockerSlot:null,createdFrame:gameFrame,touchKey:match.lastTouchFrame,attackIntentId,ownerSlot:spiker.slotKey||`slot${spiker.slotIndex}`,expireFrame:gameFrame+recovery.safeJWindow.frame+8};
          spiker._thirdAttackPlan=recoveryPlan;activeThirdPlan=recoveryPlan;
          emitAIIntent(spiker,'THIRD_TOUCH_RECOVERY',{attackIntentId,stage:'GROUND_RESCUE_PLAN',capability:cap3,personality:aiPersonalityId(spiker),context:{grounded:true,distToNet:+distToNet.toFixed(1),futureSafeJFrame:recovery.safeJWindow.frame,targetShoulderX:+recovery.safeJWindow.targetShoulderX.toFixed(1),facing:aiAttackLiveFacing(spiker)},options:recovery.choice.options.map(o=>({id:o.id,feasible:o.feasible,utility:+o.utility.toFixed(3),finalUtility:+o.finalUtility.toFixed(3),reason:o.reason})),selected:'SAFE_J',selectedFeasible:true,reason:'OFF_SYSTEM_GROUNDED_SAFE_J'});
        }
      }

      // Once committed, ground approach tracks the committed shoulder position. Airborne steering
      // remains the limited V75-3.14 Execution rule; primary intent is not globally re-optimized.
      const desiredTrackX=(activeThirdPlan?.target && Number.isFinite(activeThirdPlan.target.targetShoulderX))
        ? activeThirdPlan.target.targetShoulderX
        : ((activeThirdPlan?.target && Number.isFinite(activeThirdPlan.target.dx))?(ball.x-(isLeft?1:-1)*activeThirdPlan.target.dx)
          : ((longTrack&&Number.isFinite(longTrack.stagingX))?longTrack.stagingX:ball.x));
      steerAIThirdAttackWindow(spiker,desiredTrackX,spiker.effectiveSpeed);

      let preTakeoffRejected=false;
      if(spiker.isGrounded && !activeThirdPlan && !preTakeoffRejected && (!longTrack || longTrack.commitReady)){
        // V76-3: no blind "ball looks hittable -> jump" safety. If the formal planner missed a
        // close/reactive set, a live takeoff still needs a real quality contact window first.
        const jumpStrength3=Math.abs(Number(spiker.stats.jump)||12.8);
        const attackReadTop=205+jumpStrength3*2.6;
        const attackTrackX=48+cap3.speed*3.2+cap3.reach*0.08;
        const sweetSpot=(ball.y>WORLD.NET_TOP_Y-attackReadTop&&ball.y<WORLD.NET_TOP_Y-20&&ball.vy>0);
        if(isNearNet&&sweetSpot&&Math.abs(spiker.x-ball.x)<attackTrackX){
          const reactive=aiLiveTakeoffWindow(spiker,null,36,'NORMAL');
          if(reactive){
            const attackIntentId=`${match.lastTouchFrame}:${spiker.slotKey}:${gameFrame}`;
            const reactivePlan={intent:reactive.style,originalIntent:reactive.style,recoveryMode:false,target:{...reactive,frame:reactive.frame,jumpDelay:0,jumpFrame:gameFrame},windows:{},choice:{options:[{id:reactive.style,feasible:true,utility:1,finalUtility:1,reason:'LIVE_REACTIVE_WINDOW'}],selected:{id:reactive.style,feasible:true}},ctx:{},cap:cap3,blockerSlot:null,createdFrame:gameFrame,touchKey:match.lastTouchFrame,preJumpCommit:true,tempo:'NORMAL',observeFrames:baseObserveFrames,jumpDelay:0,jumpFrame:gameFrame,expireFrame:gameFrame+reactive.frame+8,attackIntentId,ownerSlot:spiker.slotKey||`slot${spiker.slotIndex}`};
            spiker._thirdAttackPlan=reactivePlan;activeThirdPlan=reactivePlan;
            emitAIIntent(spiker,'ATTACK_COMMIT',{attackIntentId,stage:'REACTIVE_GROUND_COMMIT',capability:cap3,personality:aiPersonalityId(spiker),context:{intent:reactive.style,tempo:'NORMAL',jumpDelay:0,targetFrame:reactive.frame,targetShoulderX:+reactive.targetShoulderX.toFixed(1),liveDx:+reactive.dx.toFixed(1),liveDy:+reactive.dy.toFixed(1),liveShoulderDist:+reactive.shoulderDist.toFixed(1)},options:[{id:reactive.style,feasible:true,utility:1,finalUtility:1,reason:'LIVE_REACTIVE_WINDOW'}],selected:reactive.style,selectedFeasible:true,reason:'LIVE_REACTIVE_TAKEOFF'});
            emitAIIntent(spiker,'ATTACK_EXECUTION',{attackIntentId,stage:'TAKEOFF',capability:cap3,personality:aiPersonalityId(spiker),context:{intent:reactive.style,jumpDue:gameFrame,actualFrame:gameFrame,xError:+Math.abs(spiker.x-reactive.targetShoulderX).toFixed(1),liveContactIn:reactive.frame,liveDx:+reactive.dx.toFixed(1),liveDy:+reactive.dy.toFixed(1),liveShoulderDist:+reactive.shoulderDist.toFixed(1),reactive:true,runMomentum:+Number(spiker.runMomentum||0).toFixed(1),runMomentumDir:Number(spiker.runMomentumDir)||0},options:[{id:'JUMP',feasible:true,utility:1,finalUtility:1,reason:'LIVE_REACTIVE_TAKEOFF_VALID'}],selected:'JUMP',selectedFeasible:true,reason:'REACTIVE_TAKEOFF'});
            spiker.jump();
          }
        }
      }

      if(spiker.isGrounded && activeThirdPlan && ['POWER','STEEP','DEEP'].includes(activeThirdPlan.intent)){
        const jumpDue=Number.isFinite(activeThirdPlan.jumpFrame)?activeThirdPlan.jumpFrame:(activeThirdPlan.createdFrame+(activeThirdPlan.target?.jumpDelay||0));
        const xReady=!Number.isFinite(activeThirdPlan.target?.targetShoulderX)||Math.abs(spiker.x-activeThirdPlan.target.targetShoulderX)<=Math.max(18,cap3.speed*1.6);
        if(gameFrame>=jumpDue && xReady){
          const liveTakeoff=aiLiveTakeoffWindow(spiker,activeThirdPlan.originalIntent||activeThirdPlan.intent,42,activeThirdPlan.tempo||'NORMAL');
          if(!liveTakeoff){
            preTakeoffRejected=true;
            emitAIIntent(spiker,'ATTACK_EXECUTION',{attackIntentId:activeThirdPlan.attackIntentId,stage:'PRE_TAKEOFF_REPLAN',capability:cap3,personality:aiPersonalityId(spiker),context:{intent:activeThirdPlan.originalIntent||activeThirdPlan.intent,jumpDue,actualFrame:gameFrame,xError:Number.isFinite(activeThirdPlan.target?.targetShoulderX)?+Math.abs(spiker.x-activeThirdPlan.target.targetShoulderX).toFixed(1):null,reason:'LIVE_QUALITY_WINDOW_GONE'},options:[{id:'REPLAN',feasible:true,utility:1,finalUtility:1,reason:'LIVE_SET_NO_LONGER_SUPPORTS_COMMITTED_TAKEOFF'}],selected:'REPLAN',selectedFeasible:true,reason:'PRE_TAKEOFF_VALIDATION_FAILED'});
            if(typeof pushAIDebug==='function')pushAIDebug(spiker,'ATTACK REPLAN','takeoff cancelled: live quality window gone');
            spiker._thirdAttackPlan=null;activeThirdPlan=null;
          }else{
            // Refresh the contact target from the live read. The tactical intent stays committed;
            // only execution timing/shoulder position is corrected before leaving the floor.
            activeThirdPlan.target={...activeThirdPlan.target,...liveTakeoff,frame:(gameFrame-activeThirdPlan.createdFrame)+liveTakeoff.frame};
            activeThirdPlan.jumpFrame=gameFrame;
            emitAIIntent(spiker,'ATTACK_EXECUTION',{attackIntentId:activeThirdPlan.attackIntentId,stage:'TAKEOFF',capability:cap3,personality:aiPersonalityId(spiker),context:{intent:activeThirdPlan.originalIntent||activeThirdPlan.intent,jumpDue,actualFrame:gameFrame,xError:Number.isFinite(activeThirdPlan.target?.targetShoulderX)?+Math.abs(spiker.x-activeThirdPlan.target.targetShoulderX).toFixed(1):null,liveContactIn:liveTakeoff.frame,liveDx:+liveTakeoff.dx.toFixed(1),liveDy:+liveTakeoff.dy.toFixed(1),liveShoulderDist:+liveTakeoff.shoulderDist.toFixed(1),runMomentum:+Number(spiker.runMomentum||0).toFixed(1),runMomentumDir:Number(spiker.runMomentumDir)||0},options:[{id:'JUMP',feasible:true,utility:1,finalUtility:1,reason:'LIVE_COMMITTED_TAKEOFF_VALID'}],selected:'JUMP',selectedFeasible:true,reason:'COMMITTED_TAKEOFF_REVALIDATED'});
            spiker.jump();
          }
        }
      }

      // Safety only: if an old/external state reaches the air without a grounded commit, create a
      // late plan so the rally still functions. Normal V76-1 flow should be COMMIT_GROUND first.
      if (!spiker.isGrounded) spiker.facing = isLeft ? 1 : -1;
      if (!spiker.isGrounded && isNearNet && (!spiker._thirdAttackPlan || spiker._thirdAttackPlan.touchKey !== match.lastTouchFrame)) {
        const presetQuick=!!(ball._aiQuickTempo==='PRECOMMIT' && spiker._quickPrecommitPlan && spiker._quickPrecommitPlan.attackerSlot===(spiker.slotKey||`slot${spiker.slotIndex}`));
        const quickTempoInfo=presetQuick?{tempo:'QUICK',choice:spiker._quickPrecommitPlan.choice||null,observeFrames:0,framesObserved:Math.max(0,gameFrame-match.lastTouchFrame)}:null;
        const plan=aiChooseThirdAttackPlan(spiker,distToNet,presetQuick?{tempoInfo:quickTempoInfo}:{});spiker._thirdAttackPlan=plan;
        const attackIntentId=`${match.lastTouchFrame}:${spiker.slotKey}:${gameFrame}`;plan.attackIntentId=attackIntentId;plan.ownerSlot=spiker.slotKey||`slot${spiker.slotIndex}`;plan.preSetQuick=presetQuick;
        emitAIIntent(spiker,'THIRD_TOUCH',{attackIntentId,stage:presetQuick?'PRESET_QUICK_STYLE_LOCK':'LATE_AIR_SAFETY',capability:plan.cap,personality:aiPersonalityId(spiker),context:{distToNet:+distToNet.toFixed(1),preJumpCommit:presetQuick,tempo:plan.tempo,blockerSlot:plan.blockerSlot,blockerReady:!!plan.ctx.blockerReady,deepToolGeometry:!!plan.ctx.deepToolGeometry,steepOverHands:!!plan.ctx.steepOverHands,blockerOffNet:!!plan.ctx.blockerOffNet,penetrationMargin:+Number(plan.ctx.penetrationMargin||0).toFixed(2),targetFrame:plan.target?.frame??null,targetAngle:Number.isFinite(plan.target?.angle)?+plan.target.angle.toFixed(3):null,targetNetY:plan.target?.trajectory?.netY??null,rejectedWindows:plan.windows?.rejected||null},options:plan.choice.options.map(o=>({id:o.id,feasible:o.feasible,utility:+o.utility.toFixed(3),finalUtility:+o.finalUtility.toFixed(3),reason:o.reason})),selected:plan.intent,selectedFeasible:!!plan.choice.selected?.feasible,reason:presetQuick?`PRESET_QUICK_STYLE_${plan.intent}`:`LATE_AIR_SAFETY_${plan.intent}`});
        if(presetQuick){
          emitAIIntent(spiker,'ATTACK_COMMIT',{attackIntentId,stage:'PRESET_QUICK_STYLE_COMMIT',capability:plan.cap,personality:aiPersonalityId(spiker),context:{intent:plan.intent,tempo:'QUICK',preSetQuick:true,targetFrame:plan.target?.frame??null,targetAngle:Number.isFinite(plan.target?.angle)?+plan.target.angle.toFixed(3):null},options:plan.choice.options.map(o=>({id:o.id,feasible:o.feasible,utility:+o.utility.toFixed(3),finalUtility:+o.finalUtility.toFixed(3),reason:o.reason})),selected:plan.intent,selectedFeasible:!!plan.choice.selected?.feasible,reason:'PRESET_QUICK_RELEASED_INTO_AIRBORNE_CONTACT'});
          spiker._quickPrecommitPlan=null;
        }
      }

      const plan = spiker._thirdAttackPlan;
      let primaryIntent=!!(plan&&['POWER','STEEP','DEEP'].includes(plan.intent)&&!plan.recoveryMode);
      const currentContact = primaryIntent ? aiPrimaryQualityContactState(spiker) : aiEmergencyJContactState(spiker);
      let fallbackExecuted=false;
      let recoveryEval=null;

      // V75-3.17 PRIMARY COMMIT -> RECOVERY HANDOFF.
      // Keep the committed POWER/STEEP/DEEP while its real Human-J geometry is still legal.
      // Once the planned contact time arrives and that exact plan is invalid, open a peer
      // Utility competition between TIP / HARD_J / SAFE_J. No fixed TIP > J priority.
      if(!spiker.isGrounded && !spiker.isDiving && plan && primaryIntent && ball.lastHitter!==spiker && !isCooldown){
        const currentFormula=(typeof computeSpikeFormula==='function')?computeSpikeFormula(spiker.stats,spiker.runMomentum):null;
        const currentPower=currentFormula?.effectivePower||spiker.stats?.power||26;
        const currentTrajectory=currentContact?aiProjectedAttackTrajectory(spiker,currentContact.style,{x:ball.x,y:ball.y},currentPower):null;
        const plannedMatch=!!(currentContact&&currentContact.style===plan.intent&&currentTrajectory?.safe);
        const committedTargetFrame=plan.target?.frame??0;
        const targetDueFrame=plan.createdFrame+committedTargetFrame;
        const contactWindowOpen=gameFrame>=targetDueFrame-1;
        if(plannedMatch&&contactWindowOpen){
          const actualStyle=currentContact.style;
          const attackIntentId=plan.attackIntentId||`${match.lastTouchFrame}:${spiker.slotKey}:${gameFrame}`;
          ball._aiAttackIntentId=attackIntentId;ball._aiAttackIntentFrame=gameFrame;
          ball._aiAttackIntentStyle=actualStyle;ball._aiAttackSourceSlot=spiker.slotKey;ball._aiAttackPlannedStyle=plan.intent;
          emitAIIntent(spiker,'ATTACK_EXECUTION',{attackIntentId,stage:'CONTACT_ATTEMPT',capability:aiCapabilitySnapshot(spiker),personality:aiPersonalityId(spiker),context:{intent:plan.intent,actualStyle,currentAngle:+currentContact.angle.toFixed(3),targetDueFrame,actualFrame:gameFrame,frameError:gameFrame-targetDueFrame,runMomentum:+Number(spiker.runMomentum||0).toFixed(1),runMomentumDir:Number(spiker.runMomentumDir)||0,trajectorySafe:true},options:[{id:plan.intent,feasible:true,utility:1,finalUtility:1,reason:'COMMITTED_WINDOW_VALID'}],selected:plan.intent,selectedFeasible:true,reason:'EXECUTE_COMMITTED_CONTACT'});
          handleUserAttack(spiker);
          spiker._thirdAttackPlan=null;ball.isFloat=false;
          fallbackExecuted=true;
        }else{
          if(gameFrame>=targetDueFrame){
            const failureReason=aiPrimaryFailureReason(plan,currentContact,currentTrajectory);
            plan.originalIntent=plan.originalIntent||plan.intent;
            plan.recoveryMode=true;
            plan.primaryFailureReason=failureReason;
            plan.primaryFailureFrame=gameFrame;
            recoveryEval=aiEvaluateThirdRecovery(spiker,plan,48);
            const selected=recoveryEval.choice.selected?.id||'FALLBACK_WAIT';
            plan.intent=selected;
            plan.target=selected==='SAFE_J'?recoveryEval.safeJWindow:null;
            plan.expireFrame=Math.max(plan.expireFrame,gameFrame+Math.max(8,(recoveryEval.safeJWindow?.frame||0)+6));
            emitAIIntent(spiker,'THIRD_TOUCH_RECOVERY',{
              attackIntentId:plan.attackIntentId,stage:'PRIMARY_INVALID',capability:aiCapabilitySnapshot(spiker),personality:aiPersonalityId(spiker),
              context:{fromIntent:plan.originalIntent,failureReason,targetDueFrame,targetFrame:committedTargetFrame,currentStyle:currentContact?.style??null,currentAngle:currentContact?+currentContact.angle.toFixed(3):null,trajectorySafe:!!currentTrajectory?.safe,trajectoryReason:currentTrajectory?.reason||null,tipSkillReady:recoveryEval.tipSkillReady,spikeSkillReady:recoveryEval.spikeSkillReady},
              options:recoveryEval.choice.options.map(o=>({id:o.id,feasible:o.feasible,utility:+o.utility.toFixed(3),finalUtility:+o.finalUtility.toFixed(3),reason:o.reason})),
              selected,selectedFeasible:!!recoveryEval.choice.selected?.feasible,reason:`PRIMARY_${plan.originalIntent}_INVALID_TO_${selected}`
            });
            if(typeof pushAIDebug==='function')pushAIDebug(spiker,'3RD PRIMARY INVALID',`${plan.originalIntent}: ${failureReason} -> ${selected}`);
            primaryIntent=false;
          }
        }
      }

      // Recovery is re-evaluated from the LIVE state. TIP / HARD_J / SAFE_J are peers;
      // Skill readiness and context change Utility, never physical feasibility.
      if(!fallbackExecuted && !spiker.isGrounded && !spiker.isDiving && plan && !primaryIntent && ball.lastHitter!==spiker && !isCooldown){
        recoveryEval=recoveryEval||aiEvaluateThirdRecovery(spiker,plan,48);
        const selected=recoveryEval.choice.selected?.id||'FALLBACK_WAIT';
        plan.recoveryMode=true;
        plan.intent=selected;
        plan.target=selected==='SAFE_J'?recoveryEval.safeJWindow:null;
        if(plan._lastRecoverySelection!==selected){
          plan._lastRecoverySelection=selected;
          emitAIIntent(spiker,'THIRD_TOUCH_RECOVERY',{
            attackIntentId:plan.attackIntentId,stage:'SELECT',capability:aiCapabilitySnapshot(spiker),personality:aiPersonalityId(spiker),
            context:{fromIntent:plan.originalIntent||null,primaryFailureReason:plan.primaryFailureReason||null,grounded:false,currentStyle:recoveryEval.currentContact?.style??null,currentAngle:recoveryEval.currentContact?+recoveryEval.currentContact.angle.toFixed(3):null,tipNetY:recoveryEval.tipTrajectory?.netY??null,futureSafeJFrame:recoveryEval.safeJWindow?.frame??null,tipSkillReady:recoveryEval.tipSkillReady,spikeSkillReady:recoveryEval.spikeSkillReady},
            options:recoveryEval.choice.options.map(o=>({id:o.id,feasible:o.feasible,utility:+o.utility.toFixed(3),finalUtility:+o.finalUtility.toFixed(3),reason:o.reason})),
            selected,selectedFeasible:!!recoveryEval.choice.selected?.feasible,reason:'RECOVERY_UTILITY_WINNER'
          });
        }
        if(selected==='TIP'&&recoveryEval.tipContact&&recoveryEval.tipTrajectory?.safe){
          const attackIntentId=plan.attackIntentId||`${match.lastTouchFrame}:${spiker.slotKey}:${gameFrame}`;
          ball._aiAttackIntentId=attackIntentId;ball._aiAttackIntentFrame=gameFrame;
          ball._aiAttackIntentStyle='TIP';ball._aiAttackSourceSlot=spiker.slotKey;ball._aiAttackPlannedStyle='TIP';
          emitAIIntent(spiker,'THIRD_TOUCH_FALLBACK',{
            attackIntentId,stage:'EXECUTE',capability:aiCapabilitySnapshot(spiker),personality:aiPersonalityId(spiker),
            context:{grounded:false,fromIntent:plan.originalIntent||null,tipContact:true,tipNetY:recoveryEval.tipTrajectory?.netY??null,futureSafeJFrame:recoveryEval.safeJWindow?.frame??null,tipSkillReady:recoveryEval.tipSkillReady},
            options:recoveryEval.choice.options.map(o=>({id:o.id,feasible:o.feasible,utility:+o.utility.toFixed(3),finalUtility:+o.finalUtility.toFixed(3),reason:o.reason})),
            selected:'TIP',selectedFeasible:true,reason:'RECOVERY_TIP_EXECUTE'
          });
          if(typeof pushAIDebug==='function')pushAIDebug(spiker,'3RD RECOVERY: TIP',`L netY=${recoveryEval.tipTrajectory?.netY??'?'}`);
          handleUserThrust(spiker);
          spiker._thirdAttackPlan=null;ball.isFloat=false;fallbackExecuted=true;
        }else if(selected==='HARD_J'&&recoveryEval.currentContact){
          const attackIntentId=plan.attackIntentId||`${match.lastTouchFrame}:${spiker.slotKey}:${gameFrame}`;
          ball._aiAttackIntentId=attackIntentId;ball._aiAttackIntentFrame=gameFrame;
          ball._aiAttackIntentStyle=recoveryEval.currentContact.style;ball._aiAttackSourceSlot=spiker.slotKey;ball._aiAttackPlannedStyle='HARD_J';
          emitAIIntent(spiker,'THIRD_TOUCH_FALLBACK',{
            attackIntentId,stage:'EXECUTE',capability:aiCapabilitySnapshot(spiker),personality:aiPersonalityId(spiker),
            context:{grounded:false,fromIntent:plan.originalIntent||null,currentStyle:recoveryEval.currentContact.style,currentAngle:+recoveryEval.currentContact.angle.toFixed(3),trajectorySafe:!!recoveryEval.hardTrajectory?.safe,trajectoryReason:recoveryEval.hardTrajectory?.reason||null,spikeSkillReady:recoveryEval.spikeSkillReady},
            options:recoveryEval.choice.options.map(o=>({id:o.id,feasible:o.feasible,utility:+o.utility.toFixed(3),finalUtility:+o.finalUtility.toFixed(3),reason:o.reason})),
            selected:'HARD_J',selectedFeasible:true,reason:'RECOVERY_HARD_J_EXECUTE'
          });
          if(typeof pushAIDebug==='function')pushAIDebug(spiker,'3RD RECOVERY: HARD J',`${recoveryEval.currentContact.style} angle=${recoveryEval.currentContact.angle.toFixed(2)}`);
          handleUserAttack(spiker);
          spiker._thirdAttackPlan=null;ball.isFloat=false;fallbackExecuted=true;
        }else if(selected==='SAFE_J'&&recoveryEval.safeJWindow){
          plan.target=recoveryEval.safeJWindow;
          plan.expireFrame=Math.max(plan.expireFrame,gameFrame+recoveryEval.safeJWindow.frame+6);
          if(plan._lastSafeJFrame!==recoveryEval.safeJWindow.frame){
            plan._lastSafeJFrame=recoveryEval.safeJWindow.frame;
            if(typeof pushAIDebug==='function')pushAIDebug(spiker,'3RD RECOVERY: SAFE J WAIT',`ground J +${recoveryEval.safeJWindow.frame}f`);
          }
        }
      }

      // Legacy safety: a live unplanned legal J contact may still execute if no plan object exists.
      if (!fallbackExecuted && !spiker.isGrounded && !spiker.isDiving && currentContact && !plan && ball.lastHitter !== spiker && !isCooldown) {
        const currentFormula=(typeof computeSpikeFormula==='function')?computeSpikeFormula(spiker.stats,spiker.runMomentum):null;
        const currentPower=currentFormula?.effectivePower||spiker.stats?.power||26;
        const currentTrajectory=aiProjectedAttackTrajectory(spiker,currentContact.style,{x:ball.x,y:ball.y},currentPower);
        if(currentTrajectory.safe){
          const attackIntentId=`${match.lastTouchFrame}:${spiker.slotKey}:${gameFrame}`;
          ball._aiAttackIntentId=attackIntentId;ball._aiAttackIntentFrame=gameFrame;
          ball._aiAttackIntentStyle=currentContact.style;ball._aiAttackSourceSlot=spiker.slotKey;ball._aiAttackPlannedStyle=currentContact.style;
          handleUserAttack(spiker);ball.isFloat=false;fallbackExecuted=true;
        }
      } else if (!fallbackExecuted && spiker.isGrounded && !spiker.isDiving && ball.lastHitter!==spiker && !isCooldown && plan && plan.recoveryMode) {
        // V76-2: recovery is live even after landing. A stale NO_FUTURE_GROUND_J from the
        // airborne phase may not freeze the actor; reassess the actual current geometry.
        aiOrientGroundAttackTowardBall(spiker);
        const recoveryGround=aiEvaluateThirdRecovery(spiker,plan,32);
        const groundContact=aiAttackContactState(spiker);
        if(groundContact){
          const attackIntentId=plan.attackIntentId||`${match.lastTouchFrame}:${spiker.slotKey}:${gameFrame}`;
          ball._aiAttackIntentId=attackIntentId;ball._aiAttackIntentFrame=gameFrame;
          ball._aiAttackIntentStyle='SAFE_J';ball._aiAttackSourceSlot=spiker.slotKey;ball._aiAttackPlannedStyle='SAFE_J';
          emitAIIntent(spiker,'THIRD_TOUCH_FALLBACK',{
            attackIntentId,stage:'EXECUTE',capability:aiCapabilitySnapshot(spiker),personality:aiPersonalityId(spiker),
            context:{fromIntent:plan.originalIntent||null,distToNet:+distToNet.toFixed(1),contactDist:+getDist(spiker).toFixed(1),grounded:true,dx:+groundContact.dx.toFixed(1),dy:+groundContact.dy.toFixed(1),facing:aiAttackLiveFacing(spiker)},
            options:[{id:'SAFE_J',feasible:true,utility:1,finalUtility:1,reason:'LEGAL_GROUNDED_J_CONTACT'}],
            selected:'SAFE_J',selectedFeasible:true,reason:'RECOVERY_SAFE_J_EXECUTE'
          });
          handleUserAttack(spiker);
          spiker._thirdAttackPlan=null;fallbackExecuted=true;
        }else if(recoveryGround.safeJWindow){
          plan.intent='SAFE_J';plan.target=recoveryGround.safeJWindow;
          plan.expireFrame=Math.max(plan.expireFrame||0,gameFrame+recoveryGround.safeJWindow.frame+6);
        }
      }

      // V75-3.17 terminal audit covers BOTH primary and recovery plans. A committed
      // POWER/DEEP/STEEP may no longer silently expire without an observable terminal state.
      const livePlan=spiker._thirdAttackPlan;
      if(!fallbackExecuted && livePlan && ball.lastHitter!==spiker){
        const floorEta=(typeof estimateFramesToFloor==='function')?estimateFramesToFloor(ball):null;
        if(Number.isFinite(floorEta)&&floorEta<=1.5&&!livePlan._fallbackMissLogged){
          const attackIntentId=livePlan.attackIntentId||`${match.lastTouchFrame}:${spiker.slotKey}:${gameFrame}`;
          const recoveryNow=aiEvaluateThirdRecovery(spiker,livePlan,6);
          const priorPrimary=livePlan.originalIntent&&['POWER','STEEP','DEEP'].includes(livePlan.originalIntent)?livePlan.originalIntent:null;
          const terminalJ=aiEmergencyJContactState(spiker);
          const terminalTip=aiTipContactState(spiker);
          const terminalTipTraj=terminalTip?aiProjectedTipTrajectory(spiker,terminalTip):null;
          // V76-3: terminal ordering. A legal touch on the final playable frame executes BEFORE
          // MISS bookkeeping. This fixes grounded actors being logged as MISS while HARD_J was
          // simultaneously feasible.
          if(!isCooldown&&terminalJ){
            ball._aiAttackIntentId=attackIntentId;ball._aiAttackIntentFrame=gameFrame;
            ball._aiAttackIntentStyle=spiker.isGrounded?'SAFE_J':terminalJ.style;ball._aiAttackSourceSlot=spiker.slotKey;ball._aiAttackPlannedStyle=spiker.isGrounded?'SAFE_J':'HARD_J';
            emitAIIntent(spiker,'THIRD_TOUCH_FALLBACK',{attackIntentId,stage:'TERMINAL_EXECUTE',capability:aiCapabilitySnapshot(spiker),personality:aiPersonalityId(spiker),context:{grounded:!!spiker.isGrounded,floorEta:+floorEta.toFixed(2),dx:+terminalJ.dx.toFixed(1),dy:+terminalJ.dy.toFixed(1),fromIntent:priorPrimary||livePlan.intent},options:[{id:spiker.isGrounded?'SAFE_J':'HARD_J',feasible:true,utility:1,finalUtility:1,reason:'LEGAL_CONTACT_BEFORE_FLOOR'}],selected:spiker.isGrounded?'SAFE_J':'HARD_J',selectedFeasible:true,reason:'TERMINAL_CONTACT_PRECEDES_MISS'});
            handleUserAttack(spiker);spiker._thirdAttackPlan=null;fallbackExecuted=true;
          }else if(!isCooldown&&terminalTip&&terminalTipTraj?.safe&&!spiker.isGrounded){
            ball._aiAttackIntentId=attackIntentId;ball._aiAttackIntentFrame=gameFrame;ball._aiAttackIntentStyle='TIP';ball._aiAttackSourceSlot=spiker.slotKey;ball._aiAttackPlannedStyle='TIP';
            emitAIIntent(spiker,'THIRD_TOUCH_FALLBACK',{attackIntentId,stage:'TERMINAL_EXECUTE',capability:aiCapabilitySnapshot(spiker),personality:aiPersonalityId(spiker),context:{grounded:false,floorEta:+floorEta.toFixed(2),fromIntent:priorPrimary||livePlan.intent},options:[{id:'TIP',feasible:true,utility:1,finalUtility:1,reason:'LEGAL_TIP_BEFORE_FLOOR'}],selected:'TIP',selectedFeasible:true,reason:'TERMINAL_CONTACT_PRECEDES_MISS'});
            handleUserThrust(spiker);spiker._thirdAttackPlan=null;fallbackExecuted=true;
          }else{
            livePlan._fallbackMissLogged=true;
            emitAIIntent(spiker,'THIRD_TOUCH_RECOVERY',{
              attackIntentId,stage:'MISS',capability:aiCapabilitySnapshot(spiker),personality:aiPersonalityId(spiker),
              context:{grounded:!!spiker.isGrounded,floorEta:+floorEta.toFixed(2),priorPrimary,primaryFailureReason:livePlan.primaryFailureReason||null,currentIntent:livePlan.intent,futureSafeJFrame:recoveryNow.safeJWindow?.frame??null},
              options:recoveryNow.choice.options.map(o=>({id:o.id,feasible:o.feasible,utility:+o.utility.toFixed(3),finalUtility:+o.finalUtility.toFixed(3),reason:o.reason})),
              selected:'MISS',selectedFeasible:true,reason:'THIRD_TOUCH_NO_EXECUTION_BEFORE_FLOOR'
            });
            const missDetail=`from=${priorPrimary||livePlan.intent} fail=${livePlan.primaryFailureReason||'-'} floor=${floorEta.toFixed(1)} recovery=${recoveryNow.choice.selected?.id||'-'}`;
            if(typeof pushAIBrainTrace==='function')pushAIBrainTrace(isLeft?'LEFT':'RIGHT','THIRD_TOUCH_MISS',missDetail);
          }
        }
      }
    }
  }
  else if (teamHits === 2) {
    // V75-3.20: stale hit counts must not create a phantom third-touch attack after possession is lost.
    const sideKey=isLeft?'LEFT':'RIGHT';
    const key=`${match.lastTouchFrame}:${ball?.lastHitter?.slotKey||'none'}`;
    runTeamBrain._thirdPossessionSuppressKey=runTeamBrain._thirdPossessionSuppressKey||{LEFT:null,RIGHT:null};
    if(runTeamBrain._thirdPossessionSuppressKey[sideKey]!==key){
      runTeamBrain._thirdPossessionSuppressKey[sideKey]=key;
      const observer=(ball?.lastHitter===pA)?pB:pA;
      emitAIIntent(observer,'THIRD_TOUCH_LIFECYCLE',{
        stage:'SUPPRESS',capability:aiCapabilitySnapshot(observer),personality:aiPersonalityId(observer),
        context:{reason:'THIRD_TOUCH_POSSESSION_INVALID',touchFrame:match.lastTouchFrame,teamHits,lastHitter:ball?.lastHitter?.slotKey||null,lastHitterSide:ball?.lastHitter?(ball.lastHitter.isLeft?'LEFT':'RIGHT'):null},
        options:[{id:'NO_THIRD_TOUCH',feasible:true,utility:1,finalUtility:1,reason:'OPPONENT_OWNS_LATEST_TOUCH'}],
        selected:'NO_THIRD_TOUCH',selectedFeasible:true,reason:'THIRD_TOUCH_POSSESSION_INVALID'
      });
      if(typeof pushAIBrainTrace==='function')pushAIBrainTrace(sideKey,'3RD TOUCH SUPPRESSED','POSSESSION_INVALID | stale hits=2');
    }
  }

  // V75-0 lightweight anomaly detector: emits breadcrumbs instead of silently failing.
  if (typeof flagAIBug === 'function' && isBallThreat && framesToFloor <= 42) {
    const side = isLeft ? 'LEFT' : 'RIGHT';
    const state = (typeof aiTeamIntentState !== 'undefined') ? aiTeamIntentState[side] : null;
    if (!state || gameFrame - state.frame > 2) flagAIBug(side, 'NO_FRESH_INTENT', `floor=${framesToFloor}f hits=${teamHits}`);
    const bothFar = Math.min(Math.abs(pA.x-realLandingX), Math.abs(pB.x-realLandingX)) > 260;
    if (bothFar && framesToFloor <= 24) {
      // V75-3.3 telemetry: one LATE_TO_CHANCE episode per incoming touch, not one event per frame.
      // This is observability only; no AI movement/action thresholds are changed here.
      const episodeKey = `${match.lastTouchFrame}|${side}`;
      if (_aiLateChanceEpisodeKey[side] !== episodeKey) {
        _aiLateChanceEpisodeKey[side] = episodeKey;
        const ownerKey = state?.ownerKey || null;
        const owner = [pA,pB].find(p => (p.slotKey||`slot${p.slotIndex}`) === ownerKey) || (Math.abs(pA.x-realLandingX)<=Math.abs(pB.x-realLandingX)?pA:pB);
        const other = owner===pA?pB:pA;
        const ownerEta = estimateAIChaseFrames(owner, realLandingX);
        const otherEta = estimateAIChaseFrames(other, realLandingX);
        const diveGap = Math.max(0, Math.abs(realLandingX-owner.x)-85);
        const diveEta = diveGap / Math.max(1,(owner.effectiveSpeed||1)*2.0);
        const sourceTouchNumber = ball.lastHitter ? (ball.lastHitter.isLeft ? match.leftHits : match.rightHits) : 0;
        const incomingSpeed = Math.hypot(ball.vx||0,ball.vy||0);
        flagAIBug(side, 'LATE_TO_CHANCE', `touchFrame=${match.lastTouchFrame} touchNumber=${sourceTouchNumber} speed=${incomingSpeed.toFixed(2)} landing=${realLandingX.toFixed(0)} floor=${framesToFloor}f owner=${owner.slotKey||owner.name} runETA=${ownerEta.toFixed(1)} diveETA=${diveEta.toFixed(1)} partnerETA=${otherEta.toFixed(1)}`);
      }
    }
    if (state && state.ownerKey) {
      const owner = [pA,pB].find(p => (p.slotKey||`slot${p.slotIndex}`) === state.ownerKey);
      const other = owner===pA?pB:pA;
      if (owner && other) {
        const oe = estimateAIChaseFrames(owner, realLandingX);
        const pe = estimateAIChaseFrames(other, realLandingX);
        if (oe > framesToFloor + 5 && pe + 8 < oe) {
          // V75-3.13 telemetry: OWNER_LATE is an episode, not a per-15-frame counter.
          // Dedupe once per side + incoming touch so summaries reflect distinct
          // ownership failures instead of how long one bad possession remained alive.
          const ownerLateKey=`${match.lastTouchFrame}|${side}`;
          if(_aiOwnerLateEpisodeKey[side]!==ownerLateKey){
            _aiOwnerLateEpisodeKey[side]=ownerLateKey;
            flagAIBug(side, 'OWNER_LATE', `${owner.name} ${oe.toFixed(1)}f / ${other.name} ${pe.toFixed(1)}f / floor ${framesToFloor}f`);
          }
        }
      }
    }
  }
}

function updateBlockAI() {
  if (typeof BALANCE_SCENARIO_ACTIVE !== 'undefined' && BALANCE_SCENARIO_ACTIVE) return;
  if (match.inServeRally) return;

  const runSide = (attackers, defenders, defendLeft) => {
    // attacker 不是看「誰跳了」，而是看誰與球形成真正可攻擊 contact window。
    const attacker = attackers.slice().sort((a,b)=>{
      const aw=predictAIThirdContactWindows(a,14).ANY, bw=predictAIThirdContactWindows(b,14).ANY;
      const af=aw?aw.frame:999, bf=bw?bw.frame:999;
      if(af!==bf) return af-bf;
      return Math.hypot(a.x-ball.x,a.y-ball.y)-Math.hypot(b.x-ball.x,b.y-ball.y);
    })[0];

    const [dA,dB]=defenders;
    const blocker=(Math.abs(dA.x-WORLD.NET_X)<=Math.abs(dB.x-WORLD.NET_X))?dA:dB;
    const defender=(blocker===dA)?dB:dA;

    if(!isSlotHumanControlled(blocker)){
      moveTowards(blocker, WORLD.NET_X + (defendLeft?-42:42), blocker.effectiveSpeed);
      const inZone=Math.abs(blocker.x-WORLD.NET_X)<95;
      const threat=aiBlockThreat(attacker,blocker);

      // 每一個新的攻擊 possession / attacker 都重新建立一次攔網計畫。
      const planStale=!blocker._aiBlockPlan ||
        blocker._aiBlockPlan.touchKey!==match.lastTouchFrame ||
        blocker._aiBlockPlan.attackerSlot!==attacker?.slotKey;

      if(inZone && threat.threat && planStale){
        const modeChoice=aiChooseBlockMode(blocker,attacker,threat);
        const mode=modeChoice.selected?.id||'SAFE';
        const cap=aiCapabilitySnapshot(blocker);
        const jumpLead=Math.max(7,Math.min(13,Math.round(11+(30-cap.jump)*0.05)));
        blocker._aiBlockPlan={
          touchKey:match.lastTouchFrame,
          attackerSlot:attacker?.slotKey||null,
          mode,
          targetContactFrame:threat.contactFrame,
          uncertainty:threat.uncertainty??0,
          jumpFrame:(threat.contactFrame??gameFrame)-jumpLead,
          modeChoice,
          pressed:false
        };
        emitAIIntent(blocker,'BLOCK',{
          capability:cap,
          personality:aiPersonalityId(blocker),
          context:{attackerSlot:attacker?.slotKey||null,targetContactFrame:threat.contactFrame??null,uncertainty:threat.uncertainty??null,direct:!!threat.direct},
          options:modeChoice.options.map(o=>({id:o.id,feasible:o.feasible,utility:+o.utility.toFixed(3),finalUtility:+o.finalUtility.toFixed(3),reason:o.reason})),
          selected:mode,selectedFeasible:true,reason:`BLOCK_${mode}`
        });
      }

      const plan=blocker._aiBlockPlan;
      if(inZone && plan && threat.threat){
        // 先決定要不要起跳；不再因為攻擊手單純離地就跟跳。
        if(blocker.isGrounded && gameFrame>=plan.jumpFrame){
          blocker.jump();
          if(plan.mode==='SAFE'){
            blocker.triggerBlock();
            plan.pressed=true;
            if(typeof pushAIDebug==='function')pushAIDebug(blocker,'BLOCK PRESS: SAFE',`uncertainty=${plan.uncertainty}`);
          }
        }

        // PERFECT：起跳後先不亮盾，等真實來球靠近手面才壓手。
        if(!blocker.isGrounded && plan.mode==='PERFECT' && !blocker.wantsToBlock){
          const opponentBall=ball.lastHitter && ball.lastHitter.isLeft!==blocker.isLeft;
          const incoming=opponentBall && ((blocker.isLeft&&ball.vx<0)||(!blocker.isLeft&&ball.vx>0));
          if(incoming){
            const handX=blocker.x, handY=blocker.y-blocker.radius*2-20;
            const handDist=Math.hypot(ball.x-handX,ball.y-handY);
            const sideGap=blocker.isLeft?(ball.x-handX):(handX-ball.x);
            // TEC 只影響「想在正確時間壓手，實際壓得多準」；不改讀球本身。
            const execJitter=aiExecutionNoise(blocker,`BLOCK_PRESS|${plan.attackerSlot}`);
            const pressThreshold=76+execJitter*34;
            if(handDist<=pressThreshold || sideGap<4){
              blocker.triggerBlock();
              plan.pressed=true;
              if(typeof pushAIDebug==='function')pushAIDebug(blocker,'BLOCK PRESS: PERFECT TRY',`d=${handDist.toFixed(0)} threshold=${pressThreshold.toFixed(0)}`);
            }
          }
        }
      }

      // 已落地/攻擊 possession 變更時清 plan；避免假動作後 stale plan 永久留著。
      if(blocker._aiBlockPlan && blocker.isGrounded && gameFrame>blocker._aiBlockPlan.targetContactFrame+10){
        blocker._aiBlockPlan=null;
      }
    }

    if(!isSlotHumanControlled(defender)){
      moveTowards(defender, defendLeft ? WORLD.LEFT+180 : WORLD.RIGHT-180, defender.effectiveSpeed);
    }
  };

  // ball 在左側且左隊已形成 possession：右隊準備攔網。
  if(ball.x<WORLD.NET_X && match.leftHits>=1){
    runSide([userPlayer,mateAI],[enemyA,enemyB],false);
  }
  // ball 在右側且右隊已形成 possession：左隊準備攔網。
  if(ball.x>WORLD.NET_X && match.rightHits>=1){
    runSide([enemyA,enemyB],[userPlayer,mateAI],true);
  }
}
