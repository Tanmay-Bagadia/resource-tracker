export const TRANSACTION_TYPE = {DEBT : 'DEBT',CREDIT : 'CREDIT'} as const;

export type TransactionType = typeof TRANSACTION_TYPE[keyof typeof TRANSACTION_TYPE];

export interface Transaction{
    id : string,
    type : TransactionType,
    category : string,
    amount : number,
    merchant: string,
    timestamp : number,
}