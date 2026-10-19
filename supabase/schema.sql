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

-- ============================================================ RLS açık

alter table public.profiles enable row level security;
alter table public.addresses enable row level security;
alter table public.products_catalog enable row level security;
alter table public.products_stock enable row level security;
alter table public.gold_price enable row level security;
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

  select g.gram22_sell into v_gold from public.gold_price g where g.id = 1;
  if v_gold is null then
    raise exception 'URUN_YOK';
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
revoke all on function public.place_order(jsonb, jsonb, text) from public;
grant execute on function public.place_order(jsonb, jsonb, text) to anon, authenticated;

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
