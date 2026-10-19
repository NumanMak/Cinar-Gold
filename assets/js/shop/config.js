// Arka uç yapılandırması. Yalnızca herkese açık değerler girer: proje adresi ve herkese açık (publishable) anahtar.
// Gizli (service_role / secret) anahtar ve veritabanı şifresi buraya ASLA yazılmaz.
// mode: 'supabase' (merkezi arka uç) veya 'local' (tarayıcıda demo).
// Geliştirme kolaylığı: yalnızca localhost'ta localStorage 'cg:dev-mode' = 'local' ise yerel mod kullanılır.
const devLocal = (() => {
  try { return ['localhost', '127.0.0.1'].includes(location.hostname) && localStorage.getItem('cg:dev-mode') === 'local'; } catch (e) { return false; }
})();

export const CONFIG = {
  mode: devLocal ? 'local' : 'supabase',
  url: 'https://uaqokgjktvljfwhzxuwc.supabase.co',
  anonKey: 'sb_publishable_f_cBni1xl-Csc_k5Tb7uEQ_3n6-TTki',
};
