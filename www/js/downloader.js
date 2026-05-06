/**
 * WU Odoo Mobile Downloader
 * Di-inject ke halaman Odoo oleh app.js setelah halaman selesai load.
 * Intercept semua aksi download Odoo dan kirim ke Cordova via postMessage.
 */
(function () {
    'use strict';

    if (window.__wuDownloaderInstalled) return;
    window.__wuDownloaderInstalled = true;

    console.log('[WU Downloader] Installed');

    var DOWNLOAD_PATTERNS = [
        /\/web\/content\//i,
        /\/web\/binary\//i,
        /\/report\/pdf\//i,
        /\/report\/xlsx\//i,
        /download=true/i,
        /\/report\/download/i,
    ];

    function isDownloadUrl(url) {
        if (!url) return false;
        for (var i = 0; i < DOWNLOAD_PATTERNS.length; i++) {
            if (DOWNLOAD_PATTERNS[i].test(url)) return true;
        }
        return false;
    }

    function getFilename(url, fallback) {
        try {
            var m = url.match(/[?&]filename=([^&]+)/i) || url.match(/[?&]name=([^&]+)/i);
            if (m) return decodeURIComponent(m[1]);
            var path = url.split('?')[0];
            var parts = path.split('/');
            var last = parts[parts.length - 1];
            if (last && last.indexOf('.') !== -1) return decodeURIComponent(last);
        } catch (e) {}
        return fallback || ('odoo_file_' + Date.now());
    }

    function sendToApp(url, filename) {
        // Bangun URL absolut
        var absUrl = url;
        if (url && url.charAt(0) === '/') {
            absUrl = window.location.protocol + '//' + window.location.host + url;
        }
        var fn = filename || getFilename(absUrl);
        console.log('[WU Downloader] sendToApp:', fn, absUrl);

        // Simpan ke localStorage — app.js akan membaca ini saat kembali ke index.html
        try {
            localStorage.setItem('wu_pending_download', JSON.stringify({
                url: absUrl,
                filename: fn,
                ts: Date.now()
            }));
            console.log('[WU Downloader] Tersimpan di localStorage');
        } catch(e) {
            console.error('[WU Downloader] localStorage error:', e);
        }

        // Navigasi kembali ke index.html agar app.js bisa proses download
        // Cordova WebView akan kembali ke halaman utama
        setTimeout(function() {
            window.location.href = 'index.html';
        }, 100);
    }

    // ── Override XMLHttpRequest untuk intercept download via XHR ─────────────
    var _XHR = window.XMLHttpRequest;
    function PatchedXHR() {
        var xhr = new _XHR();
        var _open = xhr.open.bind(xhr);
        var _send = xhr.send.bind(xhr);
        var _url = '';
        var _self = this;

        this.open = function (method, url) {
            _url = url || '';
            return _open.apply(xhr, arguments);
        };

        this.send = function () {
            if (isDownloadUrl(_url)) {
                // Intercept: download via app bukan XHR
                console.log('[WU Downloader] XHR intercepted:', _url);
                sendToApp(_url);
                // Simulasi response kosong agar Odoo tidak error
                setTimeout(function () {
                    try {
                        Object.defineProperty(xhr, 'readyState', { get: function () { return 4; } });
                        Object.defineProperty(xhr, 'status', { get: function () { return 200; } });
                        if (xhr.onload) xhr.onload({ target: xhr });
                        if (xhr.onreadystatechange) xhr.onreadystatechange();
                    } catch (e) {}
                }, 100);
                return;
            }
            return _send.apply(xhr, arguments);
        };

        // Proxy semua property lainnya
        var props = ['responseType', 'timeout', 'withCredentials', 'onload',
                     'onerror', 'ontimeout', 'onreadystatechange', 'onprogress',
                     'onabort', 'onloadend', 'onloadstart'];
        props.forEach(function (p) {
            Object.defineProperty(_self, p, {
                get: function () { return xhr[p]; },
                set: function (v) { xhr[p] = v; }
            });
        });

        var readProps = ['readyState', 'status', 'statusText', 'response',
                         'responseText', 'responseURL', 'responseXML'];
        readProps.forEach(function (p) {
            Object.defineProperty(_self, p, {
                get: function () { try { return xhr[p]; } catch (e) { return null; } }
            });
        });

        this.setRequestHeader = function () { return xhr.setRequestHeader.apply(xhr, arguments); };
        this.getResponseHeader = function () { return xhr.getResponseHeader.apply(xhr, arguments); };
        this.getAllResponseHeaders = function () { return xhr.getAllResponseHeaders.apply(xhr, arguments); };
        this.abort = function () { return xhr.abort.apply(xhr, arguments); };
        this.overrideMimeType = function () { return xhr.overrideMimeType.apply(xhr, arguments); };
    }

    // Jangan override XHR — terlalu berisiko merusak Odoo
    // Gunakan pendekatan yang lebih aman: intercept klik dan form submit

    // ── Intercept klik pada link download ────────────────────────────────────
    document.addEventListener('click', function (e) {
        var el = e.target;
        while (el && el.tagName !== 'A') el = el.parentElement;
        if (!el) return;

        var href = el.getAttribute('href') || '';
        if (!href || !isDownloadUrl(href)) return;

        e.preventDefault();
        e.stopImmediatePropagation();

        var filename = el.getAttribute('download') || el.title || '';
        sendToApp(href, filename);
    }, true);

    // ── Intercept form submit dengan action download ──────────────────────────
    document.addEventListener('submit', function (e) {
        var form = e.target;
        if (!form || form.tagName !== 'FORM') return;
        var action = form.getAttribute('action') || '';
        if (!isDownloadUrl(action)) return;

        e.preventDefault();
        e.stopImmediatePropagation();

        // Bangun URL dari form
        var params = [];
        var inputs = form.querySelectorAll('input, select, textarea');
        for (var i = 0; i < inputs.length; i++) {
            var inp = inputs[i];
            if (inp.name) params.push(encodeURIComponent(inp.name) + '=' + encodeURIComponent(inp.value || ''));
        }
        var url = action + (action.indexOf('?') >= 0 ? '&' : '?') + params.join('&');
        sendToApp(url);
    }, true);

    // ── Override window.open untuk download ──────────────────────────────────
    var _origOpen = window.open;
    window.open = function (url, target, features) {
        if (url && isDownloadUrl(url)) {
            console.log('[WU Downloader] window.open intercepted:', url);
            sendToApp(url);
            return null;
        }
        return _origOpen ? _origOpen.call(window, url, target, features) : null;
    };

    // ── Override Odoo get_file jika sudah ter-load ────────────────────────────
    function patchOdooAjax() {
        try {
            if (window.odoo && window.odoo.__DEBUG__ && window.odoo.__DEBUG__.services) {
                var ajax = window.odoo.__DEBUG__.services['web.ajax'];
                if (ajax && ajax.get_file) {
                    var _orig = ajax.get_file.bind(ajax);
                    ajax.get_file = function (options) {
                        var url = options.url || (options.form && options.form.action) || '';
                        console.log('[WU Downloader] ajax.get_file intercepted:', url);
                        sendToApp(url, options.data && options.data.filename);
                        if (options.success) setTimeout(options.success, 300);
                        if (options.complete) setTimeout(options.complete, 300);
                    };
                    console.log('[WU Downloader] ajax.get_file patched ✓');
                }
            }
        } catch (e) {
            console.warn('[WU Downloader] patch ajax error:', e);
        }
    }

    // Coba patch sekarang dan setelah delay (Odoo mungkin belum selesai load)
    patchOdooAjax();
    setTimeout(patchOdooAjax, 2000);
    setTimeout(patchOdooAjax, 5000);

    console.log('[WU Downloader] Ready ✓');
})();
