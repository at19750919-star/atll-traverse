// ==================== 依序列生成 對話框 ====================

function showSequenceInputDialog() {
    if (document.querySelector('.sequence-input-dialog-overlay')) return;

    const dialog = document.createElement('div');
    dialog.className = 'sequence-input-dialog-overlay';
    dialog.innerHTML = `
        <div class="sequence-input-dialog">
            <div class="dialog-header">
                <h3>依序列生成牌靴</h3>
                <button class="dialog-close" type="button">✕</button>
            </div>
            <div class="dialog-body">
                <div class="seq-row">
                    <label for="seqInputText">B/P 序列(只含 B 和 P,不含 T)</label>
                    <textarea id="seqInputText" rows="4" placeholder="例如:BBBBPPPBBPBPBP..."></textarea>
                    <div class="seq-hint" id="seqHint">字數: 0(B:0 / P:0)</div>
                </div>
                <div class="seq-row seq-numbers">
                    <label>和局數量
                        <input type="number" id="seqTieCount" value="3" min="0" max="20">
                    </label>
                    <label>莊6 數量
                        <input type="number" id="seqB6Count" value="3" min="0" max="20">
                    </label>
                </div>
                <div class="seq-row">
                    <div class="seq-info">
                        總局數 = 序列長度 + 和局數量(建議落在 85~90)<br>
                        和局會隨機插入在中間位置;莊6 從序列中的 B 隨機挑選。<br>
                        生成完成後自動跳過所有違規檢查(訊號牌/卡色/敏感局/連續莊閒)。
                    </div>
                </div>
                <div class="seq-result" id="seqResult"></div>
            </div>
            <div class="dialog-footer">
                <button class="btn-secondary" type="button" id="seqCancelBtn">取消</button>
                <button class="btn-primary" type="button" id="seqGenerateBtn">生成</button>
            </div>
        </div>
    `;
    document.body.appendChild(dialog);

    if (!document.getElementById('sequence-input-styles')) {
        const style = document.createElement('style');
        style.id = 'sequence-input-styles';
        style.textContent = `
            .sequence-input-dialog-overlay {
                position: fixed; inset: 0;
                background: rgba(0,0,0,0.5);
                display: flex; align-items: center; justify-content: center;
                z-index: 10000;
            }
            .sequence-input-dialog {
                background: #1e293b; border-radius: 12px;
                width: 500px; max-width: 92vw; max-height: 92vh;
                overflow: auto; color: #e0f2fe;
                box-shadow: 0 10px 40px rgba(0,0,0,0.5);
                font-family: 'Microsoft JhengHei', sans-serif;
            }
            .sequence-input-dialog .dialog-header {
                padding: 16px 20px; border-bottom: 1px solid #334155;
                display: flex; justify-content: space-between; align-items: center;
            }
            .sequence-input-dialog .dialog-header h3 { margin: 0; font-size: 17px; color: #e0f2fe; }
            .sequence-input-dialog .dialog-close {
                background: none; border: none; color: #94a3b8;
                font-size: 22px; cursor: pointer; line-height: 1;
            }
            .sequence-input-dialog .dialog-close:hover { color: #f1f5f9; }
            .sequence-input-dialog .dialog-body { padding: 16px 20px; }
            .sequence-input-dialog .seq-row { margin-bottom: 14px; }
            .sequence-input-dialog .seq-row > label {
                display: block; font-size: 13px; color: #cbd5e1; margin-bottom: 6px;
            }
            .sequence-input-dialog textarea {
                width: 100%; box-sizing: border-box;
                background: #0f172a; color: #e0f2fe;
                border: 1px solid #475569; border-radius: 6px;
                padding: 8px; font-family: Consolas, monospace; font-size: 14px;
                resize: vertical;
            }
            .sequence-input-dialog input[type="number"] {
                background: #0f172a; color: #e0f2fe;
                border: 1px solid #475569; border-radius: 6px;
                padding: 5px 8px; font-size: 13px; width: 70px; margin-left: 6px;
            }
            .sequence-input-dialog .seq-numbers {
                display: flex; gap: 18px; align-items: center;
            }
            .sequence-input-dialog .seq-numbers > label {
                font-size: 13px; color: #cbd5e1; margin-bottom: 0;
            }
            .sequence-input-dialog .seq-hint {
                color: #94a3b8; font-size: 12px; margin-top: 4px; font-family: Consolas, monospace;
            }
            .sequence-input-dialog .seq-info {
                background: #334155; padding: 9px 11px; border-radius: 6px;
                font-size: 12px; color: #cbd5e1; line-height: 1.6;
            }
            .sequence-input-dialog .seq-result {
                padding: 10px; border-radius: 6px; font-size: 13px;
                display: none;
            }
            .sequence-input-dialog .seq-result.show { display: block; }
            .sequence-input-dialog .seq-result.ok  { background: #065f46; color: #d1fae5; }
            .sequence-input-dialog .seq-result.err { background: #7f1d1d; color: #fee2e2; }
            .sequence-input-dialog .seq-result.busy { background: #334155; color: #cbd5e1; }
            .sequence-input-dialog .dialog-footer {
                padding: 12px 20px; border-top: 1px solid #334155;
                display: flex; gap: 8px; justify-content: flex-end;
            }
            .sequence-input-dialog .btn-primary,
            .sequence-input-dialog .btn-secondary {
                padding: 7px 18px; border: none; border-radius: 6px;
                cursor: pointer; font-size: 13px; font-family: inherit;
            }
            .sequence-input-dialog .btn-primary { background: #0284c7; color: #fff; }
            .sequence-input-dialog .btn-primary:hover { background: #0369a1; }
            .sequence-input-dialog .btn-primary:disabled { background: #475569; cursor: not-allowed; }
            .sequence-input-dialog .btn-secondary { background: #475569; color: #fff; }
            .sequence-input-dialog .btn-secondary:hover { background: #334155; }
        `;
        document.head.appendChild(style);
    }

    const closeDialog = () => dialog.remove();
    dialog.querySelector('.dialog-close').addEventListener('click', closeDialog);
    document.getElementById('seqCancelBtn').addEventListener('click', closeDialog);
    dialog.addEventListener('click', (e) => { if (e.target === dialog) closeDialog(); });

    const txt = document.getElementById('seqInputText');
    const hint = document.getElementById('seqHint');
    const updateHint = () => {
        const v = (txt.value || '').toUpperCase().replace(/\s+/g, '');
        const b = (v.match(/B/g) || []).length;
        const p = (v.match(/P/g) || []).length;
        const invalid = (v.length !== b + p);
        hint.textContent = `字數: ${v.length}(B:${b} / P:${p})${invalid ? ' ⚠ 含非 B/P 字元' : ''}`;
        hint.style.color = invalid ? '#fca5a5' : '#94a3b8';
    };
    txt.addEventListener('input', updateHint);

    const btn = document.getElementById('seqGenerateBtn');
    const resultBox = document.getElementById('seqResult');
    let generateCount = 0;

    btn.addEventListener('click', () => {
        const seq = txt.value;
        const tieCount = parseInt(document.getElementById('seqTieCount').value, 10) || 0;
        const b6Count = parseInt(document.getElementById('seqB6Count').value, 10) || 0;

        resultBox.className = 'seq-result show busy';
        resultBox.textContent = '生成中,請稍候...';
        btn.disabled = true;

        setTimeout(() => {
            try {
                const rounds = generateShoeBySequence(seq, tieCount, b6Count);

                currentRounds = rounds;
                window.__importedShoeMode = true;
                window.__regenerateCount = 0;

                const logArea = document.getElementById('logArea');
                if (logArea) logArea.innerHTML = '';
                const roundsBody = document.getElementById('roundsBody');
                if (roundsBody) roundsBody.innerHTML = '';

                refreshAnalysisAndRender({ mutate: false, skipVerify: true });
                if (typeof setEditButtonsAvailability === 'function') setEditButtonsAvailability(true);
                if (typeof resetEditState === 'function') resetEditState();

                if (typeof analyzeShoeRecovery === 'function' && typeof updateRecoveryDisplay === 'function') {
                    try {
                        const rr = analyzeShoeRecovery(currentRounds);
                        if (rr) updateRecoveryDisplay(rr);
                    } catch (e) { /* 不擋流程 */ }
                }

                generateCount++;
                resultBox.className = 'seq-result show ok';
                resultBox.textContent = `✓ 第 ${generateCount} 條已生成 ${rounds.length} 局(可直接點「重新生成」再來一條)`;
                if (typeof log === 'function') {
                    log(`✅ 依序列生成第 ${generateCount} 條:${rounds.length} 局`, 'success');
                }
                btn.disabled = false;
                btn.textContent = `重新生成 (#${generateCount + 1})`;
            } catch (e) {
                resultBox.className = 'seq-result show err';
                resultBox.textContent = `✗ ${e && e.message ? e.message : e}`;
                btn.disabled = false;
            }
        }, 30);
    });

    txt.focus();
}
