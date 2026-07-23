import { TRANSACTION_TYPE ,type Transaction } from "../../core-types/src/index.ts";

export function parseCliCommand(command : string) { 

    command = command.replace(/\s+/g , " ").trim();

    
    const transaction : Partial<Transaction> = {};
    transaction.type  = (command[0] == '+') ? TRANSACTION_TYPE.CREDIT : TRANSACTION_TYPE.DEBT;
    const tokens = command.split("@");
    const coreCommand = tokens[0].trim().split(" ");

    if(tokens[1]){
        transaction.desc = tokens[1].trim();
    }
    const parsedAmount = Math.abs(parseFloat(coreCommand[0]));
    if (Number.isNaN(parsedAmount)) {
        throw new Error("Invalid amount. Please provide a valid number.");
    }
    const category = coreCommand[1]
    const merchant = coreCommand.slice(2).join(" ")

    if(category == undefined){
        throw new Error("Missing category");
    }

    if(merchant == ""){
        throw new Error("Missing merchant");
    }

    transaction.amount = parsedAmount;
    transaction.category = category;
    transaction.merchant = coreCommand.slice(2).join(" ");
    
    return transaction;
}
