-- ============================================================
-- REALTIME SQL - Sales AganceOnline
-- Run this ONCE in Supabase SQL Editor to enable Realtime
-- ============================================================

-- Enable Realtime for all main tables
-- This adds them to the supabase_realtime publication so that
-- the frontend can receive live INSERT / UPDATE / DELETE events.

ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cars;
ALTER PUBLICATION supabase_realtime ADD TABLE public.car_images;
ALTER PUBLICATION supabase_realtime ADD TABLE public.wanted_cars;

-- ============================================================
-- NOTES:
--  • If you get "already member of publication" run the block below instead:
--    ALTER PUBLICATION supabase_realtime DROP TABLE public.profiles;
--    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
--    (repeat for each table)
--
--  • In Supabase Dashboard → Database → Replication, make sure
--    "supabase_realtime" is ENABLED and all 4 tables are checked.
-- ============================================================
