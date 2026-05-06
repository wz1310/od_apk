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

    // Gunakan InAppBrowser jika tersedia (Cordova real) agar bisa intercept download
    if (isCordovaReal() && typeof cordova.InAppBrowser !== 'undefined') {
        openOdooInAppBrowser(App.odooUrl);
    } else {
        // Fallback browser dev
        window.location.href = App.odooUrl;
    }
}

/* ── InAppBrowser dengan download interceptor ────────────────────────────────── */
var _iab = null; // referensi InAppBrowser yang sedang aktif

function openOdooInAppBrowser(url) {
    dlLog('INF', 'openOdooInAppBrowser: ' + url);
    _ensureDlPanel();

    // Tutup instance lama jika ada
    if (_iab) {
        try { _iab.close(); } catch(e) {}
        _iab = null;
    }

    // Cek apakah cordova.InAppBrowser tersedia
    dlLog('INF', 'cordova.InAppBrowser type: ' + typeof cordova.InAppBrowser);

    // Buka InAppBrowser fullscreen tanpa toolbar (tampilan seperti native app)
    _iab = cordova.InAppBrowser.open(url, '_blank', [
        'location=no',
        'toolbar=no',
        'toolbarposition=top',
        'closebuttoncaption=Tutup',
        'closebuttoncolor=#ffffff',
        'toolbarcolor=#714B67',
        'navigationbuttoncolor=#ffffff',
        'hidenavigationbuttons=yes',
        'hideurlbar=yes',
        'fullscreen=yes',
        'zoom=no',
        'hardwareback=yes',
        'clearcache=no',
        'clearsessioncache=no',
        'allowInlineMediaPlayback=yes',
        'mediaPlaybackRequiresUserAction=no'
    ].join(','));

    if (!_iab) {
        dlLog('ERR', 'InAppBrowser.open() mengembalikan null/undefined!');
        dlLog('WRN', 'Fallback ke window.location.href');
        window.location.href = url;
        return;
    }
    dlLog('INF', 'InAppBrowser instance dibuat: ' + typeof _iab);

    // ── Event: loadstart — intercept URL sebelum WebView navigasi ──────────
    _iab.addEventListener('loadstart', function(event) {
        var navUrl = event.url || '';
        dlLog('INF', 'IAB loadstart: ' + navUrl);

        var isDL = isDownloadUrl(navUrl);
        dlLog('INF', 'isDownloadUrl(' + navUrl.substr(0,60) + '): ' + isDL);

        if (isDL) {
            dlLog('INF', '>>> DOWNLOAD URL TERDETEKSI, menghentikan navigasi...');
            try { _iab.stop(); dlLog('INF', '_iab.stop() OK'); }
            catch(e) { dlLog('WRN', '_iab.stop() error: ' + e); }
            downloadFileToStorage(navUrl);
        }
    });

    // ── Event: loadstop ─────────────────────────────────────────────────────
    _iab.addEventListener('loadstop', function(event) {
        dlLog('INF', 'IAB loadstop: ' + (event.url || ''));
    });

    // ── Event: loaderror ────────────────────────────────────────────────────
    _iab.addEventListener('loaderror', function(event) {
        dlLog('ERR', 'IAB loaderror: code=' + event.code + ' msg=' + event.message + ' url=' + event.url);
    });

    // ── Event: exit — user tutup InAppBrowser ───────────────────────────────
    _iab.addEventListener('exit', function() {
        dlLog('INF', 'IAB exit — kembali ke halaman connect');
        _iab = null;
        showPage('page-connect');
        renderSavedServers();
    });

    dlLog('INF', 'Semua event listener IAB terpasang ✓');
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
    // Jika InAppBrowser aktif, navigasi back di dalam IAB
    if (_iab) {
        _iab.executeScript({ code: 'window.history.back();' });
        return;
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
        _ensureDlPanel();
        dlLog('INF', '=== WU Odoo Download Debug ===');
        dlLog('INF', 'isCordovaReal: ' + isCordovaReal());
        dlLog('INF', 'cordova.InAppBrowser: ' + (typeof cordova !== 'undefined' ? typeof cordova.InAppBrowser : 'cordova undefined'));
        dlLog('INF', 'FileTransfer: ' + (typeof FileTransfer));
        dlLog('INF', 'resolveLocalFileSystemURL: ' + (typeof window.resolveLocalFileSystemURL));
        initEvents();
        restoreFromOdoo();
        renderSavedServers();
        showPage('page-connect');
        hideSplash();
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

// ── Debug log panel (muncul di atas IAB, bisa di-toggle) ─────────────────────
var _dlLogs = [];
var _dlPanelVisible = false;

function dlLog(level, msg) {
    var ts = new Date().toISOString().substr(11, 12);
    var line = '[' + ts + '][' + level + '] ' + msg;
    _dlLogs.push({ level: level, line: line });
    if (_dlLogs.length > 300) _dlLogs.shift();

    // Juga kirim ke console biasa (debug overlay di index.html)
    if (level === 'ERR')  console.error('[DL] ' + msg);
    else if (level === 'WRN') console.warn('[DL] ' + msg);
    else console.log('[DL] ' + msg);

    _renderDlPanel();
}

function _renderDlPanel() {
    var box = document.getElementById('dl-log-box');
    if (!box || !_dlPanelVisible) return;
    var content = document.getElementById('dl-log-content');
    if (!content) return;
    content.innerHTML = _dlLogs.map(function(e) {
        var color = e.level === 'ERR' ? '#f66' : e.level === 'WRN' ? '#fa0' : '#0f0';
        return '<span style="color:' + color + '">' +
            e.line.replace(/</g, '&lt;') + '</span>';
    }).join('\n');
    content.scrollTop = content.scrollHeight;
}

function _ensureDlPanel() {
    if (document.getElementById('dl-log-box')) return;

    // Tombol toggle DL log (pojok kanan atas)
    var btn = document.createElement('button');
    btn.id = 'dl-log-toggle';
    btn.textContent = '⬇ LOG';
    btn.style.cssText = [
        'position:fixed', 'top:10px', 'right:10px',
        'background:rgba(0,120,0,0.85)', 'color:#fff',
        'border:none', 'border-radius:8px',
        'padding:6px 12px', 'font-size:13px', 'font-weight:bold',
        'cursor:pointer', 'z-index:200000',
        'box-shadow:0 2px 8px rgba(0,0,0,0.4)'
    ].join(';');
    document.body.appendChild(btn);

    // Panel log
    var box = document.createElement('div');
    box.id = 'dl-log-box';
    box.style.cssText = [
        'position:fixed', 'bottom:0', 'left:0', 'right:0',
        'height:55vh', 'background:rgba(0,0,0,0.95)',
        'color:#0f0', 'font-size:11px', 'font-family:monospace',
        'z-index:199999', 'display:none', 'flex-direction:column',
        'border-top:3px solid #00aa00'
    ].join(';');

    var hdr = document.createElement('div');
    hdr.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:#003300;flex-shrink:0;';
    hdr.innerHTML = '<span style="color:#0f0;font-weight:bold;font-size:12px">📥 Download Debug Log</span>' +
        '<div style="display:flex;gap:6px">' +
        '<button id="dl-log-clear" style="background:#555;color:#fff;border:none;border-radius:4px;padding:2px 8px;font-size:11px;cursor:pointer">Clear</button>' +
        '<button id="dl-log-close" style="background:#aa0000;color:#fff;border:none;border-radius:4px;padding:2px 8px;font-size:11px;cursor:pointer">✕</button>' +
        '</div>';
    box.appendChild(hdr);

    var content = document.createElement('div');
    content.id = 'dl-log-content';
    content.style.cssText = 'flex:1;overflow-y:auto;padding:6px 8px;white-space:pre-wrap;word-break:break-all;';
    box.appendChild(content);
    document.body.appendChild(box);

    btn.addEventListener('click', function() {
        _dlPanelVisible = !_dlPanelVisible;
        box.style.display = _dlPanelVisible ? 'flex' : 'none';
        btn.style.background = _dlPanelVisible ? 'rgba(180,0,0,0.85)' : 'rgba(0,120,0,0.85)';
        if (_dlPanelVisible) _renderDlPanel();
    });
    document.getElementById('dl-log-clear').addEventListener('click', function(e) {
        e.stopPropagation(); _dlLogs = [];
        document.getElementById('dl-log-content').innerHTML = '';
    });
    document.getElementById('dl-log-close').addEventListener('click', function(e) {
        e.stopPropagation(); _dlPanelVisible = false;
        box.style.display = 'none';
        btn.style.background = 'rgba(0,120,0,0.85)';
    });
}

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
    toast._timer = setTimeout(function() { toast.style.opacity = '0'; }, isError ? 6000 : 3500);
}

function downloadFileToStorage(url) {
    dlLog('INF', 'downloadFileToStorage() dipanggil');
    dlLog('INF', 'URL: ' + url);

    if (!isCordovaReal()) {
        dlLog('WRN', 'Bukan Cordova real, skip download');
        showDownloadToast('Bukan Cordova real', true);
        return;
    }
    dlLog('INF', 'isCordovaReal: true');

    // Cek plugin File tersedia
    if (typeof window.resolveLocalFileSystemURL === 'undefined') {
        dlLog('ERR', 'cordova-plugin-file TIDAK tersedia! resolveLocalFileSystemURL undefined');
        showDownloadToast('Plugin file tidak tersedia', true);
        return;
    }
    dlLog('INF', 'resolveLocalFileSystemURL: tersedia');

    // Cek plugin FileTransfer tersedia
    if (typeof FileTransfer === 'undefined') {
        dlLog('ERR', 'cordova-plugin-file-transfer TIDAK tersedia! FileTransfer undefined');
        showDownloadToast('Plugin file-transfer tidak tersedia', true);
        return;
    }
    dlLog('INF', 'FileTransfer: tersedia');

    var filename = getFilenameFromUrl(url);
    dlLog('INF', 'Filename: ' + filename);
    showDownloadToast('⏳ Mengunduh ' + filename + '...');

    // Log semua path yang tersedia
    if (window.cordova && window.cordova.file) {
        dlLog('INF', 'cordova.file.externalRootDirectory: ' + cordova.file.externalRootDirectory);
        dlLog('INF', 'cordova.file.externalDataDirectory: ' + cordova.file.externalDataDirectory);
        dlLog('INF', 'cordova.file.dataDirectory: ' + cordova.file.dataDirectory);
        dlLog('INF', 'cordova.file.documentsDirectory: ' + cordova.file.documentsDirectory);
    } else {
        dlLog('ERR', 'cordova.file TIDAK tersedia!');
        showDownloadToast('cordova.file tidak tersedia', true);
        return;
    }

    // Pilih direktori tujuan: utamakan Downloads publik
    var baseDir = cordova.file.externalRootDirectory || cordova.file.dataDirectory;
    dlLog('INF', 'baseDir dipilih: ' + baseDir);

    // Coba resolve folder Download langsung
    var downloadPath = baseDir + 'Download/';
    dlLog('INF', 'Mencoba resolve: ' + downloadPath);

    window.resolveLocalFileSystemURL(downloadPath, function(dirEntry) {
        dlLog('INF', 'Folder Download sudah ada: ' + dirEntry.toURL());
        doTransfer(dirEntry, filename, url);
    }, function(err1) {
        dlLog('WRN', 'Folder Download tidak ada (code=' + err1.code + '), mencoba buat...');
        window.resolveLocalFileSystemURL(baseDir, function(rootEntry) {
            dlLog('INF', 'baseDir resolved: ' + rootEntry.toURL());
            rootEntry.getDirectory('Download', { create: true }, function(dirEntry) {
                dlLog('INF', 'Folder Download berhasil dibuat: ' + dirEntry.toURL());
                doTransfer(dirEntry, filename, url);
            }, function(err2) {
                dlLog('ERR', 'Gagal buat folder Download: code=' + err2.code + ' msg=' + err2.message);
                showDownloadToast('Gagal buat folder Download (err ' + err2.code + ')', true);
            });
        }, function(err2) {
            dlLog('ERR', 'Gagal resolve baseDir: code=' + err2.code + ' msg=' + err2.message);
            showDownloadToast('Tidak dapat akses storage (err ' + err2.code + ')', true);
        });
    });
}

function doTransfer(dirEntry, filename, url) {
    var targetPath = dirEntry.toURL() + filename;
    dlLog('INF', 'doTransfer() target: ' + targetPath);
    dlLog('INF', 'doTransfer() url: ' + url);

    var ft = new FileTransfer(); // eslint-disable-line no-undef
    var uri = encodeURI(url);
    dlLog('INF', 'encodeURI: ' + uri);

    // Kirim cookie session agar Odoo tidak redirect ke login
    var headers = {};
    if (window._iabCookies) {
        headers['Cookie'] = window._iabCookies;
        dlLog('INF', 'Cookie dikirim: ' + window._iabCookies.substr(0, 60) + '...');
    } else {
        dlLog('WRN', 'Tidak ada cookie session (_iabCookies kosong)');
    }

    // Progress callback
    ft.onprogress = function(progressEvent) {
        if (progressEvent.lengthComputable) {
            var pct = Math.round((progressEvent.loaded / progressEvent.total) * 100);
            dlLog('INF', 'Progress: ' + pct + '% (' + progressEvent.loaded + '/' + progressEvent.total + ')');
        } else {
            dlLog('INF', 'Progress: ' + progressEvent.loaded + ' bytes');
        }
    };

    dlLog('INF', 'Memulai ft.download()...');
    ft.download(
        uri,
        targetPath,
        function(entry) {
            dlLog('INF', 'Download SUKSES: ' + entry.toURL());
            dlLog('INF', 'Nama file: ' + entry.name);
            showDownloadToast('✅ Tersimpan: ' + filename);
        },
        function(err) {
            dlLog('ERR', 'FileTransfer ERROR!');
            dlLog('ERR', 'code: ' + err.code);
            dlLog('ERR', 'source: ' + err.source);
            dlLog('ERR', 'target: ' + err.target);
            dlLog('ERR', 'http_status: ' + err.http_status);
            dlLog('ERR', 'body: ' + err.body);
            dlLog('ERR', 'exception: ' + err.exception);
            var msg = '❌ Gagal unduh (code ' + err.code + ')';
            if (err.http_status) msg += ' HTTP ' + err.http_status;
            showDownloadToast(msg, true);
        },
        true,    // trustAllHosts untuk server HTTP internal
        { headers: headers }
    );
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
