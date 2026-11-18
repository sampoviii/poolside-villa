<?php
/* ============================================================
   config.php — Automatic Localhost & InfinityFree Database Config
   ============================================================ */

$is_local = ($_SERVER['SERVER_NAME'] === 'localhost' || $_SERVER['SERVER_NAME'] === '127.0.0.1');

// Start the session before API files read the signed-in user's details.
if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

if ($is_local) {
    // Localhost (XAMPP) Configuration
    $db_host = 'localhost';
    $db_user = 'root';
    $db_pass = '';
    $db_name = 'poolside_villa';
} else {
    $db_host = 'sql210.infinityfree.com';
    $db_user = 'if0_43034985';
    $db_pass = 'PoolSideVilla';
    $db_name = 'if0_43034985_poolside_villa';
}

try {
    // Share one PDO connection with the API endpoint that included this file.
    // Exception mode lets each endpoint return a clear database error.
    $pdo = new PDO("mysql:host=$db_host;dbname=$db_name;charset=utf8mb4", $db_user, $db_pass, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ]);
} catch (PDOException $e) {
    header('Content-Type: application/json');
    echo json_encode([
        'ok'    => false,
        'error' => 'Database connection failed: ' . $e->getMessage()
    ]);
    exit;
}

function log_audit_action($action_type, $details) {
    global $pdo;
    if (!isset($pdo) || empty($_SESSION['user_email'])) return;

    try {
        // Store the current account and browser details with the action so
        // administrators can later see who changed what.
        $stmt = $pdo->prepare(
            "INSERT INTO audit_logs (user_name, user_email, role, action_type, details, user_agent, created_at)
             VALUES (?, ?, ?, ?, ?, ?, NOW())"
        );
        $stmt->execute([
            $_SESSION['user_name'] ?? ($_SESSION['fullName'] ?? 'Staff'),
            $_SESSION['user_email'],
            $_SESSION['role'] ?? 'admin',
            $action_type,
            $details,
            $_SERVER['HTTP_USER_AGENT'] ?? 'Unknown Device'
        ]);
    } catch (Exception $e) {
        // An audit logging problem should not interrupt the main account action.
    }
}
