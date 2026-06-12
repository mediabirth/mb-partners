-- Fix: explicitly grant EXECUTE on close_month_batch to service_role only
-- (REVOKE from PUBLIC in previous migration was too broad)
GRANT EXECUTE ON FUNCTION public.close_month_batch(text) TO service_role;
