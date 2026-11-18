<?php
/* ============================================================
   api/reservations.php
   Reservation submission, listing, and approval management.
   Creates in-app notification records on Accept/Reject.
   ============================================================ */

if (session_status() === PHP_SESSION_NONE) {
    session_start([
        'cookie_httponly' => true,
        'cookie_samesite' => 'Lax'
    ]);
}

require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');

/* ============================================================
   AUTO-CREATE date_locks TABLE
   Runs on every request but is instant once the table exists.
   This makes the locking feature self-installing — no manual
   migration step required.
   ============================================================ */
try {
    $pdo->exec("
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
            lock_type       VARCHAR(10)       NOT NULL DEFAULT 'hold',
            created_at      TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY date_locks_checkin_idx  (check_in),
            KEY date_locks_expires_idx  (locked_until),
            KEY date_locks_session_idx  (session_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
    /* Add lock_type column to existing tables that were created before this migration */
    try {
        $pdo->exec("ALTER TABLE date_locks ADD COLUMN lock_type VARCHAR(10) NOT NULL DEFAULT 'hold' AFTER locked_until");
    } catch (PDOException $alterErr) {
        /* Column already exists — safe to ignore */
    }
} catch (PDOException $e) {
    /* Non-fatal — log but don't block the request */
    error_log('date_locks auto-create failed: ' . $e->getMessage());
}

/* Auto-add walkin_payment column to reservations if not present */
try {
    $pdo->exec("ALTER TABLE reservations ADD COLUMN walkin_payment DECIMAL(10,2) DEFAULT NULL AFTER downpayment_amount");
} catch (PDOException $e) { /* already exists — ignore */ }

function reservation_reply($data, $status = 200) {
    http_response_code($status);
    echo json_encode($data);
    exit;
}

function reservation_user($admin_only = false) {
    if (empty($_SESSION['user_id'])) {
        if ($admin_only) {
            return;
        }
        reservation_reply(['ok' => false, 'error' => 'Please log in to submit a reservation.'], 401);
    }
    if ($admin_only) {
        $role = strtolower(trim($_SESSION['role'] ?? 'admin'));
        if ($role !== 'admin' && $role !== 'administrator' && $role !== 'caretaker') {
            reservation_reply(['ok' => false, 'error' => 'Staff access required.'], 403);
        }
    }
}

function format_hour_12($h, $m = 0) {
    $suffix = $h >= 12 ? 'PM' : 'AM';
    $h12    = $h % 12;
    if ($h12 === 0) $h12 = 12;
    $mm = str_pad($m, 2, '0', STR_PAD_LEFT);
    return $h12 . ':' . $mm . ' ' . $suffix;
}

function reservation_checkin_is_bookable($date, $hour, $minute) {
    $timezone = new DateTimeZone('Asia/Manila');
    $checkin = DateTimeImmutable::createFromFormat(
        '!Y-m-d H:i',
        sprintf('%s %02d:%02d', $date, $hour, $minute),
        $timezone
    );
    $now = new DateTimeImmutable('now', $timezone);

    if ($checkin === false) {
        return false;
    }

    if ($date === $now->format('Y-m-d')) {
        return $checkin >= $now->modify('+3 hours');
    }

    return $checkin > $now;
}

function parse_reservation_times($row) {
    $ci_date = substr($row['check_in'] ?? '', 0, 10);
    $co_date = substr($row['check_out'] ?? '', 0, 10);

    $checkin_hour   = 12;
    $checkin_minute = 0;
    $checkout_hour  = 10;
    $checkout_minute= 0;

    if (!empty($row['time_slot'])) {
        $parts = explode('-', $row['time_slot']);
        if (count($parts) === 2) {
            $start_ts = strtotime(trim($parts[0]));
            $end_ts   = strtotime(trim($parts[1]));
            if ($start_ts !== false && $end_ts !== false) {
                $checkin_hour   = (int)date('G', $start_ts);
                $checkin_minute = (int)date('i', $start_ts);
                $checkout_hour  = (int)date('G', $end_ts);
                $checkout_minute= (int)date('i', $end_ts);
            }
        }
    } elseif (!empty($row['check_in']) && strlen($row['check_in']) > 10) {
        $ci_ts = strtotime($row['check_in']);
        if ($ci_ts !== false) {
            $checkin_hour   = (int)date('G', $ci_ts);
            $checkin_minute = (int)date('i', $ci_ts);
        }
        if (!empty($row['check_out']) && strlen($row['check_out']) > 10) {
            $co_ts = strtotime($row['check_out']);
            if ($co_ts !== false) {
                $checkout_hour   = (int)date('G', $co_ts);
                $checkout_minute = (int)date('i', $co_ts);
            }
        }
    }

    return [
        'checkin_date'   => $ci_date,
        'checkout_date'  => $co_date,
        'checkin_hour'   => $checkin_hour,
        'checkin_minute' => $checkin_minute,
        'checkout_hour'  => $checkout_hour,
        'checkout_minute'=> $checkout_minute,
    ];
}

function reservation_row_query() {
    return "SELECT r.reference_number AS id,
                   r.reference_number AS reference,
                   COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), ''), r.guest_name) AS guest_name,
                   u.first_name, u.last_name,
                   r.guest_email AS email, r.guest_phone AS phone,
                   r.check_in AS visit_date,
                   r.check_out AS visit_checkout_date,
                   CASE WHEN r.check_out <= r.check_in
                        THEN DATE_ADD(r.check_in, INTERVAL 1 DAY)
                        ELSE r.check_out END AS visit_end_date,
                   r.time_slot AS visit_time,
                   r.package_name AS room, r.rate_type, r.pax_range AS pax,
                   r.lpg_addon AS lpg, 'down' AS pay_type,
                   r.downpayment_amount AS amount,
                   r.total_price AS total,
                   r.balance_amount,
                   COALESCE(r.walkin_payment, NULL) AS walkin_payment,
                   r.proof_of_payment AS payment_image,
                   COALESCE(NULLIF(r.payment_status, ''), 'Pending Verification') AS payment_status,
                   CASE 
                       WHEN r.payment_status = 'Approved' THEN 'Approved'
                       WHEN r.payment_status IN ('Rejected', 'Declined') THEN 'Declined'
                       ELSE 'Pending' 
                   END AS status,
                   r.admin_message,
                   r.confirmation_email_sent_at,
                   r.created_at AS booked_at
            FROM reservations r
            LEFT JOIN users u ON u.id = r.user_id";
}

$raw_input = file_get_contents('php://input');
$data = json_decode($raw_input, true);

if (json_last_error() !== JSON_ERROR_NONE && $_SERVER['REQUEST_METHOD'] === 'POST') {
    reservation_reply([
        'ok' => false, 
        'error' => 'The uploaded payment image or request size is too large. Please upload a smaller image file.'
    ], 400);
}

$data = $data ?? [];
$action = $data['action'] ?? '';

/* ============================================================
   HELPER: Check whether a time window overlaps any active lock
   or any approved reservation (respects 2-hour gap).
   Returns true if the slot is still free for $exclude_session.
   ============================================================ */
function is_slot_free($pdo, $checkin_date, $checkin_hour, $checkin_minute,
                       $checkout_date, $checkout_hour, $checkout_minute,
                       $exclude_session = null)
{
    $gap = 2 * 60 * 60; /* 2-hour buffer between bookings */

    $new_start = strtotime($checkin_date  . ' ' . str_pad($checkin_hour,  2,'0',STR_PAD_LEFT) . ':' . str_pad($checkin_minute,  2,'0',STR_PAD_LEFT) . ':00');
    $new_end   = strtotime($checkout_date . ' ' . str_pad($checkout_hour, 2,'0',STR_PAD_LEFT) . ':' . str_pad($checkout_minute, 2,'0',STR_PAD_LEFT) . ':00');

    /* 1. Check approved reservations */
    $approved = $pdo->query(
        "SELECT check_in, check_out, time_slot FROM reservations
          WHERE payment_status IN ('Approved', 'Pending Verification')"
    );
    foreach ($approved->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $t       = parse_reservation_times($row);
        $ex_s    = strtotime($t['checkin_date']  . ' ' . str_pad($t['checkin_hour'],  2,'0',STR_PAD_LEFT) . ':' . str_pad($t['checkin_minute'],  2,'0',STR_PAD_LEFT) . ':00');
        $ex_e    = strtotime($t['checkout_date'] . ' ' . str_pad($t['checkout_hour'], 2,'0',STR_PAD_LEFT) . ':' . str_pad($t['checkout_minute'], 2,'0',STR_PAD_LEFT) . ':00');
        if ($new_start < ($ex_e + $gap) && $new_end > $ex_s) {
            return false;
        }
    }

    /* 2. Check active (non-expired) date locks that belong to OTHER sessions */
    $lock_stmt = $pdo->prepare(
        "SELECT checkin_hour, checkin_minute, checkout_date, checkout_hour, checkout_minute
           FROM date_locks
          WHERE check_in = ? AND locked_until >= NOW()
            AND session_id <> ?"
    );
    $lock_stmt->execute([$checkin_date, $exclude_session ?? '']);
    foreach ($lock_stmt->fetchAll(PDO::FETCH_ASSOC) as $lk) {
        $lk_s = strtotime($checkin_date           . ' ' . str_pad($lk['checkin_hour'],  2,'0',STR_PAD_LEFT) . ':' . str_pad($lk['checkin_minute'],  2,'0',STR_PAD_LEFT) . ':00');
        $lk_e = strtotime($lk['checkout_date']    . ' ' . str_pad($lk['checkout_hour'], 2,'0',STR_PAD_LEFT) . ':' . str_pad($lk['checkout_minute'], 2,'0',STR_PAD_LEFT) . ':00');
        if ($new_start < ($lk_e + $gap) && $new_end > $lk_s) {
            return false;
        }
    }

    return true;
}

/* ============================================================
   ACTION: preview_lock
   ============================================================ */
if ($action === 'preview_lock') {
    reservation_user(); /* must be logged in */

    $visit_date     = trim($data['visitDate']      ?? '');
    $checkin_hour   = intval($data['checkinHour']   ?? 0);
    $checkin_minute = intval($data['checkinMinute'] ?? 0);

    $date_obj = DateTime::createFromFormat('Y-m-d', $visit_date);
    $today    = (new DateTimeImmutable('now', new DateTimeZone('Asia/Manila')))->format('Y-m-d');
    if (!$date_obj || $date_obj->format('Y-m-d') !== $visit_date || $visit_date < $today) {
        reservation_reply(['ok' => false, 'error' => 'Invalid date.'], 400);
    }

    $checkin_total   = ($checkin_hour * 60) + $checkin_minute;
    $checkout_total  = $checkin_total + (22 * 60);
    $checkout_hour   = intdiv($checkout_total, 60) % 24;
    $checkout_minute = $checkout_total % 60;
    $checkout_date   = ($checkout_total >= 24 * 60)
        ? date('Y-m-d', strtotime($visit_date . ' +1 day'))
        : $visit_date;

    $sess_id = session_id();

    $pdo->prepare("DELETE FROM date_locks WHERE session_id = ? AND lock_type = 'preview'")->execute([$sess_id]);
    $pdo->exec('DELETE FROM date_locks WHERE locked_until < NOW()');

    $pdo->prepare(
        "INSERT INTO date_locks
            (session_id, user_id, check_in, checkin_hour, checkin_minute,
             checkout_date, checkout_hour, checkout_minute, locked_until, lock_type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 60 SECOND), 'preview')"
    )->execute([
        $sess_id,
        (int)($_SESSION['user_id'] ?? 0),
        $visit_date,
        $checkin_hour,
        $checkin_minute,
        $checkout_date,
        $checkout_hour,
        $checkout_minute,
    ]);

    reservation_reply(['ok' => true]);
}

/* ============================================================
   ACTION: clear_preview
   ============================================================ */
if ($action === 'clear_preview') {
    $sess_id = session_id();
    $pdo->prepare("DELETE FROM date_locks WHERE session_id = ? AND lock_type = 'preview'")->execute([$sess_id]);
    reservation_reply(['ok' => true]);
}

/* ============================================================
   ACTION: refresh_preview
   ============================================================ */
if ($action === 'refresh_preview') {
    reservation_user();
    $sess_id = session_id();
    $pdo->prepare(
        "UPDATE date_locks SET locked_until = DATE_ADD(NOW(), INTERVAL 60 SECOND)
          WHERE session_id = ? AND lock_type = 'preview'"
    )->execute([$sess_id]);
    reservation_reply(['ok' => true]);
}

/* ============================================================
   ACTION: hold_date
   ============================================================ */
if ($action === 'hold_date') {
    reservation_user(); /* must be logged in */

    $visit_date     = trim($data['visitDate']      ?? '');
    $checkin_hour   = intval($data['checkinHour']   ?? -1);
    $checkin_minute = intval($data['checkinMinute'] ?? 0);

    $date_obj = DateTime::createFromFormat('Y-m-d', $visit_date);
    $today = (new DateTimeImmutable('now', new DateTimeZone('Asia/Manila')))->format('Y-m-d');
    if (!$date_obj || $date_obj->format('Y-m-d') !== $visit_date || $visit_date < $today) {
        reservation_reply(['ok' => false, 'error' => 'Invalid or past date.'], 400);
    }
    if ($checkin_hour < 0 || $checkin_hour > 23) {
        reservation_reply(['ok' => false, 'error' => 'Invalid check-in hour.'], 400);
    }
    if ($checkin_minute < 0 || $checkin_minute > 59) {
        reservation_reply(['ok' => false, 'error' => 'Invalid check-in minute.'], 400);
    }
    if (!reservation_checkin_is_bookable($visit_date, $checkin_hour, $checkin_minute)) {
        reservation_reply(['ok' => false, 'error' => 'Same-day check-in must be at least 3 hours from now.'], 400);
    }

    $checkin_total   = ($checkin_hour * 60) + $checkin_minute;
    $checkout_total  = $checkin_total + (22 * 60);
    $checkout_hour   = intdiv($checkout_total, 60) % 24;
    $checkout_minute = $checkout_total % 60;
    $checkout_date   = ($checkout_total >= 24 * 60)
        ? date('Y-m-d', strtotime($visit_date . ' +1 day'))
        : $visit_date;

    $sess_id = session_id();

    $pdo->prepare('DELETE FROM date_locks WHERE session_id = ?')->execute([$sess_id]);
    if (!is_slot_free($pdo, $visit_date, $checkin_hour, $checkin_minute,
                       $checkout_date, $checkout_hour, $checkout_minute, $sess_id)) {
        reservation_reply([
            'ok'    => false,
            'error' => 'Sorry, this date is currently being reserved by another customer. Please pick another date.'
        ], 409);
    }

    $lock_stmt = $pdo->prepare(
        "INSERT INTO date_locks
            (session_id, user_id, check_in, checkin_hour, checkin_minute,
             checkout_date, checkout_hour, checkout_minute, locked_until)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 15 MINUTE))"
    );
    $lock_stmt->execute([
        $sess_id,
        (int)($_SESSION['user_id'] ?? 0),
        $visit_date,
        $checkin_hour,
        $checkin_minute,
        $checkout_date,
        $checkout_hour,
        $checkout_minute,
    ]);

    $pdo->exec('DELETE FROM date_locks WHERE locked_until < NOW()');

    reservation_reply([
        'ok'          => true,
        'lockExpires' => date('Y-m-d H:i:s', strtotime('+15 minutes')),
        'message'     => 'Date locked for 15 minutes.'
    ]);
}

/* ============================================================
   ACTION: release_hold
   ============================================================ */
if ($action === 'release_hold') {
    $sess_id = session_id();
    $pdo->prepare('DELETE FROM date_locks WHERE session_id = ?')->execute([$sess_id]);
    reservation_reply(['ok' => true, 'message' => 'Hold released.']);
}

if ($action === 'create') {
    reservation_user();

    $first_name = trim($data['firstName'] ?? '');
    $last_name = trim($data['lastName'] ?? '');
    $email = array_key_exists('email', $data)
        ? trim($data['email'])
        : ($_SESSION['user_email'] ?? '');
    $phone = preg_replace('/[\s()-]/', '', trim($data['phone'] ?? ''));
    $visit_date = $data['visitDate'] ?? '';
    $visit_time_raw = trim($data['visitTime'] ?? '');
    $pax_range = trim($data['pax'] ?? '');
    $lpg = trim($data['lpg'] ?? 'No');
    $package_name = trim($data['room'] ?? '');
    $payment_image = $data['paymentImage'] ?? '';

    if (!$first_name || !$last_name || !$email || !$phone || !$visit_time_raw || !$package_name) {
        reservation_reply(['ok' => false, 'error' => 'Please fill in all required fields.'], 400);
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        reservation_reply(['ok' => false, 'error' => 'Please enter a valid email address.'], 400);
    }
    if (!preg_match('/^09\d{9}$/', $phone)) {
        reservation_reply(['ok' => false, 'error' => 'Phone number must be 11 digits starting with 09.'], 400);
    }
    if (($data['termsAccepted'] ?? false) !== true) {
        reservation_reply(['ok' => false, 'error' => 'Please agree to the 50% package down payment terms.'], 400);
    }

    $date = DateTime::createFromFormat('Y-m-d', $visit_date);
    $today = (new DateTimeImmutable('now', new DateTimeZone('Asia/Manila')))->format('Y-m-d');
    if (!$date || $date->format('Y-m-d') !== $visit_date || $visit_date < $today) {
        reservation_reply(['ok' => false, 'error' => 'Please choose a valid future visit date.'], 400);
    }

    $rates = [
        '1-10' => [9000, 12000], '11-15' => [13000, 17000],
        '16-20' => [17000, 22000], '21-25' => [21000, 27000],
        '26-30' => [24000, 31000], '31-35' => [27000, 35000]
    ];
    if (!isset($rates[$pax_range])) {
        reservation_reply(['ok' => false, 'error' => 'Please select a valid package.'], 400);
    }

    $checkin_hour   = intval($data['checkinHour']   ?? -1);
    $checkin_minute = intval($data['checkinMinute'] ?? 0);

    if ($checkin_minute < 0 || $checkin_minute > 59) {
        reservation_reply(['ok' => false, 'error' => 'Please select a valid check-in time.'], 400);
    }

    if ($checkin_hour < 0 || $checkin_hour > 23) {
        reservation_reply(['ok' => false, 'error' => 'Please select a valid check-in time.'], 400);
    }
    if (!reservation_checkin_is_bookable($visit_date, $checkin_hour, $checkin_minute)) {
        reservation_reply(['ok' => false, 'error' => 'Same-day check-in must be at least 3 hours from now.'], 400);
    }

    $checkin_total_mins  = ($checkin_hour * 60) + $checkin_minute;
    $checkout_total_mins = $checkin_total_mins + (22 * 60);

    $checkout_hour   = intdiv($checkout_total_mins, 60) % 24;
    $checkout_minute = $checkout_total_mins % 60;

    $checkout_date = $visit_date;
    if ($checkout_total_mins >= 24 * 60) {
        $checkout_date = date('Y-m-d', strtotime($visit_date . ' +1 day'));
    }

    $visit_time = format_hour_12($checkin_hour, $checkin_minute) . ' - ' . format_hour_12($checkout_hour, $checkout_minute);

    $gap = 2 * 60 * 60;

    $new_start_ts = strtotime($visit_date   . ' ' . $checkin_hour   . ':' . str_pad($checkin_minute,  2, '0', STR_PAD_LEFT) . ':00');
    $new_end_ts   = strtotime($checkout_date . ' ' . $checkout_hour . ':' . str_pad($checkout_minute, 2, '0', STR_PAD_LEFT) . ':00');

    $overlap_check = $pdo->query(
        "SELECT check_in, check_out, time_slot, reference_number
           FROM reservations
          WHERE payment_status IN ('Approved', 'Pending Verification')"
    );
    foreach ($overlap_check->fetchAll(PDO::FETCH_ASSOC) as $existing) {
        $times    = parse_reservation_times($existing);
        $ex_start = strtotime($times['checkin_date']  . ' ' . $times['checkin_hour']  . ':' . str_pad($times['checkin_minute'], 2, '0', STR_PAD_LEFT) . ':00');
        $ex_end   = strtotime($times['checkout_date'] . ' ' . $times['checkout_hour'] . ':' . str_pad($times['checkout_minute'], 2, '0', STR_PAD_LEFT) . ':00');

        $ex_end_with_gap = $ex_end + $gap;

        if ($new_start_ts < $ex_end_with_gap && $new_end_ts > $ex_start) {
            reservation_reply([
                'ok'    => false,
                'error' => 'This time overlaps with an existing reservation (' . $existing['reference_number'] . '). Please choose a different time.'
            ], 409);
        }
    }

    $weekday = (int)$date->format('w');
    $check_out  = $checkout_date;
    $is_weekend = in_array($weekday, [0, 5, 6], true);
    $rate_type = $is_weekend ? 'Weekend / Holiday' : 'Weekday';
    $package_total = $rates[$pax_range][$is_weekend ? 1 : 0];
    $lpg_fee = strpos($lpg, 'Yes') === 0 ? 500 : 0;
    $total = $package_total + $lpg_fee;
    $deposit = (int)ceil($package_total * 0.5);
    $balance = $total - $deposit;

    /* ---- Re-validate that this session still holds the temporary lock ---- */
    $lock_check = $pdo->prepare(
        "SELECT id FROM date_locks
          WHERE session_id = ?
            AND check_in    = ?
            AND checkin_hour    = ?
            AND checkin_minute  = ?
            AND locked_until >= NOW()"
    );
    $lock_check->execute([session_id(), $visit_date, $checkin_hour, $checkin_minute]);
    if (!$lock_check->fetch()) {
        reservation_reply([
            'ok'    => false,
            'error' => 'Your reservation session has expired. The date has been released to other customers. Please go back and select your date again.'
        ], 409);
    }
    /* ---- End lock re-validation ---- */

    if (!preg_match('/^data:image\/(jpeg|png|webp|gif);base64,([A-Za-z0-9+\/=\r\n]+)$/', $payment_image, $matches)) {
        reservation_reply(['ok' => false, 'error' => 'Please upload a valid receipt image.'], 400);
    }

    $image_bytes = base64_decode($matches[2], true);
    if ($image_bytes === false || strlen($image_bytes) > 5 * 1024 * 1024) {
        reservation_reply(['ok' => false, 'error' => 'Receipt images must be under 5MB.'], 400);
    }

    $image_info = new finfo(FILEINFO_MIME_TYPE);
    $mime_type = $image_info->buffer($image_bytes);
    $allowed_types = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!in_array($mime_type, $allowed_types, true)) {
        reservation_reply(['ok' => false, 'error' => 'The uploaded file is not a supported image format.'], 400);
    }

    $receipt_hash = hash('sha256', $image_bytes);
    $check = $pdo->prepare('SELECT id FROM reservations WHERE receipt_sha256 = ?');
    $check->execute([$receipt_hash]);
    if ($check->fetch()) {
        reservation_reply(['ok' => false, 'error' => 'This receipt image has already been uploaded for another booking.'], 409);
    }

    $reference = 'BK-' . strtoupper(bin2hex(random_bytes(4)));
    $statement = $pdo->prepare(
        "INSERT INTO reservations
            (user_id, guest_name, guest_email, guest_phone, check_in, check_out,
             time_slot, guests_count, package_name, rate_type, pax_range, lpg_addon,
             total_price, downpayment_amount, balance_amount, proof_of_payment,
             receipt_sha256, reference_number, payment_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending Verification')"
    );

    try {
        $statement->execute([
            (int)$_SESSION['user_id'], $first_name . ' ' . $last_name, $email, $phone,
            $visit_date, $checkout_date, $visit_time,
            (int)substr($pax_range, strpos($pax_range, '-') + 1),
            $package_name, $rate_type, $pax_range, $lpg, $total, $deposit, $balance,
            $payment_image, $receipt_hash, $reference
        ]);
    } catch (PDOException $error) {
        if ($error->getCode() === '23000') {
            reservation_reply(['ok' => false, 'error' => 'This receipt image has already been used.'], 409);
        }
        error_log('Reservation INSERT failed: ' . $error->getMessage());
        reservation_reply(['ok' => false, 'error' => 'Could not save your reservation. Please try again.'], 500);
    }

    log_audit_action('CREATE_RESERVATION', "New reservation submitted with reference {$reference}.");

    /* Release the temporary hold now that the booking is permanently saved */
    $pdo->prepare('DELETE FROM date_locks WHERE session_id = ?')->execute([session_id()]);

    reservation_reply([
        'ok' => true,
        'bookingId' => $reference,
        'amount' => $deposit,
        'message' => 'Reservation submitted successfully with the 50% package down payment.'
    ]);
}

if ($action === 'my_list') {
    reservation_user();
    $statement = $pdo->prepare(reservation_row_query() . ' WHERE r.user_id = ? ORDER BY r.created_at DESC');
    $statement->execute([(int)$_SESSION['user_id']]);
    reservation_reply(['ok' => true, 'bookings' => $statement->fetchAll(PDO::FETCH_ASSOC)]);
}

if ($action === 'transaction_report') {
    if (empty($_SESSION['user_id'])) {
        reservation_reply(['ok' => false, 'error' => 'Please log in to view transaction reports.'], 401);
    }

    $role = strtolower(trim($_SESSION['role'] ?? ''));
    if ($role !== 'admin' && $role !== 'administrator') {
        reservation_reply(['ok' => false, 'error' => 'Administrator access is required to view transaction reports.'], 403);
    }

    $period = $data['period'] ?? '';
    $year = filter_var($data['year'] ?? null, FILTER_VALIDATE_INT);
    $month = filter_var($data['month'] ?? null, FILTER_VALIDATE_INT);
    $current_year = (int)date('Y');

    if (($period !== 'monthly' && $period !== 'yearly') ||
        $year === false || $year < 2000 || $year > $current_year ||
        ($period === 'monthly' && ($month === false || $month < 1 || $month > 12))) {
        reservation_reply(['ok' => false, 'error' => 'Choose a valid reporting period.'], 400);
    }

    $start_date = $period === 'monthly'
        ? sprintf('%04d-%02d-01', $year, $month)
        : sprintf('%04d-01-01', $year);
    $end_date = (new DateTimeImmutable($start_date))->modify($period === 'monthly' ? '+1 month' : '+1 year')->format('Y-m-d');

    $statement = $pdo->prepare(
        "SELECT r.reference_number AS reference,
                COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), ''), r.guest_name) AS guest_name,
                r.check_in AS visit_date,
                r.package_name AS package_name,
                r.pax_range AS pax,
                r.total_price AS total_amount,
                r.downpayment_amount AS amount_submitted,
                COALESCE(NULLIF(r.payment_status, ''), 'Pending Verification') AS payment_status,
                r.created_at AS booked_at
           FROM reservations r
           LEFT JOIN users u ON u.id = r.user_id
          WHERE r.created_at >= ? AND r.created_at < ?
          ORDER BY r.created_at DESC"
    );
    $statement->execute([$start_date . ' 00:00:00', $end_date . ' 00:00:00']);
    reservation_reply([
        'ok' => true,
        'period' => $period,
        'year' => $year,
        'month' => $period === 'monthly' ? $month : null,
        'bookings' => $statement->fetchAll(PDO::FETCH_ASSOC)
    ]);
}

if ($action === 'all_list') {
    reservation_user(true);
    try {
        $pdo->exec("UPDATE reservations SET payment_status = 'Pending Verification' WHERE payment_status IS NULL OR payment_status = '' OR payment_status = 'Pending'");
    } catch (Exception $e) {
        /* Ignore error */
    }

    $statement = $pdo->query(reservation_row_query() . ' ORDER BY r.created_at DESC');
    reservation_reply(['ok' => true, 'bookings' => $statement->fetchAll(PDO::FETCH_ASSOC)]);
}

if ($action === 'get_one') {
    reservation_user(true);
    $statement = $pdo->prepare('SELECT reference_number AS id, proof_of_payment AS payment_image FROM reservations WHERE reference_number = ?');
    $statement->execute([trim($data['bookingId'] ?? '')]);
    $booking = $statement->fetch(PDO::FETCH_ASSOC);
    if (!$booking) {
        reservation_reply(['ok' => false, 'error' => 'Reservation not found.'], 404);
    }
    reservation_reply(['ok' => true, 'booking' => $booking]);
}

if ($action === 'update_status') {
    reservation_user(true);
    $booking_id = trim($data['bookingId'] ?? '');
    $status = $data['status'] ?? '';
    $admin_message = trim($data['adminMessage'] ?? '');
    if (!in_array($status, ['Approved', 'Declined', 'Rejected'], true)) {
        reservation_reply(['ok' => false, 'error' => 'Invalid reservation status.'], 400);
    }

    $norm_status = ($status === 'Approved') ? 'Approved' : 'Declined';
    $db_status   = ($status === 'Approved') ? 'Approved' : 'Rejected';

    $statement = $pdo->prepare('SELECT * FROM reservations WHERE reference_number = ? OR id = ?');
    $statement->execute([$booking_id, $booking_id]);
    $booking = $statement->fetch(PDO::FETCH_ASSOC);
    if (!$booking) {
        reservation_reply(['ok' => false, 'error' => 'Reservation not found.'], 404);
    }

    $actor_statement = $pdo->prepare('SELECT first_name, last_name, role FROM users WHERE id = ?');
    $actor_statement->execute([(int)$_SESSION['user_id']]);
    $actor = $actor_statement->fetch(PDO::FETCH_ASSOC);
    if (!$actor) {
        reservation_reply(['ok' => false, 'error' => 'Could not identify the staff member updating this reservation.'], 500);
    }

    $actor_role = strtolower(trim($actor['role'] ?? ''));
    $actor_label = in_array($actor_role, ['admin', 'administrator'], true) ? 'Admin' : 'Staff';
    $actor_name = trim(($actor['first_name'] ?? '') . ' ' . ($actor['last_name'] ?? ''));
    if ($actor_name === '') {
        $actor_name = trim($_SESSION['user_name'] ?? '');
    }
    if ($actor_name === '') {
        $actor_name = trim($_SESSION['user_email'] ?? '');
    }

    if ($norm_status === 'Approved') {
        $gap = 2 * 60 * 60;

        $times = parse_reservation_times($booking);
        $this_start = strtotime($times['checkin_date']  . ' ' . $times['checkin_hour']  . ':' . str_pad($times['checkin_minute'], 2, '0', STR_PAD_LEFT) . ':00');
        $this_end   = strtotime($times['checkout_date'] . ' ' . $times['checkout_hour'] . ':' . str_pad($times['checkout_minute'], 2, '0', STR_PAD_LEFT) . ':00');

        $all_approved = $pdo->query(
            "SELECT check_in, check_out, time_slot, reference_number
               FROM reservations
              WHERE payment_status = 'Approved'"
        );
        foreach ($all_approved->fetchAll(PDO::FETCH_ASSOC) as $other) {
            if ($other['reference_number'] === $booking_id) continue;

            $oth_times   = parse_reservation_times($other);
            $other_start = strtotime($oth_times['checkin_date']  . ' ' . $oth_times['checkin_hour']  . ':' . str_pad($oth_times['checkin_minute'], 2, '0', STR_PAD_LEFT) . ':00');
            $other_end   = strtotime($oth_times['checkout_date'] . ' ' . $oth_times['checkout_hour'] . ':' . str_pad($oth_times['checkout_minute'], 2, '0', STR_PAD_LEFT) . ':00');

            if ($this_start < ($other_end + $gap) && $this_end > $other_start) {
                reservation_reply([
                    'ok'    => false,
                    'error' => 'Cannot approve: this reservation overlaps with approved reservation ' . $other['reference_number'] . '.'
                ], 409);
            }
        }
    }

    /* Update reservations table */
    $updated = $pdo->prepare('UPDATE reservations SET payment_status = ?, admin_message = ? WHERE reference_number = ? OR id = ?');
    $updated->execute([$db_status, $admin_message, $booking_id, $booking_id]);

    // Record audit action
    log_audit_action('UPDATE_RESERVATION', "Updated reservation #{$booking_id} status to '{$norm_status}'.");

    /* INSERT OR UPDATE IN-APP NOTIFICATION */
    $visit_date_str = $booking['check_in'] ?? $booking['visit_date'] ?? 'your visit date';
    $formatted_date = date('F j, Y', strtotime($visit_date_str));
    $notif_msg = ($norm_status === 'Approved')
        ? "Reservation {$booking_id}\nVisit date: {$formatted_date}\nStatus: APPROVED\nReviewed by {$actor_label} {$actor_name}\nWe look forward to welcoming you!"
        : "Reservation {$booking_id}\nVisit date: {$formatted_date}\nStatus: DECLINED\nReviewed by {$actor_label} {$actor_name}";

    try {
        $check_notif = $pdo->prepare('SELECT id FROM notifications WHERE booking_id = ? OR id = ?');
        $check_notif->execute([$booking_id, $booking_id]);
        $existing_notif = $check_notif->fetch(PDO::FETCH_ASSOC);

        if ($existing_notif) {
            $update_notif = $pdo->prepare(
                'UPDATE notifications 
                    SET status = ?, message = ?, admin_message = ?, is_read = 0, created_at = NOW() 
                  WHERE id = ?'
            );
            $update_notif->execute([$norm_status, $notif_msg, $admin_message, $existing_notif['id']]);
        } else {
            $notif_id = 'NOTIF-' . strtoupper(bin2hex(random_bytes(4)));
            $user_id  = (int)($booking['user_id'] ?? $_SESSION['user_id'] ?? 0);
            $email    = $booking['guest_email'] ?? $booking['email'] ?? ($_SESSION['user_email'] ?? '');

            $insert_notif = $pdo->prepare(
                "INSERT INTO notifications 
                    (id, user_id, email, type, booking_id, status, message, admin_message, is_read, notif_date, created_at)
                 VALUES (?, ?, ?, 'booking', ?, ?, ?, ?, 0, DATE_FORMAT(NOW(), '%b %d, %Y'), NOW())"
            );
            $insert_notif->execute([
                $notif_id,
                $user_id,
                $email,
                $booking_id,
                $norm_status,
                $notif_msg,
                $admin_message
            ]);
        }
    } catch (Exception $e) {
        error_log('Failed to insert notification: ' . $e->getMessage());
    }

    reservation_reply([
        'ok' => true,
        'message' => $norm_status === 'Approved'
            ? 'Reservation approved.'
            : 'Reservation declined.'
    ]);
}

if ($action === 'send_status_email') {
    reservation_user(true);
    $booking_id = trim($data['bookingId'] ?? '');

    $statement = $pdo->prepare('SELECT * FROM reservations WHERE reference_number = ? OR id = ?');
    $statement->execute([$booking_id, $booking_id]);
    $booking = $statement->fetch(PDO::FETCH_ASSOC);
    if (!$booking) {
        reservation_reply(['ok' => false, 'error' => 'Reservation not found.'], 404);
    }

    if ($booking['payment_status'] === 'Approved') {
        $status = 'Approved';
    } elseif (in_array($booking['payment_status'], ['Rejected', 'Declined'], true)) {
        $status = 'Declined';
    } else {
        reservation_reply(['ok' => false, 'error' => 'Reservation status has not been updated yet.'], 409);
    }

    $actor_statement = $pdo->prepare('SELECT first_name, last_name, role FROM users WHERE id = ?');
    $actor_statement->execute([(int)$_SESSION['user_id']]);
    $actor = $actor_statement->fetch(PDO::FETCH_ASSOC);
    if (!$actor) {
        reservation_reply(['ok' => false, 'error' => 'Could not identify the staff member sending this email.'], 500);
    }

    $actor_role = strtolower(trim($actor['role'] ?? ''));
    $actor_label = in_array($actor_role, ['admin', 'administrator'], true) ? 'Admin' : 'Staff';
    $actor_name = trim(($actor['first_name'] ?? '') . ' ' . ($actor['last_name'] ?? ''));
    if ($actor_name === '') {
        $actor_name = trim($_SESSION['user_name'] ?? $_SESSION['user_email'] ?? '');
    }

    require_once __DIR__ . '/reservation_email.php';
    $email_sent = send_reservation_status_email(
        $booking,
        $status,
        $actor_label . ' ' . $actor_name,
        $booking['admin_message'] ?? ''
    );

    if ($email_sent && $status === 'Approved') {
        $sent = $pdo->prepare('UPDATE reservations SET confirmation_email_sent_at = NOW() WHERE id = ?');
        $sent->execute([(int)$booking['id']]);
    }

    reservation_reply([
        'ok' => true,
        'emailSent' => $email_sent
    ]);
}

if ($action === 'reserved_dates') {
    /* No-cache headers so the browser never serves a stale response */
    header('Cache-Control: no-store, no-cache, must-revalidate');
    header('Pragma: no-cache');

    if (mt_rand(1, 10) === 1) {
        $pdo->exec('DELETE FROM date_locks WHERE locked_until < NOW()');
    }

    /* ── RED: Approved reservations ─────────────────────────────────────── */
    $stmt = $pdo->query(
        "SELECT check_in, check_out, time_slot
           FROM reservations
          WHERE payment_status = 'Approved'
          ORDER BY check_in"
    );

    $list = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $times  = parse_reservation_times($row);
        $list[] = [
            'date'           => $times['checkin_date'],
            'checkin_hour'   => $times['checkin_hour'],
            'checkin_minute' => $times['checkin_minute'],
            'checkout_hour'  => $times['checkout_hour'],
            'checkout_minute'=> $times['checkout_minute'],
            'checkout_date'  => $times['checkout_date']
        ];
    }

    /* ── BLUE: Pending Verification + active date_locks ──────── */
    $previews = [];

    $pending_stmt = $pdo->query(
        "SELECT check_in, check_out, time_slot
           FROM reservations
          WHERE payment_status = 'Pending Verification'
          ORDER BY check_in"
    );
    foreach ($pending_stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $times    = parse_reservation_times($row);
        $previews[] = [
            'date'           => $times['checkin_date'],
            'checkin_hour'   => $times['checkin_hour'],
            'checkin_minute' => $times['checkin_minute'],
            'checkout_hour'  => $times['checkout_hour'],
            'checkout_minute'=> $times['checkout_minute'],
            'checkout_date'  => $times['checkout_date']
        ];
    }

    $current_session = session_id();
    $locks_stmt = $pdo->prepare(
        "SELECT check_in, checkin_hour, checkin_minute,
                checkout_date, checkout_hour, checkout_minute
           FROM date_locks
          WHERE locked_until >= NOW()
            AND session_id <> ?"
    );
    $locks_stmt->execute([$current_session]);
    foreach ($locks_stmt->fetchAll(PDO::FETCH_ASSOC) as $lk) {
        $previews[] = [
            'date'           => $lk['check_in'],
            'checkin_hour'   => (int)$lk['checkin_hour'],
            'checkin_minute' => (int)$lk['checkin_minute'],
            'checkout_hour'  => (int)$lk['checkout_hour'],
            'checkout_minute'=> (int)$lk['checkout_minute'],
            'checkout_date'  => $lk['checkout_date']
        ];
    }

    reservation_reply(['ok' => true, 'reservations' => $list, 'previews' => $previews]);
}

/* ============================================================
   ACTION: save_walkin_payment
   Admin marks the remaining face-to-face balance as completed.
   Supports optional removal of the ₱500 LPG add-on if the
   customer cancelled it at the resort.
   ============================================================ */
if ($action === 'save_walkin_payment') {
    reservation_user(true);

    try {
        $pdo->exec("ALTER TABLE reservations ADD COLUMN walkin_payment DECIMAL(10,2) DEFAULT NULL AFTER downpayment_amount");
    } catch (PDOException $e) { /* already exists */ }

    $booking_id = trim($data['bookingId'] ?? '');
    $remove_lpg = !empty($data['removeLpg']);

    if (!$booking_id) {
        reservation_reply(['ok' => false, 'error' => 'Booking ID is required.'], 400);
    }

    $stmt = $pdo->prepare(
        "SELECT reference_number, total_price, downpayment_amount, balance_amount, lpg_addon
           FROM reservations
          WHERE reference_number = ? AND payment_status = 'Approved'"
    );
    $stmt->execute([$booking_id]);
    $booking = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$booking) {
        reservation_reply(['ok' => false, 'error' => 'Approved reservation not found.'], 404);
    }

    $total_price = floatval($booking['total_price']);
    $downpayment = floatval($booking['downpayment_amount']);
    $lpg_str     = trim((string)($booking['lpg_addon'] ?? 'No'));
    $has_lpg     = stripos($lpg_str, 'Yes') === 0;

    if ($remove_lpg && $has_lpg) {
        $total_price = max($downpayment, $total_price - 500);
        $lpg_str     = 'No (Cancelled at resort)';
    }

    $walkin_amount = floatval($booking['balance_amount']);
    if ($remove_lpg && $has_lpg) {
        $walkin_amount = $total_price - $downpayment;
    } elseif ($walkin_amount <= 0) {
        $walkin_amount = $total_price - $downpayment;
    }

    if ($walkin_amount <= 0) {
        reservation_reply(['ok' => false, 'error' => 'No outstanding balance found for this reservation.'], 400);
    }

    $update = $pdo->prepare(
        "UPDATE reservations
            SET total_price = ?,
                balance_amount = ?,
                lpg_addon = ?,
                walkin_payment = ?
          WHERE reference_number = ?"
    );
    $update->execute([$total_price, $walkin_amount, $lpg_str, $walkin_amount, $booking_id]);

    $audit_note = ($remove_lpg && $has_lpg)
        ? "Recorded walk-in balance of ₱{$walkin_amount} for reservation {$booking_id} (LPG add-on removed)."
        : "Recorded walk-in balance of ₱{$walkin_amount} for reservation {$booking_id}.";
    log_audit_action('SAVE_WALKIN_PAYMENT', $audit_note);

    reservation_reply([
        'ok'            => true,
        'message'       => 'Walk-in payment completed and added to Total Earned.',
        'walkin_amount' => $walkin_amount,
        'total_price'   => $total_price,
        'lpg_addon'     => $lpg_str
    ]);
}
/* ============================================================
   ACTION: download_receipt_pdf
   Generates and returns the official PDF receipt (Base64)
   identical to the one emailed to the customer.
   ============================================================ */
if ($action === 'download_receipt_pdf') {
    reservation_user(true);
    $booking_id = trim($data['bookingId'] ?? '');

    if (!$booking_id) {
        reservation_reply(['ok' => false, 'error' => 'Booking ID is required.'], 400);
    }

    $statement = $pdo->prepare('SELECT * FROM reservations WHERE reference_number = ? OR id = ?');
    $statement->execute([$booking_id, $booking_id]);
    $booking = $statement->fetch(PDO::FETCH_ASSOC);

    if (!$booking) {
        reservation_reply(['ok' => false, 'error' => 'Reservation not found.'], 404);
    }
    if (($booking['payment_status'] ?? '') !== 'Approved') {
        reservation_reply(['ok' => false, 'error' => 'Official receipt is only available for approved reservations.'], 409);
    }

    $actor_statement = $pdo->prepare('SELECT first_name, last_name, role FROM users WHERE id = ?');
    $actor_statement->execute([(int)$_SESSION['user_id']]);
    $actor = $actor_statement->fetch(PDO::FETCH_ASSOC);
    $actor_role = strtolower(trim($actor['role'] ?? 'admin'));
    $actor_label = in_array($actor_role, ['admin', 'administrator'], true) ? 'Admin' : 'Staff';
    $actor_name = trim(($actor['first_name'] ?? '') . ' ' . ($actor['last_name'] ?? ''));
    if ($actor_name === '') {
        $actor_name = trim($_SESSION['user_name'] ?? $_SESSION['user_email'] ?? 'Poolside Villa');
    }

    require_once __DIR__ . '/reservation_email.php';

    try {
        $pdf_binary = build_reservation_receipt_pdf($booking, $actor_label . ' ' . $actor_name);
        $safe_ref = preg_replace('/[^A-Za-z0-9_-]/', '-', $booking['reference_number'] ?? $booking_id);
        reservation_reply([
            'ok'       => true,
            'filename' => 'Poolside-Villa-Receipt-' . $safe_ref . '.pdf',
            'pdfBase64'=> base64_encode($pdf_binary)
        ]);
    } catch (\Throwable $e) {
        error_log('PDF receipt generation failed: ' . $e->getMessage());
        reservation_reply(['ok' => false, 'error' => 'Could not generate PDF receipt: ' . $e->getMessage()], 500);
    }
}
reservation_reply(['ok' => false, 'error' => 'Unknown action.'], 400);