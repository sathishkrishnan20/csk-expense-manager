export enum LOCAL_SESSION_KEYS  {
    ACCESS_TOKEN = 'access_token',
    TOKEN_EXPIRY_TIME = 'token_expiry_time',
    SHEET_ID = 'sheet_id'
}
export const setItem = (key: LOCAL_SESSION_KEYS, value: string) => {
    sessionStorage.setItem(key, value);    
};
  
export const getItem = (key: string) => {
    const value = sessionStorage.getItem(key);
    return value;
};
  
  export const removeItem = (key: string) => {
    sessionStorage.removeItem(key);
   };
  