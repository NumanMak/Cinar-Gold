-- Çınar Gold: şema, satır düzeyi güvenlik (RLS) ve sunucu fonksiyonları.
-- Bu dosya tools/gen_supabase_seed.py ile katalog verisiyle birleştirilip supabase/setup.sql olarak yazılır.
-- Yeniden çalıştırılabilir: var olan nesneler korunur, fonksiyonlar ve politikalar güncellenir; stok değerleri ezilmez.

-- ============================================================ Tablolar

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '' check (length(name) <= 120),
  phone text not null default '' check (length(phone) <= 40),
  role text not null default 'customer' check (role in ('customer', 'admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 60),
  text text not null check (length(btrim(text)) between 10 and 400),
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.products_catalog (
  id text primary key,
  type text not null check (type in ('yuzuk', 'kolye', 'bilezik', 'pirlanta')),
  name text not null,
  gram numeric not null check (gram > 0),
  karat integer not null check (karat in (14, 18, 22)),
  labor_rate numeric not null check (labor_rate >= 0 and labor_rate < 1),
  stone_fee integer not null check (stone_fee >= 0)
);

create table if not exists public.products_stock (
  product_id text primary key references public.products_catalog (id) on delete cascade,
  stock integer not null check (stock >= 0)
);

create table if not exists public.gold_price (
  id integer primary key check (id = 1),
  gram22_sell numeric not null check (gram22_sell > 0),
  updated_at timestamptz not null default now()
);

create sequence if not exists public.order_seq start 100001;

create table if not exists public.orders (
  id text primary key default ('CG-' || nextval('public.order_seq')::text),
  user_id uuid references auth.users (id) on delete set null,
  name text not null check (length(btrim(name)) between 1 and 120),
  phone text not null check (length(btrim(phone)) between 1 and 40),
  payment text not null check (payment in ('havale', 'magaza')),
  delivery text not null check (delivery in ('magaza', 'adres')),
  address text not null default '' check (length(address) <= 400),
  coupon text not null default '',
  subtotal integer not null check (subtotal >= 0),
  discount integer not null default 0 check (discount >= 0),
  total integer not null check (total >= 0),
  status text not null default 'beklemede' check (status in ('beklemede', 'onaylandi', 'tamamlandi', 'iptal')),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz
);

create table if not exists public.order_lines (
  order_id text not null references public.orders (id) on delete cascade,
  product_id text not null,
  name text not null,
  qty integer not null check (qty between 1 and 10),
  unit_price integer not null check (unit_price >= 0),
  primary key (order_id, product_id)
);

create table if not exists public.wishlist (
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id text not null references public.products_catalog (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create table if not exists public.stock_alerts (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references public.products_catalog (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  email text not null default '',
  phone text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  kvkk boolean not null,
  islem boolean not null,
  iletisim boolean not null default false,
  at timestamptz not null default now()
);
-- Kullanıcının onayladığı aydınlatma metninin sürümü (metin değişince istemci yeni sürümü gönderir).
alter table public.consents add column if not exists notice_version text not null default 'v1' check (length(notice_version) <= 20);

-- Altın fiyatı çekme durumu (yalnızca refresh_gold_price kullanır; hiçbir rolün erişimi yok).
create table if not exists public.gold_fetch (
  id integer primary key check (id = 1),
  request_id bigint
);

-- ============================================================ RLS açık

alter table public.profiles enable row level security;
alter table public.addresses enable row level security;
alter table public.products_catalog enable row level security;
alter table public.products_stock enable row level security;
alter table public.gold_price enable row level security;
alter table public.gold_fetch enable row level security;
revoke all on public.gold_fetch from anon, authenticated;
alter table public.orders enable row level security;
alter table public.order_lines enable row level security;
alter table public.wishlist enable row level security;
alter table public.stock_alerts enable row level security;
alter table public.consents enable row level security;

-- ============================================================ Yönetici denetimi

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.role = 'admin' from public.profiles p where p.id = auth.uid()), false);
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- ============================================================ Yeni kullanıcı: her zaman müşteri

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, role)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'name', ''), 120), 'customer')
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================ Haklar (varsayılan geniş izinler geri alınır)

revoke insert, update, delete, truncate on public.orders, public.order_lines, public.products_stock, public.gold_price, public.products_catalog from anon, authenticated;
revoke insert, delete, truncate on public.profiles from anon, authenticated;
revoke update on public.profiles from anon, authenticated;
grant update (name, phone) on public.profiles to authenticated;
revoke all on public.profiles, public.addresses, public.wishlist, public.consents from anon;
revoke update, delete on public.consents from authenticated;
revoke update on public.stock_alerts from anon, authenticated;
revoke select on public.stock_alerts from anon;

-- ============================================================ Politikalar

-- profiles: kendi satırı veya yönetici okur; yalnızca ad/telefon güncellenir, rol değişmez.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid() and role = (select p.role from public.profiles p where p.id = auth.uid()));

-- addresses: yalnızca sahibi
drop policy if exists addresses_select on public.addresses;
create policy addresses_select on public.addresses for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists addresses_insert on public.addresses;
create policy addresses_insert on public.addresses for insert with check (user_id = auth.uid());
drop policy if exists addresses_update on public.addresses;
create policy addresses_update on public.addresses for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists addresses_delete on public.addresses;
create policy addresses_delete on public.addresses for delete using (user_id = auth.uid());

-- katalog, stok ve altın fiyatı herkese okunur; yazma yalnızca sunucu fonksiyonları ve kurulum betiğiyle
drop policy if exists catalog_select on public.products_catalog;
create policy catalog_select on public.products_catalog for select using (true);
drop policy if exists stock_select on public.products_stock;
create policy stock_select on public.products_stock for select using (true);
drop policy if exists gold_select on public.gold_price;
create policy gold_select on public.gold_price for select using (true);

-- orders / order_lines: yalnızca sahibi veya yönetici okur; yazma politikası yoktur (yalnızca fonksiyonlar)
drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists order_lines_select on public.order_lines;
create policy order_lines_select on public.order_lines for select using (
  exists (select 1 from public.orders o where o.id = order_id and (o.user_id = auth.uid() or public.is_admin()))
);

-- wishlist: yalnızca sahibi
drop policy if exists wishlist_select on public.wishlist;
create policy wishlist_select on public.wishlist for select using (user_id = auth.uid());
drop policy if exists wishlist_insert on public.wishlist;
create policy wishlist_insert on public.wishlist for insert with check (user_id = auth.uid());
drop policy if exists wishlist_delete on public.wishlist;
create policy wishlist_delete on public.wishlist for delete using (user_id = auth.uid());

-- stock_alerts: herkes ekleyebilir (sınırlı uzunluk), yalnızca sahibi veya yönetici okur/siler
drop policy if exists alerts_insert on public.stock_alerts;
create policy alerts_insert on public.stock_alerts for insert with check (
  (user_id is null or user_id = auth.uid())
  and length(email) <= 200 and length(phone) <= 40
  and (length(btrim(email)) > 0 or length(btrim(phone)) > 0)
);
drop policy if exists alerts_select on public.stock_alerts;
create policy alerts_select on public.stock_alerts for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists alerts_delete on public.stock_alerts;
create policy alerts_delete on public.stock_alerts for delete using (user_id = auth.uid() or public.is_admin());

-- consents: zorunlu izinler olmadan kayıt yok; yalnızca sahibi veya yönetici okur
drop policy if exists consents_insert on public.consents;
create policy consents_insert on public.consents for insert with check (
  kvkk and islem and (user_id is null or user_id = auth.uid())
);
drop policy if exists consents_select on public.consents;
create policy consents_select on public.consents for select using (user_id = auth.uid() or public.is_admin());

-- ============================================================ Fiyat görünümü (tarayıcının gösterdiği fiyatla sunucunun fiyatı aynı kaynaktan)

create or replace view public.products_priced with (security_invoker = true) as
select c.id,
       (round((c.gram * (g.gram22_sell * c.karat / 22.0) * (1 + c.labor_rate) + c.stone_fee) / 10.0) * 10)::integer as price
from public.products_catalog c
cross join public.gold_price g
where g.id = 1;
grant select on public.products_priced to anon, authenticated;

-- ============================================================ Sunucu fonksiyonları

-- Sipariş oluşturur: fiyat, kupon ve stok sunucuda belirlenir. İstemciden fiyat alınmaz.
create or replace function public.place_order(lines jsonb, customer jsonb, coupon text default '')
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(customer ->> 'name', ''));
  v_phone text := btrim(coalesce(customer ->> 'phone', ''));
  v_payment text := coalesce(customer ->> 'payment', '');
  v_delivery text := coalesce(nullif(customer ->> 'delivery', ''), 'magaza');
  v_address text := case when coalesce(nullif(customer ->> 'delivery', ''), 'magaza') = 'adres' then btrim(coalesce(customer ->> 'address', '')) else '' end;
  v_gold numeric;
  v_gold_at timestamptz;
  v_item jsonb;
  v_qty numeric;
  v_id text;
  v_subtotal integer := 0;
  v_discount integer := 0;
  v_coupon text := upper(btrim(coalesce(coupon, '')));
  v_order public.orders;
  v_items jsonb;
  v_stock integer;
  v_price integer;
begin
  -- Sipariş için giriş şart; kullanıcı başına en çok 3 bekleyen sipariş (sahte sipariş ve stok tüketme önlemi).
  if auth.uid() is null then
    raise exception 'GIRIS_GEREKLI';
  end if;
  -- Aynı kullanıcının eşzamanlı siparişleri sırayla işlenir; sınır aşılamaz.
  perform 1 from public.profiles where id = auth.uid() for update;
  if (select count(*) from public.orders where user_id = auth.uid() and status = 'beklemede') >= 3 then
    raise exception 'SIPARIS_LIMITI';
  end if;
  if lines is null or jsonb_typeof(lines) <> 'array' or jsonb_array_length(lines) = 0 then
    raise exception 'SEPET_BOS';
  end if;
  if jsonb_array_length(lines) > 30 then
    raise exception 'ZORUNLU_ALAN';
  end if;
  if v_name = '' or v_phone = '' or v_payment not in ('havale', 'magaza') or v_delivery not in ('magaza', 'adres') then
    raise exception 'ZORUNLU_ALAN';
  end if;
  if v_delivery = 'adres' and length(v_address) < 10 then
    raise exception 'ZORUNLU_ALAN';
  end if;

  select g.gram22_sell, g.updated_at into v_gold, v_gold_at from public.gold_price g where g.id = 1;
  if v_gold is null then
    raise exception 'URUN_YOK';
  end if;
  -- Fiyat 24 saatten eskiyse sipariş alınmaz (otomatik güncelleme durmuş olabilir).
  if v_gold_at < now() - interval '24 hours' then
    raise exception 'FIYAT_ESKI';
  end if;

  -- Satırları doğrula.
  for v_item in select * from jsonb_array_elements(lines) loop
    v_id := v_item ->> 'id';
    if v_id is null or jsonb_typeof(v_item -> 'qty') <> 'number' then
      raise exception 'ZORUNLU_ALAN';
    end if;
    v_qty := (v_item ->> 'qty')::numeric;
    if v_qty <> floor(v_qty) or v_qty < 1 or v_qty > 10 then
      raise exception 'ZORUNLU_ALAN';
    end if;
  end loop;

  -- Aynı ürünün tekrarlanan satırlarını birleştir; ürün başına en çok 10 adet.
  select jsonb_agg(jsonb_build_object('id', t.id, 'qty', t.qty) order by t.id) into v_items
  from (
    select e ->> 'id' as id, sum((e ->> 'qty')::integer)::integer as qty
    from jsonb_array_elements(lines) e
    group by e ->> 'id'
  ) t;
  if exists (select 1 from jsonb_array_elements(v_items) x where (x ->> 'qty')::integer > 10) then
    raise exception 'ZORUNLU_ALAN';
  end if;

  -- Stok satırlarını sabit sırayla (ürün kimliğine göre) kilitle: iki sipariş aynı anda gelse de kilitlenme olmaz ve son ürün iki kez satılmaz.
  for v_item in select * from jsonb_array_elements(v_items) loop
    select s.stock into v_stock from public.products_stock s where s.product_id = (v_item ->> 'id') for update;
    if not found then
      raise exception 'URUN_YOK';
    end if;
    if v_stock < (v_item ->> 'qty')::integer then
      raise exception 'STOK_YETERSIZ';
    end if;
  end loop;

  -- Fiyat: gram x (22 ayar gram fiyatı x ayar / 22) x (1 + işçilik) + taş bedeli, 10 TL'ye yuvarlanır (products_priced).
  select coalesce(sum(p.price * (x ->> 'qty')::integer), 0)::integer into v_subtotal
  from jsonb_array_elements(v_items) x
  join public.products_priced p on p.id = (x ->> 'id');

  if v_coupon = 'CINAR10' then
    v_discount := round(v_subtotal * 0.10)::integer;
  end if;

  insert into public.orders (user_id, name, phone, payment, delivery, address, coupon, subtotal, discount, total)
  values (auth.uid(), v_name, v_phone, v_payment, v_delivery, v_address, case when v_discount > 0 then 'CINAR10' else '' end, v_subtotal, v_discount, v_subtotal - v_discount)
  returning * into v_order;

  for v_item in select * from jsonb_array_elements(v_items) loop
    select p.price into v_price from public.products_priced p where p.id = (v_item ->> 'id');
    insert into public.order_lines (order_id, product_id, name, qty, unit_price)
    select v_order.id, c.id, c.name, (v_item ->> 'qty')::integer, v_price from public.products_catalog c where c.id = (v_item ->> 'id');
    update public.products_stock set stock = stock - (v_item ->> 'qty')::integer where product_id = (v_item ->> 'id');
  end loop;

  return v_order;
end;
$$;
revoke all on function public.place_order(jsonb, jsonb, text) from public, anon;
grant execute on function public.place_order(jsonb, jsonb, text) to authenticated;

-- Müşteri kendi bekleyen siparişini iptal eder; stok geri verilir.
create or replace function public.cancel_my_order(p_id text)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  l record;
begin
  if auth.uid() is null then
    raise exception 'SIPARIS_YOK';
  end if;
  select * into v_order from public.orders o where o.id = p_id and o.user_id = auth.uid() for update;
  if not found then
    raise exception 'SIPARIS_YOK';
  end if;
  if v_order.status <> 'beklemede' then
    raise exception 'IPTAL_EDILEMEZ';
  end if;
  for l in select ol.product_id, ol.qty from public.order_lines ol where ol.order_id = v_order.id order by ol.product_id loop
    update public.products_stock set stock = stock + l.qty where product_id = l.product_id;
  end loop;
  update public.orders set status = 'iptal', cancelled_at = now() where id = v_order.id returning * into v_order;
  return v_order;
end;
$$;
revoke all on function public.cancel_my_order(text) from public;
grant execute on function public.cancel_my_order(text) to authenticated;

-- Yönetici sipariş durumunu değiştirir; geçişler: beklemede -> onaylandi/tamamlandi/iptal, onaylandi -> tamamlandi/iptal.
create or replace function public.admin_set_order_status(p_id text, p_status text)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  l record;
begin
  if not public.is_admin() then
    raise exception 'YETKI_YOK';
  end if;
  select * into v_order from public.orders o where o.id = p_id for update;
  if not found then
    raise exception 'SIPARIS_YOK';
  end if;
  if not (
    (v_order.status = 'beklemede' and p_status in ('onaylandi', 'tamamlandi', 'iptal'))
    or (v_order.status = 'onaylandi' and p_status in ('tamamlandi', 'iptal'))
  ) then
    raise exception 'DURUM_GECERSIZ';
  end if;
  if p_status = 'iptal' then
    for l in select ol.product_id, ol.qty from public.order_lines ol where ol.order_id = v_order.id order by ol.product_id loop
      update public.products_stock set stock = stock + l.qty where product_id = l.product_id;
    end loop;
  end if;
  update public.orders set
    status = p_status,
    confirmed_at = case when p_status = 'onaylandi' then now() else confirmed_at end,
    completed_at = case when p_status = 'tamamlandi' then now() else completed_at end,
    cancelled_at = case when p_status = 'iptal' then now() else cancelled_at end
  where id = v_order.id returning * into v_order;
  return v_order;
end;
$$;
revoke all on function public.admin_set_order_status(text, text) from public;
grant execute on function public.admin_set_order_status(text, text) to authenticated;

-- Yönetici stoğu doğrudan ayarlar.
create or replace function public.admin_set_stock(p_product_id text, p_qty integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'YETKI_YOK';
  end if;
  if p_qty is null or p_qty < 0 then
    raise exception 'STOK_GECERSIZ';
  end if;
  update public.products_stock set stock = p_qty where product_id = p_product_id;
  if not found then
    raise exception 'URUN_YOK';
  end if;
end;
$$;
revoke all on function public.admin_set_stock(text, integer) from public;
grant execute on function public.admin_set_stock(text, integer) to authenticated;

-- ============================================================ KVKK: veri dışa aktarma ve hesap silme

-- Kullanıcının kendi verisinin tamamı (şifre, jeton veya iç kimlik bilgisi içermez).
create or replace function public.export_my_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'GIRIS_HATALI';
  end if;
  return jsonb_build_object(
    'email', (select u.email from auth.users u where u.id = v_uid),
    'profile', (select jsonb_build_object('name', p.name, 'phone', p.phone, 'role', p.role, 'created_at', p.created_at) from public.profiles p where p.id = v_uid),
    'addresses', coalesce((select jsonb_agg(jsonb_build_object('title', a.title, 'text', a.text, 'is_default', a.is_default, 'created_at', a.created_at)) from public.addresses a where a.user_id = v_uid), '[]'::jsonb),
    'orders', coalesce((
      select jsonb_agg(to_jsonb(o) || jsonb_build_object('lines', coalesce((select jsonb_agg(jsonb_build_object('product_id', l.product_id, 'name', l.name, 'qty', l.qty, 'unit_price', l.unit_price)) from public.order_lines l where l.order_id = o.id), '[]'::jsonb)))
      from public.orders o where o.user_id = v_uid), '[]'::jsonb),
    'wishlist', coalesce((select jsonb_agg(w.product_id order by w.created_at) from public.wishlist w where w.user_id = v_uid), '[]'::jsonb),
    'stock_alerts', coalesce((select jsonb_agg(jsonb_build_object('product_id', s.product_id, 'email', s.email, 'phone', s.phone, 'created_at', s.created_at)) from public.stock_alerts s where s.user_id = v_uid), '[]'::jsonb),
    'consents', coalesce((select jsonb_agg(jsonb_build_object('kvkk', c.kvkk, 'islem', c.islem, 'iletisim', c.iletisim, 'at', c.at)) from public.consents c where c.user_id = v_uid), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.export_my_data() from public;
grant execute on function public.export_my_data() to authenticated;

-- Kullanıcı kendi hesabını siler. Siparişler muhasebe için kalır ama kişisel bilgiler anonimleştirilir; yönetici hesabı silinemez.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'GIRIS_HATALI';
  end if;
  if public.is_admin() then
    raise exception 'YETKI_YOK';
  end if;
  update public.orders set user_id = null, name = 'silindi', phone = 'silindi', address = '' where user_id = v_uid;
  delete from auth.users where id = v_uid;
end;
$$;
revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;

-- ============================================================ Altın fiyatı (otomatik)
-- Yayındaki assets/data/gold.json (Özsafir Gold, GitHub Actions ile 20 dakikada bir yenilenir) pg_net ile okunur, pg_cron her 10 dakikada çalıştırır.
-- İki aşamalı: önce önceki isteğin cevabı işlenir, sonra yeni istek atılır (fiyat en geç ~20 dakikada güncellenir).
create extension if not exists pg_net;
create extension if not exists pg_cron;

create or replace function public.refresh_gold_price()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req bigint;
  r record;
  v_json jsonb;
  v_new numeric;
  v_old numeric;
  v_at timestamptz;
begin
  select request_id into v_req from public.gold_fetch where id = 1;
  if v_req is not null then
    select * into r from net._http_response where id = v_req;
    if found and r.status_code = 200 then
      begin
        v_json := r.content::jsonb;
        v_new := (v_json #>> '{items,gram22,sell}')::numeric;
        v_at := (v_json ->> 'fetchedAt')::timestamptz;
      exception when others then
        v_new := null;
      end;
      select gram22_sell into v_old from public.gold_price where id = 1;
      -- Bozuk ya da aşırı sapan veri reddedilir (tek seferde en çok %15); gelecek tarihli veri kabul edilmez.
      if v_new is not null and v_at is not null and v_new > 0
         and v_new between v_old * 0.85 and v_old * 1.15 and v_at <= now() + interval '5 minutes' then
        update public.gold_price set gram22_sell = v_new, updated_at = v_at where id = 1 and updated_at <= v_at;
      end if;
    end if;
  end if;
  select net.http_get(url := 'https://numanmak.github.io/Cinar-Gold/assets/data/gold.json', timeout_milliseconds := 5000) into v_req;
  insert into public.gold_fetch (id, request_id) values (1, v_req)
  on conflict (id) do update set request_id = excluded.request_id;
end;
$$;
revoke all on function public.refresh_gold_price() from public, anon, authenticated;

select cron.schedule('altin-fiyati', '*/10 * * * *', 'select public.refresh_gold_price()');

-- ============================================================ Katalog verisi

-- Katalog ve başlangıç stoğu (tools/gen_supabase_seed.py ile üretildi; elle düzenlemeyin).
insert into public.products_catalog (id, type, name, gram, karat, labor_rate, stone_fee) values
  ('yuzuk-tektas-1', 'yuzuk', 'Tektaş Yüzük, Sarı altın, 2,6 g', 2.6, 14, 0.2, 0),
  ('yuzuk-tektas-2', 'yuzuk', 'Tektaş Yüzük, Beyaz altın', 2.81, 14, 0.2, 0),
  ('yuzuk-tektas-3', 'yuzuk', 'Tektaş Yüzük, Sarı altın, 2,91 g', 2.91, 18, 0.2, 0),
  ('yuzuk-telkari-1', 'yuzuk', 'Telkari Yüzük, Rose altın', 4.2, 14, 0.28, 0),
  ('yuzuk-telkari-2', 'yuzuk', 'Telkari Yüzük, Sarı altın, 4,54 g', 4.54, 14, 0.28, 0),
  ('yuzuk-telkari-3', 'yuzuk', 'Telkari Yüzük, Sarı altın, 4,7 g', 4.7, 18, 0.28, 0),
  ('yuzuk-alyans-1', 'yuzuk', 'Alyans Yüzük, Sarı altın', 3.8, 14, 0.12, 0),
  ('yuzuk-alyans-2', 'yuzuk', 'Alyans Yüzük, Beyaz altın', 4.1, 14, 0.12, 0),
  ('yuzuk-alyans-3', 'yuzuk', 'Alyans Yüzük, Rose altın', 4.26, 18, 0.12, 0),
  ('yuzuk-tasli-1', 'yuzuk', 'Taşlı Yüzük, Beyaz altın, 3,1 g', 3.1, 14, 0.22, 650),
  ('yuzuk-tasli-2', 'yuzuk', 'Taşlı Yüzük, Sarı altın', 3.35, 14, 0.22, 650),
  ('yuzuk-tasli-3', 'yuzuk', 'Taşlı Yüzük, Beyaz altın, 3,47 g', 3.47, 18, 0.22, 650),
  ('yuzuk-zarif-1', 'yuzuk', 'Zarif Yüzük, Sarı altın, 1,9 g', 1.9, 14, 0.2, 250),
  ('yuzuk-zarif-2', 'yuzuk', 'Zarif Yüzük, Rose altın', 2.05, 14, 0.2, 250),
  ('yuzuk-zarif-3', 'yuzuk', 'Zarif Yüzük, Sarı altın, 2,13 g', 2.13, 18, 0.2, 250),
  ('kolye-madalyon-1', 'kolye', 'Madalyon Kolye, Sarı altın, 3,4 g', 3.4, 14, 0.22, 0),
  ('kolye-madalyon-2', 'kolye', 'Madalyon Kolye, Rose altın', 3.67, 14, 0.22, 0),
  ('kolye-madalyon-3', 'kolye', 'Madalyon Kolye, Sarı altın, 3,81 g', 3.81, 18, 0.22, 0),
  ('kolye-tasli-1', 'kolye', 'Taşlı Kolye, Sarı altın, 6,5 g', 6.5, 14, 0.2, 450),
  ('kolye-tasli-2', 'kolye', 'Taşlı Kolye, Sarı altın, 7,02 g', 7.02, 14, 0.2, 450),
  ('kolye-tasli-3', 'kolye', 'Taşlı Kolye, Sarı altın, 7,28 g', 7.28, 18, 0.2, 450),
  ('kolye-zincir-1', 'kolye', 'Zincir Kolye, Sarı altın, 7,5 g', 7.5, 14, 0.1, 0),
  ('kolye-zincir-2', 'kolye', 'Zincir Kolye, Sarı altın, 8,1 g', 8.1, 14, 0.1, 0),
  ('kolye-zincir-3', 'kolye', 'Zincir Kolye, Rose altın', 8.4, 18, 0.1, 0),
  ('kolye-damla-1', 'kolye', 'Damla Kolye, Sarı altın, 2,2 g', 2.2, 14, 0.18, 250),
  ('kolye-damla-2', 'kolye', 'Damla Kolye, Sarı altın, 2,38 g', 2.38, 14, 0.18, 250),
  ('kolye-damla-3', 'kolye', 'Damla Kolye, Sarı altın, 2,46 g', 2.46, 18, 0.18, 250),
  ('kolye-kalp-1', 'kolye', 'Kalp Kolye, Sarı altın, 2,6 g', 2.6, 14, 0.2, 150),
  ('kolye-kalp-2', 'kolye', 'Kalp Kolye, Sarı altın, 2,81 g', 2.81, 14, 0.2, 150),
  ('kolye-kalp-3', 'kolye', 'Kalp Kolye, Sarı altın, 2,91 g', 2.91, 18, 0.2, 150),
  ('bilezik-burma-1', 'bilezik', 'Burma Bilezik, 14 ayar', 14.0, 14, 0.06, 0),
  ('bilezik-burma-2', 'bilezik', 'Burma Bilezik, 18 ayar', 14.56, 18, 0.06, 0),
  ('bilezik-burma-3', 'bilezik', 'Burma Bilezik, 22 ayar', 15.12, 22, 0.06, 0),
  ('bilezik-islemeli-1', 'bilezik', 'İşlemeli Bilezik, 14 ayar', 18.0, 14, 0.09, 0),
  ('bilezik-islemeli-2', 'bilezik', 'İşlemeli Bilezik, 18 ayar', 18.72, 18, 0.09, 0),
  ('bilezik-islemeli-3', 'bilezik', 'İşlemeli Bilezik, 22 ayar', 19.44, 22, 0.09, 0),
  ('bilezik-zincir-1', 'bilezik', 'Zincir Bilezik, 14 ayar', 12.0, 14, 0.08, 0),
  ('bilezik-zincir-2', 'bilezik', 'Zincir Bilezik, 18 ayar', 12.48, 18, 0.08, 0),
  ('bilezik-zincir-3', 'bilezik', 'Zincir Bilezik, 22 ayar', 12.96, 22, 0.08, 0),
  ('bilezik-tasli-1', 'bilezik', 'Taşlı Bilezik, 14 ayar', 9.0, 14, 0.12, 250),
  ('bilezik-tasli-2', 'bilezik', 'Taşlı Bilezik, 18 ayar', 9.36, 18, 0.12, 250),
  ('bilezik-tasli-3', 'bilezik', 'Taşlı Bilezik, 22 ayar', 9.72, 22, 0.12, 250),
  ('bilezik-kelepce-1', 'bilezik', 'Kelepçe Bilezik, 14 ayar', 11.0, 14, 0.07, 450),
  ('bilezik-kelepce-2', 'bilezik', 'Kelepçe Bilezik, 18 ayar', 11.44, 18, 0.07, 450),
  ('bilezik-kelepce-3', 'bilezik', 'Kelepçe Bilezik, 22 ayar', 11.88, 22, 0.07, 450),
  ('pirlanta-kupe-1', 'pirlanta', 'Pırlanta Küpe, 0,10 ct, Beyaz altın', 2.2, 14, 0.15, 14000),
  ('pirlanta-kupe-2', 'pirlanta', 'Pırlanta Küpe, 0,25 ct, Beyaz altın', 2.38, 14, 0.15, 36000),
  ('pirlanta-kupe-3', 'pirlanta', 'Pırlanta Küpe, 0,50 ct, Beyaz altın', 2.51, 18, 0.15, 85000),
  ('pirlanta-kolye-1', 'pirlanta', 'Pırlanta Kolye, 0,10 ct, Beyaz altın', 3.0, 14, 0.15, 14000),
  ('pirlanta-kolye-2', 'pirlanta', 'Pırlanta Kolye, 0,25 ct, Beyaz altın', 3.24, 14, 0.15, 36000),
  ('pirlanta-kolye-3', 'pirlanta', 'Pırlanta Kolye, 0,50 ct, Sarı altın', 3.42, 18, 0.15, 85000),
  ('pirlanta-bileklik-1', 'pirlanta', 'Pırlanta Bileklik, 0,10 ct, Beyaz altın', 7.5, 14, 0.12, 14000),
  ('pirlanta-bileklik-2', 'pirlanta', 'Pırlanta Bileklik, 0,25 ct, Sarı altın', 8.1, 14, 0.12, 36000),
  ('pirlanta-bileklik-3', 'pirlanta', 'Pırlanta Bileklik, 0,50 ct, Beyaz altın', 8.55, 18, 0.12, 85000),
  ('pirlanta-halo-kolye-1', 'pirlanta', 'Pırlanta Halo Kolye, 0,10 ct, Beyaz altın', 3.2, 14, 0.15, 14000),
  ('pirlanta-halo-kolye-2', 'pirlanta', 'Pırlanta Halo Kolye, 0,25 ct, Rose altın', 3.46, 14, 0.15, 36000),
  ('pirlanta-halo-kolye-3', 'pirlanta', 'Pırlanta Halo Kolye, 0,50 ct, Sarı altın', 3.65, 18, 0.15, 85000),
  ('pirlanta-yuzuk-1', 'pirlanta', 'Pırlanta Yüzük, 0,10 ct, Beyaz altın', 3.4, 14, 0.15, 14000),
  ('pirlanta-yuzuk-2', 'pirlanta', 'Pırlanta Yüzük, 0,25 ct, Sarı altın', 3.67, 14, 0.15, 36000),
  ('pirlanta-yuzuk-3', 'pirlanta', 'Pırlanta Yüzük, 0,50 ct, Beyaz altın', 3.88, 18, 0.15, 85000)
on conflict (id) do update set type = excluded.type, name = excluded.name, gram = excluded.gram,
  karat = excluded.karat, labor_rate = excluded.labor_rate, stone_fee = excluded.stone_fee;

-- Başlangıç stoğu: var olan stok değerinin üzerine yazılmaz.
insert into public.products_stock (product_id, stock) values
  ('yuzuk-tektas-1', 1),
  ('yuzuk-tektas-2', 6),
  ('yuzuk-tektas-3', 11),
  ('yuzuk-telkari-1', 5),
  ('yuzuk-telkari-2', 0),
  ('yuzuk-telkari-3', 3),
  ('yuzuk-alyans-1', 9),
  ('yuzuk-alyans-2', 2),
  ('yuzuk-alyans-3', 7),
  ('yuzuk-tasli-1', 1),
  ('yuzuk-tasli-2', 6),
  ('yuzuk-tasli-3', 0),
  ('yuzuk-zarif-1', 5),
  ('yuzuk-zarif-2', 10),
  ('yuzuk-zarif-3', 3),
  ('kolye-madalyon-1', 1),
  ('kolye-madalyon-2', 6),
  ('kolye-madalyon-3', 11),
  ('kolye-tasli-1', 5),
  ('kolye-tasli-2', 0),
  ('kolye-tasli-3', 3),
  ('kolye-zincir-1', 9),
  ('kolye-zincir-2', 2),
  ('kolye-zincir-3', 7),
  ('kolye-damla-1', 1),
  ('kolye-damla-2', 6),
  ('kolye-damla-3', 0),
  ('kolye-kalp-1', 5),
  ('kolye-kalp-2', 10),
  ('kolye-kalp-3', 3),
  ('bilezik-burma-1', 1),
  ('bilezik-burma-2', 6),
  ('bilezik-burma-3', 11),
  ('bilezik-islemeli-1', 5),
  ('bilezik-islemeli-2', 0),
  ('bilezik-islemeli-3', 3),
  ('bilezik-zincir-1', 9),
  ('bilezik-zincir-2', 2),
  ('bilezik-zincir-3', 7),
  ('bilezik-tasli-1', 1),
  ('bilezik-tasli-2', 6),
  ('bilezik-tasli-3', 0),
  ('bilezik-kelepce-1', 5),
  ('bilezik-kelepce-2', 10),
  ('bilezik-kelepce-3', 3),
  ('pirlanta-kupe-1', 1),
  ('pirlanta-kupe-2', 6),
  ('pirlanta-kupe-3', 11),
  ('pirlanta-kolye-1', 5),
  ('pirlanta-kolye-2', 0),
  ('pirlanta-kolye-3', 3),
  ('pirlanta-bileklik-1', 9),
  ('pirlanta-bileklik-2', 2),
  ('pirlanta-bileklik-3', 7),
  ('pirlanta-halo-kolye-1', 1),
  ('pirlanta-halo-kolye-2', 6),
  ('pirlanta-halo-kolye-3', 0),
  ('pirlanta-yuzuk-1', 5),
  ('pirlanta-yuzuk-2', 10),
  ('pirlanta-yuzuk-3', 3)
on conflict (product_id) do nothing;

insert into public.gold_price (id, gram22_sell) values (1, 6275)
on conflict (id) do update set gram22_sell = excluded.gram22_sell, updated_at = now();
