(function (root) {
    'use strict';
    let currentMode = '', bound = false;
    const input = () => typeof document === 'undefined' ? null : document.getElementById('exportFilename');
    function normalize(value) {
        const raw = String(value ?? '').trim();
        if (!raw) return null;
        const base = raw.replace(/\.xlsx$/i, '');
        if (!base || base.length > 150 || /[<>:"/\\|?*\x00-\x1f]/.test(base)
            || /[. ]$/.test(base) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(base)) {
            throw new Error('檔名不能包含路徑或特殊符號，也不能使用保留名稱；請重新輸入。');
        }
        return base + '.xlsx';
    }
    function read() {
        const el = input();
        try { return normalize(el?.value); }
        catch (error) {
            el?.setCustomValidity(error.message); el?.reportValidity(); el?.focus();
            throw error;
        }
    }
    function resolve(files, name) {
        const filename = normalize(name);
        if (!filename) return null;
        const same = value => String(value).normalize('NFC').toLowerCase();
        if ((files || []).some(file => same(file.name || '') === same(filename))) {
            throw new Error(`已有同名檔案「${filename}」，請修改導出檔名。`);
        }
        return filename;
    }
    function setMode(mode) {
        const el = input();
        if (!el) return;
        if (!bound) {
            el.addEventListener('input', () => {
                el.setCustomValidity('');
                try { localStorage.setItem('at-export-filename-' + currentMode, el.value); } catch (_) {}
            });
            bound = true;
        }
        currentMode = mode;
        try { el.value = localStorage.getItem('at-export-filename-' + mode) || ''; } catch (_) { el.value = ''; }
        el.placeholder = mode.startsWith('traverse-') ? '留白：TR 自動編號' : '留白：F 自動編號';
        el.setCustomValidity('');
    }
    const api = { normalize, read, resolve, setMode };
    root.ExportFilename = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
