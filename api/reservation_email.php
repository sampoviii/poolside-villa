<?php
/* ============================================================
   Reservation email helpers
   Builds the PDF receipt and sends reservation status messages
   to customers after staff review.
   ============================================================ */

// PDF text uses a limited character set, so convert unsupported characters
// and escape special characters before placing text into a PDF command.
function reservation_pdf_text($value) {
    $value = (string)$value;
    if (function_exists('iconv')) {
        $converted = iconv('UTF-8', 'Windows-1252//TRANSLIT//IGNORE', $value);
        if ($converted !== false) {
            $value = $converted;
        }
    }

    $value = preg_replace('/[^\x20-\x7E\x80-\xFF]/', '?', $value);
    return str_replace(
        ["\\", "(", ")", "\r", "\n"],
        ["\\\\", "\\(", "\\)", '', ' '],
        $value
    );
}

function build_reservation_receipt_pdf($booking, $reviewer) {
    // Draw the receipt using PDF commands so it can be attached without
    // requiring an extra PDF library.
    $page_height = 842;
    $logo_path = dirname(__DIR__) . '/assets/images/receipt-logo.jpg';
    if (!is_file($logo_path)) {
        throw new \RuntimeException('Reservation receipt logo is missing.');
    }
    $logo_info = getimagesize($logo_path);
    $logo_data = file_get_contents($logo_path);
    if (!$logo_info || $logo_info['mime'] !== 'image/jpeg' || $logo_data === false) {
        throw new \RuntimeException('Reservation receipt logo could not be loaded as a JPEG image.');
    }

    // Small drawing helpers keep the receipt layout easier to read below.
    $commands = [];
    $draw_rect = function($x, $top, $width, $height, $color) use (&$commands, $page_height) {
        $commands[] = sprintf(
            "%.3f %.3f %.3f rg %.2f %.2f %.2f %.2f re f",
            $color[0], $color[1], $color[2],
            $x, $page_height - $top - $height, $width, $height
        );
    };
    $draw_text = function($x, $top, $text, $size, $font, $color) use (&$commands, $page_height) {
        $commands[] = sprintf(
            "%.3f %.3f %.3f rg BT /%s %d Tf 1 0 0 1 %.2f %.2f Tm (%s) Tj ET",
            $color[0], $color[1], $color[2], $font, $size,
            $x, $page_height - $top, reservation_pdf_text($text)
        );
    };

    $forest = [0.102, 0.235, 0.173];
    $green = [0.176, 0.416, 0.310];
    $ink = [0.157, 0.145, 0.122];
    $muted = [0.388, 0.365, 0.325];
    $cream = [0.961, 0.953, 0.933];
    $soft_green = [0.910, 0.953, 0.933];
    $white = [1.00, 1.00, 1.00];
    $gold = [0.722, 0.580, 0.227];

    $draw_rect(0, 0, 595, $page_height, $cream);
    $draw_rect(0, 148, 595, $page_height - 148, $white);
    $draw_rect(0, 0, 595, 5, $forest);
    $draw_rect(0, 146, 595, 2, $green);
    $logo_width = 176;
    $logo_height = $logo_width * $logo_info[1] / $logo_info[0];
    $logo_x = 42;
    $logo_y = $page_height - 42 - $logo_height;
    $commands[] = sprintf(
        "q %.2f 0 0 %.2f %.2f %.2f cm /Logo Do Q",
        $logo_width, $logo_height, $logo_x, $logo_y
    );
    $draw_text(244, 39, 'PAYMENT RECEIPT', 9, 'F2', $gold);
    $draw_text(244, 68, 'Reservation Receipt', 20, 'F2', $forest);
    $draw_rect(244, 84, 213, 23, $soft_green);
    $draw_text(254, 100, 'APPROVED - DOWN PAYMENT RECEIVED', 7, 'F2', $green);

    $reference = $booking['reference_number'] ?? '';
    $draw_text(30, 180, 'BOOKING REFERENCE', 9, 'F2', $muted);
    $draw_text(170, 197, $reference, 15, 'F2', $forest);
    $draw_rect(30, 218, 535, 1, [0.87, 0.91, 0.90]);

    $visit_date = $booking['check_in'] ?? '';
    if ($visit_date && strtotime($visit_date) !== false) {
        $visit_date = date('F j, Y', strtotime($visit_date));
    }
    // Keep reservation details in a list so each row uses the same layout.
    $rows = [
        ['Customer', $booking['guest_name'] ?? 'Customer'],
        ['Visit date', $visit_date],
        ['Time', $booking['time_slot'] ?? ''],
        ['Package', $booking['package_name'] ?? ''],
        ['Guests', $booking['pax_range'] ?? ($booking['guests_count'] ?? '')],
        ['Reviewed by', $reviewer]
    ];
    $y = 246;
    foreach ($rows as $row) {
        $draw_text(30, $y, strtoupper($row[0]), 8, 'F2', $muted);
        $draw_text(240, $y, $row[1], 10, 'F1', $ink);
        $draw_rect(30, $y + 13, 535, 1, [0.92, 0.94, 0.93]);
        $y += 45;
    }

    // Break the amount into the same components shown in the booking flow.
    $total_price = (float)($booking['total_price'] ?? 0);
    $downpayment = (float)($booking['downpayment_amount'] ?? 0);
    $balance = (float)($booking['balance_amount'] ?? 0);
    $has_lpg = stripos(trim((string)($booking['lpg_addon'] ?? 'No')), 'Yes') === 0;
    $lpg_fee = $has_lpg ? 500.0 : 0.0;
    $package_subtotal = $total_price - $lpg_fee;
    $draw_rect(30, 535, 535, 181, $soft_green);
    $draw_text(50, 558, 'PRICE COMPUTATION', 10, 'F2', $green);
    $payment_rows = [
        ['Package subtotal', $package_subtotal],
        ['LPG add-on' . ($has_lpg ? ' (+PHP 500.00)' : ' (not selected)'), $lpg_fee],
        ['Total reservation cost', $total_price],
        ['Down payment (50% package + full LPG)', $downpayment],
        ['Remaining balance due', $balance]
    ];
    $payment_y = 583;
    foreach ($payment_rows as $index => $row) {
        $draw_text(50, $payment_y, $row[0], 8, $index > 1 ? 'F2' : 'F1', $ink);
        $draw_text(440, $payment_y, 'PHP ' . number_format($row[1], 2), 8, 'F2', $forest);
        $payment_y += 25;
    }

    $draw_text(30, 755, 'Thank you for choosing Poolside Villa.', 10, 'F2', $forest);
    $draw_text(30, 774, 'Please keep this receipt for your records.', 9, 'F1', $muted);
    $draw_text(452, 774, 'POOLSIDE VILLA', 8, 'F2', $green);

    $stream = implode("\n", $commands) . "\n";
    // Assemble the page, fonts, image, and drawing commands into a PDF file.
    $objects = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> /XObject << /Logo 7 0 R >> >> /Contents 6 0 R >>',
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
        '<< /Length ' . strlen($stream) . " >>\nstream\n" . $stream . 'endstream',
        '<< /Type /XObject /Subtype /Image /Width ' . $logo_info[0] .
            ' /Height ' . $logo_info[1] .
            ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' .
            strlen($logo_data) . " >>\nstream\n" . $logo_data . "\nendstream"
    ];

    $pdf = "%PDF-1.4\n";
    $offsets = [0];
    foreach ($objects as $index => $object) {
        $offsets[] = strlen($pdf);
        $pdf .= ($index + 1) . " 0 obj\n" . $object . "\nendobj\n";
    }
    $xref_offset = strlen($pdf);
    $pdf .= "xref\n0 " . (count($objects) + 1) . "\n";
    $pdf .= "0000000000 65535 f \n";
    for ($i = 1; $i <= count($objects); $i++) {
        $pdf .= sprintf("%010d 00000 n \n", $offsets[$i]);
    }
    $pdf .= "trailer\n<< /Size " . (count($objects) + 1) . " /Root 1 0 R >>\n";
    $pdf .= "startxref\n" . $xref_offset . "\n%%EOF";

    return $pdf;
}

function send_reservation_status_email($booking, $status, $reviewer, $admin_message) {
    // Load the mail library only when a reservation email is needed.
    require_once __DIR__ . '/PHPMailer/Exception.php';
    require_once __DIR__ . '/PHPMailer/PHPMailer.php';
    require_once __DIR__ . '/PHPMailer/SMTP.php';

    // Environment variables override the local mail settings on a deployed server.
    $mail_config_path = __DIR__ . '/mail-config.php';
    $mail_config = is_file($mail_config_path) ? require $mail_config_path : [];
    if (!is_array($mail_config)) {
        error_log('Reservation email configuration must return an array.');
        return false;
    }

    $smtp_host = trim((string)(getenv('SMTP_HOST') ?: ($mail_config['host'] ?? 'smtp-relay.brevo.com')));
    $smtp_user = trim((string)(getenv('SMTP_USER') ?: ($mail_config['username'] ?? '')));
    $smtp_pass = trim((string)(getenv('SMTP_PASS') ?: ($mail_config['password'] ?? '')));
    $smtp_port = (int)(getenv('SMTP_PORT') ?: ($mail_config['port'] ?? 587));
    $smtp_secure = strtolower(trim((string)(getenv('SMTP_SECURE') ?: ($mail_config['encryption'] ?? 'tls'))));
    $smtp_from = trim((string)(getenv('SMTP_FROM') ?: ($mail_config['from_email'] ?? '')));
    $smtp_from_name = trim((string)(getenv('SMTP_FROM_NAME') ?: ($mail_config['from_name'] ?? 'Poolside Villa')));
    $recipient = trim((string)($booking['guest_email'] ?? ''));
    $logo_path = dirname(__DIR__) . '/assets/images/receipt-logo-transparent.png';

    if (!$smtp_host || !$smtp_user || !$smtp_pass || !filter_var($smtp_from, FILTER_VALIDATE_EMAIL) ||
        !filter_var($recipient, FILTER_VALIDATE_EMAIL) ||
        !in_array($smtp_secure, ['tls', 'ssl'], true) || $smtp_port < 1 || $smtp_port > 65535) {
        error_log('Reservation status email was not sent: SMTP configuration or recipient is invalid.');
        return false;
    }
    if (!is_file($logo_path)) {
        error_log('Reservation status email was not sent: receipt logo is missing.');
        return false;
    }

    // Escape all booking details before inserting them into the HTML email.
    $escape = function($value) {
        return htmlspecialchars((string)$value, ENT_QUOTES, 'UTF-8');
    };
    $reference = $booking['reference_number'] ?? '';
    $guest_name = $booking['guest_name'] ?? 'Customer';
    $visit_date = $booking['check_in'] ?? '';
    $formatted_date = $visit_date && strtotime($visit_date) !== false
        ? date('F j, Y', strtotime($visit_date))
        : $visit_date;
    $approved = $status === 'Approved';
    $title = $approved ? 'Reservation Approved' : 'Reservation Declined';
    $subject = $title . ' - ' . $reference;

    // Use one shared list to create consistent HTML and plain-text details.
    $rows = [
        'Reservation reference' => $reference,
        'Customer' => $guest_name,
        'Visit date' => $formatted_date,
        'Time' => $booking['time_slot'] ?? '',
        'Package' => $booking['package_name'] ?? '',
        'Guests' => $booking['pax_range'] ?? ($booking['guests_count'] ?? ''),
        'Total price' => number_format((float)($booking['total_price'] ?? 0), 2),
        'Down payment (50% package + full LPG)' => number_format((float)($booking['downpayment_amount'] ?? 0), 2),
        'Remaining balance' => number_format((float)($booking['balance_amount'] ?? 0), 2),
        'Reviewed by' => $reviewer
    ];

    $details = '';
    foreach ($rows as $label => $value) {
        $details .= '<tr><td style="padding:8px;border-bottom:1px solid #ddd8cc;color:#635d53;">' .
            $escape($label) . '</td><td style="padding:8px;border-bottom:1px solid #eee;font-weight:600;">' .
            $escape($value) . '</td></tr>';
    }

    // Send an HTML version for the designed email and a plain-text fallback
    // for mail apps that do not display HTML.
    $message = $approved
        ? 'Your reservation has been approved. Please find your downloadable PDF receipt attached to this email.'
        : 'Your reservation was declined. Please contact Poolside Villa if you need more information.';
    $body = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3ee;padding:28px 12px;font-family:Arial,sans-serif;color:#28251f;">' .
        '<tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#fff;border-radius:14px;overflow:hidden;">' .
        '<tr><td style="background:#f5f3ee;padding:24px 32px;border-top:6px solid #1a3d2b;border-bottom:5px solid #b8943a;">' .
        '<table role="presentation" cellpadding="0" cellspacing="0"><tr>' .
        '<td style="padding:5px 8px;">' .
        '<img src="cid:poolside-villa-logo" alt="Poolside Villa" width="150" style="display:block;width:150px;height:auto;border:0;"></td>' .
        '<td style="padding-left:22px;color:#1a3d2b;"><div style="font-size:11px;color:#9a7828;font-weight:bold;letter-spacing:1.5px;">PAYMENT RECEIPT</div>' .
        '<h2 style="color:#1a3d2b;margin:7px 0 0;font-size:23px;">' . ($approved ? 'Reservation Receipt' : $escape($title)) . '</h2>' .
        ($approved
            ? '<span style="display:inline-block;margin-top:8px;padding:4px 10px;border-radius:20px;background:#e8f3ee;color:#16803c;font-size:10px;font-weight:bold;">APPROVED - DOWN PAYMENT RECEIVED</span>'
            : '<span style="display:inline-block;margin-top:8px;padding:4px 10px;border-radius:20px;background:#fce8e9;color:#b42318;font-size:10px;font-weight:bold;">' . strtoupper($escape($status)) . '</span>') .
        '</td>' .
        '</tr></table></td></tr>' .
        '<tr><td style="padding:28px 32px;"><p>Hello ' . $escape($guest_name) . ',</p>' .
        '<p style="line-height:1.6;">' . $escape($message) . '</p>' .
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:20px;">' . $details . '</table>' .
        ($admin_message !== ''
            ? '<p style="background:#fdf4e0;border-left:4px solid #b8943a;padding:12px;"><strong>Message from the resort:</strong><br>' . nl2br($escape($admin_message)) . '</p>'
            : '') .
        '<p style="margin-top:24px;">Thank you,<br><strong>Poolside Villa</strong></p></td></tr>' .
        '<tr><td style="background:#f2f8f5;padding:14px 32px;color:#635d53;font-size:12px;">Reservation update · ' . $escape($reference) . '</td></tr>' .
        '</table></td></tr></table>';

    $plain_lines = [$title, '', 'Hello ' . $guest_name . ',', $message, ''];
    foreach ($rows as $label => $value) {
        $plain_lines[] = $label . ': ' . $value;
    }
    if ($admin_message !== '') {
        $plain_lines[] = '';
        $plain_lines[] = 'Message from the resort: ' . $admin_message;
    }
    $plain_lines[] = '';
    $plain_lines[] = 'Poolside Villa';

    try {
        $mail = new \PHPMailer\PHPMailer\PHPMailer(true);
        $mail->isSMTP();
        $mail->Host = $smtp_host;
        $mail->SMTPAuth = true;
        $mail->Username = $smtp_user;
        $mail->Password = $smtp_pass;
        $mail->SMTPSecure = $smtp_secure === 'ssl'
            ? \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS
            : \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;
        $mail->Port = $smtp_port;
        $mail->Timeout = 20;
        $mail->CharSet = 'UTF-8';
        $mail->setFrom($smtp_from, $smtp_from_name);
        $mail->addAddress($recipient, $guest_name);
        $mail->isHTML(true);
        $mail->Subject = $subject;
        $mail->Body = $body;
        $mail->AltBody = implode("\n", $plain_lines);
        // Approved bookings include the receipt; declined bookings only get
        // the status message and reservation details.
        $mail->addEmbeddedImage($logo_path, 'poolside-villa-logo', 'poolside-villa-logo.png', 'base64', 'image/png');
        if ($approved) {
            $mail->addStringAttachment(
                build_reservation_receipt_pdf($booking, $reviewer),
                'Poolside-Villa-Receipt-' . preg_replace('/[^A-Za-z0-9_-]/', '-', $reference) . '.pdf',
                'base64',
                'application/pdf'
            );
        }
        $mail->send();
        return true;
    } catch (\Throwable $error) {
        error_log('Reservation status email delivery failed: ' . $error->getMessage());
        return false;
    }
}
