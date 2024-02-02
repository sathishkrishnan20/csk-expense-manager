import { useNavigate } from 'react-router-dom';
import { AppHeader } from '../../components/AppBar';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Typography from '@mui/material/Typography';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import PlusIcon from '@mui/icons-material/Add';
import React, { useEffect, useState } from 'react';
import { MasterCategoryAndSubCategory } from './master_category_subcategory';
import { getMasterData } from '../../services/gsheet';
import { MasterActionKind } from '../../reducers/category';
import { useAppContext } from '../../context/AppContext';
import { CategorySubCategoryGrouped, PaymentMethodsSchema } from '../../interface/expenses';
import AccountMenu from './Menu';
import { Box, Button } from '@mui/material';
interface MasterCategoryAndSubCategoryProps {
  shopAppHeader: boolean;
}

export const MasterDataConfig = ({ shopAppHeader }: MasterCategoryAndSubCategoryProps) => {
  const navigate = useNavigate();
  const [expanded, setExpanded] = React.useState<string>('category');
  const { masterDataState, masterDataDispatch } = useAppContext();
  const [masterCategorySubCategory, setMasterCategorySubCategory] = React.useState<CategorySubCategoryGrouped[]>([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const categoryRef = React.useRef<typeof MasterCategoryAndSubCategory>(null);

  const [masterPaymentMethods, setMasterPaymentMethods] = React.useState<PaymentMethodsSchema[]>([]);

  useEffect(() => {
    loadMasterDataFromReducerOrSheet();
  }, []);

  const handleChange = (panel: string) => {
    if (panel === expanded) {
      setExpanded('');
    } else {
      setExpanded(panel);
    }
  };

  const loadMasterDataFromReducerOrSheet = async () => {
    if (masterDataState.categoryAndSubCategories?.length && masterDataState.payments?.length) {
      setMasterCategorySubCategory(masterDataState.categoryAndSubCategories);
      setMasterPaymentMethods(masterDataState.payments);
    } else {
      const { category, payments } = await getMasterData();
      setMasterCategorySubCategory(category);
      setMasterPaymentMethods(payments);
      if (masterDataDispatch) {
        masterDataDispatch({
          type: MasterActionKind.SET_CATEGORY,
          payload: {
            categoryAndSubCategories: category,
          },
        });
        masterDataDispatch({
          type: MasterActionKind.SET_PAYMENTS,
          payload: {
            payments: payments,
          },
        });
      }
      return {
        category,
        payments,
      };
    }
  };

  return (
    <Box sx={{ pb: 7 }} ref={ref}>
      <div>
       
        {shopAppHeader ? (
          <AppHeader
            title="Master Data"
            
            onClickBack={() => {
              if(isEditMode) {
                // @ts-ignore
                categoryRef.current?.alterEditMode()
              } else {
                navigate(-1)
              }
            }} 
            rightButtonAsIconComponent={<AccountMenu />}
          />
        ) : null}

        {/* <Accordion expanded={expanded === 'payments'} onChange={() => handleChange('payments')}>
                <AccordionSummary
                    expandIcon={<ArrowDownwardIcon />}
                    aria-controls="panel1-content"
                    id="panel1-header">
                    <Typography>Payment</Typography>
                </AccordionSummary>
                <AccordionDetails>
                    <Typography>
                        Lorem ipsum dolor sit amet, consectetur adipiscing elit. Suspendisse
                        malesuada lacus ex, sit amet blandit leo lobortis eget.
                    </Typography>
                </AccordionDetails>
            </Accordion> */}
        <Accordion expanded={expanded === 'category'} onChange={() => handleChange('category')}>
          <AccordionSummary
            expandIcon={
              <div style={{ display: 'flex', flexDirection: expanded === 'category' ? 'row' : 'row-reverse' }}>
                <ArrowDownwardIcon />
                {/* {expanded === 'category' ? null : (
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                  >
                    <Button variant="contained">
                     
                      <PlusIcon /> add
                    </Button>
                  </div>
                )} */}
              </div>
            }
            aria-controls="panel1-content"
            id="panel1-header"
          >
            <Typography>Categories</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <MasterCategoryAndSubCategory
              ref={categoryRef}
              categoriesAndSubCategories={masterCategorySubCategory}
              onHandleEditMode={(mode) => setIsEditMode(mode)}
              onSuccessOfSubCategoryAdd={() => loadMasterDataFromReducerOrSheet()}
            />
          </AccordionDetails>
        </Accordion>
      </div>
    </Box>
  );
};
