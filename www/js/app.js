'use strict';

var App = {
    protocol: 'http', host: '', database: '',
    baseUrl: '', odooUrl: '', savedServers: [], inOdoo: false,
};

function $(id)    { return document.getElementById(id); }
function show(id) { $(id).classList.remove('hidden'); }
function hide(id) { $(id).classList.add('hidden'); }

function showPage(name) {
    ['page-connect','page-database','page-error'].forEach(function(p) {
        var el = document.getElementById(p);
        if (el) el.classList.add('hidden');
    });
    var t = document.getElementById(name);
    if (t) t.classList.remove('hidden');
}

function escHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function buildBaseUrl(protocol, host) {
    host = host.trim().replace(/\/+$/, '');
    if (!host) return '';
    if (/^https?:\/\//i.test(host)) return host;
    return protocol + '://' + host;
}

function isCordovaReal() {
    return typeof cordova !== 'undefined' && cordova.version !== 'stub-browser';
}

function proxyUrl(targetUrl) {
    // Selalu pakai URL langsung — proxy hanya untuk browser dev via cordova.js stub
    // cordova.js stub sudah intercept XHR dan route ke /proxy otomatis
    return targetUrl;
}

function updateProtocolToggle() {
    $('btn-http').classList.toggle('active',  App.protocol === 'http');
    $('btn-https').classList.toggle('active', App.protocol === 'https');
}

function setConnectLoading(on) {
    var btn = $('btn-connect');
    btn.disabled = on;
    btn.querySelector('.btn-text').classList.toggle('hidden', on);
    btn.querySelector('.btn-loader').classList.toggle('hidden', !on);
}

function showConnectError(msg) {
    var el = $('connect-error');
    el.textContent = msg;
    el.classList.remove('hidden');
}
function hideConnectError() { $('connect-error').classList.add('hidden'); }

/* ── Storage ─────────────────────────────────────────────────────────────────── */
function loadSavedServers() {
    try { App.savedServers = JSON.parse(localStorage.getItem('wu_saved_servers') || '[]'); }
    catch(e) { App.savedServers = []; }
}

function saveServer(host, protocol, database) {
    loadSavedServers();
    App.savedServers = App.savedServers.filter(function(s) {
        return !(s.host === host && s.protocol === protocol);
    });
    App.savedServers.unshift({ host: host, protocol: protocol, database: database, ts: Date.now() });
    if (App.savedServers.length > 5) App.savedServers = App.savedServers.slice(0, 5);
    localStorage.setItem('wu_saved_servers', JSON.stringify(App.savedServers));
}

function deleteServer(index) {
    loadSavedServers();
    App.savedServers.splice(index, 1);
    localStorage.setItem('wu_saved_servers', JSON.stringify(App.savedServers));
    renderSavedServers();
}

function renderSavedServers() {
    loadSavedServers();
    var list = $('saved-servers-list');
    list.innerHTML = '';
    if (!App.savedServers.length) { hide('saved-servers-section'); return; }
    show('saved-servers-section');
    App.savedServers.forEach(function(s, i) {
        var item = document.createElement('div');
        item.className = 'saved-server-item';
        item.innerHTML =
            '<div class="saved-server-info">' +
                '<div class="saved-server-url">' + s.protocol + '://' + escHtml(s.host) + '</div>' +
                (s.database ? '<div class="saved-server-db">DB: ' + escHtml(s.database) + '</div>' : '') +
            '</div>' +
            '<button class="saved-server-delete" data-idx="' + i + '">✕</button>';
        item.querySelector('.saved-server-info').addEventListener('click', function() {
            $('input-host').value = s.host;
            App.protocol = s.protocol || 'http';
            updateProtocolToggle();
            if (s.database) {
                App.host = s.host; App.database = s.database;
                App.baseUrl = s.protocol + '://' + s.host;
                openOdoo();
            } else { fetchDatabases(); }
        });
        item.querySelector('.saved-server-delete').addEventListener('click', function(e) {
            e.stopPropagation();
            deleteServer(parseInt(this.dataset.idx));
        });
        list.appendChild(item);
    });
}

/* ── Fetch database list ─────────────────────────────────────────────────────── */
function fetchDatabases() {
    console.log('fetchDatabases() called');
    var host = $('input-host').value.trim();
    console.log('host=[' + host + '] protocol=' + App.protocol);
    if (!host) { showConnectError('Masukkan alamat server terlebih dahulu.'); return; }

    hideConnectError();
    setConnectLoading(true);

    App.host    = host;
    App.baseUrl = buildBaseUrl(App.protocol, host);

    var targetUrl = App.baseUrl + '/web/database/list';
    var url       = proxyUrl(targetUrl);

    console.log('isCordovaReal=' + isCordovaReal());
    console.log('targetUrl=' + targetUrl);
    console.log('url=' + url);

    var xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.timeout = 15000;

    xhr.onreadystatechange = function() {
        console.log('readyState=' + xhr.readyState +
            (xhr.readyState === 4 ? ' status=' + xhr.status : ''));
    };

    xhr.onload = function() {
        console.log('onload status=' + xhr.status);
        setConnectLoading(false);
        if (xhr.status >= 200 && xhr.status < 300) {
            try {
                var resp = JSON.parse(xhr.responseText);
                var dbs  = resp.result || [];
                console.log('dbs=' + JSON.stringify(dbs));
                showDatabasePage(dbs);
            } catch(e) {
                console.warn('JSON parse error: ' + e + ' — manual input');
                showDatabasePage([]);
            }
        } else if (xhr.status === 403 || xhr.status === 404) {
            console.warn('403/404 — manual input');
            showDatabasePage([]);
        } else {
            showConnectError('Server error ' + xhr.status);
        }
    };

    xhr.onerror = function() {
        console.error('XHR onerror! url=' + url);
        setConnectLoading(false);
        console.warn('onerror — fallback ke input manual database');
        showDatabasePage([]);
    };

    xhr.ontimeout = function() {
        console.error('XHR timeout! url=' + url);
        setConnectLoading(false);
        console.warn('ontimeout — fallback ke input manual database');
        showDatabasePage([]);
    };

    console.log('sending XHR...');
    xhr.send(JSON.stringify({ jsonrpc: '2.0', method: 'call', params: {} }));
}

/* ── Database page ───────────────────────────────────────────────────────────── */
function showDatabasePage(dbs) {
    $('db-server-label').textContent = App.baseUrl;
    hide('db-loading'); hide('db-error'); hide('db-list'); hide('db-manual');

    var list = $('db-list');
    list.innerHTML = '';

    if (dbs.length === 0) {
        // Sembunyikan error lama, tampilkan info ringan
        hide('db-error');
        var infoEl = $('db-manual-info');
        if (!infoEl) {
            infoEl = document.createElement('p');
            infoEl.id = 'db-manual-info';
            infoEl.style.cssText = 'color:#888;font-size:13px;margin:0 0 12px 0;text-align:center;';
            var manualDiv = $('db-manual');
            manualDiv.insertBefore(infoEl, manualDiv.firstChild);
        }
        infoEl.textContent = 'Daftar database tidak dapat diambil otomatis. Masukkan nama database secara manual.';
        show('db-manual');
        showPage('page-database');
        return;
    }

    dbs.forEach(function(dbName) {
        var item = document.createElement('div');
        item.className = 'db-item';
        item.innerHTML =
            '<div class="db-icon">🗄️</div>' +
            '<div class="db-info"><div class="db-name">' + escHtml(dbName) + '</div></div>' +
            '<div class="db-arrow">›</div>';
        item.addEventListener('click', function() {
            App.database = dbName;
            saveServer(App.host, App.protocol, App.database);
            openOdoo();
        });
        list.appendChild(item);
    });

    var mt = document.createElement('div');
    mt.className = 'db-manual-toggle';
    mt.textContent = 'Masukkan nama database secara manual';
    mt.addEventListener('click', function() { hide('db-list'); show('db-manual'); });
    list.appendChild(mt);

    show('db-list');
    showPage('page-database');
}

/* ── Open Odoo ───────────────────────────────────────────────────────────────── */
function openOdoo() {
    App.odooUrl = App.baseUrl + '/web?db=' + encodeURIComponent(App.database);
    App.inOdoo  = true;
    localStorage.setItem('wu_last_server', JSON.stringify({
        host: App.host, protocol: App.protocol,
        database: App.database, baseUrl: App.baseUrl
    }));
    console.log('openOdoo → ' + App.odooUrl);
    window.location.href = App.odooUrl;
}

/* ── Side Menu ───────────────────────────────────────────────────────────────── */
function openMenu() {
    var m = $('side-menu'), o = $('side-menu-overlay');
    m.classList.remove('hidden'); o.classList.remove('hidden');
    m.offsetHeight;
    m.classList.add('open'); o.classList.add('open');
}
function closeMenu() {
    var m = $('side-menu'), o = $('side-menu-overlay');
    m.classList.remove('open'); o.classList.remove('open');
    setTimeout(function() { m.classList.add('hidden'); o.classList.add('hidden'); }, 300);
}

/* ── Back button ─────────────────────────────────────────────────────────────── */
function handleBackButton() {
    if ($('side-menu').classList.contains('open')) { closeMenu(); return; }
    if (!$('page-database').classList.contains('hidden')) {
        showPage('page-connect'); renderSavedServers(); return;
    }
    if (typeof navigator.app !== 'undefined') navigator.app.exitApp();
}

/* ── Restore from Odoo ───────────────────────────────────────────────────────── */
function restoreFromOdoo() {
    var raw = localStorage.getItem('wu_last_server');
    if (!raw) return;
    try {
        var s = JSON.parse(raw);
        App.host = s.host; App.protocol = s.protocol;
        App.database = s.database; App.baseUrl = s.baseUrl;
        $('input-host').value = s.host;
        updateProtocolToggle();
    } catch(e) {}
}

/* ── Init events ─────────────────────────────────────────────────────────────── */
function initEvents() {
    console.log('initEvents() start');
    console.log('btn-connect=' + ($('btn-connect') ? 'OK' : 'NULL'));
    console.log('input-host='  + ($('input-host')  ? 'OK' : 'NULL'));

    $('btn-http').addEventListener('click', function() {
        App.protocol = 'http'; updateProtocolToggle();
    });
    $('btn-https').addEventListener('click', function() {
        App.protocol = 'https'; updateProtocolToggle();
    });
    $('btn-connect').addEventListener('click', function() {
        console.log('btn-connect clicked');
        fetchDatabases();
    });
    $('input-host').addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.keyCode === 13) fetchDatabases();
    });
    $('btn-back-to-connect').addEventListener('click', function() {
        showPage('page-connect'); renderSavedServers();
    });
    $('btn-db-manual-connect').addEventListener('click', function() {
        var dbName = $('input-dbname').value.trim();
        if (!dbName) { $('db-error').textContent = 'Masukkan nama database.'; show('db-error'); return; }
        App.database = dbName;
        saveServer(App.host, App.protocol, App.database);
        openOdoo();
    });
    $('btn-error-retry').addEventListener('click', function() {
        showPage('page-connect'); renderSavedServers();
    });
    document.addEventListener('backbutton', handleBackButton, false);
    console.log('initEvents() done');
}

/* ── Splash ──────────────────────────────────────────────────────────────────── */
function hideSplash() {
    var s = $('splash-screen');
    s.classList.add('fade-out');
    setTimeout(function() { s.classList.add('hidden'); }, 500);
    if (typeof navigator.splashscreen !== 'undefined') navigator.splashscreen.hide();
}

/* ── Start ───────────────────────────────────────────────────────────────────── */
function startApp() {
    console.log('startApp() running...');
    try {
        initEvents();
        restoreFromOdoo();
        renderSavedServers();
        showPage('page-connect');
        hideSplash();
        setupDownloadInterceptor();
        console.log('app ready ✓');
    } catch(e) {
        console.error('startApp ERROR: ' + e.message + '\n' + e.stack);
    }
}

/* ── Download Manager ────────────────────────────────────────────────────────
 * Menangkap URL download dari Odoo (PDF, Excel, CSV, dll) dan menyimpan
 * ke folder Downloads di local storage HP menggunakan cordova-plugin-file
 * dan cordova-plugin-file-transfer.
 * --------------------------------------------------------------------------- */

// Ekstensi / pola URL yang dianggap sebagai file download
var DOWNLOAD_EXTENSIONS = /\.(pdf|xlsx|xls|csv|docx|doc|zip|png|jpg|jpeg|gif|txt|ods|odt|pptx|ppt)(\?|$)/i;
var DOWNLOAD_URL_PATTERNS = [
    /\/web\/content\//i,
    /\/report\/pdf\//i,
    /\/report\/xlsx\//i,
    /\/report\/download/i,
    /\/web\/binary\//i,
    /download=true/i,
    /\/document\/download/i,
];

function isDownloadUrl(url) {
    if (!url) return false;
    if (DOWNLOAD_EXTENSIONS.test(url)) return true;
    for (var i = 0; i < DOWNLOAD_URL_PATTERNS.length; i++) {
        if (DOWNLOAD_URL_PATTERNS[i].test(url)) return true;
    }
    return false;
}

function getFilenameFromUrl(url) {
    try {
        var fnMatch = url.match(/[?&]filename=([^&]+)/i) ||
                      url.match(/[?&]name=([^&]+)/i);
        if (fnMatch) return decodeURIComponent(fnMatch[1]);
        var path = url.split('?')[0];
        var parts = path.split('/');
        var last = parts[parts.length - 1];
        if (last && last.indexOf('.') !== -1) return decodeURIComponent(last);
        return 'odoo_download_' + Date.now() + '.bin';
    } catch(e) {
        return 'odoo_download_' + Date.now() + '.bin';
    }
}

function showDownloadToast(msg, isError) {
    var toast = document.getElementById('download-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'download-toast';
        toast.style.cssText = [
            'position:fixed',
            'bottom:calc(24px + env(safe-area-inset-bottom,0px))',
            'left:50%',
            'transform:translateX(-50%)',
            'background:rgba(30,30,30,0.92)',
            'color:#fff',
            'padding:12px 20px',
            'border-radius:24px',
            'font-size:13px',
            'z-index:999999',
            'max-width:85vw',
            'text-align:center',
            'box-shadow:0 4px 16px rgba(0,0,0,0.3)',
            'transition:opacity 0.3s ease',
            'pointer-events:none',
            'word-break:break-word'
        ].join(';');
        document.body.appendChild(toast);
    }
    toast.style.background = isError ? 'rgba(180,30,30,0.95)' : 'rgba(30,30,30,0.92)';
    toast.textContent = msg;
    toast.style.opacity = '1';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function() { toast.style.opacity = '0'; }, 3500);
}

function downloadFileToStorage(url) {
    if (!isCordovaReal()) {
        console.warn('downloadFileToStorage: bukan Cordova real, skip');
        return;
    }

    var filename = getFilenameFromUrl(url);
    console.log('downloadFileToStorage: ' + filename + ' from ' + url);
    showDownloadToast('Mengunduh ' + filename + '...');

    var baseDir = (window.cordova && window.cordova.file)
        ? (cordova.file.externalRootDirectory || cordova.file.dataDirectory)
        : null;

    if (!baseDir) {
        showDownloadToast('Storage tidak tersedia', true);
        return;
    }

    var downloadDir = baseDir + 'Download/';

    window.resolveLocalFileSystemURL(downloadDir, function(dirEntry) {
        doTransfer(dirEntry, filename, url);
    }, function() {
        window.resolveLocalFileSystemURL(baseDir, function(rootEntry) {
            rootEntry.getDirectory('Download', { create: true }, function(dirEntry) {
                doTransfer(dirEntry, filename, url);
            }, function(err) {
                console.error('Gagal buat folder Download: ' + JSON.stringify(err));
                showDownloadToast('Gagal membuat folder Download', true);
            });
        }, function(err) {
            console.error('Gagal resolve baseDir: ' + JSON.stringify(err));
            showDownloadToast('Tidak dapat akses storage', true);
        });
    });
}

function doTransfer(dirEntry, filename, url) {
    var targetPath = dirEntry.toURL() + filename;
    console.log('FileTransfer target: ' + targetPath);

    var ft = new FileTransfer(); // eslint-disable-line no-undef
    var uri = encodeURI(url);

    ft.download(
        uri,
        targetPath,
        function(entry) {
            console.log('Download sukses: ' + entry.toURL());
            showDownloadToast('Tersimpan: ' + filename);
        },
        function(err) {
            console.error('FileTransfer error: ' + JSON.stringify(err));
            var msg = 'Gagal unduh';
            if (err.code === 1) msg = 'Server tidak ditemukan';
            else if (err.code === 3) msg = 'Koneksi terputus';
            else if (err.code === 4) msg = 'File tidak ditemukan di server';
            showDownloadToast(msg, true);
        },
        true  // trustAllHosts untuk server HTTP internal
    );
}

function setupDownloadInterceptor() {
    if (!isCordovaReal()) return;

    // Override window.open agar link download tidak membuka browser eksternal
    var _origOpen = window.open;
    window.open = function(url, target, features) {
        if (url && isDownloadUrl(url)) {
            console.log('window.open intercepted download: ' + url);
            downloadFileToStorage(url);
            return null;
        }
        return _origOpen.call(window, url, target, features);
    };

    // Intercept klik pada semua <a> tag (termasuk yang dibuat dinamis oleh Odoo)
    document.addEventListener('click', function(e) {
        var el = e.target;
        while (el && el.tagName !== 'A') el = el.parentElement;
        if (!el) return;
        var href = el.getAttribute('href') || '';
        if (href && isDownloadUrl(href)) {
            e.preventDefault();
            e.stopPropagation();
            var absUrl = href;
            if (href.charAt(0) === '/') {
                absUrl = App.baseUrl + href;
            }
            console.log('Link click intercepted download: ' + absUrl);
            downloadFileToStorage(absUrl);
        }
    }, true); // capture phase

    console.log('Download interceptor aktif');
}

/* ── Cordova deviceready ─────────────────────────────────────────────────────── */
document.addEventListener('deviceready', function() {
    console.log('deviceready fired');
    try {
        if (typeof StatusBar !== 'undefined') {
            StatusBar.overlaysWebView(false);
            StatusBar.backgroundColorByHexString('#714B67');
            StatusBar.styleLightContent();
        }
    } catch(e) { console.warn('StatusBar: ' + e); }
    startApp();
}, false);

/* ── Fallback ────────────────────────────────────────────────────────────────── */
if (typeof cordova === 'undefined') {
    document.addEventListener('DOMContentLoaded', startApp);
}

var _started = false;
var _origStart = startApp;
startApp = function() {
    if (_started) return;
    _started = true;
    _origStart();
};
setTimeout(function() {
    if (!_started) { console.warn('5s timeout — forcing startApp'); startApp(); }
}, 5000);
setTimeout(function() {
    if (!_started) { console.error('10s timeout — still not started'); startApp(); }
}, 10000);
