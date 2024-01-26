import axios from "axios";
import { LOCAL_SESSION_KEYS, getItem } from "../context/storage";
import { CategorySubCategoryGrouped, CategorySubCategorySchema, ExpenseSchema, PaymentMethodsSchema } from "../interface/expenses";
import { CATEGORY_SUBCATEGORY_TAB_HEADERS, CATEGORY_SUBCATEGORY_TAB_NAME, CATEGORY_SUB_CATEGORY_MASTER_DATA, PAYMENT_METHODS_MASTER_DATA, PAYMENT_METHOD_TAB_HEADERS, PAYMENT_METHOD_TAB_NAME, TRANSACTION_COLUMNS_ORDERS, TRANSACTION_TAB_NAME  } from './constants'
import { DEMO_EXPENSE_MANAGER_SHEET_ID } from "../config";
interface GetSheetData {
    transactions: ExpenseSchema[];
    balance: number;
    income: number;
    expenses: number; 
}
interface MasterResp {
    category: CategorySubCategoryGrouped[]
    payments: PaymentMethodsSchema[]
}

    const instance = axios.create({
        baseURL: 'https://sheets.googleapis.com/v4/spreadsheets'
    });
    instance.interceptors.request.use(function (config) {
        const access_token = getItem(LOCAL_SESSION_KEYS.ACCESS_TOKEN);
        if(!access_token && getItem(LOCAL_SESSION_KEYS.SHEET_ID) === DEMO_EXPENSE_MANAGER_SHEET_ID) {
            config.url = config.url?.includes('?')
                ? `${config.url}&key=${process.env.REACT_APP_EXPENSE_MANAGER_API}`
                : `${config.url}?key=${process.env.REACT_APP_EXPENSE_MANAGER_API}`;
        } else {
            config.headers['Authorization'] = `Bearer ${access_token}`;
        }
        
         
        // Do something before request is sent
        return config;
    }, function (error) {
        // Do something with request error
        return Promise.reject(error);
    });

    instance.interceptors.response.use(function (response) {
        // Any status code that lie within the range of 2xx cause this function to trigger
        // Do something with response data
        return response;
      }, function (error) {
       
        // Any status codes that falls outside the range of 2xx cause this function to trigger
        // Do something with response error

        return Promise.reject(error);
      });

    export const getTransactionsData = async (): Promise<GetSheetData> => {
        let balance = 0;
        let income = 0;
        let expenses = 0;
        try {
            const { data }  = await instance.get(`/${getItem(LOCAL_SESSION_KEYS.SHEET_ID)}/values/${TRANSACTION_TAB_NAME}!A1:Z1000?majorDimension=ROWS`)
            const values = data.values
            const headers: string[] = values[0] as string[]
            const transactions = [];
            for (let index = values.length - 1; index >= 1; index--) {
                const element = values[index];
                // @ts-ignore
                const obj: ExpenseSchema = {}
                let isDeleted = false;
                for (let h = 0; h < headers.length; h++) {
                    const header = headers[h] as keyof ExpenseSchema;
                    obj[header] = element[h]
                    if (header === 'Status') {
                       
                        if (element[h] === 'Deleted') {
                            isDeleted = true
                            break;
                        }
                    }
                    if (header === 'Amount') {
                        const val =  Number(element[h])
                        balance += val
                        if (val > 0) {
                            income += val;
                        } else {
                            expenses += val;
                        }
                    }
                }

                if (isDeleted === false) {       
                    transactions.push(obj);
                }
            }
            return {transactions, balance, income, expenses }
            
        } catch (error) {
            throw error;
        }
    }

    export const getMasterData = async (): Promise<MasterResp> => {
        
        try {
            const [paymentMethods, category ]  = await Promise.all([
                instance.get(`/${getItem(LOCAL_SESSION_KEYS.SHEET_ID)}/values/${PAYMENT_METHOD_TAB_NAME}!A1:B99999?majorDimension=ROWS`),
                instance.get(`/${getItem(LOCAL_SESSION_KEYS.SHEET_ID)}/values/${CATEGORY_SUBCATEGORY_TAB_NAME}!A1:C99999?majorDimension=ROWS`)
            ])
            const paymentMethodsData = paymentMethods.data.values;
            const categoryData = category.data.values
            const headers = paymentMethodsData[0] as (keyof PaymentMethodsSchema)[]
            const headersCategry = categoryData[0] as (keyof CategorySubCategorySchema)[]


            const categoryShemad = getShemaed(headersCategry, categoryData);
            const map: Record<string, CategorySubCategoryGrouped> = {}
            for (let index = 0; index < categoryShemad.length; index++) {
                const element = categoryShemad[index];
                const categoryName = element.CategoryName;
                const sub = {
                    RowId: element.RowId,
                    subCategory: element.SubCategoryName
                }
                if (!map[categoryName]) {
                    map[categoryName] = {
                        categoryName,
                        subCategories: [sub]
                    }
                } else {
                    map[categoryName].subCategories.push(sub) 
                }
            }
            return {
                payments: getShemaed(headers, paymentMethodsData),
                category: Object.values(map)
            }
    } catch (error) {
        console.log(error)
            return {
                payments: [],
                category: []
            }
        }
    }

    export const addTransaction = async (requestData: Omit<ExpenseSchema, 'RowId' | 'OpeningBalance' | 'ClosingBalance' | 'Timestamp'>): Promise<any> => {
        await instance.post(`/${getItem(LOCAL_SESSION_KEYS.SHEET_ID)}/values/${TRANSACTION_TAB_NAME}!A:Z:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
            majorDimension: "ROWS",
            values: [ getTransactionInput(requestData) ]
        })
    }

    export const updateTransaction = async (requestData: Omit<ExpenseSchema, 'OpeningBalance' | 'ClosingBalance' | 'Timestamp'>): Promise<any> => {
        await instance.post(`/${getItem(LOCAL_SESSION_KEYS.SHEET_ID)}/values:batchUpdateByDataFilter`, {
            "valueInputOption": "USER_ENTERED",
            "data": [
                {
                  majorDimension: "ROWS",
                  values: [ getTransactionInput(requestData) ],
                  "dataFilter": {
                    a1Range: `${TRANSACTION_TAB_NAME}!A${requestData.RowId}:Z${requestData.RowId}`
                  }
                }
            ]
        })
    }

    const getTransactionInput = (requestData: Omit<ExpenseSchema, 'Id' | 'OpeningBalance' | 'ClosingBalance' | 'Timestamp'>) => {
        const requestInput: string[] = []
        const requestDataWithEx: ExpenseSchema = {
            ...requestData,
            RowId: '=row()',
            OpeningBalance: '=IF(ROW()-1 = 1, 0, INDIRECT(ADDRESS(ROW()-1,COLUMN() + 1,4)))',
            ClosingBalance: `=SUM(INDIRECT(ADDRESS(1,COLUMN() - 2,4)&":"&ADDRESS(ROW()-1,COLUMN() - 2,4))) + ${Number(requestData.Amount)}`,
            Timestamp: "=now()"
        }
        for (let index = 0; index < TRANSACTION_COLUMNS_ORDERS.length; index++) {
            const element = TRANSACTION_COLUMNS_ORDERS[index];
            requestInput.push(requestDataWithEx[element] || '')
        }
        return requestInput
    }

    export const addSheetHeaderContents = async (): Promise<any> => {
        
        await addSheet(CATEGORY_SUBCATEGORY_TAB_NAME)
        await addSheet(PAYMENT_METHOD_TAB_NAME)
        
        await addHeaders(`${TRANSACTION_TAB_NAME}!A:Z`, [TRANSACTION_COLUMNS_ORDERS])
        await addHeaders(`${CATEGORY_SUBCATEGORY_TAB_NAME}!A:D`, [CATEGORY_SUBCATEGORY_TAB_HEADERS, ...CATEGORY_SUB_CATEGORY_MASTER_DATA])
        await addHeaders(`${PAYMENT_METHOD_TAB_NAME}!A:C`, [PAYMENT_METHOD_TAB_HEADERS, ...PAYMENT_METHODS_MASTER_DATA])
       

        
    }
    const addSheet = async (sheetName: string) => {
        await instance.post(`/${getItem(LOCAL_SESSION_KEYS.SHEET_ID)}:batchUpdate`, {
            requests: [
                {
                    'addSheet': {
                        'properties': {
                            'title': sheetName,
                            'tabColor': {
                                'red': 0.44,
                                'green': 0.99,
                                'blue': 0.50
                            }
                        }
                    }
                }
            ]
        })
    }
    const addHeaders = async  (sheetNameWithRange: string, rows: string[][]) => {
        await instance.post(`/${getItem(LOCAL_SESSION_KEYS.SHEET_ID)}/values/${sheetNameWithRange}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
            majorDimension: "ROWS",
            values: rows
        })
    }
    const getShemaed = <T extends string | number | symbol>(headers: T[], values: any[]): Record<T, string>[] => {
        const transactions = []
        for (let index = 1; index < values.length; index++) {
            const element = values[index];
            // @ts-ignore
            const obj: Record<T, string> = {}
            for (let h = 0; h < headers.length; h++) {
                const header = headers[h] as T;
                obj[header] = element[h]
            }      
            transactions.push(obj);
        }
        return transactions
    }
    
    
    