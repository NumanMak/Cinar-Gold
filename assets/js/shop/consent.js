// KVKK izinleri: kvkk ve islem zorunlu, iletisim isteğe bağlı.
const EMPTY = { granted: false, at: null, choices: { kvkk: false, islem: false, iletisim: false } };

export function createConsent(store) {
  return {
    status: () => store.get('consent', EMPTY),
    grant({ kvkk, islem, iletisim = false }) {
      if (!kvkk || !islem) throw new Error('IZIN_ZORUNLU');
      store.set('consent', { granted: true, at: new Date().toISOString(), choices: { kvkk: true, islem: true, iletisim: !!iletisim } });
    },
    revoke: () => store.remove('consent'),
  };
}
