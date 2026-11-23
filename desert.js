const sandFogTexture=new Image();
sandFogTexture.src='assets/sand-fog.webp';
const sandFogLayer=document.createElement('canvas');
sandFogLayer.width=210;
sandFogLayer.height=373;
const fogCtx=sandFogLayer.getContext('2d');
let sandCloudPattern;

const stormWarningSeconds=1.5;
function makeDesertWind() {
  return {direction:Math.random()<.5 ? -1 : 1,phase:'calm',drift:0,force:0,
    alertAt:4+Math.random()*4,duration:3+Math.random()*1.2,fog:0};
}

function updateDesertWind(wind,time,dt) {
  const age=time-wind.alertAt-stormWarningSeconds;
  if (age>=wind.duration) {
    wind.phase='calm';
    wind.direction*=-1;
    wind.alertAt=time+6+Math.random()*6;
    wind.duration=3+Math.random()*1.2;
  } else if (age>=0 && wind.phase!=='gust') {
    wind.phase='gust';
    battleAudio.play('sand-gust',.72);
  } else if (time>=wind.alertAt && wind.phase==='calm') {
    wind.phase='warning';
    battleAudio.play('warning',.74);
  }
  const active=wind.phase==='gust';
  wind.fog=active ? Math.min(1,age/.34,(wind.duration-age)/.85) : 0;
  const strength=active ? Math.min(1,age/.28,(wind.duration-age)/.4) : 0;
  wind.force=wind.direction*strength*78;
  wind.drift+=dt*(wind.direction*18+wind.force*2);
}

function updateStormAlert(wind) {
  const alert=document.getElementById('stormAlert');
  const phase=wind?.phase;
  if (!phase || phase==='calm') {
    alert.hidden=true;
    return;
  }
  const direction=wind.direction>0 ? '向右 →' : '← 向左';
  const text=phase==='warning' ? '沙塵暴警報　｜　濃霧將至　'+direction : '濃霧中　｜　橫風'+direction;
  if (alert.textContent!==text) {
    alert.dataset.phase=phase;
    alert.textContent=text;
  }
  alert.hidden=false;
}

function drawSandFog(wind,hero) {
  // Cut the player's sight radius out of the fog alone, leaving the arena underneath intact.
  if (!sandCloudPattern) sandCloudPattern=fogCtx.createPattern(sandFogTexture,'repeat');
  const w=sandFogLayer.width,h=sandFogLayer.height;
  fogCtx.clearRect(0,0,w,h);
  fogCtx.save();
  const shift=reducedMotion ? 0 : wind.drift*.35%384;
  fogCtx.translate(shift,0);
  fogCtx.fillStyle=sandCloudPattern;
  fogCtx.fillRect(-shift,0,w,h);
  fogCtx.restore();
  const x=hero.x*w/width,y=(hero.y-16)*h/height;
  const sight=fogCtx.createRadialGradient(x,y,20,x,y,109);
  sight.addColorStop(0,'#000');
  sight.addColorStop(.5,'rgba(0,0,0,.65)');
  sight.addColorStop(1,'transparent');
  fogCtx.save();
  fogCtx.globalCompositeOperation='destination-out';
  fogCtx.fillStyle=sight;fogCtx.fillRect(0,0,w,h);
  fogCtx.restore();
  ctx.save();
  ctx.globalAlpha=wind.fog;
  ctx.drawImage(sandFogLayer,0,0,width,height);
  ctx.restore();
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
