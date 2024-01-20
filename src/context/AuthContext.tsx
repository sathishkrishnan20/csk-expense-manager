import React from 'react';
import { useSetState } from 'react-use';
import { LOCAL_SESSION_KEYS, getItem, removeItem, setItem } from './storage';

interface UserInfo {
  id: string;
  name: string;
  picture: string;
}
export interface AuthContextState {
  isLoggedIn: boolean;
  isLoginPending: boolean;
  loginError: string | null;
  userInfo: UserInfo
}

const initialState: AuthContextState = {
  isLoggedIn: false,
  isLoginPending: false,
  loginError: '',
  userInfo: {
    id: '',
    name: '',
    picture: ''
  }
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

  const setUserInfo = (userInfo: UserInfo) => setState({userInfo});
  
  const login = async (loginResponse: LoginProps) => {
    setLoginPending(true);
    setLoginSuccess(false);
    setLoginError('');
    
    try {
      
      setLoginSuccess(true); 
      setItem(LOCAL_SESSION_KEYS.ACCESS_TOKEN, loginResponse.access_token)
      setItem(LOCAL_SESSION_KEYS.TOKEN_EXPIRY_TIME, loginResponse.expiry_time.toString())
      const userInfo = getItem(LOCAL_SESSION_KEYS.USER_INFO)
      if (userInfo) {
        setUserInfo(JSON.parse(userInfo))
      }
    } catch (error) {
      setLoginError('error');
    } finally {
      setLoginPending(false);
    }  
  }

  const setUser = (userInfo: UserInfo) => {
    setItem(LOCAL_SESSION_KEYS.USER_INFO, JSON.stringify(userInfo))
    setUserInfo(userInfo)
  }

  const logout = () => {
    // removeItem(LOCAL_SESSION_KEYS.ACCESS_TOKEN)
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
        setUser
      }}
    >
      {props.children}
    </AuthContext.Provider>
  );
};
