const signatureSheet=new Image();
signatureSheet.src='assets/boss-signatures.webp';
const signatures=[
  {name:'熔星墜地',color:'#ff8453',cue:'走出隕石圈'},
  {name:'雙爐貫流',color:'#ffb94d',cue:'避開直線'},
  {name:'冰冠斷層',color:'#71e8ff',cue:'向上或向下避'},
  {name:'冥鐘迴響',color:'#d39aff',cue:'避開紫色圓環'},
  {name:'日蝕蠍葬',color:'#ffdc66',cue:'走出蠍印'}
];
const signatureHitContext=document.createElement('canvas').getContext('2d');

function makeSignature(stage,boss,hero) {
  const id=stage===1 ? 0 : stage===2 ? 1+boss.variant : stage;
  const x=hero.x,y=hero.y-12,side=x<width/2 ? 1 : -1;
  const area=new Path2D(),art=[];
  function disc(cx,cy,r) {
    area.moveTo(cx+r,cy);area.arc(cx,cy,r,0,Math.PI*2);
    art.push([cx,cy,r*2]);
  }
  if (id===0) {
    disc(x,y,61);disc(x+side*142,y-45,49);
  } else if (id===1) {
    for (const cx of [x,x+side*140]) {
      area.rect(cx-28,335,56,breachLine-335);
      for(let cy=367;cy<breachLine;cy+=55) art.push([cx,cy,62]);
    }
  } else if (id===2) {
    area.rect(0,y-32,width,64);
    for(let cx=20;cx<width+20;cx+=61) art.push([cx,y,72]);
  } else if (id===3) {
    const cx=x+side*88;
    area.arc(cx,y,124,0,Math.PI*2);
    area.moveTo(cx+55,y);area.arc(cx,y,55,0,Math.PI*2,true);
    for(let i=0;i<10;i++) art.push([cx+90*Math.cos(i*Math.PI/5),y+90*Math.sin(i*Math.PI/5),63]);
  } else {
    for(let i=-1;i<=1;i++) disc(x+i*96,y+i*50,47);
  }
  return {id,area,art};
}
function signatureSprite(id,x,y,size) {
  ctx.drawImage(signatureSheet,id*256,0,256,256,x-size/2,y-size/2,size,size);
}
function drawSignature(h) {
  const {id,area,art}=h.signature,style=signatures[id],warning=h.windup>0;
  ctx.save();
  ctx.fillStyle=style.color+(warning?'40':'96');ctx.fill(area);
  ctx.strokeStyle='#251a32';ctx.lineWidth=5;ctx.stroke(area);
  ctx.strokeStyle=style.color;ctx.lineWidth=2;ctx.stroke(area);
  ctx.clip(area);
  ctx.globalAlpha=warning ? .28+.26*(1-h.windup/h.duration) : Math.min(1,h.flare*4);
  const size=warning ? .54 : reducedMotion ? 1 : 1.18-.28*h.flare/.72;
  for(const [x,y,d] of art) signatureSprite(id,x,y,d*size);
  ctx.restore();
}
