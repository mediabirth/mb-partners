-- Fold existing cooperation menus → service-level coop columns
-- Takes the first coop menu (by sort) per service.
-- Uses COALESCE to avoid overwriting values already set at service level.

UPDATE services s
SET
  coop_enabled   = true,
  coop_rate      = CASE WHEN sm.ref_type = 'rate' THEN sm.ref_value ELSE coop_rate END,
  coop_base      = COALESCE(s.coop_base,      sm.ref_base),
  ft_trigger     = COALESCE(s.ft_trigger,     sm.ref_trigger),
  ft_condition   = COALESCE(s.ft_condition,   sm.qualification),
  coverage_steps = COALESCE(s.coverage_steps, sm.coverage_steps)
FROM (
  SELECT DISTINCT ON (service_id)
    service_id, ref_type, ref_value, ref_base, ref_trigger, qualification, coverage_steps
  FROM service_menus
  WHERE category = 'cooperation'
  ORDER BY service_id, sort
) sm
WHERE s.id = sm.service_id;
