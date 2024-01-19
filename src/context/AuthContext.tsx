import React from 'react';
import { useSetState } from 'react-use';
import { LOCAL_SESSION_KEYS, removeItem, setItem } from './storage';
import { SHEET_ID } from '../config';


export interface AuthContextState {
  isLoggedIn: boolean;
  isLoginPending: boolean;
  loginError: string | null;
}

const initialState: AuthContextState = {
  isLoggedIn: false,
  isLoginPending: false,
  loginError: ''
}

interface LoginProps {
  access_token: string,
  expiry_time: number;
}

export const AuthContext = React.createContext(initialState);




export const ContextProvider = (props: React.PropsWithChildren) => {
  const [state, setState] = useSetState(initialState);

  const setLoginPending = (isLoginPending: boolean) => setState({isLoginPending});
  const setLoginSuccess = (isLoggedIn: boolean) => setState({isLoggedIn});
  const setLoginError = (loginError: string) => setState({loginError});

  const login = async (loginResponse: LoginProps) => {
    setLoginPending(true);
    setLoginSuccess(false);
    setLoginError('');
    
    try {
      setLoginSuccess(true); 
      setItem(LOCAL_SESSION_KEYS.ACCESS_TOKEN, loginResponse.access_token)
      setItem(LOCAL_SESSION_KEYS.TOKEN_EXPIRY_TIME, loginResponse.expiry_time.toString())
      setItem(LOCAL_SESSION_KEYS.SHEET_ID, SHEET_ID)
    } catch (error) {
      setLoginError('error');
    } finally {
      setLoginPending(false);
    }  
  }

  const logout = () => {
    removeItem(LOCAL_SESSION_KEYS.ACCESS_TOKEN)
    removeItem(LOCAL_SESSION_KEYS.TOKEN_EXPIRY_TIME)
    setLoginPending(false);
    setLoginSuccess(false);
    setLoginError('');
    
  }

  return (
    <AuthContext.Provider
      // @ts-ignore
      value={{
        // @ts-ignore
        state,
        login,
        logout,
      }}
    >
      {props.children}
    </AuthContext.Provider>
  );
};
