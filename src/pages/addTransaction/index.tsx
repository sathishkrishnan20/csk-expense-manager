import * as React from 'react';
import Box from '@mui/material/Box';
import { Button, FormControl, FormControlLabel,  InputLabel, MenuItem, Paper, Radio, RadioGroup, Select, Snackbar, TextField } from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import { AppHeader } from '../../components/AppBar';
import { addTransaction, getMasterData, updateTransaction } from '../../services/gsheet';
import { CategorySubCategoryGrouped, ExpenseSchema, PaymentMethodsSchema, SubCategorySchema } from '../../interface/expenses';
import { INCOME_CATEGORY_NAMES } from '../../config';
import { DatePicker } from '@mui/x-date-pickers';
import dayjs, { Dayjs } from 'dayjs';

export const AddTransaction = () => {
    const {state: { type, action, expenseData }} = useLocation()
    const navigate = useNavigate()
    const [transactionType, setTransactionType] = React.useState(type) 
    const [originalMasterCategorySubCategory, setOriginalMasterCategorySubCategory] = React.useState<CategorySubCategoryGrouped[]>([])
    
    const [masterCategorySubCategory, setMasterCategorySubCategory] = React.useState<CategorySubCategoryGrouped[]>([])
    const [masterPaymentMethods, setMasterPaymentMethods] = React.useState<PaymentMethodsSchema[]>([])
    const [masterSubCategory, setMasterSubCategory] = React.useState<SubCategorySchema[]>([])
    
    const [category, setCategory] = React.useState('') 
    const [subCategory, setSubCategory] = React.useState('') 
    const [paymentMethod, setPaymentMethod] = React.useState('') 
    const [transactionDate, setTransactionDate] = React.useState(dayjs(new Date()))

    const [amountText, setAmountText] = React.useState('') 
    const [payeeText, setPayeeText] = React.useState('') 
    const [descriptionText, setDescriptionText] = React.useState('') 

    const [snackBarOpen, setSnackBarOpen] = React.useState(false) 
    const [snackBarMessage, setSnackBarMessage] = React.useState('') 
    const ref = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        loadMasterData()
    }, [])
    const loadMasterData = async () => {
       const {category, payments } = await getMasterData()
       setOriginalMasterCategorySubCategory(category)
       setMasterCategorySubCategory(category);
       setMasterPaymentMethods(payments);
       onChangeTransctionType(transactionType, category)
       loadDataIfActionIsEdit(category);
    }

    const loadDataIfActionIsEdit = (originalCategories: CategorySubCategoryGrouped[]) => {
        const expenseEditData = expenseData as ExpenseSchema
        if (action === 'EDIT') {
            setCategory(expenseEditData.Category)
            const subCategories = originalCategories.find(e => e.categoryName === expenseEditData.Category);
            setMasterSubCategory(subCategories?.subCategories || [])
            setSubCategory(expenseEditData.SubCategory)
            setAmountText(Math.abs(Number(expenseEditData.Amount)).toString())
            setPayeeText(expenseEditData.Payee)
            setPaymentMethod(expenseEditData.PaymentMethod)
            setDescriptionText(expenseEditData.Description)
        }  
    }
    const onChangeCategory = (categoryName: string) => {
        setCategory(categoryName)
        setSubCategory('')
        const subCategories = masterCategorySubCategory.find(e => e.categoryName === categoryName);
        setMasterSubCategory(subCategories?.subCategories || [])
    }

    const addOrUpdateNewTransactions = async () => {
        const object: Omit<ExpenseSchema, 'RowId' | 'OpeningBalance' | 'ClosingBalance' | 'Timestamp'> = {
            Category: category,
            SubCategory: subCategory,
            PaymentMethod: paymentMethod,
            Amount: transactionType === 'CREDIT' ? Number(amountText).toString() : (Number(amountText) * -1).toString(),
            Payee: payeeText,
            Description: descriptionText,
            Status: 'Cleared',
            TransactionDate: transactionDate.toISOString(),
        }
        if (action === 'EDIT') {
            await updateTransaction({
                ...object,
                RowId: expenseData.RowId,
            })
            setSnackBarMessage('Updated Successfully')
            navigate('/')
        } else {
            await addTransaction(object)
            setSnackBarMessage('Added Successfully')
        }
        setSnackBarOpen(true)
        setTimeout(() => {
            setSnackBarOpen(false)
        }, 1000)
        resetData()
        
    }
    const canBeAdd = !!category && !!subCategory && !!amountText && !!payeeText;
    const resetData = () => {
        setCategory('')
        setSubCategory('')
        setPaymentMethod('')
        setAmountText('')
        setPayeeText('')
        setDescriptionText('')

    }
    const onChangeTransctionType = (type: 'CREDIT' | 'DEBIT', originCategories: CategorySubCategoryGrouped[]) => {
        if (type === 'CREDIT') {
            const data = originCategories.filter(e =>  INCOME_CATEGORY_NAMES.includes(e.categoryName as string) === true)
            setMasterCategorySubCategory(data)
            if (data.length === 1) {
                setCategory(INCOME_CATEGORY_NAMES[0])
                setMasterSubCategory(data[0].subCategories || [])
            } else {
                setCategory('')
            }
            
        } else {
            const data = originCategories.filter(e => INCOME_CATEGORY_NAMES.includes(e.categoryName as string) === false)
            setCategory('')
            setMasterCategorySubCategory(data)
        }
        setSubCategory('')
        setTransactionType(type)
    }
    return (
        <Box sx={{ pb: 7 }} ref={ref}>
            {canBeAdd ? <AppHeader title='Add Transactions' onClickBack={() => navigate(-1) } onClickRightButton={() => addOrUpdateNewTransactions()} /> 
                : <AppHeader title='Add Transactions' onClickBack={() => navigate(-1) }/> 
            }
            <Snackbar
                style={{ marginBottom: 100}}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
                open={snackBarOpen}
                // onClose={handleClose}
                message={snackBarMessage || "Successfully Updated"}
                key={'top' + 'center'}
            />
            <Paper style={{  padding: 8, display: 'flex', flexDirection: 'column', gap: 12}}> 
                <FormControl>
                    <RadioGroup
                        row
                        aria-labelledby="demo-row-radio-buttons-group-label"
                        name="row-radio-buttons-group"
                    >
                        <FormControlLabel onChange={() => onChangeTransctionType('DEBIT', originalMasterCategorySubCategory) } value="DEBIT" control={<Radio checked={transactionType === 'DEBIT' ? true : false} />} label="Expense" />
                        <FormControlLabel onChange={() => onChangeTransctionType('CREDIT', originalMasterCategorySubCategory) }  value="CREDIT" control={<Radio checked={transactionType === 'CREDIT' ? true : false}/>} label="Credit" />
                    </RadioGroup>
                </FormControl>
                <FormControl>
                    <DatePicker
                        label="Date"
                        closeOnSelect
                        value={transactionDate}
                        onChange={(newValue) => setTransactionDate(newValue as Dayjs)} />
                </FormControl>
                <FormControl>
                    <TextField onChange={(text) => setAmountText(text.target.value)} value={amountText} type='number' id="outlined-basic" label="Amount" variant="outlined" />
                </FormControl>
                <FormControl>
                    <InputLabel id="category-label">Category</InputLabel>
                    <Select
                        disabled={masterCategorySubCategory.length === 1}
                        labelId="category-select-label"
                        id="category-select"
                        value={category}
                        label="Category"
                        onChange={(e) => onChangeCategory(e.target.value)}
                    >
                        {masterCategorySubCategory.map((item, index) => {
                            return <MenuItem key={'ca' + index} value={item.categoryName}>{item.categoryName}</MenuItem>
                        })}
                        
                        
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
                        {masterSubCategory.map((item, index) => {
                             return <MenuItem key={'sub' + index} value={item.subCategory}>{item.subCategory}</MenuItem>
                        })}
                    </Select>
                </FormControl>

               
                <FormControl>
                    <TextField onChange={(text) => setPayeeText(text.target.value)} value={payeeText}  id="outlined-basic" label={transactionType === 'CREDIT' ? 'Payer' : "Payee"} variant="outlined" />
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
                        {masterPaymentMethods.map((item, index) => {
                             return <MenuItem key={'pay' + index} value={item.PaymentMethodName}>{item.PaymentMethodName}</MenuItem>
                        })}
                        
                    </Select>
                </FormControl>
                <FormControl>
                    <TextField onChange={(text) => setDescriptionText(text.target.value)} value={descriptionText} id="outlined-basic" label="Description" variant="outlined" />
                </FormControl>
            </Paper>
            <Paper sx={{ position: 'fixed', bottom: 60, left: 0, right: 0 }} elevation={5}>
                <Button disabled={canBeAdd === false} onClick={() => addOrUpdateNewTransactions()} style={{width: '100%'}} variant="contained">{action === 'EDIT' ? 'Update' : 'Add'}</Button>
            </Paper>
        </Box>
    )
}