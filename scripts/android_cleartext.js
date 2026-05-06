#!/usr/bin/env node
/**
 * Cordova hook: after_prepare
 * Inject android:usesCleartextTraffic="true" dan network_security_config
 * ke AndroidManifest.xml setiap kali `cordova prepare` atau `cordova build` dijalankan.
 * Ini lebih reliable daripada sed di workflow karena dijalankan oleh Cordova sendiri.
 */

var fs   = require('fs');
var path = require('path');

module.exports = function(context) {
    var platformRoot = path.join(context.opts.projectRoot, 'platforms', 'android');
    var manifestPath = path.join(platformRoot, 'app', 'src', 'main', 'AndroidManifest.xml');
    var resXmlDir    = path.join(platformRoot, 'app', 'src', 'main', 'res', 'xml');
    var nscPath      = path.join(resXmlDir, 'network_security_config.xml');

    if (!fs.existsSync(manifestPath)) {
        console.log('[hook] AndroidManifest.xml not found, skipping');
        return;
    }

    // 1. Buat network_security_config.xml
    if (!fs.existsSync(resXmlDir)) fs.mkdirSync(resXmlDir, { recursive: true });
    fs.writeFileSync(nscPath,
        '<?xml version="1.0" encoding="utf-8"?>\n' +
        '<network-security-config>\n' +
        '    <base-config cleartextTrafficPermitted="true">\n' +
        '        <trust-anchors>\n' +
        '            <certificates src="system" />\n' +
        '        </trust-anchors>\n' +
        '    </base-config>\n' +
        '</network-security-config>\n'
    );
    console.log('[hook] network_security_config.xml written');

    // 2. Patch AndroidManifest.xml
    var manifest = fs.readFileSync(manifestPath, 'utf8');

    var changed = false;

    // Tambah usesCleartextTraffic jika belum ada
    if (!manifest.includes('usesCleartextTraffic')) {
        manifest = manifest.replace(
            /android:hardwareAccelerated="true"/,
            'android:hardwareAccelerated="true" android:usesCleartextTraffic="true"'
        );
        changed = true;
        console.log('[hook] added usesCleartextTraffic');
    }

    // Tambah networkSecurityConfig jika belum ada
    if (!manifest.includes('networkSecurityConfig')) {
        manifest = manifest.replace(
            /android:hardwareAccelerated="true"/,
            'android:hardwareAccelerated="true" android:networkSecurityConfig="@xml/network_security_config"'
        );
        changed = true;
        console.log('[hook] added networkSecurityConfig');
    }

    if (changed) {
        fs.writeFileSync(manifestPath, manifest, 'utf8');
        console.log('[hook] AndroidManifest.xml patched OK');
    } else {
        console.log('[hook] AndroidManifest.xml already patched, skipping');
    }

    // Verifikasi
    var result = fs.readFileSync(manifestPath, 'utf8');
    var hasNsc  = result.includes('networkSecurityConfig');
    var hasCt   = result.includes('usesCleartextTraffic');
    console.log('[hook] verify — networkSecurityConfig=' + hasNsc + ' usesCleartextTraffic=' + hasCt);
};
