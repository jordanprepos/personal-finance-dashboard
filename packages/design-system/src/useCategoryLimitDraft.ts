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
  pickedCategory: string;
  setPickedCategory: (name: string) => void;
  limitText: string;
  setLimitText: (text: string) => void;
  available: Category[];
  addLimit: () => void;
} {
  const [pickedCategory, setPickedCategory] = useState('');
  const [limitText, setLimitText] = useState('');

  const addLimit = (): void => {
    const amount = parseAmountInput(limitText);
    if (!pickedCategory || amount <= 0) return;
    onSetCategoryLimit(pickedCategory, amount);
    setPickedCategory('');
    setLimitText('');
  };

  return {
    pickedCategory,
    setPickedCategory,
    limitText,
    setLimitText,
    available: uncappedCategories(categories, categoryLimits),
    addLimit,
  };
}
