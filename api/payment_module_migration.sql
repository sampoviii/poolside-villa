-- Run once on existing databases before deploying the payment API changes.
-- Add the payment and reservation details needed by the current booking flow.
ALTER TABLE reservations
    MODIFY proof_of_payment LONGTEXT DEFAULT NULL,
    ADD COLUMN package_name VARCHAR(150) NOT NULL DEFAULT 'Package',
    ADD COLUMN rate_type VARCHAR(50) NOT NULL DEFAULT 'Weekday',
    ADD COLUMN pax_range VARCHAR(20) NOT NULL DEFAULT '1-10',
    ADD COLUMN lpg_addon VARCHAR(100) NOT NULL DEFAULT 'No',
    ADD COLUMN receipt_sha256 CHAR(64) NULL,
    ADD COLUMN admin_message TEXT DEFAULT NULL,
    ADD COLUMN confirmation_email_sent_at DATETIME DEFAULT NULL;

-- Create a unique receipt hash for existing base64 payment images, so the
-- same uploaded proof cannot be attached to multiple reservations.
UPDATE reservations AS r
JOIN (
    SELECT MIN(id) AS reservation_id,
           SHA2(FROM_BASE64(SUBSTRING_INDEX(proof_of_payment, ',', -1)), 256) AS receipt_hash
    FROM reservations
    WHERE proof_of_payment LIKE 'data:image/%;base64,%'
    GROUP BY receipt_hash
) AS old_receipts ON old_receipts.reservation_id = r.id
SET r.receipt_sha256 = old_receipts.receipt_hash;

-- Enforce unique payment-proof hashes and reservation references.
ALTER TABLE reservations
    ADD UNIQUE KEY receipt_sha256 (receipt_sha256),
    ADD UNIQUE KEY reference_number (reference_number);