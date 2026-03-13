// AI discard strategy - wraps smart-discard

import { smartDiscardKitty, smartDiscardKittyWithDealerInfo } from './smart-discard';

export { smartDiscardKitty, smartDiscardKittyWithDealerInfo };

// Alias for consistency
export const chooseKittyDiscards = smartDiscardKitty;
export const chooseKittyDiscardsWithDealerInfo = smartDiscardKittyWithDealerInfo;
