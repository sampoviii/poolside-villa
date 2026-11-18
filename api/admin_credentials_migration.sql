-- Updates existing installations to use the single customer-login admin account.
START TRANSACTION;

-- Add or update the administrator account before moving its related records.
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

SET @poolside_admin_id = (
    SELECT id FROM users WHERE email = 'poolsidevillaadmin@gmail.com' LIMIT 1
);

-- Reassign records from the old admin account so they remain linked to the
-- current account before the old account is removed.
UPDATE reservations
SET user_id = @poolside_admin_id
WHERE user_id IN (
    SELECT id FROM users
    WHERE email = 'admin@adminmodule.com' AND id <> @poolside_admin_id
);

UPDATE reviews
SET user_id = @poolside_admin_id
WHERE user_id IN (
    SELECT id FROM users
    WHERE email = 'admin@adminmodule.com' AND id <> @poolside_admin_id
);

UPDATE notifications
SET user_id = @poolside_admin_id, email = 'poolsidevillaadmin@gmail.com'
WHERE user_id IN (
    SELECT id FROM users
    WHERE email = 'admin@adminmodule.com' AND id <> @poolside_admin_id
);

-- Remove the retired account after its related records have been reassigned.
DELETE FROM users
WHERE email = 'admin@adminmodule.com' AND id <> @poolside_admin_id;

-- Only the single designated account should keep the administrator role.
UPDATE users
SET role = 'customer'
WHERE id <> @poolside_admin_id AND role = 'admin';

COMMIT;
