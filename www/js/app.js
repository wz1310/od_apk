/* ─────────────────────────────────────────────────────────────────────────────
   WU Odoo Mobile Client — app.js
   Alur: Splash → Koneksi → Pilih Database → WebView Odoo (window.location)
───────────────────────────────────────────────────────────────────────────── */
'use strict';

var App = {
    protocol:     'http',
    host:         '',
    database:     '',
    baseUrl:      '',
    odooUrl:      '',
    savedServers: [],
    inOdoo:       false,
};

/* ── DOM helpers ────────────────────────────────────────────────────────────── */
function $(id)   { return document.getElementById(id); }
function show(id){ $(id).classList.remove('hidden'); }
function hide(id){ $(id).classList.add('hidden'); }

function showPage(name) {
    ['page-connect','page-database','page-error'].forEach(function(p){
        var el = document.getElementById(p);
        if (el) el.classList.add('hidden');
    });
    var target = document.getElementById(name);
    if (target) target.classList.remove('hidden');
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
    App.savedServers = App.savedServers.filter(function(s){
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
                App.host     = s.host;
                App.database = s.database;
                App.baseUrl  = s.protocol + '://' + s.host;
                openOdoo();
            } else {
                fetchDatabases();
            }
        });
        item.querySelector('.saved-server-delete').addEventListener('click', function(e){
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
    // Jika user sudah ketik http:// atau https://, pakai apa adanya
    if (/^https?:\/\//i.test(host)) return host;
    return protocol + '://' + host;
}

/**
 * Saat di browser (testing), XHR ke server Odoo kena CORS.
 * Gunakan proxy lokal /proxy?url=... untuk bypass.
 * Di APK Cordova tidak ada CORS — pakai URL langsung.
 */
function proxyUrl(targetUrl) {
    var isCordova = typeof cordova !== 'undefined' && cordova.version !== 'stub-browser';
    if (isCordova) return targetUrl;
    return '/proxy?url=' + encodeURIComponent(targetUrl);
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

/* ── Fetch database list ────────────────────────────────────────────────────── */
function fetchDatabases() {
    var host = $('input-host').value.trim();
    if (!host) { showConnectError('Masukkan alamat server terlebih dahulu.'); return; }

    hideConnectError();
    setConnectLoading(true);

    App.host    = host;
    App.baseUrl = buildBaseUrl(App.protocol, host);

function fetchDatabases() {
    console.log('fetchDatabases() called');
    var host = $('input-host').value.trim();
    console.log('host value: [' + host + ']');
    if (!host) { showConnectError('Masukkan alamat server terlebih dahulu.'); return; }

    hideConnectError();
    setConnectLoading(true);

    App.host    = host;
    App.baseUrl = buildBaseUrl(App.protocol, host);

    var isCordovaReal = typeof cordova !== 'undefined' && cordova.version !== 'stub-browser';
    var targetUrl = App.baseUrl + '/web/database/list';
    var url       = isCordovaReal ? targetUrl : ('/proxy?url=' + encodeURIComponent(targetUrl));

    console.log('isCordova: ' + isCordovaReal);
    console.log('url: ' + url);

    var xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.timeout = 15000;

    xhr.onreadystatechange = function() {
        console.log('readyState=' + xhr.readyState + (xhr.readyState===4?' status='+xhr.status:''));
    };

    xhr.onload = function() {
        console.log('onload status=' + xhr.status + ' resp=' + xhr.responseText.substr(0,100));
        setConnectLoading(false);
        if (xhr.status >= 200 && xhr.status < 300) {
            try {
                var resp = JSON.parse(xhr.responseText);
                var dbs  = resp.result || [];
                console.log('dbs: ' + JSON.stringify(dbs));
                showDatabasePage(dbs);
            } catch(e) {
                console.warn('parse error: ' + e + ' — showing manual');
                showDatabasePage([]);
            }
        } else if (xhr.status === 403 || xhr.status === 404) {
            console.warn('403/404 — showing manual');
            showDatabasePage([]);
        } else {
            showConnectError('Server error ' + xhr.status);
        }
    };

    xhr.onerror = function() {
        console.error('onerror! url=' + url + ' readyState=' + xhr.readyState);
        setConnectLoading(false);
        showConnectError(
            'Tidak dapat terhubung ke:\n' + App.baseUrl +
            '\n\nPastikan:\n' +
            '• Port benar (contoh: 157.230.247.220:8069)\n' +
            '• Server Odoo berjalan\n' +
            '• Koneksi internet aktif'
        );
    };

    xhr.ontimeout = function() {
        console.error('ontimeout! url=' + url);
        setConnectLoading(false);
        showConnectError('Timeout 15 detik. Coba: ' + host + ':8069');
    };

    console.log('sending XHR...');
    xhr.send(JSON.stringify({ jsonrpc: '2.0', method: 'call', params: {} }));
}

/* ── Halaman pilih database ─────────────────────────────────────────────────── */
function showDatabasePage(dbs) {
    $('db-server-label').textContent = App.baseUrl;
    hide('db-loading');
    hide('db-error');
    hide('db-list');
    hide('db-manual');

    var list = $('db-list');
    list.innerHTML = '';

    if (dbs.length === 0) {
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

/* ── Buka Odoo — GANTI window.location, bukan iframe ───────────────────────── */
function openOdoo() {
    App.odooUrl = App.baseUrl + '/web?db=' + encodeURIComponent(App.database);
    App.inOdoo  = true;

    // Simpan state ke localStorage agar bisa kembali ke app setelah navigasi
    localStorage.setItem('wu_last_server',   JSON.stringify({
        host: App.host, protocol: App.protocol,
        database: App.database, baseUrl: App.baseUrl
    }));

    // Navigasi langsung — WebView Cordova akan render Odoo di window ini
    window.location.href = App.odooUrl;
}

/* ── Toolbar overlay (ditampilkan di atas Odoo) ─────────────────────────────── */
// Toolbar tidak dipakai saat pakai window.location — diganti dengan back button handler

/* ── Side Menu ──────────────────────────────────────────────────────────────── */
function openMenu() {
    var menu    = $('side-menu');
    var overlay = $('side-menu-overlay');
    menu.classList.remove('hidden');
    overlay.classList.remove('hidden');
    menu.offsetHeight; // reflow
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

/* ── Android back button ────────────────────────────────────────────────────── */
function handleBackButton() {
    if ($('side-menu').classList.contains('open')) {
        closeMenu(); return;
    }
    if (!$('page-database').classList.contains('hidden')) {
        showPage('page-connect');
        renderSavedServers(); return;
    }
    if (typeof navigator.app !== 'undefined') {
        navigator.app.exitApp();
    }
}

/* ── Restore state jika kembali dari Odoo ───────────────────────────────────── */
function restoreFromOdoo() {
    // Jika user navigasi balik ke index.html dari Odoo
    var raw = localStorage.getItem('wu_last_server');
    if (raw) {
        try {
            var s = JSON.parse(raw);
            App.host     = s.host;
            App.protocol = s.protocol;
            App.database = s.database;
            App.baseUrl  = s.baseUrl;
            $('input-host').value = s.host;
            updateProtocolToggle();
        } catch(e) {}
    }
}

/* ── Init events ────────────────────────────────────────────────────────────── */
function initEvents() {
    console.log('initEvents() start');
    console.log('btn-connect el: ' + ($('btn-connect') ? 'FOUND' : 'NULL'));
    console.log('input-host el: '  + ($('input-host')  ? 'FOUND' : 'NULL'));

    $('btn-http').addEventListener('click', function() {
        App.protocol = 'http'; updateProtocolToggle();
    });
    $('btn-https').addEventListener('click', function() {
        App.protocol = 'https'; updateProtocolToggle();
    });

    $('btn-connect').addEventListener('click', function() {
        console.log('btn-connect addEventListener fired');
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
        if (!dbName) {
            $('db-error').textContent = 'Masukkan nama database.';
            show('db-error'); return;
        }
        App.database = dbName;
        saveServer(App.host, App.protocol, App.database);
        openOdoo();
    });

    $('btn-error-retry').addEventListener('click', function() {
        showPage('page-connect'); renderSavedServers();
    });

    document.addEventListener('backbutton', handleBackButton, false);
}

/* ── Splash ─────────────────────────────────────────────────────────────────── */
function hideSplash() {
    var splash = $('splash-screen');
    splash.classList.add('fade-out');
    setTimeout(function() { splash.classList.add('hidden'); }, 500);
    if (typeof navigator.splashscreen !== 'undefined') {
        navigator.splashscreen.hide();
    }
}

/* ── Start ──────────────────────────────────────────────────────────────────── */
function startApp() {
    console.log('startApp() running...');
    try {
        initEvents();
        console.log('initEvents OK');
        restoreFromOdoo();
        console.log('restoreFromOdoo OK');
        renderSavedServers();
        console.log('renderSavedServers OK');
        showPage('page-connect');
        console.log('showPage page-connect OK');
        hideSplash();
        console.log('hideSplash OK — app ready');
    } catch(e) {
        console.error('startApp ERROR: ' + e.message + ' | ' + e.stack);
    }
}

document.addEventListener('deviceready', function() {
    console.log('deviceready handler called');
    try {
        if (typeof StatusBar !== 'undefined') {
            StatusBar.backgroundColorByHexString('#714B67');
            StatusBar.styleLightContent();
            console.log('StatusBar configured');
        } else {
            console.warn('StatusBar plugin not available');
        }
    } catch(e) { console.error('StatusBar error: ' + e); }
    startApp();
}, false);

// Fallback 1: DOMContentLoaded untuk browser biasa
if (typeof cordova === 'undefined') {
    console.log('cordova not found — using DOMContentLoaded fallback');
    document.addEventListener('DOMContentLoaded', startApp);
}

// Fallback 2: Timeout — jika deviceready tidak fired
var _started = false;
var _origStart = startApp;
startApp = function() {
    if (_started) return;
    _started = true;
    console.log('startApp() called, _started=true');
    _origStart();
};
setTimeout(function() {
    if (!_started) {
        console.warn('5s timeout — deviceready never fired, forcing startApp');
        startApp();
    }
}, 5000);
setTimeout(function() {
    if (!_started) {
        console.error('10s timeout — still not started! cordova=' + (typeof cordova));
        startApp();
    }
}, 10000);
