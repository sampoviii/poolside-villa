<?php
/* ============================================================
   api/settings.php
   Resort settings, admin password management,
   and Caretaker account management using the `caretakers` table.
   ============================================================ */

if (session_status() === PHP_SESSION_NONE) {
    session_start([
        'cookie_httponly' => true,
        'cookie_samesite' => 'Lax'
    ]);
}

require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');

function settings_reply($data, $status = 200) {
    http_response_code($status);
    echo json_encode($data);
    exit;
}

function require_admin() {
    if (empty($_SESSION['user_id'])) {
        settings_reply(['ok' => false, 'error' => 'Please log in to perform this action.'], 401);
    }
    $role = strtolower(trim($_SESSION['role'] ?? 'admin'));
    if ($role !== 'admin' && $role !== 'administrator') {
        settings_reply(['ok' => false, 'error' => 'Administrator access required.'], 403);
    }
}

$raw_input = file_get_contents('php://input');
$data = json_decode($raw_input, true) ?? [];
$action = $data['action'] ?? '';

/* ---- ACTION 1: GET RESORT SETTINGS ---- */
if ($action === 'get') {
    try {
        $stmt = $pdo->query('SELECT setting_key, setting_value FROM settings');
        $settings = [];
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $settings[$row['setting_key']] = $row['setting_value'];
        }
        settings_reply([
            'ok'          => true,
            'gcashNumber' => $settings['gcash_number'] ?? '',
            'gcashQr'     => $settings['gcash_qr']     ?? ''
        ]);
    } catch (Exception $e) {
        settings_reply(['ok' => false, 'error' => 'Failed to load resort settings.'], 500);
    }
}

/* ---- ACTION 2: SAVE RESORT SETTINGS ---- */
if ($action === 'save') {
    require_admin();
    $number = trim($data['gcashNumber'] ?? '');
    $qr     = trim($data['gcashQr']     ?? '');

    try {
        $stmt = $pdo->prepare(
            'INSERT INTO settings (setting_key, setting_value) 
             VALUES (?, ?) 
             ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)'
        );
        $stmt->execute(['gcash_number', $number]);
        $stmt->execute(['gcash_qr', $qr]);

        log_audit_action('UPDATE_SETTINGS', 'Modified resort GCash payment details.');

        settings_reply(['ok' => true, 'message' => 'GCash payment details updated successfully.']);
    } catch (Exception $e) {
        settings_reply(['ok' => false, 'error' => 'Could not save payment details.'], 500);
    }
}

/* ---- ACTION 3: CHANGE ADMIN PASSWORD ---- */
if ($action === 'change_password') {
    require_admin();
    $current_password = $data['currentPassword'] ?? '';
    $new_password     = $data['newPassword']     ?? '';

    if (!$current_password || !$new_password) {
        settings_reply(['ok' => false, 'error' => 'Please provide both current and new passwords.'], 400);
    }
    if (strlen($new_password) < 8 || !preg_match('/[A-Z]/', $new_password) ||
        !preg_match('/[a-z]/', $new_password) || !preg_match('/[0-9]/', $new_password) ||
        !preg_match('/[^A-Za-z0-9]/', $new_password)) {
        settings_reply(['ok' => false, 'error' => 'Password must be at least 8 characters and include uppercase, lowercase, number, and special character.'], 400);
    }

    $admin_id = (int)$_SESSION['user_id'];
    $stmt = $pdo->prepare('SELECT password FROM users WHERE id = ?');
    $stmt->execute([$admin_id]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$user || !password_verify($current_password, $user['password'])) {
        settings_reply(['ok' => false, 'error' => 'Current password is incorrect.'], 400);
    }

    $new_hash = password_hash($new_password, PASSWORD_BCRYPT);
    $update = $pdo->prepare('UPDATE users SET password = ? WHERE id = ?');
    $update->execute([$new_hash, $admin_id]);

    log_audit_action('UPDATE_PASSWORD', 'Administrator changed account password.');

    settings_reply(['ok' => true, 'message' => 'Password updated successfully.']);
}

/* ---- ACTION 4: LIST CARETAKERS (DEDICATED TABLE) ---- */
if ($action === 'list_caretakers' || $action === 'get_staff') {
    require_admin();
    try {
        $stmt = $pdo->query(
            "SELECT id, first_name, last_name, email, phone, created_at 
               FROM caretakers 
           ORDER BY created_at DESC"
        );
        $caretakers = $stmt->fetchAll(PDO::FETCH_ASSOC);

        settings_reply(['ok' => true, 'caretakers' => $caretakers]);
    } catch (Exception $e) {
        settings_reply(['ok' => false, 'error' => 'Could not fetch caretaker list from database.'], 500);
    }
}

/* ---- ACTION 5: CREATE CARETAKER (DEDICATED TABLE) ---- */
if ($action === 'create_caretaker' || $action === 'add_staff') {
    require_admin();

    $first_name = trim($data['firstName'] ?? '');
    $last_name  = trim($data['lastName']  ?? '');
    $email      = strtolower(trim($data['email'] ?? ''));
    $phone      = trim($data['phone']     ?? '');
    $password   = trim($data['password']  ?? '');

    if (!$first_name || !$email || !$password) {
        settings_reply(['ok' => false, 'error' => 'First name, email, and password are required.'], 400);
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        settings_reply(['ok' => false, 'error' => 'Please enter a valid email address.'], 400);
    }

    /* Check if email exists in caretakers table */
    $check = $pdo->prepare('SELECT id FROM caretakers WHERE LOWER(email) = ?');
    $check->execute([$email]);
    if ($check->fetch()) {
        settings_reply(['ok' => false, 'error' => 'A caretaker account with this email already exists.'], 409);
    }

    $hashed_password = password_hash($password, PASSWORD_BCRYPT);

    $stmt = $pdo->prepare(
        "INSERT INTO caretakers 
            (first_name, last_name, email, phone, password, created_at)
         VALUES (?, ?, ?, ?, ?, NOW())"
    );

    try {
        $stmt->execute([$first_name, $last_name, $email, $phone, $hashed_password]);
        
        log_audit_action('CREATE_CARETAKER', "Created new caretaker account for {$email}.");

        settings_reply(['ok' => true, 'message' => 'Caretaker account created successfully.']);
    } catch (PDOException $e) {
        error_log('Caretaker creation error: ' . $e->getMessage());
        settings_reply(['ok' => false, 'error' => 'Database error while creating caretaker account.'], 500);
    }
}

/* ---- ACTION 6: DELETE CARETAKER (DEDICATED TABLE) ---- */
if ($action === 'delete_caretaker' || $action === 'remove_staff') {
    require_admin();
    $caretaker_id = (int)($data['id'] ?? 0);

    if (!$caretaker_id) {
        settings_reply(['ok' => false, 'error' => 'Invalid caretaker account ID.'], 400);
    }

    try {
        $stmt = $pdo->prepare("DELETE FROM caretakers WHERE id = ?");
        $stmt->execute([$caretaker_id]);

        if ($stmt->rowCount() === 0) {
            settings_reply(['ok' => false, 'error' => 'Caretaker account not found in database.'], 404);
        }

        log_audit_action('DELETE_CARETAKER', "Deleted caretaker account ID {$caretaker_id}.");

        settings_reply(['ok' => true, 'message' => 'Caretaker account removed from database.']);
    } catch (Exception $e) {
        settings_reply(['ok' => false, 'error' => 'Could not delete caretaker account.'], 500);
    }
}

settings_reply(['ok' => false, 'error' => 'Unknown action.'], 400);