function makeDesertWind() {
  return {direction:1, phase:'calm', drift:0, force:0};
}

function updateDesertWind(wind,time,dt) {
  // Each gust has a quiet lead-in, a visible warning, then a crosswind.
  const cycle = Math.floor(time/9);
  const beat = time-cycle*9;
  const phase = beat < 4 || beat >= 8.4 ? 'calm' : beat < 5.5 ? 'warning' : 'gust';
  if (phase==='warning' && wind.phase!=='warning') battleAudio.play('sand-gust',.6);
  wind.direction = cycle%2===0 ? 1 : -1;
  wind.phase = phase;
  const strength = phase==='gust' ? Math.min(1,(beat-5.5)/.28,(8.4-beat)/.4) : 0;
  wind.force = wind.direction*strength*78;
  wind.drift += dt*(wind.direction*18+wind.force*2);
}

function drawDesertWeather(wind) {
  if (!wind) return;
  const gust = wind.phase==='gust';
  ctx.save();
  if (!reducedMotion) {
    const count=gust ? 64 : 24;
    for (let i=0;i<count;i++) {
      const depth=.45+(i%6)*.13;
      const period=width+96;
      const x=((i*91+wind.drift*depth)%period+period)%period-48;
      const y=(i*67+Math.sin(i+game.time*.8)*4+height)%height;
      line(x,y,x+(gust?31:9)*depth*wind.direction,y-2,'#fff0bc8c',1.4*depth);
    }
  }
  if (wind.phase!=='calm') {
    const y=118, label=gust ? '橫風' : '沙暴將至';
    ctx.fillStyle='#2b1a10eb';ctx.fillRect(12,y-18,123,25);
    ctx.fillStyle=gust?'#ffb14d':'#ffeab1';
    ctx.fillRect(12,y-18,3,25);
    ctx.textAlign='left';ctx.font='bold 13px system-ui';
    ctx.fillText(label+(wind.direction>0?'　向右 →':'　← 向左'),21,y);
  }
  ctx.restore();
}

function drawPincerStrike(h) {
  const warning=h.windup>0;
  const top=315, bottom=breachLine+4;
  const left=h.safeX-h.safeHalf, right=h.safeX+h.safeHalf;
  ctx.save();
  ctx.fillStyle=warning ? '#b0281754' : '#ff782799';
  ctx.fillRect(0,top,left,bottom-top);
  ctx.fillRect(right,top,width-right,bottom-top);
  ctx.fillStyle='#093b3b40';ctx.fillRect(left,top,right-left,bottom-top);
  for (const edge of [left,right]) {
    line(edge,top,edge,bottom,'#173a3d',5);
    line(edge,top,edge,bottom,'#92ffe8',2);
  }
  // Teeth point inward from the danger zones. The lit gap is safe even at impact.
  for (let y=top+12;y<bottom-6;y+=34) {
    for (const [edge,sign] of [[left,1],[right,-1]]) {
      const reach=warning ? 11 : 26;
      ctx.fillStyle=warning?'#ffcc7c':'#ffedac';ctx.beginPath();
      ctx.moveTo(edge-sign*reach,y-8);ctx.lineTo(edge,y);
      ctx.lineTo(edge-sign*reach,y+8);ctx.closePath();ctx.fill();
    }
  }
  ctx.fillStyle='#09312feb';ctx.fillRect(h.safeX-34,top+8,68,20);
  ctx.textAlign='center';ctx.font='bold 13px system-ui';ctx.fillStyle='#b2fff2';
  ctx.fillText('安全沙道',h.safeX,top+23);
  ctx.restore();
}

function drawDuneMonster(enemy,size,time) {
  const beat=reducedMotion ? 0 : Math.sin(time*(enemy.type===2 ? 2 : 9)+enemy.phase);
  ctx.save();
  ctx.translate(enemy.x,enemy.y);
  if (enemy.type===0) ctx.rotate(beat*.055);
  if (enemy.type===1) ctx.translate(0,-Math.abs(beat)*3);
  ctx.scale(1+beat*.018,1-beat*.012);
  art(desertFrame+enemy.type,0,0,size,1,enemy.flash>0);
  if (enemy.type===2 && enemy.exposed>0) glow(0,-size*.025,size*.21,'#71ffeeb0');
  ctx.restore();
}
