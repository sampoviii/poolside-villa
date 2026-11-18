/* ============================================================
   review.js  —  Customer Review page
   One review per customer. Only available after a completed stay.
   Customer can write, edit, or delete their review.
   ============================================================ */

var currentReview  = null;   /* the customer's existing review, or null */
var selectedRating = 5;      /* currently selected star rating */

/* ---- Show the correct view based on state ---- */
function showView(view) {
    document.getElementById('reviewPageLoading').style.display     = view === 'loading'  ? '' : 'none';
    document.getElementById('reviewPageNotEligible').style.display = view === 'locked'   ? '' : 'none';
    document.getElementById('reviewPageExisting').style.display    = view === 'existing' ? '' : 'none';
    document.getElementById('reviewPageForm').style.display        = view === 'form'     ? '' : 'none';
}

/* ---- Build star display string ---- */
function buildStars(rating) {
    var s = '';
    for (var i = 1; i <= 5; i++) { s += i <= rating ? '★' : '☆'; }
    return s;
}

/* ---- Set star picker highlight ---- */
function setStarRating(rating) {
    selectedRating = rating;
    var ratingField = document.getElementById('rpRating');
    if (ratingField) ratingField.value = rating;
    document.querySelectorAll('.review-star-btn').forEach(function(btn) {
        var val = parseInt(btn.getAttribute('data-value'), 10);
        btn.style.color    = val <= rating ? '#f59e0b' : '#ccc';
        btn.style.fontSize = '32px';
    });
}

/* ---- Load the page ---- */
function loadReviewPage() {
    showView('loading');

    /* Step 1: check if a review already exists */
    callApi('reviews.php', { action: 'my_list' }, function(result) {
        var reviews = (result.ok && result.reviews) ? result.reviews : [];

        if (reviews.length > 0) {
            /* Customer already has a review — show it */
            currentReview = reviews[0];
            fillExistingView(currentReview);
            showView('existing');
            return;
        }

        /* Step 2: no review yet — check eligibility */
        callApi('reviews.php', { action: 'can_review' }, function(r) {
            if (r.ok && r.canReview) {
                /* Eligible — show the write form */
                openWriteForm();
            } else {
                /* Not eligible yet */
                showView('locked');
            }
        });
    });
}

/* ---- Fill the "existing review" view ---- */
function fillExistingView(review) {
    var starsEl = document.getElementById('reviewPageStars');
    var textEl  = document.getElementById('reviewPageText');
    var metaEl  = document.getElementById('reviewPageMeta');

    if (starsEl) starsEl.textContent = buildStars(parseInt(review.rating, 10) || 0);
    if (textEl)  textEl.textContent  = '\u201c' + (review.review_text || '') + '\u201d';
    if (metaEl)  metaEl.textContent  = [review.stay, review.review_date].filter(Boolean).join(' \u00b7 ');
}

/* ---- Open the write form (blank) ---- */
function openWriteForm() {
    var title = document.getElementById('reviewFormTitle');
    if (title) title.textContent = 'Write Your Review';

    var cancelBtn = document.getElementById('reviewPageCancelBtn');
    if (cancelBtn) cancelBtn.style.display = 'none';

    document.getElementById('reviewPageId').value = '';

    var nameF = document.getElementById('rpName');
    if (nameF) nameF.value = sessionStorage.getItem('poolside_customer_name') || '';

    document.getElementById('rpStay').value = '';
    document.getElementById('rpText').value = '';
    setStarRating(5);

    var submitBtn = document.getElementById('reviewPageSubmitBtn');
    if (submitBtn) submitBtn.innerHTML =
        '<span class="material-icons" style="font-size:16px;vertical-align:middle;margin-right:4px;">send</span>Submit Review';

    showView('form');
}

/* ---- Open the edit form (pre-filled) ---- */
function openEditForm(review) {
    var title = document.getElementById('reviewFormTitle');
    if (title) title.textContent = 'Edit Your Review';

    document.getElementById('reviewPageId').value  = review.id;
    document.getElementById('rpName').value        = review.name        || '';
    document.getElementById('rpStay').value        = review.stay        || '';
    document.getElementById('rpText').value        = review.review_text || '';
    setStarRating(parseInt(review.rating, 10) || 5);

    var cancelBtn = document.getElementById('reviewPageCancelBtn');
    if (cancelBtn) cancelBtn.style.display = '';

    var submitBtn = document.getElementById('reviewPageSubmitBtn');
    if (submitBtn) submitBtn.innerHTML =
        '<span class="material-icons" style="font-size:16px;vertical-align:middle;margin-right:4px;">save</span>Save Changes';

    showView('form');
}

/* ---- Page init ---- */
document.addEventListener('DOMContentLoaded', function() {

    loadReviewPage();

    /* Star picker */
    document.querySelectorAll('.review-star-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            setStarRating(parseInt(btn.getAttribute('data-value'), 10));
        });
    });

    /* Edit button (on existing view) */
    var editBtn = document.getElementById('editReviewPageBtn');
    if (editBtn) {
        editBtn.addEventListener('click', function() {
            if (currentReview) openEditForm(currentReview);
        });
    }

    /* Cancel edit — go back to existing view */
    var cancelBtn = document.getElementById('reviewPageCancelBtn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', function() {
            if (currentReview) {
                fillExistingView(currentReview);
                showView('existing');
            }
        });
    }

    /* Delete button (on existing view) */
    var deleteBtn = document.getElementById('deleteReviewPageBtn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', function() {
            if (!currentReview) return;
            showConfirm('Are you sure you want to delete your review? This cannot be undone.', function() {
                callApi('reviews.php', { action: 'delete', reviewId: currentReview.id }, function(result) {
                    if (!result.ok) { showToast(result.error || 'Could not delete.', 'error'); return; }
                    currentReview = null;
                    showToast('Review deleted.', 'info');

                    /* Re-check eligibility */
                    callApi('reviews.php', { action: 'can_review' }, function(r) {
                        if (r.ok && r.canReview) {
                            openWriteForm();
                        } else {
                            showView('locked');
                        }
                    });
                });
            });
        });
    }

    /* Form submit */
    var form = document.getElementById('reviewPageFormEl');
    if (form) {
        form.addEventListener('submit', function(e) {
            e.preventDefault();

            var reviewId = document.getElementById('reviewPageId').value;
            var name     = document.getElementById('rpName').value.trim();
            var stay     = document.getElementById('rpStay').value;
            var text     = document.getElementById('rpText').value.trim();
            var rating   = parseInt(document.getElementById('rpRating').value, 10) || 5;

            if (!name || !stay || !text) {
                showToast('Please fill in all fields.', 'warning');
                return;
            }

            var submitBtn = document.getElementById('reviewPageSubmitBtn');
            if (submitBtn) submitBtn.disabled = true;

            if (reviewId) {
                /* Edit */
                callApi('reviews.php', {
                    action: 'update', reviewId: reviewId,
                    stay: stay, rating: rating, text: text
                }, function(result) {
                    if (submitBtn) submitBtn.disabled = false;
                    if (!result.ok) { showToast(result.error || 'Could not update.', 'error'); return; }
                    showToast('Review updated!', 'success');
                    loadReviewPage();
                });
            } else {
                /* Create */
                var months  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                var now     = new Date();
                var dateStr = months[now.getMonth()] + ' ' + now.getFullYear();

                callApi('reviews.php', {
                    action: 'create', name: name,
                    stay: stay, rating: rating, text: text, date: dateStr
                }, function(result) {
                    if (submitBtn) submitBtn.disabled = false;
                    if (!result.ok) { showToast(result.error || 'Could not save.', 'error'); return; }
                    showToast('Thank you for your review!', 'success');
                    loadReviewPage();
                });
            }
        });
    }
});
