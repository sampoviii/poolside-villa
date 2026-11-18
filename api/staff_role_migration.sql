-- Run once on an existing Poolside Villa database to allow staff accounts
-- to use the same users table as authentication and User Management.
USE poolside_villa;

-- Allow admin, caretaker, and customer roles in the shared account table.
ALTER TABLE users
    MODIFY role ENUM('admin', 'administrator', 'caretaker', 'customer')
    NOT NULL DEFAULT 'customer';
