// ========================================================
// 畫面繪圖層：球員外觀、紙娃娃配件、表情、吊燈、雷達與主渲染
// ========================================================
function drawPlayerEntity(player, targetCtx) {
  if (player && player.respawnBlinkTimer > 0 && Math.floor(player.respawnBlinkTimer / 5) % 2 === 0) return;
  const cosmetics = (player.card && player.card.cosmetics) ? player.card.cosmetics : { hat: 'hat_none', face: 'face_none', effect: 'fx_none' };
  const cosmeticOnly = !!player.cosmeticOnly; // V76-4.0.3: gacha/collection icon reuses the exact live cosmetic renderer without drawing the carrier.
  const effectObj = (typeof COSMETICS_DB !== 'undefined') ? COSMETICS_DB.effects.find(e => e.id === cosmetics.effect) : null;
  const glowColor = effectObj ? effectObj.glow : null;

// 🌟 核心：三階滿階裝備腳底光暈 (支援本機與遠端同步)
let highestRank3Tier = player.highestRank3Tier || null;
if (!highestRank3Tier && player.card) {
    const slots = [player.card.equipSlotA, player.card.equipSlotB];
    slots.forEach(instId => {
        if (!instId) return;
const eq = (typeof INVENTORY_EQUIPS !== 'undefined') ? INVENTORY_EQUIPS.find(e => e.instanceId === instId) : null;
        if (eq && eq.rank >= 3) {
            if (eq.tier === 'SSR') highestRank3Tier = 'SSR';
            else if (eq.tier === 'SR' && highestRank3Tier !== 'SSR') highestRank3Tier = 'SR';
            else if (eq.tier === 'R' && highestRank3Tier !== 'SSR' && highestRank3Tier !== 'SR') highestRank3Tier = 'R';
        }
    });
}

// V70 地面光環：永遠黏在角色腳下的實際場地地面，不跟角色跳躍；外緣用 radial gradient feather。
  if (highestRank3Tier) {
    targetCtx.save();
    const haloFloorY = (typeof venueFloorYAt === 'function') ? venueFloorYAt(player.x) : WORLD.FLOOR_Y;
    targetCtx.translate(player.x, haloFloorY - 2);

    let haloRgb = '255,255,255', haloGlow = '#ffffff';
    if (highestRank3Tier === 'SR') { haloRgb = '239,68,68'; haloGlow = '#ef4444'; }
    else if (highestRank3Tier === 'SSR') { haloRgb = '250,204,21'; haloGlow = '#facc15'; }

    // 先把圓形漸層壓扁成橢圓，中心實、邊緣自然 feather 到透明。
    targetCtx.scale(1, 0.30);
    const haloR = player.radius * 1.72;
    const grad = targetCtx.createRadialGradient(0, 0, haloR * 0.08, 0, 0, haloR);
    grad.addColorStop(0, `rgba(${haloRgb},0.68)`);
    grad.addColorStop(0.48, `rgba(${haloRgb},0.50)`);
    grad.addColorStop(0.78, `rgba(${haloRgb},0.20)`);
    grad.addColorStop(1, `rgba(${haloRgb},0)`);
    targetCtx.fillStyle = grad;
    targetCtx.shadowColor = haloGlow; targetCtx.shadowBlur = 18;
    targetCtx.beginPath(); targetCtx.arc(0, 0, haloR, 0, Math.PI * 2); targetCtx.fill();
    targetCtx.restore();
  }

  // V63 READY BURST：仍只在「剛滿能量」竄一次，但強到用餘光也看得到。
  if ((player.energyReadyFlash || 0) > 0) {
    const life = player.energyReadyFlash, t = 1 - life / 52;
    const envelope = Math.sin(Math.min(1, t * 1.18) * Math.PI) * Math.min(1, life / 9);
    targetCtx.save();
    targetCtx.translate(player.x, player.y - player.radius);
    targetCtx.globalCompositeOperation = 'lighter';
    targetCtx.shadowColor = '#facc15'; targetCtx.shadowBlur = 38;
    targetCtx.globalAlpha = Math.max(0, envelope) * 0.96;
    const rise = t * 112;
    // 外圈爆閃：瞬間擴張，不形成持續 READY 光環。
    targetCtx.strokeStyle = '#fde047'; targetCtx.lineWidth = 5.5;
    targetCtx.beginPath(); targetCtx.arc(0, 0, player.radius * (1.15 + t * 1.35), 0, Math.PI * 2); targetCtx.stroke();
    targetCtx.globalAlpha *= 0.62;
    targetCtx.strokeStyle = '#fff7ae'; targetCtx.lineWidth = 2.5;
    targetCtx.beginPath(); targetCtx.arc(0, 0, player.radius * (1.65 + t * 1.8), 0, Math.PI * 2); targetCtx.stroke();
    // 兩側向上竄的金焰柱，讓玩家盯球時仍能靠周邊視野捕捉。
    targetCtx.globalAlpha = Math.max(0, envelope) * 0.82;
    for (const side of [-1, 1]) {
      const bx = side * player.radius * 0.72;
      const grad = targetCtx.createLinearGradient(bx, player.radius, bx, -player.radius*2.8);
      grad.addColorStop(0, 'rgba(250,204,21,0.85)'); grad.addColorStop(1, 'rgba(253,224,71,0)');
      targetCtx.fillStyle = grad;
      targetCtx.beginPath();
      targetCtx.moveTo(bx-player.radius*.24, player.radius*.72);
      targetCtx.quadraticCurveTo(bx+side*10, -player.radius*.55-rise*.22, bx, -player.radius*2.15-rise*.38);
      targetCtx.quadraticCurveTo(bx-side*10, -player.radius*.45-rise*.15, bx+player.radius*.24, player.radius*.72);
      targetCtx.closePath(); targetCtx.fill();
    }
    targetCtx.globalAlpha = Math.max(0, envelope);
    for (let i = 0; i < 14; i++) {
      const phase = i * 1.37;
      const x = Math.sin(phase + t * 6.2) * (15 + (i % 4) * 8);
      const y = player.radius * 0.75 - rise * (0.45 + (i % 5) * 0.10) - (i % 3) * 11;
      const r = 2.8 + (i % 4) * 1.25;
      targetCtx.fillStyle = i % 3 ? '#facc15' : '#fff7ae';
      targetCtx.beginPath(); targetCtx.arc(x, y, r, 0, Math.PI * 2); targetCtx.fill();
    }
    targetCtx.restore();
  }

  // V74-14 心流化境：柔和三層自然氣場 + 葉片/光塵的假 Z 軸環流。
  if (player.flowAbsorbRallies > 0) {
    const gf = (typeof gameFrame !== 'undefined') ? gameFrame : 0;
    targetCtx.save(); targetCtx.translate(player.x, player.y - player.radius);
    targetCtx.globalCompositeOperation='lighter';
    const pulse=1+Math.sin(gf*.085)*.045, base=player.radius*1.52*pulse;
    // Feathered aura: wide low-alpha strokes hide the hard ring edge.
    targetCtx.shadowColor='#34d399';
    targetCtx.globalAlpha=.055; targetCtx.strokeStyle='#34d399'; targetCtx.lineWidth=34; targetCtx.shadowBlur=34;
    targetCtx.beginPath(); targetCtx.arc(0,0,base*1.13,0,Math.PI*2); targetCtx.stroke();
    targetCtx.globalAlpha=.11; targetCtx.strokeStyle='#5eead4'; targetCtx.lineWidth=18; targetCtx.shadowBlur=28;
    targetCtx.beginPath(); targetCtx.arc(0,0,base*1.05,0,Math.PI*2); targetCtx.stroke();
    targetCtx.globalAlpha=.52; targetCtx.strokeStyle='#a7f3d0'; targetCtx.lineWidth=2.1; targetCtx.shadowBlur=16;
    targetCtx.beginPath(); targetCtx.arc(0,0,base,0,Math.PI*2); targetCtx.stroke();
    const motes=[];
    for(let i=0;i<16;i++){const a=gf*(.032+(i%3)*.003)+i*Math.PI*.37,tilt=.42+(i%4)*.10,rx=player.radius*(1.45+(i%5)*.10),z=Math.sin(a);motes.push({a,x:Math.cos(a)*rx,y:Math.sin(a)*rx*tilt,z,r:1.7+(z+1)*1.0,leaf:i%3===0});}
    motes.sort((a,b)=>a.z-b.z);
    for(const m of motes){targetCtx.save();targetCtx.translate(m.x,m.y);targetCtx.rotate(m.a+.7);targetCtx.globalAlpha=.10+(m.z+1)*.25;targetCtx.shadowColor=m.z>0?'#a7f3d0':'#10b981';targetCtx.shadowBlur=m.z>0?20:7;targetCtx.fillStyle=m.z>0?'#d1fae5':'#34d399';if(m.leaf){targetCtx.scale(1.5,.7);targetCtx.beginPath();targetCtx.ellipse(0,0,m.r*1.8,m.r,0,0,Math.PI*2);targetCtx.fill();targetCtx.globalAlpha*=.7;targetCtx.strokeStyle='#ecfdf5';targetCtx.lineWidth=.7;targetCtx.beginPath();targetCtx.moveTo(-m.r*1.1,0);targetCtx.lineTo(m.r*1.1,0);targetCtx.stroke();}else{targetCtx.beginPath();targetCtx.arc(0,0,m.r,0,Math.PI*2);targetCtx.fill();}targetCtx.restore();}
    targetCtx.restore();
  }
  // 1. 拖曳微粒殘影 (維持原有)
  if (player.ghostTrail && player.ghostTrail.length > 0) {
    player.ghostTrail.forEach(t => {
      targetCtx.save();
      targetCtx.translate(t.x, t.y);
      if (t.isDiving) targetCtx.scale(t.facing * 1.6, 0.6);
      else targetCtx.scale(t.squashX, t.squashY);
      targetCtx.beginPath();
      targetCtx.arc(0, -player.radius, player.radius, 0, Math.PI * 2);
      targetCtx.fillStyle = t.teleport ? '#67e8f9' : player.color;
      const teleportFlicker = t.teleport ? ((Math.floor((typeof gameFrame !== 'undefined' ? gameFrame : 0) / 2) % 2) ? 0.72 : 1.0) : 1.0;
      targetCtx.globalAlpha = Math.max(0, t.alpha * (t.teleport ? 0.68 : 0.25) * teleportFlicker);
      if (t.teleport) { targetCtx.shadowColor = '#38bdf8'; targetCtx.shadowBlur = 22; }
      targetCtx.fill();
      targetCtx.restore();
    });
  }

  // 2. 本體繪製
  targetCtx.save();
  targetCtx.translate(player.x, player.y);
  const _bodyBaseTransform=targetCtx.getTransform();
  const _venueSpinAngle=(player.venueSpinTimer||0)>0 ? (1-(player.venueSpinTimer/(player.venueSpinTotal||48)))*Math.PI*2 : 0;
  if(_venueSpinAngle){targetCtx.translate(0,-player.radius);targetCtx.rotate(_venueSpinAngle);targetCtx.translate(0,player.radius);}
  if (player.isDiving) targetCtx.scale(player.facing * 1.6, 0.6);
  else targetCtx.scale(player.squashX, player.squashY);

  if (glowColor) {
    targetCtx.shadowColor = glowColor;
    targetCtx.shadowBlur = 18;
  }

  const _beachBallBody = cosmetics.effect === 'fx_beach_ball_body';
  if (!cosmeticOnly) {
    if (_beachBallBody) {
      const cy=-player.radius, r=player.radius;
      for(let i=0;i<6;i++){targetCtx.fillStyle=['#ef4444','#f8fafc','#38bdf8','#facc15','#f8fafc','#22c55e'][i];targetCtx.beginPath();targetCtx.moveTo(0,cy);targetCtx.arc(0,cy,r,i*Math.PI/3,(i+1)*Math.PI/3);targetCtx.closePath();targetCtx.fill();}
      targetCtx.strokeStyle='#fff';targetCtx.lineWidth=4;targetCtx.beginPath();targetCtx.arc(0,cy,r,0,Math.PI*2);targetCtx.stroke();
    } else {
      targetCtx.beginPath();targetCtx.arc(0,-player.radius,player.radius,0,Math.PI*2);targetCtx.fillStyle=player.color;targetCtx.fill();targetCtx.lineWidth=3;targetCtx.strokeStyle=glowColor||'#fff';targetCtx.stroke();
    }
  }
  targetCtx.shadowBlur = 0;

  // V31 場地／成就光效：不是單純換外框顏色，要有可辨識的動態身份。
  if (cosmetics.effect && cosmetics.effect !== 'fx_none') {
    const gf = (typeof gameFrame !== 'undefined') ? gameFrame : 0;
    targetCtx.save();
    if (cosmetics.effect === 'fx_feathers') {
      targetCtx.fillStyle='#f8fafc';
      for(let i=0;i<5;i++){ const a=gf*0.035+i*1.27; const rx=Math.cos(a)*30, ry=-player.radius+((gf*0.7+i*17)%55)-28; targetCtx.save(); targetCtx.translate(rx,ry); targetCtx.rotate(a); targetCtx.fillRect(-4,-1,8,2); targetCtx.restore(); }
    } else if (cosmetics.effect === 'fx_leak') {
      targetCtx.strokeStyle='#a5f3fc'; targetCtx.lineWidth=1.5;
      for(let i=0;i<4;i++){ const yy=-((gf*0.8+i*16)%55); targetCtx.beginPath(); targetCtx.arc(22+Math.sin(gf*.04+i)*5,yy,2+i%2,0,Math.PI*2); targetCtx.stroke(); }
    } else if (cosmetics.effect === 'fx_flies') {
      targetCtx.fillStyle='#111827'; for(let i=0;i<3;i++){const a=gf*.08+i*2.094; targetCtx.beginPath();targetCtx.arc(Math.cos(a)*28,-player.radius+Math.sin(a)*18,2.2,0,Math.PI*2);targetCtx.fill();}
    } else if (cosmetics.effect === 'fx_welding') {
      targetCtx.strokeStyle='#fb923c'; targetCtx.lineWidth=2; for(let i=0;i<4;i++){const a=gf*.17+i*1.57;targetCtx.beginPath();targetCtx.moveTo(0,0);targetCtx.lineTo(Math.cos(a)*18,Math.sin(a)*12);targetCtx.stroke();}
    } else if (cosmetics.effect === 'fx_splash') {
      targetCtx.strokeStyle='#38bdf8'; targetCtx.lineWidth=2; for(let i=0;i<3;i++){const x=(i-1)*10;targetCtx.beginPath();targetCtx.arc(x,0,7+Math.sin(gf*.1+i)*3,Math.PI,Math.PI*2);targetCtx.stroke();}
    } else if (cosmetics.effect === 'fx_blackout') {
      targetCtx.globalAlpha=(Math.floor(gf/5)%3===0)?0.15:0.75; targetCtx.strokeStyle='#f8fafc'; targetCtx.lineWidth=3; targetCtx.beginPath(); targetCtx.arc(0,-player.radius,player.radius+7,0,Math.PI*2); targetCtx.stroke();
    }
    targetCtx.restore();
  }

if (player.isBlocking) {
    targetCtx.save();
    targetCtx.strokeStyle = '#facc15';
    targetCtx.lineWidth = 8;
    targetCtx.shadowColor = '#facc15';
    targetCtx.shadowBlur = 16;
    targetCtx.beginPath();
    const hx = player.isLeft ? 16 : -16;
    targetCtx.moveTo(hx, -player.radius * 2 + 5);
    targetCtx.lineTo(hx, -player.radius * 2 - 25);
    targetCtx.stroke();
    targetCtx.beginPath();
    targetCtx.arc(hx, -player.radius * 2 - 10, 22, -Math.PI * 0.5, Math.PI * 0.5, !player.isLeft);
    targetCtx.stroke();
    targetCtx.restore();
  }

  // 3. 臉部五官與配件 (原邏輯完整保留)...
  if (!player.isDiving && !_beachBallBody) {
    const eyeX = player.facing * 8;
    if (!cosmeticOnly) {
      targetCtx.fillStyle = 'rgba(244, 114, 182, 0.6)'; targetCtx.beginPath();
      targetCtx.arc(eyeX - 7, -player.radius + 6, 4, 0, Math.PI * 2);
      targetCtx.arc(eyeX + 7, -player.radius + 6, 4, 0, Math.PI * 2);
      targetCtx.fill();
      targetCtx.fillStyle = '#1e1b4b'; targetCtx.beginPath();
      targetCtx.arc(eyeX - 5, -player.radius, 3.5, 0, Math.PI * 2);
      targetCtx.arc(eyeX + 5, -player.radius, 3.5, 0, Math.PI * 2);
      targetCtx.fill();
    }

    // 臉飾完整向量繪製：角色與 Icon 共用同一份 live renderer，避免兩套外觀漂移。
    const fId = cosmetics.face;
    if (fId === 'face_mustache') {
      targetCtx.fillStyle = '#475569';
      targetCtx.beginPath();
      targetCtx.ellipse(eyeX - 6, -player.radius + 5, 6, 2.5, -0.3, 0, Math.PI * 2);
      targetCtx.ellipse(eyeX + 6, -player.radius + 5, 6, 2.5, 0.3, 0, Math.PI * 2);
      targetCtx.fill();
    } else if (fId === 'face_goatee') {
      targetCtx.fillStyle = '#94a3b8';
      targetCtx.beginPath();
      targetCtx.ellipse(eyeX - 7, -player.radius + 5, 7, 2.5, -0.3, 0, Math.PI * 2);
      targetCtx.ellipse(eyeX + 7, -player.radius + 5, 7, 2.5, 0.3, 0, Math.PI * 2);
      targetCtx.fill();
      targetCtx.beginPath();
      targetCtx.moveTo(eyeX - 3, -player.radius + 6);
      targetCtx.lineTo(eyeX + 3, -player.radius + 6);
      targetCtx.lineTo(eyeX, -player.radius + 18);
      targetCtx.closePath(); targetCtx.fill();
    } else if (fId === 'face_spiral_glasses') {
      targetCtx.strokeStyle = '#000'; targetCtx.lineWidth = 2.2;
      [-7, 7].forEach(ox => {
        targetCtx.beginPath();
        for (let a = 0; a < Math.PI * 4; a += 0.25) {
          const r = a * 1.1;
          targetCtx.lineTo(eyeX + ox + Math.cos(a) * r, -player.radius + Math.sin(a) * r);
        }
        targetCtx.stroke();
      });
      targetCtx.beginPath(); targetCtx.moveTo(eyeX - 3, -player.radius); targetCtx.lineTo(eyeX + 3, -player.radius); targetCtx.stroke();
    } else if (fId === 'face_shades') {
      targetCtx.fillStyle = '#0f172a';
      targetCtx.fillRect(eyeX - 14, -player.radius - 3, 28, 8);
    } else if (fId === 'face_mask') {
      targetCtx.fillStyle = '#ffffff';
      targetCtx.fillRect(eyeX - 10, -player.radius + 2, 20, 11);
    } else if (fId === 'face_ruby_earring') {
      targetCtx.fillStyle = '#ef4444';
      targetCtx.beginPath(); targetCtx.arc(eyeX - player.radius * 0.8, -player.radius, 3, 0, Math.PI * 2); targetCtx.fill();
    } else if (fId === 'face_bandage') {
      targetCtx.fillStyle = '#fde047';
      targetCtx.fillRect(eyeX - 6, -player.radius + 2, 12, 4);
    } else if (fId === 'face_cigar') {
      targetCtx.fillStyle = '#78350f'; targetCtx.fillRect(eyeX + 2, -player.radius + 6, 8, 3);
      targetCtx.fillStyle = '#ef4444'; targetCtx.fillRect(eyeX + 10, -player.radius + 6, 2, 3);
    } else if (fId === 'face_eye_patch') {
      targetCtx.fillStyle = '#0f172a';
      targetCtx.beginPath(); targetCtx.arc(eyeX - 5, -player.radius, 5.5, 0, Math.PI * 2); targetCtx.fill();
    } else if (fId === 'face_bubble_gum') {
      targetCtx.fillStyle = '#f472b6';
      targetCtx.beginPath(); targetCtx.arc(eyeX + 6, -player.radius + 5, 6.5, 0, Math.PI * 2); targetCtx.fill();
    } else if (fId === 'face_blush') {
      targetCtx.fillStyle = 'rgba(239, 68, 68, 0.7)';
      targetCtx.beginPath(); targetCtx.arc(eyeX - 8, -player.radius + 6, 5, 0, Math.PI * 2); targetCtx.fill();
      targetCtx.beginPath(); targetCtx.arc(eyeX + 8, -player.radius + 6, 5, 0, Math.PI * 2); targetCtx.fill();
      targetCtx.strokeStyle = '#dc2626'; targetCtx.lineWidth = 1;
      [-8, 8].forEach(bx => {
        targetCtx.beginPath();
        targetCtx.moveTo(eyeX + bx - 3, -player.radius + 8); targetCtx.lineTo(eyeX + bx - 1, -player.radius + 4);
        targetCtx.moveTo(eyeX + bx, -player.radius + 8); targetCtx.lineTo(eyeX + bx + 2, -player.radius + 4);
        targetCtx.stroke();
      });
    } else if (fId === 'face_monocle') {
      targetCtx.strokeStyle = '#facc15'; targetCtx.lineWidth = 2;
      targetCtx.beginPath(); targetCtx.arc(eyeX + 5, -player.radius, 6, 0, Math.PI * 2); targetCtx.stroke();
      targetCtx.beginPath(); targetCtx.moveTo(eyeX + 9, -player.radius + 4);
      targetCtx.quadraticCurveTo(eyeX + 14, -player.radius + 14, eyeX + 8, -player.radius + 20); targetCtx.stroke();
    } else if (fId === 'face_fox_mask') {
      targetCtx.fillStyle = '#fff';
      targetCtx.beginPath();
      targetCtx.ellipse(eyeX - 7, -player.radius - 2, 9, 13, -0.2, 0, Math.PI * 2); targetCtx.fill();
      targetCtx.strokeStyle = '#dc2626'; targetCtx.lineWidth = 1.5;
      targetCtx.beginPath();
      targetCtx.moveTo(eyeX - 11, -player.radius - 4); targetCtx.lineTo(eyeX - 5, -player.radius);
      targetCtx.moveTo(eyeX - 10, -player.radius); targetCtx.lineTo(eyeX - 6, -player.radius + 4);
      targetCtx.stroke();
    } else if (fId === 'face_scuba') {
      targetCtx.strokeStyle = '#38bdf8'; targetCtx.lineWidth = 2.5;
      targetCtx.beginPath(); targetCtx.moveTo(eyeX + 2, -player.radius + 6);
      targetCtx.lineTo(eyeX + 12, -player.radius + 6);
      targetCtx.lineTo(eyeX + 14, -player.radius - 12); targetCtx.stroke();
      targetCtx.fillStyle = '#0284c7'; targetCtx.fillRect(eyeX + 12, -player.radius - 14, 4, 3);
    } else if (fId === 'face_vr') {
      targetCtx.fillStyle = '#1e293b'; targetCtx.fillRect(eyeX - 14, -player.radius - 6, 28, 12);
      targetCtx.fillStyle = '#06b6d4'; targetCtx.fillRect(eyeX - 12, -player.radius - 2, 24, 4);
      targetCtx.strokeStyle = '#38bdf8'; targetCtx.lineWidth = 1; targetCtx.strokeRect(eyeX - 14, -player.radius - 6, 28, 12);
    } else if (fId === 'face_clown_nose') {
      targetCtx.fillStyle = '#ef4444';
      targetCtx.beginPath(); targetCtx.arc(eyeX, -player.radius + 3, 5.5, 0, Math.PI * 2); targetCtx.fill();
      targetCtx.fillStyle = '#fff'; targetCtx.beginPath(); targetCtx.arc(eyeX - 1.5, -player.radius + 1.5, 1.5, 0, Math.PI * 2); targetCtx.fill();
    } else if (fId === 'face_rose') {
      targetCtx.strokeStyle = '#15803d'; targetCtx.lineWidth = 2;
      targetCtx.beginPath(); targetCtx.moveTo(eyeX + 2, -player.radius + 6); targetCtx.lineTo(eyeX + 16, -player.radius + 8); targetCtx.stroke();
      targetCtx.fillStyle = '#e11d48';
      targetCtx.beginPath(); targetCtx.arc(eyeX + 16, -player.radius + 8, 4.5, 0, Math.PI * 2); targetCtx.fill();
    } else if (fId === 'face_scar') {
      targetCtx.strokeStyle = '#991b1b'; targetCtx.lineWidth = 2;
      targetCtx.beginPath(); targetCtx.moveTo(eyeX - 5, -player.radius - 8); targetCtx.lineTo(eyeX - 5, -player.radius + 8); targetCtx.stroke();
      targetCtx.lineWidth = 1;
      for (let sy = -6; sy <= 6; sy += 4) {
        targetCtx.beginPath(); targetCtx.moveTo(eyeX - 7, -player.radius + sy); targetCtx.lineTo(eyeX - 3, -player.radius + sy); targetCtx.stroke();
      }
    } else if (fId === 'face_toast') {
      targetCtx.fillStyle = '#b45309'; targetCtx.fillRect(eyeX + 2, -player.radius + 4, 15, 10);
      targetCtx.fillStyle = '#fef08a'; targetCtx.fillRect(eyeX + 3.5, -player.radius + 5.5, 12, 7);
    } else if (fId === 'face_gas_mask') {
      targetCtx.fillStyle = '#1e293b';
      targetCtx.beginPath(); targetCtx.arc(eyeX, -player.radius + 7, 7, 0, Math.PI * 2); targetCtx.fill();
      targetCtx.strokeStyle = '#64748b'; targetCtx.lineWidth = 1.5;
      targetCtx.stroke();
      targetCtx.beginPath(); targetCtx.moveTo(eyeX - 5, -player.radius + 7); targetCtx.lineTo(eyeX + 5, -player.radius + 7); targetCtx.stroke();
    } else if (fId === 'face_tissue') {
      targetCtx.fillStyle = '#f8fafc';
      targetCtx.fillRect(eyeX - 6, -player.radius + 3, 4, 13); targetCtx.fillRect(eyeX + 2, -player.radius + 3, 4, 16);
      targetCtx.strokeStyle = '#cbd5e1'; targetCtx.lineWidth = 1; targetCtx.strokeRect(eyeX - 6, -player.radius + 3, 4, 13); targetCtx.strokeRect(eyeX + 2, -player.radius + 3, 4, 16);
    } else if (fId === 'face_nosebleed') {
      targetCtx.strokeStyle = '#dc2626'; targetCtx.lineWidth = 3;
      targetCtx.beginPath(); targetCtx.moveTo(eyeX + 1, -player.radius + 3); targetCtx.quadraticCurveTo(eyeX + 4, -player.radius + 9, eyeX + 2, -player.radius + 15); targetCtx.stroke();
      targetCtx.fillStyle = '#ef4444'; targetCtx.beginPath(); targetCtx.arc(eyeX + 2, -player.radius + 16, 2.2, 0, Math.PI*2); targetCtx.fill();
    } else if (fId === 'face_pixel') {
      const px = 4; const cols = ['#0f172a','#475569','#94a3b8','#111827'];
      for (let yy=0; yy<2; yy++) for (let xx=0; xx<7; xx++) { targetCtx.fillStyle=cols[(xx+yy)%cols.length]; targetCtx.fillRect(eyeX-14+xx*px,-player.radius-5+yy*px,px,px); }
    } else if (fId === 'face_teeth') {
      targetCtx.fillStyle = '#fff'; targetCtx.fillRect(eyeX - 7, -player.radius + 5, 14, 8);
      targetCtx.strokeStyle = '#94a3b8'; targetCtx.lineWidth=1; targetCtx.strokeRect(eyeX - 7, -player.radius + 5, 14, 8);
      targetCtx.beginPath(); targetCtx.moveTo(eyeX, -player.radius+5); targetCtx.lineTo(eyeX,-player.radius+13); targetCtx.stroke();
    } else if (fId === 'face_pacifier') {
      targetCtx.fillStyle='#60a5fa'; targetCtx.beginPath(); targetCtx.ellipse(eyeX,-player.radius+8,9,6,0,0,Math.PI*2); targetCtx.fill();
      targetCtx.fillStyle='#f8fafc'; targetCtx.beginPath(); targetCtx.arc(eyeX,-player.radius+8,3.5,0,Math.PI*2); targetCtx.fill();
    } else if (fId === 'face_oxygen') {
      targetCtx.fillStyle='rgba(186,230,253,0.55)'; targetCtx.beginPath(); targetCtx.ellipse(eyeX,-player.radius+6,12,10,0,0,Math.PI*2); targetCtx.fill();
      targetCtx.strokeStyle='#38bdf8'; targetCtx.lineWidth=2; targetCtx.stroke();
      targetCtx.strokeStyle='#94a3b8'; targetCtx.beginPath(); targetCtx.moveTo(eyeX+10,-player.radius+9); targetCtx.lineTo(eyeX+18,-player.radius+15); targetCtx.stroke();
    } else if (fId === 'face_birdmark') {
      targetCtx.fillStyle='#f8fafc'; targetCtx.beginPath(); targetCtx.ellipse(eyeX+7,-player.radius+2,5,8,0.5,0,Math.PI*2); targetCtx.fill();
      targetCtx.fillStyle='#d1d5db'; targetCtx.beginPath(); targetCtx.arc(eyeX+9,-player.radius-2,2,0,Math.PI*2); targetCtx.fill();
    }

    // 頭飾完整向量繪製
    const hId = cosmetics.hat;
    if (hId === 'hat_santa') {
      targetCtx.fillStyle = '#dc2626';
      targetCtx.beginPath();
      targetCtx.moveTo(-16, -player.radius * 1.6);
      targetCtx.quadraticCurveTo(-4, -player.radius * 2.5, 12, -player.radius * 2.3);
      targetCtx.lineTo(16, -player.radius * 1.6);
      targetCtx.closePath(); targetCtx.fill();
      targetCtx.fillStyle = '#fff';
      targetCtx.beginPath(); targetCtx.arc(14, -player.radius * 2.3, 4.5, 0, Math.PI * 2); targetCtx.fill();
      for (let bx = -16; bx <= 16; bx += 5.5) {
        targetCtx.beginPath(); targetCtx.arc(bx, -player.radius * 1.65, 3.5, 0, Math.PI * 2); targetCtx.fill();
      }
    } else if (hId === 'hat_tophat') {
      targetCtx.fillStyle = '#0f172a';
      targetCtx.fillRect(-18, -player.radius * 1.7, 36, 4);
      targetCtx.fillRect(-11, -player.radius * 2.4, 22, 24);
      targetCtx.fillStyle = '#ef4444';
      targetCtx.fillRect(-11, -player.radius * 1.8, 22, 3);
    } else if (hId === 'hat_sprout') {
      targetCtx.strokeStyle = '#22c55e'; targetCtx.lineWidth = 2.5;
      targetCtx.beginPath(); targetCtx.moveTo(0, -player.radius * 1.7); targetCtx.lineTo(0, -player.radius * 2.1); targetCtx.stroke();
      targetCtx.fillStyle = '#22c55e';
      targetCtx.beginPath(); targetCtx.ellipse(-4, -player.radius * 2.2, 5, 2.5, -0.5, 0, Math.PI * 2); targetCtx.fill();
      targetCtx.beginPath(); targetCtx.ellipse(4, -player.radius * 2.2, 5, 2.5, 0.5, 0, Math.PI * 2); targetCtx.fill();
    } else if (hId === 'hat_party') {
      targetCtx.fillStyle = '#facc15';
      targetCtx.beginPath(); targetCtx.moveTo(-10, -player.radius * 1.7); targetCtx.lineTo(0, -player.radius * 2.5); targetCtx.lineTo(10, -player.radius * 1.7); targetCtx.closePath(); targetCtx.fill();
    } else if (hId === 'hat_crown') {
      targetCtx.fillStyle = '#facc15';
      targetCtx.beginPath();
      targetCtx.moveTo(-10, -player.radius * 1.7);
      targetCtx.lineTo(-12, -player.radius * 2.1); targetCtx.lineTo(-5, -player.radius * 1.9);
      targetCtx.lineTo(0, -player.radius * 2.3);
      targetCtx.lineTo(5, -player.radius * 1.9); targetCtx.lineTo(12, -player.radius * 2.1);
      targetCtx.lineTo(10, -player.radius * 1.7);
      targetCtx.closePath(); targetCtx.fill();
    } else if (hId === 'hat_cat') {
      targetCtx.fillStyle = '#0f172a';
      targetCtx.beginPath(); targetCtx.moveTo(-14, -player.radius * 1.6); targetCtx.lineTo(-10, -player.radius * 2.3); targetCtx.lineTo(-4, -player.radius * 1.8); targetCtx.fill();
      targetCtx.beginPath(); targetCtx.moveTo(14, -player.radius * 1.6); targetCtx.lineTo(10, -player.radius * 2.3); targetCtx.lineTo(4, -player.radius * 1.8); targetCtx.fill();
    } else if (hId === 'hat_rabbit') {
      targetCtx.fillStyle = '#ffffff';
      targetCtx.beginPath(); targetCtx.ellipse(-7, -player.radius * 2.2, 4, 12, -0.1, 0, Math.PI * 2); targetCtx.fill();
      targetCtx.beginPath(); targetCtx.ellipse(7, -player.radius * 2.2, 4, 12, 0.1, 0, Math.PI * 2); targetCtx.fill();
    } else if (hId === 'hat_cap_red' || hId === 'hat_cap_blue' || hId === 'hat_cap_black') {
      targetCtx.fillStyle = hId === 'hat_cap_red' ? '#ef4444' : (hId === 'hat_cap_blue' ? '#3b82f6' : '#0f172a');
      targetCtx.beginPath(); targetCtx.arc(0, -player.radius * 1.6, 14, Math.PI, 0); targetCtx.fill();
      targetCtx.fillRect(player.facing === 1 ? 0 : -20, -player.radius * 1.6, 20, 3.5);
    } else if (hId === 'hat_halo') {
      targetCtx.strokeStyle = '#fef08a'; targetCtx.lineWidth = 2.5;
      targetCtx.beginPath(); targetCtx.ellipse(0, -player.radius * 2.2, 12, 4, 0, 0, Math.PI * 2); targetCtx.stroke();
    } else if (hId === 'hat_pompadour') {
      targetCtx.fillStyle = '#0f172a';
      targetCtx.beginPath();
      targetCtx.moveTo(-12, -player.radius * 1.6);
      targetCtx.quadraticCurveTo(player.facing * 18, -player.radius * 2.5, player.facing * 20, -player.radius * 1.9);
      targetCtx.quadraticCurveTo(player.facing * 10, -player.radius * 1.5, 0, -player.radius * 1.6);
      targetCtx.closePath(); targetCtx.fill();
    } else if (hId === 'hat_afro') {
      targetCtx.fillStyle = '#1e293b';
      targetCtx.beginPath();
      targetCtx.arc(0, -player.radius * 1.9, 18, 0, Math.PI * 2); targetCtx.fill();
    } else if (hId === 'hat_head_shades') {
      targetCtx.fillStyle = '#0f172a';
      targetCtx.fillRect(-12, -player.radius * 1.9, 24, 6);
      targetCtx.fillStyle = '#38bdf8'; targetCtx.fillRect(-9, -player.radius * 1.8, 8, 3); targetCtx.fillRect(1, -player.radius * 1.8, 8, 3);
    } else if (hId === 'hat_helmet') {
      targetCtx.fillStyle = '#64748b';
      targetCtx.beginPath(); targetCtx.arc(0, -player.radius * 1.4, 16, Math.PI, 0); targetCtx.fill();
      targetCtx.fillStyle = '#0f172a'; targetCtx.fillRect(-12, -player.radius * 1.5, 24, 4);
    } else if (hId === 'hat_dog') {
      targetCtx.fillStyle = '#d97706';
      targetCtx.beginPath(); targetCtx.ellipse(-12, -player.radius * 1.7, 5, 10, -0.4, 0, Math.PI * 2); targetCtx.fill();
      targetCtx.beginPath(); targetCtx.ellipse(12, -player.radius * 1.7, 5, 10, 0.4, 0, Math.PI * 2); targetCtx.fill();
    } else if (hId === 'hat_devil') {
      targetCtx.fillStyle = '#dc2626';
      targetCtx.beginPath(); targetCtx.moveTo(-11, -player.radius * 1.6); targetCtx.quadraticCurveTo(-14, -player.radius * 2.2, -7, -player.radius * 2.2); targetCtx.lineTo(-5, -player.radius * 1.6); targetCtx.fill();
      targetCtx.beginPath(); targetCtx.moveTo(11, -player.radius * 1.6); targetCtx.quadraticCurveTo(14, -player.radius * 2.2, 7, -player.radius * 2.2); targetCtx.lineTo(5, -player.radius * 1.6); targetCtx.fill();
    } else if (hId === 'hat_viking') {
      targetCtx.fillStyle = '#94a3b8'; targetCtx.beginPath(); targetCtx.arc(0, -player.radius * 1.6, 14, Math.PI, 0); targetCtx.fill();
      targetCtx.fillStyle = '#f8fafc';
      targetCtx.beginPath(); targetCtx.moveTo(-12, -player.radius * 1.7); targetCtx.quadraticCurveTo(-20, -player.radius * 2.3, -15, -player.radius * 2.4); targetCtx.lineTo(-10, -player.radius * 1.9); targetCtx.fill();
      targetCtx.beginPath(); targetCtx.moveTo(12, -player.radius * 1.7); targetCtx.quadraticCurveTo(20, -player.radius * 2.3, 15, -player.radius * 2.4); targetCtx.lineTo(10, -player.radius * 1.9); targetCtx.fill();
    } else if (hId === 'hat_chef') {
      targetCtx.fillStyle = '#ffffff';
      targetCtx.fillRect(-11, -player.radius * 1.8, 22, 6);
      targetCtx.beginPath(); targetCtx.arc(-7, -player.radius * 2.1, 7, 0, Math.PI * 2); targetCtx.arc(0, -player.radius * 2.3, 8, 0, Math.PI * 2); targetCtx.arc(7, -player.radius * 2.1, 7, 0, Math.PI * 2); targetCtx.fill();
    } else if (hId === 'hat_bandana') {
      targetCtx.fillStyle = '#fff'; targetCtx.fillRect(-15, -player.radius * 1.7, 30, 6);
      targetCtx.fillStyle = '#dc2626'; targetCtx.beginPath(); targetCtx.arc(0, -player.radius * 1.7 + 3, 2.5, 0, Math.PI * 2); targetCtx.fill();
      targetCtx.fillStyle = '#fff';
      targetCtx.beginPath(); targetCtx.moveTo(-15, -player.radius * 1.7); targetCtx.lineTo(-21, -player.radius * 1.4); targetCtx.lineTo(-15, -player.radius * 1.3); targetCtx.fill();
    } else if (hId === 'hat_straw') {
      targetCtx.fillStyle = '#fde047';
      targetCtx.beginPath(); targetCtx.ellipse(0, -player.radius * 1.65, 20, 5, 0, 0, Math.PI * 2); targetCtx.fill();
      targetCtx.beginPath(); targetCtx.arc(0, -player.radius * 1.7, 10, Math.PI, 0); targetCtx.fill();
      targetCtx.fillStyle = '#dc2626'; targetCtx.fillRect(-10, -player.radius * 1.75, 20, 3);
    } else if (hId === 'hat_poop') {
      targetCtx.fillStyle='#78350f';
      [[0,-1.78,12],[-5,-2.03,9],[2,-2.23,6]].forEach(([x,m,r])=>{targetCtx.beginPath();targetCtx.arc(x,player.radius*m,r,0,Math.PI*2);targetCtx.fill();});
      targetCtx.fillStyle='#fff'; targetCtx.beginPath(); targetCtx.arc(-4,-player.radius*2.22,2,0,Math.PI*2); targetCtx.arc(4,-player.radius*2.22,2,0,Math.PI*2); targetCtx.fill();
    } else if (hId === 'hat_potlid') {
      targetCtx.fillStyle='#94a3b8'; targetCtx.beginPath(); targetCtx.ellipse(0,-player.radius*1.72,21,6,0,0,Math.PI*2); targetCtx.fill();
      targetCtx.strokeStyle='#475569'; targetCtx.lineWidth=2; targetCtx.stroke(); targetCtx.fillStyle='#334155'; targetCtx.fillRect(-4,-player.radius*2.0,8,7);
    } else if (hId === 'hat_arrow') {
      targetCtx.strokeStyle='#92400e'; targetCtx.lineWidth=4; targetCtx.beginPath(); targetCtx.moveTo(-22,-player.radius*1.95); targetCtx.lineTo(22,-player.radius*1.55); targetCtx.stroke();
      targetCtx.fillStyle='#ef4444'; targetCtx.beginPath(); targetCtx.moveTo(22,-player.radius*1.55); targetCtx.lineTo(13,-player.radius*1.67); targetCtx.lineTo(16,-player.radius*1.43); targetCtx.closePath(); targetCtx.fill();
    } else if (hId === 'hat_birdnest') {
      targetCtx.strokeStyle='#92400e'; targetCtx.lineWidth=4; targetCtx.beginPath(); targetCtx.ellipse(0,-player.radius*1.75,18,6,0,0,Math.PI*2); targetCtx.stroke();
      targetCtx.fillStyle='#fef3c7'; [-7,0,7].forEach(x=>{targetCtx.beginPath();targetCtx.ellipse(x,-player.radius*1.82,4,6,0,0,Math.PI*2);targetCtx.fill();});
    } else if (hId === 'hat_bird_perch') {
      targetCtx.fillStyle='#e5e7eb'; targetCtx.beginPath(); targetCtx.ellipse(0,-player.radius*2.0,12,8,0,0,Math.PI*2); targetCtx.fill();
      targetCtx.fillStyle='#64748b'; targetCtx.beginPath(); targetCtx.arc(8,-player.radius*2.12,6,0,Math.PI*2); targetCtx.fill();
      targetCtx.fillStyle='#f59e0b'; targetCtx.beginPath(); targetCtx.moveTo(14,-player.radius*2.12); targetCtx.lineTo(21,-player.radius*2.08); targetCtx.lineTo(14,-player.radius*2.02); targetCtx.closePath(); targetCtx.fill();
      targetCtx.strokeStyle='#f59e0b'; targetCtx.lineWidth=2; targetCtx.beginPath(); targetCtx.moveTo(-4,-player.radius*1.82); targetCtx.lineTo(-4,-player.radius*1.68); targetCtx.moveTo(4,-player.radius*1.82); targetCtx.lineTo(4,-player.radius*1.68); targetCtx.stroke();
    } else if (hId === 'hat_space_junk') {
      targetCtx.fillStyle='rgba(186,230,253,0.18)'; targetCtx.strokeStyle='#e2e8f0'; targetCtx.lineWidth=2.5; targetCtx.beginPath(); targetCtx.arc(0,-player.radius*1.45,25,Math.PI,0); targetCtx.fill(); targetCtx.stroke();
      targetCtx.strokeStyle='#94a3b8'; targetCtx.beginPath(); targetCtx.moveTo(12,-player.radius*2.15); targetCtx.lineTo(17,-player.radius*2.5); targetCtx.stroke(); targetCtx.fillStyle='#ef4444'; targetCtx.beginPath(); targetCtx.arc(17,-player.radius*2.52,3,0,Math.PI*2); targetCtx.fill();
    } else if (hId === 'hat_hardhat') {
      targetCtx.fillStyle='#facc15'; targetCtx.beginPath(); targetCtx.arc(0,-player.radius*1.62,17,Math.PI,0); targetCtx.fill(); targetCtx.fillRect(-20,-player.radius*1.64,40,4); targetCtx.strokeStyle='#a16207'; targetCtx.lineWidth=2; targetCtx.strokeRect(-20,-player.radius*1.64,40,4);
    } else if (hId === 'hat_fair_tea') {
      const ty=-player.radius*1.82;
      // V74-6: handle-less Japanese yunomi, blue-white glaze + green tea.
      targetCtx.fillStyle='#eef6f3'; targetCtx.strokeStyle='#7c9aa5'; targetCtx.lineWidth=1.5;
      targetCtx.beginPath();targetCtx.moveTo(-12,ty-7);targetCtx.quadraticCurveTo(-11,ty+8,-8,ty+11);targetCtx.quadraticCurveTo(0,ty+14,8,ty+11);targetCtx.quadraticCurveTo(11,ty+8,12,ty-7);targetCtx.closePath();targetCtx.fill();targetCtx.stroke();
      targetCtx.strokeStyle='#256b78';targetCtx.lineWidth=2.2;targetCtx.beginPath();targetCtx.moveTo(-11,ty+2);targetCtx.quadraticCurveTo(-2,ty-1,11,ty+3);targetCtx.stroke();
      targetCtx.fillStyle='#9fb66a';targetCtx.beginPath();targetCtx.ellipse(0,ty-7,11,3.1,0,0,Math.PI*2);targetCtx.fill();targetCtx.strokeStyle='#66846f';targetCtx.lineWidth=1;targetCtx.stroke();
      targetCtx.strokeStyle='rgba(255,255,255,.65)'; targetCtx.lineWidth=1.2; targetCtx.beginPath(); targetCtx.moveTo(-3,ty-9); targetCtx.quadraticCurveTo(-7,ty-15,-2,ty-19); targetCtx.moveTo(4,ty-9); targetCtx.quadraticCurveTo(8,ty-15,4,ty-20); targetCtx.stroke();
    }
  }

  // V76-4.0.3: cosmetic icon mode ends here. The exact same hat/face drawing above is reused,
  // but player body/name/status/action VFX are intentionally omitted from the icon.
  if (cosmeticOnly) {
    targetCtx.restore();
    return;
  }

  // V76-4.1 frontend portrait mode: draw the real body/cosmetics, but stop before gameplay-only
  // arrows, name capsules, serve countdowns, action telegraphs and particle spawning.
  if (player.presentationOnly) {
    targetCtx.restore();
    return;
  }

// 🌟 2. 向上微升粒子生成判定
  if (highestRank3Tier) {
    let haloGlow = '#ffffff';
    let pCount = 1;
    if (highestRank3Tier === 'SR') {
      haloGlow = '#ef4444';
      pCount = 3;
    } else if (highestRank3Tier === 'SSR') {
      haloGlow = '#facc15';
      pCount = 4;
    }

    if (typeof gameFrame !== 'undefined' && gameFrame % 4 === 0 && typeof visualEffects !== 'undefined') {
      for (let k = 0; k < pCount; k++) {
        visualEffects.push({
          type: 'skin_mote',
          color: haloGlow,
          x: player.x + (Math.random() - 0.5) * (player.radius * 2),
          y: WORLD.FLOOR_Y - Math.random() * 6,
          vx: (Math.random() - 0.5) * 0.4,
          vy: -Math.random() * 1.2 - 0.6,
          size: 2.2,
          life: 24,
          maxLife: 24
        });
      }
    }
  }

  // V73：身體可以被沙灘球撞到翻一圈，但箭頭/名字屬於 UI，不跟著旋轉。
  if(_venueSpinAngle)targetCtx.setTransform(_bodyBaseTransform);

  // 🌟 主控箭頭指標：嚴格只繪製在「本機操控的球員（NET.mySlot）」頭頂！

  // 🌟 主控箭頭指標：嚴格只繪製在「本機操控的球員（NET.mySlot）」頭頂！
  const isMyLocalHero = (typeof NET !== 'undefined' && typeof NET.mySlot !== 'undefined')
    ? (player.slotIndex === NET.mySlot)
    : player.isUser;

// 🌟 主控玩家專屬金色箭頭（保留在頭頂上方，方便認清自己）
  if (isMyLocalHero) {
    targetCtx.fillStyle = '#facc15'; targetCtx.beginPath();
    targetCtx.moveTo(-5, -player.radius * 2 - 8); targetCtx.lineTo(5, -player.radius * 2 - 8); targetCtx.lineTo(0, -player.radius * 2 - 2);
    targetCtx.fill();
  }

  // V74-1: final three seconds of the 8-second serve rule, anchored to the server's head.
  // Only 3 / 2 / 1 are shown; the number follows the player instead of living in screen HUD space.
  if (typeof serveState !== 'undefined' && serveState.active && serveState.currentServer === player &&
      Number.isFinite(serveState.ruleFramesRemaining) && serveState.ruleGraceFrames <= 0 && serveState.ruleFramesRemaining > 0 && serveState.ruleFramesRemaining <= 180) {
    const serveCount = Math.max(1, Math.ceil(serveState.ruleFramesRemaining / 60));
    targetCtx.save();
    const _countMirror = (typeof NET !== 'undefined' && NET.isMultiplayer && !NET.isHost && NET.mode === 'PVP');
    if (_countMirror) targetCtx.scale(-1, 1);
    targetCtx.fillStyle = '#ef4444';
    targetCtx.strokeStyle = 'rgba(15,23,42,.9)';
    targetCtx.lineWidth = 3;
    targetCtx.font = `1000 ${Math.max(20, Math.round(player.radius * 0.82))}px -apple-system, sans-serif`;
    targetCtx.textAlign = 'center'; targetCtx.textBaseline = 'middle';
    const countY = -player.radius * 2 - 25;
    targetCtx.strokeText(String(serveCount), 0, countY);
    targetCtx.fillText(String(serveCount), 0, countY);
    targetCtx.restore();
  }

  // 🌟 角色 ID 膠囊標籤：全面移至「角色腳底正下方」，保持空中跳躍視野清爽
  const displayName = player.playerName || (player.card ? player.card.name : 'Player');
  targetCtx.save();
  targetCtx.font = '900 10px -apple-system, sans-serif';
  const nameWidth = targetCtx.measureText(displayName).width;
  const tagY = 8; // 腳底 Y 軸下方 8 像素

  // 腳底微型底框
  targetCtx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  targetCtx.beginPath();
  targetCtx.roundRect(-nameWidth / 2 - 5, tagY, nameWidth + 10, 13, 4);
  targetCtx.fill();
  targetCtx.strokeStyle = isMyLocalHero ? '#facc15' : (player.isLeft ? '#38bdf8' : '#f43f5e');
  targetCtx.lineWidth = 1.2;
  targetCtx.stroke();

  // 玩家 ID 文字：Guest 的整個世界會水平鏡像，但文字本身永遠保持可讀。
  targetCtx.fillStyle = isMyLocalHero ? '#fef08a' : '#cbd5e1';
  targetCtx.textAlign = 'center';
  targetCtx.textBaseline = 'middle';
  const _guestTextMirror = (typeof NET !== 'undefined' && NET.isMultiplayer && !NET.isHost && NET.mode === 'PVP');
  if (_guestTextMirror) targetCtx.scale(-1, 1);
  targetCtx.fillText(displayName, 0, tagY + 6.5);
  if (_guestTextMirror) targetCtx.scale(-1, 1);
  targetCtx.restore();

  targetCtx.restore();
  drawPlayerStatusEmotes(player, targetCtx);

  if (player.swingTimer > 0) {
    targetCtx.save();
    targetCtx.translate(player.x, player.y - player.radius * 1.3);
    const progress = 1 - (player.swingTimer / 12);
    const topAngle = -Math.PI * 0.38, bottomAngle = Math.PI * 0.28;
    const currentStart = topAngle + (bottomAngle - topAngle) * Math.max(0, progress - 0.3);
    const currentEnd = topAngle + (bottomAngle - topAngle) * progress;

    targetCtx.beginPath();
    if (player.facing === 1) targetCtx.arc(0, 0, 68, currentStart, currentEnd, false);
    else targetCtx.arc(0, 0, 68, Math.PI - currentStart, Math.PI - currentEnd, true);

    targetCtx.strokeStyle = `rgba(244, 63, 94, ${player.swingTimer / 12})`;
    targetCtx.lineWidth = 14; targetCtx.lineCap = 'round'; targetCtx.stroke();
    targetCtx.strokeStyle = `rgba(255, 255, 255, ${(player.swingTimer / 12) * 0.85})`;
    targetCtx.lineWidth = 4; targetCtx.stroke(); targetCtx.restore();
  }

  if (player.thrustTimer > 0) {
    targetCtx.save();
    const startX = player.x + (player.facing * player.radius);
    const startY = player.y - player.radius * 1.1;
    const endX = player.thrustTargetX || (startX + player.facing * 75);
    const endY = player.thrustTargetY || startY;
    const alpha = player.thrustTimer / 12;

    targetCtx.beginPath(); targetCtx.moveTo(startX, startY); targetCtx.lineTo(endX, endY);
    targetCtx.strokeStyle = `rgba(56, 189, 248, ${alpha * 0.9})`;
    targetCtx.lineWidth = 6; targetCtx.lineCap = 'round'; targetCtx.stroke(); targetCtx.restore();
  }
}

function drawPlayerStatusEmotes(player, targetCtx) {
  targetCtx.save();
  if (player.jumpExhaustion < 0.70) {
    const dropOffset = (gameFrame * 0.8) % 12;
    targetCtx.fillStyle = '#38bdf8'; targetCtx.beginPath();
    targetCtx.arc(player.x + 16, player.y - player.radius * 2 + dropOffset, 2.5, 0, Math.PI * 2);
    targetCtx.fill();
  }
  if (player.depressedRallies > 0) {
    targetCtx.strokeStyle = '#4338ca'; targetCtx.lineWidth = 2.0; targetCtx.beginPath();
    for (let lx = -10; lx <= 10; lx += 5) {
      targetCtx.moveTo(player.x + lx, player.y - player.radius * 2 - 30);
      targetCtx.lineTo(player.x + lx, player.y - player.radius * 2 - 12);
    }
    targetCtx.stroke();
  }
  if (player.excitedRallies > 0) {
    targetCtx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    const steamY = (gameFrame * 0.6) % 16;
    targetCtx.beginPath();
    targetCtx.arc(player.x - 6, player.y - player.radius * 2 - 18 - steamY, 3.5, 0, Math.PI * 2);
    targetCtx.arc(player.x + 6, player.y - player.radius * 2 - 22 - steamY, 4.5, 0, Math.PI * 2);
    targetCtx.fill();
  }

  if ((player.mudDebuffRallies || 0) > 0 || player.mudDebuffTimer > 0) {
    targetCtx.fillStyle = '#78350f'; targetCtx.beginPath();
    targetCtx.arc(player.x - 6, player.y - player.radius * 1.8, 5, 0, Math.PI * 2);
    targetCtx.arc(player.x + 8, player.y - player.radius * 1.7, 4.5, 0, Math.PI * 2);
    targetCtx.fill();
    targetCtx.strokeStyle = '#a16207'; targetCtx.lineWidth = 3; targetCtx.lineCap = 'round';
    for (let i = -1; i <= 1; i++) {
      const dripX = player.x + (i * 12);
      const dripProgress = ((gameFrame * 0.8) + (i * 8)) % 22;
      targetCtx.beginPath();
      targetCtx.moveTo(dripX, player.y - player.radius);
      targetCtx.lineTo(dripX, player.y - player.radius + dripProgress);
      targetCtx.stroke();
      targetCtx.beginPath();
      targetCtx.arc(dripX, player.y - player.radius + dripProgress + 2, 2, 0, Math.PI * 2);
      targetCtx.fill();
    }
    // V29：只保留泥污視覺，不公開剩餘 Rally。玩家自己記狀態。
  }

  // V74-19 Gravity Soft Wall: feathered membrane + inward collapsing luminous rings.
  const swA = player.softWallVfxAlpha || 0;
  if (swA > 0.004) {
    const cx=player.x, cy=player.y-player.radius*.92, R=player.radius*2.345;
    targetCtx.save(); targetCtx.globalCompositeOperation='lighter';
    const membrane=targetCtx.createRadialGradient(cx,cy,R*.30,cx,cy,R);
    membrane.addColorStop(0,'rgba(255,255,255,0)'); membrane.addColorStop(.60,`rgba(240,253,250,${.025*swA})`);
    membrane.addColorStop(.82,`rgba(255,255,255,${.105*swA})`); membrane.addColorStop(1,'rgba(255,255,255,0)');
    targetCtx.fillStyle=membrane; targetCtx.shadowColor='#e6fffb'; targetCtx.shadowBlur=32;
    targetCtx.beginPath(); targetCtx.ellipse(cx,cy,R,R*.86,0,0,Math.PI*2); targetCtx.fill();
    for(let i=0;i<3;i++){
      const phase=((gameFrame*.018+i/3)%1), rr=R*(1-phase*.82), alpha=swA*Math.sin(Math.PI*phase)*.62;
      targetCtx.globalAlpha=Math.max(0,alpha); targetCtx.strokeStyle=i===1?'#ffffff':'#ccfbf1'; targetCtx.lineWidth=1.4+1.2*(1-phase);
      targetCtx.shadowColor='#ffffff'; targetCtx.shadowBlur=14; targetCtx.beginPath(); targetCtx.ellipse(cx,cy,rr,rr*.84,0,0,Math.PI*2); targetCtx.stroke();
    }
    // subtle refractive shimmer proxy: displaced translucent arcs, never a hard HUD ring.
    for(let i=0;i<5;i++){const a=gameFrame*.021+i*1.27,rr=R*(.48+(i%3)*.14);targetCtx.globalAlpha=.10*swA;targetCtx.strokeStyle='#f8fafc';targetCtx.lineWidth=5;targetCtx.shadowBlur=18;targetCtx.beginPath();targetCtx.arc(cx+Math.sin(a)*3,cy+Math.cos(a*.7)*2,rr,a,a+1.15);targetCtx.stroke();}
    targetCtx.restore();
  }

  if (player.godspeedCharges > 0) {
    const cx=player.x,cy=player.y-player.radius,a=(gameFrame*.075)%(Math.PI*2); targetCtx.save();
    targetCtx.globalCompositeOperation='lighter'; targetCtx.shadowColor='#facc15';
    // Wide feather halo -> medium glow -> razor-thin champagne core.
    targetCtx.globalAlpha=.055;targetCtx.strokeStyle='#fbbf24';targetCtx.lineWidth=38;targetCtx.shadowBlur=38;targetCtx.beginPath();targetCtx.arc(cx,cy,player.radius*1.62,0,Math.PI*2);targetCtx.stroke();
    targetCtx.globalAlpha=.13;targetCtx.strokeStyle='#fde68a';targetCtx.lineWidth=20;targetCtx.shadowBlur=30;targetCtx.beginPath();targetCtx.arc(cx,cy,player.radius*1.53,0,Math.PI*2);targetCtx.stroke();
    targetCtx.globalAlpha=.76;targetCtx.strokeStyle='#fff7d6';targetCtx.lineWidth=2.0;targetCtx.shadowBlur=16;targetCtx.beginPath();targetCtx.arc(cx,cy,player.radius*1.43,a,a+5.25);targetCtx.stroke();
    targetCtx.globalAlpha=.30;targetCtx.strokeStyle='#facc15';targetCtx.lineWidth=5;targetCtx.shadowBlur=22;targetCtx.beginPath();targetCtx.arc(cx,cy,player.radius*1.78,-a*.55,-a*.55+3.7);targetCtx.stroke();
    for(let i=0;i<8;i++){const q=a+i*.83,rr=player.radius*(1.72+(i%3)*.18);targetCtx.globalAlpha=.16+(i%2)*.12;targetCtx.fillStyle=i%3?'#fde68a':'#fffdf2';targetCtx.beginPath();targetCtx.arc(cx+Math.cos(q)*rr,cy+Math.sin(q)*rr*.72,1.2+(i%3)*.5,0,Math.PI*2);targetCtx.fill();}
    targetCtx.restore();
  }

  if (player.greaseDebuffRallies > 0) {
    const oilDrip = (gameFrame * 0.7) % 18;
    targetCtx.save();
    targetCtx.globalAlpha=.72; targetCtx.fillStyle='#b45309'; targetCtx.shadowColor='#f59e0b'; targetCtx.shadowBlur=7;
    targetCtx.beginPath();
    targetCtx.ellipse(player.x - 5, player.y - player.radius * 2 + oilDrip, 4.2, 6.5, .15, 0, Math.PI * 2);
    targetCtx.ellipse(player.x + 8, player.y - player.radius * 1.6 + (oilDrip * 0.8), 3.5, 5.2, -.2, 0, Math.PI * 2);
    targetCtx.fill();
    targetCtx.globalAlpha=.34; targetCtx.strokeStyle='#fde68a'; targetCtx.lineWidth=1.4; targetCtx.beginPath();targetCtx.arc(player.x-6,player.y-player.radius*1.55,player.radius*.72,-2.7,-.25);targetCtx.stroke();
    targetCtx.restore();
  }
  targetCtx.restore();
}

function drawStadiumAtmosphere() {
  const venue = (typeof getCurrentVenue === 'function') ? getCurrentVenue() : {id:'stadium'};
  ctx.save();
  if (venue.id === 'moon') {
    const sky = ctx.createLinearGradient(0,0,0,WORLD.FLOOR_Y); sky.addColorStop(0,'#020617'); sky.addColorStop(1,'#111827');
    ctx.fillStyle=sky; ctx.fillRect(0,0,WORLD.WIDTH,WORLD.FLOOR_Y);
    ctx.fillStyle='#e2e8f0'; for(let x=80;x<WORLD.WIDTH;x+=173){ const y=55+((x*37)%300); ctx.globalAlpha=.35+((x%7)/14); ctx.fillRect(x,y,2,2); }
    // V34 月面基地：天空看到的是地球，不是第二顆月球。
    ctx.globalAlpha=1;
    const earthX=WORLD.NET_X+760, earthY=150, earthR=112;
    ctx.fillStyle='#e2e8f0'; ctx.beginPath(); ctx.arc(earthX,earthY,earthR+5,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#2563eb'; ctx.beginPath(); ctx.arc(earthX,earthY,earthR,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#67e8f9'; ctx.beginPath(); ctx.arc(earthX-28,earthY-15,42,0.2,2.5); ctx.arc(earthX+42,earthY+28,28,2.8,5.8); ctx.fill();
    ctx.fillStyle='#86efac'; ctx.beginPath(); ctx.ellipse(earthX-38,earthY-28,27,14,-.4,0,Math.PI*2); ctx.ellipse(earthX+28,earthY+18,22,34,.7,0,Math.PI*2); ctx.fill();
    // V35：地球退到背景：降飽和／降亮度，像隔著月面基地玻璃與薄霧。
    ctx.save(); ctx.globalAlpha=.42; ctx.fillStyle='#64748b'; ctx.beginPath(); ctx.arc(earthX,earthY,earthR,0,Math.PI*2); ctx.fill(); ctx.globalAlpha=.16; ctx.fillStyle='#e2e8f0'; ctx.beginPath(); ctx.arc(earthX-24,earthY-30,earthR*.78,0,Math.PI*2); ctx.fill(); ctx.restore();
    // 基地框架＋頂燈，延續無盡模式的工業燈光層次。
    ctx.strokeStyle='#334155';ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(WORLD.LEFT-120,275);ctx.lineTo(WORLD.RIGHT+120,275);ctx.stroke();
    for(let x=WORLD.LEFT-40;x<=WORLD.RIGHT+40;x+=280){ctx.fillStyle='#475569';ctx.fillRect(x-22,265,44,12);ctx.fillStyle='rgba(186,230,253,.10)';ctx.beginPath();ctx.moveTo(x-18,277);ctx.lineTo(x+18,277);ctx.lineTo(x+105,500);ctx.lineTo(x-105,500);ctx.closePath();ctx.fill();}
    ctx.strokeStyle='#38bdf8'; ctx.lineWidth=3; ctx.strokeRect(WORLD.LEFT-90,300,WORLD.RIGHT-WORLD.LEFT+180,250);
    ctx.fillStyle='rgba(14,165,233,.06)'; ctx.fillRect(WORLD.LEFT-90,300,WORLD.RIGHT-WORLD.LEFT+180,250);
  } else if (venue.id === 'warehouse') {
    // V42 工業倉庫：碰撞斜頂改成「倉庫本體的中央鋸齒/斜頂跨間」，讓可破屋頂有建築理由。
    const wg=ctx.createLinearGradient(0,0,0,WORLD.FLOOR_Y);wg.addColorStop(0,'#09111a');wg.addColorStop(1,'#202a34');ctx.fillStyle=wg;ctx.fillRect(0,0,WORLD.WIDTH,WORLD.FLOOR_Y);
    ctx.fillStyle='#151c24';ctx.fillRect(0,300,WORLD.WIDTH,WORLD.FLOOR_Y-300);
    for(let x=70;x<WORLD.WIDTH;x+=420){ctx.fillStyle='#263341';ctx.fillRect(x,330,245,250);ctx.strokeStyle='#435466';ctx.lineWidth=4;for(let y=365;y<565;y+=42){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+245,y);ctx.stroke();}ctx.fillStyle='rgba(125,211,252,.10)';ctx.fillRect(x+28,350,62,105);ctx.fillRect(x+112,350,62,105);}
    for(let x=250;x<WORLD.WIDTH;x+=520){ctx.fillStyle='#5b3a22';ctx.fillRect(x,500,95,82);ctx.strokeStyle='#8b5e34';ctx.lineWidth=3;ctx.strokeRect(x,500,95,82);ctx.beginPath();ctx.moveTo(x,500);ctx.lineTo(x+95,582);ctx.moveTo(x+95,500);ctx.lineTo(x,582);ctx.stroke();}
    const peakX=WORLD.NET_X, peakY=105, baseY=285, half=500;
    // 中央跨間的兩側承重牆/鋼柱，清楚告訴玩家這塊斜頂屬於哪個結構。
    ctx.fillStyle='#202b36';ctx.fillRect(peakX-half-22,baseY,44,WORLD.FLOOR_Y-baseY);ctx.fillRect(peakX+half-22,baseY,44,WORLD.FLOOR_Y-baseY);
    ctx.strokeStyle='#536273';ctx.lineWidth=5;ctx.strokeRect(peakX-half-22,baseY,44,WORLD.FLOOR_Y-baseY);ctx.strokeRect(peakX+half-22,baseY,44,WORLD.FLOOR_Y-baseY);
    const count=(typeof WAREHOUSE_ROOF_PANEL_COUNT!=='undefined'?WAREHOUSE_ROOF_PANEL_COUNT:20), pw=(half*2)/count;
    // 屋頂先鋪暗色鐵皮面，再依破壞狀態留洞；不是一條莫名其妙浮在空中的線。
    const roofY=x=>peakY+(Math.abs(x-peakX)/half)*(baseY-peakY);
    ctx.lineCap='butt';ctx.lineWidth=18;
    for(let i=0;i<count;i++){const panel=(typeof warehouseRoofPanels!=='undefined')?warehouseRoofPanels[i]:null;if(panel&&panel.broken)continue;const x1=peakX-half+i*pw,x2=x1+pw,y1=roofY(x1),y2=roofY(x2);ctx.strokeStyle='#354252';ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();ctx.strokeStyle='#718096';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x1,y1-5);ctx.lineTo(x2,y2-5);ctx.stroke();ctx.lineWidth=18;if(panel&&panel.hp<61){const severity=panel.hp<31?2:1;ctx.strokeStyle=panel.hp<31?'#e2e8f0':'#94a3b8';ctx.lineWidth=2.2;const mx=(x1+x2)/2,my=(y1+y2)/2;for(let c=0;c<severity+1;c++){ctx.beginPath();ctx.moveTo(mx-10-c*3,my-7+c*2);ctx.lineTo(mx-2+c*4,my+1-c*3);ctx.lineTo(mx+9-c*2,my+8+c*2);ctx.stroke();}ctx.lineWidth=18;}}
    // 三角桁架讓斜頂看起來真的是倉庫結構；桁架本身只是視覺，不新增碰撞。
    ctx.strokeStyle='#465568';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(peakX-half,baseY+12);ctx.lineTo(peakX,peakY+12);ctx.lineTo(peakX+half,baseY+12);ctx.moveTo(peakX-half,baseY+12);ctx.lineTo(peakX+half,baseY+12);ctx.stroke();
    for(let x=peakX-half+125;x<peakX+half;x+=125){const y=roofY(x)+10;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,baseY+12);ctx.stroke();}
    // V56 地板蒸氣管：這些是倉庫永久硬體，不是事件生成物。事件只決定哪一支開始洩壓。
    const floorPipes=(typeof WAREHOUSE_STEAM_PIPE_XS!=='undefined'?WAREHOUSE_STEAM_PIPE_XS:[760,900,1040,1190,1350,1510,1670,1830,1990,2160,2320]);
    for(const px of floorPipes){
      const py=WORLD.FLOOR_Y;
      ctx.fillStyle='#293139';ctx.fillRect(px-9,py-27,18,27);
      ctx.fillStyle='#4b5660';ctx.fillRect(px-14,py-31,28,8);
      ctx.fillStyle='#1c2228';ctx.fillRect(px-10,py-25,20,5);
      ctx.strokeStyle='rgba(148,163,184,.32)';ctx.lineWidth=2;ctx.strokeRect(px-14,py-31,28,8);
      ctx.fillStyle='#1f252b';ctx.beginPath();ctx.ellipse(px,py-32,10,3,0,0,Math.PI*2);ctx.fill();
    }
    // 吊燈只掛在斜頂外側/桁架下，避免穿過可破鐵皮。
    for(const x of [peakX-half-250,peakX+half+250]){ctx.strokeStyle='#334155';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x,150);ctx.lineTo(x,245);ctx.stroke();ctx.fillStyle='#475569';ctx.beginPath();ctx.moveTo(x-28,245);ctx.lineTo(x+28,245);ctx.lineTo(x+18,260);ctx.lineTo(x-18,260);ctx.closePath();ctx.fill();const lg=ctx.createLinearGradient(0,260,0,WORLD.FLOOR_Y);lg.addColorStop(0,'rgba(254,240,138,.16)');lg.addColorStop(1,'rgba(254,240,138,.015)');ctx.fillStyle=lg;ctx.beginPath();ctx.moveTo(x-15,260);ctx.lineTo(x+15,260);ctx.lineTo(x+115,WORLD.FLOOR_Y);ctx.lineTo(x-115,WORLD.FLOOR_Y);ctx.closePath();ctx.fill();}
    if(typeof warehouseRoofDebris!=='undefined'){for(let i=warehouseRoofDebris.length-1;i>=0;i--){const d=warehouseRoofDebris[i];d.x+=d.vx;d.y+=d.vy;d.vy+=.28;d.rot+=d.vr;d.life--;ctx.save();ctx.globalAlpha=Math.max(0,d.life/d.maxLife);ctx.translate(d.x,d.y);ctx.rotate(d.rot);ctx.fillStyle='#64748b';ctx.fillRect(-6,-2,12,4);ctx.restore();if(d.life<=0)warehouseRoofDebris.splice(i,1);}}
  } else if (venue.id === 'rooftop') {
    const g=ctx.createLinearGradient(0,0,0,WORLD.FLOOR_Y);g.addColorStop(0,'#07101f');g.addColorStop(1,'#172554');ctx.fillStyle=g;ctx.fillRect(0,0,WORLD.WIDTH,WORLD.FLOOR_Y);
    // V42 天台月亮：柔光暈在城市後方。
    const moonX=WORLD.WIDTH*.78,moonY=125,moonR=48;const mg=ctx.createRadialGradient(moonX,moonY,moonR*.55,moonX,moonY,moonR*2.7);mg.addColorStop(0,'rgba(254,249,195,.42)');mg.addColorStop(.35,'rgba(254,249,195,.16)');mg.addColorStop(1,'rgba(254,249,195,0)');ctx.fillStyle=mg;ctx.beginPath();ctx.arc(moonX,moonY,moonR*2.7,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff7c2';ctx.beginPath();ctx.arc(moonX,moonY,moonR,0,Math.PI*2);ctx.fill();ctx.fillStyle='rgba(203,213,225,.18)';ctx.beginPath();ctx.arc(moonX-13,moonY-8,9,0,Math.PI*2);ctx.arc(moonX+16,moonY+12,6,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#0f172a';for(let x=0;x<WORLD.WIDTH;x+=150){const h=120+(x*13%170);ctx.fillRect(x,WORLD.FLOOR_Y-h,110,h);ctx.fillStyle='#facc15';for(let y=WORLD.FLOOR_Y-h+25;y<WORLD.FLOOR_Y-20;y+=35)ctx.fillRect(x+18,y,8,5);ctx.fillStyle='#0f172a';}
    // V71：高樓以下仍是城市，不再在畫面下半部突然掉進純黑。遠景只做視覺，不新增碰撞。
    const lowerSky=ctx.createLinearGradient(0,WORLD.FLOOR_Y,0,WORLD.HEIGHT);lowerSky.addColorStop(0,'#172554');lowerSky.addColorStop(1,'#07101f');ctx.fillStyle=lowerSky;ctx.fillRect(0,WORLD.FLOOR_Y,WORLD.WIDTH,WORLD.HEIGHT-WORLD.FLOOR_Y);
    // V73：遠景高樓從原本屋頂一路延伸到畫面底，不再被 WORLD.FLOOR_Y 腰斬後換一批樓。
    for(let x=0;x<WORLD.WIDTH;x+=150){const h=120+(x*13%170),top=WORLD.FLOOR_Y-h;ctx.fillStyle='#0f172a';ctx.fillRect(x,top,110,WORLD.HEIGHT-top);ctx.fillStyle='rgba(250,204,21,.62)';for(let y=top+25;y<WORLD.HEIGHT-18;y+=35){if(y>WORLD.FLOOR_Y-5&&((y/35+x/150)|0)%3===0)continue;ctx.fillRect(x+18,y,8,5);}}
    const pl=venue.platformLeft||680, pr=venue.platformRight||2320;
    // V40：玻璃只存在於真正的大樓寬度，絕不跨進左右落空區。
    const glassTop=WORLD.FLOOR_Y-145;
    ctx.fillStyle='rgba(56,189,248,.10)';ctx.fillRect(pl,glassTop,pr-pl,WORLD.FLOOR_Y-glassTop);
    ctx.strokeStyle='rgba(148,163,184,.82)';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(pl,glassTop);ctx.lineTo(pr,glassTop);ctx.stroke();
    ctx.strokeStyle='rgba(125,211,252,.30)';ctx.lineWidth=2;for(let x=pl+180;x<pr;x+=360){ctx.beginPath();ctx.moveTo(x,glassTop);ctx.lineTo(x,WORLD.FLOOR_Y);ctx.stroke();}
    // 大樓本體向下延伸，左右外側保持真正的空洞。
    const wallGrad=ctx.createLinearGradient(0,WORLD.FLOOR_Y,0,WORLD.HEIGHT);wallGrad.addColorStop(0,'#334155');wallGrad.addColorStop(1,'#111827');
    ctx.fillStyle=wallGrad;ctx.fillRect(pl,WORLD.FLOOR_Y-8,pr-pl,WORLD.HEIGHT-WORLD.FLOOR_Y+8);
    ctx.strokeStyle='#94a3b8';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(pl,WORLD.FLOOR_Y-8);ctx.lineTo(pr,WORLD.FLOOR_Y-8);ctx.stroke();
    ctx.fillStyle='#1e293b';ctx.fillRect(pl-24,WORLD.FLOOR_Y-8,24,WORLD.HEIGHT-WORLD.FLOOR_Y+8);ctx.fillRect(pr,WORLD.FLOOR_Y-8,24,WORLD.HEIGHT-WORLD.FLOOR_Y+8);
  } else if (venue.id === 'rain') {
    const g=ctx.createLinearGradient(0,0,0,WORLD.FLOOR_Y);g.addColorStop(0,'#081426');g.addColorStop(1,'#1d4264');ctx.fillStyle=g;ctx.fillRect(0,0,WORLD.WIDTH,WORLD.FLOOR_Y);
    ctx.fillStyle='#0f172a';for(let x=0;x<WORLD.WIDTH;x+=180)ctx.fillRect(x,260+(x%4)*25,135,360);
    // V40 雨滴改為多組不同速度/長度/相位，避免看起來像一張橫幅平移。
    ctx.lineWidth=2;for(let x=8;x<WORLD.WIDTH;x+=31){const seed=(x*17)%97;const speed=11+(seed%13);const len=20+(seed%29);const drift=8+(seed%10);let y=(seed*23+gameFrame*speed)%690-55;ctx.strokeStyle=`rgba(186,230,253,${.16+(seed%7)*.025})`;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-drift,y+len);ctx.stroke();}
  } else if (venue.id === 'ice') {
    // V41 極光雪原：星空＋極光＋遠方雪屋，保留冰面本身的配色。
    const g=ctx.createLinearGradient(0,0,0,WORLD.FLOOR_Y);g.addColorStop(0,'#031525');g.addColorStop(.62,'#0b3550');g.addColorStop(1,'#5fa8bd');ctx.fillStyle=g;ctx.fillRect(0,0,WORLD.WIDTH,WORLD.FLOOR_Y);
    ctx.fillStyle='rgba(255,255,255,.75)';for(let x=25;x<WORLD.WIDTH;x+=73){const y=35+((x*37)%210);ctx.globalAlpha=.25+((x%9)/18);ctx.fillRect(x,y,2,2);}ctx.globalAlpha=1;
    // 極光用多層波帶，不用幾何三角形。
    for(let band=0;band<3;band++){ctx.save();ctx.globalAlpha=.12-band*.025;ctx.strokeStyle=band===1?'#67e8f9':'#86efac';ctx.lineWidth=52-band*10;ctx.lineCap='round';ctx.beginPath();for(let x=-80;x<=WORLD.WIDTH+80;x+=80){const y=95+band*42+Math.sin(x*.006+gameFrame*.004+band)*45;if(x===-80)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.stroke();ctx.restore();}
    // V42 雪原地平線＋雪磚屋：低矮遠景，不再是兩棟積木房。
    const horizonY=455;
    ctx.fillStyle='rgba(224,242,254,.42)';ctx.beginPath();ctx.moveTo(0,horizonY);for(let x=0;x<=WORLD.WIDTH;x+=180)ctx.quadraticCurveTo(x+90,horizonY-28-((x/180)%2)*10,x+180,horizonY);ctx.lineTo(WORLD.WIDTH,WORLD.FLOOR_Y);ctx.lineTo(0,WORLD.FLOOR_Y);ctx.closePath();ctx.fill();
    const ix=330,iy=425,iw=250,ih=115;
    // igloo 外殼
    ctx.fillStyle='#dcebf1';ctx.beginPath();ctx.ellipse(ix+iw*.5,iy+ih*.72,iw*.5,ih*.72,0,Math.PI,Math.PI*2);ctx.lineTo(ix+iw,iy+ih);ctx.lineTo(ix,iy+ih);ctx.closePath();ctx.fill();
    ctx.strokeStyle='rgba(105,135,150,.38)';ctx.lineWidth=3;for(let yy=iy+28;yy<iy+ih;yy+=25){ctx.beginPath();ctx.moveTo(ix+18,yy);ctx.quadraticCurveTo(ix+iw*.5,yy-10,ix+iw-18,yy);ctx.stroke();}for(let xx=ix+48;xx<ix+iw-30;xx+=48){ctx.beginPath();ctx.moveTo(xx,iy+20);ctx.lineTo(xx-18,iy+ih);ctx.stroke();}
    // 入口隧道＋黃光
    ctx.fillStyle='#cbdde5';ctx.fillRect(ix+iw-12,iy+70,78,45);ctx.beginPath();ctx.arc(ix+iw+27,iy+70,39,Math.PI,0);ctx.fill();const ig=ctx.createRadialGradient(ix+iw+34,iy+87,2,ix+iw+34,iy+87,60);ig.addColorStop(0,'rgba(253,224,71,.82)');ig.addColorStop(.4,'rgba(251,191,36,.34)');ig.addColorStop(1,'rgba(251,191,36,0)');ctx.fillStyle=ig;ctx.beginPath();ctx.arc(ix+iw+34,iy+87,60,0,Math.PI*2);ctx.fill();ctx.fillStyle='#f6c453';ctx.fillRect(ix+iw+20,iy+76,28,39);
    // 小煙囪＋裊裊白煙
    ctx.fillStyle='#b9ced8';ctx.fillRect(ix+72,iy+10,25,40);for(let j=0;j<4;j++){const t=(gameFrame*.55+j*27)%115;ctx.globalAlpha=.24*(1-t/125);ctx.fillStyle='#f8fafc';ctx.beginPath();ctx.arc(ix+84+Math.sin((gameFrame+j*19)*.025)*12,iy+8-t,12+j*3,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;
    const mist=ctx.createLinearGradient(0,430,0,WORLD.FLOOR_Y);mist.addColorStop(0,'rgba(224,242,254,0)');mist.addColorStop(1,'rgba(224,242,254,.15)');ctx.fillStyle=mist;ctx.fillRect(0,430,WORLD.WIDTH,WORLD.FLOOR_Y-430);
  } else if (venue.id === 'ship') {
    const sky=ctx.createLinearGradient(0,0,0,430);sky.addColorStop(0,'#60a5fa');sky.addColorStop(.68,'#bae6fd');sky.addColorStop(1,'#e0f2fe');ctx.fillStyle=sky;ctx.fillRect(0,0,WORLD.WIDTH,430);
    ctx.fillStyle='rgba(254,240,138,.95)';ctx.shadowColor='#fde68a';ctx.shadowBlur=35;ctx.beginPath();ctx.arc(2420,105,58,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
    ctx.fillStyle='#64748b';ctx.beginPath();ctx.moveTo(160,430);ctx.lineTo(330,345);ctx.lineTo(470,430);ctx.closePath();ctx.fill();ctx.fillStyle='#475569';ctx.beginPath();ctx.moveTo(360,430);ctx.lineTo(540,370);ctx.lineTo(690,430);ctx.closePath();ctx.fill();
    ctx.fillStyle='#075985';ctx.fillRect(0,430,WORLD.WIDTH,WORLD.HEIGHT-430);ctx.strokeStyle='rgba(125,211,252,.75)';ctx.lineWidth=4;for(let x=0;x<WORLD.WIDTH;x+=120){ctx.beginPath();ctx.moveTo(x,455);ctx.quadraticCurveTo(x+60,443+Math.sin((gameFrame+x)*.035)*7,x+120,455);ctx.stroke();}
  } else if (venue.id === 'beach') {
    const g=ctx.createLinearGradient(0,0,0,WORLD.FLOOR_Y);g.addColorStop(0,'#172554');g.addColorStop(.55,'#7c3aed');g.addColorStop(1,'#fb7185');ctx.fillStyle=g;ctx.fillRect(0,0,WORLD.WIDTH,WORLD.FLOOR_Y);
    ctx.fillStyle='#fde68a';ctx.beginPath();ctx.arc(2350,135,65,0,Math.PI*2);ctx.fill();ctx.fillStyle='#0e7490';ctx.fillRect(0,430,WORLD.WIDTH,190);
    // 海面只保留細碎浪線，不再畫一排像拱橋的半圓。
    ctx.strokeStyle='rgba(255,255,255,.38)';ctx.lineWidth=3;for(let x=0;x<WORLD.WIDTH;x+=150){const y=447+Math.sin((x+gameFrame*2)*.025)*5;ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+38,y-7,x+75,y);ctx.quadraticCurveTo(x+112,y+6,x+150,y);ctx.stroke();}
  } else if (venue.id === 'factory') {
    const bg=ctx.createLinearGradient(0,0,0,WORLD.FLOOR_Y);bg.addColorStop(0,'#120b09');bg.addColorStop(1,'#2b1710');ctx.fillStyle=bg;ctx.fillRect(0,0,WORLD.WIDTH,WORLD.FLOOR_Y);
    // 熔爐、管線、遠處機台：保留粗獷感但讓它真的像工廠。
    ctx.fillStyle='#292524';for(let x=60;x<WORLD.WIDTH;x+=360){ctx.fillRect(x,210,150,410);ctx.fillStyle='#7c2d12';ctx.fillRect(x+24,285,102,125);ctx.fillStyle='#fb923c';ctx.globalAlpha=.32;ctx.fillRect(x+35,305,80,84);ctx.globalAlpha=1;ctx.fillStyle='#292524';}
    ctx.strokeStyle='#57534e';ctx.lineWidth=14;ctx.beginPath();ctx.moveTo(0,125);ctx.lineTo(WORLD.WIDTH,125);ctx.stroke();ctx.lineWidth=8;for(let x=150;x<WORLD.WIDTH;x+=430){ctx.beginPath();ctx.moveTo(x,125);ctx.lineTo(x,310);ctx.lineTo(x+160,310);ctx.stroke();}
    ctx.fillStyle='rgba(249,115,22,.07)';ctx.fillRect(0,390,WORLD.WIDTH,230);    // V41 熔爐熱蒸氣：純視覺、緩慢上飄的半透明熱霧。
    for(let x=170;x<WORLD.WIDTH;x+=360){for(let j=0;j<4;j++){const phase=(gameFrame*1.2+j*47+x)%220;const yy=500-phase;const xx=x+Math.sin((gameFrame+j*31+x)*.025)*24;const rr=22+j*8+phase*.06;ctx.fillStyle=`rgba(226,232,240,${Math.max(0,.10-phase/2600)})`;ctx.beginPath();ctx.arc(xx,yy,rr,0,Math.PI*2);ctx.fill();}}

  } else if (venue.id === 'underground') {
    ctx.fillStyle='#050506';ctx.fillRect(0,0,WORLD.WIDTH,WORLD.FLOOR_Y);
    const back=ctx.createLinearGradient(0,100,0,WORLD.FLOOR_Y);back.addColorStop(0,'#151515');back.addColorStop(1,'#080808');ctx.fillStyle=back;ctx.fillRect(0,100,WORLD.WIDTH,WORLD.FLOOR_Y-100);
    // 地下非法場：後方觀眾剪影，亮度刻意壓低，讓場地仍是主角。
    for(let row=0;row<3;row++){for(let x=35+row*22;x<WORLD.WIDTH;x+=78){const y=245+row*48+((x*7)%13);ctx.fillStyle=`rgba(30,30,32,${.72-row*.12})`;ctx.beginPath();ctx.arc(x,y,15,0,Math.PI*2);ctx.fill();ctx.fillRect(x-12,y+13,24,28);}}
    ctx.strokeStyle='#3f3f46';ctx.lineWidth=8;for(let x=110;x<WORLD.WIDTH;x+=430){ctx.beginPath();ctx.moveTo(x,100);ctx.lineTo(x,WORLD.FLOOR_Y);ctx.stroke();}
    // 聚光燈真正打到地板，並使用多段漸層而非單一透明三角。
    for(let x=120;x<WORLD.WIDTH;x+=300){ctx.fillStyle='#fde68a';ctx.fillRect(x,112,90,7);const lg=ctx.createLinearGradient(0,119,0,WORLD.FLOOR_Y);lg.addColorStop(0,'rgba(253,230,138,.22)');lg.addColorStop(.55,'rgba(253,230,138,.11)');lg.addColorStop(1,'rgba(253,230,138,.035)');ctx.fillStyle=lg;ctx.beginPath();ctx.moveTo(x+8,119);ctx.lineTo(x+82,119);ctx.lineTo(x+150,WORLD.FLOOR_Y);ctx.lineTo(x-60,WORLD.FLOOR_Y);ctx.closePath();ctx.fill();}
  } else {
    // V41 標準體育館：日本高中體育館——木牆、二樓走廊、窗簾、籃框與暖色頂燈。
    const bg=ctx.createLinearGradient(0,0,0,WORLD.FLOOR_Y);bg.addColorStop(0,'#ead7b7');bg.addColorStop(1,'#9a633f');ctx.fillStyle=bg;ctx.fillRect(0,0,WORLD.WIDTH,WORLD.FLOOR_Y);
    ctx.fillStyle='#6b3f2a';ctx.fillRect(0,250,WORLD.WIDTH,WORLD.FLOOR_Y-250);
    // 二樓走廊與護欄。
    ctx.fillStyle='#d7c3a2';ctx.fillRect(0,170,WORLD.WIDTH,22);ctx.fillStyle='#5b4638';ctx.fillRect(0,192,WORLD.WIDTH,12);
    ctx.strokeStyle='#6b584b';ctx.lineWidth=4;for(let x=0;x<WORLD.WIDTH;x+=55){ctx.beginPath();ctx.moveTo(x,185);ctx.lineTo(x,245);ctx.stroke();}ctx.beginPath();ctx.moveTo(0,235);ctx.lineTo(WORLD.WIDTH,235);ctx.stroke();
    // 高窗＋紅棕窗簾，窗內透暖光。
    for(let x=80;x<WORLD.WIDTH;x+=360){ctx.fillStyle='#fff7d6';ctx.fillRect(x,55,190,105);ctx.fillStyle='#7f1d1d';ctx.fillRect(x-18,45,42,130);ctx.fillRect(x+166,45,42,130);const lg=ctx.createLinearGradient(0,160,0,430);lg.addColorStop(0,'rgba(254,240,138,.16)');lg.addColorStop(1,'rgba(254,240,138,0)');ctx.fillStyle=lg;ctx.beginPath();ctx.moveTo(x+20,160);ctx.lineTo(x+170,160);ctx.lineTo(x+260,430);ctx.lineTo(x-70,430);ctx.closePath();ctx.fill();}
    // 木牆分板、門、公告板。
    ctx.strokeStyle='rgba(70,42,28,.35)';ctx.lineWidth=2;for(let x=0;x<WORLD.WIDTH;x+=90){ctx.beginPath();ctx.moveTo(x,250);ctx.lineTo(x,WORLD.FLOOR_Y);ctx.stroke();}
    for(const x of [210,2360]){ctx.fillStyle='#4b5563';ctx.fillRect(x,430,115,150);ctx.fillStyle='#22c55e';ctx.fillRect(x+28,412,60,14);}
    ctx.fillStyle='#e5e7eb';ctx.fillRect(470,390,170,95);ctx.strokeStyle='#94a3b8';ctx.lineWidth=3;ctx.strokeRect(470,390,170,95);
    // 遠處籃框，像學校共用體育館。
    for(const x of [690,2140]){ctx.strokeStyle='#475569';ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(x,270);ctx.lineTo(x,390);ctx.stroke();ctx.strokeRect(x-55,290,110,70);ctx.strokeStyle='#ef4444';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(x-22,370);ctx.lineTo(x+22,370);ctx.stroke();}
    // V42 場館結構邊線：牆/地、左右牆角與主要造景都要能一眼分層。
    ctx.strokeStyle='rgba(49,31,24,.78)';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(0,WORLD.FLOOR_Y-1);ctx.lineTo(WORLD.WIDTH,WORLD.FLOOR_Y-1);ctx.stroke();ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(2,250);ctx.lineTo(2,WORLD.FLOOR_Y);ctx.moveTo(WORLD.WIDTH-2,250);ctx.lineTo(WORLD.WIDTH-2,WORLD.FLOOR_Y);ctx.stroke();
  }
  ctx.restore();
}
function drawRadarBubble(realX, realY, color, isBall = false, isUser = false, entityRadius = 24) {
  if (isNaN(realX) || isNaN(realY)) return;
  const screenX = realX - camera.x, screenY = realY - camera.y;
  const isCompletelyOff = (screenX + entityRadius < 0 || screenX - entityRadius > VIEW_W || screenY + entityRadius < 0 || screenY - entityRadius > VIEW_H);
  if (!isCompletelyOff) return;

  const distOffscreen = Math.hypot(Math.max(0, -screenX, screenX - VIEW_W), Math.max(0, -screenY, screenY - VIEW_H));
  const scale = Math.min(2.5, 1.0 + (distOffscreen / 120) * 0.65);
  const baseR = isBall ? 15 : 18, bubbleR = baseR * scale, pointerLen = 12 * scale;
  const pad = Math.max(38, bubbleR + 12);
  const clampX = Math.max(pad, Math.min(VIEW_W - pad, screenX));
  const clampY = Math.max(pad, Math.min(VIEW_H - pad, screenY));
  const angle = Math.atan2(screenY - clampY, screenX - clampX);

  ctx.save(); ctx.translate(clampX, clampY);
  ctx.save(); ctx.rotate(angle); ctx.beginPath();
  ctx.arc(0, 0, bubbleR, 0.45, Math.PI * 2 - 0.45); ctx.lineTo(bubbleR + pointerLen, 0); ctx.closePath();
  ctx.fillStyle = '#ffffff'; ctx.fill();
  ctx.lineWidth = Math.max(2.5, 3.5 * (scale * 0.65)); ctx.strokeStyle = '#0f172a'; ctx.stroke();
  ctx.restore();

  if (isBall) {
    const ballCoreR = bubbleR * 0.65;
    ctx.save(); ctx.rotate(ball.rotation); ctx.beginPath(); ctx.arc(0, 0, ballCoreR, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.lineWidth = 1.8 * scale; ctx.strokeStyle = '#1e1b4b'; ctx.stroke();
    ctx.fillStyle = ball.isPerfectSpike ? '#ef4444' : '#38bdf8'; ctx.beginPath(); ctx.arc(0, 0, ballCoreR, -0.5, 0.8); ctx.lineTo(0, 0); ctx.fill();
    ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.arc(0, 0, ballCoreR, 1.8, 3.0); ctx.lineTo(0, 0); ctx.fill();
    ctx.restore();
  } else {
    const playerCoreR = bubbleR * 0.65;
    ctx.beginPath(); ctx.arc(0, 0, playerCoreR, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill(); ctx.lineWidth = 1.8 * scale; ctx.strokeStyle = '#ffffff'; ctx.stroke();
    if (isUser) {
      ctx.fillStyle = '#facc15'; ctx.beginPath();
      ctx.moveTo(-5 * scale, -4 * scale); ctx.lineTo(5 * scale, -4 * scale); ctx.lineTo(0, 4 * scale);
      ctx.closePath(); ctx.fill();
    }
  }
  ctx.restore();
}

function renderDebugTerminal() {
  const panel = document.getElementById('debug-side-panel');
  if (!panel) return;
  panel.classList.toggle('on', !!debugHitbox);
  if (!debugHitbox) return;

  const lines = [];
  const ballSpeed = Math.hypot(ball.vx, ball.vy).toFixed(2);
  lines.push('=== DEBUG MONITOR [B] ===');
  lines.push(`FRAME ${gameFrame} | BALL ${ballSpeed} px/f`);
  lines.push(`TAG ${ball.activeSkillTag || 'NORMAL'} | BROKEN ${ball.isBrokenSpike ? 'YES' : 'NO'}`);
  lines.push('');
  lines.push('[RECEIVE SNAPSHOT]');
  if (typeof lastReceiveDebug !== 'undefined' && lastReceiveDebug) {
    const r = lastReceiveDebug;
    lines.push(`#${r.seq}  INPUT ${r.input}  @${r.frame}f`);
    lines.push(`DIST       ${r.dist.toFixed(1)} px`);
    lines.push(`K REACH    ${r.standReach.toFixed(1)} px`);
    lines.push(`L REACH    ${r.diveReach.toFixed(1)} px`);
    lines.push(`MARGIN K   ${(r.standReach-r.dist).toFixed(1)} px`);
    lines.push(`FLOOR ETA  ${r.eta == null ? '-' : r.eta.toFixed(1)+'f'}`);
    lines.push(`BALL SPD   ${r.speed.toFixed(2)} px/f`);
    lines.push(`VX/VY      ${r.vx.toFixed(2)} / ${r.vy.toFixed(2)}`);
    lines.push(`INT/TEC    ${r.int} / ${r.dex}`);
    lines.push(`TYPE       ${r.broken ? 'BROKEN ' : ''}${r.sineFloat ? 'SINE FLOAT' : (r.float ? 'FLOAT' : (r.serveRally ? 'SERVE' : 'NORMAL'))}`);
    if (r.cooldown > 0) lines.push(`COOLDOWN   ${r.cooldown}f`);
    lines.push(`RESULT     ${r.result}`);
    if (!r.contactFrame && gameFrame-r.frame > 3 && r.input === 'K' && r.result.startsWith('INPUT')) {
      lines.push('NOTE       NO CONTACT IN 3f BUFFER');
    }
  } else {
    lines.push('Press K or ground-L to capture.');
  }
  lines.push('');
  lines.push('[AI DECISION TRACE]');
  if (typeof aiDebugEvents !== 'undefined' && aiDebugEvents.length) {
    aiDebugEvents.slice(0, 5).forEach(ev => {
      const age = gameFrame - ev.frame;
      lines.push(`${String(age).padStart(3,' ')}f ${ev.name}: ${ev.action}${ev.detail ? ' | '+ev.detail : ''}`);
    });
  } else lines.push('waiting...');
  lines.push('');
  lines.push('[V75 TEAM INTENT]');
  if (typeof aiTeamIntentState !== 'undefined') {
    ['LEFT','RIGHT'].forEach(side=>{
      const st=aiTeamIntentState[side];
      lines.push(`${side.padEnd(5)} ${st.phase} | OWNER ${st.ownerName} | 2ND ${st.secondaryName}`);
      lines.push(`      secondaryTask=${st.secondaryTask||'-'}`);
      lines.push(`      target=${st.targetX==null?'-':st.targetX.toFixed(0)} hits=${st.hits} reason=${st.reason}`);
    });
  }
  lines.push('');
  lines.push('[AI ANOMALIES]');
  if (typeof aiBugFlags !== 'undefined' && aiBugFlags.length) aiBugFlags.slice(0,5).forEach(ev=>lines.push(`${String(gameFrame-ev.frame).padStart(3,' ')}f ${ev.side} ${ev.code} | ${ev.detail}`));
  else lines.push('none');
  lines.push('');
  lines.push('[BRAIN TRACE]');
  if (typeof aiBrainTrace !== 'undefined' && aiBrainTrace.length) aiBrainTrace.slice(0,6).forEach(ev=>lines.push(`${String(gameFrame-ev.frame).padStart(3,' ')}f ${ev.side} ${ev.event}${ev.detail?' | '+ev.detail:''}`));
  else lines.push('waiting...');
  panel.textContent = lines.join('\n');
}

// V75-0 on-court AI ownership overlay. Visible only with Shift+B debug mode.
function renderAIFoundationOverlay() {
  if (!debugHitbox || typeof aiTeamIntentState === 'undefined') return;
  ctx.save();
  ctx.font='700 11px "Courier New", monospace'; ctx.textAlign='center'; ctx.textBaseline='bottom';
  const drawPlayer=(p)=>{
    if (!p || (typeof isSlotHumanControlled==='function' && isSlotHumanControlled(p))) return;
    const side=p.isLeft?'LEFT':'RIGHT', st=aiTeamIntentState[side];
    const owner=st && st.ownerKey===(p.slotKey||`slot${p.slotIndex}`);
    const secondary=st && st.secondaryKey===(p.slotKey||`slot${p.slotIndex}`);
    const label=owner?`OWNER · ${st.phase}`:(secondary?`${st.secondaryTask||'2ND'}`:'AI');
    ctx.fillStyle=owner?'rgba(250,204,21,.95)':(secondary?'rgba(125,211,252,.9)':'rgba(203,213,225,.75)');
    ctx.fillText(label,p.x,p.y-p.radius*2.35);
    if(owner && Number.isFinite(st.targetX)){
      ctx.strokeStyle='rgba(250,204,21,.36)';ctx.lineWidth=1.5;ctx.setLineDash([5,5]);ctx.beginPath();ctx.moveTo(p.x,p.y-p.radius);ctx.lineTo(st.targetX,WORLD.FLOOR_Y-5);ctx.stroke();ctx.setLineDash([]);
    }
  };
  if(typeof allPlayers!=='undefined') allPlayers.forEach(drawPlayer);
  const side=(ball.x<WORLD.NET_X)?'LEFT':'RIGHT', st=aiTeamIntentState[side];
  if(st){ctx.fillStyle='rgba(15,23,42,.78)';const txt=`${side} ${st.phase} → ${st.ownerName}`;const w=ctx.measureText(txt).width+12;ctx.fillRect(ball.x-w/2,ball.y-36,w,18);ctx.fillStyle='#f8fafc';ctx.fillText(txt,ball.x,ball.y-20);}
  ctx.restore();
}

function renderChronoAnimation() {
  if (timeSlowTimer <= 0 && chronoAnimTimer <= 0) return;
  const t=(typeof gameFrame!=='undefined'?gameFrame:0); ctx.save();
  const chronoFade = timeSlowTimer > 0 ? 1 : Math.max(0, Math.min(1, chronoAnimTimer / (typeof CHRONO_RELEASE_FADE_FRAMES!=='undefined' ? CHRONO_RELEASE_FADE_FRAMES : 20)));
  if (timeSlowTimer <= 0) ctx.filter = `opacity(${chronoFade})`;
  // V74-14: oversized antique ghost clock. It intentionally extends off-screen, but the readable quadrant keeps hands + numerals.
  const cx=WORLD.WIDTH*.49, cy=WORLD.HEIGHT*.43, R=Math.max(WORLD.WIDTH,WORLD.HEIGHT)*.37;
  ctx.translate(cx,cy); ctx.globalCompositeOperation='lighter'; ctx.shadowColor='#e2e8f0'; ctx.shadowBlur=28;
  ctx.strokeStyle='rgba(226,232,240,.13)';ctx.lineWidth=18;ctx.globalAlpha=.30;ctx.beginPath();ctx.arc(0,0,R,0,Math.PI*2);ctx.stroke();
  ctx.strokeStyle='rgba(248,250,252,.30)';ctx.lineWidth=3.2;ctx.globalAlpha=.72;[[.02,1.30],[1.52,2.52],[2.78,4.18],[4.42,6.08]].forEach(q=>{ctx.beginPath();ctx.arc(0,0,R,q[0],q[1]);ctx.stroke();});
  const romans=['XII','I','II','III','IV','V','VI','VII','VIII','IX','X','XI'];
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`600 ${Math.max(18,R*.055)}px Georgia, serif`;
  for(let i=0;i<12;i++){const a=-Math.PI/2+i*Math.PI/6,x=Math.cos(a)*(R-48),y=Math.sin(a)*(R-48);ctx.globalAlpha=.34+(i%3===0?.18:0);ctx.fillStyle='#f8fafc';ctx.shadowBlur=18;ctx.fillText(romans[i],x,y);ctx.globalAlpha=.40;ctx.lineWidth=i%3===0?4:2;ctx.beginPath();ctx.moveTo(Math.cos(a)*(R-22),Math.sin(a)*(R-22));ctx.lineTo(Math.cos(a)*(R-7),Math.sin(a)*(R-7));ctx.stroke();}
  // Frozen hour/minute hands plus displaced temporal echoes.
  const hands=[{a:-1.03,len:.67,w:5.5},{a:.42,len:.48,w:4.0}];
  hands.forEach((h,idx)=>{for(let k=3;k>=1;k--){const ha=h.a-k*.028*(idx?-.7:1);ctx.globalAlpha=.07+(3-k)*.025;ctx.strokeStyle='#cbd5e1';ctx.lineWidth=h.w+5-k;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(Math.cos(ha)*R*h.len,Math.sin(ha)*R*h.len);ctx.stroke();}ctx.globalAlpha=.82;ctx.strokeStyle='#fff';ctx.shadowColor='#fff';ctx.shadowBlur=20;ctx.lineWidth=h.w;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-Math.cos(h.a)*R*.08,-Math.sin(h.a)*R*.08);ctx.lineTo(Math.cos(h.a)*R*h.len,Math.sin(h.a)*R*h.len);ctx.stroke();});
  ctx.globalAlpha=.88;ctx.fillStyle='#f8fafc';ctx.beginPath();ctx.arc(0,0,8,0,Math.PI*2);ctx.fill();ctx.restore();
  // Broad temporal ribbons crossing foreground/background with fake depth.
  ctx.save();ctx.globalCompositeOperation='screen';for(let i=0;i<6;i++){const phase=t*.011+i*1.31,y=70+i*112+Math.sin(phase)*42;ctx.globalAlpha=.045+(i%2)*.025;ctx.strokeStyle='#e2e8f0';ctx.lineWidth=12+(i%3)*8;ctx.shadowColor='#cbd5e1';ctx.shadowBlur=30;ctx.beginPath();ctx.moveTo(-120,y);ctx.bezierCurveTo(WORLD.WIDTH*.25,y-100*Math.sin(phase),WORLD.WIDTH*.7,y+90*Math.cos(phase*.8),WORLD.WIDTH+120,y-25);ctx.stroke();}ctx.restore();
}

// V11：真人玩家的 INT 落點判讀提示。
// 只畫地面預測區，不畫飛行軌跡；AI 與玩家共用 game_ai.js 的 getLandingRead()。
function drawLandingReadIndicator(targetCtx, player) {
  if (!player || typeof getLandingRead !== 'function' || !ball || (!ball.lastHitter && !ball.venueNeutralLive)) return;
  if (typeof isSlotHumanControlled === 'function' && !isSlotHumanControlled(player)) return;

  const incomingFromOpponent = ball.venueNeutralLive || (ball.lastHitter && ball.lastHitter.isLeft !== player.isLeft);
  const blockedReturnToOurSide = match.isBlockedBack &&
    (player.isLeft ? predictBallLandingForAI().x < WORLD.NET_X : predictBallLandingForAI().x >= WORLD.NET_X);
  if (!incomingFromOpponent && !blockedReturnToOurSide) return;

  const read = getLandingRead(player);
  if (!read || !Number.isFinite(read.x)) return;

  const intellect = Math.max(0, Math.min(60, player.stats.intellect || 0));
  const iq = intellect / 60;
  const radiusX = Math.max(24, read.radius || 60);
  const radiusY = Math.max(8, radiusX * 0.24);
  const alpha = 0.28 + iq * 0.20; // 透明度只是輔助；主要差異仍是位置、圈徑、更新速度。

  targetCtx.save();
  targetCtx.setLineDash([10, 8]);
  targetCtx.lineWidth = 2.2;
  targetCtx.strokeStyle = `rgba(56, 189, 248, ${Math.min(0.72, alpha + 0.18)})`;
  targetCtx.fillStyle = `rgba(56, 189, 248, ${alpha * 0.30})`;
  targetCtx.shadowColor = 'rgba(56, 189, 248, 0.45)';
  targetCtx.shadowBlur = 8;
  targetCtx.beginPath();
  targetCtx.ellipse(read.x, WORLD.FLOOR_Y - 2, radiusX, radiusY, 0, 0, Math.PI * 2);
  targetCtx.fill();
  targetCtx.stroke();
  targetCtx.setLineDash([]);
  targetCtx.globalAlpha = Math.min(0.8, alpha + 0.18);
  targetCtx.beginPath();
  targetCtx.arc(read.x, WORLD.FLOOR_Y - 2, 3.5, 0, Math.PI * 2);
  targetCtx.fillStyle = '#7dd3fc';
  targetCtx.fill();
  targetCtx.restore();
}

function drawSkillCinematic() {
  const age = (typeof gameFrame !== 'undefined') ? gameFrame - lastCastFrame : 999;
  if (age < 0 || age > 48 || !lastCastSkillName || lastCastSkillName === 'None') return;
  const caster = allPlayers[lastCastSkillCasterSlot] || userPlayer;
  const t = age / 48;
  const enter = Math.min(1, age / 7), exit = age > 38 ? Math.max(0, (48-age)/10) : 1;
  const a = enter * exit;
  const skillGuestMirror = (typeof NET !== 'undefined' && NET.isMultiplayer && !NET.isHost && NET.mode === 'PVP');
  const fromLeft = caster ? (skillGuestMirror ? !caster.isLeft : caster.isLeft) : true;
  const panelW = 650, panelH = 150;
  const baseX = fromLeft ? -35 : VIEW_W - panelW + 35;
  const slide = (1-enter) * (fromLeft ? -260 : 260);
  ctx.save(); ctx.globalAlpha=a;
  ctx.translate(baseX+slide, 62);
  const accent = (caster && caster.color) ? caster.color : '#ef4444';
  ctx.shadowColor=accent;ctx.shadowBlur=26;
  ctx.fillStyle='rgba(2,6,23,.93)';ctx.beginPath();
  if(fromLeft){ctx.moveTo(0,0);ctx.lineTo(panelW-90,0);ctx.lineTo(panelW,75);ctx.lineTo(panelW-90,panelH);ctx.lineTo(0,panelH);}else{ctx.moveTo(90,0);ctx.lineTo(panelW,0);ctx.lineTo(panelW,panelH);ctx.lineTo(90,panelH);ctx.lineTo(0,75);}ctx.closePath();ctx.fill();
  ctx.shadowBlur=0;ctx.strokeStyle=accent;ctx.lineWidth=5;ctx.stroke();
  // V38 技能 Cut-in 直接重畫施放者本人：服裝、臉、帽子、裝備光效都沿用場上角色。
  const ax=fromLeft?118:panelW-118, ay=132;
  if(caster){
    ctx.save();ctx.beginPath();ctx.rect(fromLeft?18:panelW-218,4,200,panelH-8);ctx.clip();
    const scale=2.15;ctx.translate(ax,ay);ctx.scale(scale,scale);ctx.translate(-caster.x,-caster.y);
    drawPlayerEntity(caster,ctx);ctx.restore();
  }
  const _skillTextX = fromLeft ? 205 : panelW - 205;
  ctx.save();
  if (skillGuestMirror) { ctx.translate(_skillTextX, 0); ctx.scale(-1, 1); ctx.translate(-_skillTextX, 0); }
  ctx.fillStyle='#fff';ctx.font='900 13px sans-serif';ctx.textAlign=fromLeft?'left':'right';ctx.fillText((caster&&caster.name)||'PLAYER',_skillTextX,48);
  ctx.fillStyle=accent;ctx.font='italic 1000 42px sans-serif';ctx.fillText(lastCastSkillName+'!!',_skillTextX,101);
  ctx.restore();
  ctx.restore();
}

// V43 Lighting Pass：場景物件可以簡單，但每個場地都必須有可追溯的光源。
// 只做視覺合成，不碰物理、AI、碰撞或技能。
function drawVenueLighting(){
  const v=(typeof getCurrentVenue==='function')?getCurrentVenue():{id:'stadium'};
  ctx.save();
  ctx.globalCompositeOperation='screen';
  const glow=(x,y,r,inner,outer)=>{const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,inner);g.addColorStop(1,outer||'rgba(255,255,255,0)');ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();};
  const cone=(x1,y1,x2,y2,half,c0,c1)=>{const g=ctx.createLinearGradient(x1,y1,x2,y2);g.addColorStop(0,c0);g.addColorStop(1,c1);ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(x1-half*.14,y1);ctx.lineTo(x1+half*.14,y1);ctx.lineTo(x2+half,y2);ctx.lineTo(x2-half,y2);ctx.closePath();ctx.fill();};
  if(v.id==='warehouse'){
    for(const x of [WORLD.NET_X-750,WORLD.NET_X+750]){glow(x,255,72,'rgba(255,226,150,.20)','rgba(255,226,150,0)');cone(x,258,x,WORLD.FLOOR_Y,120,'rgba(255,232,166,.11)','rgba(255,232,166,.018)');}
    const fg=ctx.createLinearGradient(0,WORLD.FLOOR_Y-100,0,WORLD.FLOOR_Y+90);fg.addColorStop(0,'rgba(255,210,125,0)');fg.addColorStop(1,'rgba(255,210,125,.035)');ctx.fillStyle=fg;ctx.fillRect(0,WORLD.FLOOR_Y-100,WORLD.WIDTH,190);
  }else if(v.id==='rooftop'){
    glow(WORLD.WIDTH*.78,125,190,'rgba(220,235,255,.13)','rgba(190,220,255,0)');
    const rg=ctx.createLinearGradient(WORLD.WIDTH,0,0,WORLD.FLOOR_Y);rg.addColorStop(0,'rgba(190,220,255,.055)');rg.addColorStop(1,'rgba(190,220,255,0)');ctx.fillStyle=rg;ctx.fillRect(0,0,WORLD.WIDTH,WORLD.FLOOR_Y+40);
  }else if(v.id==='rain'){
    const rg=ctx.createLinearGradient(0,0,0,WORLD.FLOOR_Y+70);rg.addColorStop(0,'rgba(125,211,252,.035)');rg.addColorStop(.75,'rgba(125,211,252,.012)');rg.addColorStop(1,'rgba(186,230,253,.055)');ctx.fillStyle=rg;ctx.fillRect(0,0,WORLD.WIDTH,WORLD.FLOOR_Y+70);
    for(const x of [430,920,1460,2110,2590]) glow(x,WORLD.FLOOR_Y+8,70,'rgba(186,230,253,.045)','rgba(125,211,252,0)');
  }else if(v.id==='ice'){
    const ag=ctx.createLinearGradient(0,0,0,WORLD.FLOOR_Y+70);ag.addColorStop(0,'rgba(110,255,205,.035)');ag.addColorStop(.65,'rgba(100,220,255,.018)');ag.addColorStop(1,'rgba(205,245,255,.065)');ctx.fillStyle=ag;ctx.fillRect(0,0,WORLD.WIDTH,WORLD.FLOOR_Y+70);
    glow(614,512,150,'rgba(255,198,86,.18)','rgba(255,190,70,0)');
  }else if(v.id==='ship'){
    glow(2420,105,210,'rgba(255,239,160,.18)','rgba(255,220,120,0)');cone(2420,130,2050,WORLD.FLOOR_Y,330,'rgba(255,240,180,.055)','rgba(255,225,150,.012)');
  }else if(v.id==='beach'){
    glow(2350,135,230,'rgba(255,225,150,.20)','rgba(255,170,120,0)');
    const sg=ctx.createLinearGradient(WORLD.WIDTH,100,0,WORLD.FLOOR_Y);sg.addColorStop(0,'rgba(255,215,150,.075)');sg.addColorStop(1,'rgba(255,170,140,0)');ctx.fillStyle=sg;ctx.fillRect(0,0,WORLD.WIDTH,WORLD.FLOOR_Y+100);
  }else if(v.id==='factory'){
    for(let x=170;x<WORLD.WIDTH;x+=360){glow(x+45,390,155,'rgba(255,105,35,.13)','rgba(255,80,20,0)');cone(x+45,405,x+45,WORLD.FLOOR_Y,105,'rgba(255,120,45,.075)','rgba(255,80,20,.015)');}
  }else if(v.id==='underground'){
    for(let x=165;x<WORLD.WIDTH;x+=300){glow(x,WORLD.FLOOR_Y-20,145,'rgba(255,225,150,.055)','rgba(255,220,130,0)');}
  }else if(v.id==='moon'){
    const mg=ctx.createLinearGradient(0,270,0,WORLD.FLOOR_Y+60);mg.addColorStop(0,'rgba(125,211,252,.035)');mg.addColorStop(1,'rgba(56,189,248,.06)');ctx.fillStyle=mg;ctx.fillRect(0,270,WORLD.WIDTH,WORLD.FLOOR_Y-210);
  }else{
    // 日本高中體育館：高窗是主光，暖光斜射到木地板；不是整張畫面平均提亮。
    for(let x=80;x<WORLD.WIDTH;x+=360){cone(x+95,160,x+95,WORLD.FLOOR_Y+25,155,'rgba(255,242,190,.095)','rgba(255,220,145,.018)');glow(x+95,WORLD.FLOOR_Y+8,125,'rgba(255,220,145,.05)','rgba(255,220,145,0)');}
  }
  ctx.restore();
}

function drawVenueForeground(){
  const v=(typeof getCurrentVenue==='function')?getCurrentVenue():{id:'stadium'};
  if(v.id!=='beach')return;
  ctx.save();
  // V42 沙灘前景：Canvas 向量也能做出有層次的物件；重點是輪廓、陰影、材質細節。
  // 左側遮陽傘：直立傘桿、橢圓弧形傘面、分片與陰影。
  const ux=190,uy=WORLD.FLOOR_Y-118;
  ctx.strokeStyle='rgba(70,35,25,.28)';ctx.lineWidth=15;ctx.beginPath();ctx.moveTo(ux+12,uy+35);ctx.lineTo(ux+12,WORLD.FLOOR_Y+92);ctx.stroke();
  ctx.strokeStyle='#8b3a2b';ctx.lineWidth=9;ctx.beginPath();ctx.moveTo(ux,uy+28);ctx.lineTo(ux,WORLD.FLOOR_Y+90);ctx.stroke();
  ctx.fillStyle='rgba(0,0,0,.12)';ctx.beginPath();ctx.ellipse(ux+12,WORLD.FLOOR_Y+8,125,15,0,0,Math.PI*2);ctx.fill();
  const left=ux-145,right=ux+145,top=uy-105,bottom=uy+18;
  ctx.fillStyle='#ef5350';ctx.beginPath();ctx.moveTo(left,bottom);ctx.quadraticCurveTo(ux,top,right,bottom);ctx.quadraticCurveTo(ux+95,uy-6,ux+52,bottom);ctx.quadraticCurveTo(ux+22,uy-7,ux,bottom);ctx.quadraticCurveTo(ux-28,uy-8,ux-55,bottom);ctx.quadraticCurveTo(ux-98,uy-5,left,bottom);ctx.closePath();ctx.fill();
  ctx.fillStyle='#fff3df';ctx.beginPath();ctx.moveTo(ux,top+4);ctx.quadraticCurveTo(ux+50,uy-45,ux+52,bottom);ctx.quadraticCurveTo(ux+22,uy-7,ux,bottom);ctx.quadraticCurveTo(ux-25,uy-8,ux-55,bottom);ctx.quadraticCurveTo(ux-48,uy-48,ux,top+4);ctx.fill();
  ctx.strokeStyle='rgba(120,35,35,.45)';ctx.lineWidth=2;for(const ex of [left,ux-55,ux,ux+52,right]){ctx.beginPath();ctx.moveTo(ux,top+4);ctx.lineTo(ex,bottom);ctx.stroke();}
  // 右側野餐墊：透視四邊形＋格紋。
  const px=WORLD.WIDTH-365,py=WORLD.FLOOR_Y+18;ctx.fillStyle='rgba(0,0,0,.12)';ctx.beginPath();ctx.ellipse(px+150,py+54,175,22,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#f47f75';ctx.beginPath();ctx.moveTo(px,py+18);ctx.lineTo(px+270,py+8);ctx.lineTo(px+315,py+88);ctx.lineTo(px-25,py+92);ctx.closePath();ctx.fill();ctx.save();ctx.beginPath();ctx.moveTo(px,py+18);ctx.lineTo(px+270,py+8);ctx.lineTo(px+315,py+88);ctx.lineTo(px-25,py+92);ctx.clip();ctx.strokeStyle='rgba(255,245,238,.72)';ctx.lineWidth=5;for(let x=px-30;x<px+340;x+=48){ctx.beginPath();ctx.moveTo(x,py);ctx.lineTo(x+15,py+110);ctx.stroke();}for(let y=py+20;y<py+100;y+=34){ctx.beginPath();ctx.moveTo(px-40,y);ctx.lineTo(px+340,y-8);ctx.stroke();}ctx.restore();
  // 西瓜：有厚皮、果肉漸層、白色內皮與高光，不再是一個半圓符號。
  const wx=WORLD.WIDTH-175,wy=WORLD.FLOOR_Y+8;ctx.save();ctx.translate(wx,wy);ctx.rotate(-.10);ctx.fillStyle='#14532d';ctx.beginPath();ctx.arc(0,0,48,Math.PI,0);ctx.closePath();ctx.fill();ctx.fillStyle='#dcfce7';ctx.beginPath();ctx.arc(0,0,40,Math.PI,0);ctx.closePath();ctx.fill();const wg=ctx.createLinearGradient(0,-40,0,0);wg.addColorStop(0,'#fb7185');wg.addColorStop(1,'#e83f5b');ctx.fillStyle=wg;ctx.beginPath();ctx.arc(0,0,35,Math.PI,0);ctx.closePath();ctx.fill();ctx.fillStyle='#311827';for(const [sx,sy,rr] of [[-20,-12,-.4],[-7,-24,.15],[9,-13,-.2],[22,-25,.35]]){ctx.save();ctx.translate(sx,sy);ctx.rotate(rr);ctx.beginPath();ctx.ellipse(0,0,2.8,5,0,0,Math.PI*2);ctx.fill();ctx.restore();}ctx.strokeStyle='rgba(255,255,255,.35)';ctx.lineWidth=3;ctx.beginPath();ctx.arc(-7,-5,25,3.55,4.65);ctx.stroke();ctx.restore();
  ctx.restore();
}

function render() {
  ctx.save();
  
  // 體力條動態對齊本機主角 (NET.mySlot)
  const myHero = (typeof allPlayers !== 'undefined' && typeof NET !== 'undefined')
    ? (allPlayers[NET.mySlot] || userPlayer)
    : userPlayer;

  const pExh = myHero.jumpExhaustion;
  staminaFill.style.width = (pExh * 100) + '%';
  if (pExh > 0.8) staminaFill.style.backgroundColor = '#10b981';
  else if (pExh > 0.55) staminaFill.style.backgroundColor = '#facc15';
  else staminaFill.style.backgroundColor = '#ef4444';

  if (screenShakeTimer > 0) {
    screenShakeTimer--;
    ctx.translate((Math.random() - 0.5) * screenShakeIntensity, (Math.random() - 0.5) * screenShakeIntensity);
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 🌟 WebRTC 訪客鏡像視角翻轉
  const isGuestMirror = (typeof NET !== 'undefined' && NET.isMultiplayer && !NET.isHost && NET.mode === 'PVP');
  if (isGuestMirror) {
    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }

  // ==========================================
  // 1. 世界座標層（受相機位移影響）
  // ==========================================
  ctx.save();
  // 🌟 支援鏡頭 Zoom In / Out 特寫
  if (camera.zoom !== 1.0) {
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-canvas.width / 2, -canvas.height / 2);
  }
  ctx.translate(-camera.x, -camera.y);

  drawStadiumAtmosphere();

  const venueNow = (typeof getCurrentVenue === 'function') ? getCurrentVenue() : {id:'stadium'};
  const floorPalette = {
    moon:['#334155','#64748b'], warehouse:['#262626','#3f3f46'], rooftop:['#1e293b','#475569'],
    rain:['#3b2417','#8b5a2b'], ice:['#9bd7e8','#dff6fb'], ship:['#334155','#475569'],
    beach:['#d6a95f','#f1d18a'], factory:['#3f3f46','#52525b'], underground:['#171717','#262626']
  };
  const fp=floorPalette[venueNow.id]||['#78350f','#d97706'];
  const floorOuter=fp[0], floorInner=fp[1];
  if (venueNow.arena === 'ledge') {
    const pl=venueNow.platformLeft||680, pr=venueNow.platformRight||2320;
    // V40：發球區＝大樓屋頂色；正式場內＝較亮球場色，底線一眼可辨。
    ctx.fillStyle=floorOuter;ctx.fillRect(pl,WORLD.FLOOR_Y,pr-pl,230);
    ctx.fillStyle=floorInner;ctx.fillRect(WORLD.LEFT,WORLD.FLOOR_Y,WORLD.RIGHT-WORLD.LEFT,230);
    ctx.fillStyle='#e2e8f0';ctx.fillRect(WORLD.LEFT-2,WORLD.FLOOR_Y,4,58);ctx.fillRect(WORLD.RIGHT-2,WORLD.FLOOR_Y,4,58);
    ctx.fillStyle='#f8fafc';ctx.fillRect(WORLD.LEFT,WORLD.FLOOR_Y,WORLD.RIGHT-WORLD.LEFT,2);
  } else if (venueNow.id === 'beach') {
    ctx.fillStyle=floorOuter;ctx.fillRect(0,WORLD.FLOOR_Y,WORLD.WIDTH,230);ctx.fillStyle=floorInner;ctx.fillRect(WORLD.LEFT,WORLD.FLOOR_Y,WORLD.RIGHT-WORLD.LEFT,230);
    // 沙粒＋沙地標線，完全移除木板紋理。
    ctx.fillStyle='rgba(120,83,45,.22)';for(let x=12;x<WORLD.WIDTH;x+=29){const y=WORLD.FLOOR_Y+8+((x*19)%75);ctx.fillRect(x,y,2,2);}
    ctx.strokeStyle='rgba(255,248,220,.92)';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(WORLD.LEFT,WORLD.FLOOR_Y+2);ctx.lineTo(WORLD.RIGHT,WORLD.FLOOR_Y+2);ctx.stroke();
  } else if (venueNow.id === 'ice') {
    const ig=ctx.createLinearGradient(0,WORLD.FLOOR_Y,0,WORLD.FLOOR_Y+230);ig.addColorStop(0,'#dff6fb');ig.addColorStop(1,'#86c5d8');ctx.fillStyle=ig;ctx.fillRect(0,WORLD.FLOOR_Y,WORLD.WIDTH,230);
    ctx.strokeStyle='rgba(255,255,255,.72)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(WORLD.LEFT,WORLD.FLOOR_Y+2);ctx.lineTo(WORLD.RIGHT,WORLD.FLOOR_Y+2);ctx.stroke();
  } else if (venueNow.id === 'factory') {
    ctx.fillStyle='#3f3f46';ctx.fillRect(0,WORLD.FLOOR_Y,WORLD.WIDTH,230);ctx.fillStyle='#52525b';ctx.fillRect(WORLD.LEFT,WORLD.FLOOR_Y,WORLD.RIGHT-WORLD.LEFT,230);
    ctx.strokeStyle='rgba(250,204,21,.78)';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(WORLD.LEFT,WORLD.FLOOR_Y+2);ctx.lineTo(WORLD.RIGHT,WORLD.FLOOR_Y+2);ctx.stroke();
  } else if (venueNow.id === 'ship') {
    const yL=(typeof venueFloorYAt==='function')?venueFloorYAt(0):WORLD.FLOOR_Y, yR=(typeof venueFloorYAt==='function')?venueFloorYAt(WORLD.WIDTH):WORLD.FLOOR_Y;
    ctx.fillStyle=floorOuter;ctx.beginPath();ctx.moveTo(0,yL);ctx.lineTo(WORLD.WIDTH,yR);ctx.lineTo(WORLD.WIDTH,WORLD.HEIGHT+200);ctx.lineTo(0,WORLD.HEIGHT+200);ctx.closePath();ctx.fill();
    ctx.fillStyle=floorInner;ctx.beginPath();ctx.moveTo(WORLD.LEFT,venueFloorYAt(WORLD.LEFT));ctx.lineTo(WORLD.RIGHT,venueFloorYAt(WORLD.RIGHT));ctx.lineTo(WORLD.RIGHT,WORLD.HEIGHT+200);ctx.lineTo(WORLD.LEFT,WORLD.HEIGHT+200);ctx.closePath();ctx.fill();
    ctx.strokeStyle='#f8fafc';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(WORLD.LEFT,venueFloorYAt(WORLD.LEFT));ctx.lineTo(WORLD.RIGHT,venueFloorYAt(WORLD.RIGHT));ctx.stroke();
  } else {
    ctx.fillStyle = floorOuter; ctx.fillRect(0, WORLD.FLOOR_Y, WORLD.WIDTH, 230);
    ctx.fillStyle = floorInner; ctx.fillRect(WORLD.LEFT, WORLD.FLOOR_Y, WORLD.RIGHT - WORLD.LEFT, 230);
    // 雨場保留一致木地板；其他一般場地才畫木板分線。
    ctx.strokeStyle = venueNow.id==='rain' ? 'rgba(226,232,240,.16)' : '#b45309'; ctx.lineWidth = 1; ctx.beginPath();
    ctx.moveTo(WORLD.LEFT, WORLD.FLOOR_Y + 16); ctx.lineTo(WORLD.RIGHT, WORLD.FLOOR_Y + 16);
    ctx.moveTo(WORLD.LEFT, WORLD.FLOOR_Y + 32); ctx.lineTo(WORLD.RIGHT, WORLD.FLOOR_Y + 32); ctx.stroke();
    ctx.fillStyle = '#fef3c7'; ctx.fillRect(WORLD.LEFT, WORLD.FLOOR_Y, WORLD.RIGHT - WORLD.LEFT, 2);
    if(venueNow.id==='rain'){
      // V42 水窪屬於地板材質：數量降低、只在地板區內畫，沒有漂浮外框。
      let puddles=[[430,56,7],[920,38,5],[1460,62,8],[2110,44,6],[2590,68,7]],pa=1;if(typeof venueIncidentState!=='undefined'&&venueIncidentState.active==='RAIN_SURGE'){puddles=puddles.concat([[610,46,6],[1120,70,8],[1320,35,5],[1710,58,7],[1930,42,6],[2320,64,8],[2750,48,6]]);const el=venueIncidentState.total-venueIncidentState.timer;pa=Math.min(1,el/80,venueIncidentState.timer/100);}for(const [x,w,h] of puddles){const pg=ctx.createRadialGradient(x,WORLD.FLOOR_Y+7,2,x,WORLD.FLOOR_Y+7,w);pg.addColorStop(0,`rgba(186,230,253,${.15*pa})`);pg.addColorStop(.65,`rgba(125,211,252,${.08*pa})`);pg.addColorStop(1,'rgba(125,211,252,0)');ctx.fillStyle=pg;ctx.beginPath();ctx.ellipse(x,WORLD.FLOOR_Y+7,w,h,0,0,Math.PI*2);ctx.fill();}
    }
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 3; ctx.beginPath();
  const leftAttackX = WORLD.NET_X - WORLD.ATTACK_LINE_DIST, rightAttackX = WORLD.NET_X + WORLD.ATTACK_LINE_DIST;
  ctx.moveTo(leftAttackX, WORLD.FLOOR_Y); ctx.lineTo(leftAttackX, WORLD.FLOOR_Y + 45);
  ctx.moveTo(rightAttackX, WORLD.FLOOR_Y); ctx.lineTo(rightAttackX, WORLD.FLOOR_Y + 45);
  ctx.stroke();

  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.setLineDash([8, 8]); ctx.beginPath();
  ctx.moveTo(WORLD.LEFT, WORLD.FLOOR_Y - 160); ctx.lineTo(WORLD.LEFT, WORLD.FLOOR_Y);
  ctx.moveTo(WORLD.RIGHT, WORLD.FLOOR_Y - 160); ctx.lineTo(WORLD.RIGHT, WORLD.FLOOR_Y);
  ctx.stroke(); ctx.setLineDash([]);

  // V49 沙灘球是場地固有物件，先畫球再畫球柱，視覺上會從柱子後方滾過。
  if(venueNow.id==='beach' && typeof venueIncidentState!=='undefined' && venueIncidentState.beachBall){const b=venueIncidentState.beachBall;ctx.save();ctx.translate(b.x,b.y);ctx.rotate(gameFrame*.055*(b.dir||1));for(let i=0;i<6;i++){ctx.fillStyle=['#ef4444','#f8fafc','#38bdf8','#facc15','#f8fafc','#22c55e'][i];ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,b.r,i*Math.PI/3,(i+1)*Math.PI/3);ctx.closePath();ctx.fill();}ctx.strokeStyle='#fff';ctx.lineWidth=4;ctx.stroke();ctx.restore();}

  ctx.fillStyle = '#fef08a'; ctx.fillRect(WORLD.NET_X - WORLD.NET_W/2, WORLD.NET_TOP_Y, WORLD.NET_W, WORLD.NET_H);
  ctx.fillStyle = '#facc15'; ctx.fillRect(WORLD.NET_X - WORLD.NET_W/2 - 2, WORLD.NET_TOP_Y, WORLD.NET_W + 4, 8);

  // V11：只顯示本機真人角色自己的讀球圈。沒有預測軌跡。
  const landingReadHero = (typeof allPlayers !== 'undefined' && typeof NET !== 'undefined')
    ? (allPlayers[NET.mySlot] || userPlayer)
    : userPlayer;
  drawLandingReadIndicator(ctx, landingReadHero);

  for (let i = haloEffects.length - 1; i >= 0; i--) {
    const h = haloEffects[i];
    ctx.save(); ctx.beginPath(); ctx.arc(h.player.x, h.player.y - h.player.radius, h.r, 0, Math.PI * 2);
    ctx.strokeStyle = h.color; ctx.globalAlpha = Math.max(0, h.alpha); ctx.lineWidth = 4.0;
    ctx.stroke(); ctx.restore();
    h.r += (h.maxR - h.r) * 0.22; h.alpha -= (1.0 / h.life);
    if (h.alpha <= 0) haloEffects.splice(i, 1);
  }

  // V40 濕地/冰面反射：以角色與球的 180° 垂直鏡像做低透明反光，不改任何碰撞或規則。
  if (venueNow.id === 'rain' || venueNow.id === 'ice') {
    ctx.save();ctx.beginPath();ctx.rect(0,WORLD.FLOOR_Y,WORLD.WIDTH,145);ctx.clip();
    const reflAlpha=venueNow.id==='ice'?.18:.12;
    allPlayers.forEach(p=>{ctx.save();ctx.globalAlpha=reflAlpha;ctx.translate(0,2*WORLD.FLOOR_Y);ctx.scale(1,-1);drawPlayerEntity(p,ctx);ctx.restore();});
    if(!isNaN(ball.x)&&!isNaN(ball.y)){ctx.save();ctx.globalAlpha=reflAlpha+.05;ctx.translate(ball.x,2*WORLD.FLOOR_Y-ball.y);ctx.scale(1,-.72);ctx.beginPath();ctx.arc(0,0,ball.radius,0,Math.PI*2);ctx.fillStyle='#f8fafc';ctx.fill();ctx.restore();}
    ctx.restore();
  }

  allPlayers.forEach(p => { if((p.roarVfxTimer||0)>0){p.roarVfxTimer--;ctx.save();ctx.translate((Math.random()-.5)*12,(Math.random()-.5)*5);p.draw(ctx);ctx.restore();}else p.draw(ctx); });

  // 發球蓄力條：動態對齊當前發球員
  if (serveState.charging && serveState.currentServer) {
    const s = serveState.currentServer;
    ctx.fillStyle = '#1e1b4b'; ctx.fillRect(s.x - 20, s.y - s.radius * 2 - 24, 40, 6);
    ctx.fillStyle = '#facc15'; ctx.fillRect(s.x - 20, s.y - s.radius * 2 - 24, (serveState.chargePower / 100) * 40, 6);
  }

  if (!isNaN(ball.x) && !isNaN(ball.y)) {
    ctx.save(); ctx.globalAlpha = ball.opacity;
    ctx.translate(ball.x, ball.y); ctx.rotate(ball.rotation);

    if (ball.hasTossedFromGodspeed) { ctx.shadowColor = '#facc15'; ctx.shadowBlur = 62;
      ctx.save();ctx.globalCompositeOperation='lighter';
      // Light volume overlaps the ball itself so it feels immersed, not merely ringed.
      let gg=ctx.createRadialGradient(-ball.radius*.25,-ball.radius*.3,1,0,0,ball.radius*3.15);gg.addColorStop(0,'rgba(255,255,250,.72)');gg.addColorStop(.22,'rgba(255,248,210,.48)');gg.addColorStop(.52,'rgba(251,191,36,.22)');gg.addColorStop(1,'rgba(245,158,11,0)');ctx.fillStyle=gg;ctx.shadowColor='#fbbf24';ctx.shadowBlur=34;ctx.beginPath();ctx.arc(0,0,ball.radius*3.15,0,Math.PI*2);ctx.fill();
      ctx.globalAlpha=.34;ctx.strokeStyle='#fff7d6';ctx.lineWidth=6;ctx.shadowBlur=28;ctx.beginPath();ctx.arc(0,0,ball.radius*1.25,0,Math.PI*2);ctx.stroke();
      ctx.globalAlpha=.46;ctx.lineWidth=1.25;ctx.beginPath();ctx.ellipse(0,0,ball.radius*1.95,ball.radius*.72,-.28,0,Math.PI*2);ctx.stroke();
      for(let i=0;i<7;i++){const q=gameFrame*.08+i*.9,rr=ball.radius*(1.5+(i%3)*.45);ctx.globalAlpha=.2+(i%2)*.16;ctx.fillStyle=i%3?'#fde68a':'#fffdf2';ctx.beginPath();ctx.arc(Math.cos(q)*rr,Math.sin(q)*rr*.7,1.1+(i%3)*.45,0,Math.PI*2);ctx.fill();}
      ctx.restore(); }
    else if (ball.glowColor) { ctx.shadowColor = ball.glowColor; ctx.shadowBlur = 35; }
    else if (ball.isPerfectSpike || ball.isSkyComet) { ctx.shadowColor = '#ef4444'; ctx.shadowBlur = 30; }
    else if (ball.isSpiked) { ctx.shadowColor = '#f43f5e'; ctx.shadowBlur = 20; }

    ctx.beginPath(); ctx.arc(0, 0, ball.radius, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#312e81'; ctx.stroke();
    ctx.fillStyle = ball.glowColor ? ball.glowColor : (ball.isSkyComet ? '#facc15' : (ball.isPerfectSpike ? '#ef4444' : (ball.isSpiked ? '#f43f5e' : '#38bdf8')));
    ctx.beginPath(); ctx.arc(0, 0, ball.radius, -0.5, 0.8); ctx.lineTo(0, 0); ctx.fill();
    ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.arc(0, 0, ball.radius, 1.8, 3.0); ctx.lineTo(0, 0); ctx.fill();

    // V74-19 Mud Spike material: irregular heavy mud shell, visibly chipped after the first contamination.
    if((ball.mudCharges||0)>0){
      const rr=ball.radius+(ball.mudCharges===2?7:4),pts=22;ctx.save();ctx.globalCompositeOperation='source-over';
      const mg=ctx.createRadialGradient(-rr*.28,-rr*.32,2,0,0,rr*1.08);mg.addColorStop(0,'#9a6a3a');mg.addColorStop(.52,'#5b371d');mg.addColorStop(1,'#2f1a0d');ctx.fillStyle=mg;ctx.shadowColor='#3f220f';ctx.shadowBlur=12;ctx.beginPath();
      for(let i=0;i<=pts;i++){const a=i/pts*Math.PI*2,jag=1+.10*Math.sin(i*2.73+gameFrame*.11)+.055*Math.sin(i*5.17-gameFrame*.07),r=rr*jag,x=Math.cos(a)*r,y=Math.sin(a)*r;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.closePath();ctx.fill();
      // broken windows expose the original volleyball, especially after charge #1.
      ctx.globalAlpha=ball.mudCharges===2?.32:.62;ctx.fillStyle='#f8fafc';ctx.beginPath();ctx.arc(-3,-2,ball.radius*(ball.mudCharges===2?.32:.48),-.8,1.05);ctx.lineTo(0,0);ctx.fill();
      ctx.globalAlpha=.62;ctx.fillStyle='#b7793f';for(let i=0;i<6;i++){const a=i*1.07+gameFrame*.025,r=rr*(.62+(i%2)*.18);ctx.beginPath();ctx.arc(Math.cos(a)*r,Math.sin(a)*r,1.4+(i%3),0,Math.PI*2);ctx.fill();}ctx.restore();
    }

    // V74-21 Greased Ball: translucent amber oil membrane with subtle iridescent highlights.
    if((ball.greaseCharges||0)>0){const rr=ball.radius+5+Math.sin(gameFrame*.18)*1.2;ctx.save();ctx.globalCompositeOperation='lighter';const og=ctx.createRadialGradient(-rr*.25,-rr*.3,2,0,0,rr*1.35);og.addColorStop(0,'rgba(255,251,235,.38)');og.addColorStop(.42,'rgba(245,158,11,.18)');og.addColorStop(.72,'rgba(180,83,9,.32)');og.addColorStop(1,'rgba(120,53,15,0)');ctx.fillStyle=og;ctx.shadowColor='#f59e0b';ctx.shadowBlur=18;ctx.beginPath();ctx.arc(0,0,rr*1.35,0,Math.PI*2);ctx.fill();ctx.globalAlpha=.52;ctx.strokeStyle=(gameFrame%30<15)?'#a5f3fc':'#f0abfc';ctx.lineWidth=1.8;ctx.beginPath();ctx.arc(-2,-2,rr,3.45,5.75);ctx.stroke();ctx.restore();}
    // Sky Comet: white-hot meteor head and atmospheric compression shell.
    if(ball.activeSkillTag==='天際墜石' && (ball.isSkyComet || (ball.skyImpactFadeFrames||0)>0)){
      const fade=ball.isSkyComet?1:Math.max(0,(ball.skyImpactFadeFrames||0)/12);ctx.save();ctx.globalCompositeOperation='lighter';
      const hg=ctx.createRadialGradient(0,0,2,0,0,ball.radius*3.7);hg.addColorStop(0,`rgba(255,255,255,${.98*fade})`);hg.addColorStop(.28,`rgba(255,244,180,${.78*fade})`);hg.addColorStop(.62,`rgba(251,146,60,${.30*fade})`);hg.addColorStop(1,'rgba(239,68,68,0)');ctx.fillStyle=hg;ctx.shadowColor='#fff7d6';ctx.shadowBlur=42;ctx.beginPath();ctx.arc(0,0,ball.radius*3.7,0,Math.PI*2);ctx.fill();
      const ang=Math.atan2(ball.vy,ball.vx);ctx.rotate(ang);ctx.globalAlpha=.55*fade;ctx.strokeStyle='#fff7ed';ctx.lineWidth=5;ctx.shadowColor='#fb923c';ctx.shadowBlur=24;ctx.beginPath();ctx.arc(ball.radius*.42,0,ball.radius*1.55,-1.12,1.12);ctx.stroke();ctx.restore();
    }
    // Gravity Soft Wall charged ball: white feather halo fades after teammate control.
    if((ball.softWallGlowFrames||0)>0){const a=ball.softWallGlowFrames>12?1:ball.softWallGlowFrames/12;ctx.save();ctx.globalCompositeOperation='lighter';const wg=ctx.createRadialGradient(0,0,ball.radius*.4,0,0,ball.radius*3);wg.addColorStop(0,`rgba(255,255,255,${.72*a})`);wg.addColorStop(.5,`rgba(226,232,240,${.24*a})`);wg.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=wg;ctx.shadowColor='#ffffff';ctx.shadowBlur=30;ctx.beginPath();ctx.arc(0,0,ball.radius*3,0,Math.PI*2);ctx.fill();ctx.restore();}
    if(ball.activeSkillTag==='深海重砲' && ball.deepWaterActive!==false){
      // V74-9 deep-sea material: dark mass + luminous cyan rim + soft outer caustic halo.
      const wob=2+Math.sin(gameFrame*.8)*1.4, rr=ball.radius+5+wob;
      ctx.save(); ctx.globalCompositeOperation='source-over';
      const dg=ctx.createRadialGradient(-rr*.28,-rr*.30,2,0,0,rr*1.18);
      dg.addColorStop(0,'rgba(12,38,110,.88)'); dg.addColorStop(.48,'rgba(3,21,47,.96)'); dg.addColorStop(1,'rgba(1,7,24,.98)');
      ctx.globalAlpha=.97;ctx.fillStyle=dg;ctx.beginPath();ctx.arc(0,0,rr,0,Math.PI*2);ctx.fill();
      ctx.globalCompositeOperation='lighter';ctx.strokeStyle='rgba(20,184,166,.72)';ctx.lineWidth=2.2;ctx.shadowColor='#0ea5e9';ctx.shadowBlur=26;ctx.beginPath();ctx.arc(0,0,rr+1,0,Math.PI*2);ctx.stroke();
      ctx.globalAlpha=.24;ctx.lineWidth=7;ctx.shadowBlur=38;ctx.beginPath();ctx.arc(0,0,rr+5,0,Math.PI*2);ctx.stroke();ctx.restore();
    }
    if(ball.isBungeeGum || (ball.bungeeTetherFrames||0)>0){
      const wob=Math.sin(gameFrame*.27),rr=ball.radius+7+wob*1.2;ctx.save();ctx.globalCompositeOperation='source-over';
      // Thick gum membrane: clear-ish center, dense saturated body, nearly opaque irregular rim.
      const gum=ctx.createRadialGradient(-rr*.24,-rr*.28,rr*.08,0,0,rr*1.10);gum.addColorStop(0,'rgba(255,245,252,.10)');gum.addColorStop(.38,'rgba(251,113,180,.26)');gum.addColorStop(.67,'rgba(236,72,153,.74)');gum.addColorStop(.88,'rgba(219,39,119,.94)');gum.addColorStop(1,'rgba(157,23,77,1)');ctx.fillStyle=gum;ctx.shadowColor='#db2777';ctx.shadowBlur=18;ctx.beginPath();
      const pts=18;for(let i=0;i<=pts;i++){const a=i/pts*Math.PI*2,r=rr*(1+.045*Math.sin(i*2.7+gameFrame*.18)+.025*Math.sin(i*5.1-gameFrame*.11)),x=Math.cos(a)*r,y=Math.sin(a)*r;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.closePath();ctx.fill();
      ctx.globalAlpha=.95;ctx.strokeStyle='#be185d';ctx.lineWidth=4.8;ctx.shadowBlur=12;ctx.stroke();
      ctx.globalAlpha=.42;ctx.strokeStyle='#fbcfe8';ctx.lineWidth=2.2;ctx.beginPath();ctx.arc(-rr*.18,-rr*.18,rr*.58,3.55,5.15);ctx.stroke();ctx.restore();
    }
    if(ball.activeSkillTag==='落日正弦'){
      const rr=ball.radius+7+Math.sin(gameFrame*.22)*1.8;
      ctx.save();ctx.globalCompositeOperation='lighter';
      const sg=ctx.createRadialGradient(0,0,ball.radius*.25,0,0,rr*2.8);
      sg.addColorStop(0,'rgba(255,255,245,.98)');sg.addColorStop(.28,'rgba(255,244,170,.76)');sg.addColorStop(.62,'rgba(251,191,36,.28)');sg.addColorStop(1,'rgba(245,158,11,0)');
      ctx.fillStyle=sg;ctx.shadowColor='#fbbf24';ctx.shadowBlur=34;ctx.beginPath();ctx.arc(0,0,rr*2.8,0,Math.PI*2);ctx.fill();
      ctx.globalAlpha=.34;ctx.strokeStyle='#fde68a';ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(0,0,rr*2.5,rr*.75,-.18,0,Math.PI*2);ctx.stroke();
      ctx.globalAlpha=.20;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-rr*3.4,0);ctx.lineTo(rr*3.4,0);ctx.stroke();ctx.restore();
    }
    ctx.restore();
    if(ball.activeSkillTag==='深海重砲' && ball.deepWaterActive!==false && gameFrame%2===0){visualEffects.push({type:'water_drop',x:ball.x-ball.vx*.7+(Math.random()-.5)*8,y:ball.y-ball.vy*.7+(Math.random()-.5)*8,vx:-ball.vx*.08,vy:-ball.vy*.08,life:12,maxLife:12,size:2+Math.random()*3,color:'#0e7490'});}
    if((ball.bungeeTetherFrames||0)>0 && ball.bungeeTetherSlot){const tp=allPlayers.find(p=>p.slotKey===ball.bungeeTetherSlot);if(tp){const bx=ball.x,by=ball.y,baseX=tp.x,baseY=tp.y-tp.radius*.78,dx=bx-baseX,dy=by-baseY,d=Math.hypot(dx,dy),cap=Math.min(d,175),ux=d?dx/d:1,uy=d?dy/d:0,ex=baseX+ux*cap,ey=baseY+uy*cap,age=26-(ball.bungeeTetherFrames||0);ctx.save();ctx.globalCompositeOperation='source-over';
      // Five spatially separated gum strands; thin strands snap earlier so they never read as one line.
      const strands=[{o:-11,w:5.8,s:26},{o:-5,w:4.3,s:22},{o:1,w:5.2,s:26},{o:7,w:3.5,s:18},{o:12,w:4.5,s:23}];
      strands.forEach((st,i)=>{if(age>st.s)return;const nx=-uy,ny=ux,sx=baseX+nx*st.o,sy=baseY+ny*st.o*.55,endX=ex+nx*st.o*.28,endY=ey+ny*st.o*.18,bend=(i-2)*9+Math.sin(gameFrame*.32+i*1.7)*7;ctx.strokeStyle=i%2?'rgba(244,114,182,.88)':'rgba(219,39,119,.96)';ctx.lineWidth=st.w;ctx.lineCap='round';ctx.shadowColor='#ec4899';ctx.shadowBlur=9;ctx.beginPath();ctx.moveTo(sx,sy);ctx.bezierCurveTo(sx+dx*.32+nx*bend,sy+dy*.30+ny*bend,endX-dx*.22-nx*bend*.4,endY-dy*.18-ny*bend*.4,endX,endY);ctx.stroke();ctx.globalAlpha=.55;ctx.strokeStyle='#fbcfe8';ctx.lineWidth=Math.max(1,st.w*.24);ctx.stroke();ctx.globalAlpha=1;});
      // sticky roots make the attachment feel broad instead of pin-point.
      ctx.fillStyle='#db2777';ctx.shadowBlur=10;for(let j=0;j<4;j++){ctx.beginPath();ctx.arc(baseX+(j-1.5)*6,baseY+Math.sin(j+gameFrame*.2)*3,2.5+(j%2),0,Math.PI*2);ctx.fill();}ctx.restore();}}
    if((ball.stormTrailFrames||0)>0){ball.stormTrailFrames--;visualEffects.push({type:'wind_trail',x:ball.x-ball.vx*.65,y:ball.y-ball.vy*.65,life:12,maxLife:12,radius:ball.radius+8,color:'#bae6fd'});}
  }


  if(ball.timeLagFrames>0){
    ctx.save(); const prog=1-ball.timeLagFrames/24; ctx.translate(ball.x,ball.y); ctx.globalCompositeOperation='lighter';
    // layered gravity well: dim outer lens, bright compressed core, spiral matter streaks
    const halo=ctx.createRadialGradient(0,0,ball.radius*.45,0,0,ball.radius+52);
    halo.addColorStop(0,'rgba(255,255,255,.22)');halo.addColorStop(.22,'rgba(124,58,237,.20)');halo.addColorStop(.62,'rgba(49,46,129,.10)');halo.addColorStop(1,'rgba(0,0,0,0)');
    ctx.globalAlpha=.9;ctx.fillStyle=halo;ctx.beginPath();ctx.arc(0,0,ball.radius+52,0,Math.PI*2);ctx.fill();
    for(let i=0;i<28;i++){const a=(i*.79)+(gameFrame*.085)*(1+prog*2.4),r=22+(i%8)*8*(1-prog*.42);const px=Math.cos(a)*r,py=Math.sin(a)*r*.58;ctx.strokeStyle=i%4?'rgba(196,181,253,.68)':'rgba(96,165,250,.82)';ctx.lineWidth=1+(i%3)*.65;ctx.shadowColor='#8b5cf6';ctx.shadowBlur=9;ctx.beginPath();ctx.arc(0,0,r,a-.20-prog*.12,a+.06);ctx.stroke();ctx.fillStyle='rgba(237,233,254,.82)';ctx.beginPath();ctx.arc(px,py,1+(i%3)*.65,0,Math.PI*2);ctx.fill();}
    ctx.strokeStyle='rgba(221,214,254,.88)';ctx.lineWidth=2;ctx.shadowColor='#7c3aed';ctx.shadowBlur=26;ctx.beginPath();ctx.arc(0,0,ball.radius+9+Math.sin(gameFrame*.4)*2.5,0,Math.PI*2);ctx.stroke();ctx.restore();
  }

  // V74-21 Phantom Wipe decoys: almost-real balls with only a faint chromatic fringe / echo.
  if(typeof phantomDecoys!=='undefined') phantomDecoys.forEach(d=>{const fade=d.fade>0?d.fade/16:1;ctx.save();ctx.translate(d.x,d.y);ctx.rotate(d.rotation||0);ctx.globalAlpha=Math.min(1,fade*.98);const cols=['#f8fafc','#facc15','#38bdf8'];for(let k=0;k<6;k++){ctx.fillStyle=cols[k%3];ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,d.radius,k*Math.PI/3,(k+1)*Math.PI/3);ctx.closePath();ctx.fill();}ctx.strokeStyle='#ffffff';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(0,0,d.radius,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=.11*fade;ctx.strokeStyle='#67e8f9';ctx.lineWidth=1.3;ctx.beginPath();ctx.arc(1.5,0,d.radius+1,0,Math.PI*2);ctx.stroke();ctx.strokeStyle='#f0abfc';ctx.beginPath();ctx.arc(-1.5,0,d.radius+1,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=.07*fade;ctx.translate(-d.vx*.45,-d.vy*.45);ctx.fillStyle='#f8fafc';ctx.beginPath();ctx.arc(0,0,d.radius*.82,0,Math.PI*2);ctx.fill();ctx.restore();});

  visualEffects.forEach(fx => {
    ctx.save();
    if (fx.type === 'shockwave') {
      ctx.beginPath(); ctx.arc(fx.x, fx.y, fx.radius, 0, Math.PI * 2);
      ctx.strokeStyle = fx.color; ctx.globalAlpha = Math.max(0, fx.alpha); ctx.lineWidth = 4; ctx.stroke();
    } else if (fx.type === 'spark') {
      ctx.beginPath(); ctx.arc(fx.x, fx.y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = fx.color; ctx.globalAlpha = fx.life / fx.maxLife; ctx.fill();
    } else if (fx.type === 'mud_drop') {
      ctx.beginPath(); ctx.arc(fx.x, fx.y, fx.size * (fx.life / fx.maxLife), 0, Math.PI * 2);
      ctx.fillStyle = fx.color; ctx.globalAlpha = Math.min(1.0, fx.life / 10); ctx.fill();
    } else if (fx.type === 'mud_burst') {
      const q=1-fx.life/fx.maxLife,fade=q<.62?1:Math.max(0,(1-q)/.38);ctx.globalAlpha=fade;ctx.fillStyle='#5b371d';ctx.shadowColor='#3f220f';ctx.shadowBlur=14;
      for(let j=0;j<(fx.heavy?22:17);j++){const ang=j*2.399+(j%3)*.17,rr=q*(44+(j%6)*12),sz=(3.2+(j%4)*2.0)*Math.max(.35,fade);ctx.beginPath();ctx.arc(fx.x+Math.cos(ang)*rr,fx.y+Math.sin(ang)*rr+q*q*30,Math.max(.7,sz),0,Math.PI*2);ctx.fill();}
      ctx.globalAlpha=fade*.52;ctx.strokeStyle='#8b5a2b';ctx.lineWidth=11*fade+3;ctx.beginPath();ctx.arc(fx.x,fx.y,10+q*72,0,Math.PI*2);ctx.stroke();
    } else if (fx.type === 'breaker_wake') {
      const a=fx.life/fx.maxLife,ang=Math.atan2(fx.vy,fx.vx);ctx.translate(fx.x,fx.y);ctx.rotate(ang);ctx.globalCompositeOperation='lighter';ctx.globalAlpha=a*.78;ctx.strokeStyle='#ef4444';ctx.shadowColor='#dc2626';ctx.shadowBlur=18;for(let j=-2;j<=2;j++){ctx.lineWidth=j===0?3.2:1.4;ctx.beginPath();ctx.moveTo(-12,-j*5);ctx.quadraticCurveTo(-35,-j*8,-72-(2-Math.abs(j))*8,-j*11);ctx.stroke();}ctx.globalAlpha=a*.22;ctx.fillStyle='#111827';ctx.beginPath();ctx.moveTo(10,0);ctx.lineTo(-62,-24);ctx.lineTo(-45,0);ctx.lineTo(-62,24);ctx.closePath();ctx.fill();
    } else if (fx.type === 'breaker_impact') {
      const q=1-fx.life/fx.maxLife,a=1-q;ctx.globalCompositeOperation='lighter';ctx.globalAlpha=a*.88;ctx.strokeStyle='#ef4444';ctx.shadowColor='#991b1b';ctx.shadowBlur=28;ctx.lineWidth=6*a+2;ctx.beginPath();ctx.arc(fx.x,fx.y,12+q*82,0,Math.PI*2);ctx.stroke();for(let j=0;j<10;j++){const ang=j*Math.PI/5;ctx.lineWidth=2+(j%2);ctx.beginPath();ctx.moveTo(fx.x+Math.cos(ang)*12,fx.y+Math.sin(ang)*12);ctx.lineTo(fx.x+Math.cos(ang)*(38+q*75),fx.y+Math.sin(ang)*(38+q*75));ctx.stroke();}
    } else if (fx.type === 'sonic_ring') {
      const q=1-fx.life/fx.maxLife,a=1-q,sc=fx.scale||1;ctx.translate(fx.x,fx.y);ctx.rotate(fx.angle||0);ctx.globalCompositeOperation='lighter';ctx.globalAlpha=a*.48;ctx.strokeStyle='#f8fafc';ctx.shadowColor='#ffffff';ctx.shadowBlur=24;ctx.lineWidth=(10*a+2)*sc;ctx.beginPath();ctx.ellipse(0,0,(18+q*58)*sc,(8+q*26)*sc,0,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=a*.16;ctx.lineWidth=(22*a+4)*sc;ctx.stroke();
    } else if (fx.type === 'meteor_trail') {
      const a=fx.life/fx.maxLife,ang=Math.atan2(fx.vy,fx.vx);ctx.translate(fx.x,fx.y);ctx.rotate(ang);ctx.globalCompositeOperation='lighter';const len=70+Math.min(110,Math.hypot(fx.vx,fx.vy)*2.2);const g=ctx.createLinearGradient(8,0,-len,0);g.addColorStop(0,`rgba(255,255,255,${.9*a})`);g.addColorStop(.22,`rgba(253,186,116,${.75*a})`);g.addColorStop(.58,`rgba(239,68,68,${.38*a})`);g.addColorStop(1,'rgba(127,29,29,0)');ctx.fillStyle=g;ctx.shadowColor='#fb923c';ctx.shadowBlur=28;ctx.beginPath();ctx.moveTo(8,-8*a);ctx.quadraticCurveTo(-len*.42,-18*a,-len,0);ctx.quadraticCurveTo(-len*.42,18*a,8,8*a);ctx.closePath();ctx.fill();
    } else if (fx.type === 'meteor_impact') {
      const q=1-fx.life/fx.maxLife,a=1-q;ctx.globalCompositeOperation='lighter';const R=18+q*175;const g=ctx.createRadialGradient(fx.x,fx.y,0,fx.x,fx.y,R);g.addColorStop(0,`rgba(255,255,255,${.98*a})`);g.addColorStop(.22,`rgba(254,240,138,${.86*a})`);g.addColorStop(.52,`rgba(249,115,22,${.48*a})`);g.addColorStop(.78,`rgba(220,38,38,${.22*a})`);g.addColorStop(1,'rgba(127,29,29,0)');ctx.fillStyle=g;ctx.shadowColor='#fb923c';ctx.shadowBlur=48;ctx.beginPath();ctx.arc(fx.x,fx.y,R,0,Math.PI*2);ctx.fill();ctx.globalAlpha=a*.92;ctx.strokeStyle='#fff7ed';ctx.lineWidth=7*a+2;ctx.beginPath();ctx.arc(fx.x,fx.y,20+q*150,0,Math.PI*2);ctx.stroke();for(let j=0;j<16;j++){const ang=j*2.399,rr=q*(55+(j%6)*20);ctx.globalAlpha=a*(.45+(j%3)*.15);ctx.fillStyle=j%3?'#fb923c':'#fff7d6';ctx.beginPath();ctx.arc(fx.x+Math.cos(ang)*rr,fx.y+Math.sin(ang)*rr,2+(j%4),0,Math.PI*2);ctx.fill();}
    } else if (fx.type === 'soft_wall_touch') {
      const q=1-fx.life/fx.maxLife,a=1-q;ctx.globalCompositeOperation='lighter';ctx.globalAlpha=a*.85;ctx.strokeStyle='#ffffff';ctx.shadowColor='#ffffff';ctx.shadowBlur=24;ctx.lineWidth=4*a+1;ctx.beginPath();ctx.arc(fx.x,fx.y,8+q*48,0,Math.PI*2);ctx.stroke();
    } else if (fx.type === 'grease_burst') {const q=1-fx.life/fx.maxLife,hold=q<.55?1:Math.max(0,(1-q)/.45),R=fx.radius||150;ctx.globalCompositeOperation='source-over';ctx.globalAlpha=.16*hold;ctx.fillStyle='#d97706';ctx.beginPath();ctx.arc(fx.x,fx.y,R,0,Math.PI*2);ctx.fill();for(let j=0;j<34;j++){const ang=j*2.399+(j%4)*.11,rr=Math.min(R-4,q*(38+(j%9)*18)),sz=(3.5+(j%5)*1.7)*(1-q*.35);ctx.globalAlpha=hold*(.46+(j%3)*.14);ctx.fillStyle=j%5===0?'#fbbf24':(j%2?'#b45309':'#d97706');ctx.beginPath();ctx.ellipse(fx.x+Math.cos(ang)*rr,fx.y+Math.sin(ang)*rr+q*q*22,sz*1.65,sz,.2,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=.78*hold;ctx.strokeStyle='#f59e0b';ctx.shadowColor='#fbbf24';ctx.shadowBlur=12;ctx.lineWidth=4;ctx.beginPath();ctx.arc(fx.x,fx.y,R,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=.45*hold;ctx.strokeStyle='#fde68a';ctx.lineWidth=2;ctx.beginPath();ctx.arc(fx.x,fx.y,18+q*(R-18),0,Math.PI*2);ctx.stroke();
    } else if (fx.type === 'grease_splatter') {const a=fx.life/fx.maxLife;ctx.globalCompositeOperation='source-over';for(let j=0;j<12;j++){const ang=j*2.399,rr=(1-a)*(18+(j%5)*7);ctx.globalAlpha=a*(.35+(j%3)*.18);ctx.fillStyle=j%3?'#b45309':'#f59e0b';ctx.beginPath();ctx.ellipse(fx.x+Math.cos(ang)*rr,fx.y+Math.sin(ang)*rr,3+(j%4),5+(j%3)*2,ang,0,Math.PI*2);ctx.fill();}
    } else if (fx.type === 'phantom_shell') {const a=fx.life/fx.maxLife;ctx.globalCompositeOperation='lighter';ctx.globalAlpha=.62*a;ctx.strokeStyle='#c4b5fd';ctx.shadowColor='#a78bfa';ctx.shadowBlur=26;ctx.lineWidth=3.5;ctx.beginPath();ctx.arc(fx.x,fx.y,(fx.radius||13)*(1+(1-a)*.42),0,Math.PI*2);ctx.stroke();
    } else if (fx.type === 'ghost_reform') {const q=1-fx.life/fx.maxLife,a=1-q;ctx.globalCompositeOperation='lighter';ctx.shadowColor='#a78bfa';ctx.shadowBlur=32;ctx.globalAlpha=.70*a;const rg=ctx.createRadialGradient(fx.x,fx.y,4,fx.x,fx.y,22+q*34);rg.addColorStop(0,'rgba(226,232,240,.72)');rg.addColorStop(.42,'rgba(139,127,168,.48)');rg.addColorStop(1,'rgba(109,94,140,0)');ctx.fillStyle=rg;ctx.beginPath();ctx.arc(fx.x,fx.y,22+q*34,0,Math.PI*2);ctx.fill();ctx.globalAlpha=.70*a;ctx.strokeStyle='#c4b5fd';ctx.lineWidth=3.2*a+1;ctx.beginPath();ctx.arc(fx.x,fx.y,10+q*54,0,Math.PI*2);ctx.stroke();for(let j=0;j<30;j++){const ang=j*.47+(j%3)*.18,rr=10+q*(42+(j%7)*9);ctx.globalAlpha=a*(.48+(j%4)*.075);ctx.fillStyle=j%4?'#8b7fa8':'#e2e8f0';ctx.beginPath();ctx.arc(fx.x+Math.cos(ang)*rr,fx.y-q*42+Math.sin(ang)*rr*.42,2.2+(j%4)*.8,0,Math.PI*2);ctx.fill();}
    } else if (fx.type === 'phantom_split') {const q=1-fx.life/fx.maxLife,a=1-q;ctx.globalCompositeOperation='lighter';ctx.globalAlpha=a*.7;ctx.strokeStyle='#c4b5fd';ctx.shadowColor='#a78bfa';ctx.shadowBlur=26;ctx.lineWidth=4*a+1;ctx.beginPath();ctx.arc(fx.x,fx.y,10+q*62,0,Math.PI*2);ctx.stroke();
    } else if (fx.type === 'phantom_dissolve') {const q=1-fx.life/fx.maxLife,a=1-q;ctx.globalCompositeOperation='lighter';for(let j=0;j<10;j++){const ang=j*.628+q;ctx.globalAlpha=a*.45;ctx.fillStyle=j%2?'#c4b5fd':'#67e8f9';ctx.beginPath();ctx.arc(fx.x+Math.cos(ang)*q*38,fx.y+Math.sin(ang)*q*26,2+(j%3),0,Math.PI*2);ctx.fill();}
    } else if (fx.type === 'kinetic_absorb') {const q=1-fx.life/fx.maxLife,a=1-q,I=fx.intensity||.3;ctx.globalCompositeOperation='lighter';ctx.shadowColor='#fde68a';ctx.shadowBlur=28+I*22;for(let j=0;j<12;j++){const ang=j*Math.PI/6+q*.35,r0=110*(1-q)+18,r1=16;ctx.globalAlpha=a*(.28+I*.6);ctx.strokeStyle=j%3?'#f8fafc':'#f59e0b';ctx.lineWidth=1.5+I*3;ctx.beginPath();ctx.moveTo(fx.x+Math.cos(ang)*r0,fx.y+Math.sin(ang)*r0);ctx.lineTo(fx.x+Math.cos(ang)*r1,fx.y+Math.sin(ang)*r1);ctx.stroke();}ctx.globalAlpha=a*(.4+I*.5);ctx.fillStyle='#fff7ed';ctx.beginPath();ctx.arc(fx.x,fx.y,6+I*15*(1-q),0,Math.PI*2);ctx.fill();
    } else if (fx.type === 'kinetic_release') {const q=1-fx.life/fx.maxLife,a=1-q,I=fx.intensity||.3;ctx.globalCompositeOperation='lighter';ctx.shadowColor='#f59e0b';ctx.shadowBlur=30;ctx.globalAlpha=a*(.55+I*.35);ctx.strokeStyle='#fff7ed';ctx.lineWidth=(4+I*7)*a;ctx.beginPath();ctx.arc(fx.x,fx.y,12+q*(70+I*95),0,Math.PI*2);ctx.stroke();ctx.globalAlpha=a*.24;ctx.strokeStyle='#f59e0b';ctx.lineWidth=18*a;ctx.beginPath();ctx.arc(fx.x,fx.y,20+q*(95+I*120),0,Math.PI*2);ctx.stroke();
    } else if (fx.type === 'kinetic_trail') {const a=fx.life/fx.maxLife,I=fx.intensity||.3,ang=Math.atan2(fx.vy,fx.vx);ctx.translate(fx.x,fx.y);ctx.rotate(ang);ctx.globalCompositeOperation='lighter';const len=24+I*54;const g=ctx.createLinearGradient(0,0,-len,0);g.addColorStop(0,`rgba(255,247,237,${.75*a})`);g.addColorStop(.42,`rgba(253,230,138,${.42*a})`);g.addColorStop(1,'rgba(245,158,11,0)');ctx.fillStyle=g;ctx.shadowColor='#fde68a';ctx.shadowBlur=14+I*18;ctx.beginPath();ctx.moveTo(5,-(3+I*4));ctx.lineTo(-len,0);ctx.lineTo(5,3+I*4);ctx.closePath();ctx.fill();
    } else if (fx.type === 'kinetic_impact') {const q=1-fx.life/fx.maxLife,a=1-q,I=fx.intensity||.3,R=18+q*(85+I*105);ctx.globalCompositeOperation='lighter';ctx.shadowColor='#fde68a';ctx.shadowBlur=34+I*20;ctx.globalAlpha=a*(.72+I*.2);ctx.strokeStyle='#fff7ed';ctx.lineWidth=(5+I*7)*a;ctx.beginPath();ctx.ellipse(fx.x,fx.y,R,R*.34,0,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=a*.34;ctx.strokeStyle='#f59e0b';ctx.lineWidth=16*a;ctx.beginPath();ctx.ellipse(fx.x,fx.y,R*.82,R*.28,0,0,Math.PI*2);ctx.stroke();for(let j=0;j<14;j++){const ang=-Math.PI+(j/13)*Math.PI,rr=q*(32+(j%5)*18);ctx.globalAlpha=a*(.35+(j%3)*.15);ctx.fillStyle=j%3?'#fde68a':'#fff7ed';ctx.beginPath();ctx.arc(fx.x+Math.cos(ang)*rr,fx.y-Math.abs(Math.sin(ang))*rr*.75,2+(j%4),0,Math.PI*2);ctx.fill();}
    } else if (fx.type === 'water_drop') {ctx.globalAlpha=fx.life/fx.maxLife;ctx.fillStyle=fx.color;ctx.beginPath();ctx.arc(fx.x,fx.y,fx.size,0,Math.PI*2);ctx.fill();
    } else if (fx.type === 'wind_trail') {ctx.globalAlpha=(fx.life/fx.maxLife)*.55;ctx.strokeStyle=fx.color;ctx.lineWidth=3;ctx.beginPath();ctx.arc(fx.x,fx.y,fx.radius+(fx.maxLife-fx.life)*2,-1.2,1.8);ctx.stroke();
    } else if (fx.type === 'water_burst') {const q=1-fx.life/fx.maxLife,a=1-q;ctx.globalCompositeOperation='lighter';ctx.shadowColor='#0891b2';ctx.shadowBlur=30;ctx.globalAlpha=a*.34;ctx.fillStyle='#071a4a';ctx.beginPath();ctx.arc(fx.x,fx.y,16+q*92,0,Math.PI*2);ctx.fill();ctx.globalAlpha=a*.92;ctx.strokeStyle='#22d3ee';ctx.lineWidth=8*a+2;ctx.beginPath();ctx.arc(fx.x,fx.y,18+q*120,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=a*.34;ctx.lineWidth=16*a+3;ctx.beginPath();ctx.arc(fx.x,fx.y,28+q*145,0,Math.PI*2);ctx.stroke();
    } else if (fx.type === 'storm_burst') {const q=1-fx.life/fx.maxLife,a=1-q;ctx.globalCompositeOperation='lighter';const R=28+q*190;ctx.shadowColor='#e0f2fe';ctx.shadowBlur=46;ctx.globalAlpha=a*.18;ctx.fillStyle='#bae6fd';ctx.beginPath();ctx.arc(fx.x,fx.y,R,0,Math.PI*2);ctx.fill();ctx.globalAlpha=a*.42;ctx.strokeStyle='#7dd3fc';ctx.lineWidth=26*a+5;ctx.beginPath();ctx.arc(fx.x,fx.y,R*.82,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=a;ctx.strokeStyle='#ffffff';ctx.lineWidth=5.5*a+1.5;ctx.beginPath();ctx.arc(fx.x,fx.y,R*.72,0,Math.PI*2);ctx.stroke();for(let j=0;j<12;j++){const ang=j*Math.PI/6+q*.9, r0=36+q*55, r1=105+q*150;ctx.globalAlpha=a*(.45+(j%3)*.16);ctx.lineWidth=3+(j%2)*2;ctx.beginPath();ctx.moveTo(fx.x+Math.cos(ang)*r0,fx.y+Math.sin(ang)*r0);ctx.quadraticCurveTo(fx.x+Math.cos(ang+.28)*(r0+r1)*.52,fx.y+Math.sin(ang+.28)*(r0+r1)*.52,fx.x+Math.cos(ang+.5)*r1,fx.y+Math.sin(ang+.5)*r1);ctx.stroke();}
    } else if (fx.type === 'solar_burst') {const q=1-fx.life/fx.maxLife,a=1-q;ctx.globalCompositeOperation='lighter';ctx.shadowColor='#fde68a';ctx.shadowBlur=30;for(let j=0;j<22;j++){const ang=j*2.399+q*.25,rr=8+q*(38+(j%6)*9);ctx.globalAlpha=a*(.35+(j%4)*.14);ctx.fillStyle=j%3?'#fde68a':'#fffdf2';ctx.beginPath();ctx.arc(fx.x+Math.cos(ang)*rr,fx.y+Math.sin(ang)*rr,1.4+(j%4)*.7,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=a*.7;ctx.strokeStyle='#fff7c2';ctx.lineWidth=3*a+1;ctx.beginPath();ctx.arc(fx.x,fx.y,10+q*58,0,Math.PI*2);ctx.stroke();
    } else if (fx.type === 'gum_snap') {const q=1-fx.life/fx.maxLife;ctx.globalCompositeOperation='lighter';ctx.globalAlpha=1-q;ctx.fillStyle='#f9a8d4';for(let j=0;j<8;j++){const a=j*Math.PI/4;ctx.beginPath();ctx.arc(fx.x+Math.cos(a)*q*28,fx.y+Math.sin(a)*q*20,2+(j%3),0,Math.PI*2);ctx.fill();}
    } else if (fx.type === 'roar_wave') {const q=1-fx.life/fx.maxLife,a=1-q;ctx.globalCompositeOperation='lighter';ctx.shadowColor='#b91c1c';ctx.shadowBlur=42;ctx.globalAlpha=a*.24;ctx.strokeStyle='#991b1b';ctx.lineWidth=28*a+5;ctx.beginPath();ctx.arc(fx.x,fx.y,25+q*245,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=a*.96;ctx.strokeStyle='#ef4444';ctx.lineWidth=8*a+2;ctx.beginPath();ctx.arc(fx.x,fx.y,25+q*235,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=a*.38;ctx.lineWidth=5;ctx.beginPath();ctx.arc(fx.x,fx.y,18+q*330,0,Math.PI*2);ctx.stroke();
    } else if (fx.type === 'time_burst') {const q=1-fx.life/fx.maxLife,a=1-q;ctx.globalCompositeOperation='lighter';ctx.shadowColor='#7c3aed';ctx.shadowBlur=34;ctx.globalAlpha=a*.28;ctx.fillStyle='#312e81';ctx.beginPath();ctx.arc(fx.x,fx.y,8+q*95,0,Math.PI*2);ctx.fill();ctx.globalAlpha=a;ctx.strokeStyle='#ddd6fe';ctx.lineWidth=5*a+1;ctx.beginPath();ctx.arc(fx.x,fx.y,12+q*145,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=a*.42;ctx.lineWidth=14*a+2;ctx.beginPath();ctx.arc(fx.x,fx.y,18+q*175,0,Math.PI*2);ctx.stroke();
    } else if (fx.type === 'time_collapse') {const q=fx.life/fx.maxLife;ctx.globalAlpha=q;ctx.strokeStyle='#a78bfa';ctx.lineWidth=4;ctx.beginPath();ctx.arc(fx.x,fx.y,8+q*42,0,Math.PI*2);ctx.stroke();
    } else if (fx.type === 'blade_slash') {
      const a=Math.max(0,fx.life/fx.maxLife), sc=fx.scale||1;ctx.save();ctx.translate(fx.x,fx.y);ctx.rotate(fx.angle||0);ctx.globalCompositeOperation='lighter';ctx.shadowColor='#facc15';ctx.shadowBlur=34;ctx.globalAlpha=a*.35;ctx.strokeStyle='#f59e0b';ctx.lineWidth=18*sc*a+3;ctx.beginPath();ctx.moveTo(-85*sc,18*sc);ctx.quadraticCurveTo(0,-16*sc,110*sc,-10*sc);ctx.stroke();ctx.globalAlpha=a;ctx.strokeStyle='#fffbea';ctx.lineWidth=3.5*sc;ctx.beginPath();ctx.moveTo(-92*sc,15*sc);ctx.quadraticCurveTo(0,-18*sc,118*sc,-12*sc);ctx.stroke();ctx.restore();
    } else if (fx.type === 'thunder_arc') {
      const a=Math.max(0,fx.life/fx.maxLife);ctx.globalCompositeOperation='lighter';ctx.shadowColor='#38bdf8';ctx.shadowBlur=22;for(let k=0;k<3;k++){ctx.beginPath();ctx.moveTo(fx.x1,fx.y1);for(let j=1;j<=7;j++){const t=j/7,xx=fx.x1+(fx.x2-fx.x1)*t,yy=fx.y1+(fx.y2-fx.y1)*t;const off=Math.sin((j*12.7+k*4.1+fx.seed))*14*a;ctx.lineTo(xx,yy+off);}ctx.globalAlpha=a*(k?0.42:.9);ctx.strokeStyle=k?'#60a5fa':'#e0f2fe';ctx.lineWidth=k?2:3.5;ctx.stroke();}
    } else if (fx.type === 'gravity_arc') {
      const a=Math.max(0,fx.life/fx.maxLife),q=1-a,r=13+q*34;ctx.globalCompositeOperation='lighter';ctx.shadowColor='#6d28d9';ctx.shadowBlur=20;ctx.globalAlpha=a*.75;ctx.strokeStyle='#7c3aed';ctx.lineWidth=5*a+1;ctx.beginPath();ctx.arc(fx.x,fx.y,r,fx.phase+q*.8,fx.phase+2.8+q*1.2);ctx.stroke();ctx.globalAlpha=a*.3;ctx.strokeStyle='#111827';ctx.lineWidth=11*a+2;ctx.beginPath();ctx.arc(fx.x,fx.y,r+6,fx.phase+.4,fx.phase+2.4);ctx.stroke();
    } else if (fx.type === 'solar_filament') {
      const a=Math.max(0,fx.life/fx.maxLife);ctx.globalCompositeOperation='lighter';ctx.shadowColor='#f59e0b';ctx.shadowBlur=15;ctx.globalAlpha=a*.82;ctx.strokeStyle='#fde68a';ctx.lineWidth=Math.max(.7,fx.size*a);ctx.beginPath();ctx.moveTo(fx.x,fx.y-10);ctx.quadraticCurveTo(fx.x+5,fx.y,fx.x,fx.y+16);ctx.stroke();
    } else if (fx.type === 'skin_mote') {
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, fx.size * (fx.life / fx.maxLife), 0, Math.PI * 2);
      ctx.fillStyle = fx.color;
      ctx.globalAlpha = Math.min(0.8, fx.life / fx.maxLife);
      ctx.fill();
    }
    ctx.restore();
  });


  // 🌟 文字呼喊與金幣浮空：鏡像模式下二次翻轉，防止鏡像反字！
  for (let i = calloutPopups.length - 1; i >= 0; i--) {
    const pop = calloutPopups[i];
    pop.timer--; pop.y -= Number.isFinite(pop.rise) ? pop.rise : 0.6;
    ctx.save();
    ctx.translate(pop.x, pop.y);
    if (isGuestMirror) ctx.scale(-1, 1);
    if (pop.pulse) { const q=Math.max(0,pop.timer/(pop.maxTimer||1)); const sc=1+Math.sin((1-q)*Math.PI)*.08; ctx.scale(sc,sc); }
    ctx.font = pop.font || '850 19px -apple-system, sans-serif'; ctx.textAlign = 'center';
    const fade=Math.min(1, pop.timer / Math.max(8,Math.min(14,(pop.maxTimer||45)*.32)));
    ctx.globalAlpha = (Number.isFinite(pop.maxAlpha)?pop.maxAlpha:1) * fade;
    ctx.strokeStyle = '#0f172a'; ctx.lineWidth = Number.isFinite(pop.strokeWidth)?pop.strokeWidth:3; ctx.strokeText(pop.text, 0, 0);
    ctx.fillStyle = pop.color; ctx.fillText(pop.text, 0, 0);
    ctx.restore();
    if (pop.timer <= 0) calloutPopups.splice(i, 1);
  }

  for (let i = coinPopups.length - 1; i >= 0; i--) {
    const cp = coinPopups[i];
    cp.timer--; cp.y -= 0.8;
    ctx.save();
    ctx.translate(cp.x, cp.y);
    if (isGuestMirror) ctx.scale(-1, 1);
    ctx.font = '900 20px -apple-system, sans-serif'; ctx.textAlign = 'center';
    ctx.globalAlpha = Math.min(1, cp.timer / 15);
    ctx.strokeStyle = '#78350f'; ctx.lineWidth = 3; ctx.strokeText(`+${cp.amount} 🪙`, 0, 0);
    ctx.fillStyle = '#facc15'; ctx.fillText(`+${cp.amount} 🪙`, 0, 0);
    ctx.restore();
    if (cp.timer <= 0) coinPopups.splice(i, 1);
  }

  drawVenueForeground();
  drawVenueLighting();
  if (typeof drawVenueIncidentOverlay==='function') drawVenueIncidentOverlay();
  if (typeof drawVenuePlayerStatusFX==='function') drawVenuePlayerStatusFX();

  if (timeSlowTimer > 0 || chronoAnimTimer > 0) {
    // V74-17: gameplay can release instantly on first pass while the grade feathers out for 20f.
    const fade = timeSlowTimer > 0 ? 1 : Math.max(0, Math.min(1, chronoAnimTimer / (typeof CHRONO_RELEASE_FADE_FRAMES!=='undefined' ? CHRONO_RELEASE_FADE_FRAMES : 20)));
    const pulse=timeSlowTimer>0?((timeSlowTimer>=175 || timeSlowTimer<=5)?0.19:0.09):(0.09*fade);
    const sat = 1 - (1-.34)*fade, con = 1 + (.12*fade), bri = 1 - (.10*fade);
    canvas.style.filter=`saturate(${sat.toFixed(3)}) contrast(${con.toFixed(3)}) brightness(${bri.toFixed(3)}) invert(${pulse.toFixed(3)})`;
    ctx.save();ctx.globalCompositeOperation='saturation';ctx.fillStyle=`rgba(148,163,184,${(.42*fade).toFixed(3)})`;ctx.fillRect(0,0,WORLD.WIDTH,WORLD.HEIGHT);ctx.restore();
    ctx.save();ctx.fillStyle=`rgba(15,23,42,${(.14*fade).toFixed(3)})`;ctx.fillRect(0,0,WORLD.WIDTH,WORLD.HEIGHT);ctx.restore();
  } else if (canvas.style.filter) canvas.style.filter='';

  ctx.restore(); // 結束世界座標層

  // ==========================================
  // 2. 螢幕視窗層（不受相機平移影響）
  // ==========================================
  // V49 強陣風 HUD：固定在計分板下方的遊戲畫面內，不再綁世界座標。
  if(typeof venueIncidentState!=='undefined'&&venueIncidentState.active==='WIND_GUST'){const st=venueIncidentState,elapsed=st.total-st.timer,force=Math.round(Math.abs(st.wind)*100),fade=Math.min(1,elapsed/45,st.timer/45),flick=.88+.12*Math.sin(gameFrame*.55),cx=canvas.width/2,y=12;ctx.save();ctx.globalAlpha=fade*flick;ctx.fillStyle='rgba(5,15,30,.74)';ctx.fillRect(cx-92,y,184,38);ctx.strokeStyle='#7dd3fc';ctx.lineWidth=2;ctx.strokeRect(cx-92,y,184,38);ctx.fillStyle='#e0f2fe';ctx.font='800 16px sans-serif';ctx.textAlign='center';if(isGuestMirror){ctx.translate(cx,0);ctx.scale(-1,1);ctx.translate(-cx,0);}ctx.fillText(`${st.wind<0?'←':'→'}  ${force.toFixed?force.toFixed(1):force}`,cx,y+25);ctx.restore();}
  // V50 重力異常警示同樣固定在 HUD，不跟著相機、地圖或世界座標移動。
  if(typeof venueIncidentState!=='undefined'&&venueIncidentState.active==='GRAVITY_ANOMALY'){const st=venueIncidentState,elapsed=st.total-st.timer;if(elapsed<90){const a=Math.min(1,elapsed/20,(90-elapsed)/20),cx=canvas.width/2,y=12;ctx.save();ctx.globalAlpha=a;ctx.fillStyle='rgba(30,20,65,.82)';ctx.fillRect(cx-128,y,256,38);ctx.strokeStyle='#c4b5fd';ctx.lineWidth=2;ctx.strokeRect(cx-128,y,256,38);ctx.fillStyle='#ede9fe';ctx.font='800 15px sans-serif';ctx.textAlign='center';if(isGuestMirror){ctx.translate(cx,0);ctx.scale(-1,1);ctx.translate(-cx,0);}ctx.fillText('⚠ 重力場波動偵測',cx,y+25);ctx.restore();}}
  renderChronoAnimation();
  allPlayers.forEach(p => {
    const isHero = (typeof NET !== 'undefined' && typeof NET.mySlot !== 'undefined') ? (p.slotIndex === NET.mySlot) : p.isUser;
    drawRadarBubble(p.x, p.y - p.radius, p.color, false, isHero, p.radius);
  });
if (!isNaN(ball.x) && !isNaN(ball.y)) drawRadarBubble(ball.x, ball.y, '#facc15', true, false, ball.radius);

  // 🌟 得分/出界全域橫幅 (Banner)
  if (banner.active) {
    ctx.save();
    if (isGuestMirror) {
      ctx.translate(800, 215);
      ctx.scale(-1, 1);
      ctx.translate(-800, -215);
    }
    // V74-7: feathered HUD plate + deliberately exaggerated neon rails.
    const bx=350,by=160,bw=900,bh=110,railInset=34;
    const plate=ctx.createLinearGradient(bx,0,bx+bw,0);
    plate.addColorStop(0,'rgba(30,27,75,0)');
    plate.addColorStop(.08,'rgba(30,27,75,.38)');
    plate.addColorStop(.18,'rgba(30,27,75,.62)');
    plate.addColorStop(.82,'rgba(30,27,75,.62)');
    plate.addColorStop(.92,'rgba(30,27,75,.38)');
    plate.addColorStop(1,'rgba(30,27,75,0)');
    ctx.fillStyle=plate; ctx.fillRect(bx,by,bw,bh);
    // Both rails use exactly the same endpoints. Draw a fat low-alpha bloom first, then the hot core.
    ctx.save();ctx.lineCap='round';ctx.shadowColor=banner.color;ctx.shadowBlur=72;ctx.strokeStyle=banner.color;ctx.globalAlpha=.20;ctx.lineWidth=18;
    ctx.beginPath();ctx.moveTo(bx+railInset,by);ctx.lineTo(bx+bw-railInset,by);ctx.moveTo(bx+railInset,by+bh);ctx.lineTo(bx+bw-railInset,by+bh);ctx.stroke();
    ctx.stroke();ctx.shadowBlur=48;ctx.globalAlpha=.38;ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(bx+railInset,by);ctx.lineTo(bx+bw-railInset,by);ctx.moveTo(bx+railInset,by+bh);ctx.lineTo(bx+bw-railInset,by+bh);ctx.stroke();ctx.shadowBlur=24;ctx.globalAlpha=.98;ctx.lineWidth=1.8;ctx.beginPath();ctx.moveTo(bx+railInset,by);ctx.lineTo(bx+bw-railInset,by);ctx.moveTo(bx+railInset,by+bh);ctx.lineTo(bx+bw-railInset,by+bh);ctx.stroke();ctx.restore();
    ctx.shadowColor = banner.color;
    ctx.shadowBlur = 28;
    ctx.fillStyle = banner.color;
    ctx.font = '900 38px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(banner.mainText, 800, 212);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#cbd5e1';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(banner.subText, 800, 248);
    ctx.restore();
  }

  drawSkillCinematic();

  // 🌟 右上角熱血播報員：動態撕裂漫畫爆炸框（置於最高圖層，絕對不被 Banner 遮擋！）
  drawMangaBroadcastBox();
  renderAIFoundationOverlay();
  renderDebugTerminal();

  if (isGuestMirror) {
    ctx.restore(); // 還原鏡像翻轉
  }

  ctx.restore(); // 還原畫布最頂層 save
}
// ========================================================
// 📢 右上角日漫風格撕裂震動爆炸框 (Manga Callout Box)
// ========================================================
let mangaPopup = { active: false, timer: 0, text: '', speaker: '', color: '#facc15', sub: '', side: null };

// 🌟 漫畫廣播冷卻計時器：防洗版，每次叫完至少冷卻 10 秒
let mangaCooldown = 0;

function triggerMangaShout(speaker, text, sub = '', color = '#facc15', side = null) {
  if (mangaCooldown > 0) return;
  if (side == null && typeof allPlayers !== 'undefined') { const who=allPlayers.find(p=>p && (p.playerName===speaker || p.name===speaker)); if(who) side=who.isLeft?'left':'right'; }
  mangaPopup = { active: true, timer: 120, speaker, text, sub, color, side };
  mangaCooldown = 600;
}

function drawMangaBroadcastBox() {
  if (mangaCooldown > 0) mangaCooldown--;
  if (!mangaPopup.active || mangaPopup.timer <= 0) return;
  mangaPopup.timer--;
  ctx.save();

  const isGuestMirror = (typeof NET !== 'undefined' && NET.isMultiplayer && !NET.isHost && NET.mode === 'PVP');
  let side=mangaPopup.side;
  if(isGuestMirror && side) side=side==='left'?'right':'left';
  const jitterX = (Math.random() - 0.5) * 6;
  const jitterY = (Math.random() - 0.5) * 6;
  const cx = (side==='left'?280:1320) + jitterX, cy = 105 + jitterY;
  const w = 480, h = 130;

  ctx.translate(cx, cy);
  ctx.beginPath();
  const spikes = 22, rotOffset = (mangaPopup.timer % 4) * 0.02;
  for (let i = 0; i < spikes; i++) {
    const angle = (i / spikes) * Math.PI * 2 + rotOffset;
    const rOuter = (i % 2 === 0) ? (w / 2 + 18) : (w / 2 - 15);
    const ryOuter = (i % 2 === 0) ? (h / 2 + 14) : (h / 2 - 10);
    const px = Math.cos(angle) * rOuter;
    const py = Math.sin(angle) * ryOuter;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();

  ctx.fillStyle = '#09090b';
  ctx.fill();
  ctx.lineWidth = 9;
  ctx.strokeStyle = '#000000';
  ctx.stroke();

  ctx.lineWidth = 4;
  ctx.strokeStyle = mangaPopup.color;
  ctx.stroke();

  // V64: 漫畫播報框跟著 Guest 視角換邊，但所有文字保持正向。
  if (isGuestMirror) ctx.scale(-1, 1);
  ctx.fillStyle = '#cbd5e1';
  ctx.font = '900 13px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`🎙️ LIVE 播報特寫 ⚡`, 0, -h / 2 + 26);

  ctx.save();
  ctx.rotate(-0.03);
  ctx.font = '900 24px "Impact", -apple-system, sans-serif';
  ctx.textAlign = 'center';

  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 6;
  ctx.strokeText(mangaPopup.text, 0, 8);
  ctx.fillStyle = mangaPopup.color;
  ctx.fillText(mangaPopup.text, 0, 8);
  ctx.restore();

  if (mangaPopup.sub) {
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(mangaPopup.sub, 0, h / 2 - 22);
  }

  ctx.restore();
}
function drawVenueIncidentOverlay(){
  if(typeof venueIncidentState==='undefined')return;const st=venueIncidentState,id=st.active;if(!id&&!st.flash&&!(st.birds&&st.birds.length))return;ctx.save();
  const elapsed=(st.total||0)-(st.timer||0);
  if(id==='BLACKOUT'){ctx.fillStyle='rgba(0,0,0,.93)';ctx.fillRect(0,0,WORLD.WIDTH,WORLD.HEIGHT);for(const x of [WORLD.LEFT+260,WORLD.RIGHT-260]){const g=ctx.createRadialGradient(x,WORLD.FLOOR_Y-80,15,x,WORLD.FLOOR_Y-80,230);g.addColorStop(0,'rgba(255,244,190,.34)');g.addColorStop(1,'rgba(255,244,190,0)');ctx.fillStyle=g;ctx.fillRect(0,0,WORLD.WIDTH,WORLD.HEIGHT);}}
  // V49 WIND_GUST UI 移到螢幕座標層，避免跟著地圖/相機跑。
  // V50 GRAVITY_ANOMALY 警示已移到真正 HUD 層；世界層只保留事件本身。
  if(id==='LIGHTNING'&&st.flash>0){ctx.fillStyle=`rgba(255,255,255,${Math.min(1,st.flash/55)})`;ctx.fillRect(0,0,WORLD.WIDTH,WORLD.HEIGHT);}
  if(id==='BLIZZARD'){const bt=Math.max(0,Math.min(1,elapsed/90)),et=Math.max(0,Math.min(1,st.timer/90)),fadeIn=bt*bt*(3-2*bt),fadeOut=et*et*(3-2*et),stormFade=Math.min(fadeIn,fadeOut);ctx.save();ctx.globalAlpha=stormFade;ctx.fillStyle='rgba(100,180,255,.18)';ctx.fillRect(0,0,WORLD.WIDTH,WORLD.HEIGHT);ctx.fillStyle='rgba(235,248,255,.80)';for(let i=0;i<190;i++){const sx=((Math.sin(i*91.73)*43758.5)%1+1)%1,sy=((Math.sin(i*47.11+8.3)*24634.6)%1+1)%1,spd=4+(i%7)*.7;let x=(sx*WORLD.WIDTH+gameFrame*(5+(i%5)))%WORLD.WIDTH,y=(sy*WORLD.HEIGHT+gameFrame*spd)%WORLD.HEIGHT;ctx.beginPath();ctx.ellipse(x,y,1.5+(i%3),4+(i%5),-.35,0,Math.PI*2);ctx.fill();}for(const p of allPlayers){const heat=p.venueHeat??1,cold=Math.max(0,Math.min(1,1-heat));if(cold>.03){const cx=p.x,cy=p.y-p.radius,rr=p.radius+3;ctx.save();ctx.globalAlpha=.18+cold*.62;ctx.strokeStyle='rgba(205,242,255,.95)';ctx.fillStyle='rgba(145,218,255,.42)';ctx.lineCap='round';ctx.lineWidth=2+cold*2;ctx.beginPath();ctx.arc(cx,cy,rr,Math.PI*.62,Math.PI*1.08);ctx.stroke();ctx.beginPath();ctx.arc(cx,cy,rr,Math.PI*1.55,Math.PI*1.88);ctx.stroke();const shards=2+Math.floor(cold*5);for(let j=0;j<shards;j++){const side=j%2?-1:1,ang=(j*.91)%1,bx=cx+side*(rr-2-ang*5),by=cy+rr*(.15+ang*.55),h=5+cold*8+(j%3)*2;ctx.beginPath();ctx.moveTo(bx-3,by);ctx.lineTo(bx,by-h);ctx.lineTo(bx+3,by);ctx.closePath();ctx.fill();}if(cold>.42){ctx.strokeStyle=`rgba(235,250,255,${.30+cold*.55})`;ctx.lineWidth=1.2;for(let j=0;j<2+Math.floor(cold*3);j++){const sx=cx+(j-1.5)*6,sy=cy+rr*.45;ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(sx+(j%2?5:-5),sy-8-cold*5);ctx.lineTo(sx+(j%2?9:-9),sy-11-cold*8);ctx.stroke();}}ctx.restore();}}ctx.restore();}
  if(id==='RAIN_SURGE'){ctx.strokeStyle='rgba(210,235,255,.64)';ctx.lineWidth=2.5;for(let i=0;i<105;i++){const sx=((Math.sin(i*73.19+2.7)*9173.3)%1+1)%1,sy=((Math.sin(i*31.77+9.1)*6317.9)%1+1)%1,spd=15+(i%9)*1.8;let x=(sx*WORLD.WIDTH+gameFrame*(7+(i%6)))%WORLD.WIDTH,y=(sy*WORLD.HEIGHT+gameFrame*spd)%WORLD.HEIGHT,len=26+(i%8)*5;ctx.globalAlpha=.32+(i%5)*.12;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-10-(i%4)*3,y+len);ctx.stroke();}ctx.globalAlpha=1;}
  if((id==='BIRDS'||(st.birds&&st.birds.length))){for(const b of st.birds||[]){ctx.save();ctx.translate(b.x,b.y);ctx.scale((b.dir||1)*.8,.8);ctx.fillStyle='#dbeafe';ctx.strokeStyle='#0f172a';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(0,0,32,18,0,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.beginPath();ctx.moveTo(-6,-5);ctx.quadraticCurveTo(-42,-42,-55,-8);ctx.quadraticCurveTo(-30,-16,-8,5);ctx.fill();ctx.stroke();ctx.beginPath();ctx.moveTo(6,-5);ctx.quadraticCurveTo(42,-42,55,-8);ctx.quadraticCurveTo(30,-16,8,5);ctx.fill();ctx.stroke();ctx.fillStyle='#f59e0b';ctx.beginPath();ctx.moveTo(31,-3);ctx.lineTo(49,2);ctx.lineTo(31,7);ctx.fill();ctx.restore();}}
  if(id==='ICE_CRACK'&&st.hole){const h=st.hole;if(h.phase==='warn'){ctx.save();ctx.shadowColor='#fde047';ctx.shadowBlur=18;ctx.fillStyle='rgba(250,204,21,.90)';ctx.beginPath();ctx.moveTo(h.x,WORLD.FLOOR_Y-72);ctx.lineTo(h.x-34,WORLD.FLOOR_Y-14);ctx.lineTo(h.x+34,WORLD.FLOOR_Y-14);ctx.closePath();ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#111827';ctx.font='900 34px sans-serif';ctx.textAlign='center';ctx.fillText('!',h.x,WORLD.FLOOR_Y-28);ctx.restore();}else{ctx.strokeStyle='rgba(219,234,254,.52)';ctx.lineWidth=3;const branches=[[-48,18,-73,34],[-31,13,-44,48],[-16,20,-9,57],[4,15,13,45],[21,22,38,55],[37,12,67,38]];for(const [x1,y1,x2,y2] of branches){ctx.beginPath();ctx.moveTo(h.x,WORLD.FLOOR_Y+1);ctx.lineTo(h.x+x1*.55,WORLD.FLOOR_Y+y1);ctx.lineTo(h.x+x2*.55,WORLD.FLOOR_Y+y2);ctx.stroke();}if(h.phase==='open'){const hw=h.w*.36;ctx.fillStyle='#020617';ctx.beginPath();ctx.moveTo(h.x-hw,WORLD.FLOOR_Y-2);ctx.lineTo(h.x+hw,WORLD.FLOOR_Y-2);ctx.lineTo(h.x+hw*.82,WORLD.HEIGHT+90);ctx.lineTo(h.x-hw*.82,WORLD.HEIGHT+90);ctx.closePath();ctx.fill();ctx.strokeStyle='rgba(186,230,253,.8)';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(h.x-hw,WORLD.FLOOR_Y-2);ctx.lineTo(h.x+hw,WORLD.FLOOR_Y-2);ctx.stroke();}}}

  if(id==='PIPE_LEAK'){
    // V50 高壓蒸氣：管線／噴口是場景硬體，蒸氣本身是細碎半透明流束，不再是一根實心白柱。
    const activePipes=(st.pipeXs&&st.pipeXs.length)?st.pipeXs:[st.pipeX], nozzleY=WORLD.FLOOR_Y-32;
    ctx.save();
    // V57 一次 2~3 管洩壓；蒸氣保持亮、薄、半透明，硬體本身則壓暗融入倉庫。
    for(let pi=0;pi<activePipes.length;pi++){const px=activePipes[pi],offset=pi*37;
      ctx.globalCompositeOperation='screen';
      for(let i=0;i<15;i++){const phase=(gameFrame*3.8+i*31+offset)%430,t=phase/430,y=nozzleY-phase,x=px+Math.sin(i*1.73+gameFrame*.045+pi)*(10+52*t)+Math.sin(gameFrame*.018+i+pi)*10*t;const rad=5+17*t;const a=(.20*(1-t))*(.65+.35*Math.sin(i+gameFrame*.07));const g=ctx.createRadialGradient(x,y,0,x,y,rad);g.addColorStop(0,`rgba(241,245,249,${a})`);g.addColorStop(.55,`rgba(226,232,240,${a*.48})`);g.addColorStop(1,'rgba(226,232,240,0)');ctx.fillStyle=g;ctx.beginPath();ctx.ellipse(x,y,rad*.72,rad*1.7,Math.sin(i)*.18,0,Math.PI*2);ctx.fill();}
      ctx.globalCompositeOperation='source-over';ctx.strokeStyle='rgba(241,245,249,.14)';ctx.lineWidth=2;for(let i=0;i<6;i++){const yy=nozzleY-((gameFrame*4.4+i*59+offset)%390),spread=(nozzleY-yy)*.12,xx=px+Math.sin(gameFrame*.055+i*2.2+pi)*(8+spread);ctx.beginPath();ctx.moveTo(xx,yy+34);ctx.bezierCurveTo(xx-10,yy+22,xx+12,yy+8,xx,yy-8);ctx.stroke();}
    }
    ctx.restore();
  }
  if(id==='OVERHEAT'){
    // V47: 熱色先淡入、結束再淡出；不再整片紅到吃掉角色。
    const fadeIn=Math.min(1,elapsed/90),fadeOut=Math.min(1,st.timer/90),heat=fadeIn*fadeOut;
    const hg=ctx.createLinearGradient(0,90,0,WORLD.FLOOR_Y);hg.addColorStop(0,`rgba(249,115,22,${.055*heat})`);hg.addColorStop(1,`rgba(234,88,12,${.22*heat})`);ctx.fillStyle=hg;ctx.fillRect(0,0,WORLD.WIDTH,WORLD.HEIGHT);
    // 熱折射：將既有畫面切成細橫帶做 2~5px 波動，刻意保持很輕，像熱空氣扭曲而非故障。
    if(heat>.08){ctx.save();ctx.globalAlpha=.18*heat;for(let y=150;y<WORLD.FLOOR_Y-12;y+=22){const dx=Math.sin(gameFrame*.055+y*.047)*4.5;ctx.drawImage(canvas,0,y,WORLD.WIDTH,14,dx,y,WORLD.WIDTH,14);}ctx.restore();}
    // 8~9 條獨立小型 S 熱流，固定在場上不同位置向上竄，不做橫向跑馬燈。
    ctx.lineCap='round';ctx.lineWidth=3.2;for(let i=0;i<9;i++){const baseX=WORLD.LEFT+90+i*((WORLD.RIGHT-WORLD.LEFT-180)/8),rise=(gameFrame*1.15+i*71)%235,y0=WORLD.FLOOR_Y-12-rise;ctx.strokeStyle=`rgba(251,146,60,${(.16+.10*Math.sin(gameFrame*.025+i))*heat})`;ctx.beginPath();ctx.moveTo(baseX,y0+76);ctx.bezierCurveTo(baseX-10,y0+57,baseX+12,y0+39,baseX,y0+20);ctx.bezierCurveTo(baseX-11,y0+5,baseX+10,y0-9,baseX+2,y0-25);ctx.stroke();}
  }
  if(id==='CROWD_THROW'){
    if(st.crowdProjectile){const q=st.crowdProjectile;ctx.save();ctx.translate(q.x,q.y);ctx.rotate(q.rot||0);ctx.font=`${Math.max(30,Math.round(52-Math.min(16,Math.abs(q.y-WORLD.FLOOR_Y)*.018)))}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(q.type,0,0);ctx.restore();ctx.strokeStyle='rgba(239,68,68,.72)';ctx.lineWidth=3;ctx.setLineDash([12,9]);ctx.beginPath();ctx.arc(q.targetX,WORLD.FLOOR_Y-8,34+Math.sin(gameFrame*.35)*4,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);}
    for(const o of st.crowdObjects||[]){if(o.physical||o.fade>0){ctx.save();ctx.globalAlpha=o.physical?1:Math.max(0,o.fade/75);ctx.translate(o.x,o.y);ctx.rotate(o.angle||0);ctx.font=`${Math.max(34,o.h||50)}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(o.type,0,0);ctx.restore();}}
  }
  if(id==='UFO'){const x=st.ufoX||WORLD.NET_X,y=100+Math.sin(gameFrame*.07)*5;ctx.save();ctx.globalAlpha=Math.max(.08,Math.min(1,st.ufoPhase||0));const glow=ctx.createRadialGradient(x,y,15,x,y,145);glow.addColorStop(0,'rgba(103,232,249,.25)');glow.addColorStop(1,'rgba(103,232,249,0)');ctx.fillStyle=glow;ctx.beginPath();ctx.arc(x,y,145,0,Math.PI*2);ctx.fill();ctx.fillStyle='#64748b';ctx.beginPath();ctx.ellipse(x,y,118,31,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#cbd5e1';ctx.lineWidth=4;ctx.stroke();ctx.fillStyle='#67e8f9';ctx.beginPath();ctx.ellipse(x,y-18,52,30,0,Math.PI,0);ctx.fill();for(let i=0;i<5;i++){ctx.fillStyle=i%2?'#a7f3d0':'#fde68a';ctx.beginPath();ctx.arc(x-64+i*32,y+8,5,0,Math.PI*2);ctx.fill();}if(st.ufoHold){const beamTop=y+18,beamBottom=WORLD.FLOOR_Y;const g=ctx.createLinearGradient(x,beamTop,x,beamBottom);g.addColorStop(0,'rgba(134,239,172,.58)');g.addColorStop(.55,'rgba(134,239,172,.30)');g.addColorStop(1,'rgba(134,239,172,.06)');ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(x-42,beamTop);ctx.lineTo(x-178,beamBottom);ctx.lineTo(x+178,beamBottom);ctx.lineTo(x+42,beamTop);ctx.closePath();ctx.fill();ctx.strokeStyle='rgba(167,243,208,.18)';ctx.lineWidth=2;ctx.stroke();}ctx.restore();}
  if(id==='THUNDER_STRIKE'){if(st.strikeWarn>0&&st.strikePending>=0){const p=allPlayers[st.strikePending];if(p){const a=.25+.55*(1-st.strikeWarn/60);ctx.strokeStyle=`rgba(250,204,21,${a})`;ctx.lineWidth=2;for(let i=0;i<7;i++){const ang=i*Math.PI*2/7+gameFrame*.12;ctx.beginPath();ctx.arc(p.x+Math.cos(ang)*24,WORLD.FLOOR_Y-5+Math.sin(ang)*4,4+(i%2)*2,0,Math.PI*2);ctx.stroke();}}}for(const p of allPlayers){if(p.venueShockTimer>0){ctx.strokeStyle='#fde047';ctx.shadowColor='#fef08a';ctx.shadowBlur=14;ctx.lineWidth=3;for(let i=0;i<7;i++){const a=i*Math.PI*2/7+gameFrame*.18,r=p.radius+10;ctx.beginPath();ctx.moveTo(p.x+Math.cos(a)*r,p.y-p.radius+Math.sin(a)*r);ctx.lineTo(p.x+Math.cos(a+.25)*(r+13),p.y-p.radius+Math.sin(a+.25)*(r+13));ctx.lineTo(p.x+Math.cos(a+.48)*(r+4),p.y-p.radius+Math.sin(a+.48)*(r+4));ctx.stroke();}ctx.shadowBlur=0;}}}
  if(ball.venuePortalTimer>0){const a=Math.min(1,ball.venuePortalTimer/18);ctx.strokeStyle=`rgba(134,239,172,${a})`;ctx.lineWidth=4;ctx.beginPath();ctx.arc(ball.x,ball.y,ball.radius+14+Math.sin(gameFrame*.3)*5,0,Math.PI*2);ctx.stroke();ball.venuePortalTimer--; }
  if(id==='GIANT_WAVE'){ctx.fillStyle='rgba(56,189,248,.12)';ctx.fillRect(0,0,WORLD.WIDTH,WORLD.HEIGHT);}
  if(st.flash>0&&id!=='LIGHTNING'){ctx.fillStyle=`rgba(255,255,255,${Math.min(1,st.flash/55)})`;ctx.fillRect(0,0,WORLD.WIDTH,WORLD.HEIGHT);}
  ctx.restore();
}

// V46 狀態後製：雷擊焦黑淡回、暈眩星星、旋轉提示。
function drawVenuePlayerStatusFX(){ if(typeof allPlayers==='undefined')return; ctx.save(); for(const p of allPlayers){ if(p.venueShockTimer>0){const a=Math.min(.72,p.venueShockTimer/70*.72);ctx.fillStyle=`rgba(0,0,0,${a})`;ctx.beginPath();ctx.arc(p.x,p.y-p.radius,p.radius+4,0,Math.PI*2);ctx.fill();} if(p.venueDizzyTimer>0){const total=p.venueDizzyTotal||180,remain=Math.max(0,Math.min(1,p.venueDizzyTimer/total)),fade=Math.min(1,p.venueDizzyTimer/30);ctx.globalAlpha=fade;ctx.font='16px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';for(let i=0;i<3;i++){const ang=gameFrame*.105+i*Math.PI*2/3;const wobble=2*Math.sin(gameFrame*.08+i);ctx.save();ctx.translate(p.x+Math.cos(ang)*25,p.y-p.radius-28+Math.sin(ang)*7+wobble);ctx.rotate(ang+gameFrame*.035);ctx.fillText('⭐',0,0);ctx.restore();}ctx.globalAlpha=1;} }ctx.restore();}
