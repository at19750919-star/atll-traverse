// 在完整局的邊界旋轉牌靴，保留每局原本的牌與結果。
function rotateShoeAfterEndingNine(rounds) {
    if (!Array.isArray(rounds) || rounds.length === 0) return null;

    const totalCards = rounds.reduce((sum, round) =>
        sum + (Array.isArray(round?.cards) ? round.cards.length : 0), 0);
    if (totalCards !== 416) return null;

    const roundIndex = rounds.findIndex(round => {
        const cards = round?.cards;
        return Array.isArray(cards) && cards.length > 0 && String(cards[cards.length - 1]?.rank) === '9';
    });
    if (roundIndex < 0) return null;

    const ordered = rounds.slice(roundIndex + 1).concat(rounds.slice(0, roundIndex + 1));
    let position = 0;
    const rotatedRounds = ordered.map(round => {
        const cards = round.cards.map(card => {
            const copy = typeof card.clone === 'function' ? card.clone() : { ...card };
            copy.pos = position++;
            copy.back_color = card.back_color;
            return copy;
        });
        return { ...round, start_index: position - cards.length, cards };
    });

    if (position !== 416 || String(rotatedRounds.at(-1).cards.at(-1)?.rank) !== '9') return null;
    return { rounds: rotatedRounds, sourceRound: roundIndex + 1 };
}
