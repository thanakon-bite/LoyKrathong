-- =====================================================================
-- Scheduled jobs (pg_cron + pg_net)
-- เปิด Extension "pg_cron" และ "pg_net" ใน Dashboard → Database → Extensions ก่อน
-- ถ้าไม่ได้เปิด migration นี้จะข้ามไปโดยไม่ error
--
-- 1) ทุก 1 นาที: ทำเครื่องหมายโคมที่ครบ 30 นาทีเป็น expired (โคมถูกซ่อนจาก RLS ตั้งแต่ expires_at อยู่แล้ว)
-- 2) ทุก 1 ชั่วโมง: ล้าง rate_limits เก่า
-- 3) (Optional) เรียก /api/cron/cleanup เพื่อลบรูปใน Storage – ตั้งค่า URL/secret ใน Vault ตาม README
-- =====================================================================
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('loykrathong-expire-lanterns', '* * * * *', 'select public.expire_lanterns()');
    perform cron.schedule(
      'loykrathong-prune-rate-limits',
      '17 * * * *',
      $job$delete from public.rate_limits where window_start < now() - interval '1 day'$job$
    );
  else
    raise notice 'pg_cron not enabled – skipping scheduled jobs (use Vercel Cron /api/cron/cleanup instead)';
  end if;
end
$$;
