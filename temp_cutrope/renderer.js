(function(root){
  'use strict';
  const {distance,clamp}=CutRopePhysics;
  class Renderer {
    constructor(canvas,assets){
      this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});this.assets=assets;
      this.particles=[];this.trail=[];this.cameraX=0;this.cameraY=0;this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.errors=[];this.last=0;this.scale=1;this.x=0;this.y=0;
    }
    reset(){this.particles=[];this.trail=[];this.cameraX=0;this.cameraY=0;}
    resize(){
      const rect=this.canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);
      const w=Math.round(rect.width*dpr),h=Math.round(rect.height*dpr);
      if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}
      this.w=rect.width;this.h=rect.height;this.dpr=dpr;
    }
    toWorld(clientX,clientY){const r=this.canvas.getBoundingClientRect();return {x:(clientX-r.left-this.x)/this.scale,y:(clientY-r.top-this.y)/this.scale};}
    toScreen(p){return {x:p.x*this.scale+this.x,y:p.y*this.scale+this.y};}
    burst(event){
      if(this.reduced)return;
      const n=event.type==='won'?45:event.type==='star'?15:7;
      for(let i=0;i<n;i++)this.particles.push({x:event.x,y:event.y,
        vx:(Math.random()-.5)*130,vy:-30-Math.random()*120,life:.5+Math.random()*.6,
        max:1.1,color:event.type==='star'||event.type==='won'?'#ffe17a':'#f4ead0',r:2+Math.random()*2});
    }
    star(ctx,x,y,r,fill,stroke){
      ctx.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,s=i%2?r*.47:r;const px=x+Math.cos(a)*s,py=y+Math.sin(a)*s;if(!i)ctx.moveTo(px,py);else ctx.lineTo(px,py);}ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1.3;ctx.stroke();}
    }
    bubble(ctx,p,r=26){
      ctx.save();const g=ctx.createRadialGradient(p.x-9,p.y-10,0,p.x,p.y,r);g.addColorStop(0,'#ffffff55');g.addColorStop(.8,'#d8f3f912');g.addColorStop(1,'#8caab578');ctx.fillStyle=g;ctx.strokeStyle='#f5ffffa0';ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.beginPath();ctx.ellipse(p.x-9,p.y-11,8,4,-.6,0,Math.PI*2);ctx.fillStyle='#ffffffe0';ctx.fill();ctx.restore();
    }
    character(ctx,world,clock){
      const p=world.target,near=distance(world.candy,p)<95;
      const id=world.state==='won'?415:world.state==='lost'?475:near?483:Math.sin(clock*.002)>0.98?445:415;
      ctx.save();ctx.translate(p.x,p.y+7);if(!this.reduced&&world.state==='won')ctx.translate(0,-Math.abs(Math.sin(clock*.009))*6);
      ctx.fillStyle='#604b3225';ctx.beginPath();ctx.ellipse(0,27,37,7,0,0,Math.PI*2);ctx.fill();
      if(!this.assets.draw(ctx,'trim'+id,-34,-40,68,74)){
        ctx.fillStyle='#7db532';ctx.strokeStyle='#4b6f26';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(0,0,34,30,0,0,Math.PI*2);ctx.fill();ctx.stroke();
        for(const x of [-14,14]){ctx.fillStyle='#fff';ctx.beginPath();ctx.ellipse(x,-12,15,18,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#243321';ctx.beginPath();ctx.arc(x+3,-10,4,0,Math.PI*2);ctx.fill();}
        ctx.beginPath();ctx.arc(0,3,17,0,Math.PI);ctx.stroke();
      }
      ctx.restore();
    }
    candy(ctx,world,clock){
      if(world.state!=='playing'&&world.state!=='lost')return;
      const c=world.candy;
      if(world.state==='lost')return;
      ctx.save();ctx.translate(c.x,c.y);ctx.rotate(Math.sin(world.time*.7)*.2+(c.x-c.ox)*.06);
      ctx.shadowColor='#68451a42';ctx.shadowBlur=6;ctx.shadowOffsetY=3;
      const candyDrawn=this.assets.draw(ctx,'candy',-24,-24,48,48);
      ctx.shadowBlur=0;ctx.shadowOffsetY=0;
      if(!candyDrawn) {
        ctx.fillStyle='#fff6df';ctx.beginPath();ctx.arc(0,0,21,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#cc4b35';for(let i=0;i<5;i++){ctx.rotate(Math.PI*2/5);ctx.beginPath();ctx.moveTo(0,0);ctx.quadraticCurveTo(8,-15,20,0);ctx.quadraticCurveTo(9,-3,0,0);ctx.fill();}
      }
      ctx.restore();
      if(world.bubble)this.bubble(ctx,c,30+Math.sin(clock*.003)*.5);
    }
    ropes(ctx,world){
      ctx.lineCap='round';ctx.lineJoin='round';
      for(const r of world.ropes){
        if(!r.active&&world.time-r.cutTime>1.3)continue;
        ctx.save();
        const pts=r.active?r.nodes:r.loose,age=r.active?0:world.time-r.cutTime;
        if(!r.active){ctx.globalAlpha=Math.max(0,1-age/1.3);ctx.translate(0,age*age*55);}
        const line=()=>{ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));};
        ctx.strokeStyle='#4d392c';ctx.lineWidth=3.4;line();ctx.stroke();
        ctx.strokeStyle='#c5ab78';ctx.lineWidth=1.7;line();ctx.stroke();
        ctx.setLineDash([1.5,4]);ctx.strokeStyle='#786040';ctx.lineWidth=2;line();ctx.stroke();
        ctx.restore();
        if(r.active&&r.spider!==null){const p=this.spiderPoint(r);if(!this.assets.draw(ctx,'trim188',p.x-10,p.y-10,20,20)){ctx.fillStyle='#222';ctx.beginPath();ctx.arc(p.x,p.y,9,0,7);ctx.fill();}}
      }
      for(const h of world.hooks){
        if(h.auto&&!h.caught){ctx.strokeStyle='#b8ba8277';ctx.lineWidth=1;ctx.setLineDash([3,5]);ctx.beginPath();ctx.arc(h.x,h.y,h.radius,0,7);ctx.stroke();ctx.setLineDash([]);}
        if(!this.assets.draw(ctx,h.auto?349:346,h.x-9,h.y-9,18,18)){ctx.fillStyle='#607d89';ctx.strokeStyle='#dbe4d8';ctx.lineWidth=2;ctx.beginPath();ctx.arc(h.x,h.y,7,0,7);ctx.fill();ctx.stroke();}
      }
    }
    spiderPoint(r){
      let left=r.spider;
      for(let i=1;i<r.nodes.length;i++){const a=r.nodes[i-1],b=r.nodes[i],d=distance(a,b);if(left<=d)return {x:a.x+(b.x-a.x)*left/(d||1),y:a.y+(b.y-a.y)*left/(d||1)};left-=d;}
      return r.nodes.at(-1);
    }
    draw(world,clock=performance.now()){
      this.resize();const ctx=this.ctx;
      const dt=Math.min(.05,(clock-this.last)/1000||0);this.last=clock;
      ctx.setTransform(this.dpr,0,0,this.dpr,0,0);ctx.globalAlpha=1;
      ctx.fillStyle=world.level.box===1?'#d6b17b':'#a2af58';ctx.fillRect(0,0,this.w,this.h);
      this.assets.draw(ctx,world.level.box===1?339:343,0,0,this.w,this.h);
      // Keep the original 320 × 480 viewport; pan larger XML maps with candy.
      this.scale=this.h/510;
      const desiredX=clamp(world.candy.x-160,0,Math.max(0,world.width-320));
      const desiredY=clamp(world.candy.y-240,0,Math.max(0,world.height-480));
      this.cameraX+=(desiredX-this.cameraX)*.08;this.cameraY+=(desiredY-this.cameraY)*.08;
      this.x=(this.w-320*this.scale)/2-this.cameraX*this.scale;this.y=12*this.scale-this.cameraY*this.scale;
      ctx.save();ctx.translate(this.x,this.y);ctx.scale(this.scale,this.scale);
      this.ropes(ctx,world);
      for(const s of world.spikes){
        ctx.save();ctx.translate(s.x,s.y);ctx.rotate(s.angle*Math.PI/180);
        const spike=CutRopePhysics.SPIKES[s.size]||CutRopePhysics.SPIKES[2],id=spike.image,len=spike.width/1.2;
        if(!this.assets.draw(ctx,id,-len/2,-16,len,32)){ctx.fillStyle='#92a6ad';ctx.strokeStyle='#415b65';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-len/2,8);for(let x=-len/2;x<len/2;x+=15){ctx.lineTo(x+7,-12);ctx.lineTo(x+15,8);}ctx.closePath();ctx.fill();ctx.stroke();}ctx.restore();
      }
      for(const b of world.bubbles)if(!b.used)this.bubble(ctx,{x:b.x,y:b.y+Math.sin(clock*.002+b.x)*1.5});
      for(const s of world.stars){
        if(s.collected||s.expired)continue;
        ctx.save();ctx.translate(s.x,s.y+(this.reduced?0:Math.sin(clock*.002+s.x)*1.2));
        const remaining=s.timeout>0?s.timeout+3-world.time:99;
        if(remaining<2)ctx.globalAlpha=.4+Math.abs(Math.sin(clock*.009))*.6;
        const glow=ctx.createRadialGradient(0,0,0,0,0,29);glow.addColorStop(0,'#fff7a36b');glow.addColorStop(1,'#fff7a300');ctx.fillStyle=glow;ctx.fillRect(-29,-29,58,58);
        if(!this.assets.draw(ctx,119,-15,-15,30,30))this.star(ctx,0,0,14,'#ffe24c','#f6f4ce');
        if(s.timeout>0){ctx.strokeStyle='#fcf1b7';ctx.lineWidth=1.2;ctx.beginPath();ctx.arc(0,0,19,-Math.PI/2,-Math.PI/2+Math.PI*2*clamp(remaining/(s.timeout+3),0,1));ctx.stroke();}
        ctx.restore();
      }
      for(const p of world.pumps){
        ctx.save();ctx.translate(p.x,p.y);ctx.rotate((p.angle+90)*Math.PI/180);ctx.scale(1,1-p.pulse*.4);
        if(!this.assets.draw(ctx,'trim239',-22,-27,44,54)){ctx.fillStyle='#5989cc';ctx.strokeStyle='#d2e1e8';ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(0,0,21,25,0,0,7);ctx.fill();ctx.stroke();}
        if(p.pulse>0){ctx.strokeStyle='#ffffff88';ctx.lineWidth=2;for(let i=-1;i<=1;i++){ctx.beginPath();ctx.moveTo(i*10,-37);ctx.lineTo(i*18,-60-(.35-p.pulse)*80);ctx.stroke();}}ctx.restore();
      }
      this.character(ctx,world,clock);this.candy(ctx,world,clock);
      if(world.level.box===1&&world.level.number===1&&world.cuts===0){
        ctx.save();ctx.font='12px "Comic Sans MS", "PingFang SC", sans-serif';ctx.fillStyle='#765836a6';ctx.fillText('轻轻划过这里',202,104);
        ctx.strokeStyle='#76583670';ctx.lineWidth=1.2;ctx.setLineDash([3,4]);ctx.beginPath();ctx.moveTo(198,100);ctx.quadraticCurveTo(175,113,140,104);ctx.stroke();ctx.setLineDash([]);ctx.beginPath();ctx.moveTo(147,99);ctx.lineTo(140,104);ctx.lineTo(147,108);ctx.stroke();ctx.restore();
      }
      this.particles=this.particles.filter(p=>p.life>0);
      for(const p of this.particles){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=180*dt;ctx.globalAlpha=clamp(p.life/.5,0,1);this.star(ctx,p.x,p.y,p.r,p.color);}
      ctx.globalAlpha=1;
      this.trail=this.trail.filter(p=>clock-p.at<180);
      if(this.trail.length>1){ctx.beginPath();this.trail.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.strokeStyle='#fffef8aa';ctx.lineWidth=2.5;ctx.stroke();}
      ctx.restore();
    }
  }
  root.CutRopeRenderer=Renderer;
})(globalThis);
