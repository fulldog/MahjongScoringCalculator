/* Fixed 60 Hz Verlet simulation, ported from Flave and com.lixu physics.
   Coordinates use the XML's 320 × 480 units (Flash displayed at ×1.2). */
(function (root) {
  'use strict';
  const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const SPIKES={1:{image:336,width:85},2:{image:333,width:134},3:{image:330,width:182},4:{image:327,width:227}};
  function segmentDistance(p,a,b) {
    const dx=b.x-a.x,dy=b.y-a.y;
    const t=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1),0,1);
    return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
  }
  function intersects(a,b,c,d) {
    const cross=(p,q,r)=>(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);
    const x=cross(a,b,c),y=cross(a,b,d),z=cross(c,d,a),w=cross(c,d,b);
    if (((x>0&&y<0)||(x<0&&y>0))&&((z>0&&w<0)||(z<0&&w>0))) return true;
    return (Math.abs(x)<1e-7&&segmentDistance(c,a,b)<1e-7)||
      (Math.abs(y)<1e-7&&segmentDistance(d,a,b)<1e-7)||
      (Math.abs(z)<1e-7&&segmentDistance(a,c,d)<1e-7)||
      (Math.abs(w)<1e-7&&segmentDistance(b,c,d)<1e-7);
  }
  function particle(x,y,mass=0.5,fixed=false) {return {x,y,ox:x,oy:y,mass,fixed};}
  function integrate(p,gravity=0.15,damping=0.9999) {
    if(p.fixed)return;
    const x=p.x,y=p.y;
    p.x+=(p.x-p.ox)*damping;p.y+=(p.y-p.oy)*damping+gravity;
    p.ox=x;p.oy=y;
  }
  function constrain(a,b,length,stiff=1) {
    const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);
    if(d<=length||d<1e-8)return;
    const factor=(d-length)/d*stiff*stiff;
    const ia=1/a.mass,ib=1/b.mass,sum=ia+ib;
    if(!a.fixed){a.x+=dx*factor*ia/sum;a.y+=dy*factor*ia/sum;}
    if(!b.fixed){b.x-=dx*factor*ib/sum;b.y-=dy*factor*ib/sum;}
  }
  class World {
    constructor(level) {
      this.level=level;this.width=Number(level.settings.width);this.height=Number(level.settings.height);
      this.time=0;this.state='playing';this.reason='';this.events=[];this.collected=0;this.cuts=0;
      this.ropes=[];this.hooks=[];this.stars=[];this.bubbles=[];this.spikes=[];this.pumps=[];this.bubble=null;
      const objects=level.objects.map(raw=>{
        const o={...raw};
        for(const k of ['x','y','length','radius','angle','size','timeout','rotateSpeed','moveSpeed'])
          if(k in o)o[k]=Number(o[k])||0;
        return o;
      });
      const start=objects.find(o=>o.type==='candy');
      this.candy=particle(start.x,start.y,38);
      this.target={...objects.find(o=>o.type==='target')};
      for(const o of objects) {
        if(o.type==='grab') {
          const h={...o,caught:false,auto:o.radius>0};this.hooks.push(h);
          if(!h.auto)this.attach(h,o.length);
        }
        if(o.type==='star')this.stars.push({...o,collected:false,expired:false});
        if(o.type==='bubble')this.bubbles.push({...o,used:false});
        if(o.type==='pump')this.pumps.push({...o,pulse:0});
        if(o.type.startsWith('spike'))this.spikes.push({...o,bx:o.x,by:o.y,
          baseAngle:o.angle||0,path:o.path?o.path.split(',').map(Number):null});
      }
    }
    emit(type,x=this.candy.x,y=this.candy.y) {this.events.push({type,x,y,time:this.time});}
    attach(h,length) {
      h.caught=true;
      const c=this.candy,dist=distance(h,c),len=(length>0?length:dist)+25;
      const count=Math.max(2,Math.ceil(len/(25/1.2)));
      const nodes=[particle(h.x,h.y,30,true)];
      for(let i=1;i<count;i++)nodes.push(particle(h.x+(c.x-h.x)*i/count,h.y+(c.y-h.y)*i/count));
      nodes.push(c);
      this.ropes.push({h,nodes,length:len,active:true,cutTime:0,
        spider:h.spider==='true'?0:null,spiderDelay:1.1});
    }
    cut(rope) {
      if(this.state!=='playing'||!rope||!rope.active)return false;
      rope.active=false;rope.cutTime=this.time;rope.loose=rope.nodes.map(p=>({...p}));
      this.cuts++;this.emit('cut');return true;
    }
    swipe(a,b) {
      if(this.state!=='playing'||distance(a,b)<1e-7)return 0;
      let count=0;
      for(const rope of this.ropes) {
        if(!rope.active)continue;
        for(let i=1;i<rope.nodes.length;i++) {
          if(intersects(a,b,rope.nodes[i-1],rope.nodes[i])){this.cut(rope);count++;break;}
        }
      }
      return count;
    }
    tap(point) {
      if(this.state!=='playing')return null;
      if(this.bubble&&distance(point,this.candy)<35) {
        this.bubble=null;this.emit('pop');return 'bubble';
      }
      for(const p of this.pumps) {
        if(distance(point,p)>30)continue;
        p.pulse=0.35;this.emit('pump',p.x,p.y);
        const a=p.angle*Math.PI/180,dx=this.candy.x-p.x,dy=this.candy.y-p.y;
        const forward=dx*Math.cos(a)+dy*Math.sin(a),side=-dx*Math.sin(a)+dy*Math.cos(a);
        if(forward>0&&forward<250&&Math.abs(side)<33.4) {
          this.candy.ox-=Math.cos(a)*2.5;this.candy.oy-=Math.sin(a)*2.5;
        }
        return 'pump';
      }
      return null;
    }
    finish(state,reason='') {
      if(this.state!=='playing')return;
      this.state=state;this.reason=reason;this.emit(state);
    }
    step() {
      if(this.state!=='playing')return;
      this.time+=1/60;
      const c=this.candy;
      // Bubble.as applies 0.25 upward against World's 0.18 gravity, in
      // Flash coordinates. Normalize both forces by the XML display scale.
      integrate(c,this.bubble?(0.18-0.25)/1.2:0.15,this.bubble?0.95:0.9999);
      // Integrate each rope node once; the candy is shared by every rope.
      for(const r of this.ropes) {
        if(!r.active)continue;
        for(let i=1;i<r.nodes.length-1;i++)integrate(r.nodes[i]);
      }
      for(let pass=0;pass<4;pass++)for(const r of this.ropes) {
        if(!r.active)continue;
        constrain(r.nodes[0],c,r.length*1.02,0.23);
        for(let i=1;i<r.nodes.length;i++)constrain(r.nodes[i-1],r.nodes[i],r.length/(r.nodes.length-1));
      }
      for(const h of this.hooks)if(h.auto&&!h.caught&&distance(h,c)<h.radius+15) {
        this.attach(h,h.radius+20/1.2);this.emit('attach',h.x,h.y);
      }
      for(const star of this.stars) {
        if(star.collected||star.expired)continue;
        if(star.timeout>0&&this.time>star.timeout+3){star.expired=true;continue;}
        if(distance(c,star)<33.3){star.collected=true;this.collected++;this.emit('star',star.x,star.y);}
      }
      for(const b of this.bubbles)if(!b.used&&distance(c,b)<33.3) {
        b.used=true;
        if(!this.bubble){this.bubble=b;this.emit('bubble');}
        else this.emit('pop',b.x,b.y);
      }
      for(const p of this.pumps)p.pulse=Math.max(0,p.pulse-1/60);
      for(const s of this.spikes) {
        s.angle=s.baseAngle+(s.rotateSpeed||0)/80*60*this.time;
        if(s.path&&s.moveSpeed>0) {
          const t=this.time/(s.moveSpeed/10),ping=1-Math.abs(1-(t%2));
          s.x=s.bx+(s.path[0]||0)/1.2*ping;s.y=s.by+(s.path[1]||0)/1.2*ping;
        }
        const len=(SPIKES[s.size]||SPIKES[2]).width/1.2;
        const a=s.angle*Math.PI/180,dx=Math.cos(a)*len/2,dy=Math.sin(a)*len/2;
        if(segmentDistance(c,{x:s.x-dx,y:s.y-dy},{x:s.x+dx,y:s.y+dy})<18)
          this.finish('lost','糖果碰到了尖刺，再试一次吧。');
      }
      if(this.state!=='playing')return;
      for(const r of this.ropes)if(r.active&&r.spider!==null&&this.time>r.spiderDelay) {
        r.spider+=0.3/1.2;
        if(r.spider>=r.length)this.finish('lost','蜘蛛抢走了糖果，及时切断它的绳子吧。');
      }
      if(this.state!=='playing')return;
      if(distance(c,{x:this.target.x,y:this.target.y+20/1.2})<33.3)this.finish('won');
      else if(c.y>this.height+70||c.y<-100||c.x<-100||c.x>this.width+100)
        this.finish('lost','糖果飞走了，换个时机试试看。');
      else if(!Number.isFinite(c.x)||!Number.isFinite(c.y))
        this.finish('lost','物理状态已重置，请重新尝试。');
    }
  }
  const api={World,intersects,segmentDistance,distance,clamp,SPIKES};
  root.CutRopePhysics=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
