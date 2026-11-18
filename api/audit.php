<?php
/* ============================================================
   api/audit.php — Audit Trail Logs API
   ============================================================ */

if (session_status() === PHP_SESSION_NONE) {
    session_start([
        'cookie_httponly' => true,
        'cookie_samesite' => 'Lax'
    ]);
}

require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');

function audit_reply($data, $status = 200) {
    http_response_code($status);
    echo json_encode($data);
    exit;
}

$role = strtolower(trim($_SESSION['role'] ?? ''));
// Audit records can contain account activity, so only administrators may read them.
if (empty($_SESSION['user_id']) || ($role !== 'admin' && $role !== 'administrator')) {
    audit_reply(['ok' => false, 'error' => 'Administrator access required.'], 403);
}

$raw_input = file_get_contents('php://input');
$data = json_decode($raw_input, true) ?? [];
$action = $data['action'] ?? '';

if ($action === 'list_logs') {
    try {
        // Create the table here as a fallback for installations that have not
        // yet run the separate audit-log migration.
        $pdo->exec(
            "CREATE TABLE IF NOT EXISTS audit_logs (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                user_name VARCHAR(200) NOT NULL,
                user_email VARCHAR(150) NOT NULL,
                role VARCHAR(30) NOT NULL,
                action_type VARCHAR(100) NOT NULL,
                details TEXT NOT NULL,
                user_agent TEXT DEFAULT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                KEY audit_logs_created_at_idx (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );

        // Return the newest 100 events first so the page stays focused on
        // recent activity and does not load an unlimited history.
        $stmt = $pdo->query(
            "SELECT id, user_name, user_email, role, action_type, details, user_agent, created_at 
               FROM audit_logs 
           ORDER BY created_at DESC 
              LIMIT 500"
        );
        $logs = $stmt->fetchAll(PDO::FETCH_ASSOC);
        audit_reply(['ok' => true, 'logs' => $logs]);
    } catch (Exception $e) {
        error_log('Audit log list error: ' . $e->getMessage());
        audit_reply(['ok' => false, 'error' => 'Could not fetch audit logs: ' . $e->getMessage()], 500);
    }
}

audit_reply(['ok' => false, 'error' => 'Unknown action.'], 400);