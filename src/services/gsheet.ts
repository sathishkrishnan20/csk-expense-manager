import axios from "axios";
import { LOCAL_SESSION_KEYS, getItem } from "../context/storage";

    export const instance = axios.create({
        baseURL: 'https://sheets.googleapis.com/v4/spreadsheets'
    });
    instance.interceptors.request.use(function (config) {
        const access_token = getItem(LOCAL_SESSION_KEYS.ACCESS_TOKEN);
        config.headers['Authorization'] = `Bearer ${access_token}`;
        // Do something before request is sent
        return config;
    }, function (error) {
        // Do something with request error
        return Promise.reject(error);
    });
    
    
    