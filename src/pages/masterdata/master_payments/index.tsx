import { useState } from 'react';
import {
  CategorySubCategoryGroupedWithInternalState,
  CategorySubCategorySchema,
  PaymentMethodsSchema,
} from '../../../interface/expenses';
import {
    Backdrop,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  List,
  ListItemButton,
  ListItemText,
} from '@mui/material';

import EditIcon from '@mui/icons-material/Edit';
import PlusIcon from '@mui/icons-material/Add';
import { useAppContext } from '../../../context/AppContext';

interface MasterCategoryAndSubCategoryProps {
    paymentsData: PaymentMethodsSchema[];
  onSuccessOfSubCategoryAdd: () => void;
  onHandleEditMode: (isEditMode: boolean) => void;
}

export const MasterPayments = ({ paymentsData, onSuccessOfSubCategoryAdd, onHandleEditMode }: MasterCategoryAndSubCategoryProps) => {
    const { masterDataState, masterDataDispatch } = useAppContext();
    const [expanded, setExpanded] = useState('');
    const [categoryEditMode, setCategoryEditMode] = useState(false);
    const [categoryEditItems, setCategoryEditItems] = useState<CategorySubCategoryGroupedWithInternalState>({
      categoryName: '',
      subCategories: [],
    });

    const [deleteConfirmationDialogOpen, setDeleteConfirmationDialogOpen] = useState(false);
    const [subCategoriesToBeDeleted, setSubCategoriesToBeDeleted] = useState<CategorySubCategorySchema[]>([]);
    const [newPaymentAddedCount, setNewPaymentAddedCount] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [addingNewCategory, setAddingNewCategory] = useState(false);
    const enableEditMode = (
        x: React.MouseEvent<HTMLDivElement, MouseEvent>,
        categorySubCategoryGroped: PaymentMethodsSchema,
      ) => {
        x.stopPropagation();
        setCategoryEditMode(!categoryEditMode);
        
    };

    const handleAddNewCategory = () => {
        setAddingNewCategory(true)
        setCategoryEditMode(true)
        setCategoryEditItems({ categoryName: '', isEdited: true, subCategories: [{ subCategory: '', RowId: '', Status: 'ACTIVE', isEdited: true }] })
    }
    return (
      <div>
        <List sx={{ width: '100%' }} component="nav" aria-labelledby="nested-list-subheader">
          <div style={{ marginTop: -30 }}> </div>
         
            <div>
              {paymentsData.map((e) => {
                return (
                  <div key={e.RowId}>
                    <ListItemButton onClick={() => {}}>
                      <ListItemText primary={e.PaymentMethodName} />
                      {/* <div onClick={(x) => enableEditMode(x, e)}>
                        <EditIcon />
                      </div> */}
                    </ListItemButton>

                   
                  </div>
                );
              })}
                {/* <div className='flex justify-end'> 
                    <Button startIcon={ <PlusIcon /> } onClick={() => handleAddNewCategory()} variant="contained" className='justify-end'>Add New Category</Button>
                </div> */}
            </div>
          
        </List>
       
        <Backdrop
            sx={{ color: '#fff', zIndex: (theme) => theme.zIndex.drawer + 1 }}
            open={isLoading}>
            <CircularProgress color="inherit" />
        </Backdrop>
        <Dialog
            open={deleteConfirmationDialogOpen}
            onClose={() => setDeleteConfirmationDialogOpen(false)}
            aria-labelledby="alert-dialog-title"
            aria-describedby="alert-dialog-description"
        >
        <DialogTitle id="alert-dialog-title">{'Are you sure want to delete?'}</DialogTitle>
        <DialogContent>
          <DialogContentText id="alert-dialog-description">
              Deleting this would delete the Payment Method.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmationDialogOpen(false)}>Cancel</Button>
          <Button color="error" onClick={() => {}} autoFocus>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
      </div>
    );
  }

