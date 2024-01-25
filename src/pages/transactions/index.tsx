import * as React from 'react';
import Box from '@mui/material/Box';
import { CircularProgress, Paper, Typography } from '@mui/material';
import { AppHeader } from '../../components/AppBar';
import { useLocation, useNavigate } from 'react-router-dom';
import { ExpenseSchema } from '../../interface/expenses';
import { getTransactionsData } from '../../services/gsheet';
import { TransactionNotFound } from '../../components/Transactions/not_found';
import { AuthContext } from '../../context/AuthContext';
import dayjs from 'dayjs';


interface TransactionsProps {
    shopAppHeader: boolean;
    transactions?: ExpenseSchema[]
}
export const Transactions = ({ shopAppHeader, transactions: transactionsViaNaviagation }: TransactionsProps) => {
     // @ts-ignore
     const { logout } = React.useContext(AuthContext);
    const navigate = useNavigate()
    const { state } = useLocation()
    const [transactions, setTransactions] = React.useState<ExpenseSchema[]>([]);
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
        const {transactions}  = await getTransactionsData()
        setTransactions(transactions);
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
            }}/> : transactions.length === 0 ? <TransactionNotFound /> : null}
            <Paper style={{ backgroundColor: 'ActiveBorder'}}>
              
            {(transactions || []).map((item, index) => ( 
                <Paper key={"t"+index} style={{  padding: 8, marginBottom: 1, borderRadius: 0 }} elevation={3}>
                    <div onClick={() => navigate('/add', { state: { type: getType(item.Amount), action: 'EDIT', expenseData: item } })}>
                        <Typography style={{ color: 'GrayText' }}>{dayjs(item.TransactionDate).format('MMMM DD, YYYY')}</Typography>
                        
                        <div style={{display: 'flex', justifyContent: 'space-between'}}> 
                            <Typography>{item.Payee}</Typography>
                            <Typography color={getType(item.Amount) === 'CREDIT' ? 'green': 'red'} fontWeight={900}>₹{getType(item.Amount) === 'CREDIT' ? item.Amount: Number(item.Amount) * - 1 }</Typography>
                        </div>

                        <div style={{display: 'flex', justifyContent: 'space-between'}}> 
                            <Typography>{item.Category} : {item.SubCategory}</Typography>
                            <Typography fontWeight={800}>₹{item.ClosingBalance}</Typography>
                        </div>
                        
                        <div style={{display: 'flex', justifyContent: 'space-between'}}> 
                            <Typography fontWeight={100} fontSize={14}>{item.Description}</Typography>
                            {item.PaymentMethod ? <Typography fontWeight={200}>{item.PaymentMethod}</Typography>: null }
                        </div>
                    </div>
                </Paper>
            ))}
         </Paper>   
        </Box>
        
    )
}