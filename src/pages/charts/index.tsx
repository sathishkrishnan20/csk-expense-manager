import * as React from 'react';
import Box from '@mui/material/Box';
import { CircularProgress, Divider, FormControl, MenuItem, Paper, Select, Typography, styled } from '@mui/material';
import { AppHeader } from '../../components/AppBar';
import { useLocation, useNavigate } from 'react-router-dom';
import { ExpenseSchema } from '../../interface/expenses';
import { getTransactionsData } from '../../services/gsheet';
import { TransactionNotFound } from '../../components/Transactions/not_found';
import { AuthContext } from '../../context/AuthContext';
import { BarChart, PieChart, pieArcLabelClasses } from '@mui/x-charts';
import { INCOME_CATEGORY_NAMES } from '../../config';

enum DATA_FIELDS_TO_FILTER {
    CATEGORY = 'CATEGORY',
    SUB_CATEGORY = 'SUB_CATEGORY',
    PAYMENT_METHOD = 'PAYMENT_METHOD'
}

interface TransactionsProps {
    shopAppHeader: boolean;
    transactions?: ExpenseSchema[]
}
interface PieChartProps {
    id: number; 
    value: number; 
    label: string
}
const Div = styled('div')(({ theme }) => ({
    ...theme.typography.button,
    padding: theme.spacing(1),
}));

export const TransactionCharts = ({ shopAppHeader, transactions: transactionsViaNaviagation }: TransactionsProps) => {
     // @ts-ignore
     const { logout } = React.useContext(AuthContext);
     const windowSize = React.useRef([window.innerWidth, window.innerHeight]);
    
    const navigate = useNavigate()
    const { state } = useLocation()
    const [transactions, setTransactions] = React.useState<ExpenseSchema[]>([]);
    const [onlyExpensess, setOnlyExpenses] = React.useState<ExpenseSchema[]>([]);

    const [expensesByCategory, setExpensesByCategory] = React.useState<PieChartProps[]>([]);

    const [income, setIncome] = React.useState<number>(0);
    const [expenses, setExpenses] = React.useState<number>(0);
    const [loader, setLoader] = React.useState<boolean>(false);
    const [expensesBarChartBy, setExpensesBarChartBy] = React.useState<DATA_FIELDS_TO_FILTER>(DATA_FIELDS_TO_FILTER.CATEGORY);
    const ref = React.useRef<HTMLDivElement>(null);
    
    React.useEffect(() => {
        if (transactionsViaNaviagation?.length) {
            setTransactions(transactionsViaNaviagation)

        } else if (state?.transactions?.length) {
            setTransactions(state.transactions)
        } else {
            loadRecentTransactionsData()
        }
    }, [])

    const loadRecentTransactionsData = async () => {
        try {
            
       
        setLoader(true);
        const {transactions, expenses, income }  = await getTransactionsData()
        setExpenses(Math.abs(expenses))
        setIncome(income)
        setTransactions(transactions);
        const onlyExpensess = transactions.filter(e => INCOME_CATEGORY_NAMES.includes(e.Category) === false)
        setOnlyExpenses(onlyExpensess)
        categoriseTheData(onlyExpensess, expensesBarChartBy)
        setLoader(false);
    } catch (error:any) {
        if (error.response.status === 401) {
            logout()
        }
    }
    };

    const categoriseTheData = (onlyExpensessData: ExpenseSchema[], expensedChartSeleted: DATA_FIELDS_TO_FILTER) => {
        const map: Record<string, PieChartProps> = {}

        const  DATA_FIELDS_KEYS: Record<DATA_FIELDS_TO_FILTER, keyof ExpenseSchema>  = {
            CATEGORY: 'Category',
            SUB_CATEGORY: 'SubCategory',
            PAYMENT_METHOD: 'PaymentMethod'
        }
       
        for (const exp of onlyExpensessData) {
            // @ts-ignore
            if(!map[exp[DATA_FIELDS_KEYS[expensedChartSeleted]]]) {
                // @ts-ignore
                map[exp[DATA_FIELDS_KEYS[expensedChartSeleted]]] = {
                    id: Object.keys(map).length + 1,
                    value: Math.abs(Number(exp.Amount)),
                    label: exp[DATA_FIELDS_KEYS[expensedChartSeleted]]
                }
            } else {
                // @ts-ignore
                map[exp[DATA_FIELDS_KEYS[expensedChartSeleted]]].value += Math.abs(Number(exp.Amount));
            }
        }
        setExpensesByCategory(Object.values(map))

    }
   
    return (
        <Box sx={{ pb: 7 }} ref={ref}>
        {shopAppHeader ? <AppHeader title='Transactions' onClickBack={() => navigate(-1) }/> : null } 
        {loader ? <CircularProgress style={{ 
            position: 'absolute',
            top: '45%',
            left: '50%',
            right: 0,
            bottom: 0,
            textAlign: 'center' 
        }}/> : transactions.length === 0 ? <TransactionNotFound /> : 
        <Paper> 
            <Paper elevation={3}>
                <Div>Income and Expeenses</Div>
                <PieChart
                    series={[{
                        arcLabel: (item) => `₹${item.value}`,
                        arcLabelMinAngle: 30,
                        data: [
                            { id: 1, label: 'Income', value: income, color: '#00A86B' }, 
                            { id: 2, label: 'Expenses', value: expenses, color: '#FD3C4A' }
                        ],
                    },
                ]}
                sx={{
                    [`& .${pieArcLabelClasses.root}`]: {
                      fill: 'white',
                      fontWeight: 'bold',
                    },
                }}
                width={windowSize.current[0]}
                height={250}
            />
            </Paper>
            <Divider  />
            
            
            {expensesByCategory.length ? <Paper elevation={3}> 
                <div style={{ display: 'flex', justifyContent: 'space-between'}}> 
                    <Div>Expenses</Div>
                    <FormControl variant="standard" sx={{ m: 1, minWidth: 120 }}>
                        <Select
                            labelId="select-label-expenses-by-category"
                            id="select-expense-by-category"
                            value={expensesBarChartBy}
                            label={DATA_FIELDS_TO_FILTER.CATEGORY}
                            onChange={(e) => {
                                setExpensesBarChartBy(e.target.value as DATA_FIELDS_TO_FILTER)
                                categoriseTheData(onlyExpensess, e.target.value as DATA_FIELDS_TO_FILTER)
                            }}>
                                <MenuItem value={DATA_FIELDS_TO_FILTER.CATEGORY}>Category</MenuItem>
                                <MenuItem value={DATA_FIELDS_TO_FILTER.SUB_CATEGORY}>Sub Category</MenuItem>
                                <MenuItem value={DATA_FIELDS_TO_FILTER.PAYMENT_METHOD}>Payment Method</MenuItem>
                        </Select>
                    </FormControl>
                </div>
               
                <BarChart
                    xAxis={[{ scaleType: 'band', data: expensesByCategory.map(e => e.label)  }]}
                    series={[{ data: expensesByCategory.map(e => e.value) }]}
                    width={windowSize.current[0]}
                    height={300}
                />
              
              
            </Paper> : null }
        </Paper>}
</Box>
    )
}