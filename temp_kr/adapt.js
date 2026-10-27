const fs = require('fs');
const path = require('path');
const src = 'C:/webapp/happy-work/MahjongScoringCalculator/temp_kr';
const dst = 'C:/webapp/happy-work/MahjongScoringCalculator/pages/kingdomrush/engine';
fs.mkdirSync(dst, { recursive: true });
for (const f of ['data.js', 'sprites.js', 'sounds.js']) {
  fs.copyFileSync(path.join(src, f), path.join(dst, f));
}
let engine = fs.readFileSync(path.join(src, 'engine.js'), 'utf8');
engine = engine.replace('length:cumulative.at(-1)', 'length:cumulative[cumulative.length-1]');
engine = engine.replace(
  'Object.hasOwn(this.cooldowns,skill)',
  'Object.prototype.hasOwnProperty.call(this.cooldowns,skill)'
);
fs.writeFileSync(path.join(dst, 'engine.js'), engine);

let r = fs.readFileSync(path.join(src, 'renderer.js'), 'utf8');
r = r.replace(
  'const valid=img=>!!(img&&img.complete&&img.naturalWidth>0);',
  'const ASSET_BASE="https://atbfun.github.io/kingdomrush/assets/";\n  const valid=img=>!!(img&&((img.width>0)||(img.naturalWidth>0)));'
);
const assetsStart = r.indexOf('  class Assets {');
const assetsEnd = r.indexOf('  const towerNames=');
if (assetsStart < 0 || assetsEnd < 0) throw new Error('assets block not found ' + assetsStart + ' ' + assetsEnd);
const assets = `  class Assets {
    constructor(canvas){this.images=new Map();this.failed=new Set();this.canvas=canvas||null;}
    bind(canvas){this.canvas=canvas;}
    create(){
      if(this.canvas&&typeof this.canvas.createImage==='function')return this.canvas.createImage();
      if(typeof Image!=='undefined')return new Image();
      return null;
    }
    get(rel){
      if(!rel)return null;
      if(this.images.has(rel))return this.images.get(rel);
      const img=this.create();if(!img)return null;
      this.images.set(rel,img);
      const self=this;
      img.onerror=function(){self.failed.add(rel);};
      img.src=ASSET_BASE+rel;
      return img;
    }
  }
`;
r = r.slice(0, assetsStart) + assets + r.slice(assetsEnd);
r = r.replace(
  "this.canvas=canvas;this.ctx=canvas.getContext('2d',{willReadFrequently:true});this.assets=new Assets();",
  "this.canvas=canvas;this.ctx=canvas.getContext('2d');this.assets=new Assets(canvas);this.dpr=1;"
);
r = r.replace(
  "this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;",
  "this.reduced=false;try{this.reduced=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;}catch(err){this.reduced=false;}"
);
r = r.replace(
  'c.save();c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,800,600);',
  'c.save();var dpr=this.dpr||1;c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,800,600);'
);
r = r.replace(
  'root.KRRenderer={Renderer,Assets,isImgValid:valid,towerNames,branchIds};',
  'root.KRRenderer={Renderer,Assets,isImgValid:valid,towerNames,branchIds};\n  if(typeof module!=="undefined")module.exports=root.KRRenderer;'
);
fs.writeFileSync(path.join(dst, 'renderer.js'), r);
console.log('ok', fs.readdirSync(dst).map((f) => f + ' ' + fs.statSync(path.join(dst, f)).size).join(', '));
