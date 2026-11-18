<?php
/* ============================================================
   auth.php — Authentication API (Admin, Caretakers, Customers)
   This file handles sign-in, sign-out, account creation, and
   password changes. Each request sends back a JSON response.
   ============================================================ */

// Keep the login session available across requests, and make its cookie
// harder for browser scripts and cross-site requests to misuse.
if (session_status() === PHP_SESSION_NONE) {
    session_start([
        'cookie_httponly' => true,
        'cookie_samesite' => 'Lax'
    ]);
}

// The website runs locally during development. Allow requests from localhost
// and include credentials so the browser can send the user's session cookie.
$origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';
if (preg_match('#^https?://localhost(:\d+)?$#', $origin)) {
    header('Access-Control-Allow-Origin: ' . $origin);
} else {
    header('Access-Control-Allow-Origin: http://localhost');
}
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Content-Type: application/json; charset=utf-8');

// Browsers send this check before some cross-origin requests. It only needs
// the headers above, so finish the request before loading the database.
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once 'config.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

require_once __DIR__ . '/PHPMailer/Exception.php';
require_once __DIR__ . '/PHPMailer/PHPMailer.php';
require_once __DIR__ . '/PHPMailer/SMTP.php';

// Read the JSON request body once. An empty or invalid JSON body becomes an
// empty array so each action can safely look for its own fields.
$input = file_get_contents('php://input');
$data  = json_decode($input, true) ?? [];
$action = $data['action'] ?? '';

/* ────────────────────────────────────────────────────────────
   ACTION: GET PROFILE
   ──────────────────────────────────────────────────────────── */
if ($action === 'get_profile') {
    // A profile is private, so only return it for a logged-in session.
    if (empty($_SESSION['user_id'])) {
        echo json_encode(['ok' => false, 'error' => 'Please log in first.']);
        exit;
    }

    $role = $_SESSION['role'] ?? 'customer';

    // Use the session's account ID rather than an ID supplied by the browser.
    $stmt = $pdo->prepare('SELECT first_name, last_name, email, phone FROM users WHERE id = ?');
    $stmt->execute([$_SESSION['user_id']]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$user) {
        echo json_encode(['ok' => false, 'error' => 'Account not found.']);
        exit;
    }

    echo json_encode([
        'ok'        => true,
        'firstName' => $user['first_name'],
        'lastName'  => $user['last_name'],
        'fullName'  => trim($user['first_name'] . ' ' . $user['last_name']),
        'email'     => $user['email'],
        'phone'     => $user['phone'],
        'role'      => $role
    ]);
    exit;
}

/* ────────────────────────────────────────────────────────────
   ACTION: LOGOUT
   ──────────────────────────────────────────────────────────── */
if ($action === 'logout') {
    // Record who signed out before clearing the session information.
    if (!empty($_SESSION['user_email'])) {
        log_audit_action('LOGOUT', ucfirst($_SESSION['role'] ?? 'User') . ' logged out of the portal.');
    }
    $_SESSION = [];
    session_destroy();
    echo json_encode(['ok' => true, 'message' => 'Logged out.']);
    exit;
}

// All remaining actions change data or send a code, so only accept POST.
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['ok' => false, 'error' => 'Invalid request method.']);
    exit;
}

/* ────────────────────────────────────────────────────────────
   ACTION: CHANGE PASSWORD (Customers Only)
   ──────────────────────────────────────────────────────────── */
if ($action === 'change_password') {
    // This endpoint is for a signed-in customer, not an admin or caretaker.
    if (empty($_SESSION['user_id'])) {
        http_response_code(401);
        echo json_encode(['ok' => false, 'error' => 'Please log in to change your password.']);
        exit;
    }

    if (strtolower(trim($_SESSION['role'] ?? 'customer')) !== 'customer') {
        http_response_code(403);
        echo json_encode(['ok' => false, 'error' => 'Only customer accounts can change passwords here.']);
        exit;
    }

    $currentPassword = $data['currentPassword'] ?? '';
    $newPassword = $data['newPassword'] ?? '';
    $confirmPassword = $data['confirmPassword'] ?? '';

    // Check required fields and password strength before querying the database.
    if (!$currentPassword || !$newPassword || !$confirmPassword) {
        echo json_encode(['ok' => false, 'error' => 'Please fill in all password fields.']);
        exit;
    }

    if (strlen($newPassword) < 8 || !preg_match('/[A-Z]/', $newPassword) ||
        !preg_match('/[a-z]/', $newPassword) || !preg_match('/[0-9]/', $newPassword) ||
        !preg_match('/[^A-Za-z0-9]/', $newPassword)) {
        echo json_encode(['ok' => false, 'error' => 'Password must be at least 8 characters and include uppercase, lowercase, number, and special character.']);
        exit;
    }

    if ($newPassword !== $confirmPassword) {
        echo json_encode(['ok' => false, 'error' => 'New passwords do not match.']);
        exit;
    }

    try {
        // Verify the current password first, so a stolen session alone cannot
        // be used to replace the account password.
        $statement = $pdo->prepare('SELECT password FROM users WHERE id = ? AND role = ?');
        $statement->execute([(int)$_SESSION['user_id'], 'customer']);
        $user = $statement->fetch(PDO::FETCH_ASSOC);

        if (!$user || !password_verify($currentPassword, $user['password'])) {
            echo json_encode(['ok' => false, 'error' => 'Current password is incorrect.']);
            exit;
        }

        // Store only a one-way password hash, never the readable password.
        $newHash = password_hash($newPassword, PASSWORD_DEFAULT);
        $update = $pdo->prepare('UPDATE users SET password = ? WHERE id = ? AND role = ?');
        $update->execute([$newHash, (int)$_SESSION['user_id'], 'customer']);

        if ($update->rowCount() !== 1) {
            echo json_encode(['ok' => false, 'error' => 'Password was not changed. Please try again.']);
            exit;
        }

        log_audit_action('UPDATE_PASSWORD', 'Customer changed account password.');
        echo json_encode(['ok' => true, 'message' => 'Password updated successfully.']);
    } catch (PDOException $e) {
        error_log('Customer password update failed: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'Could not update your password. Please try again.']);
    }
    exit;
}

/* ────────────────────────────────────────────────────────────
   ACTION: REGISTER (Customers Only)
   ──────────────────────────────────────────────────────────── */
if ($action === 'register') {
    // Clean up user-entered values before validating or saving them.
    // Phone separators are removed so formatted numbers are checked consistently.
    $firstName       = trim($data['firstName'] ?? '');
    $lastName        = trim($data['lastName'] ?? '');
    $rawEmail        = trim($data['email'] ?? '');
    $email           = strtolower($rawEmail);
    $phone           = preg_replace('/[\s()-]/', '', trim($data['phone'] ?? ''));
    $password        = $data['password'] ?? '';
    $confirmPassword = $data['confirmPassword'] ?? '';

    // Reject incomplete or invalid data before it reaches the database.
    if (!$firstName || !$lastName || !$email || !$phone || !$password) {
        echo json_encode(['ok' => false, 'error' => 'Please fill in all required fields.']);
        exit;
    }

    if (($data['privacyAgreement'] ?? false) !== true) {
        echo json_encode(['ok' => false, 'error' => 'Please agree to the Data Privacy Agreement.']);
        exit;
    }

    if ($rawEmail !== $email || !filter_var($email, FILTER_VALIDATE_EMAIL) || !preg_match('/^[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,10}$/', $email)) {
        echo json_encode(['ok' => false, 'error' => 'This email is not valid. Use lowercase letters and a valid email domain.']);
        exit;
    }

    $emailDomain = substr(strrchr($email, '@'), 1);
    $blockedDomains = [
        '10minutemail.com', '10minutemail.net', '20minutemail.com', '33mail.com',
        'anonbox.net', 'binkmail.com', 'bobmail.info', 'burnermail.io',
        'cool.fr.nf', 'courriel.fr.nf', 'crazymailing.com', 'deadaddress.com',
        'discard.email', 'discardmail.com', 'discardmail.de', 'disposable.com',
        'disposableaddress.com', 'disposableemailaddresses.com', 'dispostable.com',
        'dodgeit.com', 'dodgit.com', 'dropmail.me', 'dumpmail.de',
        'e4ward.com', 'emailondeck.com', 'emailtemporario.com.br', 'example.com',
        'example.net', 'example.org', 'fakeinbox.com', 'fakemail.net',
        'fakemailgenerator.com', 'filzmail.com', 'getairmail.com', 'getnada.com',
        'guerrillamail.biz', 'guerrillamail.com', 'guerrillamail.de', 'guerrillamail.info',
        'guerrillamail.net', 'guerrillamail.org', 'guerrillamailblock.com', 'harakirimail.com',
        'incognitomail.com', 'inboxalias.com', 'inboxkitten.com', 'invalid.com',
        'jetable.org', 'junkmail.com', 'koszmail.pl', 'kurzepost.de',
        'localhost', 'mailcatch.com', 'maildrop.cc', 'mailexpire.com',
        'mailforspam.com', 'mailfreeonline.com', 'mailinator.com', 'mailinator.net',
        'mailinator.org', 'mailinator2.com', 'mailismagic.com', 'mailnesia.com',
        'mailnull.com', 'mailsac.com', 'mailscrap.com', 'mailtemp.info',
        'mintemail.com', 'mohmal.com', 'moakt.com', 'mt2015.com',
        'my10minutemail.com', 'mytemp.email', 'mytrashmail.com', 'nada.email',
        'no-spam.ws', 'nospam.ze.tc', 'nowmymail.com', 'objectmail.com',
        'oneoffemail.com', 'owlpic.com', 'pokemail.net', 'proxymail.eu',
        'putthisinyourspamdatabase.com', 'rcpt.at', 'receiveee.com', 'rhyta.com',
        'sharklasers.com', 'shieldedmail.com', 'shitmail.me', 'sneakemail.com',
        'sofimail.com', 'spam4.me', 'spamavert.com', 'spambog.com',
        'spambog.de', 'spambog.ru', 'spambox.us', 'spamcero.com',
        'spamex.com', 'spamfree24.org', 'spamgourmet.com', 'spamhereplease.com',
        'spamhole.com', 'spaml.com', 'spammotel.com', 'spamobox.com',
        'spamslicer.com', 'spamspot.com', 'spamthis.co.uk', 'supergreatmail.com',
        'teleworm.us', 'temp-mail.io', 'temp-mail.org', 'temp-mail.ru',
        'tempail.com', 'tempalias.com', 'tempe-mail.com', 'tempemail.biz',
        'tempemail.co.za', 'tempemail.com', 'tempemail.net', 'tempinbox.co.uk',
        'tempinbox.com', 'tempmail.co', 'tempmail.com', 'tempmail.de',
        'tempmail.eu', 'tempmail.it', 'tempmail.net', 'tempmail.org',
        'tempmail.us', 'tempmail2.com', 'tempmailaddress.com', 'tempmailer.com',
        'tempomail.fr', 'temporaryemail.net', 'temporaryemail.us', 'temporaryforwarding.com',
        'temporaryinbox.com', 'temporarymailaddress.com', 'test.com', 'thankyou2010.com',
        'thisisnotmyrealemail.com', 'throwam.com', 'throwawayemailaddress.com', 'throwawaymail.com',
        'tmail.ws', 'tmailinator.com', 'trash-mail.at', 'trash-mail.com',
        'trash-mail.de', 'trash2009.com', 'trashemail.de', 'trashmail.at',
        'trashmail.com', 'trashmail.de', 'trashmail.me', 'trashmail.net',
        'trashmail.org', 'trashmailer.com', 'trashymail.com', 'trbvm.com',
        'turual.com', 'twinmail.de', 'tyldd.com', 'uggsrock.com',
        'upliftnow.com', 'venompen.com', 'veryrealemail.com', 'viditag.com',
        'viewcastmedia.com', 'webm4il.info', 'wegwerfadresse.de', 'wegwerfemail.com',
        'wegwerfemail.de', 'wegwerfmail.de', 'wegwerfmail.net', 'wegwerfmail.org',
        'wh4f.org', 'whatiaas.com', 'whatpaas.com', 'whyspam.me',
        'willselfdestruct.com', 'winemaven.info', 'wronghead.com', 'wuzup.net',
        'wuzupmail.net', 'wwwnew.eu', 'xagloo.com', 'xemaps.com',
        'xents.com', 'xmaily.com', 'xoxy.net', 'yep.it',
        'yogamaven.com', 'yopmail.com', 'yopmail.fr', 'yopmail.net',
        'yourdomain.com', 'ypmail.webarnak.fr.eu.org', 'yuurok.com', 'zehnminuten.de',
        'zehnminutenmail.de', 'zippymail.info', 'zoaxe.com', 'zoemail.org'
    ];
    foreach ($blockedDomains as $blocked) {
        if ($emailDomain === $blocked || substr($emailDomain, -(strlen($blocked) + 1)) === '.' . $blocked) {
            echo json_encode(['ok' => false, 'error' => 'Temporary or disposable email addresses are not allowed.']);
            exit;
        }
    }

    if (strlen($password) < 8 || !preg_match('/[A-Z]/', $password) ||
        !preg_match('/[a-z]/', $password) || !preg_match('/[0-9]/', $password) ||
        !preg_match('/[^A-Za-z0-9]/', $password)) {
        echo json_encode(['ok' => false, 'error' => 'Password must be at least 8 characters and include uppercase, lowercase, number, and special character.']);
        exit;
    }

    if ($password !== $confirmPassword) {
        echo json_encode(['ok' => false, 'error' => 'Passwords do not match.']);
        exit;
    }

    if (!preg_match('/^09\d{9}$/', $phone)) {
        echo json_encode(['ok' => false, 'error' => 'Phone number must be 11 digits starting with 09.']);
        exit;
    }

    try {
        // Prevent duplicate accounts. Prepared statements keep the email value
        // separate from the SQL command.
        $stmt = $pdo->prepare("SELECT id, role FROM users WHERE LOWER(email) = LOWER(?)");
        $stmt->execute([$email]);
        $existing = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if ($existing) {
            if ($existing['role'] === 'admin') {
                echo json_encode(['ok' => false, 'error' => 'This email address is reserved for administrator access.']);
                exit;
            }
            echo json_encode(['ok' => false, 'error' => 'An account with this email address already exists.']);
            exit;
        }

        // New public registrations always receive the customer role.
        $hashedPassword = password_hash($password, PASSWORD_DEFAULT);
        
        $stmt = $pdo->prepare("INSERT INTO users (first_name, last_name, email, phone, password, role) VALUES (?, ?, ?, ?, ?, 'customer')");
        $ok = $stmt->execute([$firstName, $lastName, $email, $phone, $hashedPassword]);

        if ($ok) {
            echo json_encode(['ok' => true, 'message' => 'Account created successfully! You can now log in.']);
        } else {
            echo json_encode(['ok' => false, 'error' => 'Could not create account. Please try again.']);
        }
    } catch (PDOException $e) {
        echo json_encode(['ok' => false, 'error' => 'Database error: ' . $e->getMessage()]);
    }
    exit;
}

/* ────────────────────────────────────────────────────────────
   ACTION: LOGIN (PRIORITY: 1. ADMIN, 2. CARETAKERS, 3. USERS)
   ──────────────────────────────────────────────────────────── */
if ($action === 'login') {
    $email    = strtolower(trim($data['email'] ?? ''));
    $password = $data['password'] ?? '';

    if (!$email || !$password) {
        echo json_encode(['ok' => false, 'error' => 'Please enter email and password.']);
        exit;
    }

    try {
        // Admin, caretaker, and customer accounts are all stored in users.
        $stmt = $pdo->prepare("SELECT *, role FROM users WHERE LOWER(email) = LOWER(?)");
        $stmt->execute([$email]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$user || !password_verify($password, $user['password'])) {
            echo json_encode(['ok' => false, 'error' => 'Invalid email or password.']);
            exit;
        }

        // Reject deactivated caretaker accounts before they can sign in.
        if ($user['role'] === 'caretaker' && isset($user['is_active']) && !(int)$user['is_active']) {
            echo json_encode(['ok' => false, 'error' => 'Your account has been deactivated. Please contact the administrator.']);
            exit;
        }

        // Give the signed-in user a new session ID to prevent session fixation.
        session_regenerate_id(true);

        $role                   = $user['role'] ?? 'customer';
        $_SESSION['user_id']    = (int)$user['id'];
        $_SESSION['user_email'] = $user['email'];
        $_SESSION['role']       = $role;
        $_SESSION['user_name']  = trim(($user['first_name'] ?? '') . ' ' . ($user['last_name'] ?? ''));

        $fullName = $_SESSION['user_name'];

        // Automatically log login event
        log_audit_action('LOGIN', ucfirst($role) . ' logged into the portal.');

        echo json_encode([
            'ok'        => true,
            'message'   => 'Login successful.',
            'fullName'  => $fullName,
            'firstName' => $user['first_name'] ?? '',
            'email'     => $user['email'],
            'role'      => $role
        ]);
    } catch (PDOException $e) {
        echo json_encode(['ok' => false, 'error' => 'Database error: ' . $e->getMessage()]);
    }
    exit;
}

/* ────────────────────────────────────────────────────────────
   ACTION: FORGOT PASSWORD STEP 1
   ──────────────────────────────────────────────────────────── */
if ($action === 'forgot_step1') {
    $email = strtolower(trim($data['email'] ?? ''));

    if (!$email) {
        echo json_encode(['ok' => false, 'error' => 'Please enter your email address.']);
        exit;
    }

    // Environment variables can hold deployment settings; the local config
    // file provides settings for development when those variables are absent.
    $mailConfigPath = __DIR__ . '/mail-config.php';
    $mailConfig = is_file($mailConfigPath) ? require $mailConfigPath : [];
    if (!is_array($mailConfig)) {
        error_log('Password reset mail configuration must return an array.');
        echo json_encode(['ok' => false, 'error' => 'Password reset email is not configured. Please contact the administrator.']);
        exit;
    }

    $smtpHost = trim((string)(getenv('SMTP_HOST') ?: ($mailConfig['host'] ?? 'smtp-relay.brevo.com')));
    $smtpUser = trim((string)(getenv('SMTP_USER') ?: ($mailConfig['username'] ?? '')));
    $smtpPass = trim((string)(getenv('SMTP_PASS') ?: ($mailConfig['password'] ?? '')));
    $smtpPort = (int)(getenv('SMTP_PORT') ?: ($mailConfig['port'] ?? 587));
    $smtpSecure = strtolower(trim((string)(getenv('SMTP_SECURE') ?: ($mailConfig['encryption'] ?? 'tls'))));
    $smtpFrom = trim((string)(getenv('SMTP_FROM') ?: ($mailConfig['from_email'] ?? '')));
    $smtpFromName = trim((string)(getenv('SMTP_FROM_NAME') ?: ($mailConfig['from_name'] ?? 'Poolside Villa')));
    if (!$smtpHost || !$smtpUser || !$smtpPass || !filter_var($smtpFrom, FILTER_VALIDATE_EMAIL) ||
        !in_array($smtpSecure, ['tls', 'ssl'], true) || $smtpPort < 1 || $smtpPort > 65535) {
        error_log('Password reset email is not configured: SMTP_USER, SMTP_PASS, and SMTP_FROM are required.');
        echo json_encode(['ok' => false, 'error' => 'Password reset email is not configured. Please contact the administrator.']);
        exit;
    }

    try {
        // Password reset by email is available to customer accounts only.
        $stmt = $pdo->prepare("SELECT id, first_name, role FROM users WHERE LOWER(email) = LOWER(?)");
        $stmt->execute([$email]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$user) {
            echo json_encode(['ok' => false, 'error' => 'No account found with that email address.']);
            exit;
        }

        if ($user['role'] !== 'customer') {
            echo json_encode(['ok' => false, 'error' => 'Admin and caretaker accounts cannot reset passwords via email. Please contact the administrator.']);
            exit;
        }

        // Save a short-lived verification code before sending it to the customer.
        $code = sprintf("%06d", mt_rand(100000, 999999));
        $expires = date('Y-m-d H:i:s', strtotime('+15 minutes'));

        $updateStmt = $pdo->prepare("UPDATE users SET reset_code = ?, reset_expires = ? WHERE id = ?");
        $updateStmt->execute([$code, $expires, $user['id']]);

        if (!class_exists('PHPMailer\PHPMailer\PHPMailer')) {
            echo json_encode(['ok' => false, 'error' => 'PHPMailer folder is missing in the api/ directory.']);
            exit;
        }

        $mail = new PHPMailer(true);
        $mail->isSMTP();
        $mail->Host       = $smtpHost;
        $mail->SMTPAuth   = true;
        $mail->Username   = $smtpUser;
        $mail->Password   = $smtpPass;
        $mail->SMTPSecure = $smtpSecure === 'ssl' ? PHPMailer::ENCRYPTION_SMTPS : PHPMailer::ENCRYPTION_STARTTLS;
        $mail->Port       = $smtpPort;
        $mail->Timeout    = 20;
        $mail->setFrom($smtpFrom, $smtpFromName);
        $mail->addAddress($email, $user['first_name']);

        $mail->isHTML(true);
        $mail->Subject = 'Password Reset Verification Code - Poolside Villa';
        $mail->Body    = "
            <div style='font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;'>
                <h2 style='color: #2b4c7e;'>Password Reset Verification Code</h2>
                <p>Hello <strong>" . htmlspecialchars($user['first_name']) . "</strong>,</p>
                <p>You requested a password reset for your Poolside Villa account. Use the code below to reset your password:</p>
                <div style='font-size: 28px; font-weight: bold; color: #0077b6; letter-spacing: 4px; padding: 12px; background: #f0f8ff; width: fit-content; border-radius: 6px; margin: 16px 0;'>
                    {$code}
                </div>
                <p style='color: #666; font-size: 13px;'>This code is valid for 15 minutes. If you did not request this, please ignore this email.</p>
            </div>
        ";

        // The customer must have access to this email account to get the code.
        $mail->send();

        echo json_encode(['ok' => true, 'message' => 'Verification code sent to your email address!']);
    } catch (Exception $e) {
        // Keep the detailed mail-provider message in the server log and show a
        // clearer next step to the user.
        $mailError = isset($mail) ? $mail->ErrorInfo : $e->getMessage();
        error_log('Password reset email delivery failed: ' . $mailError);

        if (stripos($mailError, 'unauthorized ip address') !== false) {
            $error = 'Brevo blocked this server IP. Add your public IP to Brevo authorized IPs, then try again.';
        } elseif (stripos($mailError, 'authenticat') !== false) {
            $error = 'Brevo rejected the SMTP login. Generate a new Brevo SMTP key and update api/mail-config.php.';
        } elseif (stripos($mailError, 'sender') !== false || stripos($mailError, 'from address') !== false) {
            $error = 'Brevo rejected the sender address. Verify the from_email address in your Brevo account.';
        } elseif (stripos($mailError, 'connect') !== false || stripos($mailError, 'timed out') !== false) {
            $error = 'Could not connect to Brevo SMTP. Check the network connection and SMTP port 587.';
        } else {
            $error = 'Could not send the verification email. Check the server error log or contact the administrator.';
        }

        echo json_encode(['ok' => false, 'error' => $error]);
    } catch (PDOException $e) {
        echo json_encode(['ok' => false, 'error' => 'Database error: ' . $e->getMessage()]);
    }
    exit;
}

/* ────────────────────────────────────────────────────────────
   ACTION: FORGOT PASSWORD STEP 2
   ──────────────────────────────────────────────────────────── */
if ($action === 'forgot_step2') {
    $email       = strtolower(trim($data['email'] ?? ''));
    $code        = trim($data['code'] ?? '');
    $newPassword = $data['newPassword'] ?? '';

    if (!$email || !$code || !$newPassword) {
        echo json_encode(['ok' => false, 'error' => 'Please fill in all required fields.']);
        exit;
    }

    if (strlen($newPassword) < 8 || !preg_match('/[A-Z]/', $newPassword) ||
        !preg_match('/[a-z]/', $newPassword) || !preg_match('/[0-9]/', $newPassword) ||
        !preg_match('/[^A-Za-z0-9]/', $newPassword)) {
        echo json_encode(['ok' => false, 'error' => 'Password must be at least 8 characters and include uppercase, lowercase, number, and special character.']);
        exit;
    }

    try {
        // The email, code, and expiry must all match before changing a password.
        $stmt = $pdo->prepare("SELECT id, reset_code, reset_expires FROM users WHERE LOWER(email) = LOWER(?)");
        $stmt->execute([$email]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$user) {
            echo json_encode(['ok' => false, 'error' => 'Account not found.']);
            exit;
        }

        if (!$user['reset_code'] || $user['reset_code'] !== $code) {
            echo json_encode(['ok' => false, 'error' => 'Invalid verification code. Please check your email inbox or spam folder.']);
            exit;
        }

        if (strtotime($user['reset_expires']) < time()) {
            echo json_encode(['ok' => false, 'error' => 'Verification code has expired. Please request a new code.']);
            exit;
        }

        // Hash the new password and clear the code so it cannot be reused.
        $hashed = password_hash($newPassword, PASSWORD_DEFAULT);
        $updateStmt = $pdo->prepare("UPDATE users SET password = ?, reset_code = NULL, reset_expires = NULL WHERE id = ?");
        $ok = $updateStmt->execute([$hashed, $user['id']]);

        if ($ok) {
            echo json_encode(['ok' => true, 'message' => 'Password reset successful! You can now log in with your new password.']);
        } else {
            echo json_encode(['ok' => false, 'error' => 'Failed to update password. Please try again.']);
        }
    } catch (PDOException $e) {
        echo json_encode(['ok' => false, 'error' => 'Database error: ' . $e->getMessage()]);
    }
    exit;
}

echo json_encode(['ok' => false, 'error' => 'Invalid action.']);
exit;