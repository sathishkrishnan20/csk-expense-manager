import { useNavigate } from 'react-router-dom';
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import {
  CategorySubCategoryGrouped,
  CategorySubCategoryGroupedWithInternalState,
  CategorySubCategorySchema,
} from '../../../interface/expenses';
import {
    Backdrop,
  Button,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  List,
  ListItemButton,
  ListItemText,
  TextField,
} from '@mui/material';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import RemoveIcon from '@mui/icons-material/HighlightOffRounded';

import EditIcon from '@mui/icons-material/Edit';
import PlusIcon from '@mui/icons-material/Add';
import { addNewSubCategory, updateCategorySubCategory } from '../../../services/gsheet';
import { useAppContext } from '../../../context/AppContext';
import { MasterActionKind } from '../../../reducers/category';

interface MasterCategoryAndSubCategoryProps {
  categoriesAndSubCategories: CategorySubCategoryGrouped[];
  onSuccessOfSubCategoryAdd: () => void;
  onHandleEditMode: (isEditMode: boolean) => void;
}

export const MasterCategoryAndSubCategory = forwardRef(
  (
    { categoriesAndSubCategories, onSuccessOfSubCategoryAdd, onHandleEditMode }: MasterCategoryAndSubCategoryProps,
    ref,
  ) => {
    const { masterDataState, masterDataDispatch } = useAppContext();
    const [expanded, setExpanded] = useState('');
    const [categoryEditMode, setCategoryEditMode] = useState(false);
    const [categoryEditItems, setCategoryEditItems] = useState<CategorySubCategoryGroupedWithInternalState>({
      categoryName: '',
      subCategories: [],
    });

    const [deleteConfirmationDialogOpen, setDeleteConfirmationDialogOpen] = useState(false);
    const [subCategoriesToBeDeleted, setSubCategoriesToBeDeleted] = useState<CategorySubCategorySchema[]>([]);
    const [newCategoryAddedCount, setNewCategoryAddedCount] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [addingNewCategory, setAddingNewCategory] = useState(false);
 
    useEffect(() => {
      if (newCategoryAddedCount !== 0) {
        onSuccessOfSubCategoryAdd();
      }
    }, [newCategoryAddedCount]);

    useEffect(() => {
      onHandleEditMode(categoryEditMode);
    }, [categoryEditMode]);

    useImperativeHandle(ref, () => ({
      alterEditMode() {
        disableEditMode();
      },
    }));

    const handleChange = (panel: string) => {
      if (panel === expanded) {
        setExpanded('');
      } else {
        setExpanded(panel);
      }
    };

    const disableEditMode = () => {
      setCategoryEditMode(false);
      setCategoryEditItems({ categoryName: '', subCategories: [] });
      setAddingNewCategory(false)
    };

    const enableEditMode = (
      x: React.MouseEvent<HTMLDivElement, MouseEvent>,
      categorySubCategoryGroped: CategorySubCategoryGrouped,
    ) => {
      x.stopPropagation();
      setCategoryEditMode(!categoryEditMode);
      setCategoryEditItems(categorySubCategoryGroped);
    };

    const handleDeleteOneSubCategory = (rowId: string, index: number) => {
      setCategoryEditItems({
        ...categoryEditItems,
        subCategories: categoryEditItems.subCategories.filter((subCategory, subIndex) => {
          if (subCategory.RowId === rowId && index === subIndex) {
            return false;
          }
          return true;
        }),
      });
      if (rowId) {
        const items = subCategoriesToBeDeleted;
        items.push({
          RowId: rowId,
          CategoryName: categoryEditItems.categoryName,
          SubCategoryName: categoryEditItems.subCategories[index].subCategory,
          Status: 'DELETED',
        });
        setSubCategoriesToBeDeleted(items);
      }
    };
    const handleAddOneSubCategory = () => {
      const items = categoryEditItems.subCategories;
      items.push({
        RowId: '',
        subCategory: '',
        Status: 'ACTIVE',
      });
      setCategoryEditItems({
        ...categoryEditItems,
        subCategories: items,
      });
    };

    const handleEditOneSubCategory = (rowId: string, index: number, value: string) => {
      setCategoryEditItems({
        ...categoryEditItems,
        subCategories: categoryEditItems.subCategories.map((subCategory, i) => {
          if (i === index) {
            subCategory.subCategory = value;
            subCategory.isEdited = true;
          }
          return subCategory;
        }),
      });
    };
    const handleSaveCategory = async (isDelete: boolean) => {
      setIsLoading(true)
      const subCategoriesToUpdate: CategorySubCategorySchema[] = [];
      const subCategoriesToAdd: CategorySubCategorySchema[] = [];

      for (const subCategory of categoryEditItems.subCategories) {
        if (isDelete === false && subCategory.Status === 'ACTIVE' && !subCategory.subCategory) {
          continue;
        } else {
          if (subCategory.RowId) {
            if (categoryEditItems.isEdited || subCategory.isEdited || isDelete) {
              subCategoriesToUpdate.push({
                RowId: subCategory.RowId,
                CategoryName: categoryEditItems.categoryName,
                SubCategoryName: subCategory.subCategory,
                Status: isDelete ? 'DELETED' : 'ACTIVE',
              });
            }
          } else {
            if (isDelete === false) {
                subCategoriesToAdd.push({
                    CategoryName: categoryEditItems.categoryName,
                    SubCategoryName: subCategory.subCategory,
                    Status: isDelete ? 'DELETED' : 'ACTIVE',
                });
            }
          }
        }
      }

      if (subCategoriesToAdd.length) {
        await addNewSubCategory(subCategoriesToAdd);
      }
      if (subCategoriesToUpdate.length + subCategoriesToBeDeleted.length) {
        await Promise.allSettled(
          subCategoriesToUpdate
            .concat(subCategoriesToBeDeleted)
            .map((subCategoryInfo) =>
              updateCategorySubCategory({ ...subCategoryInfo, CategoryName: categoryEditItems.categoryName }),
            ),
        );
      }
      masterDataDispatch &&
        masterDataDispatch({
          type: MasterActionKind.RESET_DATA,
        });
      resetData()
    };

    const resetData = () => {
        setSubCategoriesToBeDeleted([]);
        disableEditMode();
        setNewCategoryAddedCount(newCategoryAddedCount + 1);
        setIsLoading(false)
        
    }
    const handleAddNewCategory = () => {
        setAddingNewCategory(true)
        setCategoryEditMode(true)
        setCategoryEditItems({ categoryName: '', isEdited: true, subCategories: [{ subCategory: '', RowId: '', Status: 'ACTIVE', isEdited: true }] })
    }

    const handleDeleteEntireCategoryAndSubCategory = () => {
        handleSaveCategory(true)
        setDeleteConfirmationDialogOpen(false)
      };

    return (
      <div>
        <List sx={{ width: '100%' }} component="nav" aria-labelledby="nested-list-subheader">
          <div style={{ marginTop: -30 }}> </div>
          {categoryEditMode ? (
            <div>
              <div className="flex justify-end gap-2">
                <TextField
                  autoComplete="off"
                  onChange={(text) => {
                    setCategoryEditItems({
                      ...categoryEditItems,
                      isEdited: true,
                      categoryName: text.target.value,
                    });
                  }}
                  className="w-full"
                  id="outlined-basic"
                  value={categoryEditItems.categoryName}
                  label={'Category'}
                  variant="standard"
                />
                <Button onClick={() => handleAddOneSubCategory()} variant="contained">
                  Add
                </Button>
              </div>

              <div className="mt-2">
                {categoryEditItems.subCategories.map(({ subCategory, RowId }, index) => {
                  return (
                    <div className="ml-8 mt-4 flex gap-2">
                      <TextField
                        autoComplete="off"
                        onChange={(text) => handleEditOneSubCategory(RowId, index, text.target.value)}
                        id="outlined-basic"
                        value={subCategory}
                        label={'Sub Category ' + (index + 1)}
                        variant="outlined"
                        className="w-full"
                      />
                      <Button onClick={() => handleDeleteOneSubCategory(RowId, index)} color="error" variant="text">
                        <RemoveIcon />
                      </Button>
                    </div>
                  );
                })}
              </div>

              <div className="flex w-full gap-2 mt-4">
                <Button disabled={isLoading} color="error" className="flex-1" onClick={() => addingNewCategory ? disableEditMode() : setDeleteConfirmationDialogOpen(true)} variant="contained">
                  {addingNewCategory ? "Cancel" : 'Delete'}
                </Button>
                <Button disabled={categoryEditItems.subCategories.length
                 === 0 || isLoading} className="flex-1" onClick={() => handleSaveCategory(false)} variant="contained">
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <div>
              {categoriesAndSubCategories.map((e) => {
                return (
                  <div key={e.categoryName}>
                    <ListItemButton onClick={() => handleChange(e.categoryName as string)}>
                      <ListItemText primary={e.categoryName} />
                      <div onClick={(x) => enableEditMode(x, e)}>
                        <EditIcon />
                      </div>
                      {expanded === e.categoryName ? <ExpandLess /> : <ExpandMore />}
                    </ListItemButton>

                    <Collapse in={expanded === e.categoryName} timeout="auto" unmountOnExit>
                      <List component="div" disablePadding>
                        {e.subCategories.map(({ subCategory, RowId }) => {
                          return (
                            <div>
                              <ListItemButton key={RowId} sx={{ pl: 4 }}>
                                <div className="flex justify-between">
                                  <ListItemText primary={subCategory} />
                                </div>
                              </ListItemButton>
                              <div className="border mx-8" />
                            </div>
                          );
                        })}
                      </List>
                    </Collapse>
                  </div>
                );
              })}
                <div className='flex justify-end'> 
                    <Button startIcon={ <PlusIcon /> } onClick={() => handleAddNewCategory()} variant="contained" className='justify-end'>Add New Category</Button>
                </div>
            </div>
          )}
        </List>
       
        <Backdrop
            sx={{ color: '#fff', zIndex: (theme) => theme.zIndex.drawer + 1 }}
            open={isLoading}
        >
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
              Deleting this would delete all the Category and Subcategory data.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmationDialogOpen(false)}>Cancel</Button>
          <Button color="error" onClick={() => handleDeleteEntireCategoryAndSubCategory()} autoFocus>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
      </div>
    );
  },
);
