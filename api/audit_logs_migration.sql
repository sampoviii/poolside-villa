-- Run once on an existing Poolside Villa database to enable audit logging.
USE poolside_villa;

-- Store the actor, action, details, and time for each audit event.
CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_name VARCHAR(200) NOT NULL,
    user_email VARCHAR(150) NOT NULL,
    role VARCHAR(30) NOT NULL,
    action_type VARCHAR(100) NOT NULL,
    details TEXT NOT NULL,
    user_agent TEXT DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY audit_logs_created_at_idx (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
