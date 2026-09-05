-- ============================================================
-- SALES AGANCEONLINE — DATABASE UPDATE
-- Run this AFTER the original database.sql
-- Adds: Cars for Sale, Car Inspection, Activity Logs, RLS Updates
-- ============================================================

-- ============================================================
-- NEW ENUMS
-- ============================================================
DO $$ BEGIN
    CREATE TYPE sale_submission_status AS ENUM ('pending', 'approved', 'rejected', 'not_interested');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================
-- 1. ALTER TABLE: cars — Add inspection_file_url column
-- ============================================================
ALTER TABLE public.cars
    ADD COLUMN IF NOT EXISTS inspection_file_url TEXT;

-- ============================================================
-- 2. NEW TABLE: cars_for_sale
--    Sales users submit cars for the owner to review
-- ============================================================
CREATE TABLE IF NOT EXISTS public.cars_for_sale (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    submitted_by        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
    brand               TEXT NOT NULL,
    model               TEXT NOT NULL,
    year                INTEGER NOT NULL CHECK (year >= 1900 AND year <= 2100),
    trim                TEXT,
    color               TEXT,
    mileage             INTEGER DEFAULT 0 CHECK (mileage >= 0),
    transmission        transmission_type,
    fuel_type           fuel_type,
    engine              TEXT,
    seller_price        NUMERIC(15,2) NOT NULL DEFAULT 0,
    owner_offer_price   NUMERIC(15,2),
    location            TEXT,
    description         TEXT,
    seller_notes        TEXT,
    owner_notes         TEXT,
    status              sale_submission_status NOT NULL DEFAULT 'pending',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 3. NEW TABLE: cars_for_sale_images
--    Multiple images per sale submission
-- ============================================================
CREATE TABLE IF NOT EXISTS public.cars_for_sale_images (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    car_sale_id UUID NOT NULL REFERENCES public.cars_for_sale(id) ON DELETE CASCADE,
    url         TEXT NOT NULL,
    is_primary  BOOLEAN DEFAULT FALSE,
    sort_order  INTEGER DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 4. NEW TABLE: activity_logs
--    Immutable audit trail — no UPDATE or DELETE policies
-- ============================================================
CREATE TABLE IF NOT EXISTS public.activity_logs (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    user_name   TEXT NOT NULL,
    user_role   TEXT NOT NULL,
    action_type TEXT NOT NULL,    -- 'car_added', 'car_edited', 'login', etc.
    target_type TEXT,             -- 'car', 'user', 'wanted_car', 'sale_submission'
    target_id   UUID,
    description TEXT NOT NULL,
    old_data    JSONB,
    new_data    JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_cfs_submitted_by  ON public.cars_for_sale(submitted_by);
CREATE INDEX IF NOT EXISTS idx_cfs_status        ON public.cars_for_sale(status);
CREATE INDEX IF NOT EXISTS idx_cfs_brand         ON public.cars_for_sale(brand);
CREATE INDEX IF NOT EXISTS idx_cfs_images_car    ON public.cars_for_sale_images(car_sale_id);
CREATE INDEX IF NOT EXISTS idx_logs_user_id      ON public.activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_logs_action       ON public.activity_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_logs_target_type  ON public.activity_logs(target_type);
CREATE INDEX IF NOT EXISTS idx_logs_created_at   ON public.activity_logs(created_at DESC);

-- ============================================================
-- TRIGGERS: auto-update updated_at on cars_for_sale
-- ============================================================
DROP TRIGGER IF EXISTS trigger_cfs_updated_at ON public.cars_for_sale;
CREATE TRIGGER trigger_cfs_updated_at
    BEFORE UPDATE ON public.cars_for_sale
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- FUNCTION: log_activity (SECURITY DEFINER — safe for RLS)
-- All pages call this to insert logs without bypassing policies
-- ============================================================
CREATE OR REPLACE FUNCTION public.log_activity(
    p_action_type  TEXT,
    p_target_type  TEXT,
    p_target_id    UUID,
    p_description  TEXT,
    p_old_data     JSONB DEFAULT NULL,
    p_new_data     JSONB DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_profile public.profiles;
BEGIN
    SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
    IF NOT FOUND THEN RETURN; END IF;

    INSERT INTO public.activity_logs (
        user_id, user_name, user_role,
        action_type, target_type, target_id,
        description, old_data, new_data
    ) VALUES (
        auth.uid(),
        v_profile.full_name,
        v_profile.role::TEXT,
        p_action_type,
        p_target_type,
        p_target_id,
        p_description,
        p_old_data,
        p_new_data
    );
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.log_activity TO authenticated;

-- ============================================================
-- FUNCTION: is_approved_sales
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_approved_sales()
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'sales' AND status = 'approved'
    );
END;
$$;

-- ============================================================
-- ENABLE RLS
-- ============================================================
ALTER TABLE public.cars_for_sale        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cars_for_sale_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs        ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS: cars_for_sale
-- ============================================================

-- Owner can see ALL submissions
DROP POLICY IF EXISTS "owner_select_all_cfs" ON public.cars_for_sale;
CREATE POLICY "owner_select_all_cfs" ON public.cars_for_sale
    FOR SELECT USING (public.is_owner());

-- Sales can only see their OWN submissions
DROP POLICY IF EXISTS "sales_select_own_cfs" ON public.cars_for_sale;
CREATE POLICY "sales_select_own_cfs" ON public.cars_for_sale
    FOR SELECT USING (
        auth.uid() = submitted_by AND public.is_approved_user()
    );

-- Approved Sales can INSERT submissions
DROP POLICY IF EXISTS "sales_insert_cfs" ON public.cars_for_sale;
CREATE POLICY "sales_insert_cfs" ON public.cars_for_sale
    FOR INSERT WITH CHECK (
        auth.uid() = submitted_by AND public.is_approved_user()
    );

-- Sales can UPDATE their OWN submissions ONLY when still pending
-- BUT cannot change owner_offer_price, owner_notes, or status
-- (enforced additionally at app level)
DROP POLICY IF EXISTS "sales_update_own_cfs_pending" ON public.cars_for_sale;
CREATE POLICY "sales_update_own_cfs_pending" ON public.cars_for_sale
    FOR UPDATE USING (
        auth.uid() = submitted_by
        AND status = 'pending'
        AND public.is_approved_user()
    );

-- Owner can UPDATE anything (approve/reject/offer price)
DROP POLICY IF EXISTS "owner_update_all_cfs" ON public.cars_for_sale;
CREATE POLICY "owner_update_all_cfs" ON public.cars_for_sale
    FOR UPDATE USING (public.is_owner());

-- Owner can DELETE submissions
DROP POLICY IF EXISTS "owner_delete_cfs" ON public.cars_for_sale;
CREATE POLICY "owner_delete_cfs" ON public.cars_for_sale
    FOR DELETE USING (public.is_owner());

-- ============================================================
-- RLS: cars_for_sale_images
-- ============================================================

-- Any approved user can view images for submissions they can see
DROP POLICY IF EXISTS "approved_select_cfs_images" ON public.cars_for_sale_images;
CREATE POLICY "approved_select_cfs_images" ON public.cars_for_sale_images
    FOR SELECT USING (public.is_approved_user());

-- Sales can INSERT images only for their own submissions
DROP POLICY IF EXISTS "sales_insert_cfs_images" ON public.cars_for_sale_images;
CREATE POLICY "sales_insert_cfs_images" ON public.cars_for_sale_images
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.cars_for_sale
            WHERE id = car_sale_id AND submitted_by = auth.uid()
        )
        AND public.is_approved_user()
    );

-- Owner can INSERT images to any submission
DROP POLICY IF EXISTS "owner_insert_cfs_images" ON public.cars_for_sale_images;
CREATE POLICY "owner_insert_cfs_images" ON public.cars_for_sale_images
    FOR INSERT WITH CHECK (public.is_owner());

-- Owner can DELETE images
DROP POLICY IF EXISTS "owner_delete_cfs_images" ON public.cars_for_sale_images;
CREATE POLICY "owner_delete_cfs_images" ON public.cars_for_sale_images
    FOR DELETE USING (public.is_owner());

-- Sales can DELETE their own submission images (pending only)
DROP POLICY IF EXISTS "sales_delete_own_cfs_images" ON public.cars_for_sale_images;
CREATE POLICY "sales_delete_own_cfs_images" ON public.cars_for_sale_images
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.cars_for_sale
            WHERE id = car_sale_id AND submitted_by = auth.uid() AND status = 'pending'
        )
    );

-- ============================================================
-- RLS: activity_logs — Insert-only for any auth; Select only owner
-- ============================================================

-- Only the owner can read logs
DROP POLICY IF EXISTS "owner_select_logs" ON public.activity_logs;
CREATE POLICY "owner_select_logs" ON public.activity_logs
    FOR SELECT USING (public.is_owner());

-- Any authenticated user can INSERT a log (via log_activity function)
-- Direct inserts are also allowed since function is SECURITY DEFINER anyway
DROP POLICY IF EXISTS "auth_insert_logs" ON public.activity_logs;
CREATE POLICY "auth_insert_logs" ON public.activity_logs
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- NO UPDATE policy — logs are immutable
-- NO DELETE policy — logs cannot be deleted

-- ============================================================
-- STORAGE: car-inspections bucket (private, owner-upload)
-- ============================================================
DO $$
BEGIN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('car-inspections', 'car-inspections', false);
EXCEPTION WHEN unique_violation THEN null;
END $$;

-- Storage bucket for Cars for Sale images (public read)
DO $$
BEGIN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('sale-submissions', 'sale-submissions', true);
EXCEPTION WHEN unique_violation THEN null;
END $$;

-- Storage policies: car-inspections (private bucket)
DROP POLICY IF EXISTS "owner_upload_inspections" ON storage.objects;
CREATE POLICY "owner_upload_inspections" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'car-inspections' AND public.is_owner());

DROP POLICY IF EXISTS "owner_update_inspections" ON storage.objects;
CREATE POLICY "owner_update_inspections" ON storage.objects
    FOR UPDATE USING (bucket_id = 'car-inspections' AND public.is_owner());

DROP POLICY IF EXISTS "owner_delete_inspections" ON storage.objects;
CREATE POLICY "owner_delete_inspections" ON storage.objects
    FOR DELETE USING (bucket_id = 'car-inspections' AND public.is_owner());

-- Approved users can view inspection files (signed URLs in app)
DROP POLICY IF EXISTS "approved_read_inspections" ON storage.objects;
CREATE POLICY "approved_read_inspections" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'car-inspections' AND public.is_approved_user()
    );

-- Storage policies: sale-submissions (public read, approved sales upload)
DROP POLICY IF EXISTS "public_read_sale_submissions" ON storage.objects;
CREATE POLICY "public_read_sale_submissions" ON storage.objects
    FOR SELECT USING (bucket_id = 'sale-submissions');

DROP POLICY IF EXISTS "approved_upload_sale_submissions" ON storage.objects;
CREATE POLICY "approved_upload_sale_submissions" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'sale-submissions' AND public.is_approved_user()
    );

DROP POLICY IF EXISTS "approved_delete_sale_submissions" ON storage.objects;
CREATE POLICY "approved_delete_sale_submissions" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'sale-submissions' AND public.is_approved_user()
    );

-- ============================================================
-- GRANTS
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cars_for_sale        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cars_for_sale_images TO authenticated;
GRANT SELECT, INSERT                 ON public.activity_logs        TO authenticated;

-- ============================================================
-- UPDATED VIEW: dashboard_stats (include sale submissions)
-- ============================================================
CREATE OR REPLACE VIEW public.dashboard_stats AS
SELECT
    (SELECT COUNT(*) FROM public.cars)                               AS total_cars,
    (SELECT COUNT(*) FROM public.cars WHERE status = 'available')    AS available_cars,
    (SELECT COUNT(*) FROM public.cars WHERE status = 'sold')         AS sold_cars,
    (SELECT COUNT(*) FROM public.wanted_cars WHERE status = 'active') AS active_wanted,
    (SELECT COUNT(*) FROM public.profiles WHERE role = 'sales')      AS total_sales_users,
    (SELECT COUNT(*) FROM public.profiles WHERE status = 'pending')  AS pending_users,
    (SELECT COUNT(*) FROM public.cars_for_sale WHERE status = 'pending') AS pending_submissions;
