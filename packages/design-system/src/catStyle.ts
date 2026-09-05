import type { CSSProperties } from 'react';
import { categoryVars } from '@expense-tracker/shared';

/**
 * A category's colour, as the custom properties `tokens.css` styles against.
 *
 * This lives here rather than in `shared` because the `CSSProperties` cast is
 * React-specific and `shared` stays React-free. It was duplicated at
 * `src/catStyle.ts` in both apps until the design system gave the two copies a
 * single home.
 */
export const catStyle = (color: string): CSSProperties => categoryVars(color) as CSSProperties;
