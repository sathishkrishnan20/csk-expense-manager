

import NotificationIcon from '@mui/icons-material/PowerSettingsNew';
import { Avatar, Badge, Box, Paper } from '@mui/material';
import { styled } from '@mui/material/styles';
import { AppHeader } from '../../components/AppBar';
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { LOCAL_SESSION_KEYS, getItem } from '../../context/storage';
const Div = styled('div')(({ theme }) => ({
    ...theme.typography.button,
    padding: theme.spacing(1),
}));

interface TransactionsProps {
    shopAppHeader: boolean;
}
export const Profile =  ({shopAppHeader}: TransactionsProps) => {
    // @ts-ignore
    const { logout, state } = React.useContext(AuthContext);
    const ref = React.useRef<HTMLDivElement>(null);
    const navigate = useNavigate()
return (
    <Box  sx={{ pb: 7 }} ref={ref}>
    {shopAppHeader ? <AppHeader title='Profile' onClickBack={() => navigate(-1)} rightButtonAsIconComponent={<div onClick={() => logout()}> <NotificationIcon  style={{ fontSize: 30}}/> </div>} /> : null } 
        
    <Paper style={{ padding: 16,  }} elevation={0}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginLeft: 20, marginRight: 20, }}> 
        <div></div>
        <img
            src={state?.userInfo?.picture}
            alt={state?.userInfo?.name}
            loading="lazy"
        />
        <div></div>
     
        </div>
  
    <div style={{ display: 'flex', justifyContent: 'space-between', marginLeft: 20, marginRight: 20 }}> 
        <div></div>
        <Div style={{ color: 'GrayText' }}>{state?.userInfo?.name}</Div>
        <div></div>
    </div>
    {/* <div style={{ display: 'flex', justifyContent: 'space-between',  marginLeft: 20, marginRight: 20 }}> 
        <div>DB Link</div>
        <div> <a target='_blank' href={`https://docs.google.com/spreadsheets/d/${getItem(LOCAL_SESSION_KEYS.SHEET_ID)}/edit#gid=0`} rel="noreferrer"> Link</a></div>    
    </div> */}
</Paper>
</Box>
)
}