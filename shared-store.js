
/* === TICP & PRM6 — Stockage commun (drop‑in) ===
   - IndexedDB 'ticp-photos' pour les images
   - localStorage 'ticp:reports:{tourId}' pour les métadonnées
   - BroadcastChannel 'ticp-sync' pour la synchro en direct
   - Fournit API globale window.TICPStore.{save,load,listen}
   - Auto‑hook (facultatif) si certains IDs sont détectés : 
       tourId, zone, photosInput, zoneComment, btnSaveZone, photosList
*/
(function(){
  const DB_NAME='ticp-photos', DB_STORE='photos', DB_VER=1;
  function STORE_KEY(tourId){ return `ticp:reports:${tourId}` }
  function photoKey(tourId, zone, ts, idx){ return `${tourId}|${zone}|${ts}|${idx}` }

  const bc = ('BroadcastChannel' in window) ? new BroadcastChannel('ticp-sync') : null;
  function notifySync(payload){
    if (bc) bc.postMessage(payload);
    const k='ticp:sync:ver';
    try{ localStorage.setItem(k, String((parseInt(localStorage.getItem(k)||'0',10)+1)%1e9)); }catch(e){}
  }

  let dbPromise=null;
  function openDB(){
    if(dbPromise) return dbPromise;
    dbPromise=new Promise((res,rej)=>{
      const r=indexedDB.open(DB_NAME, DB_VER);
      r.onupgradeneeded=()=>{
        const db=r.result;
        if(!db.objectStoreNames.contains(DB_STORE)){
          db.createObjectStore(DB_STORE,{keyPath:'key'});
        }
      };
      r.onsuccess=()=>res(r.result);
      r.onerror =()=>rej(r.error);
    });
    return dbPromise;
  }
  async function idbSet(obj){
    const db=await openDB();
    return new Promise((res,rej)=>{
      const tx=db.transaction(DB_STORE,'readwrite');
      tx.objectStore(DB_STORE).put(obj);
      tx.oncomplete=()=>res();
      tx.onerror=()=>rej(tx.error);
    });
  }
  async function idbGet(key){
    const db=await openDB();
    return new Promise((res,rej)=>{
      const tx=db.transaction(DB_STORE,'readonly');
      const rq=tx.objectStore(DB_STORE).get(key);
      rq.onsuccess=()=>res(rq.result||null);
      rq.onerror=()=>rej(rq.error);
    });
  }
  async function idbGetMany(keys){
    const out=[];
    for(const k of keys){ const v=await idbGet(k); if(v) out.push(v); }
    return out;
  }
  function toDataURL(file){
    return new Promise((resolve,reject)=>{
      const fr=new FileReader();
      fr.onload=()=>resolve(fr.result);
      fr.onerror=reject;
      fr.readAsDataURL(file);
    });
  }

  async function save({tourId, zone, comment}, filesOrDataURLs){
    if(!tourId || !zone) throw new Error('tourId/zone requis');
    let reports={}; try{ reports=JSON.parse(localStorage.getItem(STORE_KEY(tourId))||'{}')||{} }catch{ reports={} }
    const existing = reports[zone]?.photos || [];
    let idx = existing.length;
    const addKeys=[];
    const files = Array.from(filesOrDataURLs||[]);
    for(const f of files){
      const dataUrl = (typeof f==='string')? f : await toDataURL(f);
      const key = photoKey(tourId, zone, Date.now(), idx++);
      await idbSet({ key, tourId, zone, ts: Date.now(), dataUrl, comment: '' });
      addKeys.push({ key });
    }
    reports[zone] = {
      ...(reports[zone]||{}),
      comment: comment || (reports[zone]?.comment || ''),
      photos: [...existing, ...addKeys],
      updatedAt: Date.now()
    };
    localStorage.setItem(STORE_KEY(tourId), JSON.stringify(reports));
    notifySync({ type:'zoneSaved', tourId, zone });
    return reports[zone];
  }

  async function load({tourId, zone}){
    let reports={}; try{ reports=JSON.parse(localStorage.getItem(STORE_KEY(tourId))||'{}')||{} }catch{ reports={} }
    const rec = reports[zone] || null;
    if(!rec) return {comment:'', photos:[], updatedAt:null};
    const pics = await idbGetMany((rec.photos||[]).map(p=>p.key));
    return {comment: rec.comment||'', photos: pics, updatedAt: rec.updatedAt||null};
  }

  function listen(onMessage){
    if (bc){
      bc.onmessage = (ev)=> onMessage && onMessage(ev.data||{});
    }
    window.addEventListener('storage', (e)=>{
      if(e.key && e.key.startsWith('ticp:reports:')){
        onMessage && onMessage({type:'storage', key:e.key});
      }
    });
  }

  // Expose
  window.TICPStore = { save, load, listen, STORE_KEY };

  // --- Auto hooks (si IDs connus sont présents) ---
  window.addEventListener('DOMContentLoaded', ()=>{
    const tour = document.getElementById('tourId');
    const zone = document.getElementById('zone');
    const files= document.getElementById('photosInput') || document.getElementById('files');
    const comment = document.getElementById('zoneComment') || document.getElementById('comment');
    const btnSave = document.getElementById('btnSaveZone') || document.getElementById('save');
    const gallery = document.getElementById('photosList') || document.getElementById('gallery');

    if(btnSave && files && tour && zone){
      btnSave.addEventListener('click', async ()=>{
        try{
          await save({tourId: (tour.value||'default'), zone: zone.value, comment: (comment?comment.value:'')}, files.files);
          if(gallery){
            const data = await load({tourId: (tour.value||'default'), zone: zone.value});
            gallery.innerHTML='';
            data.photos.forEach((p,i)=>{
              const img=new Image(); img.src=p.dataUrl; img.alt=`${zone.value}-${i+1}`;
              img.style.cssText='width:160px;height:100px;object-fit:cover;margin:6px;border:1px solid #e5e7eb;border-radius:8px';
              gallery.appendChild(img);
            });
          }
        }catch(err){ console.error(err); }
      });
    }
  });
})();
