import { useState } from 'react';
import { parseAmountInput, uncappedCategories, type Category } from '@expense-tracker/shared';

/**
 * The "Limit one category" row of the settings surfaces: which category is
 * picked, the amount typed, what the picker may offer, and the add action.
 *
 * Shared by `AlertSettingsModal` and `AlertSheet`, which carried this block
 * verbatim — the picker's bare-lowercase name match had to be fixed in both.
 * Which categories are offered is `derive.uncappedCategories`; this hook only
 * holds the draft.
 */
export function useCategoryLimitDraft({
  categories,
  categoryLimits,
  onSetCategoryLimit,
}: {
  categories: readonly Category[];
  categoryLimits: Readonly<Record<string, number>>;
  onSetCategoryLimit: (categoryName: string, amount: number) => void;
}): {
  /** the picked category, or '' once it is no longer offered */
  pickedCategory: string;
  setPickedCategory: (name: string) => void;
  limitText: string;
  setLimitText: (text: string) => void;
  available: Category[];
  /** a category still on offer is picked and the amount is above zero */
  canAdd: boolean;
  addLimit: () => void;
} {
  const [picked, setPickedCategory] = useState('');
  const [limitText, setLimitText] = useState('');

  const available = uncappedCategories(categories, categoryLimits);
  // The snapshot is live: another tab can cap the picked category while this
  // picker is open. It then leaves `available`, and is treated as unpicked —
  // otherwise "Set" would still be enabled and silently replace that cap.
  const pickedCategory = available.some((c) => c.name === picked) ? picked : '';
  const canAdd = pickedCategory !== '' && parseAmountInput(limitText) > 0;

  const addLimit = (): void => {
    if (!canAdd) return;
    onSetCategoryLimit(pickedCategory, parseAmountInput(limitText));
    setPickedCategory('');
    setLimitText('');
  };

  return {
    pickedCategory,
    setPickedCategory,
    limitText,
    setLimitText,
    available,
    canAdd,
    addLimit,
  };
}
