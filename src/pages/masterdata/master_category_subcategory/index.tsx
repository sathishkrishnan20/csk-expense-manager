import { useNavigate } from "react-router-dom";
import { AppHeader } from "../../../components/AppBar"
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { CategorySubCategoryGrouped, CategorySubCategoryGroupedWithInternalState, CategorySubCategorySchema, SubCategorySchema } from "../../../interface/expenses";
import { Button, Collapse, Divider, List, ListItemButton, ListItemText, ListSubheader, TextField, Typography } from "@mui/material";
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import RemoveIcon from '@mui/icons-material/HighlightOffRounded'

import EditIcon from '@mui/icons-material/Edit';
import PlusIcon from '@mui/icons-material/Add';
import { addNewSubCategory, updateCategorySubCategory } from "../../../services/gsheet";
import { useAppContext } from "../../../context/AppContext";
import { MasterActionKind } from "../../../reducers/category";

interface MasterCategoryAndSubCategoryProps {
    categoriesAndSubCategories: CategorySubCategoryGrouped[];
    onSuccessOfSubCategoryAdd: () => void
    onHandleEditMode: (isEditMode: boolean) => void
  }

export const MasterCategoryAndSubCategory = forwardRef(({categoriesAndSubCategories, onSuccessOfSubCategoryAdd, onHandleEditMode}:MasterCategoryAndSubCategoryProps, ref) => {
    const navigate = useNavigate();
    const { masterDataState, masterDataDispatch }  = useAppContext()
    const [expanded, setExpanded] = useState('');
    const [categoryEditMode, setCategoryEditMode] = useState(false);
    const [categoryEditItems, setCategoryEditItems] = useState<CategorySubCategoryGroupedWithInternalState>({categoryName: '', subCategories: []});
    const [subCategoriesToBeDeleted, setSubCategoriesToBeDeleted] = useState<CategorySubCategorySchema[]>([]);
    const [newCategoryAddedCount, setNewCategoryAddedCount] = useState(0)
   
    useEffect(() => {
        if (newCategoryAddedCount !== 0) {
            onSuccessOfSubCategoryAdd() 
        }
    }, [newCategoryAddedCount])

    useEffect(() => {
        onHandleEditMode(categoryEditMode)
    }, [categoryEditMode])

    
    useImperativeHandle(ref, () => ({
        alterEditMode() {
            disableEditMode()
        }
    }))
   

    const handleChange = (panel: string) => {
        if  (panel === expanded) {
            setExpanded('')
        } else {
            setExpanded(panel)
        }
    }

   

    const disableEditMode = () => {
        setCategoryEditMode(false)
        setCategoryEditItems({categoryName: '', subCategories: []})
    }

    const enableEditMode = (x: React.MouseEvent<HTMLDivElement, MouseEvent>, categorySubCategoryGroped: CategorySubCategoryGrouped) => {
        x.stopPropagation()
        setCategoryEditMode(!categoryEditMode)
        setCategoryEditItems(categorySubCategoryGroped)
    }

    const handleDeleteOneSubCategory = (rowId: string, index: number) => {
        
            setCategoryEditItems({
                ...categoryEditItems,
                subCategories: categoryEditItems.subCategories.filter((subCategory, subIndex) => {
                    if (subCategory.RowId === rowId && index === subIndex) {
                        return false
                    }
                    return true;
                })
            })
        if (rowId) {
            const items = subCategoriesToBeDeleted;
            items.push({
                RowId: rowId,
                CategoryName: categoryEditItems.categoryName,
                SubCategoryName: categoryEditItems.subCategories[index].subCategory,
                Status: 'DELETED'
            })
            setSubCategoriesToBeDeleted(items)
        }
        
    }
    const handleAddOneSubCategory = () => {
        const items = categoryEditItems.subCategories;
        items.push({
            RowId: '',
            subCategory: '',
            Status: 'ACTIVE',
        })
        setCategoryEditItems({
            ...categoryEditItems,
            subCategories: items
        })
    }

    const handleEditOneSubCategory = (rowId: string, index: number, value: string) => {
        setCategoryEditItems({
            ...categoryEditItems,
            subCategories: categoryEditItems.subCategories.map((subCategory, i) => {
                if (i === index) {
                    subCategory.subCategory = value
                    subCategory.isEdited = true
                }
                return subCategory;
            })
        })  
    }
    const handleSaveCategory = async () => {
        console.log(categoryEditItems);
        // setCategoryEditMode(false)
        const subCategoriesToUpdate: CategorySubCategorySchema[] = [];
        const subCategoriesToAdd: CategorySubCategorySchema[] = []
       
        for (const subCategory of categoryEditItems.subCategories) {
            if  (subCategory.Status === 'ACTIVE' && !subCategory.subCategory) {
                continue;
            } else {
                if (subCategory.RowId) {
                    if (categoryEditItems.isEdited || subCategory.isEdited) {
                        subCategoriesToUpdate.push({
                            RowId: subCategory.RowId,
                            CategoryName: categoryEditItems.categoryName,
                            SubCategoryName: subCategory.subCategory,
                            Status: 'ACTIVE',
                        })
                    }
                } else {
                    subCategoriesToAdd.push({
                        CategoryName: categoryEditItems.categoryName,
                        SubCategoryName: subCategory.subCategory,
                        Status: 'ACTIVE',
                    })
                }
            }
        }
        
        if (subCategoriesToAdd.length) {
            await addNewSubCategory(subCategoriesToAdd)
        }
        if (subCategoriesToUpdate.length + subCategoriesToBeDeleted.length) {
            await Promise.allSettled(subCategoriesToUpdate.concat(subCategoriesToBeDeleted).map((subCategoryInfo) => (
                updateCategorySubCategory({ ...subCategoryInfo, CategoryName: categoryEditItems.categoryName })
            )))
        }
        masterDataDispatch && masterDataDispatch({
            type: MasterActionKind.RESET_DATA
        })
        setSubCategoriesToBeDeleted([])
        disableEditMode()
        setNewCategoryAddedCount(newCategoryAddedCount + 1)
    }

    return (
        
        <div>
            <List
                sx={{ width: '100%' }}
                component="nav"
                aria-labelledby="nested-list-subheader"
            >
        <div style={{ marginTop: -30}}> </div>  
        {categoryEditMode ? 
            <div> 
                <div className="flex justify-end gap-2">
                    <TextField
                        autoComplete="off"
                        onChange={(text) => { 
                            setCategoryEditItems({
                                ...categoryEditItems,
                                isEdited: true,
                                categoryName: text.target.value,
                            })
                        }}
                        className="w-full"
                        id="outlined-basic"
                        value={categoryEditItems.categoryName}
                        label={'Category'}
                        variant='standard'
                    />
                    <Button onClick={() => handleAddOneSubCategory()}  variant="contained">Add</Button>
                </div> 
            
            <div className="mt-2"> 
                {categoryEditItems.subCategories.map(({subCategory, RowId}, index) => {
                    return (
                        <div className="ml-8 mt-4 flex gap-2">
                           <TextField
                                autoComplete="off"
                                onChange={(text) => handleEditOneSubCategory(RowId, index, text.target.value)}
                                id="outlined-basic"
                                value={subCategory}
                                label={'Sub Category ' + (index + 1)}
                                variant='outlined'
                                className="w-full"
                            />
                            <Button onClick={() => handleDeleteOneSubCategory(RowId, index)} color="error"  variant='text'><RemoveIcon /></Button>
                        </div>
                    )
                })}
            </div>

            <div className="flex w-full gap-2 mt-4"> 
            
                <Button color="error" className="flex-1" onClick={() =>  disableEditMode()} variant="contained">Cancel</Button>
                <Button className="flex-1" onClick={() =>  handleSaveCategory()} variant="contained">Save</Button>
            </div>
            </div> : 
                categoriesAndSubCategories.map(e => {
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
                        {e.subCategories.map(({subCategory, RowId}) => {
                            return (
                                <div>
                                    <ListItemButton key={RowId} sx={{ pl: 4 }}>
                                        <div className="flex justify-between"> 
                                            <ListItemText primary={subCategory} />
                                        </div>
                                    </ListItemButton>
                                    <div className="border mx-8" />
                                </div>
                            )
                        })}
                    </List>
                </Collapse>
                </div>
            )
        })}

       
       
            {/* <Collapse in={open} timeout="auto" unmountOnExit>
                <List component="div" disablePadding>
                    <ListItemButton sx={{ pl: 4 }}>
                        <ListItemText primary="Starred" />
                    </ListItemButton>
                </List>
            </Collapse> */}
        </List>
        </div>
    )
})