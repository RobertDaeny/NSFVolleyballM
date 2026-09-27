// ========================================================
// 靜態資料庫：常數、存檔、選手庫、技能、18件裝備庫與數值演算
// ========================================================
const WORLD = {
  WIDTH: 3000, HEIGHT: 850, FLOOR_Y: 620,
  NET_X: 1500, NET_H: 125, NET_W: 12, NET_TOP_Y: 495,
  LEFT: 940, RIGHT: 2060, ATTACK_LINE_DIST: 186, GRAVITY: 0.38
};
const VIEW_W = 1600, VIEW_H = 500;

// V32 場地系統第一階段：場地本體與事件牌組分離。事件尚未啟動，但資料先成為單一來源。
const VENUE_DB = [
  { id:'stadium', name:'標準體育館', icon:'🏟️', tagline:'規則很正常。真正不正常的是場上的人。', gravityMult:1.0, arena:'standard', fixed:'standard', eventDeck:['NONE'] },
  { id:'warehouse', name:'三角工業倉庫', icon:'🏭', tagline:'屋頂不是背景。打上去真的會回來。', gravityMult:1.0, arena:'triangle_roof', fixed:'breakable_roof', eventDeck:['NONE','BLACKOUT','BIRDS','PIPE_LEAK'] },
  { id:'moon', name:'月面基地', icon:'🌕', tagline:'地球的常識留在地球。球也懶得下來。', gravityMult:0.82, arena:'standard', fixed:'low_gravity', eventDeck:['NONE','GRAVITY_ANOMALY','UFO'] },
  { id:'rooftop', name:'天台球場', icon:'🌃', tagline:'平台外沒有地板。救得到球，不一定救得回自己。', gravityMult:1.0, arena:'ledge', fixed:'micro_wind', platformLeft:680, platformRight:2320, eventDeck:['NONE','WIND_GUST','BIRDS','THUNDER_STRIKE'] },
  { id:'rain', name:'暴雨球場', icon:'🌧️', tagline:'地板很滑。摔倒以前記得先救球。', gravityMult:1.0, arena:'standard', fixed:'wet_floor', eventDeck:['NONE','LIGHTNING','RAIN_SURGE','WIND_GUST'] },
  { id:'ice', name:'極寒冰場', icon:'🧊', tagline:'煞車是建議，不是保證。', gravityMult:1.0, arena:'standard', fixed:'ice_floor', eventDeck:['NONE','BLIZZARD','ICE_CRACK'] },
  { id:'ship', name:'貨輪甲板', icon:'🚢', tagline:'球場沒歪。是你的內耳在加班。', gravityMult:1.0, arena:'standard', fixed:'ship_sway', eventDeck:['NONE','GIANT_WAVE','WIND_GUST','BIRDS'] },
  { id:'beach', name:'夜灘球場', icon:'🏖️', tagline:'浪漫是觀眾的事。你只會吃沙。', gravityMult:1.0, arena:'standard', fixed:'sand_floor', eventDeck:['NONE','WIND_GUST','BIRDS'] },
  { id:'factory', name:'高熱熔爐廠', icon:'🔥', tagline:'冷氣壞了。老闆說這叫意志訓練。', gravityMult:1.0, arena:'standard', fixed:'heat', eventDeck:['NONE','OVERHEAT'] },
  { id:'underground', name:'地下非法球場', icon:'🚇', tagline:'沒有轉播、沒有裁判申訴、可能也沒有出口。', gravityMult:1.0, arena:'standard', fixed:'standard', eventDeck:['NONE','CROWD_THROW'] }
];
let currentVenueId = 'stadium';
let venueEventsEnabled = true;
let UNLOCKED_ACHIEVEMENTS = [];
// V60: 成就與獎勵分離。Gameplay 只丟 achievement id，這裡定義永久獎勵。
const ACHIEVEMENT_DEFS = {
  ach_bird_perch:{name:'空中交通事故', desc:'用球擊落一隻海鳥。', cosmetic:['hats','hat_bird_perch']},
  ach_feather_finish:{name:'鳥事之後還是要得分', desc:'擊鳥後同一 Rally 由我方拿下。', cosmetic:['effects','fx_feathers']},
  ach_bird_triple:{name:'三振出局（鳥）', desc:'同一場親手擊落 3 隻海鳥。', cosmetic:['faces','face_birdmark']},
  ach_ufo_survivor:{name:'外星人退貨', desc:'月球場球遭 UFO 吸走後，仍由我方拿下該 Rally。', cosmetic:['hats','hat_space_junk']},
  ach_everyone_gets_one:{name:'大家都有的', desc:'見證一次宇宙級的公正判決。', cosmetic:['hats','hat_fair_tea']},
  ach_moon_perfect:{name:'低重力一傳', desc:'月球重力異常期間用 K 鍵完成 Perfect Receive。', cosmetic:['faces','face_oxygen']},
  ach_space_leak:{name:'今天月球很忙', desc:'單場遇到 UFO 與重力異常並贏得比賽。', cosmetic:['effects','fx_leak']},
  ach_landlord_calling:{name:'房東等等會打來', desc:'親手把倉庫鐵皮屋頂打破。', cosmetic:['hats','hat_hardhat'], coins:600},
  ach_trash_hit:{name:'非法球場的洗禮', desc:'地下場被觀眾丟進來的垃圾直接命中。', cosmetic:['effects','fx_flies']},
  ach_shock_kill:{name:'帶電反擊', desc:'天台遭雷擊後，在恢復期間用攻擊得分。', cosmetic:['effects','fx_welding']},
  ach_ship_attack:{name:'暈船也要扣', desc:'貨輪甲板傾斜／浪湧影響期間用攻擊得分。', cosmetic:['effects','fx_splash']},
  ach_blackout_attack:{name:'摸黑下釘', desc:'停電期間用攻擊得分。', cosmetic:['effects','fx_blackout']},
  ach_beach_triple_bounce:{name:'人體沙灘排球', desc:'不落地連續被沙灘球彈飛 3 次。', cosmetic:['effects','fx_beach_ball_body']}
};
function getCurrentVenue(){ return VENUE_DB.find(v=>v.id===currentVenueId) || VENUE_DB[0]; }
function setCurrentVenue(id){ if(VENUE_DB.some(v=>v.id===id)) currentVenueId=id; }
function resolveVenueChoice(id){
  if(id !== 'random') return VENUE_DB.some(v=>v.id===id) ? id : 'stadium';
  return VENUE_DB[Math.floor(Math.random()*VENUE_DB.length)].id;
}


// 18 件核心裝備母體庫 (3 部位 × 2 主屬性 × 3 稀有度)
const EQUIP_DB = [
  // --- 護腕類 (Wristbands) ---
  {
    id: 'eq_wrist_str_ssr', name: '泰坦重裝護腕', slot: 'wrist', tier: 'SSR', mainStat: 'str',
    baseRange: [5, 8], refineGain: 0.7,
    perks: {
      rank1: { desc: '常規扣殺擊球容錯角度 +5°', spikeAngleBonus: 0.08 },
      rank2: { desc: '扣殺穿網時撞擊阻尼衰減降低 15%', pierceDampBonus: 0.15 },
      rank3: { desc: '滿階特權：打手出界 (Tool Out) 彈射向外偏折 15°', toolOutAngleBonus: 0.26 }
    },
    subStatPool: ['ap', 'spikeSpeed', 'reach']
  },
  {
    id: 'eq_wrist_dex_ssr', name: '神意流光護腕', slot: 'wrist', tier: 'SSR', mainStat: 'dex',
    baseRange: [5, 8], refineGain: 0.7,
    perks: {
      rank1: { desc: '扣殺下旋力 (Topspin) +12%', topspinBonus: 0.12 },
      rank2: { desc: '跳飄球氣流晃動幅度 +20%', floatWaveBonus: 0.20 },
      rank3: { desc: '滿階特權：扣殺急墜提早 5 幀啟動，落點極度陡峭', sharpCutEarlyDrop: true }
    },
    subStatPool: ['ap', 'spikeSpeed', 'sweet']
  },
  {
    id: 'eq_wrist_str_sr', name: '破陣合金護腕', slot: 'wrist', tier: 'SR', mainStat: 'str',
    baseRange: [3, 5], refineGain: 0.5,
    perks: {
      rank1: { desc: '常規扣殺擊球容錯角度 +3°', spikeAngleBonus: 0.05 },
      rank2: { desc: '扣殺穿網阻尼衰減降低 8%', pierceDampBonus: 0.08 },
      rank3: { desc: '滿階特權：打手出界彈射向外偏折 8°', toolOutAngleBonus: 0.14 }
    },
    subStatPool: ['ap', 'spikeSpeed']
  },
  {
    id: 'eq_wrist_dex_sr', name: '精密氣壓護腕', slot: 'wrist', tier: 'SR', mainStat: 'dex',
    baseRange: [3, 5], refineGain: 0.5,
    perks: {
      rank1: { desc: '扣殺下旋力 +8%', topspinBonus: 0.08 },
      rank2: { desc: '跳飄球氣流晃動幅度 +12%', floatWaveBonus: 0.12 },
      rank3: { desc: '滿階特權：扣殺下旋提早 3 幀啟動', sharpCutEarlyDrop: true }
    },
    subStatPool: ['spikeSpeed', 'sweet']
  },
  {
    id: 'eq_wrist_str_r', name: '鍛造鐵腕', slot: 'wrist', tier: 'R', mainStat: 'str',
    baseRange: [1, 3], refineGain: 0.3,
    perks: {
      rank1: { desc: '扣球出膛初速 +0.2 px/f', spikeSpeedBonus: 0.2 },
      rank2: { desc: '站立平推初速 +0.4 px/f', pushSpeedBonus: 0.4 },
      rank3: { desc: '滿階特權：站立平推初速 +1.0 px/f', pushSpeedBonus: 1.0 }
    },
    subStatPool: ['spikeSpeed']
  },
  {
    id: 'eq_wrist_dex_r', name: '控球繃帶', slot: 'wrist', tier: 'R', mainStat: 'dex',
    baseRange: [1, 3], refineGain: 0.3,
    perks: {
      rank1: { desc: '二傳微偏容錯率提升', setterErrorReduce: 0.1 },
      rank2: { desc: '下旋下墜微幅增加', topspinBonus: 0.04 },
      rank3: { desc: '滿階特權：扣殺下旋力 +8%', topspinBonus: 0.08 }
    },
    subStatPool: ['sweet']
  },

  // --- 護膝類 (Kneepads) ---
  {
    id: 'eq_knee_agi_ssr', name: '神域不倒翁護膝', slot: 'knee', tier: 'SSR', mainStat: 'agi',
    baseRange: [5, 8], refineGain: 0.7,
    perks: {
      rank1: { desc: '魚躍撲救滑行距離 +10%', diveDistBonus: 0.10 },
      rank2: { desc: '魚躍撲救起身硬直縮短 6 幀', diveRecoveryBonus: 6 },
      rank3: { desc: '滿階特權：魚躍防守免除卸力打折，以 85% 滿額卸力起球', diveDefBuff: 0.15 }
    },
    subStatPool: ['reach', 'staminaRecovery', 'energyGain']
  },
  {
    id: 'eq_knee_dex_ssr', name: '絕對領域護膝', slot: 'knee', tier: 'SSR', mainStat: 'dex',
    baseRange: [5, 8], refineGain: 0.7,
    perks: {
      rank1: { desc: '接球覆蓋半徑額外 +3.0px', reachBonus: 3.0 },
      rank2: { desc: '地面被重扣震退硬直時間縮短 8 幀', knockbackStunReduce: 8 },
      rank3: { desc: '滿階特權：完美起球 (PERFECT ABSORB) 額外返還 15 點能量', perfectEnergyBonus: 15 }
    },
    subStatPool: ['reach', 'sweet', 'energyGain']
  },
  {
    id: 'eq_knee_agi_sr', name: '迅捷減震護膝', slot: 'knee', tier: 'SR', mainStat: 'agi',
    baseRange: [3, 5], refineGain: 0.5,
    perks: {
      rank1: { desc: '魚躍撲救滑行距離 +6%', diveDistBonus: 0.06 },
      rank2: { desc: '魚躍起身硬直縮短 3 幀', diveRecoveryBonus: 3 },
      rank3: { desc: '滿階特權：魚躍防守卸力率提升至 78%', diveDefBuff: 0.08 }
    },
    subStatPool: ['reach', 'staminaRecovery']
  },
  {
    id: 'eq_knee_dex_sr', name: '守護者護膝', slot: 'knee', tier: 'SR', mainStat: 'dex',
    baseRange: [3, 5], refineGain: 0.5,
    perks: {
      rank1: { desc: '接球覆蓋半徑額外 +1.8px', reachBonus: 1.8 },
      rank2: { desc: '地面重扣震退硬直縮短 4 幀', knockbackStunReduce: 4 },
      rank3: { desc: '滿階特權：完美起球額外返還 10 點能量', perfectEnergyBonus: 10 }
    },
    subStatPool: ['sweet', 'energyGain']
  },
  {
    id: 'eq_knee_agi_r', name: '輕量彈力帶', slot: 'knee', tier: 'R', mainStat: 'agi',
    baseRange: [1, 3], refineGain: 0.3,
    perks: {
      rank1: { desc: '轉身微調延遲減少 1 幀', reactionReduce: 1 },
      rank2: { desc: '魚躍初速微量增加', diveDistBonus: 0.03 },
      rank3: { desc: '滿階特權：魚躍撲救距離 +5%', diveDistBonus: 0.05 }
    },
    subStatPool: ['staminaRecovery']
  },
  {
    id: 'eq_knee_dex_r', name: '基礎防摔墊', slot: 'knee', tier: 'R', mainStat: 'dex',
    baseRange: [1, 3], refineGain: 0.3,
    perks: {
      rank1: { desc: '卸力值額外 +1.0', defRawBonus: 1.0 },
      rank2: { desc: '震退硬直微幅降低', knockbackStunReduce: 2 },
      rank3: { desc: '滿階特權：被重扣震退硬直縮短 3 幀', knockbackStunReduce: 3 }
    },
    subStatPool: ['reach']
  },

  // --- 球鞋類 (Footwear) ---
  {
    id: 'eq_shoe_jump_ssr', name: '天際逐月戰靴', slot: 'shoe', tier: 'SSR', mainStat: 'jump',
    baseRange: [5, 8], refineGain: 0.7,
    perks: {
      rank1: { desc: '垂直起跳摸高甜點半徑擴大 +6px', sweetSpotWindow: 6 },
      rank2: { desc: '助跑動能 (Run Momentum) 累積加快 20%', momentumRate: 0.20 },
      rank3: { desc: '滿階特權：大腿疲勞 (Jump Exhaustion) 衰減速度減半，起跳摸高不失速', exhaustionResist: 0.5 }
    },
    subStatPool: ['staminaRecovery', 'energyGain', 'spikeSpeed']
  },
  {
    id: 'eq_shoe_agi_ssr', name: '瞬步雷光排球鞋', slot: 'shoe', tier: 'SSR', mainStat: 'agi',
    baseRange: [5, 8], refineGain: 0.7,
    perks: {
      rank1: { desc: '常規橫移跑速增加 +0.4 px/f', runSpeedBonus: 0.4 },
      rank2: { desc: '站立完全不動時，大腿體力恢復加快 25%', staminaIdleRate: 0.25 },
      rank3: { desc: '滿階特權：網前攔網有效判定半徑擴大 +8px (達 78px)', blockReachBonus: 8 }
    },
    subStatPool: ['staminaRecovery', 'energyGain', 'reach']
  },
  {
    id: 'eq_shoe_jump_sr', name: '反重力氣墊鞋', slot: 'shoe', tier: 'SR', mainStat: 'jump',
    baseRange: [3, 5], refineGain: 0.5,
    perks: {
      rank1: { desc: '垂直起跳甜點半徑擴大 +4px', sweetSpotWindow: 4 },
      rank2: { desc: '助跑動能累積加快 10%', momentumRate: 0.10 },
      rank3: { desc: '滿階特權：大腿疲勞衰減速度降低 25%', exhaustionResist: 0.25 }
    },
    subStatPool: ['staminaRecovery', 'energyGain']
  },
  {
    id: 'eq_shoe_agi_sr', name: '疾風低筒鞋', slot: 'shoe', tier: 'SR', mainStat: 'agi',
    baseRange: [3, 5], refineGain: 0.5,
    perks: {
      rank1: { desc: '常規橫移跑速增加 +0.25 px/f', runSpeedBonus: 0.25 },
      rank2: { desc: '站立大腿體力恢復加快 15%', staminaIdleRate: 0.15 },
      rank3: { desc: '滿階特權：網前攔網判定半徑擴大 +5px', blockReachBonus: 5 }
    },
    subStatPool: ['staminaRecovery', 'reach']
  },
  {
    id: 'eq_shoe_jump_r', name: '彈簧訓練鞋', slot: 'shoe', tier: 'R', mainStat: 'jump',
    baseRange: [1, 3], refineGain: 0.3,
    perks: {
      rank1: { desc: '起跳高度微幅增加', jumpRawBonus: 0.1 },
      rank2: { desc: '助跑動能累積微量提升', momentumRate: 0.05 },
      rank3: { desc: '滿階特權：垂直起跳初速微增 +0.2 px/f', jumpRawBonus: 0.2 }
    },
    subStatPool: ['staminaRecovery']
  },
  {
    id: 'eq_shoe_agi_r', name: '橡膠膠底鞋', slot: 'shoe', tier: 'R', mainStat: 'agi',
    baseRange: [1, 3], refineGain: 0.3,
    perks: {
      rank1: { desc: '跑動煞車慣性略微減輕', brakeBonus: 0.1 },
      rank2: { desc: '橫移速度微增 +0.08 px/f', runSpeedBonus: 0.08 },
      rank3: { desc: '滿階特權：常規橫移跑速增加 +0.15 px/f', runSpeedBonus: 0.15 }
    },
    subStatPool: ['energyGain']
  }
];

// 副詞條定義池與數值區間
const SUBSTAT_RANGES = {
  ap: { name: '破甲穿透 (AP)', unit: '', R: [0.5, 1.0], SR: [1.0, 1.8], SSR: [1.8, 2.5] },
  reach: { name: '接球覆蓋 (Reach)', unit: 'px', R: [1.0, 2.5], SR: [2.5, 4.0], SSR: [4.0, 6.0] },
  sweet: { name: '甜蜜窗口 (Sweet)', unit: 'px', R: [1.0, 2.0], SR: [2.0, 3.5], SSR: [3.5, 5.0] },
  spikeSpeed: { name: '扣球初速 (Spd)', unit: 'px/f', R: [0.4, 0.8], SR: [0.8, 1.4], SSR: [1.4, 2.2] },
  staminaRecovery: { name: '大腿回氣 (Rec)', unit: '%', R: [5, 10], SR: [10, 18], SSR: [18, 25] },
  energyGain: { name: '大招充能 (Energy)', unit: '%', R: [4, 8], SR: [8, 14], SSR: [14, 20] }
};

// 技能庫 (保留原有完整技能)
const SKILL_POOL = [
  { id: 'sk_breaker', name: '破城重槌', cost: 100, type: 'SPIKE', desc: '【扣殺技】空中按J：破甲+9.0，大幅削弱敵方剛性，90%擊碎金盾！', armorPiercing: 9.0, speedMult: 1.08, extraDown: 0, glowColor: '#ef4444' },
  { id: 'sk_deep_impact', name: '深海重砲', cost: 140, type: 'SPIKE', desc: '【扣殺技】空中按J：長線平抽速度+18%，超強下旋咬入底線！', armorPiercing: 4.5, speedMult: 1.18, extraDown: 0.0002, glowColor: '#38bdf8' },
  { id: 'sk_steepexec', name: '斷頭台下釘', cost: 120, type: 'SPIKE', desc: '【扣殺技】空中按J：直插三米線大角度下釘，速度快且角度刁鑽！', armorPiercing: 6.0, speedMult: 0.95, extraDown: 0.00035, glowColor: '#facc15' },
  { id: 'sk_phantom', name: '幻影抹手', cost: 100, type: 'THRUST', desc: '【進攻技】空中按L：成功抹到攔網手時從接觸點分裂真假雙球；兩球以不同反射角飛出，假球可被誤接但不參與排球規則。', armorPiercing: 0, speedMult: 1.25, extraDown: 0, glowColor: '#10b981' },
  { id: 'sk_solar_sine', name: '落日正弦', cost: 120, type: 'SERVE_FLOAT', desc: '【發球技】K高拋後空中按L：高拋跳飄，空中正弦波劇烈晃動收斂！', armorPiercing: 0, speedMult: 1.0, extraDown: 0, glowColor: '#f59e0b' },
  { id: 'sk_sky_comet', name: '天際墜石', cost: 120, type: 'SERVE_SPIKE', desc: '【發球技】K高拋後空中按J：衝向天花板頂部，精確垂直下釘敵方深場！', armorPiercing: 7.5, speedMult: 1.0, extraDown: 0.0004, glowColor: '#facc15' },
  { id: 'sk_phantom_drop', name: '幽靈吊球', cost: 80, type: 'SET_ATTACK', desc: '【二傳/進攻技】第2觸空中按L：幽靈狀態無視攔網手，穿越封網後仍可被後排正常接起！', armorPiercing: 0, speedMult: 0.85, extraDown: 0, glowColor: null },
  { id: 'sk_chrono_spike', name: '閃電速攻', cost: 120, type: 'SET_TACTIC', desc: '【戰術技】處理球按O：觸發時流差，敵方全員進入30%子彈時間，畫面蒙上灰版！', armorPiercing: 3.0, speedMult: 1.2, extraDown: 0, glowColor: '#ec4899' },
  { id: 'sk_rolling_thunder', name: '雷霆瞬步', cost: 75, type: 'DEF_SAVE', desc: '【防守技】己方半場按K：化為殘影瞬移至球落點，100%觸發完美吸震！', armorPiercing: 0, speedMult: 1.0, extraDown: 0, glowColor: '#38bdf8' },
  { id: 'sk_mud_spike', name: '泥沼重扣', cost: 110, type: 'SPIKE', desc: '【扣殺技】空中按J：包裹厚重泥濘暴扣！敵方若接起陷入泥濘減速！', armorPiercing: 5.0, speedMult: 1.12, extraDown: 0.0001, glowColor: '#78350f' },
  { id: 'sk_bungee_gum', name: '伸縮自在的愛', cost: 110, type: 'SPIKE', desc: '【扣殺/抹手】按J/L：低手接起時反彈高度驟降70%，向前微弱軟墜！', armorPiercing: 3.0, speedMult: 1.05, extraDown: 0, glowColor: '#f472b6' },
  { id: 'sk_iron_wall', name: '銅牆鐵壁', cost: 130, type: 'BLOCK', desc: '【攔網技】網前按Space：碰到球觸發定格特寫，3.5倍速垂直下釘死蓋！', armorPiercing: 0, speedMult: 1.0, extraDown: 0, glowColor: '#fbbf24' },
  { id: 'sk_soft_wall', name: '引力柔網', cost: 100, type: 'BLOCK_STANCE', desc: '【攔網持續態】網前按Space：持續3回合！碰球100%化為慢速One Touch緩送！', armorPiercing: 0, speedMult: 1.0, extraDown: 0, glowColor: '#2dd4bf' },
  { id: 'sk_shock_return', name: '暴風反彈', cost: 95, type: 'DEF_SAVE', desc: '【防守技】接球消耗：即使接噴必定過網，球化為超音速暴風直貫敵場！', armorPiercing: 8.0, speedMult: 1.3, extraDown: 0, glowColor: '#0ea5e9' },
  { id: 'sk_godspeed_toss', name: '神速二傳', cost: 105, type: 'SET_TACTIC', desc: '【二傳持續態】托球觸發：持續3次二傳！隊友進攻初速獲得+4.0絕對加成！', armorPiercing: 4.0, speedMult: 1.2, extraDown: 0, glowColor: '#eab308' },
  { id: 'sk_greased_ball', name: '油滑脫手', cost: 115, type: 'SPIKE', desc: '【進攻技】空中按J：包覆油膜；攔網不會引爆，僅敵方一傳或觸地時爆裂，150px油濺範圍內敵人防守-25%持續3回合。', armorPiercing: 6.0, speedMult: 1.1, extraDown: 0, glowColor: '#d97706' },
  { id: 'sk_gravity_drop', name: '重力斷崖', cost: 125, type: 'SPIKE', desc: '【扣殺技】空中按J：過網瞬間引力暴增12倍垂直砸地！', armorPiercing: 5.5, speedMult: 1.25, extraDown: 0.0005, glowColor: '#7e22ce' },
  { id: 'sk_savage_roar', name: '野蠻怒吼', cost: 90, type: 'DEF_SAVE', desc: '【戰吼技】按K立即釋放：我軍3回合不可消除亢奮，敵軍全員覆蓋沮喪！', armorPiercing: 0, speedMult: 1.0, extraDown: 0, glowColor: '#dc2626' },
  { id: 'sk_flow_absorb', name: '心流化勁', cost: 100, type: 'DEF_SAVE', desc: '【防守技】接球時啟動，維持本回合＋後續2回合：K必定Perfect Absorb；L有70%機率化為Perfect Absorb。', armorPiercing: 0, speedMult: 1.0, extraDown: 0, glowColor: '#14b8a6' },
  { id: 'sk_time_lag', name: '時流差', cost: 120, type: 'SPIKE', desc: '【扣殺技】空中按J：擊球瞬間球停在打點且不可觸碰，短暫時間停止後才以原動能射出。', armorPiercing: 4.0, speedMult: 1.08, extraDown: 0.00008, glowColor: '#a78bfa' },
  { id: 'sk_kinetic_counter', name: '動能反噬', cost: 110, type: 'BLOCK', desc: '【攔網技】網前按Space：借用來球動能送往對方上空，再高速墜回敵場；來球越重反攻越兇，輕吊天然克制。', armorPiercing: 0, speedMult: 1.0, extraDown: 0, glowColor: '#fb7185' }
];

const COSMETICS_DB = {
  hats: [
    { id: 'hat_none', name: '無頭飾', desc: '卸下頭飾' }, { id: 'hat_santa', name: '聖誕帽', desc: '節慶紅白毛球帽' },
    { id: 'hat_tophat', name: '高禮帽', desc: '優雅紳士高筒黑帽' }, { id: 'hat_pompadour', name: '飛機頭', desc: '霸氣復古機車搖滾頭' },
    { id: 'hat_afro', name: '爆炸頭', desc: '經典蓬鬆復古爆炸頭' }, { id: 'hat_party', name: '派對尖帽', desc: '歡樂彩色條紋派對帽' },
    { id: 'hat_rabbit', name: '兔耳朵', desc: '俏皮晃動兔耳頭箍' }, { id: 'hat_sprout', name: '頭上長草', desc: '萌萌小樹苗嫩芽' },
    { id: 'hat_head_shades', name: '頭頂墨鏡', desc: '隨興推在額頭的酷墨鏡' }, { id: 'hat_cap_red', name: '紅鴨舌帽', desc: '運動街頭棒球帽（紅）' },
    { id: 'hat_cap_blue', name: '藍鴨舌帽', desc: '運動街頭棒球帽（藍）' }, { id: 'hat_cap_black', name: '黑鴨舌帽', desc: '百搭街頭棒球帽（黑）' },
    { id: 'hat_helmet', name: '鋼鐵頭盔', desc: '前排重裝防護全罩頭盔' }, { id: 'hat_cat', name: '黑貓耳', desc: '敏捷靈動貓耳頭飾' },
    { id: 'hat_dog', name: '柴犬耳', desc: '垂耳元氣犬耳' }, { id: 'hat_crown', name: '黃金小王冠', desc: '榮耀王者迷你皇冠' },
    { id: 'hat_halo', name: '天使光環', desc: '懸浮頭頂的純潔光環' }, { id: 'hat_devil', name: '惡魔尖角', desc: '深紅危險小惡魔角' },
    { id: 'hat_viking', name: '維京角盔', desc: '狂野雙牛角戰士盔' }, { id: 'hat_chef', name: '主廚高帽', desc: '專業白色高筒廚師帽' },
    { id: 'hat_bandana', name: '熱血頭帶', desc: '必勝紅白文字頭帶' }, { id: 'hat_straw', name: '冒險草帽', desc: '經典紅色緞帶草帽' },
    { id: 'hat_poop', name: '頭頂便便', desc: '毫無尊嚴但存在感極高', source: 'gacha' },
    { id: 'hat_potlid', name: '鍋蓋防護罩', desc: '阿嬤廚房流防禦科技', source: 'gacha' },
    { id: 'hat_arrow', name: '箭穿頭', desc: '看起來很痛，其實只是頭飾', source: 'gacha' },
    { id: 'hat_birdnest', name: '雞窩', desc: '鳥巢、蛋，以及對人生的放棄', source: 'gacha' },
    { id: 'hat_bird_perch', name: '海鳥停機坪', desc: '讓一隻海鳥理直氣壯站在你頭上', source: 'achievement', hint: '最後碰球的人負責跟鳥的家屬談。' },
    { id: 'hat_space_junk', name: '紙糊太空盔', desc: '看起來完全沒有通過氣密測試', source: 'achievement', hint: 'NASA 沒有認證，紙箱店老闆有。' },
    { id: 'hat_hardhat', name: '工地安全帽', desc: '今日工安宣導：不要拿臉接重砲', source: 'achievement', hint: '工安規定沒說可以在吊車下面打排球。' },
    { id: 'hat_fair_tea', name: '公道伯的茶', desc: '一杯平平穩穩頂在頭上的公正熱茶', source: 'achievement', hint: '大家都辛苦了。喝口茶再重發。' }
  
  ],
  faces: [
    { id: 'face_none', name: '無臉飾', desc: '卸下臉飾' }, { id: 'face_shades', name: '帥氣墨鏡', desc: '巨星防眩深黑墨鏡' },
    { id: 'face_mustache', name: '八字鬍', desc: '紳士翹角小八字鬍' }, { id: 'face_goatee', name: '山羊鬍', desc: '個性十足的山羊長鬍鬚' },
    { id: 'face_mask', name: '防疫口罩', desc: '立體防塵純白口罩' }, { id: 'face_spiral_glasses', name: '螺旋眼鏡', desc: '圈圈眼搞笑深度近視鏡' },
    { id: 'face_ruby_earring', name: '紅寶石耳環', desc: '左耳微閃璀璨紅寶石' }, { id: 'face_blush', name: '紅暈腮紅', desc: '害羞粉嫩大紅臉蛋' },
    { id: 'face_monocle', name: '單片眼鏡', desc: '英倫老派金色鏈條單鏡' }, { id: 'face_bandage', name: '鼻樑創可貼', desc: '熱血運動受傷交叉貼' },
    { id: 'face_cigar', name: '硬漢雪茄', desc: '吞雲吐霧的硬派雪茄' }, { id: 'face_eye_patch', name: '海盜眼罩', desc: '漆黑皮革單眼眼罩' },
    { id: 'face_fox_mask', name: '半面狐面', desc: '和風紅白花紋狐狸面具' }, { id: 'face_bubble_gum', name: '吹泡泡糖', desc: '嘴邊粉紅大泡泡' },
    { id: 'face_scuba', name: '浮潛呼吸管', desc: '水下專業咬嘴呼吸管' }, { id: 'face_vr', name: '未來VR鏡', desc: '發光矩陣賽博護目鏡' },
    { id: 'face_clown_nose', name: '小丑紅鼻', desc: '圓滾滾紅色海綿鼻' }, { id: 'face_rose', name: '口銜玫瑰', desc: '優雅深紅帶刺玫瑰花' },
    { id: 'face_scar', name: '戰士刀疤', desc: '左眼深邃男子漢傷痕' }, { id: 'face_toast', name: '遲到咬吐司', desc: '嘴裡叼著快遲到的土司片' },
    { id: 'face_gas_mask', name: '防毒濾嘴', desc: '工業風重裝呼吸面罩' },
    { id: 'face_tissue', name: '鼻孔衛生紙', desc: '感冒還是要上場，敬業', source: 'gacha' },
    { id: 'face_nosebleed', name: '熱血鼻血', desc: '不知道看到了什麼，總之先流', source: 'gacha' },
    { id: 'face_pixel', name: '馬賽克眼', desc: '基於某些原因必須保護當事人', source: 'gacha' },
    { id: 'face_teeth', name: '暴牙門牙', desc: '接球前先把門牙收好', source: 'gacha' },
    { id: 'face_pacifier', name: '戰鬥奶嘴', desc: '心理素質從嬰兒開始培養', source: 'gacha' },
    { id: 'face_oxygen', name: '廉價氧氣罩', desc: '跟紙糊太空盔搭配更令人不安', source: 'achievement', hint: '它看起來能供氧。看起來。' },
    { id: 'face_birdmark', name: '鳥屎戰痕', desc: '這不是污漬，是榮譽', source: 'achievement', hint: '牠可能不是故意的。但我不信。' }
  ],
  effects: [
    { id: 'fx_none', name: '無特效', glow: null, desc: '無額外光暈' },
    { id: 'fx_swamp', name: '沼澤劇毒', glow: '#22c55e', desc: '第二關獎勵：深綠劇毒氣場' },
    { id: 'fx_steel', name: '鋼鐵巨神', glow: '#94a3b8', desc: '第三關獎勵：鈦灰剛性光暈' },
    { id: 'fx_storm', name: '暴風雷鳴', glow: '#38bdf8', desc: '第四關獎勵：天藍疾風電光' },
    { id: 'fx_god', name: '神域金耀', glow: '#facc15', desc: '冠軍獎勵：耀眼尊爵金光' },
    { id: 'fx_feathers', name: '羽毛漫天', glow: '#f8fafc', desc: '羽毛不停從身邊飄落', source: 'achievement', hint: '球得分了。鳥的部分我們不要再追究。' },
    { id: 'fx_leak', name: '太空漏氣', glow: '#a5f3fc', desc: '持續冒出可疑的小氣泡', source: 'achievement', hint: '它看起來能供氧。看起來。' },
    { id: 'fx_flies', name: '蒼蠅環繞', glow: '#84cc16', desc: '三隻忠實粉絲永遠不離不棄', source: 'achievement', hint: '一項不太光彩的特殊紀念' },
    { id: 'fx_welding', name: '電焊火花', glow: '#fb923c', desc: '腳邊不定時迸出工業火花', source: 'achievement', hint: '焊接面罩不是裝飾。你偏要當裝飾。' },
    { id: 'fx_splash', name: '甲板水花', glow: '#38bdf8', desc: '移動時像剛踩過一灘海水', source: 'achievement', hint: '甲板很滑。尊嚴也是。' },
    { id: 'fx_blackout', name: '故障閃爍', glow: '#e2e8f0', desc: '角色光暈像壞掉的日光燈忽明忽暗', source: 'achievement', hint: '在黑暗與復電之間留下紀念' },
    { id: 'fx_beach_ball_body', name: '球就是我', glow: '#facc15', desc: '整個角色直接變成沙灘排球，連眼睛都沒有', source: 'achievement', hint: '不落地連續被沙灘球彈三次。人球合一。' }
  ]
};

let UNLOCKED_COSMETICS = { hats: ['hat_none'], faces: ['face_none'], effects: ['fx_none'] };
// V28: 新增技能必須走完整 Player Flow。這三招為本次系統新增技能，直接授予既有/新玩家供裝備與測試。
const V28_GRANTED_SKILLS = ['sk_flow_absorb', 'sk_time_lag', 'sk_kinetic_counter'];
let UNLOCKED_SKILLS = ['sk_breaker', ...V28_GRANTED_SKILLS];

// 玩家擁有的裝備背包清單
let INVENTORY_EQUIPS = [];

const GACHA_POOL = [
  { name: '黑岩霸生', tier: 'SSR', color: '#0f172a', desc: '極限物理輸出·直線下釘重砲手！', base: { str: 38, agi: 18, jump: 32, dex: 15, int: 14 }, bonusPts: 10 },
  { name: '白鳥神威', tier: 'SSR', color: '#e0e7ff', desc: '全能二傳指揮塔·時流掌控！', base: { str: 22, agi: 26, jump: 24, dex: 36, int: 38 }, bonusPts: 10 },
  { name: '鋼鐵鐵柱', tier: 'SSR', color: '#475569', desc: '網前巨人之牆·封網天花板！', base: { str: 32, agi: 16, jump: 38, dex: 22, int: 25 }, bonusPts: 10 },
  { name: '風魔迅平', tier: 'SSR', color: '#14b8a6', desc: '全場極速守備·雷霆瞬步！', base: { str: 14, agi: 42, jump: 20, dex: 34, int: 30 }, bonusPts: 10 },
  { name: '桐生剎那', tier: 'SSR', color: '#b91c1c', desc: '技術流主攻·極致包球上旋！', base: { str: 28, agi: 24, jump: 30, dex: 38, int: 24 }, bonusPts: 10 },
  { name: '赤城蓮', tier: 'SSR', color: '#dc2626', desc: '重裝攻城槌·極致破甲暴扣！', base: { str: 40, agi: 20, jump: 34, dex: 18, int: 15 }, bonusPts: 10 },
  { name: '神威光流', tier: 'SSR', color: '#0284c7', desc: '神域之盾·不倒的極限接球！', base: { str: 16, agi: 44, jump: 24, dex: 36, int: 32 }, bonusPts: 10 },
  { name: '鬼塚豪', tier: 'SSR', color: '#334155', desc: '攔網絕壁·網前遮蔽天日！', base: { str: 34, agi: 18, jump: 40, dex: 24, int: 26 }, bonusPts: 10 },
  { name: '月詠夜空', tier: 'SSR', color: '#8b5cf6', desc: '幻象司令塔·支配時間軌跡！', base: { str: 20, agi: 28, jump: 26, dex: 38, int: 40 }, bonusPts: 10 },
  { name: '犬飼雷藏', tier: 'SR', color: '#eab308', desc: '天際雷鳴轟炸！', base: { str: 32, agi: 26, jump: 30, dex: 22, int: 20 }, bonusPts: 6 },
  { name: '水無月涼', tier: 'SR', color: '#38bdf8', desc: '卸力防守專家·幽靈偷渡！', base: { str: 16, agi: 30, jump: 18, dex: 32, int: 30 }, bonusPts: 6 },
  { name: '夜叉丸', tier: 'SR', color: '#6b21a8', desc: '落日正弦·氣流掌控者！', base: { str: 22, agi: 28, jump: 26, dex: 36, int: 32 }, bonusPts: 6 },
  { name: '轟原剛', tier: 'SR', color: '#c2410c', desc: '高打點強攻手·斷頭重扣！', base: { str: 34, agi: 20, jump: 30, dex: 22, int: 16 }, bonusPts: 6 },
  { name: '神代千尋', tier: 'SR', color: '#4338ca', desc: '大局觀控場·落點狙擊！', base: { str: 18, agi: 26, jump: 20, dex: 30, int: 34 }, bonusPts: 6 },
  { name: '火神大輝', tier: 'SR', color: '#ea580c', desc: '滯空重扣飛人！', base: { str: 30, agi: 26, jump: 36, dex: 24, int: 18 }, bonusPts: 6 },
  { name: '鳴神悠', tier: 'SR', color: '#06b6d4', desc: '雷霆折射飄球！', base: { str: 24, agi: 30, jump: 24, dex: 34, int: 28 }, bonusPts: 6 },
  { name: '橘真琴', tier: 'SR', color: '#10b981', desc: '穩定後排核心！', base: { str: 22, agi: 32, jump: 22, dex: 30, int: 30 }, bonusPts: 6 },
  { name: '冰室辰也', tier: 'SR', color: '#6366f1', desc: '優雅假托真扣！', base: { str: 26, agi: 24, jump: 28, dex: 34, int: 32 }, bonusPts: 6 },
  { name: '影山飛雄型', tier: 'SR', color: '#1e3a8a', desc: '精準秒速傳球！', base: { str: 22, agi: 28, jump: 28, dex: 36, int: 34 }, bonusPts: 6 },
  { name: '西谷夕型', tier: 'SR', color: '#d97706', desc: '翻滾吧雷霆守護神！', base: { str: 18, agi: 38, jump: 22, dex: 34, int: 28 }, bonusPts: 6 },
  { name: '柴田健吾', tier: 'R', color: '#d97706', desc: '熱血撲救型接球手！', base: { str: 18, agi: 30, jump: 20, dex: 24, int: 20 }, bonusPts: 3 },
  { name: '荒垣左之助', tier: 'R', color: '#be123c', desc: '左手重槌·折射刁鑽！', base: { str: 28, agi: 22, jump: 24, dex: 22, int: 16 }, bonusPts: 3 },
  { name: '真鍋算', tier: 'R', color: '#0284c7', desc: '精準量角器·機械式二傳！', base: { str: 16, agi: 24, jump: 20, dex: 28, int: 26 }, bonusPts: 3 },
  { name: '木村隼人', tier: 'R', color: '#7c3aed', desc: '側翼滑步扣手！', base: { str: 24, agi: 26, jump: 24, dex: 24, int: 20 }, bonusPts: 3 },
  { name: '高橋大地', tier: 'R', color: '#047857', desc: '深蹲穩實一傳！', base: { str: 20, agi: 24, jump: 22, dex: 26, int: 24 }, bonusPts: 3 },
  { name: '松本潤平', tier: 'R', color: '#b45309', desc: '輕巧擦手抹球！', base: { str: 18, agi: 28, jump: 20, dex: 28, int: 22 }, bonusPts: 3 },
  { name: '野村哲也', tier: 'R', color: '#475569', desc: '前排堅實封堵！', base: { str: 26, agi: 18, jump: 28, dex: 20, int: 22 }, bonusPts: 3 },
  { name: '長谷川健', tier: 'R', color: '#0891b2', desc: '超手長弧線跳發！', base: { str: 24, agi: 22, jump: 26, dex: 26, int: 20 }, bonusPts: 3 },
  { name: '宮崎駿介', tier: 'R', color: '#9f1239', desc: '暴力壓下手腕！', base: { str: 28, agi: 20, jump: 24, dex: 22, int: 18 }, bonusPts: 3 },
  { name: '佐藤悠真', tier: 'N', color: '#64748b', desc: '標準初學者·平衡攻手！', base: { str: 20, agi: 22, jump: 20, dex: 20, int: 20 }, bonusPts: 0 },
  { name: '鈴木拓海', tier: 'N', color: '#94a3b8', desc: '認真基本功二傳！', base: { str: 18, agi: 22, jump: 18, dex: 24, int: 20 }, bonusPts: 0 },
  { name: '渡邊和樹', tier: 'N', color: '#71717a', desc: '剛入社熱血新秀！', base: { str: 22, agi: 20, jump: 20, dex: 18, int: 18 }, bonusPts: 0 },
  { name: '伊藤健太', tier: 'N', color: '#78716c', desc: '基本功接球手！', base: { str: 18, agi: 22, jump: 18, dex: 22, int: 20 }, bonusPts: 0 },
  { name: '小林拓也', tier: 'N', color: '#a1a1aa', desc: '努力型網前防守！', base: { str: 20, agi: 18, jump: 22, dex: 18, int: 20 }, bonusPts: 0 }
];

let INVENTORY = [
  { id: 'c1', name: '青空主攻手', tier: 'N', color: '#38bdf8', level: 1, exp: 0, freePts: 5, baseStats: { str: 20, agi: 22, jump: 20, dex: 20, int: 20 }, stats: { str: 20, agi: 22, jump: 20, dex: 20, int: 20 }, equippedSkill: 'sk_breaker', cosmetics: { hat: 'hat_none', face: 'face_none', effect: 'fx_none' }, equipSlotA: null, equipSlotB: null },
  { id: 'c2', name: '森綠自由人', tier: 'N', color: '#34d399', level: 1, exp: 0, freePts: 5, baseStats: { str: 20, agi: 24, jump: 20, dex: 20, int: 20 }, stats: { str: 20, agi: 24, jump: 20, dex: 20, int: 20 }, equippedSkill: 'sk_breaker', cosmetics: { hat: 'hat_none', face: 'face_none', effect: 'fx_none' }, equipSlotA: null, equipSlotB: null },
  { id: 'c3', name: '緋紅副攻手', tier: 'N', color: '#f472b6', level: 1, exp: 0, freePts: 5, baseStats: { str: 20, agi: 22, jump: 20, dex: 20, int: 20 }, stats: { str: 20, agi: 22, jump: 20, dex: 20, int: 20 }, equippedSkill: 'sk_breaker', cosmetics: { hat: 'hat_none', face: 'face_none', effect: 'fx_none' }, equipSlotA: null, equipSlotB: null },
  { id: 'c4', name: '紫電二傳手', tier: 'N', color: '#c084fc', level: 1, exp: 0, freePts: 5, baseStats: { str: 20, agi: 22, jump: 20, dex: 20, int: 20 }, stats: { str: 20, agi: 22, jump: 20, dex: 20, int: 20 }, equippedSkill: 'sk_breaker', cosmetics: { hat: 'hat_none', face: 'face_none', effect: 'fx_none' }, equipSlotA: null, equipSlotB: null }
];

// V16：永久隊伍與本場陣容分離。
// SAVED_ROSTER = 玩家在更衣室保存的四格隊伍；ACTIVE_ROSTER = 當前模式實際上場名單。
let SAVED_ROSTER = { user: INVENTORY[0], mate: INVENTORY[1], enemyFront: INVENTORY[2], enemyBack: INVENTORY[3] };
let ACTIVE_ROSTER = { ...SAVED_ROSTER };

function sanitizeSavedRoster(requestedIds = null) {
  const slots = ['user', 'mate', 'enemyFront', 'enemyBack'];
  const used = new Set();
  const next = {};
  slots.forEach((slot, index) => {
    const wantedId = requestedIds ? requestedIds[slot] : (SAVED_ROSTER[slot] && SAVED_ROSTER[slot].id);
    let card = INVENTORY.find(c => c.id === wantedId && !used.has(c.id));
    if (!card) card = INVENTORY.find(c => !used.has(c.id)) || INVENTORY[index] || INVENTORY[0];
    next[slot] = card;
    if (card) used.add(card.id);
  });
  SAVED_ROSTER = next;
}

function restoreActiveRosterFromSaved(rebindPlayers = false) {
  sanitizeSavedRoster();
  ACTIVE_ROSTER.user = SAVED_ROSTER.user;
  ACTIVE_ROSTER.mate = SAVED_ROSTER.mate;
  ACTIVE_ROSTER.enemyFront = SAVED_ROSTER.enemyFront;
  ACTIVE_ROSTER.enemyBack = SAVED_ROSTER.enemyBack;
  if (rebindPlayers && typeof allPlayers !== 'undefined') allPlayers.forEach(p => p.rebind(true));
}

function setPersistentRosterSlot(slot, card) {
  if (!card || !Object.prototype.hasOwnProperty.call(SAVED_ROSTER, slot)) return;
  SAVED_ROSTER[slot] = card;
  ACTIVE_ROSTER[slot] = card;
}
let userCoins = 99999;
const STORAGE_KEY = 'VOLLEY_ARENA_SAVE_DATA_2026_EQUIP_PATCH';

// 關卡純時裝
const CAREER_STAGES = [
  {
    id: 1, name: '青葉新秀高校', subtitle: '初階考核·基礎攻防', color: '#34d399', rewardCoins: 200, rewardSkin: null,
    front: { name: '佐藤悠真', tier: 'N', color: '#64748b', stats: { str: 20, agi: 20, jump: 20, dex: 20, int: 20 }, equippedSkill: 'sk_breaker' },
    back:  { name: '伊藤健太', tier: 'N', color: '#78716c', stats: { str: 20, agi: 22, jump: 20, dex: 20, int: 20 }, equippedSkill: 'sk_phantom' },
    desc: '標準基本功球隊，無特殊大招，適合熟悉手感與進攻節奏。'
  },
  {
    id: 2, name: '泥濘沼澤工科', subtitle: '黏性控場·泥沼狂潮', color: '#78350f', rewardCoins: 350, rewardSkin: 'fx_swamp',
    front: { name: '轟原剛', tier: 'SR', color: '#c2410c', stats: { str: 32, agi: 22, jump: 28, dex: 24, int: 22 }, equippedSkill: 'sk_mud_spike' },
    back:  { name: '水無月涼', tier: 'SR', color: '#38bdf8', stats: { str: 18, agi: 32, jump: 20, dex: 34, int: 32 }, equippedSkill: 'sk_bungee_gum' },
    desc: '擅長【泥沼重扣】與【伸縮自在的愛】，接球者極易陷入泥濘減速與軟墜！'
  },
  {
    id: 3, name: '常盤鋼鐵壁壘', subtitle: '絕對封殺·網前巨人', color: '#64748b', rewardCoins: 500, rewardSkin: 'fx_steel',
    front: { name: '鋼鐵鐵柱', tier: 'SSR', color: '#475569', stats: { str: 38, agi: 18, jump: 42, dex: 24, int: 26 }, equippedSkill: 'sk_iron_wall' },
    back:  { name: '柴田健吾', tier: 'R', color: '#d97706', stats: { str: 22, agi: 34, jump: 22, dex: 26, int: 24 }, equippedSkill: 'sk_soft_wall' },
    desc: '前排裝備【銅牆鐵壁】與【引力柔網】，剛性極強，正面強攻極易被攔死！'
  },
  {
    id: 4, name: '疾風怒濤聯隊', subtitle: '極限反撲·音速暴風', color: '#0284c7', rewardCoins: 700, rewardSkin: 'fx_storm',
    front: { name: '桐生剎那', tier: 'SSR', color: '#b91c1c', stats: { str: 32, agi: 28, jump: 32, dex: 38, int: 26 }, equippedSkill: 'sk_greased_ball' },
    back:  { name: '神威光流', tier: 'SSR', color: '#0284c7', stats: { str: 20, agi: 46, jump: 26, dex: 38, int: 34 }, equippedSkill: 'sk_shock_return' },
    desc: '後排神域撲救自帶【暴風反彈】，進攻帶有【油滑脫手】削弱我方防守！'
  },
  {
    id: 5, name: '神域全明星隊', subtitle: '全國冠軍·終極巔峰', color: '#facc15', rewardCoins: 1200, rewardSkin: 'fx_god',
    front: { name: '黑岩霸生', tier: 'SSR', color: '#0f172a', stats: { str: 44, agi: 24, jump: 38, dex: 22, int: 20 }, equippedSkill: 'sk_gravity_drop' },
    back:  { name: '白鳥神威', tier: 'SSR', color: '#e0e7ff', stats: { str: 24, agi: 32, jump: 28, dex: 42, int: 42 }, equippedSkill: 'sk_godspeed_toss' },
    desc: '終極 BOSS！具備【神速二傳】初速貫通加成，以及越過白帶垂直暴墜的【重力斷崖】！'
  }
];

let careerProgress = 1;
let currentCareerStage = 1;
let isCareerMode = false;

// ========================================================
// 🪜 天梯五度五關博弈押注狀態與倍率常數 (賭狗模式)
// ========================================================
let isLadderMode = false;
let ladderCurrentRun = {
  active: false,
  currentFloor: 1,        // 當前第幾階 (1 ~ 5)
  betAmount: 100,         // 入場押注本金
  currentPot: 0,          // 當前累積滾存獎池 (若輸球全數沒收)
  isGambleMode: false,    // 是否開啟天堂 or 地獄
  mateTier: null,         // 抽到的隊友階級
  mateBonusMult: 0        // 隊友加算倍率
};

// 各關過關基礎累積倍率 (加算制基礎)
const LADDER_BASE_FLOOR_MULT = {
  1: 1.2,
  2: 1.6,
  3: 2.2,
  4: 3.0,
  5: 4.5
};

// 天堂 or 地獄：隊友稀有度加成數值 (加算在基礎倍率上)
const LADDER_GAMBLE_ADDONS = {
  N: 1.0,     // 滿關倍率達到 4.5 + 1.0 = 5.5x
  R: 0.5,     // 滿關倍率達到 4.5 + 0.5 = 5.0x
  SR: 0.2,    // 滿關倍率達到 4.5 + 0.2 = 4.7x
  SSR: -1.0   // 滿關倍率降為 4.5 - 1.0 = 3.5x (神仙躺贏折損)
};

// 對手動態難度階梯設定
const LADDER_TIERS = {
  1: { id: 1, name: '入門階梯 (Rookie)', tiers: ['N', 'N'], minLv: 3, maxLv: 5, minAP: 10, maxAP: 20, desc: '入門新秀，基礎技能，手感平穩。' },
  2: { id: 2, name: '初階階梯 (Normal)', tiers: ['N', 'R'], minLv: 6, maxLv: 9, minAP: 25, maxAP: 40, desc: '開始出現特定專精選手，帶來基本壓迫。' },
  3: { id: 3, name: '中階階梯 (Hard)', tiers: ['R', 'SR'], minLv: 10, maxLv: 13, minAP: 45, maxAP: 60, desc: '球速與手型剛性提升，考驗攻防組織。' },
  4: { id: 4, name: '高階階梯 (Expert)', tiers: ['SR', 'SR'], minLv: 14, maxLv: 17, minAP: 65, maxAP: 80, desc: '節奏極快，具備極限魚躍救球與精準攔網。' },
  5: { id: 5, name: '巔峰階梯 (Master)', tiers: ['SSR', 'SSR'], minLv: 18, maxLv: 20, minAP: 85, maxAP: 100, desc: '終極挑戰！全明星雙 SSR 陣容，失誤即失分。' }
};

// 強化金幣指數成長計算: Base * (1.35)^(level-1)
function getEquipRefineCost(level) {
  if (level >= 10) return null;
  const cost = Math.round(80 * Math.pow(1.35, level));
  return cost;
}

// 重鑄金幣成長計算: 50 + 35 * (reforgeCount)^1.35
function getEquipReforgeCost(reforgeCount) {
  return Math.round(50 + 35 * Math.pow(reforgeCount, 1.35));
}

// 建立隨機裝備實體
function generateEquipmentInstance(itemId) {
  const dbItem = EQUIP_DB.find(e => e.id === itemId);
  if (!dbItem) return null;

  const baseRoll = Math.floor(Math.random() * (dbItem.baseRange[1] - dbItem.baseRange[0] + 1)) + dbItem.baseRange[0];
  
  // 隨機 1 ~ 2 條副詞條
  const subCount = (dbItem.tier === 'SSR' || Math.random() < 0.5) ? 2 : 1;
  const pool = [...dbItem.subStatPool];
  const chosenSubs = [];

  for (let i = 0; i < subCount; i++) {
    if (pool.length === 0) break;
    const rIdx = Math.floor(Math.random() * pool.length);
    const subType = pool.splice(rIdx, 1)[0];
    const range = SUBSTAT_RANGES[subType][dbItem.tier];
    const val = parseFloat((range[0] + Math.random() * (range[1] - range[0])).toFixed(1));
    chosenSubs.push({ type: subType, val: val, min: range[0], max: range[1] });
  }

  return {
    instanceId: 'eq_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
    itemId: dbItem.id,
    name: dbItem.name,
    slot: dbItem.slot,
    tier: dbItem.tier,
    refineLevel: 0,
    rank: 0, // 0~3 階
    reforgeCount: 0,
    locked: false,
    mainStatType: dbItem.mainStat,
    baseRoll: baseRoll,
    subStats: chosenSubs
  };
}

// ========================================================
// V75-3 STAT ARCHITECTURE / BALANCE LAB shared formula helpers
// Internal save keys remain str/agi/jump/dex/int for backward compatibility.
// UI/design language uses TEC for dex from this build forward.
// ========================================================
const STAT_MARGINAL = Object.freeze({
  str:  { knee: 40, highSlope: 0.85, over60Slope: 0.45 },
  agi:  { knee: 40, highSlope: 0.75, over60Slope: 0.40 },
  jump: { knee: 40, highSlope: 0.70, over60Slope: 0.38 },
  dex:  { knee: 40, highSlope: 0.75, over60Slope: 0.40 }, // DEX save-key == TEC design-stat
  int:  { knee: 40, highSlope: 0.80, over60Slope: 0.45 }
});
function effectiveStatValue(statKey, rawValue){
  const c=STAT_MARGINAL[statKey]||{knee:40,highSlope:.8,over60Slope:.4};
  const raw=Math.max(0, Number(rawValue)||0);
  if(raw<=c.knee) return raw;
  const to60=Math.min(raw,60)-c.knee;
  const over=Math.max(0,raw-60);
  return c.knee + to60*c.highSlope + over*c.over60Slope;
}
function mergePerkStack(target, source){
  if(!source) return target;
  for(const [key,val] of Object.entries(source)){
    if(key==='desc') continue;
    if(typeof val==='number') target[key]=(Number(target[key])||0)+val;
    else if(typeof val==='boolean') target[key]=!!target[key]||val;
    else if(target[key]===undefined) target[key]=val;
  }
  return target;
}
function computeSpikeFormula(stats, runMomentum=0){
  const ratio=Math.max(0,Math.min(1,(Number(runMomentum)||0)/25));
  const bonusPower=ratio*4.2;
  const techFactor=0.85+(stats.technique*0.25);
  return {momentumRatio:ratio,bonusPower,techFactor,effectivePower:(stats.power+bonusPower)*techFactor};
}
function computeReceivePressureFormula(stats, ballSpeed, floatBonus=0, defenseOverride=null){
  const effectiveDef=defenseOverride==null?stats.defense:defenseOverride;
  // V75-3: TEC still owns receive execution through Defense/Sweet/Reach, but it no longer
  // multiplies the same receive pressure a second time through Technique.
  return Math.max(0,(ballSpeed+floatBonus)*0.95-effectiveDef);
}
function computeSetFormula(stats,{incomingSpeed=15,contactDist=0,lowBallSeverity=0,specialPressure=0}={}){
  const setSweet=stats.sweetWindow||34;
  const speedExcess=Math.max(0,incomingSpeed-15);
  const distanceExcess=Math.max(0,contactDist-setSweet);
  const rawPressure=(speedExcess*.12)+(distanceExcess*.025)+(Math.max(0,lowBallSeverity)*1.15)+(specialPressure||0);
  const controlMitigation=Math.max(.45,1-(stats.intellect*.005)-(stats.technique*.12));
  const contactSeverity=rawPressure*controlMitigation;
  const errorMultiplier=Math.min(4.5,1+contactSeverity);
  const errorAmplitude=Math.max(20,(55-stats.intellect)*2.8+(1-stats.technique)*55);
  const maxTravel=Math.max(250,Math.min(410,250+Math.max(0,(stats.power||18.5)-18.5)*10));
  return {setSweet,speedExcess,distanceExcess,rawPressure,controlMitigation,contactSeverity,errorMultiplier,errorAmplitude,maxTravel};
}
function computeJumpFormula(stats, gravity=(typeof WORLD!=='undefined'?WORLD.GRAVITY:0.38)){
  const launch=Math.abs(stats.jump||0), g=Math.max(.001,gravity);
  return {launchSpeed:launch,apexFrames:launch/g,apexHeight:(launch*launch)/(2*g),airFrames:(2*launch)/g};
}
function computeAITestFormula(stats,{distance=300,reach=null}={}){
  const r=reach==null?(stats.reach||64):reach;
  const gap=Math.max(0,distance-r);
  const eta=gap/Math.max(1,stats.speed||1);
  const iq=Math.max(0,Math.min(60,stats.intellect||0))/60;
  return {etaFrames:eta,landingUncertainty:24+(1-iq)*86,reactionDelay:stats.reactionDelay,outballThreshold:stats.outballThreshold};
}

// 核心數值衍生: 角色五維累加裝備主屬性 + 二級詞條與特權解鎖
function deriveStats(card) {
  // V22 multiplayer: remote cards may carry a host/peer-authored final runtime snapshot.
  // Gameplay must use the exact same derived values on both peers instead of trying to
  // rebuild equipment from an inventory that only exists on the owner's machine.
  if (card && card._netDerivedStats) {
    const snap = card._netDerivedStats;
    const skillObj = SKILL_POOL.find(sk => sk.id === card.equippedSkill) || SKILL_POOL[0];
    return { ...snap, perks: { ...(snap.perks || {}) }, skill: skillObj };
  }
  const s = { ...card.stats };
  let bonusAP = 0, bonusReach = 0, bonusSweet = 0, bonusSpikeSpeed = 0;
  let bonusStaminaRec = 1.0, bonusEnergyGain = 1.0;
  let perks = {};

  // 結算 Slot A 與 Slot B 穿戴裝備
  const slots = [card.equipSlotA, card.equipSlotB];
  slots.forEach(eqInstId => {
    if (!eqInstId) return;
    const eq = INVENTORY_EQUIPS.find(e => e.instanceId === eqInstId);
    if (!eq) return;

    const dbItem = EQUIP_DB.find(e => e.id === eq.itemId);
    // 主屬性結算
    const mainVal = eq.baseRoll + (eq.refineLevel * (dbItem ? dbItem.refineGain : 0.5));
    if (s[eq.mainStatType] !== undefined) {
      s[eq.mainStatType] += mainVal;
    }

    // 副詞條結算
    if (eq.subStats) {
      eq.subStats.forEach(sub => {
        if (sub.type === 'ap') bonusAP += sub.val;
        else if (sub.type === 'reach') bonusReach += sub.val;
        else if (sub.type === 'sweet') bonusSweet += sub.val;
        else if (sub.type === 'spikeSpeed') bonusSpikeSpeed += sub.val;
        else if (sub.type === 'staminaRecovery') bonusStaminaRec += (sub.val / 100);
        else if (sub.type === 'energyGain') bonusEnergyGain += (sub.val / 100);
      });
    }

    // 突破特權階梯解鎖
    if (dbItem && dbItem.perks) {
      if (eq.rank >= 1 && dbItem.perks.rank1) mergePerkStack(perks, dbItem.perks.rank1);
      if (eq.rank >= 2 && dbItem.perks.rank2) mergePerkStack(perks, dbItem.perks.rank2);
      if (eq.rank >= 3 && dbItem.perks.rank3) mergePerkStack(perks, dbItem.perks.rank3);
    }
  });

  // V75-3: raw points remain visible/upgradeable; derived gameplay uses a mild high-end marginal curve.
  // Values <=40 are unchanged, protecting the current feel of normal/N/R/SR builds.
  const eStr=effectiveStatValue('str',s.str), eAgi=effectiveStatValue('agi',s.agi), eJump=effectiveStatValue('jump',s.jump);
  const eTec=effectiveStatValue('dex',s.dex), eInt=effectiveStatValue('int',s.int);

  const baseSpeed = 5.2 + (eAgi * 0.12) + (perks.runSpeedBonus || 0);
  const power = 18.5 + (eStr * 0.25) + bonusSpikeSpeed;
  // AGI no longer directly buffs contact quality. It helps defense by arriving sooner, not by making the arms steadier.
  const defense = 10.0 + (eTec * 0.25) + (perks.defRawBonus || 0);
  const blockRigidity = (defense * 1.05) + (eStr * 0.12) + (eJump * 0.15);
  const oneTouchAbsorb = Math.min(75, Math.floor(35 + (eTec * 0.8)));
  const sweetWindow = Math.floor(34 + (eTec * 0.4) + bonusSweet);
  // TEC = body/ball control tolerance; INT = earlier read/positioning tolerance. Kept intentionally as two distinct reach sources.
  const reach = 56 + (eTec * 0.25) + (eInt * 0.15) + bonusReach + (perks.reachBonus || 0);
  // Reaction preserves the legacy line until it reaches the old 3f floor, then continues with a soft 3→2f tail.
  // This keeps current low/mid-stat hand feel while ensuring high INT/AGI points are not completely dead.
  const reactionLegacyRaw = 16 - (eInt * 0.25) - (eAgi * 0.15);
  let reactionDelay = reactionLegacyRaw >= 3
    ? reactionLegacyRaw
    : 2 + 1 / (1 + Math.max(0, 3 - reactionLegacyRaw) * 0.25);
  reactionDelay = Math.max(2, reactionDelay - (perks.reactionReduce || 0));
  const outballThreshold = eInt <= 30 ? Math.max(8,60-eInt*1.5) : (8 + 7/(1+(eInt-30)*0.15));
  const skillObj = SKILL_POOL.find(sk => sk.id === card.equippedSkill) || SKILL_POOL[0];

  return {
    // Raw final five attributes stay intact for UI/save. effective* values expose the marginal layer to diagnostics.
    str: s.str, agi: s.agi, jumpStat: s.jump, dex: s.dex, tec: s.dex, int: s.int,
    effectiveStr:eStr,effectiveAgi:eAgi,effectiveJump:eJump,effectiveTec:eTec,effectiveInt:eInt,
    speed: baseSpeed, jump: -9.8 - (eJump * 0.10) - (perks.jumpRawBonus || 0), diveSpeed: baseSpeed * 2.0,
    power: power, defense: defense, blockRigidity: blockRigidity,
    oneTouchAbsorb: oneTouchAbsorb, sweetWindow: sweetWindow, reach: reach, reactionDelay: reactionDelay,
    technique: 0.45 + (eTec * 0.02), intellect: eInt,
    outballThreshold: outballThreshold, skill: skillObj,
    // 專屬裝備加成導出
    bonusAP: bonusAP, bonusStaminaRec: bonusStaminaRec, bonusEnergyGain: bonusEnergyGain,
    perks: perks
  };
}

let audioCtx = null, customAudio = new Audio();
customAudio.loop = true;
let isAudioLoaded = false;

let _lastRemoteSoundAt = Object.create(null);
// V74 PROCEDURAL FOLEY: gameplay feedback is synthesized from discrete physical bands,
// not one absolute-value loudness curve. Each band has its own timbre; only small variation
// happens inside a band so light/medium/heavy contacts stay perceptually distinct.
const FOLEY_BANDS = {
  land: [
    { max: 2.4, name:'feather', body:150, bodyEnd:105, gain:.110, dur:.055, noise:.050, noiseDur:.025, cutoff:1900 },
    { max: 5.0, name:'light',   body:125, bodyEnd:72,  gain:.180, dur:.080, noise:.085, noiseDur:.040, cutoff:1500 },
    { max: 8.5, name:'medium',  body:100, bodyEnd:48,  gain:.270, dur:.115, noise:.130, noiseDur:.060, cutoff:1150 },
    { max: 13.0,name:'heavy',   body:78,  bodyEnd:34,  gain:.390, dur:.155, noise:.190, noiseDur:.085, cutoff:850  },
    { max: Infinity,name:'slam',body:62,  bodyEnd:25,  gain:.520, dur:.210, noise:.260, noiseDur:.110, cutoff:650  }
  ],
  jump: [
    { max: 7.8, name:'hop',  body:145, gain:.120, dur:.070, scrape:.065 },
    { max: 10.8,name:'jump', body:125, gain:.190, dur:.095, scrape:.105 },
    { max: Infinity,name:'launch',body:102,gain:.285,dur:.120,scrape:.155 }
  ],
  step: [
    { max: 2.8, name:'walk', gain:.075, dur:.040, cutoff:1650 },
    { max: 5.4, name:'run',  gain:.115, dur:.050, cutoff:1350 },
    { max: Infinity,name:'sprint',gain:.165,dur:.062,cutoff:1050 }
  ]
};
function _foleyBand(kind, value){
  const bands=FOLEY_BANDS[kind]||[];
  for(const b of bands) if(value < b.max) return b;
  return bands[bands.length-1]||null;
}
function _foleyNoise(ctx, now, dur, gainValue, filterType, freq){
  const len=Math.max(1,Math.floor(ctx.sampleRate*dur)), buf=ctx.createBuffer(1,len,ctx.sampleRate), d=buf.getChannelData(0);
  for(let i=0;i<len;i++) d[i]=Math.random()*2-1;
  const src=ctx.createBufferSource(), f=ctx.createBiquadFilter(), g=ctx.createGain();
  src.buffer=buf; f.type=filterType||'lowpass'; f.frequency.value=freq||1200;
  g.gain.setValueAtTime(Math.max(.0001,gainValue),now); g.gain.exponentialRampToValueAtTime(.001,now+dur);
  src.connect(f);f.connect(g);g.connect(ctx.destination);src.start(now);src.stop(now+dur);
}
function _foleyTone(ctx, now, freq, endFreq, dur, gainValue, type='sine'){
  const o=ctx.createOscillator(),g=ctx.createGain();o.type=type;o.frequency.setValueAtTime(freq,now);o.frequency.exponentialRampToValueAtTime(Math.max(1,endFreq),now+dur);
  g.gain.setValueAtTime(Math.max(.0001,gainValue),now);g.gain.exponentialRampToValueAtTime(.001,now+dur);o.connect(g);g.connect(ctx.destination);o.start(now);o.stop(now+dur);
}
function _foleyMaterial(){
  const v=(typeof getCurrentVenue==='function')?getCurrentVenue():null;
  if(!v)return 'wood';
  if(v.fixed==='ice_floor')return 'ice'; if(v.fixed==='sand_floor')return 'sand'; if(v.fixed==='wet_floor')return 'wet';
  if(v.fixed==='ship_sway')return 'deck'; if(v.id==='warehouse'||v.id==='factory'||v.id==='underground')return 'hard'; return 'wood';
}
function playFoley(kind, value=0, opts={}){
  if(!audioCtx) audioCtx=new (window.AudioContext||window.webkitAudioContext)(); if(audioCtx.state==='suspended')audioCtx.resume();
  const ctx=audioCtx, now=ctx.currentTime, vol=(typeof globalSfxVolume!=='undefined'?globalSfxVolume:.85), mat=opts.material||_foleyMaterial();
  try{
    if(kind==='land'){
      // value is the downward velocity immediately BEFORE floor collision; it is already directional.
      const b=_foleyBand('land',value); if(!b)return;
      let body=b.gain, noise=b.noise, cutoff=b.cutoff;
      if(mat==='sand'){body*=.55;noise*=1.35;cutoff*=.72}else if(mat==='ice'){body*=.72;noise*=.75;cutoff*=1.9}else if(mat==='wet'){body*=.68;noise*=1.18;cutoff*=1.15}else if(mat==='hard'){body*=1.08;cutoff*=1.15}else if(mat==='deck'){body*=.95;cutoff*=.9}
      _foleyTone(ctx,now,b.body,b.bodyEnd,b.dur,body*vol,'sine');_foleyNoise(ctx,now,b.noiseDur,noise*vol,'lowpass',cutoff); _foleyNoise(ctx,now,Math.min(.055,b.noiseDur+.015),noise*.72*vol,'bandpass',Math.max(900,cutoff*1.75));
      if((b.name==='heavy'||b.name==='slam')&&mat!=='sand')_foleyTone(ctx,now,46,29,b.dur*1.15,body*.34*vol,'triangle');
    }else if(kind==='jump'){
      const strength=-value, b=_foleyBand('jump',strength); if(!b)return; let scrape=b.scrape, body=b.gain;
      if(mat==='sand')scrape*=1.55; if(mat==='ice')scrape*=.45; if(mat==='wet')scrape*=1.2;
      _foleyNoise(ctx,now,.045+scrape*.25,scrape*vol,'bandpass',mat==='ice'?2200:1250);_foleyTone(ctx,now,b.body,b.body*1.38,b.dur,body*vol,'triangle');
    }else if(kind==='step'){
      // V74-4: rain uses recorded wet steps, but ONE slice per existing game step event. Cadence remains 22/15/11 frames.
      const venue=(typeof getCurrentVenue==='function')?getCurrentVenue():null;
      if(venue && venue.id==='rain'){
        const starts=[1.83,2.38,2.92,3.48,4.10,4.69,5.36,5.95,6.62,7.21,7.87,8.45,9.64,10.22,10.82,11.42,12.00,13.82,14.40,16.69];
        const st=starts[Math.floor(Math.random()*starts.length)]; playSkillAsset('SFX/foley/rain_wet_footsteps.wav',.72,{start:st,duration:.34,rate:value>=5.4?1.05:1.0}); return;
      }
      const b=_foleyBand('step',value);if(!b)return;let g=b.gain,cut=b.cutoff;
      if(mat==='sand'){g*=.8;cut*=.62}else if(mat==='ice'){g*=.68;cut*=1.8}else if(mat==='wet'){g*=.82;cut*=1.15}
      _foleyNoise(ctx,now,b.dur,g*vol,'bandpass',cut);_foleyTone(ctx,now,mat==='hard'?118:88,46,b.dur*.95,g*.62*vol,'triangle');
    }else if(kind==='dive'){
      _foleyNoise(ctx,now,.22,.190*vol,'bandpass',mat==='sand'?620:980);_foleyTone(ctx,now,125,52,.15,.180*vol,'triangle');
    }
  }catch(e){}
}

// V74-6 MATERIAL SKILL AUDIO: authored WAV assets replace the procedural skill palette.
// MIX TUNING: edit SKILL_AUDIO_GAIN below. 1.0 = full source level on the SFX bus.
const SKILL_ASSET = {
  sk_breaker:['SFX/skills/breaker_1.wav','SFX/skills/breaker_2.wav'],
  sk_deep_impact:['SFX/skills/deep_1.wav'],
  sk_steepexec:['SFX/skills/steepexec.wav'],
  sk_phantom:['SFX/skills/phantom_hand.wav'],
  sk_solar_sine:['SFX/skills/solar_sine.wav'],
  sk_sky_comet:['SFX/skills/sky_1.wav'],
  sk_chrono_spike:['SFX/skills/flash_1.wav'],
  sk_phantom_drop:['SFX/skills/phantom_drop.wav'],
  sk_rolling_thunder:['SFX/skills/thunderstep_1.wav','SFX/skills/thunderstep_2.wav'],
  sk_mud_spike:['SFX/skills/mud_launch.wav'],
  sk_bungee_gum:['SFX/skills/bungee_1.wav'],
  sk_iron_wall:['SFX/skills/iron_wall_metal_1.wav','SFX/skills/iron_wall_metal_2.wav'],
  sk_soft_wall:['SFX/skills/soft_wall.wav'],
  sk_shock_return:['SFX/skills/storm_1.wav','SFX/skills/storm_2layer.wav'],
  sk_godspeed_toss:['SFX/skills/godspeed_toss.wav'],
  sk_greased_ball:['SFX/skills/grease_launch.wav'],
  sk_gravity_drop:['SFX/skills/gravity_drop.wav'],
  sk_savage_roar:['SFX/skills/savage_roar.wav'],
  sk_kinetic_counter:['SFX/skills/kinetic_counter.wav']
};
const SKILL_AUDIO_GAIN = {
  sk_breaker:0.8, sk_deep_impact:1.0, sk_steepexec:0.8, sk_phantom:1.0, sk_solar_sine:0.8,
  sk_sky_comet:0.8, sk_chrono_spike:1.0, sk_phantom_drop:0.8, sk_rolling_thunder:0.8,
  sk_mud_spike:1.0, sk_bungee_gum:1.0, sk_iron_wall:0.6, sk_soft_wall:0.8,
  sk_shock_return:0.8, sk_godspeed_toss:0.6, sk_greased_ball:1.0, sk_gravity_drop:0.6,
  sk_savage_roar:0.8, sk_kinetic_counter:0.8
};
function skillGain(id){ return SKILL_AUDIO_GAIN[id] ?? 1.0; }
const _skillMedia = Object.create(null);
// V74-6 Venue Acoustic Profile: authored SFX get a dry path + venue-dependent convolution send.
const VENUE_ACOUSTIC_PROFILE={
  stadium:{wet:.20,decay:1.15,damp:5200}, underground:{wet:.31,decay:1.65,damp:3900}, warehouse:{wet:.24,decay:1.35,damp:4300},
  factory:{wet:.18,decay:1.05,damp:3600}, rain:{wet:.08,decay:.48,damp:6200}, rooftop:{wet:.06,decay:.38,damp:7000},
  ship:{wet:.035,decay:.30,damp:7600}, beach:{wet:.025,decay:.24,damp:8200}, ice:{wet:.17,decay:1.05,damp:7200}, moon:{wet:.02,decay:.20,damp:8500}
};
const _venueIRCache=Object.create(null);
function _venueProfile(){try{return VENUE_ACOUSTIC_PROFILE[(typeof getCurrentVenue==='function'&&getCurrentVenue()?.id)||'stadium']||VENUE_ACOUSTIC_PROFILE.stadium;}catch(e){return VENUE_ACOUSTIC_PROFILE.stadium;}}
function _venueImpulse(ctx,p){const key=`${ctx.sampleRate}:${p.decay}:${p.damp}`;if(_venueIRCache[key])return _venueIRCache[key];const len=Math.max(1,Math.floor(ctx.sampleRate*p.decay)),b=ctx.createBuffer(2,len,ctx.sampleRate);for(let c=0;c<2;c++){const d=b.getChannelData(c);for(let i=0;i<len;i++){const t=i/len;d[i]=(Math.random()*2-1)*Math.pow(1-t,2.2)*(1-.18*t);}}return _venueIRCache[key]=b;}
// V74-7 HOTFIX: do NOT reroute HTMLAudio through createMediaElementSource. On some browsers a suspended/locked AudioContext mutes the dry source entirely.
// Venue profiles stay defined, but authored SFX remain on their reliable direct HTMLAudio path until the buffer-based reverb bus lands.
function _routeVenueReverb(a,opts={}){ return; }
function playSkillAsset(path,vol=1.0,opts={}){
  try{const a=new Audio(path);a.preload='auto';a.volume=Math.max(0,Math.min(1,vol*((typeof globalSfxVolume!=='undefined')?globalSfxVolume:.85)));if(opts.start)a.currentTime=opts.start;if(opts.rate)a.playbackRate=opts.rate;_routeVenueReverb(a,opts);
    const startPlay=()=>{a.play().catch(()=>{});if(opts.duration)setTimeout(()=>{try{a.pause()}catch(e){}},Math.max(20,opts.duration*1000));};
    if(opts.key){stopSkillAsset(opts.key,0);_skillMedia[opts.key]=a;} if(opts.fadeOut){const ms=Math.max(40,opts.fadeOut*1000),steps=8,base=a.volume;setTimeout(()=>{let i=0;const t=setInterval(()=>{i++;a.volume=base*(1-i/steps);if(i>=steps){clearInterval(t);try{a.pause()}catch(e){}}},ms/steps)},Math.max(0,(opts.fadeAfter||0)*1000));}
    if(opts.delay)setTimeout(startPlay,opts.delay*1000);else startPlay();return a;
  }catch(e){return null;}
}
function stopSkillAsset(key,fade=.05){const a=_skillMedia[key];if(!a)return;delete _skillMedia[key];if(!fade){try{a.pause();a.currentTime=0}catch(e){};return;}const base=a.volume,steps=5;let i=0;const t=setInterval(()=>{i++;try{a.volume=base*(1-i/steps)}catch(e){}if(i>=steps){clearInterval(t);try{a.pause();a.currentTime=0}catch(e){}}},fade*1000/steps);}
function playSkillSound(skillId, fromNetwork=false){
  const arr=SKILL_ASSET[skillId]; if(!arr)return false; const v=skillGain(skillId);
  if(skillId==='sk_breaker'){arr.forEach(x=>playSkillAsset(x,v));return true;}
  if(skillId==='sk_iron_wall'){playSkillAsset(arr[0],v,{start:.04,duration:.95,fadeOut:.16,fadeAfter:.72});playSkillAsset(arr[1],v,{start:.01,delay:.32,duration:1.45,fadeOut:.24,fadeAfter:.92});return true;}
  if(skillId==='sk_shock_return'){playSkillAsset(arr[0],v,{start:.04});playSkillAsset(arr[1],v,{start:.46});return true;}
  if(skillId==='sk_rolling_thunder'){const a=playSkillAsset(arr[0],v);if(a)a.addEventListener('ended',()=>playSkillAsset(arr[1],v),{once:true});return true;}
  if(skillId==='sk_deep_impact'){playSkillAsset(arr[0],v);return true;}
  if(skillId==='sk_sky_comet'){playSkillAsset(arr[0],v,{start:.03,key:'sky_comet_flight'});return true;}
  if(skillId==='sk_mud_spike'){playSkillAsset(arr[0],v,{start:.03});return true;}
  if(skillId==='sk_greased_ball'){playSkillAsset('SFX/skills/grease_launch.wav',v);return true;}
  playSkillAsset(arr[0],v); return true;
}
function playMoodSound(kind){playSkillAsset(kind==='depressed'?'SFX/skills/depress.wav':'SFX/skills/excited.wav',kind==='depressed'?.18:0.42,{start:0,venueWet:.18});}
function playSound(type, fromNetwork=false) {
  if (typeof type === 'string' && type.startsWith('skill:')) {
    const skillId=type.slice(6);
    const nowMs=performance.now();
    if(!fromNetwork && typeof NET!=='undefined' && NET.isMultiplayer && NET.isHost && NET.conn && NET.conn.open){try{NET.conn.send({type:'SFX_SYNC',sfx:type,eventId:`${gameFrame||0}:${type}:${Math.floor(nowMs)}`});}catch(e){}}
    playSkillSound(skillId,fromNetwork); return;
  }
  const nowMs = performance.now();
  if (fromNetwork) {
    if (nowMs - (_lastRemoteSoundAt[type] || 0) < 55) return;
    _lastRemoteSoundAt[type] = nowMs;
  } else if (typeof NET !== 'undefined' && NET.isMultiplayer && NET.isHost && NET.conn && NET.conn.open) {
    try { NET.conn.send({ type: 'SFX_SYNC', sfx: type, eventId: `${gameFrame||0}:${type}:${Math.floor(nowMs)}` }); } catch(e) {}
  }

  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const now = audioCtx.currentTime;
  try {
    const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
    const sfxVol = (typeof globalSfxVolume !== 'undefined') ? globalSfxVolume : 0.85;
    osc.connect(gain); gain.connect(audioCtx.destination);
    if (type === 'serve_count_beep' || type === 'serve_zero_beep') {
      osc.type='square'; const z=type==='serve_zero_beep'; osc.frequency.setValueAtTime(z?520:760,now); if(z)osc.frequency.exponentialRampToValueAtTime(360,now+.14);
      gain.gain.setValueAtTime((z?.34:.25)*sfxVol,now); gain.gain.exponentialRampToValueAtTime(.001,now+(z?.16:.09)); osc.start(now);osc.stop(now+(z?.16:.09));
    } else if (type === 'pia') { 
      osc.type = 'triangle'; osc.frequency.setValueAtTime(680, now); osc.frequency.exponentialRampToValueAtTime(130, now + 0.08);
      gain.gain.setValueAtTime(0.75 * sfxVol, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.start(now); osc.stop(now + 0.08);
    } else if (type === 'bump') { 
      osc.type = 'sine'; osc.frequency.setValueAtTime(160, now); osc.frequency.exponentialRampToValueAtTime(50, now + 0.12);
      gain.gain.setValueAtTime(0.5 * sfxVol, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.start(now); osc.stop(now + 0.12);
    } else if (type === 'dong') { 
      osc.type = 'sine'; osc.frequency.setValueAtTime(95, now); osc.frequency.exponentialRampToValueAtTime(32, now + 0.22);
      gain.gain.setValueAtTime(0.85 * sfxVol, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.start(now); osc.stop(now + 0.22);
    } else if (type === 'set') {
      osc.type = 'sine'; osc.frequency.setValueAtTime(320, now); osc.frequency.exponentialRampToValueAtTime(180, now + 0.08);
      gain.gain.setValueAtTime(0.25 * sfxVol, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.start(now); osc.stop(now + 0.08);
    } else if (type === 'spike') {
      osc.type = 'sawtooth'; osc.frequency.setValueAtTime(280, now); osc.frequency.exponentialRampToValueAtTime(30, now + 0.18);
      gain.gain.setValueAtTime(0.65 * sfxVol, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.start(now); osc.stop(now + 0.18);
    } else if (type === 'perfect_spike') {
      osc.type = 'square'; osc.frequency.setValueAtTime(420, now); osc.frequency.exponentialRampToValueAtTime(20, now + 0.3);
      gain.gain.setValueAtTime(0.85 * sfxVol, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.start(now); osc.stop(now + 0.3);
    } else if (type === 'block_break') {
      osc.type = 'sawtooth'; osc.frequency.setValueAtTime(440, now); osc.frequency.exponentialRampToValueAtTime(50, now + 0.28);
      gain.gain.setValueAtTime(0.8 * sfxVol, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc.start(now); osc.stop(now + 0.28);
    } else if (type === 'block_roof') {
      osc.type = 'square'; osc.frequency.setValueAtTime(110, now); osc.frequency.exponentialRampToValueAtTime(40, now + 0.22);
      gain.gain.setValueAtTime(0.65 * sfxVol, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.start(now); osc.stop(now + 0.22);
    } else if (type === 'roof_break') {
      osc.type = 'sawtooth'; osc.frequency.setValueAtTime(190, now); osc.frequency.exponentialRampToValueAtTime(28, now + 0.34);
      gain.gain.setValueAtTime(0.8 * sfxVol, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
      osc.start(now); osc.stop(now + 0.34);
    } else if (type === 'jump') {
      osc.type = 'triangle'; osc.frequency.setValueAtTime(135, now); osc.frequency.exponentialRampToValueAtTime(240, now + 0.07);
      gain.gain.setValueAtTime(0.22 * sfxVol, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.10);
      osc.start(now); osc.stop(now + 0.10);
    } else if (type === 'land') {
      osc.type = 'sine'; osc.frequency.setValueAtTime(105, now); osc.frequency.exponentialRampToValueAtTime(48, now + 0.07);
      gain.gain.setValueAtTime(0.25 * sfxVol, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.10);
      osc.start(now); osc.stop(now + 0.10);
    } else if (type === 'dive') {
      osc.type = 'triangle'; osc.frequency.setValueAtTime(210, now); osc.frequency.exponentialRampToValueAtTime(70, now + 0.16);
      gain.gain.setValueAtTime(0.4 * sfxVol, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc.start(now); osc.stop(now + 0.16);
    } else if (type === 'coin') {
      osc.type = 'sine'; osc.frequency.setValueAtTime(987.77, now); osc.frequency.setValueAtTime(1318.51, now + 0.08);
      gain.gain.setValueAtTime(0.3 * sfxVol, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.start(now); osc.stop(now + 0.35);
    } else if (type === 'teleport') {
      osc.type = 'sine'; osc.frequency.setValueAtTime(200, now); osc.frequency.exponentialRampToValueAtTime(900, now + 0.14);
      gain.gain.setValueAtTime(0.6 * sfxVol, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      osc.start(now); osc.stop(now + 0.14);
    } else if (type === 'clock_tick') {
      osc.type = 'triangle'; osc.frequency.setValueAtTime(1200, now); osc.frequency.exponentialRampToValueAtTime(220, now + 0.04);
      gain.gain.setValueAtTime(0.4 * sfxVol, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
      osc.start(now); osc.stop(now + 0.04);
    } else if (type === 'time_freeze') {
      osc.type = 'sawtooth'; osc.frequency.setValueAtTime(440, now); osc.frequency.exponentialRampToValueAtTime(40, now + 0.4);
      gain.gain.setValueAtTime(0.8 * sfxVol, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc.start(now); osc.stop(now + 0.4);
    } else if (type === 'venue_reveal') {
      osc.type = 'triangle'; osc.frequency.setValueAtTime(150, now); osc.frequency.exponentialRampToValueAtTime(55, now + 0.28);
      gain.gain.setValueAtTime(0.55 * sfxVol, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
      osc.start(now); osc.stop(now + 0.32);
    } else if (type === 'skill_reveal') {
      osc.type = 'sawtooth'; osc.frequency.setValueAtTime(95, now); osc.frequency.exponentialRampToValueAtTime(620, now + 0.13);
      gain.gain.setValueAtTime(0.58 * sfxVol, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      osc.start(now); osc.stop(now + 0.24);
    } else if (type === 'p1_full') {
      osc.type = 'triangle'; osc.frequency.setValueAtTime(1200, now); osc.frequency.exponentialRampToValueAtTime(3200, now + 0.12);
      gain.gain.setValueAtTime(0.75 * sfxVol, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc.start(now); osc.stop(now + 0.45);
    } else if (type === 'p2_full') {
      osc.type = 'sine'; osc.frequency.setValueAtTime(950, now); osc.frequency.exponentialRampToValueAtTime(1750, now + 0.15);
      gain.gain.setValueAtTime(0.55 * sfxVol, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc.start(now); osc.stop(now + 0.4);
    }
  } catch(e) {}
}

function playWhistle(isScore = false) {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  try {
    const now = audioCtx.currentTime, osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
    const sfxVol = (typeof globalSfxVolume !== 'undefined') ? globalSfxVolume : 0.85;
    osc.type = 'sine'; osc.frequency.setValueAtTime(isScore ? 2600 : 2400, now);
    gain.gain.setValueAtTime(0.18 * sfxVol, now); gain.gain.exponentialRampToValueAtTime(0.001, now + (isScore ? 0.15 : 0.4));
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(now); osc.stop(now + (isScore ? 0.15 : 0.4));
  } catch(e) {}
}

// V62 WEB PERFORMANCE: local save is immediate, cloud writes are debounced + single-flight.
let cloudSaveTimer = null;
let cloudSaveInFlight = false;
let cloudSavePending = false;
let lastCloudPayload = null;
function queueCloudSave(payload, immediate=false) {
  if (!currentCloudUser || !db) return;
  lastCloudPayload = payload;
  cloudSavePending = true;
  const flush = () => {
    cloudSaveTimer = null;
    if (!cloudSavePending || cloudSaveInFlight || !currentCloudUser || !db) return;
    cloudSavePending = false;
    cloudSaveInFlight = true;
    const payloadNow = lastCloudPayload;
    db.collection('players').doc(currentCloudUser).set({
      gameData: payloadNow,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true }).catch(err => console.error('雲端存檔失敗:', err)).finally(() => {
      cloudSaveInFlight = false;
      if (cloudSavePending) { clearTimeout(cloudSaveTimer); cloudSaveTimer = setTimeout(flush, 900); }
    });
  };
  clearTimeout(cloudSaveTimer);
  cloudSaveTimer = setTimeout(flush, immediate ? 0 : 900);
}

function saveGameData() {
  // V16：任何存檔前先確保永久隊伍四格都是背包內唯一角色。
  sanitizeSavedRoster();
  const data = {
    coins: userCoins,
    inventory: INVENTORY,
    inventoryEquips: INVENTORY_EQUIPS,
    careerProgress: careerProgress,
    unlockedCosmetics: UNLOCKED_COSMETICS,
    unlockedSkills: UNLOCKED_SKILLS,
    unlockedAchievements: UNLOCKED_ACHIEVEMENTS,
    rosterIds: { user: SAVED_ROSTER.user.id, mate: SAVED_ROSTER.mate.id, enemyFront: SAVED_ROSTER.enemyFront.id, enemyBack: SAVED_ROSTER.enemyBack.id }
  };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) {}
// V62: never enqueue a Firestore write per click. Local storage is already committed above;
// cloud receives one merged write after the player stops changing data briefly.
if (currentCloudUser && db) queueCloudSave(JSON.stringify(data));
}

function loadGameData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const data = JSON.parse(saved);
      if (data.coins !== undefined) userCoins = data.coins;
      if (data.careerProgress !== undefined) careerProgress = data.careerProgress;
      if (data.unlockedCosmetics) UNLOCKED_COSMETICS = data.unlockedCosmetics;
      if (Array.isArray(data.unlockedSkills)) UNLOCKED_SKILLS = data.unlockedSkills;
      if (Array.isArray(data.unlockedAchievements)) UNLOCKED_ACHIEVEMENTS = data.unlockedAchievements;
      // V28 migration: 舊存檔也必須真的能在更衣室/角色技能欄選到新增三招。
      V28_GRANTED_SKILLS.forEach(id => { if (!UNLOCKED_SKILLS.includes(id)) UNLOCKED_SKILLS.push(id); });
      if (Array.isArray(data.inventoryEquips)) {
        INVENTORY_EQUIPS = data.inventoryEquips;
        INVENTORY_EQUIPS.forEach(eq => { if (eq.locked === undefined) eq.locked = false; });
      }
      if (Array.isArray(data.inventory) && data.inventory.length >= 4) {
        INVENTORY = data.inventory;
        INVENTORY.forEach(card => {
          if (!card.equippedSkill) card.equippedSkill = 'sk_breaker';
          if (!card.cosmetics) card.cosmetics = { hat: 'hat_none', face: 'face_none', effect: 'fx_none' };
          if (card.equipSlotA === undefined) card.equipSlotA = null;
          if (card.equipSlotB === undefined) card.equipSlotB = null;
        });
      }
      if (data.rosterIds) {
        // 舊版本可能把天梯/連線臨時名單寫進存檔；V16 載入時只接受背包角色並自動去除四格重複。
        sanitizeSavedRoster(data.rosterIds);
        restoreActiveRosterFromSaved(false);
      } else {
        sanitizeSavedRoster();
        restoreActiveRosterFromSaved(false);
      }
    }
  } catch (e) {}

  if (!UNLOCKED_COSMETICS.effects) UNLOCKED_COSMETICS.effects = ['fx_none'];
  CAREER_STAGES.forEach(stage => {
    if (stage.id < careerProgress && stage.rewardSkin) {
      if (!UNLOCKED_COSMETICS.effects.includes(stage.rewardSkin)) {
        UNLOCKED_COSMETICS.effects.push(stage.rewardSkin);
      }
    }
  });

  const cd = document.getElementById('coin-display');
  if (cd) cd.innerText = userCoins;
  const acd = document.getElementById('arcade-coin-display');
  if (acd) acd.innerText = userCoins;
}

function resetLocalStorageData() {
  if (confirm('確定要清除所有存檔資料嗎？這將重置金幣、裝備、名冊與角色等級。')) {
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  }
}

function getRequiredExp(level) { return Math.floor(100 * Math.pow(1.22, level - 1)); }

const NET = {
  isMultiplayer: false,
  isHost: false,
  peer: null,
  conn: null,           // reliable control / input / one-shot events
  stateConn: null,      // V75-2.4: lossy snapshot channel; latest state wins
  roomCode: '',
  mode: 'PVP',
  pveDifficulty: 5,
  venueChoice: 'stadium', venueId: 'stadium', venueEventsEnabled: true,
  mySlot: 0,
  mateSlot: 1,
  myTeam: 'LEFT',
  remoteKeys: { a: false, d: false, w: false, j: false, k: false, l: false, o: false, space: false },
  lastPing: 0
};

// V33：連線 Session 身分不得污染單機模式。離開/切換模式時回到本機左隊 Slot 0 基準。
function resetNetworkSessionIdentity(destroyPeer = false) {
  if (destroyPeer && NET.peer) { try { NET.peer.destroy(); } catch (e) {} }
  NET.isMultiplayer = false;
  NET.isHost = false;
  NET.peer = destroyPeer ? null : NET.peer;
  NET.conn = null;
  NET.stateConn = null;
  NET.roomCode = '';
  NET.mode = 'PVP';
  NET.mySlot = 0;
  NET.mateSlot = 1;
  NET.myTeam = 'LEFT';
  NET.remoteKeys = { a:false, d:false, w:false, j:false, k:false, l:false, o:false, space:false };
  if (typeof NET_DEBUG!=='undefined') {
    NET_DEBUG.lastRecvSeq=0; NET_DEBUG.lastAppliedSeq=0; NET_DEBUG.packetSeq=0; NET_DEBUG.packetGaps=0;
    NET_DEBUG.staleStateDrops=0; NET_DEBUG.stateSkipCount=0; NET_DEBUG.stateSkipRate=0;
  }
  NET.rematchRequested = false;
  NET.remoteRematchRequested = false;
  NET.intentionalDisconnect = false;
}
// ========================================================
// ☁️ Firebase 雲端資料庫初始化 (專案: nsfwvolley-b5ee1)
// ========================================================
const firebaseConfig = {
  apiKey: "AIzaSyCsPtYyZbhFpWjI1SYcfrJVxkc1U8T8HkQ",
  authDomain: "nsfwvolley-b5ee1.firebaseapp.com",
  projectId: "nsfwvolley-b5ee1",
  storageBucket: "nsfwvolley-b5ee1.firebasestorage.app",
  messagingSenderId: "486325994967",
  appId: "1:486325994967:web:3c385f9b3db94a1bbe7792",
  measurementId: "G-K6XRBRG29K"
};

if (typeof firebase !== 'undefined' && !firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const db = (typeof firebase !== 'undefined') ? firebase.firestore() : null;

let currentCloudUser = localStorage.getItem('VOLLEY_CLOUD_USER') || null;

// 🌟 補回遺失的 Firebase 認證函式，杜絕 ReferenceError
function handleFirebaseAuth(username, password) {
  if (!db) {
    alert('Firebase 未正確載入，請檢查網路連線！');
    return;
  }
  const userRef = db.collection('players').doc(username);
  
  userRef.get().then((doc) => {
    if (doc.exists) {
      const userData = doc.data();
      if (userData.password !== password) {
        alert('❌ 密碼錯誤！請重新輸入。');
        return;
      }
      currentCloudUser = username;
      localStorage.setItem('VOLLEY_CLOUD_USER', username);
      if (userData.gameData) {
        localStorage.setItem(STORAGE_KEY, userData.gameData);
      }
      alert(`✅ 歡迎回來，[${username}]！已載入雲端進度。`);
      location.reload();
    } else {
      userRef.set({
        username: username,
        password: password,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }).then(() => {
        currentCloudUser = username;
        localStorage.setItem('VOLLEY_CLOUD_USER', username);
        saveGameData();
        alert(`🎉 帳號 [${username}] 註冊成功！雲端存檔已建立。`);
        location.reload();
      });
    }
  }).catch((err) => {
    alert('雲端連線失敗: ' + err.message);
  });
}

// ========================================================
// ☁️ 雲端帳號管理：自動定時備份、自動開機同步、手動同步與登出
// ========================================================

// 🌟 1. 自動定時上傳：每 60 秒背景靜默同步一次 Firebase
setInterval(() => {
  // V62: no blind 60s rewrite. queueCloudSave is change-driven and single-flight.
  if (currentCloudUser && cloudSavePending && !cloudSaveInFlight && lastCloudPayload) {
    queueCloudSave(lastCloudPayload, true);
  }
}, 60000);

// 🌟 2. 點擊「已登入按鈕」時彈出操作選單（手動同步 / 登出）
function handleCloudAccountMenu() {
  const choice = prompt(
    `👤 當前登入球團：[${currentCloudUser}]\n\n` +
    `請輸入選項指令：\n` +
    `1 ➔ 立即強制上傳存檔至雲端\n` +
    `2 ➔ 立即從雲端拉取最新存檔覆蓋本機\n` +
    `3 ➔ 登出當前帳號\n` +
    `按「取消」關閉此選單`,
    "1"
  );

  if (choice === "1") {
    // 強制上傳
    saveGameData();
    alert("✅ 最新進度已成功強制上傳至 Firebase 雲端！");
  } else if (choice === "2") {
    // 強制拉取
    if (db && currentCloudUser) {
      db.collection('players').doc(currentCloudUser).get().then((doc) => {
        if (doc.exists && doc.data().gameData) {
          localStorage.setItem(STORAGE_KEY, doc.data().gameData);
          alert("✅ 已成功從雲端同步最新進度！即將刷新畫面...");
          location.reload();
        } else {
          alert("⚠️ 雲端尚無存檔記錄！");
        }
      }).catch(err => alert("同步失敗: " + err.message));
    }
  } else if (choice === "3") {
    // 登出
    if (confirm(`確定要登出球團 [${currentCloudUser}] 嗎？`)) {
      localStorage.removeItem('VOLLEY_CLOUD_USER');
      alert("已安全登出！即將重新載入...");
      location.reload();
    }
  }
}

// 🌟 3. 畫面載入時：綁定按鈕與開機自動向雲端拉取最新進度
window.addEventListener('DOMContentLoaded', () => {
  const btnAuth = document.getElementById('btn-cloud-auth');
  if (btnAuth) {
    if (currentCloudUser) {
      btnAuth.innerText = `👤 雲端球團: ${currentCloudUser} (點擊管理)`;
      btnAuth.style.background = '#047857';
      btnAuth.onclick = handleCloudAccountMenu; // 點擊可手動同步或登出

      // 開網頁自動向雲端檢查並載入最新檔（解決換電腦變預設狀態）
      if (db) {
        db.collection('players').doc(currentCloudUser).get().then((doc) => {
          if (doc.exists && doc.data().gameData) {
            const cloudDataStr = doc.data().gameData;
            const localDataStr = localStorage.getItem(STORAGE_KEY);
            if (cloudDataStr !== localDataStr) {
              localStorage.setItem(STORAGE_KEY, cloudDataStr);
              loadGameData();
              if (typeof allPlayers !== 'undefined') allPlayers.forEach(p => p.rebind(true));
              if (typeof updateSideUltHUD === 'function') updateSideUltHUD();
            }
          }
        }).catch(err => console.error("自動載入雲端失敗:", err));
      }
    } else {
      btnAuth.innerText = `👤 雲端帳號登入 (未登入)`;
      btnAuth.style.background = '#065f46';
      btnAuth.onclick = openCloudAuthModal;
    }
  }
});