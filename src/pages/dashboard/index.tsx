import * as React from 'react';
import Box from '@mui/material/Box';
import BottomNavigation from '@mui/material/BottomNavigation';
import BottomNavigationAction from '@mui/material/BottomNavigationAction';
import HomeIcon from '@mui/icons-material/Home';
import TransactionIcon from '@mui/icons-material/DynamicForm';
import BudgetIcon from '@mui/icons-material/PieChart'
import ProfileIcon from '@mui/icons-material/AccountCircle';

import ExpenseIcon from '@mui/icons-material/CreditCardOffOutlined'
import CreditIcon from '@mui/icons-material/AddCardOutlined';

import NotificationIcon from '@mui/icons-material/NotificationsActive';
import { Avatar, Badge, Chip, CssBaseline, Paper, SpeedDial, SpeedDialAction, SpeedDialIcon, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import { Transactions } from '../transactions';
import { useNavigate } from 'react-router-dom';
import {  useGoogleLogin } from '@react-oauth/google';
import { SCOPES } from '../../config';
import { LOCAL_SESSION_KEYS, getItem } from '../../context/storage';
const Div = styled('div')(({ theme }) => ({
    ...theme.typography.button,
    padding: theme.spacing(1),
}));

export const DashBoard = () => {
    const [value, setValue] = React.useState(0);
    const [loginLoader, setLoginLoader] = React.useState(true);
    const navigate = useNavigate();
    const [accountBalance, setAccountBalance] = React.useState(100);
    const [credit, setCredit] = React.useState(100);
    const [debit, setDebit] = React.useState(100);
    const ref = React.useRef<HTMLDivElement>(null);
    React.useEffect(() => {
        loadRecentTransactionsData()
    })

    const actions = [
        { icon: <ExpenseIcon style={{color: 'white'}} />, name: 'Debit', fabBackgrundColor: 'red' },
        { icon: <CreditIcon  style={{color: 'white'}} />, name: 'Credit', fabBackgrundColor: 'green' }
    ];

    const loadRecentTransactionsData = () => {
        const access_token = getItem(LOCAL_SESSION_KEYS.ACCESS_TOKEN)
        fetch(`https://sheets.googleapis.com/v4/spreadsheets/${'1Nx_M4TQWgrY6Pp9bC48eBnfUA6fU-iaZjHncU5ZD20o'}`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                //update this token with yours. 
                Authorization: `Bearer ${access_token}`,
             },
        }).then(e => console.log(e))
      };
    return (
       <Box sx={{ pb: 7 }} ref={ref}>
            <CssBaseline />
           
            <Paper style={{ padding: 16, backgroundColor: '#FFF6E5' }} elevation={3}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginLeft: 20, marginRight: 20 }}> 
                    <Avatar alt="Sathish Krishnan" src="/static/images/1.jpg" />
                    <Div style={{ }}>{'January'}</Div>
                    <div onClick={() => {}}>
                    <Badge style={{marginTop: 8}} badgeContent={4} color="primary">
                        <NotificationIcon style={{}} color='inherit' />
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
                    <div  onClick={()=> navigate('/transactions')}> 
                        <Chip style={{ color: '#7F3DFF', backgroundColor: '#EEE5FF'}}  label="See All" />
                    </div>
                </div>
                <Transactions shopAppHeader={false} />
            </Paper>
     
            <Paper sx={{ position: 'fixed', bottom: 0, left: 0, right: 0 }} elevation={5}>
                <BottomNavigation
                  showLabels
                  onChange={(event, newValue) => {
                    setValue(newValue);
                  }}
                  value={value}>
                    <BottomNavigationAction label="Home" icon={<HomeIcon />} />
                    <BottomNavigationAction onClick={()=> navigate('/transactions')} label="Transactions" icon={<TransactionIcon />} />
                    <SpeedDial
                        ariaLabel="Add"
                        sx={{ marginTop: -100 }}
                        FabProps={{ style: { 
                            marginBottom: 20, 
                            backgroundColor: '#7F3DFF',
                            width: 60,
                            height: 60, 
                            borderRadius: 100, 
                        }}}
                        icon={<SpeedDialIcon style={{color: '#FFF', backgroundColor: '#7F3DFF'}} />}>
                        {actions.map((action) => (
                          <SpeedDialAction
                            FabProps={{ style: { backgroundColor: action.fabBackgrundColor}}}
                            key={action.name}
                            icon={action.icon}
                            onClick={() => navigate('/add', { state: { type: action.name.toUpperCase() }})}
                            tooltipTitle={action.name}
                          />
                        ))}
                    </SpeedDial>
                    <BottomNavigationAction label="Budget" icon={<BudgetIcon />} />
                    <BottomNavigationAction label="Profile" icon={<ProfileIcon />} />
                </BottomNavigation>
            </Paper>
        </Box>
    )
}