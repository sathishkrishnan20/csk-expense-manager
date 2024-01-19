import { Button } from "@mui/material"
import { useContext, useEffect } from "react";
import { AuthContext } from "../../context/AuthContext";
import { useGoogleLogin } from "@react-oauth/google";
import { SCOPES } from "../../config";
import { LOCAL_SESSION_KEYS, getItem } from "../../context/storage";

export const Login =  () => {
    //@ts-ignore
    const { login } = useContext(AuthContext);
    useEffect(() => {
          const expiryTime = Number(getItem(LOCAL_SESSION_KEYS.TOKEN_EXPIRY_TIME)) 
          if (new Date().getTime() <= expiryTime) {
            const accessToken = getItem(LOCAL_SESSION_KEYS.ACCESS_TOKEN)
            login({
                access_token: accessToken,
                expiry_time: expiryTime
            })
          }
    }, [])
    const onSubmit = useGoogleLogin({
        onSuccess: codeResponse => {
            const expiryTime = new Date();
            expiryTime.setSeconds(expiryTime.getSeconds() + codeResponse.expires_in - 99);
            login({
                access_token: codeResponse.access_token,
                expiry_time: expiryTime.getTime()
            })
        },
        flow: 'implicit',
        scope: SCOPES
      });
    
    return (
        <Button title="Login" onClick={() => onSubmit()}> Login </Button>
    )
}