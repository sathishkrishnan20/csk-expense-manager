import { Skeleton } from "@mui/material"

export const TransactionSkeleton = () => {
    return (
        <div>
            <Skeleton variant="rectangular"  height={60} /> 
            <div style={{height: 4}}>  </div>
            <Skeleton variant="rectangular"  height={60} />
            <div style={{height: 4}}>  </div>
            <Skeleton variant="rectangular"  height={60} />
            <div style={{height: 4}}>  </div>
            <Skeleton variant="rectangular"  height={60} />
            <div style={{height: 4}}>  </div>
            <Skeleton variant="rectangular"  height={60} />
            <div style={{height: 4}}>  </div>
            <Skeleton variant="rectangular"  height={60} />
        </div>
    )
}