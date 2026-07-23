import { TRANSACTION_TYPE,type Transaction } from "../../core-types/src/index.ts";

export function calculateBurnRate(transactions : Transaction[]){
    const sevenDaysMs = 1000 * 60 * 60 * 24 * 7;
    const currTime = Date.now();
    let totalBurn : number = 0;

    const filteredTransactions =transactions.filter((transaction)=>transaction.timestampMs >= (currTime - sevenDaysMs) && transaction.type == TRANSACTION_TYPE.DEBT);

    totalBurn = filteredTransactions.reduce((sum , currTransaction) =>{
        return sum + currTransaction.amount;
    },0 )

    let totalBurnRate : number = totalBurn/7;

    return totalBurnRate;
}