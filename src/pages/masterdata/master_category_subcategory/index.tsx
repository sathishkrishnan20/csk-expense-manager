import { useNavigate } from "react-router-dom";
import { AppHeader } from "../../../components/AppBar"
import { useEffect, useState } from "react";
import { CategorySubCategoryGrouped } from "../../../interface/expenses";
import { Button, Collapse, Divider, List, ListItemButton, ListItemText, ListSubheader, TextField, Typography } from "@mui/material";
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';

import EditIcon from '@mui/icons-material/Edit';
import PlusIcon from '@mui/icons-material/Add';
import { addNewSubCategory } from "../../../services/gsheet";
import { useAppContext } from "../../../context/AppContext";
import { MasterActionKind } from "../../../reducers/category";

interface MasterCategoryAndSubCategoryProps {
    categoriesAndSubCategories: CategorySubCategoryGrouped[];
    onSuccessOfSubCategoryAdd: () => void
  }

export const MasterCategoryAndSubCategory = ({categoriesAndSubCategories, onSuccessOfSubCategoryAdd}:MasterCategoryAndSubCategoryProps) => {
    const navigate = useNavigate();
    const { masterDataState, masterDataDispatch }  = useAppContext()
    const [expanded, setExpanded] = useState('');
    const [categoryEditMode, setCategoryEditMode] = useState(false);
    const [categoryEditItems, setCategoryEditItems] = useState<CategorySubCategoryGrouped>({categoryName: '', subCategories: []});
    const [newCategoryAddedCount, setNewCategoryAddedCount] = useState(0)
    const [newSubCategoryText, setNewSubCategoryText] = useState('');
    useEffect(() => {
        if (newCategoryAddedCount !== 0) {
            onSuccessOfSubCategoryAdd() 
        }
    }, [newCategoryAddedCount])


    const handleChange = (panel: string) => {
        setNewSubCategoryText('')
        if  (panel === expanded) {
            setExpanded('')
        } else {
            setExpanded(panel)
        }
    }

    const handleCreateNewSubCategory = async (categoryName: string) => {
        await addNewSubCategory({
            CategoryName: categoryName,
            SubCategoryName: newSubCategoryText
        })
        masterDataDispatch && masterDataDispatch({
            type: MasterActionKind.RESET_DATA
        })
        setNewSubCategoryText('')
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
            <TextField
                autoComplete="off"
                onChange={(text) => { 
                    setCategoryEditItems({
                        ...categoryEditItems,
                        categoryName: text.target.value,
                    })  
                }}
                className="flex"
                id="outlined-basic"
                value={categoryEditItems.categoryName}
                label={'Category'}
                variant='filled'
            />
            <div className="mt-2"> 
                {categoryEditItems.subCategories.map(({subCategory, RowId}, index) => {
                    return (
                        <div className="ml-8">
                           <TextField
                                autoComplete="off"
                                onChange={(text) => { 
                                    setCategoryEditItems({
                                        ...categoryEditItems,
                                        subCategories: categoryEditItems.subCategories.map((subCategory) => {
                                            if (subCategory.RowId === RowId) {
                                                subCategory.subCategory = text.target.value
                                            }
                                            return subCategory;
                                        })
                                    })  
                                }}
                                id="outlined-basic"
                                value={subCategory}
                                label={'Sub Category ' + (index + 1)}
                                variant='filled'
                            />
                        </div>
                    )
                })}
            </div>

            <div className="flex w-full gap-2 mt-4"> 
            
                <Button color="error" className="flex-1" onClick={() =>  {
                    setCategoryEditMode(false)
                    setCategoryEditItems({categoryName: '', subCategories: []})
                }} variant="contained">Cancel</Button>
            
                <Button className="flex-1" onClick={() =>  {
                    setCategoryEditMode(false)
                    setCategoryEditItems({categoryName: '', subCategories: []})
                }} variant="contained">Save</Button>
            </div>
            </div> : 
                categoriesAndSubCategories.map(e => {
            return (
                <div key={e.categoryName}> 
                <ListItemButton onClick={() => handleChange(e.categoryName as string)}>
                    <ListItemText primary={e.categoryName} />
                        <div onClick={(x) => {
                            x.stopPropagation()
                            console.log('Prevent')
                            setCategoryEditMode(!categoryEditMode)
                            setCategoryEditItems(e)
                        }
                    }>
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
                        <div className="mx-8 flex gap-2"> 
                            <TextField autoComplete="off" value={newSubCategoryText} onChange={(e) => setNewSubCategoryText(e.target.value)} id="new-category" autoFocus={false} label="Add New Sub Category" variant="filled" />
                            <Button onClick={() =>  handleCreateNewSubCategory(e.categoryName as string)} startIcon={<PlusIcon />} variant="contained">Save</Button>
                        </div>
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
}