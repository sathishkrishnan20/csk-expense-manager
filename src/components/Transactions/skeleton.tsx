import { Skeleton } from '@mui/material';

interface ITransactionSkeletonProps {
  count: number;
}
export const TransactionSkeleton = ({ count = 10 }: ITransactionSkeletonProps) => {
  const arr = [];
  for (let index = 0; index < 10; index++) {
    arr.push(index);
  }
  return (
    <div>
      {arr.map((item, index) => {
        console.log(item, index);
        return (
          <div key={'' + index}>
            <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', flexDirection: 'row' }}>
              <Skeleton variant="rectangular" animation="wave" width={'100%'} height={100} />
              <Skeleton style={{ marginLeft: 4 }} animation="wave" variant="rounded" height={100} width={140} />
            </div>
            <div style={{ height: 4 }}></div>
          </div>
        );
      })}
    </div>
  );
};
