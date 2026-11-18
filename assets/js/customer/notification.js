/* ============================================================
   notification.js  —  Customer booking notifications
   ============================================================ */

var allNotifications = [];

// Escape user- or server-provided text before placing it inside notification HTML.
function escapeNotificationHtml(value) {
    return String(value || '').replace(/[&<>"']/g, function(character) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[character];
    });
}

function formatNotifMessage(message) {
    /* Messages use \n as a separator between structured lines.
       Render each line individually so the card stays clean. */
    var lines = String(message || '').split('\n');
    if (lines.length <= 1) {
        /* Legacy single-line message — just show it as-is */
        return '<span>' + escapeNotificationHtml(message) + '</span>';
    }
    var html = '';
    lines.forEach(function(line, i) {
        var escaped = escapeNotificationHtml(line);
        if (i === 0) {
            /* First line = booking reference — show bold */
            html += '<span style="font-weight:700;color:var(--sky-darker);">' + escaped + '</span>';
        } else if (line.indexOf('Status:') === 0) {
            var isApproved = line.indexOf('APPROVED') !== -1;
            var color = isApproved ? 'var(--sky-darker)' : 'var(--red)';
            var bg    = isApproved ? 'var(--sky-light)'  : 'var(--red-light)';
            html += '<span style="display:inline-block;margin-top:4px;padding:2px 8px;border-radius:4px;font-weight:700;font-size:12px;background:' + bg + ';color:' + color + ';">' + escaped + '</span>';
        } else {
            html += '<span style="display:block;font-size:12px;color:var(--gray-600);margin-top:2px;">' + escaped + '</span>';
        }
    });
    return html;
}

// Choose a simple symbol that matches the reservation's current status.
function getNotifIcon(notif) {
    if (notif.type === 'review') {
        return parseInt(notif.is_review_done, 10) ? '\u2B50' : '\u270F\uFE0F';
    }
    if (notif.status === 'Approved') { return ''; }
    if (notif.status === 'Declined') { return '\u274C'; }
    return '\u23F3';
}

function openNotifDetail(notif) {
    var body = document.getElementById('notifDetailBody');
    if (!body) return;

    /* ---- Review notification detail ---- */
    if (notif.type === 'review') {
        var isDone = parseInt(notif.is_review_done, 10);
        var html = '<div style="text-align:center;font-size:44px;margin-bottom:16px;">' + getNotifIcon(notif) + '</div>';
        html += '<p style="font-size:15px;font-weight:600;color:var(--black);text-align:center;margin-bottom:16px;">' +
                    escapeNotificationHtml(notif.message) + '</p>';
        if (!isDone) {
            html += '<div style="text-align:center;">' +
                    '<a href="home.html#myReviewSection" class="btn btn-sky" style="display:inline-block;text-decoration:none;padding:10px 24px;border-radius:24px;font-weight:600;" ' +
                    'onclick="document.querySelectorAll(\'.modal-overlay.open\').forEach(function(m){m.classList.remove(\'open\');});document.body.style.overflow=\'\';">' +
                    '&#9997;&#65039; Write a Review</a></div>';
        } else {
            html += '<p style="text-align:center;font-size:13px;color:var(--gray-400);">You\'ve already submitted your review. Thank you!</p>';
        }
        html += '<div style="margin-top:14px;font-size:12px;color:var(--gray-400);text-align:center;">' + escapeNotificationHtml(notif.notif_date || '') + '</div>';
        body.innerHTML = html;
        openModal('notifDetailModal');
        return;
    }

    var lines = String(notif.message || '').split('\n');
    var isStructured = lines.length > 1;

    /* Parse structured lines */
    var ref        = isStructured ? lines[0] : '';
    var dateStr    = '';
    var statusStr  = '';
    var reviewedBy = '';
    var welcomeMsg = '';
    lines.forEach(function(line) {
        if (line.indexOf('Visit date:') === 0)    dateStr    = line.replace('Visit date:', '').trim();
        if (line.indexOf('Status:') === 0)         statusStr  = line.replace('Status:', '').trim();
        if (line.indexOf('Reviewed by') === 0)     reviewedBy = line.replace('Reviewed by', '').trim();
        if (line.indexOf('We look forward') === 0) welcomeMsg = line;
    });

    var isApproved  = notif.status === 'Approved';
    var statusColor = isApproved ? 'var(--sky-darker)' : 'var(--red)';
    var statusBg    = isApproved ? 'var(--sky-light)'  : 'var(--red-light)';

    var notifIcon = getNotifIcon(notif);
    var html = notifIcon
        ? '<div style="text-align:center;font-size:44px;margin-bottom:16px;">' + notifIcon + '</div>'
        : '';

    if (isStructured) {
        html += '<div style="background:var(--gray-50);border:1px solid var(--gray-200);border-radius:8px;padding:14px 16px;margin-bottom:12px;text-align:left;">';
        html += '  <div style="font-family:\'Courier New\',monospace;font-weight:700;font-size:15px;color:var(--sky-darker);margin-bottom:10px;">' + escapeNotificationHtml(ref) + '</div>';
        if (dateStr) {
            html += '  <div style="display:flex;justify-content:space-between;font-size:13px;padding:5px 0;border-top:1px solid var(--gray-200);">'
                  + '    <span style="color:var(--gray-600);">Visit Date</span>'
                  + '    <span style="font-weight:600;color:var(--black);">' + escapeNotificationHtml(dateStr) + '</span>'
                  + '  </div>';
        }
        if (statusStr) {
            html += '  <div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;padding:5px 0;border-top:1px solid var(--gray-200);">'
                  + '    <span style="color:var(--gray-600);">Status</span>'
                  + '    <span style="padding:2px 10px;border-radius:4px;font-weight:700;font-size:12px;background:' + statusBg + ';color:' + statusColor + ';">' + escapeNotificationHtml(statusStr) + '</span>'
                  + '  </div>';
        }
        if (reviewedBy) {
            html += '  <div style="display:flex;justify-content:space-between;font-size:13px;padding:5px 0;border-top:1px solid var(--gray-200);">'
                  + '    <span style="color:var(--gray-600);">Reviewed by</span>'
                  + '    <span style="font-weight:600;color:var(--black);">' + escapeNotificationHtml(reviewedBy) + '</span>'
                  + '  </div>';
        }
        html += '</div>';
        if (welcomeMsg) {
            html += '<p style="font-size:13px;color:var(--sky-darker);text-align:center;margin-bottom:8px;">' + escapeNotificationHtml(welcomeMsg) + '</p>';
        }
    } else {
        /* Legacy single-line messages */
        html += '<p style="font-size:15px;font-weight:600;color:var(--black);text-align:center;margin-bottom:6px;">' + escapeNotificationHtml(notif.message || '') + '</p>';
    }

    if (notif.admin_message) {
        html += '<div class="detail-admin-msg" style="margin-top:4px;">&#128172; Resort Message: ' + escapeNotificationHtml(notif.admin_message) + '</div>';
    }

    html += '<div style="margin-top:14px;font-size:12px;color:var(--gray-400);text-align:center;">' + escapeNotificationHtml(notif.notif_date || '') + '</div>';

    body.innerHTML = html;
    openModal('notifDetailModal');
}

// Refresh the small unread counter shown in the customer navigation.
function updateUnreadBadge() {
    var badge = document.getElementById('notifDot');
    if (!badge) return;

    callApi('notifications.php', { action: 'unread_count' }, function(result) {
        var count = result.ok ? result.count : 0;
        if (count > 0) {
            badge.textContent = count > 9 ? '9+' : String(count);
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    });
}

function renderNotifications() {
    var list = document.getElementById('notificationList');
    if (!list) return;

    list.innerHTML = '<p style="padding:20px;color:var(--gray-400);">Loading...</p>';
    callApi('notifications.php', { action: 'my_list' }, function(result) {
        allNotifications = result.ok ? result.notifications : [];
        if (allNotifications.length === 0) {
            list.innerHTML = '<div class="notif-empty">No notifications yet. Booking updates will appear here.</div>';
            return;
        }

        var html = '';
        allNotifications.forEach(function(notif) {
            var isReview   = notif.type === 'review';
            var isDone     = parseInt(notif.is_review_done, 10);
            var unreadClass = notif.is_read ? '' : ' notif-item--unread';
            var unreadDot   = notif.is_read ? '' : '<div class="unread-dot"></div>';

            // Review notifications that are already done appear greyed-out and
            // are not clickable (no pointer cursor, no hover).
            var reviewDoneStyle = (isReview && isDone)
                ? ' style="cursor:default;opacity:0.65;pointer-events:none;"'
                : (isReview ? ' style="cursor:pointer;position:relative;"' : ' style="cursor:pointer;position:relative;"');

            var messageHtml;
            if (isReview) {
                var reviewIcon = isDone ? '\u2B50 ' : '\u270F\uFE0F ';
                messageHtml = '<span style="font-weight:600;color:' + (isDone ? 'var(--gray-500)' : 'var(--sky-darker)') + ';">' +
                    reviewIcon + escapeNotificationHtml(notif.message) + '</span>';
            } else {
                messageHtml = formatNotifMessage(notif.message);
            }

            html +=
                '<div class="notif-item' + unreadClass + '"' + reviewDoneStyle + ' data-notif-id="' + notif.id + '" data-notif-type="' + (notif.type || 'booking') + '" data-review-done="' + (isDone ? '1' : '0') + '">' +
                    unreadDot +
                    (getNotifIcon(notif) ? '<span class="notif-item-icon">' + getNotifIcon(notif) + '</span>' : '') +
                    '<div style="flex:1;">' +
                    '<div class="notif-item-text">' + messageHtml + '</div>' +
                        (notif.admin_message && !isReview
                            ? '<div class="notif-admin-note">&#128172; ' + escapeNotificationHtml(notif.admin_message) + '</div>'
                            : '') +
                        '<div class="notif-item-date">' + (notif.notif_date || '') + '</div>' +
                    '</div>' +
                    (isReview && isDone ? '' : '<span class="notif-item-arrow">&#8250;</span>') +
                '</div>';
        });
        list.innerHTML = html;

        list.querySelectorAll('.notif-item').forEach(function(item) {
            var isDoneAttr = item.getAttribute('data-review-done') === '1';
            if (isDoneAttr) return; // non-clickable once reviewed

            item.addEventListener('click', function() {
                var notifId   = item.getAttribute('data-notif-id');
                var notifType = item.getAttribute('data-notif-type');

                callApi('notifications.php', { action: 'mark_read', notifId: notifId }, function(result) {
                    if (!result.ok) {
                        showToast(result.error || 'Could not mark notification as read.', 'error');
                        return;
                    }
                    item.classList.remove('notif-item--unread');
                    var dot = item.querySelector('.unread-dot');
                    if (dot) dot.remove();
                    updateUnreadBadge();
                });

                var notif = allNotifications.find(function(entry) {
                    return entry.id === notifId;
                });
                if (notif) openNotifDetail(notif);
            });
        });
    });
}

document.addEventListener('DOMContentLoaded', renderNotifications);
