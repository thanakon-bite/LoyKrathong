# 🏮 ลอยกระทงออนไลน์ – Floating Wish Lantern Festival

> **"Floating Wishes Under the Golden Night"** — เว็บไซต์ลอยกระทงออนไลน์ที่ผู้ใช้สร้าง "โคมกระดาษอธิษฐาน" ทรงสี่เหลี่ยมพร้อมแสงเทียนสีทอง
> เขียนคำอธิษฐาน วาดภาพ ใส่รูป แล้วปล่อยลงผิวน้ำ พร้อมเห็นโคมของผู้อื่นแบบ Real-time

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · shadcn/ui · Framer Motion · Canvas 2D · Supabase (Postgres, Realtime, Storage, Auth) · Stripe Checkout (Card + PromptPay)

---

## สารบัญ

1. [ฟีเจอร์](#ฟีเจอร์)
2. [สถาปัตยกรรม](#สถาปัตยกรรม)
3. [โครงสร้างโปรเจกต์](#โครงสร้างโปรเจกต์)
4. [ติดตั้งและรันในเครื่อง](#ติดตั้งและรันในเครื่อง)
5. [ตั้งค่า Supabase](#ตั้งค่า-supabase)
6. [ตั้งค่า Stripe](#ตั้งค่า-stripe)
7. [งานตามเวลา (Retention / Cleanup)](#งานตามเวลา-retention--cleanup)
8. [เพลงประกอบ](#เพลงประกอบ)
9. [Deploy บน Vercel](#deploy-บน-vercel)
10. [Admin Panel](#admin-panel)
11. [ความปลอดภัย](#ความปลอดภัย)
12. [ประสิทธิภาพ](#ประสิทธิภาพ)
13. [การทดสอบ](#การทดสอบ)
14. [API Reference](#api-reference)
15. [Troubleshooting](#troubleshooting)

---

## ฟีเจอร์

| หมวด | รายละเอียด |
|---|---|
| **Landing** (`/`) | Hero บนฉากผิวน้ำยามค่ำคืน (Canvas) มีโคมลอย แสงสะท้อนสีทอง คลื่นน้ำ ดวงไฟลอย และพระจันทร์เต็มดวง · สถิติเทศกาลจากฐานข้อมูล · ปุ่มเปิด/ปิดเพลง |
| **Lantern Studio** (`/create`) | โคมกระดาษทรงลูกบาศก์ 6 แบบ (4 ฟรี + 2 Premium) · สีแสงไฟ · ชื่อ/คำอธิษฐาน/คำอวยพร/ข้อความเพิ่มเติม · 5 ฟอนต์ไทย · สี ขนาด ตำแหน่งข้อความ · **Live Preview 3 มิติ** ข้อความ/ภาพวาด/รูปแสดงบนผิวโคมจริง · วาดภาพ (Pen, Eraser, Color, Brush size, Undo, Redo, Clear, รองรับ Touch/Mouse/Stylus pressure) · อัปโหลดรูป (JPG/PNG/WEBP ≤ 5 MB, Crop, Resize, ลากปรับตำแหน่ง, ลบ) · Preview ในฉากจำลองพร้อมแอนิเมชันจุดเทียน |
| **Checkout** (`/checkout`) | สรุปรายการแบบแยกชิ้น (สีโคม + เอฟเฟกต์ + ใส่เงินลงกระทง) ราคาคำนวณใหม่ที่ server จากฐานข้อมูล → รวม 0 บาทปล่อยทันที / มียอดไป Stripe Checkout (1 รายการ Stripe ต่อ 1 ชิ้น) |
| **ของเสริม** | สีโคมมีราคาของตัวเอง · เอฟเฟกต์ 9 แบบเลือกได้หลายอัน (พลุ หัวใจ ดาวระยิบ กลีบดอกไม้ ผีเสื้อ หิ่งห้อย กรอบลายไทย รุ้ง ออร่าทอง) · ใส่เงินลงกระทง (ปุ่มยอดสำเร็จ + ใส่เอง) แสดงป้ายเหรียญทองเหนือโคม |
| **Festival** (`/festival`) | ผิวน้ำขนาดใหญ่ · โคมลอยแบบไม่เป็นเส้นตรง (โยกตามคลื่น หมุนเล็กน้อย เงาสะท้อน) · Real-time ผ่าน Supabase Broadcast · สูงสุด 50 โคมต่อจอ · โคมของเจ้าของมี Priority สูงสุด · กล้องติดตามโคมของตัวเอง · คลิกโคมเพื่อหยุด/ซูม/อ่านรายละเอียด · Hover + Cursor pointer · รายงานโคมไม่เหมาะสม |
| **Lifecycle** | อายุ **7 วัน** (กำหนดโดย DB): 0–5 นาที ใกล้ · 5–30 นาที ลอยออกไป · หลังจากนั้นลอยพักกลางสายน้ำ · ชั่วโมงสุดท้ายหรี่และจางหาย · หลัง 7 วันไม่แสดงในเทศกาล แต่เจ้าของยังดูได้ใน “สายน้ำของฉัน” |
| **แชร์** | หลังปล่อยโคม: โปสการ์ดโพลารอยด์ (1080×1920) → Instagram Story / Facebook / LINE / คัดลอกลิงก์ · ลิงก์ `/l/<id>` เปิดเทศกาลแล้วซูมไปที่โคมนั้น · OG image เฉพาะโคม · **ลิงก์ + เพลง 15 วิ**: วางลิงก์ YouTube เลือกท่อน 15 วินาที (มีปุ่มฟังตัวอย่าง) → ลิงก์ `/l/<id>?yt=<videoId>&t=<วินาที>` เล่นท่อนนั้นวนซ้ำผ่านเครื่องเล่นทางการของ YouTube (ไม่ดึง/ดาวน์โหลดไฟล์เสียง · คลิปที่เจ้าของปิดการฝังจะแจ้งให้เลือกเพลงอื่น) |
| **Interaction** | ลากหมุนโคม 360° (Studio/Preview) · ลากเลื่อน/ถ่างนิ้ว/ล้อเมาส์/ลูกศร ในฉากเทศกาล |
| **เพลง** | เพลงธีม mp3 (เสียงอย่างเดียว) เปิดอัตโนมัติ วนซ้ำ · ปุ่มปิดเสียง/ระดับเสียง · fallback ดนตรีสังเคราะห์ |
| **My Lanterns** (`/my-lanterns`) | โคมของฉัน + เวลาที่เหลือ + ประวัติการชำระเงิน · ผูกโคมเข้าบัญชีด้วยอีเมล |
| **Payment** | Stripe Checkout (THB) · Card/Debit · PromptPay · Webhook + Signature · กัน Webhook ซ้ำ · กันโคมซ้ำ · จัดการยกเลิก · Payment history |
| **Admin** (`/admin`) | Dashboard (รวมยอดใส่เงินลงกระทง) · จัดการโคม/ซ่อน/กู้คืน · รายงาน · ราคา/ของเสริม (ราคาแต่ละสีโคมและเอฟเฟกต์ เปิด/ปิดขาย, ตั้งค่าปุ่มยอดใส่เงิน/ขั้นต่ำ/สูงสุด) · Payments · Error logs · Role `admin` / `moderator` |
| **SEO** | Metadata API, Open Graph image (สร้างอัตโนมัติ), Twitter card, Canonical, sitemap.xml, robots.txt, JSON-LD (WebSite, Event, WebApplication), manifest |

---

## สถาปัตยกรรม

```
┌───────────────────────────── Browser ─────────────────────────────┐
│  Next.js pages (React)                                            │
│  ├─ Canvas engine (lib/scene) ── requestAnimationFrame, DPR,      │
│  │    object pool, LOD, adaptive quality                          │
│  ├─ Each client computes animation from released_at (server time)│
│  └─ Supabase Realtime (private broadcast "festival")  ◄────────┐ │
└──────────────┬────────────────────────────────────────────────┼───┘
               │ fetch /api/*  (JSON, cookies)                   │ events only:
┌──────────────▼──────────── Next.js Route Handlers ────────────┐│ lantern:new {id}
│ validate (zod) · sanitize · rate-limit (DB) · auth (Supabase)  ││ lantern:removed {id}
│ services/: lantern · payment · storage(sharp) · package · admin││
└──────┬───────────────┬──────────────────┬──────────────────────┘│
       │ service role  │ Stripe SDK       │                       │
┌──────▼──────┐  ┌─────▼──────┐   ┌───────▼────────┐              │
│ Supabase PG │  │  Stripe    │──►│ /api/webhooks/ │              │
│ RLS, RPC,   │  │  Checkout  │   │ stripe         │              │
│ triggers ───┼──┼────────────┼───┼────────────────┼──────────────┘
│ realtime.send()            │   └────────────────┘
│ Storage (private bucket, signed URLs ≤ lantern expiry)          │
└─────────────┘
```

**หลักการสำคัญ**

- **ไม่ส่งแอนิเมชันผ่านเครือข่าย** — Realtime ส่งเฉพาะ Event (`lantern:new` / `lantern:removed`) ที่ Database trigger ยิงเอง (`realtime.send`) Client จะดึงข้อมูลโคมแบบ batch และคำนวณท่าทางของโคมจาก `id` + อายุ (deterministic) ทุกเครื่องจึงเห็นโคมอยู่ตำแหน่งเดียวกัน
- **เวลาเป็นของ Server** — `released_at` / `expires_at` ถูกตั้งด้วย trigger ใน Postgres (แก้ไขย้อนหลังไม่ได้) และ Client ซิงก์ `serverTime offset` จากทุก response
- **Realtime เป็นแค่ "สัญญาณ"** — Event มีแค่ id ของโคม Client ดึงข้อมูลจริงจาก API เสมอ Event ปลอมจึงไม่มีผล (id ที่ไม่มีจริงจะไม่พบข้อมูล) และมี **polling สำรอง** (`/api/lanterns?since=`) ทุก 4 วินาทีเมื่อ Realtime ใช้ไม่ได้ / ทุก 15 วินาทีเมื่อใช้ได้ เพื่อให้เห็นโคมของคนอื่นเสมอ
- **ห้ามเชื่อ Frontend เรื่องเงิน** — ราคาอ่านจาก DB ตอนสร้าง Session, การปล่อยโคมเกิดใน RPC `activate_paid_lantern` หลัง Webhook ที่ตรวจลายเซ็น และดึง Session จาก Stripe ซ้ำเพื่อตรวจ `payment_status`, สกุลเงิน และยอดเงิน

### Payment flow

```
Studio → /checkout → POST /api/checkout
   ├─ lanterns(status=pending_payment) + payments(pending)  [idempotent: requestId]
   ├─ Stripe Checkout Session (price from DB, idempotencyKey)
   └─ redirect → Stripe
Stripe → POST /api/webhooks/stripe (signature verified)
   ├─ stripe_events (dedupe)
   ├─ retrieve session from Stripe → paid?
   └─ rpc activate_paid_lantern (row lock, amount check, once only)
         └─ trigger: released_at/expires_at + stats + realtime.send('lantern:new')
/payment/success → polls /api/checkout/status (reads DB, not URL)
/payment/cancel  → expire Stripe session → close_unpaid_payment
```

---

## โครงสร้างโปรเจกต์

```
.
├─ supabase/migrations/
│  ├─ 20261122000001_init.sql        # ตาราง, index, FK, constraints, RLS, triggers, RPC, storage, realtime, seed packages
│  └─ 20261122000002_cron_jobs.sql   # (optional) pg_cron jobs
├─ src/
│  ├─ app/                           # หน้าเว็บ + API Route Handlers
│  │  ├─ page.tsx  festival/  create/  checkout/  payment/{success,cancel}/
│  │  ├─ my-lanterns/  about/  privacy/  terms/  admin/{,login}/  auth/callback/
│  │  ├─ api/{lanterns,uploads,packages,stats,checkout,webhooks/stripe,cron/cleanup,me,account,admin}/
│  │  └─ robots.ts sitemap.ts manifest.ts opengraph-image.tsx icon.svg
│  ├─ components/
│  │  ├─ ui/          # shadcn/ui (button, dialog, tabs, slider, ...)
│  │  ├─ studio/      # design picker, text panel, drawing pad, image panel, preview
│  │  ├─ festival/    # festival view + lantern detail dialog
│  │  ├─ scene/       # React wrappers of the canvas engine
│  │  ├─ lantern/     # single lantern preview
│  │  ├─ landing/ checkout/ account/ admin/ audio/ layout/ providers/
│  ├─ hooks/          # use-festival-lanterns (realtime), use-lantern-draft, use-festival-stats
│  ├─ services/       # server-only business logic (lantern, payment, storage, package, admin, cleanup, logger, rate-limit)
│  ├─ lib/
│  │  ├─ lantern/     # designs, motion (lifecycle), selection (50 cap + owner priority), texture, render (Canvas 2D)
│  │  ├─ scene/       # engine, water, particles, view/projection
│  │  ├─ audio/       # generative ambient music (Web Audio)
│  │  ├─ security/    # zod schemas, sanitize, image sniffing, claim token
│  │  ├─ supabase/    # browser / server / admin clients
│  │  └─ stripe/      # server client
│  ├─ types/
│  └─ proxy.ts        # session refresh + /admin guard (Next.js 16 "proxy" = middleware)
├─ tests/             # vitest
├─ .env.example
└─ vercel.json        # cron
```

---

## ติดตั้งและรันในเครื่อง

ต้องการ **Node.js ≥ 20.9** และ npm

```bash
npm install
cp .env.example .env.local      # แล้วใส่ค่าตามหัวข้อถัดไป
npm run dev                     # http://localhost:3000
```

สคริปต์อื่น ๆ

```bash
npm run typecheck   # TypeScript
npm run lint        # ESLint
npm test            # Vitest
npm run build && npm start
```

> ถ้ายังไม่ได้ใส่ค่า Supabase เว็บไซต์ยังเปิดได้ (Landing, Studio) แต่ API จะตอบ `503 not_configured` และปุ่มปล่อยโคมจะถูกปิดไว้

---

## ตั้งค่า Supabase

1. สร้าง Project ที่ [supabase.com](https://supabase.com) (แนะนำ Region: Singapore)
2. **รัน Migration** — เลือกวิธีใดวิธีหนึ่ง
   - Dashboard → **SQL Editor** → วางเนื้อหา `supabase/migrations/20261122000001_init.sql` แล้ว Run
     แล้วรันต่อตามลำดับ: `20261122000003_public_broadcast.sql`, `20261122000004_lifetime_7_days.sql`, `20261123000005_catalog_effects_offering.sql` (ทุกไฟล์รันซ้ำได้)
     ส่วน `20261122000002_cron_jobs.sql` เป็น optional – ดูหัวข้อ [งานตามเวลา](#งานตามเวลา-retention--cleanup)
   - หรือ Supabase CLI:
     ```bash
     npx supabase link --project-ref <project-ref>
     npx supabase db push
     ```
   Migration จะสร้าง: ตาราง `users, lanterns, payments, packages, festival_statistics` + `stripe_events, festival_participants, lantern_reports, error_logs, rate_limits`, Index, FK, Constraints, RLS, Triggers, RPC, Storage bucket `lantern-assets` (private, 5 MB, เฉพาะรูป) และแพ็กเกจเริ่มต้น 3 แบบ
3. **Authentication → Sign In / Providers**
   - เปิด **Allow anonymous sign-ins** (ผู้ใช้แบบ Guest ไม่ต้องสมัคร)
   - เปิด **Email** provider (ใช้ผูกโคมเข้าบัญชี และ Admin login)
   - แนะนำเปิด **CAPTCHA** (Turnstile/hCaptcha) เพื่อกัน Bot สร้าง Anonymous user จำนวนมาก
4. **Authentication → URL Configuration**
   - Site URL: `https://your-domain.com`
   - Redirect URLs: `https://your-domain.com/auth/callback`, `http://localhost:3000/auth/callback`
5. **Realtime** — ไม่ต้องตั้งค่าเพิ่ม (ใช้ broadcast channel `festival` แบบ public ที่ส่งแค่ id ของโคม; ถ้า Realtime ใช้งานไม่ได้ ระบบจะ polling `?since=` ทุก 4 วินาทีแทนโดยอัตโนมัติ)
6. **Project Settings → API** — คัดลอก `Project URL`, `anon key`, `service_role key` ใส่ `.env.local`

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...        # Server เท่านั้น ห้ามขึ้นต้นด้วย NEXT_PUBLIC_
```

### สร้างผู้ดูแลระบบ

1. Dashboard → Authentication → **Add user** (อีเมล + รหัสผ่าน, ติ๊ก Auto confirm)
2. SQL Editor:
   ```sql
   update public.users set role = 'admin' where email = 'admin@example.com';
   -- หรือ 'moderator' สำหรับผู้ดูแลเนื้อหาอย่างเดียว
   ```
3. เข้า `/admin/login`

---

## ตั้งค่า Stripe

1. Dashboard → Developers → API keys → ใส่ `STRIPE_SECRET_KEY` และ `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
2. **Payment methods** (Settings → Payments → Payment methods): เปิด **Cards** และ (ถ้าพร้อม) **PromptPay**
   - PromptPay ใช้ได้กับ Stripe account ในประเทศไทย และสกุลเงิน THB เท่านั้น — ตรวจสอบสถานะการเปิดใช้งานในบัญชีก่อน แล้วจึงตั้ง `STRIPE_ENABLE_PROMPTPAY=true`
   - โปรเจกต์นี้ใช้ Stripe API `2026-11-18` ซึ่งใช้ `allowed_payment_method_types` (กรองจากวิธีชำระที่เปิดไว้ใน Dashboard) แทน `payment_method_types` แบบเดิม
3. **Webhook** (Developers → Webhooks → Add endpoint)
   - URL: `https://your-domain.com/api/webhooks/stripe`
   - Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`
   - คัดลอก Signing secret → `STRIPE_WEBHOOK_SECRET`
4. ทดสอบในเครื่องด้วย Stripe CLI
   ```bash
   stripe listen --forward-to localhost:3000/api/webhooks/stripe
   # ใช้ whsec_... ที่ CLI แสดงเป็น STRIPE_WEBHOOK_SECRET
   ```
   บัตรทดสอบ: `4242 4242 4242 4242`, วันหมดอายุใดก็ได้ในอนาคต, CVC ใดก็ได้

> ยอดชำระรวมต้อง **ไม่ต่ำกว่า 10 บาท** (ขั้นต่ำของ Stripe สำหรับ THB) — ถ้าลูกค้าเลือกของรวมต่ำกว่านี้ หน้า Checkout จะบอกให้เพิ่มของเสริมหรือใส่เงินให้ถึง 10 บาท (ตรวจซ้ำที่ server)

---

## งานตามเวลา (Retention / Cleanup)

โคมถูกซ่อนจากเทศกาลสาธารณะทันทีที่ครบ 7 วันจากเวลาของ Server (ทั้ง API filter และ RLS) แต่**เนื้อหาและรูปถูกเก็บไว้ให้เจ้าของ**ดูใน “สายน้ำของฉัน” (`/api/me/lanterns`) ส่วน **Retention job** `/api/cron/cleanup` ทำหน้าที่:

1. เปลี่ยนสถานะโคมที่ครบ 7 วันเป็น `expired`
2. ลบรูปและภาพวาดใน Storage + ล้างเนื้อหาข้อความของโคมที่ถูกซ่อน (moderation) / ยกเลิก / ไม่ชำระเงิน (เก็บแถวขั้นต่ำไว้สำหรับสถิติและประวัติชำระเงิน)
3. ปิดรายการชำระเงินที่ค้างเกิน 2 ชั่วโมง
4. ล้าง rate-limit เก่า

ตั้ง `CRON_SECRET` แล้วเลือกตัวตั้งเวลา:

- **Vercel Cron** — มีอยู่แล้วใน `vercel.json` (ทุก 10 นาที) *แพ็กเกจ Hobby รันได้วันละครั้ง* ถ้าใช้ Hobby ให้ใช้วิธีด้านล่างเพิ่ม
- **Supabase pg_cron + pg_net** — เปิด Extension ทั้งสอง แล้วรัน `supabase/migrations/20261122000002_cron_jobs.sql` และเพิ่ม:
  ```sql
  select cron.schedule('loykrathong-cleanup', '*/5 * * * *', $$
    select net.http_get(
      url := 'https://your-domain.com/api/cron/cleanup',
      headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>')
    );
  $$);
  ```
  (แนะนำเก็บ secret ใน Supabase Vault)

---

## เพลงประกอบ

- เพลงธีมเป็น **ไฟล์เสียงอย่างเดียว** `public/audio/loykrathong-bgm.mp3` เล่นวนซ้ำ **เปิดอัตโนมัติ** ทุกหน้า (Provider อยู่ใน Root layout จึงเล่นต่อเนื่องระหว่างเปลี่ยนหน้า)
- Browser ส่วนใหญ่ไม่ให้เล่นเสียงก่อนผู้ใช้โต้ตอบ — ระบบจะลองเล่นทันที ถ้าถูกบล็อกจะเริ่มเล่นเองเมื่อผู้ใช้แตะ/คลิก/กดปุ่มครั้งแรกที่ใดก็ได้ในหน้า (ไม่มีป๊อปอัปถาม)
- ปุ่มลำโพงมุมขวาล่าง = ปิด/เปิดเสียง (จำค่าใน `localStorage`) · ปุ่มตัวเลข = ระดับเสียง · หยุดชั่วคราวเมื่อสลับแท็บ และเมื่อเล่นเพลง 15 วิ ของลิงก์แชร์
- เปลี่ยนเพลง: แทนที่ไฟล์ `public/audio/loykrathong-bgm.mp3` หรือตั้ง `NEXT_PUBLIC_BGM_URL=/audio/<ไฟล์>.mp3`
- ถ้าไฟล์โหลดไม่ได้ ระบบใช้ดนตรีบรรยากาศที่สังเคราะห์ด้วย Web Audio API แทน
- ⚠️ เพลงที่เปิดบนเว็บสาธารณะต้องมีสิทธิ์ใช้ (เพลง "รำวงวันลอยกระทง" ต้นฉบับยังมีลิขสิทธิ์) — ใช้ไฟล์ที่ได้รับอนุญาตหรือซื้อ License ก่อนเปิดใช้งานจริง

---

## Deploy บน Netlify (ผ่าน command line)

> Netlify ตรวจเจอ Next.js เองผ่าน OpenNext adapter — ไม่ต้องติดตั้ง plugin เพิ่ม · `netlify.toml` ตั้งค่า build + งานล้างโคมหมดอายุทุก 10 นาที (`netlify/functions/cleanup-cron.mjs`) ไว้แล้ว
> ใช้ `--remote` ให้ Netlify build บนเซิร์ฟเวอร์ Linux เสมอ — ถ้า build บน Windows แล้วอัปโหลด `sharp` (ประมวลผลรูปอัปโหลด) จะติด binary ของ Windows ไปและใช้งานไม่ได้

```bash
npm install -g netlify-cli
netlify login                                   # เปิดเบราว์เซอร์ให้ล็อกอิน
netlify sites:create --name <ชื่อเว็บ>           # ได้ URL https://<ชื่อเว็บ>.netlify.app (ถ้าไม่ได้ link ให้รัน netlify link)
netlify env:import .env.local                   # ส่งค่า env ขึ้น Netlify
netlify env:set NEXT_PUBLIC_APP_URL https://<ชื่อเว็บ>.netlify.app
netlify env:set CRON_SECRET <สุ่มยาว ๆ>
netlify env:set CLAIM_TOKEN_SECRET <สุ่มยาว ๆ>
netlify deploy --remote --prod                  # build บน Netlify แล้วขึ้น production
```

ครั้งต่อไปที่แก้โค้ด: `netlify deploy --remote --prod` คำสั่งเดียว

หลัง deploy:
- **Supabase** → Authentication → URL Configuration: ตั้ง Site URL และเพิ่ม Redirect URL `https://<ชื่อเว็บ>.netlify.app/**`
- **Stripe** → Webhooks → Add endpoint `https://<ชื่อเว็บ>.netlify.app/api/webhooks/stripe` (events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`) → นำ Signing secret ไป `netlify env:set STRIPE_WEBHOOK_SECRET whsec_...` แล้ว deploy ใหม่
- ค่า `NEXT_PUBLIC_*` ถูกฝังตอน build — เปลี่ยนค่าแล้วต้อง deploy ใหม่ทุกครั้ง

## Deploy บน Vercel

1. Push โค้ดขึ้น GitHub แล้ว Import ใน Vercel (Framework: Next.js)
2. ใส่ Environment Variables ทั้งหมดจาก `.env.example` (Production + Preview)
   - `NEXT_PUBLIC_APP_URL` = โดเมนจริง (ใช้กับ SEO canonical และ Stripe redirect)
   - `CRON_SECRET`, `CLAIM_TOKEN_SECRET` = ค่าสุ่ม (`openssl rand -hex 32`)
3. Deploy แล้วอัปเดต Stripe Webhook URL และ Supabase Redirect URLs ให้เป็นโดเมนจริง
4. Checklist ก่อนเปิดจริง
   - [ ] Stripe เปลี่ยนเป็น Live keys + Live webhook secret
   - [ ] PromptPay เปิดใช้งานในบัญชีแล้ว (ถ้าตั้ง `STRIPE_ENABLE_PROMPTPAY=true`)
   - [ ] Supabase: Anonymous sign-ins + CAPTCHA, Realtime private only, Redirect URLs
   - [ ] ตั้ง Cron ทำงานบ่อยพอ
   - [ ] ตรวจทาน `/privacy` และ `/terms` ให้ตรงกับธุรกิจจริง
   - [ ] สร้างบัญชี Admin

---

## Admin Panel

| สิทธิ์ | admin | moderator |
|---|:---:|:---:|
| Dashboard | ✓ | ✓ |
| ดู/ซ่อน/กู้คืนโคม | ✓ | ✓ |
| จัดการรายงาน | ✓ | ✓ |
| แพ็กเกจและราคา | ✓ | |
| รายการชำระเงิน | ✓ | |
| Error logs | ✓ | |

สิทธิ์ถูกตรวจจากตาราง `users.role` ใน Database ทุกครั้งที่เรียก API (ผู้ใช้แก้ role ตัวเองไม่ได้ — column privilege) โคมที่ถูกรายงานครบ 5 ครั้งจะถูกซ่อนอัตโนมัติรอตรวจสอบ การซ่อนโคมจะส่ง Event `lantern:removed` ให้ทุกคนเห็นผลทันที

---

## ความปลอดภัย

- **Validation**: Zod ทั้งฝั่ง Client และ Server, DB check constraints เป็นชั้นสุดท้าย
- **Sanitize**: ตัด control/bidi-override characters และ tag, ข้อความแสดงผลเป็น text node / canvas เท่านั้น (ไม่มี HTML injection), JSON-LD escape `<`
- **Upload**: ตรวจ magic bytes (ไม่เชื่อนามสกุลไฟล์), จำกัด 5 MB, จำกัดจำนวนพิกเซล, **re-encode ด้วย sharp** (ลบ EXIF/GPS และ payload แฝง), Bucket เป็น private + Signed URL หมดอายุพร้อมโคม, path ต้องอยู่ในโฟลเดอร์ของผู้ใช้เอง
- **Rate limit**: แบบ DB (ใช้ได้กับ serverless หลาย instance) — ปล่อยโคม 5 ครั้ง/10 นาที/ผู้ใช้, อัปโหลด, checkout, report, อ่าน API
- **Anti-spam / Duplicate**: `requestId` (UUID) unique ต่อผู้ใช้ — กดซ้ำหรือ retry ได้โคมเดิม, Stripe idempotency key, `payments.stripe_session_id` unique, `lanterns.payment_id` unique, `stripe_events` dedupe
- **RLS**: เปิดทุกตาราง, Client อ่านได้เฉพาะโคมที่กำลังลอยและ column ที่อนุญาต, ข้อมูลส่วนตัว/ชำระเงินอ่านได้เฉพาะเจ้าของ, การเขียนทั้งหมดผ่าน Server
- **Secrets**: Service role / Stripe secret ใช้ในไฟล์ `server-only` เท่านั้น
- **Headers**: CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, Same-origin check บน POST
- **SQL injection**: ใช้ Supabase query builder / RPC แบบ parameterized ทั้งหมด

---

## ประสิทธิภาพ

- Canvas 2D + `requestAnimationFrame` วาดโคมสูงสุด **50 ดวง** ต่อจอ (strict cap รวมโคมที่กำลัง fade)
- เลือกโคมที่จะแสดงทุก 400 ms (ไม่ใช่ทุกเฟรม): โคมของเจ้าของ → โคมที่เปิดดูอยู่ → โคมในมุมมอง → ใหม่สุด, โคมเก่า/ไกลสุดถูก fade ออกอย่างนุ่มนวล
- Texture ของโคมสร้างครั้งเดียว ความละเอียดครึ่งหนึ่ง และ **Object pool** นำ canvas กลับมาใช้, โคมเล็กใช้ LOD แบบไม่มี texture, glow ใช้ sprite ที่ cache ไว้
- Device Pixel Ratio จำกัด 2 (high) / 1.25 (low), **ลดคุณภาพอัตโนมัติ** เมื่อ frame time สูงหรืออุปกรณ์ CPU/RAM ต่ำ หรือ `prefers-reduced-motion`
- หยุดวาดเมื่อแท็บถูกซ่อนหรือ Canvas อยู่นอกจอ
- Realtime ส่งเฉพาะ Event, Batch fetch, Resync ทุก 2 นาที / เมื่อกลับมาออนไลน์ / เมื่อกลับมาที่แท็บ, Unsubscribe เมื่อออกจากหน้า
- Compress รูปฝั่ง Client (WEBP ≤ 1200px) ก่อนอัปโหลด, Lazy loading รูปในหน้ารายละเอียด, ไม่โหลดโคมหมดอายุ, ไม่มี DB query ต่อเฟรม

---

## การทดสอบ

```bash
npm test
```

- `tests/selection.test.ts` — cap 50, owner priority, ไม่แสดงโคมหมดอายุ, pinned, in-view
- `tests/motion.test.ts` — lifecycle 7 วัน (ลอยออก → พัก → จางหาย), deterministic, ไม่เป็นเส้นตรง, ignite/fade
- `tests/image-client.test.ts` — แปลง data URL → Blob (CSP-safe)
- `tests/security.test.ts` — sanitize, magic bytes, zod schemas (path traversal, ขนาดข้อความ, THB ขั้นต่ำ), claim token

SQL migration ถูกทดสอบกับ PostgreSQL 16 จริง (การยืนยันชำระเงินแบบ idempotent, ปฏิเสธยอดไม่ตรง, แก้ `expires_at` ไม่ได้, กันคำขอซ้ำ, ซ่อนอัตโนมัติจาก report, RLS ซ่อน column ภายในและกันการยกระดับ role)

---

## API Reference

| Method | Path | Auth | คำอธิบาย |
|---|---|---|---|
| GET | `/api/lanterns` | – | โคมที่กำลังลอย (ใหม่สุด 150) + `serverTime` |
| GET | `/api/lanterns?ids=a,b` | – | โคมตาม id (ใช้หลังได้ Realtime event) |
| GET | `/api/lanterns?since=<iso>` | – | โคมที่ปล่อยหลังเวลาที่ระบุ (polling สำรอง) |
| POST | `/api/lanterns` | session | ปล่อยโคมที่ยอดรวม 0 บาท (`{requestId, lantern, effects[], offering}`) |
| GET | `/api/lanterns/:id` | – | รายละเอียดโคม (404 เมื่อหมดอายุ) |
| POST | `/api/lanterns/:id/report` | session | รายงานโคม |
| POST | `/api/uploads` | session | อัปโหลดรูป/ภาพวาด (multipart) |
| GET | `/api/catalog` | – | ราคาสีโคม/เอฟเฟกต์ + ตั้งค่าการใส่เงิน (แสดงผลเท่านั้น server คิดราคาใหม่เสมอ) |
| GET | `/api/stats` | – | สถิติเทศกาล |
| POST | `/api/checkout` | session | สร้าง Stripe Checkout Session (body เดียวกับ `/api/lanterns`) |
| GET | `/api/checkout/status?session_id=` | session | สถานะการชำระ (จาก DB) |
| POST | `/api/checkout/cancel` | session | ยกเลิกรายการ |
| POST | `/api/webhooks/stripe` | Stripe signature | Webhook |
| GET | `/api/me` | session | โคมของฉัน + ประวัติชำระเงิน |
| GET | `/api/me/lanterns` | session | โคมของฉันพร้อมเนื้อหา (รวมที่ครบ 7 วันแล้ว) สำหรับ “สายน้ำของฉัน” |
| POST | `/api/account/claim-token`, `/api/account/claim` | session | ย้ายโคม Guest เข้าบัญชีที่มีอยู่ |
| GET | `/api/cron/cleanup` | `Bearer CRON_SECRET` | Retention job |
| * | `/api/admin/*` | admin/moderator | overview, lanterns, reports, catalog, settings/offering, payments, logs |

---

## Troubleshooting

| อาการ | วิธีแก้ |
|---|---|
| API ตอบ `503 not_configured` | ยังไม่ได้ใส่ env ของ Supabase/Stripe หรือยังไม่ได้ restart dev server |
| ปล่อยโคมแล้วขึ้น "ไม่สามารถสร้างเซสชันผู้เยี่ยมชมได้" | ยังไม่ได้เปิด Anonymous sign-ins |
| ผู้ใช้อื่นเห็นโคมใหม่ช้า (~4 วินาที) และป้ายมุมซ้ายบนเป็น "อัปเดตอัตโนมัติ" แทน "Live" | Realtime ยังไม่ทำงาน (ระบบใช้ polling แทนอยู่) ตรวจว่ารัน `20261122000003_public_broadcast.sql` แล้ว |
| เว็บช้าตอน `npm run dev` | โหมด dev คอมไพล์ทุกหน้าครั้งแรกและไม่ optimize – วัดความเร็วจริงด้วย `npm run build && npm start` |
| ชำระเงินแล้วหน้า success ค้าง "กำลังยืนยัน" | Webhook ยังไม่ถึง: ตรวจ URL/secret, ดู Stripe → Webhooks → attempts และ `/admin` → Logs |
| ไม่เห็นตัวเลือก PromptPay | ต้องเปิดใน Stripe Dashboard + บัญชีไทย + THB + `STRIPE_ENABLE_PROMPTPAY=true` (ค่าเริ่มต้นรับ QR พร้อมเพย์อย่างเดียว · `NEXT_PUBLIC_PAYMENT_QR_ONLY=false` = รับบัตรด้วย) |
| รูปบนโคมไม่ขึ้น | Bucket `lantern-assets` ต้องมีอยู่ และ Signed URL ยังไม่หมดอายุ |

**หมายเหตุการออกแบบ**: คอลัมน์ `lanterns.image_url` เก็บ *path* ของไฟล์ใน Storage (bucket แบบ private) และ API แปลงเป็น Signed URL ที่หมดอายุพร้อมโคม เพื่อให้ "เปิดดูโคมไม่ได้หลังครบ 30 นาที" เป็นจริงทั้งข้อมูลและรูปภาพ
