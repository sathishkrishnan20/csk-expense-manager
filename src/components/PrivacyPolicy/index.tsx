import { Paper } from "@mui/material"
import { useNavigate } from "react-router-dom"

export const PrivacyPolicyComponent = () => {
    const navigate = useNavigate()

    return (
        <Paper sx={{ position: 'fixed', bottom: 0, left: 0, right: 0, }} elevation={5}>
             <div  onClick={() => navigate('/privacy-policy')} style={{margin: 10, display: 'flex', justifyContent: 'center'}}>Privacy Policy</div>   
        </Paper>
    )
}