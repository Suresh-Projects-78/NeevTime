-- Schema additions for the greytHR integration + safe multi-device biometric sync.
-- Idempotent: safe to run repeatedly.

-- Map a device's user PIN to the app employee_code when they differ.
-- eSSL/ZKTeco devices drop leading zeros (device "50" vs employee "050") and
-- some staff were enrolled under ad-hoc IDs; adms.js normalizePin() applies
-- these aliases on every ingest path.
CREATE TABLE IF NOT EXISTS device_pin_map (
    device_pin    VARCHAR(50) PRIMARY KEY,
    employee_code VARCHAR(50) NOT NULL,
    created_at    TIMESTAMP DEFAULT NOW()
);

-- Cross-device mirror commands are marked trusted=true; the ADMS getrequest
-- choke point dispatches DATA UPDATE/DELETE to a device only when trusted, so
-- bulk app-code pushes can never overwrite the users physically enrolled.
ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS trusted BOOLEAN DEFAULT FALSE;

-- Door-only / non-HRMS staff (e.g. a gate guard) must never be pushed to an
-- external HRMS, and soft-deleted employees must be skipped.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS exclude_from_hrms   BOOLEAN DEFAULT FALSE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS attendance_required BOOLEAN DEFAULT TRUE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS deleted_at          TIMESTAMP;
