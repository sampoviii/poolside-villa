(function() {
    // Keep track of fields the visitor has used so untouched fields do not
    // show error messages until they start typing, leave the field, or submit.
    var touchedFields = new WeakSet();
    var fieldCounter = 0;
    var phonePattern = /^09\d{9}$/;
    var passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
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
    var fieldSelector = 'input[type="email"], input[type="tel"], input[type="password"], input[data-password-toggle], input[id*="phone" i], input[id*="gcashnumber" i]';

    function isBlockedEmailDomain(domain) {
        for (var i = 0; i < blockedEmailDomains.length; i++) {
            var blocked = blockedEmailDomains[i];
            if (domain === blocked || domain.slice(-(blocked.length + 1)) === '.' + blocked) {
                return true;
            }
        }
        return false;
    }

    // Find the field's form group so its feedback can appear beside the input.
    function getGroup(input) {
        return input.closest('.form-group') || input.parentElement;
    }

    function getHint(input) {
        var group = getGroup(input);
        if (!group) return null;

        var hint = group.querySelector('.form-hint');
        if (!hint) {
            hint = document.createElement('span');
            hint.className = 'form-hint live-validation-hint';
            group.appendChild(hint);
        }
        if (!hint.id) {
            fieldCounter++;
            hint.id = 'liveValidationHint' + fieldCounter;
        }

        var descriptions = (input.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
        if (descriptions.indexOf(hint.id) === -1) {
            descriptions.push(hint.id);
            input.setAttribute('aria-describedby', descriptions.join(' '));
        }
        return hint;
    }

    function isVisible(input) {
        var form = input.closest('form');
        return input.getClientRects().length > 0 && (!form || form.getClientRects().length > 0);
    }

    function isPhoneField(input) {
        return input.type === 'tel' || /phone|gcashnumber/i.test(input.id);
    }

    function isPasswordField(input) {
        return input.type === 'password' || input.hasAttribute('data-password-toggle');
    }

    // Current and login passwords are not new-password choices, so they do
    // not need to pass the account-creation strength rules.
    function isNewPassword(input) {
        return isPasswordField(input) &&
            !/current|confirm|login/i.test(input.id) &&
            (/new|signup|forgot|caretaker/i.test(input.id) || /addCaretaker/i.test((input.closest('form') || {}).id || ''));
    }

    function getConfirmationInput(input) {
        var form = input.closest('form');
        if (!form) return null;
        var fields = form.querySelectorAll('input[type="password"], input[data-password-toggle]');
        for (var i = 0; i < fields.length; i++) {
            if (fields[i] !== input && /confirm/i.test(fields[i].id)) return fields[i];
        }
        return null;
    }

    function getPasswordInput(input) {
        var form = input.closest('form');
        if (!form) return null;
        var fields = form.querySelectorAll('input[type="password"], input[data-password-toggle]');
        for (var i = 0; i < fields.length; i++) {
            if (fields[i] !== input && !/confirm|current/i.test(fields[i].id)) return fields[i];
        }
        return null;
    }

    // Check one field and update its visible message and accessibility state.
    function validate(input, showMissing) {
        var rawValue = input.value;
        var value = rawValue.trim();
        var message = '';
        var valid = true;

        if (!value) {
            if (input.required && showMissing) {
                message = 'This field is required.';
                valid = false;
            }
        } else if (input.type === 'email') {
            var domain = value.split('@')[1] || '';
            if (rawValue !== value || /\s/.test(value)) {
                message = 'This email is not valid. Remove spaces in the email address.';
                valid = false;
            } else if (value !== value.toLowerCase()) {
                message = 'This email is not valid. Use lowercase letters only.';
                valid = false;
            } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || !validEmailPattern.test(value) || domain.indexOf('..') !== -1) {
                message = 'This email is not valid.';
                valid = false;
            } else if (isBlockedEmailDomain(domain)) {
                message = 'This email is not valid. Temporary or disposable emails are not allowed.';
                valid = false;
            } else {
                message = 'This email is valid.';
            }
        } else if (isPhoneField(input)) {
            if (!phonePattern.test(value.replace(/[\s()-]/g, ''))) {
                message = 'Enter 11 digits starting with 09 (example: 09123456789).';
                valid = false;
            } else {
                message = 'Phone number looks good.';
            }
        } else if (isPasswordField(input) && isNewPassword(input)) {
            if (!passwordPattern.test(value)) {
                message = 'Use at least 8 characters with uppercase, lowercase, a number, and a symbol.';
                valid = false;
            } else {
                message = 'Password meets the requirements.';
            }
        } else if (isPasswordField(input) && /confirm/i.test(input.id)) {
            var passwordInput = getPasswordInput(input);
            if (passwordInput && value !== passwordInput.value) {
                message = 'Passwords do not match.';
                valid = false;
            } else if (passwordInput && value) {
                message = 'Passwords match.';
            }
        }

        var hint = getHint(input);
        if (hint) {
            hint.textContent = message;
            hint.classList.toggle('pw-ok', !!message && valid);
            hint.classList.toggle('pw-weak', !!message && !valid);
        }
        input.classList.toggle('is-invalid', !!message && !valid);
        input.setAttribute('aria-invalid', message && !valid ? 'true' : 'false');
        return valid;
    }

    // Add live checks once per field, including fields loaded with the page.
    function initializeField(input) {
        if (input.hasAttribute('data-live-validated')) return;
        input.setAttribute('data-live-validated', '');
        var hint = getHint(input);
        if (hint) hint.textContent = '';

        input.addEventListener('input', function() {
            touchedFields.add(input);
            validate(input, true);

            if (isPasswordField(input) && !/confirm/i.test(input.id)) {
                var confirmation = getConfirmationInput(input);
                if (confirmation && touchedFields.has(confirmation)) validate(confirmation, true);
            }
        });
        input.addEventListener('blur', function() {
            touchedFields.add(input);
            validate(input, true);
        });
    }

    // Validate visible fields on submit so hidden forms do not block the page.
    document.addEventListener('DOMContentLoaded', function() {
        document.querySelectorAll(fieldSelector).forEach(initializeField);

        document.addEventListener('submit', function(event) {
            var form = event.target;
            if (!(form instanceof HTMLFormElement)) return;
            var valid = true;
            form.querySelectorAll(fieldSelector).forEach(function(input) {
                if (!isVisible(input)) return;
                touchedFields.add(input);
                if (!validate(input, true)) valid = false;
            });
            if (!valid) {
                event.preventDefault();
                event.stopImmediatePropagation();
            }
        }, true);
    });
})();