import axios from 'axios';
import { LOCAL_SESSION_KEYS, getItem, setItem } from '../context/storage';
import { EXPENSE_MANAGER_G_SHEET_NAME } from './constants';
import { addSheetHeaderContents } from './gsheet';

const instance = axios.create({
  baseURL: 'https://www.googleapis.com/drive/v3',
});
instance.interceptors.request.use(
  function (config) {
    const access_token = getItem(LOCAL_SESSION_KEYS.ACCESS_TOKEN);
    config.headers['Authorization'] = `Bearer ${access_token}`;
    return config;
  },
  function (error) {
    return Promise.reject(error);
  },
);

instance.interceptors.response.use(
  function (response) {
    return response;
  },
  function (error) {
    return Promise.reject(error);
  },
);

export const getOrSearchExpenseManagerFile = async () => {
  const { data } = await instance.get(`/files?q=name = '${EXPENSE_MANAGER_G_SHEET_NAME}'`);
  if (data?.files?.[0]?.id) {
    setItem(LOCAL_SESSION_KEYS.SHEET_ID, data.files[0].id);
  } else {
    const fileMetadata = {
      name: EXPENSE_MANAGER_G_SHEET_NAME,
      mimeType: 'application/vnd.google-apps.spreadsheet',
    };
    const { data } = await instance.post(`/files`, {
      ...fileMetadata,
      fields: 'id',
    });
    setItem(LOCAL_SESSION_KEYS.SHEET_ID, data.id);
    await addSheetHeaderContents();
  }
};
