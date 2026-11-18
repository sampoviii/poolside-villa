/* ============================================================
   settings.js — Admin Settings page
   ---------------------------------------------------------------
   Handles GCash details and admin password updates.
   Load admin-shared.js before this file.
   ============================================================ */

document.addEventListener('DOMContentLoaded', function() {

    /* ---- GCASH DETAILS ---- */
    // Load the saved payment details and keep a selected QR image ready to save.
    var gcashForm = document.getElementById('gcashForm');
    var gcashNumberInput = document.getElementById('gcashNumberInput');
    var gcashQrPreview = document.getElementById('gcashQrPreview');
    var gcashQrPreviewWrap = document.getElementById('gcashQrPreviewWrap');
    var gcashFileInput = document.getElementById('gcashQrInput');
    var gcashSavedNotice = document.getElementById('gcashSavedNotice');

    var currentQrBase64 = '';

    if (gcashForm) {
        callApi('settings.php', { action: 'get' }, function(result) {
            if (result.ok) {
                if (gcashNumberInput) gcashNumberInput.value = result.gcashNumber || '';
                if (gcashQrPreview && result.gcashQr) {
                    currentQrBase64 = result.gcashQr;
                    gcashQrPreview.src = result.gcashQr;
                    if (gcashQrPreviewWrap) gcashQrPreviewWrap.style.display = 'block';
                } else if (gcashQrPreviewWrap) {
                    gcashQrPreviewWrap.style.display = 'none';
                }
            } else {
                showToast(result.error || 'Could not load GCash payment details.', 'error');
            }
        });

        if (gcashFileInput) {
            gcashFileInput.addEventListener('change', function(e) {
                var file = e.target.files[0];
                if (!file) return;

                if (!file.type.match(/^image\/(jpeg|png|webp)$/)) {
                    showToast('Please select a JPG, PNG, or WebP image.', 'error');
                    gcashFileInput.value = '';
                    return;
                }

                if (file.size > 5 * 1024 * 1024) {
                    showToast('QR Image must be under 5MB.', 'error');
                    gcashFileInput.value = '';
                    return;
                }

                var reader = new FileReader();
                reader.onload = function(evt) {
                    currentQrBase64 = evt.target.result;
                    if (gcashQrPreview) {
                        gcashQrPreview.src = currentQrBase64;
                    }
                    if (gcashQrPreviewWrap) gcashQrPreviewWrap.style.display = 'block';
                };
                reader.onerror = function() {
                    showToast('Could not read the selected QR image.', 'error');
                };
                reader.readAsDataURL(file);
            });
        }

        gcashForm.addEventListener('submit', function(e) {
            e.preventDefault();
            var number = gcashNumberInput ? gcashNumberInput.value.trim() : '';

            callApi('settings.php', {
                action: 'save',
                gcashNumber: number,
                gcashQr: currentQrBase64
            }, function(result) {
                if (!result.ok) {
                    showToast(result.error || 'Failed to save GCash details.', 'error');
                    return;
                }
                if (gcashSavedNotice) gcashSavedNotice.style.display = 'block';
                showToast(result.message || 'GCash details saved successfully.', 'success');
            });
        });
    }

    /* ---- CHANGE ADMIN PASSWORD ---- */
    // Check the new password in the browser, then let the API verify the
    // current password and save the update.
    var passwordForm = document.getElementById('passwordForm');
    if (passwordForm) {
        passwordForm.addEventListener('submit', function(e) {
            e.preventDefault();
            var currentPw = getFieldValue('currentPassword');
            var newPw     = getFieldValue('newPassword');
            var confirmPw = getFieldValue('confirmPassword');

            if (!currentPw || !newPw || !confirmPw) {
                showToast('Please fill in all password fields.', 'warning');
                return;
            }
            if (newPw !== confirmPw) {
                showToast('New passwords do not match.', 'error');
                return;
            }
            if (newPw.length < 8 || !/[A-Z]/.test(newPw) || !/[a-z]/.test(newPw) ||
                !/[0-9]/.test(newPw) || !/[^A-Za-z0-9]/.test(newPw)) {
                showToast('Password must be at least 8 characters and include uppercase, lowercase, number, and special character.', 'warning');
                return;
            }

            callApi('settings.php', {
                action: 'change_password',
                currentPassword: currentPw,
                newPassword: newPw
            }, function(result) {
                if (!result.ok) {
                    showToast(result.error || 'Could not update password.', 'error');
                    return;
                }
                passwordForm.reset();
                showToast(result.message || 'Password updated successfully.', 'success');
            });
        });
    }

});