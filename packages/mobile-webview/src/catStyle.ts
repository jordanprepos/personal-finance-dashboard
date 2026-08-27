import type { CSSProperties } from 'react';
import { categoryVars } from '@expense-tracker/shared';

/** A category's colour, as the custom properties `tokens.css` styles against. */
export const catStyle = (color: string): CSSProperties => categoryVars(color) as CSSProperties;
