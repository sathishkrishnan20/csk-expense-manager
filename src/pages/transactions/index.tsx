import * as React from 'react';
import Box from '@mui/material/Box';
import { Paper, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';

const Div = styled('div')(({ theme }) => ({
    ...theme.typography.button,
    padding: theme.spacing(1),
}));

export const Transactions = () => {
    const [value, setValue] = React.useState(0);
    const [accountBalance, setAccountBalance] = React.useState(100);
    const [credit, setCredit] = React.useState(100);
    const [debit, setDebit] = React.useState(100);
    const ref = React.useRef<HTMLDivElement>(null);

    const [transactions, setTransactions] = React.useState([
        { category: 'Entertainment', date: '2023-01-01', time: '12:00 AM', subCategory: 'Movies', amount: 300, payee: 'IMax', paymentMethod: 'Cash', description: 'Payment Done', closingBalance: 300, status: 'cleared', type: 'CREDIT'  },
        { category: 'Entertainment', date: '2023-01-01',  time: '10:00 AM', subCategory: 'Food', amount: 600, payee: 'Refuel', paymentMethod: 'Cash', description: '', closingBalance: 400 , status: 'uncleared',  type: 'DEBIT' },
        { category: 'Entertainment', date: '2023-01-01', time: '12:00 AM', subCategory: 'Movies', amount: 300, payee: 'IMax', paymentMethod: 'Cash', description: 'Payment Done', closingBalance: 300, status: 'cleared', type: 'CREDIT'  },
        { category: 'Entertainment', date: '2023-01-01',  time: '10:00 AM', subCategory: 'Food', amount: 600, payee: 'Refuel', paymentMethod: 'Cash', description: '', closingBalance: 400 , status: 'uncleared',  type: 'DEBIT' },
        { category: 'Entertainment', date: '2023-01-01', time: '12:00 AM', subCategory: 'Movies', amount: 300, payee: 'IMax', paymentMethod: 'Cash', description: 'Payment Done', closingBalance: 300, status: 'cleared', type: 'CREDIT'  },
        { category: 'Entertainment', date: '2023-01-01',  time: '10:00 AM', subCategory: 'Food', amount: 600, payee: 'Refuel', paymentMethod: 'Cash', description: '', closingBalance: 400 , status: 'uncleared',  type: 'DEBIT' },
    
    ]);

    
    return (
        <Box sx={{ pb: 7 }} ref={ref}>
            {transactions.map(item => ( 
                <Paper style={{ marginRight: 6, marginLeft: 6, padding: 8, marginBottom: 8, borderRadius: 20 }} elevation={3}>
                    <div>
                        <Typography style={{ color: 'GrayText' }}>{item.date} {item.time}</Typography>
                        <div style={{display: 'flex', justifyContent: 'space-between'}}> 
                            <Typography>{item.payee}</Typography>
                            <Typography color={item.type === 'CREDIT' ? 'green': 'red'} fontWeight={900}>₹{item.amount}</Typography>
                        </div>

                        <div style={{display: 'flex', justifyContent: 'space-between'}}> 
                            <Typography>{item.category} : {item.subCategory}</Typography>
                            <Typography fontWeight={200}>{item.paymentMethod} - {item.status}</Typography>
                        </div>
                        
                        <div style={{display: 'flex', justifyContent: 'space-between'}}> 
                            <Typography fontWeight={100} fontSize={14}>{item.description}</Typography>
                            <Typography fontWeight={800}>{item.closingBalance}</Typography>
                        </div>
                    </div>
                </Paper>
      
            ))}
        </Box>
    )
}