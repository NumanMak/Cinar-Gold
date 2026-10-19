// Arka uç yapılandırması. Yalnızca herkese açık değerler girer: proje adresi ve herkese açık (anon/publishable) anahtar.
// Gizli (service_role / secret) anahtar ve veritabanı şifresi buraya ASLA yazılmaz.
// mode: 'local' (tarayıcıda, demo) veya 'supabase' (merkezi arka uç).
export const CONFIG = {
  mode: 'local',
  url: '',
  anonKey: '',
};
