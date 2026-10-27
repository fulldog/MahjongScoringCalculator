(function(root){
  'use strict';
  const valid=img=>!!(img&&img.complete&&img.naturalWidth>0);
  class Assets {
    constructor(){this.images=new Map();this.failed=[];}
    image(id){
      if(this.images.has(id))return this.images.get(id);
      const img=new Image();this.images.set(id,img);let fallback=false;
      img.onerror=()=>{
        if(!fallback){fallback=true;img.src='../assets/images/'+id+'.png';}
        else this.failed.push(id);
      };
      img.src='assets/images/'+id+'.png';return img;
    }
    preload(){for(const id of [339,343,'trim415','trim417','trim445','trim475','trim479','trim483','trim503','candy',119,'trim188','trim239',346,349,352,355,327,330,333,336])this.image(id);}
    draw(ctx,id,x,y,w,h){const img=this.image(id);if(!valid(img))return false;ctx.drawImage(img,x,y,w,h);return true;}
  }
  class Sound {
    constructor(){this.enabled=false;this.unlocked=false;this.context=null;this.buffers=new Map();this.loading=new Map();this.pool=[];this.sources=new Set();this.music=null;this.musicToken=0;this.paused=false;}
    unlock(){
      if(!this.unlocked){
        this.unlocked=true;
        try{const C=root.AudioContext||root.webkitAudioContext;if(C)this.context=new C();}catch{}
      }
      if(!this.paused&&this.context?.state==='suspended')this.context.resume().catch(()=>{});
    }
    setEnabled(value){
      this.enabled=value;
      if(value){this.unlock();if(!this.paused)this.startMusic();}
      else {this.musicToken++;this.music?.pause();this.stopEffects();}
    }
    html(name,loop=false){
      const a=new Audio();a.preload='none';a.loop=loop;a.volume=loop?0.15:0.65;
      const token=this.musicToken;
      let fallback=false;a.onerror=()=>{if(!fallback){fallback=true;a.src='../assets/audio/'+name+'.mp3';if(this.enabled&&!this.paused&&(loop||token===this.musicToken))a.play().catch(()=>{});}};
      a.src='assets/audio/'+name+'.mp3';return a;
    }
    startMusic(){
      if(!this.enabled||this.paused)return;
      if(!this.music)this.music=this.html('Game_music',true);
      this.music.play().catch(()=>{});
    }
    async buffer(name){
      if(this.buffers.has(name))return this.buffers.get(name);
      if(this.loading.has(name))return this.loading.get(name);
      const promise=(async()=>{
        for(const base of ['assets/','../assets/'])try{
          const res=await fetch(base+'audio/'+name+'.mp3');
          if(!res.ok)continue;
          const buffer=await this.context.decodeAudioData(await res.arrayBuffer());
          this.buffers.set(name,buffer);return buffer;
        }catch{}
        return null;
      })();
      this.loading.set(name,promise);
      try{return await promise;}finally{this.loading.delete(name);}
    }
    async play(name){
      if(!this.enabled||this.paused||!this.unlocked)return;
      const token=this.musicToken;
      if(location.protocol!=='file:'&&this.context) {
        const buffer=await this.buffer(name);
        if(!this.enabled||this.paused||token!==this.musicToken)return;
        if(buffer){
          if(this.sources.size>=6){const old=this.sources.values().next().value;try{old.stop();}catch{}this.sources.delete(old);}
          const source=this.context.createBufferSource(),gain=this.context.createGain();source.buffer=buffer;gain.gain.value=0.65;
          source.connect(gain).connect(this.context.destination);this.sources.add(source);
          source.onended=()=>{this.sources.delete(source);source.disconnect();gain.disconnect();};source.start();return;
        }
      }
      if(!this.enabled||this.paused||token!==this.musicToken)return;
      // Bound concurrency; never create a large eager audio pool.
      this.pool=this.pool.filter(a=>!a.ended);
      if(this.pool.length>=6)this.pool.shift().pause();
      const audio=this.html(name);this.pool.push(audio);audio.play().catch(()=>{});
    }
    stopEffects(){
      for(const source of this.sources)try{source.stop();}catch{}
      this.sources.clear();for(const a of this.pool)a.pause();this.pool=[];
    }
    suspend(){this.paused=true;this.musicToken++;this.music?.pause();this.stopEffects();this.context?.suspend().catch(()=>{});}
    resume(){this.paused=false;if(this.enabled){this.unlock();this.startMusic();}}
  }
  root.CutRopeMedia={Assets,Sound,isImgValid:valid};
})(globalThis);
