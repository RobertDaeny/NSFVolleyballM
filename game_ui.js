// ========================================================
// UI 與動態彈窗系統：更衣室、裝備背包、轉蛋大街、試衣間、連線與結算
// ========================================================
let currentSlot = 'user', stagedCard = null;
let currentReforgeInstId = null;
let currentBreakthroughTargetId = null;
let lockerReturnContext = 'MENU'; // MENU | PAUSE — UI 來源不可再用 isGameStarted 猜
let isEquipBagOpen = false;

const EQUIP_SLOT_LABEL = { wrist: '護腕', knee: '護膝', shoe: '球鞋' };
const EQUIP_STAT_LABEL = { str: 'STR', agi: 'AGI', jump: 'JUMP', dex: 'DEX', int: 'INT' };
function getEquipMainValue(eq) {
  const db = EQUIP_DB.find(e => e.id === eq.itemId);
  return eq.baseRoll + (eq.refineLevel || 0) * (db ? db.refineGain : 0.5);
}
function getEquipArchetype(eq) {
  return `${eq.slot}_${eq.mainStatType}`;
}
function getEquipIconSvg(eq, size = 66) {
  const evolved = (eq.rank || 0) >= 3;
  const stat = eq.mainStatType;
  const statColor = { str:'#ef4444', dex:'#a78bfa', agi:'#38bdf8', jump:'#facc15' }[stat] || '#94a3b8';
  const metal = evolved ? '#f8fafc' : '#cbd5e1';
  const dark = evolved ? '#312e81' : '#334155';
  let art='';
  if (eq.slot === 'wrist') {
    art = evolved
      ? `<path d="M15 25 L26 14 L50 19 L54 42 L43 54 L20 48 Z" fill="${dark}" stroke="${metal}" stroke-width="3"/><path d="M24 22 L45 25 L43 42 L24 39 Z" fill="${statColor}" opacity=".9"/><circle cx="47" cy="19" r="5" fill="${statColor}"/>`
      : `<rect x="16" y="22" width="39" height="25" rx="8" fill="${dark}" stroke="${metal}" stroke-width="3"/><rect x="27" y="20" width="16" height="29" rx="5" fill="${statColor}" opacity=".85"/>`;
  } else if (eq.slot === 'knee') {
    art = evolved
      ? `<path d="M20 14 L49 14 L57 30 L49 54 L20 54 L12 30 Z" fill="${dark}" stroke="${metal}" stroke-width="3"/><path d="M23 21 L46 21 L50 31 L44 46 L25 46 L19 31 Z" fill="${statColor}" opacity=".88"/><path d="M12 30 L5 35 M57 30 L64 35" stroke="${statColor}" stroke-width="4"/>`
      : `<rect x="17" y="14" width="36" height="40" rx="12" fill="${dark}" stroke="${metal}" stroke-width="3"/><ellipse cx="35" cy="34" rx="13" ry="15" fill="${statColor}" opacity=".82"/>`;
  } else {
    art = evolved
      ? `<path d="M8 39 L22 22 L39 28 L47 16 L57 20 L54 36 L64 43 L59 53 L15 53 Z" fill="${dark}" stroke="${metal}" stroke-width="3"/><path d="M18 40 L39 34 L54 39 L48 47 L20 47 Z" fill="${statColor}" opacity=".9"/><path d="M48 18 L60 10 L58 28" fill="none" stroke="${statColor}" stroke-width="4"/>`
      : `<path d="M9 40 L22 25 L38 31 L48 25 L57 31 L54 43 L63 47 L58 54 L16 54 Z" fill="${dark}" stroke="${metal}" stroke-width="3"/><path d="M18 42 L47 36 L54 44 L48 49 L20 49 Z" fill="${statColor}" opacity=".82"/>`;
  }
  return `<svg width="${size}" height="${size}" viewBox="0 0 70 70" aria-hidden="true"><defs><filter id="g"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><g filter="${evolved?'url(#g)':''}">${art}</g></svg>`;
}
function findEquipOwner(instId) {
  for (const c of INVENTORY) {
    if (c.equipSlotA === instId) return `${c.name} [A]`;
    if (c.equipSlotB === instId) return `${c.name} [B]`;
  }
  return null;
}

// V27: 共用下拉排序規則。角色：稀有度→等級降冪；技能：標籤分組→Cost→名稱。
const UI_TIER_WEIGHT = { SSR: 4, SR: 3, R: 2, N: 1 };
const UI_SKILL_TYPE_ORDER = { SPIKE: 1, THRUST: 2, SERVE_SPIKE: 3, SERVE_FLOAT: 4, SET_ATTACK: 5, SET_TACTIC: 6, DEF_SAVE: 7, BLOCK: 8, BLOCK_STANCE: 9 };
function sortCharactersForSelect(list) {
  return [...list].sort((a, b) => (UI_TIER_WEIGHT[b.tier] || 0) - (UI_TIER_WEIGHT[a.tier] || 0) || (b.level || 1) - (a.level || 1) || String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hant'));
}
function sortSkillsForSelect(list) {
  return [...list].sort((a, b) => (UI_SKILL_TYPE_ORDER[a.type] || 99) - (UI_SKILL_TYPE_ORDER[b.type] || 99) || (a.cost || 0) - (b.cost || 0) || String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hant'));
}

function initStagedCard() {
  const origin = ACTIVE_ROSTER[currentSlot];
  stagedCard = { id: origin.id, freePts: origin.freePts, stats: { ...origin.stats } };
}

function renderLocker() {
  const tabs = document.getElementById('roster-tabs');
  if (!tabs) return;
  tabs.innerHTML = '';
  const slotLabels = { user: '球員 1 (主控)', mate: '球員 2 (搭檔)', enemyFront: '敵方 1', enemyBack: '敵方 2' };

  const visibleSlots = (typeof isPracticeMode !== 'undefined' && isPracticeMode) || !isGameStarted ? ['user', 'mate', 'enemyFront', 'enemyBack'] : ['user', 'mate'];
  if (!visibleSlots.includes(currentSlot)) currentSlot = 'user';

  visibleSlots.forEach(key => {
    const tab = document.createElement('div');
    tab.className = `roster-tab ${key === currentSlot ? 'active' : ''}`;
    tab.innerText = `${slotLabels[key]}: ${ACTIVE_ROSTER[key].name}`;
    tab.onclick = () => { currentSlot = key; initStagedCard(); renderLocker(); };
    tabs.appendChild(tab);
  });

  const origin = ACTIVE_ROSTER[currentSlot];
  document.getElementById('card-name').innerText = origin.name;
  document.getElementById('card-desc').innerText = `等級: Lv.${origin.level} (${origin.tier} 卡)`;
  document.getElementById('card-avatar').style.backgroundColor = origin.color;
  document.getElementById('card-exp').innerText = `EXP: ${origin.exp} / ${getRequiredExp(origin.level)}`;
  document.getElementById('free-pts-display').innerText = stagedCard.freePts;

  // 技能選單
  const skillSel = document.getElementById('skill-select');
  if (skillSel) {
    skillSel.innerHTML = '';
    sortSkillsForSelect(SKILL_POOL).forEach(sk => {
      const isUnlocked = Array.isArray(UNLOCKED_SKILLS) ? UNLOCKED_SKILLS.includes(sk.id) : (sk.id === 'sk_breaker');
      if (isUnlocked || origin.equippedSkill === sk.id) {
        const opt = document.createElement('option');
        opt.value = sk.id; opt.innerText = `[${sk.type}] ${sk.name} (Cost: ${sk.cost})`;
        if (origin.equippedSkill === sk.id) opt.selected = true;
        skillSel.appendChild(opt);
      }
    });
    const currentEquippedSkill = SKILL_POOL.find(s => s.id === origin.equippedSkill) || SKILL_POOL[0];
    const skillDescEl = document.getElementById('skill-card-desc');
    if (skillDescEl) skillDescEl.innerText = currentEquippedSkill.desc;
  }

// 陣容替換選單（稀有度優先，再來排列等級降冪）
  const assignedIds = Object.values(ACTIVE_ROSTER).map(c => c.id);
  const sel = document.getElementById('bench-select');
  if (sel) {
    sel.innerHTML = '';
    const tierWeight = { SSR: 4, SR: 3, R: 2, N: 1 };
    const sortedInventory = [...INVENTORY].sort((a, b) => {
      const weightA = tierWeight[a.tier] || 0;
      const weightB = tierWeight[b.tier] || 0;
      if (weightB !== weightA) return weightB - weightA; // 稀有度高者在前
      return (b.level || 1) - (a.level || 1);            // 同稀有度等級高者在前
    });

    sortedInventory.forEach(item => {
      const isEquippedElsewhere = assignedIds.includes(item.id) && item.id !== origin.id;
      const opt = document.createElement('option');
      opt.value = item.id; opt.disabled = isEquippedElsewhere;
      opt.innerText = `[${item.tier}] ${item.name} (Lv.${item.level})${isEquippedElsewhere ? ' [已出場]' : ''}`;
      if (item.id === origin.id) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  // 計算裝備累加至一級母體屬性數值
  const equipBonusStats = { str: 0, agi: 0, jump: 0, dex: 0, int: 0 };
  [origin.equipSlotA, origin.equipSlotB].forEach(instId => {
    if (!instId) return;
    const eq = (typeof INVENTORY_EQUIPS !== 'undefined') ? INVENTORY_EQUIPS.find(e => e.instanceId === instId) : null;
    if (!eq) return;
    const dbItem = EQUIP_DB.find(e => e.id === eq.itemId);
    const mainVal = eq.baseRoll + (eq.refineLevel * (dbItem ? dbItem.refineGain : 0.5));
    if (equipBonusStats[eq.mainStatType] !== undefined) {
      equipBonusStats[eq.mainStatType] += mainVal;
    }
  });

  // 1. 渲染一級屬性 (格式: 力量: 24 (20 + 4))
  const mount = document.getElementById('stats-mount');
  if (mount) {
    mount.innerHTML = '';
    const statMeta = {
      str: { label: '力量 (STR)', desc: '力量輸出：扣球／跳發球威、二傳最遠推送與攔網剛性。' },
      agi: { label: '敏捷 (AGI)', desc: '動作速度：橫移、魚躍位移、回位與反應速度；不再直接增加接球卸力。' },
      jump: { label: '彈跳 (JUMP)', desc: '垂直能力：摸高、攻擊打點、滯空與前排攔網高度；高值需要更精準的時機。' },
      dex: { label: '技巧 (TEC)', desc: '動作細膩度：接觸品質、甜蜜點、容錯範圍、旋轉、二傳與球路控制。' },
      int: { label: '球商 (INT)', desc: '判讀與球商：落點／OUT／假動作判斷、AI戰術、二傳判斷與狀態抗性。' }
    };

    for (let k in stagedCard.stats) {
      const row = document.createElement('div');
      row.className = 'stat-row';
      const baseVal = origin.baseStats[k];
      const allocatedVal = stagedCard.stats[k];
      const eqBonus = equipBonusStats[k];
      const totalVal = allocatedVal + eqBonus;

      row.innerHTML = `
        <div>
          <span>${statMeta[k].label}</span>
          <span style="font-size: 11px; color: ${eqBonus > 0 ? '#34d399' : '#94a3b8'}; margin-left: 4px;">
            <strong>${totalVal.toFixed(1)}</strong> (${allocatedVal}${eqBonus > 0 ? ` + <span style="color:#34d399;">${eqBonus.toFixed(1)}</span>` : ''})
          </span>
        </div>
        <div class="stat-tooltip">${statMeta[k].desc}</div>
        <div style="display: flex; align-items: center; gap: 6px;">
          <button class="stat-btn" onclick="adjustStagedStat('${k}', -1)" ${allocatedVal <= baseVal ? 'disabled' : ''}>-</button>
          <strong style="width: 24px; text-align: center; color: ${allocatedVal > baseVal ? '#facc15' : '#fff'};">${allocatedVal}</strong>
          <button class="stat-btn" onclick="adjustStagedStat('${k}', 1)" ${stagedCard.freePts <= 0 || allocatedVal >= 60 ? 'disabled' : ''}>+</button>
        </div>
      `;
      mount.appendChild(row);
    }
  }

  // 2. 渲染二級實戰衍生數值 (帶加乘反饋)
  const bareCard = { stats: stagedCard.stats, equippedSkill: origin.equippedSkill, equipSlotA: null, equipSlotB: null };
  const fullCard = { stats: stagedCard.stats, equippedSkill: origin.equippedSkill, equipSlotA: origin.equipSlotA, equipSlotB: origin.equipSlotB };
  const baseDerived = deriveStats(bareCard);
  const fullDerived = deriveStats(fullCard);

  const formatDerived = (fullVal, baseVal, unit) => {
    const diff = fullVal - baseVal;
    if (Math.abs(diff) > 0.05) {
      return `${fullVal.toFixed(2)}${unit} <span style="font-size: 10px; color: #34d399;">(${baseVal.toFixed(2)} + ${diff.toFixed(2)})</span>`;
    }
    return `${fullVal.toFixed(2)}${unit}`;
  };

  const derivedMount = document.getElementById('derived-mount');
  if (derivedMount) {
    derivedMount.innerHTML = `
      <div class="stat-derived-row"><span>🏃 實時奔跑速度 (Run Speed)</span><strong style="color: #38bdf8;">${formatDerived(fullDerived.speed, baseDerived.speed, ' px/f')}</strong></div>
      <div class="stat-derived-row"><span>💥 扣球攻擊力 (Spike Atk)</span><strong style="color: #ef4444;">${formatDerived(fullDerived.power, baseDerived.power, '')}</strong></div>
      <div class="stat-derived-row"><span>🛡️ 防守卸力值 (Defense)</span><strong style="color: #10b981;">${formatDerived(fullDerived.defense, baseDerived.defense, '')}</strong></div>
      <div class="stat-derived-row"><span>🧱 攔網手型剛性 (Block Guard)</span><strong style="color: #facc15;">${formatDerived(fullDerived.blockRigidity, baseDerived.blockRigidity, '')}</strong></div>
      <div class="stat-derived-row"><span>🎯 完美起球半徑 (Sweet Spot)</span><strong style="color: #a78bfa;">${fullDerived.sweetWindow} px</strong></div>
      <div class="stat-derived-row"><span>🛡️ 實體防守覆蓋半徑 (Reach)</span><strong style="color: #38bdf8;">${formatDerived(fullDerived.reach, baseDerived.reach, ' px')}</strong></div>
      <div class="stat-derived-row"><span>⚡ 神經反應延遲 (Reaction)</span><strong style="color: #f472b6;">${fullDerived.reactionDelay} 幀</strong></div>
    `;
  }

  // 3. 渲染已穿戴裝備微縮資訊格
  renderEquippedPreview(origin);

  // 4. 渲染下方橫向裝備庫存背包
  renderInventoryEquipsGrid(origin);
}

function renderEquippedPreview(origin) {
  const mount = document.getElementById('equipped-preview-mount');
  if (!mount) return;
  mount.innerHTML = '';

  ['A', 'B'].forEach(slotKey => {
    const prop = `equipSlot${slotKey}`;
    const instId = origin[prop];
    const eq = INVENTORY_EQUIPS.find(e => e.instanceId === instId);
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:7px;background:#18153d;border-radius:8px;margin-bottom:6px;border:1px solid #334155;';
    if (eq) {
      const tierColor = eq.tier === 'SSR' ? '#facc15' : (eq.tier === 'SR' ? '#c084fc' : '#38bdf8');
      row.innerHTML = `
        <div style="width:38px;height:38px;display:grid;place-items:center;background:#0f172a;border:1px solid ${tierColor};border-radius:8px">${getEquipIconSvg(eq,34)}</div>
        <div style="min-width:0;flex:1"><div style="font-size:10px;color:#94a3b8">Slot ${slotKey}</div><div style="font-size:11px;color:${tierColor};font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${eq.name} +${eq.refineLevel}</div><div style="font-size:10px;color:#34d399">${EQUIP_STAT_LABEL[eq.mainStatType]||eq.mainStatType.toUpperCase()} +${getEquipMainValue(eq).toFixed(1)}</div></div>
        <button class="btn-sound" style="padding:3px 7px;font-size:9px" onclick="event.stopPropagation();window.unequipSlot('${prop}')">卸下</button>`;
    } else {
      row.innerHTML = `<div style="width:38px;height:38px;border:1px dashed #475569;border-radius:8px;display:grid;place-items:center;color:#64748b">＋</div><div style="flex:1"><div style="font-size:10px;color:#94a3b8">Slot ${slotKey}</div><div style="font-size:11px;color:#64748b">未穿戴裝備</div></div>`;
    }
    row.onclick = () => openEquipBag();
    mount.appendChild(row);
  });

  const btn = document.createElement('button');
  btn.className = 'btn-action';
  btn.style.cssText = 'width:100%;padding:6px 8px;font-size:10px;margin-top:2px;background:#1d4ed8;border-color:#38bdf8';
  btn.textContent = '🎒 開啟裝備背包';
  btn.onclick = openEquipBag;
  mount.appendChild(btn);
}

function hideEquipHoverTooltip(){
  const tip=document.getElementById('equip-hover-tooltip');
  if(tip){ tip.style.display='none'; tip.innerHTML=''; tip.setAttribute('aria-hidden','true'); }
}
function buildEquipHoverHtml(eq){
  const dbItem=EQUIP_DB.find(e=>e.id===eq.itemId);
  const tierColor=eq.tier==='SSR'?'#facc15':(eq.tier==='SR'?'#c084fc':'#38bdf8');
  const owner=findEquipOwner(eq.instanceId);
  let perk='尚未突破';
  if(dbItem?.perks && (eq.rank||0)>0){
    const k=`rank${Math.max(1,Math.min(3,eq.rank||0))}`;
    perk=dbItem.perks[k]?.desc||perk;
  }
  return `<div style="color:${tierColor};font-size:13px;font-weight:900">[${eq.tier}] ${eq.name} +${eq.refineLevel||0}</div>
    <div style="color:#94a3b8">${EQUIP_SLOT_LABEL[eq.slot]||eq.slot} · Rank ${eq.rank||0}/3 ${eq.locked?'· 🔒 已鎖定':''}</div>
    <div style="color:#34d399;margin-top:5px">主屬性：${EQUIP_STAT_LABEL[eq.mainStatType]||String(eq.mainStatType).toUpperCase()} +${getEquipMainValue(eq).toFixed(1)}</div>
    <div style="color:#a5b4fc;margin-top:4px">${(eq.subStats||[]).map(x=>`${x.type} +${x.val}`).join(' · ')||'無副詞條'}</div>
    <div style="color:#facc15;margin-top:5px">目前特權：${perk}</div>
    <div style="color:#38bdf8;margin-top:5px">${owner?`裝備者：${owner}`:'目前未裝備'}</div>
    <div style="color:#94a3b8;margin-top:6px">點擊：查看詳情 / 穿戴；鎖定後不會出現在突破素材中。</div>`;
}
function placeEquipHoverTooltip(anchor){
  const tip=document.getElementById('equip-hover-tooltip');
  if(!tip||!anchor||tip.style.display==='none') return;
  const r=anchor.getBoundingClientRect();
  const pad=12, gap=10;
  const tw=tip.offsetWidth||305, th=tip.offsetHeight||190;
  let left=r.right+gap;
  if(left+tw>window.innerWidth-pad) left=r.left-tw-gap;
  left=Math.max(pad,Math.min(left,window.innerWidth-tw-pad));
  let top=r.top+(r.height-th)/2;
  top=Math.max(pad,Math.min(top,window.innerHeight-th-pad));
  tip.style.left=`${Math.round(left)}px`; tip.style.top=`${Math.round(top)}px`;
}
function showEquipHoverTooltip(eq,anchor){
  const tip=document.getElementById('equip-hover-tooltip');
  if(!tip) return;
  tip.innerHTML=buildEquipHoverHtml(eq);
  tip.style.display='block'; tip.setAttribute('aria-hidden','false');
  placeEquipHoverTooltip(anchor);
}
window.hideEquipHoverTooltip=hideEquipHoverTooltip;

function openEquipBag(){
  isEquipBagOpen = true;
  const bag=document.getElementById('equip-bag-drawer');
  if(bag) bag.style.display='flex';
  renderInventoryEquipsGrid(ACTIVE_ROSTER[currentSlot]);
}
function closeEquipBag(){
  hideEquipHoverTooltip();
  isEquipBagOpen = false;
  const bag=document.getElementById('equip-bag-drawer');
  if(bag) bag.style.display='none';
}
window.openEquipBag=openEquipBag; window.closeEquipBag=closeEquipBag;

function renderInventoryEquipsGrid(currentCard) {
  hideEquipHoverTooltip();
  const grid = document.getElementById('inventory-equips-grid');
  if (!grid) return;
  grid.onscroll = hideEquipHoverTooltip;
  grid.innerHTML = '';
  const countEl = document.getElementById('equip-count-display');
  const equipList = Array.isArray(INVENTORY_EQUIPS) ? INVENTORY_EQUIPS : [];
  if (countEl) countEl.innerText = `持有 ${equipList.length} 件`;
  if (!equipList.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;color:#64748b;padding:24px;font-size:12px">背包空空如也，去轉蛋專區抽裝備吧。</div>`;
    return;
  }

  // 固定預設：稀有度 ↓ → Rank ↓ → 強化 ↓ → 主屬性 ↓ → 名稱 ↑
  const eqTierWeight = { SSR:3, SR:2, R:1 };
  const sortedEquips=[...equipList].sort((a,b)=>(eqTierWeight[b.tier]||0)-(eqTierWeight[a.tier]||0)
    ||(b.rank||0)-(a.rank||0)
    ||(b.refineLevel||0)-(a.refineLevel||0)
    ||getEquipMainValue(b)-getEquipMainValue(a)
    ||String(a.name||'').localeCompare(String(b.name||''),'zh-Hant'));

  sortedEquips.forEach(eq=>{
    const dbItem=EQUIP_DB.find(e=>e.id===eq.itemId);
    const tierColor=eq.tier==='SSR'?'#facc15':(eq.tier==='SR'?'#c084fc':'#38bdf8');
    const owner=findEquipOwner(eq.instanceId);
    const isCurrent=currentCard && (currentCard.equipSlotA===eq.instanceId||currentCard.equipSlotB===eq.instanceId);
    const card=document.createElement('div');
    card.className='equip-bag-card';
    card.style.cssText=`position:relative;min-height:142px;padding:9px 8px;background:#0b1022;border:2px solid ${tierColor};border-radius:12px;display:flex;flex-direction:column;align-items:center;text-align:center;cursor:pointer;box-shadow:${isCurrent?'0 0 14px rgba(250,204,21,.35)':'none'};`;
    let perk='無';
    if(dbItem?.perks){ const k=`rank${Math.max(1,Math.min(3,eq.rank||0))}`; perk=dbItem.perks[k]?.desc||'尚未突破'; }
    card.innerHTML=`
      <button title="${eq.locked?'解除鎖定':'鎖定，避免作為突破素材'}" onclick="event.stopPropagation();window.toggleEquipLock('${eq.instanceId}')" style="position:absolute;right:5px;top:5px;border:0;background:#020617bb;color:${eq.locked?'#facc15':'#64748b'};border-radius:6px;width:25px;height:25px;cursor:pointer">${eq.locked?'🔒':'🔓'}</button>
      ${owner?`<div title="${owner}" style="position:absolute;left:5px;top:5px;font-size:10px;background:#0f766e;color:#d1fae5;border-radius:5px;padding:2px 5px">E</div>`:''}
      <div style="width:72px;height:67px;display:grid;place-items:center;margin-top:2px">${getEquipIconSvg(eq,66)}</div>
      <div style="font-size:10px;color:${tierColor};font-weight:900;margin-top:2px">[${eq.tier}] ${eq.rank>=3?'◆ R3':''}</div>
      <div style="width:100%;font-size:11px;color:#f8fafc;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${eq.name}">${eq.name}${eq.refineLevel?` +${eq.refineLevel}`:''}</div>
      <div style="font-size:10px;color:#34d399;margin-top:2px">${EQUIP_STAT_LABEL[eq.mainStatType]||eq.mainStatType.toUpperCase()} +${getEquipMainValue(eq).toFixed(1)}</div>`;
    card.addEventListener('mouseenter',()=>showEquipHoverTooltip(eq,card));
    card.addEventListener('mousemove',()=>placeEquipHoverTooltip(card));
    card.addEventListener('mouseleave',hideEquipHoverTooltip);
    card.onclick=()=>window.openEquipDetail(eq.instanceId);
    grid.appendChild(card);
  });
}
window.toggleEquipLock=function(instId){
  hideEquipHoverTooltip();
  const eq=INVENTORY_EQUIPS.find(e=>e.instanceId===instId); if(!eq)return;
  eq.locked=!eq.locked; saveGameData(); renderInventoryEquipsGrid(ACTIVE_ROSTER[currentSlot]);
};

function openEquipDetail(instId){
  hideEquipHoverTooltip();
  const eq=INVENTORY_EQUIPS.find(e=>e.instanceId===instId); if(!eq)return;
  const db=EQUIP_DB.find(e=>e.id===eq.itemId); const owner=findEquipOwner(eq.instanceId);
  const tierColor=eq.tier==='SSR'?'#facc15':(eq.tier==='SR'?'#c084fc':'#38bdf8');
  const perk1=db?.perks?.rank1?.desc||'-', perk2=db?.perks?.rank2?.desc||'-', perk3=db?.perks?.rank3?.desc||'-';
  const modal=document.getElementById('equip-detail-modal'), body=document.getElementById('equip-detail-body'); if(!modal||!body)return;
  body.innerHTML=`
    <div style="display:flex;gap:16px;align-items:flex-start">
      <div style="width:116px;height:116px;border:2px solid ${tierColor};border-radius:16px;background:#0b1022;display:grid;place-items:center;flex:0 0 auto">${getEquipIconSvg(eq,104)}</div>
      <div style="flex:1;text-align:left">
        <div style="color:${tierColor};font-weight:900;font-size:16px">[${eq.tier}] ${eq.name} +${eq.refineLevel}</div>
        <div style="color:#94a3b8;font-size:10px;margin-top:3px">${EQUIP_SLOT_LABEL[eq.slot]||eq.slot} · Rank ${eq.rank}/3 ${owner?`· ${owner}`:''}</div>
        <div style="color:#34d399;font-size:13px;margin-top:8px">${EQUIP_STAT_LABEL[eq.mainStatType]||eq.mainStatType.toUpperCase()} +${getEquipMainValue(eq).toFixed(1)}</div>
        <div style="color:#a5b4fc;font-size:11px;margin-top:5px">${eq.subStats.map(x=>`${x.type} +${x.val}`).join(' · ')||'無副詞條'}</div>
        <div style="font-size:10px;color:#cbd5e1;margin-top:9px;line-height:1.45">R1：${perk1}<br>R2：${perk2}<br><span style="color:#facc15">R3：${perk3}</span></div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:14px">
      <button class="btn-action" onclick="window.openEquipSlotPicker('${eq.instanceId}')">${owner?'卸下':'穿戴'}</button>
      <button class="btn-sound" onclick="window.toggleEquipLock('${eq.instanceId}');openEquipDetail('${eq.instanceId}')">${eq.locked?'🔓 解除鎖定':'🔒 鎖定'}</button>
      <button class="btn-action" ${eq.refineLevel>=10?'disabled':''} onclick="window.refineEquip('${eq.instanceId}');openEquipDetail('${eq.instanceId}')">強化 ${eq.refineLevel>=10?'(滿級)':'(+1)'}</button>
      <button class="btn-action" style="background:#9333ea" ${eq.rank>=3?'disabled':''} onclick="closeEquipDetail();window.openBreakthroughModal('${eq.instanceId}')">突破</button>
      <button class="btn-sound" style="grid-column:1/-1" onclick="closeEquipDetail();window.openReforgeModal('${eq.instanceId}')">重鑄副詞條</button>
    </div>`;
  modal.style.display='flex';
}
function closeEquipDetail(){const m=document.getElementById('equip-detail-modal');if(m)m.style.display='none';}
window.openEquipDetail=openEquipDetail; window.closeEquipDetail=closeEquipDetail;

// ========================================================
// 🌟 全域操作函式 (掛載於 window，徹底杜絕 ReferenceError)
// ========================================================
let pendingEquipInstanceId = null;
let pendingEquipReturnDetailId = null;

function equipInstanceToSlot(instId, targetSlot) {
  const currentCard = ACTIVE_ROSTER[currentSlot];
  if (!currentCard || !instId || !['equipSlotA', 'equipSlotB'].includes(targetSlot)) return false;
  currentCard[targetSlot] = instId;
  playSound('set');
  saveGameData();
  renderLocker();
  return true;
}

window.openEquipSlotPicker = function(instId) {
  const currentCard = ACTIVE_ROSTER[currentSlot];
  if (!currentCard) return;

  // V76-4.1：卸裝是可逆操作，不再叫瀏覽器 confirm；直接卸下並刷新。
  if (currentCard.equipSlotA === instId) {
    currentCard.equipSlotA = null;
    playSound('set'); saveGameData(); renderLocker(); closeEquipDetail();
    return;
  }
  if (currentCard.equipSlotB === instId) {
    currentCard.equipSlotB = null;
    playSound('set'); saveGameData(); renderLocker(); closeEquipDetail();
    return;
  }

  // 有空槽就直接穿上，不需要再問。
  if (!currentCard.equipSlotA) {
    equipInstanceToSlot(instId, 'equipSlotA');
    closeEquipDetail();
    return;
  }
  if (!currentCard.equipSlotB) {
    equipInstanceToSlot(instId, 'equipSlotB');
    closeEquipDetail();
    return;
  }

  // A/B 都有裝備時，改用遊戲內槽位選擇視窗，不再呼叫 browser prompt。
  pendingEquipInstanceId = instId;
  pendingEquipReturnDetailId = instId;
  const modal = document.getElementById('equip-slot-picker-modal');
  if (!modal) return;

  const getLabel = (slotInstId, fallback) => {
    const eq = INVENTORY_EQUIPS.find(e => e.instanceId === slotInstId);
    return eq ? `[${eq.tier}] ${eq.name} +${eq.refineLevel || 0}` : fallback;
  };
  const a = document.getElementById('equip-slot-picker-a-current');
  const b = document.getElementById('equip-slot-picker-b-current');
  if (a) a.textContent = getLabel(currentCard.equipSlotA, '空');
  if (b) b.textContent = getLabel(currentCard.equipSlotB, '空');

  closeEquipDetail();
  modal.style.display = 'flex';
};

window.confirmEquipSlotPick = function(slotKey) {
  if (!pendingEquipInstanceId) return;
  const targetSlot = slotKey === 'B' ? 'equipSlotB' : 'equipSlotA';
  const instId = pendingEquipInstanceId;
  pendingEquipInstanceId = null;
  pendingEquipReturnDetailId = null;
  const modal = document.getElementById('equip-slot-picker-modal');
  if (modal) modal.style.display = 'none';
  equipInstanceToSlot(instId, targetSlot);
};

window.cancelEquipSlotPick = function() {
  const returnDetailId = pendingEquipReturnDetailId;
  pendingEquipInstanceId = null;
  pendingEquipReturnDetailId = null;
  const modal = document.getElementById('equip-slot-picker-modal');
  if (modal) modal.style.display = 'none';
  // 取消就是純取消：不修改任何槽位，並回到剛才的裝備詳情。
  if (returnDetailId) openEquipDetail(returnDetailId);
};

// 保留舊函式名稱給其他入口使用，但實際統一走遊戲內槽位選擇器。
window.promptEquipToCurrentPlayer = window.openEquipSlotPicker;

window.unequipSlot = function(propName) {
  ACTIVE_ROSTER[currentSlot][propName] = null;
  saveGameData();
  renderLocker();
};

window.refineEquip = function(instId) {
  const eq = INVENTORY_EQUIPS.find(e => e.instanceId === instId);
  if (!eq || eq.refineLevel >= 10) return;
  const cost = getEquipRefineCost(eq.refineLevel);
  if (userCoins < cost) { alert(`金幣不足！需要 ${cost} 幣。`); return; }
  userCoins -= cost;
  eq.refineLevel++;
  playSound('coin');
  saveGameData();
  renderLocker();
};

window.openBreakthroughModal = function(instId) {
  const target = INVENTORY_EQUIPS.find(e => e.instanceId === instId);
  if (!target) return;
  if (target.rank >= 3) { alert('該裝備已達滿階 3 階！'); return; }

  currentBreakthroughTargetId = instId;
  const dbItem = EQUIP_DB.find(e => e.id === target.itemId);
  const modal = document.getElementById('breakthrough-modal');
  if (!modal) return;
  modal.style.display = 'flex';

  document.getElementById('breakthrough-target-info').innerHTML = `
    <div style="font-weight: bold; color: #facc15;">突破目標：${target.name} +${target.refineLevel} (${target.rank} 階 ➔ ${target.rank + 1} 階)</div>
    <div style="color: #cbd5e1; font-size: 11px;">解鎖特權：${dbItem && dbItem.perks ? dbItem.perks[`rank${target.rank+1}`].desc : '專屬特權'}</div>
  `;

  const mount = document.getElementById('breakthrough-materials-list');
  mount.innerHTML = '';
  const materials = INVENTORY_EQUIPS.filter(e => e.itemId === target.itemId && e.instanceId !== instId && !e.locked)
    .sort((a,b)=>(a.rank||0)-(b.rank||0)||(a.refineLevel||0)-(b.refineLevel||0)||getEquipMainValue(a)-getEquipMainValue(b));

  if (materials.length === 0) {
    mount.innerHTML = `<div style="color: #ef4444; font-size: 12px; padding: 10px;">背包中沒有可消耗的同名【${target.name}】。已鎖定裝備不會列為突破素材。</div>`;
    return;
  }

  materials.forEach(mat => {
    const row = document.createElement('div');
    row.style.cssText = 'display: flex; justify-content: space-between; align-items: center; background: #0f172a; padding: 8px 12px; border-radius: 8px; border: 1px solid #334155;';
    row.innerHTML = `
      <div style="text-align: left;">
        <span style="color: #fff; font-weight: bold;">${mat.name} +${mat.refineLevel} (${mat.rank}階)</span>
        <div style="font-size: 10px; color: #94a3b8;">主屬 Roll: +${mat.baseRoll} | 副詞: ${mat.subStats.map(s => s.type).join(',')}</div>
      </div>
      <button class="btn-action" style="background: #ef4444; font-size: 10px; padding: 4px 10px;" onclick="window.confirmBreakthrough('${mat.instanceId}')">
        吃掉此裝備
      </button>
    `;
    mount.appendChild(row);
  });
};

window.closeBreakthroughModal = function() {
  const modal = document.getElementById('breakthrough-modal');
  if (modal) modal.style.display = 'none';
  currentBreakthroughTargetId = null;
};

window.confirmBreakthrough = function(materialInstId) {
  const target = INVENTORY_EQUIPS.find(e => e.instanceId === currentBreakthroughTargetId);
  const matIdx = INVENTORY_EQUIPS.findIndex(e => e.instanceId === materialInstId);
  if (!target || matIdx === -1) return;
  if (INVENTORY_EQUIPS[matIdx]?.locked) { alert('此裝備已鎖定，無法作為突破素材。'); return; }

  if (confirm(`確定要將這件材料裝備吃掉嗎？此操作無法還原！`)) {
    INVENTORY.forEach(c => {
      if (c.equipSlotA === materialInstId) c.equipSlotA = null;
      if (c.equipSlotB === materialInstId) c.equipSlotB = null;
    });

    INVENTORY_EQUIPS.splice(matIdx, 1);
    target.rank++;
    playSound('perfect_spike');
    if (target.rank === 3) {
      alert(`✨ 恭喜突破至滿階 3 階！已解鎖專屬【腳底階級光暈】！`);
    }
    window.closeBreakthroughModal();
    saveGameData();
    renderLocker();
  }
};

window.openReforgeModal = function(instId) {
  const eq = INVENTORY_EQUIPS.find(e => e.instanceId === instId);
  if (!eq) return;
  currentReforgeInstId = instId;
  const cost = getEquipReforgeCost(eq.reforgeCount);
  const modal = document.getElementById('reforge-modal');
  if (!modal) return;
  modal.style.display = 'flex';

  document.getElementById('reforge-item-info').innerHTML = `
    <div style="font-weight: bold; color: #38bdf8; margin-bottom: 6px;">${eq.name} +${eq.refineLevel}</div>
    <div style="color: #cbd5e1; margin-bottom: 4px;">當前副詞條數值：</div>
    ${eq.subStats.map(s => `<div style="padding-left: 10px; color: #a5b4fc;">• ${s.type}: <strong style="color:#facc15;">+${s.val}</strong> (區間 ${s.min} ~ ${s.max})</div>`).join('')}
    <div style="color: #facc15; font-weight: bold; margin-top: 8px;">本次重鑄消耗：${cost} 幣 (已累計洗練 ${eq.reforgeCount} 次)</div>
  `;

  const btn = document.getElementById('btn-do-reforge');
  if (btn) {
    btn.innerText = `花費 ${cost} 幣重鑄`;
    btn.disabled = userCoins < cost;
  }
};

window.closeReforgeModal = function() {
  const modal = document.getElementById('reforge-modal');
  if (modal) modal.style.display = 'none';
  currentReforgeInstId = null;
};

window.executeReforgeAction = function() {
  const eq = INVENTORY_EQUIPS.find(e => e.instanceId === currentReforgeInstId);
  if (!eq) return;
  const cost = getEquipReforgeCost(eq.reforgeCount);
  if (userCoins < cost) { alert('金幣不足！'); return; }

  userCoins -= cost;
  eq.reforgeCount++;

  const dbItem = EQUIP_DB.find(e => e.id === eq.itemId);
  eq.subStats.forEach(sub => {
    const range = SUBSTAT_RANGES[sub.type][dbItem.tier];
    sub.val = parseFloat((range[0] + Math.random() * (range[1] - range[0])).toFixed(1));
  });

  playSound('pia');
  saveGameData();
  window.openReforgeModal(eq.instanceId);
  renderLocker();
};

function equipSkillToActivePlayer(skillId) {
  const origin = ACTIVE_ROSTER[currentSlot];
  origin.equippedSkill = skillId;
  const sk = SKILL_POOL.find(s => s.id === skillId);
  if (sk) {
    const descEl = document.getElementById('skill-card-desc');
    if (descEl) descEl.innerText = sk.desc;
  }
  if (typeof allPlayers !== 'undefined') allPlayers.forEach(p => p.rebind(true));
  saveGameData();
}

// V67: 配點熱路徑只刷新能力區，不再重建整個更衣室/裝備背包。
function renderStagedStatsOnly() {
  const origin = ACTIVE_ROSTER[currentSlot];
  const freePtsEl = document.getElementById('free-pts-display');
  if (freePtsEl) freePtsEl.innerText = stagedCard.freePts;

  const equipBonusStats = { str: 0, agi: 0, jump: 0, dex: 0, int: 0 };
  [origin.equipSlotA, origin.equipSlotB].forEach(instId => {
    if (!instId) return;
    const eq = (typeof INVENTORY_EQUIPS !== 'undefined') ? INVENTORY_EQUIPS.find(e => e.instanceId === instId) : null;
    if (!eq) return;
    const dbItem = EQUIP_DB.find(e => e.id === eq.itemId);
    const mainVal = eq.baseRoll + (eq.refineLevel * (dbItem ? dbItem.refineGain : 0.5));
    if (equipBonusStats[eq.mainStatType] !== undefined) equipBonusStats[eq.mainStatType] += mainVal;
  });

  const statMeta = {
    str: { label: '力量 (STR)', desc: '力量輸出：扣球／跳發球威、二傳最遠推送與攔網剛性。' },
    agi: { label: '敏捷 (AGI)', desc: '動作速度：橫移、魚躍位移、回位與反應速度；不再直接增加接球卸力。' },
    jump: { label: '彈跳 (JUMP)', desc: '垂直能力：摸高、攻擊打點、滯空與前排攔網高度；高值需要更精準的時機。' },
    dex: { label: '技巧 (TEC)', desc: '動作細膩度：接觸品質、甜蜜點、容錯範圍、旋轉、二傳與球路控制。' },
    int: { label: '球商 (INT)', desc: '判讀與球商：落點／OUT／假動作判斷、AI戰術、二傳判斷與狀態抗性。' }
  };
  const mount = document.getElementById('stats-mount');
  if (mount) {
    mount.innerHTML = '';
    for (const k in stagedCard.stats) {
      const row = document.createElement('div'); row.className = 'stat-row';
      const baseVal = origin.baseStats[k], allocatedVal = stagedCard.stats[k], eqBonus = equipBonusStats[k] || 0, totalVal = allocatedVal + eqBonus;
      row.innerHTML = `<div><span>${statMeta[k].label}</span><span style="font-size:11px;color:${eqBonus>0?'#34d399':'#94a3b8'};margin-left:4px;"><strong>${totalVal.toFixed(1)}</strong> (${allocatedVal}${eqBonus>0?` + <span style="color:#34d399;">${eqBonus.toFixed(1)}</span>`:''})</span></div><div class="stat-tooltip">${statMeta[k].desc}</div><div style="display:flex;align-items:center;gap:6px;"><button class="stat-btn" onclick="adjustStagedStat('${k}', -1)" ${allocatedVal<=baseVal?'disabled':''}>-</button><strong style="width:24px;text-align:center;color:${allocatedVal>baseVal?'#facc15':'#fff'};">${allocatedVal}</strong><button class="stat-btn" onclick="adjustStagedStat('${k}', 1)" ${stagedCard.freePts<=0||allocatedVal>=60?'disabled':''}>+</button></div>`;
      mount.appendChild(row);
    }
  }

  const bareCard = { stats: stagedCard.stats, equippedSkill: origin.equippedSkill, equipSlotA: null, equipSlotB: null };
  const fullCard = { stats: stagedCard.stats, equippedSkill: origin.equippedSkill, equipSlotA: origin.equipSlotA, equipSlotB: origin.equipSlotB };
  const baseDerived = deriveStats(bareCard), fullDerived = deriveStats(fullCard);
  const fmt = (f,b,u) => { const d=f-b; return Math.abs(d)>0.05 ? `${f.toFixed(2)}${u} <span style="font-size:10px;color:#34d399;">(${b.toFixed(2)} + ${d.toFixed(2)})</span>` : `${f.toFixed(2)}${u}`; };
  const dm = document.getElementById('derived-mount');
  if (dm) dm.innerHTML = `<div class="stat-derived-row"><span>🏃 實時奔跑速度 (Run Speed)</span><strong style="color:#38bdf8;">${fmt(fullDerived.speed,baseDerived.speed,' px/f')}</strong></div><div class="stat-derived-row"><span>💥 扣球攻擊力 (Spike Atk)</span><strong style="color:#ef4444;">${fmt(fullDerived.power,baseDerived.power,'')}</strong></div><div class="stat-derived-row"><span>🛡️ 防守卸力值 (Defense)</span><strong style="color:#10b981;">${fmt(fullDerived.defense,baseDerived.defense,'')}</strong></div><div class="stat-derived-row"><span>🧱 攔網手型剛性 (Block Guard)</span><strong style="color:#facc15;">${fmt(fullDerived.blockRigidity,baseDerived.blockRigidity,'')}</strong></div><div class="stat-derived-row"><span>🎯 完美起球半徑 (Sweet Spot)</span><strong style="color:#a78bfa;">${fullDerived.sweetWindow} px</strong></div><div class="stat-derived-row"><span>🛡️ 實體防守覆蓋半徑 (Reach)</span><strong style="color:#38bdf8;">${fmt(fullDerived.reach,baseDerived.reach,' px')}</strong></div><div class="stat-derived-row"><span>⚡ 神經反應延遲 (Reaction)</span><strong style="color:#f472b6;">${fullDerived.reactionDelay} 幀</strong></div>`;
}

function adjustStagedStat(key, delta) {
  const origin = ACTIVE_ROSTER[currentSlot];
  let changed = false;
  if (delta > 0 && stagedCard.freePts > 0 && stagedCard.stats[key] < 60) { stagedCard.stats[key]++; stagedCard.freePts--; changed = true; }
  else if (delta < 0 && stagedCard.stats[key] > origin.baseStats[key]) { stagedCard.stats[key]--; stagedCard.freePts++; changed = true; }
  if (changed) renderStagedStatsOnly();
}

function rollStagedStats() {
  const origin = ACTIVE_ROSTER[currentSlot];
  const pool = stagedCard.freePts + (Object.values(stagedCard.stats).reduce((a, b) => a + b, 0) - Object.values(origin.baseStats).reduce((a, b) => a + b, 0));
  for (let k in stagedCard.stats) stagedCard.stats[k] = origin.baseStats[k];
  let rem = pool;
  const keys = ['str', 'agi', 'jump', 'dex', 'int'];
  while (rem > 0) {
    const rk = keys[Math.floor(Math.random() * keys.length)];
    if (stagedCard.stats[rk] < 60) { stagedCard.stats[rk]++; rem--; }
  }
  stagedCard.freePts = 0; renderLocker();
}

function resetStagedStats() {
  const origin = ACTIVE_ROSTER[currentSlot];
  const spentPts = Object.values(stagedCard.stats).reduce((a, b) => a + b, 0) - Object.values(origin.baseStats).reduce((a, b) => a + b, 0);
  for (let k in stagedCard.stats) stagedCard.stats[k] = origin.baseStats[k];
  stagedCard.freePts += spentPts; renderLocker();
}

function saveStagedStats() {
  const origin = ACTIVE_ROSTER[currentSlot];
  origin.freePts = stagedCard.freePts; origin.stats = { ...stagedCard.stats };
  if (typeof allPlayers !== 'undefined') allPlayers.forEach(p => p.rebind(true));
  saveGameData(); renderLocker();
  alert(`✅ [${origin.name}] 配點已成功儲存！`);
}

function swapActivePlayer(cardId) {
  const target = INVENTORY.find(c => c.id === cardId);
  if (target) {
    setPersistentRosterSlot(currentSlot, target); initStagedCard();
    if (typeof allPlayers !== 'undefined') allPlayers.forEach(p => p.rebind(true));
    saveGameData(); renderLocker();
  }
}

// ========================================================
// ⏸️ ESC 暫停選單
// ========================================================
let isPauseMenuOpen = false;
let isPracticeMode = false;

function openLockerFromMenu() {
  lockerReturnContext = 'MENU';
  document.getElementById('start-menu-modal').style.display = 'none';
  if(typeof _stopVenueAmbience==='function')_stopVenueAmbience();
  isLockerOpen = true;
  document.getElementById('locker-modal').style.display = 'flex';
  initStagedCard(); renderLocker();
}

function closeLockerToMenu() {
  lockerReturnContext = 'MENU';
  isLockerOpen = false; closeEquipBag();
  document.getElementById('locker-modal').style.display = 'none';
  document.getElementById('start-menu-modal').style.display = 'flex';
}

function closeLockerByContext(){
  isLockerOpen=false; closeEquipBag();
  document.getElementById('locker-modal').style.display='none';
  if(lockerReturnContext==='PAUSE'){
    isPaused=true; isPauseMenuOpen=true;
    document.getElementById('pause-menu-modal').style.display='flex';
  }else{
    document.getElementById('start-menu-modal').style.display='flex';
  }
}
window.closeLockerByContext=closeLockerByContext;

function openLockerFromPause() {
  // V75-3.3 Balance sessions use runtime-locked test profiles. Rebinding from the
  // locker would silently destroy the controlled variables, so the locker is disabled.
  if (typeof BALANCE_TEST_ACTIVE !== 'undefined' && BALANCE_TEST_ACTIVE) return;
  if (NET.isMultiplayer || isCareerMode) return;
  lockerReturnContext = 'PAUSE';
  isPauseMenuOpen = false;
  document.getElementById('pause-menu-modal').style.display = 'none';
  isLockerOpen = true; isPaused = true;
  document.getElementById('locker-modal').style.display = 'flex';
  initStagedCard(); renderLocker();
}

function toggleLocker() {
  if (typeof BALANCE_TEST_ACTIVE !== 'undefined' && BALANCE_TEST_ACTIVE) return;
  if (isSettlementOpen) return;
  if (isLockerOpen) { closeLockerByContext(); return; }
  lockerReturnContext = isGameStarted ? 'PAUSE' : 'MENU';
  isLockerOpen = true; isPaused = isGameStarted;
  document.getElementById('locker-modal').style.display = 'flex';
  initStagedCard(); renderLocker();
}

function togglePauseMenu() {
  if (isSettlementOpen || !isGameStarted) return;
  isPauseMenuOpen = !isPauseMenuOpen;
  document.getElementById('pause-menu-modal').style.display = isPauseMenuOpen ? 'flex' : 'none';

  const lockerBtn = document.getElementById('pause-btn-locker');
  const modeStatus = document.getElementById('pause-mode-status');

if (typeof BALANCE_TEST_ACTIVE !== 'undefined' && BALANCE_TEST_ACTIVE) {
    isPaused = isPauseMenuOpen;
    lockerBtn.disabled = true;
    lockerBtn.innerText = '🔒 更衣室 (Balance Test 鎖定)';
    modeStatus.innerText = '🧪 Balance Test · Runtime 數值已鎖定，避免更衣室污染控制變因';
    modeStatus.style.color = '#22d3ee';
  } else if (NET.isMultiplayer) {
    isPaused = false;
    lockerBtn.disabled = true;
    lockerBtn.innerText = '🔒 更衣室 (連線中禁用)';
    modeStatus.innerText = '🌐 線上對戰中 · 賽局即時進行中 (未暫停)';
    modeStatus.style.color = '#38bdf8';
  } else if (isCareerMode || isLadderMode) { // 🌟 天梯中嚴禁使用更衣室換人改數值！
    isPaused = isPauseMenuOpen;
    lockerBtn.disabled = true;
    lockerBtn.innerText = '🔒 更衣室 (天梯爬塔中禁用)';
    modeStatus.innerText = isLadderMode ? '🪜 天梯挑戰中 · 時間已凍結' : '🏆 聯賽進行中 · 時間已凍結';
    modeStatus.style.color = '#facc15';
  } else {
        isPaused = isPauseMenuOpen;
    lockerBtn.disabled = false;
    lockerBtn.innerText = '👕 角色戰術更衣室';
    modeStatus.innerText = '🏐 無盡練習模式 · 時間已凍結';
    modeStatus.style.color = '#10b981';
  }
}

function resumeGame() {
  isPauseMenuOpen = false;
  document.getElementById('pause-menu-modal').style.display = 'none';
  if (!NET.isMultiplayer) isPaused = false;
}

function toggleBgmPlay() {
  const btn = document.getElementById('btn-bgm');
  if (!isAudioLoaded) { alert('請先點擊上方按鈕選擇本機 MP3！'); return; }
  if (customAudio.paused) {
    customAudio.play(); btn.innerText = 'BGM: 播放中'; btn.style.background = '#10b981';
  } else {
    customAudio.pause(); btn.innerText = 'BGM: 暫停'; btn.style.background = '#312e81';
  }
}

function returnToStartMenuFromPause() {
  if (confirm('確定要結束比賽並返回大廳嗎？')) {
    resumeGame();
    if (NET.isMultiplayer && NET.conn && NET.conn.open) {
      NET.conn.send({ type: 'PEER_QUIT' });
      NET.peer.destroy(); NET.peer = null; NET.isMultiplayer = false;
    }
    returnToStartMenu();
  }
}

function startPracticeMode(venueId = 'stadium', venueChoice = null, eventsEnabled = true) {
  // V37: 真正按『開始練習』時不要再銷毀一次 session；選場視窗打開時已清乾淨。
  setCurrentVenue(venueId); venueEventsEnabled = eventsEnabled !== false; // V59: 無盡可選擇是否啟用 Incident；Venue 固有物理永遠保留
  if (typeof NET !== 'undefined') { NET.venueId = venueId; NET.venueChoice = venueChoice || venueId; }
  isPracticeMode = true;
  isCareerMode = false;
  isLadderMode = false;
  if (typeof NET !== 'undefined') NET.isMultiplayer = false;
  restoreActiveRosterFromSaved(true);
  document.getElementById('start-menu-modal').style.display = 'none';
  isGameStarted = true; isPaused = false;
  if (typeof resetMatchState === 'function') resetMatchState();
  ball.resetForServe('LEFT');
  showVenueRevealCurtain();
}

// ========================================================
// ⏳ 連線賽前戰術配置室
// ========================================================
let netPrepTimer = null, netPrepSeconds = 30;
let isMyReady = false, isMateReady = false;

function toggleDifficultySelect(isCoop) {
  const wrap = document.getElementById('pve-difficulty-wrap');
  if (wrap) wrap.style.display = isCoop ? 'block' : 'none';
}

function startNetPreparation() {
  NET.rematchRequested = false;
  NET.remoteRematchRequested = false;
  document.getElementById('multiplayer-modal').style.display = 'none';
  document.getElementById('settlement-modal').style.display = 'none';
  document.getElementById('net-prep-modal').style.display = 'flex';
  netPrepSeconds = 30;
  isMyReady = false;
  isMateReady = false;

  const timerEl = document.getElementById('net-prep-timer');
  timerEl.innerText = `⏳ 倒數: ${netPrepSeconds}s`;
  timerEl.style.color = '#ef4444';

  const readyBtn = document.getElementById('btn-net-prep-ready');
  readyBtn.disabled = false;
  readyBtn.style.background = '#10b981';
  readyBtn.innerText = '⚔️ 準備完成 (READY)';

  document.getElementById('net-prep-ready-status').innerText = '等待雙方確認...';
  document.getElementById('net-prep-ready-status').style.color = '#cbd5e1';

  const myCharSel = document.getElementById('net-prep-my-char');
  const mySkillSel = document.getElementById('net-prep-my-skill');
  const mateCharSel = document.getElementById('net-prep-mate-char');
  const mateSkillSel = document.getElementById('net-prep-mate-skill');
  const mateTitle = document.getElementById('mate-prep-title');
  const diffHint = document.getElementById('net-prep-difficulty-hint');

  myCharSel.disabled = false;
  mySkillSel.disabled = false;
myCharSel.innerHTML = '';
  const prepTierWeight = { SSR: 4, SR: 3, R: 2, N: 1 };
  const sortedPrepChars = [...INVENTORY].sort((a, b) => {
    const wA = prepTierWeight[a.tier] || 0, wB = prepTierWeight[b.tier] || 0;
    if (wB !== wA) return wB - wA;
    return (b.level || 1) - (a.level || 1);
  });

  sortedPrepChars.forEach((c, idx) => {
    myCharSel.innerHTML += `<option value="${c.id}" ${idx === 0 ? 'selected' : ''}>[${c.tier}] ${c.name} (Lv.${c.level})</option>`;
  });

  mySkillSel.innerHTML = '';
  sortSkillsForSelect(SKILL_POOL).forEach(sk => {
    mySkillSel.innerHTML += `<option value="${sk.id}">[${sk.type}] ${sk.name}</option>`;
  });

  const myCloudId = (typeof currentCloudUser !== 'undefined' && currentCloudUser) ? currentCloudUser : '我方主控';
  const myTitleEl = document.querySelector('#panel-my-prep h3');
  if (myTitleEl) myTitleEl.innerText = `👤 [${myCloudId}] 的出戰配置`;

  if (NET.mode === 'COOP') {
    mateTitle.innerText = '🤝 隊友配置 (即時連動)';
    mateCharSel.disabled = true;
    mateSkillSel.disabled = true;
    mateCharSel.innerHTML = `<option value="">(隊友選擇中...)</option>`;
    mateSkillSel.innerHTML = `<option value="">(技能同步中...)</option>`;

    const diffNames = { 1: '入門新手', 2: '泥濘沼澤', 3: '常盤鋼鐵', 4: '疾風怒濤', 5: '神域全明星' };
    diffHint.innerText = `👾 挑戰難度：【${diffNames[NET.pveDifficulty] || '隨機難度'}】(電腦將於開賽時登場)`;
  } else {
    mateTitle.innerText = '🤖 我的電腦隊友 (AI 搭檔)';
    mateCharSel.disabled = false;
    mateSkillSel.disabled = false;
mateCharSel.innerHTML = '';
    sortedPrepChars.forEach((c, idx) => {
      mateCharSel.innerHTML += `<option value="${c.id}" ${idx === 1 ? 'selected' : ''}>[${c.tier}] ${c.name} (Lv.${c.level})</option>`;
    });
    mateSkillSel.innerHTML = '';
    sortSkillsForSelect(SKILL_POOL).forEach(sk => {
      mateSkillSel.innerHTML += `<option value="${sk.id}">[${sk.type}] ${sk.name}</option>`;
    });
    diffHint.innerText = '⚔️ 隔網對抗：雙方各帶一名自選電腦隊友交戰！';
  }

  onNetPrepChange();

  clearInterval(netPrepTimer);
  netPrepTimer = setInterval(() => {
    netPrepSeconds--;
    timerEl.innerText = `⏳ 倒數: ${netPrepSeconds}s`;
    if (netPrepSeconds <= 0) {
      clearInterval(netPrepTimer);
      finalizeNetStart();
    }
  }, 1000);
}

function onNetPrepChange() {
  const charId = document.getElementById('net-prep-my-char').value;
  const skillId = document.getElementById('net-prep-my-skill').value;
  const myCharObj = INVENTORY.find(c => c.id === charId) || INVENTORY[0];

  if (NET.conn && NET.conn.open) {
    NET.conn.send({
      type: 'LOBBY_SELECT_UPDATE',
      char: { name: myCharObj.name, tier: myCharObj.tier, level: myCharObj.level, color: myCharObj.color },
      skillId: skillId
    });
  }
}

function handleRemoteLobbyUpdate(data) {
  if (NET.mode === 'COOP') {
    const mateCharSel = document.getElementById('net-prep-mate-char');
    const mateSkillSel = document.getElementById('net-prep-mate-skill');
    const sk = SKILL_POOL.find(s => s.id === data.skillId) || SKILL_POOL[0];

    mateCharSel.innerHTML = `<option value="">[${data.char.tier}] ${data.char.name} (Lv.${data.char.level})</option>`;
    mateSkillSel.innerHTML = `<option value="">[${sk.type}] ${sk.name}</option>`;
  }
}

function buildNetPlayerSnapshot(card, skillId) {
  const staged = { ...card, equippedSkill: skillId };
  const runtime = deriveStats(staged);
  // Send base card data for UI plus the exact final gameplay stats for parity.
  // Do not send local equipment instance IDs: they are meaningless on the peer.
  return {
    name: staged.name, color: staged.color, tier: staged.tier, level: staged.level,
    stats: { ...staged.stats }, skillId,
    cosmetics: staged.cosmetics,
    highestRank3Tier: (() => {
      let t = null;
      [staged.equipSlotA, staged.equipSlotB].forEach(id => {
        const eq = (typeof INVENTORY_EQUIPS !== 'undefined') ? INVENTORY_EQUIPS.find(e => e.instanceId === id) : null;
        if (eq && eq.rank >= 3) {
          if (eq.tier === 'SSR') t = 'SSR';
          else if (eq.tier === 'SR' && t !== 'SSR') t = 'SR';
          else if (eq.tier === 'R' && !t) t = 'R';
        }
      });
      return t;
    })(),
    runtimeStats: { ...runtime, skill: undefined, perks: { ...(runtime.perks || {}) } }
  };
}

function makeRemoteNetCard(data, id) {
  return {
    id, name: data.name, color: data.color, tier: data.tier, level: data.level,
    stats: data.stats, equippedSkill: data.skillId, cosmetics: data.cosmetics,
    highestRank3Tier: data.highestRank3Tier,
    equipSlotA: null, equipSlotB: null,
    _netDerivedStats: data.runtimeStats || null
  };
}

function confirmNetPrepReady() {
  if (isMyReady) return;
  isMyReady = true;

  const readyBtn = document.getElementById('btn-net-prep-ready');
  readyBtn.disabled = true;
  readyBtn.style.background = '#64748b';
  readyBtn.innerText = '✓ 我已就緒 (WAITING)';

  document.getElementById('net-prep-my-char').disabled = true;
  document.getElementById('net-prep-my-skill').disabled = true;
  document.getElementById('net-prep-mate-char').disabled = true;
  document.getElementById('net-prep-mate-skill').disabled = true;

  const myCharId = document.getElementById('net-prep-my-char').value;
  const mySkillId = document.getElementById('net-prep-my-skill').value;
  const mateCharId = document.getElementById('net-prep-mate-char').value;
  const mateSkillId = document.getElementById('net-prep-mate-skill').value;

  const myCharObj = INVENTORY.find(c => c.id === myCharId) || INVENTORY[0];
  const mateCharObj = INVENTORY.find(c => c.id === mateCharId) || INVENTORY[1];

// 🌟 計算當前角色最高三階階級，直接打包傳送
  const getRank3Tier = (c) => {
    let t = null;
    [c.equipSlotA, c.equipSlotB].forEach(id => {
      const eq = (typeof INVENTORY_EQUIPS !== 'undefined') ? INVENTORY_EQUIPS.find(e => e.instanceId === id) : null;
      if (eq && eq.rank >= 3) {
        if (eq.tier === 'SSR') t = 'SSR';
        else if (eq.tier === 'SR' && t !== 'SSR') t = 'SR';
        else if (eq.tier === 'R' && !t) t = 'R';
      }
    });
    return t;
  };

  const payload = {
    type: 'READY_CHECK', ready: true,
    p1: buildNetPlayerSnapshot(myCharObj, mySkillId),
    p2: (NET.mode === 'PVP') ? buildNetPlayerSnapshot(mateCharObj, mateSkillId) : null
  };

  if (NET.conn && NET.conn.open) {
    NET.conn.send(payload);
  }

  if (NET.isHost) {
    ACTIVE_ROSTER.user = { ...myCharObj, equippedSkill: mySkillId };
    if (NET.mode === 'PVP') {
      ACTIVE_ROSTER.mate = { ...mateCharObj, equippedSkill: mateSkillId };
    }
  } else {
    if (NET.mode === 'COOP') {
      ACTIVE_ROSTER.mate = { ...myCharObj, equippedSkill: mySkillId };
    } else {
      ACTIVE_ROSTER.enemyFront = { ...myCharObj, equippedSkill: mySkillId };
      ACTIVE_ROSTER.enemyBack = { ...mateCharObj, equippedSkill: mateSkillId };
    }
  }

  checkBothReadyToAccelerate();
}

function handleRemoteReady(data) {
  isMateReady = true;

if (NET.isHost) {
    if (NET.mode === 'COOP') {
      ACTIVE_ROSTER.mate = makeRemoteNetCard(data.p1, 'remote_guest');
    } else {
      ACTIVE_ROSTER.enemyFront = makeRemoteNetCard(data.p1, 'remote_guest');
      if (data.p2) {
        ACTIVE_ROSTER.enemyBack = makeRemoteNetCard(data.p2, 'remote_guest_mate');
      }
    }
  } else {
    if (NET.mode === 'COOP') {
      ACTIVE_ROSTER.user = makeRemoteNetCard(data.p1, 'remote_host');
    } else {
      ACTIVE_ROSTER.user = makeRemoteNetCard(data.p1, 'remote_host');
      if (data.p2) {
        ACTIVE_ROSTER.mate = makeRemoteNetCard(data.p2, 'remote_host_mate');
      }
    }
  }

  document.getElementById('net-prep-ready-status').innerText = '對手已準備完成！';
  document.getElementById('net-prep-ready-status').style.color = '#34d399';

  checkBothReadyToAccelerate();
}

function checkBothReadyToAccelerate() {
  if (isMyReady && isMateReady) {
    if (netPrepSeconds > 5) {
      netPrepSeconds = 5;
      const timerEl = document.getElementById('net-prep-timer');
      timerEl.innerText = `⏳ 雙方就緒！最後 5 秒...`;
      timerEl.style.color = '#facc15';
    }
  }
}

function showVenueRevealCurtain() {
  const curtain = document.getElementById('venue-reveal-curtain');
  if (!curtain) return;
  const targetId = (NET && NET.venueId) ? NET.venueId : currentVenueId;
  setCurrentVenue(targetId);
  if (typeof resetVenueIncidents==='function') resetVenueIncidents();
  const v = getCurrentVenue();
  const icon = document.getElementById('venue-reveal-icon');
  const name = document.getElementById('venue-reveal-name');
  const desc = document.getElementById('venue-reveal-desc');
  const kicker = document.getElementById('venue-reveal-kicker');
  curtain.style.display = 'flex';
  if (typeof playSound === 'function') playSound('venue_reveal');
  if (kicker) kicker.textContent = (NET && NET.venueChoice === 'random') ? 'RANDOM VENUE' : 'VENUE';
  if (icon) icon.textContent = v.icon;
  if (name) name.textContent = v.name;
  if (desc) desc.textContent = v.tagline;
  clearTimeout(window._venueRevealTimer);
  window._venueRevealTimer = setTimeout(() => { curtain.style.display = 'none'; }, 2100);
}

function finalizeNetStart(authoritativeVenueId = null, authoritativeVenueChoice = null) {
  clearInterval(netPrepTimer);
  // V37: 場地是 Host-authoritative match state，不是各端 UI state。
  if (NET.isHost) {
    NET.venueChoice = getHostVenueChoice();
    NET.venueId = resolveVenueChoice(NET.venueChoice); // random 只在 Host 這一刻抽一次
  } else if (authoritativeVenueId) {
    NET.venueId = authoritativeVenueId;
    NET.venueChoice = authoritativeVenueChoice || authoritativeVenueId;
  }
  setCurrentVenue(NET.venueId || 'stadium');
  showVenueRevealCurtain();
  document.getElementById('net-prep-modal').style.display = 'none';

  if (typeof allPlayers !== 'undefined') allPlayers.forEach(p => p.rebind(true));
  if (typeof resetMatchState === 'function') resetMatchState();
  isGameStarted = true; isPaused = false;

  if (NET.isHost) {
    if (NET.conn && NET.conn.open) NET.conn.send({ type:'START_MATCH', venueId:NET.venueId, venueChoice:NET.venueChoice, venueEventsEnabled:NET.venueEventsEnabled });
    ball.resetForServe('LEFT');
  }
}

// ========================================================
// 🌐 多人連線大廳控制器
// ========================================================
function openMultiplayerModal() {
  setTimeout(renderVenuePicker, 0);
  restoreActiveRosterFromSaved(false);
  isPracticeMode = false;
  isCareerMode = false;
  isLadderMode = false;
  document.getElementById('start-menu-modal').style.display = 'none';
  document.getElementById('multiplayer-modal').style.display = 'flex';
}

function closeMultiplayerModal() {
  if (typeof resetNetworkSessionIdentity === 'function') resetNetworkSessionIdentity(true);
  else { if (NET.peer) { NET.peer.destroy(); NET.peer = null; } NET.isMultiplayer = false; }
  restoreActiveRosterFromSaved(true);
  document.getElementById('multiplayer-modal').style.display = 'none';
  document.getElementById('start-menu-modal').style.display = 'flex';
}

let venuePickerIndex = 0;
const VENUE_PICKER_IDS = ['stadium','warehouse','moon','rooftop','rain','ice','ship','beach','factory','underground','random'];
function renderVenuePicker(){
  const id=VENUE_PICKER_IDS[venuePickerIndex];
  const v=id==='random'?{icon:'🎲',name:'隨機場地',tagline:'開賽才揭曉。先祈禱不要抽到你最不會打的。'}:(VENUE_DB.find(x=>x.id===id)||VENUE_DB[0]);
  const icon=document.getElementById('venue-card-icon'), name=document.getElementById('venue-card-name'), desc=document.getElementById('venue-card-desc');
  if(icon) icon.textContent=v.icon; if(name) name.textContent=v.name; if(desc) desc.textContent=v.tagline;
}
function cycleVenue(dir){
  venuePickerIndex=(venuePickerIndex+dir+VENUE_PICKER_IDS.length)%VENUE_PICKER_IDS.length; renderVenuePicker();
  // V37: 房主永遠是場地權威。即使建立房間後才改選項，也同步『選擇』；真正 random 結果只在開賽時由 Host 決定。
  if (typeof NET !== 'undefined' && NET.isMultiplayer && NET.isHost) {
    NET.venueChoice = getHostVenueChoice();
    if (NET.venueChoice !== 'random') NET.venueId = NET.venueChoice;
    if (NET.conn && NET.conn.open) NET.conn.send({type:'VENUE_CHOICE_SYNC', venueChoice:NET.venueChoice});
  }
}
function getHostVenueChoice(){ return VENUE_PICKER_IDS[venuePickerIndex] || 'stadium'; }

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
}

function startHosting() {
  if (typeof resetNetDebugForSession==='function') resetNetDebugForSession();
  const selectedMode = document.querySelector('input[name="netMode"]:checked').value;
  NET.mode = selectedMode;
  NET.isHost = true;
  NET.isMultiplayer = true;
  NET.mySlot = 0;
  NET.mateSlot = (selectedMode === 'COOP') ? 1 : 1;
  NET.myTeam = 'LEFT';
  NET.roomCode = generateRoomCode();
  const venueChoice = getHostVenueChoice();
  const resolvedVenueId = resolveVenueChoice(venueChoice);
  if (venueChoice !== 'random') setCurrentVenue(resolvedVenueId);
  venueEventsEnabled = !!document.getElementById('venue-events-toggle')?.checked;
  NET.venueChoice = venueChoice; NET.venueId = resolvedVenueId; NET.venueEventsEnabled = venueEventsEnabled;

  if (selectedMode === 'COOP') {
    const diffVal = parseInt(document.getElementById('pve-diff-select').value) || 5;
    NET.pveDifficulty = diffVal;
    
    const stage = CAREER_STAGES.find(s => s.id === diffVal) || CAREER_STAGES[4];
    ACTIVE_ROSTER.enemyFront = {
      id: `ai_f_${Date.now()}`, name: stage.front.name, tier: stage.front.tier,
      color: stage.front.color, level: diffVal * 3, stats: { ...stage.front.stats },
      equippedSkill: stage.front.equippedSkill, cosmetics: { hat: 'hat_none', face: 'face_none', effect: 'fx_none' }
    };
    ACTIVE_ROSTER.enemyBack = {
      id: `ai_b_${Date.now()}`, name: stage.back.name, tier: stage.back.tier,
      color: stage.back.color, level: diffVal * 3, stats: { ...stage.back.stats },
      equippedSkill: stage.back.equippedSkill, cosmetics: { hat: 'hat_none', face: 'face_none', effect: 'fx_none' }
    };
  }

  const customPeerId = `VB2026_${NET.roomCode}`;
  NET.peer = new Peer(customPeerId);

  NET.peer.on('open', () => {
    document.getElementById('host-code-display').style.display = 'block';
    document.getElementById('room-code-text').innerText = NET.roomCode;
  });

  NET.peer.on('connection', (conn) => {
    // V75-2.4: separate disposable world snapshots from reliable control/events.
    // A state flood must never queue in front of INPUT / skill events / PING.
    const channelKind = conn?.metadata?.channel || conn?.label || 'control-v1';
    if (channelKind === 'state-v1') {
      NET.stateConn = conn;
      setupStateConnection(conn);
      return;
    }

    NET.conn = conn;
    setupDataConnection(conn);
    conn.on('open', () => {
      conn.send({
        type: 'INIT_SYNC',
        matchId: (typeof NET_DIAG!=='undefined' ? (NET_DIAG.matchId==='-'?(NET_DIAG.matchId=netDiagNewMatchId()):NET_DIAG.matchId) : '-'),
        mode: NET.mode,
        diff: NET.pveDifficulty,
        venueChoice: NET.venueChoice, venueId: NET.venueId, venueEventsEnabled: NET.venueEventsEnabled,
        enemyFront: ACTIVE_ROSTER.enemyFront,
        enemyBack: ACTIVE_ROSTER.enemyBack
      });
      startNetPreparation();
    });
  });

  NET.peer.on('error', (err) => { alert('建立房間失敗: ' + err); });
}

function joinRoom() {
  if (typeof resetNetDebugForSession==='function') resetNetDebugForSession();
  const inputCode = document.getElementById('join-room-input').value.trim().toUpperCase();
  if (inputCode.length !== 6) {
    document.getElementById('join-status-text').innerText = '請輸入 6 碼代碼！';
    return;
  }
  document.getElementById('join-status-text').innerText = '連線中...';

  NET.isHost = false;
  NET.isMultiplayer = true;
  NET.roomCode = inputCode;
  NET.peer = new Peer();

  NET.peer.on('open', () => {
    const targetPeerId = `VB2026_${inputCode}`;

    // Reliable, low-volume channel: input edges, lobby/control, skill/SFX/VFX events, ping.
    const conn = NET.peer.connect(targetPeerId, {
      label: 'control-v1', metadata: { channel: 'control-v1' }, reliable: true, serialization: 'binary'
    });
    NET.conn = conn;
    setupDataConnection(conn);

    // Unreliable snapshot channel: old world states are disposable; newest seq always wins.
    // Keeping this separate prevents a state backlog from blocking Guest -> Host input.
    const stateConn = NET.peer.connect(targetPeerId, {
      label: 'state-v1', metadata: { channel: 'state-v1' }, reliable: false, serialization: 'binary'
    });
    NET.stateConn = stateConn;
    setupStateConnection(stateConn);
  });

  NET.peer.on('error', () => {
    document.getElementById('join-status-text').innerText = '找不到該房間代碼！';
  });
}

function setupStateConnection(conn = NET.stateConn) {
  if (!conn || conn._nsfStateSetup) return;
  conn._nsfStateSetup = true;
  const tuneBuffer = () => { try { if (conn.dataChannel) conn.dataChannel.bufferedAmountLowThreshold = 24 * 1024; } catch(e) {} };
  tuneBuffer();
  conn.on('open', tuneBuffer);
  conn.on('data', (data) => {
    if (typeof NET_DEBUG!=='undefined') NET_DEBUG.lastAnyRxAt = performance.now();
    if (data && data.type === 'STATE_SYNC') applyWorldSync(data);
  });
  conn.on('close', () => { if (NET.stateConn === conn) NET.stateConn = null; });
  conn.on('error', (err) => {
    if (typeof NET_DEBUG!=='undefined') { NET_DEBUG.sendErrors++; NET_DEBUG.lastConnError=String(err?.message||err||'state-channel'); }
  });
}

function setupDataConnection(conn = NET.conn) {
  if (!conn || conn._nsfControlSetup) return;
  conn._nsfControlSetup = true;
  conn.on('data', (data) => {
    if (typeof NET_DEBUG!=='undefined') { NET_DEBUG.lastAnyRxAt=performance.now(); if(data.type!=='STATE_SYNC') NET_DEBUG.eventRxCount++; }
    if (data.type === 'INIT_SYNC') {
      if(typeof NET_DIAG!=='undefined'){ NET_DIAG.matchId=data.matchId||NET_DIAG.matchId||'-'; NET_DIAG.role='GUEST'; NET_DIAG.startedAt=performance.now(); NET_DIAG.lastSampleAt=NET_DIAG.startedAt; }
      NET.mode = data.mode;
      NET.pveDifficulty = data.diff || 5;
      NET.venueChoice = data.venueChoice || data.venueId || 'stadium';
      NET.venueId = data.venueId || 'stadium';
      if (NET.venueChoice !== 'random') setCurrentVenue(NET.venueId);
      venueEventsEnabled = data.venueEventsEnabled !== false;
      NET.venueEventsEnabled = venueEventsEnabled;
      if (NET.mode === 'COOP') {
        NET.mySlot = 1; NET.mateSlot = 0; NET.myTeam = 'LEFT';
        if (data.enemyFront) ACTIVE_ROSTER.enemyFront = data.enemyFront;
        if (data.enemyBack) ACTIVE_ROSTER.enemyBack = data.enemyBack;
      } else {
        NET.mySlot = 2; NET.mateSlot = 3; NET.myTeam = 'RIGHT';
      }
      startNetPreparation();
    } else if (data.type === 'INPUT') {
      if(typeof NET_DIAG!=='undefined'&&!NET_DIAG.finalized) NET_DIAG.inputRxCount++;
      NET.remoteKeys = data.keys;
    } else if (data.type === 'STATE_SYNC') {
      applyWorldSync(data);
    } else if (data.type === 'CALLOUT_SYNC') {
      if(typeof consumeNetEvent!=='function' || consumeNetEvent(data.eventId)){ if(typeof pushCallout==='function') pushCallout(data.x,data.y,data.text,data.color,data.eventId,data.calloutMeta||null); else calloutPopups.push({ x: data.x, anchorX:data.x, baseY:data.y-28, y: data.y - 28, text: data.text, color: data.color, timer: 45, maxTimer: 45 }); }
    } else if (data.type === 'SFX_SYNC') {
      if ((typeof consumeNetEvent!=='function' || consumeNetEvent(data.eventId)) && typeof playSound === 'function') playSound(data.sfx, true);
    } else if (data.type === 'VENUE_SFX_SYNC') {
      if (typeof venueSfx === 'function') venueSfx(data.kind, true);
    } else if (data.type === 'SKILL_CAST_SYNC') {
      if(typeof consumeNetEvent!=='function' || consumeNetEvent(data.eventId)){
        lastCastSkillName = data.skillName || 'None';
        lastCastSkillCasterSlot = Number.isInteger(data.casterSlot) ? data.casterSlot : 0;
        lastCastFrame = gameFrame;
      }
    } else if (data.type === 'ENERGY_FULL_SYNC') {
      if(typeof consumeNetEvent!=='function' || consumeNetEvent(data.eventId)){ const p = allPlayers[Number(data.slotIndex)]; if (p) p.energyReadyFlash = Math.max(p.energyReadyFlash || 0, 52); }
    } else if (data.type === 'NET_HEALTH') {
      // V75-2.5: Host-side feedback for one-way STATE congestion.
      if (NET.isHost && typeof NET_DEBUG!=='undefined') {
        NET_DEBUG.remoteStateRx = Math.max(0, Number(data.stateRx)||0);
        NET_DEBUG.remoteStateAge = Math.max(0, Number(data.stateAge)||0);
        NET_DEBUG.remoteRtt = Math.max(0, Number(data.rtt)||0);
      }
    } else if (data.type === 'PING') {
      if (conn && conn.open) conn.send({type:'PONG', t:data.t});
    } else if (data.type === 'PONG') {
      if (typeof NET_DEBUG !== 'undefined') NET_DEBUG.rtt = Math.max(0, performance.now() - data.t);
    } else if (data.type === 'MANGA_SHOUT_SYNC') {
      if (typeof triggerMangaShout === 'function') {
        triggerMangaShout(data.speaker, data.text, data.sub, data.color);
      }
    } else if (data.type === 'SAVAGE_ROAR_FX_SYNC') {
      if(typeof consumeNetEvent!=='function' || consumeNetEvent(data.eventId)){
        const p=allPlayers[Number(data.slotIndex)];
        if(p) p.roarVfxTimer=Math.max(p.roarVfxTimer||0,24);
        if(typeof createRoarWave==='function') createRoarWave(Number(data.x)||0,Number(data.y)||0);
        if(typeof triggerScreenShake==='function') triggerScreenShake(12,18);
      }
} else if (data.type === 'ROLLING_THUNDER_FX_SYNC') {
      const p = allPlayers[data.slotIndex];
      if (p && data.from) {
        p.ghostTrail.push({ ...data.from, alpha: 1.0, teleport: true });
        p.ghostTrail.push({ ...data.from, alpha: 0.78, teleport: true, flickerOffset: 2 });
      }
      if (data.to) {
        createShockwave(data.to.x, data.to.y - (p ? p.radius : 24), '#38bdf8');
        createImpactSparks(data.to.x, data.to.y - (p ? p.radius : 24), 18, '#10b981');
      }
      playSound('teleport');
} else if (data.type === 'IRON_WALL_END') {
      if (typeof resetIronWallCamera === 'function') resetIronWallCamera('net-end');
} else if (data.type === 'IRON_WALL_SYNC') {
      // 🌟 1. 訪客端完全對齊房主：停頓、音效、震屏、必殺標籤
      hitStopFrames = 90;
      ball.isIronWallSlam = true;
      playSound('block_roof');
      triggerScreenShake(18, 22);

      // 🌟 2. 訪客鏡頭 1.6 倍特寫定格
      if (typeof camera !== 'undefined') {
        camera.targetX = data.x - (VIEW_W / 2);
        camera.targetY = data.y - (VIEW_H / 2);
        camera.x = camera.targetX;
        camera.y = camera.targetY;
        camera.zoom = 1.6;
        camera.targetZoom = 1.6;
      }

      // 🌟 3. 網頂手型碰撞點：衝擊波 + 35 顆火花（與房主數值 1:1 相同）
      createShockwave(data.x, data.y, '#fbbf24');
      createImpactSparks(data.x, data.y, 35, '#fbbf24');
      pushCallout(data.x, data.y - 30, '銅牆鐵壁 (IRON WALL)!!', '#fbbf24');

      // 🌟 4. 訪客端全體球員附加硬直凍結（不准走位）
      allPlayers.forEach(pl => {
        pl.stunTimer = 110;
        pl.reactionTimer = 110;
        pl.vx = 0;
      });
                
  } else if (data.type === 'VFX_SYNC') {
      // 🌟 讓訪客同步生成火花、震波與粒子
      if (typeof visualEffects !== 'undefined') {
        visualEffects.push(data.effect);
      }
    } else if (data.type === 'BIRD_KILL_FX') {
      if(typeof createImpactSparks==='function'){createImpactSparks(data.x,data.y,18,'#ef4444');createImpactSparks(data.x,data.y,10,'#fca5a5');} if(typeof venueSfx==='function')venueSfx('bird_dead');
    } else if (data.type === 'ACHIEVEMENT_UNLOCK') {
      if (data.targetSlot === NET.mySlot && typeof unlockAchievementLocal === 'function') unlockAchievementLocal(data.achievementId);
    } else if (data.type === 'COIN_REWARD_SYNC') {
      // 🌟 房主發送獎勵給訪客
      if (data.targetSlot === NET.mySlot && typeof addCoins === 'function') {
        addCoins(data.amount, data.desc, data.x, data.y);
      }
    
} else if (data.type === 'SERVE_START_SYNC') {
      if (typeof serveState !== 'undefined') {
        serveState.active = true;
        serveState.tossed = false;
        serveState.charging = false;
        serveState.chargePower = 0;
        if (typeof resetServeRuleClock === 'function') resetServeRuleClock();
        if (allPlayers[data.serverSlot]) {
          serveState.currentServer = allPlayers[data.serverSlot];
        }
      }
      if (typeof match !== 'undefined') {
        match.currentServingTeam = data.servingTeam;
        match.inServeRally = true;
      }
    } else if (data.type === 'HALO_SYNC') {
      const targetP = allPlayers[data.slotIndex];
      if (targetP && typeof haloEffects !== 'undefined') {
        haloEffects.push({
          player: targetP,
          color: data.color,
          r: targetP.radius * 0.8,
          maxR: targetP.radius * (data.isTimingThreeState ? 2.4 : 1.8),
          alpha: 1.0,
          isTimingThreeState: data.isTimingThreeState,
          life: data.isTimingThreeState ? 20 : 16,
          maxLife: data.isTimingThreeState ? 20 : 16
        });
      }
    } else if (data.type === 'LOBBY_SELECT_UPDATE') {
      handleRemoteLobbyUpdate(data);
    } else if (data.type === 'READY_CHECK') {
      handleRemoteReady(data);
    } else if (data.type === 'VENUE_CHOICE_SYNC') {
      // 只同步房主目前選到哪一張；random 的實際結果仍不在開賽前揭露。
      if (!NET.isHost) NET.venueChoice = data.venueChoice || 'stadium';
    } else if (data.type === 'START_MATCH') {
      if (!NET.isHost) {
        NET.venueId = data.venueId || 'stadium';
        NET.venueChoice = data.venueChoice || NET.venueId;
        NET.venueEventsEnabled = data.venueEventsEnabled !== false;
        venueEventsEnabled = NET.venueEventsEnabled;
        setCurrentVenue(NET.venueId);
        finalizeNetStart(NET.venueId, NET.venueChoice);
      }
    } else if (data.type === 'MATCH_SETTLEMENT') {
      proMatchStats = data.stats;
      score = data.score;
      openSettlement(data.winnerSide);
    } else if (data.type === 'REMATCH_REQUEST') {
      // V25：只記錄對方想再戰；雙方都按下後才一起進準備室。
      NET.remoteRematchRequested = true;
      tryStartNetRematch();
    } else if (data.type === 'REMATCH_PREP') {
      // 舊版封包相容：不再允許單方面強制把另一端拖進準備室。
      NET.remoteRematchRequested = true;
      tryStartNetRematch();
    } else if (data.type === 'PEER_QUIT') {
      NET.intentionalDisconnect = true;
      if (netPrepTimer) clearInterval(netPrepTimer);
      alert('⚠️ 對手已返回主選單，本次連線已結束。');
      location.reload();
    }
  });

  NET.conn.on('error', (err) => { if(typeof NET_DEBUG!=='undefined') NET_DEBUG.lastConnError=String(err?.message||err||'conn-error'); console.warn('[NET CONN ERROR]',err); });
  NET.conn.on('close', () => {
    if (typeof NET_DEBUG!=='undefined') NET_DEBUG.lastConnError='closed';
    if (netPrepTimer) clearInterval(netPrepTimer);
    if (NET.intentionalDisconnect) return;
    alert('⚠️ 與對手的連線已中斷！正在返回主選單...');
    location.reload();
  });
}

// ========================================================
// 🪞 試衣化妝間
// ========================================================
let wbSelectedCharId = 'c1', wbCategory = 'hats', wbPage = 0;

function openWardrobeModal() {
  document.getElementById('start-menu-modal').style.display = 'none';
  document.getElementById('wardrobe-modal').style.display = 'flex';

  const sel = document.getElementById('wb-char-select');
  sel.innerHTML = '';
  // V27：試衣間角色依稀有度→等級降冪。
  const wardrobeChars = sortCharactersForSelect(INVENTORY);
  wardrobeChars.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.innerText = `[${c.tier}] ${c.name} (Lv.${c.level})`;
    if (c.id === wbSelectedCharId) opt.selected = true;
    sel.appendChild(opt);
  });

  renderWardrobeUI();
  runWardrobePreviewLoop();
}

function onWardrobeCharChange(charId) {
  wbSelectedCharId = charId;
  renderWardrobeUI();
}

function closeWardrobeModal() {
  document.getElementById('wardrobe-modal').style.display = 'none';
  document.getElementById('start-menu-modal').style.display = 'flex';
  if (typeof allPlayers !== 'undefined') allPlayers.forEach(p => p.rebind(true));
  saveGameData();
}

function switchWardrobeCategory(cat) {
  wbCategory = cat;
  wbPage = 0;
  document.getElementById('wb-tab-hats').className = `btn-sound ${cat === 'hats' ? 'active' : ''}`;
  document.getElementById('wb-tab-faces').className = `btn-sound ${cat === 'faces' ? 'active' : ''}`;
  document.getElementById('wb-tab-effects').className = `btn-sound ${cat === 'effects' ? 'active' : ''}`;
  renderWardrobeUI();
}

function changeWardrobePage(delta) {
  const list = COSMETICS_DB[wbCategory];
  const maxPages = Math.ceil(list.length / 9);
  wbPage = Math.max(0, Math.min(maxPages - 1, wbPage + delta));
  renderWardrobeUI();
}

function renderWardrobeUI() {
  const currentCard = INVENTORY.find(c => c.id === wbSelectedCharId) || INVENTORY[0];
  if (!currentCard.cosmetics) currentCard.cosmetics = { hat: 'hat_none', face: 'face_none', effect: 'fx_none' };

  document.getElementById('wardrobe-char-name').innerText = currentCard.name;
  
  const hatName = (COSMETICS_DB.hats.find(h => h.id === currentCard.cosmetics.hat) || {}).name || '無';
  const faceName = (COSMETICS_DB.faces.find(f => f.id === currentCard.cosmetics.face) || {}).name || '無';
  const fxName = (COSMETICS_DB.effects.find(e => e.id === currentCard.cosmetics.effect) || {}).name || '無';
  document.getElementById('wardrobe-char-desc').innerText = `頭飾: ${hatName} | 臉飾: ${faceName} | 光效: ${fxName}`;

  const list = COSMETICS_DB[wbCategory];
  const maxPages = Math.ceil(list.length / 9);
  document.getElementById('wardrobe-page-num').innerText = `第 ${wbPage + 1} / ${maxPages} 頁`;

  const grid = document.getElementById('wardrobe-items-grid');
  grid.innerHTML = '';

  const pageItems = list.slice(wbPage * 9, (wbPage + 1) * 9);
  const unlockedList = UNLOCKED_COSMETICS[wbCategory] || [];

  pageItems.forEach(item => {
    const isNone = item.id.endsWith('_none');
    const isUnlocked = isNone || unlockedList.includes(item.id);
    const catSingular = wbCategory === 'hats' ? 'hat' : (wbCategory === 'faces' ? 'face' : 'effect');
    const isEquipped = currentCard.cosmetics[catSingular] === item.id;

    const box = document.createElement('div');
    box.style.cssText = `
      background: ${isUnlocked ? (isEquipped ? '#312e81' : '#18153d') : '#0f172a'};
      border: 2px solid ${isEquipped ? '#facc15' : (isUnlocked ? '#6366f1' : '#334155')};
      border-radius: 12px; padding: 10px; display: flex; flex-direction: column;
      align-items: center; justify-content: space-between; text-align: center;
      opacity: ${isUnlocked ? 1.0 : 0.45}; cursor: ${isUnlocked ? 'pointer' : 'not-allowed'};
      box-shadow: ${isEquipped ? '0 0 15px rgba(250, 204, 21, 0.4)' : 'none'};
    `;

    box.innerHTML = `
      <div style="font-size: 13px; font-weight: bold; color: ${isEquipped ? '#facc15' : '#fff'};">${item.name}</div>
      <div class="wardrobe-icon-mount"></div>
      <p style="font-size: 10px; color: #a5b4fc; margin: 2px 0 4px; line-height: 1.2; min-height:24px;">${(!isUnlocked && item.source === 'achievement' && item.hint) ? item.hint : item.desc}</p>
      <span style="font-size: 10px; font-weight: 800; color: ${isUnlocked ? (isEquipped ? '#10b981' : '#38bdf8') : '#ef4444'};">
        ${isUnlocked ? (isEquipped ? '✓ 已穿戴' : '點擊換裝') : (item.source === 'achievement' ? '🏆 成就取得' : '🔒 未獲得')}
      </span>
    `;
    const iconMount=box.querySelector('.wardrobe-icon-mount');
    if(iconMount){
      if(wbCategory==='hats' || wbCategory==='faces'){
        const iconItem={...item,category:wbCategory};
        if(isNone){
          iconMount.innerHTML='<div style="width:56px;height:56px;border:2px dashed #475569;border-radius:50%;display:grid;place-items:center;color:#64748b;font-size:11px">NONE</div>';
        }else{
          iconMount.appendChild(createCosmeticIconCanvas(iconItem,58));
        }
      }else{
        const glow=item.glow||'#818cf8';
        iconMount.innerHTML=`<div style="width:56px;height:56px;border-radius:50%;border:2px solid ${glow};box-shadow:0 0 18px ${glow}66;background:radial-gradient(circle,${glow}66 0%,#0f172a 70%);display:grid;place-items:center;color:#e2e8f0;font-size:10px;font-weight:900">FX</div>`;
      }
      if(!isUnlocked) iconMount.style.filter='grayscale(1) brightness(.55)';
    }

    if (isUnlocked) {
      box.onclick = () => {
        currentCard.cosmetics[catSingular] = item.id;
        renderWardrobeUI();
      };
    }
    grid.appendChild(box);
  });
}

function unequipAllWardrobe() {
  const currentCard = INVENTORY.find(c => c.id === wbSelectedCharId) || INVENTORY[0];
  currentCard.cosmetics = { hat: 'hat_none', face: 'face_none', effect: 'fx_none' };
  renderWardrobeUI();
}

function runWardrobePreviewLoop() {
  const cvs = document.getElementById('wardrobe-preview-canvas');
  if (!cvs || document.getElementById('wardrobe-modal').style.display !== 'flex') return;
  const pCtx = cvs.getContext('2d');
  pCtx.clearRect(0, 0, cvs.width, cvs.height);

  const card = INVENTORY.find(c => c.id === wbSelectedCharId) || INVENTORY[0];
  const dummyPlayer = {
    x: 110, y: 160, radius: 36, color: card.color,
    facing: 1, squashX: 1, squashY: 1, isDiving: false, isBlocking: false,
    card: card
  };

  drawPlayerEntity(dummyPlayer, pCtx);
  requestAnimationFrame(runWardrobePreviewLoop);
}

// ========================================================
// 🎰 轉蛋專區 (GACHA ARCADE) & 防手殘確認邏輯
// ========================================================
window.pendingGachaAction = null;

window.openGachaArcade = function() {
  document.getElementById('start-menu-modal').style.display = 'none';
  document.getElementById('gacha-arcade-modal').style.display = 'flex';
  const cd = document.getElementById('arcade-coin-display');
  if (cd) cd.innerText = userCoins;
};

window.closeGachaArcade = function() {
  document.getElementById('gacha-arcade-modal').style.display = 'none';
  document.getElementById('start-menu-modal').style.display = 'flex';
  saveGameData();
};

window.openGachaArcadeFromWardrobe = function() {
  document.getElementById('wardrobe-modal').style.display = 'none';
  window.openGachaArcade();
};

window.showGachaNotice = function(title, message, tone = 'info') {
  const modal = document.getElementById('gacha-notice-modal');
  const titleEl = document.getElementById('gacha-notice-title');
  const textEl = document.getElementById('gacha-notice-text');
  if (!modal || !titleEl || !textEl) return;
  const palette = {
    warning: { border: '#f59e0b', title: '#facc15' },
    success: { border: '#34d399', title: '#6ee7b7' },
    info: { border: '#38bdf8', title: '#7dd3fc' }
  };
  const c = palette[tone] || palette.info;
  const box = modal.firstElementChild;
  if (box) box.style.borderColor = c.border;
  titleEl.style.color = c.title;
  titleEl.textContent = title || '📣 轉蛋提示';
  textEl.textContent = message || '';
  modal.style.display = 'flex';
};
window.closeGachaNotice = function() {
  const modal = document.getElementById('gacha-notice-modal');
  if (modal) modal.style.display = 'none';
};

function getGachaAvailability(type) {
  if (type === 'skill') {
    const available = SKILL_POOL.filter(sk => !UNLOCKED_SKILLS.includes(sk.id));
    return { count: available.length, emptyMessage: '⚡ 所有戰術技能皆已領悟研習完畢！' };
  }
  if (type === 'cosmetic') {
    let count = 0;
    ['hats', 'faces'].forEach(cat => {
      COSMETICS_DB[cat].forEach(item => {
        if (!item.id.endsWith('_none') && item.source !== 'achievement' && !UNLOCKED_COSMETICS[cat].includes(item.id)) count++;
      });
    });
    return { count, emptyMessage: '🎉 恭喜！服裝獎池已全數抽空，所有可抽帽子與臉飾皆已解鎖！' };
  }
  return { count: Infinity, emptyMessage: '' };
}

window.promptConfirmGacha = function(type, isTen, cost) {
  if (userCoins < cost) {
    window.showGachaNotice('🪙 金幣不足', `本次抽取需要 ${cost} 排球金幣。\n目前持有 ${userCoins} 金幣。`, 'warning');
    return;
  }
  const availability = getGachaAvailability(type);
  if (availability.count <= 0) {
    window.showGachaNotice('✅ 獎池已完成', availability.emptyMessage, 'success');
    return;
  }
  const typeLabels = { cosmetic: '時尚轉蛋', player: '角色轉蛋', skill: '技能轉蛋', equip: '裝備轉蛋' };
  window.pendingGachaAction = { type, isTen, cost };
  
  const textEl = document.getElementById('confirm-gacha-text');
  if (textEl) {
    textEl.innerText = `確定要花費 ${cost} 排球金幣，進行【${typeLabels[type] || '轉蛋'}】${isTen ? '十抽' : '單抽'} 嗎？`;
  }
  const modal = document.getElementById('confirm-gacha-modal');
  if (modal) modal.style.display = 'flex';
};

window.closeConfirmGacha = function() {
  const modal = document.getElementById('confirm-gacha-modal');
  if (modal) modal.style.display = 'none';
  window.pendingGachaAction = null;
};

window.executeConfirmedGacha = function() {
  if (!window.pendingGachaAction) return;
  const { type, isTen } = window.pendingGachaAction;
  window.closeConfirmGacha();

  if (type === 'equip') {
    triggerEquipGacha(isTen);
  } else if (type === 'player') {
    triggerGacha(isTen);
  } else if (type === 'cosmetic') {
    triggerCosmeticGacha(isTen);
  } else if (type === 'skill') {
    triggerSkillGacha(isTen);
  }
};

function rollSingleCard() {
  const rand = Math.random();
  let targetTier = 'N';
  if (rand < 0.05) targetTier = 'SSR';
  else if (rand < 0.25) targetTier = 'SR';
  else if (rand < 0.70) targetTier = 'R';

  let poolCandidates = GACHA_POOL.filter(c => c.tier === targetTier);
  if (poolCandidates.length === 0) poolCandidates = GACHA_POOL;
  const template = poolCandidates[Math.floor(Math.random() * poolCandidates.length)];
  const existingCard = INVENTORY.find(c => c.name === template.name);
  let isDup = false, resultMsg = '';

  if (existingCard) {
    isDup = true;
    if (existingCard.level < 20) {
      existingCard.exp += 350;
      let reqExp = getRequiredExp(existingCard.level);
      let upCount = 0;
      while (existingCard.exp >= reqExp && existingCard.level < 20) {
        existingCard.exp -= reqExp; existingCard.level++; existingCard.freePts += 5; upCount++;
        reqExp = getRequiredExp(existingCard.level);
      }
      resultMsg = `+350 EXP ${upCount > 0 ? `(升至 Lv.${existingCard.level}!)` : ''}`;
    } else {
      existingCard.freePts += 3; resultMsg = `神髓精煉 +3 AP!`;
    }
  } else {
    const newCard = {
      id: 'c_' + Date.now() + '_' + Math.floor(Math.random()*1000),
      name: template.name, tier: template.tier, color: template.color, level: 1, exp: 0,
      freePts: 5 + template.bonusPts, baseStats: { ...template.base }, stats: { ...template.base },
      equippedSkill: 'sk_breaker', cosmetics: { hat: 'hat_none', face: 'face_none', effect: 'fx_none' },
      equipSlotA: null, equipSlotB: null
    };
    INVENTORY.push(newCard); resultMsg = '🎉 新球員加入！';
  }
  return { template, isDup, resultMsg };
}

function triggerGacha(isTen = false) {
  const cost = isTen ? 900 : 100;
  if (userCoins < cost) { window.showGachaNotice('🪙 金幣不足', `本次抽取需要 ${cost} 排球金幣。\n目前持有 ${userCoins} 金幣。`, 'warning'); return; }
  userCoins -= cost;
  updateCoinHUD();

  const spinner = document.getElementById('gacha-spinner-modal');
  const spinnerMsg = document.getElementById('spinner-msg');
  if (spinner) {
    if (spinnerMsg) spinnerMsg.innerText = isTen ? '🎰 十連球探招募中...' : '🎰 球探招募中...';
    spinner.style.display = 'flex';
  }
  playSound('coin');

  setTimeout(() => {
    if (spinner) spinner.style.display = 'none';
    if (!isTen) {
      const result = rollSingleCard();
      saveGameData();

      const dupBadge = document.getElementById('gacha-dup-badge');
      const rewardMsg = document.getElementById('gacha-reward-msg');
      if (dupBadge) {
        if (result.isDup) {
          dupBadge.style.display = 'block';
          dupBadge.innerText = '重複突破';
          if (rewardMsg) rewardMsg.innerText = `🔄 ${result.resultMsg}`;
        } else {
          dupBadge.style.display = 'none';
          if (rewardMsg) rewardMsg.innerText = result.resultMsg;
        }
      }

      const ava = document.getElementById('gacha-avatar');
      if (ava) ava.style.backgroundColor = result.template.color;

      const tierEl = document.getElementById('gacha-tier');
      if (tierEl) {
        tierEl.innerText = result.template.tier;
        tierEl.style.color = result.template.tier === 'SSR' ? '#facc15' : (result.template.tier === 'SR' ? '#c084fc' : (result.template.tier === 'R' ? '#f97316' : '#94a3b8'));
      }

      const nameEl = document.getElementById('gacha-name');
      if (nameEl) nameEl.innerText = result.template.name;

      const stageEl = document.getElementById('gacha-card-stage');
      if (stageEl) {
        stageEl.className = result.template.tier.toLowerCase();
        stageEl.style.animation = 'none';
        stageEl.offsetHeight;
        stageEl.style.animation = '';
      }

      const featEl = document.getElementById('gacha-feature');
      if (featEl) featEl.innerText = result.template.desc;

      const animModal = document.getElementById('gacha-anim-modal');
      if (animModal) animModal.style.display = 'flex';
      else window.showGachaNotice('🎉 招募完成', `成功抽得：[${result.template.tier}] ${result.template.name}！已收入名冊更衣室。`, 'success');
    } else {
      const results = [];
      for (let i = 0; i < 10; i++) results.push(rollSingleCard());
      saveGameData();

      const grid = document.getElementById('ten-gacha-grid');
      if (grid) {
        grid.innerHTML = '';
        grid.style.display = 'grid';
        grid.style.gridTemplateColumns = 'repeat(5, 1fr)';
        grid.style.gap = '14px';
        grid.style.margin = '18px 0';

        results.forEach(res => {
          const tier = res.template.tier;
          const tierLower = tier.toLowerCase();
          const item = document.createElement('div');
          item.className = `ten-card-slot ${tierLower}`;
          
          let tierColor = '#94a3b8';
          if (tier === 'SSR') tierColor = '#facc15';
          else if (tier === 'SR') tierColor = '#c084fc';
          else if (tier === 'R') tierColor = '#38bdf8';

          item.innerHTML = `
            <div style="width: 52px; height: 52px; border-radius: 50%; background: ${res.template.color}; border: 2.5px solid #fff; margin-bottom: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.5);"></div>
            <strong style="font-size: 13px; font-weight: 900; color: ${tierColor}; letter-spacing: 0.5px;">[${tier}] ${res.template.name}</strong>
            <span style="font-size: 10px; color: ${res.isDup ? '#f97316' : '#10b981'}; margin-top: 4px; font-weight: bold;">${res.resultMsg}</span>
          `;
          grid.appendChild(item);
        });
      }

      const tenModal = document.getElementById('gacha-ten-modal');
      if (tenModal) tenModal.style.display = 'flex';
      else window.showGachaNotice('🎉 十連完成', '新角色與突破 EXP 已全數存入更衣室名冊。', 'success');
    }
  }, 400);
}

// 裝備轉蛋核心
function rollSingleEquipment() {
  const rand = Math.random();
  let targetTier = 'R';
  if (rand < 0.05) targetTier = 'SSR';
  else if (rand < 0.30) targetTier = 'SR';

  const pool = EQUIP_DB.filter(e => e.tier === targetTier);
  const pickedTemplate = pool[Math.floor(Math.random() * pool.length)];
  const newInst = generateEquipmentInstance(pickedTemplate.id);
  INVENTORY_EQUIPS.push(newInst);
  return newInst;
}

function triggerEquipGacha(isTen = false) {
  const cost = isTen ? 1350 : 150;
  if (userCoins < cost) { window.showGachaNotice('🪙 金幣不足', `本次抽取需要 ${cost} 排球金幣。\n目前持有 ${userCoins} 金幣。`, 'warning'); return; }
  userCoins -= cost;
  updateCoinHUD();

  playSound('coin');
  const results = [];
  const count = isTen ? 10 : 1;
  for (let i = 0; i < count; i++) {
    results.push(rollSingleEquipment());
  }
  saveGameData();

  showItemGachaResults('equip', results, isTen ? '裝備十連成果' : '裝備抽取成果');
  renderLocker();
}

function updateCoinHUD() {
  const cd = document.getElementById('coin-display');
  if (cd) cd.innerText = userCoins;
  const acd = document.getElementById('arcade-coin-display');
  if (acd) acd.innerText = userCoins;
}

function closeGachaAnim() { document.getElementById('gacha-anim-modal').style.display = 'none'; }
function closeTenGachaModal() { document.getElementById('gacha-ten-modal').style.display = 'none'; }

function openCareerMenu() {
  if (typeof resetNetworkSessionIdentity === 'function') resetNetworkSessionIdentity(true);
  isCareerMode = true;
  document.getElementById('start-menu-modal').style.display = 'none';
  document.getElementById('career-modal').style.display = 'flex';
  renderCareerStages();
}

function closeCareerMenu() {
  document.getElementById('career-modal').style.display = 'none';
  document.getElementById('start-menu-modal').style.display = 'flex';
}

function renderCareerStages() {
  const grid = document.getElementById('career-stages-grid');
  if (!grid) return;
  grid.innerHTML = '';

  CAREER_STAGES.forEach(stage => {
    const isUnlocked = stage.id <= careerProgress;
    const isCurrent = stage.id === currentCareerStage;
    const skinRewardObj = stage.rewardSkin ? COSMETICS_DB.effects.find(e => e.id === stage.rewardSkin) : null;
    const item = document.createElement('div');
    item.style.cssText = `
      background: ${isUnlocked ? '#18153d' : '#0f172a'};
      border: 2px solid ${isCurrent ? '#facc15' : (isUnlocked ? stage.color : '#334155')};
      border-radius: 14px; padding: 14px; display: flex; flex-direction: column;
      align-items: center; text-align: center; position: relative;
      opacity: ${isUnlocked ? 1.0 : 0.45};
      box-shadow: ${isCurrent ? '0 0 20px rgba(250, 204, 21, 0.4)' : 'none'};
    `;

    item.innerHTML = `
      <div style="font-size: 11px; font-weight: 900; color: ${stage.color}; margin-bottom: 4px;">STAGE 0${stage.id}</div>
      <h3 style="font-size: 14px; font-weight: bold; color: #fff; margin-bottom: 2px;">${stage.name}</h3>
      <span style="font-size: 10px; color: #cbd5e1; margin-bottom: 8px;">${stage.subtitle}</span>
      <div style="display: flex; gap: 6px; margin: 8px 0;">
        <div style="width: 28px; height: 28px; border-radius: 50%; background: ${stage.front.color}; border: 1.5px solid #fff;" title="${stage.front.name}"></div>
        <div style="width: 28px; height: 28px; border-radius: 50%; background: ${stage.back.color}; border: 1.5px solid #fff;" title="${stage.back.name}"></div>
      </div>
      <p style="font-size: 10px; color: #94a3b8; line-height: 1.3; min-height: 38px; margin-bottom: 8px;">${stage.desc}</p>
      <div style="font-size: 11px; color: #facc15; font-weight: bold;">🪙 獎勵: +${stage.rewardCoins} 幣</div>
      <div style="font-size: 10px; color: #f472b6; font-weight: bold; margin-bottom: 10px;">${skinRewardObj ? `✨ 光效:【${skinRewardObj.name}】` : '✨ (無限定光效)'}</div>
      <button class="btn-action" style="width: 100%; padding: 6px 0; font-size: 11px; ${isUnlocked ? '' : 'background: #334155; border-color: #475569; cursor: not-allowed;'}" 
        ${isUnlocked ? `onclick="startCareerMatch(${stage.id})"` : 'disabled'}>
        ${isUnlocked ? (stage.id < careerProgress ? '⚔️ 再次挑戰' : '⚔️ 開戰') : '🔒 尚未解鎖'}
      </button>
    `;
    grid.appendChild(item);
  });
}

function startCareerMatch(stageId) {
  if (typeof resetNetworkSessionIdentity === 'function') resetNetworkSessionIdentity(true);
  currentCareerStage = stageId;
  const careerVenuePlan = ['stadium','stadium','warehouse','moon','warehouse'];
  setCurrentVenue(careerVenuePlan[Math.max(0, Math.min(careerVenuePlan.length-1, stageId-1))]);
  venueEventsEnabled = true; // V57: 正式模式也持續抽取合法場地事件
  const stage = CAREER_STAGES.find(s => s.id === stageId);
  if (!stage) return;

  restoreActiveRosterFromSaved(false);
  isPracticeMode = false;
  isLadderMode = false;
  isCareerMode = true;

  ACTIVE_ROSTER.enemyFront = {
    id: `enemy_f_${stage.id}`,
    name: stage.front.name,
    tier: stage.front.tier,
    color: stage.front.color,
    level: stage.id * 3,
    stats: { ...stage.front.stats },
    equippedSkill: stage.front.equippedSkill,
    cosmetics: { hat: 'hat_none', face: 'face_none', effect: 'fx_none' }
  };

  ACTIVE_ROSTER.enemyBack = {
    id: `enemy_b_${stage.id}`,
    name: stage.back.name,
    tier: stage.back.tier,
    color: stage.back.color,
    level: stage.id * 3,
    stats: { ...stage.back.stats },
    equippedSkill: stage.back.equippedSkill,
    cosmetics: { hat: 'hat_none', face: 'face_none', effect: 'fx_none' }
  };

  if (typeof allPlayers !== 'undefined') {
    allPlayers.forEach(p => p.rebind(true));
  }

  document.getElementById('career-modal').style.display = 'none';
  isGameStarted = true;
  isPaused = false;
  if (typeof resetMatchState === 'function') resetMatchState();
  ball.resetForServe('LEFT');
}

// V31：時裝來源分流。一般搞笑配件進時尚轉蛋；場地／模式紀念品只由成就授予。
function unlockCosmeticReward(category, itemId, reason = '') {
  if (!COSMETICS_DB[category] || !UNLOCKED_COSMETICS[category]) return false;
  const item = COSMETICS_DB[category].find(x => x.id === itemId);
  if (!item || UNLOCKED_COSMETICS[category].includes(itemId)) return false;
  UNLOCKED_COSMETICS[category].push(itemId);
  saveGameData();
  const catName = category === 'hats' ? '頭飾' : (category === 'faces' ? '臉飾' : '光效');
  alert(`🏆 解鎖紀念時裝！\n[${catName}] ${item.name}${reason ? `\n${reason}` : ''}`);
  return true;
}

// 場地事件完成後由 Host／單機權威端呼叫。鳥群真正上線時只需把最後觸球者送進這裡。
function awardBirdHitCosmetic(lastTouchPlayer) {
  if (!lastTouchPlayer || !lastTouchPlayer.isUser) return false;
  return unlockCosmeticReward('hats', 'hat_bird_perch', '最後觸球者擊中海鳥。');
}

function awardBirdScoreCosmetic(lastTouchPlayer) {
  if (!lastTouchPlayer || !lastTouchPlayer.isUser) return false;
  return unlockCosmeticReward('effects', 'fx_feathers', '撞擊鳥群後，該球仍由你方得分。');
}

function triggerCosmeticGacha(isTen = false) {
  const cost = isTen ? 450 : 50;
  if (userCoins < cost) { window.showGachaNotice('🪙 金幣不足', `本次抽取需要 ${cost} 排球金幣。\n目前持有 ${userCoins} 金幣。`, 'warning'); return; }

  const availablePool = [];
  ['hats', 'faces'].forEach(cat => {
    COSMETICS_DB[cat].forEach(item => {
      if (!item.id.endsWith('_none') && item.source !== 'achievement' && !UNLOCKED_COSMETICS[cat].includes(item.id)) {
        availablePool.push({ ...item, category: cat });
      }
    });
  });

  if (availablePool.length === 0) {
    window.showGachaNotice('✅ 時裝獎池已完成', '🎉 恭喜！服裝獎池已全數抽空，所有可抽帽子與臉飾皆已解鎖！', 'success');
    return;
  }

  userCoins -= cost;
  updateCoinHUD();

  const pullCount = isTen ? Math.min(10, availablePool.length) : 1;
  const pulledItems = [];

  for (let i = 0; i < pullCount; i++) {
    const idx = Math.floor(Math.random() * availablePool.length);
    const item = availablePool.splice(idx, 1)[0];
    UNLOCKED_COSMETICS[item.category].push(item.id);
    pulledItems.push(item);
  }

  saveGameData();
  playSound('coin');
  showItemGachaResults('cosmetic', pulledItems, isTen ? '時裝十連成果' : '時裝抽取成果');
}

function triggerSkillGacha(isTen = false) {
  const cost = isTen ? 2350 : 250;
  if (userCoins < cost) { window.showGachaNotice('🪙 金幣不足', `本次抽取需要 ${cost} 排球金幣。\n目前持有 ${userCoins} 金幣。`, 'warning'); return; }

  const availableSkills = SKILL_POOL.filter(sk => !UNLOCKED_SKILLS.includes(sk.id));
  if (availableSkills.length === 0) {
    window.showGachaNotice('✅ 技能研習完成', '⚡ 所有戰術技能皆已領悟研習完畢！', 'success');
    return;
  }

  userCoins -= cost;
  updateCoinHUD();

  const pullCount = isTen ? Math.min(10, availableSkills.length) : 1;
  const results = [];

  for (let i = 0; i < pullCount; i++) {
    const idx = Math.floor(Math.random() * availableSkills.length);
    const sk = availableSkills.splice(idx, 1)[0];
    UNLOCKED_SKILLS.push(sk.id);
    results.push(sk);
  }

  saveGameData();
  playSound('perfect_spike');
  showItemGachaResults('skill', results, isTen ? '技能十連成果' : '技能抽取成果');
}


function createCosmeticIconCanvas(item, size=78){
  // V76-4.0.3: render the exact CURRENT on-character vector cosmetic, not an emoji copy.
  // Hats/faces therefore cannot visually drift between Wardrobe/gameplay and gacha results.
  const dpr = 2;
  const canvas = document.createElement('canvas');
  canvas.width = size * dpr; canvas.height = size * dpr;
  canvas.style.cssText = `width:${size}px;height:${size}px;background:transparent;border:0;border-radius:0;box-shadow:none;display:block;`;
  const c = canvas.getContext('2d');
  c.scale(dpr, dpr);

  const accent = item.category === 'hats' ? '#f59e0b' : '#38bdf8';
  const bg = c.createRadialGradient(size*0.5,size*0.45,2,size*0.5,size*0.5,size*0.48);
  bg.addColorStop(0, accent + '30'); bg.addColorStop(1, 'rgba(15,23,42,0)');
  c.fillStyle = bg; c.beginPath(); c.arc(size*0.5,size*0.5,size*0.47,0,Math.PI*2); c.fill();

  const isFace = item.category === 'faces';
  const dummy = {
    x: size * 0.5 - (isFace ? 8 : 0),
    y: size * 0.78,
    radius: Math.max(17, size * 0.22),
    facing: 1, isLeft: true, isUser: false, isDiving: false,
    squashX: 1, squashY: 1, color: 'transparent',
    ghostTrail: [], energyReadyFlash: 0, flowAbsorbRallies: 0,
    venueSpinTimer: 0, venueSpinTotal: 48, highestRank3Tier: null,
    cosmeticOnly: true,
    card: { cosmetics: {
      hat: item.category === 'hats' ? item.id : 'hat_none',
      face: item.category === 'faces' ? item.id : 'face_none',
      effect: 'fx_none'
    }}
  };
  if (typeof drawPlayerEntity === 'function') drawPlayerEntity(dummy, c);
  return canvas;
}
function skillIconSvg(item,size=78){
  const color=item.glowColor||'#a78bfa';
  const id=String(item.id||'');
  const glyphs={
    sk_breaker:'<path d="M28 70 L45 34 L55 48 L72 24 L64 59 L78 57 L50 78 Z" fill="none" stroke="white" stroke-width="6" stroke-linejoin="round"/>',
    sk_deep_impact:'<path d="M18 56 Q34 38 50 56 T82 56 M22 68 Q38 50 54 68 T86 68" fill="none" stroke="white" stroke-width="5" stroke-linecap="round"/>',
    sk_steepexec:'<path d="M50 18 L66 43 H57 V78 H43 V43 H34 Z" fill="white"/><path d="M31 78 H69" stroke="white" stroke-width="5"/>',
    sk_phantom:'<circle cx="40" cy="50" r="18" fill="none" stroke="white" stroke-width="5"/><circle cx="60" cy="50" r="18" fill="none" stroke="white" stroke-width="5" opacity=".48"/>',
    sk_solar_sine:'<path d="M16 52 C28 24 40 80 52 52 S76 24 84 52" fill="none" stroke="white" stroke-width="6" stroke-linecap="round"/>',
    sk_sky_comet:'<circle cx="60" cy="38" r="12" fill="white"/><path d="M18 76 L48 46 M24 82 L54 52 M34 84 L60 58" stroke="white" stroke-width="5" stroke-linecap="round"/>',
    sk_phantom_drop:'<path d="M50 20 C63 40 72 50 72 62 A22 22 0 1 1 28 62 C28 50 37 40 50 20Z" fill="none" stroke="white" stroke-width="5"/><circle cx="43" cy="61" r="3" fill="white"/><circle cx="57" cy="61" r="3" fill="white"/>',
    sk_chrono_spike:'<circle cx="50" cy="50" r="27" fill="none" stroke="white" stroke-width="5"/><path d="M50 32 V51 L64 60" fill="none" stroke="white" stroke-width="5" stroke-linecap="round"/>',
    sk_rolling_thunder:'<path d="M58 15 L30 55 H47 L40 84 L72 43 H55 Z" fill="white"/>',
    sk_mud_spike:'<path d="M20 66 Q35 48 50 66 T80 66" fill="none" stroke="white" stroke-width="6"/><circle cx="34" cy="42" r="7" fill="white"/><circle cx="57" cy="35" r="5" fill="white"/><circle cx="70" cy="48" r="4" fill="white"/>',
    sk_bungee_gum:'<path d="M20 62 C28 24 72 24 80 62 C68 46 32 46 20 62Z" fill="none" stroke="white" stroke-width="6"/>',
    sk_iron_wall:'<path d="M20 28 H80 V72 H20 Z M20 44 H80 M20 58 H80 M40 28 V44 M60 44 V58 M40 58 V72" fill="none" stroke="white" stroke-width="5"/>',
    sk_soft_wall:'<path d="M20 30 Q50 45 80 30 M20 45 Q50 60 80 45 M20 60 Q50 75 80 60" fill="none" stroke="white" stroke-width="4"/><path d="M28 25 V72 M50 32 V78 M72 25 V72" stroke="white" stroke-width="3" opacity=".75"/>',
    sk_shock_return:'<path d="M24 34 H70 L58 22 M70 34 L58 46 M76 66 H30 L42 54 M30 66 L42 78" fill="none" stroke="white" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>',
    sk_godspeed_toss:'<path d="M28 68 Q34 42 45 35 M72 68 Q66 42 55 35" fill="none" stroke="white" stroke-width="6" stroke-linecap="round"/><circle cx="50" cy="28" r="10" fill="none" stroke="white" stroke-width="5"/>',
    sk_greased_ball:'<path d="M50 18 C64 38 72 48 72 62 A22 22 0 1 1 28 62 C28 48 36 38 50 18Z" fill="white" opacity=".9"/>',
    sk_gravity_drop:'<circle cx="50" cy="34" r="11" fill="none" stroke="white" stroke-width="5"/><path d="M50 48 V78 M38 66 L50 79 L62 66" fill="none" stroke="white" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>',
    sk_savage_roar:'<path d="M28 56 Q40 44 50 50 Q60 44 72 56 Q64 74 50 74 Q36 74 28 56Z" fill="none" stroke="white" stroke-width="5"/><path d="M18 38 Q28 28 38 32 M82 38 Q72 28 62 32" fill="none" stroke="white" stroke-width="5" stroke-linecap="round"/>'
  };
  const glyph=glyphs[id]||'<path d="M50 18 L61 40 L84 43 L67 60 L71 83 L50 72 L29 83 L33 60 L16 43 L39 40 Z" fill="none" stroke="white" stroke-width="5"/>';
  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true"><defs><radialGradient id="sg_${id.replace(/[^a-z0-9]/gi,'')}"><stop stop-color="${color}" stop-opacity=".95"/><stop offset="1" stop-color="#0f172a"/></radialGradient></defs><circle cx="50" cy="50" r="44" fill="url(#sg_${id.replace(/[^a-z0-9]/gi,'')})" stroke="${color}" stroke-width="3"/><circle cx="50" cy="50" r="36" fill="none" stroke="rgba(255,255,255,.20)" stroke-width="1.5"/>${glyph}</svg>`;
}
function showItemGachaResults(type, results, title){
  const modal=document.getElementById('item-gacha-result-modal'); const grid=document.getElementById('item-gacha-result-grid');
  const titleEl=document.getElementById('item-gacha-result-title'); if(!modal||!grid)return;
  titleEl.textContent=`🎉 ${title}`; grid.innerHTML='';
  grid.style.gridTemplateColumns = results.length>1 ? 'repeat(5,minmax(0,1fr))' : 'minmax(240px,320px)';
  results.forEach((item,index)=>{
    const card=document.createElement('div'); let border='#38bdf8', meta=''; let icon=''; let rarity='';
    if(type==='equip'){
      rarity=item.tier||''; border=item.tier==='SSR'?'#facc15':(item.tier==='SR'?'#c084fc':'#38bdf8');
      icon=getEquipIconSvg(item,82); meta=`${EQUIP_STAT_LABEL[item.mainStatType]||item.mainStatType.toUpperCase()} +${getEquipMainValue(item).toFixed(1)}`;
    }else if(type==='cosmetic'){
      border=item.category==='hats'?'#f59e0b':'#38bdf8'; meta=item.category==='hats'?'頭飾':'臉飾';
    }else{
      border=item.glowColor||'#a78bfa'; icon=skillIconSvg(item,82); meta=item.type||'SKILL';
    }
    card.className='gacha-result-card'; card.dataset.rarity=rarity; card.style.animationDelay=`${Math.min(index,9)*55}ms`;
    card.style.cssText+=`min-height:154px;background:linear-gradient(180deg,#11163b 0%,#0b1022 100%);border:2px solid ${border};border-radius:14px;padding:12px 8px;display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:0 0 15px ${border}33`;
    card.innerHTML=`<div class="gacha-item-icon-mount" style="height:86px;display:grid;place-items:center"></div><div style="font-size:12px;color:${border};font-weight:900;line-height:1.25;margin-top:5px">${type==='equip'?`[${item.tier}] `:''}${item.name}</div><div style="font-size:10px;color:#cbd5e1;margin-top:4px">${meta}</div>`;
    const iconMount = card.querySelector('.gacha-item-icon-mount');
    if (type === 'cosmetic') iconMount.appendChild(createCosmeticIconCanvas(item,82));
    else iconMount.innerHTML = icon;
    grid.appendChild(card);
  });
  modal.style.display='flex';
}
function closeItemGachaResults(){ const m=document.getElementById('item-gacha-result-modal'); if(m)m.style.display='none'; }
window.showItemGachaResults=showItemGachaResults; window.closeItemGachaResults=closeItemGachaResults;

// ========================================================
// V76-4.1 FRONTEND VISUAL SYSTEM
// 主頁與所有非比賽管理頁使用同一個「球館 + 現役球員特寫」背景；不再透出上一場最後一幀。
// ========================================================
window.addEventListener('DOMContentLoaded', () => {
  const menuCanvas=document.getElementById('menu-bg-canvas');
  const frontendLayer=document.getElementById('frontend-bg-layer');
  const frontendCanvas=document.getElementById('frontend-bg-canvas');
  if(!menuCanvas||!frontendCanvas||!frontendLayer) return;
  const menuCtx=menuCanvas.getContext('2d'), frontCtx=frontendCanvas.getContext('2d');
  const scene={heroA:0,heroB:1,prevA:0,prevB:1,lastRotate:0,initialized:false};

  function resizeCanvasToViewport(canvas){
    const dpr=Math.min(2,window.devicePixelRatio||1), w=window.innerWidth, h=window.innerHeight;
    const rw=Math.max(1,Math.floor(w*dpr)), rh=Math.max(1,Math.floor(h*dpr));
    if(canvas.width!==rw||canvas.height!==rh){ canvas.width=rw; canvas.height=rh; }
    canvas.style.width=`${w}px`; canvas.style.height=`${h}px`;
    const c=canvas.getContext('2d'); c.setTransform(dpr,0,0,dpr,0,0);
    return {w,h,dpr};
  }
  function getHeroPool(){
    const inv=(typeof INVENTORY!=='undefined'&&Array.isArray(INVENTORY))?INVENTORY.filter(Boolean):[];
    if(inv.length>=2) return inv;
    return (typeof GACHA_POOL!=='undefined'&&Array.isArray(GACHA_POOL))?GACHA_POOL.filter(Boolean):inv;
  }
  function rotateHeroes(now){
    const pool=getHeroPool();
    if(!pool.length) return {pool,mix:1};
    if(!scene.initialized){
      scene.initialized=true; scene.heroA=0; scene.heroB=pool.length>1?Math.max(1,Math.floor(pool.length/2)):0;
      scene.prevA=scene.heroA; scene.prevB=scene.heroB; scene.lastRotate=now-1400;
    }else if(pool.length>1 && now-scene.lastRotate>7600){
      scene.prevA=scene.heroA; scene.prevB=scene.heroB;
      scene.heroA=(scene.heroA+1)%pool.length;
      scene.heroB=(scene.heroA+Math.max(1,Math.floor(pool.length/2)))%pool.length;
      scene.lastRotate=now;
    }
    return {pool,mix:Math.max(0,Math.min(1,(now-scene.lastRotate)/1300))};
  }
  function drawCourtAmbient(ctx,w,h,t,opacity){
    ctx.clearRect(0,0,w,h);
    let g=ctx.createRadialGradient(w*.5,h*.40,20,w*.5,h*.45,Math.max(w,h)*.72);
    g.addColorStop(0,'#2b3b80'); g.addColorStop(.42,'#17204d'); g.addColorStop(1,'#080b18');
    ctx.globalAlpha=opacity; ctx.fillStyle=g; ctx.fillRect(0,0,w,h); ctx.globalAlpha=1;
    const floorY=h*.73;
    ctx.fillStyle='rgba(15,23,42,.58)'; ctx.fillRect(0,floorY,w,h-floorY);
    ctx.strokeStyle='rgba(99,102,241,.26)'; ctx.lineWidth=2;
    for(let i=0;i<7;i++){ const yy=floorY+i*34; ctx.beginPath();ctx.moveTo(0,yy);ctx.lineTo(w,yy);ctx.stroke(); }
    ctx.strokeStyle='rgba(56,189,248,.18)'; ctx.lineWidth=3;
    ctx.beginPath();ctx.moveTo(w*.12,floorY);ctx.lineTo(w*.88,floorY);ctx.stroke();
    // Net silhouette
    ctx.strokeStyle='rgba(203,213,225,.16)'; ctx.lineWidth=2;
    const nx=w*.5, nt=h*.39; ctx.beginPath();ctx.moveTo(nx,nt);ctx.lineTo(nx,floorY);ctx.stroke();
    for(let yy=nt;yy<floorY;yy+=14){ctx.beginPath();ctx.moveTo(nx-32,yy);ctx.lineTo(nx+32,yy);ctx.stroke();}
    // slow spotlights
    ctx.save(); ctx.globalCompositeOperation='lighter';
    for(let i=0;i<3;i++){
      const cx=w*(.18+i*.32)+Math.sin(t*.00022+i)*40;
      const sg=ctx.createRadialGradient(cx,h*.28,5,cx,h*.28,w*.16);
      sg.addColorStop(0,i===1?'rgba(250,204,21,.08)':'rgba(56,189,248,.10)');sg.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=sg;ctx.fillRect(cx-w*.2,0,w*.4,h*.72);
    }
    ctx.restore();
  }
  function drawHero(ctx,card,x,y,r,facing,alpha,t){
    if(!card||typeof drawPlayerEntity!=='function') return;
    const cosmeticCard={...card,equipSlotA:null,equipSlotB:null,cosmetics:card.cosmetics||{hat:'hat_none',face:'face_none',effect:'fx_none'}};
    const dummy={x,y:y+Math.sin(t*.001+(facing>0?0:2))*5,radius:r,color:card.color||'#64748b',facing,
      squashX:1,squashY:1,isDiving:false,isBlocking:false,isGrounded:true,ghostTrail:[],energyReadyFlash:0,
      flowAbsorbRallies:0,venueSpinTimer:0,venueSpinTotal:48,highestRank3Tier:null,card:cosmeticCard,
      isLeft:facing>0,isUser:false,slotIndex:-99,playerName:'',presentationOnly:true,swingTimer:0,thrustTimer:0,thrustTargetX:x,thrustTargetY:y};
    ctx.save();ctx.globalAlpha=alpha;ctx.shadowColor=card.color||'#818cf8';ctx.shadowBlur=38;
    drawPlayerEntity(dummy,ctx);ctx.restore();
    // soft identity plate, deliberately behind UI and low contrast
    ctx.save();ctx.globalAlpha=alpha*.75;ctx.font=`900 ${Math.max(13,r*.18)}px sans-serif`;ctx.textAlign='center';
    ctx.fillStyle='#e2e8f0';ctx.fillText(card.name||'',x,y+r*.52);ctx.restore();
  }
  function drawScene(canvas,ctx,t,menuMode){
    const {w,h}=resizeCanvasToViewport(canvas); drawCourtAmbient(ctx,w,h,t,1);
    const heroState=rotateHeroes(t), pool=heroState.pool; if(pool.length){
      const r=Math.max(72,Math.min(132,Math.min(w,h)*.135));
      const floor=h*.72, baseAlpha=menuMode?.28:.23, mix=heroState.mix;
      if(mix<1){
        drawHero(ctx,pool[scene.prevA%pool.length],w*.18,floor,r,1,baseAlpha*(1-mix),t);
        if(pool.length>1) drawHero(ctx,pool[scene.prevB%pool.length],w*.82,floor,r,-1,baseAlpha*(1-mix),t);
      }
      drawHero(ctx,pool[scene.heroA%pool.length],w*.18,floor,r,1,baseAlpha*mix,t);
      if(pool.length>1) drawHero(ctx,pool[scene.heroB%pool.length],w*.82,floor,r,-1,baseAlpha*mix,t);
    }
    // foreground vignette keeps center readable
    const vg=ctx.createRadialGradient(w*.5,h*.48,Math.min(w,h)*.16,w*.5,h*.48,Math.max(w,h)*.66);
    vg.addColorStop(0,'rgba(2,6,23,.01)');vg.addColorStop(.58,'rgba(2,6,23,.10)');vg.addColorStop(1,'rgba(2,6,23,.52)');
    ctx.fillStyle=vg;ctx.fillRect(0,0,w,h);
  }
  function syncFrontendBackdrop(){
    const ids=['multiplayer-modal','net-prep-modal','locker-modal','career-modal','wardrobe-modal','gacha-arcade-modal','practice-venue-modal','ladder-prep-modal','settings-modal','cloud-auth-modal'];
    const active=ids.some(id=>{const el=document.getElementById(id);return el&&getComputedStyle(el).display!=='none';});
    frontendLayer.style.display=active?'block':'none';
    document.body.classList.toggle('frontend-layer-active',active);
    if(!active) hideEquipHoverTooltip();
  }
  const watchIds=['multiplayer-modal','net-prep-modal','locker-modal','career-modal','wardrobe-modal','gacha-arcade-modal','practice-venue-modal','ladder-prep-modal','settings-modal','cloud-auth-modal'];
  const observer=new MutationObserver(syncFrontendBackdrop);
  watchIds.forEach(id=>{const el=document.getElementById(id);if(el)observer.observe(el,{attributes:true,attributeFilter:['style','class']});});
  window.addEventListener('resize',()=>{resizeCanvasToViewport(menuCanvas);resizeCanvasToViewport(frontendCanvas);});
  syncFrontendBackdrop();

  function loop(t){
    const start=document.getElementById('start-menu-modal');
    if(start&&getComputedStyle(start).display!=='none') drawScene(menuCanvas,menuCtx,t,true);
    if(frontendLayer.style.display==='block') drawScene(frontendCanvas,frontCtx,t,false);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
});

window.addEventListener('DOMContentLoaded', () => {
  const audioFileInput = document.getElementById('audio-file');
  if (audioFileInput) {
    audioFileInput.addEventListener('change', (e) => {
      const f = e.target.files[0];
      if (f) {
        customAudio.src = URL.createObjectURL(f);
        customAudio.play().then(() => {
          isAudioLoaded = true;
          const btn = document.getElementById('btn-bgm');
          if (btn) { btn.innerText = 'BGM: 播放中'; btn.style.background = '#10b981'; }
        });
      }
    });
  }
});
// ========================================================
// 🪜 天梯五度五關與賭狗模式 UI 控制器
// ========================================================
function openLadderPrepModal() {
  document.getElementById('start-menu-modal').style.display = 'none';
  document.getElementById('ladder-prep-modal').style.display = 'flex';

  const myCharSel = document.getElementById('ladder-my-char');
  const mySkillSel = document.getElementById('ladder-my-skill');
  const mateCharSel = document.getElementById('ladder-mate-char');
  const mateSkillSel = document.getElementById('ladder-mate-skill');

  myCharSel.innerHTML = '';
  mateCharSel.innerHTML = '';
  sortCharactersForSelect(INVENTORY).forEach((c, idx) => {
    myCharSel.innerHTML += `<option value="${c.id}" ${idx === 0 ? 'selected' : ''}>[${c.tier}] ${c.name} (Lv.${c.level})</option>`;
    mateCharSel.innerHTML += `<option value="${c.id}" ${idx === 1 ? 'selected' : ''}>[${c.tier}] ${c.name} (Lv.${c.level})</option>`;
  });

  mySkillSel.innerHTML = '';
  mateSkillSel.innerHTML = '';
  sortSkillsForSelect(SKILL_POOL).forEach(sk => {
    mySkillSel.innerHTML += `<option value="${sk.id}">[${sk.type}] ${sk.name}</option>`;
    mateSkillSel.innerHTML += `<option value="${sk.id}">[${sk.type}] ${sk.name}</option>`;
  });

  document.getElementById('ladder-gamble-toggle').checked = false;
  toggleLadderGambleUI(false);
  selectLadderBet(100); // 預設選取 100 幣
}

function closeLadderPrepModal() {
  document.getElementById('ladder-prep-modal').style.display = 'none';
  document.getElementById('start-menu-modal').style.display = 'flex';
}
// 🎲 賭狗模式 UI 切換開關 (隱藏/顯示自選隊友，更新賠率看板)
function toggleLadderGambleUI(isGamble) {
  const mateChar = document.getElementById('ladder-mate-char');
  const mateSkill = document.getElementById('ladder-mate-skill');
  const desc = document.getElementById('ladder-gamble-mate-desc');

  if (mateChar) mateChar.style.display = isGamble ? 'none' : 'block';
  if (mateSkill) mateSkill.style.display = isGamble ? 'none' : 'block';
  if (desc) desc.style.display = isGamble ? 'block' : 'none';

  updateLadderRateDesc();
}

// 💰 切換押注金額與按鈕高亮
function selectLadderBet(amt) {
  ladderCurrentRun.betAmount = amt;
  const btns = document.querySelectorAll('.ladder-bet-btn');
  btns.forEach(b => {
    const isSelected = b.innerText.includes(amt);
    b.style.borderColor = isSelected ? '#facc15' : '#4338ca';
    b.style.background = isSelected ? '#4338ca' : '#312e81';
    b.style.transform = isSelected ? 'scale(1.05)' : 'scale(1)';
  });
  updateLadderRateDesc();
}

// 動態更新準備室底部的獎勵規則說明
function updateLadderRateDesc() {
  const rateDesc = document.getElementById('ladder-rate-desc');
  if (!rateDesc) return;
  const isGamble = document.getElementById('ladder-gamble-toggle').checked;
  const bet = ladderCurrentRun.betAmount;

  if (isGamble) {
    rateDesc.innerHTML = `🎲 <strong>賭狗模式：</strong> 押注 <strong style="color:#facc15;">${bet} 幣</strong> ｜ 抽到 N 卡滿關可拿 <strong style="color:#34d399;">5.5x (${Math.round(bet * 5.5)}幣)</strong> ｜ 抽到 SSR 降為 <strong style="color:#ef4444;">3.5x (${Math.round(bet * 3.5)}幣)</strong>`;
  } else {
    rateDesc.innerHTML = `門票押注：<strong style="color: #facc15;">${bet} 幣</strong> ｜ 5 連戰連勝制 ｜ 基礎滿關倍率：<strong style="color: #34d399;">4.5x</strong> (滿關可得 ${Math.round(bet * 4.5)} 幣)`;
  }
}

function startLadderRun() {
  if (typeof resetNetworkSessionIdentity === 'function') resetNetworkSessionIdentity(true);
  restoreActiveRosterFromSaved(false);
  isPracticeMode = false;
  const bet = ladderCurrentRun.betAmount;
  if (userCoins < bet) {
    alert(`排球金幣不足！本次挑戰需要 ${bet} 幣，目前持有 ${userCoins} 幣。`);
    return;
  }
  userCoins -= bet;
  updateCoinHUD();

  ladderCurrentRun.active = true;
  ladderCurrentRun.currentFloor = 1;
  ladderCurrentRun.currentPot = bet; // 初始獎池等於本金

  const isGamble = document.getElementById('ladder-gamble-toggle').checked;
  const myCharId = document.getElementById('ladder-my-char').value;
  const mySkillId = document.getElementById('ladder-my-skill').value;
  const myCharObj = INVENTORY.find(c => c.id === myCharId) || INVENTORY[0];

  ACTIVE_ROSTER.user = { ...myCharObj, equippedSkill: mySkillId };

  let pickedMate = null;
  let mateBonus = 0;

  if (isGamble) {
    // 🎲 天堂 or 地獄：系統完全隨機抽一名角色當搭檔
    const randCard = GACHA_POOL[Math.floor(Math.random() * GACHA_POOL.length)];
    const randSkill = SKILL_POOL[Math.floor(Math.random() * SKILL_POOL.length)];
    mateBonus = LADDER_GAMBLE_ADDONS[randCard.tier] || 0;

    pickedMate = {
      id: `gamble_mate_${Date.now()}`,
      name: randCard.name,
      tier: randCard.tier,
      color: randCard.color,
      level: 10,
      stats: { ...randCard.base },
      equippedSkill: randSkill.id,
      cosmetics: { hat: 'hat_none', face: 'face_none', effect: 'fx_none' }
    };
  } else {
    const mateCharId = document.getElementById('ladder-mate-char').value;
    const mateSkillId = document.getElementById('ladder-mate-skill').value;
    const mateObj = INVENTORY.find(c => c.id === mateCharId) || INVENTORY[1];
    pickedMate = { ...mateObj, equippedSkill: mateSkillId };
  }

  ACTIVE_ROSTER.mate = pickedMate;

  ladderCurrentRun = {
    active: true,
    currentFloor: 1,
    betAmount: bet,
    currentPot: bet,
    isGambleMode: isGamble,
    mateTier: pickedMate.tier,
    mateBonusMult: mateBonus,
    summaryStats: {
      user: { spikes: 0, spikeKills: 0, receives: 0, perfectAbsorbs: 0, blocks: 0, roofKills: 0, maxSpeed: 0, totalExp: 0 },
      mate: { spikes: 0, spikeKills: 0, receives: 0, perfectAbsorbs: 0, blocks: 0, roofKills: 0, maxSpeed: 0, totalExp: 0 }
    }
  };

  isLadderMode = true;
  isCareerMode = false;
  document.getElementById('ladder-prep-modal').style.display = 'none';

  loadLadderFloorEnemies(1);
}

// 產生動態隨機對手並開戰 (完整單局洗白重置)
function loadLadderFloorEnemies(floor) {
  const ladderVenuePlan = {1:'stadium',2:'warehouse',3:'stadium',4:'moon',5:'warehouse'};
  setCurrentVenue(ladderVenuePlan[floor] || 'stadium'); venueEventsEnabled = true; // V57: Ladder 也使用該場地合法事件
  const cfg = LADDER_TIERS[floor];
  const candidatesA = GACHA_POOL.filter(c => c.tier === cfg.tiers[0]);
  const candidatesB = GACHA_POOL.filter(c => c.tier === cfg.tiers[1]);

  const tmplA = candidatesA[Math.floor(Math.random() * candidatesA.length)] || GACHA_POOL[0];
  const tmplB = candidatesB[Math.floor(Math.random() * candidatesB.length)] || GACHA_POOL[1];

  const lvA = Math.floor(Math.random() * (cfg.maxLv - cfg.minLv + 1)) + cfg.minLv;
  const lvB = Math.floor(Math.random() * (cfg.maxLv - cfg.minLv + 1)) + cfg.minLv;

  const rollStats = (tmpl, lv, minAP, maxAP) => {
    const s = { ...tmpl.base };
    const ap = Math.floor(Math.random() * (maxAP - minAP + 1)) + minAP;
    const keys = ['str', 'agi', 'jump', 'dex', 'int'];
    for (let i = 0; i < ap; i++) {
      const k = keys[Math.floor(Math.random() * keys.length)];
      if (s[k] < 60) s[k]++;
    }
    return s;
  };

  ACTIVE_ROSTER.enemyFront = {
    id: `ladder_ef_${Date.now()}`,
    name: `${tmplA.name} [敵]`,
    tier: tmplA.tier,
    color: tmplA.color,
    level: lvA,
    stats: rollStats(tmplA, lvA, cfg.minAP, cfg.maxAP),
    equippedSkill: SKILL_POOL[Math.floor(Math.random() * SKILL_POOL.length)].id,
    cosmetics: { hat: 'hat_none', face: 'face_none', effect: 'fx_none' }
  };

  ACTIVE_ROSTER.enemyBack = {
    id: `ladder_eb_${Date.now()}`,
    name: `${tmplB.name} [敵]`,
    tier: tmplB.tier,
    color: tmplB.color,
    level: lvB,
    stats: rollStats(tmplB, lvB, cfg.minAP, cfg.maxAP),
    equippedSkill: SKILL_POOL[Math.floor(Math.random() * SKILL_POOL.length)].id,
    cosmetics: { hat: 'hat_none', face: 'face_none', effect: 'fx_none' }
  };

  // 🌟 1. 重新綁定選手數值與卡片
  allPlayers.forEach(p => p.rebind(true));

  // 🌟 2. 4 位選手狀態徹底洗白（消除上一局疲勞與狀態）
  allPlayers.forEach(p => {
    p.energy = 0;
    p.jumpExhaustion = 1.0;
    p.depressedRallies = 0;
    p.excitedRallies = 0;
    p.mudDebuffTimer = 0;
    p.softWallRallies = 0;
    p.godspeedCharges = 0;
    p.greaseDebuffRallies = 0;
    p.stunTimer = 0;
    p.hasPlayedFullSound = false;
    p.forceGrounded();
  });

  // 🌟 3. 單局統計數據看板清空歸零
  proMatchStats = {
    user: { totalSpikes: 0, spikeKills: 0, toolOutKills: 0, serviceAces: 0, maxSpeed: 0, totalReceives: 0, perfectAbsorbs: 0, normalBumps: 0, deflects: 0, coverSaves: 0, totalBlocks: 0, roofKills: 0 },
    mate: { totalSpikes: 0, spikeKills: 0, toolOutKills: 0, serviceAces: 0, maxSpeed: 0, totalReceives: 0, perfectAbsorbs: 0, normalBumps: 0, deflects: 0, coverSaves: 0, totalBlocks: 0, roofKills: 0 },
    enemyFront: { totalSpikes: 0, spikeKills: 0, toolOutKills: 0, serviceAces: 0, maxSpeed: 0, totalReceives: 0, perfectAbsorbs: 0, normalBumps: 0, deflects: 0, coverSaves: 0, totalBlocks: 0, roofKills: 0 },
    enemyBack: { totalSpikes: 0, spikeKills: 0, toolOutKills: 0, serviceAces: 0, maxSpeed: 0, totalReceives: 0, perfectAbsorbs: 0, normalBumps: 0, deflects: 0, coverSaves: 0, totalBlocks: 0, roofKills: 0 }
  };
  updateSideUltHUD();

  // 🌟 4. 重啟生命週期（解除上一局結算與暫停）
  score.player = 0;
  score.enemy = 0;
  scoreDisplay.innerText = '0 : 0';
  match.leftHits = 0;
  match.rightHits = 0;
  match.isBlockedBack = false;
  timeSlowTimer = 0;
  chronoAnimTimer = 0;
  hitStopFrames = 0;
  pendingCoinReward = 0;
  pendingCoinReason = '';

  isSettlementOpen = false;
  isGameStarted = true;
  isPaused = false;

  ball.resetForServe('LEFT');
}
// 階梯過場動畫繪製 (小人從上一階跳往下一階)
function playLadderClimbAnimation(prevFloor, nextFloor, potAmount, onComplete) {
  const modal = document.getElementById('ladder-stage-anim-modal');
  modal.style.display = 'flex';
  document.getElementById('ladder-anim-title').innerText = `FLOOR 0${prevFloor} CLEAR!`;
  document.getElementById('ladder-anim-sub').innerText = `滾存金幣池：🪙 ${potAmount} 幣`;

  const cvs = document.getElementById('ladder-climb-canvas');
  const ctx = cvs.getContext('2d');

  let animProgress = 0;
  const totalSteps = 5;
  const stepWidth = 120;
  const startX = 80;
  const baseY = 320;

  function renderClimbFrame() {
    ctx.clearRect(0, 0, cvs.width, cvs.height);

    // 繪製 5 階階梯
    for (let i = 0; i < totalSteps; i++) {
      const stepX = startX + (i * stepWidth);
      const stepY = baseY - (i * 50);
      const isReached = (i + 1) <= nextFloor;

      ctx.fillStyle = isReached ? '#312e81' : '#1e1b4b';
      ctx.fillRect(stepX, stepY, stepWidth - 10, 20);
      ctx.strokeStyle = isReached ? '#818cf8' : '#4338ca';
      ctx.lineWidth = 2;
      ctx.strokeRect(stepX, stepY, stepWidth - 10, 20);

      ctx.fillStyle = isReached ? '#facc15' : '#64748b';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText(`階梯 ${i + 1}`, stepX + 30, stepY + 14);

      // 第 5 階頂部金盃
      if (i === 4) {
        ctx.font = '24px sans-serif';
        ctx.fillText('🏆', stepX + 28, stepY - 10);
      }
    }

    // 計算小人起跳拋物線 (從 prevFloor 跳到 nextFloor)
    const p1X = startX + ((prevFloor - 1) * stepWidth) + 35;
    const p1Y = baseY - ((prevFloor - 1) * 50);
    const p2X = startX + ((nextFloor - 1) * stepWidth) + 35;
    const p2Y = baseY - ((nextFloor - 1) * 50);

    animProgress = Math.min(1.0, animProgress + 0.025);
    const curX = p1X + (p2X - p1X) * animProgress;
    const jumpArc = Math.sin(animProgress * Math.PI) * 60;
    const curY = p1Y + (p2Y - p1Y) * animProgress - jumpArc;

    // 繪製跳躍主角小人
    ctx.save();
    ctx.translate(curX, curY);
    ctx.beginPath();
    ctx.arc(0, -18, 16, 0, Math.PI * 2);
    ctx.fillStyle = ACTIVE_ROSTER.user.color || '#38bdf8';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    ctx.restore();

    if (animProgress < 1.0) {
      requestAnimationFrame(renderClimbFrame);
    }
  }

  requestAnimationFrame(renderClimbFrame);
}

// 提款退出
function ladderCashoutAndQuit() {
  document.getElementById('ladder-stage-anim-modal').style.display = 'none';
  if (ladderCurrentRun.currentPot > 0) {
    addCoins(ladderCurrentRun.currentPot, '天梯滾存提款', 800, 250);
    alert(`💰 成功提款！帶走 ${ladderCurrentRun.currentPot} 排球金幣存入背包。`);
  }
  ladderCurrentRun.active = false;
  isLadderMode = false;
  returnToStartMenu();
}

// 挑戰下一階
function ladderProceedNextFloor() {
  document.getElementById('ladder-stage-anim-modal').style.display = 'none';
  ladderCurrentRun.currentFloor++;
  loadLadderFloorEnemies(ladderCurrentRun.currentFloor);
}
// 📊 彈出天梯總戰績看板
function showLadderRunSummaryModal(isGrandWin) {
  const modal = document.getElementById('ladder-summary-modal');
  if (!modal) return;
  modal.style.display = 'flex';

  const title = document.getElementById('ladder-sum-title');
  const sub = document.getElementById('ladder-sum-sub');
  const potBanner = document.getElementById('ladder-sum-pot-banner');
  const tbody = document.getElementById('ladder-sum-table-body');

  title.innerText = isGrandWin ? '👑 天梯五連勝 · 榮耀登頂！' : (ladderCurrentRun.currentPot > 0 ? '💰 天梯見好就收 · 提款完成' : '☠️ 天梯遠征中斷 · 挑戰失敗');
  title.style.color = isGrandWin ? '#facc15' : (ladderCurrentRun.currentPot > 0 ? '#38bdf8' : '#ef4444');
  sub.innerText = `通關進度：第 0${ladderCurrentRun.currentFloor} 階 ｜ 模式：${ladderCurrentRun.isGambleMode ? '🎲 天堂 or 地獄' : '標準競技'}`;
  potBanner.innerText = `🪙 最終入袋賞金：+${ladderCurrentRun.currentPot} 幣`;

  const s = ladderCurrentRun.summaryStats || {
    user: { spikes: 0, spikeKills: 0, receives: 0, perfectAbsorbs: 0, blocks: 0, roofKills: 0, maxSpeed: 0, totalExp: 0 },
    mate: { spikes: 0, spikeKills: 0, receives: 0, perfectAbsorbs: 0, blocks: 0, roofKills: 0, maxSpeed: 0, totalExp: 0 }
  };

  const p1Card = ACTIVE_ROSTER.user;
  const p2Card = ACTIVE_ROSTER.mate;

  tbody.innerHTML = `
    <tr style="background: rgba(49, 46, 129, 0.4);">
      <td style="color: ${p1Card.color}; font-weight: bold; padding: 10px;">[主控] ${p1Card.name} (Lv.${p1Card.level})</td>
      <td style="color: #ef4444; font-weight: bold;">${s.user.spikes} (${s.user.spikeKills})</td>
      <td style="color: #10b981; font-weight: bold;">${s.user.receives} (${s.user.perfectAbsorbs})</td>
      <td style="color: #facc15; font-weight: bold;">${s.user.blocks} (${s.user.roofKills})</td>
      <td style="color: #38bdf8;">${s.user.maxSpeed.toFixed(1)}</td>
      <td style="color: #34d399; font-weight: 900; font-size: 13px;">+${s.user.totalExp} EXP</td>
    </tr>
    <tr style="background: rgba(30, 27, 75, 0.4);">
      <td style="color: ${p2Card.color}; font-weight: bold; padding: 10px;">[搭檔] ${p2Card.name} (Lv.${p2Card.level})</td>
      <td style="color: #ef4444; font-weight: bold;">${s.mate.spikes} (${s.mate.spikeKills})</td>
      <td style="color: #10b981; font-weight: bold;">${s.mate.receives} (${s.mate.perfectAbsorbs})</td>
      <td style="color: #facc15; font-weight: bold;">${s.mate.blocks} (${s.mate.roofKills})</td>
      <td style="color: #38bdf8;">${s.mate.maxSpeed.toFixed(1)}</td>
      <td style="color: #34d399; font-weight: 900; font-size: 13px;">+${s.mate.totalExp} EXP</td>
    </tr>
  `;
}

// 關閉戰報並返回主選單
function closeLadderSummaryAndExit() {
  document.getElementById('ladder-summary-modal').style.display = 'none';
  ladderCurrentRun.active = false;
  isLadderMode = false;
  returnToStartMenu();
}

// 提款退出呼叫總結
function ladderCashoutAndQuit() {
  document.getElementById('ladder-stage-anim-modal').style.display = 'none';
  if (ladderCurrentRun.currentPot > 0) {
    addCoins(ladderCurrentRun.currentPot, '天梯滾存提款', 800, 250);
  }
  showLadderRunSummaryModal(false);
}
// V60：非阻塞式平台風格 Achievement Toast Queue。
let achievementToastQueue=[]; let achievementToastBusy=false;
function ensureAchievementToastHost(){
  let el=document.getElementById('achievement-toast-host'); if(el)return el;
  el=document.createElement('div'); el.id='achievement-toast-host';
  el.style.cssText='position:fixed;right:22px;bottom:22px;z-index:100000;pointer-events:none;width:min(520px,calc(100vw - 44px));';document.body.appendChild(el);return el;
}
function playAchievementUnlockSound(){
  try{const ac=(typeof audioCtx!=='undefined'&&audioCtx)?audioCtx:new (window.AudioContext||window.webkitAudioContext)(),now=ac.currentTime,vol=(typeof globalSfxVolume!=='undefined'?globalSfxVolume:.85);[659,988,1319].forEach((f,i)=>{const o=ac.createOscillator(),g=ac.createGain();o.type='sine';o.frequency.value=f;g.gain.setValueAtTime(.001,now+i*.07);g.gain.exponentialRampToValueAtTime(.14*vol,now+i*.07+.012);g.gain.exponentialRampToValueAtTime(.001,now+i*.07+.32);o.connect(g);g.connect(ac.destination);o.start(now+i*.07);o.stop(now+i*.07+.34);});}catch(e){}
}
function pumpAchievementToast(){
  if(achievementToastBusy||!achievementToastQueue.length)return;achievementToastBusy=true;const a=achievementToastQueue.shift(),host=ensureAchievementToastHost(),el=document.createElement('div');
  el.style.cssText='transform:translateX(115%);opacity:0;transition:transform .28s ease,opacity .28s ease;background:linear-gradient(135deg,rgba(15,23,42,.97),rgba(30,41,59,.97));border:1px solid #facc15;border-radius:16px;padding:20px 22px;box-shadow:0 12px 35px rgba(0,0,0,.45);color:white;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;';
  el.innerHTML=`<div style="font-size:14px;color:#facc15;font-weight:900;letter-spacing:.12em">🏆 成就解鎖</div><div style="font-size:25px;font-weight:950;margin-top:5px">${a.name}</div><div style="font-size:15px;color:#cbd5e1;margin-top:6px;line-height:1.35">${a.rewardText||a.desc||''}</div>`;host.appendChild(el);playAchievementUnlockSound();requestAnimationFrame(()=>{el.style.transform='translateX(0)';el.style.opacity='1';});
  setTimeout(()=>{el.style.transform='translateX(115%)';el.style.opacity='0';setTimeout(()=>{el.remove();achievementToastBusy=false;pumpAchievementToast();},300);},3300);
}
function testAchievementToast(){achievementToastQueue.push({name:'測試成就：看得到我嗎？',desc:'這只是顯示測試，不會真的解鎖或寫入存檔。',rewardText:'🏆 成就 Toast 測試'});pumpAchievementToast();}
// V74-7: achievement toast test button removed after sizing approval. testAchievementToast() is retained for console-only QA.
function unlockAchievementLocal(id){
  if(typeof ACHIEVEMENT_DEFS==='undefined'||!ACHIEVEMENT_DEFS[id]||typeof UNLOCKED_ACHIEVEMENTS==='undefined')return false;
  if(UNLOCKED_ACHIEVEMENTS.includes(id))return false;const def=ACHIEVEMENT_DEFS[id];UNLOCKED_ACHIEVEMENTS.push(id);let rewardText='';
  if(def.cosmetic){const [cat,itemId]=def.cosmetic;if(UNLOCKED_COSMETICS&&UNLOCKED_COSMETICS[cat]&&!UNLOCKED_COSMETICS[cat].includes(itemId))UNLOCKED_COSMETICS[cat].push(itemId);const db=(typeof COSMETICS_DB!=='undefined'&&COSMETICS_DB[cat])?COSMETICS_DB[cat]:[];const item=db.find(x=>x.id===itemId);rewardText=item?`獲得時裝「${item.name}」`:'';}
  if(def.coins){userCoins+=def.coins;updateCoinHUD();rewardText+=(rewardText?'　':'')+`🪙 +${def.coins}`;}
  saveGameData();achievementToastQueue.push({name:def.name,desc:def.desc,rewardText});pumpAchievementToast();return true;
}

// V35：鐵皮破壞成就。權威端依最後觸球者歸屬；連線不會整場一起白嫖。
function awardWarehouseRoofBreakAchievement(lastTouchPlayer) {
  if(!lastTouchPlayer)return false;
  return (typeof awardAchievementForActor==='function') ? awardAchievementForActor(lastTouchPlayer,'ach_landlord_calling') : false;
}

// V35：無盡模式也走正式場地選擇，不再永遠被鎖在體育館。
let practiceVenueIndex = 0;
let practiceEventsEnabled = true;
let practiceBlockCoachEnabled = true;
const PRACTICE_VENUE_IDS = ['stadium','warehouse','moon','rooftop','rain','ice','ship','beach','factory','underground','random'];
function openPracticeVenueModal(){
  // V36：這裡只負責選場地，絕不能先偷偷開一場。也清掉連線殘留，避免抽完連線場地後才冒出無盡視窗。
  if (typeof resetNetworkSessionIdentity === 'function') resetNetworkSessionIdentity(true);
  if (typeof NET !== 'undefined') { NET.isMultiplayer=false; NET.venueChoice='stadium'; NET.venueId='stadium'; }
  isGameStarted=false; isPaused=true; if(typeof _stopVenueAmbience==='function')_stopVenueAmbience(); isPracticeMode=false; isCareerMode=false; isLadderMode=false;
  const m=document.getElementById('practice-venue-modal'); if(!m){ startPracticeMode('stadium','stadium'); return; }
  const start=document.getElementById('start-menu-modal'); if(start) start.style.display='none';
  practiceVenueIndex=0; practiceEventsEnabled=true; practiceBlockCoachEnabled=true; renderPracticeVenuePicker(); renderPracticeEventToggle(); renderPracticeBlockCoachToggle(); m.style.pointerEvents='auto'; m.style.display='flex';
}
function renderPracticeVenuePicker(){
  const id=PRACTICE_VENUE_IDS[practiceVenueIndex];
  const v=id==='random'?{icon:'🎲',name:'隨機場地',tagline:'現在不告訴你。開賽自己看。'}:(VENUE_DB.find(x=>x.id===id)||VENUE_DB[0]);
  document.getElementById('practice-venue-icon').textContent=v.icon;
  document.getElementById('practice-venue-name').textContent=v.name;
  document.getElementById('practice-venue-desc').textContent=v.tagline;
}
function cyclePracticeVenue(dir){ practiceVenueIndex=(practiceVenueIndex+dir+PRACTICE_VENUE_IDS.length)%PRACTICE_VENUE_IDS.length; renderPracticeVenuePicker(); }
function renderPracticeEventToggle(){const b=document.getElementById('practice-events-toggle');if(!b)return;b.textContent=`特殊事件：${practiceEventsEnabled?'ON':'OFF'}`;b.style.borderColor=practiceEventsEnabled?'#22c55e':'#64748b';b.style.color=practiceEventsEnabled?'#bbf7d0':'#cbd5e1';}
function togglePracticeEvents(){practiceEventsEnabled=!practiceEventsEnabled;renderPracticeEventToggle();}
function renderPracticeBlockCoachToggle(){const b=document.getElementById('practice-block-coach-toggle');if(!b)return;b.textContent=`攔網 Timing 教練：${practiceBlockCoachEnabled?'ON':'OFF'}`;b.style.borderColor=practiceBlockCoachEnabled?'#facc15':'#64748b';b.style.color=practiceBlockCoachEnabled?'#fde68a':'#cbd5e1';}
function togglePracticeBlockCoach(){practiceBlockCoachEnabled=!practiceBlockCoachEnabled;renderPracticeBlockCoachToggle();}
function closePracticeVenueModal(){
  const m=document.getElementById('practice-venue-modal');
  if(m){ m.style.display='none'; m.style.pointerEvents='auto'; }
  isGameStarted=false; isPaused=true; if(typeof _stopVenueAmbience==='function')_stopVenueAmbience(); isPracticeMode=false;
  const start=document.getElementById('start-menu-modal'); if(start) start.style.display='flex';
}
function confirmPracticeVenue(){
  const choice=PRACTICE_VENUE_IDS[practiceVenueIndex] || 'stadium';
  const resolved=resolveVenueChoice(choice);
  const m=document.getElementById('practice-venue-modal'); if(m){ m.style.display='none'; m.style.pointerEvents='none'; }
  // V37：先關 Modal，再下一個 frame 正式建場，避免 fixed overlay / session teardown 吃掉開始流程。
  requestAnimationFrame(()=>startPracticeMode(resolved, choice, practiceEventsEnabled));
}
