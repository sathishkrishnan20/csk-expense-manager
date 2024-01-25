import { Box, Button, Paper, Typography } from "@mui/material"
import React, { useContext, useEffect } from "react";
import { AuthContext } from "../../context/AuthContext";
import { GoogleLogin, TokenResponse, useGoogleLogin, useGoogleOneTapLogin } from "@react-oauth/google";
import { DEMO_EXPENSE_MANAGER_SHEET_ID, EXPENSE_MANAGER_IMAGE_URL, SCOPES } from "../../config";
import { LOCAL_SESSION_KEYS, getItem, setItem } from "../../context/storage";
import GoolgeIcon from '@mui/icons-material/Google';
import axios from "axios";
import { getOrSearchExpenseManagerFile } from "../../services/gdrive";
import './style.css'

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
    useGoogleOneTapLogin({
        auto_select: true,
        onSuccess: async (_credentialResponse) => {
          onSubmit()
        },
        onError: () => {
          console.log('Login Failed');
        }
    });
    const onSubmit = useGoogleLogin({
        onSuccess: async (codeResponse) => {
              await onSuccessOfGoogleLogin(codeResponse)  
        },
        flow: 'implicit',
        scope: SCOPES
      });

      const onSubmitDemo = () => {
        setItem(LOCAL_SESSION_KEYS.SHEET_ID, DEMO_EXPENSE_MANAGER_SHEET_ID);
        setUser({
            id: '',
            name: 'Demo',
            picture: EXPENSE_MANAGER_IMAGE_URL
        })

        const time  = new Date()
        time.setMinutes(time.getMinutes() + 15);
        
        login({
            access_token: '',
            expiry_time: time.getTime()
        })
      }

    const onSuccessOfGoogleLogin = async (codeResponse: Omit<TokenResponse, "error" | "error_description" | "error_uri">) => {
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
    }
    const getExpenseManagerFile = async () => {
        await getOrSearchExpenseManagerFile()
    }
    return (
        <Box sx={{ pb: 7 }} ref={ref}>
            <Paper className="login-container" style={{ height: windowSize.current[1] }} elevation={3}>
            <img
                src={EXPENSE_MANAGER_IMAGE_URL}
                alt={'Expense Manager'}
                loading="lazy"
                style={{ maxHeight:  windowSize.current[1]  }}
            />
            <Typography className="login-text-header" variant={'h5'}>Gain Total Control of your Money</Typography>
            <div className="login-text-sub-header" style={{ color: 'GrayText',  }}>Become your own money manager and make every cent count</div>
            
            <Button startIcon={<GoolgeIcon />} style={{ marginTop: 20, marginBottom: 20}}  variant="contained"  title="Login" onClick={() => onSubmit()}> Login </Button>
            <Button style={{  marginBottom: 20}}  variant="contained"  title="Login" onClick={() => onSubmitDemo()}> Demo </Button>
            
            </Paper> 
        </Box>
    )
}