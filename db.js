// Simple IndexedDB wrapper for plants
(function(){
  const DB_NAME = 'plant-tracker-db';
  const DB_VER = 2;
  const STORE = 'plants';
  const FILES = 'files';

  function openDB(){
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = () => {
        const db = req.result;
        if(!db.objectStoreNames.contains(STORE)){
          const os = db.createObjectStore(STORE, { keyPath: 'id' });
          os.createIndex('by_nextDue', 'nextDue');
        }
        if(!db.objectStoreNames.contains(FILES)){
          db.createObjectStore(FILES, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function withStore(mode, fn){
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      const out = fn(store);
      tx.oncomplete = () => resolve(out);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function withFiles(mode, fn){
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(FILES, mode);
      const store = tx.objectStore(FILES);
      const out = fn(store);
      tx.oncomplete = () => resolve(out);
      tx.onerror = () => reject(tx.error);
    });
  }

  const PlantDB = {
    async all(){
      return withStore('readonly', (store) => {
        return new Promise((resolve, reject) => {
          const req = store.getAll();
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => reject(req.error);
        });
      });
    },
    async get(id){
      return withStore('readonly', (store) => {
        return new Promise((resolve, reject) => {
          const req = store.get(id);
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => reject(req.error);
        });
      });
    },
    async put(plant){
      return withStore('readwrite', (store) => store.put(plant));
    },
    async delete(id){
      return withStore('readwrite', (store) => store.delete(id));
    },
    async export(){
      const data = await this.all();
      // Inline observation images as data URLs for portability
      for(const p of data){
        if(Array.isArray(p.observations)){
          for(const obs of p.observations){
            if(obs.fileId){
              try{
                const blob = await this.getFile(obs.fileId);
                if(blob){
                  obs.imageData = await blobToDataURL(blob);
                }
              }catch{}
            }
          }
        }
      }
      return { version: 2, exportedAt: new Date().toISOString(), plants: data };
    },
    async import(json){
      if(!json || !Array.isArray(json.plants)) return;
      // Rehydrate images into file store
      for(const p of json.plants){
        if(Array.isArray(p.observations)){
          for(const obs of p.observations){
            if(obs.imageData && !obs.fileId){
              try{
                const blob = await dataURLToBlob(obs.imageData);
                const id = `file-${cryptoRandomId()}`;
                await withFiles('readwrite', s => s.put({ id, blob }));
                obs.fileId = id;
              }catch{}
            }
            delete obs.imageData;
          }
        }
      }
      return withStore('readwrite', (store) => {
        json.plants.forEach(p => store.put(p));
      });
    },
    async putFile(blob){
      const id = `file-${cryptoRandomId()}`;
      await withFiles('readwrite', s => s.put({ id, blob }));
      return id;
    },
    async getFile(id){
      if(!id) return null;
      return withFiles('readonly', (store) => new Promise((resolve, reject) => {
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result ? req.result.blob : null);
        req.onerror = () => reject(req.error);
      }));
    },
    async deleteFile(id){
      if(!id) return;
      return withFiles('readwrite', s => s.delete(id));
    }
  };

  function blobToDataURL(blob){
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }
  function dataURLToBlob(dataURL){
    const [meta, b64] = dataURL.split(',');
    const mime = (meta.match(/data:(.*?);base64/)||[])[1]||'application/octet-stream';
    const bin = atob(b64);
    const len = bin.length;
    const bytes = new Uint8Array(len);
    for(let i=0;i<len;i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }
  function cryptoRandomId(){
    if(window.crypto?.randomUUID) return crypto.randomUUID();
    return 'id-' + Math.random().toString(16).slice(2) + '-' + Date.now().toString(16);
  }

  window.PlantDB = PlantDB;
})();
