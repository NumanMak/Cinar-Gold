// KVKK izinleri: kvkk ve islem zorunlu, iletisim isteğe bağlı.
// Aydınlatma metni değiştiğinde sürümü artırın: eski sürümle verilmiş izin geçersiz sayılır ve yeniden sorulur.
export const NOTICE_VERSION = 'v2';
const EMPTY = { granted: false, at: null, choices: { kvkk: false, islem: false, iletisim: false } };

export function createConsent(store) {
  return {
    status: () => {
      const s = store.get('consent', EMPTY);
      return s.granted && s.notice !== NOTICE_VERSION ? EMPTY : s;
    },
    grant({ kvkk, islem, iletisim = false }) {
      if (!kvkk || !islem) throw new Error('IZIN_ZORUNLU');
      store.set('consent', { granted: true, notice: NOTICE_VERSION, at: new Date().toISOString(), choices: { kvkk: true, islem: true, iletisim: !!iletisim } });
    },
    revoke: () => store.remove('consent'),
  };
}
