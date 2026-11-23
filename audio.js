const battleAudio = (() => {
  const names = ['actions','shot-0','shot-1','shot-2','charge','hit','coin','warning','warden-toll','sand-gust','sand-step','pincer-slam',
    'tonic-pickup','weapon-pickup','prism-volley','ion-lance','flare-repeat'];
  for (let actor=0;actor<3;actor++) {
    names.push('shot-'+actor+'-up','ult-'+actor,'voice-'+actor);
  }
  // Start and duration in the shared action sound bank, in seconds.
  const actions={
    'select':[0.0, 0.13],
    'start':[0.19, 0.461],
    'wet-step':[0.711, 0.12],
    'steel-step':[0.891, 0.13],
    'hurt':[1.081, 0.28],
    'block':[1.421, 0.30701],
    'dodge':[1.788, 0.3],
    'dash':[2.148, 0.25],
    'breach':[2.458, 0.3],
    'kill':[2.818, 0.25],
    'boss-down':[3.128, 0.85],
    'boss-strike':[4.038, 0.47],
    'summon':[4.568, 0.48],
    'depart':[5.108, 0.29],
    'upgrade':[5.458, 0.51],
    'wave':[6.028, 0.51],
    'boss-entry':[6.598, 0.8],
    'fall':[7.458, 0.82],
    'win':[8.338, 1.18],
    'lose':[9.578, 0.99],
    'cancel':[10.628, 0.15]
  };
  const clips=new Map(), pending=new Map(), active=new Set(), last=new Map();
  const toggle=document.getElementById('soundToggle');
  let context, master, chargeNode, voice, muted=false, paused=false;
  try { muted=localStorage.getItem('monster-rush-muted')==='yes'; } catch {}

  const testButton=document.getElementById('testAudio');
  const titleStatus=document.getElementById('titleAudioStatus');
  const gameStatus=document.getElementById('audioStatus');
  let checkId=0, retrySound=false;
  const musicToggle=document.getElementById('musicToggle');
  let inBattle=false, musicMuted=false, music=null, musicGain=null, offset=0, startedAt=0;
  try { musicMuted=localStorage.getItem('monster-rush-music-muted')==='yes'; } catch {}

  function stopMusic() {
    if (!music) return;
    offset=(offset+context.currentTime-startedAt)%music.buffer.duration;
    music.stop();
    music.disconnect();
    musicGain.disconnect();
    music=musicGain=null;
  }
  function syncMusic() {
    if (!inBattle || musicMuted || muted) { stopMusic(); return; }
    if (!context || music || paused) return;
    const buffer=clips.get('battle-theme');
    if (!buffer) { load('battle-theme'); return; }
    music=context.createBufferSource();
    music.buffer=buffer;
    music.loop=true;
    musicGain=context.createGain();
    musicGain.gain.value=.40;
    music.connect(musicGain);
    musicGain.connect(master);
    startedAt=context.currentTime;
    music.start(0,offset);
  }
  function duck(seconds) {
    if (!musicGain) return;
    const volume=musicGain.gain,now=context.currentTime;
    volume.cancelScheduledValues(now);
    volume.setTargetAtTime(.16,now,.025);
    volume.setTargetAtTime(.40,now+seconds,.16);
  }
  function label() {
    musicToggle.textContent=musicMuted ? '音樂：關' : '音樂：開';
    musicToggle.setAttribute('aria-pressed',String(!musicMuted));
    const ready=!muted && !retrySound && (context?.state==='running' || (context && paused));
    toggle.textContent=muted ? '聲音：關' : ready ? '聲音：開' : '撳掣開聲';
    toggle.setAttribute('aria-pressed',String(Boolean(ready)));
  }
  function load(name) {
    if (clips.has(name)) return Promise.resolve(clips.get(name));
    if (!pending.has(name)) {
      const request=fetch('assets/sound/'+name+'.mp3').then(response=>{
        if (!response.ok) throw new Error('Audio unavailable');
        return response.arrayBuffer();
      }).then(data=>context.decodeAudioData(data)).then(buffer=>{
        clips.set(name,buffer);
        if (name==='battle-theme') syncMusic();
        return buffer;
      }).catch(()=>null).finally(()=>pending.delete(name));
      pending.set(name,request);
    }
    return pending.get(name);
  }
  function unlock() {
    if (muted || paused) return;
    const AudioEngine=window.AudioContext || window.webkitAudioContext;
    if (!AudioEngine) return;
    if (!context) {
      // Use the media output route on browsers that expose an audio session.
      try { if (window.navigator?.audioSession) window.navigator.audioSession.type='playback'; } catch {}
      try { context=new AudioEngine(); } catch { return; }
      context.onstatechange=label;
      master=context.createGain();
      master.gain.value=.85;
      const limiter=context.createDynamicsCompressor();
      master.connect(limiter);
      limiter.connect(context.destination);
    }
    const ready=context.state==='running' ? Promise.resolve(true) :
      context.resume().then(()=>context.state==='running').catch(()=>false);
    names.forEach(load);
    syncMusic();
    label();
    return ready;
  }
  // Recover from OS audio interruptions on the next real control input.
  function resumeOnInput() {
    if (context && context.state!=='running' && !paused && !muted) unlock();
  }
  window.addEventListener('pointerdown',resumeOnInput);
  window.addEventListener('keydown',resumeOnInput);
  function stop(node) {
    if (node) node.stop();
  }
  function silence() {
    active.forEach(stop);
    active.clear();
    chargeNode=voice=null;
    last.clear();
  }
  function play(name,gain=1,minimumGap=0) {
    if (muted || paused || !context || context.state==='closed') return null;
    const segment=actions[name];
    const buffer=clips.get(segment ? 'actions' : name);
    const earlyShot=!buffer && name.startsWith('shot-');
    if (!buffer && !earlyShot) return null;
    const now=context.currentTime;
    if (now-(last.get(name) ?? -Infinity)<minimumGap) return null;
    last.set(name,now);
    const source=earlyShot ? context.createOscillator() : context.createBufferSource();
    const level=context.createGain();
    if (buffer) source.buffer=buffer;
    level.gain.value=gain;
    source.connect(level);
    level.connect(master);
    active.add(source);
    source.onended=()=>{
      active.delete(source);
      if (voice===source) voice=null;
      if (chargeNode===source) chargeNode=null;
      source.disconnect();
      level.disconnect();
    };
    if (earlyShot) {
      const pitch=[1080,480,1700][Number(name[5])];
      source.frequency.setValueAtTime(pitch,now);
      source.frequency.exponentialRampToValueAtTime(pitch*.22,now+.10);
      level.gain.setValueAtTime(gain*.45,now);
      level.gain.exponentialRampToValueAtTime(.001,now+.11);
      source.start();
      source.stop(now+.12);
    } else if (segment) source.start(0,segment[0],segment[1]);
    else source.start();
    if (name==='warning' || name==='warden-toll') duck(.48);
    return source;
  }
  function setMuted(value) {
    muted=value;
    try { localStorage.setItem('monster-rush-muted',muted ? 'yes' : 'no'); } catch {}
    label();
  }
  async function checkSound(status) {
    const id=++checkId;
    setMuted(false);
    if (paused) { status.textContent='繼續打怪就會有聲。'; return; }
    status.textContent='正在開啟聲音…';
    const ready=unlock();
    const timer=setTimeout(()=>{
      if (id===checkId) status.textContent='聲音未就緒，可以再撳一次。';
    },3000);
    try {
      if (!await ready) {
        if (id===checkId) {
          retrySound=true;
          label();
          status.textContent='未能開聲，請再撳一次或用瀏覽器開啟遊戲。';
        }
        return;
      }
      const bank=await load('actions');
      if (id!==checkId || muted || paused || (status===titleStatus && inBattle)) return;
      if (!bank || context.state!=='running' || !play('start',.92)) {
        retrySound=true;
        label();
        status.textContent='未能播放試聽聲，請再試。';
        return;
      }
      retrySound=false;
      label();
      status.textContent='♪ 試聽聲已播放';
      if (status===titleStatus) testButton.textContent='♪ 再聽一次';
    } finally { clearTimeout(timer); }
  }
  testButton.onclick=()=>checkSound(titleStatus);
  toggle.onclick=()=>{
    if (muted || retrySound || !context || (!paused && context.state!=='running')) {
      return checkSound(gameStatus);
    }
    checkId++;
    gameStatus.textContent='';
    setMuted(true);
    silence();
    stopMusic();
  };
  musicToggle.onclick=()=>{
    musicMuted=!musicMuted;
    try { localStorage.setItem('monster-rush-music-muted',musicMuted ? 'yes' : 'no'); } catch {}
    if (!musicMuted) unlock();
    syncMusic();
    label();
  };
  label();
  return {
    setBattle(value) {
      checkId++;
      gameStatus.textContent='';
      stopMusic();
      offset=0;
      inBattle=value;
      syncMusic();
    },
    unlock,play,silence,
    pause(value) {
      paused=value;
      if (!paused) gameStatus.textContent='';
      if (!context) return;
      if (paused) context.suspend().catch(()=>{});
      else unlock();
    },
    charge() { stop(chargeNode); chargeNode=play('charge',.36); },
    cancelCharge() { stop(chargeNode); chargeNode=null; },
    callout(actor) { stop(voice); voice=play('voice-'+actor,1.38); if (voice) duck(voice.buffer.duration); },
    blast(actor) { play('ult-'+actor,voice ? .46 : .83); }
  };
})();
