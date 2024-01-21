import { INCOME_CATEGORY_NAMES } from "../config";
import { CategorySubCategorySchema, ExpenseSchema, PaymentMethodsSchema } from "../interface/expenses";

export const EXPENSE_MANAGER_G_SHEET_NAME = '__ExpenseManager__';

export const CATEGORY_SUBCATEGORY_TAB_NAME = 'categoryAndSubCategory';
export const PAYMENT_METHOD_TAB_NAME = 'paymentMethods'
export const TRANSACTION_TAB_NAME = 'Sheet1'
export const TRANSACTION_COLUMNS_ORDERS: (keyof ExpenseSchema)[] = ['RowId', 'Category', 'SubCategory', 'Payee', 'PaymentMethod', 'Status', 'Description', 'Amount', 'OpeningBalance', 'ClosingBalance', 'Timestamp']

export const CATEGORY_SUBCATEGORY_TAB_HEADERS: (keyof CategorySubCategorySchema)[] = ['RowId', 'CategoryName', 'SubCategoryName', 'Timestamp']
export const PAYMENT_METHOD_TAB_HEADERS: (keyof PaymentMethodsSchema)[] = ['RowId', 'PaymentMethodName',  'Timestamp']

export const CATEGORY_SUB_CATEGORY_MASTER_DATA = [
    ['=row()', INCOME_CATEGORY_NAMES[0], 'Salary', '=now()'],
    ['=row()', INCOME_CATEGORY_NAMES[0], 'Equities', '=now()'],
    ['=row()', INCOME_CATEGORY_NAMES[0], 'Personal Savings', '=now()'],
    ['=row()', INCOME_CATEGORY_NAMES[0], 'Rents and Royalties', '=now()'],
    ['=row()', INCOME_CATEGORY_NAMES[0], 'Home Equity', '=now()'],
    ['=row()', INCOME_CATEGORY_NAMES[0], 'Part-time work', '=now()'],
    ['=row()', INCOME_CATEGORY_NAMES[0], 'Pensions', '=now()'],
    ['=row()', INCOME_CATEGORY_NAMES[0], 'Annuities', '=now()'],
    ['=row()', INCOME_CATEGORY_NAMES[0], 'Social Securities', '=now()'],
    ['=row()', INCOME_CATEGORY_NAMES[0], 'Account Transfer', '=now()'],
    ['=row()', INCOME_CATEGORY_NAMES[0], 'Others', '=now()'],

    ['=row()', 'Entertainment', 'Cinema', '=now()'],
    ['=row()', 'Entertainment', 'Concert', '=now()'],
    ['=row()', 'Entertainment', 'Party', '=now()'],
    ['=row()', 'Entertainment', 'Sports', '=now()'],
    ['=row()', 'Entertainment', 'Others', '=now()'],
    
    ['=row()', 'Family', 'Child Care', '=now()'],
    ['=row()', 'Family', 'Child Education', '=now()'],
    ['=row()', 'Family', 'Toy', '=now()'],
    ['=row()', 'Family', 'Others', '=now()'],
    
    ['=row()', 'Automobile', 'Fuel', '=now()'],
    ['=row()', 'Automobile', 'Insurance', '=now()'],
    ['=row()', 'Automobile', 'Registration', '=now()'],
    ['=row()', 'Automobile', 'Road Tax', '=now()'],
    ['=row()', 'Automobile', 'Others', '=now()'],
    
    ['=row()', 'Food', 'Resaurant', '=now()'],
    ['=row()', 'Food', 'Groceries', '=now()'],
    ['=row()', 'Food', 'Snacks', '=now()'],
    ['=row()', 'Food', 'Others', '=now()'],

    ['=row()', 'Health Care', 'Dental', '=now()'],
    ['=row()', 'Health Care', 'Eye Care', '=now()'],
    ['=row()', 'Health Care', 'Health Insurance', '=now()'],
    ['=row()', 'Health Care', 'Medical', '=now()'],
    ['=row()', 'Health Care', 'Prescription', '=now()'],
    ['=row()', 'Health Care', 'Nutrition', '=now()'],
    ['=row()', 'Health Care', 'Others', '=now()'],
    
    ['=row()', 'Home Office', 'Computer', '=now()'],
    ['=row()', 'Home Office', 'Electronics', '=now()'],
    ['=row()', 'Home Office', 'Stationary', '=now()'],
    ['=row()', 'Home Office', 'Office Furniture', '=now()'],
    ['=row()', 'Home Office', 'Office Supply', '=now()'],
    ['=row()', 'Home Office', 'Other', '=now()'],

    ['=row()', 'Household', 'Appliance', '=now()'],
    ['=row()', 'Household', 'Consumables', '=now()'],
    ['=row()', 'Household', 'HomeMaintenance', '=now()'],
    ['=row()', 'Household', 'Homeowner Fees', '=now()'],
    ['=row()', 'Household', 'Homeshold Tools', '=now()'],
    ['=row()', 'Household', 'Miscellaneous Household Items', '=now()'],
    ['=row()', 'Household', 'Postager', '=now()'],
    ['=row()', 'Household', 'Rent', '=now()'],
    ['=row()', 'Household', 'Other', '=now()'],
   
    ['=row()', 'Insurance', 'Auto', '=now()'],
    ['=row()', 'Insurance', 'Health', '=now()'],
    ['=row()', 'Insurance', 'Home', '=now()'],
    ['=row()', 'Insurance', 'Life', '=now()'],
    ['=row()', 'Insurance', 'Other', '=now()'],

    ['=row()', 'Loans', 'Auto', '=now()'],
    ['=row()', 'Loans', 'Home Equity', '=now()'],
    ['=row()', 'Loans', 'Mortgage', '=now()'],
    ['=row()', 'Loans', 'Student', '=now()'],
    ['=row()', 'Loans', 'Other', '=now()'],
    
    ['=row()', 'Personal', 'Clothing', '=now()'],
    ['=row()', 'Personal', 'Donation', '=now()'],
    ['=row()', 'Personal', 'Gift', '=now()'],
    ['=row()', 'Personal', 'Personal Care', '=now()'],
    ['=row()', 'Personal', 'Other', '=now()'],
   
    ['=row()', 'Tax', 'Propery Tax', '=now()'],
    ['=row()', 'Tax', 'Other', '=now()'],
    
    ['=row()', 'Travel', 'Airplane', '=now()'],
    ['=row()', 'Travel', 'Car Rental', '=now()'],
    ['=row()', 'Travel', 'Taxi', '=now()'],
    ['=row()', 'Travel', 'Bus', '=now()'],
    ['=row()', 'Travel', 'Train', '=now()'],
    ['=row()', 'Travel', 'Ship', '=now()'],
    ['=row()', 'Travel', 'Other', '=now()'],

    ['=row()', 'Utilities', 'Cable TV', '=now()'],
    ['=row()', 'Utilities', 'Garbage', '=now()'],
    ['=row()', 'Utilities', 'Electric', '=now()'],
    ['=row()', 'Utilities', 'Gas', '=now()'],
    ['=row()', 'Utilities', 'Internet', '=now()'],
    ['=row()', 'Utilities', 'Telephone', '=now()'],
    ['=row()', 'Utilities', 'Water', '=now()'],
    ['=row()', 'Utilities', 'Other', '=now()'],
]

export const PAYMENT_METHODS_MASTER_DATA = [
    ['=row()', 'Cash', '=now()'],
    ['=row()', 'UPI', '=now()'],
    ['=row()', 'Credit Card', '=now()'],
    ['=row()', 'Debit Card', '=now()'],
    ['=row()', 'Cheque', '=now()'],
    ['=row()', 'Electronic Transfer', '=now()'],
    ['=row()', 'Net banking', '=now()']
    
] 