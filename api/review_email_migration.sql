-- Run once on existing installations to move review prompts from in-app
-- notifications to email.
-- Remove old in-app review prompts before limiting notifications to bookings.
DELETE FROM notifications WHERE type = 'review_request';

ALTER TABLE notifications
    MODIFY type ENUM('booking') NOT NULL DEFAULT 'booking';

-- Track whether a review reminder email has already been sent for a booking.
ALTER TABLE reservations
    ADD COLUMN review_email_sent_at DATETIME DEFAULT NULL;
