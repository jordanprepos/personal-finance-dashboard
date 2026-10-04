import type { JSX, ReactNode } from 'react';
import type { SetupProgress } from '@expense-tracker/shared';

import { DefaultCategoriesButton } from './DefaultCategoriesButton.js';

export interface GettingStartedProps {
  /** From `setupProgress` — which of the three steps are already done. */
  progress: Pick<SetupProgress, 'categories' | 'income' | 'expense'>;
  /** Disables the buttons while a write is in flight. */
  busy: boolean;
  /** Seed the account with the template category set. */
  onAddDefaultCategories: () => void;
  /** Open the category manager, to build a list by hand. */
  onManageCategories: () => void;
  /** Go to wherever income is edited on this surface. */
  onAddIncome: () => void;
  /** Open the add-expense form. */
  onAddExpense: () => void;
}

/**
 * The getting-started panel: what a fresh account sees instead of a page of
 * blank envelopes, in the order the app needs things — categories, income,
 * a first expense.
 *
 * Surface-neutral, like `DefaultCategoriesButton`: only `.cf-setup*` classes
 * and the shared buttons, so the desktop dashboard and the phone render the
 * same component. Whether it shows at all is `setupProgress().show`, decided
 * in `shared` — this component only lays the steps out.
 */
export function GettingStarted({
  progress,
  busy,
  onAddDefaultCategories,
  onManageCategories,
  onAddIncome,
  onAddExpense,
}: GettingStartedProps): JSX.Element {
  const done = [progress.categories, progress.income, progress.expense].filter(Boolean).length;

  return (
    <section className="cf-setup" aria-label="Getting started">
      <div className="cf-setup__head">
        <span className="cf-setup__title">Get set up</span>
        <span className="cf-setup__count">{done} of 3 done</span>
      </div>

      <ol className="cf-setup__steps">
        <Step
          n={1}
          done={progress.categories}
          label="Choose your categories"
          hint="What your spending is for: groceries, bills, transport. Start from the suggested set or make your own."
        >
          <DefaultCategoriesButton busy={busy} onAdd={onAddDefaultCategories} />
          <button type="button" className="cf-ghostbtn" disabled={busy} onClick={onManageCategories}>
            Make my own
          </button>
        </Step>

        <Step
          n={2}
          done={progress.income}
          label="Add your income"
          hint="What you expect to receive this month, so Budget left has something to count down from."
        >
          <button type="button" className="cf-ghostbtn" onClick={onAddIncome}>
            Add income
          </button>
        </Step>

        <Step
          n={3}
          done={progress.expense}
          label="Log your first expense"
          hint="An amount, what it was for, and its category."
        >
          <button type="button" className="cf-ghostbtn" onClick={onAddExpense}>
            Add expense
          </button>
        </Step>
      </ol>
    </section>
  );
}

function Step({
  n,
  done,
  label,
  hint,
  children,
}: {
  n: number;
  done: boolean;
  label: string;
  hint: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <li className={`cf-setup__step${done ? ' cf-setup__step--done' : ''}`}>
      <span className="cf-setup__mark" aria-hidden="true">
        {done ? '✓' : n}
      </span>
      <div className="cf-setup__body">
        <div className="cf-setup__label">
          {label}
          {done ? <span className="cf-setup__visually-hidden"> (done)</span> : null}
        </div>
        {done ? null : <div className="cf-setup__hint">{hint}</div>}
      </div>
      {done ? null : <div className="cf-setup__actions">{children}</div>}
    </li>
  );
}
