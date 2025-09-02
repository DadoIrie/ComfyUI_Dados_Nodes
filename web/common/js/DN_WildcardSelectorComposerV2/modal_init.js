import { WildcardModal } from './WildcardModal.js';

export async function showWildcardSelectorModal(node, constants) {
    const modal = new WildcardModal(node, constants);
    await modal.show();
}