import { CategorySubCategorySchema, ExpenseSchema, PaymentMethodsSchema } from "../interface/expenses";

export const EXPENSE_MANAGER_G_SHEET_NAME = '__ExpenseManager__';

export const CATEGORY_SUBCATEGORY_TAB_NAME = 'categoryAndSubCategory';
export const PAYMENT_METHOD_TAB_NAME = 'paymentMethods'
export const TRANSACTION_TAB_NAME = 'Sheet1'
export const TRANSACTION_COLUMNS_ORDERS: (keyof ExpenseSchema)[] = ['RowId', 'Category', 'SubCategory', 'Payee', 'PaymentMethod', 'Status', 'Description', 'Amount', 'OpeningBalance', 'ClosingBalance', 'Timestamp']

export const CATEGORY_SUBCATEGORY_TAB_HEADERS: (keyof CategorySubCategorySchema)[] = ['RowId', 'CategoryName', 'SubCategoryName', 'Timestamp']
export const PAYMENT_METHOD_TAB_HEADERS: (keyof PaymentMethodsSchema)[] = ['RowId', 'PaymentMethodName',  'Timestamp']

export const CATEGORY_SUB_CATEGORY_MASTER_DATA = [
    ['2', 'Entertainment', 'Cinema', '=now()'],
    ['3', 'Entertainment', 'Playground Fee', '=now()'],
    ['4', 'Travel', 'Train', '=now()']
]

export const PAYMENT_METHODS_MASTER_DATA = [
    ['2', 'Cash', '=now()'],
    ['3', 'UPI', '=now()'],
    ['4', 'Credit Card', '=now()'],
    ['5', 'Debit Card', '=now()'],
    ['6', 'Net banking', '=now()']
] 