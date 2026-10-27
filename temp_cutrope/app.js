(function(){
  'use strict';
  function init(){
    const $=id=>document.getElementById(id),levels=globalThis.CutRopeLevels;
    if(!levels?.length){$('overlayTitle').textContent='关卡资源未能载入';$('overlayText').textContent='请将完整的 cutrope 目录一起保留，然后刷新页面。';$('primaryBtn').disabled=true;return;}
    const assets=new CutRopeMedia.Assets(),sound=new CutRopeMedia.Sound();assets.preload();
    const renderer=new CutRopeRenderer($('gameCanvas'),assets),dialog=$('levelDialog');
    let storageAvailable=true;
    let saved={scores:{},last:0,sound:true};
    try{
      const data=JSON.parse(localStorage.getItem('atb-cutrope-v1')||'null');
      if(data&&typeof data==='object'){
        saved.last=Number.isInteger(data.last)&&data.last>=0&&data.last<50?data.last:0;
        saved.sound=data.sound!==false;
        if(data.scores&&typeof data.scores==='object')for(const [k,v] of Object.entries(data.scores))
          if(/^\d+$/.test(k)&&+k<50&&Number.isInteger(v)&&v>=0&&v<=3)saved.scores[k]=v;
      }
    }catch{storageAvailable=false;}
    const save=()=>{try{localStorage.setItem('atb-cutrope-v1',JSON.stringify(saved));}catch{storageAvailable=false;}};
    let index=saved.last,world,mode='ready',dialogBox=1,dialogResume='ready';
    let pointer=null,last=performance.now(),accumulator=0,terminalAt=0,renderFailed=false;
    const announce=text=>{$('announcement').textContent=text;};
    function soundUI(){
      $('soundBtn').setAttribute('aria-pressed',String(saved.sound));
      $('soundBtn').setAttribute('aria-label',saved.sound?'关闭声音':'开启声音');
      $('soundBtn').querySelector('.mute-slash').hidden=saved.sound;
    }
    function unlock(){sound.unlock();sound.setEnabled(saved.sound);}
    function progress(){
      const total=Object.values(saved.scores).reduce((a,b)=>a+b,0);
      $('totalStars').textContent=total+' / 150';$('progressFill').style.width=total/150*100+'%';
    }
    function actions(){
      const box=$('accessibleActions');box.replaceChildren();
      const add=(label,fn)=>{const b=document.createElement('button');b.textContent=label;b.type='button';b.onclick=()=>{if(mode==='playing'){unlock();fn();processEvents();actions();}};box.append(b);};
      world.ropes.forEach((r,i)=>{if(r.active)add('切绳 '+(i+1),()=>world.cut(r));});
      if(world.bubble)add('戳破气泡',()=>world.tap(world.candy));
      world.pumps.forEach((p,i)=>add('气垫 '+(i+1),()=>world.tap(p)));
    }
    function overlay(tag,title,text,primary,secondary=false){
      $('overlayTag').textContent=tag;$('overlayTitle').textContent=title;$('overlayText').textContent=text;
      $('primaryBtn').replaceChildren(document.createTextNode(primary+'  →'));
      $('secondaryBtn').hidden=!secondary;$('overlay').hidden=false;
      $('resultStars').hidden=mode!=='won';
      if(mode==='won')$('resultStars').textContent='★'.repeat(world.collected)+'☆'.repeat(3-world.collected);
    }
    function load(next,play=true){
      index=CutRopePhysics.clamp(next,0,49);world=new CutRopePhysics.World(levels[index]);
      mode=play?'playing':'ready';renderer.reset();pointer=null;accumulator=0;terminalAt=0;
      saved.last=index;save();$('overlay').hidden=play;$('renderError').hidden=true;renderFailed=false;
      $('boxBadge').textContent=String(world.level.box).padStart(2,'0');
      $('boxTitle').textContent=world.level.box===1?'纸盒时光':'布盒奇遇';
      $('levelLabel').textContent='第 '+world.level.number+' / 25 关';
      document.querySelectorAll('[data-box]').forEach(b=>b.classList.toggle('active',+b.dataset.box===world.level.box));
      $('tipNumber').textContent=String(world.level.number).padStart(2,'0');
      const tut=world.level.objects.find(o=>o.type==='tutorialText');
      const tips=world.level.objects.some(o=>o.spider==='true')?'蜘蛛也在惦记糖果，\n及时切断它的绳子。':world.pumps.length?'点击蓝色气垫，\n给糖果一个轻巧的推力。':world.bubbles.length?'气泡会带糖果上升，\n轻点气泡，让它落下。':'有时，放手的时机\n比方向更重要。';
      $('tipText').textContent=tut?.text||tips;$('tipText').style.whiteSpace='pre-line';
      if(!play)overlay('HELLO, LITTLE FRIEND','Om Nom 饿啦！','划过绳索，收集星星，把糖果送到它的嘴边。','开始喂食');
      $('pauseBtn').setAttribute('aria-label','暂停（空格）');
      updateStars();actions();progress();announce('已进入'+$('boxTitle').textContent+'第'+world.level.number+'关');
      renderer.draw(world);if(play)sound.resume();
    }
    function updateStars(){
      [...$('hudStars').children].forEach((s,i)=>s.classList.toggle('collected',i<world.collected));
      $('hudStars').setAttribute('aria-label','已收集 '+world.collected+' 颗星星');
    }
    function processEvents(){
      let changed=false;
      for(const e of world.events.splice(0)) {
        renderer.burst(e);changed=true;
        const names={cut:'Rope_bleak_1',star:'Star_'+world.collected,bubble:'Bubble',pop:'Bubble_break',attach:'Rope_get',pump:'Pump_1',won:'Win',lost:'Candy_break'};
        sound.play(names[e.type]||'ButtonA');
        if(e.type==='star'){updateStars();announce('收集到第'+world.collected+'颗星星');}
        if(e.type==='won'){
          mode='won';terminalAt=performance.now()+650;
          saved.scores[index]=Math.max(saved.scores[index]||0,world.collected);save();progress();
          announce('通关！获得'+world.collected+'颗星星。');
        }
        if(e.type==='lost'){mode='lost';terminalAt=performance.now()+400;announce(world.reason);}
      }
      if(changed)actions();
    }
    function pause(){
      if(mode==='playing'){
        mode='paused';pointer=null;accumulator=0;sound.suspend();
        overlay('TAKE A LITTLE BREAK','休息一下，甜蜜还在。','绳索和糖果会等你回来。','继续游戏');
        $('pauseBtn').setAttribute('aria-label','继续游戏（空格）');
      }else if(mode==='paused'){
        mode='playing';$('overlay').hidden=true;accumulator=0;sound.resume();$('pauseBtn').setAttribute('aria-label','暂停（空格）');
      }
    }
    function showTerminal(){
      terminalAt=0;
      if(mode==='won')overlay('SWEET LITTLE VICTORY',world.collected===3?'完美投喂！':'好吃，谢谢你！',index===49?'50 份快乐，最后一份也送到了。继续收集剩下的星星吧。':'Om Nom 很满足。下一颗糖果，正在等你。',index===49?'回到第一关':'下一关',true);
      if(mode==='lost')overlay('ONE MORE LITTLE TRY','差一点点，再来一次。',world.reason,'重新开始');
    }
    function levelGrid(){
      $('levelGrid').replaceChildren();
      document.querySelectorAll('[data-select-box]').forEach(b=>b.classList.toggle('active',+b.dataset.selectBox===dialogBox));
      for(let i=(dialogBox-1)*25;i<dialogBox*25;i++){
        const b=document.createElement('button'),s=saved.scores[i]||0;
        b.className=i===index?'current':'';b.setAttribute('aria-label','第'+(i%25+1)+'关，最佳'+s+'颗星');
        const n=document.createElement('span');n.textContent=String(i%25+1).padStart(2,'0');
        const stars=document.createElement('small');stars.textContent='★'.repeat(s)+'☆'.repeat(3-s);if(s)stars.className='has-stars';
        b.append(n,stars);b.onclick=()=>{unlock();load(i);dialog.close();};$('levelGrid').append(b);
      }
    }
    function openLevels(box=world.level.box){
      if(dialog.open)return;dialogBox=box;dialogResume=mode;mode='menu';pointer=null;sound.suspend();levelGrid();dialog.showModal();
    }
    $('primaryBtn').onclick=()=>{
      unlock();
      if(mode==='ready'){mode='playing';$('overlay').hidden=true;accumulator=0;sound.resume();}
      else if(mode==='paused')pause();
      else if(mode==='lost')load(index);
      else if(mode==='won')load(index===49?0:index+1);
      $('gameCanvas').focus({preventScroll:true});
    };
    $('secondaryBtn').onclick=()=>{unlock();load(index);};
    $('restartBtn').onclick=()=>{unlock();load(index);};$('pauseBtn').onclick=pause;
    $('soundBtn').onclick=()=>{saved.sound=!saved.sound;save();unlock();soundUI();};
    $('levelsBtn').onclick=()=>openLevels();$('closeDialog').onclick=()=>dialog.close();
    dialog.addEventListener('close',()=>{if(mode==='menu'){mode=dialogResume;accumulator=0;if(mode==='playing')sound.resume();}});
    document.querySelectorAll('[data-box]').forEach(b=>b.onclick=()=>openLevels(+b.dataset.box));
    document.querySelectorAll('[data-select-box]').forEach(b=>b.onclick=()=>{dialogBox=+b.dataset.selectBox;levelGrid();});
    const canvas=$('gameCanvas');
    canvas.addEventListener('pointerdown',e=>{
      if(mode!=='playing'||(e.pointerType==='mouse'&&e.button!==0))return;
      if(pointer)return;e.preventDefault();unlock();canvas.setPointerCapture(e.pointerId);
      const p=renderer.toWorld(e.clientX,e.clientY);world.tap(p);processEvents();
      pointer={id:e.pointerId,p};renderer.trail=[{...p,at:performance.now()}];
    });
    canvas.addEventListener('pointermove',e=>{
      if(mode!=='playing'||!pointer||pointer.id!==e.pointerId)return;
      const samples=e.getCoalescedEvents?.();
      for(const sample of (samples?.length?samples:[e])){
        const p=renderer.toWorld(sample.clientX,sample.clientY);world.swipe(pointer.p,p);pointer.p=p;renderer.trail.push({...p,at:performance.now()});
      }
      processEvents();
    });
    const release=e=>{if(pointer?.id===e.pointerId)pointer=null;};
    canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);canvas.addEventListener('lostpointercapture',release);
    document.addEventListener('keydown',e=>{
      if(dialog.open||['INPUT','TEXTAREA'].includes(e.target.tagName))return;
      // Preserve Enter/Space activation on actual buttons and links.
      if(e.code==='Space'&&e.target.closest('button,a'))return;
      if(e.code==='Space'||e.code==='Escape'){e.preventDefault();pause();}
      if(e.code==='KeyR'){unlock();load(index);}
      if(mode==='playing'&&/^[1-9]$/.test(e.key)){world.cut(world.ropes[+e.key-1]);processEvents();}
    });
    document.addEventListener('visibilitychange',()=>{if(document.hidden&&mode==='playing')pause();});
    function frame(now){
      const elapsed=Math.min((now-last)/1000,.05);last=now;
      if(mode==='playing'){
        accumulator+=elapsed;
        while(accumulator>=1/60&&mode==='playing'){world.step();processEvents();accumulator-=1/60;}
      }else accumulator=0;
      if(terminalAt&&now>=terminalAt&&['won','lost'].includes(mode))showTerminal();
      try{renderer.draw(world,now);}catch(error){
        if(!renderFailed){renderFailed=true;renderer.errors.push(String(error));console.error('Rendering failed',error);$('renderError').hidden=false;}
        // A failed draw must never kill future animation frames.
      }
      requestAnimationFrame(frame);
    }
    load(index,false);soundUI();
    if(!storageAvailable)document.querySelector('.site-footer span:last-child').textContent='浏览器未允许本地存储；本次进度会保留到页面关闭。';
    // Observable application state for diagnostics and reproducible browser tests.
    Object.defineProperty(globalThis,'cutrope',{value:{get world(){return world;},get mode(){return mode;},get index(){return index;},renderer,assets,loadLevel:load}});
    requestAnimationFrame(frame);
  }
  const boot=()=>Promise.resolve(globalThis.cutropeDataReady).then(init);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
