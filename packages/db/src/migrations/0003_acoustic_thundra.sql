-- Deduplicate any pre-existing (module, action) permission rows before
-- enforcing uniqueness, repointing role_permission references to the
-- surviving (oldest) row first. A no-op when there are no duplicates.
WITH ranked AS (
  SELECT id, module, action,
         row_number() OVER (PARTITION BY module, action ORDER BY created_at ASC, id ASC) AS rn
  FROM "permission"
),
keepers AS (
  SELECT p_dup.id AS dup_id, p_keep.id AS keep_id
  FROM ranked p_dup
  JOIN ranked p_keep ON p_keep.module = p_dup.module AND p_keep.action = p_dup.action AND p_keep.rn = 1
  WHERE p_dup.rn > 1
)
UPDATE "role_permission" rp
SET permission_id = keepers.keep_id
FROM keepers
WHERE rp.permission_id = keepers.dup_id
  -- don't create a duplicate (role_id, permission_id) primary key row
  AND NOT EXISTS (
    SELECT 1 FROM "role_permission" rp2
    WHERE rp2.role_id = rp.role_id AND rp2.permission_id = keepers.keep_id
  );
--> statement-breakpoint
DELETE FROM "role_permission"
WHERE permission_id IN (
  SELECT id FROM (
    SELECT id, row_number() OVER (PARTITION BY module, action ORDER BY created_at ASC, id ASC) AS rn
    FROM "permission"
  ) ranked
  WHERE ranked.rn > 1
);
--> statement-breakpoint
DELETE FROM "permission"
WHERE id IN (
  SELECT id FROM (
    SELECT id, row_number() OVER (PARTITION BY module, action ORDER BY created_at ASC, id ASC) AS rn
    FROM "permission"
  ) ranked
  WHERE ranked.rn > 1
);
--> statement-breakpoint
ALTER TABLE "permission" ADD CONSTRAINT "permission_module_action_unique" UNIQUE("module","action");
