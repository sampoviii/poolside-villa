/* ============================================================
   history.js  —  Customer History page
   Shows the customer's past reservations and their reviews.
   ============================================================ */


/* Turn a number 1-5 into star characters like ★★★☆☆ */
function buildStarRating(rating) {
    var stars = '';
    var i;
    for (i = 0; i < 5; i++) {
        if (i < rating) {
            stars += '\u2605'; /* filled star */
        } else {
            stars += '\u2606'; /* empty star */
        }
    }
    return stars;
}

/* These two arrays hold the loaded data so the modals can use them */
var myBookings = [];
var myReviews  = [];


/* ============================================================
   RESERVATION DETAIL MODAL
   Opens when the customer clicks a booking card
   ============================================================ */

function openReservationDetail(booking) {

    /* Pick the right color badge for the status */
    var badgeClass = 'badge-yellow'; /* default = pending */
    if (booking.status === 'Approved') { badgeClass = 'badge-green'; }
    if (booking.status === 'Declined') { badgeClass = 'badge-red'; }

    /* Show admin message only if there is one */
    var adminMsgHTML = '';
    if (booking.admin_message) {
        adminMsgHTML = '<div class="detail-admin-msg"><strong>Resort Message:</strong> ' + booking.admin_message + '</div>';
    }

    /* Show "Add a Review" button only for Approved bookings whose
       checkout time has already passed, and not yet reviewed */
    var addReviewHTML = '';

    /* Build the modal content */
    document.getElementById('detailModalBody').innerHTML =
        '<div class="detail-ref-row">' +
            '<span class="history-ref">' + booking.id + '</span>' +
            '<span class="badge ' + badgeClass + '">' + booking.status + '</span>' +
        '</div>' +
        '<table class="detail-table">' +
            '<tr><td>Visit Date</td>   <td><strong>' + (booking.visit_date || '--') + '</strong></td></tr>' +
            '<tr><td>Time</td>         <td><strong>' + (booking.visit_time || '--') + '</strong></td></tr>' +
            '<tr><td>Package</td>      <td><strong>' + (booking.room      || '--') + '</strong></td></tr>' +
            '<tr><td>Pax</td>          <td><strong>' + (booking.pax       || '--') + '</strong></td></tr>' +
            '<tr><td>Rate Type</td>    <td><strong>' + (booking.rate_type || '--') + '</strong></td></tr>' +
            '<tr><td>LPG Add-on</td>   <td><strong>' + (booking.lpg      || '--') + '</strong></td></tr>' +
            '<tr><td>Payment Type</td> <td><strong>50% Down Payment</strong></td></tr>' +
            '<tr><td>Amount</td>       <td><strong>' + (booking.amount    || '--') + '</strong></td></tr>' +
            '<tr><td>Booked On</td>    <td><strong>' + (booking.booked_at || '--') + '</strong></td></tr>' +
        '</table>' +
        adminMsgHTML +
        addReviewHTML;

    openModal('detailModal');
}


/* ============================================================
   REVIEW DETAIL MODAL
   Opens when the customer clicks a review card
   ============================================================ */

function openReviewDetail(review) {
    document.getElementById('detailModalBody').innerHTML =
        '<div class="detail-ref-row">' +
            '<span class="history-ref">Review</span>' +
            '<span class="review-stars-sm">' + buildStarRating(review.rating) + '</span>' +
        '</div>' +
        '<table class="detail-table">' +
            '<tr><td>Visit Type</td><td><strong>' + (review.stay        || '--') + '</strong></td></tr>' +
            '<tr><td>Rating</td>    <td><strong>' + review.rating + ' / 5</strong></td></tr>' +
            '<tr><td>Date</td>      <td><strong>' + (review.review_date || '--') + '</strong></td></tr>' +
        '</table>' +
        '<div style="margin-top:12px;font-size:13px;color:#635d53;background:var(--cream);border-radius:8px;padding:12px;">' +
            '"' + review.review_text + '"' +
        '</div>' +
        '<div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap;">' +
            '<button type="button" class="btn btn-outline btn-sm" onclick="openEditReview(' + review.id + ')">&#9998; Edit</button>' +
            '<button type="button" class="btn btn-red btn-sm"     onclick="deleteReview(' + review.id + ')">&#128465; Delete</button>' +
        '</div>';

    openModal('detailModal');
}


/* ============================================================
   OPEN ADD REVIEW MODAL
   Fills in the form fields then opens the modal
   Bug 4 fix: only allow opening if bookingId is a real value
   Bug 2 fix: only allow reviewing bookings that belong to the
              logged-in customer (booking must be in myBookings)
   ============================================================ */

function openAddReviewModal(bookingId) {

    /* Bug 4: block if no booking ID */
    if (!bookingId) {
        showToast('Cannot write a review without a booking reference.', 'warning');
        return;
    }

    /* Bug 2: check the booking actually belongs to this customer */
    var bookingBelongsToMe = false;
    var b;
    for (b = 0; b < myBookings.length; b++) {
        if (myBookings[b].id === bookingId && myBookings[b].status === 'Approved') {
            bookingBelongsToMe = true;
            break;
        }
    }

    if (!bookingBelongsToMe) {
        showToast('You can only review your own approved bookings.', 'error');
        return;
    }

    /* Fill in the form */
    var nameField = document.getElementById('newRevName');
    if (nameField) {
        nameField.value = sessionStorage.getItem('poolside_customer_name') || '';
    }

    var bookingIdField = document.getElementById('reviewBookingId');
    if (bookingIdField) {
        bookingIdField.value = bookingId;
    }

    var stayField = document.getElementById('newRevStay');
    if (stayField) { stayField.value = ''; }

    var ratingField = document.getElementById('newRevRating');
    if (ratingField) { ratingField.value = '5'; }

    var textField = document.getElementById('newRevText');
    if (textField) { textField.value = ''; }

    openModal('submitReviewModal');
}


/* ============================================================
   EDIT REVIEW
   ============================================================ */

function openEditReview(reviewId) {
    var review = null;
    var i;
    for (i = 0; i < myReviews.length; i++) {
        if (String(myReviews[i].id) === String(reviewId)) {
            review = myReviews[i];
            break;
        }
    }
    if (!review) { return; }

    closeModal('detailModal');

    document.getElementById('editReviewIndex').value = reviewId;
    document.getElementById('editRevRating').value   = review.rating || 5;
    document.getElementById('editRevStay').value     = review.stay   || '';
    document.getElementById('editRevText').value     = review.review_text || '';

    openModal('editReviewModal');
}

function deleteReview(reviewId) {
    showConfirm('Are you sure you want to delete this review? This cannot be undone.', function() {
        callApi('reviews.php', { action: 'delete', reviewId: reviewId }, function(result) {
            if (!result.ok) {
                showToast(result.error || 'Could not delete review.', 'error');
                return;
            }
            closeModal('detailModal');
            showToast('Review deleted.', 'info');
            renderHistory(); /* refresh the list */
        });
    });
}


/* ============================================================
   RENDER HISTORY LIST
   Loads bookings and reviews from the server then draws cards
   ============================================================ */

function renderHistory() {
    var historyList = document.getElementById('historyList');
    if (!historyList) { return; }

    historyList.innerHTML = '<p style="padding:20px;color:var(--gray-400);">Loading...</p>';

    /* Track when both API calls are done */
    var bookingsDone = false;
    var reviewsDone  = false;

    /* Load the customer's bookings */
    callApi('reservations.php', { action: 'my_list' }, function(result) {
        myBookings   = result.ok ? result.bookings : [];
        bookingsDone = true;
        if (reviewsDone) { buildTimeline(); }
    });

    /* Load the customer's reviews at the same time */
    callApi('reviews.php', { action: 'my_list' }, function(result) {
        myReviews   = result.ok ? result.reviews : [];
        reviewsDone = true;
        if (bookingsDone) { buildTimeline(); }
    });

    /* Build the cards once both API calls have finished */
    function buildTimeline() {

        /* Nothing to show */
        if (myBookings.length === 0 && myReviews.length === 0) {
            historyList.innerHTML =
                '<div class="history-empty">No history yet. <a href="booking.html">Book your first visit!</a></div>';
            return;
        }

        var html = '';
        var booking, review, badgeClass;

        /* Build one card per booking */
        for (var bi = 0; bi < myBookings.length; bi++) {
            booking = myBookings[bi];

            badgeClass = 'badge-yellow';
            if (booking.status === 'Approved') { badgeClass = 'badge-green'; }
            if (booking.status === 'Declined') { badgeClass = 'badge-red'; }

            html +=
                '<div class="history-card" data-id="' + booking.id + '" data-type="reservation" style="cursor:pointer;">' +
                    '<div class="history-card-top">' +
                        '<div style="display:flex;align-items:center;gap:8px;">' +
                            '<span style="font-size:12px;color:var(--gray-400);text-transform:uppercase;">Reservation</span>' +
                            '<span class="history-ref">' + booking.id + '</span>' +
                        '</div>' +
                        '<span class="badge ' + badgeClass + '">' + booking.status + '</span>' +
                    '</div>' +
                    '<div class="history-card-rows">' +
                        '<div><span>Visit Date</span><b>' + (booking.visit_date || '--') + '</b></div>' +
                        '<div><span>Time</span><b>'       + (booking.visit_time || '--') + '</b></div>' +
                        '<div><span>Package</span><b>'    + (booking.room       || '--') + '</b></div>' +
                        '<div><span>Amount</span><b>'     + (booking.amount     || '--') + '</b></div>' +
                    '</div>' +
                    '<div class="history-card-footer">Tap to view details</div>' +
                '</div>';
        }

        /* Build one card per review */
        for (var ri = 0; ri < myReviews.length; ri++) {
            review = myReviews[ri];

            html +=
                '<div class="history-card" data-id="review-' + review.id + '" data-type="review" data-review-id="' + review.id + '" style="cursor:pointer;">' +
                    '<div class="history-card-top">' +
                        '<div style="display:flex;align-items:center;gap:8px;">' +
                            '<span style="font-size:12px;color:var(--gray-400);text-transform:uppercase;">Review</span>' +
                            '<span class="review-stars-sm">' + buildStarRating(review.rating) + '</span>' +
                        '</div>' +
                        '<span class="badge badge-green">' + review.stay + '</span>' +
                    '</div>' +
                    '<div class="history-card-rows">' +
                        '<div><span>Rating</span><b>' + review.rating + '/5</b></div>' +
                        '<div><span>Date</span><b>'   + (review.review_date || '--') + '</b></div>' +
                        '<div style="grid-column:1/-1;"><span>Review</span>' +
                            '<b style="font-weight:400;font-style:italic;">"' +
                                review.review_text.slice(0, 80) + (review.review_text.length > 80 ? '...' : '') +
                            '"</b>' +
                        '</div>' +
                    '</div>' +
                    '<div class="history-card-footer">Tap to view, edit, or delete</div>' +
                '</div>';
        }

        historyList.innerHTML = html;

        /* Wire click on each card */
        var cards = historyList.querySelectorAll('.history-card');
        var c;
        for (c = 0; c < cards.length; c++) {
            /* Use a self-executing function to capture the loop variable */
            (function(card) {
                card.addEventListener('click', function() {
                    var cardType = card.getAttribute('data-type');

                    if (cardType === 'reservation') {
                        var id = card.getAttribute('data-id');
                        var found = null;
                        var j;
                        for (j = 0; j < myBookings.length; j++) {
                            if (myBookings[j].id === id) {
                                found = myBookings[j];
                                break;
                            }
                        }
                        if (found) { openReservationDetail(found); }

                    } else {
                        var rid = card.getAttribute('data-review-id');
                        var foundReview = null;
                        var k;
                        for (k = 0; k < myReviews.length; k++) {
                            if (String(myReviews[k].id) === String(rid)) {
                                foundReview = myReviews[k];
                                break;
                            }
                        }
                        if (foundReview) { openReviewDetail(foundReview); }
                    }
                });
            }(cards[c]));
        }
    }
}


/* ============================================================
   EDIT REVIEW FORM
   ============================================================ */

function setupEditReviewForm() {
    var editForm = document.getElementById('editReviewForm');
    if (!editForm) { return; }

    editForm.addEventListener('submit', function(e) {
        e.preventDefault();

        var reviewId = getFieldValue('editReviewIndex');
        var rating   = parseInt(getFieldValue('editRevRating'), 10) || 5;
        var stay     = getFieldValue('editRevStay').trim();
        var text     = getFieldValue('editRevText').trim();

        if (!stay || !text) {
            showToast('Please fill in all fields.', 'warning');
            return;
        }

        callApi('reviews.php', {
            action  : 'update',
            reviewId: reviewId,
            stay    : stay,
            rating  : rating,
            text    : text
        }, function(result) {
            if (!result.ok) {
                showToast(result.error || 'Could not update review.', 'error');
                return;
            }
            closeModal('editReviewModal');
            showToast('Review updated!', 'success');
            renderHistory();
        });
    });
}


/* ============================================================
   SUBMIT NEW REVIEW FORM
   Bug 1 fix: check for duplicate booking ID before submitting
   Bug 2 fix: verify the booking belongs to this customer
   Bug 4 fix: block if bookingId is empty
   ============================================================ */

function setupReviewSubmitForm() {
    var submitForm = document.getElementById('submitReviewForm');
    if (!submitForm) { return; }

    submitForm.addEventListener('submit', function(e) {
        e.preventDefault();

        var nameField = document.getElementById('newRevName');
        var name      = nameField ? nameField.value.trim() : '';
        var rating    = parseInt(getFieldValue('newRevRating'), 10) || 5;
        var stay      = getFieldValue('newRevStay').trim();
        var text      = getFieldValue('newRevText').trim();
        var bookingId = getFieldValue('reviewBookingId');

        /* Bug 4: block empty booking ID */
        if (!bookingId) {
            showToast('No booking reference found. Please try again from your booking.', 'warning');
            return;
        }

        /* Bug 2: verify this booking belongs to the logged-in customer */
        var isMyBooking = false;
        var b;
        for (b = 0; b < myBookings.length; b++) {
            if (myBookings[b].id === bookingId && myBookings[b].status === 'Approved') {
                isMyBooking = true;
                break;
            }
        }
        if (!isMyBooking) {
            showToast('You can only review your own approved bookings.', 'error');
            return;
        }

        /* Bug 1: block if already reviewed */
        var alreadyReviewed = false;
        var r;
        for (r = 0; r < myReviews.length; r++) {
            if (myReviews[r].booking_id === bookingId) {
                alreadyReviewed = true;
                break;
            }
        }
        if (alreadyReviewed) {
            showToast('You already submitted a review for this booking.', 'warning');
            closeModal('submitReviewModal');
            return;
        }

        if (!name || !stay || !text) {
            showToast('Please fill in all fields.', 'warning');
            return;
        }

        /* Build a simple month+year string like "Oct 2026" */
        var monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        var now  = new Date();
        var date = monthNames[now.getMonth()] + ' ' + now.getFullYear();

        callApi('reviews.php', {
            action   : 'create',
            bookingId: bookingId,
            name     : name,
            stay     : stay,
            rating   : rating,
            text     : text,
            date     : date
        }, function(result) {
            if (!result.ok) {
                showToast(result.error || 'Could not save review.', 'error');
                return;
            }
            submitForm.reset();
            closeModal('submitReviewModal');
            showToast('Thank you for your review!', 'success');
            renderHistory();
        });
    });
}


/* ============================================================
   PAGE INIT — runs when the page is ready
   ============================================================ */

document.addEventListener('DOMContentLoaded', function() {
    renderHistory();
    setupEditReviewForm();
    setupReviewSubmitForm();
});
