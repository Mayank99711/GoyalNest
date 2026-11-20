export function proratedRent(rent,date){const d=new Date(date);if(Number.isNaN(d.getTime())||!Number.isInteger(rent)||rent<0)throw Error('Invalid rent or date');const days=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();return Math.round(rent*(days-d.getUTCDate()+1)/days);}
export function billingPeriod(date){return new Date(date).toISOString().slice(0,7);}
export function lateFee(amount,day,cap=500){return day<=6?0:Math.min(cap,100+(day-7)*20);}
export function cancellationPenalty(daysNotice){return daysNotice>=30?0:daysNotice>=15?10:daysNotice>=7?25:50;}
