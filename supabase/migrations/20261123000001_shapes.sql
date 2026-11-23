-- ─────────────────────────────────────────────────────────────
-- Krathong shapes (box / heart / moon / rabbit) + new paper designs
-- Run once in Supabase → SQL Editor. Safe to run again.
-- ─────────────────────────────────────────────────────────────

-- 1) shape of each lantern (older lanterns are the classic box)
alter table public.lanterns
  add column if not exists lantern_shape text not null default 'box';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'lanterns_lantern_shape_check') then
    alter table public.lanterns
      add constraint lanterns_lantern_shape_check check (lantern_shape ~ '^[a-z0-9-]{2,40}$');
  end if;
end $$;

-- public festival / owner reads use column-level grants
grant select (lantern_shape) on public.lanterns to anon, authenticated;

-- 2) catalog: shapes are priced like designs and effects (admin → ราคา/ของเสริม)
alter table public.catalog_items drop constraint if exists catalog_items_kind_check;
alter table public.catalog_items
  add constraint catalog_items_kind_check check (kind in ('design', 'effect', 'shape'));

insert into public.catalog_items (kind, code, name, description, price, sort_order, is_active)
select v.kind, v.code, v.name, v.description, v.price, v.sort_order, v.is_active
from (values
  ('shape',  'box',            'กล่องสี่เหลี่ยม',     'โคมกระดาษทรงลูกบาศก์คลาสสิก',                 0::numeric, 1, true),
  ('shape',  'heart',          'หัวใจ',               'โคมรูปหัวใจ ส่งความรักลอยไปกับสายน้ำ',          10, 2, true),
  ('shape',  'moon',           'ดวงจันทร์',           'โคมทรงกลมเหมือนพระจันทร์เต็มดวง',              10, 3, true),
  ('shape',  'rabbit',         'กระต่ายดวงจันทร์',     'กระต่ายบนดวงจันทร์ ตามตำนานคืนวันเพ็ญ',        19, 4, true),
  -- new paper colours / premium patterns: inserted OFF, switched on right after the new code is deployed
  ('design', 'jade-green',     'เขียวหยก',            '',                                               0, 5, false),
  ('design', 'sky-blue',       'ฟ้าใส',               '',                                               0, 6, false),
  ('design', 'lavender-dream', 'ม่วงลาเวนเดอร์',       '',                                               0, 7, false),
  ('design', 'ruby-red',       'แดงทับทิม',           '',                                               0, 8, false),
  ('design', 'royal-kanok',    'กนกทองหลวง',          'ลายกนกทองบนกระดาษแดงชาด',                       19, 11, false),
  ('design', 'moonlit-sakura', 'ซากุระแสงจันทร์',      'ช่อซากุระสีชมพูใต้แสงจันทร์',                   19, 12, false),
  ('design', 'peacock-jade',   'นกยูงมรกต',           'ขนนกยูงสีมรกตประกายทอง',                         19, 13, false)
) as v(kind, code, name, description, price, sort_order, is_active)
where not exists (
  select 1 from public.catalog_items c where c.kind = v.kind and c.code = v.code
);

-- keep the premium designs after the free ones
update public.catalog_items set sort_order = 9  where kind = 'design' and code = 'lotus-gold'      and sort_order < 9;
update public.catalog_items set sort_order = 10 where kind = 'design' and code = 'midnight-indigo' and sort_order < 10;
