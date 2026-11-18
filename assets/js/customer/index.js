/* ============================================================
   index.js  —  Landing page (index.html) only
   ---------------------------------------------------------------
   Handles all the interactive parts of the public home page:
   - Mobile hamburger menu
   - Hero photo slideshow
   - Rules accordion
   - Reviews carousel  (now loads reviews from the database)
   - Amenities tabs
   - Photo gallery with filter buttons and lightbox
   - About video sound on/off

   Load shared.js before this file.
   ============================================================ */


/* ============================================================
   MOBILE HAMBURGER MENU
   ============================================================ */

function setupMobileMenu() {
    var hamburger = document.getElementById('hamburgerBtn');
    var navLinks = document.getElementById('lpNavLinks');

    /* Hard bail if either element is missing */
    if (!hamburger || !navLinks) return;

    var menuOpen = false;

    function openMenu() {
        menuOpen = true;
        navLinks.style.display = 'flex';
        hamburger.setAttribute('aria-expanded', 'true');
    }

    function closeMenu() {
        menuOpen = false;
        navLinks.style.display = ''; /* revert to CSS default */
        hamburger.setAttribute('aria-expanded', 'false');
    }

    hamburger.addEventListener('click', function(e) {
        e.stopPropagation();
        menuOpen ? closeMenu() : openMenu();
    });

    /* Close when tapping a nav link */
    navLinks.querySelectorAll('a').forEach(function(a) {
        a.addEventListener('click', function() { closeMenu(); });
    });

    /* Close when tapping anywhere else */
    document.addEventListener('click', function(e) {
        if (menuOpen &&
            !hamburger.contains(e.target) &&
            !navLinks.contains(e.target)) {
            closeMenu();
        }
    });

    /* Nav scroll effect */
    var lpNav = document.getElementById('lpNav');
    if (lpNav) {
        function handleNavScroll() {
            lpNav.classList.toggle('scrolled', window.scrollY > 60);
        }
        window.addEventListener('scroll', handleNavScroll, { passive: true });
        handleNavScroll();
    }
}


/* ============================================================
   RULES ACCORDION
   ============================================================ */

function setupRulesAccordion() {
    document.querySelectorAll('.accordion-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var panel = btn.closest('.accordion-item');
            var parentList = btn.closest('.accordion-list');
            var wasOpen = panel.classList.contains('open');

            if (parentList) {
                parentList.querySelectorAll('.accordion-item.open').forEach(function(p) {
                    p.classList.remove('open');
                });
            }
            if (!wasOpen) panel.classList.add('open');
        });
    });
}


/* ============================================================
   HERO PHOTO SLIDESHOW
   ============================================================ */

function setupHeroSlideshow() {
    var slidesHolder = document.getElementById('heroSlides');
    if (!slidesHolder) return;

    var slides = slidesHolder.querySelectorAll('.hero-slide');
    var prevBtn = document.getElementById('heroPrev');
    var nextBtn = document.getElementById('heroNext');
    var currentIndex = 0;
    var slideTimer;
    var touchStartX = null;

    if (slides.length === 0) return;

    function scheduleNextSlide() {
        window.clearTimeout(slideTimer);
        if (document.hidden) return;
        slideTimer = window.setTimeout(function() {
            showSlide(currentIndex + 1);
        }, 7000);
    }

    function showSlide(index) {
        if (index < 0) index = slides.length - 1;
        if (index >= slides.length) index = 0;
        currentIndex = index;
        slides.forEach(function(s, i) { s.classList.toggle('active', i === currentIndex); });
        scheduleNextSlide();
    }

    if (prevBtn) prevBtn.addEventListener('click', function() { showSlide(currentIndex - 1); });
    if (nextBtn) nextBtn.addEventListener('click', function() { showSlide(currentIndex + 1); });

    slidesHolder.addEventListener('touchstart', function(e) {
        touchStartX = e.changedTouches[0].clientX;
    }, { passive: true });
    slidesHolder.addEventListener('touchend', function(e) {
        if (touchStartX === null) return;
        var swipeDistance = e.changedTouches[0].clientX - touchStartX;
        touchStartX = null;
        if (Math.abs(swipeDistance) < 45) return;
        showSlide(currentIndex + (swipeDistance < 0 ? 1 : -1));
    }, { passive: true });
    document.addEventListener('visibilitychange', scheduleNextSlide);
    document.addEventListener('visibilitychange', scheduleNextSlide);
    showSlide(0);
}


/* ============================================================
   REVIEWS CAROUSEL
   ============================================================ */

function setupReviewsCarousel() {
    var track = document.querySelector('.reviews-track');
    if (!track) return;

    var dots = document.querySelectorAll('.carousel-dot');
    var prevBtn = document.querySelector('.carousel-controls .prev');
    var nextBtn = document.querySelector('.carousel-controls .next');
    var current = 0;

    function visibleCount() {
        if (window.innerWidth >= 860) return 3;
        if (window.innerWidth >= 520) return 2;
        return 1;
    }

    function goTo(index) {
        var cards = track.querySelectorAll('.review-card');
        var lastIndex = Math.max(0, cards.length - visibleCount());
        current = Math.min(Math.max(index, 0), lastIndex);
        var cardWidth = cards[0] ? cards[0].getBoundingClientRect().width + 20 : 0;
        track.style.transform = 'translateX(-' + (current * cardWidth) + 'px)';
        dots.forEach(function(d, i) { d.classList.toggle('active', i === current); });
    }

    if (prevBtn) prevBtn.addEventListener('click', function() { goTo(current - 1); });
    if (nextBtn) nextBtn.addEventListener('click', function() { goTo(current + 1); });
    dots.forEach(function(d, i) { d.addEventListener('click', function() { goTo(i); }); });
    window.addEventListener('resize', function() { goTo(current); });
}


/* ============================================================
   LOAD REVIEWS FROM DATABASE
   Replaces the old showSavedReviews() that used localStorage.
   ============================================================ */

function buildStarString(rating) {
    var stars = '';
    for (var i = 0; i < 5; i++) stars += (i < rating) ? '\u2605' : '\u2606';
    return stars;
}

function loadReviewsFromDatabase() {
    var track = document.getElementById('reviewsTrack');
    if (!track) return;

    /* API_BASE on the root index.html points directly to api/ */
    fetch('api/reviews.php', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'all_list' })
        })
        .then(function(r) { return r.json(); })
        .then(function(result) {
            if (!result.ok || result.reviews.length === 0) return;

            result.reviews.forEach(function(review) {
                var initial = review.name ? review.name.charAt(0).toUpperCase() : 'G';
                var card = document.createElement('div');
                card.className = 'review-card';
                card.innerHTML =
                    '<div class="review-stars">' + buildStarString(review.rating) + '</div>' +
                    '<p class="review-text">"' + review.review_text + '"</p>' +
                    '<div class="review-author">' +
                    '<div class="review-avatar">' + initial + '</div>' +
                    '<div>' +
                    '<div class="review-name">' + review.name + '</div>' +
                    '<div class="review-stay">' + review.stay + ' &middot; ' + review.review_date + '</div>' +
                    '</div>' +
                    '</div>';
                track.appendChild(card);
            });
        })
        .catch(function() { /* silently skip if API is unreachable */ });
}


/* ============================================================
   AMENITIES TABS
   ============================================================ */

function setupAmenityTabs() {
    var tabs = document.querySelectorAll('.amenity-tab');
    var panels = document.querySelectorAll('.amenity-panel');
    if (tabs.length === 0) return;

    tabs.forEach(function(tab) {
        tab.addEventListener('click', function() {
            var wanted = tab.getAttribute('data-amenity-tab');
            tabs.forEach(function(t) { t.classList.toggle('active', t === tab); });
            panels.forEach(function(p) { p.classList.toggle('active', p.getAttribute('data-amenity-panel') === wanted); });
        });
    });
}


/* ============================================================
   PHOTO GALLERY
   ============================================================ */

var GALLERY_FOLDER = 'assets/images/';

/* ─────────────────────────────────────────────────────────────────
   GALLERY PHOTOS — categories verified by visual inspection
   Pool & Exterior  : pool, hot spring, villa facade, balcony, views
   Rooms            : bedrooms, bathrooms
   Living & Amenities: living room, kitchen, dining, games, hallway
   Grounds & Parking: gate, pathway, bamboo garden, outdoor areas
   ───────────────────────────────────────────────────────────────── */
var ALL_GALLERY_PHOTOS = [
    /* ── Pool & Exterior ── */
    { file: 'PoolSide Villa1.jpg', category: 'Pool & Exterior' }, /* pool + villa facade */
    { file: 'PoolSide Villa5.jpg', category: 'Pool & Exterior' }, /* hot spring + bamboo garden */
    { file: 'Poolside Villa49.jpg', category: 'Pool & Exterior' }, /* pool night aerial */
    { file: 'Poolside Villa51.jpg', category: 'Pool & Exterior' }, /* Sukabumi pool daytime */
    { file: 'Poolside Villa52.jpg', category: 'Pool & Exterior' }, /* pool + Mt. Makiling view */
    { file: 'Poolside Villa53.jpg', category: 'Pool & Exterior' }, /* pool + villa facade */
    { file: 'att.r3f69stvYAAJV2x6PSOaZceTYB6EiNhmcef5zt2p-PQ-2.jpg', category: 'Pool & Exterior' }, /* pool + hot spring night */
    { file: 'Poolside Villa46.jpg', category: 'Pool & Exterior' }, /* bamboo garden + pool deck night */
    { file: 'Poolside Villa40.jpg', category: 'Pool & Exterior' }, /* villa front facade daytime */
    { file: 'Poolside Villa42.jpg', category: 'Pool & Exterior' }, /* entrance steps night */
    { file: 'Poolside Villa43.jpg', category: 'Pool & Exterior' }, /* balcony night view */
    { file: 'PoolSide Villa3.jpg', category: 'Pool & Exterior' }, /* Laguna de Bay view */
    { file: 'PoolSide Villa54.jpg', category: 'Pool & Exterior' }, /* Laguna de Bay + Mt. Makiling */
    { file: '50.jpg', category: 'Pool & Exterior' }, /* Mt. Makiling view from balcony */

    /* ── Rooms ── */
    { file: 'PoolSide Villa6.jpg', category: 'Rooms' }, /* bathroom glass shower */
    { file: 'PoolSide Villa7.jpg', category: 'Rooms' }, /* dark bathroom with plant */
    { file: 'PoolSide Villa8.jpg', category: 'Rooms' }, /* bathroom rain shower */
    { file: 'PoolSide Villa9.jpg', category: 'Rooms' }, /* bathroom walk-in shower */
    { file: 'PoolSide Villa10.jpg', category: 'Rooms' }, /* bunk bed room */
    { file: 'PoolSide Villa11.jpg', category: 'Rooms' }, /* twin bedroom */
    { file: 'PoolSide Villa12.jpg', category: 'Rooms' }, /* bunk + double bed room */
    { file: 'PoolSide Villa13.jpg', category: 'Rooms' }, /* double bed room */
    { file: 'PoolSide Villa14.jpg', category: 'Rooms' }, /* bunk bed close-up */
    { file: 'PoolSide Villa15.jpg', category: 'Rooms' }, /* bunk + double bed room */
    { file: 'PoolSide Villa16.jpg', category: 'Rooms' }, /* bunk bed hallway view */
    { file: 'PoolSide Villa17.jpg', category: 'Rooms' }, /* double + single bed room */
    { file: 'PoolSide Villa18.jpg', category: 'Rooms' }, /* double + single bed close */
    { file: 'PoolSide Villa19.jpg', category: 'Rooms' }, /* single bed room */
    { file: 'PoolSide Villa20.jpg', category: 'Rooms' }, /* twin bed room */
    { file: 'PoolSide Villa21.jpg', category: 'Rooms' }, /* twin bed room bright */
    { file: 'PoolSide Villa22.jpg', category: 'Rooms' }, /* double + single with AC */
    { file: 'PoolSide Villa25.jpg', category: 'Rooms' }, /* bedroom with lake view */
    { file: 'Poolside Villa48.jpg', category: 'Rooms' }, /* bunk bed room night */

    /* ── Living & Amenities ── */
    { file: 'PoolSide Villa2.jpg', category: 'Living & Amenities' }, /* lounge + pool view */
    { file: 'PoolSide Villa4.jpg', category: 'Living & Amenities' }, /* grand living room night */
    { file: 'PoolSide Villa23.jpg', category: 'Living & Amenities' }, /* rattan pendant lights */
    { file: 'PoolSide Villa24.jpg', category: 'Living & Amenities' }, /* lounge + bar + pool night */
    { file: 'PoolSide Villa26.jpg', category: 'Living & Amenities' }, /* hallway with pendant lights */
    { file: 'PoolSide Villa27.jpg', category: 'Living & Amenities' }, /* lounge + bar + pool night */
    { file: 'PoolSide Villa28.jpg', category: 'Living & Amenities' }, /* staircase bird's eye */
    { file: 'Poolside Villa29.jpg', category: 'Living & Amenities' }, /* kitchen island */
    { file: 'Poolside Villa31.jpg', category: 'Living & Amenities' }, /* air hockey + foosball */
    { file: 'Poolside Villa32.jpg', category: 'Living & Amenities' }, /* kitchen countertop */
    { file: 'Poolside Villa33.jpg', category: 'Living & Amenities' }, /* rattan dining table */
    { file: 'Poolside Villa34.jpg', category: 'Living & Amenities' }, /* billiards table */
    { file: 'Poolside Villa35.jpg', category: 'Living & Amenities' }, /* glass dining table */
    { file: 'Poolside Villa36.jpg', category: 'Living & Amenities' }, /* kitchen + game room */
    { file: 'Poolside Villa37.jpg', category: 'Living & Amenities' }, /* foosball + air hockey */
    { file: 'Poolside Villa38.jpg', category: 'Living & Amenities' }, /* bird's eye living + dining */
    { file: 'Poolside Villa39.jpg', category: 'Living & Amenities' }, /* wide living area */

    /* ── Grounds & Parking ── */
    { file: 'Poolside Villa30.jpg', category: 'Grounds & Parking' }, /* outdoor patio night */
    { file: 'Poolside Villa41.jpg', category: 'Grounds & Parking' }, /* front gate night */
    { file: 'Poolside Villa44.jpg', category: 'Grounds & Parking' }, /* bamboo side path night */
    { file: 'Poolside Villa45.jpg', category: 'Grounds & Parking' }, /* bamboo garden pathway day */
];

function setupGallery() {
    var grid = document.getElementById('galleryGrid');
    var filterBar = document.getElementById('galleryFilters');
    if (!grid || !filterBar) return;

    /* ── Tile size pattern: gives the masonry layout visual rhythm.
       Every Nth photo gets a 'tall' class so some tiles are taller.
       Index 0 in each category gets a subtle 'featured' treatment. ── */
    var TALL_POSITIONS = [0, 3, 7, 11, 15, 19, 23]; /* 0-based within visible list */

    /* ── Count photos per category for badge labels ── */
    var countMap = { 'All': ALL_GALLERY_PHOTOS.length };
    ALL_GALLERY_PHOTOS.forEach(function(p) {
        countMap[p.category] = (countMap[p.category] || 0) + 1;
    });

    /* ── Build category filter pills ── */
    var categories = ['All'];
    ALL_GALLERY_PHOTOS.forEach(function(p) {
        if (categories.indexOf(p.category) === -1) categories.push(p.category);
    });

    categories.forEach(function(cat, i) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'gallery-filter' + (i === 0 ? ' active' : '');
        btn.setAttribute('data-filter', cat);
        btn.innerHTML =
            cat +
            '<span class="gf-count">' + (countMap[cat] || 0) + '</span>';
        filterBar.appendChild(btn);
    });

    /* ── Active photo list for the current filter (used by lightbox) ── */
    var activePhotos = ALL_GALLERY_PHOTOS.slice();
    var currentLightboxIndex = 0;

    /* ── Build tiles ── */
    function drawTiles(activeCategory) {
        activePhotos = activeCategory === 'All' ?
            ALL_GALLERY_PHOTOS.slice() :
            ALL_GALLERY_PHOTOS.filter(function(p) { return p.category === activeCategory; });

        grid.innerHTML = '';

        activePhotos.forEach(function(photo, idx) {
            var isTall = TALL_POSITIONS.indexOf(idx) !== -1;

            var tile = document.createElement('figure');
            tile.className = 'gallery-tile' + (isTall ? ' tile-tall' : '');
            tile.setAttribute('data-index', idx);
            /* stagger the entrance animation */
            tile.style.animationDelay = (idx * 35) + 'ms';

            tile.innerHTML =
                '<div class="gallery-tile-img-wrap">' +
                '<img src="' + GALLERY_FOLDER + encodeURIComponent(photo.file).replace(/%20/g, '%20') +
                '" alt="' + photo.category + '" loading="lazy" />' +
                '</div>' +
                /* hover overlay: dark scrim + magnify icon + category label */
                '<div class="gallery-tile-overlay" aria-hidden="true">' +
                '<div class="gallery-tile-zoom">&#x26F6;</div>' +
                '<figcaption>' + photo.category + '</figcaption>' +
                '</div>';

            grid.appendChild(tile);
        });
    }

    /* ── Filter button clicks ── */
    filterBar.addEventListener('click', function(e) {
        var clicked = e.target.closest('.gallery-filter');
        if (!clicked) return;
        filterBar.querySelectorAll('.gallery-filter').forEach(function(b) {
            b.classList.toggle('active', b === clicked);
        });
        drawTiles(clicked.getAttribute('data-filter'));
    });

    /* ── Lightbox wiring ── */
    var lightbox = document.getElementById('lightbox');
    var lightboxImg = document.getElementById('lightboxImg');
    var lightboxCaption = document.getElementById('lightboxCaption');
    var lightboxCounter = document.getElementById('lightboxCounter');
    var lightboxClose = document.getElementById('lightboxClose');
    var lightboxPrev = document.getElementById('lightboxPrev');
    var lightboxNext = document.getElementById('lightboxNext');

    function updateLightboxContent(idx) {
        if (!lightboxImg || idx < 0 || idx >= activePhotos.length) return;
        currentLightboxIndex = idx;
        var photo = activePhotos[idx];

        /* fade out → swap src → fade in */
        lightboxImg.classList.add('lb-fade');
        setTimeout(function() {
            lightboxImg.src = GALLERY_FOLDER + photo.file;
            lightboxImg.alt = photo.category;
            lightboxCaption.textContent = photo.category;
            if (lightboxCounter) {
                lightboxCounter.textContent = (idx + 1) + ' / ' + activePhotos.length;
            }
            lightboxImg.classList.remove('lb-fade');
        }, 180);
    }

    function openLightbox(idx) {
        if (!lightbox) return;
        updateLightboxContent(idx);
        lightbox.classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    function closeLightbox() {
        if (!lightbox) return;
        lightbox.classList.remove('open');
        document.body.style.overflow = '';
        lightboxImg.src = '';
    }

    function showPrev() {
        var prev = (currentLightboxIndex - 1 + activePhotos.length) % activePhotos.length;
        updateLightboxContent(prev);
    }

    function showNext() {
        var next = (currentLightboxIndex + 1) % activePhotos.length;
        updateLightboxContent(next);
    }

    /* open on tile click */
    grid.addEventListener('click', function(e) {
        var tile = e.target.closest('.gallery-tile');
        if (!tile) return;
        var idx = parseInt(tile.getAttribute('data-index'), 10);
        openLightbox(isNaN(idx) ? 0 : idx);
    });

    /* close button */
    if (lightboxClose) lightboxClose.addEventListener('click', closeLightbox);

    /* click backdrop to close */
    if (lightbox) lightbox.addEventListener('click', function(e) {
        if (e.target === lightbox) closeLightbox();
    });

    /* prev / next buttons */
    if (lightboxPrev) lightboxPrev.addEventListener('click', function(e) {
        e.stopPropagation();
        showPrev();
    });
    if (lightboxNext) lightboxNext.addEventListener('click', function(e) {
        e.stopPropagation();
        showNext();
    });

    /* keyboard: Escape = close, ← = prev, → = next */
    document.addEventListener('keydown', function(e) {
        if (!lightbox || !lightbox.classList.contains('open')) return;
        if (e.key === 'Escape') closeLightbox();
        if (e.key === 'ArrowLeft') showPrev();
        if (e.key === 'ArrowRight') showNext();
    });

    /* touch/swipe support for mobile */
    var touchStartX = 0;
    if (lightbox) {
        lightbox.addEventListener('touchstart', function(e) {
            touchStartX = e.changedTouches[0].clientX;
        }, { passive: true });
        lightbox.addEventListener('touchend', function(e) {
            var dx = e.changedTouches[0].clientX - touchStartX;
            if (Math.abs(dx) > 50) {
                if (dx < 0) showNext();
                else showPrev();
            }
        }, { passive: true });
    }

    /* initial render */
    drawTiles('All');
}


/* ============================================================
   ABOUT VIDEO — play while visible and pause when scrolled away
   ============================================================ */

function setupAboutVideoSound() {
    var video = document.getElementById('aboutVideo');
    if (!video) return;
    var isVisible = false;

    function playVisibleVideo() {
        if (!isVisible || document.hidden) return;
        video.muted = false;
        var playRequest = video.play();
        if (!playRequest || !playRequest.catch) return;

        playRequest.catch(function(error) {
            if (!isVisible || document.hidden) return;
            if (error.name === 'AbortError') return;
            if (error.name === 'NotAllowedError') {
                console.warn('The browser blocked video autoplay with sound. Interact with the page while the video is visible to start playback.');
                return;
            }
            console.error('Could not play the villa video:', error);
        });
    }

    var watcher = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
            isVisible = entry.isIntersecting && entry.intersectionRatio >= 0.5;
            if (isVisible) {
                playVisibleVideo();
            } else {
                video.pause();
            }
        });
    }, { threshold: 0.5 });

    watcher.observe(video);
    document.addEventListener('visibilitychange', function() {
        if (document.hidden) {
            video.pause();
        } else if (isVisible) {
            playVisibleVideo();
        }
    });

    function retryAfterInteraction() {
        if (isVisible && video.paused) playVisibleVideo();
    }
    document.addEventListener('pointerdown', retryAfterInteraction, true);
    document.addEventListener('keydown', retryAfterInteraction, true);
}


/* ============================================================
   PAGE INIT
   ============================================================ */

document.addEventListener('DOMContentLoaded', function() {
    setupMobileMenu();
    setupHeroSlideshow();
    setupRulesAccordion();
    setupReviewsCarousel();
    setupAmenityTabs();
    setupGallery();
    setupAboutVideoSound();
    loadReviewsFromDatabase(); /* replaces old showSavedReviews() */
});