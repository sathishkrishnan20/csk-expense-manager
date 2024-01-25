

import { Box, Paper } from '@mui/material';
import { AppHeader } from '../../components/AppBar';
import React from 'react';
import { useNavigate } from 'react-router-dom';

interface TransactionsProps {
    shopAppHeader: boolean;
}
export const PrivacyPolicy =  ({shopAppHeader}: TransactionsProps) => {
    const ref = React.useRef<HTMLDivElement>(null);
    const navigate = useNavigate()
return (
    <Box  sx={{ pb: 7 }} ref={ref}>
    {shopAppHeader ? <AppHeader title='Privacy policy' onClickBack={() => navigate(-1)} /> : null } 
    <Paper style={{ padding: 16,  }} elevation={0}>
    
    <h1>Privacy Policy for Expense Manager</h1>

        <p><strong>Last updated: 25-Jan-2024</strong></p>

<p>We operates the Expense Manager Web App. This page informs you of our policies regarding the collection, use, and disclosure of personal data when you use our App and the choices you have associated with that data.</p>

<h2>1. Data Storage</h2>

<p>The Expense Manager App uses Google Sheets as the primary storage mechanism for your expense data. By using the App, you acknowledge and agree that your data will be stored on your Google Sheets.</p>

<h2>2. Use of Google's Basic Personal Identifier</h2>

<p>The App uses Google's Basic Personal Identifier, including the user's name and profile picture. This information is used solely for the purpose of personalization within the App and is not shared with any third parties.</p>

<h2>3. Usage Data</h2>

<p>We do not track any usage data while you use our Expense Manager. We respect your privacy and do not collect information about the pages you visit, the time and date of your visits, or any other usage-related data.</p>

<h2>Data Security</h2>

<p>The security of your data is important to us. While we use Google Sheets for data storage, we do not have direct access to your Google account credentials. The access is limited to the necessary information required for the proper functioning of the Expense Manager App.</p>

<h2>User Consent</h2>

<p>By using our Expense Manager App, you consent to the collection and use of information as outlined in this privacy policy.</p>

<h2>Changes to This Privacy Policy</h2>

<p>We may update our privacy policy from time to time. We will notify you of any changes by posting the new privacy policy on this page.</p>

<h2>Contact Us</h2>

<p>If you have any questions or suggestions about our privacy policy, do not hesitate to contact us at sathishkrish20@gmail.com.</p>


</Paper>
</Box>
)
}