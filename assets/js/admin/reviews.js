/* ============================================================
   reviews.js — Admin Customer Reviews Management
   Shows all customer reviews with filtering capabilities
   ============================================================ */

var allReviews = [];
var filteredReviews = [];


/* ============================================================
   LOAD ALL REVIEWS
   ============================================================ */

function loadReviews() {
    callApi('reviews.php', { action: 'admin_list' }, function(result) {
        if (!result.ok) {
            showToast('Could not load reviews.', 'error');
            return;
        }

        allReviews = result.reviews || [];
        applyFilters();
        updateStats();
    });
}


/* ============================================================
   UPDATE STATISTICS
   ============================================================ */

function updateStats() {
    var totalReviewsEl = document.getElementById('totalReviews');
    var avgRatingEl = document.getElementById('avgRating');

    if (totalReviewsEl) {
        totalReviewsEl.textContent = allReviews.length;
    }

    if (avgRatingEl && allReviews.length > 0) {
        var totalRating = 0;
        for (var i = 0; i < allReviews.length; i++) {
            totalRating += parseInt(allReviews[i].rating, 10) || 0;
        }
        var avg = totalRating / allReviews.length;
        avgRatingEl.textContent = avg.toFixed(1);
    } else if (avgRatingEl) {
        avgRatingEl.textContent = '0.0';
    }
}


/* ============================================================
   APPLY FILTERS
   ============================================================ */

function applyFilters() {
    var searchText = document.getElementById('searchInput') ? document.getElementById('searchInput').value.toLowerCase() : '';
    var ratingFilter = document.getElementById('ratingFilter') ? document.getElementById('ratingFilter').value : '';
    var stayFilter = document.getElementById('stayFilter') ? document.getElementById('stayFilter').value : '';

    filteredReviews = [];

    for (var i = 0; i < allReviews.length; i++) {
        var review = allReviews[i];
        var matchSearch = true;
        var matchRating = true;
        var matchStay = true;

        /* Search filter */
        if (searchText) {
            var nameMatch = review.name && review.name.toLowerCase().indexOf(searchText) >= 0;
            var textMatch = review.review_text && review.review_text.toLowerCase().indexOf(searchText) >= 0;
            matchSearch = nameMatch || textMatch;
        }

        /* Rating filter */
        if (ratingFilter) {
            matchRating = String(review.rating) === ratingFilter;
        }

        /* Stay type filter */
        if (stayFilter) {
            matchStay = review.stay === stayFilter;
        }

        if (matchSearch && matchRating && matchStay) {
            filteredReviews.push(review);
        }
    }

    renderReviews();
}


/* ============================================================
   RENDER REVIEWS LIST
   ============================================================ */

function renderReviews() {
    var container = document.getElementById('reviewsList');
    if (!container) { return; }

    if (filteredReviews.length === 0) {
        container.innerHTML = '<div style="padding: 40px; text-align: center; color: var(--gray-400);">No reviews found.</div>';
        return;
    }

    var html = '';

    for (var i = 0; i < filteredReviews.length; i++) {
        var review = filteredReviews[i];
        var stars = '';
        for (var s = 0; s < 5; s++) {
            stars += s < review.rating ? '&#9733;' : '&#9734;';
        }

        var truncatedText = review.review_text;
        if (truncatedText.length > 150) {
            truncatedText = truncatedText.substring(0, 150) + '...';
        }

        html += 
            '<div class="review-card" data-review-id="' + review.id + '" style="cursor: pointer;">' +
                '<div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">' +
                    '<div>' +
                        '<div style="font-weight: 600; font-size: 15px; color: var(--navy); margin-bottom: 4px;">' + 
                            review.name + 
                        '</div>' +
                        '<div style="font-size: 20px; color: var(--gold); margin-bottom: 4px;">' + stars + '</div>' +
                    '</div>' +
                    '<div style="text-align: right;">' +
                        '<div style="font-size: 12px; color: var(--gray-400);">' + review.review_date + '</div>' +
                        '<div style="font-size: 12px; color: var(--sky); margin-top: 4px;">' + review.stay + '</div>' +
                    '</div>' +
                '</div>' +
                '<div style="color: var(--gray-600); line-height: 1.5; margin-bottom: 8px;">' + truncatedText + '</div>' +
                '<div style="font-size: 12px; color: var(--gray-400);">' +
                    'Booking: <span style="color: var(--navy); font-weight: 500;">' + (review.booking_id || '--') + '</span> | ' +
                    'Email: <span style="color: var(--navy);">' + (review.email || '--') + '</span>' +
                '</div>' +
            '</div>';
    }

    container.innerHTML = html;

    /* Wire click handlers */
    var cards = container.querySelectorAll('.review-card');
    for (var j = 0; j < cards.length; j++) {
        (function(card) {
            card.addEventListener('click', function() {
                var reviewId = card.getAttribute('data-review-id');
                for (var k = 0; k < filteredReviews.length; k++) {
                    if (String(filteredReviews[k].id) === reviewId) {
                        showReviewDetail(filteredReviews[k]);
                        break;
                    }
                }
            });
        }(cards[j]));
    }
}


/* ============================================================
   SHOW REVIEW DETAIL MODAL
   ============================================================ */

function showReviewDetail(review) {
    var stars = '';
    for (var i = 0; i < 5; i++) {
        stars += i < review.rating ? '&#9733;' : '&#9734;';
    }

    var html = 
        '<div style="background: var(--cream); padding: 20px; border-radius: 8px; margin-bottom: 16px;">' +
            '<div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">' +
                '<div>' +
                    '<div style="font-size: 18px; font-weight: 600; color: var(--navy); margin-bottom: 6px;">' + 
                        review.name + 
                    '</div>' +
                    '<div style="font-size: 24px; color: var(--gold); margin-bottom: 8px;">' + stars + '</div>' +
                '</div>' +
                '<div style="text-align: right;">' +
                    '<div style="font-size: 13px; color: var(--gray-400);">Posted on</div>' +
                    '<div style="font-size: 14px; font-weight: 500; color: var(--navy);">' + review.review_date + '</div>' +
                '</div>' +
            '</div>' +
            '<div style="margin-bottom: 12px;">' +
                '<div style="font-size: 12px; color: var(--gray-500); margin-bottom: 4px;">Visit Type</div>' +
                '<div style="font-size: 14px; color: var(--sky); font-weight: 500;">' + review.stay + '</div>' +
            '</div>' +
            '<div style="margin-bottom: 12px;">' +
                '<div style="font-size: 12px; color: var(--gray-500); margin-bottom: 4px;">Review</div>' +
                '<div style="font-size: 14px; color: var(--gray-700); line-height: 1.6;">' + review.review_text + '</div>' +
            '</div>' +
        '</div>' +
        '<div style="background: white; border: 1px solid var(--gray-200); padding: 16px; border-radius: 8px;">' +
            '<div style="font-size: 12px; color: var(--gray-500); margin-bottom: 8px;">Booking Information</div>' +
            '<div style="display: grid; grid-template-columns: auto 1fr; gap: 8px 16px; font-size: 13px;">' +
                '<div style="color: var(--gray-500);">Booking ID:</div>' +
                '<div style="font-weight: 500; color: var(--navy);">' + (review.booking_id || '--') + '</div>' +
                '<div style="color: var(--gray-500);">Customer Email:</div>' +
                '<div style="color: var(--navy);">' + (review.email || '--') + '</div>' +
                '<div style="color: var(--gray-500);">Submitted:</div>' +
                '<div style="color: var(--gray-600);">' + (review.created_at || '--') + '</div>' +
            '</div>' +
        '</div>';

    document.getElementById('reviewDetailBody').innerHTML = html;
    openModal('reviewDetailModal');
}


/* ============================================================
   SETUP FILTER LISTENERS
   ============================================================ */

function setupFilters() {
    var searchInput = document.getElementById('searchInput');
    var ratingFilter = document.getElementById('ratingFilter');
    var stayFilter = document.getElementById('stayFilter');

    if (searchInput) {
        searchInput.addEventListener('input', applyFilters);
    }

    if (ratingFilter) {
        ratingFilter.addEventListener('change', applyFilters);
    }

    if (stayFilter) {
        stayFilter.addEventListener('change', applyFilters);
    }
}


/* ============================================================
   PAGE INIT
   ============================================================ */

document.addEventListener('DOMContentLoaded', function() {
    setupFilters();
    loadReviews();
});
