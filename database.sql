-- ============================================================
-- SALES AGANCEONLINE - Complete Database Schema
-- Run this in your Supabase SQL Editor
-- ============================================================

-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- ENUMS
-- ============================================================
DO $$ BEGIN CREATE TYPE user_role AS ENUM ('owner', 'sales'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE user_status AS ENUM ('pending', 'approved', 'rejected', 'suspended'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE car_status AS ENUM ('available', 'reserved', 'sold', 'unavailable'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE car_condition AS ENUM ('new', 'used', 'certified'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE transmission_type AS ENUM ('automatic', 'manual', 'cvt', 'dct'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE fuel_type AS ENUM ('petrol', 'diesel', 'electric', 'hybrid', 'plug-in hybrid', 'lpg'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE wanted_status AS ENUM ('active', 'found', 'closed'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE priority_level AS ENUM ('low', 'medium', 'high', 'urgent'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================
-- TABLE: profiles
-- Extends auth.users - one row per authenticated user
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name   TEXT NOT NULL,
    email       TEXT NOT NULL,
    phone       TEXT,
    role        user_role NOT NULL DEFAULT 'sales',
    status      user_status NOT NULL DEFAULT 'pending',
    avatar_url  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login  TIMESTAMPTZ
);

-- ============================================================
-- TABLE: cars
-- Main inventory of cars owned/managed by the company
-- ============================================================
CREATE TABLE IF NOT EXISTS public.cars (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    brand           TEXT NOT NULL,
    model           TEXT NOT NULL,
    year            INTEGER NOT NULL CHECK (year >= 1900 AND year <= 2100),
    trim            TEXT,
    color           TEXT,
    mileage         INTEGER DEFAULT 0 CHECK (mileage >= 0),
    transmission    transmission_type,
    fuel_type       fuel_type,
    engine          TEXT,
    horsepower      INTEGER CHECK (horsepower >= 0),
    body_type       TEXT,
    price           NUMERIC(15, 2) NOT NULL DEFAULT 0,
    currency        TEXT NOT NULL DEFAULT 'USD',
    condition       car_condition NOT NULL DEFAULT 'used',
    location        TEXT,
    status          car_status NOT NULL DEFAULT 'available',
    description     TEXT,
    vin             TEXT UNIQUE,
    is_featured     BOOLEAN DEFAULT FALSE,
    added_by        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: car_images
-- Multiple images per car
-- ============================================================
CREATE TABLE IF NOT EXISTS public.car_images (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    car_id      UUID NOT NULL REFERENCES public.cars(id) ON DELETE CASCADE,
    url         TEXT NOT NULL,
    is_primary  BOOLEAN DEFAULT FALSE,
    sort_order  INTEGER DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: wanted_cars
-- Cars the company/owner is looking to acquire
-- ============================================================
CREATE TABLE IF NOT EXISTS public.wanted_cars (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    brand           TEXT NOT NULL,
    model           TEXT NOT NULL,
    min_year        INTEGER CHECK (min_year >= 1900),
    max_year        INTEGER CHECK (max_year <= 2100),
    min_budget      NUMERIC(15, 2),
    max_budget      NUMERIC(15, 2),
    preferred_color TEXT,
    max_mileage     INTEGER,
    transmission    transmission_type,
    fuel_type       fuel_type,
    location        TEXT,
    quantity        INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1),
    priority        priority_level NOT NULL DEFAULT 'medium',
    description     TEXT,
    status          wanted_status NOT NULL DEFAULT 'active',
    created_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_profiles_role       ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_status     ON public.profiles(status);
CREATE INDEX IF NOT EXISTS idx_cars_brand          ON public.cars(brand);
CREATE INDEX IF NOT EXISTS idx_cars_model          ON public.cars(model);
CREATE INDEX IF NOT EXISTS idx_cars_status         ON public.cars(status);
CREATE INDEX IF NOT EXISTS idx_cars_year           ON public.cars(year);
CREATE INDEX IF NOT EXISTS idx_cars_price          ON public.cars(price);
CREATE INDEX IF NOT EXISTS idx_car_images_car_id   ON public.car_images(car_id);
CREATE INDEX IF NOT EXISTS idx_wanted_cars_status  ON public.wanted_cars(status);
CREATE INDEX IF NOT EXISTS idx_wanted_cars_brand   ON public.wanted_cars(brand);
CREATE INDEX IF NOT EXISTS idx_wanted_cars_priority ON public.wanted_cars(priority);

-- ============================================================
-- TRIGGER: auto-update updated_at timestamp
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_profiles_updated_at ON public.profiles;
CREATE TRIGGER trigger_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trigger_cars_updated_at ON public.cars;
CREATE TRIGGER trigger_cars_updated_at
    BEFORE UPDATE ON public.cars
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trigger_wanted_cars_updated_at ON public.wanted_cars;
CREATE TRIGGER trigger_wanted_cars_updated_at
    BEFORE UPDATE ON public.wanted_cars
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- TRIGGER: auto-create profile on new auth user registration
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, email, phone, role, status)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
        NEW.email,
        NEW.raw_user_meta_data->>'phone',
        'sales',
        'pending'
    );
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trigger_on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- FUNCTION: get_user_profile (security definer - bypasses RLS for self)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS public.profiles LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    profile public.profiles;
BEGIN
    SELECT * INTO profile FROM public.profiles WHERE id = auth.uid();
    RETURN profile;
END;
$$;

-- ============================================================
-- FUNCTION: is_owner - check if current user is owner
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'owner'
    );
END;
$$;

-- ============================================================
-- FUNCTION: is_approved_user - check if current user is approved
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_approved_user()
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND status = 'approved'
    );
END;
$$;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cars        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.car_images  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wanted_cars ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS: profiles
-- ============================================================

-- Owners can read all profiles
DROP POLICY IF EXISTS "owners_select_all_profiles" ON public.profiles;
CREATE POLICY "owners_select_all_profiles" ON public.profiles
    FOR SELECT USING (public.is_owner());

-- Users can read their own profile
DROP POLICY IF EXISTS "users_select_own_profile" ON public.profiles;
CREATE POLICY "users_select_own_profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

-- Owners can update any profile (approve, change role, etc.)
DROP POLICY IF EXISTS "owners_update_all_profiles" ON public.profiles;
CREATE POLICY "owners_update_all_profiles" ON public.profiles
    FOR UPDATE USING (public.is_owner());

-- Users can update their own profile (limited fields enforced in app)
DROP POLICY IF EXISTS "users_update_own_profile" ON public.profiles;
CREATE POLICY "users_update_own_profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- Users can insert their own profile
DROP POLICY IF EXISTS "users_insert_own_profile" ON public.profiles;
CREATE POLICY "users_insert_own_profile" ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- Owners can delete profiles
DROP POLICY IF EXISTS "owners_delete_profiles" ON public.profiles;
CREATE POLICY "owners_delete_profiles" ON public.profiles
    FOR DELETE USING (public.is_owner());

-- ============================================================
-- RLS: cars
-- ============================================================

-- Approved users (any role) can view cars
DROP POLICY IF EXISTS "approved_users_select_cars" ON public.cars;
CREATE POLICY "approved_users_select_cars" ON public.cars
    FOR SELECT USING (public.is_approved_user());

-- Only owners can insert cars
DROP POLICY IF EXISTS "owners_insert_cars" ON public.cars;
CREATE POLICY "owners_insert_cars" ON public.cars
    FOR INSERT WITH CHECK (public.is_owner());

-- Only owners can update cars
DROP POLICY IF EXISTS "owners_update_cars" ON public.cars;
CREATE POLICY "owners_update_cars" ON public.cars
    FOR UPDATE USING (public.is_owner());

-- Only owners can delete cars
DROP POLICY IF EXISTS "owners_delete_cars" ON public.cars;
CREATE POLICY "owners_delete_cars" ON public.cars
    FOR DELETE USING (public.is_owner());

-- ============================================================
-- RLS: car_images
-- ============================================================

-- Approved users can view car images
DROP POLICY IF EXISTS "approved_users_select_car_images" ON public.car_images;
CREATE POLICY "approved_users_select_car_images" ON public.car_images
    FOR SELECT USING (public.is_approved_user());

-- Only owners can insert car images
DROP POLICY IF EXISTS "owners_insert_car_images" ON public.car_images;
CREATE POLICY "owners_insert_car_images" ON public.car_images
    FOR INSERT WITH CHECK (public.is_owner());

-- Only owners can update car images
DROP POLICY IF EXISTS "owners_update_car_images" ON public.car_images;
CREATE POLICY "owners_update_car_images" ON public.car_images
    FOR UPDATE USING (public.is_owner());

-- Only owners can delete car images
DROP POLICY IF EXISTS "owners_delete_car_images" ON public.car_images;
CREATE POLICY "owners_delete_car_images" ON public.car_images
    FOR DELETE USING (public.is_owner());

-- ============================================================
-- RLS: wanted_cars
-- ============================================================

-- Approved users can view wanted cars
DROP POLICY IF EXISTS "approved_users_select_wanted" ON public.wanted_cars;
CREATE POLICY "approved_users_select_wanted" ON public.wanted_cars
    FOR SELECT USING (public.is_approved_user());

-- Only owners can insert wanted cars
DROP POLICY IF EXISTS "owners_insert_wanted" ON public.wanted_cars;
CREATE POLICY "owners_insert_wanted" ON public.wanted_cars
    FOR INSERT WITH CHECK (public.is_owner());

-- Only owners can update wanted cars
DROP POLICY IF EXISTS "owners_update_wanted" ON public.wanted_cars;
CREATE POLICY "owners_update_wanted" ON public.wanted_cars
    FOR UPDATE USING (public.is_owner());

-- Only owners can delete wanted cars
DROP POLICY IF EXISTS "owners_delete_wanted" ON public.wanted_cars;
CREATE POLICY "owners_delete_wanted" ON public.wanted_cars
    FOR DELETE USING (public.is_owner());

-- ============================================================
-- STORAGE BUCKETS (Run directly to create buckets and policies)
-- ============================================================
DO $$ 
BEGIN
    INSERT INTO storage.buckets (id, name, public) VALUES ('car-images', 'car-images', true);
EXCEPTION WHEN unique_violation THEN null; END $$;

DO $$ 
BEGIN
    INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);
EXCEPTION WHEN unique_violation THEN null; END $$;

-- Storage policies for car-images bucket
DROP POLICY IF EXISTS "public_read_car_images" ON storage.objects;
CREATE POLICY "public_read_car_images" ON storage.objects FOR SELECT USING (bucket_id = 'car-images');

DROP POLICY IF EXISTS "owner_upload_car_images" ON storage.objects;
CREATE POLICY "owner_upload_car_images" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'car-images' AND public.is_owner());

DROP POLICY IF EXISTS "owner_delete_car_images" ON storage.objects;
CREATE POLICY "owner_delete_car_images" ON storage.objects FOR DELETE USING (bucket_id = 'car-images' AND public.is_owner());

-- ============================================================
-- SEED: Create first Owner account
-- INSTRUCTIONS:
--   1. Register normally via the app (or Supabase dashboard).
--   2. Then run this SQL replacing the email with your owner email:
--
-- UPDATE public.profiles
--   SET role = 'owner', status = 'approved'
--   WHERE email = 'your-owner-email@example.com';
-- ============================================================

-- ============================================================
-- VIEWS: dashboard statistics (owner)
-- ============================================================
CREATE OR REPLACE VIEW public.dashboard_stats AS
SELECT
    (SELECT COUNT(*) FROM public.cars)                          AS total_cars,
    (SELECT COUNT(*) FROM public.cars WHERE status = 'available') AS available_cars,
    (SELECT COUNT(*) FROM public.cars WHERE status = 'sold')    AS sold_cars,
    (SELECT COUNT(*) FROM public.wanted_cars WHERE status = 'active') AS active_wanted,
    (SELECT COUNT(*) FROM public.profiles WHERE role = 'sales') AS total_sales_users,
    (SELECT COUNT(*) FROM public.profiles WHERE status = 'pending') AS pending_users;

-- Grant access to the view for authenticated users
GRANT SELECT ON public.dashboard_stats TO authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cars TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.car_images TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wanted_cars TO authenticated;
