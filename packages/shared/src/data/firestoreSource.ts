import type { Firestore } from 'firebase/firestore';

import * as q from '../lib/queries.js';
import type {
  Budget,
  Category,
  CategoryInput,
  Profile,
  Transaction,
  TransactionInput,
  TransactionPatch,
  TransactionSeriesKey,
} from '../types.js';
import type { ExpenseDataSource } from './source.js';

/** Live Firestore, scoped to one authenticated user. */
export function createFirestoreDataSource(db: Firestore, userId: string): ExpenseDataSource {
  return {
    kind: 'firestore',
    userId,

    listCategories: (): Promise<Category[]> => q.fetchCategories(db, userId),
    createCategory: (input: CategoryInput): Promise<Category> => q.createCategory(db, userId, input),
    deleteCategory: (categoryId: string): Promise<number> => q.deleteCategory(db, userId, categoryId),

    listTransactionsByDate: (date: string): Promise<Transaction[]> =>
      q.fetchTransactionsByDate(db, userId, date),
    listTransactionsByMonth: (yearMonth: string): Promise<Transaction[]> =>
      q.fetchTransactionsByMonth(db, userId, yearMonth),
    listTransactionsByYear: (year: string): Promise<Transaction[]> =>
      q.fetchTransactionsByYear(db, userId, year),

    createTransaction: (input: TransactionInput): Promise<Transaction> =>
      q.createTransaction(db, userId, input),
    createTransactionSeries: (input: TransactionInput, through: string): Promise<Transaction[]> =>
      q.createTransactionSeries(db, userId, input, through),
    updateTransaction: (id: string, patch: TransactionPatch): Promise<void> =>
      q.updateTransaction(db, userId, id, patch),
    deleteTransaction: (id: string): Promise<void> => q.deleteTransaction(db, userId, id),
    deleteTransactionSeries: (key: TransactionSeriesKey): Promise<number> =>
      q.deleteTransactionSeries(db, userId, key),

    getBudget: (yearMonth: string): Promise<Budget> => q.fetchBudget(db, userId, yearMonth),
    saveBudget: (budget: Budget): Promise<void> => q.saveBudget(db, userId, budget),

    getProfile: (): Promise<Profile> => q.fetchProfile(db, userId),
  };
}
