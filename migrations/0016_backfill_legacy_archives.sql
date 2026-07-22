PRAGMA foreign_keys = ON;

-- Before archived_at existed, the legacy archive endpoint only set active and
-- public_visible to zero. Repair only records with an immutable audit event
-- proving that an administrator actually archived the student.
UPDATE students
SET archived_at = COALESCE(
      (
        SELECT a.created_at
        FROM audit_log a
        WHERE (a.student_id = students.id OR a.record_id = students.id)
          AND a.action IN ('profile_deactivated', 'student_archived')
        ORDER BY a.created_at DESC
        LIMIT 1
      ),
      updated_at
    ),
    archived_by = COALESCE(
      NULLIF(archived_by, ''),
      (
        SELECT COALESCE(NULLIF(a.actor_identifier, ''), NULLIF(a.administrator_name, ''), 'legacy_migration')
        FROM audit_log a
        WHERE (a.student_id = students.id OR a.record_id = students.id)
          AND a.action IN ('profile_deactivated', 'student_archived')
        ORDER BY a.created_at DESC
        LIMIT 1
      ),
      'legacy_migration'
    )
WHERE active = 0
  AND public_visible = 0
  AND profile_status = 'approved'
  AND archived_at IS NULL
  AND deleted_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM audit_log a
    WHERE (a.student_id = students.id OR a.record_id = students.id)
      AND a.action IN ('profile_deactivated', 'student_archived')
  );
