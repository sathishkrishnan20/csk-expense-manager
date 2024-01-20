import * as React from 'react';
import Box from '@mui/material/Box';

import ExpenseIcon from '@mui/icons-material/CreditCardOffOutlined'
import CreditIcon from '@mui/icons-material/AddCardOutlined';

import NotificationIcon from '@mui/icons-material/PowerSettingsNew';
import { Avatar, Badge, Chip, CssBaseline, Paper, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import { Transactions } from '../transactions';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { getTransactionsData } from '../../services/gsheet';
import { ExpenseSchema } from '../../interface/expenses';
const Div = styled('div')(({ theme }) => ({
    ...theme.typography.button,
    padding: theme.spacing(1),
}));

export const DashBoard = () => {
    // @ts-ignore
    const { logout, state } = React.useContext(AuthContext);
    const navigate = useNavigate();
    const [transactions, setTransactions] = React.useState<ExpenseSchema[]>([])
    const [accountBalance, setAccountBalance] = React.useState(100);
    const [credit, setCredit] = React.useState(100);
    const [debit, setDebit] = React.useState(100);
    const ref = React.useRef<HTMLDivElement>(null);
    React.useEffect(() => {
        loadRecentTransactionsData()
    }, [])

    const loadRecentTransactionsData = async () => {
        try { 
            const {transactions, balance, income, expenses }  = await getTransactionsData()
            setTransactions(transactions);
            setCredit(income)
            setAccountBalance(balance)
            setDebit(expenses)
        } catch(error: any) {
            if (error.response.status === 401) {
                logout()
            }
        }
      };
      const onLogout = () => {
        logout()
      }
      const naviageToTransactionsPage = () => navigate('/transactions', { state: { transactions } })
    return (
       <Box sx={{ pb: 7 }} ref={ref}>
            <CssBaseline />
           
            <Paper style={{ padding: 16, backgroundColor: '#FFF6E5' }} elevation={3}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginLeft: 20, marginRight: 20 }}> 
                    <Avatar alt={state?.userInfo?.name} src={state?.userInfo?.picture} />
                    <Div style={{ }}>{new Date().toLocaleString('default', { month: 'long' })}</Div>
                    <div onClick={() => onLogout()}>
                    <Badge style={{marginTop: 8}} color="primary">
                        <NotificationIcon  style={{ fontSize: 30}} color='error' />
                    </Badge>
                    </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginLeft: 20, marginRight: 20 }}> 
                    <div></div>
                    <Div style={{ color: 'GrayText' }}>{'Account Balance'}</Div>
                    <div></div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: -12, marginLeft: 20, marginRight: 20 }}> 
                    <div></div>
                    <Div style={{ fontSize: 24, color: '#00A86B'  }}>₹{accountBalance}</Div>
                    <div></div>
                </div>
            </Paper>
      
            <Paper style={{ padding: 16 }} elevation={1}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20 }}>
                    <div style={{ display: 'flex', width: '50%', backgroundColor: '#00A86B', padding: 10, borderRadius: 20  }}>
                        <CreditIcon  style={{ marginLeft: 4, fontSize: 40, color: 'white'}} />
                        <div style={{ marginLeft: 8 }}>
                            <Div style={{ fontSize: 10, padding: 0, color: 'white' }}>{'Income'}</Div>
                            <Div style={{ fontWeight: 900,  fontSize: 14, padding: 0 ,  color: 'white' }}>₹{credit}</Div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', width: '50%', backgroundColor: '#FD3C4A', padding: 10, borderRadius: 20  }}>
                        <ExpenseIcon  style={{ marginLeft: 4, fontSize: 40, color: 'white'}} />
                        <div style={{ marginLeft: 8 }}>
                            <Div style={{ fontSize: 10, padding: 0, color: 'white' }}>{'Expenses'}</Div>
                            <Div style={{ fontWeight: 900,  fontSize: 14, padding: 0 ,  color: 'white' }}>₹{debit}</Div>
                        </div>
                    </div>
                </div>
            </Paper>
           
            <CssBaseline />
            <Paper style={{ marginTop: 4}} elevation={0}>
                <div style={{ display: 'flex',  marginLeft: 6, marginBottom: 4, justifyContent: 'space-between'}}>
                    <Typography fontWeight={800}>  Recent Transactions </Typography>
                    <div onClick={()=> naviageToTransactionsPage()}> 
                        <Chip style={{ color: '#7F3DFF', backgroundColor: '#EEE5FF'}}  label="See All" />
                    </div>
                </div>
                {transactions?.length ? <Transactions shopAppHeader={false} transactions={transactions.slice(0, 5)} /> : null}
            </Paper>
        </Box>
    )
}