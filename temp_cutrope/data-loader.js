// A failed, already-started script cannot be retried by changing its src.
// Use a fresh element per attempt, and expose completion to the application.
(function(root){
  'use strict';
  root.cutropeDataReady=new Promise(resolve=>{
    const paths=['assets/levels.js','../assets/levels.js'];let attempt=0;
    function load(){
      const script=document.createElement('script');script.src=paths[attempt++];
      script.onload=()=>resolve(Array.isArray(root.CutRopeLevels)&&root.CutRopeLevels.length>0);
      script.onerror=()=>{script.remove();if(attempt<paths.length)load();else resolve(false);};
      document.head.appendChild(script);
    }
    load();
  });
})(globalThis);
