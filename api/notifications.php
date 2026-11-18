<?php
/* ============================================================
   api/notifications.php
   Retrieves notifications, updates unread badges, and syncs
   missing reservation entries for logged-in customers.
   ============================================================ */

if (session_status() === PHP_SESSION_NONE) {
    session_start([
        'cookie_httponly' => true,
        'cookie_samesite' => 'Lax'
    ]);
}

require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');

function notif_reply($data, $status = 200) {
    http_response_code($status);
    echo json_encode($data);
    exit;
}

if (empty($_SESSION['user_id'])) {
    notif_reply(['ok' => false, 'error' => 'Please log in to view notifications.'], 401);
}

// Use the signed-in account details for every notification query. The browser
// cannot choose a different customer's ID or email in the request body.
$user_id    = (int)$_SESSION['user_id'];
$user_email = trim($_SESSION['user_email'] ?? '');

function sync_missing_notifications($pdo, $user_id, $user_email) {
    try {
        // Older reservation updates may not have created a notification.
        // Find those completed bookings and add only the missing entries.
        $stmt = $pdo->prepare(
            "SELECT r.reference_number, r.check_in, r.payment_status, r.admin_message, r.created_at, r.user_id, r.guest_email
               FROM reservations r
              WHERE (r.user_id = ? OR r.guest_email = ?)
                AND r.payment_status IN ('Approved', 'Rejected', 'Declined')
                AND NOT EXISTS (
                    SELECT 1 FROM notifications n 
                     WHERE n.booking_id = r.reference_number 
                        OR n.id = r.reference_number
                )"
        );
        $stmt->execute([$user_id, $user_email]);
        $unnotified = $stmt->fetchAll(PDO::FETCH_ASSOC);

        foreach ($unnotified as $res) {
            // Notifications use a generated ID and a customer-friendly message,
            // while keeping the reservation reference for later lookup.
            $norm_status = ($res['payment_status'] === 'Approved') ? 'Approved' : 'Declined';
            $visit_date  = $res['check_in'] ?? 'your visit date';
            $booking_id  = $res['reference_number'];

            $notif_id = 'NOTIF-' . strtoupper(bin2hex(random_bytes(4)));
            $msg = ($norm_status === 'Approved')
                ? "Your reservation ({$booking_id}) for {$visit_date} has been APPROVED! We look forward to welcoming you."
                : "Your reservation ({$booking_id}) for {$visit_date} has been DECLINED.";

            $ins = $pdo->prepare(
                "INSERT INTO notifications 
                    (id, user_id, email, type, booking_id, status, message, admin_message, is_read, notif_date, created_at)
                 VALUES (?, ?, ?, 'booking', ?, ?, ?, ?, 0, DATE_FORMAT(?, '%b %d, %Y'), NOW())"
            );
            $ins->execute([
                $notif_id,
                (int)($res['user_id'] ?: $user_id),
                $res['guest_email'] ?: $user_email,
                $booking_id,
                $norm_status,
                $msg,
                $res['admin_message'] ?? '',
                $res['created_at'] ?? date('Y-m-d')
            ]);
        }
    } catch (Exception $e) {
        error_log('Notification sync error: ' . $e->getMessage());
    }
}

/* ============================================================
   Sync "Write a Review" notifications after a completed stay.
   Adds one review notification per approved reservation whose
   checkout time has passed. Does nothing if the customer has
   already submitted a review (they can't write a second one).
   ============================================================ */
function sync_review_notifications($pdo, $user_id, $user_email) {
    try {
        // Auto-add the review notification columns if this is an older DB.
        try {
            $pdo->exec("ALTER TABLE notifications ADD COLUMN is_review_done TINYINT(1) NOT NULL DEFAULT 0 AFTER is_read");
        } catch (PDOException $a) { /* already exists */ }
        try {
            $pdo->exec("ALTER TABLE notifications MODIFY COLUMN type ENUM('booking','review') NOT NULL DEFAULT 'booking'");
        } catch (PDOException $a) { /* already updated */ }

        // No review notification needed if the customer already wrote one.
        $has_review = $pdo->prepare('SELECT id FROM reviews WHERE user_id = ?');
        $has_review->execute([$user_id]);
        $already_reviewed = $has_review->fetch();

        // Find all approved reservations whose checkout time has passed.
        $approved = $pdo->prepare(
            "SELECT r.reference_number, r.check_in, r.check_out, r.time_slot,
                    r.user_id, r.guest_email
               FROM reservations r
              WHERE (r.user_id = ? OR r.guest_email = ?)
                AND r.payment_status = 'Approved'"
        );
        $approved->execute([$user_id, $user_email]);

        foreach ($approved->fetchAll(PDO::FETCH_ASSOC) as $res) {
            // Parse checkout datetime from time_slot.
            $co_date   = substr($res['check_out'] ?? '', 0, 10);
            $co_hour   = 23;
            $co_minute = 59;
            if (!empty($res['time_slot'])) {
                $parts = explode('-', $res['time_slot']);
                if (count($parts) === 2) {
                    $end_ts = strtotime(trim($parts[1]));
                    if ($end_ts !== false) {
                        $co_hour   = (int)date('G', $end_ts);
                        $co_minute = (int)date('i', $end_ts);
                    }
                }
            }

            $co_ts = strtotime(
                $co_date . ' ' .
                str_pad($co_hour,   2, '0', STR_PAD_LEFT) . ':' .
                str_pad($co_minute, 2, '0', STR_PAD_LEFT) . ':00'
            );

            // Only create a review notification if checkout has actually passed.
            if (!$co_ts || time() < $co_ts) continue;

            $booking_id  = $res['reference_number'];
            $review_notif_id = 'REVNOTIF-' . $booking_id;

            // Only one review notification per reservation.
            $exists = $pdo->prepare(
                "SELECT id, is_review_done FROM notifications WHERE id = ?"
            );
            $exists->execute([$review_notif_id]);
            $existing = $exists->fetch(PDO::FETCH_ASSOC);
            if ($existing) continue; // already created

            $visit_date = $res['check_in'] ?? 'your visit';

            // If the customer has already reviewed, create it pre-done.
            $is_done = $already_reviewed ? 1 : 0;
            $msg = $is_done
                ? "Thank you for reviewing your stay on {$visit_date}!"
                : "How was your stay on {$visit_date}? We'd love to hear from you. Tap to write a review.";

            $ins = $pdo->prepare(
                "INSERT INTO notifications 
                    (id, user_id, email, type, booking_id, status, message, admin_message, is_read, is_review_done, notif_date, created_at)
                 VALUES (?, ?, ?, 'review', ?, 'Review', ?, '', 0, ?, DATE_FORMAT(NOW(), '%b %d, %Y'), NOW())"
            );
            $ins->execute([
                $review_notif_id,
                (int)($res['user_id'] ?: $user_id),
                $res['guest_email'] ?: $user_email,
                $booking_id,
                $msg,
                $is_done
            ]);
        }
    } catch (Exception $e) {
        error_log('Review notification sync error: ' . $e->getMessage());
    }
}

$raw_input = file_get_contents('php://input');
$data = json_decode($raw_input, true) ?? [];
$action = $data['action'] ?? '';

if ($action === 'my_list') {
    // Sync before reading so older completed bookings appear in the list too.
    sync_missing_notifications($pdo, $user_id, $user_email);
    sync_review_notifications($pdo, $user_id, $user_email);

    $stmt = $pdo->prepare(
        "SELECT id, booking_id, type, status, message, admin_message, is_read,
                COALESCE(is_review_done, 0) AS is_review_done, notif_date, created_at
           FROM notifications
          WHERE user_id = ? OR email = ?
       ORDER BY created_at DESC"
    );
    $stmt->execute([$user_id, $user_email]);
    $notifications = $stmt->fetchAll(PDO::FETCH_ASSOC);

    notif_reply(['ok' => true, 'notifications' => $notifications]);
}

if ($action === 'unread_count') {
    // Keep the navigation badge in step with any notifications just created.
    sync_missing_notifications($pdo, $user_id, $user_email);
    sync_review_notifications($pdo, $user_id, $user_email);

    $stmt = $pdo->prepare(
        "SELECT COUNT(*) AS cnt
           FROM notifications
          WHERE (user_id = ? OR email = ?) AND is_read = 0"
    );
    $stmt->execute([$user_id, $user_email]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    notif_reply(['ok' => true, 'count' => (int)($row['cnt'] ?? 0)]);
}

if ($action === 'mark_read') {
    // Only mark a notification belonging to this customer as read.
    $notif_id = trim($data['notifId'] ?? '');
    if ($notif_id) {
        $stmt = $pdo->prepare("UPDATE notifications SET is_read = 1 WHERE id = ? AND (user_id = ? OR email = ?)");
        $stmt->execute([$notif_id, $user_id, $user_email]);
    }
    notif_reply(['ok' => true]);
}

if ($action === 'mark_review_done') {
    // Called after a customer submits a review — makes the review notification non-clickable.
    $stmt = $pdo->prepare(
        "UPDATE notifications 
            SET is_review_done = 1, 
                message = CONCAT('Thank you for reviewing your stay! ', SUBSTRING_INDEX(message, '?', 1)),
                is_read = 1
          WHERE type = 'review' AND (user_id = ? OR email = ?) AND is_review_done = 0"
    );
    $stmt->execute([$user_id, $user_email]);
    notif_reply(['ok' => true]);
}

notif_reply(['ok' => false, 'error' => 'Unknown action.'], 400);