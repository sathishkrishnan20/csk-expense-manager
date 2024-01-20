import { Box, Button, Paper, Typography } from "@mui/material"
import React, { useContext, useEffect } from "react";
import { AuthContext } from "../../context/AuthContext";
import { useGoogleLogin } from "@react-oauth/google";
import { SCOPES } from "../../config";
import { LOCAL_SESSION_KEYS, getItem, setItem } from "../../context/storage";
import GoolgeIcon from '@mui/icons-material/Google';
import axios from "axios";
import { getOrSearchExpenseManagerFile } from "../../services/gdrive";


export const Login =  () => {
    const ref = React.useRef<HTMLDivElement>(null);
    const windowSize = React.useRef([window.innerWidth, window.innerHeight]);
    //@ts-ignore
    const { login, setUser } = useContext(AuthContext);
    useEffect(() => {
          const expiryTime = Number(getItem(LOCAL_SESSION_KEYS.TOKEN_EXPIRY_TIME)) 
          if (new Date().getTime() <= expiryTime) {
            const accessToken = getItem(LOCAL_SESSION_KEYS.ACCESS_TOKEN)
            const sheetId = getItem(LOCAL_SESSION_KEYS.SHEET_ID);
            if(sheetId)
            setItem(LOCAL_SESSION_KEYS.SHEET_ID, sheetId)
            login({
                access_token: accessToken,
                expiry_time: expiryTime
            })
          }
    }, [])
    const onSubmit = useGoogleLogin({
        onSuccess: async (codeResponse) => {
            const expiryTime = new Date();
            expiryTime.setSeconds(expiryTime.getSeconds() + codeResponse.expires_in - 99);
            const { data } = await axios.get(`https://www.googleapis.com/oauth2/v1/userinfo?alt=json&access_token=${codeResponse.access_token}`)
            setItem(LOCAL_SESSION_KEYS.ACCESS_TOKEN, codeResponse.access_token)
            await getExpenseManagerFile()
            setUser({
                id: data.id,
                name: data.name,
                picture: data.picture
            })
            login({
                access_token: codeResponse.access_token,
                expiry_time: expiryTime.getTime()
            })
        },
        flow: 'implicit',
        scope: SCOPES
      });
    const getExpenseManagerFile = async () => {
        await getOrSearchExpenseManagerFile()
    }
    return (
        <Box sx={{ pb: 7 }} ref={ref}>
            <Paper style={{ display: 'flex', flexDirection: 'column', padding: 16, backgroundColor: '#F5F5F5', height: windowSize.current[1] }} elevation={3}>
            <img
                src={`https://png.pngtree.com/png-vector/20190306/ourlarge/pngtree-dollar-money-in-hand-png-image_771024.jpg`}
                alt={'Expense Manager'}
                loading="lazy"
                style={{ maxHeight:  windowSize.current[1]  }}
            />
            
            <Typography style={{textAlign: 'center', fontWeight: 500, marginTop: 20, marginBottom: 10}} variant={'h5'}>Gain Total Control of your Money</Typography>
            <div style={{ display: 'block', textAlign: 'center', color: 'GrayText',  }}>Become your own money manager and make every cent count</div>
            
            <Button startIcon={<GoolgeIcon />} style={{ marginTop: 20, marginBottom: 20}}  variant="contained"  title="Login" onClick={() => onSubmit()}> Login </Button>
            
            </Paper> 
        </Box>
    )
}