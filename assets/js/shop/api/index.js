// Yapılandırmaya göre adaptör seçer. Supabase adaptörü yalnızca gerektiğinde yüklenir.
import { createLocalApi } from './local.js';

export async function createApi(config, deps) {
  if (config.mode === 'supabase') {
    const { createSupabaseApi } = await import('./supabase.js');
    return createSupabaseApi(config, deps);
  }
  return createLocalApi(deps);
}
