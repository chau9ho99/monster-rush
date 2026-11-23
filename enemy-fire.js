// All angles are fixed at the start of the warning; flying bolts never track the hero.
const enemyVolleys = {
  1: {spread:[0], speed:194, damage:9, warning:1.05, interval:3.4, color:'#ff8557'},
  2: {spread:[-.23,0,.23], speed:202, damage:11, warning:.95, interval:3.5, color:'#ff64ac'},
  3: {spread:[0], speed:255, damage:13, warning:.85, interval:2.9, color:'#ff546a'}
};

function startEnemyVolley(enemy,delay) {
  const y=enemy.y+12;
  const angle=Math.atan2(game.hero.x-enemy.x,game.hero.y-12-y);
  enemy.aimedShot={angle,remaining:delay,duration:delay};
}

function stepEnemyFire(dt) {
  const {stage,hero}=game;
  const volley=enemyVolleys[stage];
  if (!volley) return;
  if (game.time>=game.nextVolley) {
    // Begin with the frontmost eligible monster. Crossfire needs a second, distinct lane.
    const ready=game.enemies.filter(e=>e.type!==2 && !e.aimedShot && e.dashTime===undefined && e.y>=82 && e.y<=335)
      .sort((a,b)=>b.y-a.y);
    const first=ready[0];
    if (first) {
      startEnemyVolley(first,volley.warning);
      const partner=stage===3 && ready.find(e=>Math.abs(e.x-first.x)>=96);
      if (partner) startEnemyVolley(partner,volley.warning+.28);
      battleAudio.play('enemy-lock',.48,.2);
    }
    game.nextVolley=game.time+(first ? volley.interval+(game.wave===3 ? .8 : 0) : .25);
  }
  for (const enemy of game.enemies) {
    const aim=enemy.aimedShot;
    if (!aim) continue;
    aim.remaining-=dt;
    if (aim.remaining>0) continue;
    for (const offset of volley.spread) {
      const angle=aim.angle+offset;
      game.hostileBolts.push({x:enemy.x,y:enemy.y+12,dx:Math.sin(angle)*volley.speed,dy:Math.cos(angle)*volley.speed});
    }
    enemy.aimedShot=null;
    enemy.strike=.25;
    battleAudio.play('enemy-shot',.55,.08);
  }
  game.hostileBolts=game.hostileBolts.filter(bolt=>{
    bolt.x+=bolt.dx*dt;
    bolt.y+=bolt.dy*dt;
    if (Math.hypot(bolt.x-hero.x,bolt.y-(hero.y-12))<15) {
      if (hero.guard>0) battleAudio.play('block',.52,.12);
      else if (hero.hurt<=0) {
        hero.hp-=volley.damage;
        hero.hurt=.7;
        battleAudio.play('hurt',.66,.12);
        burst(hero.x,hero.y-12,volley.color,10);
      }
      return false;
    }
    return bolt.x>=-12 && bolt.x<=width+12 && bolt.y<=height+12;
  });
}

function drawEnemyFire() {
  const volley=enemyVolleys[game.stage];
  if (!volley || game.won || game.ending || !game.running) return;
  ctx.save();
  for (const enemy of game.enemies) {
    const aim=enemy.aimedShot;
    if (!aim) continue;
    const y=enemy.y+12;
    ctx.setLineDash([6,7]);
    for (const offset of volley.spread) {
      const angle=aim.angle+offset;
      const length=(breachLine-y)/Math.cos(angle);
      line(enemy.x,y,enemy.x+Math.sin(angle)*length,breachLine,volley.color+'bd',2);
    }
    ctx.setLineDash([]);
    ctx.beginPath();ctx.arc(enemy.x,y,11+9*aim.remaining/aim.duration,0,Math.PI*2);
    ctx.strokeStyle='#301628';ctx.lineWidth=5;ctx.stroke();
    ctx.strokeStyle=volley.color;ctx.lineWidth=2.5;ctx.stroke();
    star(enemy.x,y,9,0,'#fff1d5');
  }
  for (const bolt of game.hostileBolts) {
    const {x,y,dx,dy}=bolt;
    line(x-dx*.060,y-dy*.060,x,y,'#351828',9);
    line(x-dx*.055,y-dy*.055,x,y,volley.color,5);
    ctx.beginPath();ctx.arc(x,y,6.5,0,2*Math.PI);
    ctx.fillStyle=volley.color;ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='#361529';ctx.stroke();
    star(x,y,5,0,'#fffce7');
  }
  ctx.restore();
}
