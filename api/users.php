<?php
/* ============================================================
   api/users.php
   User & Caretaker management API for Admin module.
   ============================================================ */

if (session_status() === PHP_SESSION_NONE) {
    session_start([
        'cookie_httponly' => true,
        'cookie_samesite' => 'Lax'
    ]);
}

require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');

function users_reply($data, $status = 200) {
    http_response_code($status);
    echo json_encode($data);
    exit;
}

// Check the session before allowing any caretaker account changes.
function require_admin() {
    if (empty($_SESSION['user_id'])) {
        users_reply(['ok' => false, 'error' => 'Please log in to perform this action.'], 401);
    }
    $role = strtolower(trim($_SESSION['role'] ?? 'admin'));
    if ($role !== 'admin' && $role !== 'administrator') {
        users_reply(['ok' => false, 'error' => 'Administrator access required.'], 403);
    }
}

$raw_input = file_get_contents('php://input');
$data = json_decode($raw_input, true) ?? [];
$action = $data['action'] ?? '';

/* ---- AUTO-MIGRATIONS (self-installing, safe to run on every request) ---- */
try {
    // Fix the role ENUM to include all required values.
    $pdo->exec("ALTER TABLE users MODIFY COLUMN role ENUM('admin','administrator','caretaker','customer') NOT NULL DEFAULT 'customer'");
} catch (PDOException $e) { /* already up-to-date */ }

try {
    // Add is_active column for caretaker activate/deactivate feature.
    $pdo->exec("ALTER TABLE users ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER role");
} catch (PDOException $alter_err) {
    // Column already exists — safe to ignore.
}

/* ---- ACTION 1: LIST CARETAKERS ---- */
if ($action === 'list_caretakers') {
    require_admin();
    try {
        $stmt = $pdo->query(
            "SELECT id, first_name, last_name, email, phone, is_active, created_at 
               FROM users
              WHERE role = 'caretaker'
           ORDER BY created_at DESC"
        );
        $caretakers = $stmt->fetchAll(PDO::FETCH_ASSOC);

        users_reply(['ok' => true, 'caretakers' => $caretakers]);
    } catch (Exception $e) {
        error_log('Caretaker list error: ' . $e->getMessage());
        users_reply(['ok' => false, 'error' => 'Could not fetch caretaker list from database.'], 500);
    }
}

/* ---- ACTION 2: CREATE CARETAKER ---- */
if ($action === 'create_caretaker') {
    require_admin();

    // Clean up and validate the account details before creating a staff record.
    $first_name = trim($data['firstName'] ?? '');
    $last_name  = trim($data['lastName']  ?? '');
    $email      = strtolower(trim($data['email'] ?? ''));
    $phone      = preg_replace('/[\s()-]/', '', trim($data['phone'] ?? ''));
    $password   = trim($data['password']  ?? '');

    if (!$first_name || !$email || !$password) {
        users_reply(['ok' => false, 'error' => 'First name, email, and password are required.'], 400);
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        users_reply(['ok' => false, 'error' => 'Please enter a valid email address.'], 400);
    }
    if ($phone !== '' && !preg_match('/^09\d{9}$/', $phone)) {
        users_reply(['ok' => false, 'error' => 'Phone number must be 11 digits starting with 09.'], 400);
    }

    if (strlen($password) < 8 || !preg_match('/[A-Z]/', $password) ||
        !preg_match('/[a-z]/', $password) || !preg_match('/[0-9]/', $password) ||
        !preg_match('/[^A-Za-z0-9]/', $password)) {
        users_reply(['ok' => false, 'error' => 'Password must be at least 8 characters and include uppercase, lowercase, number, and special character.'], 400);
    }

    $check = $pdo->prepare('SELECT id FROM users WHERE LOWER(email) = ?');
    $check->execute([$email]);
    if ($check->fetch()) {
        users_reply(['ok' => false, 'error' => 'An account with this email already exists.'], 409);
    }

    // Store a password hash rather than the password entered by the admin.
    $hashed_password = password_hash($password, PASSWORD_BCRYPT);

    // Build the INSERT dynamically in case is_active column doesn't exist yet on older DBs.
    try {
        $stmt = $pdo->prepare(
            "INSERT INTO users
                (first_name, last_name, email, phone, password, role, is_active)
             VALUES (?, ?, ?, ?, ?, 'caretaker', 1)"
        );
        $stmt->execute([$first_name, $last_name, $email, $phone, $hashed_password]);
    } catch (PDOException $e) {
        if (strpos($e->getMessage(), 'is_active') !== false || strpos($e->getMessage(), 'Unknown column') !== false) {
            // Fallback: is_active column doesn't exist yet, insert without it
            $stmt = $pdo->prepare(
                "INSERT INTO users
                    (first_name, last_name, email, phone, password, role)
                 VALUES (?, ?, ?, ?, ?, 'caretaker')"
            );
            try {
                $stmt->execute([$first_name, $last_name, $email, $phone, $hashed_password]);
            } catch (PDOException $e2) {
                error_log('Caretaker creation error (fallback): ' . $e2->getMessage());
                users_reply(['ok' => false, 'error' => 'Database error while creating caretaker account.'], 500);
            }
        } else {
            error_log('Caretaker creation error: ' . $e->getMessage());
            users_reply(['ok' => false, 'error' => 'Database error while creating caretaker account.'], 500);
        }
    }

    log_audit_action('CREATE_CARETAKER', "Created new caretaker account for {$email}.");

    users_reply(['ok' => true, 'message' => 'Caretaker account created successfully.']);
}

/* ---- ACTION 3: TOGGLE CARETAKER ACTIVE STATUS (Activate / Deactivate) ---- */
if ($action === 'toggle_caretaker_status') {
    require_admin();
    $caretaker_id = (int)($data['id'] ?? 0);
    $new_status   = (int)($data['is_active'] ?? 1); // 1 = active, 0 = inactive

    if (!$caretaker_id) {
        users_reply(['ok' => false, 'error' => 'Invalid caretaker account ID.'], 400);
    }

    // Auto-add is_active column if it was created before this migration.
    try {
        $pdo->exec("ALTER TABLE users ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER role");
    } catch (PDOException $alter_err) {
        // Column already exists — safe to ignore.
    }

    try {
        $stmt = $pdo->prepare("UPDATE users SET is_active = ? WHERE id = ? AND role = 'caretaker'");
        $stmt->execute([$new_status, $caretaker_id]);

        if ($stmt->rowCount() === 0) {
            users_reply(['ok' => false, 'error' => 'Caretaker account not found.'], 404);
        }

        $status_label = $new_status ? 'activated' : 'deactivated';
        log_audit_action('TOGGLE_CARETAKER_STATUS', "Caretaker account ID {$caretaker_id} {$status_label}.");

        users_reply(['ok' => true, 'message' => 'Caretaker account ' . $status_label . ' successfully.', 'is_active' => $new_status]);
    } catch (Exception $e) {
        users_reply(['ok' => false, 'error' => 'Could not update caretaker status.'], 500);
    }
}

/* ---- ACTION 4: RESET CARETAKER PASSWORD ---- */
if ($action === 'reset_caretaker_password') {
    require_admin();
    // Validate the new password and update only a caretaker account.
    $caretaker_id = (int)($data['id'] ?? 0);
    $new_password = trim($data['newPassword'] ?? '');

    if (!$caretaker_id || !$new_password) {
        users_reply(['ok' => false, 'error' => 'Caretaker ID and new password are required.'], 400);
    }

    if (strlen($new_password) < 8 || !preg_match('/[A-Z]/', $new_password) ||
        !preg_match('/[a-z]/', $new_password) || !preg_match('/[0-9]/', $new_password) ||
        !preg_match('/[^A-Za-z0-9]/', $new_password)) {
        users_reply(['ok' => false, 'error' => 'Password must be at least 8 characters and include uppercase, lowercase, number, and special character.'], 400);
    }

    $hashed_password = password_hash($new_password, PASSWORD_BCRYPT);

    try {
        $stmt = $pdo->prepare("UPDATE users SET password = ? WHERE id = ? AND role = 'caretaker'");
        $stmt->execute([$hashed_password, $caretaker_id]);

        if ($stmt->rowCount() === 0) {
            users_reply(['ok' => false, 'error' => 'Caretaker account not found.'], 404);
        }

        log_audit_action('RESET_CARETAKER_PASSWORD', "Reset password for caretaker account ID {$caretaker_id}.");

        users_reply(['ok' => true, 'message' => 'Caretaker password updated successfully.']);
    } catch (Exception $e) {
        users_reply(['ok' => false, 'error' => 'Could not reset caretaker password.'], 500);
    }
}

users_reply(['ok' => false, 'error' => 'Unknown action.'], 400);