import * as React from 'react';
import Box from '@mui/material/Box';
import { AppBar, Button, FormControl, FormControlLabel, FormLabel, IconButton, InputLabel, Menu, MenuItem, Paper, Radio, RadioGroup, Select, TextField, Toolbar, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import { useLocation, useNavigate, useNavigation, useParams } from 'react-router-dom';
import BackIcon from '@mui/icons-material/ArrowBack';
import { AppHeader } from '../../components/AppBar';
const Div = styled('div')(({ theme }) => ({
    ...theme.typography.button,
    padding: theme.spacing(1),
}));


export const AddTransaction = () => {
    const {state: { type }} = useLocation()
    const navigate = useNavigate()
    console.log(type)
    const [transactionType, setTransactionType] = React.useState(type) 
    const [category, setCategory] = React.useState('') 
    const [subCategory, setSubCategory] = React.useState('') 
    const [paymentMethod, setPaymentMethod] = React.useState('') 
    const ref = React.useRef<HTMLDivElement>(null);
    return (
        <Box sx={{ pb: 7 }} ref={ref}>
            <AppHeader title='Add Transactions' onClickBack={() => navigate(-1) }/>
            <Paper style={{  padding: 8, display: 'flex', flexDirection: 'column', gap: 12}}> 
                
                <FormControl>
                    <RadioGroup
                        row
                        aria-labelledby="demo-row-radio-buttons-group-label"
                        name="row-radio-buttons-group"
                    >
                        <FormControlLabel onChange={() => setTransactionType('DEBIT') } value="DEBIT" control={<Radio checked={transactionType === 'DEBIT' ? true : false} />} label="Expense" />
                        <FormControlLabel onChange={() => setTransactionType('CREDIT') }  value="CREDIT" control={<Radio checked={transactionType === 'CREDIT' ? true : false}/>} label="Credit" />
                    </RadioGroup>
                </FormControl>
                
                <FormControl>
                    <InputLabel id="category-label">Category</InputLabel>
                    <Select
                        labelId="category-select-label"
                        id="category-select"
                        value={category}
                        label="Category"
                        onChange={(e) => setCategory(e.target.value)}
                    >
                        <MenuItem value={10}>Ten</MenuItem>
                        <MenuItem value={20}>Twenty</MenuItem>
                        <MenuItem value={30}>Thirty</MenuItem>
                    </Select>
                </FormControl>

                <FormControl>
                    <InputLabel id="sub-category-label">Sub Category</InputLabel>
                    <Select
                        labelId="sub-category-select-label"
                        id="sub-category"
                        value={subCategory}
                        label="Sub Category"
                        onChange={(e) => setSubCategory(e.target.value)}
                    >
                        <MenuItem value={10}>Ten</MenuItem>
                        <MenuItem value={20}>Twenty</MenuItem>
                        <MenuItem value={30}>Thirty</MenuItem>
                    </Select>
                </FormControl>

                <FormControl>
                    <TextField type='number' id="outlined-basic" label="Amount" variant="outlined" />
                </FormControl>
                <FormControl>
                    <TextField id="outlined-basic" label="Payeee" variant="outlined" />
                </FormControl>

                <FormControl>
                    <InputLabel id="paymentmethod-label">Payment Method</InputLabel>
                    <Select
                        labelId="paymentmethod-select-label"
                        id="paymentmethod"
                        value={paymentMethod}
                        label="Payment Method"
                        onChange={(e) => setPaymentMethod(e.target.value)}
                    >
                        <MenuItem value={10}>Ten</MenuItem>
                        <MenuItem value={20}>Twenty</MenuItem>
                        <MenuItem value={30}>Thirty</MenuItem>
                    </Select>
                </FormControl>
                <FormControl>
                    <TextField id="outlined-basic" label="Description" variant="outlined" />
                </FormControl>
                

            </Paper>

        </Box>
    )
}