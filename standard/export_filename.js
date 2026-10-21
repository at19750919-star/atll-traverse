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
        const seq = sequence(filename);
        if (seq) {
            let next = seq.number;
            for (const file of files || []) {
                if (!/\.xlsx$/i.test(file.name || '')) continue;
                const other = sequence(file.name || '');
                if (other && same(other.prefix) === same(seq.prefix) && other.number >= next) next = other.number + 1n;
            }
            return normalize(seq.prefix + String(next).padStart(seq.width, '0'));
        }
        if ((files || []).some(file => same(file.name || '') === same(filename))) {
            throw new Error(`已有同名檔案「${filename}」，請修改導出檔名。`);
        }
        return filename;
    }
    function sequence(name) {
        const base = String(name).replace(/\.xlsx$/i, '');
        const match = base.match(/^(.*?)(\d+)$/);
        return match ? { prefix: match[1], number: BigInt(match[2]), width: match[2].length } : null;
    }
    function nextName(name) {
        const seq = sequence(name);
        return seq ? normalize(seq.prefix + String(seq.number + 1n).padStart(seq.width, '0')) : null;
    }
    function persist() {
        try { localStorage.setItem('at-export-filename-' + currentMode, input().value); } catch (_) {}
    }
    function advance(exportedName) {
        const el = input();
        if (!el || !read() || !sequence(read())) return;
        let next;
        try { next = nextName(exportedName); }
        catch (error) { el.setCustomValidity(error.message); return; }
        if (!next) return;
        el.value = /\.xlsx$/i.test(el.value.trim()) ? next : next.replace(/\.xlsx$/i, '');
        el.setCustomValidity(''); persist();
    }
    async function resolveLocal(dir, name) {
        let filename = name;
        while (true) {
            try { await dir.getFileHandle(filename); }
            catch (error) { if (error.name === 'NotFoundError') return filename; throw error; }
            const next = nextName(filename);
            if (!next) throw new Error(`資料夾已有同名檔案「${filename}」，請修改導出檔名。`);
            filename = next;
        }
    }
    function setMode(mode) {
        const el = input();
        if (!el) return;
        if (!bound) {
            el.addEventListener('input', () => {
                el.setCustomValidity('');
                persist();
            });
            bound = true;
        }
        currentMode = mode;
        try { el.value = localStorage.getItem('at-export-filename-' + mode) || ''; } catch (_) { el.value = ''; }
        el.placeholder = mode.startsWith('traverse-') ? '留白：TR 自動編號' : '留白：F 自動編號';
        el.setCustomValidity('');
    }
    const api = { normalize, read, resolve, setMode, nextName, advance, resolveLocal };
    root.ExportFilename = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
