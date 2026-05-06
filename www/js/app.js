/* ─────────────────────────────────────────────────────────────────────────────
   WU Odoo Mobile Client — app.js
   Alur: Splash → Koneksi (input host) → Pilih Database → WebView Odoo
───────────────────────────────────────────────────────────────────────────── */

'use strict';

/* ── State aplikasi ─────────────────────────────────────────────────────────── */
var App = {
    protocol:    'http',
    host:        '',
    database:    '',
    baseUrl:     '',
    savedServers: [],
    isOnline:    true,
};

/* ── Utilitas DOM ───────────────────────────────────────────────────────────── */
function $(id)          { return document.getElementById(id); }
function show(id)       { $(id).classList.remove('hidden'); }
function hide(id)       { $(id).classList.add('hidden'); }
function showPage(name) {
    ['page-connect','page-database','page-webview','page-error'].forEach(function(p) {
        $(p).classList.add('hidden');
    });
    $(name).classList.remove('hidden');
}

/* ── Storage ────────────────────────────────────────────────────────────────── */
function loadSavedServers() {
    try {
        var raw = localStorage.getItem('wu_saved_servers');
        App.savedServers = raw ? JSON.parse(raw) : [];
    } catch(e) { App.savedServers = []; }
}

function saveServer(host, protocol, database) {
    loadSavedServers();
    // Hapus duplikat
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
    var section = $('saved-servers-section');
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
            '<button class="saved-server-delete" data-idx="' + i + '" title="Hapus">✕</button>';

        item.querySelector('.saved-server-info').addEventListener('click', function() {
            $('input-host').value = s.host;
            App.protocol = s.protocol;
            updateProtocolToggle();
            if (s.database) {
                App.host     = s.host;
                App.database = s.database;
                App.baseUrl  = s.protocol + '://' + s.host;
                openOdoo();
            } else {
                fetchDatabases();
            }
        });
        item.querySelector('.saved-server-delete').addEventListener('click', function(e) {
            e.stopPropagation();
            deleteServer(parseInt(this.dataset.idx));
        });
        list.appendChild(item);
    });
}

/* ── Helpers ────────────────────────────────────────────────────────────────── */
function escHtml(str) {
    return String(str)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function buildBaseUrl(protocol, host) {
    host = host.trim().replace(/\/+$/, '');
    if (!host) return '';
    if (host.startsWith('http://') || host.startsWith('https://')) return host;
    return protocol + '://' + host;
}

function updateProtocolToggle() {
    $('btn-http').classList.toggle('active',  App.protocol === 'http');
    $('btn-https').classList.toggle('active', App.protocol === 'https');
}

function setConnectLoading(loading) {
    var btn  = $('btn-connect');
    var text = btn.querySelector('.btn-text');
    var ldr  = btn.querySelector('.btn-loader');
    btn.disabled = loading;
    text.classList.toggle('hidden', loading);
    ldr.classList.toggle('hidden', !loading);
}

function showConnectError(msg) {
    var el = $('connect-error');
    el.textContent = msg;
    el.classList.remove('hidden');
}
function hideConnectError() { $('connect-error').classList.add('hidden'); }

/* ── Fetch daftar database dari Odoo ────────────────────────────────────────── */
function fetchDatabases() {
    var host = $('input-host').value.trim();
    if (!host) { showConnectError('Masukkan alamat server terlebih dahulu.'); return; }

    hideConnectError();
    setConnectLoading(true);

    App.host    = host;
    App.baseUrl = buildBaseUrl(App.protocol, host);

    var url = App.baseUrl + '/web/database/list';

    // Gunakan XMLHttpRequest agar kompatibel dengan WebView lama
    var xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.timeout = 15000;

    xhr.onload = function() {
        setConnectLoading(false);
        if (xhr.status >= 200 && xhr.status < 300) {
            try {
                var resp = JSON.parse(xhr.responseText);
                var dbs  = resp.result || [];
                showDatabasePage(dbs);
            } catch(e) {
                showConnectError('Respons server tidak valid. Pastikan ini server Odoo.');
            }
        } else {
            showConnectError('Server merespons dengan error ' + xhr.status + '. Periksa alamat server.');
        }
    };

    xhr.onerror = function() {
        setConnectLoading(false);
        showConnectError(
            'Tidak dapat terhubung ke ' + App.baseUrl + '.\n' +
            'Periksa:\n• Alamat server sudah benar\n• Server Odoo sedang berjalan\n• Koneksi jaringan aktif'
        );
    };

    xhr.ontimeout = function() {
        setConnectLoading(false);
        showConnectError('Koneksi timeout. Server tidak merespons dalam 15 detik.');
    };

    xhr.send(JSON.stringify({ jsonrpc: '2.0', method: 'call', params: {} }));
}

/* ── Tampilkan halaman pilih database ───────────────────────────────────────── */
function showDatabasePage(dbs) {
    $('db-server-label').textContent = App.baseUrl;
    hide('db-loading');
    hide('db-error');
    hide('db-list');
    hide('db-manual');

    var list = $('db-list');
    list.innerHTML = '';

    if (dbs.length === 0) {
        // Tidak ada database — tampilkan input manual
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

    // Tombol input manual di bawah list
    var manualToggle = document.createElement('div');
    manualToggle.className = 'db-manual-toggle';
    manualToggle.textContent = 'Masukkan nama database secara manual';
    manualToggle.addEventListener('click', function() {
        hide('db-list');
        show('db-manual');
    });
    list.appendChild(manualToggle);

    show('db-list');
    showPage('page-database');
}

/* ── Buka Odoo di WebView ───────────────────────────────────────────────────── */
function openOdoo() {
    var odooUrl = App.baseUrl + '/web?db=' + encodeURIComponent(App.database);

    $('webview-server-name').textContent = App.host + ' — ' + App.database;
    $('side-menu-server').textContent    = App.baseUrl;

    showPage('page-webview');
    loadFrame(odooUrl);
}

function loadFrame(url) {
    var frame   = $('odoo-frame');
    var loading = $('frame-loading');
    var errDiv  = $('frame-error');

    show('frame-loading');
    hide('frame-error');
    frame.classList.add('hidden');

    // Timeout jika frame tidak load dalam 30 detik
    var loadTimeout = setTimeout(function() {
        hide('frame-loading');
        show('frame-error');
        $('frame-error-msg').textContent = 'Halaman tidak merespons dalam 30 detik.';
    }, 30000);

    frame.onload = function() {
        clearTimeout(loadTimeout);
        hide('frame-loading');
        hide('frame-error');
        frame.classList.remove('hidden');
    };

    frame.onerror = function() {
        clearTimeout(loadTimeout);
        hide('frame-loading');
        show('frame-error');
        $('frame-error-msg').textContent = 'Tidak dapat memuat halaman Odoo.';
    };

    frame.src = url;
}

/* ── Side Menu ──────────────────────────────────────────────────────────────── */
function openMenu() {
    var menu    = $('side-menu');
    var overlay = $('side-menu-overlay');
    menu.classList.remove('hidden');
    overlay.classList.remove('hidden');
    // Trigger reflow untuk animasi
    menu.offsetHeight;
    menu.classList.add('open');
    overlay.classList.add('open');
}

function closeMenu() {
    var menu    = $('side-menu');
    var overlay = $('side-menu-overlay');
    menu.classList.remove('open');
    overlay.classList.remove('open');
    setTimeout(function() {
        menu.classList.add('hidden');
        overlay.classList.add('hidden');
    }, 300);
}

/* ── Network check ──────────────────────────────────────────────────────────── */
function checkNetwork() {
    if (typeof navigator.connection !== 'undefined') {
        App.isOnline = navigator.connection.type !== 'none';
    } else {
        App.isOnline = navigator.onLine !== false;
    }
    return App.isOnline;
}

/* ── Android back button ────────────────────────────────────────────────────── */
function handleBackButton() {
    var frame = $('odoo-frame');

    // Jika side menu terbuka, tutup dulu
    if ($('side-menu').classList.contains('open')) {
        closeMenu();
        return;
    }

    // Jika di halaman webview, coba navigasi back di frame
    if (!$('page-webview').classList.contains('hidden')) {
        try {
            frame.contentWindow.history.back();
        } catch(e) {
            // Jika tidak bisa, tanya user
            if (confirm('Keluar dari Odoo?')) {
                showPage('page-connect');
                renderSavedServers();
            }
        }
        return;
    }

    // Jika di halaman database, kembali ke connect
    if (!$('page-database').classList.contains('hidden')) {
        showPage('page-connect');
        renderSavedServers();
        return;
    }

    // Jika di halaman connect, keluar app
    if (typeof navigator.app !== 'undefined') {
        navigator.app.exitApp();
    } else if (typeof navigator.device !== 'undefined') {
        navigator.device.exitApp();
    }
}

/* ── Inisialisasi event listeners ───────────────────────────────────────────── */
function initEvents() {

    // Protocol toggle
    $('btn-http').addEventListener('click', function() {
        App.protocol = 'http';
        updateProtocolToggle();
    });
    $('btn-https').addEventListener('click', function() {
        App.protocol = 'https';
        updateProtocolToggle();
    });

    // Tombol sambungkan
    $('btn-connect').addEventListener('click', fetchDatabases);

    // Enter di input host
    $('input-host').addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.keyCode === 13) fetchDatabases();
    });

    // Kembali dari halaman database
    $('btn-back-to-connect').addEventListener('click', function() {
        showPage('page-connect');
        renderSavedServers();
    });

    // Input database manual
    $('btn-db-manual-connect').addEventListener('click', function() {
        var dbName = $('input-dbname').value.trim();
        if (!dbName) {
            $('db-error').textContent = 'Masukkan nama database.';
            show('db-error');
            return;
        }
        App.database = dbName;
        saveServer(App.host, App.protocol, App.database);
        openOdoo();
    });

    // Toolbar WebView
    $('btn-menu').addEventListener('click', openMenu);
    $('btn-reload').addEventListener('click', function() {
        var frame = $('odoo-frame');
        if (frame.src && frame.src !== 'about:blank') {
            loadFrame(frame.src);
        }
    });

    // Side menu items
    $('btn-close-menu').addEventListener('click', closeMenu);
    $('side-menu-overlay').addEventListener('click', closeMenu);

    $('menu-home').addEventListener('click', function() {
        closeMenu();
        loadFrame(App.baseUrl + '/web?db=' + encodeURIComponent(App.database));
    });
    $('menu-reload').addEventListener('click', function() {
        closeMenu();
        var frame = $('odoo-frame');
        if (frame.src && frame.src !== 'about:blank') loadFrame(frame.src);
    });
    $('menu-change-db').addEventListener('click', function() {
        closeMenu();
        fetchDatabases();
    });
    $('menu-change-server').addEventListener('click', function() {
        closeMenu();
        showPage('page-connect');
        renderSavedServers();
    });
    $('menu-logout').addEventListener('click', function() {
        closeMenu();
        loadFrame(App.baseUrl + '/web/session/logout?db=' + encodeURIComponent(App.database));
    });

    // Frame error buttons
    $('btn-frame-retry').addEventListener('click', function() {
        loadFrame(App.baseUrl + '/web?db=' + encodeURIComponent(App.database));
    });
    $('btn-frame-back').addEventListener('click', function() {
        showPage('page-connect');
        renderSavedServers();
    });

    // Error page retry
    $('btn-error-retry').addEventListener('click', function() {
        if (checkNetwork()) {
            showPage('page-connect');
            renderSavedServers();
        }
    });

    // Network events
    document.addEventListener('online',  function() { App.isOnline = true; });
    document.addEventListener('offline', function() { App.isOnline = false; });

    // Android back button (Cordova)
    document.addEventListener('backbutton', handleBackButton, false);
}

/* ── Splash screen ──────────────────────────────────────────────────────────── */
function hideSplash() {
    var splash = $('splash-screen');
    splash.classList.add('fade-out');
    setTimeout(function() {
        splash.classList.add('hidden');
    }, 500);
}

/* ── Entry point ────────────────────────────────────────────────────────────── */
function startApp() {
    initEvents();
    renderSavedServers();

    // Cek apakah ada server terakhir yang tersimpan
    loadSavedServers();
    var last = App.savedServers[0];
    if (last && last.host && last.database) {
        // Auto-fill form dengan server terakhir
        $('input-host').value = last.host;
        App.protocol = last.protocol || 'http';
        updateProtocolToggle();
    }

    showPage('page-connect');
    hideSplash();

    // Sembunyikan splash Cordova native jika ada
    if (typeof navigator.splashscreen !== 'undefined') {
        navigator.splashscreen.hide();
    }
}

/* ── Cordova device ready ───────────────────────────────────────────────────── */
document.addEventListener('deviceready', function() {
    // Cordova siap
    if (typeof StatusBar !== 'undefined') {
        StatusBar.backgroundColorByHexString('#714B67');
        StatusBar.styleLightContent();
    }
    startApp();
}, false);

/* ── Fallback untuk browser biasa (testing) ─────────────────────────────────── */
if (typeof cordova === 'undefined') {
    document.addEventListener('DOMContentLoaded', startApp);
}
