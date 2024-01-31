import { useNavigate } from "react-router-dom";
import { AppHeader } from "../../../components/AppBar"
import { useEffect, useState } from "react";
import { CategorySubCategoryGrouped } from "../../../interface/expenses";
import { Button, Collapse, List, ListItemButton, ListItemText, ListSubheader, TextField, Typography } from "@mui/material";
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
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
                sx={{ width: '100%',bgcolor: 'background.paper' }}
                component="nav"
                aria-labelledby="nested-list-subheader"
            >
                 <div style={{ marginTop: -30}}> </div>  
                
            
                 {/* <Button variant="text">Add New Category</Button> */}
        
       
        {categoriesAndSubCategories.map(e => {
            return (
                <div key={e.categoryName}> 
                <ListItemButton onClick={() => handleChange(e.categoryName as string)}>
                    <ListItemText primary={e.categoryName} />
                    {expanded === e.categoryName ? <ExpandLess /> : <ExpandMore />}
                </ListItemButton>

                <Collapse in={expanded === e.categoryName} timeout="auto" unmountOnExit>
                    <List component="div" disablePadding>
                        {e.subCategories.map(({subCategory, RowId}) => {
                            return (
                                <ListItemButton key={RowId} sx={{ pl: 4 }}>
                                    <ListItemText primary={subCategory} />
                                </ListItemButton>
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