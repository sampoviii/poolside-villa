<?php
// Copy this example to mail-config.php and add the SMTP settings provided
// by the mail service. Keep the real credentials out of public source control.

return [
    'host'       => 'smtp-relay.brevo.com',
    'username'   => '',
    'password'   => '',
    'port'       => 587,
    'encryption' => 'tls',
    'from_email' => '',
    'from_name'  => 'Poolside Villa',
];
