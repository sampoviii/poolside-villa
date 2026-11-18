<?php
require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');

/* Parse checkout datetime from check_out DATE + time_slot string.
   time_slot format: "12:00 PM - 10:00 AM"
   Falls back to check_out at 23:59 if parsing fails (treats the full day as past). */
function checkout_timestamp($check_out_date, $time_slot) {
    $co_date = substr($check_out_date ?? '', 0, 10);
    $co_hour = 23; $co_min = 59; // safe default — full day treated as over

    if (!empty($time_slot)) {
        $parts = explode('-', $time_slot);
        if (count($parts) === 2) {
            $end_ts = strtotime(trim($parts[1]));
            if ($end_ts !== false) {
                $co_hour = (int)date('G', $end_ts);
                $co_min  = (int)date('i', $end_ts);
            }
        }
    }

    return strtotime(
        $co_date . ' ' .
        str_pad($co_hour, 2, '0', STR_PAD_LEFT) . ':' .
        str_pad($co_min,  2, '0', STR_PAD_LEFT) . ':00'
    );
}

// Send one JSON response and stop, so every action returns the same format.
function reviews_reply($data, $status = 200) {
    http_response_code($status);
    echo json_encode($data);
    exit;
}

$data = json_decode(file_get_contents('php://input'), true) ?? [];
$action = $data['action'] ?? '';

if ($action === 'all_list') {
    // Public resort pages can show recent reviews without a customer session.
    $statement = $pdo->query(
        'SELECT id, name, stay, rating, review_text, review_date
         FROM reviews ORDER BY created_at DESC LIMIT 50'
    );
    reviews_reply(['ok' => true, 'reviews' => $statement->fetchAll(PDO::FETCH_ASSOC)]);
}

if ($action === 'admin_list') {
    if (empty($_SESSION['user_id'])) {
        reviews_reply(['ok' => false, 'error' => 'Please log in first.'], 401);
    }
    $role = strtolower(trim($_SESSION['role'] ?? ''));
    if ($role !== 'admin' && $role !== 'administrator') {
        reviews_reply(['ok' => false, 'error' => 'Administrator access required.'], 403);
    }

    $statement = $pdo->query(
        'SELECT id, user_id, email, booking_id, name, stay, rating, review_text, review_date, created_at
         FROM reviews ORDER BY created_at DESC LIMIT 50'
    );
    reviews_reply(['ok' => true, 'reviews' => $statement->fetchAll(PDO::FETCH_ASSOC)]);
}

if (empty($_SESSION['user_id'])) {
    reviews_reply(['ok' => false, 'error' => 'Please log in first.'], 401);
}

// The session identifies the customer for all private review actions.
$user_id = (int)$_SESSION['user_id'];
$email = $_SESSION['user_email'] ?? '';

/* ---- Check if the customer can write a review ---- */
if ($action === 'can_review') {
    /* Already has a review? */
    $existing = $pdo->prepare('SELECT id FROM reviews WHERE user_id = ?');
    $existing->execute([$user_id]);
    if ($existing->fetch()) {
        reviews_reply(['ok' => true, 'canReview' => false, 'reason' => 'already_reviewed']);
    }

    /* Has a completed stay? Parse checkout time from time_slot. */
    $approved = $pdo->prepare(
        "SELECT check_out, time_slot
           FROM reservations
          WHERE user_id = ? AND payment_status = 'Approved'
          ORDER BY check_out ASC"
    );
    $approved->execute([$user_id]);
    foreach ($approved->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $co_ts = checkout_timestamp($row['check_out'], $row['time_slot'] ?? '');
        if (time() >= $co_ts) {
            reviews_reply(['ok' => true, 'canReview' => true]);
        }
    }
    reviews_reply(['ok' => true, 'canReview' => false, 'reason' => 'no_completed_stay']);
}

if ($action === 'my_list') {
    $statement = $pdo->prepare(
        'SELECT id, user_id, email, booking_id, name, stay, rating, review_text, review_date, created_at
         FROM reviews WHERE user_id = ? ORDER BY created_at DESC'
    );
    $statement->execute([$user_id]);
    reviews_reply(['ok' => true, 'reviews' => $statement->fetchAll(PDO::FETCH_ASSOC)]);
}

if ($action === 'create') {
    // A customer can submit one review only after an approved stay has ended.
    $booking_id = trim($data['bookingId'] ?? '');
    $name = trim($data['name'] ?? '');
    $stay = trim($data['stay'] ?? '');
    $review_text = trim($data['text'] ?? '');
    $rating = (int)($data['rating'] ?? 5);
    $review_date = trim($data['date'] ?? date('M Y'));

    if ($name === '' || $stay === '' || $review_text === '') {
        reviews_reply(['ok' => false, 'error' => 'Please fill in all fields.'], 400);
    }
    if ($rating < 1 || $rating > 5) {
        reviews_reply(['ok' => false, 'error' => 'Rating must be between 1 and 5.'], 400);
    }

    /* Customer can only write 1 review total */
    $existing = $pdo->prepare('SELECT id FROM reviews WHERE user_id = ?');
    $existing->execute([$user_id]);
    if ($existing->fetch()) {
        reviews_reply(['ok' => false, 'error' => 'You have already submitted a review. You can edit or delete your existing one.'], 409);
    }

    /* Must have at least one approved booking whose checkout has passed */
    $approved = $pdo->prepare(
        "SELECT r.reference_number, r.check_out, r.time_slot
           FROM reservations r
          WHERE r.user_id = ? AND r.payment_status = 'Approved'
          ORDER BY r.check_out ASC"
    );
    $approved->execute([$user_id]);
    $approved_rows = $approved->fetchAll(PDO::FETCH_ASSOC);

    $has_completed = false;
    foreach ($approved_rows as $row) {
        $co_ts = checkout_timestamp($row['check_out'], $row['time_slot'] ?? '');
        if (time() >= $co_ts) {
            $has_completed = true;
            $booking_id = $row['reference_number'];
            break;
        }
    }

    if (!$has_completed) {
        reviews_reply(['ok' => false, 'error' => 'You can write a review after your stay is complete.'], 403);
    }

    try {
        $statement = $pdo->prepare(
            'INSERT INTO reviews (user_id, email, booking_id, name, stay, rating, review_text, review_date)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $statement->execute([$user_id, $email, $booking_id, $name, $stay, $rating, $review_text, $review_date]);

        // Mark all pending review notifications for this customer as done
        // so they become non-clickable in the notification list.
        try {
            $pdo->prepare(
                "UPDATE notifications 
                    SET is_review_done = 1,
                        message = 'Thank you for sharing your experience! Your review has been submitted.',
                        is_read = 1
                  WHERE type = 'review' AND (user_id = ? OR email = ?) AND is_review_done = 0"
            )->execute([$user_id, $email]);
        } catch (Exception $ne) {
            // Non-fatal: notification update failure should not block the review save.
        }
    } catch (PDOException $error) {
        if ($error->getCode() === '23000') {
            reviews_reply(['ok' => false, 'error' => 'A review has already been submitted for this reservation.'], 409);
        }
        reviews_reply(['ok' => false, 'error' => 'Could not save your review. Please try again.'], 500);
    }

    reviews_reply(['ok' => true, 'message' => 'Thank you for your review!']);
}

if ($action === 'update') {
    // The user_id condition ensures customers can only edit their own review.
    $review_id = (int)($data['reviewId'] ?? 0);
    $stay = trim($data['stay'] ?? '');
    $review_text = trim($data['text'] ?? '');
    $rating = (int)($data['rating'] ?? 5);
    if ($review_id < 1 || $stay === '' || $review_text === '') {
        reviews_reply(['ok' => false, 'error' => 'Please fill in all fields.'], 400);
    }
    if ($rating < 1 || $rating > 5) {
        reviews_reply(['ok' => false, 'error' => 'Rating must be between 1 and 5.'], 400);
    }

    $statement = $pdo->prepare(
        'UPDATE reviews SET stay = ?, rating = ?, review_text = ?
         WHERE id = ? AND user_id = ?'
    );
    $statement->execute([$stay, $rating, $review_text, $review_id, $user_id]);
    if ($statement->rowCount() === 0) {
        $check = $pdo->prepare('SELECT id FROM reviews WHERE id = ? AND user_id = ?');
        $check->execute([$review_id, $user_id]);
        if (!$check->fetch()) reviews_reply(['ok' => false, 'error' => 'Review not found.'], 404);
    }
    reviews_reply(['ok' => true, 'message' => 'Review updated!']);
}

if ($action === 'delete') {
    // Delete by both review ID and customer ID to keep the action account-specific.
    $review_id = (int)($data['reviewId'] ?? 0);
    $statement = $pdo->prepare('DELETE FROM reviews WHERE id = ? AND user_id = ?');
    $statement->execute([$review_id, $user_id]);
    if ($statement->rowCount() === 0) {
        reviews_reply(['ok' => false, 'error' => 'Review not found.'], 404);
    }
    reviews_reply(['ok' => true, 'message' => 'Review deleted.']);
}

reviews_reply(['ok' => false, 'error' => 'Unknown action.'], 400);
