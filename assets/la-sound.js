/* Site sound, shared by the homepage and Pixel World. Everything is synthesized with Web Audio (no audio files):
   - one AudioContext with a master gain (the on/off switch) and a reverb that page sounds can use
   - the background music "Study session", which carries on from page to page in the same tab
   - the speaker button's popover: sound on/off and a music volume slider
   Browsers only allow sound after the visitor has tapped, clicked or pressed a key on that page. On a fresh page
   (a refresh, or arriving in Pixel World) the music starts straight away where the browser allows it; otherwise it
   starts on the first tap, and a small dot pulses on the speaker icon until then.
   Settings: localStorage la-sound ('on'/'off') and la-music-vol (0-1); sessionStorage la-music-t0 (the music's clock). */
(function(){
'use strict';
if(window.laSound)return;
var AC=window.AudioContext||window.webkitAudioContext,root=document.documentElement;
var on=true,vol=.7,ctx=null,master,verb,noise,music=null,unlocked=false,armed=false,want=false,buttons=[];
try{on=localStorage.getItem('la-sound')!=='off';var sv=localStorage.getItem('la-music-vol');if(sv!==null&&sv!==''&&isFinite(+sv))vol=Math.min(1,Math.max(0,+sv))}catch(e){}
var SFX=.8,MUSIC=.5;                                 /* master level; music level at the default 70% */
function level(){return MUSIC*Math.pow(vol/.7,2)}    /* squared, so equal slider steps sound even */
function noop(){}

/* ---------- Audio graph ---------- */
function build(){
 ctx=new AC();
 var comp=ctx.createDynamicsCompressor();comp.threshold.value=-14;comp.ratio.value=4;comp.connect(ctx.destination);
 master=ctx.createGain();master.gain.value=SFX;master.connect(comp);
 /* Reverb: a generated, slowly decaying noise impulse (a dark hall). */
 verb=ctx.createConvolver();var len=ctx.sampleRate*3.2|0,ir=ctx.createBuffer(2,len,ctx.sampleRate);
 for(var c=0;c<2;c++){var d=ir.getChannelData(c);for(var i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,3.2)}
 verb.buffer=ir;var vg=ctx.createGain();vg.gain.value=.55;verb.connect(vg);vg.connect(master);
 noise=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate);var nd=noise.getChannelData(0);for(var k=0;k<nd.length;k++)nd[k]=Math.random()*2-1;
 ctx.onstatechange=sync;
 api.master=master;api.verb=verb;api.noise=noise;
}
/* The context, ready for sound, or null while sound is off or the browser is still blocking it.
   Pass gesture=true only from inside a click, tap or key press: that is when browsers let sound start. */
function ready(gesture){
 if(!on||!AC)return null;
 if(!ctx){
  if(!gesture&&navigator.getAutoplayPolicy&&navigator.getAutoplayPolicy('audiocontext')==='disallowed')return null;
  try{build()}catch(e){ctx=null;return null}
 }
 if(ctx.state!=='running'){if(gesture){ctx.resume().then(sync,noop);unlocked=true}else if(!unlocked)return null}
 return ctx;
}
function blocked(){return on&&!!AC&&!ready()}
function env(g,t,a,peak,dec){g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(peak,t+a);g.gain.exponentialRampToValueAtTime(.0001,t+a+dec)}
function ramp(p,v,sec){var t=ctx.currentTime;p.cancelScheduledValues(t);p.setValueAtTime(p.value,t);p.linearRampToValueAtTime(v,t+sec)}
function blip(){var c=ready(true);if(!c)return;var t=c.currentTime,o=c.createOscillator(),g=c.createGain();o.frequency.value=880;o.connect(g);g.connect(master);env(g,t,.006,.04,.5);o.start(t);o.stop(t+.6)}

/* ---------- Music: "Study session" ----------
   Dm9 G13 Cmaj9 Am9 at 76 BPM: soft electric-piano chords, a round bassline, a swung beat, a little tape wobble and
   vinyl crackle. The bass and drums vary at random, so it never loops exactly. The clock lives in sessionStorage, so
   after a refresh or a move to Pixel World the piece picks up where it would be by now instead of starting over. */
function startMusic(){
 if(music||!on||!ctx||ctx.state!=='running')return;
 var beat=60/76,step=beat/2,swing=.17*beat,now=ctx.currentTime,ms=Date.now(),t0=0;
 try{t0=+sessionStorage.getItem('la-music-t0')||0}catch(e){}
 var carry=t0>0&&ms-t0<864e5&&ms>=t0;
 if(!carry){t0=ms;try{sessionStorage.setItem('la-music-t0',String(ms))}catch(e){}}
 var el=(ms-t0)/1000,i=Math.ceil(el/step-1e-6),t=now+.12+(i*step-el),first=true;

 var duck=ctx.createGain(),bus=ctx.createGain();duck.gain.setValueAtTime(0,now);duck.gain.linearRampToValueAtTime(1,now+(carry?1.5:4));
 bus.gain.value=level();bus.connect(duck);duck.connect(master);
 var send=ctx.createGain();send.gain.value=.22;duck.connect(send);send.connect(verb);
 var tape=ctx.createBiquadFilter();tape.type='lowpass';tape.frequency.value=3200;tape.connect(bus);
 var wob=ctx.createOscillator(),wg=ctx.createGain();wob.frequency.value=.25;wg.gain.value=600;wob.connect(wg);wg.connect(tape.frequency);wob.start();
 var crk=ctx.createBuffer(1,ctx.sampleRate*4,ctx.sampleRate),cd=crk.getChannelData(0);for(var k=0;k<cd.length;k++)cd[k]=Math.random()<.0008?(Math.random()*2-1)*.7:0;
 var cr=ctx.createBufferSource(),ch=ctx.createBiquadFilter(),cg=ctx.createGain();cr.buffer=crk;cr.loop=true;ch.type='highpass';ch.frequency.value=1500;cg.gain.value=.05;cr.connect(ch);ch.connect(cg);cg.connect(bus);cr.start();
 music={bus:bus,duck:duck};

 function mtof(m){return 440*Math.pow(2,(m-69)/12)}
 function pick(a){return a[Math.floor(Math.random()*a.length)]}
 function v(type,f,at,a,peak,dec){var o=ctx.createOscillator(),g=ctx.createGain();o.type=type;o.frequency.value=f;o.connect(g);g.connect(tape);env(g,at,a,peak,dec);o.start(at);o.stop(at+a+dec+.05)}
 function hiss(at,dur,type,f,q,peak){var s=ctx.createBufferSource(),fl=ctx.createBiquadFilter(),g=ctx.createGain();s.buffer=noise;s.playbackRate.value=.9+Math.random()*.2;fl.type=type;fl.frequency.value=f;fl.Q.value=q;s.connect(fl);fl.connect(g);g.connect(tape);env(g,at,.001,peak,dur);s.start(at,Math.random()*1.5);s.stop(at+dur+.05)}
 function keys(ms,at,vel){ms.forEach(function(m,k){var f=mtof(m+12),g=ctx.createGain(),o=ctx.createOscillator(),o2=ctx.createOscillator(),g2=ctx.createGain(),s=at+k*.012;
  o.type='sine';o2.type='sine';o.frequency.value=f;o2.frequency.value=f*2.002;g2.gain.value=.18;o.connect(g);o2.connect(g2);g2.connect(g);g.connect(tape);
  env(g,s,.01,.035*vel,2.2);o.start(s);o2.start(s);o.stop(s+2.4);o2.stop(s+2.4)})}
 function bell(m,at){var f=mtof(m);[[1,1,1.6],[2,.38,.9],[3,.14,.5]].forEach(function(h){v('sine',f*h[0],at,.004,.03*h[1],h[2])})}
 function kick(at,vel){var o=ctx.createOscillator(),g=ctx.createGain();o.frequency.setValueAtTime(120,at);o.frequency.exponentialRampToValueAtTime(45,at+.12);o.connect(g);g.connect(tape);env(g,at,.003,.42*vel,.28);o.start(at);o.stop(at+.35)}
 var chords=[[50,53,57,60,64],[43,53,59,64,69],[48,52,55,59,62],[45,55,60,64,71]],roots=[38,31,36,33];
 music.timer=setInterval(function(){
  var cur=ctx.currentTime;
  if(t<cur-.05){var skip=Math.ceil((cur-t)/step);i+=skip;t+=skip*step}  /* after a pause, skip ahead instead of playing a burst of late notes */
  while(t<cur+.25){
   if(on&&vol>0){
    var bar=Math.floor(i/8),pos=i%8,at=t+(pos%2?swing:0),c=bar%4;
    if(first&&pos)keys(chords[c],at,.6);   /* picking up mid-bar: sound the current chord at once */
    if(pos===0){keys(chords[c],at,.9);v('triangle',mtof(roots[c]),at,.01,.16,1.1)}
    if(pos===3&&Math.random()<.6)keys(chords[c].slice(2),at,.55);
    if(pos===4)v('triangle',mtof(roots[c]+(Math.random()<.5?7:12)),at,.01,.12,.6);
    if(pos===6&&Math.random()<.5)v('triangle',mtof(roots[c]+pick([3,5,10])),at,.01,.1,.4);
    if(pos===0||(pos===5&&Math.random()<.7))kick(at,pos?.7:1);
    if(pos===2||pos===6){hiss(at,.16,'bandpass',1800,.8,.1+Math.random()*.03);v('triangle',190,at,.002,.05,.09)}
    hiss(at,.035,'highpass',7000,.7,.045*(pos%2?.5:.8)*(.7+Math.random()*.3));
    if(pos===4&&Math.random()<.35)bell(pick([69,72,74,76,79]),at);
   }
   first=false;i++;t+=step;
  }
 },50);
}
/* Start the music once the browser allows it; until then, wait for the visitor's first tap, click or key. */
function sync(){
 if(!on||!want){disarm();return}
 if(ctx&&ctx.state==='running'){if(!document.hidden){disarm();startMusic()}}
 else arm();
}
function play(){
 want=true;if(!on)return;
 var c=ready();
 if(!c&&ctx&&ctx.state==='suspended')ctx.resume().then(sync,noop);   /* allowed without a tap in some browsers */
 sync();
}
/* Browsers count these as the visitor's go-ahead for sound. (pointerdown on a touch screen does not.) */
var GO=['pointerup','touchend','click','keydown'];
function arm(){if(armed)return;armed=true;GO.forEach(function(e){addEventListener(e,go,true)});mark()}
function disarm(){if(!armed)return;armed=false;GO.forEach(function(e){removeEventListener(e,go,true)});mark()}
function go(){
 if(!on){disarm();return}
 var c=ready(true);if(!c)return;
 try{var s=c.createBufferSource();s.buffer=c.createBuffer(1,1,22050);s.connect(c.destination);s.start(0)}catch(e){}   /* older iPhones also want a sound inside the tap */
 sync();
}

/* ---------- Settings ---------- */
function emit(){mark();try{dispatchEvent(new CustomEvent('la-sound',{detail:{on:on,volume:vol}}))}catch(e){}}
function setOn(v){
 on=!!v;try{localStorage.setItem('la-sound',on?'on':'off')}catch(e){}
 if(on){var c=ready(true);if(c){ramp(master.gain,SFX,.15);blip()}want=true;sync()}
 else{disarm();if(ctx){ramp(master.gain,0,.15);setTimeout(function(){if(!on&&ctx.state==='running')ctx.suspend()},250)}}
 emit();
}
function setVolume(v){
 vol=Math.min(1,Math.max(0,+v||0));try{localStorage.setItem('la-music-vol',String(Math.round(vol*100)/100))}catch(e){}
 if(music)music.bus.gain.setTargetAtTime(level(),ctx.currentTime,.04);
 emit();
}
/* Fade the music out before leaving the page (the next page picks it up again). */
function leave(sec){if(music&&ctx)ramp(music.duck.gain,0,sec||.8)}
addEventListener('pageshow',function(e){if(e.persisted&&music&&ctx)ramp(music.duck.gain,1,1.2)});
/* Fade out and pause while the tab is hidden; come back when the visitor returns. */
document.addEventListener('visibilitychange',function(){
 if(!ctx)return;
 if(document.hidden){if(music)ramp(music.duck.gain,0,.3);setTimeout(function(){if(document.hidden&&ctx.state==='running')ctx.suspend()},350)}
 else if(on){ctx.resume().then(function(){if(music)ramp(music.duck.gain,1,2);sync()},sync)}
});

/* ---------- Speaker button and its popover ---------- */
var zh=/^zh/i.test(root.lang),touch=matchMedia('(hover:none)').matches;
var T=zh?{btn:'声音设置',sound:'声音',music:'音乐音量',wait:'轻点页面任意处播放音乐'}
        :{btn:'Sound settings',sound:'Sound',music:'Music volume',wait:(touch?'Tap':'Click')+' anywhere to play the music'};
var css='.la-snd{position:relative}'+
'.la-snd[data-on="false"] .s-on,.la-snd[data-on="true"] .s-off{display:none!important}.la-snd[data-on="true"] .s-on{display:inline!important}'+
'.la-snd.la-wait::after{content:"";position:absolute;top:8px;right:7px;width:6px;height:6px;border-radius:50%;background:#F2B632;pointer-events:none;animation:la-ping 1.8s ease-out infinite}'+
'@keyframes la-ping{0%{box-shadow:0 0 0 0 rgba(242,182,50,.6)}70%,100%{box-shadow:0 0 0 7px rgba(242,182,50,0)}}'+
'.la-pop{position:fixed;z-index:120;width:236px;padding:14px 16px 16px;border-radius:16px;background:rgba(17,17,24,.9);-webkit-backdrop-filter:blur(18px) saturate(1.3);backdrop-filter:blur(18px) saturate(1.3);'+
 'box-shadow:0 0 0 1px rgba(236,236,242,.12),0 24px 60px -24px rgba(0,0,0,.9);color:#ECECF2;font-size:14px;line-height:1.3;opacity:0;transform:translateY(-6px);transition:opacity .18s,transform .18s cubic-bezier(.16,1,.3,1)}'+
'.la-pop.open{opacity:1;transform:none}.la-pop[hidden]{display:none}'+
'.la-row{display:flex;align-items:center;justify-content:space-between;gap:12px}'+
'.la-sw{position:relative;width:42px;height:24px;flex:none;padding:0;border-radius:999px;border:1px solid rgba(236,236,242,.25);background:transparent;cursor:pointer;transition:background .2s,border-color .2s}'+
'.la-sw::after{content:"";position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#8D8E9C;transition:transform .22s cubic-bezier(.16,1,.3,1),background .2s}'+
'.la-sw[aria-checked="true"]{background:#ECECF2;border-color:#ECECF2}.la-sw[aria-checked="true"]::after{transform:translateX(18px);background:#07070B}'+
'.la-vol{margin-top:14px;padding-top:14px;border-top:1px solid rgba(236,236,242,.1);transition:opacity .2s}.la-vol.off{opacity:.4}'+
'.la-vol output{color:#8D8E9C;font-variant-numeric:tabular-nums}'+
'.la-range{-webkit-appearance:none;appearance:none;display:block;width:100%;height:28px;margin:6px 0 -6px;background:none;cursor:pointer;--p:70%}'+
'.la-range:disabled{cursor:default}'+
'.la-range::-webkit-slider-runnable-track{height:4px;border-radius:4px;background:linear-gradient(90deg,#ECECF2 var(--p),rgba(236,236,242,.16) var(--p))}'+
'.la-range::-moz-range-track{height:4px;border-radius:4px;background:linear-gradient(90deg,#ECECF2 var(--p),rgba(236,236,242,.16) var(--p))}'+
'.la-range::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;margin-top:-6px;border:0;border-radius:50%;background:#fff;box-shadow:0 0 0 4px rgba(242,182,50,.18),0 0 12px rgba(242,182,50,.45)}'+
'.la-range::-moz-range-thumb{width:16px;height:16px;border:0;border-radius:50%;background:#fff;box-shadow:0 0 0 4px rgba(242,182,50,.18),0 0 12px rgba(242,182,50,.45)}'+
'.la-pop :focus-visible{outline:2px solid #CBB9FF;outline-offset:3px}'+
'@media (prefers-reduced-motion:reduce){.la-snd.la-wait::after{animation:none}.la-pop,.la-sw,.la-sw::after{transition:none}}';
var pop,sw,range,out,volRow,openBtn=null;
function mark(){
 var wait=on&&armed;
 buttons.forEach(function(b){b.setAttribute('data-on',on);b.classList.toggle('la-wait',wait);b.title=wait?T.wait:T.btn});
 if(sw){sw.setAttribute('aria-checked',on);range.disabled=!on;volRow.classList.toggle('off',!on);
  var p=Math.round(vol*100);range.value=p;range.style.setProperty('--p',p+'%');out.textContent=p+'%'}
}
function makePop(){
 var st=document.createElement('style');st.id='la-sound-style';st.textContent=css;document.head.appendChild(st);
 pop=document.createElement('div');pop.className='la-pop';pop.id='laSoundPop';pop.setAttribute('role','dialog');pop.setAttribute('aria-label',T.btn);pop.hidden=true;
 pop.innerHTML='<div class="la-row"><span id="laSndLbl"></span><button type="button" class="la-sw" role="switch" aria-labelledby="laSndLbl"></button></div>'+
  '<div class="la-vol"><div class="la-row"><label for="laVol" id="laVolLbl"></label><output for="laVol"></output></div>'+
  '<input class="la-range" id="laVol" type="range" min="0" max="100" step="1"></div>';
 document.body.appendChild(pop);
 sw=pop.querySelector('.la-sw');range=pop.querySelector('input');out=pop.querySelector('output');volRow=pop.querySelector('.la-vol');
 pop.querySelector('#laSndLbl').textContent=T.sound;pop.querySelector('#laVolLbl').textContent=T.music;
 sw.addEventListener('click',function(){setOn(!on)});
 range.addEventListener('input',function(){setVolume(range.value/100)});
 document.addEventListener('keydown',function(e){if(e.key==='Escape'&&openBtn){e.stopPropagation();close(true)}},true);
 document.addEventListener('pointerdown',function(e){if(openBtn&&!pop.contains(e.target)&&!openBtn.contains(e.target))close()},true);
 document.addEventListener('focusin',function(e){if(openBtn&&!pop.contains(e.target)&&!openBtn.contains(e.target))close()});
 addEventListener('resize',place);addEventListener('scroll',place,{passive:true});
}
function place(){
 if(!openBtn)return;var r=openBtn.getBoundingClientRect(),w=pop.offsetWidth,W=document.documentElement.clientWidth;
 pop.style.top=Math.round(r.bottom+10)+'px';pop.style.left=Math.round(Math.min(W-12-w,Math.max(12,r.right-w)))+'px';
}
function open(b){
 if(!pop)makePop();openBtn=b;b.setAttribute('aria-expanded','true');pop.hidden=false;mark();place();
 requestAnimationFrame(function(){pop.classList.add('open')});
}
function close(refocus){
 if(!openBtn)return;var b=openBtn;openBtn=null;b.setAttribute('aria-expanded','false');pop.classList.remove('open');
 setTimeout(function(){if(!openBtn)pop.hidden=true},180);if(refocus)b.focus();
}
function attach(b){
 if(!b||b.__laSound)return;b.__laSound=1;buttons.push(b);
 if(!document.getElementById('la-sound-style'))makePop();
 b.classList.add('la-snd');b.removeAttribute('aria-pressed');b.disabled=!AC;
 b.setAttribute('aria-label',T.btn);b.setAttribute('aria-expanded','false');b.setAttribute('aria-controls','laSoundPop');b.setAttribute('aria-haspopup','dialog');
 b.onclick=null;b.addEventListener('click',function(e){e.preventDefault();if(openBtn===b)close();else open(b)});
 mark();
}

var api={ready:ready,blocked:blocked,play:play,leave:leave,attach:attach,
 on:function(){return on},setOn:setOn,volume:function(){return vol},setVolume:setVolume,
 playing:function(){return !!music&&!!ctx&&ctx.state==='running'}};
window.laSound=api;

/* Start up. The homepage's greeting curtain (html.intro) starts the music itself when it lifts. */
function boot(){attach(document.getElementById('soundBtn'));if(!root.classList.contains('intro'))play()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
