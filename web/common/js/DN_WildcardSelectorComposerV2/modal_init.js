import { WildcardsModal } from './WildcardsModal.js';

export async function showWildcardSelectorModal(node, constants) {
    const modal = new WildcardsModal(node, constants);
    await modal.show();
}