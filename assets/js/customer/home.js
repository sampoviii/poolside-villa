/* ============================================================
   Customer home page
   Loads resort reviews, shows the customer's own review, and
   manages the review form and gallery interactions.
   ============================================================ */

document.addEventListener('DOMContentLoaded', function() {
    var fullName = sessionStorage.getItem('poolside_customer_name') || '';
    var firstName = fullName.trim().split(/\s+/)[0];
    if (firstName) {
        var welcome = document.getElementById('customerWelcome');
        if (welcome) welcome.textContent = 'Welcome back, ' + firstName + '.';
    }

    setupCustomerHomeGallery();
    loadCustomerHomeReviews();
    setupMyReviewSection();
});

// Set up the resort photo gallery and its viewing controls.
function setupCustomerHomeGallery() {
    var track = document.getElementById('customerHomeGalleryTrack');
    var count = document.getElementById('customerHomeGalleryCount');
    var progress = document.getElementById('customerHomeGalleryProgress');
    var previous = document.getElementById('customerHomeGalleryPrev');
    var next = document.getElementById('customerHomeGalleryNext');
    if (!track || !count || !progress || !previous || !next) return;

    var photos = [];
    for (var photoNumber = 1; photoNumber <= 54; photoNumber++) {
        if (photoNumber === 47) continue;

        var fileName;
        if (photoNumber === 50) {
            fileName = '50.jpg';
        } else if (photoNumber <= 28 || photoNumber === 54) {
            fileName = 'PoolSide Villa' + photoNumber + '.jpg';
        } else {
            fileName = 'Poolside Villa' + photoNumber + '.jpg';
        }
        photos.push(fileName);
        if (photoNumber === 53) {
            photos.push('att.r3f69stvYAAJV2x6PSOaZceTYB6EiNhmcef5zt2p-PQ-2.jpg');
        }
    }

    photos.forEach(function(fileName, index) {
        var slide = document.createElement('figure');
        slide.className = 'customer-home-gallery-slide';
        slide.setAttribute('role', 'group');
        slide.setAttribute('aria-label', 'Photo ' + (index + 1) + ' of ' + photos.length);

        var image = document.createElement('img');
        image.src = '../assets/images/' + encodeURIComponent(fileName).replace(/%20/g, '%20');
        image.alt = 'Poolside Villa resort photo ' + (index + 1);
        image.loading = index < 2 ? 'eager' : 'lazy';
        image.decoding = 'async';

        var caption = document.createElement('figcaption');
        var label = document.createElement('span');
        label.textContent = 'Poolside Villa';
        var number = document.createElement('span');
        number.textContent = String(index + 1).padStart(2, '0');
        caption.appendChild(label);
        caption.appendChild(number);

        slide.appendChild(image);
        slide.appendChild(caption);
        track.appendChild(slide);
    });

    var slides = track.querySelectorAll('.customer-home-gallery-slide');
    var activeIndex = 0;

    function updatePosition() {
        var slideStep = slides.length > 1
            ? slides[1].offsetLeft - slides[0].offsetLeft
            : slides[0].offsetWidth;
        activeIndex = Math.max(0, Math.min(slides.length - 1, Math.round(track.scrollLeft / slideStep)));
        count.textContent = String(activeIndex + 1).padStart(2, '0') + ' / ' + String(slides.length).padStart(2, '0');
        progress.style.width = ((activeIndex + 1) / slides.length * 100) + '%';
    }

    function goToSlide(index) {
        activeIndex = (index + slides.length) % slides.length;
        var trackLeft = track.getBoundingClientRect().left;
        var slideLeft = slides[activeIndex].getBoundingClientRect().left;
        track.scrollTo({
            left: track.scrollLeft + slideLeft - trackLeft,
            behavior: 'instant'
        });
        updatePosition();
    }

    previous.addEventListener('click', function() { goToSlide(activeIndex - 1); });
    next.addEventListener('click', function() { goToSlide(activeIndex + 1); });
    track.addEventListener('scroll', updatePosition, { passive: true });
    track.addEventListener('keydown', function(event) {
        if (event.key === 'ArrowLeft') {
            event.preventDefault();
            goToSlide(activeIndex - 1);
        } else if (event.key === 'ArrowRight') {
            event.preventDefault();
            goToSlide(activeIndex + 1);
        }
    });
    window.addEventListener('resize', updatePosition);
    updatePosition();
}

// Load public reviews so visitors can see feedback about the resort.
function loadCustomerHomeReviews() {
    var reviewGrid = document.getElementById('customerHomeReviews');
    var status = document.getElementById('customerHomeReviewStatus');
    if (!reviewGrid || !status) return;

    callApi('reviews.php', { action: 'all_list' }, function(result) {
        if (!result.ok) {
            status.textContent = 'Guest reviews are temporarily unavailable. Please check back soon.';
            return;
        }

        if (!Array.isArray(result.reviews) || result.reviews.length === 0) {
            status.textContent = 'Guest stories will appear here as visitors share their experiences.';
            return;
        }

        status.remove();
        result.reviews.slice(0, 3).forEach(function(review) {
            reviewGrid.appendChild(createCustomerHomeReview(review));
        });
    });
}

function createCustomerHomeReview(review) {
    var card = document.createElement('article');
    card.className = 'customer-home-review-card';

    var rating = Math.max(0, Math.min(5, parseInt(review.rating, 10) || 0));
    var stars = document.createElement('div');
    stars.className = 'customer-home-review-stars';
    stars.setAttribute('role', 'img');
    stars.setAttribute('aria-label', rating + ' out of 5 stars');
    stars.textContent = '\u2605'.repeat(rating) + '\u2606'.repeat(5 - rating);

    var quote = document.createElement('p');
    quote.className = 'customer-home-review-quote';
    quote.textContent = '\u201c' + (review.review_text || '') + '\u201d';

    var author = document.createElement('div');
    author.className = 'customer-home-review-author';

    var avatar = document.createElement('span');
    avatar.className = 'customer-home-review-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = (review.name || 'Guest').trim().charAt(0).toUpperCase();

    var details = document.createElement('div');
    var name = document.createElement('div');
    name.className = 'customer-home-review-name';
    name.textContent = review.name || 'Villa guest';

    var stay = document.createElement('div');
    stay.className = 'customer-home-review-stay';
    stay.textContent = [review.stay, review.review_date].filter(Boolean).join(' \u00b7 ');

    details.appendChild(name);
    details.appendChild(stay);
    author.appendChild(avatar);
    author.appendChild(details);
    card.appendChild(stars);
    card.appendChild(quote);
    card.appendChild(author);
    return card;
}


/* ============================================================
   AUTO-OPEN REVIEW MODAL
   When the customer arrives from a review notification link,
   the URL hash will be #myReviewSection. Scroll to the section
   and automatically open the Write a Review modal.
   ============================================================ */
document.addEventListener('DOMContentLoaded', function() {
    if (window.location.hash === '#myReviewSection') {
        // Scroll the section into view.
        var section = document.getElementById('myReviewSection');
        if (section) {
            setTimeout(function() {
                section.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 400);
        }
        // After a short delay, auto-open the Write a Review modal
        // (only if not already reviewed — loadMyReview shows writeReviewBtn only when eligible).
        setTimeout(function() {
            var writeBtn = document.getElementById('writeReviewBtn');
            if (writeBtn && writeBtn.style.display !== 'none') {
                openReviewModal('new', null);
            }
        }, 800);
    }
});

/* ============================================================
   MY REVIEW SECTION
   Only shown when the customer is logged in.
   - If they have a completed stay but no review → show "Write a Review" button
   - If they have a review → show their review with Edit / Delete
   - If no completed stay → show a note
   ============================================================ */

/* Holds the customer's current review (null if none) */
var myCurrentReview = null;
/* Selected star rating in the form (default 5) */
var selectedRating = 5;

// Load and connect the signed-in customer's own review controls.
function setupMyReviewSection() {
    /* Only show this section if the customer is logged in */
    var isLoggedIn = sessionStorage.getItem('poolside_logged_in') === 'yes';
    if (!isLoggedIn) return;

    var section = document.getElementById('myReviewSection');
    if (section) section.style.display = '';

    loadMyReview();
    setupReviewModal();
    setupStarPicker();
}

/* Load the customer's existing review (if any) and check eligibility */
function loadMyReview() {
    /* First check if they already have a review */
    callApi('reviews.php', { action: 'my_list' }, function(result) {
        var reviews = (result.ok && result.reviews) ? result.reviews : [];

        if (reviews.length > 0) {
            /* They already have a review — show it */
            myCurrentReview = reviews[0];
            showMyReviewCard(myCurrentReview);
        } else {
            /* No review yet — check if they're eligible */
            callApi('reviews.php', { action: 'can_review' }, function(r) {
                if (r.ok && r.canReview) {
                    /* Show the "Write a Review" button */
                    var btn = document.getElementById('writeReviewBtn');
                    if (btn) btn.style.display = '';
                } else {
                    /* Show "no completed stay" note */
                    var note = document.getElementById('myReviewNoStay');
                    if (note) note.style.display = '';
                }
            });
        }
    });
}

/* Render the customer's review card */
function showMyReviewCard(review) {
    /* Hide write button and no-stay note */
    var btn  = document.getElementById('writeReviewBtn');
    var note = document.getElementById('myReviewNoStay');
    if (btn)  btn.style.display  = 'none';
    if (note) note.style.display = 'none';

    /* Fill in star display */
    var starsEl = document.getElementById('myReviewStars');
    if (starsEl) {
        var filled = parseInt(review.rating, 10) || 0;
        var stars  = '';
        for (var i = 0; i < 5; i++) {
            stars += i < filled ? '★' : '☆';
        }
        starsEl.textContent = stars;
    }

    /* Fill in review text */
    var textEl = document.getElementById('myReviewText');
    if (textEl) textEl.textContent = '"' + (review.review_text || '') + '"';

    /* Fill in meta (visit type · date) */
    var metaEl = document.getElementById('myReviewMeta');
    if (metaEl) {
        metaEl.textContent = [review.stay, review.review_date].filter(Boolean).join(' · ');
    }

    /* Show the card */
    var card = document.getElementById('myReviewCard');
    if (card) card.style.display = '';

    /* Wire Edit button */
    var editBtn = document.getElementById('editMyReviewBtn');
    if (editBtn) {
        editBtn.onclick = function() { openReviewModal('edit', review); };
    }

    /* Wire Delete button */
    var deleteBtn = document.getElementById('deleteMyReviewBtn');
    if (deleteBtn) {
        deleteBtn.onclick = function() { confirmDeleteReview(review.id); };
    }
}

/* Open the review modal for writing new or editing existing */
function openReviewModal(mode, review) {
    var modal    = document.getElementById('reviewModal');
    var title    = document.getElementById('reviewModalTitle');
    var idField  = document.getElementById('reviewIdField');
    var nameF    = document.getElementById('reviewName');
    var stayF    = document.getElementById('reviewStay');
    var textF    = document.getElementById('reviewText');
    var submitBtn = document.getElementById('reviewSubmitBtn');

    if (!modal) return;

    if (mode === 'edit' && review) {
        title.innerHTML = '<span class="material-icons" style="font-size:18px;vertical-align:middle;margin-right:4px;">edit</span>Edit Your Review';
        idField.value  = review.id;
        if (nameF)  nameF.value  = review.name        || '';
        if (stayF)  stayF.value  = review.stay        || '';
        if (textF)  textF.value  = review.review_text || '';
        setStarRating(parseInt(review.rating, 10) || 5);
        if (submitBtn) submitBtn.textContent = 'Save Changes';
    } else {
        title.innerHTML = '<span class="material-icons" style="font-size:18px;vertical-align:middle;margin-right:4px;">rate_review</span>Write a Review';
        idField.value  = '';
        if (nameF) nameF.value = sessionStorage.getItem('poolside_customer_name') || '';
        if (stayF) stayF.value = '';
        if (textF) textF.value = '';
        setStarRating(5);
        if (submitBtn) submitBtn.textContent = 'Submit Review';
    }

    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeReviewModal() {
    var modal = document.getElementById('reviewModal');
    if (modal) modal.classList.remove('open');
    document.body.style.overflow = '';
}

/* Star picker interaction */
function setupStarPicker() {
    var picker = document.getElementById('reviewStarPicker');
    if (!picker) return;

    var buttons = picker.querySelectorAll('.review-star-btn');
    buttons.forEach(function(btn) {
        btn.addEventListener('click', function() {
            setStarRating(parseInt(btn.getAttribute('data-value'), 10));
        });
    });
}

function setStarRating(rating) {
    selectedRating = rating;
    var ratingField = document.getElementById('reviewRating');
    if (ratingField) ratingField.value = rating;

    var buttons = document.querySelectorAll('.review-star-btn');
    buttons.forEach(function(btn) {
        var val = parseInt(btn.getAttribute('data-value'), 10);
        btn.style.color  = val <= rating ? '#f59e0b' : '#ccc';
        btn.style.fontSize = '28px';
    });
}

/* Wire modal close and form submit */
function setupReviewModal() {
    /* Write a Review button */
    var writeBtn = document.getElementById('writeReviewBtn');
    if (writeBtn) {
        writeBtn.addEventListener('click', function() { openReviewModal('new', null); });
    }

    /* Close button */
    var closeBtn = document.getElementById('reviewModalClose');
    if (closeBtn) closeBtn.addEventListener('click', closeReviewModal);

    /* Click outside to close */
    var modal = document.getElementById('reviewModal');
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) closeReviewModal();
        });
    }

    /* Form submit */
    var form = document.getElementById('reviewForm');
    if (!form) return;

    form.addEventListener('submit', function(e) {
        e.preventDefault();

        var reviewId = document.getElementById('reviewIdField').value;
        var name     = document.getElementById('reviewName').value.trim();
        var stay     = document.getElementById('reviewStay').value;
        var text     = document.getElementById('reviewText').value.trim();
        var rating   = parseInt(document.getElementById('reviewRating').value, 10) || 5;

        if (!name || !stay || !text) {
            showToast('Please fill in all fields.', 'warning');
            return;
        }

        var submitBtn = document.getElementById('reviewSubmitBtn');
        if (submitBtn) submitBtn.disabled = true;

        if (reviewId) {
            /* Edit existing review */
            callApi('reviews.php', {
                action   : 'update',
                reviewId : reviewId,
                stay     : stay,
                rating   : rating,
                text     : text
            }, function(result) {
                if (submitBtn) submitBtn.disabled = false;
                if (!result.ok) { showToast(result.error || 'Could not update review.', 'error'); return; }
                closeReviewModal();
                showToast('Review updated!', 'success');
                loadMyReview();
                loadCustomerHomeReviews(); /* refresh the public grid */
            });
        } else {
            /* Create new review */
            var months   = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
            var now      = new Date();
            var dateStr  = months[now.getMonth()] + ' ' + now.getFullYear();

            callApi('reviews.php', {
                action : 'create',
                name   : name,
                stay   : stay,
                rating : rating,
                text   : text,
                date   : dateStr
            }, function(result) {
                if (submitBtn) submitBtn.disabled = false;
                if (!result.ok) { showToast(result.error || 'Could not save review.', 'error'); return; }
                closeReviewModal();
                showToast('Thank you for your review!', 'success');
                loadMyReview();
                loadCustomerHomeReviews(); /* refresh the public grid */
            });
        }
    });
}

/* Delete review with confirmation */
function confirmDeleteReview(reviewId) {
    showConfirm('Are you sure you want to delete your review? This cannot be undone.', function() {
        callApi('reviews.php', { action: 'delete', reviewId: reviewId }, function(result) {
            if (!result.ok) { showToast(result.error || 'Could not delete.', 'error'); return; }
            showToast('Review deleted.', 'info');
            myCurrentReview = null;

            /* Hide the card, reset section */
            var card = document.getElementById('myReviewCard');
            if (card) card.style.display = 'none';

            /* Re-check eligibility */
            callApi('reviews.php', { action: 'can_review' }, function(r) {
                var btn  = document.getElementById('writeReviewBtn');
                var note = document.getElementById('myReviewNoStay');
                if (r.ok && r.canReview) {
                    if (btn)  btn.style.display  = '';
                    if (note) note.style.display = 'none';
                } else {
                    if (btn)  btn.style.display  = 'none';
                    if (note) note.style.display = '';
                }
            });

            loadCustomerHomeReviews(); /* refresh public grid */
        });
    });
}
