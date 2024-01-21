import * as React from 'react';
import Box from '@mui/material/Box';
import { CircularProgress, Divider, Paper, Typography } from '@mui/material';
import { AppHeader } from '../../components/AppBar';
import { useLocation, useNavigate } from 'react-router-dom';
import { ExpenseSchema } from '../../interface/expenses';
import { getTransactionsData } from '../../services/gsheet';
import { TransactionNotFound } from '../../components/Transactions/not_found';
import { AuthContext } from '../../context/AuthContext';
import { BarChart, PieChart, pieArcLabelClasses } from '@mui/x-charts';
import { INCOME_CATEGORY_NAMES } from '../../config';


interface TransactionsProps {
    shopAppHeader: boolean;
    transactions?: ExpenseSchema[]
}
interface PieChartProps {
    id: number; 
    value: number; 
    label: string
}
export const TransactionCharts = ({ shopAppHeader, transactions: transactionsViaNaviagation }: TransactionsProps) => {
     // @ts-ignore
     const { logout } = React.useContext(AuthContext);
     const windowSize = React.useRef([window.innerWidth, window.innerHeight]);
    
    const navigate = useNavigate()
    const { state } = useLocation()
    const [transactions, setTransactions] = React.useState<ExpenseSchema[]>([]);

    const [expensesByCategory, setExpensesByCategory] = React.useState<PieChartProps[]>([]);

    const [income, setIncome] = React.useState<number>(0);
    const [expenses, setExpenses] = React.useState<number>(0);
    const [loader, setLoader] = React.useState<boolean>(false);
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
        const map: Record<string, PieChartProps> = {}

        for (const exp of onlyExpensess) {
            if(!map[exp.Category]) {
                map[exp.Category] = {
                    id: Object.keys(map).length + 1,
                    value: Math.abs(Number(exp.Amount)),
                    label: exp.Category
                }
            } else {
                map[exp.Category].value += Math.abs(Number(exp.Amount));
            }
        }
        setExpensesByCategory(Object.values(map))

        setLoader(false);
    } catch (error:any) {
        if (error.response.status === 401) {
            logout()
        }
    }
    };
   
    const getType = (amount?: string) => Number(amount) >= 0 ? 'CREDIT' : 'DEBIT' 
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
            
            

            <Paper elevation={3}> 
                <BarChart
                    xAxis={[{ scaleType: 'band', data: expensesByCategory.map(e => e.label)  }]}
                    series={[{ data: expensesByCategory.map(e => e.value) }]}
                    width={windowSize.current[0]}
                    height={300}
                />
              
            </Paper>
        </Paper>}
</Box>
    )
}