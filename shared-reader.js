
/* === PRM6 — Lecteur du stockage commun (drop‑in) ===
   - API globale window.TICPReader.{refresh}
   - Ecoute BroadcastChannel + storage pour mise à jour live
   - Auto‑hook si IDs connus sont présents : tourId, zone, gallery, comment
*/
(function(){
  function STORE_KEY(tourId){ return `ticp:reports:${tourId}` }
  const bc = ('BroadcastChannel' in window) ? new BroadcastChannel('ticp-sync') : null;

  async function refresh(){
    const tour = document.getElementById('tourId');
    const zone = document.getElementById('zone');
    const gallery = document.getElementById('photosList') || document.getElementById('gallery');
    const comment = document.getElementById('zoneComment') || document.getElementById('comment');
    const tourId = (tour && tour.value)||'default';
    const z = (zone && zone.value)||'';
    if(!tourId || !z || !window.TICPStore){ return; }
    const data = await window.TICPStore.load({tourId: tourId, zone: z});
    if(comment) comment.value = data.comment||'';
    if(gallery){
      gallery.innerHTML='';
      data.photos.forEach((p,i)=>{
        const img=new Image(); img.src=p.dataUrl; img.alt=`${z}-${i+1}`;
        img.style.cssText='width:160px;height:100px;object-fit:cover;margin:6px;border:1px solid #e5e7eb;border-radius:8px';
        gallery.appendChild(img);
      });
    }
  }

  function boot(){
    const tour = document.getElementById('tourId');
    const zone = document.getElementById('zone');
    if (tour) tour.addEventListener('change', refresh);
    if (zone) zone.addEventListener('change', refresh);

    if (window.TICPStore){
      window.TICPStore.listen(async (msg)=>{
        if (msg && msg.type==='zoneSaved'){ await refresh(); }
        if (msg && msg.type==='storage'){ await refresh(); }
      });
    }

    // refresh initial
    setTimeout(refresh, 50);
  }

  window.TICPReader = { refresh };
  window.addEventListener('DOMContentLoaded', boot);
})();
