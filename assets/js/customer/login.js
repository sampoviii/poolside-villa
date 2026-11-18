/* ============================================================
   login.js  —  Customer Login / Sign Up page
   ============================================================ */

document.addEventListener('DOMContentLoaded', function() {

    var loginForm = document.getElementById('loginForm');
    var signupForm = document.getElementById('signupForm');
    var forgotForm1 = document.getElementById('forgotPasswordForm');
    var forgotForm2 = document.getElementById('forgotStep2Form');
    var messageBox = document.getElementById('authMessage');
    var tabButtons = document.querySelectorAll('.auth-tab');
    var allForms = document.querySelectorAll('.auth-form');

    function showMessage(text, type) {
        if (!messageBox) return;
        messageBox.textContent = text;
        messageBox.className = 'auth-message ' + type;
    }

    function hideMessage() {
        if (messageBox) messageBox.className = 'auth-message';
    }

    function showForm(formName) {
        allForms.forEach(function(form) {
            form.classList.toggle('active', form.id === formName + 'Form');
        });
        tabButtons.forEach(function(tab) {
            tab.classList.toggle('active', tab.getAttribute('data-auth-tab') === formName);
        });
        hideMessage();
    }

    tabButtons.forEach(function(tab) {
        tab.addEventListener('click', function() {
            showForm(tab.getAttribute('data-auth-tab'));
        });
    });


    /* ============================================================
       TERMS & CONDITIONS AND DATA PRIVACY MODALS
       ============================================================ */
    function bindPolicyModal(triggerId, modalId, closeBtnId, ackBtnId) {
        var trigger = document.getElementById(triggerId);
        var modal = document.getElementById(modalId);
        var closeBtn = document.getElementById(closeBtnId);
        var ackBtn = document.getElementById(ackBtnId);

        if (!trigger || !modal) return;

        function openPolicyModal(e) {
            e.preventDefault();
            e.stopPropagation();
            modal.classList.add('open');
        }

        function closePolicyModal() {
            modal.classList.remove('open');
        }

        trigger.addEventListener('click', openPolicyModal);
        trigger.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ' ') openPolicyModal(e);
        });

        if (closeBtn) closeBtn.addEventListener('click', closePolicyModal);
        if (ackBtn) ackBtn.addEventListener('click', closePolicyModal);

        modal.addEventListener('click', function(e) {
            if (e.target === modal) closePolicyModal();
        });
    }

    bindPolicyModal('openTermsModalLink', 'termsConditionsModal', 'closeTermsModalBtn', 'ackTermsModalBtn');
    bindPolicyModal('openPrivacyModalLink', 'dataPrivacyModal', 'closePrivacyModalBtn', 'ackPrivacyModalBtn');

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            var termsModal = document.getElementById('termsConditionsModal');
            var privacyModal = document.getElementById('dataPrivacyModal');
            if (termsModal) termsModal.classList.remove('open');
            if (privacyModal) privacyModal.classList.remove('open');
        }
    });


    /* ============================================================
       REAL-TIME VALIDATION HELPERS
       ============================================================ */

    function setHint(elementId, message, isValid) {
        var hintEl = document.getElementById(elementId);
        var inputIds = {
            firstNameHint: 'signupFirstName',
            lastNameHint: 'signupLastName',
            emailHint: 'signupEmail',
            phoneHint: 'signupPhone',
            passwordStrengthHint: 'signupPassword',
            confirmPasswordHint: 'signupConfirmPassword'
        };
        var inputEl = document.getElementById(inputIds[elementId]);

        if (inputEl) inputEl.classList.toggle('is-invalid', !!message && !isValid);
        if (!hintEl) return;
        hintEl.textContent = message;
        if (!message) {
            hintEl.className = 'form-hint';
        } else if (isValid) {
            hintEl.className = 'form-hint pw-ok';
        } else {
            hintEl.className = 'form-hint pw-weak';
        }
    }

    function validatePasswordPattern(pw) {
        if (!pw) return '✖ Password is required.';
        if (pw.length < 8) return '✖ At least 8 characters required.';
        if (!/[A-Z]/.test(pw)) return '✖ Must contain at least one uppercase letter (A-Z).';
        if (!/[a-z]/.test(pw)) return '✖ Must contain at least one lowercase letter (a-z).';
        if (!/[0-9]/.test(pw)) return '✖ Must contain at least one number (0-9).';
        if (!/[!@#$%^&*()_+\-=\[\]{};:\'",.<>?\/\\|\`~]/.test(pw)) return '✖ Must contain at least one special character.';
        return '✔ Strong password!';
    }

    function validateNamePattern(name, fieldName) {
        if (!name) return '✖ ' + fieldName + ' is required.';
        if (!/^[A-Z][a-zA-Z]{1,}(?:\s[A-Z][a-zA-Z]{1,})*$/.test(name)) {
            return '✖ ' + fieldName + ' must start with a capital letter and contain letters only.';
        }
        return '✔ Looks good!';
    }

    function validatePhonePattern(phone) {
        if (!phone) return '✖ Phone number is required.';
        if (!/^09\d{9}$/.test(phone.replace(/[\s()-]/g, ''))) {
            return '✖ Must be 11 digits starting with "09" (e.g. 09123456789)';
        }
        return '✔ Valid phone number!';
    }

    var validEmailPattern = /^[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,10}$/;
    var blockedEmailDomains = [
        '10minutemail.com', '10minutemail.net', '20minutemail.com', '33mail.com',
        'anonbox.net', 'binkmail.com', 'bobmail.info', 'burnermail.io',
        'cool.fr.nf', 'courriel.fr.nf', 'crazymailing.com', 'deadaddress.com',
        'discard.email', 'discardmail.com', 'discardmail.de', 'disposable.com',
        'disposableaddress.com', 'disposableemailaddresses.com', 'dispostable.com',
        'dodgeit.com', 'dodgit.com', 'dropmail.me', 'dumpmail.de',
        'e4ward.com', 'emailondeck.com', 'emailtemporario.com.br', 'example.com',
        'example.net', 'example.org', 'fakeinbox.com', 'fakemail.net',
        'fakemailgenerator.com', 'filzmail.com', 'getairmail.com', 'getnada.com',
        'guerrillamail.biz', 'guerrillamail.com', 'guerrillamail.de', 'guerrillamail.info',
        'guerrillamail.net', 'guerrillamail.org', 'guerrillamailblock.com', 'harakirimail.com',
        'incognitomail.com', 'inboxalias.com', 'inboxkitten.com', 'invalid.com',
        'jetable.org', 'junkmail.com', 'koszmail.pl', 'kurzepost.de',
        'localhost', 'mailcatch.com', 'maildrop.cc', 'mailexpire.com',
        'mailforspam.com', 'mailfreeonline.com', 'mailinator.com', 'mailinator.net',
        'mailinator.org', 'mailinator2.com', 'mailismagic.com', 'mailnesia.com',
        'mailnull.com', 'mailsac.com', 'mailscrap.com', 'mailtemp.info',
        'mintemail.com', 'mohmal.com', 'moakt.com', 'mt2015.com',
        'my10minutemail.com', 'mytemp.email', 'mytrashmail.com', 'nada.email',
        'no-spam.ws', 'nospam.ze.tc', 'nowmymail.com', 'objectmail.com',
        'oneoffemail.com', 'owlpic.com', 'pokemail.net', 'proxymail.eu',
        'putthisinyourspamdatabase.com', 'rcpt.at', 'receiveee.com', 'rhyta.com',
        'sharklasers.com', 'shieldedmail.com', 'shitmail.me', 'sneakemail.com',
        'sofimail.com', 'spam4.me', 'spamavert.com', 'spambog.com',
        'spambog.de', 'spambog.ru', 'spambox.us', 'spamcero.com',
        'spamex.com', 'spamfree24.org', 'spamgourmet.com', 'spamhereplease.com',
        'spamhole.com', 'spaml.com', 'spammotel.com', 'spamobox.com',
        'spamslicer.com', 'spamspot.com', 'spamthis.co.uk', 'supergreatmail.com',
        'teleworm.us', 'temp-mail.io', 'temp-mail.org', 'temp-mail.ru',
        'tempail.com', 'tempalias.com', 'tempe-mail.com', 'tempemail.biz',
        'tempemail.co.za', 'tempemail.com', 'tempemail.net', 'tempinbox.co.uk',
        'tempinbox.com', 'tempmail.co', 'tempmail.com', 'tempmail.de',
        'tempmail.eu', 'tempmail.it', 'tempmail.net', 'tempmail.org',
        'tempmail.us', 'tempmail2.com', 'tempmailaddress.com', 'tempmailer.com',
        'tempomail.fr', 'temporaryemail.net', 'temporaryemail.us', 'temporaryforwarding.com',
        'temporaryinbox.com', 'temporarymailaddress.com', 'test.com', 'thankyou2010.com',
        'thisisnotmyrealemail.com', 'throwam.com', 'throwawayemailaddress.com', 'throwawaymail.com',
        'tmail.ws', 'tmailinator.com', 'trash-mail.at', 'trash-mail.com',
        'trash-mail.de', 'trash2009.com', 'trashemail.de', 'trashmail.at',
        'trashmail.com', 'trashmail.de', 'trashmail.me', 'trashmail.net',
        'trashmail.org', 'trashmailer.com', 'trashymail.com', 'trbvm.com',
        'turual.com', 'twinmail.de', 'tyldd.com', 'uggsrock.com',
        'upliftnow.com', 'venompen.com', 'veryrealemail.com', 'viditag.com',
        'viewcastmedia.com', 'webm4il.info', 'wegwerfadresse.de', 'wegwerfemail.com',
        'wegwerfemail.de', 'wegwerfmail.de', 'wegwerfmail.net', 'wegwerfmail.org',
        'wh4f.org', 'whatiaas.com', 'whatpaas.com', 'whyspam.me',
        'willselfdestruct.com', 'winemaven.info', 'wronghead.com', 'wuzup.net',
        'wuzupmail.net', 'wwwnew.eu', 'xagloo.com', 'xemaps.com',
        'xents.com', 'xmaily.com', 'xoxy.net', 'yep.it',
        'yogamaven.com', 'yopmail.com', 'yopmail.fr', 'yopmail.net',
        'yourdomain.com', 'ypmail.webarnak.fr.eu.org', 'yuurok.com', 'zehnminuten.de',
        'zehnminutenmail.de', 'zippymail.info', 'zoaxe.com', 'zoemail.org'
    ];

    function isBlockedEmailDomain(domain) {
        for (var i = 0; i < blockedEmailDomains.length; i++) {
            var blocked = blockedEmailDomains[i];
            if (domain === blocked || domain.slice(-(blocked.length + 1)) === '.' + blocked) {
                return true;
            }
        }
        return false;
    }

    function validateEmailPattern(rawEmail) {
        var email = rawEmail.trim();
        if (!email) return '✖ Email address is required.';
        if (rawEmail !== email || /\s/.test(email)) {
            return '✖ This email is not valid. Remove spaces in the email address.';
        }
        if (/[A-Z]/.test(email)) {
            return '✖ This email is not valid. Use lowercase letters only.';
        }
        var domain = email.split('@')[1] || '';
        if (!validEmailPattern.test(email) || domain.indexOf('..') !== -1) {
            return '✖ This email is not valid.';
        }
        if (isBlockedEmailDomain(domain)) {
            return '✖ This email is not valid. Temporary or disposable emails are not allowed.';
        }
        return '✔ This email is valid.';
    }

    /* ---- Instant Real-time Input Listeners ---- */
    var fnInput = document.getElementById('signupFirstName');
    var lnInput = document.getElementById('signupLastName');
    var emailInput = document.getElementById('signupEmail');
    var phoneInput = document.getElementById('signupPhone');
    var pwInput = document.getElementById('signupPassword');
    var cpwInput = document.getElementById('signupConfirmPassword');
    var privacyCheck = document.getElementById('signupPrivacyAgree');

    function checkFirstName() {
        var val = fnInput ? fnInput.value.trim() : '';
        var res = validateNamePattern(val, 'First name');
        setHint('firstNameHint', res, res.startsWith('✔'));
        return res.startsWith('✔');
    }

    function checkLastName() {
        var val = lnInput ? lnInput.value.trim() : '';
        var res = validateNamePattern(val, 'Last name');
        setHint('lastNameHint', res, res.startsWith('✔'));
        return res.startsWith('✔');
    }

    function checkEmail() {
        var val = emailInput ? emailInput.value : '';
        var res = validateEmailPattern(val);
        setHint('emailHint', res, res.startsWith('✔'));
        return res.startsWith('✔');
    }

    function checkPhone() {
        var val = phoneInput ? phoneInput.value.trim().replace(/[\s()-]/g, '') : '';
        if (phoneInput && val !== phoneInput.value) phoneInput.value = val;
        var res = validatePhonePattern(val);
        setHint('phoneHint', res, res.startsWith('✔'));
        return res.startsWith('✔');
    }

    function checkPassword() {
        var val = pwInput ? pwInput.value : '';
        var res = validatePasswordPattern(val);
        setHint('passwordStrengthHint', res, res.startsWith('✔'));
        if (cpwInput && cpwInput.value) checkConfirmPassword();
        return res.startsWith('✔');
    }

    function checkConfirmPassword() {
        var val = cpwInput ? cpwInput.value : '';
        var pw = pwInput ? pwInput.value : '';
        if (!val) {
            setHint('confirmPasswordHint', '✖ Please confirm your password.', false);
            return false;
        }
        if (val !== pw) {
            setHint('confirmPasswordHint', '✖ Passwords do not match.', false);
            return false;
        }
        setHint('confirmPasswordHint', '✔ Passwords match!', true);
        return true;
    }

    function checkPrivacy() {
        if (!privacyCheck) return false;
        if (!privacyCheck.checked) {
            setHint('privacyHint', '✖ You must agree to the Terms & Privacy policy to proceed.', false);
            return false;
        }
        setHint('privacyHint', '', true);
        return true;
    }

    if (fnInput) {
        fnInput.addEventListener('input', checkFirstName);
        fnInput.addEventListener('blur', checkFirstName);
    }
    if (lnInput) {
        lnInput.addEventListener('input', checkLastName);
        lnInput.addEventListener('blur', checkLastName);
    }
    if (emailInput) {
        emailInput.addEventListener('input', checkEmail);
        emailInput.addEventListener('blur', checkEmail);
    }
    if (phoneInput) {
        phoneInput.addEventListener('input', checkPhone);
        phoneInput.addEventListener('blur', checkPhone);
    }
    if (pwInput) {
        pwInput.addEventListener('input', checkPassword);
        pwInput.addEventListener('blur', checkPassword);
    }
    if (cpwInput) {
        cpwInput.addEventListener('input', checkConfirmPassword);
        cpwInput.addEventListener('blur', checkConfirmPassword);
    }
    if (privacyCheck) { privacyCheck.addEventListener('change', checkPrivacy); }


    /* ============================================================
       FORM 1 — SIGN UP
       ============================================================ */
    if (signupForm) {
        signupForm.addEventListener('submit', function(e) {
            e.preventDefault();

            var firstName = getFieldValue('signupFirstName').trim();
            var lastName = getFieldValue('signupLastName').trim();
            var email = getFieldValue('signupEmail').trim();
            var phone = getFieldValue('signupPhone').trim().replace(/[\s()-]/g, '');
            var password = getFieldValue('signupPassword');
            var confirmPassword = getFieldValue('signupConfirmPassword');

            if (!firstName || !lastName || !email || !phone || !password || !confirmPassword) {
                showMessage('Please fill in all required fields.', 'error');
                return;
            }

            if (!checkFirstName() || !checkLastName() || !checkEmail() || !checkPhone() || !checkPassword() || !checkConfirmPassword() || !checkPrivacy()) {
                showMessage('Please fix the errors indicated in red above.', 'error');
                return;
            }

            showMessage('Creating account...', 'info');

            callApi('auth.php', {
                action: 'register',
                firstName: firstName,
                lastName: lastName,
                email: email,
                phone: phone,
                password: password,
                confirmPassword: confirmPassword,
                privacyAgreement: privacyCheck && privacyCheck.checked
            }, function(result) {
                if (!result.ok) {
                    showMessage(result.error, 'error');
                    return;
                }
                showMessage(result.message, 'success');
                setTimeout(function() {
                    showForm('login');
                    var loginEmailField = document.getElementById('loginEmail');
                    if (loginEmailField) loginEmailField.value = email;
                }, 1200);
            });
        });
    }


    /* ============================================================
       FORM 2 — LOGIN (Customer, Caretaker & Admin)
       ============================================================ */
    if (loginForm) {
        loginForm.addEventListener('submit', function(e) {
            e.preventDefault();

            var email = getFieldValue('loginEmail').trim().toLowerCase();
            var password = getFieldValue('loginPassword');

            if (!email || !password) {
                showMessage('Please enter your email and password.', 'error');
                return;
            }

            showMessage('Logging in...', 'info');

            callApi('auth.php', { action: 'login', email: email, password: password }, function(result) {
                if (!result.ok) {
                    showMessage(result.error, 'error');
                    return;
                }

                saveSession(result.fullName, result.email, result.role);

                var firstName = result.firstName || result.fullName || 'User';
                sessionStorage.setItem('show_welcome_toast', 'Welcome back, ' + firstName + '!');

                showMessage('Welcome back! Redirecting...', 'success');
                setTimeout(function() {
                    if (result.role === 'admin') {
                        window.location.href = '../admin/dashboard.html';
                    } else if (result.role === 'caretaker') {
                        window.location.href = '../caretaker/dashboard.html';
                    } else {
                        window.location.href = 'home.html';
                    }
                }, 800);
            });
        });
    }


    /* ============================================================
       FORM 3 — FORGOT PASSWORD STEP 1
       ============================================================ */
    var forgotLink = document.getElementById('forgotPasswordLink');
    if (forgotLink) {
        forgotLink.addEventListener('click', function(e) {
            e.preventDefault();
            if (forgotForm1) forgotForm1.reset();
            showForm('forgotPassword');
        });
    }

    if (forgotForm1) {
        forgotForm1.addEventListener('submit', function(e) {
            e.preventDefault();

            var email = getFieldValue('forgotEmail').trim().toLowerCase();
            if (!email) { showMessage('Please enter your email address.', 'error'); return; }

            /* Lock the Send Code button + show a clear "sending" state while the email is generated */
            var submitBtn = forgotForm1.querySelector('button[type="submit"]');
            var originalBtnText = submitBtn ? submitBtn.textContent : '';
            if (submitBtn) { submitBtn.disabled = true;
                submitBtn.textContent = 'Sending...'; }

            showMessage('Sending verification code to your email... Please wait a moment.', 'info');

            callApi('auth.php', { action: 'forgot_step1', email: email }, function(result) {
                /* Always restore the button so the customer can retry if it failed */
                if (submitBtn) { submitBtn.disabled = false;
                    submitBtn.textContent = originalBtnText; }

                if (!result.ok) { showMessage(result.error, 'error'); return; }

                var step2Email = document.getElementById('forgotStep2Email');
                if (step2Email) step2Email.value = email;

                ['forgotCode', 'forgotNewPassword', 'forgotConfirmPassword'].forEach(function(id) {
                    var field = document.getElementById(id);
                    if (field) field.value = '';
                });

                allForms.forEach(function(f) { f.classList.remove('active'); });
                if (forgotForm2) forgotForm2.classList.add('active');
                showMessage(result.message, 'success');
            });
        });
    }

    var backToLoginLink = document.getElementById('backToLoginLink');
    if (backToLoginLink) {
        backToLoginLink.addEventListener('click', function(e) {
            e.preventDefault();
            showForm('login');
        });
    }


    /* ============================================================
       FORM 4 — FORGOT PASSWORD STEP 2
       ============================================================ */
    if (forgotForm2) {
        forgotForm2.addEventListener('submit', function(e) {
            e.preventDefault();

            var emailField = document.getElementById('forgotStep2Email');
            var email = emailField ? emailField.value.trim().toLowerCase() : '';
            var code = getFieldValue('forgotCode').trim();
            var newPassword = getFieldValue('forgotNewPassword');
            var confirmPw = getFieldValue('forgotConfirmPassword');

            if (!code || code.length !== 6) { showMessage('Please enter a valid 6-digit verification code.', 'error'); return; }
            if (!newPassword) { showMessage('Please enter a new password.', 'error'); return; }
            if (newPassword !== confirmPw) { showMessage('Passwords do not match.', 'error'); return; }

            var pwHint = validatePasswordPattern(newPassword);
            if (pwHint && !pwHint.startsWith('✔')) {
                showMessage(pwHint.replace('✖ ', ''), 'error');
                return;
            }

            showMessage('Verifying code & updating password...', 'info');

            callApi('auth.php', {
                action: 'forgot_step2',
                email: email,
                code: code,
                newPassword: newPassword
            }, function(result) {
                if (!result.ok) { showMessage(result.error, 'error'); return; }

                showMessage(result.message, 'success');
                setTimeout(function() {
                    showForm('login');
                    var loginEmailField = document.getElementById('loginEmail');
                    if (loginEmailField) loginEmailField.value = email;
                }, 1400);
            });
        });
    }

    var backFromStep2 = document.getElementById('backToLoginFromStep2');
    if (backFromStep2) {
        backFromStep2.addEventListener('click', function(e) {
            e.preventDefault();
            showForm('login');
        });
    }

});