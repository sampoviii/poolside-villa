/* ============================================================
   payment-verification.js  —  Admin Payment Verification page
   ---------------------------------------------------------------
   Shows all PENDING reservations. For each one the admin can:
     - View the GCash proof image (click to enlarge)
     - Type an optional message to the customer
     - Click Accept to approve the reservation
     - Click Reject to decline the reservation

   Overlap and time-gap checking is done by PHP on the server.
   Load admin-shared.js before this file.
   ============================================================ */


function renderPendingCards() {
    var cardList = document.getElementById('verifyList');
    if (!cardList) return;

    cardList.innerHTML = '<div class="admin-card"><p style="padding:16px;color:var(--gray-400);">Loading...</p></div>';

    callApi('reservations.php', { action: 'all_list' }, function(result) {
        var allBookings = result.ok ? result.bookings : [];

        /* Filter to only Pending, newest first */
        var pending = allBookings.filter(function(b) {
            return b.status === 'Pending' || b.status === 'Pending Verification';
        });

        if (pending.length === 0) {
            cardList.innerHTML =
                '<div class="admin-card"><div class="admin-empty">No pending reservations. You are all caught up!</div></div>';
            return;
        }

        /* For pending cards we need the payment image — fetch each one individually */
        var html = '';
        pending.forEach(function(b) {
            /* Payment image is loaded lazily when the admin clicks the card's image area */
            html +=
                '<div class="verify-card" data-card="' + b.id + '">' +
                    '<div class="verify-proof" data-load-proof="' + b.id + '">' +
                        '<div style="padding:12px;font-size:12px;color:var(--gray-400);">Loading payment proof...</div>' +
                    '</div>' +
                    '<div class="verify-info">' +
                        '<div class="verify-ref">' + b.id + '</div>' +
                       '<div class="verify-rows" style="gap:16px;">' +
    '<div><span>Guest</span><b>' + (b.first_name || '') + ' ' + (b.last_name || '') + '</b></div>' +
    '<div style="min-width:0;word-break:break-all;"><span>Email</span><b>' + (b.email      || '--') + '</b></div>' +
    '<div style="min-width:0;"><span>Phone</span><b>' + (b.phone      || '--') + '</b></div>' +
    '<div><span>Visit Date</span><b data-visit-date="' + (b.visit_date || '') + '">' + (b.visit_date  || '--') + '</b></div>' +
    '<div><span>Time</span><b>'       + (b.visit_time  || '--') + '</b></div>' +
    '<div><span>Package</span><b>'    + (b.room        || '--') + '</b></div>' +
    '<div><span>Payment</span><b>50% Down Payment</b></div>' +
    '<div><span>Amount</span><b>'     + (b.amount      || '--') + '</b></div>' +
'</div>' +
                        '<div class="verify-actions">' +
                            '<textarea data-message="' + b.id + '" placeholder="Optional message to the customer (e.g. reason for rejection)"></textarea>' +
                            '<button type="button" class="btn btn-sky btn-sm"  data-accept="' + b.id + '">&#10003; Accept</button>' +
                            '<button type="button" class="btn btn-red btn-sm" data-reject="' + b.id + '">&#10005; Reject</button>' +
                        '</div>' +
                    '</div>' +
                '</div>';
        });

        cardList.innerHTML = html;

        /* Auto-load proof image for every pending card immediately */
        cardList.querySelectorAll('[data-load-proof]').forEach(function(proofArea) {
            var bookingId = proofArea.getAttribute('data-load-proof');

            proofArea.innerHTML = '<p style="padding:12px;font-size:12px;color:var(--gray-400);">Loading payment proof...</p>';

            callApi('reservations.php', { action: 'get_one', bookingId: bookingId }, function(r) {
                if (!r.ok || !r.booking || !r.booking.payment_image) {
                    proofArea.innerHTML = '<div class="no-proof" style="padding:16px;font-size:13px;color:var(--gray-400);text-align:center;">No image uploaded</div>';
                    return;
                }

                proofArea.innerHTML =
                    '<img src="' + r.booking.payment_image + '" ' +
                         'alt="Proof of payment" ' +
                         'data-proof="' + bookingId + '" ' +
                         'style="width:100%;border-radius:8px;cursor:zoom-in;display:block;" />';

                /* Wire lightbox on the loaded image */
                var img = proofArea.querySelector('img');
                if (img) {
                    img.addEventListener('click', function() {
                        var lightbox    = document.getElementById('lightbox');
                        var lightboxImg = document.getElementById('lightboxImg');
                        if (!lightbox || !lightboxImg) return;
                        lightboxImg.src = img.src;
                        lightbox.classList.add('open');
                    });
                }
            });
        });
    });
}


document.addEventListener('DOMContentLoaded', function() {
    var cardList = document.getElementById('verifyList');
    if (!cardList) return;

    renderPendingCards();

    /* One click handler for Accept/Reject buttons on the whole list */
    cardList.addEventListener('click', function(e) {
        var btn = e.target.closest('[data-accept], [data-reject]');
        if (!btn || !cardList.contains(btn)) return;

        var acceptId = btn.getAttribute('data-accept');
        var rejectId = btn.getAttribute('data-reject');
        var id       = acceptId || rejectId;
        if (!id) return;

        var msgTextarea = cardList.querySelector('[data-message="' + id + '"]');
        var adminMsg    = msgTextarea ? msgTextarea.value.trim() : '';
        var newStatus   = acceptId ? 'Approved' : 'Declined';
        var card        = btn.closest('.verify-card');
        var actionButtons = card ? card.querySelectorAll('[data-accept], [data-reject]') : [btn];
        var actionName = acceptId ? 'accept' : 'reject';
        showActionConfirm(
            'Are you sure you want to ' + actionName + ' reservation ' + id + '?',
            acceptId ? 'Accept' : 'Reject',
            function() {
                actionButtons.forEach(function(actionButton) {
                    actionButton.disabled = true;
                });
                btn.textContent = 'Saving...';
                doUpdateStatus(id, newStatus, adminMsg, btn, actionButtons);
            },
            acceptId ? 'btn-sky' : 'btn-red'
        );
    });


    // Save the decision first so email delivery cannot delay the admin response.
    function doUpdateStatus(id, newStatus, adminMsg, btn, actionButtons) {
        callApi('reservations.php', {
            action      : 'update_status',
            bookingId   : id,
            status      : newStatus,
            adminMessage: adminMsg
        }, function(result) {
            if (!result.ok) {
                actionButtons.forEach(function(actionButton) {
                    actionButton.disabled = false;
                });
                btn.innerHTML = newStatus === 'Approved' ? '&#10003; Accept' : '&#10005; Reject';
                showToast(result.error || 'Could not update booking.', 'error');
                return;
            }

            showToast(result.message || ('Reservation ' + id + ' updated.'), 'success');
            renderPendingCards();

            callApi('reservations.php', {
                action: 'send_status_email',
                bookingId: id
            }, function(emailResult) {
                if (!emailResult.ok || !emailResult.emailSent) {
                    showToast('Reservation updated, but its email could not be sent.', 'warning');
                }
            });
        });
    }


    /* ---- Lightbox ---- */
    var lightbox    = document.getElementById('lightbox');
    var closeBtn    = document.getElementById('lightboxClose');

    function closeLightbox() {
        if (!lightbox) return;
        lightbox.classList.remove('open');
        var img = document.getElementById('lightboxImg');
        if (img) img.src = '';
    }

    if (closeBtn) closeBtn.addEventListener('click', closeLightbox);
    if (lightbox) lightbox.addEventListener('click', function(e) {
        if (e.target === lightbox) closeLightbox();
    });
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') closeLightbox();
    });
});
