CREATE DATABASE IF NOT EXISTS poolside_villa
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;
USE poolside_villa;

CREATE TABLE IF NOT EXISTS users (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL,
    phone VARCHAR(30) NOT NULL,
    password VARCHAR(255) NOT NULL,
    role ENUM('admin', 'administrator', 'caretaker', 'customer') NOT NULL DEFAULT 'customer',
    reset_code VARCHAR(10) DEFAULT NULL,
    reset_expires DATETIME DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY users_email_unique (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Keep a record of important actions taken by signed-in staff and customers.
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

-- Save each resort booking, its payment details, and its current review status.
CREATE TABLE IF NOT EXISTS reservations (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id INT UNSIGNED DEFAULT NULL,
    guest_name VARCHAR(150) NOT NULL,
    guest_email VARCHAR(150) NOT NULL,
    guest_phone VARCHAR(30) NOT NULL,
    check_in DATE NOT NULL,
    check_out DATE NOT NULL,
    time_slot VARCHAR(50) NOT NULL,
    guests_count INT UNSIGNED NOT NULL DEFAULT 1,
    package_name VARCHAR(150) NOT NULL,
    rate_type VARCHAR(50) NOT NULL,
    pax_range VARCHAR(20) NOT NULL,
    lpg_addon VARCHAR(100) NOT NULL DEFAULT 'No',
    total_price DECIMAL(10,2) NOT NULL,
    downpayment_amount DECIMAL(10,2) NOT NULL,
    balance_amount DECIMAL(10,2) NOT NULL,
    payment_status ENUM('Pending Verification', 'Approved', 'Rejected', 'Cancelled')
        NOT NULL DEFAULT 'Pending Verification',
    proof_of_payment LONGTEXT DEFAULT NULL,
    receipt_sha256 CHAR(64) DEFAULT NULL,
    reference_number VARCHAR(100) DEFAULT NULL,
    admin_message TEXT DEFAULT NULL,
    confirmation_email_sent_at DATETIME DEFAULT NULL,
    review_email_sent_at DATETIME DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY reservations_reference_unique (reference_number),
    UNIQUE KEY reservations_receipt_unique (receipt_sha256),
    KEY reservations_user_id_idx (user_id),
    KEY reservations_status_date_idx (payment_status, check_in),
    CONSTRAINT reservations_user_fk FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Link a customer's review to their account and reservation reference.
CREATE TABLE IF NOT EXISTS reviews (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id INT UNSIGNED DEFAULT NULL,
    email VARCHAR(150) NOT NULL,
    booking_id VARCHAR(100) NOT NULL,
    name VARCHAR(100) NOT NULL,
    stay VARCHAR(100) NOT NULL,
    rating TINYINT UNSIGNED NOT NULL DEFAULT 5,
    review_text TEXT NOT NULL,
    review_date VARCHAR(50) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY reviews_booking_unique (booking_id),
    KEY reviews_email_idx (email),
    KEY reviews_user_id_idx (user_id),
    CONSTRAINT reviews_user_fk FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Store booking updates customers can read from their account.
CREATE TABLE IF NOT EXISTS notifications (
    id VARCHAR(150) NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    email VARCHAR(150) NOT NULL,
    type ENUM('booking') NOT NULL DEFAULT 'booking',
    booking_id VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'Pending Verification',
    message TEXT NOT NULL,
    admin_message TEXT DEFAULT NULL,
    is_read TINYINT(1) NOT NULL DEFAULT 0,
    notif_date VARCHAR(50) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY notifications_user_date_idx (user_id, created_at),
    KEY notifications_email_read_idx (email, is_read),
    CONSTRAINT notifications_user_fk FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Store site-wide settings such as the resort's GCash number and QR image.
CREATE TABLE IF NOT EXISTS settings (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    setting_key VARCHAR(100) NOT NULL,
    setting_value LONGTEXT DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY settings_key_unique (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Temporary date-locking table for race-condition prevention (15-min holds)
-- Hold chosen dates briefly while a customer completes the booking form.
CREATE TABLE IF NOT EXISTS date_locks (
    id              INT UNSIGNED      NOT NULL AUTO_INCREMENT,
    session_id      VARCHAR(128)      NOT NULL,
    user_id         INT UNSIGNED      DEFAULT NULL,
    check_in        DATE              NOT NULL,
    checkin_hour    TINYINT UNSIGNED  NOT NULL DEFAULT 0,
    checkin_minute  TINYINT UNSIGNED  NOT NULL DEFAULT 0,
    checkout_date   DATE              NOT NULL,
    checkout_hour   TINYINT UNSIGNED  NOT NULL DEFAULT 0,
    checkout_minute TINYINT UNSIGNED  NOT NULL DEFAULT 0,
    locked_until    DATETIME          NOT NULL,
    created_at      TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY date_locks_checkin_idx  (check_in),
    KEY date_locks_expires_idx  (locked_until),
    KEY date_locks_session_idx  (session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add the default administrator account used by the local installation.
INSERT INTO users (first_name, last_name, email, phone, password, role)
VALUES (
    'Poolside Villa',
    'Administrator',
    'poolsidevillaadmin@gmail.com',
    '',
    '$2y$12$P2qJLiwhXthoqlHYg8ulLOGjoHipqe.btP/tQmOG8xCVED8IqFWjG',
    'admin'
)
ON DUPLICATE KEY UPDATE
    first_name = VALUES(first_name),
    last_name = VALUES(last_name),
    password = VALUES(password),
    role = VALUES(role);

-- Keep any other legacy admin-role accounts as regular customers.
UPDATE users
SET role = 'customer'
WHERE email <> 'poolsidevillaadmin@gmail.com' AND role = 'admin';

-- Add empty payment settings when a database is first created.
INSERT INTO settings (setting_key, setting_value)
VALUES ('gcash_number', ''), ('gcash_qr', '')
ON DUPLICATE KEY UPDATE setting_key = VALUES(setting_key);
