import { Paper } from "@mui/material"
import { useNavigate } from "react-router-dom"

export const PrivacyPolicyComponent = () => {
    const navigate = useNavigate()

    return (
        <Paper sx={{ position: 'fixed', bottom: 0, left: 0, right: 0, }} elevation={5}>
            <div style={{margin: 10, display: 'flex', justifyContent: 'space-around'}}> 
             <div onClick={() => navigate('/privacy-policy')}>Privacy Policy</div>   
             <div onClick={() => navigate('/terms-services')}>Terms & Services</div>  
             </div> 
        </Paper>
    )
}