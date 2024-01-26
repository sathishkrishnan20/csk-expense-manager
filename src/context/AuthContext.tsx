import React from 'react';
import { useSetState } from 'react-use';
import { LOCAL_SESSION_KEYS, getItem, removeItem, setItem } from './storage';
import { useNavigate } from 'react-router-dom';

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
  access_token: string | null;
  expiry_time: number;
}

interface IAuthContext {
  state: AuthContextState
  login: (loginResponse: LoginProps) => void; 
  logout: () => void;
  setUser: (userInfo: UserInfo) => void;
  loginIfSessionIsActive: () => void;
}
// @ts-ignore
export const AuthContext = React.createContext<IAuthContext>({});



export const ContextProvider = (props: React.PropsWithChildren) => {
  const [state, setState] = useSetState<AuthContextState>(initialState);
  const navigate = useNavigate()
  const setLoginPending = (isLoginPending: boolean) => setState({isLoginPending});
  const setLoginSuccess = (isLoggedIn: boolean) => setState({isLoggedIn});
  const setLoginError = (loginError: string) => setState({loginError});

  const setUserInfo = (userInfo: UserInfo) => setState({userInfo});
  
  const loginIfSessionIsActive = () => {
    const expiryTime = Number(getItem(LOCAL_SESSION_KEYS.TOKEN_EXPIRY_TIME)) 
          if (new Date().getTime() <= expiryTime) {
            const accessToken = getItem(LOCAL_SESSION_KEYS.ACCESS_TOKEN)
            const sheetId = getItem(LOCAL_SESSION_KEYS.SHEET_ID);
            if (sheetId) {
              setItem(LOCAL_SESSION_KEYS.SHEET_ID, sheetId)
              login({
                access_token: accessToken,
                expiry_time: expiryTime
              })
            }
          }
  }  

  const login = async (loginResponse: LoginProps) => {
    setLoginPending(true);
    setLoginSuccess(false);
    setLoginError('');
    
    try {
      
      setLoginSuccess(true); 
      setItem(LOCAL_SESSION_KEYS.ACCESS_TOKEN, loginResponse.access_token as string)
      setItem(LOCAL_SESSION_KEYS.TOKEN_EXPIRY_TIME, loginResponse.expiry_time.toString())
      const userInfo = getItem(LOCAL_SESSION_KEYS.USER_INFO)
      if (userInfo) {
        setUserInfo(JSON.parse(userInfo))
      }
      navigate('/')
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
    navigate('/login')
    
  }

  return (
    <AuthContext.Provider
      value={{
        loginIfSessionIsActive,
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
