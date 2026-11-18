/* ============================================================
   settings.js  —  Customer Account Settings page
   ---------------------------------------------------------------
   Two forms on this page:
     1. settingsForm  — change the account password

   Data is now saved to MySQL via the PHP API.
   Load shared.js before this file.
   ============================================================ */


document.addEventListener('DOMContentLoaded', function() {

    /* ============================================================
       FORM 1 — CHANGE PASSWORD
       ============================================================ */
    var passwordForm = document.getElementById('settingsForm');
    if (passwordForm) {

        // Show which password rule still needs attention as the customer types.
        /* Live password strength hint while typing */
        var newPwInput    = document.getElementById('settingsNewPassword');
        var passwordHint  = document.getElementById('settingsPwHint');

        if (newPwInput && passwordHint) {
            newPwInput.addEventListener('input', function() {
                var pw = newPwInput.value;
                if (!pw) { passwordHint.textContent = ''; return; }

                if (pw.length < 8) {
                    passwordHint.textContent = 'At least 8 characters required.';
                    passwordHint.className   = 'form-hint pw-weak';
                } else if (!/[A-Z]/.test(pw)) {
                    passwordHint.textContent = 'Add at least one uppercase letter.';
                    passwordHint.className   = 'form-hint pw-weak';
                } else if (!/[a-z]/.test(pw)) {
                    passwordHint.textContent = 'Add at least one lowercase letter.';
                    passwordHint.className   = 'form-hint pw-weak';
                } else if (!/[0-9]/.test(pw)) {
                    passwordHint.textContent = 'Add at least one number.';
                    passwordHint.className   = 'form-hint pw-weak';
                } else if (!/[^A-Za-z0-9]/.test(pw)) {
                    passwordHint.textContent = 'Add at least one special character.';
                    passwordHint.className   = 'form-hint pw-weak';
                } else {
                    passwordHint.textContent = 'Password looks good!';
                    passwordHint.className   = 'form-hint pw-ok';
                }
            });
        }

        // Recheck the values before sending them to the API. The server repeats
        // these checks and verifies the current password before saving.
        passwordForm.addEventListener('submit', function(e) {
            e.preventDefault();

            var currentPw = getFieldValue('settingsCurrentPassword');
            var newPw     = getFieldValue('settingsNewPassword');
            var confirmPw = getFieldValue('settingsConfirmPassword');

            if (!currentPw) { showToast('Please enter your current password.', 'warning'); return; }
            if (!newPw)     { showToast('Please enter a new password.', 'warning'); return; }
            if (newPw.length < 8 || !/[A-Z]/.test(newPw) || !/[a-z]/.test(newPw) ||
                !/[0-9]/.test(newPw) || !/[^A-Za-z0-9]/.test(newPw)) {
                showToast('Password must be at least 8 characters and include uppercase, lowercase, number, and special character.', 'warning');
                return;
            }
            if (newPw !== confirmPw) { showToast('New passwords do not match.', 'error'); return; }

            callApi('auth.php', {
                action         : 'change_password',
                currentPassword: currentPw,
                newPassword    : newPw,
                confirmPassword: confirmPw
            }, function(result) {
                if (!result.ok) {
                    showToast(result.error, 'error');
                    return;
                }

                /* Clear password fields and restore their hidden state */
                passwordForm.reset();
                if (passwordHint) {
                    passwordHint.textContent = '';
                    passwordHint.className   = 'form-hint';
                }

                showToast(result.message, 'success');
            });
        });
    }


});
