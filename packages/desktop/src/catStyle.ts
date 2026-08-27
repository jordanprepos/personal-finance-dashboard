import type { CSSProperties } from 'react';
import { categoryVars } from '@expense-tracker/shared';

/**
 * A category's colour, as the custom properties `tokens.css` styles against.
 *
 * Deliberately duplicated in the mobile app at the same path and name. The
 * `CSSProperties` cast is React-specific and `shared` stays React-free, so
 * this can't be hoisted — keeping both copies at `src/catStyle.ts` at least
 * makes the pair obvious.
 */
export const catStyle = (color: string): CSSProperties => categoryVars(color) as CSSProperties;
