const scale=(v,dec,max,field)=>{
  const raw=String(v).trim();
  if(!new RegExp('^\\d{1,9}(?:\\.\\d{1,'+dec+'})?$').test(raw) || +raw>max) throw Error('Enter a valid '+field+'.');
  const [a,b='']=raw.split('.'); return BigInt(a)*10n**BigInt(dec)+BigInt(b.padEnd(dec,'0'));
};
const round=(a,b)=>(a+b/2n)/b;
export const money=c=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(c/100);
export function invoice(data){
  if(!Array.isArray(data.items)||!data.items.length||data.items.length>60) throw Error('Add between 1 and 60 line items.');
  const fields=['seller','buyer','number','date'];
  for(const k of fields) if(typeof data[k]!=='string'||!data[k].trim()||data[k].length>160) throw Error('Complete the invoice header.');
  if(!/^\d{4}-\d\d-\d\d$/.test(data.date)||new Date(data.date+'T00:00Z').toISOString().slice(0,10)!==data.date)throw Error('Choose a valid invoice date.');
  let subtotal=0n,taxable=0n;
  const items=data.items.map(i=>{
    if(typeof i.description!=='string'||!i.description.trim()||i.description.length>180||typeof i.taxable!=='boolean') throw Error('Check the item description and tax selection.');
    const qty=scale(i.quantity,3,10000,'quantity'),unit=scale(i.rate,2,100000,'unit price');
    if(!qty) throw Error('Quantity must be greater than zero.');
    const amount=round(qty*unit,1000n);subtotal+=amount;if(i.taxable)taxable+=amount;
    return {...i,amount:Number(amount)};
  });
  const discount=round(subtotal*scale(data.discount||0,2,100,'discount'),10000n);
  const base=taxable-(subtotal?round(discount*taxable,subtotal):0n);
  const tax=round(base*scale(data.tax||0,2,100,'tax rate'),10000n);
  const paid=scale(data.paid||0,2,99999999,'payment'),total=subtotal-discount+tax;
  return {items,subtotal:Number(subtotal),discount:Number(discount),taxable:Number(base),tax:Number(tax),paid:Number(paid),total:Number(total),balance:Number(total-paid)};
}
