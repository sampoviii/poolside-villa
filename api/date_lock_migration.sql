-- ============================================================
--  date_lock_migration.sql
--  Adds the date_locks table required for the 15-minute
--  temporary hold / race-condition prevention feature.
--
--  Run this once against the poolside_villa database:
--    source /path/to/date_lock_migration.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS date_locks (
    id            INT UNSIGNED     NOT NULL AUTO_INCREMENT,
    session_id    VARCHAR(128)     NOT NULL,          -- PHP session ID of the customer holding the date
    user_id       INT UNSIGNED     DEFAULT NULL,      -- FK to users.id (nullable — belt & suspenders)
    check_in      DATE             NOT NULL,          -- same date stored in reservations.check_in
    checkin_hour  TINYINT UNSIGNED NOT NULL DEFAULT 0,
    checkin_minute TINYINT UNSIGNED NOT NULL DEFAULT 0,
    checkout_date DATE             NOT NULL,
    checkout_hour TINYINT UNSIGNED NOT NULL DEFAULT 0,
    checkout_minute TINYINT UNSIGNED NOT NULL DEFAULT 0,
    locked_until  DATETIME         NOT NULL,          -- NOW() + 15 minutes at insert time
    created_at    TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY date_locks_checkin_idx  (check_in),
    KEY date_locks_expires_idx  (locked_until),
    KEY date_locks_session_idx  (session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Optional: MySQL event to auto-purge expired locks every minute.
-- Only works if the event scheduler is ON (SET GLOBAL event_scheduler = ON).
-- If your host doesn't allow events, the PHP code handles expiry on every request.
-- DROP EVENT IF EXISTS purge_expired_date_locks;
-- CREATE EVENT IF NOT EXISTS purge_expired_date_locks
--   ON SCHEDULE EVERY 1 MINUTE
--   DO DELETE FROM date_locks WHERE locked_until < NOW();
