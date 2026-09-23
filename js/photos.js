'use strict';

/*
 * Photos des élèves : stockées dans le bucket privé Supabase Storage "photos" (jamais publiques).
 * L'accès en lecture ne passe que par des URLs signées, générées côté serveur pour un utilisateur
 * authentifié et valables quelques minutes seulement (voir supabase/schema.sql pour les policies).
 */
const Photos = (() => {
  const BUCKET = 'photos';
  const SIGNED_URL_TTL = 300; // secondes

  function isDataURL(v) {
    return typeof v === 'string' && v.startsWith('data:');
  }

  function dataURLToBlob(dataUrl) {
    const [meta, b64] = dataUrl.split(',');
    const mime = /:(.*?);/.exec(meta)[1];
    const bytes = atob(b64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  /** Envoie une photo (data URL) vers le bucket privé et renvoie son chemin de stockage. */
  async function upload(classId, studentId, dataUrl) {
    const blob = dataURLToBlob(dataUrl);
    const path = `${classId}/${studentId}.jpg`;
    const { error } = await Supa.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, upsert: true });
    if (error) throw error;
    return path;
  }

  async function remove(paths) {
    const list = paths.filter(Boolean);
    if (list.length) await Supa.storage.from(BUCKET).remove(list);
  }

  /** Supprime toutes les photos d'une classe (à la suppression complète d'une classe). */
  async function removeClassFolder(classId) {
    const { data, error } = await Supa.storage.from(BUCKET).list(classId);
    if (error) throw error;
    if (data && data.length) await remove(data.map(f => `${classId}/${f.name}`));
  }

  /** Résout un lot de chemins de stockage en URLs signées temporaires (une seule requête groupée). */
  async function resolveAll(students, cache = new Map()) {
    const paths = [...new Set(students.map(s => s.photo).filter(p => p && !isDataURL(p)))];
    if (!paths.length) return cache;
    const { data, error } = await Supa.storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_TTL);
    if (error) throw error;
    data.forEach(({ path, signedUrl }) => { if (signedUrl) cache.set(path, signedUrl); });
    return cache;
  }

  /** URL à mettre dans un <img src> : la photo pas encore enregistrée (data URL) ou déjà en
   *  Storage (résolue via le cache de `resolveAll`). */
  function srcFor(photo, cache) {
    if (!photo) return '';
    if (isDataURL(photo)) return photo;
    return (cache && cache.get(photo)) || '';
  }

  /** Contenu réel d'une photo stockée, en data URL (pour reconstituer un export autonome). */
  async function download(path) {
    const { data, error } = await Supa.storage.from(BUCKET).download(path);
    if (error) throw error;
    return blobToDataURL(data);
  }

  return { isDataURL, upload, remove, removeClassFolder, resolveAll, srcFor, download };
})();
