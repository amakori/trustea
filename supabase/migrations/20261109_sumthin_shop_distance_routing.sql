ALTER TABLE public.creator_orders
    ADD COLUMN IF NOT EXISTS delivery_route_mode TEXT
        CHECK (delivery_route_mode IS NULL OR delivery_route_mode IN ('local_shipday', 'intercity_fleetbase')),
    ADD COLUMN IF NOT EXISTS delivery_distance_km DOUBLE PRECISION
        CHECK (delivery_distance_km IS NULL OR delivery_distance_km >= 0);

CREATE OR REPLACE FUNCTION public.guard_creator_order_route_metadata()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF auth.role() = 'service_role' OR public.is_sumthin_mfi_operator() THEN
        RETURN NEW;
    END IF;
    IF NEW.delivery_route_mode IS DISTINCT FROM OLD.delivery_route_mode
       OR NEW.delivery_distance_km IS DISTINCT FROM OLD.delivery_distance_km THEN
        RAISE EXCEPTION 'Only the fulfilment service may update shop delivery routing details.';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_creator_order_route_metadata ON public.creator_orders;
CREATE TRIGGER guard_creator_order_route_metadata
    BEFORE UPDATE ON public.creator_orders
    FOR EACH ROW EXECUTE FUNCTION public.guard_creator_order_route_metadata();
REVOKE ALL ON FUNCTION public.guard_creator_order_route_metadata() FROM PUBLIC, anon, authenticated;
