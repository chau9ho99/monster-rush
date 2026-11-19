const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d');
const {width, height} = canvas;
const density = Math.min(2,window.devicePixelRatio || 1);
canvas.width = Math.round(width*density);
canvas.height = Math.round(height*density);
ctx.scale(canvas.width/width,canvas.height/height);
const street = new Image();
street.src = 'assets/anime-alley.webp';
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const ui = Object.fromEntries(['menu','heading','result','start','skill','wave','timer','score','life','health','boss','bossHealth','controls','stick','aimPad','activeFace','heroName','hudBar','combo','pause','pausePanel','resume'].map(id => [id, document.getElementById(id)]));
const summonButton=document.getElementById('summon');
const friendFace=document.getElementById('friendFace');
const friendLabel=document.getElementById('friendLabel');
const supportDuration=10;
const supportFinisherTime=8;
const breachLine = 605;
const comboWindow = 2.8;
const knob = ui.stick.querySelector('i');
const choices = [...document.querySelectorAll('.choice')];
const sprites = Array.from({length:24}, (_, i) => {
  const img = new Image();
  img.src = 'assets/' + i + '.png';
  return img;
});
for (let i=0;i<3;i++) {
  const front = new Image();
  front.src = 'assets/portrait-' + i + '.png';
  sprites.push(front);
}
const upgradeNames = ['雙管金卡炮','穿透脈衝炮','五重晶簇炮'];
const upgradeSpread = [[-.075,.075],[0],[-.30,-.15,0,.15,.30]];
const equippedSprites = [
  ['gold-front','gold-aim','gold-attack'],
  ['30','31','32'],
  ['crystal-front','crystal-aim','crystal-attack']
];
function equippedFrame(hero,pose) {
  return 27 + hero*3 + pose;
}
for (let i=27;i<51;i++) {
  const img = new Image();
  const name = i<36 ? equippedSprites[Math.floor((i-27)/3)][(i-27)%3] : i;
  img.src = 'assets/' + name + '.png';
  sprites.push(img);
}
const stats = [
  {speed:220, delay:.20, damage:26, spread:[0], color:'#ffd86c'},
  {speed:200, delay:.29, damage:40, spread:[0], color:'#72edff'},
  {speed:185, delay:.44, damage:35, spread:[-.19,0,.19], color:'#ffa5fa'}
];
const enemyStats = [
  {hp:45, speed:68, size:65, value:100, hit:10, color:'#a4f76e'},
  {hp:45, speed:98, size:79, value:150, hit:13, color:'#e38fff'},
  {hp:1150,speed:55,size:144,value:1500,hit:24,color:'#ff9957'}
];
const keys = new Set();
const moveKeys = ['KeyA','KeyD','KeyW','KeyS','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'];
const clamp = (n,low,high) => Math.max(low,Math.min(high,n));
let selected = 0;
let game;
let stick;
let firePointer;
const aimKnob = ui.aimPad.querySelector('i');
function releaseFire() {
  firePointer = null;
  aimKnob.style.transform = '';
}
function setAim(event) {
  const pad = event.currentTarget === ui.aimPad;
  const bounds = event.currentTarget.getBoundingClientRect();
  if (pad) {
    const x = event.clientX-bounds.left-bounds.width/2;
    const y = event.clientY-bounds.top-bounds.height/2;
    const length = Math.max(1,Math.hypot(x,y));
    const offset = Math.min(length,bounds.width*.32);
    aimKnob.style.transform = 'translate('+x/length*offset+'px,'+y/length*offset+'px)';
    firePointer = {id:event.pointerId,pad:true,x,y,pressed:length>6};
  } else {
    firePointer = {id:event.pointerId,pad:false,pressed:true,
      x:(event.clientX-bounds.left)*width/bounds.width,
      y:(event.clientY-bounds.top)*height/bounds.height};
  }
}
for (const surface of [ui.aimPad,canvas]) {
  surface.onpointerdown = event => {
    if (!game?.running || game.paused || game.ending || event.button!==0 || firePointer) return;
    surface.setPointerCapture(event.pointerId);
    setAim(event);
  };
  surface.onpointermove = event => {if (firePointer?.id===event.pointerId) setAim(event);};
  surface.onpointerup = surface.onpointercancel = surface.onlostpointercapture = event => {
    if (firePointer?.id===event.pointerId) releaseFire();
  };
}
function aimWeapon(hero) {
  let x = Number(keys.has('KeyL'))-Number(keys.has('KeyJ'));
  let y = Number(keys.has('KeyK'))-Number(keys.has('KeyI'));
  if (firePointer?.pressed) {
    x = firePointer.x-(firePointer.pad ? 0 : hero.x);
    y = firePointer.y-(firePointer.pad ? 0 : hero.y-24);
  }
  if (!x && !y) return false;
  hero.aim = Math.atan2(x,-y);
  if (Math.abs(x)>.01) hero.face = Math.sign(x);
  return true;
}
let previous;
choices.forEach((button,i) => button.onclick = event => {
  if (event) battleAudio.play('select',.48,.08);
  selected = i;
  document.getElementById('showcase').src = sprites[loadout.checked && progress.levels[i] ? equippedFrame(i,0) : 24+i].src;
  choices.forEach((item,index) => item.setAttribute('aria-pressed',String(index === i)));
});
document.getElementById('pressStart').onclick = () => {
  battleAudio.unlock();
  document.getElementById('titleScreen').hidden = true;
  document.getElementById('gameScreen').hidden = false;
  choices[selected].focus({preventScroll:true});
};
function resetStick() {
  stick = null;
  knob.style.transform = '';
}
const chargeSeconds = 1.5;
const chargeBar = document.getElementById('chargeBar');
const cutins = new Image();
cutins.src = 'assets/hero-cutins.webp';
const cutinDuration = .85;
const chargeFx = new Image();
chargeFx.src = 'assets/charge-fx.webp';
let chargeSource = null;
let charge = 0;
let chargeStartedAt = 0;
function heldSeconds() {
  return Math.min(chargeSeconds,(performance.now()-chargeStartedAt)/1000);
}
function cancelCharge() {
  battleAudio.cancelCharge();
  chargeSource = null;
  charge = 0;
}
function beginCharge(source) {
  if (!game?.running || game.paused || game.won || game.ending || game.hero.skill || chargeSource !== null) return false;
  chargeStartedAt = performance.now();
  chargeSource = source;
  battleAudio.charge();
  return true;
}
function releaseCharge(source) {
  if (source !== chargeSource) return;
  const full = heldSeconds() >= chargeSeconds;
  cancelCharge();
  if (full) ultimate();
  else battleAudio.play('cancel',.36);
}
const coinTypes = [
  {value:1, color:'#80ed65', mark:'1'},
  {value:3, color:'#c285ff', mark:'3'},
  {value:12, color:'#ffcb54', mark:'★'}
];
const upgradeCosts = [14,28,44];
const loadout = document.getElementById('loadout');
function weaponLevel() {
  return game?.running ? game.weaponLevel : loadout.checked ? progress.levels[selected] : 0;
}
function upgradeGate(level) {
  if (level===0 && game.wave<2) return '第2波解鎖';
  if (level===1 && game.wave<3) return '第3波解鎖';
  if (level===2 && !game.cleanDodge) return '先避開王招';
  return '';
}
loadout.onchange = event => choices[selected].onclick(event);
const upgradeButton = document.getElementById('upgrade');
const wallet = document.getElementById('wallet');
const lootControls = document.getElementById('lootControls');
const saveKey = 'monster-rush-upgrades-v1';
let progress = {levels:[0,0,0]};
try {
  const data = JSON.parse(localStorage.getItem(saveKey));
  if (data &&
      Array.isArray(data.levels) && data.levels.length===3 &&
      data.levels.every(n=>Number.isInteger(n) && n>=0 && n<=upgradeCosts.length)) progress={levels:data.levels};
} catch {}
document.getElementById('showcase').src = sprites[weaponLevel() ? equippedFrame(selected,0) : 24+selected].src;
function saveProgress() {
  try { localStorage.setItem(saveKey,JSON.stringify(progress)); } catch {}
}
function upgradeMove() {
  if (!game?.running || game.paused || game.ending) return;
  const cost = upgradeCosts[game.weaponLevel];
  if (!cost || game.balance<cost || upgradeGate(game.weaponLevel)) return;
  game.balance -= cost;
  game.weaponLevel++;
  battleAudio.play('upgrade',.73);
  progress.levels[selected] = Math.max(progress.levels[selected],game.weaponLevel);
  document.getElementById('showcase').src=sprites[equippedFrame(selected,0)].src;
  impact(game.hero.x,game.hero.y-24,93,'#ffdf79',.5);
  saveProgress();
  burst(game.hero.x,game.hero.y-25,stats[selected].color,22);
  hud();
}
upgradeButton.onclick = upgradeMove;
function collectCoins(dt) {
  const hero = game.hero;
  game.coins = game.coins.filter(coin => {
    // Distant drops drift into the playable strip and settle in their lane.
    coin.y += clamp(coin.targetY-coin.y,-150*dt,150*dt);
    if (Math.hypot(hero.x-coin.x,hero.y-20-coin.y)>34) return true;
    const type = coinTypes[coin.type];
    battleAudio.play('coin',.48,.09);
    game.balance += type.value;
    game.earned += type.value;
    burst(coin.x,coin.y,type.color,10);
    return false;
  });
}
function resetInput() {
  cancelCharge();
  releaseFire();
  keys.clear();
  resetStick();
}
function pauseGame(paused, focus = true) {
  if (!game?.running || game.fall || game.paused === paused) return;
  resetInput();
  game.paused = paused;
  battleAudio.pause(paused);
  if (!paused) battleAudio.play('select',.40);
  battleLine.hidden=paused || !game.lineTime;
  lootControls.hidden = paused;
  ui.pausePanel.hidden = !paused;
  ui.controls.hidden = paused;
  ui.pause.hidden = paused;
  if (focus) (paused ? ui.resume : ui.pause).focus({preventScroll:true});
}
ui.pause.onclick = () => pauseGame(true);
ui.resume.onclick = () => pauseGame(false);
document.addEventListener('visibilitychange',() => {
  if (document.hidden) pauseGame(true,false);
});
const stagePick = document.getElementById('stagePick');
const reactor = new Image();
reactor.src = 'assets/anime-reactor.webp';
const reactorActors = ['beetle','jelly','furnace','glacier'].map(name=>{
  const image = new Image();
  image.src = 'assets/'+name+'.webp';
  return image;
});
const fallSeconds = 3.1;
// Defeat artwork is ordered grey polo, white jersey, black tee in the source sheet.
const fallFramesByPlayer = [
  [6,7,8], // P1: black tee and glasses
  [3,4,5], // P2: white jersey and glasses
  [0,1,2]  // P3: grey polo
];
const fallSprites = fallFramesByPlayer.map(frames=>frames.map(index=>{
  const img=new Image();
  img.src='assets/fall-'+index+'.webp';
  return img;
}));
const bossStationY = 252;
const laneHalfWidth = 32;
const blastRadius = 53;
const bossFx = ['charge','path','beam','blast'].map(name=>{
  const img = new Image();
  img.src = 'assets/boss-'+name+'.webp';
  return img;
});
const reactorFrame = sprites.length;
sprites.push(...reactorActors);
const reactorStats = [
  {...enemyStats[0],hp:68,speed:78,hit:13,value:160},
  {...enemyStats[1],hp:62,speed:114,hit:16,value:210},
  {...enemyStats[2],hp:1450,speed:24,size:152,hit:28,value:1800}
];
const skybridge=new Image();
skybridge.src='assets/storm-skybridge.webp';
const mantisFrame=sprites.length;
const mantis=new Image();
mantis.src='assets/storm-mantis.webp';
sprites.push(mantis);
const stages={
  1:{seconds:60,summons:1,stats:enemyStats,boss:'熔岩石魔王',victory:'霓虹街守住喇！',objective:'守住防線，60 秒內擊倒熔岩石魔王'},
  2:{seconds:90,summons:2,stats:reactorStats,boss:'熔爐巨龜',victory:'能源站奪回喇！',objective:'90 秒內擊倒熔爐巨龜同冰核巨猿'},
  3:{seconds:80,summons:1,stats:[reactorStats[0],reactorStats[1],{...reactorStats[2],hp:1280}],boss:'雷刃螳螂',victory:'風暴天橋突破喇！',objective:'穿過電網缺口，避開王招，再瞄準露出嘅核心反擊'}
};
function refreshStageMenu() {
  const level=stages[stagePick.value];
  document.getElementById('objective').textContent=level.objective;
  document.getElementById('stageHeader').textContent='LV'+stagePick.value+' · '+level.seconds+' 秒';
}
stagePick.onchange = () => {
  battleAudio.play('select',.48);
  refreshStageMenu();
  if (!ui.start.disabled) ui.start.textContent = '開始打怪';
};
const battleLine=document.getElementById('battleLine');
const japaneseLines=['光よ、貫け！','俺が守る！','砕け散れ！'];
function battleCry(actor) {
  battleAudio.callout(actor);
  game.lineTime=1.65;
  battleLine.textContent=japaneseLines[actor];
  battleLine.style.setProperty('--speaker',stats[actor].color);
  battleLine.hidden=false;
}
function start() {
  battleAudio.silence();
  battleAudio.pause(false);
  battleAudio.unlock();
  battleAudio.setBattle(true);
  battleAudio.play('start',.64);
  battleLine.hidden=true;
  resetInput();
  const stage=Number(stagePick.value)||1;
  const level=stages[stage];
  game = {
    weaponLevel:loadout.checked ? progress.levels[selected] : 0, cleanDodge:false, stage, stats:level.stats, bosses:[], running:true, paused:false, time:0, score:0, wave:1, spawn:2.25, formation:0,
    lineTime:0, cutin:0, ultimateResult:null, explosion:0, coins:[], balance:0, earned:0, lootTime:0, chain:0, chainTime:0, bestChain:0, breachFlash:0,
    scenery:{x:0,y:0,marks:[],distance:0,dx:0,dy:0,foot:1}, friend:null, summonsLeft:level.summons, allyCutin:false, queuedUltimate:false, gate:null, gateIndex:0, nextGate:5, bullets:[], enemies:[], particles:[], casts:[], impacts:[], muzzle:0, shake:0, ending:0, won:false,
    hero:{actor:selected,x:width/2,y:552,hp:100,attack:0,skill:0,guard:0,hurt:0,face:1,moving:false,stride:0,footDistance:0,aim:0}
  };
  friendFace.src=choices[(selected+1)%choices.length].querySelector('img').src;
  formation(124);
  ui.activeFace.src = choices[selected].querySelector('img').src;
  ui.heroName.textContent = choices[selected].querySelector('span').textContent;
  ui.hudBar.hidden = false;
  ui.menu.hidden = true;
  ui.pausePanel.hidden = true;
  ui.pause.hidden = false;
  ui.controls.hidden = false;
  ui.start.blur();
  hud();
}
ui.start.onclick = start;
function hud() {
  const {hero,wave,time,score,bosses} = game;
  summonButton.disabled=!!game.friend || !game.summonsLeft || game.won || !!game.ending;
  const label=game.friend ? '支援 '+Math.ceil(supportDuration-game.friend.age)+'s' : game.summonsLeft ? '召喚 ×'+game.summonsLeft : '已用完';
  if (friendLabel.textContent!==label) friendLabel.textContent=label;
  const level = game.weaponLevel;
  const cost = upgradeCosts[level];
  const gate = upgradeGate(level);
  if (level) ui.heroName.textContent=upgradeNames[selected];
  lootControls.hidden = !game.running || game.paused || !!game.fall;
  wallet.textContent = '幣 ' + game.balance;
  upgradeButton.disabled = !cost || !!gate || game.balance<cost || !!game.ending;
  upgradeButton.textContent = 'Lv.'+(level+1)+(cost ? ' · '+cost+'幣'+(gate ? ' · '+gate : ' 升級') : ' 已滿級');
  ui.wave.textContent = game.won ? '執戰利品' : '第 ' + wave + ' 波';
  ui.timer.textContent = Math.ceil(Math.max(0,game.won ? game.lootTime : stages[game.stage].seconds-time)) + 's';
  ui.score.textContent = String(score).padStart(4,'0');
  ui.combo.hidden = game.chain < 2;
  ui.combo.textContent = game.chain + ' 連殺';
  ui.life.textContent = 'HP ' + Math.max(0,hero.hp);
  ui.health.value = Math.max(0,hero.hp);
  ui.hudBar.classList.toggle('danger',hero.hp<=25);
  ui.boss.hidden = !game.running || !bosses.some(b=>b.hp>0);
  if (bosses.length) {
    ui.bossHealth.max = game.stats[2].hp;
    ui.bossHealth.value = Math.max(0,bosses[0].hp);
    document.getElementById('bossName').textContent = stages[game.stage].boss;
    document.getElementById('twinBar').hidden = bosses.length<2;
    if (bosses[1]) document.getElementById('twinHealth').value = Math.max(0,bosses[1].hp);
  }
  ui.skill.setAttribute('aria-disabled', String(hero.skill > 0));
  const full = charge >= chargeSeconds;
  chargeBar.value = Math.floor(100*charge/chargeSeconds);
  ui.skill.classList.toggle('full',full);
  ui.skill.textContent = hero.skill > 0 ? Math.ceil(hero.skill) + 's' : full ? '放手' : '儲氣';
}
function finish(won) {
  game.running = false;
  battleAudio.setBattle(false);
  battleAudio.silence();
  battleAudio.play(won ? 'win' : 'lose',.78);
  battleLine.hidden=true;
  lootControls.hidden = true;
  resetInput();
  ui.controls.hidden = true;
  ui.pause.hidden = true;
  ui.boss.hidden = true;
  ui.combo.hidden = true;
  ui.heading.textContent = won ? stages[game.stage].victory : game.hero.hp <= 0 ? '你死撚左了！' : '時間到！';
  ui.result.textContent = '得分 ' + game.score + ' · 最高連殺 ' + game.bestChain + ' · 拾獲 ' + game.earned + ' 幣';
  ui.result.hidden = false;
  if (won && game.stage<3) {
    stagePick.value=String(game.stage+1);
    refreshStageMenu();
    ui.start.textContent = '進入 LV'+stagePick.value;
  } else ui.start.textContent = '再玩一局';
  ui.hudBar.hidden = true;
  ui.menu.hidden = false;
  choices[selected].onclick();
  if (game.fall) document.getElementById('showcase').src=fallSprites[game.fall.actor][2].src;
  ui.start.focus();
}
function steer(event) {
  const bounds = ui.stick.getBoundingClientRect();
  const x = event.clientX - (bounds.left + bounds.width/2);
  const y = event.clientY - (bounds.top + bounds.height/2);
  const radius = Math.max(1,bounds.width*.35);
  const factor = Math.max(radius,Math.hypot(x,y));
  stick = {id:event.pointerId,x:x/factor,y:y/factor};
  knob.style.transform = 'translate(' + stick.x*radius + 'px,' + stick.y*radius + 'px)';
}
ui.stick.onpointerdown = event => {
  if (!game?.running || game.paused || game.ending || event.button!==0 || stick) return;
  ui.stick.setPointerCapture(event.pointerId);
  steer(event);
};
ui.stick.onpointermove = event => {if (stick?.id === event.pointerId) steer(event);};
ui.stick.onpointerup = ui.stick.onpointercancel = ui.stick.onlostpointercapture = event => {
  if (stick?.id === event.pointerId) resetStick();
};
window.addEventListener('keydown',event => {
  if (!game?.running) return;
  if (event.code === 'Escape' || event.code === 'KeyP') {
    event.preventDefault();
    if (!event.repeat) pauseGame(!game.paused);
    return;
  }
  if (game.paused || game.ending) return;
  if (moveKeys.includes(event.code) || event.code === 'Space') event.preventDefault();
  if (event.code === 'KeyF' && !event.repeat) summonFriend();
  if (event.code === 'KeyU' && !event.repeat) upgradeMove();
  keys.add(event.code);
  if (event.code === 'Space' && !event.repeat) beginCharge('keyboard');
});
window.addEventListener('keyup',event => {
  keys.delete(event.code);
  if (event.code === 'Space') releaseCharge('keyboard');
});
window.addEventListener('blur',resetInput);
ui.skill.onpointerdown = event => {
  if (event.button !== 0 || !beginCharge(event.pointerId)) return;
  event.preventDefault();
  ui.skill.setPointerCapture(event.pointerId);
};
ui.skill.onpointerup = event => releaseCharge(event.pointerId);
ui.skill.onpointercancel = ui.skill.onlostpointercapture = event => {
  if (chargeSource === event.pointerId) cancelCharge();
};
ui.skill.oncontextmenu = event => event.preventDefault();
function burst(x,y,color,count) {
  count = Math.min(count,240-game.particles.length);
  for (let i=0;i<count;i++) {
    const angle = Math.random()*Math.PI*2;
    const speed = 30+Math.random()*140;
    const life = .16+Math.random()*.32;
    game.particles.push({x,y,dx:Math.cos(angle)*speed,dy:Math.sin(angle)*speed,life,max:life,color});
  }
}
function spawn(type,x,y=-35) {
  const enemy = {type,x,y,track:x,hp:game.stats[type].hp,flash:0,strike:0,phase:Math.random()*6};
  game.enemies.push(enemy);
  return enemy;
}
function formation(baseY=-24) {
  const {wave} = game;
  const pattern = game.formation++ % 3;
  const lanes = [[0,2,4],[1,2,3],[0,1,3,4]][pattern];
  for (const lane of lanes) {
    const type = wave === 1 ? 0 : wave === 2 || lane%2 === 0 ? 1 : 0;
    spawn(type,66+72*lane,baseY-Math.abs(lane-2)*(pattern===1?17:8));
  }
}
function shoot(angle,damage,speed,size) {
  const {hero} = game;
  angle += hero.aim;
  game.bullets.push({level:game.weaponLevel,pierced:[],originX:hero.x,originY:hero.y-24,x:hero.x+52*Math.sin(angle),y:hero.y-24-52*Math.cos(angle),dx:Math.sin(angle)*speed,dy:-Math.cos(angle)*speed,damage,size});
}
function enemySize(enemy) {
  return game.stats[enemy.type].size * (.63+.43*clamp(enemy.y/410,0,1));
}
function impact(x,y,radius,color,duration,points=0) {
  game.impacts.push({x,y,radius,color,points,life:duration,max:duration});
  if (game.impacts.length>32) game.impacts.shift();
}
function hit(enemy,damage,special=false) {
  if (enemy.hp<=0 || enemy.escaped) return;
  const armor = enemy.type!==2 ? 1 : enemy.exposed>0 ? (special ? 2.4 : 1.55) : .55;
  enemy.hp -= damage*armor*(1+.25*game.weaponLevel);
  enemy.flash = .19;
  const killed = enemy.hp<=0;
  if (killed) battleAudio.play(enemy.type===2 ? 'boss-down' : 'kill',enemy.type===2 ? .78 : .45,.10);
  else battleAudio.play('hit',.42,.07);
  let points = 0;
  if (killed) {
    game.coins.push({type:enemy.type,x:clamp(enemy.x,35,width-35),y:enemy.y,
      targetY:clamp(enemy.y+80,405,560)});
    game.chain++;
    game.chainTime = comboWindow;
    game.bestChain = Math.max(game.bestChain,game.chain);
    const multiplier = game.chain >= 5 ? 1.5 : game.chain >= 3 ? 1.2 : 1;
    points = Math.round(game.stats[enemy.type].value*multiplier);
    game.score += points;
  }
  impact(enemy.x,enemy.y,enemySize(enemy)*(killed ? .84 : .36),stats[selected].color,killed ? .48 : .17,points);
  if (killed) game.shake = Math.max(game.shake,enemy.type===2?5:1.3);
  burst(enemy.x,enemy.y,game.stats[enemy.type].color,enemy.hp<=0?16:5);
}
function summonFriend() {
  if (!game?.running || game.paused || game.ending || game.won || game.friend || !game.summonsLeft) return;
  const actor=(selected+1+Math.floor(Math.random()*2))%choices.length;
  const side=game.hero.x>width/2 ? -1 : 1;
  const x=clamp(game.hero.x+side*94,42,width-42);
  const y=game.hero.y-58;
  game.friend={actor,x,y,side,age:0,reload:0,beam:0,finisher:false,targets:[]};
  game.summonsLeft--;
  battleAudio.play('summon',.62);
  friendFace.src=choices[actor].querySelector('img').src;
  impact(x,y,56,stats[actor].color,.38);
  hud();
}
summonButton.onclick=summonFriend;

function stepFriend(dt) {
  const f=game.friend;
  if (!f) return;
  f.age+=dt;
  f.reload-=dt;
  f.beam=Math.max(0,f.beam-dt);
  const sideX=game.hero.x+f.side*94;
  if (sideX<36 || sideX>width-36) f.side*=-1;
  const follow=Math.min(1,dt*7);
  f.x+=(clamp(game.hero.x+f.side*94,36,width-36)-f.x)*follow;
  f.y+=(game.hero.y-58-f.y)*follow;
  if (f.age>=supportDuration) {
    battleAudio.play('depart',.43);
    burst(f.x,f.y,stats[f.actor].color,16);
    game.friend=null;
    return;
  }
  if (f.finisher) return;
  const finalStrike=f.age>=supportFinisherTime;
  if (!finalStrike && f.reload>0) return;
  const enemies=game.enemies.filter(e=>e.hp>0 && !e.escaped && e.y>=0 && e.y<=breachLine);
  if (finalStrike) {
    f.finisher=true;
    game.allyCutin=true;
    game.cutin=cutinDuration;
    battleCry(f.actor);
  } else {
    f.reload=.42;
    if (!enemies.length) return;
    const target=enemies.reduce((best,e)=>e.y>best.y ? e : best);
    f.targets=[{x:target.x,y:target.y}];
    f.beam=.15;
    battleAudio.play('shot-'+f.actor,.34);
    hit(target,22);
  }
}

function unleashFriend() {
  const f=game.friend;
  const enemies=game.enemies.filter(e=>e.hp>0 && !e.escaped && e.y>=0 && e.y<=breachLine);
  battleAudio.blast(f.actor);
  f.beam=.72;
  f.targets=enemies.map(e=>({x:e.x,y:e.y}));
  impact(f.x,f.y,115,stats[f.actor].color,.65);
  game.shake=Math.max(game.shake,2);
  for (const e of enemies) hit(e,105,true);
  game.explosion=.62;
}

function drawFriend(f) {
  const color=stats[f.actor].color;
  ctx.save();
  ctx.globalAlpha=Math.min(1,f.age*6,(supportDuration-f.age)*2);
  shadow(f.x,f.y+24,23);
  const shooting=f.beam>0;
  art(shooting ? 9+f.actor : f.actor,f.x,f.y-13,103,1);
  if (shooting) {
    ctx.save();
    ctx.globalAlpha*=Math.min(1,f.beam*6);
    for (const target of f.targets) {
      line(f.x,f.y-47,target.x,target.y,color,f.finisher ? 4 : 2);
      art((f.finisher ? 42 : 39)+f.actor,target.x,target.y,f.finisher ? 65 : 27);
    }
    ctx.restore();
  }
  ctx.font='bold 12px system-ui';ctx.textAlign='center';
  ctx.fillStyle='#0c2130df';ctx.fillRect(f.x-37,f.y+31,74,19);
  ctx.fillStyle=color;
  ctx.fillText((f.finisher && f.beam>0 ? '隊友必殺 ' : '隊友 ')+Math.ceil(supportDuration-f.age)+'s',f.x,f.y+45);
  ctx.restore();
}
function ultimate() {
  if (!game?.running || game.paused || game.won || game.hero.skill > 0 || game.ending>0) return;
  if (game.allyCutin) { game.queuedUltimate=true; return; }
  game.cutin = cutinDuration;
  battleCry(game.hero.actor);
  game.hero.skill = 7;
  hud();
}
function unleash() {
  const {hero} = game;
  game.explosion = .62;
  battleAudio.blast(hero.actor);
  game.shake = 3;
  impact(hero.x,hero.y-20,[122,245,325][selected],stats[selected].color,.52);
  game.casts.push({x:hero.x,y:hero.y-32,life:.75});
  const actor=hero.actor;
  if (actor===1) hero.guard=3.5;
  const hits=[];
  for (const enemy of game.enemies) {
    const radius=enemySize(enemy)/2;
    if (enemy.hp<=0 || enemy.escaped || enemy.y+radius<0 || enemy.y-radius>height ||
        enemy.x+radius<0 || enemy.x-radius>width) continue;
    const before=enemy.hp;
    // One impact per enemy. Boss armour, exposed cores, upgrades and loot use normal combat rules.
    hit(enemy,enemy.type===2 ? [200,185,220][actor] : before,true);
    hits.push({x:enemy.x,y:enemy.y,ko:enemy.hp<=0,boss:enemy.type===2,
      damage:Math.ceil(before)-Math.ceil(Math.max(0,enemy.hp))});
  }
  game.enemies=game.enemies.filter(enemy=>enemy.hp>0 && !enemy.escaped);
  game.ultimateResult={actor,x:hero.x,y:hero.y-32,hits,kills:hits.filter(hit=>hit.ko).length,life:1.35};
  game.spawn=Math.max(game.spawn,1.35);
  burst(hero.x,hero.y-27,stats[selected].color,20);
  hud();
}
// The gate travels through the playable strip. Collision uses the same opening as the artwork.
function stepStormGate(dt) {
  if (!game.gate) {
    if (game.wave===3 || game.time<game.nextGate) return;
    const gaps=[109,302,175,286,94,227];
    game.gate={x:gaps[game.gateIndex++ % gaps.length],y:325,warning:1.15,hit:false,
      half:game.wave===1 ? 53 : 44,speed:game.wave===1 ? 150 : 190};
    battleAudio.play('warning',.45);
  }
  const gate=game.gate;
  if (gate.warning>0) { gate.warning-=dt; return; }
  gate.y+=gate.speed*dt;
  const hero=game.hero;
  if (!gate.hit && Math.abs(hero.y-12-gate.y)<13 && Math.abs(hero.x-gate.x)+9>gate.half) {
    gate.hit=true;
    if (!hero.hurt && !hero.guard) {
      hero.hp-=15;
      hero.hurt=.65;
      battleAudio.play('hurt',.7);
      burst(hero.x,hero.y-12,'#ffab56',12);
    } else if (hero.guard) battleAudio.play('block',.6);
  }
  if (gate.y>breachLine+20) { game.gate=null; game.nextGate=game.time+1.8; }
}
function drawStormGate(gate) {
  const left=gate.x-gate.half,right=gate.x+gate.half,y=gate.y;
  ctx.save();
  ctx.fillStyle='#53f3c417';
  ctx.fillRect(left,y,right-left,breachLine-y>0 ? breachLine-y : 0);
  ctx.setLineDash([5,6]);
  line(left,y,left,breachLine,'#73ffe18a',1);
  line(right,y,right,breachLine,'#73ffe18a',1);
  ctx.setLineDash([]);
  for (const [a,b] of [[0,left],[right,width]]) {
    line(a,y,b,y,gate.warning>0 ? '#ffb54988' : '#d246ff99',gate.warning>0 ? 3 : 11);
    ctx.beginPath();ctx.moveTo(a,y);
    for (let x=a+6;x<b;x+=6) ctx.lineTo(x,y+3*Math.sin(x*.67+(reducedMotion ? 0 : game.time*20)));
    ctx.lineTo(b,y);ctx.lineWidth=2;ctx.strokeStyle=gate.warning>0 ? '#ffc772' : '#fff1ff';ctx.stroke();
  }
  ctx.font='bold 14px system-ui';ctx.textAlign='center';
  ctx.fillStyle='#071c28';ctx.fillRect(gate.x-33,y-19,66,20);
  ctx.fillStyle='#9fffe4';ctx.fillText('安全缺口',gate.x,y-4);
  ctx.restore();
}
function stepBossAttack(boss,dt) {
  if (!boss || boss.hp<=0 || boss.y<bossStationY) return;
  const hero = game.hero;
  if (!boss.hazard) {
    boss.delay -= dt;
    if (boss.delay>0) return;
    const lane = game.stage===2 ? boss.variant===0 : boss.turn++ % 2 === 0;
    const points = lane ? [hero.x] : [hero.x,clamp(hero.x+(hero.x<width/2 ? 108 : -108),42,width-42)];
    const duration = game.stage===3 ? 1.15 : lane ? 1.65 : 1.85;
    const originY = boss.y+22;
    const angle = Math.atan2(hero.x-boss.x,hero.y-12-originY);
    battleAudio.play('warning',.62,.35);
    boss.hazard = {lane,points,y:hero.y-12,originY,angle,
      length:(breachLine-originY)/Math.cos(angle),duration,windup:duration,flare:.34};
  }
  const hazard = boss.hazard;
  if (hazard.windup>0) {
    hazard.windup -= dt;
    if (hazard.windup>0) return;
    battleAudio.play('boss-strike',.67,.12);
    boss.strike = .38;
    game.shake = 4;
    const dx=hero.x-boss.x, dy=hero.y-12-hazard.originY;
    const along=dx*Math.sin(hazard.angle)+dy*Math.cos(hazard.angle);
    const across=dx*Math.cos(hazard.angle)-dy*Math.sin(hazard.angle);
    const caught=hazard.lane
      ? along>=0 && along<=hazard.length && Math.abs(across)<laneHalfWidth
      : hazard.points.some(x=>Math.hypot(hero.x-x,hero.y-12-hazard.y)<blastRadius);
    if (!caught) {
      game.cleanDodge=true;
      battleAudio.play('dodge',.53,.15);
    } else if (hero.guard>0) battleAudio.play('block',.64,.12);
    boss.exposed = game.stage===3 ? (caught ? 0 : 2.15) : 1.6;
    if (caught && hero.guard<=0 && hero.hurt<=0) {
      battleAudio.play('hurt',.75,.12);
      hero.hp -= hazard.lane ? 22 : 18;
      hero.hurt = .7;
      burst(hero.x,hero.y-12,'#ff7048',18);
    }
  }
  hazard.flare -= dt;
  if (hazard.flare<=0) {
    boss.hazard = null;
    boss.delay = boss.hp<game.stats[2].hp/2 ? 1.3 : 2.35;
  }
}
function step(dt) {
  if (game.lineTime>0) {
    game.lineTime=Math.max(0,game.lineTime-dt);
    if (!game.lineTime) battleLine.hidden=true;
  }
  if (game.cutin>0) {
    game.cutin = Math.max(0,game.cutin-dt);
    if (game.cutin===0) {
      if (game.allyCutin) {
        game.allyCutin=false;
        unleashFriend();
        if (game.queuedUltimate) { game.queuedUltimate=false; ultimate(); }
      } else unleash();
    }
    return;
  }
  if (game.ultimateResult) {
    game.ultimateResult.life-=dt;
    if (game.ultimateResult.life<=0) game.ultimateResult=null;
  }
  game.explosion = Math.max(0,game.explosion-dt);
  game.muzzle = Math.max(0,game.muzzle-dt);
  game.shake = Math.max(0,game.shake-dt*12);
  for (const fx of game.impacts) fx.life -= dt;
  game.impacts = game.impacts.filter(fx=>fx.life>0);
  for (const p of game.particles) {
    p.life -= dt;
    p.x += p.dx*dt;
    p.y += p.dy*dt;
  }
  game.particles = game.particles.filter(p=>p.life>0);
  if (game.ending>0) {
    updateScenery(dt,0,0,0);
    game.ending -= dt;
    if (game.ending<=0) finish(game.won);
    return;
  }
  const {hero} = game;
  const weapon = stats[selected];
  game.time += dt;
  if (chargeSource !== null) {
    const next=heldSeconds();
    if (charge<chargeSeconds && next>=chargeSeconds) battleAudio.play('select',.62);
    charge=next;
  }
  game.breachFlash = Math.max(0,game.breachFlash-dt);
  game.chainTime = Math.max(0,game.chainTime-dt);
  if (game.chainTime === 0) game.chain = 0;
  const nextWave=game.time<16 ? 1 : game.time<33 ? 2 : 3;
  if (game.wave!==nextWave) battleAudio.play(nextWave===3 ? 'boss-entry' : 'wave',.64);
  game.wave=nextWave;
  for (const key of ['attack','skill','guard','hurt']) hero[key] = Math.max(0,hero[key]-dt);
  const x = stick?.x ?? (Number(keys.has('KeyD') || keys.has('ArrowRight'))-Number(keys.has('KeyA') || keys.has('ArrowLeft')));
  const y = stick?.y ?? (Number(keys.has('KeyS') || keys.has('ArrowDown'))-Number(keys.has('KeyW') || keys.has('ArrowUp')));
  const norm = Math.max(1,Math.hypot(x,y));
  const oldX = hero.x;
  const oldY = hero.y;
  hero.x = clamp(hero.x+x/norm*weapon.speed*dt,48,width-48);
  hero.y = clamp(hero.y+y/norm*weapon.speed*dt,398,582);
  const travelled = Math.hypot(hero.x-oldX,hero.y-oldY);
  updateScenery(dt,hero.x-oldX,hero.y-oldY,travelled);
  if (travelled>.01) {
    hero.footDistance-=travelled;
    if (hero.footDistance<=0) {
      battleAudio.play(game.stage===1 ? 'wet-step' : 'steel-step',.30,.12);
      hero.footDistance=38;
    }
  } else hero.footDistance=0;
  hero.moving = travelled > .01;
  hero.stride = (hero.stride + travelled/6) % (2*Math.PI);
  if (Math.abs(x)>.07) hero.face = Math.sign(x);
  collectCoins(dt);
  if (game.won) {
    game.lootTime -= dt;
    hud();
    if (!game.coins.length || game.lootTime<=0) finish(true);
    return;
  }
  stepFriend(dt);
  if (game.allyCutin) return;
  if (game.stage===3) stepStormGate(dt);
  const firing = aimWeapon(hero);
  if (firing && hero.attack === 0) {
    hero.attack = weapon.delay;
    battleAudio.play('shot-'+hero.actor+(game.weaponLevel ? '-up' : ''),.76);
    game.muzzle = .085;
    const level=game.weaponLevel;
    const spread=level ? upgradeSpread[selected] : weapon.spread;
    for (const angle of spread) shoot(angle,weapon.damage,580+35*level,selected===2?6:4);
    burst(hero.x,hero.y-28,weapon.color,2);
  }
  game.spawn -= dt;
  if (game.spawn <= 0) {
    formation(game.time < 6 ? 75 : -24);
    game.spawn = game.time < 6 ? 2.35 : [2.0,1.65,2.45][game.wave-1];
  }
  if (game.wave===3 && game.bosses.length===0) {
    const lanes = game.stage===2 ? [112,308] : [width/2];
    game.bosses = lanes.map((x,variant)=>Object.assign(spawn(2,x,game.stage===2 ? 52 : -66),
      {variant,delay:1+variant*2,turn:0,hazard:null}));
  }
  for (const enemy of game.enemies) {
    if (enemy.hp <= 0) continue;
    const config = game.stats[enemy.type];
    enemy.exposed = Math.max(0,(enemy.exposed||0)-dt);
    enemy.flash = Math.max(0,enemy.flash-dt);
    enemy.strike = Math.max(0,enemy.strike-dt);
    if (enemy.type===2) {
      enemy.y=Math.min(bossStationY,enemy.y+94*dt);
      if (game.stage===3 && enemy.y===bossStationY && !enemy.hazard && !enemy.exposed) {
        enemy.patrol=(enemy.patrol||0)+dt;
        enemy.x=enemy.track+105*Math.sin(enemy.patrol*1.7);
      }
    } else {
      enemy.y+=config.speed*dt;
      enemy.x=enemy.track+Math.sin(game.time*(enemy.type===1?4:2)+enemy.phase)*(enemy.type===1?25:12);
    }
    if (enemy.type===1 && enemy.phase<3 && enemy.y>265) {
      if (enemy.dashTime===undefined) {
        enemy.dashTime=0;
        enemy.dashFrom=enemy.x;
        enemy.dashTo=hero.x;
      }
      if (enemy.dashTime<=.65 && enemy.dashTime+dt>.65) battleAudio.play('dash',.38,.15);
      enemy.dashTime+=dt;
      const dash = clamp((enemy.dashTime-.65)/.55,0,1);
      enemy.x=enemy.dashFrom+(enemy.dashTo-enemy.dashFrom)*dash;
      if (dash>0 && dash<1) enemy.y+=100*dt;
    }
    if (Math.hypot(enemy.x-hero.x,enemy.y-(hero.y-12)) < enemySize(enemy)*.37+13 && hero.hurt===0) {
      enemy.strike = .32;
      battleAudio.play(hero.guard>0 ? 'block' : 'hurt',.70,.12);
      hero.hurt = .65;
      if (hero.guard > 0) hit(enemy,95,true);
      else hero.hp -= config.hit;
      enemy.y -= 25;
      burst(hero.x,hero.y-12,hero.guard>0?'#72edff':'#ff626a',10);
    }
    if (enemy.y > breachLine && enemy.type !== 2 && enemy.hp>0) {
      enemy.escaped = true;
      if (hero.guard===0) {
        hero.hp -= 2;
        game.breachFlash = .55;
        battleAudio.play('breach',.52,.19);
        impact(enemy.x,breachLine,30,'#ff727f',.4);
      }
    }
  }
  for (const boss of game.bosses) stepBossAttack(boss,dt);
  for (const shot of game.bullets) {
    const fromX=shot.originX ?? shot.x, fromY=shot.originY ?? shot.y;
    shot.originX = shot.originY = null;
    shot.x += shot.dx*dt;
    shot.y += shot.dy*dt;
    const dx=shot.x-fromX, dy=shot.y-fromY;
    for (const enemy of game.enemies) {
      if (enemy.escaped || enemy.hp<=0 || shot.pierced.includes(enemy)) continue;
      const t=clamp(((enemy.x-fromX)*dx+(enemy.y-fromY)*dy)/(dx*dx+dy*dy || 1),0,1);
      if (Math.hypot(fromX+t*dx-enemy.x,fromY+t*dy-enemy.y)>enemySize(enemy)*.40+shot.size) continue;
      hit(enemy,shot.damage);
      if (selected===1 && shot.pierced.length<shot.level) {
        shot.pierced.push(enemy);
        continue;
      }
      shot.used = true;
      break;
    }
  }
  game.bullets = game.bullets.filter(shot=>!shot.used && shot.y>-40 && shot.y<height+40 && shot.x>0 && shot.x<width);
  game.enemies = game.enemies.filter(enemy => enemy.hp>0 && !enemy.escaped);
  for (const cast of game.casts) cast.life -= dt;
  game.casts = game.casts.filter(cast=>cast.life>0);
  const won = game.bosses.length>0 && game.bosses.every(b=>b.hp<=0);
  if (won || hero.hp<=0 || game.time>=stages[game.stage].seconds) {
    game.friend=null;
    game.gate=null;
    game.won = won;
    for (const boss of game.bosses) boss.hazard = null;
    if (won) {
      game.lootTime = 8;
      game.enemies = [];
      game.bullets = [];
      game.casts = [];
      cancelCharge();
    } else {
      battleAudio.setBattle(false);
      battleAudio.play('fall',.76);
      game.ending=fallSeconds;
      game.fall={actor:hero.actor};
      resetInput();
      game.muzzle=game.shake=game.explosion=0;
      game.casts=[];
      game.bullets=[];
      ui.controls.hidden=true;
      ui.pause.hidden=true;
    }
    if (won) for (const boss of game.bosses) impact(boss.x,boss.y,145,'#ffb45a',.55);
  }
  hud();
}
function pose(actor, attacking, injured) {
  if (injured) return 15 + actor;
  if (attacking) return 9 + actor;
  return actor;
}
function art(id,x,y,size,face=1,flash=false) {
  const img = sprites[id];
  if (!img.complete || !img.naturalWidth) return;
  const scale = size/Math.max(img.naturalWidth,img.naturalHeight);
  const w = img.naturalWidth*scale;
  const h = img.naturalHeight*scale;
  ctx.save();
  ctx.translate(x,y);
  ctx.scale(face,1);
  if (flash) ctx.filter = 'brightness(1.25)';
  ctx.drawImage(img,-w/2,-h/2,w,h);
  ctx.restore();
}
function line(x1,y1,x2,y2,color,size) {
  ctx.strokeStyle = color;
  ctx.lineWidth = size;
  ctx.beginPath();
  ctx.moveTo(x1,y1);
  ctx.lineTo(x2,y2);
  ctx.stroke();
}
function glow(x,y,r,color) {
  const light = ctx.createRadialGradient(x,y,0,x,y,r);
  light.addColorStop(0,color);
  light.addColorStop(1,'transparent');
  ctx.fillStyle = light;
  ctx.fillRect(x-r,y-r,r*2,r*2);
}
// Sample actual movement by distance so marks keep their spacing at any frame rate.
function updateScenery(dt,dx,dy,distance) {
  const {scenery,hero}=game;
  for (const mark of scenery.marks) mark.life-=dt;
  scenery.marks=scenery.marks.filter(mark=>mark.life>0);
  if (reducedMotion) return;
  const ease=1-Math.exp(-5*dt);
  scenery.x+=((hero.x-width/2)/width*16-scenery.x)*ease;
  scenery.y+=((hero.y-500)/height*28-scenery.y)*ease;
  if (distance<.01) return;
  dx/=distance; dy/=distance;
  const pivot=hero.moving && dx*scenery.dx+dy*scenery.dy<.55;
  scenery.distance+=distance;
  if (!hero.moving || pivot || scenery.distance>=17) {
    scenery.distance=0;
    scenery.foot*=-1;
    scenery.marks.push({x:hero.x+scenery.foot*10,y:hero.y+47,
      dx,dy,life:.48,strong:!hero.moving || pivot});
  }
  scenery.dx=dx;scenery.dy=dy;
}
function road() {
  const stage=game?.running ? game.stage : Number(stagePick.value);
  const second=stage>=2;
  const backdrop=stage===3 ? skybridge : second ? reactor : street;
  const camera=game?.scenery;
  const x=camera?.x || 0,y=camera?.y || 0;
  if (backdrop.complete && backdrop.naturalWidth) {
    ctx.drawImage(backdrop,-12-x,-10-y,width+24,height+20);
  } else {ctx.fillStyle='#10192a';ctx.fillRect(0,0,width,height);}
  if (!game || reducedMotion) return;
  ctx.save();
  const t=game.time;
  for (let i=0;i<34;i++) {
    const depth=.35+(i%5)*.16;
    const speed=second ? -32 : 215;
    const period=height+54;
    const py=(((i*113+t*speed*depth)%period+period)%period)-22-y*depth*2;
    const drift=second ? 8*Math.sin(t*1.2+i) : -t*42*depth;
    const px=((i*79+drift)%(width+46)+width+46)%(width+46)-16-x*depth*2;
    if (second) {
      ctx.globalAlpha=.28+.24*Math.sin(i+t*2);
      ctx.fillStyle=i%3===0 ? '#ffb249' : '#9cfff4';
      ctx.fillRect(px,py,2*depth,5*depth);
    } else {
      ctx.globalAlpha=.08+.16*depth;
      line(px,py,px-2.7*depth,py+14*depth,'#c3e5ff',1.3*depth);
    }
  }
  ctx.restore();
}
function drawTracks() {
  const color=stats[game.hero.actor].color;
  ctx.save();
  for (const mark of game.scenery.marks) {
    const left=mark.life/.48, age=1-left;
    const reach=(mark.strong ? 37 : 23)*age+4;
    ctx.globalAlpha=left*.72;
    for (const side of [-1,1]) {
      const spread=side*(3+age*8);
      const endX=mark.x-mark.dx*reach+mark.dy*spread;
      const endY=mark.y-mark.dy*reach-mark.dx*spread;
      line(mark.x-mark.dx*reach*.28,mark.y-mark.dy*reach*.28,endX,endY,color,1+left*2);
    }
    if (game.stage===1) {
      ctx.beginPath();
      ctx.ellipse(mark.x,mark.y,4+age*(mark.strong ? 32 : 21),2+age*7,0,0,Math.PI*2);
      ctx.lineWidth=1+left;ctx.strokeStyle=color;ctx.stroke();
    } else {
      for (let n=-1;n<=1;n++) {
        const scatter=n*age*16;
        star(mark.x-mark.dx*reach+mark.dy*scatter,mark.y-mark.dy*reach-mark.dx*scatter-age*7,2+left*3,age+n,color);
      }
    }
  }
  ctx.restore();
}
function shadow(x,y,r) {
  ctx.fillStyle = '#0508199c';
  ctx.beginPath();
  ctx.ellipse(x,y,r,r*.25,0,0,2*Math.PI);
  ctx.fill();
}
function star(x,y,r,angle,color) {
  ctx.beginPath();
  for (let i=0;i<8;i++) {
    const a=angle+i*Math.PI/4;
    const length=i%2 ? r*.24 : r;
    const px=x+Math.sin(a)*length, py=y-Math.cos(a)*length;
    if (i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
  }
  ctx.closePath();ctx.fillStyle=color;ctx.fill();
}
function drawChargeEffect(tile,x,y,size,angle,opacity) {
  const side = chargeFx.naturalWidth/2;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = opacity;
  ctx.translate(x,y);
  ctx.rotate(reducedMotion ? 0 : angle);
  ctx.drawImage(chargeFx,(tile%2)*side,Math.floor(tile/2)*side,side,side,-size/2,-size/2,size,size);
  ctx.restore();
}
function drawHazard(h,boss) {
  const warning=h.windup>0;
  const power=warning ? 1-h.windup/h.duration : 1;
  ctx.save();
  if (boss.variant===1) ctx.filter='hue-rotate(162deg)';
  if (h.lane) {
    ctx.translate(boss.x,h.originY);
    ctx.rotate(-h.angle);
    ctx.beginPath();
    ctx.rect(-laneHalfWidth,0,laneHalfWidth*2,h.length);
    ctx.fillStyle=warning ? '#ff71183b' : '#ffb72b80';
    ctx.fill();
    ctx.clip();
    if (warning) {
      ctx.globalAlpha=.58+.42*power;
      const spacing=92;
      const offset=reducedMotion ? 0 : game.time*48%spacing;
      for (let y=offset-spacing;y<h.length;y+=spacing) {
        ctx.save();
        ctx.translate(0,y+spacing/2);
        ctx.rotate(Math.PI);
        ctx.drawImage(bossFx[1],-laneHalfWidth,-spacing/2,2*laneHalfWidth,spacing);
        ctx.restore();
      }
      for(const x of [-laneHalfWidth+1,laneHalfWidth-1]) line(x,0,x,h.length,'#ffbe65',2);
    } else {
      ctx.globalAlpha=Math.min(1,h.flare*6);
      ctx.drawImage(bossFx[2],-laneHalfWidth,0,laneHalfWidth*2,h.length);
    }
  } else {
    for (const x of h.points) {
      ctx.save();
      ctx.translate(x,h.y);
      if (warning) {
        ctx.fillStyle='#ff762636';
        ctx.strokeStyle='#ffbd6a';ctx.lineWidth=2;
        ctx.beginPath();ctx.arc(0,0,blastRadius,0,Math.PI*2);ctx.fill();ctx.stroke();
        for (let i=0;i<6;i++) {
          ctx.save();ctx.rotate(i*Math.PI/3);
          ctx.drawImage(bossFx[1],-8,blastRadius-22,16,22);
          ctx.restore();
        }
        ctx.beginPath();ctx.arc(0,0,Math.max(2,(1-power)*blastRadius),0,Math.PI*2);ctx.stroke();
      } else {
        ctx.globalAlpha=Math.min(1,h.flare*6);
        ctx.drawImage(bossFx[3],-blastRadius,-blastRadius,blastRadius*2,blastRadius*2);
      }
      ctx.restore();
    }
  }
  ctx.restore();
}
function drawBossCharge(boss) {
  const h=boss.hazard;
  if (!h || h.windup<=0) return;
  const power=1-h.windup/h.duration, size=28+power*49;
  ctx.save();
  if (boss.variant===1) ctx.filter='hue-rotate(162deg)';
  ctx.drawImage(bossFx[0],boss.x-size/2,h.originY-size/2,size,size);
  ctx.restore();
  ctx.save();
  const y=boss.y-enemySize(boss)*.53;
  ctx.fillStyle='#170e16e0';ctx.fillRect(boss.x-49,y-17,98,23);
  ctx.fillStyle='#ffcd7b';ctx.font='bold 12px system-ui';ctx.textAlign='center';
  ctx.fillText(h.lane ? '儲氣 · 避開箭道' : '儲氣 · 離開光圈',boss.x,y-3);
  ctx.fillRect(boss.x-46,y+1,92*power,3);
  ctx.restore();
}
function drawCinematic() {
  ctx.save();
  if (game.cutin>0) {
    const age = 1-game.cutin/cutinDuration;
    const zoom = reducedMotion ? 1 : 1+.13*age;
    const w = width*1.55*zoom, h = w/3;
    ctx.fillStyle='#090b1edc';ctx.fillRect(0,0,width,height);
    const y = height*.43-h/2;
    const actor=game.allyCutin ? game.friend.actor : game.hero.actor;
    const strip = cutins.naturalHeight/3;
    ctx.drawImage(cutins,0,strip*actor,cutins.naturalWidth,strip,(width-w)/2,y,w,h);
    ctx.fillStyle=stats[actor].color;
    ctx.fillRect(0,y-3,width,3);ctx.fillRect(0,y+h,width,3);
    ctx.textAlign='right';ctx.font='italic 900 29px system-ui';
    ctx.fillText((game.allyCutin ? '隊友必殺 · ' : '必殺 · ')+['金光連破','蒼藍反擊','水晶震波'][actor],width-18,y+h+39);
  } else if (game.explosion>0) {
    const age = 1-game.explosion/.62;
    const size = (reducedMotion ? .85 : .55+age*1.9)*height;
    drawChargeEffect(3,width/2,height*.48,size,age*.14,(1-age)*.86);
    drawChargeEffect(2,width/2,height*.48,size*.76,0,Math.max(0,.85-age*1.6));
  }
  ctx.restore();
}
function drawUltimateResult(result) {
  const {actor,hits,kills,life}=result;
  const age=1.35-life, color=stats[actor].color;
  ctx.save();
  ctx.textAlign='center';
  for (const hit of hits) {
    if (age<.42) {
      ctx.globalAlpha=1-age/.42;
      if (actor===0) {
        line(result.x,result.y,hit.x,hit.y,color,4);
        line(result.x,result.y,hit.x,hit.y,'#fff5c9',1);
      }
      art(42+actor,hit.x,hit.y,reducedMotion ? 59 : 46+age*90);
    }
    if (hit.boss) {
      ctx.globalAlpha=Math.min(1,life*4);
      ctx.font='bold 19px system-ui';
      ctx.strokeStyle='#191328';ctx.lineWidth=4;ctx.fillStyle='#fff0a5';
      const y=clamp(hit.y-39-(reducedMotion ? 0 : age*13),98,height-40);
      ctx.strokeText('−'+hit.damage+' HP',hit.x,y);
      ctx.fillText('−'+hit.damage+' HP',hit.x,y);
    }
  }
  ctx.globalAlpha=Math.min(1,life*4);
  const label=kills ? '必殺擊倒 × '+kills : hits.length ? '必殺命中' : '場上冇目標';
  ctx.font='bold 19px system-ui';
  const w=ctx.measureText(label).width+30;
  const y=height*.39;
  ctx.fillStyle='#11152def';ctx.fillRect((width-w)/2,y-20,w,30);
  ctx.fillStyle=color;ctx.fillRect((width-w)/2,y+9,w,2);
  ctx.fillText(label,width/2,y+2);
  ctx.restore();
}
function drawFall(hero) {
  const elapsed=fallSeconds-Math.max(0,game.ending);
  const stage=elapsed<.78 ? 0 : elapsed<1.64 ? 1 : 2;
  const start=[0,.78,1.64][stage];
  const blend=Math.min(1,(elapsed-start)/.22);
  const feetY=hero.y+52;
  const x=clamp(hero.x,84,width-84);
  function frame(index,alpha) {
    const img=fallSprites[game.fall.actor][index];
    const scale=160/Math.max(img.naturalWidth,img.naturalHeight);
    const w=img.naturalWidth*scale,h=img.naturalHeight*scale;
    ctx.globalAlpha=alpha;
    ctx.drawImage(img,-w/2,-h,w,h);
  }
  ctx.save();
  ctx.fillStyle='rgba(3,6,18,'+Math.min(.50,elapsed*.46)+')';
  ctx.fillRect(0,0,width,height);
  ctx.translate(hero.x+(x-hero.x)*Math.min(1,elapsed/1.64),feetY);
  shadow(0,0,33+stage*7);
  if (!reducedMotion && stage<2) ctx.rotate((stage===0?.055:-.035)*Math.sin(Math.min(1,(elapsed-start)/.78)*Math.PI));
  if (stage>0 && blend<1) frame(stage-1,1-blend);
  frame(stage,stage===0 ? 1 : blend);
  ctx.restore();
}
function draw() {
  road();
  if (!game) return;
  const {hero,time} = game;
  ctx.save();
  if (!reducedMotion && game.shake>0) ctx.translate(Math.sin(time*97)*game.shake,Math.cos(time*83)*game.shake);
  ctx.lineCap='round';
  drawTracks();
  if (game.gate) drawStormGate(game.gate);
  for (const boss of game.bosses) if (boss.hp>0 && boss.hazard) drawHazard(boss.hazard,boss);
  const breachWarning = game.enemies.some(enemy => enemy.type !== 2 && enemy.y > breachLine-94);
  ctx.save();
  ctx.setLineDash([9,7]);
  line(20,breachLine,width-20,breachLine,game.breachFlash > 0 ? '#ff687c' : breachWarning ? '#ffb369cc' : '#73cded64',breachWarning ? 2 : 1);
  ctx.restore();
  if (game.breachFlash > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(1,game.breachFlash*4);
    ctx.font = 'bold 14px system-ui';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd7d9';
    ctx.fillText('防線失守 · HP −2',width/2,breachLine+22);
    ctx.restore();
  }
  for (const shot of game.bullets) {
    const color = stats[selected].color;
    ctx.save();
    ctx.translate(shot.x,shot.y);
    ctx.rotate(Math.atan2(shot.dy,shot.dx));
    if (shot.level) {
      ctx.rotate(Math.PI/2);
      art(39+selected,0,0,30+shot.level*6);
    } else if (selected===0) {
      ctx.fillStyle='#e99829';
      ctx.fillRect(-8,-3,12,6);
      ctx.fillStyle='#fff3be';
      ctx.fillRect(-4,-2,5,4);
    } else if (selected===1) {
      ctx.strokeStyle='#a2fcff';
      ctx.lineWidth=2;
      ctx.beginPath();ctx.ellipse(-5,0,3,8,0,0,Math.PI*2);ctx.stroke();
    } else {
      star(0,0,9,Math.PI/2,'#f6a4ff');
    }
    ctx.restore();
    ctx.globalAlpha=.24;
    line(shot.x-shot.dx*.083,shot.y-shot.dy*.083,shot.x,shot.y,color,shot.size*2.3);
    ctx.globalAlpha=1;
    glow(shot.x,shot.y,15,color+'88');
    line(shot.x-shot.dx*.055,shot.y-shot.dy*.055,shot.x,shot.y,color,shot.size);
    line(shot.x-shot.dx*.014,shot.y-shot.dy*.014,shot.x,shot.y,'#fffaf7',2);
  }
  for (const enemy of [...game.enemies].sort((a,b)=>a.y-b.y)) {
    const size = enemySize(enemy);
    if (enemy.dashTime!==undefined && enemy.dashTime<.65) {
      ctx.save();ctx.setLineDash([6,5]);
      line(enemy.x,enemy.y,enemy.dashTo,enemy.y+142,'#ff82cf',3);
      ctx.restore();
    }
    shadow(enemy.x,enemy.y+size*.35,size*.33);
    const lunging = enemy.strike > 0 || (enemy.y > hero.y-108 && Math.abs(enemy.x-hero.x)<65);
    const frame = game.stage===3 && enemy.type===2 ? mantisFrame : game.stage>=2 ? reactorFrame+enemy.type+(enemy.variant||0) : pose(enemy.type+3,lunging,enemy.flash>0);
    art(frame,enemy.x,enemy.y+Math.sin(time*12+enemy.phase)*2,size,1,enemy.flash>0);
    if (enemy.type===2) drawBossCharge(enemy);
  }
  for (const boss of game.bosses) {
    if (boss.hp<=0 || !(boss.exposed>0)) continue;
    const y=boss.y-enemySize(boss)*.48;
    ctx.save();ctx.textAlign='center';ctx.font='bold 14px system-ui';
    ctx.fillStyle='#122324';ctx.fillRect(boss.x-33,y-16,66,20);
    ctx.fillStyle='#aaffdf';ctx.fillText('核心外露',boss.x,y);ctx.restore();
  }
  for (const coin of game.coins) {
    const type = coinTypes[coin.type];
    const y = coin.y+(reducedMotion ? 0 : 2*Math.sin(time*5+coin.x));
    const phase=reducedMotion ? 0 : [0,1,2,1][Math.floor(time*9+coin.x)%4];
    const sprite=[45,48,36][coin.type]+phase;
    glow(coin.x,y,20,type.color+'55');
    art(sprite,coin.x,y,coin.type===2 ? 34 : 27);
    ctx.save();
    ctx.font='bold 10px system-ui';ctx.textAlign='center';
    ctx.fillStyle='#fff8da';ctx.fillText(type.value,coin.x,y+21);
    ctx.restore();
  }
  if (game.fall) {
    drawFall(hero);
    ctx.restore();
    return;
  }
  if (game.friend) drawFriend(game.friend);
  shadow(hero.x,hero.y+48,35);
  if (chargeSource !== null) {
    const power = charge/chargeSeconds;
    drawChargeEffect(0,hero.x,hero.y+25,96+70*power,time*2,.4+.6*power);
    if (power >= 1) drawChargeEffect(1,hero.x,hero.y-23,155,time*.65,.87);
  }
  if (hero.guard>0) {
    glow(hero.x,hero.y-10,55,'#45e8fe70');
    ctx.strokeStyle='#8af3ff';
    ctx.lineWidth=2;
    ctx.beginPath();
    ctx.arc(hero.x,hero.y-10,36,0,Math.PI*2);
    ctx.stroke();
  }
  const injured = hero.hurt>.38 && hero.guard===0;
  const attacking = hero.attack>stats[selected].delay*.69 || game.casts.length>0;
  const running = hero.moving && Math.sin(hero.stride)>-.4;
  const frame = running && !attacking && !injured ? 21+selected : pose(selected,attacking,injured);
  const lift = hero.moving ? -3*Math.abs(Math.sin(hero.stride)) : Math.sin(time*5)*.7;
  const recoil = injured ? 4 : attacking ? 2 : 0;
  const front=Math.cos(hero.aim)<-.35;
  const baseFrame=frame;
  const upgradedFrame=equippedFrame(selected,front ? 0 : attacking ? 2 : 1);
  ctx.save();
  ctx.translate(hero.x,hero.y-22+lift+recoil);
  if (game.weaponLevel) ctx.rotate(injured ? -.18*hero.face : running ? .045*Math.sin(hero.stride) : 0);
  art(game.weaponLevel ? upgradedFrame : baseFrame,0,0,160,hero.face,hero.hurt>.54 && hero.guard===0);
  ctx.restore();
  const aimX = Math.sin(hero.aim), aimY = -Math.cos(hero.aim);
  const tipX = hero.x+aimX*57, tipY = hero.y-20+aimY*57;
  for (const side of [-1,1]) {
    line(tipX,tipY,tipX-aimX*10+side*aimY*5,tipY-aimY*10-side*aimX*5,stats[selected].color,3);
  }
  if (game.muzzle>0) {
    const power = game.muzzle/.085;
    const x=hero.x+aimX*59, y=hero.y-24+aimY*59;
    glow(x,y,33*power+5,stats[selected].color+'ce');
    star(x,y,6+power*18,hero.aim,stats[selected].color);
    star(x,y,4+power*10,hero.aim,'#fffbea');
  }
  for (const fx of game.impacts) {
    const left=fx.life/fx.max, r=Math.max(1,fx.radius*(1-left*left));
    ctx.globalAlpha=left*.85;
    ctx.strokeStyle=fx.color;
    ctx.lineWidth=1+4*left;
    ctx.beginPath();ctx.arc(fx.x,fx.y,r,0,2*Math.PI);ctx.stroke();
    if (left>.35) {
      glow(fx.x,fx.y,fx.radius*.85,'#ffc85caa');
      star(fx.x,fx.y,fx.radius*.65*left,.2,'#fff3c4');
    }
    if (game.weaponLevel && fx.radius<110 && fx.color===stats[selected].color) {
      ctx.globalAlpha=Math.min(1,left*2);
      art(42+selected,fx.x,fx.y,Math.min(115,fx.radius*(1.7-left*.6)));
    }
    if (fx.points) {

      ctx.globalAlpha=Math.min(1,left*2);
      ctx.textAlign='center';
      ctx.font='bold 13px system-ui';
      const y=fx.y-20-(1-left)*25;
      ctx.lineWidth=3;
      ctx.strokeStyle='#25192b';
      ctx.strokeText('+'+fx.points,fx.x,y);
      ctx.fillStyle='#fff2a8';
      ctx.fillText('+'+fx.points,fx.x,y);
    }
  }
  ctx.globalAlpha=1;
  for (const cast of game.casts) {
    const age = 1-cast.life/.75;
    drawChargeEffect(2,cast.x,cast.y,90+age*145,0,Math.max(0,1-age*2.4));
    drawChargeEffect(3,cast.x,cast.y,75+age*280,age*.35,1-age);
  }
  for (const p of game.particles) {
    ctx.globalAlpha = Math.min(1,p.life/p.max*1.8);
    ctx.fillStyle = p.color;
    line(p.x-p.dx*.026,p.y-p.dy*.026,p.x,p.y,p.color,2.3);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  const waveAge = time-[0,0,16,33][game.wave];
  if (waveAge < 1.3 && game.running) {
    ctx.save();
    ctx.globalAlpha=Math.min(1,waveAge*6,(1.3-waveAge)*3);
    ctx.textAlign='center';
    ctx.font='bold 18px system-ui';
    ctx.fillStyle='#091524d9';
    ctx.fillRect(width/2-71,height*.44-21,142,31);
    ctx.fillStyle=game.wave===3?'#ffc684':'#bdf8ff';
    ctx.fillText(game.wave===3?'魔王出場':'第 '+game.wave+' 波',width/2,height*.44);
    ctx.restore();
  }
  if (game.running && !game.won && time>=30 && time<33) {
    ctx.save();
    ctx.fillStyle='#390e1aea';ctx.fillRect(0,height*.32,width,61);
    ctx.textAlign='center';ctx.fillStyle='#ffd077';ctx.font='bold 21px system-ui';
    ctx.fillText('警告 · '+(game.stage===2 ? '雙核守衛' : stages[game.stage].boss)+'接近',width/2,height*.32+26);
    ctx.font='bold 14px system-ui';ctx.fillText('距離入場 '+Math.ceil(33-time)+' 秒',width/2,height*.32+49);
    ctx.restore();
  }
  if (game.cutin>0 || game.explosion>0) drawCinematic();
  if (game.running && game.ultimateResult) drawUltimateResult(game.ultimateResult);
}
function loop(now) {
  let dt = Math.min(.10,(now-(previous ?? now))/1000);
  previous = now;
  while (game?.running && !game.paused && dt>0) {
    const slice=Math.min(dt,1/60);
    step(slice);
    dt-=slice;
  }
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
Promise.all([street,reactor,skybridge,chargeFx,cutins,...bossFx,...fallSprites.flat(),...sprites].map(sprite=>sprite.decode())).then(()=>{
  ui.start.disabled = false;
  ui.start.textContent = '開始打怪';
}).catch(()=>{ui.start.textContent = '素材載入失敗，請重新整理';});
