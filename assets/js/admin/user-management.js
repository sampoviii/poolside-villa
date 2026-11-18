/* ============================================================
   user-management.js — Admin User Management page
   ---------------------------------------------------------------
   Handles listing, creating, password resets, and activating /
   deactivating caretaker accounts from the `users` database table.

   Load admin-shared.js before this file.
   ============================================================ */

function formatNotifDate(dateStr) {
    if (!dateStr) return '--';
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) {
        return dateStr.substring(0, 10);
    }
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
}

// Ask the API for caretaker accounts and display them in the management table.
function renderCaretakers() {
    var tableBody = document.getElementById('caretakerTableBody');
    if (!tableBody) return;

    tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:16px;color:var(--gray-400);">Loading caretaker accounts...</td></tr>';

    callApi('users.php', { action: 'list_caretakers' }, function(result) {
        if (!result.ok) {
            tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:16px;color:#c94a4a;">' +
                '<b>Error:</b> ' + (result.error || 'Could not load caretaker list.') + '</td></tr>';
            return;
        }

        var list = result.caretakers || [];

        if (list.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:16px;color:var(--gray-400);">' +
                'No caretaker accounts yet. Add one using the form above.</td></tr>';
            return;
        }

        var html = '';
        list.forEach(function(item) {
            var fullName = ((item.first_name || '') + ' ' + (item.last_name || '')).trim();
            var dateAdded = formatNotifDate(item.created_at);
            var isActive  = item.is_active === undefined ? 1 : parseInt(item.is_active, 10);

            var statusBadge = isActive
                ? '<span style="display:inline-block;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;background:#d4edda;color:#1e5138;">Active</span>'
                : '<span style="display:inline-block;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;background:#f8d7da;color:#c94a4a;">Inactive</span>';

            // Show Deactivate when active, Activate when inactive.
            var toggleBtn = isActive
                ? '<button type="button" class="btn btn-sm" style="background-color:#c94a4a; color:#fff; border-radius:20px; font-size:12px; font-weight:600; padding:6px 14px; border:none; margin-right:8px;" data-toggle-caretaker="' + item.id + '" data-current-status="1" data-name="' + fullName + '"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#ff9999;margin-right:5px;vertical-align:middle;"></span>Deactivate</button>'
                : '<button type="button" class="btn btn-sm" style="background-color:#1e7e34; color:#fff; border-radius:20px; font-size:12px; font-weight:600; padding:6px 14px; border:none; margin-right:8px;" data-toggle-caretaker="' + item.id + '" data-current-status="0" data-name="' + fullName + '"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#a8f0b8;margin-right:5px;vertical-align:middle;"></span>Activate</button>';

            html += '<tr style="border-bottom: 1px solid #f0f0f0;">' +
                '<td style="padding:12px 16px;">' +
                    '<b style="color:#111; font-size:14px; display:block;">' + (fullName || 'Unnamed Caretaker') + '</b>' +
                    '<span style="color:#888; font-size:11px; font-weight:normal;">Caretaker</span>' +
                '</td>' +
                '<td style="padding:12px 16px; color:#444;">' + (item.email || '--') + '</td>' +
                '<td style="padding:12px 16px; color:#444;">' + (item.phone || '--') + '</td>' +
                '<td style="padding:12px 16px;">' + statusBadge + '</td>' +
                '<td style="padding:12px 16px; color:#444;">' + dateAdded + '</td>' +
                '<td style="padding:12px 16px; white-space:nowrap;">' +
                    toggleBtn +
                    '<button type="button" class="btn btn-sm btn-outline" style="border-radius:20px; border-color:#1e5138; color:#1e5138; font-size:12px; font-weight:600; padding:6px 14px;" data-reset-pw="' + item.id + '" data-name="' + fullName + '">&#128274; Reset Password</button>' +
                '</td>' +
            '</tr>';
        });

        tableBody.innerHTML = html;
    });
}

document.addEventListener('DOMContentLoaded', function() {
    renderCaretakers();

    var refreshBtn = document.getElementById('refreshCaretakersBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', renderCaretakers);
    }

    // Submit the add-caretaker form after checking its required fields.
    /* Form Submit — Add Caretaker */
    var caretakerForm = document.getElementById('addCaretakerForm');
    if (caretakerForm) {
        // Use a click handler on the submit button instead of the form's submit event.
        // This bypasses live-validation.js's capture-phase stopImmediatePropagation.
        var submitBtn = caretakerForm.querySelector('[type="submit"]');
        if (submitBtn) {
            submitBtn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();

                var firstName       = getFieldValue('caretakerFirstName');
                var lastName        = getFieldValue('caretakerLastName');
                var email           = getFieldValue('caretakerEmail');
                var phone           = getFieldValue('caretakerPhone');
                var password        = getFieldValue('caretakerPassword');
                var confirmPassword = getFieldValue('caretakerConfirmPassword');

                if (!firstName || !email || !password || !confirmPassword) {
                    showToast('Please fill in all required fields.', 'warning');
                    return;
                }

                if (password !== confirmPassword) {
                    showToast('Passwords do not match.', 'error');
                    return;
                }

                /* Password Complexity Regex Rule */
                var pwRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
                if (!pwRegex.test(password)) {
                    showToast('Password must be at least 8 characters long and include uppercase, lowercase, number, and special character.', 'warning');
                    return;
                }

                submitBtn.disabled = true;

                callApi('users.php', {
                    action:    'create_caretaker',
                    firstName: firstName,
                    lastName:  lastName,
                    email:     email,
                    phone:     phone,
                    password:  password
                }, function(result) {
                    submitBtn.disabled = false;
                    if (!result.ok) {
                        showToast(result.error || 'Failed to create caretaker account.', 'error');
                        return;
                    }

                    showToast(result.message || 'Caretaker account created successfully!', 'success');
                    caretakerForm.reset();
                    renderCaretakers();
                });
            });
        }
    }

    // Listen on the table body because its action buttons are recreated each
    // time the list is refreshed.
    /* Table Actions: Toggle Status & Reset Password */
    var tableContainer = document.getElementById('caretakerTableBody');
    if (tableContainer) {
        tableContainer.addEventListener('click', function(e) {
            var btn = e.target.closest('button');
            if (!btn) return;

            var toggleId     = btn.getAttribute('data-toggle-caretaker');
            var currentStatus = btn.getAttribute('data-current-status');
            var resetId      = btn.getAttribute('data-reset-pw');
            var name         = btn.getAttribute('data-name') || 'this caretaker';

            if (toggleId) {
                var newStatus    = currentStatus === '1' ? 0 : 1;
                var actionLabel  = newStatus === 0 ? 'Deactivate' : 'Activate';
                var confirmMsg   = newStatus === 0
                    ? 'Are you sure you want to deactivate this caretaker account? They will not be able to log in until reactivated.'
                    : 'Are you sure you want to activate this caretaker account?';

                showActionConfirm(confirmMsg, actionLabel, function() {
                    btn.disabled = true;
                    callApi('users.php', {
                        action:    'toggle_caretaker_status',
                        id:        toggleId,
                        is_active: newStatus
                    }, function(result) {
                        btn.disabled = false;
                        if (!result.ok) {
                            showToast(result.error || 'Could not update caretaker status.', 'error');
                            return;
                        }
                        showToast(result.message || 'Status updated.', 'success');
                        renderCaretakers();
                    });
                });
                return;
            }

            if (resetId) {
                var newPassword = prompt('Enter a new password for ' + name + ':');
                if (!newPassword || newPassword.trim() === '') {
                    return;
                }

                var pwRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
                if (!pwRegex.test(newPassword.trim())) {
                    showToast('Password must be at least 8 characters long and include uppercase, lowercase, number, and special character.', 'warning');
                    return;
                }

                btn.disabled = true;

                callApi('users.php', {
                    action: 'reset_caretaker_password',
                    id: resetId,
                    newPassword: newPassword.trim()
                }, function(result) {
                    btn.disabled = false;
                    if (!result.ok) {
                        showToast(result.error || 'Could not reset password.', 'error');
                        return;
                    }
                    showToast(result.message || 'Password reset successfully!', 'success');
                });
            }
        });
    }
});
